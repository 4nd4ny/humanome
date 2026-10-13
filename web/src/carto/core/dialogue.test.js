// P7 — dialogue d'accompagnement scripté (spec §14) : des questions tirées des
// traces de la personne, sans valence ; relance facultative qui n'emporte que
// la question, la réponse et le passage cité ; carnet local.
import { describe, expect, it } from 'vitest'
import { computeState } from './state.js'
import { normalizeReferential } from './referential.js'
import { addReflection, removeReflection, setPreferences } from './ops.js'
import { indexDataset, miniReferential } from '../test/fixtures.js'
import {
  MAX_QUOTE_CHARS,
  RELAUNCH_SYSTEM,
  THREAD_KINDS,
  buildRelaunchRequest,
  cleanRelaunch,
  dialogueThreads,
  longestSilence,
  quoteCandidates,
  reflectionMarkdown,
} from './dialogue.js'

const ref = normalizeReferential(miniReferential())
const NOW = '2026-10-14T10:00:00.000Z'

/** Journées : rythme de 2-3 jours, puis un long silence ; 1.01 constante, 2.01 tardive, 3.02 en renvoi. */
function journal() {
  const ds = indexDataset([
    { date: '2025-09-01', verdicts: [{ code: '1.01', confidence: 0.7, roles: ['preuve'] }] },
    { date: '2025-09-03', verdicts: [{ code: '1.01', confidence: 0.9, roles: ['preuve'] }, { code: '3.02', status: 'needs_review', confidence: 0.5, roles: ['indice'] }] },
    { date: '2025-09-05', verdicts: [{ code: '1.01', confidence: 0.6, roles: ['indice'] }] },
    { date: '2025-09-08', verdicts: [{ code: '1.01', confidence: 0.9, roles: ['preuve'] }] },
    { date: '2025-11-20', verdicts: [{ code: '2.01', confidence: 0.8, roles: ['preuve'] }] },
  ])
  const words = {
    '2025-09-01': 'maquette pont carton appuis équipe essai mesure',
    '2025-09-03': 'maquette pont appuis équipe essai carton colle',
    '2025-09-05': 'pont appuis maquette essai mesure équipe carton',
    '2025-09-08': 'maquette appuis pont carton essai équipe mesure',
    '2025-11-20': 'hôpital grand-mère visite silence attente couloir',
  }
  for (const d of ds.days) d.portfolio = { chars: 200, words: 40 }
  const details = {}
  for (const d of ds.days) {
    const vid = `v-${d.date}`
    const verdicts = {}
    for (const v of d.variants[0].verdicts) {
      verdicts[v.code] = { traces: Object.fromEntries(v.traces.map((t, i) => [t.id, { extract: `**Passage** ${i + 1} du ${d.date} (${v.code})` }])) }
    }
    details[d.date] = { portfolio: { text: Array(4).fill(words[d.date]).join(' ') }, variants: { [vid]: { verdicts } } }
  }
  return { ds, getDetail: (date) => details[date] }
}

describe('fils du dialogue', () => {
  const { ds, getDetail } = journal()
  const state = computeState(ds, { ref })
  const threads = dialogueThreads(ds, state, ref, { getDetail })
  const byKind = Object.fromEntries(threads.map((t) => [t.kind, t]))

  it('suivent un ordre fixe et n’existent que si leurs données existent', () => {
    expect(threads.map((t) => t.kind)).toEqual(['citation', 'silence', 'apparition', 'constance', 'renvoi', 'rupture'])
    expect(THREAD_KINDS.filter((k) => byKind[k]).map((k) => k)).toEqual(threads.map((t) => t.kind))
    expect(new Set(threads.map((t) => t.id)).size).toBe(threads.length)
  })

  it('citation : la preuve la plus sûre, la plus récente à confiance égale, citée sans Markdown', () => {
    expect(quoteCandidates(state)[0]).toMatchObject({ code: '1.01', date: '2025-09-08', confidence: 0.9 })
    expect(byKind.citation.quote).toMatchObject({ date: '2025-09-08', code: '1.01', text: 'Passage 1 du 2025-09-08 (1.01)' })
    expect(byKind.citation.quote.raw).toContain('**Passage**')
    expect(byKind.citation.text).toMatch(/^Le 8 septembre 2025, vous écrivez ce passage, où l’analyse lit «\u00a0Pensée critique\u00a0» \(1\.01\)\./)
    // Sans détail chargé, pas de citation.
    expect(dialogueThreads(ds, state, ref).some((t) => t.kind === 'citation')).toBe(false)
  })

  it('silence : relatif au rythme de la personne (une donnée, pas un trou)', () => {
    expect(longestSilence(ds)).toMatchObject({ from: '2025-09-08', to: '2025-11-20', days: 72 })
    expect(byKind.silence.text).toContain('votre journal se tait pendant 72 jours')
    // Rythme régulier : pas de silence.
    const regular = indexDataset(['2025-09-01', '2025-09-08', '2025-09-15', '2025-09-22'].map((date) => ({ date, verdicts: [{ code: '1.01', roles: ['preuve'] }] })))
    expect(longestSilence(regular)).toBeNull()
  })

  it('apparition, constance, renvoi', () => {
    expect(byKind.apparition.refs.codes).toEqual(['2.01'])
    expect(byKind.apparition.text).toContain('apparaît pour la première fois le 20 novembre 2025')
    expect(byKind.constance.text).toContain('revient dans 4 de vos journées, du 1er septembre 2025 au 8 septembre 2025')
    expect(byKind.renvoi.refs.codes).toEqual(['3.02'])
  })

  it('rupture de vocabulaire : la plus grande, relative à la personne', () => {
    expect(byKind.rupture.refs.dates).toEqual(['2025-09-08', '2025-11-20'])
  })

  it('écart : seulement si la personne compare deux ensembles', () => {
    const compared = setPreferences(
      ds,
      { compare: { a: { name: 'Rentrée', def: { kind: 'period', from: '2025-09-01', to: '2025-09-30' } }, b: { name: 'Automne', def: { kind: 'period', from: '2025-10-01', to: '2025-12-31' } } } },
      { now: NOW },
    )
    const ecart = dialogueThreads(compared, state, ref, { getDetail }).find((t) => t.kind === 'ecart')
    expect(ecart.text).toMatch(/^Entre «\u00a0Rentrée\u00a0» et «\u00a0Automne\u00a0» : .*Qu’est-ce qui, selon vous, explique cet écart \?$/)
    expect(ecart.sources).toEqual(['comparaison'])
  })

  it('aucune valence, aucun conseil, toujours une question', () => {
    for (const t of threads) {
      expect(t.text).not.toMatch(/progr|mieux|meilleur|faible|fort\b|recul|retard|insuffis|bravo|devriez|il faut/i)
      expect(t.text.trim().endsWith('?')).toBe(true)
    }
  })

  it('jeu vide ou d’une seule journée : aucun fil inventé', () => {
    const one = indexDataset([{ date: '2025-09-01', verdicts: [{ code: '1.01', roles: ['indice'] }] }])
    const kinds = dialogueThreads(one, computeState(one, { ref }), ref).map((t) => t.kind)
    expect(kinds).toEqual([])
  })
})

