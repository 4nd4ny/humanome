// UC-VIS-01 — Explorer la cartographie de démonstration : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-01-explorer-cartographie-demonstration.md
//
// Code sollicité appelé directement, sans rendu de l'application : routeur par
// hash (#/cartographie, #/merge, #/jour/<iso>?focus=), chargeurs de données
// statiques (journées de démo, référentiel publié avec repli embarqué),
// moteur de l'interface V3 (référentiel normalisé, import du corpus, règle
// d'admissibilité, métrique du rayon, états d'inspection et de lecture),
// pipeline narratif DOMPurify (ADR-007) et vues historiques (merge « à date »,
// calendrier, résolution des secteurs, document chargé localement).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dayHash, isValidIsoDate, parseHash } from '../../../src/router.js'
import { clearDayCache, FILE_PROTOCOL_MESSAGE, frenchDate, loadDay, parseUserDocument } from '../../../src/data/load.js'
import { clearReferentielCache, loadPublishedReferentiel } from '../../../src/data/referentiel.js'
import { normalizeReferential } from '../../../src/v3/core/referentiel.js'
import { importJourDocuments, summarizeReport } from '../../../src/v3/core/import.js'
import { computeEvents } from '../../../src/v3/core/events.js'
import { countLabel, heatmapLevel, metricForPrecision, radialProportion, sunValues, whyRadius } from '../../../src/v3/core/metrics.js'
import {
  availablePanels,
  clearScope,
  initialState,
  inspectDay,
  pause,
  play,
  renderedPanels,
  selectScope,
  setPlayhead,
} from '../../../src/v3/core/state.js'
import { dayHrefToRoute, renderNarrativeHtml } from '../../../src/lib/narrative.js'
import { finalThresholds, mergeDocAsOf } from '../../../src/lib/sunburst/as-of.js'
import { buildCalendarGrid, scoreLevel } from '../../../src/components/HeatmapCalendar.jsx'
import { findDayNode } from '../../../src/views/DayView.jsx'
import { findMergeNode } from '../../../src/views/MergeView.jsx'
import referentielDoc from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import mergeFixture from '../../../../schemas/fixtures/cartographie-merge-3-jours.json'
import { FIXTURE_DAYS, FIXTURE_FACTS, jsonResponse } from '../support/vis.js'

const REF = normalizeReferential(referentielDoc)

/** Corpus de démonstration réduit (3 journées de fixtures) importé comme le fait V3View. */
function demoMaster() {
  const entries = FIXTURE_FACTS.dates.map((date) => ({ run: 'démonstration', sourceDate: date, payload: FIXTURE_DAYS[date] }))
  return importJourDocuments(entries, { referential: REF, now: '2026-07-17T12:00:00Z' })
}

afterEach(() => {
  clearDayCache()
  clearReferentielCache()
})

describe('UC-VIS-01 — routes de la démonstration', () => {
  it('UC-VIS-01-U01 — #/cartographie, #/merge et #/jour/<iso>?focus=<code> sont des routes publiques ; dayHash les reconstruit', () => {
    expect(parseHash('#/cartographie')).toEqual({ name: 'cartographie' })
    expect(parseHash('#/merge')).toEqual({ name: 'merge' })
    expect(parseHash('#/jour/2026-01-06')).toEqual({ name: 'day', date: '2026-01-06', focus: null })
    expect(parseHash('#/jour/2026-01-06?focus=2.01')).toEqual({ name: 'day', date: '2026-01-06', focus: '2.01' })
    expect(parseHash('#/jour/2026-01-06?focus=')).toEqual({ name: 'day', date: '2026-01-06', focus: null })
    expect(dayHash('2026-01-06')).toBe('#/jour/2026-01-06')
    expect(dayHash('2026-01-06', '2.01')).toBe('#/jour/2026-01-06?focus=2.01')
  })

  it('UC-VIS-01-U02 — une date de journée impossible n’est pas une route (validation calendaire stricte)', () => {
    expect(isValidIsoDate('2026-02-28')).toBe(true)
    expect(isValidIsoDate('2024-02-29')).toBe(true)
    expect(isValidIsoDate('2026-02-30')).toBe(false)
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(isValidIsoDate('26-01-06')).toBe(false)
    expect(parseHash('#/jour/2026-02-30').name).toBe('not-found')
    expect(parseHash('#/jour/demain').name).toBe('not-found')
  })
})

