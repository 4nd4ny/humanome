#!/usr/bin/env node
// Application-level MySQL backup over PDO-equivalent (mysql2 is NOT a dep — we
// use the mysql wire protocol via a tiny query loop through the PHP container
// is overkill; instead this connects with the `mysql` CLI when present, else
// prints guidance). Primary backups are OVH's automatic ones; this is an
// OFF-OVH safety copy the operator can run from any machine that can reach the
// database host (OVH mutualisé : <compte>.mysql.db).
//
// Usage:
//   node scripts/backup/backup-db.mjs                 # dump -> backups/humanome-<ts>.sql
//   node scripts/backup/backup-db.mjs --out /path.sql
//
// Reads DB_* from api/.env (or the environment). Requires the `mysqldump`
// client on PATH. On OVH shared hosting there is no shell; run this from a
// workstation or CI that can reach the DB host.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function loadDbEnv() {
  const env = { ...process.env }
  const envFile = resolve(repoRoot, 'api/.env')
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
      if (m && !line.trim().startsWith('#') && env[m[1]] === undefined) env[m[1]] = m[2]
    }
  }
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    if (!env[key]) throw new Error(`${key} missing (set it in api/.env or the environment)`)
  }
  return env
}

function timestamp() {
  // Date.* is fine in a plain script (this is not a Workflow sandbox).
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
}

function main() {
  const env = loadDbEnv()
  const outIdx = process.argv.indexOf('--out')
  const out =
    outIdx !== -1 && process.argv[outIdx + 1]
      ? resolve(process.argv[outIdx + 1])
      : resolve(repoRoot, `backups/humanome-${timestamp()}.sql`)
  mkdirSync(dirname(out), { recursive: true })

  const args = [
    `-h${env.DB_HOST}`,
    `-u${env.DB_USER}`,
    `-p${env.DB_PASSWORD}`,
    '--single-transaction',
    '--no-tablespaces',
    '--default-character-set=utf8mb4',
    `--result-file=${out}`,
    env.DB_NAME,
  ]
  const res = spawnSync('mysqldump', args, { stdio: ['ignore', 'inherit', 'inherit'] })
  if (res.error?.code === 'ENOENT') {
    console.error(
      'mysqldump not found on PATH. Install the MySQL client tools, or use OVH’s\n' +
        'automatic backups (Web Cloud > Databases). See docs/backup-restore.md.',
    )
    process.exit(3)
  }
  if (res.status !== 0) process.exit(res.status ?? 1)
  console.log(`backup written: ${out}`)
}

main()
