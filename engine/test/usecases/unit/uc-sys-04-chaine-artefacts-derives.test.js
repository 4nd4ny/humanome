// UC-SYS-04 — Construire les données et artefacts dérivés : tests FONCTIONNELS.
// Fiche : docs/cas-utilisation/systeme/UC-SYS-04-construire-artefacts-derives.md
//
// Chaque script de la chaîne est exécuté en SOUS-PROCESSUS (`node <script>`),
// exactement comme le mainteneur, stage-api.sh ou le prebuild web le lancent,
// mais dans un MIROIR TEMPORAIRE (os.tmpdir()) : copie des scripts et des seules
// entrées versionnées (assets-existants/merge-prototype, scripts/data, schemas,
// engine/src, docs, content/formation). Les scripts résolvent leurs chemins
// depuis leur propre emplacement : ils lisent et écrivent donc dans le miroir,
// jamais dans le dépôt partagé. engine/node_modules est relié en lecture seule
// (ajv, pour build-validators et les validateurs du moteur).
//
// Les sorties sont validées aux schémas par le validateur VERSIONNÉ du moteur
// (engine/src/validation.js) — sauf quand le test montre précisément sa
// dérive (AN-1) — et leur déterminisme est vérifié octet par octet.
// dump-fiches.mjs interroge un serveur HTTP local éphémère (127.0.0.1) qui
// simule GET /api/admin/dump-fiches : aucun appel réseau réel.
//
// Les dossiers temporaires passent par realpathSync : quand os.tmpdir()
// traverse un lien symbolique (macOS : /var/folders → /private/var/folders),
// Node résout le point d'entrée d'un script, pas process.argv[1] ; les scripts
// à garde CLI ne feraient alors rien (AN-4, figé par F16) et les autres
// imprimeraient des chemins résolus, différents de ceux du test.
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { ENGINE_VERSION } from '../../../src/index.js'
import { validateDocument } from '../../../src/validation.js'

const REPO = fileURLToPath(new URL('../../../../', import.meta.url))
const TIMEOUT = 120_000

/** Scripts de la chaîne et entrées versionnées copiés dans chaque miroir. */
const BASE_FILES = [
  'scripts/convert/carto-data-to-merge-json.mjs',
  'scripts/convert/extracted-to-day-json.mjs',
  'scripts/convert/lib/carto-data-parser.mjs',
  'scripts/extract-referentiel.mjs',
  'scripts/enrich-referentiel.mjs',
  'scripts/extract-fiches.mjs',
  'scripts/generate-fiches.mjs',
  'scripts/dump-fiches.mjs',
  'scripts/build-default-prompt-package.mjs',
  'scripts/build-twin6-package.mjs',
  'scripts/build-twin6-prompt-package.mjs',
  'scripts/build-validators.mjs',
  'scripts/validate-corpus.mjs',
  'scripts/build-gitbook-summary.mjs',
  'scripts/data/fiches-v7.json',
  'scripts/data/referentiel-v7-definitions.json',
  'engine/package.json',
]
const ASSET_FILES = [
  'assets-existants/merge-prototype/carto-data.js',
  'assets-existants/merge-prototype/intermediate/carto_merge.json',
  'assets-existants/merge-prototype/extracted',
]

const REF_DIR = 'web/public/data/referentiel'
const PROMPTS_DIR = 'web/public/data/twin6/prompts'

const tempDirs = []
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

function copyInto(root, rel, filter) {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  cpSync(join(REPO, rel), join(root, rel), { recursive: true, filter })
}

/** Miroir temporaire : scripts + entrées versionnées (+ corpus amont, + docs). */
function makeMirror({ assets = false, docs = false } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'uc-sys-04-mirror-')))
  tempDirs.push(root)
  for (const rel of BASE_FILES) copyInto(root, rel)
  copyInto(root, 'engine/src', (src) => !src.endsWith('.test.js') && !src.includes('__pycache__'))
  copyInto(root, 'schemas')
  symlinkSync(join(REPO, 'engine/node_modules'), join(root, 'engine/node_modules'), 'dir')
  if (assets) for (const rel of ASSET_FILES) copyInto(root, rel)
  if (docs) {
    copyInto(root, 'docs')
    copyInto(root, 'content/formation')
  }
  return root
}

/** Environnement minimal et maîtrisé (aucune variable héritée du poste). */
function cleanEnv(extra = {}) {
  return { PATH: process.env.PATH ?? '', NO_PROXY: '127.0.0.1,localhost', ...extra }
}

/** `node <script> [args]` dans le miroir (cwd = racine du miroir, sauf `cwd`). */
function run(root, script, args = [], { env = {}, cwd = root } = {}) {
  const res = spawnSync(process.execPath, [join(root, script), ...args], {
    cwd,
    env: cleanEnv(env),
    encoding: 'utf8',
    timeout: TIMEOUT,
  })
  return { status: res.status, stdout: res.stdout, stderr: res.stderr }
}

/** Variante asynchrone (le serveur HTTP local tourne dans CE processus). */
function runAsync(root, script, args = [], { env = {} } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [join(root, script), ...args], { cwd: root, env: cleanEnv(env) })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (status) => resolvePromise({ status, stdout, stderr }))
  })
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
/** Empreintes octet par octet de tous les fichiers d'un dossier. */
function dirDigest(dir) {
  return Object.fromEntries(readdirSync(dir).sort().map((name) => [name, sha(join(dir, name))]))
}
function expectOk(result) {
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
}

// Miroir de référence : corpus démo converti + référentiels 7.0.0 et 7.1.0
// (étapes 1 à 3), construit une fois, à la demande, dans un it().
let chain = null
function chainMirror() {
  if (chain) return chain
  const root = makeMirror({ assets: true })
  const logs = {
    merge: run(root, 'scripts/convert/carto-data-to-merge-json.mjs'),
    jours: run(root, 'scripts/convert/extracted-to-day-json.mjs'),
    referentiel: run(root, 'scripts/extract-referentiel.mjs'),
    enrich: run(root, 'scripts/enrich-referentiel.mjs'),
  }
  chain = { root, logs }
  return chain
}

/** Miroir de base auquel on ajoute des artefacts déjà produits par la chaîne. */
function mirrorWith(rels, options) {
  const { root: source } = chainMirror()
  const root = makeMirror(options)
  for (const rel of rels) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    cpSync(join(source, rel), join(root, rel), { recursive: true })
  }
  return root
}

/** Valide un document avec les validateurs (re)compilés DANS le miroir. */
function validateInMirror(root, kind, file) {
  const runner = join(root, 'uc-sys-04-validate.mjs')
  writeFileSync(
    runner,
    [
      "import { readFileSync } from 'node:fs'",
      "import { validateDocument } from './engine/src/validation.js'",
      'const [kind, file] = process.argv.slice(2)',
      "console.log(JSON.stringify(validateDocument(kind, JSON.parse(readFileSync(file, 'utf8')))))",
    ].join('\n'),
  )
  const result = run(root, 'uc-sys-04-validate.mjs', [kind, file])
  expectOk(result)
  return JSON.parse(result.stdout)
}

