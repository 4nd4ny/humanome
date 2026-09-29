// UC-SYS-04 — Construire les données et artefacts dérivés : tests UNITAIRES.
// Fiche : docs/cas-utilisation/systeme/UC-SYS-04-construire-artefacts-derives.md
//
// Seules les fonctions EXPORTÉES par les scripts de la chaîne sont appelées
// directement (les autres scripts s'exécutent dès l'import : ils sont rejoués
// en sous-processus par uc-sys-04-chaine-artefacts-derives.test.js) :
// parseCartoDataFile (scripts/convert/lib), toMergeDocument,
// toDayDocument / frenchLabel (scripts/convert), reassembleFiche
// (scripts/extract-fiches.mjs, règle b), plus le contrat d'ordre de la chaîne
// réelle (stage-api.sh, prebuild web, deploy.mjs), lu dans les fichiers
// versionnés.
//
// Contraintes CI moteur : entrées VERSIONNÉES uniquement (assets-existants en
// lecture seule, scripts/data, schemas), lectures dans les it() seulement,
// écritures dans os.tmpdir() seulement.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { validateDocument } from '../../../src/validation.js'
import { parsePole } from '../../../src/twin9/referentiel.js'
import { parseCartoDataFile } from '../../../../scripts/convert/lib/carto-data-parser.mjs'
import { toMergeDocument } from '../../../../scripts/convert/carto-data-to-merge-json.mjs'
import { frenchLabel, toDayDocument } from '../../../../scripts/convert/extracted-to-day-json.mjs'
import { reassembleFiche } from '../../../../scripts/extract-fiches.mjs'

const REPO = fileURLToPath(new URL('../../../../', import.meta.url))
const CARTO_DATA = join(REPO, 'assets-existants/merge-prototype/carto-data.js')
const EXTRACTED = join(REPO, 'assets-existants/merge-prototype/extracted')

const tempDirs = []
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

/** Écrit un carto-data.js synthétique dans un dossier temporaire. */
function syntheticCartoData(text) {
  const dir = mkdtempSync(join(tmpdir(), 'uc-sys-04-parser-'))
  tempDirs.push(dir)
  const file = join(dir, 'carto-data.js')
  writeFileSync(file, text)
  return file
}

/** Les 8 fichiers bruts d'une journée extraite (lecture paresseuse). */
function extractedDay(date) {
  const files = {}
  for (const name of readdirSync(join(EXTRACTED, date))) {
    files[name] = JSON.parse(readFileSync(join(EXTRACTED, date, name), 'utf8'))
  }
  return files
}

const MINIMAL_CONSTS = () => ({
  domainsData: [],
  profilMeta: { premiere_date: '2026-01-05', derniere_date: '2026-01-06', nb_feuilles: 2 },
  kairosHtml: '<p>kairos</p>',
  profilIpsatif: {},
  feuillesData: [],
})

