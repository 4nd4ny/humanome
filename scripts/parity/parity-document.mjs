#!/usr/bin/env node
// Harnais de parité — étage B2 (document merge final).
//
// Reconstruit le document `cartographie-merge` avec
// engine/src/pipeline/merge-document.js à partir de :
//   - l'oracle numérique  assets-existants/merge-prototype/intermediate/carto_merge.json
//   - les narratifs LLM   assets-existants/merge-prototype/llm_outputs/*.md (injectés tels quels)
// et le diffe champ à champ contre le document réel web/public/data/demo/merge.json.
//
// Usage : node scripts/parity/parity-document.mjs [-v]

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildMergeDocument } from '../../engine/src/pipeline/merge-document.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const VERBOSE = process.argv.includes('-v')

const oracle = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'assets-existants/merge-prototype/intermediate/carto_merge.json'), 'utf8'),
)
const real = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/public/data/demo/merge.json'), 'utf8'))

const OUT_DIR = path.join(ROOT, 'assets-existants/merge-prototype/llm_outputs')
const narrativeTexts = { competences: {}, poles: {}, kairos: '' }
for (const f of fs.readdirSync(OUT_DIR)) {
  const md = fs.readFileSync(path.join(OUT_DIR, f), 'utf8')
  let m
  if ((m = /^competence_(\d\.\d\d)\.md$/.exec(f))) narrativeTexts.competences[m[1]] = md
  else if ((m = /^pole_(\d)\.md$/.exec(f))) narrativeTexts.poles[m[1]] = md
  else if (f === 'kairos.md') narrativeTexts.kairos = md
}

const built = buildMergeDocument(oracle, narrativeTexts, {
  journalId: 'merged',
  sourceProtocole: 'Aurora v3 — pédagogue adversarial · merge évolutif v3',
})

// ---------------------------------------------------------------------------

