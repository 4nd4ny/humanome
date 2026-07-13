import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import GuidesView from './GuidesView.jsx'

afterEach(cleanup)

const anonymous = async () => ({ user: null })

describe('GuidesView — hub public des guides', () => {
  it('accueil : une carte par parcours, groupées par famille, en accès libre', () => {
    render(<GuidesView parcours={null} chapter={null} deps={{ fetchMeFn: anonymous }} />)
    expect(screen.getByRole('heading', { level: 1, name: /Guides/ })).toBeDefined()
    // Les sept profils utilisateurs sont présents comme cartes cliquables.
    for (const label of [
      'Découvrir humanome.xyz',
      'Construire sa cartographie',
      'Lire une cartographie partagée',
      'Relire et garantir',
      'Cartographier une cohorte',
      'Faire évoluer le référentiel',
      'Concevoir les prompts',
    ]) {
      expect(screen.getByText(label)).toBeDefined()
    }
    // La carte visiteur pointe vers son parcours.
    const carte = screen.getByText('Découvrir humanome.xyz').closest('a')
    expect(carte.getAttribute('href')).toBe('#/guides/visiteur')
  })

  it('un parcours connu rend la formation avec le fil d’Ariane vers le hub', async () => {
    render(<GuidesView parcours="visiteur" chapter={null} deps={{ fetchMeFn: anonymous }} />)
    expect(screen.getByRole('link', { name: '← Tous les guides' }).getAttribute('href')).toBe(
      '#/guides',
    )
    // La liste des chapitres du parcours visiteur est rendue (progression).
    expect(await screen.findByTestId('formation-progress')).toBeDefined()
  })

  it('un parcours inconnu affiche une erreur et un retour au hub', () => {
    render(<GuidesView parcours="inconnu" chapter={null} deps={{ fetchMeFn: anonymous }} />)
    expect(screen.getByRole('alert').textContent).toContain('Guide inconnu')
    expect(screen.getByRole('link', { name: 'Retour à tous les guides' }).getAttribute('href')).toBe(
      '#/guides',
    )
  })
})
