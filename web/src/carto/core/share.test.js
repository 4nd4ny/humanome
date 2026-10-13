// Version partagée (spec §12) : liste positive, chiffres recalculés, dates à
// la précision choisie, extraits relus et masqués — et le même contrat que la
// liste blanche du serveur (fixture partagée schemas/fixtures/partage/).
import { describe, expect, it } from 'vitest'
import { computeState, layoutSun } from './state.js'
import { normalizeReferential } from './referential.js'
import { ringGeometry } from './formulas.js'
import { indexDataset, miniReferential } from '../test/fixtures.js'
import {
  DEFAULT_LINK_DAYS,
  MAX_EXTRACT_CHARS,
  absoluteShareUrl,
  attestationRequired,
  buildSharedVersion,
  cleanExtractText,
  dateAtPrecision,
  extractCandidates,
  formatSharedDate,
  isSharedVersion,
  normalizeShareConfig,
  reviewPoints,
  sharedState,
} from './share.js'
import fixture from '../../../../schemas/fixtures/partage/carto-partage-exemple.json'

const ref = normalizeReferential(miniReferential())
const ds = indexDataset([
  { date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve'] }, { code: '3.01', confidence: 0.9, roles: ['preuve'] }] },
  { date: '2025-12-23', verdicts: [{ code: '2.01', confidence: 0.5, roles: ['indice'] }, { code: '1.01', confidence: 0.6, roles: ['indice'] }] },
  { date: '2025-12-27', verdicts: [{ code: '3.01', confidence: 0.9, roles: ['preuve', 'preuve'] }] },
  { date: '2026-01-05', verdicts: [{ code: '1.01', confidence: 0.7, roles: ['indice'] }] },
])
const state = computeState(ds, { ref })
const NOW = '2026-10-14T10:00:00.000Z'
const build = (over = {}) => buildSharedVersion({ state, ref, title: 'Mes compétences', codes: ['1.01', '2.01'], now: NOW, ...over })

/** Forme d'un document : clés triées à chaque niveau, premier élément des listes. */
function shape(v) {
  if (Array.isArray(v)) return v.length ? [shape(v[0])] : []
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k])]))
  return typeof v
}

describe('liste positive', () => {
  it('ne garde que les compétences retenues, angles recalculés sur elles seules (360°, sans trou)', () => {
    const doc = build()
    expect(doc.state.competencies.map((c) => c.code)).toEqual(['1.01', '2.01'])
    const total = doc.state.competencies.reduce((s, c) => s + c.theta, 0)
    expect(total).toBeCloseTo(360, 2)
    const full = state.competencies.get('1.01')
    const share = full.intensity / (full.intensity + state.competencies.get('2.01').intensity)
    expect(doc.state.competencies[0].theta).toBeCloseTo(360 * share, 3)
    expect(doc.state.poles.map((p) => p.num)).toEqual([1, 2])
    expect(doc.state.poles[1].needsReviewOnly).toBe(false)
    // La compétence retirée n'apparaît nulle part.
    expect(JSON.stringify(doc)).not.toContain('3.01')
    expect(doc.referential.competences.map((c) => c.code)).toEqual(['1.01', '2.01'])
    expect(doc.referential.poles).toHaveLength(3) // donnée publique : symboles stables
  })

  it('compte les seules journées où une compétence retenue est observée', () => {
    const doc = build({ precision: 'day' })
    expect(doc.state.dayCount).toBe(3) // le 27/12 (3.01 seule) ne compte pas
    expect(doc.state.dates).toEqual(['2025-12-22', '2025-12-23', '2026-01-05'])
    expect(doc.period).toEqual({ from: '2025-12-22', to: '2026-01-05' })
    expect(doc.state.competencies[0].days).toBe(3)
  })

  it('refuse une version vide ou sans titre', () => {
    expect(() => build({ codes: [] })).toThrow(/au moins une compétence/)
    expect(() => build({ codes: ['3.02'] })).toThrow(/au moins une compétence/)
    expect(() => build({ title: '   ' })).toThrow(/titre/)
    expect(() => build({ title: 'x'.repeat(191) })).toThrow(/190/)
  })
})

