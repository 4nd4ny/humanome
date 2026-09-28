// UC-PRO-05 — Évaluer un paquet au banc d'essai : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-05-banc-essai.md
//
// Code sollicité appelé directement, sans React ni réseau : client API de
// l'atelier (sources du banc), normalisation des brouillons, portfolio de test
// embarqué, exécution d'une version (runVersionOnDays) avec le VRAI moteur et
// un fournisseur factice rejouant les fixtures, fournisseur par branche
// (createProviderBundle), estimation « honnête » (buildEstimate), rapports A/B,
// score vs référence, multi-run croisé, coût réel, carnet et routage.
import { describe, expect, it, vi } from 'vitest'
import { createMockProvider } from '../../../../engine/src/providers/mock.js'
import { createPromptologueApi, normalizeDraftEntry } from '../../../src/views/promptologue/api.js'
import { FIXTURE_LABEL, fixtureDayGroups } from '../../../src/views/promptologue/BancEssaiSection.jsx'
import {
  buildAbMultiReport,
  buildAbReport,
  buildCompetenceDiff,
  buildMultiRunReport,
  buildRunReport,
  detectReferentielEnDur,
  filterDayGroups,
  normalizeReferenceImport,
  realCostUsd,
  runVersionOnDays,
  scoreVsReference,
  sumUsages,
  usesTwin6Engine,
} from '../../../src/views/promptologue/bench.js'
import { buildConsistencyView } from '../../../src/lib/consistency-view.js'
import { addConfig, emptyCarnet, exportCarnet, importCarnet } from '../../../src/views/promptologue/carnet.js'
import { BUILTIN_PACKAGE, buildEstimate, createProviderBundle } from '../../../src/lib/run-launcher.js'
import { usesEngineOrchestration } from '../../../src/lib/sandbox/index.js'
import pkgFixture from '../../../../schemas/fixtures/prompt-package-exemple.json'
import referentielFixture from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import { DAY_DOCS, STATUT_NON_ETABLIE, clone, etablies, llmReplyFor, withStatuts } from '../support/banc.js'

/** Fournisseur factice du moteur qui rejoue les fixtures, usage fixe. */
function replayProvider(options = {}) {
  return createMockProvider({
    responses: ({ prompt }) => llmReplyFor(prompt, options),
    usage: { inputTokens: 1000, outputTokens: 200 },
  })
}

const run = (docsByIso) => ({ days: Object.entries(docsByIso).map(([iso, document]) => ({ iso, document })) })

