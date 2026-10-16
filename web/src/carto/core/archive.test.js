// P5 — archive de l'apprenant (spec §11.1) : réimportable SANS PERTE, doublons
// ignorés, rapport d'import ; et conversion d'un master V3 (spec §3.3).
import { describe, expect, it } from 'vitest'
import { archiveFileName, buildArchive, importArchive, looksLikeArchive } from './archive.js'
import { importFiles } from './import.js'
import { createDataset, observationKey } from './model.js'
import { createCartoStore, createMemoryAdapter } from './store.js'
import { addMarker, addReflection, addTag, chooseVariant, discardUndatedSegment, saveSet, setActive, setComparisonNote, setPreferences, setReflectionVersed, setReview } from './ops.js'
import { importV3Master, looksLikeV3Master } from './importers/v3-master.js'
import { importJourDocuments } from '../../v3/core/import.js'
import { reviewEvidenceLink } from '../../v3/core/master.js'
import { normalizeReferential as normalizeV3Referential } from '../../v3/core/referentiel.js'
import { LOU_PORTFOLIO, cartoPole, kairosDoc, louCoreRun, louDays, miniReferential } from '../test/fixtures.js'

const NOW = '2026-10-13T12:00:00.000Z'
const LATER = '2026-10-14T09:00:00.000Z'

function louFiles() {
  const files = [{ path: 'lou.md', text: LOU_PORTFOLIO }]
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  return files
}
const empty = (id = 'ds-new') => createDataset({ datasetId: id, title: 'Nouveau', referential: miniReferential(), now: NOW })

/** Un jeu riche : portfolio, deux variantes arbitrées, seconde lecture, cases, étiquettes, ensemble, réponse, repère, note, préférences. */
async function richStore() {
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  let res = await importFiles(louFiles(), createDataset({ datasetId: 'ds-lou', title: 'Lou', referential: miniReferential(), now: NOW }), { now: NOW })
  await store.commit(res)
  // Un run AuroraCore sur tout le journal : seconde lecture (D-68).
  res = await importFiles(louCoreRun(), res.dataset, { now: NOW })
  await store.commit(res)
  // Une seconde analyse du 23 décembre : variante concurrente, puis arbitrée.
  const other = cartoPole(2, [{ code: '2.02', statut: 'présence établie', confiance: 0.6, traces: [{ role: 'indice corroboratif', extrait: 'puis j’ai reformulé ce que j’avais compris' }] }], { date: '2025-12-23' })
  res = await importFiles([{ path: 'run2/2025-12-23/carto_P2.json', text: JSON.stringify(other) }], res.dataset, { now: NOW })
  await store.commit(res)
  let ds = res.dataset
  const d23 = ds.days.find((d) => d.date === '2025-12-23')
  ds = chooseVariant(ds, '2025-12-23', d23.variants[1].id, { now: NOW })
  ds = setActive(ds, ['2025-12-24'], false, { now: NOW })
  ds = addTag(ds, ['2025-12-22', '2025-12-23'], 'projet pont', { now: NOW })
  ds = saveSet(ds, { name: 'Pont', definition: { kind: 'tags', tags: ['projet pont'] }, freeze: true, id: 'set-pont' }, { now: NOW })
  const vid22 = ds.days.find((d) => d.date === '2025-12-22').activeVariantId
  ds = setReview(ds, observationKey('2025-12-22', vid22, '1.01'), 'nuanced', 'Pas seulement deux sources.', { now: NOW })
  ds = addMarker(ds, { date: '2025-12-23', label: 'Premier pont', kind: 'repere' }, { now: NOW })
  ds = setComparisonNote(ds, { a: 'A', b: 'B', note: 'Ma lecture.' }, { now: NOW })
  ds = setPreferences(ds, { calendarMode: 'free', reinforced: true }, { now: NOW })
  ds = addReflection(
    ds,
    { entries: [{ threadId: 'citation:2025-12-22:1.01', kind: 'citation', question: 'Qu’est-ce qui se jouait pour vous ce jour-là ?', quote: 'deux sources contradictoires', answer: 'Je doutais de la date du chantier.', refs: { dates: ['2025-12-22'], codes: ['1.01'] } }] },
    { now: NOW },
  )
  await store.saveDataset(ds)
  return store
}

