// P4 — tableau de bord (spec §10). Critère d'acceptation : chaque carte se
// masque seule quand ses données manquent (ici : la donnée de la carte vaut null).
import { describe, expect, it } from 'vitest'
import {
  anomaliesData,
  cognitiveData,
  constancyData,
  lexicalData,
  median,
  phasesData,
  profileData,
  rhythmData,
  selectMoments,
  sensitivityLabel,
  sensitivityThreshold,
  styleData,
} from './dashboard.js'
import { importFiles } from './import.js'
import { createDataset } from './model.js'
import { computeState } from './state.js'
import { normalizeReferential } from './referential.js'
import { importMetrics } from './importers/metrics.js'
import { LOU_PORTFOLIO, indexDataset, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'

const ref = normalizeReferential(miniReferential())
const NOW = '2026-10-13T12:00:00.000Z'

async function lou({ portfolio = true } = {}) {
  const files = portfolio ? [{ path: 'lou.md', text: LOU_PORTFOLIO }] : []
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  return importFiles(files, createDataset({ datasetId: 'x', referential: miniReferential(), now: NOW }), { now: NOW })
}

const TEXT_A = 'Nous avons construit la maquette du pont en carton avec Sam. '.repeat(8)
const TEXT_B = 'J’ai écouté Sam expliquer son idée, puis j’ai reformulé ce que j’avais compris. Pourquoi ai-je hésité ? '.repeat(5)
const TEXT_C = 'Troisième essai : les appuis tiennent enfin ! J’ai noté chaque modification dans un tableau. '.repeat(6)

describe('cartes : données présentes', () => {
  it('profil : parts des pôles et compétences, concentration', async () => {
    const { dataset } = await lou()
    const p = profileData(computeState(dataset, { ref }), ref)
    expect(p.comps.map((c) => c.code)).toEqual(['1.01', '2.01', '3.01', '3.02'])
    expect(p.poles.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1)
    expect(p.concentration).toBeCloseTo(1) // 4 compétences : les 5 plus grandes parts = tout
  })

  it('rythme : volume par jour écrit, silences comptés, jamais de zéro inventé', async () => {
    const { dataset } = await lou()
    const r = rhythmData(dataset)
    expect(r.days.map((d) => d.date)).toEqual(['2025-12-22', '2025-12-23', '2025-12-24'])
    expect(r.silences).toBe(0)
    expect(r.totalWords).toBeGreaterThan(30)
  })

  it('constance : journées, intervalle entre observations, intensité cumulée croissante', async () => {
    const ds = indexDataset([
      { date: '2025-12-01', verdicts: [{ code: '1.01', confidence: 0.5, roles: ['preuve'] }] },
      { date: '2025-12-05', verdicts: [{ code: '1.01', confidence: 0.6, roles: ['indice'] }] },
      { date: '2025-12-15', verdicts: [{ code: '1.01', confidence: 0.7, roles: ['preuve'] }] },
    ])
    const c = constancyData(computeState(ds, { ref }), ref)
    const row = c.rows[0]
    expect(row).toMatchObject({ code: '1.01', days: 3, interval: { mean: 7, min: 4, max: 10 } })
    expect(row.series.map((s) => s.confidence)).toEqual([0.5, 0.6, 0.7])
    expect(row.series[0].intensity).toBeLessThan(row.series[2].intensity)
  })

  it('moments : la sensibilité règle le seuil de poids (0 → 0,9 ; 50 → 0,6 ; 100 → 0,3)', () => {
    expect([0, 50, 100].map(sensitivityThreshold)).toEqual([0.9, 0.6, 0.3])
    expect([20, 50, 80].map(sensitivityLabel)).toEqual(['signaux forts seulement', 'seuils par défaut', 'signaux faibles inclus'])
    const items = [
      { id: 'a', date: '2025-12-22', code: '1.01', role: 'preuve', confidence: 0.8, weight: 0.8, extract: 'x' },
      { id: 'b', date: '2025-12-23', code: '2.01', role: 'indice', confidence: 0.8, weight: 0.4, extract: 'y' },
      { id: 'c', date: '2025-12-24', code: '3.01', role: 'preuve', confidence: 0.95, weight: 0.95, extract: '' },
    ]
    expect(selectMoments(items, 50).map((m) => m.id)).toEqual(['a'])
    expect(selectMoments(items, 100).map((m) => m.id)).toEqual(['a', 'b'])
    expect(selectMoments(items, 0)).toEqual([]) // sans extrait, pas de moment
  })

  it('style : normalisation par ligne AU SEIN de la personne', () => {
    const s = styleData(new Map([['2025-12-22', TEXT_A], ['2025-12-23', TEXT_B], ['2025-12-24', TEXT_C]]))
    expect(s.dates).toHaveLength(3)
    const q = s.rows.find((r) => r.key === 'questions')
    expect(q.norm(q.values.get('2025-12-23'))).toBe(1) // seule journée avec des questions
    expect(q.norm(q.values.get('2025-12-22'))).toBe(0)
    expect(s.rows).toHaveLength(19)
  })

  it('fonctions cognitives : fichier miroir HumanoTwin (trajectoire + signatures dédoublonnées)', () => {
    const doc = {
      run_id: 'r1',
      trajectoire: {
        dates: ['2025-12-28', '2025-12-29'],
        trajectoire: [
          { date: '2025-12-28', profil: { metacognition: 0.4, inhibition: 0.2 }, n_caracteres: 900, premiere_impression: 'Une journée dense.' },
          { date: '2025-12-29', profil: { metacognition: 0.6, inhibition: 0.1 }, n_caracteres: 300, premiere_impression: 'Plus brève.' },
        ],
      },
      signatures_par_sensibilite: {
        50: [{ type: 'recategorisation', date: '2025-12-29', question: 'Q ?', confiance: 0.7 }],
        100: [
          { type: 'recategorisation', date: '2025-12-29', question: 'Q ?', confiance: 0.7 },
          { type: 'analogie', date: '2025-12-28', question: 'R ?', confiance: 0.2 },
        ],
      },
    }
    const { metrics } = importMetrics(doc)
    const c = cognitiveData(metrics)
    expect(c.functions.map((f) => f.key)).toEqual(['metacognition', 'inhibition'])
    expect(c.signatures).toEqual([
      { type: 'analogie', date: '2025-12-28', question: 'R ?', confidence: 0.2, minSensitivity: 100 },
      { type: 'recategorisation', date: '2025-12-29', question: 'Q ?', confidence: 0.7, minSensitivity: 50 },
    ])
    expect(c.firstImpressions['2025-12-28']).toBe('Une journée dense.')
  })

  it('rupture lexicale : distances entre journées écrites consécutives et médiane personnelle', () => {
    const l = lexicalData(new Map([['2025-12-22', TEXT_A], ['2025-12-23', TEXT_B], ['2025-12-30', TEXT_C]]))
    expect(l.transitions.map((t) => [t.from, t.to, t.gapDays])).toEqual([
      ['2025-12-22', '2025-12-23', 1],
      ['2025-12-23', '2025-12-30', 7],
    ])
    expect(l.median).toBeGreaterThan(0)
    expect(median([3, 1, 2])).toBe(2)
  })

  it('anomalies : variantes à arbitrer, journées sans portfolio', async () => {
    const { dataset } = await lou({ portfolio: false })
    const a = anomaliesData(dataset)
    expect(a.noPortfolioAtAll).toBe(true)
    expect(a.pending).toEqual([])
  })
})

describe('critère P4 : une carte sans données se masque (données = null)', () => {
  it('profil, constance : aucun secteur', () => {
    const empty = computeState(indexDataset([]), { ref })
    expect(profileData(empty, ref)).toBeNull()
    expect(constancyData(empty, ref)).toBeNull()
  })
  it('rythme : aucun portfolio ; phases : aucune journée', async () => {
    const { dataset } = await lou({ portfolio: false })
    expect(rhythmData(dataset)).toBeNull()
    expect(phasesData(indexDataset([]))).toBeNull()
  })
  it('style : moins de deux journées assez longues ; rupture : moins de deux écarts mesurables', () => {
    expect(styleData(new Map([['2025-12-22', TEXT_A]]))).toBeNull()
    expect(styleData(new Map([['2025-12-22', TEXT_A], ['2025-12-23', 'Trop court.']]))).toBeNull()
    expect(lexicalData(new Map([['2025-12-22', TEXT_A], ['2025-12-23', TEXT_B]]))).toBeNull()
  })
  it('fonctions cognitives : pas de fichier, ou pas de fonction connue', () => {
    expect(cognitiveData(null)).toBeNull()
    expect(cognitiveData({ byDate: { '2025-12-22': { autre: 1 } }, fields: {} })).toBeNull()
  })
  it('anomalies : rien à signaler', async () => {
    const { dataset } = await lou()
    expect(anomaliesData(dataset)).toBeNull()
  })
})
