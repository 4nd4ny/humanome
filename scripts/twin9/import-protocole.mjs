#!/usr/bin/env node
// Import the CONFIDENTIAL Twin_v9 templates into the platform database
// (ADR-010: the templates live in `twin9_protocole`, never in the repo).
//
// Reads TWIN_V9_DIR (default: ../Twin_v9 next to the repo root, gitignored)
//   protocole/**/*.md  -> {"lourd/20-greffier": "<content>", ...}
//   config.json        -> protocol settings ONLY (seuils_consensus, jury,
//                         juge_leger, merge, scan_global — the Python
//                         backends/workers knobs are NOT relevant server-side)
// and POSTs {files, config} to {BASE_URL}/api/admin/twin9/import with the
// X-Migrate-Token from .env.deploy (or the MIGRATE_TOKEN env var).
//
// Usage:
//   node scripts/twin9/import-protocole.mjs                       # production (SITE_URL)
//   node scripts/twin9/import-protocole.mjs --base-url http://localhost:8080
//   node scripts/twin9/import-protocole.mjs --dry-run             # list files, no POST
//
// SECRECY: this script never prints template content — names and sizes only.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// Protocol settings forwarded to the server (twin9_config.pipeline).
const CONFIG_KEYS = ['seuils_consensus', 'jury', 'juge_leger', 'merge', 'scan_global']

function parseArgs(argv) {
  const args = { baseUrl: null, dryRun: false }
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--base-url') args.baseUrl = argv[++i]
    else if (argv[i] === '--dry-run') args.dryRun = true
    else throw new Error(`Unknown option: ${argv[i]}`)
  }
  return args
}

/** .env.deploy loader (pattern scripts/deploy/deploy.mjs); optional in dev. */
function loadEnvDeploy() {
  const path = join(repoRoot, '.env.deploy')
  const env = {}
  if (!existsSync(path)) return env
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2]
  }
  return env
}

function walkMarkdownFiles(dir, base = dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkMarkdownFiles(full, base))
    else if (entry.name.endsWith('.md')) out.push(relative(base, full))
  }
  return out.sort()
}

async function main() {
  const args = parseArgs(process.argv)
  const env = loadEnvDeploy()

  const twinDir = process.env.TWIN_V9_DIR ?? resolve(repoRoot, '../Twin_v9')
  const protocoleDir = join(twinDir, 'protocole')
  if (!statSync(protocoleDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Twin_v9 protocole directory not found: ${protocoleDir} (set TWIN_V9_DIR)`)
  }

  // protocole/**/*.md -> {'lourd/20-greffier': content}
  const files = {}
  for (const rel of walkMarkdownFiles(protocoleDir)) {
    const name = rel.split(sep).join('/').replace(/\.md$/, '')
    files[name] = readFileSync(join(protocoleDir, rel), 'utf8')
  }
  if (Object.keys(files).length === 0) {
    throw new Error(`No .md template found under ${protocoleDir}`)
  }

  // config.json -> protocol settings subset only (never the Python backends)
  let config
  const configPath = join(twinDir, 'config.json')
  if (existsSync(configPath)) {
    const full = JSON.parse(readFileSync(configPath, 'utf8'))
    config = Object.fromEntries(CONFIG_KEYS.filter((k) => k in full).map((k) => [k, full[k]]))
  }

  // Non-secret referentiel STRUCTURE (pole num/nom + competence code/nom) the
  // client engine needs to assemble artefacts. Parsed by Twin_v9's own
  // load_referentiel (the faithful source of the accented pole names) — the
  // importing host is a Python project, so python3 is available; best-effort
  // with a clear warning if not (the server keeps its previous structure).
  let referentiel
  try {
    const py = 'import json,os,sys; sys.path.insert(0, sys.argv[1]); '
      + 'from aurora.referentiel import load_referentiel; '
      + 'p=load_referentiel(os.path.join(sys.argv[1],"protocole","tagger")); '
      + 'print(json.dumps([{"num":n,"nom":x.nom,"competences":'
      + '[{"code":c["code"],"nom":c["nom"]} for c in x.competences]} '
      + 'for n,x in sorted(p.items())], ensure_ascii=False))'
    const out = execFileSync('python3', ['-c', py, twinDir], { encoding: 'utf8' })
    referentiel = JSON.parse(out)
  } catch (e) {
    console.warn(`referentiel structure NOT extracted (python3?): ${e.message} — server keeps its current one`)
  }

  console.log(`Twin_v9 dir: ${twinDir}`)
  for (const [name, content] of Object.entries(files)) {
    console.log(`  ${name} (${Buffer.byteLength(content, 'utf8')} bytes)`)
  }
  console.log(config ? `config keys: ${Object.keys(config).join(', ')}` : 'config.json absent')
  console.log(referentiel ? `referentiel: ${referentiel.length} pôles` : 'referentiel absent')

  if (args.dryRun) {
    console.log('dry-run: nothing sent')
    return
  }

  const baseUrl = args.baseUrl ?? env.SITE_URL ?? 'https://humanome.xyz'
  const token = process.env.MIGRATE_TOKEN ?? env.MIGRATE_TOKEN
  if (!token) throw new Error('MIGRATE_TOKEN missing (.env.deploy or environment)')

  const res = await fetch(`${baseUrl}/api/admin/twin9/import`, {
    method: 'POST',
    headers: { 'X-Migrate-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files,
      ...(config ? { config } : {}),
      ...(referentiel ? { referentiel } : {}),
    }),
  })
  const body = await res.text()
  console.log(`import: HTTP ${res.status} ${body.slice(0, 300)}`)
  if (!res.ok) throw new Error('twin9 import failed')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
