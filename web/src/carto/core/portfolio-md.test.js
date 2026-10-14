// Question 20 (décision du 2026-10-14) — un chemin du carnet du dialogue vers
// le portfolio : un dialogue versé fait partie du portfolio exporté en
// Markdown, dans la journée où il a été tenu ; redécoupé comme à l'import, le
// fichier redonne les mêmes journées. Le versement se défait entièrement.
import { describe, expect, it } from 'vitest'
import { buildPortfolioMarkdown, boundaryDate, hasPortfolioToExport } from './portfolio-md.js'
import { reflectionIsoDay, versedDialogueMarkdown } from './dialogue.js'
import { addReflection, removeReflection, setReflectionVersed } from './ops.js'
import { importFiles } from './import.js'
import { importPortfolioText } from './importers/portfolio.js'
import { createDataset } from './model.js'
import { createCartoStore, createMemoryAdapter } from './store.js'
import { LOU_PORTFOLIO, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'

const NOW = '2026-10-14T10:00:00.000Z'
// Midi UTC : la même journée dans tous les fuseaux de UTC−11 à UTC+11.
const HELD_23 = '2025-12-23T12:00:00.000Z'
const HELD_TODAY = '2026-10-14T12:00:00.000Z'

const citation = {
  threadId: 'citation:2025-12-22:1.01',
  kind: 'citation',
  question: 'Le 22 décembre 2025, vous écrivez ce passage, où l’analyse lit « Vérifier » (1.01). Qu’est-ce qui se jouait pour vous ce jour-là ?',
  quote: 'J’ai vérifié deux sources contradictoires avant de conclure',
  answer: 'Je doutais de la date du chantier.\nJ’ai préféré vérifier.',
  refs: { dates: ['2025-12-22'], codes: ['1.01'] },
  relaunch: { text: 'Qu’est-ce qui vous a fait douter ?', model: 'Ollama — llama3.1' },
}
const silence = { threadId: 'silence:a:b', kind: 'silence', question: 'Que s’est-il passé pendant ce temps ?', quote: null, answer: '', refs: { dates: [], codes: [] } }

async function louStore() {
  const files = [{ path: 'lou.md', text: LOU_PORTFOLIO }]
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  const res = await importFiles(files, createDataset({ datasetId: 'ds-lou', title: 'Lou', referential: miniReferential(), now: NOW }), { now: NOW })
  await store.commit(res)
  return { store, dataset: res.dataset }
}

/** Garde deux dialogues (tenus le 23 décembre et aujourd'hui) et verse ceux demandés. */
async function withDialogues(verse = []) {
  const { store, dataset } = await louStore()
  let ds = addReflection(dataset, { entries: [citation, silence] }, { now: HELD_23 })
  ds = addReflection(ds, { entries: [{ ...silence, answer: 'Une longue pause, puis la reprise.' }] }, { now: HELD_TODAY })
  const [r23, rToday] = ds.reflections
  for (const r of verse.map((k) => (k === '23' ? r23 : rToday))) ds = setReflectionVersed(ds, r.id, true, { now: NOW })
  await store.saveDataset(ds)
  return { store, ds, r23, rToday }
}

describe('verser un dialogue au portfolio', () => {
  it('verser, retirer : un drapeau sur le dialogue, rien n’est recopié', async () => {
    const { ds, r23 } = await withDialogues()
    const versed = setReflectionVersed(ds, r23.id, true, { now: NOW })
    expect(versed.reflections.find((r) => r.id === r23.id).versedAt).toBe(NOW)
    expect(setReflectionVersed(versed, r23.id, true, { now: '2027-01-01T00:00:00.000Z' })).toBe(versed) // déjà versé : rien ne change
    expect(setReflectionVersed(versed, 'inconnu', true, { now: NOW })).toBe(versed)
    const back = setReflectionVersed(versed, r23.id, false, { now: NOW })
    expect(back.reflections.find((r) => r.id === r23.id)).toEqual(r23)
    // Retirer le dialogue du carnet le retire aussi du portfolio.
    expect(removeReflection(versed, r23.id, { now: NOW }).reflections.some((r) => r.versedAt)).toBe(false)
  })

  it('le dialogue versé, en Markdown : questions répondues seulement, passage daté et attribué, relance attribuée au modèle', () => {
    const md = versedDialogueMarkdown({ at: HELD_23, entries: [citation, silence] })
    expect(md.startsWith('### Dialogue d’accompagnement du 23 décembre 2025\n')).toBe(true)
    expect(md).toContain('*Questions tirées de la cartographie ; les réponses sont de l’auteur du portfolio.*')
    expect(md).toContain(`**Question.** ${citation.question}`)
    expect(md).toContain('> Passage du 22 décembre 2025 cité par le dialogue : « J’ai vérifié deux sources contradictoires avant de conclure »')
    expect(md).toContain('**Réponse.** Je doutais de la date du chantier.\nJ’ai préféré vérifier.')
    expect(md).toContain('> Relance proposée par un modèle de langage (Ollama — llama3.1) : Qu’est-ce qui vous a fait douter ?')
    expect(md).not.toContain('Que s’est-il passé') // sans réponse : absent
    // Aucune ligne produite n'ouvre une journée.
    for (const line of md.split('\n')) if (line.trim()) expect(boundaryDate(line)).toBeUndefined()
    expect(versedDialogueMarkdown({ at: HELD_23, entries: [silence] })).toBe('')
    expect(reflectionIsoDay(HELD_23)).toBe('2025-12-23')
    expect(reflectionIsoDay('pas une date')).toBe(null)
  })

  it('le portfolio exporté : chaque journée dans l’ordre, le dialogue dans la sienne ; redécoupé, il redonne les mêmes journées', async () => {
    const { store } = await withDialogues(['23', 'today'])
    const exported = await store.exportAll('ds-lou')
    const out = buildPortfolioMarkdown(exported)
    expect(out).toMatchObject({ days: 4, dialogues: 2, undated: 0 })

    const back = importPortfolioText(out.text, { fileName: 'portfolio.md' })
    expect(back.undated).toEqual([])
    expect(back.segments.map((s) => s.date)).toEqual(['2025-12-22', '2025-12-23', '2025-12-24', '2026-10-14'])
    const byDate = Object.fromEntries(back.segments.map((s) => [s.date, s.text]))
    // Le texte de chaque journée, tel quel.
    for (const s of back.segments.slice(0, 3)) expect(s.text).toContain(exported.details[s.date].portfolio.text.trim())
    // Le dialogue du 23 décembre, après le texte de ce jour ; celui d'aujourd'hui ouvre sa journée.
    expect(byDate['2025-12-23'].indexOf('### Dialogue d’accompagnement du 23 décembre 2025')).toBeGreaterThan(byDate['2025-12-23'].indexOf('La maquette a cédé'))
    expect(byDate['2025-12-23']).toContain('**Réponse.** Je doutais de la date du chantier.')
    expect(byDate['2026-10-14']).toMatch(/^## 2026-10-14\n\n### Dialogue d’accompagnement du 14 octobre 2026/)
    expect(byDate['2026-10-14']).toContain('**Réponse.** Une longue pause, puis la reprise.')
    expect(byDate['2025-12-22']).not.toContain('Dialogue')
  })

  it('un dialogue gardé mais non versé n’y est pas ; retiré du portfolio, il en sort', async () => {
    const { store, ds, r23 } = await withDialogues(['23'])
    let out = buildPortfolioMarkdown(await store.exportAll('ds-lou'))
    expect(out.dialogues).toBe(1)
    expect(out.text).not.toContain('Une longue pause') // le dialogue d'aujourd'hui n'est pas versé
    expect(out.text).not.toContain('## 2026-10-14')
    await store.saveDataset(setReflectionVersed(ds, r23.id, false, { now: NOW }))
    out = buildPortfolioMarkdown(await store.exportAll('ds-lou'))
    expect(out).toMatchObject({ days: 3, dialogues: 0 })
    expect(out.text).not.toContain('Dialogue d’accompagnement')
  })

  it('une réponse avec une date seule sur sa ligne ou un séparateur ne coupe pas la journée', () => {
    const answer = 'Je relis ma journée.\nLe 5 janvier 2026\n---\n## 2026-01-06\nFin de ma réponse.'
    const exported = {
      dataset: { reflections: [{ id: 'rf', at: HELD_TODAY, versedAt: NOW, entries: [{ ...silence, answer }] }], portfolio: null },
      details: {},
    }
    const out = buildPortfolioMarkdown(exported)
    const back = importPortfolioText(out.text)
    expect(back.segments.map((s) => s.date)).toEqual(['2026-10-14'])
    expect(back.undated).toEqual([])
    expect(out.text).toContain('— Le 5 janvier 2026\n— ---\n— ## 2026-01-06\nFin de ma réponse.')
  })

  it('une journée qui ne s’ouvre pas sur son en-tête le reçoit ; un passage sans date reste sans date, à la fin', () => {
    const exported = {
      dataset: { reflections: [], portfolio: { undated: [{ title: null, text: 'Un passage jamais daté.' }] } },
      details: {
        '2026-01-06': { portfolio: { text: '# Mon journal\n\n## 2026-01-06\n\nSecond jour.\n' } },
        '2026-01-05': { portfolio: { text: 'Rattaché à la main, sans en-tête.\n\n05/01/2026\n\nSuite du même jour.' } },
      },
    }
    const out = buildPortfolioMarkdown(exported)
    expect(out).toMatchObject({ days: 2, dialogues: 0, undated: 1 })
    const back = importPortfolioText(out.text)
    expect(back.segments.map((s) => s.date)).toEqual(['2026-01-05', '2026-01-06'])
    expect(back.segments[0].text).toContain('Rattaché à la main, sans en-tête.')
    expect(back.segments[0].text).toContain('Suite du même jour.')
    expect(back.segments[1].text).toContain('# Mon journal') // le titre du document reste avec sa journée
    expect(back.undated).toHaveLength(1)
    expect(back.undated[0].text).toContain('Un passage jamais daté.')
  })

  it('rien à exporter sans texte ni dialogue versé', async () => {
    const empty = createDataset({ datasetId: 'vide', referential: miniReferential(), now: NOW })
    expect(hasPortfolioToExport(empty)).toBe(false)
    expect(buildPortfolioMarkdown({ dataset: empty, details: {} })).toEqual({ text: '', days: 0, dialogues: 0, undated: 0 })
    const kept = addReflection(empty, { entries: [{ ...silence, answer: 'Oui.' }] }, { now: HELD_TODAY })
    expect(hasPortfolioToExport(kept)).toBe(false) // gardé, pas versé
    expect(hasPortfolioToExport(setReflectionVersed(kept, kept.reflections[0].id, true, { now: NOW }))).toBe(true)
    const { dataset } = await louStore()
    expect(hasPortfolioToExport(dataset)).toBe(true)
  })
})
