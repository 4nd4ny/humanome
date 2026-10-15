// Gestionnaire : cases, étiquettes, ensembles, variantes, droit de réponse (§7, §8.2, §9).
import { describe, expect, it } from 'vitest'
import {
  addMarker, addTag, checkAll, checkRelativeTo, chooseVariant, invertChecks, removeTag, renameTag,
  saveSet, selectExactly, setComparisonNote, setReview, toggleDay,
} from './ops.js'
import { allTags, describeDefinition, groupDays, overlap, rangeBetween, resolveSetDates, triState } from './sets.js'
import { activeDates, contributingVariant, normalizeConfidence, normalizeRole, normalizeStatus, upgradeDataset, datasetErrors } from './model.js'
import { indexDataset } from '../test/fixtures.js'

const base = () =>
  indexDataset([
    { date: '2025-12-22', verdicts: [{ code: '1.01' }] },
    { date: '2025-12-23', verdicts: [{ code: '2.01' }] },
    { date: '2026-01-05', verdicts: [{ code: '3.01' }] },
    { date: '2026-01-06', verdicts: [{ code: '3.02' }] },
  ])

describe('cases à cocher', () => {
  it('par défaut tout est coché ; bascule, tout / rien / inverser', () => {
    const ds = base()
    expect(activeDates(ds).size).toBe(4)
    const one = toggleDay(ds, '2025-12-23')
    expect([...activeDates(one)]).toEqual(['2025-12-22', '2026-01-05', '2026-01-06'])
    expect(activeDates(checkAll(ds, false)).size).toBe(0)
    expect([...activeDates(invertChecks(one))]).toEqual(['2025-12-23'])
    expect(ds.days.every((d) => d.active)).toBe(true) // l'entrée n'est jamais mutée
  })
  it('« cocher jusqu’à ce jour » et « depuis ce jour »', () => {
    expect([...activeDates(checkRelativeTo(base(), '2025-12-23', 'until'))]).toEqual(['2025-12-22', '2025-12-23'])
    expect([...activeDates(checkRelativeTo(base(), '2026-01-05', 'since'))]).toEqual(['2026-01-05', '2026-01-06'])
  })
  it('tri-état par mois et par année scolaire', () => {
    const ds = toggleDay(base(), '2025-12-22')
    const months = groupDays(ds, 'month')
    expect(months.map((g) => [g.key, triState(g.dates, activeDates(ds))])).toEqual([
      ['2025-12', 'mixed'],
      ['2026-01', 'all'],
    ])
    expect(groupDays(ds, 'schoolYear')).toEqual([{ key: '2025-2026', label: 'année scolaire 2025–2026', dates: ['2025-12-22', '2025-12-23', '2026-01-05', '2026-01-06'] }])
  })
  it('plage du shift-clic', () => {
    expect(rangeBetween(base(), '2026-01-05', '2025-12-23')).toEqual(['2025-12-23', '2026-01-05'])
  })
})

describe('étiquettes et ensembles nommés', () => {
  it('étiquettes libres, renommées partout, ensembles par étiquette', () => {
    let ds = addTag(base(), ['2025-12-22', '2025-12-23'], '  projet   pont ')
    ds = addTag(ds, ['2026-01-05'], 'semestre 1')
    expect(allTags(ds)).toEqual(['projet pont', 'semestre 1'])
    ds = saveSet(ds, { name: 'Le pont', definition: { kind: 'tags', tags: ['projet pont'] } }, { now: '2026-02-01T00:00:00Z' })
    expect(resolveSetDates(ds.sets[0], ds)).toEqual(['2025-12-22', '2025-12-23'])
    ds = renameTag(ds, 'projet pont', 'pont')
    expect(ds.sets[0].definition.tags).toEqual(['pont'])
    expect(resolveSetDates(ds.sets[0], ds)).toEqual(['2025-12-22', '2025-12-23'])
    ds = removeTag(ds, 'pont', ['2025-12-23'])
    expect(resolveSetDates(ds.sets[0], ds)).toEqual(['2025-12-22'])
  })
  it('un ensemble figé garde son instantané', () => {
    let ds = saveSet(base(), { name: 'Décembre', definition: { kind: 'selection' }, freeze: true })
    ds = toggleDay(ds, '2025-12-22')
    expect(resolveSetDates(ds.sets[0], ds)).toHaveLength(4)
    expect(describeDefinition(ds.sets[0].definition)).toMatch(/sélection courante/)
  })
  it('rappel d’un ensemble = sélection exacte ; recouvrement signalé', () => {
    const ds = selectExactly(base(), ['2026-01-05'])
    expect([...activeDates(ds)]).toEqual(['2026-01-05'])
    expect(overlap(['a', 'b'], ['b', 'c'])).toEqual({ common: ['b'], count: 1 })
  })
  it('un ensemble doit porter un nom', () => {
    expect(() => saveSet(base(), { name: '  ', definition: { kind: 'selection' } })).toThrow(/nom/)
  })
})

