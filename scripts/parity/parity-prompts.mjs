#!/usr/bin/env node
// Parity harness for stage B1 of the engine (docs/plan-portage-moteur.md):
// regenerates the 69 narrative prompts (61 competences + 7 poles + 1 kairos)
// from the ORACLE aggregates (intermediate/carto_merge.json — stage-A output of
// the historical Python pipeline, NOT our own merge: stages are checked
// independently) and diffs them against the real prompt files of
// intermediate/prompts/.
//
// Diff is normalized (CRLF -> LF, trailing whitespace per line, trailing
// newlines at EOF) per the plan's acceptance criterion.
//
// Usage: node scripts/parity/parity-prompts.mjs
// Exit code: 0 when 69/69 identical, 1 otherwise.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildNarrativePrompts } from '../../engine/src/pipeline/narrative-prompts.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MERGE_PATH = path.join(ROOT, 'assets-existants', 'merge-prototype', 'intermediate', 'carto_merge.json')
const PROMPTS_DIR = path.join(ROOT, 'assets-existants', 'merge-prototype', 'intermediate', 'prompts')

const merge = JSON.parse(fs.readFileSync(MERGE_PATH, 'utf8'))
const prompts = buildNarrativePrompts(merge.agrege, { periode: merge.periode })

const oracleFiles = fs.readdirSync(PROMPTS_DIR).filter((f) => f.endsWith('.prompt.md')).sort()
const producedByFilename = new Map(prompts.map((p) => [p.filename, p.content]))

// Normalization: line endings, trailing whitespace per line, trailing newlines.
function normalize(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '')
}

function firstDiffBlock(oracle, produced) {
  const a = oracle.split('\n')
  const b = produced.split('\n')
  let i = 0
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++
  const from = Math.max(0, i - 2)
  const to = i + 3
  const block = []
  block.push(`  première divergence à la ligne ${i + 1} (oracle ${a.length} lignes / produit ${b.length} lignes)`)
  for (let k = from; k < Math.min(to, a.length); k++) block.push(`  oracle  ${k + 1} | ${a[k]}`)
  for (let k = from; k < Math.min(to, b.length); k++) block.push(`  produit ${k + 1} | ${b[k]}`)
  return block.join('\n')
}

let identical = 0
const differing = []
const missing = []

for (const filename of oracleFiles) {
  const produced = producedByFilename.get(filename)
  if (produced === undefined) {
    missing.push(filename)
    continue
  }
  producedByFilename.delete(filename)
  const oracleText = fs.readFileSync(path.join(PROMPTS_DIR, filename), 'utf8')
  if (normalize(oracleText) === normalize(produced)) {
    identical++
  } else {
    differing.push({ filename, block: firstDiffBlock(normalize(oracleText), normalize(produced)) })
  }
}

console.log(`Parité B1 (prompts narratifs) — oracle : ${path.relative(ROOT, PROMPTS_DIR)}`)
console.log(`${identical} identiques / ${differing.length} différents (sur ${oracleFiles.length} fichiers oracle)`)

for (const extra of producedByFilename.keys()) {
  console.log(`PRODUIT SANS ORACLE : ${extra}`)
}
for (const filename of missing) {
  console.log(`ORACLE SANS PRODUIT : ${filename}`)
}
for (const { filename, block } of differing) {
  console.log(`\nDIFF ${filename}`)
  console.log(block)
}

process.exit(differing.length === 0 && missing.length === 0 && producedByFilename.size === 0 ? 0 : 1)