let failures = 0
const report = []
function check(section, ok, detail = '') {
  report.push(`${ok ? 'OK  ' : 'DIFF'}  ${section}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

function firstDiff(a, b) {
  const la = String(a), lb = String(b)
  const n = Math.min(la.length, lb.length)
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) {
      return `@${i}: …${JSON.stringify(la.slice(Math.max(0, i - 60), i + 60))} vs …${JSON.stringify(lb.slice(Math.max(0, i - 60), i + 60))}`
    }
  }
  return `longueurs ${la.length} vs ${lb.length} (préfixe commun)`
}

function deepDiff(a, b, prefix = '') {
  const diffs = []
  const walk = (x, y, p) => {
    if (diffs.length > 20) return
    if (typeof x !== typeof y) { diffs.push(`${p}: types ${typeof x} vs ${typeof y}`); return }
    if (x === null || y === null || typeof x !== 'object') {
      if (!Object.is(x, y)) {
        diffs.push(typeof x === 'string' && typeof y === 'string'
          ? `${p}: ${firstDiff(x, y)}`
          : `${p}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`)
      }
      return
    }
    if (Array.isArray(x) !== Array.isArray(y)) { diffs.push(`${p}: array vs objet`); return }
    const kx = Object.keys(x), ky = Object.keys(y)
    for (const k of new Set([...kx, ...ky])) {
      if (!(k in x)) { diffs.push(`${p}.${k}: absent (construit)`); continue }
      if (!(k in y)) { diffs.push(`${p}.${k}: absent (réel)`); continue }
      walk(x[k], y[k], `${p}.${k}`)
    }
  }
  walk(a, b, prefix)
  return diffs
}

const show = (diffs) => {
  if (VERBOSE || diffs.length) for (const d of diffs.slice(0, 12)) console.log('    ', d)
}

// --- Enveloppe --------------------------------------------------------------
for (const k of ['schemaVersion', 'kind', 'generatedAt']) {
  check(`enveloppe.${k}`, Object.is(built[k], real[k]), `${built[k]} vs ${real[k]}`)
}
check('enveloppe.source', JSON.stringify(built.source) === JSON.stringify(real.source))
check('enveloppe.periode', JSON.stringify(built.periode) === JSON.stringify(real.periode))
check('enveloppe.reserved', JSON.stringify(built.reserved) === JSON.stringify(real.reserved))

// --- profilMeta / profilIpsatif / feuilles ----------------------------------
{
  const d = deepDiff(built.profilMeta, real.profilMeta, 'profilMeta')
  check('profilMeta', d.length === 0, `${d.length} diffs`); show(d)
}
{
  const d = deepDiff(built.profilIpsatif, real.profilIpsatif, 'profilIpsatif')
  check('profilIpsatif', d.length === 0, `${d.length} diffs`); show(d)
}
{
  const d = deepDiff(built.feuilles, real.feuilles, 'feuilles')
  check('feuilles', d.length === 0, `${d.length} diffs`); show(d)
}

// --- domains -----------------------------------------------------------------
check('domains.length', built.domains.length === real.domains.length)
let compFieldsOk = 0, compFieldsTotal = 0
let feedbackOk = 0
let niveauOk = 0, archOk = 0, pointsOk = 0
for (let i = 0; i < Math.min(built.domains.length, real.domains.length); i++) {
  const db = built.domains[i], dr = real.domains[i]
  for (const k of ['id', 'color', 'tendance_temporelle', 'tendance_titre', 'tendance_description']) {
    check(`domain[${i + 1}].${k}`, Object.is(db[k], dr[k]), `${db[k]} vs ${dr[k]}`)
  }
  check(`domain[${i + 1}].tendance_stats`, JSON.stringify(db.tendance_stats) === JSON.stringify(dr.tendance_stats),
    JSON.stringify(db.tendance_stats) !== JSON.stringify(dr.tendance_stats) ? `${JSON.stringify(db.tendance_stats)} vs ${JSON.stringify(dr.tendance_stats)}` : '')
  {
    const d = deepDiff(db.parFeuille, dr.parFeuille, `domain[${i + 1}].parFeuille`)
    check(`domain[${i + 1}].parFeuille`, d.length === 0, `${d.length} diffs`); show(d)
  }
  {
    const same = db.rapport_html === dr.rapport_html
    check(`domain[${i + 1}].rapport_html`, same, same ? '' : firstDiff(db.rapport_html, dr.rapport_html))
  }
  check(`domain[${i + 1}].competences.length`, db.competences.length === dr.competences.length,
    `${db.competences.length} vs ${dr.competences.length}`)
  for (let j = 0; j < Math.min(db.competences.length, dr.competences.length); j++) {
    const cb = db.competences[j], cr = dr.competences[j]
    if (cb.niveau === cr.niveau) niveauOk++
    if (cb.archetype === cr.archetype) archOk++
    if (cb.points === cr.points) pointsOk++
    if (cb.feedback === cr.feedback) feedbackOk++
    else if (VERBOSE || true) {
      console.log(`     feedback DIFF ${cr.code}: ${firstDiff(cb.feedback, cr.feedback)}`)
    }
    const cbNoFb = { ...cb }, crNoFb = { ...cr }
    delete cbNoFb.feedback; delete crNoFb.feedback
    const d = deepDiff(cbNoFb, crNoFb, `comp[${cr.code}]`)
    compFieldsTotal++
    if (d.length === 0) compFieldsOk++
    else show(d)
  }
}
check('competences.niveau (54)', niveauOk === 54, `${niveauOk}/54`)
check('competences.archetype (54)', archOk === 54, `${archOk}/54`)
check('competences.points (54)', pointsOk === 54, `${pointsOk}/54`)
check('competences.feedback HTML (54, narratifs injectés)', feedbackOk === 54, `${feedbackOk}/54`)
check('competences.champs hors feedback (54)', compFieldsOk === compFieldsTotal, `${compFieldsOk}/${compFieldsTotal}`)

// --- narratifs ----------------------------------------------------------------
{
  const same = built.narratifs.kairosHtml === real.narratifs.kairosHtml
  check('narratifs.kairosHtml', same, same ? '' : firstDiff(built.narratifs.kairosHtml, real.narratifs.kairosHtml))
  check('narratifs.rapportHtml (alias kairosHtml)', built.narratifs.rapportHtml === real.narratifs.rapportHtml,
    built.narratifs.rapportHtml === real.narratifs.rapportHtml ? '' : firstDiff(built.narratifs.rapportHtml, real.narratifs.rapportHtml))
}

// --- Document complet ----------------------------------------------------------
{
  const d = deepDiff(built, real, 'document')
  check('document complet (deep equal)', d.length === 0, `${d.length} diffs`)
  if (d.length) show(d)
}

console.log('\n=== Parité B2 — document merge final ===')
for (const line of report) console.log(line)
console.log(failures === 0 ? '\nPARITÉ 100 % — aucun écart.' : `\n${failures} section(s) en écart.`)
process.exit(failures === 0 ? 0 : 1)
