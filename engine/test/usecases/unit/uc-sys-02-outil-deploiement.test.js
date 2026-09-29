// UC-SYS-02 — Déployer, migrer et importer : tests FONCTIONNELS de l'outil de
// déploiement (scripts/deploy/deploy.mjs), exécuté en SOUS-PROCESSUS.
// Fiche : docs/cas-utilisation/systeme/UC-SYS-02-deployer-migrer.md
//
// deploy.mjs n'exporte rien et appelle main() dès son chargement : il est
// copié dans un dossier temporaire qui tient lieu de dépôt (le script résout
// .env.deploy, build/, web/ et api/deploy/webroot/ depuis son propre
// emplacement : rien n'est lu ni écrit dans le dépôt partagé). Aucun vrai FTP :
// un FAUX module `basic-ftp` (node_modules/ du dossier temporaire, là où le
// script le résout) journalise chaque appel et simule l'arborescence distante
// dans un fichier d'état JSON. Aucun site distant : SITE_URL pointe sur un
// serveur HTTP local (127.0.0.1, port éphémère) qui journalise les requêtes
// et répond ce que le test a scripté. Identifiants et jetons factices.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('../../../../', import.meta.url))
const TIMEOUT = 60_000
const MIGRATE_TOKEN = 'jeton-migrate-test'

const tempDirs = []
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

/** Faux `basic-ftp` : même API que la classe Client utilisée par deploy.mjs. */
const FAKE_BASIC_FTP = `// Faux module basic-ftp (test UC-SYS-02) : aucun réseau.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'

const LOG = process.env.FAKE_FTP_LOG
const STATE = process.env.FAKE_FTP_STATE
const load = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { files: {}, releases: [] })
const save = (state) => writeFileSync(STATE, JSON.stringify(state))
const record = (entry) => appendFileSync(LOG, JSON.stringify(entry) + '\\n')

async function readSource(source) {
  if (typeof source === 'string') return readFileSync(source, 'utf8')
  let text = ''
  for await (const chunk of source) text += chunk
  return text
}

export class Client {
  constructor(timeout) { record({ op: 'new', timeout }) }
  async access({ host, user, password, secure, secureOptions }) {
    record({ op: 'access', host, user, password, secure, secureOptions })
  }
  async cd(path) { record({ op: 'cd', path }) }
  async ensureDir(path) { record({ op: 'ensureDir', path }) }
  async uploadFrom(source, path) {
    const text = await readSource(source)
    record({ op: 'uploadFrom', path, text, source: typeof source === 'string' ? 'file' : 'stream' })
    const state = load()
    state.files[path] = text
    const release = /^app\\/releases\\/([^/]+)\\//.exec(path)
    if (release && !state.releases.includes(release[1])) state.releases.push(release[1])
    save(state)
  }
  async list(path) {
    record({ op: 'list', path })
    const state = load()
    if (state.listError) throw new Error(state.listError)
    if (path !== 'app/releases') return []
    return [
      ...state.releases.map((name) => ({ name, isDirectory: true })),
      ...(state.releaseFiles ?? []).map((name) => ({ name, isDirectory: false })),
    ]
  }
  async removeDir(path) {
    record({ op: 'removeDir', path })
    const state = load()
    state.releases = state.releases.filter((name) => 'app/releases/' + name !== path)
    save(state)
  }
  async remove(path) {
    record({ op: 'remove', path })
    const state = load()
    if ((state.removeFails ?? []).includes(path)) throw new Error('550 Permission denied (faux FTP)')
    delete state.files[path]
    save(state)
  }
  async downloadTo(sink, path) {
    record({ op: 'downloadTo', path })
    const state = load()
    if (!(path in state.files)) throw new Error('550 No such file (faux FTP)')
    await new Promise((resolve, reject) => sink.write(Buffer.from(state.files[path]), (e) => (e ? reject(e) : resolve())))
  }
  close() { record({ op: 'close' }) }
}
`

/** Contenu de .env.deploy (valeurs factices) ; `null` = ligne omise. */
function envDeploy(overrides = {}) {
  const values = {
    FTP_HOST: 'ftp.exemple.test',
    FTP_USER: 'deployeur-test',
    FTP_PASSWORD: 'mdp-factice-test',
    FTP_SECURE: 'false',
    ...overrides,
  }
  return ['# identifiants FACTICES (test)', ...Object.entries(values).filter(([, v]) => v !== null).map(([k, v]) => `${k}=${v}`)].join('\n') + '\n'
}