describe('variantes, droit de réponse, repères, notes', () => {
  it('choisir une variante étrangère est refusé ; « à examiner » ne contribue pas', () => {
    const ds = base()
    expect(() => chooseVariant(ds, '2025-12-22', 'v-inconnue')).toThrow(/étrangère/)
    const ex = chooseVariant(ds, '2025-12-22', null)
    expect(contributingVariant(ex.days[0])).toBeNull()
    const back = chooseVariant(ex, '2025-12-22', 'v-2025-12-22')
    expect(contributingVariant(back.days[0]).id).toBe('v-2025-12-22')
    expect(back.days[0].variantChoice).toBe('learner')
  })
  it('droit de réponse : états connus seulement, note conservée', () => {
    let ds = setReview(base(), 'k', 'nuanced', 'Pas seulement ça.')
    ds = setReview(ds, 'k', 'confirmed')
    expect(ds.reviews.k).toMatchObject({ state: 'confirmed', note: 'Pas seulement ça.' })
    expect(() => setReview(ds, 'k', 'inconnu')).toThrow()
  })
  it('repères triés et notes de comparaison', () => {
    let ds = addMarker(base(), { date: '2026-01-05', label: 'Bascule' })
    ds = addMarker(ds, { date: '2025-12-22', label: 'Début', kind: 'phase', to: '2025-12-31' })
    expect(ds.markers.map((m) => m.label)).toEqual(['Début', 'Bascule'])
    ds = setComparisonNote(ds, { a: 's1', b: 's2', note: 'Ma lecture' })
    ds = setComparisonNote(ds, { a: 's1', b: 's2', note: 'Ma lecture, revue' })
    expect(ds.comparisons).toHaveLength(1)
    expect(ds.comparisons[0].note).toBe('Ma lecture, revue')
  })
})

describe('normalisations et forme du conteneur', () => {
  it('statuts : toutes variantes d’établissement, renvoi, non établie', () => {
    expect(normalizeStatus('présence établie')).toBe('established')
    expect(normalizeStatus('Présence établie (cumulée)')).toBe('established')
    expect(normalizeStatus('présence non établie')).toBe('not_established')
    expect(normalizeStatus('renvoi au cartographe')).toBe('needs_review')
    expect(normalizeStatus('En renvoi — Décision en entretien')).toBe('needs_review')
    expect(normalizeStatus('à arbitrer par le cartographe')).toBe('needs_review')
    expect(normalizeStatus('???')).toBe('unknown')
    expect(normalizeStatus(undefined)).toBe('unknown')
  })
  it('rôles et confiances', () => {
    expect(normalizeRole('preuve décisive')).toEqual({ role: 'preuve', known: true })
    expect(normalizeRole('indice corroboratif')).toEqual({ role: 'indice', known: true })
    expect(normalizeRole('autre')).toEqual({ role: 'indice', known: false })
    expect(normalizeConfidence('0,75')).toBe(0.75)
    expect(normalizeConfidence(85)).toBe(0.85)
    expect(normalizeConfidence('abc')).toBeNull()
  })
  it('forme v4 valide et migration douce idempotente', () => {
    const ds = base()
    expect(datasetErrors(ds)).toEqual([])
    const legacy = structuredClone(ds)
    delete legacy.sets
    delete legacy.preferences
    const up = upgradeDataset(legacy)
    expect(up.sets).toEqual([])
    expect(up.preferences.calendarMode).toBe('all')
    expect(up.preferences.params.poleRingPx).toBe(30)
    expect('highContrast' in up.preferences).toBe(false)
    // La disposition du tableau de bord est gardée dans le navigateur (D-61) : plus dans le jeu.
    const old = upgradeDataset({ ...structuredClone(ds), preferences: { ...ds.preferences, dashboardHidden: ['profile'], dashboardLayout: { order: [], sizes: {} } } })
    expect('dashboardHidden' in old.preferences || 'dashboardLayout' in old.preferences).toBe(false)
    expect('dashboardHidden' in up.preferences || 'dashboardLayout' in up.preferences).toBe(false)
    expect(upgradeDataset(up)).toEqual(up)
    expect(datasetErrors({ kind: 'x' })).toContain('kind ≠ competency-map-master')
  })
})
