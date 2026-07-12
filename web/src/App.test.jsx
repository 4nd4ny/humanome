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

    // En-tête : marque -> #/ et lien vers la vue merge
    const brand = screen.getByText('humanome.xyz', { selector: 'a' })
    expect(brand.getAttribute('href')).toBe('#/')
    expect(screen.getByRole('link', { name: 'Cartographie' }).getAttribute('href')).toBe('#/merge')

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