const stable = (ds) => ({
  days: ds.days.map((d) => ({ date: d.date, active: d.active, tags: d.tags, variantChoice: d.variantChoice, activeVariantId: d.activeVariantId, variants: d.variants.map((v) => v.id), portfolio: d.portfolio })),
  sets: ds.sets,
  reviews: ds.reviews,
  markers: ds.markers,
  comparisons: ds.comparisons,
  reflections: ds.reflections,
  readings: ds.readings,
  narratives: ds.narratives,
  metrics: ds.metrics,
  preferences: ds.preferences,
  title: ds.title,
  referential: ds.referential,
})

describe('archive : sans perte', () => {
  it('export puis réimport dans un jeu vide : journées, variantes, détails, état de l’apprenant identiques', async () => {
    const store = await richStore()
    const exported = await store.exportAll('ds-lou')
    const archive = JSON.parse(JSON.stringify(buildArchive(exported, { now: LATER })))
    expect(looksLikeArchive(archive)).toBe(true)
    expect(archive).toMatchObject({ kind: 'competency-map-master', schemaVersion: '4.0.0', exportedAt: LATER, includesPortfolio: true })

    const res = await importFiles([{ path: archiveFileName('archive', LATER), text: JSON.stringify(archive) }], empty(), { now: LATER })
    expect(res.report.filter((r) => r.severity === 'blocking')).toEqual([])
    expect(stable(res.dataset)).toEqual(stable(exported.dataset))
    // Détails par journée (verdicts, jury, extraits, portfolio) et détails de run.
    const target = createCartoStore({ adapter: createMemoryAdapter() })
    await target.commit(res)
    const back = await target.exportAll('ds-new')
    expect(back.details).toEqual(exported.details)
    expect(back.runDetails).toEqual(exported.runDetails)
    // La seconde lecture et ses délibérations font l'aller-retour (D-68).
    expect(res.dataset.readings.map((r) => r.id)).toEqual(['LOU@2026-04-25'])
    expect(Object.keys(back.runDetails)).toEqual(expect.arrayContaining(['LOU@2026-04-25|1.01', 'LOU@2026-04-25|pole:1']))
  })

  it('réimporter la même archive : tout est doublon, rien ne change', async () => {
    const store = await richStore()
    const exported = await store.exportAll('ds-lou')
    const text = JSON.stringify(buildArchive(exported, { now: LATER }))
    const res = await importFiles([{ path: 'a.json', text }], exported.dataset, { now: LATER })
    expect(res.counts.variantsAdded).toBe(0)
    expect(res.counts.duplicates).toBe(exported.dataset.days.reduce((n, d) => n + d.variants.length, 0))
    expect(res.counts.daysAdded).toBe(0)
    expect(stable(res.dataset)).toEqual(stable(exported.dataset))
    expect(res.report.filter((r) => r.code === 'referentiel-candidat')).toEqual([])
  })

  it('dialogues versés au portfolio (question 20) : le versement fait l’aller-retour ; « versed » n’emporte qu’eux', async () => {
    const store = await richStore()
    let ds = (await store.exportAll('ds-lou')).dataset
    ds = addReflection(ds, { entries: [{ threadId: 't', kind: 'silence', question: 'Et ensuite ?', answer: 'Une pause.' }] }, { now: LATER })
    const [kept, versed] = ds.reflections.map((r) => r.id)
    ds = setReflectionVersed(ds, versed, true, { now: LATER })
    await store.saveDataset(ds)
    const exported = await store.exportAll('ds-lou')

    const full = JSON.parse(JSON.stringify(buildArchive(exported, { now: LATER })))
    expect(full.reflections.map((r) => [r.id, r.versedAt ?? null])).toEqual([
      [kept, null],
      [versed, LATER],
    ])
    // Ce qu'emporte une copie autonome avec portfolio : les seuls dialogues versés.
    const onlyVersed = buildArchive(exported, { includeReflections: 'versed', now: LATER })
    expect(onlyVersed.reflections.map((r) => r.id)).toEqual([versed])
    expect(JSON.stringify(onlyVersed)).not.toContain('Je doutais')

    const res = await importFiles([{ path: 'a.json', text: JSON.stringify(full) }], empty(), { now: LATER })
    expect(res.dataset.reflections.find((r) => r.id === versed).versedAt).toBe(LATER)
    expect(res.dataset.reflections.find((r) => r.id === kept)).not.toHaveProperty('versedAt')
  })

  it('réimporter une archive dans le jeu, modifié depuis : son texte et ses passages sans date gagnent, rien n’est doublé', async () => {
    const store = await richStore()
    // Un passage sans date dans le jeu, puis l'archive.
    let res = await importFiles([{ path: 'vacances.md', text: 'Un passage écrit pendant les vacances.\n' }], (await store.exportAll('ds-lou')).dataset, { now: NOW })
    await store.commit(res)
    const archive = JSON.stringify(buildArchive(await store.exportAll('ds-lou'), { now: LATER }))
    // Depuis : le texte du 22 corrigé, le passage sans date écarté.
    let ds = discardUndatedSegment((await store.exportAll('ds-lou')).dataset, 0, { now: LATER })
    const fixed = 'Ce matin j’ai relu mes notes (corrigé).'
    ds = { ...ds, days: ds.days.map((d) => (d.date === '2025-12-22' ? { ...d, portfolio: { chars: fixed.length, words: 7 } } : d)) }
    await store.commit({ dataset: ds, detailPatches: new Map([['2025-12-22', { portfolio: { title: null, text: fixed, source: 'lou.md' } }]]) })

    res = await importFiles([{ path: 'a.json', text: archive }], ds, { now: LATER })
    await store.commit(res)
    const back = await store.exportAll('ds-lou')
    expect(back.details['2025-12-22'].portfolio.text).toBe(fixed)
    expect(back.dataset.portfolio.undated).toEqual([])
    expect(res.counts.portfolioDays).toBe(0)
    expect(res.report.map((r) => r.code)).toEqual(expect.arrayContaining(['portfolio-conserve', 'sans-date-conserves']))
    expect(res.report.map((r) => r.code)).not.toContain('portfolio-remplace')
    // Le même fichier de portfolio importé deux fois : ses passages sans date ne sont pas doublés.
    const twice = await importFiles([{ path: 'b.md', text: 'Encore un passage sans date.\n' }], back.dataset, { now: LATER })
    const again = await importFiles([{ path: 'b.md', text: 'Encore un passage sans date.\n' }], twice.dataset, { now: LATER })
    expect(again.dataset.portfolio.undated.map((u) => u.text.trim())).toEqual(['Encore un passage sans date.'])
  })

  it('un état illisible dans l’archive (réponse, repère, ensemble) est écarté et compté, jamais recopié', async () => {
    const store = await richStore()
    const archive = buildArchive(await store.exportAll('ds-lou'), { now: LATER })
    archive.reviews = { ...archive.reviews, 'x|y|1.01': { state: 'accepted' } }
    archive.markers = [...archive.markers, { id: 'mk-sans-date', label: 'Sans date' }]
    archive.sets = [...archive.sets, { id: 'set-vide' }]
    const res = await importFiles([{ path: 'a.json', text: JSON.stringify(archive) }], empty(), { now: LATER })
    expect(res.dataset.reviews).not.toHaveProperty('x|y|1.01')
    expect(res.dataset.markers.map((m) => m.id)).not.toContain('mk-sans-date')
    expect(res.dataset.sets.map((x) => x.id)).not.toContain('set-vide')
    expect(res.report.find((r) => r.code === 'etat-illisible').message).toMatch(/^3 élément\(s\) illisible\(s\)/)
  })

  it('sans le portfolio : le texte part, les volumes par jour restent', async () => {
    const store = await richStore()
    const exported = await store.exportAll('ds-lou')
    const archive = buildArchive(exported, { includePortfolio: false, now: LATER })
    expect(Object.values(archive.details).every((d) => d.portfolio === null)).toBe(true)
    // Le texte intégral part ; seuls restent les extraits cités par le jury.
    expect(JSON.stringify(archive)).not.toMatch(/Ce matin j’ai relu mes notes avant d’écrire/)
    // Le carnet du dialogue (P7) suit le même choix que le journal.
    expect(archive.reflections).toEqual([])
    expect(JSON.stringify(archive)).not.toContain('Je doutais')
    const res = await importFiles([{ path: 'a.json', text: JSON.stringify(archive) }], empty(), { now: LATER })
    expect(res.dataset.days.find((d) => d.date === '2025-12-22').portfolio).toEqual(exported.dataset.days.find((d) => d.date === '2025-12-22').portfolio)
    expect(res.report.map((r) => r.code)).toContain('archive-sans-portfolio')
  })

  it('nom de fichier cartographie-<type>-<date>.json', () => {
    expect(archiveFileName('archive', LATER)).toBe('cartographie-archive-2026-10-14.json')
    expect(archiveFileName('Démo anonymisée', LATER)).toBe('cartographie-demo-anonymisee-2026-10-14.json')
    expect(archiveFileName('copie', LATER, 'html')).toBe('cartographie-copie-2026-10-14.html')
    expect(importArchive({ kind: 'competency-map-master', schemaVersion: '4.0.0', days: [] }).variants).toEqual([])
  })
})

