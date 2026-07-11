#!/usr/bin/env node
// Converts a legacy carto-data.js (10 top-level consts consumed by the vanilla
// cartographie.html) into ONE normalized "cartographie-merge" JSON document
// (schemas/cartographie-merge.schema.json). Field names are kept as-is: they
// are the real data contract (docs/contrats.md).
//
// Usage: node scripts/convert/carto-data-to-merge-json.mjs [input.js] [output.json]
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCartoDataFile } from './lib/carto-data-parser.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const input = resolve(
  process.argv[2] ?? `${repoRoot}/assets-existants/merge-prototype/carto-data.js`,
)
const output = resolve(process.argv[3] ?? `${repoRoot}/web/public/data/demo/merge.json`)

export function toMergeDocument(consts) {
  const required = ['domainsData', 'profilMeta', 'kairosHtml', 'profilIpsatif', 'feuillesData']
  for (const name of required) {
    if (!(name in consts)) throw new Error(`Missing const ${name} in carto-data.js`)
  }

  const meta = consts.profilMeta
  return {
    schemaVersion: '1.0.0',
    kind: 'cartographie-merge',
    generatedAt: meta.date_construction ?? null,
    source: {
      protocole: meta.source_protocole ?? null,
      journalId: meta.journal_id ?? null,
    },
    periode: {
      premiere: meta.premiere_date,
      derniere: meta.derniere_date,
      nbFeuilles: meta.nb_feuilles,
    },
    domains: consts.domainsData,
    profilMeta: meta,
    profilIpsatif: consts.profilIpsatif,
    feuilles: consts.feuillesData,
    narratifs: {
      kairosHtml: consts.kairosHtml,
      // rapportHtml is an alias of kairosHtml in the known corpus; kept as a
      // distinct field because cartographie.html reads both.
      rapportHtml: consts.rapportHtml ?? consts.kairosHtml,
    },
    reserved: {
      connexionsData: consts.connexionsData ?? [],
      noeudsConceptuels: consts.noeudsConceptuels ?? [],
      patternTemporel: consts.patternTemporel ?? { pattern: '', description: '' },
      piecesData: consts.piecesData ?? {},
    },
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const doc = toMergeDocument(parseCartoDataFile(input))
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, JSON.stringify(doc))
  const kb = Math.round(Buffer.byteLength(JSON.stringify(doc)) / 1024)
  console.log(
    `merge document: ${doc.domains.length} poles, ${doc.feuilles.length} feuilles, ${kb} Ko -> ${output}`,
  )
}
