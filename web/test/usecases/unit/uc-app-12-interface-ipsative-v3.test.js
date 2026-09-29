// UC-APP-12 — Explorer sa cartographie dans l'interface ipsative V3 : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-12-interface-ipsative-v3.md
//
// Code sollicité appelé directement, sur les données PROPRES de l'apprenant
// (fixtures versionnées schemas/fixtures/, jamais le corpus généré) : lecteur
// ZIP et inventaire des archives, import et arbitrage des variantes,
// révisions et droit de réponse, annotations, comparaison ipsative, éditeur
// JSON expert, vues par persona, grille de tuiles, constructeur de partage
// par liste positive, réimport d'un instantané employeur, persistance locale,
// état des branches de l'arbre, règles de la feuille de style v3.css.
// Figées ici au niveau du moteur : AN4 (libellé mensuel), AN5 (entrée en
// quarantaine = master vide, cause racine), AN7 (arbitrage sans révision),
// AN11 (forme du master partiellement contrôlée), AN18 (contraste du badge,
// lu dans v3.css) et AN19 (cibles de la barre de tuile, lues dans v3.css). U04, U15, U16, U23 et U26 illustrent la CAUSE RACINE des
// anomalies AN1, AN2, AN3, AN16 et AN17, qui sont figées côté IHM par F06,
// F07, F12, F22 et F24.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { normalizeReferential } from '../../../src/v3/core/referentiel.js'
import { chooseVariant, correctEffectiveDate, importJourDocuments, summarizeReport } from '../../../src/v3/core/import.js'
import { computeEvents } from '../../../src/v3/core/events.js'
import { inventoryZip, isSafeZipPath, listZipEntries, readZipEntry } from '../../../src/v3/core/zip.js'
import { annotate, applyExpertJson, masterDigest, reviewEvidenceLink, reviewObservation, validateMasterShape } from '../../../src/v3/core/master.js'
import { compareStates, resolveBaselinePreset, whatChanged } from '../../../src/v3/core/compare.js'
import {
  availablePanels,
  clearScope,
  defaultVisiblePanels,
  effectiveExpandedTreeNodeIds,
  INTERFACE_MODES,
  initialState,
  renderedPanels,
  selectScope,
  switchMode,
} from '../../../src/v3/core/state.js'
import { columnsForWidth, moveTile, orderedTiles, TILE_SIZES } from '../../../src/v3/ui/tile-grid.jsx'
import {
  addLearnerSummary,
  applyScopeInclusion,
  buildShareSnapshot,
  configureProject,
  lockPreview,
  newShareProject,
  planScopeInclusion,
  publishSnapshot,
  removeScope,
  scopeTriState,
  setLinkShared,
  shareFilename,
} from '../../../src/v3/core/share.js'
import { duplicateAsProject, openShareSnapshot, snapshotToViewModel } from '../../../src/v3/core/reimport.js'
import { createMemoryAdapter, createV3Store } from '../../../src/v3/core/store.js'
import { countLabel, METRICS } from '../../../src/v3/core/metrics.js'
import { downloadJson } from '../../../src/lib/download-json.js'
import referentielDoc from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import { dayZipFiles, FIXTURE_DAYS, storedZip } from '../support/vis.js'


const REF = normalizeReferential(referentielDoc)
const NOW = '2026-07-20T10:00:00Z'
const DATES = ['2026-01-05', '2026-01-06', '2026-01-07']

function myMaster(runs = [['mon-portfolio', DATES]]) {
  const entries = runs.flatMap(([run, dates]) => dates.map((date) => ({ run, sourceDate: date, payload: FIXTURE_DAYS[date] })))
  return importJourDocuments(entries, { referential: REF, now: NOW, datasetId: '6f1f9d2e-0c9a-4b61-8f3e-2d4c5b6a7e80' })
}

const linksOf = (master, code, date) => {
  const { admissible } = computeEvents(master)
  return admissible.find((e) => e.observation.rawCode === code && e.date === date).links
}

