#!/usr/bin/env node
// FERME LA BOUCLE source-unique côté Twin6 : re-synchronise le corpus committé
// scripts/data/fiches-v7.json DEPUIS LA BASE (GET /api/admin/dump-fiches), après
// qu'un épistémiarque a édité une competence.fiche dans l'atelier. À lancer
// AVANT le build Twin6 (web prebuild) pour que Twin6 reflète l'édition ; Twin9,
// lui, se re-synchronise via POST /api/admin/generate-fiches.
//
// Twin9 dérive de la base en direct (endpoint) ; Twin6 dérive du corpus au
// build — ce script est le pont DB→corpus qui les garde alignés.
//
// Usage : SITE_URL=https://humanome.xyz MIGRATE_TOKEN=… node scripts/dump-fiches.mjs
//         (par défaut SITE_URL=http://localhost:8080 pour le dev)
import { readFileSync, writeFileSync } from 'node:fs'
import { env } from 'node:process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = `${repoRoot}/scripts/data/fiches-v7.json`

function loadDeployEnv() {
  try {
    const raw = readFileSync(`${repoRoot}/.env.deploy`, 'utf8')
    const out = {}
    for (const line of raw.split(/\r?\n/)) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
      if (m) out[m[1]] = m[2]
    }
    return out
  } catch {
    return {}
  }
}

const deploy = loadDeployEnv()
const base = env.SITE_URL ?? deploy.SITE_URL ?? 'http://localhost:8080'
const token = env.MIGRATE_TOKEN ?? deploy.MIGRATE_TOKEN ?? 'dev_migrate_token'

const res = await fetch(`${base}/api/admin/dump-fiches`, { headers: { 'X-Migrate-Token': token } })
if (!res.ok) {
  console.error(`dump-fiches: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  process.exit(1)
}
const corpus = await res.json()
if (!corpus.poleHeaders || !corpus.fiches) {
  console.error('dump-fiches: réponse inattendue (poleHeaders/fiches manquants)')
  process.exit(1)
}

// _comment IDENTIQUE à extract-fiches.mjs : le corpus est byte-stable quelle que
// soit sa provenance (extract des P*.md OU dump de la BASE).
const _comment =
  'Fiches de scan par compétence + en-têtes de pôle, extraites des P*.md (Twin6 public = tagger Twin9) via le parsePole du moteur. SOURCE UNIQUE : injecté dans competence.content.fiche par le seed ; generate-fiches.mjs et FicheGenerator (PHP) reconstruisent P*.md (règle b) + le setting twin9_fiches à l’identique. Parité octet prouvée.'

writeFileSync(out, JSON.stringify({ _comment, poleHeaders: corpus.poleHeaders, fiches: corpus.fiches }, null, 2) + '\n')
console.log(
  `corpus re-synchronisé depuis ${base} : ${Object.keys(corpus.fiches).length} fiches, ` +
    `${Object.keys(corpus.poleHeaders).length} en-têtes → ${out}`,
)