describe('UC-VIS-01 — chargement des données statiques', () => {
  it('UC-VIS-01-U03 — loadDay : URL relative, cache mémoire, messages français (404, réseau, file://, date invalide)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, FIXTURE_DAYS['2026-01-06']))
    const doc = await loadDay('2026-01-06', { fetchFn, protocol: 'https:' })
    expect(doc.date).toBe('2026-01-06')
    expect(fetchFn).toHaveBeenCalledWith('data/demo/jours/2026-01-06.json')
    await loadDay('2026-01-06', { fetchFn, protocol: 'https:' })
    expect(fetchFn).toHaveBeenCalledTimes(1) // servi par le cache

    const notFound = vi.fn().mockResolvedValue(jsonResponse(404, {}))
    await expect(loadDay('2026-01-05', { fetchFn: notFound, protocol: 'https:' })).rejects.toThrow(
      'Aucune cartographie de journée pour le 05/01/2026.',
    )
    const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(loadDay('2026-01-07', { fetchFn: offline, protocol: 'https:' })).rejects.toThrow(/réseau indisponible/)
    const serverError = vi.fn().mockResolvedValue(jsonResponse(500, {}))
    await expect(loadDay('2026-01-08', { fetchFn: serverError, protocol: 'https:' })).rejects.toThrow('(HTTP 500)')
    await expect(loadDay('2026-01-09', { fetchFn, protocol: 'file:' })).rejects.toThrow(FILE_PROTOCOL_MESSAGE)
    await expect(loadDay('2026-02-30', { fetchFn })).rejects.toThrow('Date invalide')
    expect(frenchDate('2026-01-06')).toBe('06/01/2026')
  })

  it('UC-VIS-01-U04 — loadPublishedReferentiel : index publié → fichier indiqué (étape 2) ; hors ligne, file:// ou nom de fichier dangereux → repli embarqué (jamais de rejet)', async () => {
    // Chemin nominal (étape 2) : index.json, préférence « respire », fichier sûr, forme contrôlée.
    const published = { ...referentielDoc, version: '7.1.0', label: 'RESPIRE v7.1' }
    const index = [{ referentielId: 'respire', semver: '7.1.0', label: 'RESPIRE v7.1', publishedAt: '2026-07-15T09:00:00', fichier: 'respire-v7.1.json' }]
    const online = vi.fn(async (url) =>
      url === 'data/referentiel/index.json' ? jsonResponse(200, index) : url === 'data/referentiel/respire-v7.1.json' ? jsonResponse(200, published) : jsonResponse(404, {}),
    )
    const loaded = await loadPublishedReferentiel({ fetchFn: online, protocol: 'https:' })
    expect(loaded.origin).toBe('published')
    expect(loaded.doc.version).toBe('7.1.0')
    expect(online.mock.calls.map(([u]) => u)).toEqual(['data/referentiel/index.json', 'data/referentiel/respire-v7.1.json'])

    // Garde SAFE_FILE_RE : un « fichier » qui sort du dossier n'est jamais lu.
    clearReferentielCache()
    const traversal = vi.fn(async (url) =>
      url === 'data/referentiel/index.json' ? jsonResponse(200, [{ ...index[0], fichier: '../x.json' }]) : jsonResponse(200, published),
    )
    expect((await loadPublishedReferentiel({ fetchFn: traversal, protocol: 'https:' })).origin).toBe('bundled')
    expect(traversal).toHaveBeenCalledTimes(1)

    clearReferentielCache()
    const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const fallback = await loadPublishedReferentiel({ fetchFn: offline, protocol: 'https:' })
    expect(fallback.origin).toBe('bundled')
    expect(fallback.doc.competences).toHaveLength(61)

    clearReferentielCache()
    const neverCalled = vi.fn()
    const onFile = await loadPublishedReferentiel({ fetchFn: neverCalled, protocol: 'file:' })
    expect(onFile.origin).toBe('bundled')
    expect(neverCalled).not.toHaveBeenCalled()
  })
})