describe('UC-PRO-05 — sources du banc (étape 2)', () => {
  it('UC-PRO-05-U06 — client de l’atelier : routes des sources du banc, segments encodés', async () => {
    const apiFetchFn = vi.fn(async () => ({}))
    const api = createPromptologueApi(apiFetchFn)
    await api.listPublished()
    await api.listDrafts()
    await api.getDraft('12')
    await api.getPackage('aurora lab', '2.0.0')
    await api.listReferentielVersions()
    await api.getReferentielVersion('7.1.0')
    expect(apiFetchFn.mock.calls.map(([path]) => path)).toEqual([
      'prompt-packages',
      'prompt-packages/drafts',
      'prompt-packages/drafts/12',
      'prompt-packages/aurora%20lab/2.0.0',
      'referentiel/versions',
      'referentiel/versions/7.1.0',
    ])
    // Lectures seules : aucune méthode, aucun corps.
    expect(apiFetchFn.mock.calls.every(([, options]) => options === undefined)).toBe(true)
  })

  it('UC-PRO-05-U07 — normalizeDraftEntry : un brouillon lu par GET drafts/{id} garde son document', () => {
    const entry = { draftId: 12, id: 'aurora-lab', version: '2.1.0', status: 'draft', document: clone(pkgFixture) }
    expect(normalizeDraftEntry(entry)).toMatchObject({ draftId: '12', document: pkgFixture })
    // Métadonnées sans document : non exécutable (le banc l'écarte).
    expect(normalizeDraftEntry({ draftId: 3, id: 'x', version: '1.0.0' }).document).toBeNull()
    expect(normalizeDraftEntry(null)).toBeNull()
  })

  it('UC-PRO-05-U08 — portfolio de test embarqué : la fixture fictive « Maya » donne 3 journées datées', () => {
    const groups = fixtureDayGroups()
    expect(FIXTURE_LABEL).toBe('Fixture embarquée : Maya, 3 journées')
    expect(groups.map((g) => g.iso)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    expect(groups.every((g) => g.texte.trim().length > 100)).toBe(true)
  })
})

describe('UC-PRO-05 — exécution d’une version (étape 5)', () => {
  it('UC-PRO-05-U09 — runVersionOnDays + vrai moteur : 8 appels par journée, documents reconstruits, usage réel cumulé', async () => {
    const provider = replayProvider()
    const progress = []
    const result = await runVersionOnDays({
      pkg: BUILTIN_PACKAGE,
      dayGroups: fixtureDayGroups(),
      referentiel: referentielFixture,
      provider,
      model: 'demo',
      temperature: 0.3,
      onProgress: (p) => progress.push(p),
    })

    expect(result.engine).toBe(true)
    expect(result.pkg).toEqual({ id: 'aurora-v3-reconstruit', version: '1.0.0' })
    expect(result.llmCalls).toBe(24)
    for (const { iso, document } of result.days) expect(document).toEqual(DAY_DOCS[iso])
    // Mesure autoritaire : la somme des compteurs renvoyés par le fournisseur.
    expect(result.usage).toEqual({ inputTokens: 24000, outputTokens: 4800, mesures: 24 })
    expect(provider.calls.every((c) => c.temperature === 0.3)).toBe(true)
    expect(progress.at(-1)).toEqual({ iso: '2026-01-07', position: 3, total: 3, calls: 24 })
  })

  it('UC-PRO-05-U10 — runVersionOnDays, périmètre UNE compétence : un appel, document marqué partiel', async () => {
    const provider = replayProvider()
    const result = await runVersionOnDays({
      pkg: BUILTIN_PACKAGE,
      dayGroups: fixtureDayGroups().slice(0, 1),
      referentiel: referentielFixture,
      provider,
      model: 'demo',
      perimetre: { competences: ['2.01'] },
    })
    expect(provider.callCount).toBe(1)
    expect(result.days[0].document.perimetre).toEqual({ partiel: true, poles: [2], competences: ['2.01'] })
    expect(result.days[0].document.poles.map((p) => p.poleNum)).toEqual(['2'])
  })

  it('UC-PRO-05-U11 — createProviderBundle : Service humanome (modèle « demo », tarif de référence) ou clé personnelle obligatoire', () => {
    const service = createProviderBundle({ mode: 'humanome', fetchFn: vi.fn() })
    expect(service).toMatchObject({ model: 'demo', estimationModel: 'claude-sonnet-5' })
    expect(typeof service.prime).toBe('function')

    expect(() => createProviderBundle({ mode: 'cle', provider: 'anthropic', apiKey: '' })).toThrow(
      'Une clé API Anthropic (Claude) est requise pour lancer ce run.',
    )
    const cle = createProviderBundle({ mode: 'cle', provider: 'anthropic', apiKey: 'sk-ant-x', fetchFn: vi.fn() })
    expect(cle).toMatchObject({ model: 'claude-sonnet-4-6', estimationModel: 'claude-sonnet-4-6', prime: null })
    expect(() => createProviderBundle({ mode: 'cle', provider: 'inconnu', apiKey: 'k' })).toThrow('Fournisseur inconnu')
  })

  it('UC-PRO-05-U12 — routage : moteur embarqué, sandbox, Twin6 ; alerte « référentiel en dur »', () => {
    const engine = { ...clone(pkgFixture), code: { ...pkgFixture.code, orchestration: '// engine://humanome-engine@0.1.0' } }
    const twin6 = { ...clone(pkgFixture), code: { ...pkgFixture.code, orchestration: '// engine://x (twin6)' } }
    expect(usesEngineOrchestration(BUILTIN_PACKAGE)).toBe(true)
    expect(usesEngineOrchestration(engine)).toBe(true)
    expect(usesEngineOrchestration(pkgFixture)).toBe(false) // code personnalisé -> sandbox (UC-PRO-07)
    expect(usesTwin6Engine(twin6)).toBe(true)
    expect(usesTwin6Engine(engine)).toBe(false)
    expect(detectReferentielEnDur(twin6).enDur).toBe(true)
    // Le paquet fixture itère referentiel.poles/competences : pas d'alerte.
    expect(detectReferentielEnDur(pkgFixture)).toEqual({ enDur: false, motif: null })
  })
})

describe('UC-PRO-05 — mesures et rapports (étape 6)', () => {
  it('UC-PRO-05-U13 — buildEstimate : le banc estime ce qu’il exécute (pas de récits de fusion, pôles retenus)', () => {
    const days = fixtureDayGroups()
    const complet = buildEstimate({ dayGroups: days, referentiel: referentielFixture, model: 'claude-sonnet-5' })
    const banc = buildEstimate({ dayGroups: days, referentiel: referentielFixture, model: 'claude-sonnet-5', callsPerDay: 8, mergeCalls: 0 })
    const uneCompetence = buildEstimate({ dayGroups: days.slice(0, 1), referentiel: referentielFixture, model: 'claude-sonnet-5', callsPerDay: 1, mergeCalls: 0 })
    expect(complet.totalCalls).toBe(3 * 8 + 69)
    expect(banc.totalCalls).toBe(24)
    expect(uneCompetence.totalCalls).toBe(1)
    expect(banc.costUsd).toBeLessThan(complet.costUsd)
    // Modèle hors table (« demo ») : tokens estimés, coût inconnu (null).
    const demo = buildEstimate({ dayGroups: days, referentiel: referentielFixture, model: 'demo', mergeCalls: 0 })
    expect(demo.costUsd).toBeNull()
    expect(demo.tokensIn).toBe(banc.tokensIn)
  })

  it('UC-PRO-05-U14 — coût réel : chiffré sur le modèle de TARIF (service humanome), totaux de session additionnés', () => {
    const usage = { inputTokens: 8000, outputTokens: 1600, mesures: 8 }
    expect(realCostUsd(usage, 'demo')).toBeNull() // l'indice de modèle du service n'est pas tarifé
    expect(realCostUsd(usage, 'claude-sonnet-5')).toBe(0.048)
    expect(realCostUsd({ inputTokens: 0, outputTokens: 0, mesures: 0 }, 'claude-sonnet-5')).toBeNull()
    const session = sumUsages([usage, usage, null])
    expect(session).toEqual({ inputTokens: 16000, outputTokens: 3200, mesures: 16 })
    expect(realCostUsd(session, 'claude-sonnet-5')).toBe(0.096)
  })

  it('UC-PRO-05-U15 — buildAbReport → scoreVsReference sur les fixtures : P = R = F1 = 75 %, journée hors score', () => {
    const genere = run({ '2026-01-05': DAY_DOCS['2026-01-05'] })
    const reference = run({
      '2026-01-05': withStatuts(DAY_DOCS['2026-01-05'], { '1.01': 'présence établie', '2.01': STATUT_NON_ETABLIE }),
      '2026-01-06': DAY_DOCS['2026-01-06'],
    })
    const report = buildAbReport({
      portfolioLabel: 'Fixture',
      a: { pkg: { id: 'a', version: '1' }, llmCalls: 8, durationMs: 1, ...genere },
      b: { pkg: { id: 'reference-importee', version: 'import' }, llmCalls: 0, durationMs: 0, ...reference },
      now: () => '2026-09-28T00:00:00.000Z',
    })
    expect(report.parJour.map((j) => [j.iso, j.couvertA, j.couvertB])).toEqual([
      ['2026-01-05', true, true],
      ['2026-01-06', false, true],
    ])
    const score = scoreVsReference(report)
    expect(score).toMatchObject({ vraisPositifs: 3, fauxPositifs: 1, fauxNegatifs: 1, precision: 0.75, rappel: 0.75, f1: 0.75 })
    expect(score.joursExclus).toEqual(['2026-01-06'])
    // Périmètre restreint à 2.01 : 1.01 (hors périmètre) ne compte pas comme manquée.
    expect(scoreVsReference(report, { codesRetenus: ['2.01'] })).toMatchObject({ vraisPositifs: 0, fauxPositifs: 1, fauxNegatifs: 0, f1: null })
  })

  it('UC-PRO-05-U16 — buildAbMultiReport : seuils 0,25 / 0,75 inclus (écart franc), 0,5 = bruit', () => {
    const base = DAY_DOCS['2026-01-05']
    const sans = (codes) => withStatuts(base, Object.fromEntries(codes.map((c) => [c, STATUT_NON_ETABLIE])))
    const runsA = [run({ '2026-01-05': base }), run({ '2026-01-05': base }), run({ '2026-01-05': base }), run({ '2026-01-05': sans(['2.01', '3.04']) })]
    const runsB = [run({ '2026-01-05': sans(['2.01', '3.04']) }), run({ '2026-01-05': sans(['2.01']) }), run({ '2026-01-05': sans(['2.01', '3.04']) }), run({ '2026-01-05': base })]
    const report = buildAbMultiReport({ runsA, runsB })
    const byCode = Object.fromEntries(report.lignes.map((l) => [l.code, l]))
    expect(byCode['2.01']).toMatchObject({ pA: 0.75, pB: 0.25, classe: 'ecart-vers-a' })
    expect(byCode['3.04']).toMatchObject({ pA: 0.75, pB: 0.5, classe: 'bruit' })
    expect(byCode['5.03'].classe).toBe('accord')
    expect(report.resume).toEqual({ ecartsVersA: 1, ecartsVersB: 0, bruit: 1, accords: etablies(base).length - 2 })
    expect(report.consistance.a.nbRuns).toBe(4)
  })

  it('UC-PRO-05-U17 — carnet : configuration emblématique exportée sans aucune clé, réimportable', () => {
    const carnet = addConfig(emptyCarnet(), {
      nom: 'llm-vs-llm',
      note: 'A/B service vs haiku',
      config: { mode: 'ab', fournisseurB: { mode: 'cle', provider: 'anthropic', apiKey: 'sk-ant-SECRETE', model: 'claude-haiku-4-5' } },
    })
    const exported = exportCarnet(carnet)
    expect(exported).not.toContain('sk-ant-SECRETE')
    const reimported = importCarnet(exported)
    expect(reimported.configs[0]).toMatchObject({ nom: 'llm-vs-llm', config: { mode: 'ab', fournisseurB: { mode: 'cle', model: 'claude-haiku-4-5' } } })
    expect(() => importCarnet(JSON.stringify({ kind: 'autre-chose' }))).toThrow()
  })
})

describe('UC-PRO-05 — préparation, rapports et réimport', () => {
  it('UC-PRO-05-U23 — filterDayGroups : tout, une journée, une période (bornes incluses) ; période inversée refusée (E2)', () => {
    const days = fixtureDayGroups()
    expect(filterDayGroups(days).map((g) => g.iso)).toHaveLength(3)
    expect(filterDayGroups(days, { type: 'jour', jour: '2026-01-06' }).map((g) => g.iso)).toEqual(['2026-01-06'])
    expect(filterDayGroups(days, { type: 'periode', du: '2026-01-06', au: '' }).map((g) => g.iso)).toEqual(['2026-01-06', '2026-01-07'])
    expect(() => filterDayGroups(days, { type: 'periode', du: '2026-01-07', au: '2026-01-05' })).toThrow('Période invalide')
    expect(() => filterDayGroups(days, { type: 'jour', jour: '2027-01-01' })).toThrow('Aucune journée')
  })

  it('UC-PRO-05-U24 — buildMultiRunReport + buildConsistencyView : modèle affiché du multi-run (A2)', () => {
    const runs = [
      run({ '2026-01-05': DAY_DOCS['2026-01-05'] }),
      run({ '2026-01-05': withStatuts(DAY_DOCS['2026-01-05'], { '2.01': STATUT_NON_ETABLIE }) }),
      run({ '2026-01-05': DAY_DOCS['2026-01-05'] }),
    ]
    const report = buildMultiRunReport(runs)
    expect(report.nbRuns).toBe(3)
    expect(report.distanceMoyenne).toBe(report.parJour[0].comparison.distanceStructurelle)
    const view = buildConsistencyView(report.parJour[0].comparison, { competenceNames: { '2.01': 'Intelligence émotionnelle' } })
    expect(view.stables.map((s) => s.code)).toEqual(['3.04', '5.03', '7.01'])
    expect(view.divergentes[0]).toMatchObject({ code: '2.01', nom: 'Intelligence émotionnelle', presenteDans: [1, 3], absenteDans: [2] })
    expect(view.divergentes[0].statuts.map((s) => s.runs)).toEqual([[1, 3], [2]])
    expect(() => buildMultiRunReport(runs.slice(0, 1))).toThrow('au moins 2 runs')
  })

  it('UC-PRO-05-U25 — buildRunReport → normalizeReferenceImport : un run exporté se réimporte comme référence (A1 → A4)', () => {
    const exported = buildRunReport({
      portfolioLabel: 'Fixture embarquée : Maya, 3 journées',
      run: { pkg: { id: 'aurora-lab', version: '2.0.0' }, llmCalls: 8, durationMs: 10, days: [{ iso: '2026-01-06', document: DAY_DOCS['2026-01-06'] }] },
      now: () => '2026-09-28T00:00:00.000Z',
    })
    const reference = normalizeReferenceImport(JSON.parse(JSON.stringify(exported)))
    expect(reference).toMatchObject({ pkg: { id: 'aurora-lab', version: '2.0.0' }, reference: true, llmCalls: 0, label: 'Référence : Fixture embarquée : Maya, 3 journées' })
    expect(reference.days).toEqual([{ iso: '2026-01-06', document: DAY_DOCS['2026-01-06'] }])
    expect(() => normalizeReferenceImport({ kind: 'autre' })).toThrow('JSON de référence non reconnu')
  })

  it('UC-PRO-05-U26 — buildCompetenceDiff : écart avec la délibération du jury des DEUX côtés (pièces, verbatim, verdict)', () => {
    const diff = buildCompetenceDiff(
      run({ '2026-01-05': DAY_DOCS['2026-01-05'] }),
      run({ '2026-01-05': withStatuts(DAY_DOCS['2026-01-05'], { '2.01': STATUT_NON_ETABLIE }) }),
    )
    const [jour] = diff.parJour
    expect(jour.seulementB).toEqual([])
    const [ecart] = jour.seulementA
    expect(ecart).toMatchObject({ code: '2.01', statutA: 'présence établie', statutB: STATUT_NON_ETABLIE })
    expect(ecart.detailA.pieces.length).toBeGreaterThan(0)
    expect(ecart.detailA.pieces.every((p) => typeof p.extraitVerbatim === 'string')).toBe(true)
    expect(ecart.detailB.verdict.statut).toBe(STATUT_NON_ETABLIE)
  })
})
