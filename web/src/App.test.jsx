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
    ).toBe('#/merge')
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

  it('route #/merge -> vue merge sur les données de démonstration', () => {
    window.location.hash = '#/'
    renderApp()

    setHash('#/merge')

    expect(screen.getByText('Feuilles de portfolio')).toBeDefined()
    expect(screen.getByText('59')).toBeDefined() // les 59 feuilles du corpus réel
    expect(screen.getByText(/Touchez un secteur du diagramme/)).toBeDefined()
    expect(document.querySelectorAll('rect.heatmap-day')).toHaveLength(59)
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