/**
 * « Dépôt » temporaire : scripts/deploy/deploy.mjs (copie octet à octet) + faux
 * basic-ftp. `env` : contenu de .env.deploy (absent si null) ; `files` :
 * {chemin relatif: contenu} ; `webroot` : copie de api/deploy/webroot/ ;
 * `remote` : état initial du faux FTP.
 */
function makeCheckout({ env = null, files = {}, webroot = false, remote = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'uc-sys-02-'))
  tempDirs.push(root)
  mkdirSync(join(root, 'scripts/deploy'), { recursive: true })
  cpSync(join(REPO, 'scripts/deploy/deploy.mjs'), join(root, 'scripts/deploy/deploy.mjs'))
  const fake = join(root, 'scripts/deploy/node_modules/basic-ftp')
  mkdirSync(fake, { recursive: true })
  writeFileSync(join(fake, 'package.json'), JSON.stringify({ name: 'basic-ftp', version: '0.0.0-test', type: 'module', main: 'index.js' }))
  writeFileSync(join(fake, 'index.js'), FAKE_BASIC_FTP)
  if (env !== null) writeFileSync(join(root, '.env.deploy'), env)
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), content)
  }
  if (webroot) cpSync(join(REPO, 'api/deploy/webroot'), join(root, 'api/deploy/webroot'), { recursive: true })
  const state = join(root, 'ftp-state.json')
  writeFileSync(state, JSON.stringify({ files: {}, releases: [], ...remote }))
  return { root, log: join(root, 'ftp-calls.jsonl'), state }
}

