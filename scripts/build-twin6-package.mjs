#!/usr/bin/env node
// Build the PUBLIC « Cartographie ouverte Twin6 » prompt package from the
// open-source markdown prompts (web/public/data/twin6/prompts/*.md) into a
// single JSON manifest the engine loads (executerTwin6 templates: scanPole,
// kairos, fiches{1..7}). Twin6 is open source (AGPL) — this package is public,
// downloadable, and carries no secret (unlike the confidential Twin9 Golden
// Prompt). Deterministic: same inputs → byte-identical output.
//
// Usage: node scripts/build-twin6-package.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(repoRoot, 'web/public/data/twin6/prompts')
const outPath = join(repoRoot, 'web/public/data/twin6/twin6-ouverte-1.0.0.json')

function read(name) {
  const p = join(srcDir, name)
  if (!existsSync(p)) throw new Error(`prompt manquant : ${p}`)
  return readFileSync(p, 'utf8')
}

const fiches = {}
for (let n = 1; n <= 7; n += 1) fiches[String(n)] = read(`P${n}.md`)

const pkg = {
  schemaVersion: '1.0.0',
  id: 'twin6-ouverte',
  version: '1.0.0',
  nom: 'Cartographie ouverte Twin6',
  description:
    'Cartographie de compétences open source (protocole Aurora one-shot v2) : un ' +
    'scan par pôle RESPIRE (Greffier / Pédagogue adversarial / Rapporteur) puis une ' +
    'synthèse Kairos, sur le portfolio entier. Utilisable avec votre propre clé API ' +
    '(gratuit) ou avec nos crédits (+10 % de contribution au fonctionnement du site).',
  auteur: 'Harmonia Éducation — protocole Aurora (Twin6), open source',
  licence: 'AGPL-3.0-only',
  referentielCompatible: { id: 'respire', versionMin: '7.0.0' },
  modeleCibleDefaut: 'claude-sonnet-5',
  // Contrat moteur (executerTwin6) : gabarits PUBLICS injectés côté client.
  scanPole: read('1-scan-pole.md'),
  kairos: read('2-kairos-final.md'),
  megaPrompt: read('0-mega-prompt.md'),
  fiches,
  metadata: {
    genereLePar: 'scripts/build-twin6-package.mjs',
    moteur: 'humanome-engine@0.1.0 (twin6)',
    nbAppelsParRun: 8,
  },
}

writeFileSync(outPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
const bytes = Buffer.byteLength(JSON.stringify(pkg, null, 2) + '\n', 'utf8')
console.log(`écrit ${outPath} (${bytes} octets)`)
console.log(`  scanPole ${pkg.scanPole.length} car., kairos ${pkg.kairos.length} car., 7 fiches`)
