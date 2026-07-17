import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import App from './App.jsx'
import { resetApiClient } from './api/client.js'
import * as fakeLib from './test/fake-sunburst-lib.js'

afterEach(() => {
  cleanup()
  window.location.hash = ''
  resetApiClient()
  // Le thème et l'épinglage persistent en localStorage : on repart propre.
  try {
    localStorage.clear()
  } catch {
    /* jsdom sans localStorage : rien à nettoyer */
  }
  document.documentElement.removeAttribute('data-theme')
})

/** Session anonyme par défaut (couture fetchMe injectée pour éviter le réseau). */
const anonymous = async () => ({ user: null })

function renderApp(fetchMeFn = anonymous) {
  return render(<App lib={fakeLib} fetchMeFn={fetchMeFn} />)
}

function setHash(hash) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

describe('App', () => {
  it('affiche l’accueil sur #/, avec nav « Découvrir » et pied de page communs', () => {
    window.location.hash = '#/'
    renderApp()

    expect(screen.getByRole('heading', { name: 'humanome.xyz' })).toBeDefined()
    expect(screen.getByText(/Explorer la cartographie de démonstration/)).toBeDefined()

    // En-tête : plus de marque ni de fond — seule la grappe d'actions (aide +
    // menu) reste, épinglée. Famille « Découvrir » visible par tous.
    expect(document.querySelector('.app-brand')).toBeNull()
    expect(screen.queryByRole('link', { name: 'humanome.xyz' })).toBeNull()
    const nav = within(screen.getByRole('navigation', { name: 'Navigation principale' }))
    expect(
      nav.getByRole('link', { name: 'Cartographie (démonstration)' }).getAttribute('href'),
    ).toBe('#/cartographie')
    expect(nav.getByRole('link', { name: 'Référentiel' }).getAttribute('href')).toBe(
      '#/referentiel',
    )
    expect(nav.getByRole('link', { name: /^Essayer/ }).getAttribute('href')).toBe('#/essayer')
    // Anonyme : « Se connecter » (et pas les familles de travail, ni « Se déconnecter »).
    expect(nav.getByRole('link', { name: 'Se connecter' }).getAttribute('href')).toBe('#/compte')
    expect(screen.queryByRole('link', { name: 'Mon portfolio' })).toBeNull()
    expect(nav.queryByRole('button', { name: 'Se déconnecter' })).toBeNull()

    expect(screen.getByText(/écosystème RESPIRE, Harmonia Éducation/)).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'participer.harmonia.education' }).getAttribute('href'),
    ).toBe('https://participer.harmonia.education')
  })

  it('adapte la nav au(x) rôle(s) de la session (item 3)', async () => {
    window.location.hash = '#/'
    renderApp(async () => ({ user: { id: 1, roles: ['apprenant', 'cartographe'] } }))

    const nav = within(screen.getByRole('navigation', { name: 'Navigation principale' }))
    // Les familles d'intention apparaissent après résolution de la session.
    await waitFor(() =>
      expect(nav.getByRole('link', { name: 'Tableau de bord' }).getAttribute('href')).toBe(
        '#/espace',
      ),
    )
    expect(nav.getByRole('link', { name: 'Mon portfolio' }).getAttribute('href')).toBe(
      '#/portfolio',
    )
    expect(nav.getByRole('link', { name: 'Ma file de relecture' }).getAttribute('href')).toBe(
      '#/cartographe',
    )
    // Échelle de valeur badgée dans le panneau (friction n°1).
    expect(nav.getByRole('link', { name: /Cartographier mes écrits/ }).getAttribute('href')).toBe(
      '#/espace/nouveau-run',
    )
    // Pas de rôle admin -> pas de famille Administrer.
    expect(nav.queryByRole('link', { name: 'Rôles et comptes' })).toBeNull()
    // Connecté -> profil et crédit sous « Mon compte ».
    expect(nav.getByRole('link', { name: 'Profil et rôles' }).getAttribute('href')).toBe('#/compte')
    expect(nav.getByRole('link', { name: 'Crédit et factures' }).getAttribute('href')).toBe(
      '#/compte/credit',
    )
    // Connecté -> « Se déconnecter » disponible dans le panneau.
    expect(nav.getByRole('button', { name: 'Se déconnecter' })).toBeDefined()
  })

  it('la punaise épingle le panneau : il survit à un changement de route, Échap le referme', async () => {
    window.location.hash = '#/'
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Menu de navigation' }))
    const menu = document.querySelector('.app-menu')
    expect(menu.className).toContain('is-open')
    expect(menu.className).not.toContain('is-pinned')

    fireEvent.click(screen.getByRole('button', { name: 'Épingler le panneau ouvert' }))
    expect(screen.getByRole('button', { name: 'Détacher le panneau' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(menu.className).toContain('is-pinned')

    // La navigation ferme l'ouverture transitoire mais PAS l'épinglage.
    setHash('#/referentiel')
    expect(menu.className).toContain('is-pinned')

    // Échap referme et désépingle dans tous les cas, et rend le focus au bouton.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(menu.className).not.toContain('is-open')
    expect(menu.className).not.toContain('is-pinned')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Menu de navigation' }))
  })

  it('« Se déconnecter » ferme la session (dégradation gracieuse) et revient à l’accueil', async () => {
    window.location.hash = '#/merge'
    const fetchMeFn = vi
      .fn()
      .mockResolvedValueOnce({ user: { id: 1, roles: ['apprenant'] } }) // montage
      .mockResolvedValue({ user: null }) // après l'événement humanome:auth du logout
    renderApp(fetchMeFn)

    const nav = within(
      await screen.findByRole('navigation', { name: 'Navigation principale' }),
    )
    await waitFor(() => expect(nav.getByRole('button', { name: 'Se déconnecter' })).toBeDefined())

    fireEvent.click(nav.getByRole('button', { name: 'Se déconnecter' }))

    // Pas de serveur API en test : logout() dégrade gracieusement (comme
    // AccountView) mais notifie quand même le changement de session.
    await waitFor(() => expect(nav.getByRole('link', { name: 'Se connecter' })).toBeDefined())
    expect(nav.queryByRole('button', { name: 'Se déconnecter' })).toBeNull()
    expect(window.location.hash).toBe('#/')
  })

  it('le bouton « ? » ouvre l’aide contextuelle de la rubrique (item 4)', async () => {
    window.location.hash = '#/'
    renderApp()
    setHash('#/merge')

    fireEvent.click(screen.getByRole('button', { name: 'Aide sur cette rubrique' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('La cartographie évolutive')
    // Fermeture par Échap.
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('routes #/cartographie et #/merge (démo) -> interface V3, plus l’ancienne vue merge', () => {
    // D14 : l'interface V3 REMPLACE la vue merge pour la démonstration. Le
    // comportement détaillé de la V3 est testé dans v3/ui/V3View.test.jsx avec
    // ses coutures ; ici on vérifie le REMPLACEMENT de route.
    window.location.hash = '#/'
    renderApp()

    setHash('#/cartographie')
    expect(document.querySelector('.v3-root')).not.toBeNull()
    expect(screen.queryByText('Feuilles de portfolio')).toBeNull() // ancienne vue absente

    setHash('#/merge')
    expect(document.querySelector('.v3-root')).not.toBeNull()
    expect(screen.queryByText(/Touchez un secteur du diagramme/)).toBeNull()
  })

  it('route #/referentiel -> arbre public (repli embarqué sans réseau)', async () => {
    window.location.hash = '#/'
    renderApp()

    setHash('#/referentiel')

    expect(
      await screen.findByRole('heading', { name: 'Référentiel de compétences' }),
    ).toBeDefined()
    expect(await screen.findByText('TETE — Penser & Comprendre')).toBeDefined()
    expect(document.querySelectorAll('.ref-pole')).toHaveLength(7)
    expect(document.querySelectorAll('.ref-competence')).toHaveLength(61)
  })

  it('route #/essayer -> page de démonstration publique (P6)', async () => {
    window.location.hash = '#/'
    renderApp()

    setHash('#/essayer')

    expect(
      screen.getByRole('heading', { name: 'Essayer avec votre propre texte' }),
    ).toBeDefined()
    expect(screen.getByLabelText('Texte à cartographier')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Cartographier ce texte' })).toBeDefined()
  })

  it('route #/portfolio -> module portfolio, bandeau local-first (P7)', async () => {
    window.location.hash = '#/'
    renderApp()

    setHash('#/portfolio')

    expect(screen.getByRole('heading', { name: 'Portfolio' })).toBeDefined()
    expect((await screen.findByRole('note')).textContent).toContain(
      'Vos textes ne quittent pas ce navigateur.',
    )
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Stockage local indisponible',
    )
  })

  it('route #/compte sans API -> message copie statique, sans erreur non gérée', async () => {
    window.location.hash = '#/'
    renderApp()

    setHash('#/compte')

    expect((await screen.findByRole('status')).textContent).toContain(
      'indisponible sur cette copie statique',
    )
  })

  it('route invalide -> page introuvable avec retour accueil', () => {
    window.location.hash = '#/'
    renderApp()

    setHash('#/jour/2026-13-45')

    expect(screen.getByRole('alert').textContent).toContain('Page introuvable')
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' }).getAttribute('href')).toBe(
      '#/',
    )
  })
})

// Traçabilité — refonte ergonomie/navigation : bascule de thème persistée qui
// prime sur le système (point 9), épinglage PERSISTÉ en localStorage + dock du
// contenu (point 3), clic extérieur qui ferme le tiroir transitoire mais pas
// l'épinglé, panneau TOUJOURS dans le DOM (point 2), aria-current sur la
// rubrique courante (point 6).
describe('App — thème, épinglage persistant, clic extérieur (refonte ergonomie)', () => {
  it('la bascule de thème pose data-theme sur <html>, persiste le choix et inverse son libellé', () => {
    window.location.hash = '#/'
    renderApp()

    // jsdom n'a pas de matchMedia : le système est réputé clair (défaut sûr).
    const toggle = screen.getByRole('button', { name: 'Passer au thème sombre' })
    fireEvent.click(toggle)

    // Le choix explicite est posé sur <html> ET persisté : il PRIME désormais
    // sur le thème système (anti-FOUC au prochain chargement).
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('humanome-theme')).toBe('dark')

    const back = screen.getByRole('button', { name: 'Passer au thème clair' })
    fireEvent.click(back)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem('humanome-theme')).toBe('light')
    expect(screen.getByRole('button', { name: 'Passer au thème sombre' })).toBeDefined()
  })

  it('la punaise persiste l’épinglage en localStorage et docke le contenu (is-menu-docked)', () => {
    window.location.hash = '#/'
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Menu de navigation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Épingler le panneau ouvert' }))

    expect(localStorage.getItem('humanome-menu-pinned')).toBe('1')
    expect(document.querySelector('.app').className).toContain('is-menu-docked')

    // Détacher efface la clé et retire le dock.
    fireEvent.click(screen.getByRole('button', { name: 'Détacher le panneau' }))
    expect(localStorage.getItem('humanome-menu-pinned')).toBeNull()
    expect(document.querySelector('.app').className).not.toContain('is-menu-docked')
  })

  it('un remontage avec l’épinglage stocké restaure le panneau épinglé et docké', () => {
    localStorage.setItem('humanome-menu-pinned', '1')
    window.location.hash = '#/'
    renderApp()

    expect(
      screen.getByRole('button', { name: 'Détacher le panneau' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(document.querySelector('.app-menu').className).toContain('is-pinned')
    expect(document.querySelector('.app').className).toContain('is-menu-docked')
  })

  it('un clic extérieur ferme le menu transitoire mais PAS le menu épinglé', () => {
    window.location.hash = '#/'
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Menu de navigation' }))
    const menu = document.querySelector('.app-menu')
    expect(menu.className).toContain('is-open')

    fireEvent.pointerDown(document.body)
    expect(menu.className).not.toContain('is-open')

    // Épinglé : le clic extérieur ne referme pas (seuls punaise et Échap le font).
    fireEvent.click(screen.getByRole('button', { name: 'Menu de navigation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Épingler le panneau ouvert' }))
    fireEvent.pointerDown(document.body)
    expect(menu.className).toContain('is-pinned')
    expect(
      screen.getByRole('button', { name: 'Détacher le panneau' }).getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('menu fermé, les liens du panneau restent dans le DOM et focusables (a11y, jamais display:none)', () => {
    window.location.hash = '#/'
    renderApp()

    const menu = document.querySelector('.app-menu')
    expect(menu.className).not.toContain('is-open')

    // Le masquage est purement visuel (translateX) : les liens sont présents
    // et dans l'ordre de tabulation — tabuler dans la nav la révèle.
    const nav = within(screen.getByRole('navigation', { name: 'Navigation principale' }))
    const link = nav.getByRole('link', { name: 'Référentiel' })
    link.focus()
    expect(document.activeElement).toBe(link)
  })

  it('aria-current="page" suit la rubrique courante dans le panneau', () => {
    window.location.hash = '#/'
    renderApp()

    const nav = within(screen.getByRole('navigation', { name: 'Navigation principale' }))
    expect(nav.getByRole('link', { name: 'Accueil' }).getAttribute('aria-current')).toBe('page')
    expect(nav.getByRole('link', { name: 'Référentiel' }).getAttribute('aria-current')).toBeNull()

    setHash('#/referentiel')
    expect(nav.getByRole('link', { name: 'Référentiel' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(nav.getByRole('link', { name: 'Accueil' }).getAttribute('aria-current')).toBeNull()
  })
})

// Ouverture au SURVOL (souris) : le survol du bouton Menu ou de la réglette du
// bord gauche ouvre le panneau via l'état (App.jsx), avec une grâce longue le
// temps de traverser l'écran — le bouton est à droite, le panneau à gauche.
// Les délais (150/1600/350 ms) sont ceux des constantes MENU_HOVER_* d'App.jsx.
describe('App — menu au survol (bouton + réglette du bord gauche)', () => {
  function renderWithFakeTimers() {
    vi.useFakeTimers()
    window.location.hash = '#/'
    renderApp()
    return {
      menu: document.querySelector('.app-menu'),
      burger: screen.getByRole('button', { name: 'Menu de navigation' }),
      panel: document.querySelector('.app-nav-panel'),
    }
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('survol du bouton : ouverture différée, persistance pendant la traversée, fermeture en quittant le panneau', () => {
    const { menu, burger, panel } = renderWithFakeTimers()

    // L'ouverture est différée (filtre les simples passages de souris).
    fireEvent.pointerOver(burger)
    expect(menu.className).not.toContain('is-open')
    act(() => vi.advanceTimersByTime(200))
    expect(menu.className).toContain('is-open')

    // La souris quitte le bouton : le panneau RESTE ouvert pendant la traversée…
    fireEvent.pointerOut(burger)
    act(() => vi.advanceTimersByTime(800))
    expect(menu.className).toContain('is-open')

    // …entrer dans le panneau annule la fermeture différée…
    fireEvent.pointerOver(panel)
    act(() => vi.advanceTimersByTime(5000))
    expect(menu.className).toContain('is-open')

    // …et en ressortir referme (courte grâce) une ouverture née du survol.
    fireEvent.pointerOut(panel)
    act(() => vi.advanceTimersByTime(1000))
    expect(menu.className).not.toContain('is-open')
  })

  it('sans jamais atteindre le panneau, la grâce de traversée expire et referme', () => {
    const { menu, burger } = renderWithFakeTimers()

    fireEvent.pointerOver(burger)
    act(() => vi.advanceTimersByTime(200))
    fireEvent.pointerOut(burger)
    expect(menu.className).toContain('is-open')

    act(() => vi.advanceTimersByTime(2000))
    expect(menu.className).not.toContain('is-open')
  })

  it('la réglette du bord gauche ouvre au survol ; un clic sur le bouton CONFIRME l’aperçu (ne referme pas)', () => {
    const { menu, burger } = renderWithFakeTimers()
    const edge = document.querySelector('.app-menu-edge')
    expect(edge).not.toBeNull()
    // Affordance purement visuelle : hors de l'arbre d'accessibilité.
    expect(edge.getAttribute('aria-hidden')).toBe('true')

    fireEvent.pointerOver(edge)
    act(() => vi.advanceTimersByTime(200))
    expect(menu.className).toContain('is-open')

    // Clic pendant l'aperçu : bascule en ouverture explicite (reste ouvert,
    // et la sortie du panneau ne referme plus).
    fireEvent.click(burger)
    expect(menu.className).toContain('is-open')
    fireEvent.pointerOut(document.querySelector('.app-nav-panel'))
    act(() => vi.advanceTimersByTime(5000))
    expect(menu.className).toContain('is-open')
  })

  it('un survol tactile (pointerType touch) n’ouvre pas le panneau', () => {
    const { menu, burger } = renderWithFakeTimers()

    // jsdom n'a pas PointerEvent : on pose pointerType sur un Event nu, que
    // React relaie tel quel dans l'événement synthétique.
    const touchOver = new window.Event('pointerover', { bubbles: true })
    touchOver.pointerType = 'touch'
    fireEvent(burger, touchOver)
    act(() => vi.advanceTimersByTime(1000))
    expect(menu.className).not.toContain('is-open')
  })
})