/** `node scripts/deploy/deploy.mjs <args>` (asynchrone : le site local tourne dans CE processus). */
function deploy(checkout, args = [], extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(checkout.root, 'scripts/deploy/deploy.mjs'), ...args], {
      cwd: checkout.root,
      env: { PATH: process.env.PATH ?? '', NO_PROXY: '127.0.0.1,localhost', FAKE_FTP_LOG: checkout.log, FAKE_FTP_STATE: checkout.state, ...extraEnv },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

/** Appels reçus par le faux client FTP, dans l'ordre. */
function ftpCalls(checkout) {
  if (!existsSync(checkout.log)) return []
  return readFileSync(checkout.log, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
}
const remoteState = (checkout) => JSON.parse(readFileSync(checkout.state, 'utf8'))
const uploads = (checkout) => ftpCalls(checkout).filter((c) => c.op === 'uploadFrom')

/**
 * Site distant simulé. `respond(req)` → [status, corps] ; chaque requête est
 * journalisée avec le nombre d'appels FTP déjà faits à cet instant.
 */
async function withSite(checkout, respond, run) {
  const requests = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const entry = {
        method: req.method,
        url: req.url,
        token: req.headers['x-migrate-token'] ?? null,
        body,
        ftpCallsBefore: ftpCalls(checkout).length,
      }
      requests.push(entry)
      const [status, text] = respond(entry)
      res.writeHead(status, { 'content-type': 'application/json', connection: 'close' })
      res.end(text)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    return await run(`http://127.0.0.1:${server.address().port}`, requests)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

const RELEASES = ['20260901-120000-v1', '20260915-080000-v2', '20260928-090000-v3']

describe('UC-SYS-02 — outil de déploiement deploy.mjs (sous-processus, faux FTP, site local)', () => {
  it('UC-SYS-02-F19 — E12 : cible inconnue → code 2 avant toute lecture de .env.deploy ; .env.deploy absent ou incomplet → code 1 ; build/api-release ou web/dist absent → code 1 ; jamais de connexion FTP', async () => {
    // Cible inconnue (ou absente) : code 2, même sans .env.deploy.
    const bare = makeCheckout()
    for (const [args, name] of [[['bogus'], 'bogus'], [[], 'undefined']]) {
      const unknown = await deploy(bare, args)
      expect(unknown.status).toBe(2)
      expect(unknown.stderr).toBe(`Unknown target "${name}". Available: static, api\n`)
      expect(unknown.stdout).toBe('')
    }

    // .env.deploy absent : chaque cible échoue (ENOENT), code 1.
    for (const target of ['static', 'api', 'rollback', 'releases']) {
      const missing = await deploy(bare, [target])
      expect(missing.status, target).toBe(1)
      expect(missing.stderr, target).toMatch(/^deploy failed: ENOENT: no such file or directory, open '.*\.env\.deploy'\n$/)
    }
    expect(ftpCalls(bare)).toEqual([])

    // .env.deploy incomplet : FTP_HOST, FTP_USER, FTP_PASSWORD exigés (ligne
    // commentée ou valeur vide = absente), contrôlés dans cet ordre.
    const incomplete = [
      [envDeploy({ FTP_HOST: null }).replace('# identifiants', '# FTP_HOST=ftp.commentaire.test\n# identifiants'), 'FTP_HOST'],
      [envDeploy({ FTP_USER: '' }), 'FTP_USER'],
      [envDeploy({ FTP_PASSWORD: null }), 'FTP_PASSWORD'],
    ]
    for (const [env, key] of incomplete) {
      const checkout = makeCheckout({ env, files: { 'web/dist/index.html': '<!doctype html>' } })
      const result = await deploy(checkout, ['static'])
      expect(result.status, key).toBe(1)
      expect(result.stderr, key).toBe(`deploy failed: ${key} missing in .env.deploy\n`)
      expect(ftpCalls(checkout), key).toEqual([])
    }

    // Artefacts locaux absents : code 1, aucun client FTP créé.
    const unbuilt = makeCheckout({ env: envDeploy() })
    const api = await deploy(unbuilt, ['api'])
    expect(api.status).toBe(1)
    expect(api.stderr).toBe('deploy failed: build/api-release missing — run scripts/deploy/stage-api.sh first\n')
    const front = await deploy(unbuilt, ['static'])
    expect(front.status).toBe(1)
    expect(front.stderr).toBe('deploy failed: Missing local dir: web/dist (build first?)\n')
    expect(ftpCalls(unbuilt)).toEqual([])
  }, TIMEOUT)

  it('UC-SYS-02-F20 — A6, AN-5 : rollback réécrit current.txt vers l’avant-dernière release PAR NOM sans lire current.txt (active = la plus ancienne → pointée sur une plus récente ; second rollback identique) ; santé seulement affichée (503 → code 0) ; moins de 2 releases → code 1 ; releases marque la release pointée', async () => {
    const checkout = makeCheckout({
      remote: {
        files: { 'app/current.txt': `releases/${RELEASES[0]}\n` },
        releases: [RELEASES[2], RELEASES[0], RELEASES[1]], // ordre de listage quelconque
        releaseFiles: ['zzz-notes.txt'], // fichier : ignoré
      },
    })
    await withSite(checkout, () => [503, '{"status":"error","message":"Release entry point missing"}'], async (base, requests) => {
      writeFileSync(join(checkout.root, '.env.deploy'), envDeploy({ SITE_URL: base }))

      // COMPORTEMENT ACTUEL (AN-5) : l'active est la plus ancienne (A), et
      // pourtant current.txt est réécrit vers B, plus récente — jamais lu.
      const first = await deploy(checkout, ['rollback'])
      expect(first.stderr).toBe('')
      expect(first.status).toBe(0) // santé en 503 : seulement affichée
      expect(first.stdout).toBe(
        `rolled back: current.txt -> releases/${RELEASES[1]}\n`
        + 'health after rollback: HTTP 503 {"status":"error","message":"Release entry point missing"}\n',
      )
      expect(ftpCalls(checkout)).toEqual([
        { op: 'new', timeout: 30000 },
        { op: 'access', host: 'ftp.exemple.test', user: 'deployeur-test', password: 'mdp-factice-test', secure: false, secureOptions: { rejectUnauthorized: true } },
        { op: 'cd', path: '/' },
        { op: 'list', path: 'app/releases' },
        { op: 'uploadFrom', path: 'app/current.txt', text: `releases/${RELEASES[1]}\n`, source: 'stream' },
        { op: 'close' },
      ])
      expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/health'])
      expect(requests[0].ftpCallsBefore).toBe(6) // sondage après la fermeture FTP

      // Second rollback : même cible (ne recule pas d'un cran).
      const second = await deploy(checkout, ['rollback'])
      expect(second.status).toBe(0)
      expect(uploads(checkout).map((u) => u.text)).toEqual([`releases/${RELEASES[1]}\n`, `releases/${RELEASES[1]}\n`])

      // `releases` : liste triée, `*` sur la release pointée.
      const listed = await deploy(checkout, ['releases'])
      expect(listed.status).toBe(0)
      expect(listed.stdout).toBe(
        `current: releases/${RELEASES[1]}\n    ${RELEASES[0]}\n  * ${RELEASES[1]}\n    ${RELEASES[2]}\n`,
      )
      expect(ftpCalls(checkout).at(-2)).toEqual({ op: 'downloadTo', path: 'app/current.txt' })
    })

    // Pointeur illisible : « (none) ». FTPS demandé dès que FTP_SECURE ≠ "false".
    const unpointed = makeCheckout({ env: envDeploy({ FTP_SECURE: null }), remote: { releases: [RELEASES[0]] } })
    const none = await deploy(unpointed, ['releases'])
    expect(none.status).toBe(0)
    expect(none.stdout).toBe(`current: (none)\n    ${RELEASES[0]}\n`)
    expect(ftpCalls(unpointed)[1]).toMatchObject({ op: 'access', secure: true, secureOptions: { rejectUnauthorized: true } })

    // Moins de 2 releases (listage en échec = 0) : code 1, pointeur intact, aucun sondage.
    for (const remote of [{ releases: [RELEASES[0]] }, { listError: '550 Permission denied (faux FTP)' }]) {
      const lone = makeCheckout({ env: envDeploy(), remote })
      const result = await deploy(lone, ['rollback'])
      expect(result.status).toBe(1)
      expect(result.stderr).toBe(`deploy failed: need >= 2 releases to roll back, found ${remote.releases?.length ?? 0}\n`)
      expect(uploads(lone)).toEqual([])
      expect(ftpCalls(lone).at(-1)).toEqual({ op: 'close' })
    }
  }, TIMEOUT)

  it('UC-SYS-02-F21 — Nominal étapes 3 à 9 (RG6) : release téléversée sous un nom assaini, front-controller, PUIS current.txt, élagage à 3, et seulement ensuite la séquence distante (migrate, référentiel présent seulement, seed, fiches, paquets .json, santé) ; 409 des fiches → arrêt, pointeur déjà basculé ; sans MIGRATE_TOKEN → santé seule ; santé sans "ok" → code 1', async () => {
    const files = {
      'build/api-release/VERSION': 'v1.4.0-2-gabc123/dirty\n',
      'build/api-release/public/index.php': '<?php // release factice (test)\n',
      'build/api-release/src/App.php': '<?php // source factice (test)\n',
      // Seule la 7.1.0 est présente sur le poste : la 7.0.0 est sautée en silence.
      'web/public/data/referentiel/respire-v7.1.0.json': '{"id":"respire","version":"7.1.0","test":true}',
      'build/prompt-packages/a-paquet.json': '{"id":"paquet-a","test":true}',
      'build/prompt-packages/b-paquet.json': '{"id":"paquet-b","test":true}',
      'build/prompt-packages/LISEZMOI.txt': 'ignoré (test)',
    }
    // Noms antérieurs à toute horloge plausible : la nouvelle release trie en dernier.
    const older = ['20200101-000000-v0', '20200201-000000-v0']
    const active = '20200301-000000-v0'
    const checkout = makeCheckout({ files, webroot: true, remote: { files: { 'app/current.txt': `releases/${active}\n` }, releases: [...older, active] } })
    const replies = {
      'POST /api/admin/migrate': [200, '{"applied":[],"skipped":27}'],
      'POST /api/admin/import-referentiel': [200, '{"status":"unchanged"}'],
      'POST /api/admin/seed-competences': [200, '{"poles":7,"imported":0}'],
      'POST /api/admin/generate-fiches': [200, '{"status":"unchanged"}'],
      'POST /api/admin/import-prompt-package': [200, '{"status":"unchanged"}'],
      // Le smoke ne regarde ni `db` ni les migrations : `"ok"` suffit.
      'GET /api/health': [200, '{"status":"ok","version":"test","db":"error"}'],
    }
    await withSite(checkout, (r) => replies[`${r.method} ${r.url}`], async (base, requests) => {
      writeFileSync(join(checkout.root, '.env.deploy'), envDeploy({ SITE_URL: base, MIGRATE_TOKEN }))
      const result = await deploy(checkout, ['api'])
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
      expect(result.stdout.trimEnd().split('\n').at(-1)).toBe('api deploy done')

      const release = uploads(checkout)[0].path.split('/')[2]
      expect(release).toMatch(/^\d{8}-\d{6}-v1\.4\.0-2-gabc123_dirty$/) // « / » assaini
      expect(`releases/${release}`).toMatch(/^releases\/[A-Za-z0-9._-]+$/) // motif du front-controller
      expect(uploads(checkout).map((u) => u.path)).toEqual([
        `app/releases/${release}/VERSION`,
        `app/releases/${release}/public/index.php`,
        `app/releases/${release}/src/App.php`,
        'www/api/.htaccess',
        'www/api/index.php',
        'app/current.txt', // pointeur écrit APRÈS la release et le front-controller
      ])
      expect(uploads(checkout).at(-1)).toMatchObject({ text: `releases/${release}\n`, source: 'stream' })
      // Élagage : 4 releases → les 3 plus récentes gardées (ordre des noms).
      const ops = ftpCalls(checkout)
      expect(ops.slice(ops.findIndex((c) => c.path === 'app/current.txt') + 1)).toEqual([
        { op: 'list', path: 'app/releases' },
        { op: 'removeDir', path: `app/releases/${older[0]}` },
        { op: 'cd', path: '/' },
        { op: 'close' },
      ])
      expect(remoteState(checkout).releases.sort()).toEqual([older[1], active, release])

      // Séquence distante : toutes les requêtes APRÈS la fin du FTP (RG6), jeton en en-tête.
      expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
        'POST /api/admin/migrate',
        'POST /api/admin/import-referentiel',
        'POST /api/admin/seed-competences',
        'POST /api/admin/generate-fiches',
        'POST /api/admin/import-prompt-package',
        'POST /api/admin/import-prompt-package',
        'GET /api/health',
      ])
      expect(requests.every((r) => r.ftpCallsBefore === ops.length)).toBe(true)
      expect(requests.slice(0, -1).every((r) => r.token === MIGRATE_TOKEN)).toBe(true)
      expect(requests.at(-1).token).toBeNull()
      expect(requests[1].body).toBe(files['web/public/data/referentiel/respire-v7.1.0.json'])
      expect(requests[3].body).toBe('{"force":false}')
      expect(requests.slice(4, 6).map((r) => r.body).sort()).toEqual([files['build/prompt-packages/a-paquet.json'], files['build/prompt-packages/b-paquet.json']])

      // Garde-fou des fiches (409) : arrêt avant paquets et santé ; le pointeur
      // a DÉJÀ basculé sur la nouvelle release. FICHES_FORCE=1 (environnement) → force.
      replies['POST /api/admin/generate-fiches'] = [409, '{"status":"diff","changed":["P1C1"]}']
      requests.length = 0
      const blocked = await deploy(checkout, ['api'], { FICHES_FORCE: '1' })
      expect(blocked.status).toBe(1)
      expect(blocked.stderr).toBe('deploy failed: fiche generation blocked (twin9_fiches diff) — vérifier, puis FICHES_FORCE=1 si intentionnel\n')
      expect(requests.map((r) => r.url)).toEqual(['/api/admin/migrate', '/api/admin/import-referentiel', '/api/admin/seed-competences', '/api/admin/generate-fiches'])
      expect(requests[3].body).toBe('{"force":true}')
      expect(requests[0].ftpCallsBefore).toBe(ftpCalls(checkout).length) // FTP terminé avant le refus
      const newest = uploads(checkout).at(-1)
      expect(newest.path).toBe('app/current.txt')
      expect(newest.text).toMatch(/^releases\/\d{8}-\d{6}-v1\.4\.0-2-gabc123_dirty\n$/)
      expect(remoteState(checkout).files['app/current.txt']).toBe(newest.text)

      // Sans MIGRATE_TOKEN : étapes 4 à 8 sautées sur un avertissement, santé seule.
      writeFileSync(join(checkout.root, '.env.deploy'), envDeploy({ SITE_URL: base }))
      requests.length = 0
      const skipped = await deploy(checkout, ['api'])
      expect(skipped.status).toBe(0)
      expect(skipped.stderr).toBe('MIGRATE_TOKEN not set in .env.deploy — skipping remote migrations\n')
      expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/health'])

      // Smoke : 200 sans la chaîne "ok" → code 1.
      replies['GET /api/health'] = [200, '{"status":"degraded"}']
      const unhealthy = await deploy(checkout, ['api'])
      expect(unhealthy.status).toBe(1)
      expect(unhealthy.stderr).toContain('deploy failed: health smoke failed\n')
    })
  }, TIMEOUT)

  it('UC-SYS-02-F22 — Nominal étape 1 : synchro static par manifeste — seuls les fichiers modifiés partent, seuls les fichiers de l’ancien manifeste disparus sont supprimés (échec = avertissement), manifeste écrit en dernier ; --dry-run ne transfère rien ; manifeste absent ou illisible → envoi complet sans suppression', async () => {
    const dist = {
      'web/dist/index.html': '<!doctype html><title>test</title>',
      'web/dist/assets/app-123.js': 'console.log("test")',
      'web/dist/.DS_Store': 'ignoré',
    }
    const sha = (text) => createHash('sha256').update(text).digest('hex')
    const previous = {
      'www/index.html': sha(dist['web/dist/index.html']), // inchangé
      'www/assets/app-000.js': 'ancien-hash', // disparu localement
      'www/assets/verrouille.css': 'ancien-hash', // disparu, suppression refusée
    }
    const checkout = makeCheckout({
      env: envDeploy(),
      files: dist,
      remote: {
        files: { 'www/.deploy-manifest.json': JSON.stringify(previous), 'www/robots.txt': 'hors manifeste' },
        removeFails: ['www/assets/verrouille.css'],
      },
    })

    // --dry-run : liste, aucun transfert, aucune suppression.
    const dry = await deploy(checkout, ['static', '--dry-run'])
    expect(dry.status).toBe(0)
    expect(dry.stdout).toBe(
      'local files: 2\nchanged: 1, to delete: 2\n  upload www/assets/app-123.js\n  delete www/assets/app-000.js\n  delete www/assets/verrouille.css\n',
    )
    expect(ftpCalls(checkout).filter((c) => ['uploadFrom', 'remove', 'ensureDir'].includes(c.op))).toEqual([])

    const real = await deploy(checkout, ['static'])
    expect(real.status).toBe(0)
    expect(real.stderr).toBe('  could not delete www/assets/verrouille.css: 550 Permission denied (faux FTP)\n')
    const ops = ftpCalls(checkout).slice(ftpCalls(checkout).findLastIndex((c) => c.op === 'new'))
    expect(ops.filter((c) => c.op !== 'access').map((c) => `${c.op} ${c.path ?? ''}`.trim())).toEqual([
      'new',
      'cd /',
      'downloadTo www/.deploy-manifest.json',
      'ensureDir /www/assets',
      'cd /',
      'uploadFrom www/assets/app-123.js',
      'remove www/assets/app-000.js',
      'remove www/assets/verrouille.css',
      'ensureDir /www',
      'cd /',
      'uploadFrom www/.deploy-manifest.json', // en dernier
      'close',
    ])
    const manifest = JSON.parse(remoteState(checkout).files['www/.deploy-manifest.json'])
    expect(manifest).toEqual({
      'www/index.html': sha(dist['web/dist/index.html']),
      'www/assets/app-123.js': sha(dist['web/dist/assets/app-123.js']),
    })
    expect(remoteState(checkout).files['www/robots.txt']).toBe('hors manifeste') // jamais supprimé
    expect(real.stdout).toContain('manifest written (2 entries) — deploy done')

    // Manifeste illisible puis absent : envoi complet, aucune suppression.
    for (const files of [{ 'www/.deploy-manifest.json': '{pas du json', 'www/assets/app-000.js': 'x' }, {}]) {
      const fresh = makeCheckout({ env: envDeploy(), files: dist, remote: { files } })
      const full = await deploy(fresh, ['static'])
      expect(full.status).toBe(0)
      expect(full.stdout).toContain('changed: 2, to delete: 0')
      expect(uploads(fresh).map((u) => u.path)).toEqual(['www/assets/app-123.js', 'www/index.html', 'www/.deploy-manifest.json'])
      expect(ftpCalls(fresh).some((c) => c.op === 'remove')).toBe(false)
    }
  }, TIMEOUT)
})