describe('précision des dates', () => {
  it('au mois : journées, période, heatmap et extraits arrondis au mois', () => {
    const doc = build({ precision: 'month', extracts: [{ code: '1.01', date: '2025-12-22', role: 'preuve', text: 'Un passage.' }] })
    expect(doc.state.dates).toEqual(['2025-12', '2026-01'])
    expect(doc.period).toEqual({ from: '2025-12', to: '2026-01' })
    expect(doc.heatmap.precision).toBe('month')
    expect(doc.heatmap.cells.map((c) => [c.key, c.days])).toEqual([
      ['2025-12', 2],
      ['2026-01', 1],
    ])
    for (const c of doc.heatmap.cells) expect(c.level).toBeGreaterThanOrEqual(1)
    expect(doc.heatmap.cells[0].level).toBeGreaterThan(doc.heatmap.cells[1].level)
    expect(doc.extracts[0].date).toBe('2025-12')
    expect(JSON.stringify(doc)).not.toMatch(/\d{4}-\d{2}-\d{2}"/) // aucune date au jour (publishedAt est horodaté)
  })

  it('masquées : ni période, ni heatmap, ni date — le nombre de journées reste', () => {
    const doc = build({ precision: 'none', extracts: [{ code: '2.01', date: '2025-12-23', role: 'indice', text: 'Un autre passage.' }] })
    expect(doc.state.dates).toEqual([])
    expect(doc.period).toBeNull()
    expect(doc.heatmap).toBeNull()
    expect(doc.extracts[0].date).toBeNull()
    expect(doc.state.dayCount).toBe(3)
  })

  it('dateAtPrecision et formatSharedDate', () => {
    expect(dateAtPrecision('2025-12-22', 'day')).toBe('2025-12-22')
    expect(dateAtPrecision('2025-12-22', 'month')).toBe('2025-12')
    expect(dateAtPrecision('2025-12-22', 'none')).toBeNull()
    expect(formatSharedDate('2025-12', 'month')).toBe('décembre 2025')
    expect(formatSharedDate('2025-12-22', 'day')).toMatch(/22 décembre 2025/)
    expect(formatSharedDate(null, 'none')).toBe('')
  })
})

describe('extraits', () => {
  it('candidats : les traces des compétences retenues, preuves d’abord à date égale', () => {
    const list = extractCandidates(state, ref, ['1.01'])
    expect(list.map((c) => [c.date, c.role])).toEqual([
      ['2025-12-22', 'preuve'],
      ['2025-12-23', 'indice'],
      ['2026-01-05', 'indice'],
    ])
    expect(new Set(list.map((c) => c.key)).size).toBe(3)
  })

  it('relus : Markdown retiré, blancs réduits, motifs masqués, noms remplacés, bornés, sans doublon', () => {
    const doc = build({
      dictionary: [{ from: 'Sam', to: 'S.' }],
      extracts: [
        { code: '1.01', date: '2025-12-22', role: 'preuve', text: '**J’ai** écrit à  sam@exemple.org\net appelé Sam au 06 12 34 56 78.' },
        { code: '1.01', date: '2025-12-22', role: 'preuve', text: 'J’ai écrit à sam@exemple.org et appelé Sam au 06 12 34 56 78.' },
        { code: '3.01', date: '2025-12-22', role: 'preuve', text: 'Compétence retirée : jamais publiée.' },
        { code: '2.01', date: '2025-12-23', role: 'indice', text: 'x'.repeat(MAX_EXTRACT_CHARS + 50) },
        { code: '2.01', date: '2025-12-23', role: 'indice', text: '   ' },
      ],
    })
    expect(doc.extracts).toHaveLength(2)
    expect(doc.extracts[0].text).toBe('J’ai écrit à ‹courriel› et appelé S. au ‹téléphone›.')
    expect(doc.extracts[1].text).toHaveLength(MAX_EXTRACT_CHARS)
    expect(doc.extracts[1].text.endsWith('…')).toBe(true)
    expect(JSON.stringify(doc)).not.toContain('retirée')
  })

  it('cleanExtractText sans remplacement', () => {
    expect(cleanExtractText('> ### Titre\n- *item*')).toBe('Titre item')
  })
})

describe('contrat avec le serveur', () => {
  it('même forme que la fixture partagée (que la liste blanche PHP accepte)', () => {
    const doc = build({ precision: 'month', extracts: [{ code: '1.01', date: '2025-12-22', role: 'preuve', text: 'Un passage.' }] })
    expect(shape(doc)).toEqual(shape(fixture))
    expect(isSharedVersion(doc)).toBe(true)
    expect(isSharedVersion({ ...doc, schemaVersion: '2.0.0' })).toBe(false)
  })

  it('aucun champ privé : ni portfolio, ni jury, ni traces, ni notes', () => {
    const text = JSON.stringify(build({ precision: 'day' }))
    for (const forbidden of ['portfolio', 'traces', 'verdicts', 'variants', 'jury', 'notes', 'tags', 'sets', 'review', 'runRef', 'markers']) {
      expect(text).not.toContain(`"${forbidden}"`)
    }
  })
})

describe('lecture par le destinataire', () => {
  it('sharedState redonne le même soleil que la version publiée', () => {
    const doc = build()
    const { ref: r, state: s } = sharedState(JSON.parse(JSON.stringify(doc)))
    expect(s.dates).toHaveLength(3)
    expect(s.competencies.get('1.01').days).toHaveLength(3)
    const layout = layoutSun(s, r, ringGeometry({ outerRadius: 190, centerRadius: 30, gap: 5 }))
    expect(layout.competencies.map((c) => c.code)).toEqual(['1.01', '2.01'])
    const span = layout.competencies.reduce((sum, c) => sum + (c.a1 - c.a0), 0)
    expect(span).toBeCloseTo(2 * Math.PI, 3)
  })
})

describe('configuration et lien', () => {
  it('serverEnabled faux et adultOnly vrai par défaut ; le serveur ne peut qu’ajouter l’exigence', () => {
    expect(normalizeShareConfig(undefined)).toEqual({ serverEnabled: false, adultOnly: true })
    expect(normalizeShareConfig({ serverEnabled: true, adultOnly: false })).toEqual({ serverEnabled: true, adultOnly: false })
    expect(attestationRequired({ adultOnly: false }, { required: true })).toBe(true)
    expect(attestationRequired({ adultOnly: true }, null)).toBe(true)
    expect(attestationRequired({ adultOnly: false }, { required: false })).toBe(false)
    expect(DEFAULT_LINK_DAYS).toBe(90)
  })

  it('lien absolu depuis l’URL relative de l’API', () => {
    const location = { origin: 'https://humanome.xyz', pathname: '/' }
    expect(absoluteShareUrl('/#/partage/abc/ouvert', location)).toBe('https://humanome.xyz/#/partage/abc/ouvert')
    expect(absoluteShareUrl('/#/partage/abc', { origin: 'http://localhost:5173', pathname: '/sous/index.html' })).toBe('http://localhost:5173/sous/index.html#/partage/abc')
  })

  it('relecture : propose les mots à majuscule, sauf les débuts courants et les noms déjà remplacés', () => {
    const points = reviewPoints({ title: 'Mon année avec Camille', extracts: [{ text: 'Hier, Sam et Jean-Luc ont aidé. Nous avons fini.' }] }, [{ from: 'Sam' }])
    expect(points.names).toEqual(['Camille', 'Jean-Luc'])
  })
})
