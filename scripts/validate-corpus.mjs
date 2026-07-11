#!/usr/bin/env node
// Validates the whole demo corpus + fixtures against the JSON Schemas, through
// the SAME code path as the app: engine/src/validation.js (ajv, draft 2020-12).
//
// Scope:
//   1. web/public/data/demo/jours/*.json (minus index.json)  -> cartographie-jour
//   2. web/public/data/demo/merge.json                       -> cartographie-merge
//   3. web/public/data/referentiel/respire-v7.json           -> referentiel
//   4. schemas/fixtures/*.json                               -> kind read from each doc
//
// Output: one compact line per file (OK / KO + errors), summary, exit 1 on failure.
//
// Node quirk: engine/src/validation.js imports the schemas as plain JSON imports
// (no `with { type: 'json' }`, kept Vite-compatible — see the header comment
// there). Node >= 17.5 refuses those, so we register a tiny loader hook that
// serves *.json files as ES modules (`export default <json>`), which sidesteps
// the import-attribute requirement without touching the engine.
import { readFileSync, readdirSync } from 'node:fs'
import { register } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const jsonAsModuleHook = `
import { readFile } from 'node:fs/promises'
export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.json')) {
    const raw = await readFile(new URL(url), 'utf8')
    return {
      format: 'module',
      source: 'export default ' + JSON.stringify(JSON.parse(raw)) + ';',
      shortCircuit: true,
    }
  }
  return nextLoad(url, context)
}
`
register(`data:text/javascript,${encodeURIComponent(jsonAsModuleHook)}`)

// Imported AFTER the hook is registered; ajv resolves from engine/node_modules
// because resolution is relative to the importing file, so no cwd requirement.
const { validateDocument, SUPPORTED_KINDS } = await import(
  pathToFileURL(join(repoRoot, 'engine/src/validation.js')).href
)

// ---------------------------------------------------------------------------

const MAX_ERRORS_SHOWN = 8

/** @type {Array<{ file: string, kind: string | null }>} */
const targets = []

const joursDir = join(repoRoot, 'web/public/data/demo/jours')
for (const name of readdirSync(joursDir).sort()) {
  if (!name.endsWith('.json') || name === 'index.json') continue
  targets.push({ file: join(joursDir, name), kind: 'cartographie-jour' })
}

targets.push({ file: join(repoRoot, 'web/public/data/demo/merge.json'), kind: 'cartographie-merge' })
targets.push({ file: join(repoRoot, 'web/public/data/referentiel/respire-v7.json'), kind: 'referentiel' })

const fixturesDir = join(repoRoot, 'schemas/fixtures')
for (const name of readdirSync(fixturesDir).sort()) {
  if (!name.endsWith('.json')) continue
  targets.push({ file: join(fixturesDir, name), kind: null }) // kind read from the doc
}

// ---------------------------------------------------------------------------

let okCount = 0
let koCount = 0

for (const { file, kind } of targets) {
  const rel = relative(repoRoot, file)
  let doc
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    koCount += 1
    console.log(`KO  ${rel}\n    JSON illisible : ${error.message}`)
    continue
  }

  const effectiveKind = kind ?? doc?.kind
  if (typeof effectiveKind !== 'string' || !SUPPORTED_KINDS.includes(effectiveKind)) {
    koCount += 1
    console.log(`KO  ${rel}\n    kind inconnu ou absent : ${JSON.stringify(effectiveKind)}`)
    continue
  }
  if (kind === null && doc.kind !== effectiveKind) {
    // unreachable by construction, kept for clarity
  }

  const { valid, errors } = validateDocument(effectiveKind, doc)
  if (valid) {
    okCount += 1
    console.log(`OK  ${rel}  (${effectiveKind})`)
  } else {
    koCount += 1
    console.log(`KO  ${rel}  (${effectiveKind}) — ${errors.length} erreur(s)`)
    for (const error of errors.slice(0, MAX_ERRORS_SHOWN)) {
      console.log(`    ${error.path} [${error.keyword}] ${error.message}`)
    }
    if (errors.length > MAX_ERRORS_SHOWN) {
      console.log(`    … ${errors.length - MAX_ERRORS_SHOWN} erreur(s) supplémentaire(s)`)
    }
  }
}

console.log('---')
console.log(`${okCount} OK, ${koCount} KO sur ${targets.length} fichiers`)
process.exitCode = koCount === 0 ? 0 : 1
