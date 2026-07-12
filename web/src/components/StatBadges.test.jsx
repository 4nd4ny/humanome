import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import StatBadges from './StatBadges.jsx'

afterEach(cleanup)

const mergeDoc = {
  periode: { premiere: '2025-12-22', derniere: '2026-03-29', nbFeuilles: 59 },
  profilMeta: { competences_etablies: 45 },
}

describe('StatBadges', () => {
  it('affiche feuilles, période et compétences établies', () => {
    render(<StatBadges mergeDoc={mergeDoc} totalCompetences={61} />)
    expect(screen.getByText('59')).toBeDefined()
    expect(screen.getByText('22/12/2025 → 29/03/2026')).toBeDefined()
    expect(screen.getByText('45 / 61')).toBeDefined()
    expect(screen.getByText('Feuilles de portfolio')).toBeDefined()
    expect(screen.getByText('Période')).toBeDefined()
    expect(screen.getByText('Compétences établies')).toBeDefined()
  })

  it('reste lisible avec un document incomplet', () => {
    render(<StatBadges mergeDoc={{}} />)
    expect(screen.getAllByText('—')).toHaveLength(3)
  })
})