describe('UC-APP-12 — import des archives de l’apprenant', () => {
  it('UC-APP-12-U01 — lecteur ZIP : entrées « stored » lues, chemin traversant refusé, archive tronquée signalée', async () => {
    const zip = storedZip([{ name: 'a/carto_P1.json', data: '{"x":1}' }, { name: 'a/', data: '' }])
    const entries = listZipEntries(zip)
    expect(entries.map((e) => e.name)).toEqual(['a/carto_P1.json']) // dossier ignoré
    expect(new TextDecoder().decode(await readZipEntry(zip, entries[0]))).toBe('{"x":1}')
    expect(isSafeZipPath('run/2026-01-05.zip')).toBe(true)
    for (const bad of ['../x.json', '/etc/passwd', 'C:/x', 'a\\b']) expect(isSafeZipPath(bad)).toBe(false)
    expect(() => listZipEntries(storedZip([{ name: '../evil.json', data: '{}' }]))).toThrow('chemin dangereux')
    expect(() => listZipEntries(zip.slice(0, zip.length - 30))).toThrow('répertoire central introuvable')
  })

  it('UC-APP-12-U02 — ZIP corpus (run/AAAA-MM-JJ.zip) : run et date tirés des chemins ; JSON invalide mis en quarantaine sans bloquer le reste', async () => {
    const broken = [...dayZipFiles(FIXTURE_DAYS['2026-01-06'])]
    broken[0] = { name: 'carto_P1.json', data: '{pas du json' }
    const corpus = storedZip([
      { name: 'run-A/2026-01-07.zip', data: storedZip(dayZipFiles(FIXTURE_DAYS['2026-01-07'])) },
      { name: 'run-B/2026-01-06.zip', data: storedZip(broken) },
    ])
    const { entries, report } = await inventoryZip(corpus)

    expect(entries.map((e) => [e.run, e.sourceDate, e.payload.poles.length])).toEqual([
      ['run-A', '2026-01-07', 7],
      ['run-B', '2026-01-06', 6],
    ])
    expect(entries[0].payload.kairos).toEqual(FIXTURE_DAYS['2026-01-07'].kairos) // kairos.json relu
    expect(report.map((r) => [r.severity, r.code, r.run])).toEqual([
      ['blocking', 'json-invalide', 'run-B'],
      ['warning', 'journee-incomplete', 'run-B'],
    ])
  })

  it('UC-APP-12-U03 — ZIP journalier seul : date PROPOSÉE depuis les feuilles (à confirmer), jamais devinée ailleurs', async () => {
    const { entries, report } = await inventoryZip(storedZip(dayZipFiles(FIXTURE_DAYS['2026-01-07'])), { fallbackRun: 'import' })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ run: 'import', sourceDate: '2026-01-07' })
    expect(report).toEqual([
      { severity: 'arbitrate', code: 'date-proposee', message: 'Date proposée depuis les feuilles (2026-01-07) — à confirmer', run: 'import' },
    ])
  })

  // Cause racine de l'ANOMALIE AN1 (figée côté IHM par F06) : inventoryZip
  // n'accepte aucune date en option (seulement fallbackRun) et ne renvoie
  // JAMAIS d'entrée non datée ; or V3View n'applique la date du nom
  // (AAAA-MM-JJ.zip) qu'aux entrées SANS date (m && !e.sourceDate). Sans champ
  // « feuille », la journée est donc perdue. Comportement du moteur voulu.
  it('UC-APP-12-U04 — cause racine de l’anomalie AN1 (moteur) : inventoryZip ne reçoit aucune date ; ZIP journalier sans « feuille » → aucune entrée, date-absente', async () => {
    const day = structuredClone(FIXTURE_DAYS['2026-01-06'])
    for (const pole of day.poles) for (const p of pole.passagesSaillants ?? []) delete p.feuille
    const { entries, report } = await inventoryZip(storedZip(dayZipFiles(day)), { fallbackRun: 'import' })
    expect(entries).toEqual([])
    expect(report).toEqual([
      { severity: 'blocking', code: 'date-absente', message: 'Date de la journée à saisir (aucune proposition fiable)', run: 'import' },
    ])
  })

  it('UC-APP-12-U05 — deux runs pour une même date : journée À ARBITRER (aucune contribution), puis choix, retour « à examiner », variante étrangère refusée', () => {
    const { master, report } = myMaster([['run-A', ['2026-01-05']], ['run-B', ['2026-01-05']]])
    expect(summarizeReport(report).arbitrate).toBe(1)
    expect(computeEvents(master).admissible).toHaveLength(0)
    const day = master.days[0]
    expect(day.provenance.map((p) => p.run)).toEqual(['run-A', 'run-B'])

    const chosen = chooseVariant(master, day.id, day.provenance[1].variantId)
    expect(computeEvents(chosen).admissible).toHaveLength(4)
    expect(chosen.sources.dayVariants.map((v) => v.state)).toEqual(['inactive', 'active'])
    expect(computeEvents(chooseVariant(chosen, day.id, null)).admissible).toHaveLength(0)
    expect(() => chooseVariant(master, day.id, 'variante-inconnue')).toThrow('Variante étrangère')

    const moved = correctEffectiveDate(chosen, day.id, '2026-01-04', 'journal daté la veille', NOW)
    expect(moved.days[0].effectiveDate).toBe('2026-01-04')
    expect(moved.days[0].id).toBe(day.id) // identifiants immuables
    expect(moved.annotations.at(-1).note).toBe('Date corrigée : journal daté la veille')
    // ANOMALIE AN7 — comportement ACTUEL figé : ni l'arbitrage ni la correction
    // de date ne créent de révision (même identifiant, même numéro). Attendu :
    // une révision chaînée, comme pour la revue et l'annotation.
    expect(chosen.revision).toEqual(master.revision)
    expect(moved.revision).toEqual(master.revision)
  })
})

describe('UC-APP-12 — droit de réponse, annotations, comparaison ipsative', () => {
  it('UC-APP-12-U06 — contester le seul lien d’une observation la retire du soleil ; chaque geste crée une révision, la source reste intacte', () => {
    const { master } = myMaster()
    const before = masterDigest(master)
    const [link] = linksOf(master, '3.04', '2026-01-05')
    const contested = reviewEvidenceLink(master, link.id, 'contested', { now: NOW })

    expect(masterDigest(master)).toBe(before)
    expect(contested.revision).toMatchObject({ parentId: master.revision.id, number: 2 })
    expect(computeEvents(contested).daysByCompetency.has('3.04')).toBe(false)
    // Les narratifs qui dépendent d'une preuve revue deviennent « à revoir » (jamais exportés).
    const kairosDay = master.days.find((d) => d.effectiveDate === '2026-01-07').id
    const reviewed = reviewEvidenceLink(master, linksOf(master, '4.05', '2026-01-07')[0].id, 'nuanced')
    expect(reviewed.derivedNarratives.filter((n) => n.dayId === kairosDay && n.dependsOn.includes('*day*')).every((n) => n.freshness === 'stale')).toBe(true)
    // Réversible : confirmer rétablit la compétence.
    expect(computeEvents(reviewEvidenceLink(contested, link.id, 'confirmed')).daysByCompetency.has('3.04')).toBe(true)
    // Revue groupée : tous les liens d'une observation d'un coup.
    const obsId = computeEvents(master).admissible.find((e) => e.observation.rawCode === '2.01' && e.date === '2026-01-06').observation.id
    const grouped = reviewObservation(master, obsId, 'nuanced')
    expect(grouped.evidenceLinks.filter((l) => l.observationId === obsId).every((l) => l.reviewState === 'nuanced')).toBe(true)
    expect(() => reviewEvidenceLink(master, link.id, 'effacé')).toThrow('État de revue inconnu')
  })

  it('UC-APP-12-U07 — comparaison avec SOI-MÊME : préréglages, états comparés, récit référencé (tags confirmés dans la période)', () => {
    const { master } = myMaster()
    const obs = computeEvents(master).admissible.find((e) => e.observation.rawCode === '4.05').observation
    const annotated = annotate(master, { targetType: 'observation', targetId: obs.id, tags: ['atelier'], note: 'réunion', effectiveDay: '2026-01-07', now: NOW })
    const { daysByCompetency } = computeEvents(annotated)

    expect(resolveBaselinePreset('last-evaluation', { playheadDay: '2026-01-07', activeDates: DATES })).toEqual({ baselineDay: '2026-01-06' })
    expect(resolveBaselinePreset('last-evaluation', { playheadDay: '2026-01-05', activeDates: DATES }).unavailable).toContain('indisponible')
    expect(resolveBaselinePreset('quarter-start', { playheadDay: '2026-05-12', activeDates: DATES })).toEqual({ baselineDay: '2026-04-01' })
    expect(resolveBaselinePreset('year-start', { playheadDay: '2026-05-12', activeDates: DATES })).toEqual({ baselineDay: '2026-01-01' })

    const diff = compareStates(daysByCompetency, { baselineDay: '2026-01-05', playheadDay: '2026-01-07', annotations: annotated.annotations })
    expect(diff.newlyDocumented.map((x) => x.code)).toEqual(['1.01', '2.06', '3.07', '4.05', '5.01', '6.07'])
    expect(diff.reobserved.map((x) => x.code)).toEqual(['2.01', '5.03', '7.01'])
    expect(diff.stable).toEqual(['3.04'])
    expect(diff.newDays).toEqual(['2026-01-06', '2026-01-07'])
    expect(diff.newTags).toEqual([{ tag: 'atelier', targetId: obs.id }])
    const phrases = whatChanged(diff, { nameOf: (c) => REF.competencyByCode.get(c).name })
    expect(phrases[0]).toEqual({ text: '2 nouvelles journées documentées sur la période.', refs: { dates: ['2026-01-06', '2026-01-07'] } })
    expect(phrases.some((p) => p.text === 'Nouveaux contextes confirmés : atelier.')).toBe(true)
    expect(phrases.every((p) => !/cohorte|moyenne|autres/i.test(p.text))).toBe(true)
  })

  it('UC-APP-12-U08 — éditeur JSON expert : un document invalide ne remplace jamais la révision ; un document valide crée une révision', () => {
    const { master } = myMaster()
    expect(validateMasterShape(null)).toEqual(['Document illisible (objet attendu)'])
    expect(validateMasterShape({ ...master, kind: 'autre' })).toContain('kind ≠ competency-map-master')
    const broken = structuredClone(master)
    broken.evidenceLinks[0].reviewState = 'effacé'
    const refused = applyExpertJson(master, broken)
    expect(refused.ok).toBe(false)
    expect(refused.master).toBe(master)
    expect(refused.errors[0]).toMatch(/reviewState invalide/)

    const edited = structuredClone(master)
    edited.evidenceLinks.find((l) => l.id === linksOf(master, '3.04', '2026-01-05')[0].id).reviewState = 'contested'
    const applied = applyExpertJson(master, edited, { now: NOW })
    expect(applied.ok).toBe(true)
    expect(applied.master.revision).toMatchObject({ number: 2, summary: 'Édition JSON experte' })
    expect(computeEvents(applied.master).daysByCompetency.has('3.04')).toBe(false)
  })
})

