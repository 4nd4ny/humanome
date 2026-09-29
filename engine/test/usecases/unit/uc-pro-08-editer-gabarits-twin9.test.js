// UC-PRO-08 — Éditer les gabarits du Golden Prompt Twin9 : tests FONCTIONNELS
// de niveau CLI (scripts techniques du cas d'utilisation, en sous-processus).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-08-editer-gabarits-twin9.md
// Rangés avec les tests du moteur (exécutés par la CI de publication), comme
// ceux de UC-SYS-04.
//
// Deux scripts s'exécutent dès leur chargement (main() au niveau du module,
// aucune fonction exportée) : ils sont donc rejoués par leur interface en ligne
// de commande, en SOUS-PROCESSUS, sur des dossiers temporaires FICTIFS
// (os.tmpdir()), jamais sur le dépôt :
//   - scripts/check-publiable.mjs — garde anti-fuite des gabarits (et des
//     secrets) sur les fichiers SUIVIS par git : lancé dans un dépôt git
//     temporaire ;
//   - scripts/twin9/import-protocole.mjs — acteur technique de A4 : COPIÉ dans
//     un miroir temporaire (son repoRoot devient le miroir, sans .env.deploy :
//     ni vrai jeton ni SITE_URL du poste) ; il lit TWIN_V9_DIR (ici un faux
//     Twin_v9), puis poste l'import vers un faux serveur local (127.0.0.1, port
//     éphémère) ou s'arrête en --dry-run.
// CONFIDENTIALITÉ : aucun gabarit réel ; les « gabarits » écrits ici sont
// inventés. Les motifs sensibles (fausse clé, mot de passe) sont assemblés à
// l'exécution pour que ce fichier ne déclenche pas lui-même le garde-fou.
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('../../../../', import.meta.url))
const CHECK_PUBLIABLE = join(REPO, 'scripts/check-publiable.mjs')
const IMPORT_PROTOCOLE = join(REPO, 'scripts/twin9/import-protocole.mjs')

const tempDirs = []
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

/** Dossier temporaire peuplé de fichiers {chemin relatif: contenu}. */
function dossier(prefixe, fichiers) {
  const dir = mkdtempSync(join(tmpdir(), `uc-pro-08-${prefixe}-`))
  tempDirs.push(dir)
  for (const [rel, contenu] of Object.entries(fichiers)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), contenu)
  }
  return dir
}

