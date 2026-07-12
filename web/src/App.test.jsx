import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import App from './App.jsx'
import * as fakeLib from './test/fake-sunburst-lib.js'

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

function setHash(hash) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

describe('App', () => {
  it('affiche l’accueil sur #/, avec en-tête et pied de page communs', () => {
    window.location.hash = '#/'
    render(<App lib={fakeLib} />)

    expect(screen.getByRole('heading', { name: 'humanome.xyz' })).toBeDefined()
    expect(screen.getByText(/Explorer la cartographie de démonstration/)).toBeDefined()

    // En-tête : marque -> #/ et liens de navigation principaux
    const brand = screen.getByText('humanome.xyz', { selector: 'a' })
    expect(brand.getAttribute('href')).toBe('#/')
    expect(screen.getByRole('link', { name: 'Cartographie' }).getAttribute('href')).toBe('#/merge')
    expect(screen.getByRole('link', { name: 'Référentiel' }).getAttribute('href')).toBe(
      '#/referentiel',
    )
    expect(screen.getByRole('link', { name: 'Essayer' }).getAttribute('href')).toBe('#/essayer')
    expect(screen.getByRole('link', { name: 'Compte' }).getAttribute('href')).toBe('#/compte')

    // Pied de page : mention RESPIRE/Harmonia + lien participer
    expect(screen.getByText(/écosystème RESPIRE, Harmonia Éducation/)).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'participer.harmonia.education' }).getAttribute('href'),
    ).toBe('https://participer.harmonia.education')
  })

  it('route #/merge -> vue merge sur les données de démonstration', () => {
    window.location.hash = '#/'
    render(<App lib={fakeLib} />)

    setHash('#/merge')

    expect(screen.getByText('Feuilles de portfolio')).toBeDefined()
    expect(screen.getByText('59')).toBeDefined() // les 59 feuilles du corpus réel
    expect(screen.getByText(/Touchez un secteur du diagramme/)).toBeDefined()
    expect(document.querySelectorAll('rect.heatmap-day')).toHaveLength(59)
  })

  it('route #/referentiel -> arbre public (repli embarqué sans réseau)', async () => {
    window.location.hash = '#/'
    render(<App lib={fakeLib} />)

    setHash('#/referentiel')

    // Sans serveur (fetch relatif impossible en test), le référentiel embarqué
    // RESPIRE v7 est servi : les 7 pôles sont rendus.
    expect(
      await screen.findByRole('heading', { name: 'Référentiel de compétences' }),
    ).toBeDefined()
    expect(await screen.findByText('TETE — Penser & Comprendre')).toBeDefined()
    expect(document.querySelectorAll('.ref-pole')).toHaveLength(7)
    expect(document.querySelectorAll('.ref-competence')).toHaveLength(61)
  })

  it('route #/essayer -> page de démonstration publique (P6)', async () => {
    window.location.hash = '#/'
    render(<App lib={fakeLib} />)

    setHash('#/essayer')

    expect(
      screen.getByRole('heading', { name: 'Essayer avec votre propre texte' }),
    ).toBeDefined()
    expect(screen.getByLabelText('Texte à cartographier')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Cartographier ce texte' })).toBeDefined()
  })

  it('route #/portfolio -> module portfolio, bandeau local-first (P7)', async () => {
    window.location.hash = '#/'
    render(<App lib={fakeLib} />)

    setHash('#/portfolio')

    expect(screen.getByRole('heading', { name: 'Portfolio' })).toBeDefined()
    expect((await screen.findByRole('note')).textContent).toContain(
      'Vos textes ne quittent pas ce navigateur.',
    )
    // jsdom n'a pas d'IndexedDB : la vue le signale proprement, sans crash.
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Stockage local indisponible',
    )
    expect(screen.getByRole('link', { name: 'Portfolio' }).getAttribute('href')).toBe(
      '#/portfolio',
    )
  })

  it('route #/compte sans API -> message copie statique, sans erreur non gérée', async () => {
    window.location.hash = '#/'
    render(<App lib={fakeLib} />)

    setHash('#/compte')

    expect((await screen.findByRole('status')).textContent).toContain(
      'indisponible sur cette copie statique',
    )
  })

  it('route invalide -> page introuvable avec retour accueil', () => {
    window.location.hash = '#/'
    render(<App lib={fakeLib} />)

    setHash('#/jour/2026-13-45')

    expect(screen.getByRole('alert').textContent).toContain('Page introuvable')
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' }).getAttribute('href')).toBe(
      '#/',
    )
  })
})