describe('master V3 → modèle par journée', () => {
  it('mêmes verdicts, mêmes traces et extraits que l’import direct ; droit de réponse repris', async () => {
    const ref = normalizeV3Referential(miniReferential())
    const entries = Object.entries(louDays()).map(([date, poles]) => ({ run: 'site', sourceDate: date, payload: { date, poles, kairos: kairosDoc(date) } }))
    let { master } = importJourDocuments(entries, { referential: ref, datasetId: '7f1c2a9e-3b4d-4e5f-8a6b-1c2d3e4f5a6b', now: NOW })
    const link = master.evidenceLinks.find((l) => master.observations.find((o) => o.id === l.observationId)?.rawCode === '2.01')
    master = reviewEvidenceLink(master, link.id, 'confirmed', { note: 'Oui, je me souviens.', now: NOW })
    expect(looksLikeV3Master(master)).toBe(true)

    const viaV3 = await importFiles([{ path: 'master-v3.json', text: JSON.stringify(master) }], empty(), { now: NOW })
    const direct = await importFiles(louFiles().slice(1), empty('ds-direct'), { now: NOW })
    const shape = (res) =>
      res.dataset.days.map((d) => {
        const v = d.variants.find((x) => x.id === d.activeVariantId)
        const detail = res.detailPatches.get(d.date).variants[v.id]
        return {
          date: d.date,
          verdicts: v.verdicts.map((x) => ({
            code: x.code,
            status: x.status,
            confidence: x.confidence,
            courtCircuit: x.courtCircuit,
            roles: x.traces.map((t) => t.role),
            extracts: x.traces.map((t) => detail.verdicts[x.code].traces[t.id].extract),
            motif: detail.verdicts[x.code].motif,
          })),
        }
      })
    expect(shape(viaV3)).toEqual(shape(direct))
    const d23 = viaV3.dataset.days.find((d) => d.date === '2025-12-23')
    expect(viaV3.dataset.reviews[observationKey('2025-12-23', d23.activeVariantId, '2.01')]).toMatchObject({ state: 'confirmed', note: 'Oui, je me souviens.' })
    expect(viaV3.report.map((r) => r.code)).toContain('master-v3')
  })

  it('une journée V3 sans variante choisie reste à arbitrer', () => {
    const master = {
      kind: 'competency-map-master',
      schemaVersion: '3.0.0',
      days: [{ id: 'd1', effectiveDate: '2025-12-22', activeVariantId: null, provenance: [{ variantId: 'a' }, { variantId: 'b' }] }],
      sources: { dayVariants: [{ id: 'a', run: 'r1', effectiveDate: '2025-12-22' }, { id: 'b', run: 'r2', effectiveDate: '2025-12-22' }] },
      observations: [
        { id: 'o1', variantId: 'a', dayId: 'd1', rawCode: '1.01', normalizedStatus: 'established', verdictConfidence: 0.7 },
        { id: 'o2', variantId: 'b', dayId: 'd1', rawCode: '1.01', normalizedStatus: 'not_established', verdictConfidence: 0.6 },
      ],
      evidenceLinks: [],
      passages: [],
    }
    const r = importV3Master(master)
    expect(r.variants).toHaveLength(2)
    expect(r.extras.days).toEqual([{ date: '2025-12-22', active: true, tags: [], variantChoice: 'pending', activeVariantId: null, portfolio: null }])
  })
})