describe('UC-APP-12 — vues par persona et grille de tuiles', () => {
  it('UC-APP-12-U09 — cinq vues : panneaux propres à chaque persona, mémorisés PAR vue ; l’audience borne toujours', () => {
    expect(INTERFACE_MODES).toEqual(['simplified', 'employeur', 'apprenant', 'cartographe', 'expert'])
    const learner = (mode) => availablePanels({ format: { temporalPrecision: 'day' }, audience: 'learner', interfaceMode: mode })
    expect(learner('employeur').has('shareInspector')).toBe(true)
    expect(learner('employeur').has('importAudit')).toBe(false)
    expect(learner('cartographe').has('importAudit')).toBe(true)
    expect(learner('apprenant').has('comparison')).toBe(true)
    expect(learner('expert').has('jsonEditor')).toBe(true)
    for (const audience of ['preview', 'employer']) {
      const panels = availablePanels({ format: { temporalPrecision: 'day' }, audience, interfaceMode: 'expert' })
      for (const privatePanel of ['importAudit', 'jsonEditor', 'shareInspector', 'comparison']) expect(panels.has(privatePanel)).toBe(false)
    }
    expect([...defaultVisiblePanels('cartographe')].sort()).toEqual(['heatmap', 'importAudit', 'portfolio', 'stats', 'sun', 'tree'])

    let state = switchMode(initialState(), 'apprenant')
    state = { ...state, visiblePanels: new Set(['sun', 'comparison']) }
    state = switchMode(switchMode(state, 'cartographe'), 'apprenant')
    expect([...state.visiblePanels]).toEqual(['sun', 'comparison'])
  })

  it('UC-APP-12-U10 — grille : ordre mémorisé appliqué, déplacement sans doublon, colonnes selon la largeur, tailles prédéfinies', () => {
    const tiles = ['sun', 'stats', 'legend', 'heatmap'].map((id) => ({ id }))
    expect(orderedTiles(tiles, { order: ['heatmap', 'sun'] }).map((t) => t.id)).toEqual(['heatmap', 'sun', 'stats', 'legend'])
    expect(moveTile(['sun', 'stats', 'legend'], 'legend', 'sun')).toEqual(['legend', 'sun', 'stats'])
    expect(columnsForWidth(390)).toBe(1)
    expect(columnsForWidth(1440)).toBe(4)
    expect(TILE_SIZES.find((s) => s.id === 'pleine-largeur').w).toBe(Infinity)
  })
})

