// UC-VIS-04 — Se repérer (accueil, navigation, guides, aide, confidentialité) : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-04-se-reperer-guides-aide.md
//
// Le visiteur (ou un compte) parcourt l'application ENTIÈRE (<App/>) : accueil
// et tuiles du plan du site, menu par familles, aide « ? », guides publics
// avec progression locale, thème, page confidentialité, page introuvable.
// Réseau simulé : GET api/auth/me répond 401 (visiteur) ; rien d'autre ne
// doit être appelé par ces pages.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { jsonResponse } from '../support/vis.js'

const visitor = async () => ({ user: null })

function stubNetwork() {
  const mock = vi.fn(async (url) =>
    String(url) === 'api/auth/me' ? jsonResponse(401, { error: 'Authentification requise' }) : jsonResponse(404, {}),
  )
  vi.stubGlobal('fetch', mock)
  return mock
}

function openApp(hash, fetchMeFn = visitor) {
  window.location.hash = hash
  return render(<App lib={fakeLib} fetchMeFn={fetchMeFn} />)
}

function goTo(hash) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

const mainNav = () => within(screen.getByRole('navigation', { name: 'Navigation principale' }))

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.location.hash = ''
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  delete window.matchMedia
})

describe('UC-VIS-04 — accueil et navigation', () => {
  it('UC-VIS-04-F05 — nominal : accueil du visiteur — présentation, actions, plan du site, menu « Découvrir » + « Compte », pied de page', async () => {
    const network = stubNetwork()
    openApp('#/')

    expect(screen.getByRole('heading', { name: 'humanome.xyz' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Explorer la cartographie de démonstration' }).getAttribute('href')).toBe('#/merge')
    expect(screen.getByRole('link', { name: 'Essayer avec votre propre texte' }).getAttribute('href')).toBe('#/essayer')
    const plan = within(screen.getByRole('region', { name: 'Plan du site' }))
    expect(plan.getByRole('heading', { name: 'Explorer le site' })).toBeDefined()
    expect([...document.querySelectorAll('.family')].map((f) => f.dataset.family)).toEqual(['decouvrir', 'compte'])

    // Menu « burger » : ouverture au clic, familles du visiteur.
    const burger = screen.getByRole('button', { name: 'Menu de navigation' })
    fireEvent.click(burger)
    expect(burger.getAttribute('aria-expanded')).toBe('true')
    expect(mainNav().getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Découvrir', 'Compte'])
    expect(mainNav().getByRole('link', { name: 'Accueil' }).getAttribute('aria-current')).toBe('page')
    expect(mainNav().getByRole('link', { name: /^Essayer/ }).textContent).toContain('gratuit')

    const footer = document.querySelector('.app-footer')
    expect(within(footer).getByRole('link', { name: 'Confidentialité' }).getAttribute('href')).toBe('#/confidentialite')
    expect(network).not.toHaveBeenCalled() // accueil : aucune requête (session injectée)
  })

  it('UC-VIS-04-F06 — A1 : compte apprenant + cartographe → « Vos espaces », familles de ses rôles, astuce ciblée dans l’aide', async () => {
    stubNetwork()
    openApp('#/', async () => ({ user: { id: 7, displayName: 'Ada', roles: ['apprenant', 'cartographe'], hasAvatar: false } }))

    expect(await screen.findByRole('heading', { name: 'Vos espaces' })).toBeDefined()
    expect([...document.querySelectorAll('.family')].map((f) => f.dataset.family)).toEqual([
      'decouvrir', 'cartographie', 'encadrer', 'compte',
    ])
    expect(screen.queryByRole('button', { name: 'Voir les profils d’utilisateurs' })).toBeNull()
    expect(mainNav().getByRole('link', { name: 'Ma file de relecture' }).getAttribute('href')).toBe('#/cartographe')
    expect(mainNav().getByRole('button', { name: 'Se déconnecter' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Aide sur cette rubrique' }))
    expect(within(await screen.findByRole('dialog')).getByText(/Vous êtes cartographe/)).toBeDefined()
  })

  it('UC-VIS-04-F07 — A2 : le visiteur explore les profils ; survol = aide de la rubrique ; 1er clic sélectionne, 2e clic ouvre', async () => {
    stubNetwork()
    openApp('#/')

    fireEvent.click(screen.getByRole('button', { name: 'Voir les profils d’utilisateurs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Établissement' }))
    expect(screen.getByText(/Aperçu du profil/).textContent).toContain('Établissement')
    const link = screen.getByRole('link', { name: /Mes cohortes/ })

    fireEvent.mouseEnter(link)
    expect(document.getElementById('families-callout').textContent).toContain('Espace établissement')
    fireEvent.mouseLeave(link)
    fireEvent.click(link, { button: 0 })
    expect(document.getElementById('families-callout').textContent).toContain('Cliquez à nouveau')
    expect(window.location.hash).toBe('#/')
    fireEvent.click(link, { button: 0 })
    await waitFor(() => expect(window.location.hash).toBe('#/etablissement'))

    // Profil « Employeur » : pas de tuiles, l'explication du lien de partage.
    goTo('#/')
    fireEvent.click(screen.getByRole('button', { name: 'Voir les profils d’utilisateurs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Employeur' }))
    expect(document.querySelector('[data-persona="employeur"]').textContent).toContain('pas de page à chercher ici')
  })

  it('UC-VIS-04-F08 — A3 : aide « ? » de la rubrique ouverte, lien vers les guides, fermée par Échap et au changement de rubrique', async () => {
    stubNetwork()
    openApp('#/essayer')

    fireEvent.click(screen.getByRole('button', { name: 'Aide sur cette rubrique' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Essayer sur votre texte' })).toBeDefined()
    expect(within(dialog).getByRole('link', { name: 'guides de prise en main' }).getAttribute('href')).toBe('#/guides')
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Fermer l’aide' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Aide sur cette rubrique' }))
    await screen.findByRole('dialog')
    goTo('#/referentiel')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Aide sur cette rubrique' }))
    expect(within(await screen.findByRole('dialog')).getByRole('heading', { name: 'Le référentiel de compétences' })).toBeDefined()
  })
})

describe('UC-VIS-04 — guides publics', () => {
  it('UC-VIS-04-F09 — A4 : hub des guides → parcours « Découvrir » → chapitre, progression cochée dans CE navigateur', async () => {
    stubNetwork()
    openApp('#/')
    goTo('#/guides')

    expect(screen.getByRole('heading', { name: 'Guides & prise en main' })).toBeDefined()
    expect(screen.getByRole('region', { name: 'Découvrir' })).toBeDefined()
    const card = screen.getByRole('link', { name: /Découvrir humanome\.xyz/ })
    expect(card.getAttribute('href')).toBe('#/guides/visiteur')
    goTo('#/guides/visiteur')

    const chapterLink = await screen.findByRole('link', { name: /Explorer la démonstration/ })
    expect(chapterLink.getAttribute('href')).toBe('#/guides/visiteur/02-explorer-la-demonstration')
    goTo('#/guides/visiteur/02-explorer-la-demonstration')

    const article = await screen.findByTestId('formation-chapitre')
    expect(article.querySelector('h1').textContent).toBe('Explorer la démonstration')
    expect(screen.getByText(/Progression enregistrée dans ce navigateur uniquement/)).toBeDefined()
    const nav = within(screen.getByRole('navigation', { name: 'Navigation entre chapitres' }))
    expect(nav.getByRole('link', { name: /← Qu'est-ce qu'une cartographie/ }).getAttribute('href')).toBe(
      '#/guides/visiteur/01-qu-est-ce-qu-une-cartographie',
    )
    const done = screen.getByLabelText('Chapitre terminé')
    await waitFor(() => expect(done.disabled).toBe(false))
    fireEvent.click(done)
    await waitFor(() => expect(done.checked).toBe(true))
    expect(JSON.parse(localStorage.getItem('humanome-training'))).toEqual({
      visiteur: { chapitresTermines: ['02-explorer-la-demonstration'] },
    })
  })

  it('UC-VIS-04-F10 — E2 : guide ou chapitre inconnu → message et lien de retour', async () => {
    stubNetwork()
    openApp('#/guides/inconnu')
    expect(screen.getByRole('alert').textContent).toBe('Guide inconnu : « inconnu ».')
    expect(screen.getByRole('link', { name: 'Retour à tous les guides' }).getAttribute('href')).toBe('#/guides')

    goTo('#/guides/visiteur/99-absent')
    expect((await screen.findByRole('alert')).textContent).toBe('Chapitre introuvable : « 99-absent ».')
    expect(screen.getByRole('link', { name: 'Retour à la liste des chapitres' }).getAttribute('href')).toBe('#/guides/visiteur')
  })

  // ANOMALIE A1 — comportement ACTUEL figé, vu par le visiteur : cocher un
  // chapitre du guide « employeur » efface la case cochée du guide « visiteur ».
  it('UC-VIS-04-F11 — [comportement actuel, anomalie A1] la progression locale d’un guide est perdue en cochant un autre guide', async () => {
    stubNetwork()
    openApp('#/guides/visiteur/01-qu-est-ce-qu-une-cartographie')
    const first = await screen.findByLabelText('Chapitre terminé')
    fireEvent.click(first)
    await waitFor(() => expect(first.checked).toBe(true))

    goTo('#/guides/employeur/01-recevoir-une-cartographie')
    await screen.findByTestId('formation-chapitre')
    fireEvent.click(screen.getByLabelText('Chapitre terminé'))
    await waitFor(() => expect(screen.getByLabelText('Chapitre terminé').checked).toBe(true))

    goTo('#/guides/visiteur/01-qu-est-ce-qu-une-cartographie')
    await screen.findByTestId('formation-chapitre')
    await waitFor(() => expect(screen.getByLabelText('Chapitre terminé').checked).toBe(false)) // attendu : true
  })
})

describe('UC-VIS-04 — thème, confidentialité, page introuvable', () => {
  it('UC-VIS-04-F12 — A5 : sans choix, le thème suit le système ; la bascule pose un choix explicite qui prime ensuite', async () => {
    stubNetwork()
    const listeners = new Set()
    const mq = { matches: true, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }
    window.matchMedia = vi.fn(() => mq)
    openApp('#/')

    expect(screen.getByRole('button', { name: 'Passer au thème clair' })).toBeDefined() // système sombre
    act(() => listeners.forEach((fn) => fn({ matches: false })))
    const toggle = screen.getByRole('button', { name: 'Passer au thème sombre' })
    fireEvent.click(toggle)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('humanome-theme')).toBe('dark')
    act(() => listeners.forEach((fn) => fn({ matches: false })))
    expect(screen.getByRole('button', { name: 'Passer au thème clair' })).toBeDefined() // le choix prime
  })

  it('UC-VIS-04-F13 — A6 : pied de page → page confidentialité, contenu embarqué rendu sans aucune requête', async () => {
    const network = stubNetwork()
    openApp('#/')
    const link = within(document.querySelector('.app-footer')).getByRole('link', { name: 'Confidentialité' })
    goTo(link.getAttribute('href'))

    const legal = screen.getByTestId('confidentialite-contenu')
    expect(within(legal).getByRole('heading', { level: 1, name: 'Confidentialité et protection des données' })).toBeDefined()
    expect(within(legal).getByRole('heading', { level: 2, name: 'Vos droits' })).toBeDefined()
    expect(legal.querySelector('script, img, iframe')).toBeNull()
    expect(mainNav().getByRole('link', { name: 'Confidentialité' }).getAttribute('aria-current')).toBe('page')
    expect(network).not.toHaveBeenCalled()
  })

  it('UC-VIS-04-F14 — E1 : adresse inconnue → « Page introuvable » avec le fragment demandé et retour à l’accueil ; aide de repli', async () => {
    stubNetwork()
    openApp('#/nulle-part?x=1')

    expect(screen.getByRole('alert').textContent).toBe('Page introuvable : #/nulle-part?x=1')
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' }).getAttribute('href')).toBe('#/')
    fireEvent.click(screen.getByRole('button', { name: 'Aide sur cette rubrique' }))
    expect(within(await screen.findByRole('dialog')).getByRole('heading', { name: 'Aide' })).toBeDefined()
  })
})