describe('relance facultative', () => {
  it('n’emporte que la question, la réponse et le passage cité', () => {
    const req = buildRelaunchRequest({ question: 'Que s’est-il passé ?', answer: '  J’étais à l’hôpital.  ', quote: '**Un** passage' })
    expect(req.system).toBe(RELAUNCH_SYSTEM)
    expect(req.prompt).toBe('Question posée : Que s’est-il passé ?\nPassage cité de son journal : «\u00a0Un passage\u00a0»\nSa réponse : J’étais à l’hôpital.')
    expect(buildRelaunchRequest({ question: 'Q ?', answer: 'R' }).prompt).not.toContain('Passage cité')
    expect(buildRelaunchRequest({ question: 'Q ?', answer: 'x'.repeat(5000) }).prompt.length).toBeLessThan(4100)
    expect(RELAUNCH_SYSTEM).toMatch(/Pas de jugement, pas d’évaluation, pas de conseil/)
  })

  it('la relance s’affiche en texte simple, bornée', () => {
    expect(cleanRelaunch('**Et ensuite ?**\n')).toBe('Et ensuite ?')
    expect(cleanRelaunch('x'.repeat(1000))).toHaveLength(400)
  })
})

describe('carnet', () => {
  const { ds } = journal()

  it('garde questions et réponses (bornées), retire, exporte en Markdown', () => {
    const entry = { threadId: 'silence:a:b', kind: 'silence', question: 'Que s’est-il passé ?', quote: null, answer: 'Une longue pause.', refs: { dates: ['2025-09-08', 'pas-une-date'], codes: [] } }
    const withOne = addReflection(ds, { entries: [entry, { threadId: 'x', kind: 'apparition', question: 'Et là ?', answer: '' }] }, { now: NOW })
    expect(withOne.reflections).toHaveLength(1)
    const r = withOne.reflections[0]
    expect(r.at).toBe(NOW)
    expect(r.entries[0].refs.dates).toEqual(['2025-09-08'])
    expect(r.entries[1].answer).toBe('')
    expect(addReflection(ds, { entries: [] }, { now: NOW })).toBe(ds)
    expect(addReflection(ds, { entries: [{ ...entry, answer: 'y'.repeat(9000) }] }, { now: NOW }).reflections[0].entries[0].answer).toHaveLength(4000)

    const md = reflectionMarkdown({ ...r, entries: [...r.entries, { question: 'Q ?', quote: 'Un passage', answer: 'R', relaunch: { text: 'Et alors ?', model: 'Ollama — llama3.1' } }] })
    expect(md).toContain('## Dialogue du 14 octobre 2026')
    expect(md).toContain('**Que s’est-il passé ?**\n\nUne longue pause.')
    expect(md).toContain('_(sans réponse)_')
    expect(md).toContain('> «\u00a0Un passage\u00a0»')
    expect(md).toContain('> Relance (Ollama — llama3.1) : Et alors ?')

    expect(removeReflection(withOne, r.id, { now: NOW }).reflections).toEqual([])
  })

  it('les citations sont bornées', () => {
    const { ds: d2, getDetail } = journal()
    const long = (date) => {
      const det = getDetail(date)
      for (const v of Object.values(det.variants)) for (const vd of Object.values(v.verdicts)) for (const t of Object.values(vd.traces)) t.extract = 'mot '.repeat(400)
      return det
    }
    const t = dialogueThreads(d2, computeState(d2, { ref }), ref, { getDetail: long }).find((x) => x.kind === 'citation')
    expect(t.quote.text.length).toBeLessThanOrEqual(MAX_QUOTE_CHARS)
    expect(t.quote.text.endsWith('…')).toBe(true)
  })
})
