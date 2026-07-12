import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react'
import App from './App.jsx'
import * as fakeLib from './test/fake-sunburst-lib.js'

afterEach(() => {
  cleanup()
  window.location.hash = ''
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

    // En-tête : marque -> #/ et sections « Découvrir » (visibles par tous).
    const brand = screen.getByText('humanome.xyz', { selector: 'a' })
    expect(brand.getAttribute('href')).toBe('#/')
    expect(screen.getByRole('link', { name: 'Cartographie' }).getAttribute('href')).toBe('#/merge')
    expect(screen.getByRole('link', { name: 'Référentiel' }).getAttribute('href')).toBe(
      '#/referentiel',
    )
    expect(screen.getByRole('link', { name: 'Essayer' }).getAttribute('href')).toBe('#/essayer')
    // Anonyme : « Se connecter » (et pas les sections de travail).
    expect(screen.getByRole('link', { name: 'Se connecter' }).getAttribute('href')).toBe('#/compte')
    expect(screen.queryByRole('link', { name: 'Mon portfolio' })).toBeNull()

    expect(screen.getByText(/écosystème RESPIRE, Harmonia Éducation/)).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'participer.harmonia.education' }).getAttribute('href'),
    ).toBe('https://participer.harmonia.education')
  })

  it('adapte la nav au(x) rôle(s) de la session (item 3)', async () => {
    window.location.hash = '#/'
    renderApp(async () => ({ user: { id: 1, roles: ['apprenant', 'cartographe'] } }))

    // La famille « Mon travail » apparaît après résolution de la session.
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Mon espace' }).getAttribute('href')).toBe('#/espace'),
    )
    expect(screen.getByRole('link', { name: 'Mon portfolio' }).getAttribute('href')).toBe(
      '#/portfolio',
    )
    expect(screen.getByRole('link', { name: 'Espace cartographe' }).getAttribute('href')).toBe(
      '#/cartographe',
    )
    // Pas de rôle admin -> pas de lien Administration.
    expect(screen.queryByRole('link', { name: 'Administration' })).toBeNull()
    // Connecté -> « Mon compte ».
    expect(screen.getByRole('link', { name: 'Mon compte' }).getAttribute('href')).toBe('#/compte')
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
