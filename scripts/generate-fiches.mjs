#!/usr/bin/env node
// SOURCE UNIQUE (côté build Twin6) : régénère web/public/data/twin6/prompts/P*.md
// DEPUIS le corpus committé scripts/data/fiches-v7.json (inverse de
// extract-fiches.mjs), via la règle byte-exacte (b). Les P*.md sont des
// ARTEFACTS générés (gitignorés) ; la source committée est le corpus. À
// enchaîner avant build-twin6-package.mjs.
//
// Règle (b) : P*.md = header_brut + Σ competence.fiche joint par "\n\n" + "\n".
// Ordre des compétences d'un pôle = codes triés (même ordre que la base).
//
// Usage : node scripts/generate-fiches.mjs        (écrit les P*.md)
//         node scripts/generate-fiches.mjs --verify  (compare sans écrire)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reassembleFiche } from './extract-fiches.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const corpusPath = `${repoRoot}/scripts/data/fiches-v7.json`
const promptsDir = `${repoRoot}/web/public/data/twin6/prompts`
const verify = process.argv.includes('--verify')

const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'))
const poleHeaders = corpus.poleHeaders ?? {}
const fiches = corpus.fiches ?? {}

let mismatches = 0
for (let n = 1; n <= 7; n += 1) {
  const header = poleHeaders[String(n)]
  if (header === undefined) {
    console.error(`En-tête de pôle manquant : ${n}`)
    process.exit(1)
  }
  const codes = Object.keys(fiches)
    .filter((c) => c.startsWith(`${n}.`))
    .sort()
  const competences = codes.map((code) => ({ fiche_md: fiches[code] }))
  const content = reassembleFiche(header, competences)

  const path = `${promptsDir}/P${n}.md`
  if (verify) {
    const current = readFileSync(path, 'utf8')
    if (current !== content) {
      mismatches += 1
      console.error(`P${n}.md DIFFÈRE du corpus (${content.length} o généré ≠ ${current.length} o actuel)`)
    }
  } else {
    writeFileSync(path, content)
  }
}

if (verify) {
  if (mismatches > 0) {
    console.error(`ÉCHEC : ${mismatches} P*.md divergent du corpus.`)
    process.exit(1)
  }
  console.log('parité OK : les 7 P*.md sont byte-identiques au corpus fiches-v7.json.')
} else {
  console.log(`7 P*.md régénérés depuis le corpus (source unique) → ${promptsDir}`)
}