describe('UC-VIS-01 — moteur de l’interface V3 (démonstration)', () => {
  it('UC-VIS-01-U05 — normalizeReferential : 7 familles ordonnées, symbole et motif stables, 61 compétences ; forme invalide refusée', () => {
    expect(REF.id).toBe('respire')
    expect(REF.version).toBe('7.0.0')
    expect(REF.families.map((f) => f.num)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(REF.families.map((f) => f.symbol)).toEqual(['●', '◆', '■', '▲', '⬟', '⬢', '★'])
    expect(REF.familyByNum.get(3).pattern).toBe('dots')
    expect(REF.competencies).toHaveLength(61)
    expect(REF.competencyByCode.get('2.01').familyNum).toBe(2)
    expect(() => normalizeReferential({ poles: [] })).toThrow('Référentiel invalide')
  })

  it('UC-VIS-01-U06 — importJourDocuments : le corpus devient un master PRIVÉ en mémoire, une journée par date, provenance conservée', () => {
    const { master, report } = demoMaster()
    expect(master.kind).toBe('competency-map-master')
    expect(master.referential).toEqual({ id: 'respire', version: '7.0.0' })
    expect(master.days.map((d) => d.effectiveDate)).toEqual(FIXTURE_FACTS.dates)
    expect(master.days.every((d) => d.activeVariantId !== null)).toBe(true)
    expect(master.days[0].provenance).toEqual([{ variantId: master.days[0].activeVariantId, run: 'démonstration' }])
    // Anomalies non bloquantes seulement (rapports de pôle absents dans les fixtures).
    const summary = summarizeReport(report)
    expect(summary.blocking).toBe(0)
    expect(summary.arbitrate).toBe(0)
  })

  it('UC-VIS-01-U07 — computeEvents : seules les présences établies, non court-circuitées, d’une variante active, avec un lien résolu non contesté font un événement (RG2)', () => {
    const { master } = demoMaster()
    const events = computeEvents(master)
    expect(events.admissible).toHaveLength(FIXTURE_FACTS.admissible)
    expect([...events.daysByCompetency.keys()].sort()).toEqual(FIXTURE_FACTS.documentedCodes)
    for (const [date, codes] of Object.entries(FIXTURE_FACTS.byDate)) {
      expect([...events.competenciesByDate.get(date)].sort()).toEqual(codes)
    }
    // « renvoi au cartographe » : en attente de révision, jamais au soleil.
    expect(events.needsReview).toHaveLength(FIXTURE_FACTS.needsReview)
    expect(events.daysByCompetency.has('1.03')).toBe(false)

    // Chaque condition de RG2 est discriminée par une variante du corpus
    // (1.01, 2.06 et 5.01 ne sont documentées que le 6 janvier).
    const withDay06 = (mutate) => {
      const days = structuredClone(FIXTURE_DAYS)
      const comp = (code) => days['2026-01-06'].poles.flatMap((p) => p.competences).find((c) => c.code === code)
      mutate(comp)
      const entries = FIXTURE_FACTS.dates.map((date) => ({ run: 'démonstration', sourceDate: date, payload: days[date] }))
      return importJourDocuments(entries, { referential: REF, now: '2026-07-17T12:00:00Z' }).master
    }
    // Court-circuit : la présence établie ne compte pas.
    expect(computeEvents(withDay06((c) => { c('2.06').courtCircuit = true })).daysByCompetency.has('2.06')).toBe(false)
    // Aucune pièce : les traces restent pendantes (aucun lien résolu).
    expect(computeEvents(withDay06((c) => { c('5.01').pieces = [] })).daysByCompetency.has('5.01')).toBe(false)
    // verdict.confiance n'entre ni dans l'admissibilité ni dans le rayon.
    const lowConfidence = computeEvents(withDay06((c) => { c('2.01').verdict.confiance = 0.01 }))
    expect(lowConfidence.daysByCompetency.get('2.01').size).toBe(3)
    expect(lowConfidence.admissible).toHaveLength(FIXTURE_FACTS.admissible)
    // Tous les liens contestés : l'observation sort du soleil.
    const contested = structuredClone(master)
    const obs101 = contested.observations.find((o) => o.rawCode === '1.01' && o.normalizedStatus === 'established')
    for (const link of contested.evidenceLinks) if (link.observationId === obs101.id) link.reviewState = 'contested'
    expect(computeEvents(contested).daysByCompetency.has('1.01')).toBe(false)
    // Deux variantes pour le 5 janvier : journée à arbitrer, aucune ne compte.
    const entries = FIXTURE_FACTS.dates.map((date) => ({ run: 'démonstration', sourceDate: date, payload: FIXTURE_DAYS[date] }))
    entries.push({ run: 'autre', sourceDate: '2026-01-05', payload: FIXTURE_DAYS['2026-01-05'] })
    const concurrent = computeEvents(importJourDocuments(entries, { referential: REF, now: '2026-07-17T12:00:00Z' }).master)
    expect(concurrent.competenciesByDate.has('2026-01-05')).toBe(false)
    expect(concurrent.daysByCompetency.has('3.04')).toBe(false) // documentée le 5 seulement
    expect(concurrent.daysByCompetency.get('2.01').size).toBe(2) // encore documentée le 6 et le 7
  })

  it('UC-VIS-01-U08 — rayon du soleil : journées distinctes ≤ tête de lecture (log2 plafonné à 64) ; futureCount est calculé, seul un secteur déjà visible est prolongé d’un fantôme', () => {
    const { master } = demoMaster()
    const { daysByCompetency } = computeEvents(master)
    const metric = metricForPrecision('day')
    const complete = sunValues(daysByCompetency, { playheadDay: null, metric })
    expect(complete.get('2.01')).toEqual({ count: 3, proportion: radialProportion(3, 64), futureCount: 0 })
    const early = sunValues(daysByCompetency, { playheadDay: '2026-01-05', metric })
    expect(early.get('2.01')).toMatchObject({ count: 1, futureCount: 2 })
    // 4.05 (documentée le 7 seulement) a un futureCount, mais count = 0 : le
    // soleil (SunPanel) ne la dessine pas du tout — pas de fantôme pour elle.
    expect(early.get('4.05')).toEqual({ count: 0, proportion: 0, futureCount: 1 })
    // Formule RG3 figée : log2(1 + n) / log2(65), plafonnée à 1.
    expect(radialProportion(3, 64)).toBeCloseTo(2 / Math.log2(65), 10)
    expect(radialProportion(1, 64)).toBeCloseTo(1 / Math.log2(65), 10)
    expect(radialProportion(0, 64)).toBe(0)
    expect(radialProportion(64, 64)).toBe(1)
    expect(radialProportion(200, 64)).toBe(1)
    expect(countLabel(3, metric)).toBe('3 journées documentées')
    expect(countLabel(70, metric)).toBe('64+ journées documentées (70 au total)')
  })

  it('UC-VIS-01-U09 — « Pourquoi ce rayon ? » : métrique, compte exact et journées contributrices bornées par la tête de lecture', () => {
    const { master } = demoMaster()
    const dates = computeEvents(master).daysByCompetency.get('2.01')
    const metric = metricForPrecision('day')
    expect(whyRadius('2.01', dates, { playheadDay: null, metric })).toEqual({
      code: '2.01',
      metric: 'documented-days-v1',
      count: 3,
      units: FIXTURE_FACTS.dates,
      label: '3 journées documentées',
    })
    expect(whyRadius('2.01', dates, { playheadDay: '2026-01-06', metric }).units).toEqual(['2026-01-05', '2026-01-06'])
    // Densité de la heatmap : seuils fixes (4 compétences le 05, 6 le 07 → « forte »).
    expect(heatmapLevel(FIXTURE_FACTS.byDate['2026-01-05'].length)).toBe(3)
    expect(heatmapLevel(0)).toBe(0)
    expect(heatmapLevel(1)).toBe(1)
    expect(heatmapLevel(2)).toBe(2)
    expect(heatmapLevel(3)).toBe(2)
    expect(heatmapLevel(4)).toBe(3)
    expect(heatmapLevel(7)).toBe(3)
    expect(heatmapLevel(8)).toBe(4)
  })

  it('UC-VIS-01-U10 — état initial du visiteur : mode simplifié, panneaux par défaut, audience apprenant (privé)', () => {
    const state = initialState({ audience: 'learner', interfaceMode: 'simplified' })
    expect([...state.visiblePanels].sort()).toEqual(['heatmap', 'legend', 'stats', 'sun', 'timeline'])
    expect(state.playheadDay).toBeNull() // état complet
    expect(state.activeScopeNodeId).toBeNull() // toutes les compétences
    const available = availablePanels({ format: { temporalPrecision: 'day' }, audience: 'learner', interfaceMode: 'simplified' })
    // En simplifié : ni éditeur JSON, ni audit d'import, ni constructeur de
    // partage parmi les panneaux DISPONIBLES. (V3View rend néanmoins le
    // constructeur dans un bloc replié « Préparer un partage » en simplifié :
    // voir UC-APP-12 et F01.)
    for (const hidden of ['jsonEditor', 'importAudit', 'shareInspector']) expect(available.has(hidden)).toBe(false)
    expect([...renderedPanels(new Set(['sun', 'jsonEditor']), available)]).toEqual(['sun'])
  })

  it('UC-VIS-01-U11 — inspecter une journée ≠ déplacer la tête de lecture ; lecture/pause ; filtre idempotent', () => {
    let state = initialState()
    state = play(state, 1)
    expect(state.playback).toEqual({ playing: true, direction: 1, speed: 1 })
    state = inspectDay(state, { day: '2026-01-06', source: 'heatmap' })
    expect(state.inspection).toEqual({ day: '2026-01-06', source: 'heatmap', pinnedCompetencyIds: [], portfolioPinned: false })
    expect(state.playback.playing).toBe(false) // l'inspection met en pause
    expect(state.playheadDay).toBeNull() // … sans déplacer la tête de lecture
    state = setPlayhead(state, '2026-01-06')
    expect(state.playheadDay).toBe('2026-01-06')
    // Relancer la lecture ferme une inspection non épinglée.
    expect(play(state, -1).inspection).toBeNull()
    expect(play({ ...state, inspection: { ...state.inspection, portfolioPinned: true } }).inspection).not.toBeNull()
    expect(pause(play(state)).playback.playing).toBe(false)
    const scoped = selectScope(state, 'comp-2.01')
    expect(selectScope(scoped, 'comp-2.01')).toBe(scoped)
    expect(clearScope(scoped).activeScopeNodeId).toBeNull()
  })
})

describe('UC-VIS-01 — vues historiques et HTML narratif', () => {
  it('UC-VIS-01-U12 — renderNarrativeHtml : DOMPurify retire script, image et style, puis réécrit les liens de journée hérités', () => {
    const html = renderNarrativeHtml(
      '<p onclick="x()">Voir <a href="feuilles/2026-01-06/carto-day.html?focus=2.01">la journée</a></p>' +
        '<img src="https://tracker.example/p.gif"><script>alert(1)</script><span style="background:url(x)">t</span>',
    )
    expect(html).toContain('href="#/jour/2026-01-06?focus=2.01"')
    expect(html).not.toMatch(/<img|<script|onclick|style=/)
    expect(dayHrefToRoute('./feuilles/2026-01-07/carto-day.html')).toBe('#/jour/2026-01-07')
    expect(dayHrefToRoute('feuilles/2026-02-30/carto-day.html')).toBeNull()
    expect(dayHrefToRoute('https://ailleurs.example/')).toBeNull()
  })

  it('UC-VIS-01-U13 — vue chronologique « à date » : la carte se construit feuille après feuille, la dernière trame est le document publié', () => {
    const thresholds = finalThresholds(mergeFixture)
    expect(thresholds).toHaveLength(4)
    const count = (doc) => doc.domains.reduce((n, d) => n + d.competences.length, 0)
    const first = mergeDocAsOf(mergeFixture, '2026-01-05', { thresholds })
    const last = mergeDocAsOf(mergeFixture, '2026-01-07', { thresholds })
    expect(count(first)).toBeLessThan(count(last))
    expect(count(last)).toBe(count(mergeFixture))
    // Dernière trame = document publié : mêmes codes, niveaux et points.
    const projection = (doc) => doc.domains.flatMap((d) => d.competences.map((c) => [c.code, c.niveau, c.points])).sort()
    expect(projection(last)).toEqual(projection(mergeFixture))
    expect(first.domains.every((d) => d.competences.length > 0)).toBe(true) // pôles vides exclus
  })

  it('UC-VIS-01-U14 — calendrier : semaines commençant le lundi, intensité quantisée en 5 niveaux', () => {
    const { weeks, months } = buildCalendarGrid(['2026-01-07', '2026-01-05', '2026-01-06'])
    expect(weeks).toHaveLength(1)
    expect(weeks[0][0]).toBe('2026-01-05') // lundi 5 janvier 2026
    expect(weeks[0]).toHaveLength(7)
    expect(months).toEqual([{ label: 'janv.', week: 0 }])
    expect(scoreLevel(0, 10)).toBe(0)
    expect(scoreLevel(1, 10)).toBe(1)
    expect(scoreLevel(10, 10)).toBe(4)
    expect(scoreLevel(5, 0)).toBe(0)
  })

  it('UC-VIS-01-U15 — résolution d’un secteur : compétence de la journée, compétence et pôle de la fusion', () => {
    const day = FIXTURE_DAYS['2026-01-06']
    const comp = findDayNode(day, referentielDoc, { kind: 'competence', code: '2.01', id: '2.01' })
    expect(comp.kind).toBe('competence')
    expect(comp.ref.nom).toBe('Intelligence Émotionnelle & Sollicitude Active')
    expect(comp.refPole.num).toBe(2)
    expect(findDayNode(day, referentielDoc, { kind: 'competence', code: '9.99' })).toBeNull()

    const merged = findMergeNode(mergeFixture, { kind: 'competence', code: '5.03' })
    expect(merged.competence.code).toBe('5.03')
    expect(findMergeNode(mergeFixture, { kind: 'pole', id: 'AME — Discerner & Juger' }).domain.id).toBe('AME — Discerner & Juger')
    expect(findMergeNode(mergeFixture, null)).toBeNull()
  })

  it('UC-VIS-01-U16 — parseUserDocument : un fichier local est lu et validé dans le navigateur, avec des erreurs explicites', () => {
    expect(parseUserDocument(JSON.stringify(mergeFixture)).kind).toBe('cartographie-merge')
    expect(parseUserDocument(JSON.stringify(FIXTURE_DAYS['2026-01-05'])).kind).toBe('cartographie-jour')
    expect(() => parseUserDocument('{pas du json')).toThrow('Ce fichier n’est pas un JSON valide.')
    expect(() => parseUserDocument('const domainsData = []')).toThrow(/carto-data\.js hérité/)
    expect(() => parseUserDocument(JSON.stringify({ kind: 'autre' }))).toThrow(/Document non reconnu/)
    const invalid = { ...mergeFixture, domains: 'pas un tableau' }
    let failure = null
    try {
      parseUserDocument(JSON.stringify(invalid))
    } catch (error) {
      failure = error
    }
    expect(failure.message).toMatch(/^Document non conforme au schéma « cartographie-merge »/)
    expect(failure.validationErrors.length).toBeGreaterThan(0)
  })

  // ANOMALIE AN1 de la fiche — test qui FIGE le comportement ACTUEL (pas le
  // comportement attendu). Le schéma cartographie-jour impose poleNum en
  // CHAÎNE (« 1 » à « 7 ») et tout le corpus réel s'y conforme, mais
  // findDayNode compare `dp.poleNum === refPole.num` (nombre) : la sélection
  // d'un PÔLE dans la vue journée ne se résout pas sur un document conforme.
  // À inverser quand la comparaison sera normalisée (String(...)).
  it('UC-VIS-01-U17 — [comportement actuel, anomalie AN1] pôle d’une journée conforme au schéma (poleNum chaîne) : non résolu', () => {
    const day = FIXTURE_DAYS['2026-01-06']
    expect(typeof day.poles[1].poleNum).toBe('string')
    const meta = { kind: 'pole', id: 'COEUR — Relier & Naviguer', domainId: day.poles[1].poleNum }
    expect(findDayNode(day, referentielDoc, meta)).toBeNull()
    // Le même pôle avec un poleNum NUMÉRIQUE (hors schéma) est résolu.
    const numeric = { ...day, poles: day.poles.map((p) => ({ ...p, poleNum: Number(p.poleNum) })) }
    expect(findDayNode(numeric, referentielDoc, meta).pole.poleNum).toBe(2)
  })
})
