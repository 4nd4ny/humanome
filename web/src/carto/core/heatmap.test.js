// Heatmap, calendrier et dates (spec §5.7, §5.8 ; journal D-5).
import { describe, expect, it } from 'vitest'
import { buildHeatmap, calendarGrid, datesObserving, heatmapValueMode, levelOf, levelThresholds, moveFocus, periodBands } from './heatmap.js'
import { addDays, eachDay, formatLong, isIsoDate, isoWeekKey, schoolYearOf, weekdayIndex } from './dates.js'
import { normalizeReferential } from './referential.js'
import { indexDataset, miniReferential } from '../test/fixtures.js'
import { setActive } from './ops.js'

const ref = normalizeReferential(miniReferential())

describe('dates civiles (chaînes AAAA-MM-JJ)', () => {
  it('validation stricte', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-2-3')).toBe(false)
    expect(isIsoDate(null)).toBe(false)
  })
  it('aucun décalage d’un jour au passage à l’heure d’été ou d’hiver', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(addDays('2025-10-26', 1)).toBe('2025-10-27')
    expect(eachDay('2026-03-27', '2026-03-31')).toHaveLength(5)
  })
  it('lundi = 0', () => {
    expect(weekdayIndex('2025-12-22')).toBe(0) // lundi
    expect(weekdayIndex('2025-12-28')).toBe(6) // dimanche
  })
  it('semaine ISO', () => {
    expect(isoWeekKey('2025-12-29')).toBe('2026-W01')
    expect(isoWeekKey('2025-12-22')).toBe('2025-W52')
  })
  it('année scolaire du 1er août au 31 juillet, étiquetée « 2025–2026 »', () => {
    expect(schoolYearOf('2025-08-01')).toMatchObject({ start: '2025-08-01', end: '2026-07-31', label: '2025–2026' })
    expect(schoolYearOf('2026-07-31').label).toBe('2025–2026')
    expect(schoolYearOf('2025-07-31').label).toBe('2024–2025')
  })
  it('libellé long', () => {
    expect(formatLong('2025-12-01')).toBe('1er décembre 2025')
  })
})

describe('calendrier (§5.8)', () => {
  it('colonnes par semaine, lundi premier, mois étiquetés', () => {
    const { weeks, months } = calendarGrid({ from: '2025-08-01', to: '2026-07-31' })
    expect(weeks[0].monday).toBe('2025-07-28')
    expect(weeks[0].days[0]).toBeNull() // 28 juillet hors période
    expect(weeks[0].days[4]).toBe('2025-08-01') // vendredi
    expect(weeks.length).toBe(53)
    expect(months.map((m) => m.label)).toEqual(['août', 'sept.', 'oct.', 'nov.', 'déc.', 'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.'])
  })
  it('bandes empilées : par année scolaire ou civile', () => {
    expect(periodBands({ from: '2025-06-01', to: '2026-09-30' }, 'school').map((b) => b.label)).toEqual(['2024–2025', '2025–2026', '2026–2027'])
    expect(periodBands({ from: '2025-06-01', to: '2026-09-30' }, 'free').map((b) => b.label)).toEqual(['2025', '2026'])
  })
  it('navigation clavier : flèches ±1 jour (vertical), ±7 jours (horizontal), bornée', () => {
    const period = { from: '2025-08-01', to: '2026-07-31' }
    expect(moveFocus('2025-12-22', 'ArrowDown', period)).toBe('2025-12-23')
    expect(moveFocus('2025-12-22', 'ArrowRight', period)).toBe('2025-12-29')
    expect(moveFocus('2025-08-01', 'ArrowUp', period)).toBe('2025-08-01')
    expect(moveFocus('2025-12-22', 'End', period)).toBe('2026-07-31')
  })
})

describe('heatmap (§5.7)', () => {
  const ds = indexDataset([
    { date: '2025-12-22', verdicts: [{ code: '1.01', roles: ['preuve'] }, { code: '1.02', roles: ['indice'] }] },
    { date: '2025-12-23', verdicts: [{ code: '2.01', roles: ['preuve'] }, { code: '3.01', roles: ['indice'] }] },
    { date: '2025-12-24', verdicts: [{ code: '3.01', roles: ['preuve', 'preuve'] }] },
  ])
  const period = { from: '2025-12-01', to: '2025-12-31' }

  it('sans portfolio : repli sur la somme des points des traces, quantiles ipsatifs', () => {
    expect(heatmapValueMode(ds)).toBe('weights')
    const h = buildHeatmap(ds, { ref, period })
    expect(h.cells.get('2025-12-22').value).toBeCloseTo(1 + 0.5) // une preuve, un indice
    expect(h.cells.get('2025-12-24').value).toBeCloseTo(2) // deux preuves
    expect(h.cells.get('2025-12-24').level).toBeGreaterThan(h.cells.get('2025-12-22').level)
    expect(h.cells.has('2025-12-25')).toBe(false) // silence : aucune case documentée
  })

  it('teinte de la famille quand une seule famille est observée ce jour-là, neutre sinon', () => {
    const h = buildHeatmap(ds, { ref, period })
    expect(h.cells.get('2025-12-22').tint).toBe('#2563eb')
    expect(h.cells.get('2025-12-23').tint).toBeNull()
  })

  it('avec portfolio : valeur = volume du jour ; analyse sans portfolio signalée, jamais « silence »', () => {
    const withPf = structuredClone(ds)
    withPf.days[0].portfolio = { chars: 1200, words: 200 }
    withPf.days[1].portfolio = { chars: 300, words: 50 }
    const h = buildHeatmap(withPf, { ref, period })
    expect(h.mode).toBe('volume')
    expect(h.cells.get('2025-12-22').value).toBe(1200)
    expect(h.cells.get('2025-12-24')).toMatchObject({ analysisWithoutPortfolio: true, level: 1 })
  })

  it('journées décochées : présentes mais marquées inactives', () => {
    const h = buildHeatmap(setActive(ds, ['2025-12-23'], false), { ref, period })
    expect(h.cells.get('2025-12-23').active).toBe(false)
    expect(h.cells.get('2025-12-22').active).toBe(true)
  })

  it('jours où une compétence est observée (allumage au clic)', () => {
    expect([...datesObserving(ds, '3.01')]).toEqual(['2025-12-23', '2025-12-24'])
  })

  it('niveaux 1 à 5 par quantiles ; une valeur nulle mais documentée vaut 1', () => {
    const t = levelThresholds([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(levelOf(1, t)).toBe(1)
    expect(levelOf(10, t)).toBe(5)
    expect(levelOf(0, t)).toBe(1)
  })
})
