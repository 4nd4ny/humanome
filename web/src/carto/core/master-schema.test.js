// @vitest-environment node
// Question 10 (décision du 2026-10-14) — le schéma JSON du master v4
// (schemas/competency-map-master.schema.json) : l'archive de l'interface de
// cartographie a désormais un contrat écrit, celui qu'embarque l'archive de
// compte (« Exporter toutes mes données », archive-export 1.1.0).
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateDocument } from '@engine/validation.js'
import { buildArchive } from './archive.js'
import { importFiles } from './import.js'
import { createDataset } from './model.js'
import { createCartoStore, createMemoryAdapter } from './store.js'
import { masterContractArchive } from '../test/master-contract.js'

const fixturePath = fileURLToPath(new URL('../../../../schemas/fixtures/carto/competency-map-master-exemple.json', import.meta.url))
const fixture = () => JSON.parse(readFileSync(fixturePath, 'utf8'))
const check = (doc) => validateDocument('competency-map-master', doc)

describe('schéma du master v4 (archive de l’interface de cartographie)', () => {
  it('la fixture est exactement l’archive produite par l’interface, et elle est conforme', async () => {
    expect(JSON.parse(JSON.stringify(await masterContractArchive()))).toEqual(fixture())
    expect(check(fixture())).toEqual({ valid: true, errors: [] })
  })

  it('archive sans portfolio : conforme (texte et carnet partis)', async () => {
    const doc = fixture()
    for (const d of Object.values(doc.details)) d.portfolio = null
    doc.portfolio.undated = []
    doc.reflections = []
    doc.includesPortfolio = false
    expect(check(doc).valid).toBe(true)
  })

  it('un champ inconnu (version 4.x ultérieure) est accepté ; un master V3 ne relève pas de ce schéma', () => {
    expect(check({ ...fixture(), nouveauChamp: { x: 1 } }).valid).toBe(true)
    expect(check({ ...fixture(), schemaVersion: '4.2.0' }).valid).toBe(true)
    expect(check({ ...fixture(), schemaVersion: '3.1.0' }).valid).toBe(false)
  })

  it('refuse ce qui casserait les calculs ou l’état de l’apprenant, en disant où', () => {
    const cases = [
      ['/kind', (d) => (d.kind = 'cartographie-merge')],
      ['/days/0/date', (d) => (d.days[0].date = '22/12/2025')],
      ['/days/0/variantChoice', (d) => (d.days[0].variantChoice = 'peut-être')],
      ['/days/0/variants/0/verdicts/0/status', (d) => (d.days[0].variants[0].verdicts[0].status = 'présence établie')],
      ['/days/0/variants/0/verdicts/0/confidence', (d) => (d.days[0].variants[0].verdicts[0].confidence = 1.5)],
      ['/days/0/variants/0/verdicts/0/proofs', (d) => (d.days[0].variants[0].verdicts[0].proofs = -1)],
      ['/days/0/variants/0/verdicts/0/traces/0/role', (d) => (d.days[0].variants[0].verdicts[0].traces[0].role = 'proof')],
      ['/details', (d) => (d.details.demain = d.details['2025-12-22'])],
      ['/reviews', (d) => (Object.values(d.reviews)[0].state = 'peut-être')],
      ['/reflections/0/entries/0', (d) => delete d.reflections[0].entries[0].answer],
      ['/referential', (d) => (d.referential.competences = [])],
      ['/', (d) => delete d.days],
    ]
    for (const [where, mutate] of cases) {
      const doc = fixture()
      mutate(doc)
      const r = check(doc)
      expect(r.valid, where).toBe(false)
      expect(r.errors.some((e) => e.path.startsWith(where)), `${where} : ${JSON.stringify(r.errors.slice(0, 3))}`).toBe(true)
    }
  })
})

const root = fileURLToPath(new URL('../../../../assets-existants/merge-prototype/extracted/', import.meta.url))
const referentialPath = fileURLToPath(new URL('../../../../web/public/data/referentiel/respire-v7.json', import.meta.url))

describe.skipIf(!existsSync(root) || !existsSync(referentialPath))('schéma du master v4 : le corpus réel public', () => {
  it('l’archive des 59 journées publiques (Aurora v3, référentiel RESPIRE complet) est conforme', async () => {
    const files = []
    for (const date of readdirSync(root).sort()) for (const name of readdirSync(`${root}${date}`)) files.push({ path: `${date}/${name}`, text: readFileSync(`${root}${date}/${name}`, 'utf8') })
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    const now = '2026-10-14T00:00:00.000Z'
    const referential = JSON.parse(readFileSync(referentialPath, 'utf8'))
    await store.commit(await importFiles(files, createDataset({ datasetId: 'reel', title: 'Corpus réel', referential, now }), { now }))
    const archive = buildArchive(await store.exportAll('reel'), { now })
    expect(archive.days).toHaveLength(59)
    expect(check(archive)).toEqual({ valid: true, errors: [] })
  })
})
