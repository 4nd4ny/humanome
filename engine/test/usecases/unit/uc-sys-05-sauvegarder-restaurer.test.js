// UC-SYS-05 — Sauvegarder et restaurer la base : tests FONCTIONNELS.
// Fiche : docs/cas-utilisation/systeme/UC-SYS-05-sauvegarder-restaurer.md
//
// scripts/backup/backup-db.mjs n'exporte rien et appelle main() dès son
// chargement : il est exécuté en SOUS-PROCESSUS (`node backup-db.mjs`), copié
// dans un dossier temporaire qui tient lieu de dépôt (le script résout
// api/.env et backups/ depuis son propre emplacement : rien n'est lu ni écrit
// dans le dépôt partagé). AUCUNE vraie base : un faux `mysqldump`, placé seul
// dans le PATH du sous-processus, journalise ses arguments, écrit le fichier
// demandé par --result-file et sort avec le code choisi par le test.
// Identifiants factices uniquement. Les dossiers temporaires passent par
// realpathSync : si os.tmpdir() traverse un lien symbolique (macOS), le script
// imprime son chemin résolu (voir UC-SYS-04 AN-4).
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('../../../../', import.meta.url))
const TIMEOUT = 60_000

const DB_ENV = {
  DB_HOST: 'db.exemple.test',
  DB_NAME: 'humanome_test_dump',
  DB_USER: 'sauveur',
  DB_PASSWORD: 'mdp-factice-test',
}

const tempDirs = []
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

/**
 * « Dépôt » temporaire : scripts/backup/backup-db.mjs + dossier bin/ contenant,
 * si demandé, un faux mysqldump (wrapper sh → node, journal JSON des appels).
 */
function makeCheckout({ withMysqldump = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'uc-sys-05-')))
  tempDirs.push(root)
  mkdirSync(join(root, 'scripts/backup'), { recursive: true })
  cpSync(join(REPO, 'scripts/backup/backup-db.mjs'), join(root, 'scripts/backup/backup-db.mjs'))
  const bin = join(root, 'bin')
  mkdirSync(bin)
  if (withMysqldump) {
    writeFileSync(
      join(root, 'fake-mysqldump.cjs'),
      [
        "const fs = require('node:fs')",
        'const args = process.argv.slice(2)',
        "fs.appendFileSync(process.env.FAKE_MYSQLDUMP_LOG, JSON.stringify(args) + '\\n')",
        "const out = args.find((a) => a.startsWith('--result-file='))",
        "if (out) fs.writeFileSync(out.slice('--result-file='.length), '-- faux dump (test)\\nCREATE TABLE users (id INT);\\n')",
        "if (process.env.FAKE_MYSQLDUMP_MODE === 'kill') process.kill(process.pid, 'SIGKILL')",
        "process.exit(Number(process.env.FAKE_MYSQLDUMP_EXIT ?? '0'))",
      ].join('\n'),
    )
    const wrapper = join(bin, 'mysqldump')
    writeFileSync(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${join(root, 'fake-mysqldump.cjs')}" "$@"\n`)
    chmodSync(wrapper, 0o755)
  }
  return { root, bin, log: join(root, 'mysqldump-calls.jsonl') }
}

/** Dossier courant distinct du « dépôt » temporaire. */
function otherDir() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'uc-sys-05-cwd-')))
  tempDirs.push(dir)
  return dir
}

/** `node scripts/backup/backup-db.mjs [args]`, PATH réduit au seul bin/ du test. */
function backup(checkout, args = [], { env = DB_ENV, cwd = checkout.root, extraEnv = {} } = {}) {
  const res = spawnSync(process.execPath, [join(checkout.root, 'scripts/backup/backup-db.mjs'), ...args], {
    cwd,
    env: { PATH: checkout.bin, FAKE_MYSQLDUMP_LOG: checkout.log, ...env, ...extraEnv },
    encoding: 'utf8',
    timeout: TIMEOUT,
  })
  return { status: res.status, stdout: res.stdout, stderr: res.stderr }
}

