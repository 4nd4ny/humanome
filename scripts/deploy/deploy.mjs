#!/usr/bin/env node
// FTPS deployment to OVH shared hosting (ADR-008).
//
// Manifest-based delta sync: every managed target keeps a manifest file on the
// remote side mapping remote paths to SHA-256 hashes. Only changed files are
// uploaded; files that disappeared locally are deleted remotely ONLY if they
// are listed in the previous manifest (never anything else). The manifest is
// written last, so an interrupted deploy is re-run safely.
//
// Usage:
//   node scripts/deploy/deploy.mjs static          # web/dist + web/public/data -> www/
//   node scripts/deploy/deploy.mjs static --dry-run
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'basic-ftp'
import { Readable, Writable } from 'node:stream'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const TARGETS = {
  // First milestone: fully static site in the webroot.
  static: {
    remoteRoot: 'www',
    manifestPath: 'www/.deploy-manifest.json',
    sources: [
      { localDir: 'web/dist', remotePrefix: '' },
      { localDir: 'web/public/data', remotePrefix: 'data' },
    ],
  },
}

function loadEnvDeploy() {
  const path = join(repoRoot, '.env.deploy')
  const env = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2]
  }
  for (const key of ['FTP_HOST', 'FTP_USER', 'FTP_PASSWORD']) {
    if (!env[key]) throw new Error(`${key} missing in .env.deploy`)
  }
  return env
}

function walkFiles(dir, base = dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(full, base))
    else out.push(relative(base, full))
  }
  return out
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Build {remotePath -> {local, hash}} for a target. */
function buildLocalIndex(target) {
  const index = new Map()
  for (const { localDir, remotePrefix } of target.sources) {
    const abs = join(repoRoot, localDir)
    if (!statSync(abs, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`Missing local dir: ${localDir} (build first?)`)
    }
    for (const rel of walkFiles(abs)) {
      const remotePath = posix.join(
        target.remoteRoot,
        remotePrefix,
        rel.split('/').join(posix.sep),
      )
      index.set(remotePath, { local: join(abs, rel), hash: sha256(join(abs, rel)) })
    }
  }
  return index
}

async function readRemoteManifest(client, manifestPath) {
  const chunks = []
  const sink = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk)
      cb()
    },
  })
  try {
    await client.downloadTo(sink, manifestPath)
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {} // first deploy, or unreadable manifest -> full upload, no deletions
  }
}

async function ensureRemoteDir(client, knownDirs, remoteFilePath) {
  const dir = posix.dirname(remoteFilePath)
  if (dir === '.' || knownDirs.has(dir)) return
  await client.ensureDir(`/${dir}`)
  await client.cd('/')
  knownDirs.add(dir)
}

async function main() {
  const targetName = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')
  const target = TARGETS[targetName]
  if (!target) {
    console.error(`Unknown target "${targetName}". Available: ${Object.keys(TARGETS).join(', ')}`)
    process.exit(2)
  }

  const env = loadEnvDeploy()
  const local = buildLocalIndex(target)
  console.log(`local files: ${local.size}`)

  const client = new Client(30_000)
  try {
    await client.access({
      host: env.FTP_HOST,
      user: env.FTP_USER,
      password: env.FTP_PASSWORD,
      secure: env.FTP_SECURE !== 'false',
      secureOptions: { rejectUnauthorized: true },
    })
    await client.cd('/')

    const previous = await readRemoteManifest(client, target.manifestPath)
    const toUpload = [...local.entries()].filter(([path, { hash }]) => previous[path] !== hash)
    const toDelete = Object.keys(previous).filter((path) => !local.has(path))
    console.log(`changed: ${toUpload.length}, to delete: ${toDelete.length}`)

    if (dryRun) {
      for (const [path] of toUpload) console.log(`  upload ${path}`)
      for (const path of toDelete) console.log(`  delete ${path}`)
      return
    }

    const knownDirs = new Set()
    let done = 0
    for (const [remotePath, { local: localPath }] of toUpload) {
      await ensureRemoteDir(client, knownDirs, remotePath)
      await client.uploadFrom(localPath, remotePath)
      done += 1
      if (done % 10 === 0 || done === toUpload.length) {
        console.log(`  uploaded ${done}/${toUpload.length}`)
      }
    }
    for (const remotePath of toDelete) {
      try {
        await client.remove(remotePath)
        console.log(`  deleted ${remotePath}`)
      } catch (e) {
        console.warn(`  could not delete ${remotePath}: ${e.message}`)
      }
    }

    const manifest = Object.fromEntries(
      [...local.entries()].map(([path, { hash }]) => [path, hash]),
    )
    await ensureRemoteDir(client, knownDirs, target.manifestPath)
    await client.uploadFrom(
      Readable.from(JSON.stringify(manifest, null, 1)),
      target.manifestPath,
    )
    console.log(`manifest written (${Object.keys(manifest).length} entries) — deploy done`)
  } finally {
    client.close()
  }
}

main().catch((e) => {
  console.error(`deploy failed: ${e.message}`)
  process.exit(1)
})