describe('UC-SYS-04 — unitaires', () => {
  it('UC-SYS-04-U01 — parseCartoDataFile : les 10 constantes du carto-data.js réel, alias rapportHtml et littéral JS non JSON compris', () => {
    const consts = parseCartoDataFile(CARTO_DATA)
    expect(Object.keys(consts)).toEqual([
      'domainsData',
      'profilMeta',
      'kairosHtml',
      'profilIpsatif',
      'feuillesData',
      'rapportHtml',
      'connexionsData',
      'noeudsConceptuels',
      'patternTemporel',
      'piecesData',
    ])
    // `const rapportHtml = kairosHtml;` : alias résolu vers la MÊME valeur.
    expect(consts.rapportHtml).toBe(consts.kairosHtml)
    expect(consts.kairosHtml.length).toBeGreaterThan(1000)
    // `{ pattern: '', description: '' }` n'est pas du JSON : repli « objet JS simple ».
    expect(consts.patternTemporel).toEqual({ pattern: '', description: '' })
    expect(consts.connexionsData).toEqual([])
    expect(consts.piecesData).toEqual({})
    expect(consts.domainsData).toHaveLength(7)
    for (const domain of consts.domainsData) {
      expect(typeof domain.id).toBe('string')
      expect(domain.color).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
    expect(consts.profilMeta).toMatchObject({
      premiere_date: '2025-12-22',
      derniere_date: '2026-03-29',
      nb_feuilles: 59,
    })
    expect(consts.feuillesData).toHaveLength(59)
  })

  it('UC-SYS-04-U02 — parseCartoDataFile : déclarations en colonne 0 seulement, littéral multiligne, erreurs explicites, jamais d’exécution du fichier', () => {
    const ok = parseCartoDataFile(
      syntheticCartoData(
        [
          '// en-tête ignoré',
          '  const indentee = 5;', // pas en colonne 0 : ignorée
          'const a = {',
          '  "x": [1,',
          '    2]',
          '};',
          'const b = a;',
          "const c = { pattern: 'p', description: '' };",
          'const d = []',
          '',
        ].join('\n'),
      ),
    )
    expect(Object.keys(ok)).toEqual(['a', 'b', 'c', 'd'])
    expect(ok.a).toEqual({ x: [1, 2] })
    expect(ok.b).toBe(ok.a)
    expect(ok.c).toEqual({ pattern: 'p', description: '' })
    expect(ok.d).toEqual([])

    expect(() => parseCartoDataFile(syntheticCartoData('// vide\nvar x = 1;\n'))).toThrow(
      /^No top-level const declaration found in .*carto-data\.js$/,
    )
    expect(() => parseCartoDataFile(syntheticCartoData('const a = 1;\nconst b = zz;\n'))).toThrow(
      'const b references unknown identifier zz',
    )
    // Du code exécutable n'est JAMAIS évalué : il est refusé comme littéral.
    delete globalThis.__ucSys04Evalue
    expect(() =>
      parseCartoDataFile(syntheticCartoData('const a = (globalThis.__ucSys04Evalue = 1);\n')),
    ).toThrow('const a: literal is neither JSON nor a simple JS object')
    expect(globalThis.__ucSys04Evalue).toBeUndefined()
  })

  it('UC-SYS-04-U03 — toMergeDocument : document cartographie-merge conforme depuis le corpus réel, valeurs par défaut, constante requise manquante refusée', () => {
    const consts = parseCartoDataFile(CARTO_DATA)
    const doc = toMergeDocument(consts)
    const { valid, errors } = validateDocument('cartographie-merge', doc)
    expect(errors).toEqual([])
    expect(valid).toBe(true)
    expect(doc).toMatchObject({
      schemaVersion: '1.0.0',
      kind: 'cartographie-merge',
      generatedAt: consts.profilMeta.date_construction,
      periode: { premiere: '2025-12-22', derniere: '2026-03-29', nbFeuilles: 59 },
    })
    expect(doc.source).toEqual({
      protocole: consts.profilMeta.source_protocole,
      journalId: consts.profilMeta.journal_id,
    })
    // Noms de champs conservés tels quels (docs/contrats.md) : recopie, pas de renommage interne.
    expect(doc.domains).toBe(consts.domainsData)
    expect(doc.feuilles).toBe(consts.feuillesData)
    expect(doc.profilMeta).toBe(consts.profilMeta)
    expect(doc.narratifs.rapportHtml).toBe(doc.narratifs.kairosHtml)

    const minimal = toMergeDocument(MINIMAL_CONSTS())
    expect(minimal.generatedAt).toBeNull()
    expect(minimal.source).toEqual({ protocole: null, journalId: null })
    expect(minimal.periode).toEqual({ premiere: '2026-01-05', derniere: '2026-01-06', nbFeuilles: 2 })
    expect(minimal.narratifs).toEqual({ kairosHtml: '<p>kairos</p>', rapportHtml: '<p>kairos</p>' })
    expect(minimal.reserved).toEqual({
      connexionsData: [],
      noeudsConceptuels: [],
      patternTemporel: { pattern: '', description: '' },
      piecesData: {},
    })

    for (const name of ['domainsData', 'profilMeta', 'kairosHtml', 'profilIpsatif', 'feuillesData']) {
      const partial = MINIMAL_CONSTS()
      delete partial[name]
      expect(() => toMergeDocument(partial)).toThrow(`Missing const ${name} in carto-data.js`)
    }
  })

  it('UC-SYS-04-U04 — toDayDocument / frenchLabel : pôles remis dans l’ordre P1..P7, kairos facultatif, pôle manquant refusé, journée réelle conforme', () => {
    const pole = (n) => ({ poleNum: n })
    const shuffled = {
      'kairos.json': { kairos: 'k' },
      'carto_P7.json': pole(7),
      'notes.json': { ignore: true },
      'carto_P3.json': pole(3),
      'carto_P1.json': pole(1),
      'carto_P5.json': pole(5),
      'carto_P2.json': pole(2),
      'carto_P6.json': pole(6),
      'carto_P4.json': pole(4),
    }
    const doc = toDayDocument('2026-01-06', shuffled)
    expect(doc).toEqual({
      schemaVersion: '1.0.0',
      kind: 'cartographie-jour',
      date: '2026-01-06',
      poles: [1, 2, 3, 4, 5, 6, 7].map(pole),
      kairos: { kairos: 'k' },
    })

    const withoutKairos = { ...shuffled }
    delete withoutKairos['kairos.json']
    expect(toDayDocument('2026-01-06', withoutKairos).kairos).toBeNull()

    const missing = { ...shuffled }
    delete missing['carto_P4.json']
    expect(() => toDayDocument('2026-01-06', missing)).toThrow('2026-01-06: missing carto_P4.json')

    expect(frenchLabel('2026-01-06')).toBe('06/01/2026')
    expect(frenchLabel('2025-12-22')).toBe('22/12/2025')

    const real = toDayDocument('2026-01-06', extractedDay('2026-01-06'))
    expect(validateDocument('cartographie-jour', real)).toEqual({ valid: true, errors: [] })
    // Données amont recopiées telles quelles : poleNum y est une CHAÎNE.
    expect(real.poles.map((p) => p.poleNum)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    const realWithoutKairos = { ...real, kairos: null }
    expect(validateDocument('cartographie-jour', realWithoutKairos).valid).toBe(true)
  })

  it('UC-SYS-04-U05 — reassembleFiche (règle b) : en-tête + fiches jointes par une ligne vide + saut final ; aller-retour octet pour octet avec parsePole sur le corpus versionné', () => {
    expect(
      reassembleFiche('# Pôle 9\n\nIntro\n\n', [{ fiche_md: '## 9.01 — A\ncorps A' }, { fiche_md: '## 9.02 — B\ncorps B' }]),
    ).toBe('# Pôle 9\n\nIntro\n\n## 9.01 — A\ncorps A\n\n## 9.02 — B\ncorps B\n')
    expect(reassembleFiche('H', [])).toBe('H\n')

    const corpus = JSON.parse(readFileSync(join(REPO, 'scripts/data/fiches-v7.json'), 'utf8'))
    let total = 0
    for (let n = 1; n <= 7; n += 1) {
      // Ordre de generate-fiches.mjs : codes du pôle triés.
      const codes = Object.keys(corpus.fiches)
        .filter((code) => code.startsWith(`${n}.`))
        .sort()
      const text = reassembleFiche(
        corpus.poleHeaders[String(n)],
        codes.map((code) => ({ fiche_md: corpus.fiches[code] })),
      )
      const parsed = parsePole(text, n)
      expect(parsed.header).toBe(corpus.poleHeaders[String(n)])
      expect(parsed.competences.map((c) => c.code)).toEqual(codes)
      expect(parsed.competences.map((c) => c.fiche_md)).toEqual(codes.map((code) => corpus.fiches[code]))
      // Preuve d'extract-fiches.mjs : régénérer depuis l'analyse redonne la source.
      expect(reassembleFiche(parsed.header, parsed.competences)).toBe(text)
      total += codes.length
    }
    expect(total).toBe(61)
  })

  it('UC-SYS-04-U06 — Ordre réel de la chaîne : stage-api.sh (digest tuteur avant la copie de scripts/data, puis paquets aurora et Twin6), prebuild web, imports de deploy.mjs — lignes ACTIVES seulement', () => {
    // Seules les lignes actives comptent : une étape commentée (`# node …`) ou
    // neutralisée (`: …; # node …`) ne satisfait pas les expressions ancrées.
    const stage = readFileSync(join(REPO, 'scripts/deploy/stage-api.sh'), 'utf8')
    const active = stage
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))
    expect(active).toContain('set -euo pipefail')
    const step = (re) => {
      const index = active.findIndex((line) => re.test(line))
      expect(index, String(re)).toBeGreaterThanOrEqual(0)
      return index
    }
    const order = [
      step(/^cp "\$repo\/schemas\/"\*\.schema\.json "\$stage\/schemas\/"$/),
      step(/^node "\$repo\/scripts\/build-tuteur-digest\.mjs"$/),
      step(/^cp -R "\$repo\/scripts\/data\/\." "\$stage\/scripts\/data\/"$/),
      step(/^node "\$repo\/scripts\/build-default-prompt-package\.mjs"$/),
      step(/^node "\$repo\/scripts\/build-twin6-prompt-package\.mjs"$/),
      step(/^composer install --no-dev\b/),
    ]
    // Indices strictement croissants.
    for (let i = 1; i < order.length; i += 1) expect(order[i], `étape ${i}`).toBeGreaterThan(order[i - 1])
    // Prérequis MANUELS : aucune ligne active de stage-api.sh ne les rejoue.
    const activeText = active.join('\n')
    for (const manual of [
      'carto-data-to-merge-json',
      'extracted-to-day-json',
      'extract-referentiel',
      'enrich-referentiel',
      'generate-fiches',
      'extract-fiches',
      'dump-fiches',
      'build-validators',
      'build-twin6-package.mjs',
      'validate-corpus',
      'build-gitbook-summary',
    ]) {
      expect(activeText, manual).not.toContain(manual)
    }

    const web = JSON.parse(readFileSync(join(REPO, 'web/package.json'), 'utf8'))
    expect(web.scripts.prebuild).toBe(
      'node ../scripts/generate-fiches.mjs && node ../scripts/build-twin6-package.mjs',
    )

    // deploy.mjs : boucles d'import réelles (hors commentaires), référentiels puis paquets.
    const deploy = readFileSync(join(REPO, 'scripts/deploy/deploy.mjs'), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !line.startsWith('//') && !line.startsWith('*'))
    const code = (text) => {
      const index = deploy.indexOf(text)
      expect(index, text).toBeGreaterThanOrEqual(0)
      return index
    }
    const imports = [
      code("const refFiles = ['respire-v7.json', 'respire-v7.1.0.json']"),
      code('for (const refFile of refFiles) {'),
      code("const refPath = join(repoRoot, 'web/public/data/referentiel', refFile)"),
      code("const packagesDir = join(repoRoot, 'build/prompt-packages')"),
      code("for (const file of readdirSync(packagesDir).filter((f) => f.endsWith('.json'))) {"),
    ]
    for (let i = 1; i < imports.length; i += 1) expect(imports[i], `import ${i}`).toBeGreaterThan(imports[i - 1])
  })
})