/** Dépôt git temporaire : `suivis` sont ajoutés à l'index, `nonSuivis` non. */
function depotGit(suivis, nonSuivis = {}) {
  const dir = dossier('publiable', { ...suivis, ...nonSuivis })
  const git = (...args) => {
    const r = spawnSync('git', ['-c', 'init.defaultBranch=main', ...args], { cwd: dir, encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} : ${r.stderr}`)
  }
  git('init', '-q')
  git('add', '--', ...Object.keys(suivis))
  return dir
}

const checkPubliable = (cwd) => spawnSync(process.execPath, [CHECK_PUBLIABLE], { cwd, encoding: 'utf8' })

/** « [id] chemin:ligne » relevés dans la sortie d'erreur du garde-fou. */
const constats = (stderr) =>
  [...stderr.matchAll(/^\s+\[([a-z0-9-]+)\] (\S+) — /gm)].map(([, id, lieu]) => `${id} ${lieu}`).sort()

// Environnement des sous-processus d'import : jeton FACTICE toujours fourni
// (jamais un MIGRATE_TOKEN hérité du poste), pas de Twin_v9 réel.
const ENV_IMPORT = { ...process.env, MIGRATE_TOKEN: 'jeton-migration-factice' }

/**
 * Copie du script d'import dans un miroir temporaire `<tmp>/scripts/twin9/` :
 * son repoRoot (tiré de son emplacement) devient le miroir, où il n'y a aucun
 * .env.deploy — le vrai fichier du poste n'est jamais lu. Créée à la demande
 * (dans un it()), une fois par fichier.
 */
let scriptImport
function importProtocole() {
  if (!scriptImport) {
    const miroir = dossier('miroir', {})
    scriptImport = join(miroir, 'scripts/twin9/import-protocole.mjs')
    mkdirSync(dirname(scriptImport), { recursive: true })
    cpSync(IMPORT_PROTOCOLE, scriptImport)
  }
  return scriptImport
}
const PYTHON = spawnSync('python3', ['--version']).status === 0

// Deux « gabarits » INVENTÉS (aucun texte du Twin_v9 réel).
const GREFFIER = 'GABARIT FICTIF DU GREFFIER {$TEXTE_JOURNEE} — contenu à ne jamais journaliser'
const TAGGING = 'Gabarit fictif de tagging {$POLE_FICHES}'

/** Faux Twin_v9 : deux gabarits hiérarchiques, du bruit, un config.json complet. */
function fauxTwinV9(extra = {}) {
  return dossier('twin-v9', {
    'protocole/lourd/20-greffier.md': GREFFIER,
    'protocole/tagger/1-tag-pole.md': TAGGING,
    'protocole/.DS_Store': 'bruit',
    'protocole/notes.txt': 'pas un gabarit',
    'config.json': JSON.stringify({
      seuils_consensus: { conf_min: 0.4 },
      jury: { mode: 'socle4+1' },
      backend_tribunal: { kind: 'claude-cli', model: 'modele-local' },
      workers: 6,
    }),
    ...extra,
  })
}

/**
 * Lance l'import depuis le miroir (asynchrone : le faux serveur tourne dans ce
 * processus). `sansJeton` retire MIGRATE_TOKEN de l'environnement.
 */
function importer(args, env = {}, { sansJeton = false } = {}) {
  const envEnfant = { ...ENV_IMPORT, ...env }
  if (sansJeton) delete envEnfant.MIGRATE_TOKEN
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [importProtocole(), ...args], { env: envEnfant })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

/** Faux serveur d'import sur 127.0.0.1 (port éphémère) : consigne chaque requête. */
async function fauxServeur(statut, reponse) {
  const requetes = []
  const serveur = createServer((req, res) => {
    let corps = ''
    req.on('data', (d) => (corps += d))
    req.on('end', () => {
      requetes.push({ method: req.method, url: req.url, headers: req.headers, body: JSON.parse(corps || 'null') })
      res.writeHead(statut, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(reponse))
    })
  })
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${serveur.address().port}`
  return { url, requetes, fermer: () => new Promise((r) => serveur.close(r)) }
}

describe('UC-PRO-08 — fonctionnels (sous-processus) : garde anti-fuite des gabarits (scripts/check-publiable.mjs)', () => {
  it('UC-PRO-08-F17 — RG8 : sur les fichiers SUIVIS par git : tout fichier sous golden-twin9/, twin9-oracles/ ou golden-prompt/ est refusé quel que soit son contenu (avec .env réel, clé Anthropic, mot de passe hors tests) → sortie 1 et liste ; un gabarit rangé ailleurs, une ligne portant un marqueur « de test », un binaire ou un fichier non suivi passent (limites) ; dépôt propre → sortie 0', () => {
    const cle = 'sk-ant-' + 'api03-' + 'Q'.repeat(24)
    const motDePasse = 'DB_' + 'PASSWORD=' + 'Sup3rS3cret'
    const depot = depotGit(
      {
        'golden-twin9/lourd/20-greffier.md': 'Gabarit fictif (contenu anodin)',
        'engine/test/twin9-oracles/oracle.json': '{}',
        'docs/golden-prompt/notes.md': 'placeholder',
        // Limite : un gabarit rangé HORS des trois répertoires n'est pas reconnu.
        'protocole/lourd/20-greffier.md': 'Tu es le greffier. {$COMPETENCE_FICHE} {$TEXTE_JOURNEE}',
        '.env': 'APP_ENV=prod\n',
        '.env.example': 'APP_ENV=prod\n',
        'config/app.ini': `ANTHROPIC_API_KEY=${cle}\n`,
        // Limite : une ligne portant un marqueur (« jamais », « test », « ... ») est ignorée.
        'config/marque.ini': `ANTHROPIC_API_KEY=${cle} ; jamais en production\n`,
        'config/db.ini': `${motDePasse}\n`,
        'tests/Fixture.php': `${motDePasse}\n`,
        'images/logo.png': `${cle}\n`,
      },
      { 'golden-twin9/non-suivi.md': 'Gabarit fictif jamais ajouté à l’index' },
    )
    const r = checkPubliable(depot)

    expect(r.status).toBe(1)
    expect(r.stderr).toContain('check-publiable : 6 occurrence(s) NON PUBLIABLE(S)')
    expect(constats(r.stderr)).toEqual([
      'cle-anthropic config/app.ini:1',
      'env-reel .env',
      'gabarit-twin9 docs/golden-prompt/notes.md',
      'gabarit-twin9 engine/test/twin9-oracles/oracle.json',
      'gabarit-twin9 golden-twin9/lourd/20-greffier.md',
      'mot-de-passe config/db.ini:1',
    ])
    expect(r.stderr).toContain('répertoire de gabarit Twin9 (jamais public)')
    // Le contenu des fichiers n'est jamais recopié dans le rapport.
    expect(r.stderr).not.toContain(cle)
    expect(r.stderr).not.toContain('Gabarit fictif')

    // Dépôt propre : sortie 0 et décompte des fichiers suivis.
    const propre = checkPubliable(depotGit({ 'README.md': '# Projet fictif\n', 'src/a.js': 'export const a = 1\n' }))
    expect(propre.status).toBe(0)
    expect(propre.stdout.trim()).toBe('check-publiable : OK — 2 fichiers suivis, aucun résidu non publiable.')
  })

  it('UC-PRO-08-F18 — limite du hook pre-commit : les CHEMINS viennent de l’index mais le CONTENU est lu dans la copie de travail — une clé indexée puis effacée du disque passe (sortie 0) ; le répertoire de gabarits, lui, reste refusé même supprimé du disque', () => {
    const cle = 'sk-ant-' + 'api03-' + 'Q'.repeat(24)
    const depot = depotGit({ 'config/app.ini': `ANTHROPIC_API_KEY=${cle}\n` })
    writeFileSync(join(depot, 'config/app.ini'), 'ANTHROPIC_API_KEY=\n') // index inchangé
    const r = checkPubliable(depot)
    expect(r.status).toBe(0)
    const indexe = spawnSync('git', ['show', ':config/app.ini'], { cwd: depot, encoding: 'utf8' }).stdout
    expect(indexe).toContain(cle) // le commit emporterait pourtant la clé

    const gabarit = depotGit({ 'golden-twin9/lourd/20-greffier.md': 'Gabarit fictif' })
    rmSync(join(gabarit, 'golden-twin9'), { recursive: true })
    const r2 = checkPubliable(gabarit)
    expect([r2.status, constats(r2.stderr)]).toEqual([1, ['gabarit-twin9 golden-twin9/lourd/20-greffier.md']])
  })
})

describe('UC-PRO-08 — fonctionnels (sous-processus) : import technique A4 (scripts/twin9/import-protocole.mjs)', () => {
  it('UC-PRO-08-F19 — A4, E4 : lecture de TWIN_V9_DIR : protocole/**/*.md seuls, noms hiérarchiques sans .md ; réglages du pipeline filtrés (jamais les backends Python) ; --dry-run n’envoie rien et ne journalise que noms et tailles, jamais le contenu ; dossier absent, protocole vide ou option inconnue → sortie 1', async () => {
    const twin = fauxTwinV9()
    const r = await importer(['--dry-run'], { TWIN_V9_DIR: twin })

    expect(r.status).toBe(0)
    expect(r.stdout.split('\n').filter(Boolean)).toEqual([
      `Twin_v9 dir: ${twin}`,
      `  lourd/20-greffier (${Buffer.byteLength(GREFFIER, 'utf8')} bytes)`,
      `  tagger/1-tag-pole (${Buffer.byteLength(TAGGING, 'utf8')} bytes)`,
      'config keys: seuils_consensus, jury',
      'referentiel absent',
      'fiches absentes',
      'dry-run: nothing sent',
    ])
    // Faux Twin_v9 sans module aurora : référentiel et fiches non extraits, avertissement.
    expect(r.stderr).toContain('referentiel/fiches NOT extracted')
    expect(r.stdout + r.stderr).not.toContain('GABARIT FICTIF')
    expect(r.stdout + r.stderr).not.toContain('tagging')

    const absent = await importer(['--dry-run'], { TWIN_V9_DIR: join(twin, 'inexistant') })
    expect([absent.status, absent.stderr.trim()]).toEqual([
      1,
      `Twin_v9 protocole directory not found: ${join(twin, 'inexistant', 'protocole')} (set TWIN_V9_DIR)`,
    ])
    const vide = dossier('twin-v9-vide', { 'protocole/lisez-moi.txt': 'aucun gabarit' })
    const sansGabarit = await importer(['--dry-run'], { TWIN_V9_DIR: vide })
    expect([sansGabarit.status, sansGabarit.stderr.trim()]).toEqual([1, `No .md template found under ${join(vide, 'protocole')}`])
    // Toujours avec --dry-run : même si l'option inconnue cessait d'être
    // refusée, rien ne pourrait partir.
    const option = await importer(['--dry-run', '--envoyer-tout'], { TWIN_V9_DIR: twin })
    expect([option.status, option.stderr.trim(), option.stdout]).toEqual([1, 'Unknown option: --envoyer-tout', ''])
  })

  it('UC-PRO-08-F20 — A4, E4 : envoi : POST {base}/api/admin/twin9/import avec X-Migrate-Token et {files, config} (sans référentiel ni fiches s’ils n’ont pu être extraits) ; réponse journalisée ; refus du serveur → sortie 1 « twin9 import failed »', async () => {
    const twin = fauxTwinV9()
    const ok = await fauxServeur(200, { imported: 2 })
    try {
      const r = await importer(['--base-url', ok.url], { TWIN_V9_DIR: twin })
      expect(r.status).toBe(0)
      expect(r.stdout).toContain('import: HTTP 200 {"imported":2}')
      expect(ok.requetes).toHaveLength(1)
      const [req] = ok.requetes
      expect([req.method, req.url, req.headers['x-migrate-token'], req.headers['content-type']]).toEqual([
        'POST',
        '/api/admin/twin9/import',
        'jeton-migration-factice',
        'application/json',
      ])
      expect(req.body).toEqual({
        files: { 'lourd/20-greffier': GREFFIER, 'tagger/1-tag-pole': TAGGING },
        config: { seuils_consensus: { conf_min: 0.4 }, jury: { mode: 'socle4+1' } },
      })
    } finally {
      await ok.fermer()
    }

    const refus = await fauxServeur(403, { error: 'Jeton invalide' })
    try {
      const r = await importer(['--base-url', refus.url], { TWIN_V9_DIR: twin })
      expect(r.status).toBe(1)
      expect(r.stdout).toContain('import: HTTP 403 {"error":"Jeton invalide"}')
      expect(r.stderr.trim().split('\n').at(-1)).toBe('twin9 import failed')
    } finally {
      await refus.fermer()
    }
  })

  it.skipIf(!PYTHON)('UC-PRO-08-F21 — A4 : extraction par le Twin_v9 lui-même (python3, module aurora) : référentiel NON secret réduit à num/nom et code/nom, fiches confidentielles (en-tête, fiche_md) envoyées à part, pôles triés ; aucun texte de fiche journalisé', async () => {
    const twin = fauxTwinV9({
      'aurora/__init__.py': '',
      'aurora/referentiel.py': [
        'class _Pole:',
        '    def __init__(self, nom, header, competences):',
        '        self.nom, self.header, self.competences = nom, header, competences',
        'def load_referentiel(dossier):',
        '    return {',
        "        2: _Pole('CŒUR', 'En-tête fictif P2', [{'code': '2.01', 'nom': 'Écoute active', 'fiche_md': 'FICHE FICTIVE 2.01'}]),",
        "        1: _Pole('TÊTE', 'En-tête fictif P1', [{'code': '1.01', 'nom': 'Pensée critique', 'fiche_md': 'FICHE FICTIVE 1.01'},",
        "                                               {'code': '1.02', 'nom': 'Cadrage', 'fiche_md': 'FICHE FICTIVE 1.02'}]),",
        '    }',
        '',
      ].join('\n'),
    })
    const srv = await fauxServeur(200, { imported: 2 })
    try {
      const r = await importer(['--base-url', srv.url], { TWIN_V9_DIR: twin, PYTHONDONTWRITEBYTECODE: '1' })
      expect(r.status).toBe(0)
      expect(r.stdout).toContain('referentiel: 2 pôles')
      expect(r.stdout).toContain('fiches: 3 confidentielles')
      expect(r.stdout + r.stderr).not.toContain('FICHE FICTIVE')
      const { body } = srv.requetes[0]
      expect(body.referentiel).toEqual([
        { num: 1, nom: 'TÊTE', competences: [{ code: '1.01', nom: 'Pensée critique' }, { code: '1.02', nom: 'Cadrage' }] },
        { num: 2, nom: 'CŒUR', competences: [{ code: '2.01', nom: 'Écoute active' }] },
      ])
      expect(body.fiches).toEqual([
        {
          num: 1,
          header: 'En-tête fictif P1',
          competences: [
            { code: '1.01', fiche_md: 'FICHE FICTIVE 1.01' },
            { code: '1.02', fiche_md: 'FICHE FICTIVE 1.02' },
          ],
        },
        { num: 2, header: 'En-tête fictif P2', competences: [{ code: '2.01', fiche_md: 'FICHE FICTIVE 2.01' }] },
      ])
    } finally {
      await srv.fermer()
    }
  })

  it('UC-PRO-08-F22 — E4 : jeton introuvable (ni MIGRATE_TOKEN dans l’environnement, ni .env.deploy) → sortie 1 « MIGRATE_TOKEN missing (.env.deploy or environment) », après la liste des noms, sans aucun envoi', async () => {
    const twin = fauxTwinV9()
    const srv = await fauxServeur(200, { imported: 2 })
    try {
      const r = await importer(['--base-url', srv.url], { TWIN_V9_DIR: twin }, { sansJeton: true })
      expect(r.status).toBe(1)
      expect(r.stderr.trim().split('\n').at(-1)).toBe('MIGRATE_TOKEN missing (.env.deploy or environment)')
      expect(r.stdout).toContain('  lourd/20-greffier (')
      expect(r.stdout).not.toContain('import: HTTP')
      expect(srv.requetes).toEqual([])
      expect(r.stdout + r.stderr).not.toContain('GABARIT FICTIF')
    } finally {
      await srv.fermer()
    }
  })
})
