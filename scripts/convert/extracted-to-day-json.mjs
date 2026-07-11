#!/usr/bin/env node
// Converts extracted/<date>/carto_P1..P7.json + kairos.json (raw upstream LLM
// output, one file per pole per day) into ONE "cartographie-jour" JSON document
// per day (schemas/cartographie-jour.schema.json), plus an index.json listing
// all days for lazy loading by the web app.
//
// Usage: node scripts/convert/extracted-to-day-json.mjs [extractedDir] [outputDir]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const extractedDir = resolve(
  process.argv[2] ?? `${repoRoot}/assets-existants/merge-prototype/extracted`,
)
const outputDir = resolve(process.argv[3] ?? `${repoRoot}/web/public/data/demo/jours`)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function toDayDocument(date, files) {
  const poles = []
  for (let n = 1; n <= 7; n++) {
    const pole = files[`carto_P${n}.json`]
    if (!pole) throw new Error(`${date}: missing carto_P${n}.json`)
    poles.push(pole)
  }
  return {
    schemaVersion: '1.0.0',
    kind: 'cartographie-jour',
    date,
    poles,
    kairos: files['kairos.json'] ?? null,
  }
}

export function frenchLabel(isoDate) {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const days = readdirSync(extractedDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && DATE_RE.test(e.name))
    .map((e) => e.name)
    .sort()

  mkdirSync(outputDir, { recursive: true })
  const index = []
  for (const date of days) {
    const dir = `${extractedDir}/${date}`
    const files = {}
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.json')) files[f] = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
    }
    const doc = toDayDocument(date, files)
    writeFileSync(`${outputDir}/${date}.json`, JSON.stringify(doc))
    index.push({ date, iso: date, label: frenchLabel(date), ordre: index.length })
  }
  writeFileSync(`${outputDir}/index.json`, JSON.stringify(index))
  console.log(`${days.length} day documents -> ${outputDir}`)
}