describe('UC-APP-12 — partage par liste positive et réimport', () => {
  it('UC-APP-12-U11 — projet neuf vide ; inclusion d’une famille ; précision mensuelle ; synthèse ; identifiants remappés, aucune date du jour', () => {
    const { master } = myMaster()
    let project = newShareProject({ master, name: 'Candidature', now: NOW })
    const empty = buildShareSnapshot(master, project, { referential: REF, now: NOW })
    expect(empty.ok).toBe(true)
    expect(empty.snapshot.observations).toEqual([])

    const plan = planScopeInclusion(project, master, { type: 'family', familyNum: 2 })
    expect(plan.count).toBe(10)
    project = applyScopeInclusion(project, master, plan, NOW)
    expect(scopeTriState(project, master, { type: 'family', familyNum: 2 })).toBe('included')
    const firstLink = linksOf(master, '2.01', '2026-01-05')[0]
    expect(scopeTriState(setLinkShared(project, master, firstLink.id, false), master, { type: 'family', familyNum: 2 })).toBe('partial')
    project = configureProject(project, { temporalPrecision: 'month' }, NOW)
    project = addLearnerSummary(project, { code: '6.07', text: 'J’anime le conseil de classe.' }, NOW)

    const built = buildShareSnapshot(master, project, { referential: REF, now: NOW })
    expect(built.ok).toBe(true)
    const json = JSON.stringify(built.snapshot)
    expect(built.snapshot.temporal).toEqual({ precision: 'month', months: [expect.objectContaining({ month: '2026-01' })] })
    expect(json).not.toMatch(/2026-01-0[567]/) // aucune date du jour sous « mois »
    expect(json).not.toContain(master.datasetId)
    expect(json).not.toContain(firstLink.id)
    expect(built.snapshot.referential.competencies.map((c) => c.code)).toEqual(['2.01', '2.06', '6.07'])
    expect(built.snapshot.portfolioDocuments.find((d) => d.type === 'learner-summary').summary).toBe('J’anime le conseil de classe.')
    expect(built.snapshot.integrity.contentDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(shareFilename(project)).toBe('cartographie-competences-partage-r01.json')
  })

  it('UC-APP-12-U12 — publier exige une prévisualisation À JOUR et la confirmation d’irrévocabilité', () => {
    const { master } = myMaster()
    let project = applyScopeInclusion(newShareProject({ master, name: 'P' }), master, planScopeInclusion(newShareProject({ master, name: 'P' }), master, { type: 'all' }))
    const built = buildShareSnapshot(master, project, { referential: REF })
    expect(publishSnapshot(project, master, built.digests, { confirmedStaticExportWarning: true }).error).toBe('Prévisualisez avant de publier.')
    project = lockPreview(project, built.digests, NOW)
    expect(publishSnapshot(project, master, built.digests, { confirmedStaticExportWarning: false }).error).toMatch(/ne peut pas être révoqué/)
    const published = publishSnapshot(project, master, built.digests, { confirmedStaticExportWarning: true, now: NOW })
    expect(published.ok).toBe(true)
    // Publication nominale : révision r1 enregistrée avec l'empreinte VERROUILLÉE
    // (celle de l'instantané prévisualisé), journalisée, confirmation tracée ;
    // le projet d'entrée n'est pas muté.
    expect(published.project.state).toBe('published')
    expect(published.project.publishedRevisions).toEqual([{ revision: 1, publishedAt: NOW, outputDigest: built.snapshot.integrity.contentDigest }])
    expect(published.project.journal.at(-1)).toMatchObject({ action: 'publish', summary: 'Publication r1', staticWarningConfirmed: true })
    expect(project.state).toBe('draft')
    expect(project.publishedRevisions).toEqual([])
    expect(shareFilename(project)).toBe('cartographie-competences-partage-r01.json') // fichier de cette publication
    expect(shareFilename(published.project)).toBe('cartographie-competences-partage-r02.json') // publication suivante
    // Toute modification du dossier après la prévisualisation la rend obsolète.
    const changed = reviewEvidenceLink(master, linksOf(master, '3.04', '2026-01-05')[0].id, 'contested')
    const stale = publishSnapshot(project, changed, { ...built.digests, sourceDigest: masterDigest(changed) }, { confirmedStaticExportWarning: true })
    expect(stale.error).toMatch(/obsolète/)
  })

  it('UC-APP-12-U13 — réimport : empreinte vérifiée, fichier altéré en quarantaine, duplication sans lien au master', () => {
    const { master } = myMaster()
    const project = applyScopeInclusion(newShareProject({ master, name: 'P' }), master, planScopeInclusion(newShareProject({ master, name: 'P' }), master, { type: 'competency', code: '2.01' }))
    const { snapshot } = buildShareSnapshot(master, project, { referential: REF })

    expect(openShareSnapshot(snapshot)).toEqual({ ok: true, snapshot })
    const tampered = structuredClone(snapshot)
    tampered.passages[0].verbatim = 'Texte réécrit après coup.'
    expect(openShareSnapshot(tampered).error).toMatch(/^Erreur d’intégrité/)
    expect(openShareSnapshot({ kind: 'competency-map-master' }).ok).toBe(false)

    const { project: copy } = duplicateAsProject(snapshot, { name: 'Réduction', now: NOW })
    expect(copy.masterDatasetId).toBeNull()
    expect(copy.allowed.evidenceLinkIds).toHaveLength(snapshot.evidenceLinks.length)
    const vm = snapshotToViewModel(snapshot)
    expect(vm.precision).toBe('day')
    expect(new Set(vm.observations.map((o) => o.rawCode))).toEqual(new Set(['2.01']))
    expect(vm.observations.map((o) => o.date).sort()).toEqual(DATES)
  })

  it('UC-APP-12-U14 — persistance locale V3 (store.js, adaptateur mémoire) : révisions, dernière par jeu de données, projets, préférences', async () => {
    const store = createV3Store(createMemoryAdapter())
    const { master } = myMaster()
    const r2 = reviewEvidenceLink(master, linksOf(master, '3.04', '2026-01-05')[0].id, 'contested')
    await store.saveMasterRevision(master)
    await store.saveMasterRevision(r2)
    expect((await store.listMasters()).map((m) => m.revisionNumber)).toEqual([2])
    expect((await store.getMasterRevision(master.revision.id)).revision.number).toBe(1)
    const project = newShareProject({ master, name: 'P' })
    await store.saveProject(project)
    expect(await store.listProjects(master.datasetId)).toHaveLength(1)
    await store.savePrefs({ interfaceMode: 'expert' })
    expect(await store.getPrefs()).toEqual({ id: 'presentation', interfaceMode: 'expert' })
    await store.deleteDataset(master.datasetId)
    expect(await store.listMasters()).toEqual([])
  })

  // Cause racine de l'ANOMALIE AN3 (figée côté IHM par F12) : ShareBuilder
  // (exportSnapshot) RECONSTRUIT l'instantané au moment de publier. Chaque
  // construction tire de nouveaux identifiants publics (uuidV4, voulu :
  // AC-SHARE-07) et une nouvelle date de génération : l'empreinte de sortie
  // diffère de celle verrouillée à la prévisualisation. Le moteur, lui, publie
  // correctement l'instantané prévisualisé.
  it('UC-APP-12-U16 — cause racine de l’anomalie AN3 (moteur) : deux constructions du même partage n’ont jamais la même empreinte ; seule l’empreinte prévisualisée se publie', () => {
    const { master } = myMaster()
    const base = newShareProject({ master, name: 'P' })
    const project = applyScopeInclusion(base, master, planScopeInclusion(base, master, { type: 'family', familyNum: 2 }))
    const previewed = buildShareSnapshot(master, project, { referential: REF })
    const locked = lockPreview(project, previewed.digests)
    const rebuilt = buildShareSnapshot(master, locked, { referential: REF }) // ce que fait exportSnapshot

    expect(rebuilt.digests.sourceDigest).toBe(previewed.digests.sourceDigest)
    expect(rebuilt.digests.policyDigest).toBe(previewed.digests.policyDigest)
    expect(rebuilt.digests.outputDigest).not.toBe(previewed.digests.outputDigest)
    expect(publishSnapshot(locked, master, rebuilt.digests, { confirmedStaticExportWarning: true }).error).toMatch(/obsolète/)
    // Avec l'instantané PRÉVISUALISÉ (celui que l'IHM devrait exporter), la publication passe.
    expect(publishSnapshot(locked, master, previewed.digests, { confirmedStaticExportWarning: true }).ok).toBe(true)
  })

  // Cause racine de l'ANOMALIE AN2 (figée côté IHM par F07) : V3View charge un
  // fichier « competency-map-master » tel quel (setMaster), sans
  // validateMasterShape — qui l'aurait rejeté ; computeEvents échoue alors sur
  // le master incomplet pendant le rendu.
  it('UC-APP-12-U15 — cause racine de l’anomalie AN2 (moteur) : un master incomplet est rejeté par validateMasterShape mais fait échouer computeEvents', () => {
    const incomplete = { kind: 'competency-map-master', schemaVersion: '3.0.0' }
    expect(validateMasterShape(incomplete)).toEqual([
      'days : tableau attendu', 'observations : tableau attendu', 'evidenceLinks : tableau attendu', 'passages : tableau attendu',
    ])
    expect(() => computeEvents(incomplete)).toThrow(TypeError)
  })

  // ANOMALIE AN4 (libellé) — comportement ACTUEL figé : sous la précision
  // « mois », l'accord suit « journée » (féminin) au lieu de « mois ».
  it('UC-APP-12-U17 — [comportement actuel, anomalie AN4] libellé du compte mensuel mal accordé dans la vue employeur', () => {
    const months = METRICS['documented-months-v1']
    expect(countLabel(1, months)).toBe('1 mois documentée') // attendu : « 1 mois documenté »
    expect(countLabel(2, months)).toBe('2 mois documentée') // attendu : « 2 mois documentés »
    expect(countLabel(3, METRICS['documented-days-v1'])).toBe('3 journées documentées')
  })

  it('UC-APP-12-U18 — downloadJson : export 100 % local (Blob application/json + lien de téléchargement), sans réseau', async () => {
    const blobs = []
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn((blob) => {
      blobs.push(blob)
      return 'blob:local'
    })
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      expect(downloadJson({ kind: 'competency-map-share' }, 'cartographie-competences-partage-r01.json')).toBe(true)
      expect(click.mock.contexts[0].download).toBe('cartographie-competences-partage-r01.json')
      expect(blobs[0].type).toBe('application/json')
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local')
      expect(document.querySelector('a[download]')).toBeNull() // lien retiré après usage
    } finally {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
      click.mockRestore()
    }
  })

  it('UC-APP-12-U19 — RG5 : publication bloquée sur fuite d’un verbatim exclu, document non partagé ou relation orpheline', () => {
    const { master } = myMaster()
    const base = newShareProject({ master, name: 'P', now: NOW })
    const project = applyScopeInclusion(base, master, planScopeInclusion(base, master, { type: 'family', familyNum: 2 }), NOW)
    expect(buildShareSnapshot(master, project, { referential: REF, now: NOW }).ok).toBe(true)
    const codes = (res) => res.blockers.map((b) => b.code)

    // (a) Une synthèse reprend mot pour mot le verbatim d'un passage NON autorisé.
    const allowed = new Set(project.allowed.passageIds)
    const allowedTexts = master.passages.filter((p) => allowed.has(p.id)).map((p) => p.verbatim.trim())
    const excluded = master.passages.find(
      (p) => !allowed.has(p.id) && p.verbatim?.trim().length >= 12 && !allowedTexts.some((a) => a.includes(p.verbatim.trim())),
    )
    const leak = buildShareSnapshot(master, addLearnerSummary(project, { code: '6.07', text: excluded.verbatim.trim() }, NOW), { referential: REF, now: NOW })
    expect(leak.ok).toBe(false)
    expect(codes(leak)).toContain('fuite-verbatim')

    // (b) Passage autorisé, mais son document n'est partagé qu'en synthèse.
    const summaryOnly = structuredClone(project)
    const docId = master.passages.find((p) => p.id === project.allowed.passageIds[0]).documentId
    summaryOnly.allowed.documentModes[docId] = 'summary'
    const notShared = buildShareSnapshot(master, summaryOnly, { referential: REF, now: NOW })
    expect(notShared.ok).toBe(false)
    expect(codes(notShared)).toContain('document-non-partage')

    // (c) Lien autorisé vers un passage absent du master.
    const orphan = structuredClone(master)
    orphan.passages = orphan.passages.filter((p) => p.id !== project.allowed.passageIds[0])
    const orphaned = buildShareSnapshot(orphan, project, { referential: REF, now: NOW })
    expect(orphaned.ok).toBe(false)
    expect(codes(orphaned)).toContain('relation-orpheline')
  })

  // ANOMALIE AN11 de la fiche — comportement ACTUEL figé : validateMasterShape
  // ne contrôle ni annotations, ni derivedNarratives (ni les documents et
  // occurrences), que applyExpertJson recopie tels quels. Attendu : refus
  // explicite dans les deux cas.
  it('UC-APP-12-U20 — [comportement actuel, anomalie AN11] JSON expert sans annotations → accepté (annotations indéfinies) ; sans derivedNarratives → TypeError', () => {
    const { master } = myMaster()
    const noAnnotations = structuredClone(master)
    delete noAnnotations.annotations
    expect(validateMasterShape(noAnnotations)).toEqual([])
    const accepted = applyExpertJson(master, noAnnotations, { now: NOW })
    expect(accepted.ok).toBe(true)
    expect(accepted.master.annotations).toBeUndefined()

    const noNarratives = structuredClone(master)
    delete noNarratives.derivedNarratives
    expect(validateMasterShape(noNarratives)).toEqual([])
    expect(() => applyExpertJson(master, noNarratives, { now: NOW })).toThrow(TypeError)
  })

  // Cause racine de l'ANOMALIE AN5 (figée côté IHM par F05) : une entrée sans
  // date valide est mise en quarantaine par importJourDocuments, qui renvoie
  // quand même un master NEUF… vide — que V3View substitue au dossier courant.
  it('UC-APP-12-U21 — [comportement actuel, anomalie AN5] pôle isolé dont la date est annulée : master neuf SANS journée, rapport date-absente', () => {
    const pole = FIXTURE_DAYS['2026-01-05'].poles[1]
    const { master, report } = importJourDocuments([{ run: 'import', sourceDate: '', payload: { date: null, poles: [pole] } }], { referential: REF, now: NOW })
    expect(master.kind).toBe('competency-map-master')
    expect(master.days).toEqual([]) // attendu (IHM) : dossier courant conservé
    expect(report.map((r) => [r.severity, r.code])).toEqual([['blocking', 'date-absente']])
  })

  it('UC-APP-12-U22 — RG4 et RG3 : retirer une famille du partage ne touche pas au dossier ; panneaux rendus = affichés ∩ disponibles', () => {
    const { master } = myMaster()
    const before = masterDigest(master)
    const base = newShareProject({ master, name: 'P', now: NOW })
    const included = applyScopeInclusion(base, master, planScopeInclusion(base, master, { type: 'family', familyNum: 2 }), NOW)
    expect(included.allowed.evidenceLinkIds).toHaveLength(10)

    const removed = removeScope(included, master, { type: 'family', familyNum: 2 }, NOW)
    expect(removed.allowed.evidenceLinkIds).toEqual([])
    expect(removed.allowed.passageIds).toEqual([])
    expect(removed.journal.at(-1).summary).toBe('Retrait de 10 association(s) de cette version partagée')
    expect(masterDigest(master)).toBe(before) // « Retirer de cette version partagée », jamais supprimer

    const employer = availablePanels({ format: { temporalPrecision: 'day' }, audience: 'employer', interfaceMode: 'expert' })
    expect([...renderedPanels(new Set(['jsonEditor', 'sun']), employer)]).toEqual(['sun'])
  })
})

