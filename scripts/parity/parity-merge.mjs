#!/usr/bin/env node
// Harnais de parité Étage A (P5/M4) : mergeDays() vs l'oracle réel
// assets-existants/merge-prototype/intermediate/carto_merge.json.
//
// Compare `agrege` UNIQUEMENT (exclus assumés, docs/plan-portage-moteur.md :
// `version`, `date_construction`, recopie brute `feuilles{}`) ; `periode` est
// aussi comparée (gratuite et déterministe). Comparaison structurelle
// (insensible à l'ordre des clés), stricte sur les valeurs et l'ordre des
// tableaux. Sortie : nombre d'écarts par champ (chemins agrégés) + premiers
// exemples. Code retour 0 si zéro écart.
//
// Usage : node scripts/parity/parity-merge.mjs

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeDays } from '../../engine/src/pipeline/merge.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const JOURS_DIR = join(ROOT, 'web', 'public', 'data', 'demo', 'jours')
const ORACLE_PATH = join(ROOT, 'assets-existants', 'merge-prototype', 'intermediate', 'carto_merge.json')
const REFERENTIEL_PATH = join(ROOT, 'web', 'public', 'data', 'referentiel', 'respire-v7.json')

const MAX_EXAMPLES_PER_FIELD = 3

const dayFiles = readdirSync(JOURS_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
const dayDocs = dayFiles.map(f => JSON.parse(readFileSync(join(JOURS_DIR, f), 'utf8')))
const referentiel = JSON.parse(readFileSync(REFERENTIEL_PATH, 'utf8'))
const oracle = JSON.parse(readFileSync(ORACLE_PATH, 'utf8'))

console.log(`Journées chargées : ${dayDocs.length} ; oracle : ${oracle.periode.nb_feuilles} feuilles (${oracle.version})`)

const t0 = performance.now()
const result = mergeDays(dayDocs, referentiel)
console.log(`mergeDays exécuté en ${(performance.now() - t0).toFixed(0)} ms`)

// --- deep diff --------------------------------------------------------------
const diffs = [] // { path, kind, expected, actual }

function record (path, kind, expected, actual) {
  diffs.push({ path, kind, expected, actual })
}

function diff (expected, actual, path) {
  if (expected === actual) return
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Number.isNaN(expected) && Number.isNaN(actual)) return
    record(path, 'value', expected, actual)
    return
  }
  if (expected === null || actual === null || typeof expected !== typeof actual) {
    record(path, 'type', expected, actual)
    return
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      record(path, 'type', expected, actual)
      return
    }
    if (expected.length !== actual.length) {
      record(path + '.length', 'length', expected.length, actual.length)
    }
    const n = Math.min(expected.length, actual.length)
    for (let i = 0; i < n; i++) diff(expected[i], actual[i], `${path}[${i}]`)
    return
  }
  if (typeof expected === 'object') {
    const ek = Object.keys(expected)
    const ak = new Set(Object.keys(actual))
    for (const k of ek) {
      if (!ak.has(k)) { record(`${path}.${k}`, 'missing-key', expected[k], undefined); continue }
      ak.delete(k)
      diff(expected[k], actual[k], `${path}.${k}`)
    }
    for (const k of ak) record(`${path}.${k}`, 'extra-key', undefined, actual[k])
    return
  }
  record(path, 'value', expected, actual)
}

diff(oracle.periode, result.periode, 'periode')
diff(oracle.agrege, result.agrege, 'agrege')

// --- report -----------------------------------------------------------------
// Agrège les chemins en remplaçant indices et codes par des jokers.
function fieldOf (path) {
  return path
    .replace(/\[\d+\]/g, '[*]')
    .replace(/\.par_competence\.\d\.\d\d/g, '.par_competence.<code>')
    .replace(/\.par_pole\.\d/g, '.par_pole.<n>')
}

if (diffs.length === 0) {
  console.log('\nPARITÉ 100 % — 0 écart sur periode + agrege (par_competence ×61, par_pole ×7, global, ipsatif).')
  process.exit(0)
}

const byField = new Map()
for (const d of diffs) {
  const f = fieldOf(d.path)
  if (!byField.has(f)) byField.set(f, [])
  byField.get(f).push(d)
}
console.log(`\nÉCARTS : ${diffs.length} au total, ${byField.size} champ(s)\n`)
const show = v => {
  const s = JSON.stringify(v)
  return s === undefined ? String(v) : (s.length > 160 ? s.slice(0, 160) + '…' : s)
}
for (const [field, list] of [...byField.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${String(list.length).padStart(6)}  ${field}`)
  for (const ex of list.slice(0, MAX_EXAMPLES_PER_FIELD)) {
    console.log(`          ${ex.path} [${ex.kind}] oracle=${show(ex.expected)} moteur=${show(ex.actual)}`)
  }
}
process.exit(1)
