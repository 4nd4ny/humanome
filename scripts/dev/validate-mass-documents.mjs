#!/usr/bin/env node
// DEV TOOL — validates a JSONL stream of mass_jobs documents against the
// cartographie-jour schema THROUGH THE ENGINE validator (ajv, the same code
// the browser runs). Used by scripts/dev/dod-p11.sh as the operational proof
// that every document produced by the worker is schema-valid.
//
// stdin: one JSON document per line (JSONL produced by the PHP dump in
// dod-p11.sh — PDO returns the JSON column verbatim, one line per document)
// stdout: `<valid>/<total> documents valides au schéma cartographie-jour`
// exit 0 when all valid, 1 otherwise (first errors printed on stderr).

import { validateDocument } from '../../engine/src/validation.js'

// utf8 decoding must span chunk boundaries (a multibyte character split
// across two chunks would otherwise be corrupted and break enum values)
process.stdin.setEncoding('utf8')
let input = ''
for await (const chunk of process.stdin) input += chunk

const lines = input.split('\n').map((l) => l.trim()).filter((l) => l !== '')
let valid = 0
let shown = 0
for (const line of lines) {
  let document
  try {
    document = JSON.parse(line)
  } catch (err) {
    if (shown++ < 3) process.stderr.write(`ligne illisible: ${err.message}\n`)
    continue
  }
  const result = validateDocument('cartographie-jour', document)
  if (result.valid) {
    valid += 1
  } else if (shown++ < 3) {
    process.stderr.write(`document ${document?.date ?? '?'} invalide: ${JSON.stringify(result.errors?.slice(0, 2))}\n`)
  }
}

process.stdout.write(`${valid}/${lines.length} documents valides au schéma cartographie-jour\n`)
process.exit(valid === lines.length && lines.length > 0 ? 0 : 1)