describe('UC-APP-12 — arbre du référentiel (état des branches)', () => {
  // Cause racine de l'ANOMALIE AN16 (figée côté IHM par F22) : les expansions
  // effectives sont l'UNION des branches ouvertes à la main et des branches
  // révélées par une sélection de compétence ; V3View.toggleBranch (le
  // chevron) ne bascule que l'ensemble manuel. Une branche révélée reste donc
  // dépliée quel que soit l'état manuel : le chevron « Fermer » est sans effet.
  it('UC-APP-12-U23 — expansions effectives = manuelles ∪ révélées ; filtrer, réinitialiser ou changer de vue ne referme rien ; cause racine de l’anomalie AN16', () => {
    const s0 = initialState()
    expect(effectiveExpandedTreeNodeIds(s0)).toEqual(new Set()) // toutes les familles repliées au départ
    let s = {
      ...s0,
      manuallyExpandedTreeNodeIds: new Set(['family-2', 'comp-2.01']),
      temporarilyRevealedTreeNodeIds: new Set(['family-3']),
    }
    expect([...effectiveExpandedTreeNodeIds(s)].sort()).toEqual(['comp-2.01', 'family-2', 'family-3'])
    // Ensemble neuf : le modifier ne touche pas l'état.
    effectiveExpandedTreeNodeIds(s).add('family-7')
    expect(s.manuallyExpandedTreeNodeIds.has('family-7')).toBe(false)

    // Filtre par une famille (RG3 : états séparés) — idempotent, sans effet sur
    // les branches : chaque étape est comparée à l'état d'AVANT le filtre. (La
    // révélation de la famille d'une COMPÉTENCE sélectionnée n'est pas dans
    // state.js mais dans V3View.doSelectScope : voir F21 et F22.)
    const before = s
    const branches = ['comp-2.01', 'family-2', 'family-3']
    s = selectScope(before, 'family-2')
    expect(s.activeScopeNodeId).toBe('family-2')
    expect(s.manuallyExpandedTreeNodeIds).toBe(before.manuallyExpandedTreeNodeIds)
    expect(s.temporarilyRevealedTreeNodeIds).toBe(before.temporarilyRevealedTreeNodeIds)
    expect([...effectiveExpandedTreeNodeIds(s)].sort()).toEqual(branches)
    expect(selectScope(s, 'family-2')).toBe(s)
    // Réinitialisation (titre « Référentiel ») : seule la sélection tombe.
    const reset = clearScope(s)
    expect(reset.activeScopeNodeId).toBeNull()
    expect(reset.manuallyExpandedTreeNodeIds).toBe(before.manuallyExpandedTreeNodeIds)
    expect(reset.temporarilyRevealedTreeNodeIds).toBe(before.temporarilyRevealedTreeNodeIds)
    expect([...effectiveExpandedTreeNodeIds(reset)].sort()).toEqual(branches)
    // Changer de vue conserve filtre et branches (AC-UI-01).
    const other = switchMode(s, 'cartographe')
    expect(other.interfaceMode).toBe('cartographe')
    expect(other.activeScopeNodeId).toBe('family-2')
    expect(other.manuallyExpandedTreeNodeIds).toBe(before.manuallyExpandedTreeNodeIds)
    expect(other.temporarilyRevealedTreeNodeIds).toBe(before.temporarilyRevealedTreeNodeIds)
    expect([...effectiveExpandedTreeNodeIds(other)].sort()).toEqual(branches)

    // Cause racine AN16 : famille 3 révélée → dépliée, que l'ensemble manuel la
    // contienne ou non (ce que le chevron bascule).
    const revealed = { ...s0, temporarilyRevealedTreeNodeIds: new Set(['family-3']) }
    for (const manual of [new Set(), new Set(['family-3'])]) {
      expect(effectiveExpandedTreeNodeIds({ ...revealed, manuallyExpandedTreeNodeIds: manual }).has('family-3')).toBe(true)
    }
  })
})

