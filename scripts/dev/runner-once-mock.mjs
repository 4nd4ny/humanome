#!/usr/bin/env node
// DEV TOOL — machine runner in --once mode with the engine MOCK provider
// injected (P11 operational DoD, scripts/dev/dod-p11.sh step "runner Node").
//
// Exercises the REAL runner library (scripts/runner-node/runner.mjs: argument
// parsing, X-Worker-Token client, reservation loop, engine extractDay, result
// posting) against a REAL local API — only the LLM transport is replaced by
// the deterministic engine mock, answering from the cartographie-jour
// fixtures exactly like the server-side WORKER_PROVIDER=mock (api MockProvider):
// the requested pole is read in the prompt, kairos at its marker, the fixture
// day picked by the ISO date embedded in the prompt.
//
// Usage:
//   node scripts/dev/runner-once-mock.mjs --api http://localhost:8080 --token <worker_token> [--limit 5]
//
// Never use against production: it would post FIXTURE documents to real jobs.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createLogger, createRunner, parseArgs } from '../runner-node/runner.mjs'
import { createMockProvider } from '../../engine/src/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FIXTURE_DAYS = ['2026-01-05', '2026-01-06', '2026-01-07']
const fixtures = new Map(FIXTURE_DAYS.map((day) => [
  day,
  JSON.parse(readFileSync(join(root, 'schemas', 'fixtures', `cartographie-jour-${day}.json`), 'utf8')),
]))

/** Same selection logic as api/src/Llm/MockProvider.php (fixtureDocument). */
function fixtureFor(prompt) {
  const day = FIXTURE_DAYS.find((candidate) => prompt.includes(candidate)) ?? FIXTURE_DAYS[0]
  return fixtures.get(day)
}

/** Mock answers: kairos FIRST (its prompt embeds the referentiel bloc with
 *  « Pôle n — » markers), then the requested pole. */
function extractionResponses({ prompt }) {
  const doc = fixtureFor(prompt)
  if (prompt.includes('SYNTHÈSE KAIROS') || prompt.includes('kairos.apprenant')) {
    return JSON.stringify(doc.kairos)
  }
  const match = prompt.match(/"poleNum":\s*"?([1-7])"?/) ?? prompt.match(/P[ôo]le\s+([1-7])\b/)
  if (!match) return 'réponse mock : aucun marqueur de pôle détecté'
  const pole = doc.poles.find((p) => String(p.poleNum) === match[1])
  return JSON.stringify(pole)
}

// The CLI options go through the REAL parseArgs; provider/model are dummies
// (resolveProviderConfig must succeed) — createProviderFn below ignores them.
const options = parseArgs(
  [...process.argv.slice(2), '--provider', 'ollama', '--model', 'mock-local'],
  process.env,
)
if (options.help) {
  process.stderr.write('voir l\'en-tête de scripts/dev/runner-once-mock.mjs\n')
  process.exit(0)
}

const runner = createRunner({
  options,
  createProviderFn: () => createMockProvider({ responses: extractionResponses }),
  log: createLogger(),
})

const stats = await runner.runOnce()
process.stdout.write(JSON.stringify(stats) + '\n')
process.exit(stats.errors > 0 && stats.ok === 0 ? 1 : 0)