/** Serveur HTTP local simulant GET /api/admin/dump-fiches. */
async function withDumpServer(handler, fn) {
  const requests = []
  const server = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, token: req.headers['x-migrate-token'] })
    handler(req, res)
  })
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    return await fn(base, requests)
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolvePromise) => server.close(resolvePromise))
  }
}
const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

/** Gabarits Twin6 SYNTHÉTIQUES (non versionnés dans le dépôt : AN-2). */
const TWIN6_GABARITS = {
  '0-mega-prompt.md': '# Méga-prompt Twin6 — gabarit synthétique de test\n',
  '1-scan-pole.md': '# Scan du pôle ${POLE} — gabarit synthétique de test\n',
  '2-kairos-final.md': '# Kairos final — gabarit synthétique de test\n',
}

describe('UC-SYS-04 — fonctionnels (scripts en sous-processus, miroir temporaire)', () => {
  it('UC-SYS-04-F01 — Nominal, étape 1 : conversions du corpus démo → merge.json et 59 journées conformes aux schémas, index chronologique, sorties identiques octet pour octet au second passage', () => {
    const { root, logs } = chainMirror()
    expectOk(logs.merge)
    expect(logs.merge.stdout).toMatch(/^merge document: 7 poles, 59 feuilles, \d+ Ko -> .*web\/public\/data\/demo\/merge\.json\n$/)
    expectOk(logs.jours)
    expect(logs.jours.stdout).toMatch(/^59 day documents -> .*web\/public\/data\/demo\/jours\n$/)

    const merge = readJson(join(root, 'web/public/data/demo/merge.json'))
    expect(validateDocument('cartographie-merge', merge)).toEqual({ valid: true, errors: [] })
    expect(merge.periode).toEqual({ premiere: '2025-12-22', derniere: '2026-03-29', nbFeuilles: 59 })

    const joursDir = join(root, 'web/public/data/demo/jours')
    const index = readJson(join(joursDir, 'index.json'))
    const dates = readdirSync(join(root, 'assets-existants/merge-prototype/extracted')).sort()
    expect(index).toEqual(dates.map((date, ordre) => ({ date, iso: date, label: date.split('-').reverse().join('/'), ordre })))
    for (const date of dates) {
      const day = readJson(join(joursDir, `${date}.json`))
      expect(day.date).toBe(date)
      const result = validateDocument('cartographie-jour', day)
      expect(result.errors, date).toEqual([])
    }
    expect(readdirSync(joursDir)).toHaveLength(dates.length + 1)

    const before = { merge: sha(join(root, 'web/public/data/demo/merge.json')), jours: dirDigest(joursDir) }
    expectOk(run(root, 'scripts/convert/carto-data-to-merge-json.mjs'))
    expectOk(run(root, 'scripts/convert/extracted-to-day-json.mjs'))
    expect({ merge: sha(join(root, 'web/public/data/demo/merge.json')), jours: dirDigest(joursDir) }).toEqual(before)
  }, TIMEOUT)

  it('UC-SYS-04-F02 — A1, E1 : chemins explicites en argument, relatifs résolus depuis le dossier courant (distinct de la racine du dépôt), dossiers non datés ignorés ; constante ou pôle amont manquant → code 1, sortie non écrite', () => {
    const { root } = chainMirror()
    // Dossier courant DISTINCT de la racine du miroir : un chemin relatif résolu
    // depuis la racine du dépôt (et non depuis le dossier courant) manquerait
    // l'entrée ou écrirait la sortie ailleurs.
    const out = realpathSync(mkdtempSync(join(tmpdir(), 'uc-sys-04-args-')))
    tempDirs.push(out)
    const fromOut = (rel) => relative(out, join(root, rel))
    const inOut = { cwd: out }
    const nothingInRoot = (rel) => expect(existsSync(join(root, rel)), rel).toBe(false)

    // carto-data-to-merge-json [input.js] [output.json]
    const merge = run(
      root,
      'scripts/convert/carto-data-to-merge-json.mjs',
      [fromOut('assets-existants/merge-prototype/carto-data.js'), 'sous/dossier/merge.json'],
      inOut,
    )
    expectOk(merge)
    expect(merge.stdout.endsWith(` -> ${join(out, 'sous/dossier/merge.json')}\n`)).toBe(true)
    expect(sha(join(out, 'sous/dossier/merge.json'))).toBe(sha(join(root, 'web/public/data/demo/merge.json')))
    nothingInRoot('sous')

    // extracted-to-day-json [extractedDir] [outputDir] : seuls les dossiers AAAA-MM-JJ comptent.
    const extracted = join(out, 'extracted')
    cpSync(join(root, 'assets-existants/merge-prototype/extracted/2026-01-06'), join(extracted, '2026-01-06'), { recursive: true })
    mkdirSync(join(extracted, 'brouillons'))
    writeFileSync(join(extracted, 'brouillons', 'carto_P1.json'), '{}')
    writeFileSync(join(extracted, 'LISEZMOI.json'), '{}')
    const days = run(root, 'scripts/convert/extracted-to-day-json.mjs', ['extracted', 'jours'], inOut)
    expectOk(days)
    expect(days.stdout).toBe(`1 day documents -> ${join(out, 'jours')}\n`)
    expect(readdirSync(join(out, 'jours')).sort()).toEqual(['2026-01-06.json', 'index.json'])
    expect(readJson(join(out, 'jours/index.json'))).toEqual([
      { date: '2026-01-06', iso: '2026-01-06', label: '06/01/2026', ordre: 0 },
    ])
    nothingInRoot('jours')

    // extract-referentiel [cartoMergeJson] [cartoDataJs] [output.json]
    const ref = run(
      root,
      'scripts/extract-referentiel.mjs',
      [
        fromOut('assets-existants/merge-prototype/intermediate/carto_merge.json'),
        fromOut('assets-existants/merge-prototype/carto-data.js'),
        'ref.json',
      ],
      inOut,
    )
    expectOk(ref)
    expect(ref.stdout.endsWith(` -> ${join(out, 'ref.json')}\n`)).toBe(true)
    expect(sha(join(out, 'ref.json'))).toBe(sha(join(root, REF_DIR, 'respire-v7.json')))
    nothingInRoot('ref.json')

    // enrich-referentiel [base 7.0.0] [définitions] [sortie 7.1.0]
    const enrich = run(
      root,
      'scripts/enrich-referentiel.mjs',
      ['ref.json', fromOut('scripts/data/referentiel-v7-definitions.json'), 'ref-7.1.0.json'],
      inOut,
    )
    expectOk(enrich)
    expect(enrich.stdout.endsWith(` -> ${join(out, 'ref-7.1.0.json')}\n`)).toBe(true)
    expect(sha(join(out, 'ref-7.1.0.json'))).toBe(sha(join(root, REF_DIR, 'respire-v7.1.0.json')))
    nothingInRoot('ref-7.1.0.json')

    // E1 : un carto-data.js sans kairosHtml est refusé, sans sortie.
    const source = readFileSync(join(root, 'assets-existants/merge-prototype/carto-data.js'), 'utf8')
    writeFileSync(
      join(out, 'carto-data-sans-kairos.js'),
      source.replace(/^const kairosHtml = /m, 'const kairosHtmlRenomme = ').replace('const rapportHtml = kairosHtml;', 'const rapportHtml = kairosHtmlRenomme;'),
    )
    const refused = run(root, 'scripts/convert/carto-data-to-merge-json.mjs', ['carto-data-sans-kairos.js', 'refuse.json'], inOut)
    expect(refused.status).toBe(1)
    expect(refused.stderr).toContain('Missing const kairosHtml in carto-data.js')
    expect(existsSync(join(out, 'refuse.json'))).toBe(false)

    // E1 : une journée sans carto_P4.json arrête la conversion.
    rmSync(join(extracted, '2026-01-06', 'carto_P4.json'))
    const noPole = run(root, 'scripts/convert/extracted-to-day-json.mjs', ['extracted', 'jours-ko'], inOut)
    expect(noPole.status).toBe(1)
    expect(noPole.stderr).toContain('2026-01-06: missing carto_P4.json')
    expect(existsSync(join(out, 'jours-ko/index.json'))).toBe(false)
  }, TIMEOUT)

  it('UC-SYS-04-F03 — Nominal, étape 2 : extract-referentiel → RESPIRE 7.0.0 conforme (7 pôles colorés, 61 compétences), contentHash = sha256 du corps, identique à la fixture versionnée, déterministe', () => {
    const { root, logs } = chainMirror()
    expectOk(logs.referentiel)
    expect(logs.referentiel.stdout).toMatch(/^referentiel RESPIRE v7: 7 poles, 61 competences -> .*respire-v7\.json\n$/)
    const file = join(root, REF_DIR, 'respire-v7.json')
    const ref = readJson(file)
    expect(validateDocument('referentiel', ref)).toEqual({ valid: true, errors: [] })
    expect(ref).toMatchObject({ schemaVersion: '1.0.0', kind: 'referentiel', id: 'respire', version: '7.0.0', label: 'RESPIRE v7' })
    expect(ref.poles.map((p) => p.num)).toEqual([1, 2, 3, 4, 5, 6, 7])
    for (const pole of ref.poles) expect(pole.couleur).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(ref.competences).toHaveLength(61)
    expect(ref.competences.map((c) => c.code)).toEqual([...ref.competences.map((c) => c.code)].sort())
    const body = { poles: ref.poles, competences: ref.competences }
    expect(ref.contentHash).toBe(createHash('sha256').update(JSON.stringify(body)).digest('hex'))

    const fixture = readJson(join(root, 'schemas/fixtures/referentiel-respire-v7.json'))
    expect({ poles: ref.poles, competences: ref.competences, contentHash: ref.contentHash }).toEqual({
      poles: fixture.poles,
      competences: fixture.competences,
      contentHash: fixture.contentHash,
    })

    const before = sha(file)
    expectOk(run(root, 'scripts/extract-referentiel.mjs'))
    expect(sha(file)).toBe(before)
  }, TIMEOUT)

  it('UC-SYS-04-F04 — Nominal, étape 3 : enrich-referentiel → 7.1.0 avec les 61 définitions versionnées, MÊME contentHash que 7.0.0, déterministe', () => {
    const { root, logs } = chainMirror()
    expectOk(logs.enrich)
    const base = readJson(join(root, REF_DIR, 'respire-v7.json'))
    expect(logs.enrich.stdout).toBe(
      `RESPIRE v7.1 : 7 pôles, 61 compétences (définitions ajoutées), hash ${base.contentHash.slice(0, 12)}… === 7.0.0 -> ${join(root, REF_DIR, 'respire-v7.1.0.json')}\n`,
    )
    const file = join(root, REF_DIR, 'respire-v7.1.0.json')
    const enriched = readJson(file)
    expect(enriched).toMatchObject({ kind: 'referentiel', id: 'respire', version: '7.1.0', label: 'RESPIRE v7.1' })
    expect(enriched.contentHash).toBe(base.contentHash)
    expect(enriched.poles).toEqual(base.poles)
    const definitions = readJson(join(root, 'scripts/data/referentiel-v7-definitions.json')).definitions
    expect(enriched.competences).toEqual(base.competences.map((c) => ({ ...c, description: definitions[c.code] })))
    expect(readFileSync(file, 'utf8').endsWith('}\n')).toBe(true)

    const before = sha(file)
    expectOk(run(root, 'scripts/enrich-referentiel.mjs'))
    expect(sha(file)).toBe(before)
  }, TIMEOUT)

  it('UC-SYS-04-F05 — E2 (AN-3) : définitions manquantes ou surnuméraires → code 1 sans sortie ; structure modifiée → code 1 mais 7.1.0 déjà écrit (comportement ACTUEL)', () => {
    const root = mirrorWith([`${REF_DIR}/respire-v7.json`])
    const basePath = join(root, REF_DIR, 'respire-v7.json')
    const defsPath = join(root, 'scripts/data/referentiel-v7-definitions.json')
    const defs = readJson(defsPath)

    const missingDefs = join(root, 'defs-manquante.json')
    const withoutFirst = { ...defs, definitions: { ...defs.definitions } }
    delete withoutFirst.definitions['1.01']
    writeFileSync(missingDefs, JSON.stringify(withoutFirst))
    const missing = run(root, 'scripts/enrich-referentiel.mjs', [basePath, missingDefs, join(root, 'out-manquante.json')])
    expect(missing.status).toBe(1)
    expect(missing.stderr).toBe('Définitions manquantes pour 1 compétence(s) : 1.01\n')
    expect(existsSync(join(root, 'out-manquante.json'))).toBe(false)

    const extraDefs = join(root, 'defs-surnumeraire.json')
    writeFileSync(extraDefs, JSON.stringify({ ...defs, definitions: { ...defs.definitions, '9.99': 'Inventée' } }))
    const extra = run(root, 'scripts/enrich-referentiel.mjs', [basePath, extraDefs, join(root, 'out-surnumeraire.json')])
    expect(extra.status).toBe(1)
    expect(extra.stderr).toBe('Définitions surnuméraires (codes inconnus) : 9.99\n')
    expect(existsSync(join(root, 'out-surnumeraire.json'))).toBe(false)

    // Base dont la structure a changé (nom modifié) mais qui garde l'ancien hash.
    const base = readJson(basePath)
    const drifted = { ...base, competences: base.competences.map((c, i) => (i === 0 ? { ...c, nom: `${c.nom} (modifié)` } : c)) }
    const driftedPath = join(root, 'base-modifiee.json')
    writeFileSync(driftedPath, JSON.stringify(drifted))
    const outPath = join(root, 'out-modifiee.json')
    const changed = run(root, 'scripts/enrich-referentiel.mjs', [driftedPath, defsPath, outPath])
    expect(changed.status).toBe(1)
    expect(changed.stderr).toMatch(new RegExp(`^ATTENTION : le hash [0-9a-f]{64} diffère de 7\\.0\\.0 ${base.contentHash} — la structure a changé \\(attendu identique\\)\\.\\n$`))
    // Comportement ACTUEL (AN-3) : la sortie est écrite AVANT le contrôle du hash.
    expect(existsSync(outPath)).toBe(true)
    const written = readJson(outPath)
    expect(written.version).toBe('7.1.0')
    expect(written.contentHash).not.toBe(base.contentHash)
  }, TIMEOUT)

  it('UC-SYS-04-F06 — Nominal, étape 4 (AN-1) : build-validators recompile des validateurs identiques d’un passage à l’autre, qui acceptent le 7.1.0 ; les validateurs VERSIONNÉS le refusent (comportement ACTUEL)', () => {
    const root = mirrorWith([`${REF_DIR}/respire-v7.json`, `${REF_DIR}/respire-v7.1.0.json`])
    const compiled = join(root, 'engine/src/validation-compiled.js')
    const first = run(root, 'scripts/build-validators.mjs')
    expectOk(first)
    expect(first.stdout).toMatch(/^validators compiled -> .*engine\/src\/validation-compiled\.js \(\d+ Ko\)\nsmoke: real referentiel validates OK \(eval-free\)\n$/)
    const text = readFileSync(compiled, 'utf8')
    expect(text.startsWith('// GENERATED FILE — do not edit. Rebuild with: node scripts/build-validators.mjs\n')).toBe(true)
    expect(text).not.toMatch(/\brequire\(/) // aides ajv remontées en imports ESM
    expect(text).not.toMatch(/new Function|\beval\(/)
    const firstHash = sha(compiled)
    expectOk(run(root, 'scripts/build-validators.mjs'))
    expect(sha(compiled)).toBe(firstHash)

    const v700File = join(root, REF_DIR, 'respire-v7.json')
    const v710File = join(root, REF_DIR, 'respire-v7.1.0.json')
    const v710 = readJson(v710File)
    expect(validateInMirror(root, 'referentiel', v700File)).toEqual({ valid: true, errors: [] })
    expect(validateInMirror(root, 'referentiel', v710File)).toEqual({ valid: true, errors: [] })
    expect(validateDocument('referentiel', readJson(v700File)).valid).toBe(true)

    // Comportement ACTUEL (AN-1) : engine/src/validation-compiled.js versionné
    // précède l'ajout de competences[].description au schéma.
    const stale = validateDocument('referentiel', v710)
    expect(stale.valid).toBe(false)
    expect(stale.errors).toHaveLength(61)
    expect(new Set(stale.errors.map((e) => `${e.keyword}|${e.message}`))).toEqual(
      new Set(['additionalProperties|must NOT have additional properties']),
    )
    expect(stale.errors.map((e) => e.path)).toEqual(v710.competences.map((_, i) => `/competences/${i}`))

    // Conséquence : une archive qui embarque ce référentiel est refusée par le moteur versionné.
    const archive = readJson(join(root, 'schemas/fixtures/archive-export-exemple.json'))
    archive.referentiels = [v710]
    const archiveFile = join(root, 'archive-avec-7.1.0.json')
    writeFileSync(archiveFile, JSON.stringify(archive))
    const staleArchive = validateDocument('archive-export', archive)
    expect(staleArchive.valid).toBe(false)
    expect(staleArchive.errors.some((e) => e.path === '/referentiels/0/competences/0' && e.keyword === 'additionalProperties')).toBe(true)
    expect(validateInMirror(root, 'archive-export', archiveFile)).toEqual({ valid: true, errors: [] })
  }, TIMEOUT)

  it('UC-SYS-04-F07 — Nominal, étape 5, E6 : validate-corpus → tout le corpus démo, le 7.0.0 et les fixtures OK (code 0) ; document non conforme, JSON illisible ou kind absent → KO, code 1', () => {
    const root = mirrorWith(['web/public/data/demo', `${REF_DIR}/respire-v7.json`])
    const fixtures = readdirSync(join(root, 'schemas/fixtures')).filter((name) => name.endsWith('.json'))
    const days = readdirSync(join(root, 'web/public/data/demo/jours')).filter((name) => name !== 'index.json')
    const total = days.length + 2 + fixtures.length
    expect(days).toHaveLength(59)

    const ok = run(root, 'scripts/validate-corpus.mjs')
    expectOk(ok)
    const lines = ok.stdout.trimEnd().split('\n')
    expect(lines.at(-1)).toBe(`${total} OK, 0 KO sur ${total} fichiers`)
    expect(lines).toContain('OK  web/public/data/demo/merge.json  (cartographie-merge)')
    expect(lines).toContain('OK  web/public/data/referentiel/respire-v7.json  (referentiel)')
    expect(lines).toContain('OK  schemas/fixtures/archive-export-exemple.json  (archive-export)')
    expect(ok.stdout).not.toContain('index.json')
    // Hors périmètre : le 7.1.0 n'est jamais validé par cette étape (voir AN-1).
    expect(ok.stdout).not.toContain('respire-v7.1.0')

    const jours = join(root, 'web/public/data/demo/jours')
    const day = readJson(join(jours, '2026-01-06.json'))
    delete day.kairos
    writeFileSync(join(jours, '2026-01-06.json'), JSON.stringify(day))
    writeFileSync(join(jours, '2026-01-07.json'), '{')
    writeFileSync(join(root, 'web/public/data/demo/merge.json'), JSON.stringify({ kind: 'cartographie-merge' }))
    writeFileSync(join(root, 'schemas/fixtures/zz-sans-kind.json'), '{}')

    const ko = run(root, 'scripts/validate-corpus.mjs')
    expect(ko.status).toBe(1)
    expect(ko.stdout).toContain(
      "KO  web/public/data/demo/jours/2026-01-06.json  (cartographie-jour) — 1 erreur(s)\n    / [required] must have required property 'kairos'\n",
    )
    expect(ko.stdout).toMatch(/KO {2}web\/public\/data\/demo\/jours\/2026-01-07\.json\n {4}JSON illisible : /)
    expect(ko.stdout).toContain('KO  web/public/data/demo/merge.json  (cartographie-merge) — 10 erreur(s)\n')
    expect(ko.stdout).toContain('    … 2 erreur(s) supplémentaire(s)\n')
    expect(ko.stdout).toContain('KO  schemas/fixtures/zz-sans-kind.json\n    kind inconnu ou absent : undefined\n')
    expect(ko.stdout.trimEnd().split('\n').at(-1)).toBe(`${total - 3} OK, 4 KO sur ${total + 1} fichiers`)
  }, TIMEOUT)

  it('UC-SYS-04-F08 — E3 : prérequis non générés → validate-corpus, build-default-prompt-package, build-twin6-prompt-package et build-validators échouent (ENOENT, code 1) ; seuls les validateurs sont déjà réécrits', () => {
    const root = makeMirror()
    const corpus = run(root, 'scripts/validate-corpus.mjs')
    expect(corpus.status).toBe(1)
    expect(corpus.stderr).toContain('ENOENT')
    expect(corpus.stderr).toContain('web/public/data/demo/jours')

    const pkg = run(root, 'scripts/build-default-prompt-package.mjs')
    expect(pkg.status).toBe(1)
    expect(pkg.stderr).toContain('ENOENT')
    expect(pkg.stderr).toContain(`${REF_DIR}/respire-v7.json`)
    expect(existsSync(join(root, 'build'))).toBe(false)

    const twin6 = run(root, 'scripts/build-twin6-prompt-package.mjs')
    expect(twin6.status).toBe(1)
    expect(twin6.stderr).toContain(`${REF_DIR}/respire-v7.json`)
    expect(existsSync(join(root, 'build'))).toBe(false)

    // build-validators écrit les validateurs AVANT sa fumée : l'échec de la
    // fumée (référentiel absent) laisse validation-compiled.js réécrit.
    const compiled = join(root, 'engine/src/validation-compiled.js')
    rmSync(compiled)
    const validators = run(root, 'scripts/build-validators.mjs')
    expect(validators.status).toBe(1)
    expect(validators.stdout).toMatch(/^validators compiled -> /)
    expect(validators.stderr).toContain(`${REF_DIR}/respire-v7.json`)
    expect(existsSync(compiled)).toBe(true)
  }, TIMEOUT)

  it('UC-SYS-04-F09 — Nominal, étape 7, E7 (RG2, RG5) : paquet par défaut aurora-v3-reconstruit conforme, gabarits à placeholders, déterministe ; dérive d’un gabarit du moteur → construction refusée', () => {
    const root = mirrorWith([`${REF_DIR}/respire-v7.json`])
    const out = join(root, 'build/prompt-packages/aurora-v3-reconstruit-1.0.0.json')
    const first = run(root, 'scripts/build-default-prompt-package.mjs')
    expectOk(first)
    expect(first.stdout).toBe(`wrote build/prompt-packages/aurora-v3-reconstruit-1.0.0.json (5 prompts, engine ${ENGINE_VERSION})\n`)
    const pkg = readJson(out)
    expect(validateDocument('prompt-package', pkg)).toEqual({ valid: true, errors: [] })
    expect(pkg).toMatchObject({ kind: 'prompt-package', id: 'aurora-v3-reconstruit', version: '1.0.0' })
    expect(pkg.prompts.map((p) => p.role)).toEqual([
      'extraction-pole',
      'kairos',
      'narratif-competence',
      'narratif-pole',
      'narratif-kairos',
    ])
    expect(pkg.metadata).toMatchObject({ creeLe: '2026-07-12T00:00:00Z', publieLe: '2026-07-12T00:00:00Z' })
    const extraction = pkg.prompts[0].texte
    for (const placeholder of ['{{portfolio_texte}}', '{{referentiel_pole_bloc}}', '{{pole_nom}}', '{{date_fr}}', '{{date_iso}}', '{{codes_liste}}']) {
      expect(extraction).toContain(placeholder)
    }
    const all = pkg.prompts.map((p) => p.texte).join('\n')
    expect(all).not.toContain('TEXTE_INTEGRAL_DE_LA_FEUILLE_DU_JOUR')
    expect(all).not.toContain('2026-01-05')
    expect(all).not.toMatch(/__[A-Z_]+__/)
    // Chaque variable documentée apparaît dans son gabarit.
    for (const prompt of pkg.prompts) {
      for (const variable of prompt.variables) expect(prompt.texte, `${prompt.role}:${variable.nom}`).toContain(`{{${variable.nom}}}`)
    }

    const firstHash = sha(out)
    expectOk(run(root, 'scripts/build-default-prompt-package.mjs'))
    expect(sha(out)).toBe(firstHash)

    // RG5, E7 : un gabarit du moteur qui dérive casse la construction.
    const extractJs = join(root, 'engine/src/pipeline/extract.js')
    const source = readFileSync(extractJs, 'utf8')
    expect(source).toContain('(= ${codes.length})')
    writeFileSync(extractJs, source.replace('(= ${codes.length})', '(total ${codes.length})'))
    rmSync(join(root, 'build'), { recursive: true })
    const drift = run(root, 'scripts/build-default-prompt-package.mjs')
    expect(drift.status).toBe(1)
    expect(drift.stderr).toContain('build-default-prompt-package: expected substring not found:\n--- (= 10)')
    expect(existsSync(join(root, 'build'))).toBe(false)
  }, TIMEOUT)

  it('UC-SYS-04-F10 — Nominal, étape 6, A3, A4, E4 : generate-fiches → 7 P*.md, --verify OK ; extract-fiches redonne le corpus versionné octet pour octet ; parité rompue → code 1, corpus intact', () => {
    const root = makeMirror()
    const corpusPath = join(root, 'scripts/data/fiches-v7.json')
    const versioned = sha(corpusPath)
    const corpus = readJson(corpusPath)
    mkdirSync(join(root, PROMPTS_DIR), { recursive: true })

    const generated = run(root, 'scripts/generate-fiches.mjs')
    expectOk(generated)
    expect(generated.stdout).toMatch(/^7 P\*\.md régénérés depuis le corpus \(source unique\) → /)
    expect(readdirSync(join(root, PROMPTS_DIR)).sort()).toEqual(['P1.md', 'P2.md', 'P3.md', 'P4.md', 'P5.md', 'P6.md', 'P7.md'])
    for (let n = 1; n <= 7; n += 1) {
      const text = readFileSync(join(root, PROMPTS_DIR, `P${n}.md`), 'utf8')
      expect(text.startsWith(corpus.poleHeaders[String(n)])).toBe(true)
      expect(text.endsWith('\n')).toBe(true)
    }

    const verify = run(root, 'scripts/generate-fiches.mjs', ['--verify'])
    expectOk(verify)
    expect(verify.stdout).toBe('parité OK : les 7 P*.md sont byte-identiques au corpus fiches-v7.json.\n')

    const extracted = run(root, 'scripts/extract-fiches.mjs')
    expectOk(extracted)
    expect(extracted.stdout).toMatch(/^parité octet OK sur 7\/7 pôles · 61 fiches de compétence · 7 en-têtes → /)
    expect(sha(corpusPath)).toBe(versioned)

    // E4 : un P1.md altéré (saut de ligne final retiré).
    const p1 = join(root, PROMPTS_DIR, 'P1.md')
    const original = readFileSync(p1, 'utf8')
    writeFileSync(p1, original.slice(0, -1))
    const parity = run(root, 'scripts/extract-fiches.mjs')
    expect(parity.status).toBe(1)
    expect(parity.stderr).toContain(`ÉCHEC PARITÉ P1.md : régénéré (${original.length} o) ≠ source (${original.length - 1} o)`)
    expect(sha(corpusPath)).toBe(versioned)
    const diverge = run(root, 'scripts/generate-fiches.mjs', ['--verify'])
    expect(diverge.status).toBe(1)
    expect(diverge.stderr).toBe(
      `P1.md DIFFÈRE du corpus (${original.length} o généré ≠ ${original.length - 1} o actuel)\nÉCHEC : 1 P*.md divergent du corpus.\n`,
    )
    expect(readFileSync(p1, 'utf8')).toBe(original.slice(0, -1)) // --verify n'écrit rien
    expectOk(run(root, 'scripts/generate-fiches.mjs'))
    expect(readFileSync(p1, 'utf8')).toBe(original)

    // E4 : un code présent dans deux pôles (section 1.01 ajoutée à P2.md, parité intacte).
    const p2 = join(root, PROMPTS_DIR, 'P2.md')
    writeFileSync(p2, `${readFileSync(p2, 'utf8')}\n## 1.01 — Doublon\ncorps du doublon\n`)
    const duplicate = run(root, 'scripts/extract-fiches.mjs')
    expect(duplicate.status).toBe(1)
    expect(duplicate.stderr).toBe('Code dupliqué entre pôles : 1.01\n')
    expect(sha(corpusPath)).toBe(versioned)

    // E4 : corpus sans en-tête du pôle 3 → generate-fiches s'arrête au pôle 3.
    const noHeader = readJson(corpusPath)
    delete noHeader.poleHeaders['3']
    writeFileSync(corpusPath, JSON.stringify(noHeader))
    rmSync(join(root, PROMPTS_DIR), { recursive: true })
    mkdirSync(join(root, PROMPTS_DIR))
    const header = run(root, 'scripts/generate-fiches.mjs')
    expect(header.status).toBe(1)
    expect(header.stderr).toBe('En-tête de pôle manquant : 3\n')
    expect(readdirSync(join(root, PROMPTS_DIR)).sort()).toEqual(['P1.md', 'P2.md'])
  }, TIMEOUT)

  it('UC-SYS-04-F11 — E5 (AN-2) : depuis les seules entrées versionnées, generate-fiches échoue (dossier des P*.md absent) et les deux paquets Twin6 aussi (gabarits Twin6 absents) — comportement ACTUEL', () => {
    const root = mirrorWith([`${REF_DIR}/respire-v7.json`])
    const generate = run(root, 'scripts/generate-fiches.mjs')
    expect(generate.status).toBe(1)
    expect(generate.stderr).toContain('ENOENT')
    expect(generate.stderr).toContain(`${PROMPTS_DIR}/P1.md`)

    mkdirSync(join(root, PROMPTS_DIR), { recursive: true })
    expectOk(run(root, 'scripts/generate-fiches.mjs'))
    for (const script of ['scripts/build-twin6-package.mjs', 'scripts/build-twin6-prompt-package.mjs']) {
      const result = run(root, script)
      expect(result.status, script).toBe(1)
      expect(result.stderr, script).toContain(`Error: prompt manquant : ${join(root, PROMPTS_DIR, '1-scan-pole.md')}`)
    }
    expect(existsSync(join(root, 'web/public/data/twin6/twin6-ouverte-1.0.0.json'))).toBe(false)
    expect(existsSync(join(root, 'build'))).toBe(false)
  }, TIMEOUT)

  it('UC-SYS-04-F12 — Nominal, étapes 6-7, RG6 : gabarits Twin6 fournis → paquet statique et prompt-package « twin6-ouverte » conformes, textes octet pour octet identiques aux P*.md, réservé, déterministes', () => {
    const root = mirrorWith([`${REF_DIR}/respire-v7.json`])
    mkdirSync(join(root, PROMPTS_DIR), { recursive: true })
    for (const [name, text] of Object.entries(TWIN6_GABARITS)) writeFileSync(join(root, PROMPTS_DIR, name), text)
    expectOk(run(root, 'scripts/generate-fiches.mjs'))

    const staticOut = join(root, 'web/public/data/twin6/twin6-ouverte-1.0.0.json')
    const packageOut = join(root, 'build/prompt-packages/twin6-ouverte-1.0.0.json')
    const staticRun = run(root, 'scripts/build-twin6-package.mjs')
    expectOk(staticRun)
    expect(staticRun.stdout).toMatch(/^écrit .*twin6-ouverte-1\.0\.0\.json \(\d+ octets\)\n {2}scanPole \d+ car\., kairos \d+ car\., 7 fiches\n$/)
    const packageRun = run(root, 'scripts/build-twin6-prompt-package.mjs')
    expectOk(packageRun)
    expect(packageRun.stdout).toBe(
      `wrote build/prompt-packages/twin6-ouverte-1.0.0.json (10 prompts : scan-pole + kairos + mega + 7 fiches, engine ${ENGINE_VERSION})\n`,
    )

    const staticPkg = readJson(staticOut)
    const pkg = readJson(packageOut)
    expect(validateDocument('prompt-package', pkg)).toEqual({ valid: true, errors: [] })
    expect(pkg).toMatchObject({ id: 'twin6-ouverte', version: '1.0.0', code: { entrypoint: 'executerTwin6' } })
    expect(pkg.metadata.reserved).toBe(true)
    expect(pkg.code.orchestration).toContain(`engine://humanome-engine@${ENGINE_VERSION} (twin6)`)
    expect(pkg.changelog[0].date).toBe('2026-07-16')
    expect(staticPkg).toMatchObject({ id: 'twin6-ouverte', version: '1.0.0', metadata: { nbAppelsParRun: 8 } })
    expect(staticPkg.kind).toBeUndefined() // paquet statique : pas un document prompt-package
    // Paquet statique : aucun schéma ; forme exacte du contrat executerTwin6
    // (gabarits scanPole, kairos, megaPrompt et fiches 1..7), rien de plus.
    expect(Object.keys(staticPkg)).toEqual([
      'schemaVersion',
      'id',
      'version',
      'nom',
      'description',
      'auteur',
      'licence',
      'referentielCompatible',
      'modeleCibleDefaut',
      'scanPole',
      'kairos',
      'megaPrompt',
      'fiches',
      'metadata',
    ])
    expect(Object.keys(staticPkg.fiches)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(staticPkg.referentielCompatible).toEqual({ id: 'respire', versionMin: '7.0.0' })

    const byRole = Object.fromEntries(pkg.prompts.map((p) => [p.role, p]))
    expect(Object.keys(byRole)).toEqual([
      'twin6-scan-pole',
      'twin6-kairos',
      'twin6-mega-prompt',
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => `twin6-fiche-${n}`),
    ])
    expect(byRole['twin6-scan-pole'].texte).toBe(TWIN6_GABARITS['1-scan-pole.md'])
    expect(staticPkg.scanPole).toBe(TWIN6_GABARITS['1-scan-pole.md'])
    expect(byRole['twin6-kairos'].texte).toBe(staticPkg.kairos)
    expect(byRole['twin6-mega-prompt'].texte).toBe(staticPkg.megaPrompt)
    const referentiel = readJson(join(root, REF_DIR, 'respire-v7.json'))
    for (let n = 1; n <= 7; n += 1) {
      const pn = readFileSync(join(root, PROMPTS_DIR, `P${n}.md`), 'utf8')
      expect(byRole[`twin6-fiche-${n}`].texte).toBe(pn)
      expect(staticPkg.fiches[String(n)]).toBe(pn)
      expect(byRole[`twin6-fiche-${n}`].nom).toBe(`Fiche des compétences — Pôle ${n} : ${referentiel.poles[n - 1].nom}`)
    }

    const hashes = [sha(staticOut), sha(packageOut)]
    expectOk(run(root, 'scripts/build-twin6-package.mjs'))
    expectOk(run(root, 'scripts/build-twin6-prompt-package.mjs'))
    expect([sha(staticOut), sha(packageOut)]).toEqual(hashes)
  }, TIMEOUT)

  it('UC-SYS-04-F13 — A2 : dump-fiches réécrit le corpus depuis GET /api/admin/dump-fiches (jeton en en-tête), octet pour octet identique au corpus versionné ; .env.deploy lu à défaut d’environnement', async () => {
    const root = makeMirror()
    const corpusPath = join(root, 'scripts/data/fiches-v7.json')
    const versionedText = readFileSync(corpusPath, 'utf8')
    const versioned = JSON.parse(versionedText)
    writeFileSync(corpusPath, '{"perime": true}\n')

    await withDumpServer(
      (req, res) => sendJson(res, 200, { poleHeaders: versioned.poleHeaders, fiches: versioned.fiches, extra: 'ignoré' }),
      async (base, requests) => {
        const result = await runAsync(root, 'scripts/dump-fiches.mjs', [], {
          env: { SITE_URL: base, MIGRATE_TOKEN: 'jeton-de-test' },
        })
        expect(result.stderr).toBe('')
        expect(result.status).toBe(0)
        expect(result.stdout).toBe(`corpus re-synchronisé depuis ${base} : 61 fiches, 7 en-têtes → ${corpusPath}\n`)
        expect(requests).toEqual([{ method: 'GET', url: '/api/admin/dump-fiches', token: 'jeton-de-test' }])
        // _comment identique à extract-fiches.mjs : corpus stable quelle que soit sa provenance.
        expect(readFileSync(corpusPath, 'utf8')).toBe(versionedText)

        // Sans variable d'environnement : SITE_URL et MIGRATE_TOKEN lus dans .env.deploy.
        writeFileSync(join(root, '.env.deploy'), `# commentaire\nSITE_URL=${base}\nMIGRATE_TOKEN=jeton-du-fichier-test\n`)
        const fromFile = await runAsync(root, 'scripts/dump-fiches.mjs')
        expect(fromFile.status).toBe(0)
        expect(requests.at(-1).token).toBe('jeton-du-fichier-test')
        // L'environnement l'emporte sur .env.deploy.
        const fromEnv = await runAsync(root, 'scripts/dump-fiches.mjs', [], { env: { MIGRATE_TOKEN: 'jeton-env-test' } })
        expect(fromEnv.status).toBe(0)
        expect(requests.at(-1).token).toBe('jeton-env-test')
        // Ni environnement ni fichier pour le jeton : jeton de développement par défaut.
        rmSync(join(root, '.env.deploy'))
        const fallback = await runAsync(root, 'scripts/dump-fiches.mjs', [], { env: { SITE_URL: base } })
        expect(fallback.status).toBe(0)
        expect(requests.at(-1).token).toBe('dev_migrate_token')
        expect(requests).toHaveLength(4)
      },
    )
  }, TIMEOUT)

  it('UC-SYS-04-F14 — A2 (erreurs) : réponse non 2xx, réponse sans poleHeaders/fiches ou serveur injoignable → code 1, corpus intact', async () => {
    const root = makeMirror()
    const corpusPath = join(root, 'scripts/data/fiches-v7.json')
    const versioned = sha(corpusPath)
    const env = (base) => ({ env: { SITE_URL: base, MIGRATE_TOKEN: 'jeton-faux-test' } })

    await withDumpServer(
      (req, res) => sendJson(res, 403, { error: 'Jeton invalide' }),
      async (base) => {
        const result = await runAsync(root, 'scripts/dump-fiches.mjs', [], env(base))
        expect(result.status).toBe(1)
        expect(result.stderr).toBe('dump-fiches: HTTP 403 {"error":"Jeton invalide"}\n')
      },
    )
    expect(sha(corpusPath)).toBe(versioned)

    await withDumpServer(
      (req, res) => sendJson(res, 200, { poleHeaders: { 1: '# P1' } }),
      async (base) => {
        const result = await runAsync(root, 'scripts/dump-fiches.mjs', [], env(base))
        expect(result.status).toBe(1)
        expect(result.stderr).toBe('dump-fiches: réponse inattendue (poleHeaders/fiches manquants)\n')
      },
    )
    expect(sha(corpusPath)).toBe(versioned)

    // Port fermé : fetch échoue, exception non rattrapée.
    const closedBase = await withDumpServer(() => {}, async (base) => base)
    const unreachable = await runAsync(root, 'scripts/dump-fiches.mjs', [], env(closedBase))
    expect(unreachable.status).toBe(1)
    expect(unreachable.stderr).toContain('fetch failed')
    expect(sha(corpusPath)).toBe(versioned)
  }, TIMEOUT)

  it('UC-SYS-04-F15 — A5 : build-gitbook-summary → SUMMARY.md listant manuels, documentation, toutes les fiches de cas d’utilisation et tous les ADR ; déterministe ; titres manquants remplacés par le nom de fichier', () => {
    const root = makeMirror({ docs: true })
    const summaryPath = join(root, 'SUMMARY.md')
    const first = run(root, 'scripts/build-gitbook-summary.mjs')
    expectOk(first)
    const summary = readFileSync(summaryPath, 'utf8')
    const links = summary.split('\n').filter((line) => line.includes(']('))
    expect(first.stdout).toBe(`wrote SUMMARY.md (${links.length} entrées)\n`)
    expect(summary.startsWith('# Sommaire\n\n## Manuels par rôle\n\n* [Visiteur — découvrir](content/formation/visiteur/index.md)\n')).toBe(true)
    expect(summary).toContain(
      "* [Visiteur — découvrir](content/formation/visiteur/index.md)\n  * [Qu'est-ce qu'une cartographie de compétences humaines](content/formation/visiteur/01-qu-est-ce-qu-une-cartographie.md)\n",
    )
    expect(summary).toContain('## Cas d’utilisation\n\n* [Cas d\'utilisation — catalogue et traçabilité des tests](docs/cas-utilisation/README.md)\n')

    // Toutes les fiches présentes, par acteur dans l'ordre du catalogue ;
    // titre = `titre:` du front-matter, sinon premier H1, sinon nom de fichier.
    const titleOf = (text, fallback) =>
      text.match(/^---\n([\s\S]*?)\n---/)?.[1].match(/^titre:\s*["']?(.+?)["']?\s*$/m)?.[1].trim() ??
      text.match(/^#\s+(.+?)\s*$/m)?.[1].trim() ??
      fallback
    const actors = ['visiteur', 'compte', 'apprenant', 'cartographe', 'employeur', 'promptologue', 'epistemiarque', 'etablissement', 'administration', 'systeme']
    const expectedUseCases = []
    for (const actor of actors) {
      const dir = join(root, 'docs/cas-utilisation', actor)
      for (const file of readdirSync(dir).filter((f) => /^UC-.*\.md$/.test(f)).sort()) {
        const title = titleOf(readFileSync(join(dir, file), 'utf8'), file)
        expectedUseCases.push(`    * [${title}](docs/cas-utilisation/${actor}/${file})`)
      }
    }
    expect(expectedUseCases.length).toBeGreaterThan(40)
    const useCaseLines = summary.split('\n').filter((line) => line.startsWith('    * [') && line.includes('](docs/cas-utilisation/'))
    expect(useCaseLines).toEqual(expectedUseCases)
    expect(useCaseLines.some((line) => line.includes('UC-SYS-04-construire-artefacts-derives.md'))).toBe(true)
    const adrs = readdirSync(join(root, 'docs/decisions')).filter((f) => /^ADR-.*\.md$/.test(f)).sort()
    expect(summary.split('\n').filter((line) => line.includes('](docs/decisions/')).map((line) => line.replace(/^.*\]\((.*)\)$/, '$1'))).toEqual(
      adrs.map((f) => `docs/decisions/${f}`),
    )

    const hash = sha(summaryPath)
    expectOk(run(root, 'scripts/build-gitbook-summary.mjs'))
    expect(sha(summaryPath)).toBe(hash)

    // Document listé mais absent : le nom de fichier sert de titre ; parcours absent : entrée seule.
    rmSync(join(root, 'docs/plan-masse.md'))
    rmSync(join(root, 'content/formation/noesiologie'), { recursive: true })
    expectOk(run(root, 'scripts/build-gitbook-summary.mjs'))
    const degraded = readFileSync(summaryPath, 'utf8')
    expect(degraded).toContain('  * [plan-masse.md](docs/plan-masse.md)\n')
    expect(degraded).toContain(
      '* [Noésiologie — les fondements](content/formation/noesiologie/index.md)\n* [Administration — exploiter la plateforme](content/formation/admin/index.md)\n',
    )
  }, TIMEOUT)

  it('UC-SYS-04-F16 — AN-4 : lancés par un chemin qui traverse un lien symbolique, les quatre scripts à garde CLI sortent en 0 sans rien faire ni rien afficher (comportement ACTUEL) ; par le chemin réel, ils travaillent', () => {
    // Miroir complet : corpus amont, 7.0.0, gabarits Twin6 synthétiques et P*.md
    // (chaque script aurait donc de quoi travailler) ; corpus des fiches périmé.
    const root = mirrorWith([`${REF_DIR}/respire-v7.json`], { assets: true })
    mkdirSync(join(root, PROMPTS_DIR), { recursive: true })
    for (const [name, text] of Object.entries(TWIN6_GABARITS)) writeFileSync(join(root, PROMPTS_DIR, name), text)
    expectOk(run(root, 'scripts/generate-fiches.mjs'))
    const corpusPath = join(root, 'scripts/data/fiches-v7.json')
    const versioned = readFileSync(corpusPath, 'utf8')
    writeFileSync(corpusPath, '{"perime": true}\n')

    // Chemin LOGIQUE <liens>/depot → miroir, comme `$repo` calculé par `pwd`
    // dans stage-api.sh lancé depuis un dossier atteint par un lien.
    const links = realpathSync(mkdtempSync(join(tmpdir(), 'uc-sys-04-link-')))
    tempDirs.push(links)
    const logical = join(links, 'depot')
    symlinkSync(root, logical, 'dir')
    const guarded = [
      'scripts/convert/carto-data-to-merge-json.mjs', // process.argv[1] === fileURLToPath(import.meta.url)
      'scripts/convert/extracted-to-day-json.mjs', // idem
      'scripts/extract-fiches.mjs', // import.meta.url === pathToFileURL(argv[1]).href
      'scripts/build-twin6-prompt-package.mjs', // fileURLToPath(import.meta.url) === resolve(process.argv[1])
    ]
    // Comportement ACTUEL (AN-4) : Node résout le lien pour import.meta.url, pas
    // pour process.argv[1] : la garde est fausse, main() n'est jamais appelé.
    for (const script of guarded) {
      expect(run(logical, script), script).toEqual({ status: 0, stdout: '', stderr: '' })
    }
    expect(existsSync(join(root, 'web/public/data/demo'))).toBe(false)
    expect(readFileSync(corpusPath, 'utf8')).toBe('{"perime": true}\n')
    expect(existsSync(join(root, 'build'))).toBe(false)

    // Témoin : les mêmes scripts, lancés par le chemin réel, font leur travail.
    for (const script of guarded) expectOk(run(root, script))
    expect(existsSync(join(root, 'web/public/data/demo/merge.json'))).toBe(true)
    expect(readdirSync(join(root, 'web/public/data/demo/jours'))).toHaveLength(60)
    expect(readFileSync(corpusPath, 'utf8')).toBe(versioned)
    expect(existsSync(join(root, 'build/prompt-packages/twin6-ouverte-1.0.0.json'))).toBe(true)
  }, TIMEOUT)
})