/**
 * Règles de la feuille V3 (web/src/v3/v3.css, fichier versionné) analysées par
 * le CSSOM de jsdom, feuille insérée le temps de la lecture. Vitest n'injecte
 * pas les CSS importées (et renvoie une chaîne vide même pour « ?raw ») : le
 * fichier est donc lu sur disque, à l'appel (jamais au niveau d'un describe).
 * @returns {Array<{media: string|null, selector: string, decl: Record<string, string>}>}
 */
function v3Rules() {
  const here = dirname(fileURLToPath(import.meta.url))
  const style = document.createElement('style')
  style.textContent = readFileSync(resolve(here, '../../../src/v3/v3.css'), 'utf8')
  document.head.appendChild(style)
  try {
    const out = []
    const walk = (rules, media) => {
      for (const rule of rules) {
        if (rule.media && rule.cssRules) walk(rule.cssRules, rule.media.mediaText)
        else if (rule.selectorText) {
          const decl = {}
          for (let i = 0; i < rule.style.length; i++) {
            const prop = rule.style[i]
            const priority = rule.style.getPropertyPriority(prop)
            decl[prop] = rule.style.getPropertyValue(prop) + (priority ? ` !${priority}` : '')
          }
          out.push({ media, selector: rule.selectorText.replace(/\s+/g, ' ').trim(), decl })
        }
      }
    }
    walk(style.sheet.cssRules, null)
    return out
  } finally {
    style.remove()
  }
}

