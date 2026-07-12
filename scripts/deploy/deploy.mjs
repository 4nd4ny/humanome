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
//   node scripts/deploy/deploy.mjs static          # web/dist -> www/ (manifest delta sync)
//   node scripts/deploy/deploy.mjs static --dry-run
//   node scripts/deploy/deploy.mjs api             # build/api-release -> app/releases/<ts>/
//                                                  # + www/api/ front controller + current.txt
//                                                  # + POST /api/admin/migrate + health smoke
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'basic-ftp'
import { Readable, Writable } from 'node:stream'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const TARGETS = {
  // First milestone: fully static site in the webroot. Vite copies web/public/
  // (including data/ and .htaccess) into web/dist at build time.
  static: {
    remoteRoot: 'www',
    manifestPath: 'www/.deploy-manifest.json',
    sources: [{ localDir: 'web/dist', remotePrefix: '' }],
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

async function uploadTree(client, localDir, remoteRoot) {
  const knownDirs = new Set()
  const files = walkFiles(localDir)
  let done = 0
  for (const rel of files) {
    const remotePath = posix.join(remoteRoot, rel.split('/').join(posix.sep))
    await ensureRemoteDir(client, knownDirs, remotePath)
    await client.uploadFrom(join(localDir, rel), remotePath)
    done += 1
    if (done % 25 === 0 || done === files.length) console.log(`  uploaded ${done}/${files.length}`)
  }
}

const KEEP_RELEASES = 3

async function deployApi(env) {
  const stage = join(repoRoot, 'build/api-release')
  if (!statSync(stage, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error('build/api-release missing — run scripts/deploy/stage-api.sh first')
  }
  const version = readFileSync(join(stage, 'VERSION'), 'utf8').trim()
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 15)
  const releaseName = `${ts}-${version.replace(/[^A-Za-z0-9._-]/g, '_')}`

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

    console.log(`uploading release ${releaseName} (${version})`)
    await uploadTree(client, stage, `app/releases/${releaseName}`)
    await uploadTree(client, join(repoRoot, 'api/deploy/webroot'), 'www/api')

    // Pointer written last: the new release only becomes live once fully uploaded.
    await client.uploadFrom(Readable.from(`releases/${releaseName}\n`), 'app/current.txt')
    console.log(`current.txt -> releases/${releaseName}`)

    // Prune old releases (keep the most recent KEEP_RELEASES, name-sorted = time-sorted)
    const entries = await client.list('app/releases')
    const releases = entries
      .filter((e) => e.isDirectory)
      .map((e) => e.name)
      .sort()
    for (const old of releases.slice(0, Math.max(0, releases.length - KEEP_RELEASES))) {
      console.log(`  pruning app/releases/${old}`)
      await client.removeDir(`app/releases/${old}`)
      await client.cd('/')
    }
  } finally {
    client.close()
  }

  // Migrations + smoke over HTTPS
  const base = env.SITE_URL ?? 'https://humanome.xyz'
  if (env.MIGRATE_TOKEN) {
    const res = await fetch(`${base}/api/admin/migrate`, {
      method: 'POST',
      headers: { 'X-Migrate-Token': env.MIGRATE_TOKEN },
    })
    const body = await res.text()
    console.log(`migrate: HTTP ${res.status} ${body.slice(0, 300)}`)
    if (!res.ok) throw new Error('migration endpoint failed')

    // Seed/refresh the published referentiel (idempotent server-side)
    const refPath = join(repoRoot, 'web/public/data/referentiel/respire-v7.json')
    if (statSync(refPath, { throwIfNoEntry: false })?.isFile()) {
      const imp = await fetch(`${base}/api/admin/import-referentiel`, {
        method: 'POST',
        headers: { 'X-Migrate-Token': env.MIGRATE_TOKEN, 'Content-Type': 'application/json' },
        body: readFileSync(refPath, 'utf8'),
      })
      console.log(`import-referentiel: HTTP ${imp.status} ${(await imp.text()).slice(0, 200)}`)
      if (!imp.ok) throw new Error('referentiel import failed')
    }

    // Seed/refresh the published default prompt packages (idempotent by hash)
    const packagesDir = join(repoRoot, 'build/prompt-packages')
    if (statSync(packagesDir, { throwIfNoEntry: false })?.isDirectory()) {
      for (const file of readdirSync(packagesDir).filter((f) => f.endsWith('.json'))) {
        const imp = await fetch(`${base}/api/admin/import-prompt-package`, {
          method: 'POST',
          headers: { 'X-Migrate-Token': env.MIGRATE_TOKEN, 'Content-Type': 'application/json' },
          body: readFileSync(join(packagesDir, file), 'utf8'),
        })
        console.log(
          `import-prompt-package ${file}: HTTP ${imp.status} ${(await imp.text()).slice(0, 160)}`,
        )
        if (!imp.ok) throw new Error(`prompt package import failed (${file})`)
      }
    }
  } else {
    console.warn('MIGRATE_TOKEN not set in .env.deploy — skipping remote migrations')
  }
  const health = await fetch(`${base}/api/health`)
  const healthBody = await health.text()
  console.log(`health: HTTP ${health.status} ${healthBody.slice(0, 300)}`)
  if (!health.ok || !healthBody.includes('"ok"')) throw new Error('health smoke failed')
  console.log('api deploy done')
}

/** Lists the remote API releases, oldest first (name-sorted == time-sorted). */
async function listReleases(client) {
  const entries = await client.list('app/releases').catch(() => [])
  return entries
    .filter((e) => e.isDirectory)
    .map((e) => e.name)
    .sort()
}

/** Prints the remote releases and which one current.txt points at. */
async function releasesCommand(env) {
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
    const releases = await listReleases(client)
    let current = ''
    try {
      const chunks = []
      const sink = new Writable({
        write(c, _e, cb) {
          chunks.push(c)
          cb()
        },
      })
      await client.downloadTo(sink, 'app/current.txt')
      current = Buffer.concat(chunks).toString('utf8').trim()
    } catch {
      current = '(none)'
    }
    console.log(`current: ${current}`)
    for (const r of releases) console.log(`  ${'releases/' + r === current ? '* ' : '  '}${r}`)
  } finally {
    client.close()
  }
}

/**
 * Rolls the API back to the previous release: rewrites current.txt to the
 * release before the active one (code-only rollback; migrations are
 * forward-only expand/contract, ADR-008). The front (www/) is separate — its
 * hashed assets from previous releases are still present until pruned.
 */
async function rollbackApi(env) {
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
    const releases = await listReleases(client)
    if (releases.length < 2) {
      throw new Error(`need >= 2 releases to roll back, found ${releases.length}`)
    }
    const target = releases[releases.length - 2] // the one before the newest
    await client.uploadFrom(Readable.from(`releases/${target}\n`), 'app/current.txt')
    console.log(`rolled back: current.txt -> releases/${target}`)
  } finally {
    client.close()
  }

  const base = env.SITE_URL ?? 'https://humanome.xyz'
  const health = await fetch(`${base}/api/health`)
  console.log(`health after rollback: HTTP ${health.status} ${(await health.text()).slice(0, 200)}`)
}

async function main() {
  const targetName = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')
  if (targetName === 'api') {
    await deployApi(loadEnvDeploy())
    return
  }
  if (targetName === 'releases') {
    await releasesCommand(loadEnvDeploy())
    return
  }
  if (targetName === 'rollback') {
    await rollbackApi(loadEnvDeploy())
    return
  }
  const target = TARGETS[targetName]
  if (!target) {
    console.error(
      `Unknown target "${targetName}". Available: ${Object.keys(TARGETS).join(', ')}, api`,
    )
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
