// P5 — copie autonome (spec §11, point 2) : l'archive insérée dans le modèle
// HTML se relit telle quelle, sans « </script> » ni séparateur de ligne brut,
// et remplit un magasin en mémoire.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DATA_SLOT, injectArchive, scriptSafeJson } from '../core/standalone.js'
import { buildArchive } from '../core/archive.js'
import { importFiles } from '../core/import.js'
import { createDataset } from '../core/model.js'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { readEmbeddedArchive, storeFromArchive } from './embedded.js'
import { LOU_PORTFOLIO, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'

const NOW = '2026-10-13T12:00:00.000Z'
const TEMPLATE = `<!doctype html><html><head><title>t</title></head><body><div id="root"></div>${DATA_SLOT}<script>/* bundle $& $' */</script></body></html>`

async function louExport() {
  const files = [{ path: 'lou.md', text: LOU_PORTFOLIO }]
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  await store.commit(await importFiles(files, createDataset({ datasetId: 'ds', title: 'Lou', referential: miniReferential(), now: NOW }), { now: NOW }))
  return store.exportAll('ds')
}

describe('copie autonome', () => {
  it('l’archive insérée se relit à l’identique, même avec « </script> », « $& » et U+2028 dans le texte', async () => {
    const exported = await louExport()
    exported.details['2025-12-22'].portfolio.text += '\nUn piège : </script><script>alert(1)</script> $& $\x60 fin\u2028ligne'
    const archive = JSON.parse(JSON.stringify(buildArchive(exported, { now: NOW })))
    const html = injectArchive(TEMPLATE, archive)
    expect(html).not.toMatch(/<\/script><script>alert/)
    expect(html).not.toContain('\u2028')
    expect(html).toContain('/* bundle $& $\' */')
    expect(html.match(/id="carto-data"/g)).toHaveLength(1)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.querySelectorAll('script')).toHaveLength(2)
    expect(readEmbeddedArchive(doc)).toEqual(archive)
  })

  it('modèle invalide : erreur explicite ; données absentes ou illisibles : null', () => {
    expect(() => injectArchive('<html></html>', {})).toThrow(/modèle/)
    const empty = new DOMParser().parseFromString(`<html><body>${DATA_SLOT}</body></html>`, 'text/html')
    expect(readEmbeddedArchive(empty)).toBeNull()
    const broken = new DOMParser().parseFromString('<html><body><script type="application/json" id="carto-data">{oups</script></body></html>', 'text/html')
    expect(readEmbeddedArchive(broken)).toBeNull()
    expect(scriptSafeJson({ a: '</b>' })).toBe('{"a":"\\u003c/b>"}')
  })

  it('le magasin en mémoire contient le jeu, les détails par journée et les détails de run', async () => {
    const exported = await louExport()
    const archive = JSON.parse(JSON.stringify(buildArchive(exported, { now: NOW })))
    const store = await storeFromArchive(archive)
    const [summary] = await store.listDatasets()
    expect(summary).toMatchObject({ datasetId: 'ds', title: 'Lou', dayCount: 3 })
    const back = await store.exportAll('ds')
    expect(back.details).toEqual(exported.details)
    expect(back.runDetails).toEqual(exported.runDetails)
    expect(back.dataset).not.toHaveProperty('details')
    expect(back.dataset).not.toHaveProperty('exportedAt')
  })

  it('le modèle construit (npm run build:viewer), s’il existe, a un seul emplacement de données et aucun module', () => {
    const path = join(process.cwd(), 'public', 'carto', 'viewer-template.html')
    if (!existsSync(path)) return
    const html = readFileSync(path, 'utf8')
    expect(html.split(DATA_SLOT)).toHaveLength(2)
    expect(html).not.toMatch(/<script[^>]*type="module"/)
    expect(html).not.toMatch(/<script[^>]*\ssrc=|<link[^>]*stylesheet/)
  })
})