/** Appels reçus par le faux mysqldump (un tableau d'arguments par appel). */
function calls(checkout) {
  if (!existsSync(checkout.log)) return []
  return readFileSync(checkout.log, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
}

const utcStamp = (date) => date.toISOString().replace(/[-:T]/g, '').slice(0, 14)

describe('UC-SYS-05 — fonctionnels (backup-db.mjs en sous-processus, sans base)', () => {
  it('UC-SYS-05-F01 — Nominal (--out) : un seul mysqldump avec les options de cohérence et d’encodage, --out relatif résolu depuis le dossier courant, fichier écrit, « backup written », code 0', () => {
    const checkout = makeCheckout()
    // Dossier courant DISTINCT de la racine du dépôt : un --out résolu depuis la
    // racine (et non depuis le dossier courant) atterrirait dans checkout.root.
    const elsewhere = otherDir()
    const out = join(elsewhere, 'copies/hebdo/dump.sql')
    const result = backup(checkout, ['--out', 'copies/hebdo/dump.sql'], { cwd: elsewhere })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toBe(`backup written: ${out}\n`)
    // --out relatif résolu depuis le dossier courant ; dossier parent créé.
    expect(calls(checkout)).toEqual([
      [
        '-hdb.exemple.test',
        '-usauveur',
        '-pmdp-factice-test',
        '--single-transaction',
        '--no-tablespaces',
        '--default-character-set=utf8mb4',
        `--result-file=${out}`,
        'humanome_test_dump',
      ],
    ])
    expect(readFileSync(out, 'utf8')).toContain('CREATE TABLE users')
    expect(existsSync(join(checkout.root, 'copies'))).toBe(false)
  }, TIMEOUT)

  it('UC-SYS-05-F02 — Nominal (défaut) : sans --out (ou --out sans valeur), backups/humanome-<AAAAMMJJHHMMSS UTC>.sql à la racine du dépôt', () => {
    const checkout = makeCheckout()
    const elsewhere = otherDir()
    const before = utcStamp(new Date())
    const first = backup(checkout, [], { cwd: elsewhere })
    const second = backup(checkout, ['--out'], { cwd: elsewhere })
    const after = utcStamp(new Date())
    expect(first.status).toBe(0)
    expect(second.status).toBe(0)
    for (const [index, result] of [first, second].entries()) {
      const match = result.stdout.match(/^backup written: (.*)\/backups\/humanome-(\d{14})\.sql\n$/)
      expect(match, result.stdout).not.toBeNull()
      expect(match[1]).toBe(checkout.root) // racine du dépôt, pas le dossier courant
      expect(match[2] >= before && match[2] <= after).toBe(true)
      expect(calls(checkout)[index].at(-2)).toBe(`--result-file=${checkout.root}/backups/humanome-${match[2]}.sql`)
    }
    expect(readdirSync(join(checkout.root, 'backups')).every((f) => /^humanome-\d{14}\.sql$/.test(f))).toBe(true)
    expect(existsSync(join(elsewhere, 'backups'))).toBe(false)
  }, TIMEOUT)

  it('UC-SYS-05-F03 — A1 : variables lues dans api/.env ; l’environnement l’emporte ; lignes de commentaire ignorées', () => {
    const checkout = makeCheckout()
    mkdirSync(join(checkout.root, 'api'))
    writeFileSync(
      join(checkout.root, 'api/.env'),
      [
        '# DB_HOST=commentaire-ignore.test',
        'DB_HOST=hote-du-fichier.test',
        'DB_NAME=base_du_fichier',
        'DB_USER=utilisateur_du_fichier',
        'DB_PASSWORD=mdp-du-fichier-test',
        'AUTRE=sans effet',
        '',
      ].join('\n'),
    )
    const fromFile = backup(checkout, ['--out', 'a.sql'], { env: {} })
    expect(fromFile.status).toBe(0)
    expect(calls(checkout)[0]).toEqual(expect.arrayContaining(['-hhote-du-fichier.test', '-uutilisateur_du_fichier', '-pmdp-du-fichier-test', 'base_du_fichier']))

    const envWins = backup(checkout, ['--out', 'b.sql'], { env: { DB_HOST: 'hote-env.test', DB_NAME: 'base_env' } })
    expect(envWins.status).toBe(0)
    const args = calls(checkout)[1]
    expect(args[0]).toBe('-hhote-env.test')
    expect(args.at(-1)).toBe('base_env')
    expect(args).toContain('-uutilisateur_du_fichier')
  }, TIMEOUT)

  it('UC-SYS-05-F04 — E1 : variable DB_* absente (ou vide dans l’environnement) → exception, code 1, mysqldump jamais lancé, aucun fichier', () => {
    for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
      const checkout = makeCheckout()
      const env = { ...DB_ENV }
      delete env[key]
      const result = backup(checkout, ['--out', 'x.sql'], { env })
      expect(result.status, key).toBe(1)
      expect(result.stderr).toContain(`Error: ${key} missing (set it in api/.env or the environment)`)
      expect(result.stdout).toBe('')
      expect(calls(checkout)).toEqual([])
      expect(existsSync(join(checkout.root, 'x.sql'))).toBe(false)
    }

    // Une variable d'environnement VIDE masque la valeur du fichier (puis est refusée).
    const checkout = makeCheckout()
    mkdirSync(join(checkout.root, 'api'))
    writeFileSync(join(checkout.root, 'api/.env'), 'DB_PASSWORD=mdp-du-fichier-test\n')
    const masked = backup(checkout, ['--out', 'x.sql'], { env: { ...DB_ENV, DB_PASSWORD: '' } })
    expect(masked.status).toBe(1)
    expect(masked.stderr).toContain('Error: DB_PASSWORD missing')
    expect(calls(checkout)).toEqual([])
  }, TIMEOUT)

  it('UC-SYS-05-F05 — E2 : mysqldump introuvable dans le PATH → message d’aide (sauvegardes OVH, docs/backup-restore.md), code 3, aucun dump', () => {
    const checkout = makeCheckout({ withMysqldump: false })
    const result = backup(checkout)
    expect(result.status).toBe(3)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe(
      'mysqldump not found on PATH. Install the MySQL client tools, or use OVH’s\nautomatic backups (Web Cloud > Databases). See docs/backup-restore.md.\n',
    )
    // Le dossier de destination est créé AVANT la tentative : il reste vide.
    expect(readdirSync(join(checkout.root, 'backups'))).toEqual([])
  }, TIMEOUT)

  it('UC-SYS-05-F06 — E3 (AN-4) : mysqldump en échec → son code de sortie est propagé, pas de « backup written », fichier partiel laissé sur disque (comportement ACTUEL) ; tué par un signal → code 1', () => {
    const checkout = makeCheckout()
    const failed = backup(checkout, [], { extraEnv: { FAKE_MYSQLDUMP_EXIT: '2' } })
    expect(failed.status).toBe(2)
    expect(failed.stdout).toBe('')
    const left = readdirSync(join(checkout.root, 'backups'))
    expect(left).toHaveLength(1)
    expect(left[0]).toMatch(/^humanome-\d{14}\.sql$/) // même nom qu'une sauvegarde réussie
    expect(readFileSync(join(checkout.root, 'backups', left[0]), 'utf8')).toContain('faux dump')

    const killed = backup(makeCheckout(), ['--out', 'k.sql'], { extraEnv: { FAKE_MYSQLDUMP_MODE: 'kill' } })
    expect(killed.status).toBe(1)
    expect(killed.stdout).toBe('')
  }, TIMEOUT)

  it('UC-SYS-05-F07 — AN-1, AN-2 : mot de passe passé en argument de ligne de commande (-p<mdp>) et DB_PORT ignoré (comportement ACTUEL)', () => {
    const checkout = makeCheckout()
    const result = backup(checkout, ['--out', 'p.sql'], { extraEnv: { DB_PORT: '3307' } })
    expect(result.status).toBe(0)
    const [args] = calls(checkout)
    // AN-1 : le secret figure dans les arguments du processus mysqldump.
    expect(args).toContain(`-p${DB_ENV.DB_PASSWORD}`)
    // AN-2 : aucune option de port, alors que l'API honore DB_PORT (api/src/Db.php).
    expect(args.some((a) => a.startsWith('-P') || a.startsWith('--port'))).toBe(false)
    expect(args.join(' ')).not.toContain('3307')
  }, TIMEOUT)

  it('UC-SYS-05-F08 — AN-3 : api/.env lu à la lettre — guillemets, commentaire de fin de ligne et espaces finaux conservés, contrairement à phpdotenv (comportement ACTUEL)', () => {
    const checkout = makeCheckout()
    mkdirSync(join(checkout.root, 'api'))
    writeFileSync(
      join(checkout.root, 'api/.env'),
      [
        'DB_HOST=hote.test',
        'DB_NAME=humanome # base principale',
        'DB_USER=u1   ',
        'DB_PASSWORD="pa ss test"',
        '',
      ].join('\n'),
    )
    const result = backup(checkout, ['--out', 'q.sql'], { env: {} })
    expect(result.status).toBe(0)
    const [args] = calls(checkout)
    // phpdotenv (API) lirait : humanome / u1 / pa ss test.
    expect(args[1]).toBe('-uu1   ')
    expect(args[2]).toBe('-p"pa ss test"')
    expect(args.at(-1)).toBe('humanome # base principale')
  }, TIMEOUT)
})
