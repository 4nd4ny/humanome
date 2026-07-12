#!/usr/bin/env node
// Precompiles the five JSON Schemas into engine/src/validation-compiled.js
// (ajv standalone code). Why: ajv's runtime compilation uses new Function(),
// which the production CSP (script-src 'self', no 'unsafe-eval') forbids —
// precompiled validators run eval-free in the browser (found the hard way on
// the deployed « Essayer » demo).
//
// Re-run whenever a file in schemas/ changes: node scripts/build-validators.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ajv lives in engine/node_modules: resolve from there, wherever we run.
const engineRequire = createRequire(resolve(repoRoot, 'engine/package.json'))
const Ajv2020Import = engineRequire('ajv/dist/2020.js')
const addFormatsImport = engineRequire('ajv-formats')
const standaloneImport = engineRequire('ajv/dist/standalone/index.js')
const { _ } = engineRequire('ajv/dist/compile/codegen/index.js')

const Ajv2020 = Ajv2020Import.default ?? Ajv2020Import
const addFormats = addFormatsImport.default ?? addFormatsImport
const standaloneCode = standaloneImport.default ?? standaloneImport
const out = resolve(repoRoot, 'engine/src/validation-compiled.js')

const KINDS = [
  'referentiel',
  'prompt-package',
  'cartographie-jour',
  'cartographie-merge',
  'archive-export',
]

const schemas = KINDS.map((kind) =>
  JSON.parse(readFileSync(resolve(repoRoot, `schemas/${kind}.schema.json`), 'utf8')),
)

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  schemas,
  code: {
    source: true,
    esm: true,
    // The generated code references this identifier; the import line providing
    // it is prepended below (ajv-formats ships the definitions map).
    formats: _`formatsHelper`,
  },
})
addFormats(ajv)

const exportsMap = Object.fromEntries(
  KINDS.map((kind) => [exportNameFor(kind), `https://humanome.xyz/schemas/${kind}.schema.json`]),
)

function exportNameFor(kind) {
  return 'validate_' + kind.replaceAll('-', '_')
}

let code = standaloneCode(ajv, exportsMap)

// ajv standalone still emits require() for its runtime helpers even in esm
// mode: hoist them into imports with a node/vite-proof CJS interop shim
// (node: default import = module.exports; vite: = exports.default).
const helperSpecs = [...new Set([...code.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]))]
const importLines = []
helperSpecs.forEach((spec, i) => {
  const mod = `__rt${i}_mod`
  const id = `__rt${i}`
  const importSpec = spec.endsWith('.js') ? spec : `${spec}.js` // node ESM needs the extension
  importLines.push(
    `import ${mod} from '${importSpec}'`,
    `const ${id} = ${mod}.default ?? ${mod}`,
  )
  code = code
    .replaceAll(`require("${spec}").default`, id)
    .replaceAll(`require("${spec}")`, id)
})

code =
  `// GENERATED FILE — do not edit. Rebuild with: node scripts/build-validators.mjs\n` +
  `// Standalone ajv validators (draft 2020-12), eval-free for strict CSP.\n` +
  `import { fullFormats as formatsHelper } from 'ajv-formats/dist/formats.js'\n` +
  importLines.join('\n') +
  '\n' +
  code

writeFileSync(out, code)
console.log(`validators compiled -> ${out} (${Math.round(code.length / 1024)} Ko)`)

// Smoke: import the generated module and validate a real document
const compiled = await import(out)
const referentiel = JSON.parse(
  readFileSync(resolve(repoRoot, 'web/public/data/referentiel/respire-v7.json'), 'utf8'),
)
const fn = compiled[exportNameFor('referentiel')]
if (fn(referentiel) !== true) {
  console.error('smoke failed:', fn.errors)
  process.exit(1)
}
console.log('smoke: real referentiel validates OK (eval-free)')
