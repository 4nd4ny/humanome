import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import HeatmapCalendar, { buildCalendarGrid, scoreLevel } from './HeatmapCalendar.jsx'
import mergeDoc from '../../public/data/demo/merge.json'

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

const feuilles = [
  { iso: '2026-01-05', label: '05/01/2026' }, // lundi
  { iso: '2026-01-07', label: '07/01/2026' },
  { iso: '2026-01-19', label: '19/01/2026' },
]
const evolution = [
  { date: '2026-01-05', score_total: 10 },
  { date: '2026-01-07', score_total: 40 },
  { date: '2026-01-19', score_total: 0 },
]

describe('buildCalendarGrid', () => {
  it('construit des semaines complètes lundi -> dimanche couvrant la période', () => {
    const { weeks } = buildCalendarGrid(['2026-01-05', '2026-01-19'])
    expect(weeks).toHaveLength(3)
    expect(weeks[0][0]).toBe('2026-01-05')
    for (const week of weeks) expect(week).toHaveLength(7)
    expect(weeks[2]).toContain('2026-01-19')
  })
})

describe('scoreLevel', () => {
  it('quantifie le score en 5 niveaux', () => {
    expect(scoreLevel(0, 40)).toBe(0)
    expect(scoreLevel(1, 40)).toBe(1)
    expect(scoreLevel(40, 40)).toBe(4)
    expect(scoreLevel(20, 40)).toBe(3)
    expect(scoreLevel(5, 0)).toBe(0) // pas de max -> pas d'intensité
  })
})

describe('HeatmapCalendar', () => {
  it('rend une cellule cliquable par feuille, intensité selon le score', () => {
    const { container } = render(
      <HeatmapCalendar feuilles={feuilles} evolution={evolution} onPickDay={() => {}} />,
    )
    const cells = container.querySelectorAll('rect.heatmap-day')
    expect(cells).toHaveLength(3)

    const low = container.querySelector('rect[data-iso="2026-01-05"]')
    const high = container.querySelector('rect[data-iso="2026-01-07"]')
    expect(low.getAttribute('fill')).not.toBe(high.getAttribute('fill'))
  })

  it('clic sur un jour -> onPickDay(iso)', () => {
    const onPickDay = vi.fn()
    const { container } = render(
      <HeatmapCalendar feuilles={feuilles} evolution={evolution} onPickDay={onPickDay} />,
    )
    fireEvent.click(container.querySelector('rect[data-iso="2026-01-07"]'))
    expect(onPickDay).toHaveBeenCalledWith('2026-01-07')
  })

  it('navigue par défaut vers #/jour/<iso>', () => {
    const { container } = render(<HeatmapCalendar feuilles={feuilles} evolution={evolution} />)
    fireEvent.click(container.querySelector('rect[data-iso="2026-01-19"]'))
    expect(window.location.hash).toBe('#/jour/2026-01-19')
  })

  it('rend les 59 feuilles du corpus réel', () => {
    const { container } = render(
      <HeatmapCalendar
        feuilles={mergeDoc.feuilles}
        evolution={mergeDoc.profilMeta.evolution_globale}
        onPickDay={() => {}}
      />,
    )
    expect(container.querySelectorAll('rect.heatmap-day')).toHaveLength(59)
  })

  it('ne rend rien sans feuilles', () => {
    const { container } = render(<HeatmapCalendar feuilles={[]} />)
    expect(container.querySelector('svg')).toBe(null)
  })
})