/** Déclarations d'un sélecteur EXACT (fusionnées s'il apparaît plusieurs fois dans le même contexte). */
function declOf(rules, selector, media = null) {
  const found = rules.filter((r) => r.selector === selector && r.media === media)
  if (found.length === 0) throw new Error(`Règle absente de v3.css : ${media ? `@media ${media} ` : ''}${selector}`)
  return Object.assign({}, ...found.map((r) => r.decl))
}

const V3_TOKENS = ['--v3-bg', '--v3-surface', '--v3-surface-2', '--v3-text', '--v3-muted', '--v3-border', '--v3-accent', '--v3-focus']
const pick = (decl, keys) => Object.fromEntries(keys.map((k) => [k, decl[k]]))

/** Rapport de contraste WCAG 2.x entre deux couleurs #rrggbb. */
function contrastRatio(a, b) {
  const luminance = (hex) => {
    const [r, g, bl] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('UC-APP-12 — feuille de style v3.css (grille, surface sombre, accessibilité)', () => {
  it('UC-APP-12-U24 — grille de tuiles (flux dense, rangées fixes, colonnes laissées à TileGrid) ; surface sombre complète, identique en « Système » sous thème sombre', () => {
    const rules = v3Rules()
    // Grille : les COLONNES ne sont pas dans la feuille — TileGrid les pose en
    // style en ligne (columnsForWidth) ; la feuille fixe flux et rangées.
    const grid = declOf(rules, '.v3-tile-grid')
    expect(grid).toMatchObject({ display: 'grid', 'grid-auto-flow': 'dense', 'grid-auto-rows': '236px' })
    expect(grid).not.toHaveProperty('grid-template-columns')
    expect(declOf(rules, '.v3-tile')).toMatchObject({ 'min-width': '0', overflow: 'hidden' })
    expect(declOf(rules, '.v3-tile-content')).toMatchObject({ overflow: 'auto' }) // le contenu défile dans la tuile
    expect(declOf(rules, '.v3-tile-resize')).toMatchObject({ cursor: 'nwse-resize', 'touch-action': 'none' })
    // Disposition Simplifié : deux colonnes, une seule sous 900 px.
    expect(declOf(rules, '.v3-layout')['grid-template-columns']).toBe('minmax(320px, 2fr) minmax(280px, 1.2fr)')
    expect(declOf(rules, '.v3-layout', '(max-width: 900px)')).toEqual({ 'grid-template-columns': '1fr' })

    // Surface : 8 jetons clairs, TOUS redéfinis en sombre, sans noir pur.
    const light = pick(declOf(rules, '.v3-root'), V3_TOKENS)
    const dark = pick(declOf(rules, ".v3-root[data-surface='dark']"), V3_TOKENS)
    for (const token of V3_TOKENS) {
      expect(light[token]).toMatch(/^#[0-9a-f]{6}$/)
      expect(dark[token]).toMatch(/^#[0-9a-f]{6}$/)
      expect(dark[token]).not.toBe(light[token])
    }
    expect(dark['--v3-bg']).toBe('#151a24')
    expect(Object.values(dark)).not.toContain('#000000')
    // « Système » sous préférence sombre = exactement la surface sombre, y
    // compris pour chaque retouche propre au thème (erreurs, centre, bandes).
    const systemDark = '(prefers-color-scheme: dark)'
    expect(pick(declOf(rules, ".v3-root[data-surface='system']", systemDark), V3_TOKENS)).toEqual(dark)
    for (const sel of ['.v3-errors', '.v3-center-stop', '.v3-center-stop-edge', '.v3-sun-band']) {
      const darkTweak = declOf(rules, `.v3-root[data-surface='dark'] ${sel}`)
      expect(declOf(rules, `.v3-root[data-surface='system'] ${sel}`, systemDark)).toEqual(darkTweak)
      expect(darkTweak).not.toEqual(declOf(rules, sel)) // la retouche change bien quelque chose
    }
  })

  it('UC-APP-12-U25 — motifs d’accessibilité : focus visible, rangées de l’arbre et commandes du lecteur ≥ 44 px, mouvement réduit, tableau équivalent hors écran (pas masqué), motifs distincts par famille, contrastes de texte ≥ 4,5:1', () => {
    const rules = v3Rules()
    // Focus visible sur toutes les commandes, les secteurs et les cellules.
    expect(declOf(rules, '.v3-root :is(button, select, input, textarea, summary):focus-visible')).toMatchObject({ outline: '3px solid var(--v3-focus)' })
    expect(declOf(rules, '.v3-root path:focus-visible, .v3-root .v3-cell:focus-visible')).toMatchObject({ outline: '3px solid var(--v3-focus)' })
    // Cibles tactiles : rangées de l'arbre et commandes du lecteur ≥ 44 px
    // (seules celles-ci ; la barre de tuile reste à 40 px, anomalie AN19, U28).
    expect(declOf(rules, '.v3-tree-row')['min-height']).toBe('44px')
    expect(declOf(rules, '.v3-timeline-controls button')).toEqual({ 'min-width': '44px', 'min-height': '44px' })
    // Mouvement réduit : plus aucune transition ni animation.
    expect(declOf(rules, '.v3-root *', '(prefers-reduced-motion: reduce)')).toEqual({ transition: 'none !important', animation: 'none !important' })
    expect(declOf(rules, '.v3-sector', '(prefers-reduced-motion: reduce)')).toEqual({ transition: 'none' })
    // Tableau équivalent au soleil : hors écran (lu par les lecteurs d'écran),
    // jamais display:none ; remis dans le flux à l'impression.
    expect(declOf(rules, '.v3-sun-table', 'screen')).toEqual({ position: 'absolute', left: '-9999px' })
    for (const r of rules.filter((x) => x.selector.includes('v3-sun-table') && x.media !== 'print')) expect(r.decl.display).toBeUndefined()
    expect(declOf(rules, '.v3-sun-table', 'print')).toEqual({ position: 'static !important', left: 'auto !important' })
    // Libellés visuellement masqués mais lisibles (ex. « Taille de Soleil »).
    expect(declOf(rules, '.v3-visually-hidden')).toMatchObject({ position: 'absolute', width: '1px', 'clip-path': 'inset(50%)' })
    expect(declOf(rules, '.v3-visually-hidden').display).toBeUndefined()

    // Distinctions renforcées : un motif de trait PROPRE à chaque famille
    // (la famille « solid » garde le trait plein) — l'identité ne repose
    // jamais sur la seule couleur.
    const patterns = REF.families.map((f) => f.pattern)
    expect(patterns).toEqual(['solid', 'diagonal', 'dots', 'cross', 'horizontal', 'vertical', 'grid'])
    expect(rules.some((r) => r.selector === '.v3-pattern-solid')).toBe(false)
    const dashes = patterns.slice(1).map((p) => declOf(rules, `.v3-pattern-${p}`)['stroke-dasharray'])
    expect(dashes.every(Boolean)).toBe(true)
    expect(new Set(dashes).size).toBe(6)
    expect(declOf(rules, ".v3-root[data-vision='reinforced'] .v3-sector")).toEqual({ stroke: 'var(--v3-text)' })
    const hatches = [1, 2, 3, 4].map((n) => declOf(rules, `.v3-root[data-vision='reinforced'] .v3-level-${n}`).background)
    expect(new Set(hatches).size).toBe(4) // quatre niveaux de heatmap distincts sans couleur

    // Contrastes (WCAG 2.2 AA, 1.4.3) : texte et texte atténué sur les trois
    // surfaces, dans les deux thèmes.
    for (const selector of ['.v3-root', ".v3-root[data-surface='dark']"]) {
      const t = declOf(rules, selector)
      for (const fg of ['--v3-text', '--v3-muted']) {
        for (const bg of ['--v3-bg', '--v3-surface', '--v3-surface-2']) {
          expect(contrastRatio(t[fg], t[bg]), `${selector} ${fg} / ${bg}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  // Cause racine de l'ANOMALIE AN17 (figée côté IHM par F24) : l'arbre est un
  // panneau DISPONIBLE en Simplifié (le menu « Panneaux » propose « Arbre »),
  // mais la feuille de style le masque dans cette vue.
  it('UC-APP-12-U26 — [comportement actuel, anomalie AN17] cause racine : « Arbre » disponible en Simplifié, mais masqué par la feuille de style', () => {
    const simplified = availablePanels({ format: { temporalPrecision: 'day' }, audience: 'learner', interfaceMode: 'simplified' })
    expect(simplified.has('tree')).toBe(true) // proposé dans le menu « Panneaux »
    expect(defaultVisiblePanels('simplified').has('tree')).toBe(false) // pas affiché par défaut
    expect(declOf(v3Rules(), '.v3-mode-simplified .v3-tree')).toEqual({ display: 'none' }) // attendu : cohérent avec le menu
  })

  // ANOMALIE AN18 — comportement ACTUEL figé : le badge « N anomalie(s) à
  // traiter » (texte #1a1206 gras 600, taille courante) sur le jeton
  // --v3-focus n'atteint pas 4,5:1 en surface claire, contrairement à
  // l'engagement de l'en-tête de v3.css (WCAG 2.2 AA, texte ≥ 4,5:1).
  it('UC-APP-12-U27 — [comportement actuel, anomalie AN18] badge d’anomalies : contraste 3,7:1 en surface claire (AA exige 4,5:1), 11,1:1 en sombre', () => {
    const rules = v3Rules()
    const badge = declOf(rules, '.v3-badge')
    expect(badge).toMatchObject({ background: 'var(--v3-focus)', color: '#1a1206', 'font-weight': '600' })
    expect(badge['font-size']).toBeUndefined() // taille courante : pas un « grand texte » au sens WCAG
    const light = contrastRatio(badge.color, declOf(rules, '.v3-root')['--v3-focus'])
    const dark = contrastRatio(badge.color, declOf(rules, ".v3-root[data-surface='dark']")['--v3-focus'])
    expect(light).toBeCloseTo(3.69, 2) // attendu : ≥ 4,5
    expect(light).toBeLessThan(4.5)
    expect(dark).toBeCloseTo(11.1, 1)
  })

  // ANOMALIE AN19 — comportement ACTUEL figé : l'en-tête de la grille de
  // tuiles dans v3.css promet des « cibles tactiles ≥ 44 px sur la barre de
  // tuile », mais les boutons ◀ ▶ et le menu de taille de cette barre sont
  // déclarés à 40 px.
  it('UC-APP-12-U28 — [comportement actuel, anomalie AN19] barre de tuile : boutons ◀ ▶ et menu de taille à 40 px, contre 44 px promis par l’en-tête de v3.css', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(resolve(here, '../../../src/v3/v3.css'), 'utf8')
    expect(source).toContain('Cibles tactiles ≥ 44 px sur la barre de tuile') // engagement de la feuille
    const rules = v3Rules()
    expect(declOf(rules, '.v3-tile-bar button')).toMatchObject({ 'min-width': '40px', 'min-height': '40px' }) // attendu : 44px
    expect(declOf(rules, '.v3-tile-size select')).toEqual({ 'min-height': '40px' }) // attendu : 44px
  })
})
