// Banc d'essai (P10.4) — logique pure : routage moteur/sandbox, résumés,
// consistance multi-run (engine compareRuns), rapport A/B.
import { describe, expect, it, vi } from 'vitest'
import jourFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import jour2Fixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-06.json'
import pkgFixture from '../../../../schemas/fixtures/prompt-package-exemple.json'
import referentielFixture from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import { BUILTIN_PACKAGE } from '../../lib/run-launcher.js'
import {
  TWIN6_PERIMETRE_NOTE,
  buildAbMultiReport,
  buildAbReport,
  buildCompetenceDiff,
  buildMultiRunReport,
  buildRunReport,
  compareCodes,
  dayGroupsToPortfolio,
  detectReferentielEnDur,
  extractCompetenceDetail,
  extractTwin6Templates,
  filterDayGroups,
  normalizeReferenceImport,
  realCostUsd,
  reportDataUrl,
  runVersionOnDays,
  scoreVsReference,
  summarizeDocument,
  sumUsages,
  usesTwin6Engine,
  validatePartialJour,
} from './bench.js'
import { fixtureDayGroups, FIXTURE_LABEL } from './BancEssaiSection.jsx'

const DAYS = [
  { iso: '2026-01-05', texte: 'Journée 1.' },
  { iso: '2026-01-06', texte: 'Journée 2.' },
]

describe('summarizeDocument / compareCodes', () => {
  it('classe les codes par statut de verdict', () => {
    const resume = summarizeDocument(jourFixture)
    expect(resume.etablies).toEqual(['2.01', '3.04', '5.03', '7.01'])
    expect(resume.renvois).toEqual(['1.03'])
    expect(resume.nonEtablies).toHaveLength(10)
  })

  it('compare deux ensembles de codes établis', () => {
    const diff = compareCodes(['1.01', '2.01'], ['2.01', '3.04'])
    expect(diff).toEqual({ communes: ['2.01'], seulementA: ['1.01'], seulementB: ['3.04'] })
  })
})

describe('runVersionOnDays — routage moteur embarqué vs sandbox', () => {
  it('paquet par défaut (engine://) -> extractDay direct, JAMAIS la sandbox', async () => {
    const extractDayFn = vi.fn(async ({ date }) => ({ ...jourFixture, date }))
    const sandboxRunner = vi.fn()
    const result = await runVersionOnDays({
      pkg: BUILTIN_PACKAGE,
      dayGroups: DAYS,
      referentiel: referentielFixture,
      provider: { complete: async () => ({ text: '' }) },
      model: 'test',
      extractDayFn,
      sandboxRunner,
    })
    expect(extractDayFn).toHaveBeenCalledTimes(2)
    expect(sandboxRunner).not.toHaveBeenCalled()
    expect(result.engine).toBe(true)
    expect(result.days.map((d) => d.iso)).toEqual(['2026-01-05', '2026-01-06'])
    // kairosOptional : les 7 pôles portent la valeur, la synthèse peut dégrader.
    expect(extractDayFn.mock.calls[0][0].kairosOptional).toBe(true)
  })

  it('paquet avec code personnalisé -> LA SANDBOX, jamais extractDay', async () => {
    const extractDayFn = vi.fn()
    const sandboxRunner = vi.fn(async ({ date }) => ({
      document: { ...jourFixture, date },
      llmCalls: 8,
      durationMs: 5,
    }))
    const result = await runVersionOnDays({
      pkg: pkgFixture,
      dayGroups: DAYS,
      referentiel: referentielFixture,
      provider: { complete: async () => ({ text: '' }) },
      model: 'test',
      extractDayFn,
      sandboxRunner,
    })
    expect(sandboxRunner).toHaveBeenCalledTimes(2)
    expect(extractDayFn).not.toHaveBeenCalled()
    expect(result.engine).toBe(false)
    expect(result.llmCalls).toBe(16)
    expect(sandboxRunner.mock.calls[0][0]).toMatchObject({
      pkg: pkgFixture,
      dayText: 'Journée 1.',
      date: '2026-01-05',
    })
  })
})

describe('runVersionOnDays — branche Twin6 (portfolio entier -> merge)', () => {
  const twin6Pkg = {
    id: 'twin6-ouverte',
    version: '1.0.0',
    prompts: [
      { role: 'twin6-scan-pole', texte: 'SCAN ${POLE}' },
      { role: 'twin6-kairos', texte: 'KAIROS' },
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ role: `twin6-fiche-${n}`, texte: `FICHE ${n}` })),
    ],
    code: { orchestration: '// engine://humanome-engine@0.1.0 (twin6)\n', entrypoint: 'executerTwin6' },
  }

  it('usesTwin6Engine détecte le marqueur (twin6), pas un paquet aurora', () => {
    expect(usesTwin6Engine(twin6Pkg)).toBe(true)
    expect(usesTwin6Engine(BUILTIN_PACKAGE)).toBe(false)
    expect(usesTwin6Engine(pkgFixture)).toBe(false)
  })

  it('extractTwin6Templates lit scanPole/kairos/fiches depuis prompts[]', () => {
    const t = extractTwin6Templates(twin6Pkg)
    expect(t.scanPole).toBe('SCAN ${POLE}')
    expect(t.kairos).toBe('KAIROS')
    expect(Object.keys(t.fiches)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(t.fiches['3']).toBe('FICHE 3')
  })

  it('extractTwin6Templates rejette un paquet Twin6 incomplet', () => {
    expect(() => extractTwin6Templates({ prompts: [{ role: 'twin6-kairos', texte: 'K' }] })).toThrow(
      /incomplet/,
    )
  })

  it('dayGroupsToPortfolio assemble des feuilles ### AAAA-MM-JJ', () => {
    const portfolio = dayGroupsToPortfolio(DAYS)
    expect(portfolio).toBe('### 2026-01-05\n\nJournée 1.\n\n### 2026-01-06\n\nJournée 2.')
  })

  it('exécute executerTwin6 sur le portfolio entier et renvoie un résultat merge', async () => {
    const mergeDoc = { kind: 'cartographie-merge', periode: { nbFeuilles: 2 } }
    const executerTwin6Fn = vi.fn(async () => ({ document: mergeDoc }))
    const extractDayFn = vi.fn()
    const sandboxRunner = vi.fn()
    const result = await runVersionOnDays({
      pkg: twin6Pkg,
      dayGroups: DAYS,
      referentiel: referentielFixture,
      provider: { complete: async () => ({ text: '{}' }) },
      model: 'test',
      executerTwin6Fn,
      extractDayFn,
      sandboxRunner,
    })
    expect(executerTwin6Fn).toHaveBeenCalledTimes(1)
    expect(extractDayFn).not.toHaveBeenCalled()
    expect(sandboxRunner).not.toHaveBeenCalled()
    const arg = executerTwin6Fn.mock.calls[0][0]
    expect(arg.portfolio).toContain('### 2026-01-05')
    expect(arg.templates.scanPole).toBe('SCAN ${POLE}')
    expect(result.twin6).toBe(true)
    expect(result.engine).toBe(true)
    expect(result.mergeDoc).toBe(mergeDoc)
    expect(result.days).toEqual([])
  })
})

describe('buildMultiRunReport — consistance (engine compareRuns)', () => {
  it('runs identiques : distance 0, toutes les établies communes', () => {
    const run = { days: [{ iso: '2026-01-05', document: jourFixture }] }
    const report = buildMultiRunReport([run, run, run])
    expect(report.nbRuns).toBe(3)
    expect(report.distanceMoyenne).toBe(0)
    expect(report.parJour[0].comparison.competencesCommunes).toEqual([
      '2.01', '3.04', '5.03', '7.01',
    ])
  })

  it('runs divergents : compétences divergentes et distance > 0', () => {
    const variant = structuredClone(jourFixture)
    for (const pole of variant.poles) {
      for (const comp of pole.competences) {
        if (comp.code === '2.01') comp.verdict.statut = 'présence non établie'
      }
    }
    const report = buildMultiRunReport([
      { days: [{ iso: '2026-01-05', document: jourFixture }] },
      { days: [{ iso: '2026-01-05', document: variant }] },
    ])
    expect(report.distanceMoyenne).toBeGreaterThan(0)
    const divergentes = report.parJour[0].comparison.competencesDivergentes.map((d) => d.code)
    expect(divergentes).toContain('2.01')
  })

  it('exige au moins 2 runs', () => {
    expect(() => buildMultiRunReport([{ days: [] }])).toThrow(/au moins 2 runs/)
  })
})

describe('buildAbReport — comparaison A/B téléchargeable', () => {
  it('tableau par jour + totaux + estimations, sérialisable en JSON', () => {
    const a = {
      pkg: { id: 'aurora-demo', version: '1.0.0' },
      days: [{ iso: '2026-01-05', document: jourFixture }],
      llmCalls: 8,
      durationMs: 2000,
    }
    const variant = structuredClone(jourFixture)
    for (const pole of variant.poles) {
      for (const comp of pole.competences) {
        if (comp.code === '2.01') comp.verdict.statut = 'présence non établie'
      }
    }
    const b = {
      pkg: { id: 'aurora-demo', version: '2.0.0' },
      days: [{ iso: '2026-01-05', document: variant }],
      llmCalls: 9,
      durationMs: 2500,
    }
    const report = buildAbReport({
      portfolioLabel: 'Fixture',
      a,
      b,
      now: () => '2026-07-12T10:00:00Z',
    })
    expect(report.versions.a).toEqual({
      version: 'aurora-demo@1.0.0',
      llmCalls: 8,
      durationMs: 2000,
      usage: null,
      etabliesTotal: 4,
    })
    expect(report.versions.b.etabliesTotal).toBe(3)
    expect(report.parJour[0].seulementA).toEqual(['2.01'])
    expect(report.parJour[0].seulementB).toEqual([])
    expect(report.parJour[0].communes).toEqual(['3.04', '5.03', '7.01'])
    // Rapport téléchargeable : data-URL JSON auto-portante.
    const url = reportDataUrl(report)
    expect(url.startsWith('data:application/json')).toBe(true)
    const parsed = JSON.parse(decodeURIComponent(url.split(',').slice(1).join(',')))
    expect(parsed.kind).toBe('rapport-ab-prompt-packages')
  })
})

describe('fixture de portfolio embarquée', () => {
  it('la fixture Maya se segmente en 3 journées datées', () => {
    const groups = fixtureDayGroups()
    expect(groups.map((g) => g.iso)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    expect(FIXTURE_LABEL).toContain('3 journées')
    expect(groups[0].texte).toContain('Astrolabe')
  })

  it('les documents jour fixtures couvrent les mêmes dates (cohérence corpus)', () => {
    expect(jourFixture.date).toBe('2026-01-05')
    expect(jour2Fixture.date).toBe('2026-01-06')
  })
})

describe('filterDayGroups — périmètre du journal', () => {
  const groups = [
    { iso: '2026-01-05', texte: 'a' },
    { iso: '2026-01-06', texte: 'b' },
    { iso: '2026-01-08', texte: 'c' },
  ]

  it('tout / une journée / une période (bornes incluses)', () => {
    expect(filterDayGroups(groups)).toEqual(groups)
    expect(filterDayGroups(groups, { type: 'tous' })).toEqual(groups)
    expect(filterDayGroups(groups, { type: 'jour', jour: '2026-01-06' })).toEqual([groups[1]])
    expect(filterDayGroups(groups, { type: 'periode', du: '2026-01-06', au: '2026-01-08' }))
      .toEqual([groups[1], groups[2]])
    // Bornes vides = ouvertes.
    expect(filterDayGroups(groups, { type: 'periode', du: '', au: '2026-01-05' }))
      .toEqual([groups[0]])
  })

  it('période inversée ou sélection vide -> erreur explicite', () => {
    expect(() => filterDayGroups(groups, { type: 'periode', du: '2026-01-08', au: '2026-01-05' }))
      .toThrow(/Période invalide/)
    expect(() => filterDayGroups(groups, { type: 'jour', jour: '2026-02-01' }))
      .toThrow(/Aucune journée/)
    expect(() => filterDayGroups(groups, { type: 'inconnu' })).toThrow(/inconnue/)
  })
})

describe('detectReferentielEnDur', () => {
  it('paquet embarqué et paquet sandbox « propre » -> pas d’alerte', () => {
    expect(detectReferentielEnDur(BUILTIN_PACKAGE).enDur).toBe(false)
    // La fixture exemple itère referentiel.poles/competences dans son orchestration.
    expect(detectReferentielEnDur(pkgFixture).enDur).toBe(false)
  })

  it('marqueur Twin6 -> fiches embarquées signalées', () => {
    const det = detectReferentielEnDur({ code: { orchestration: 'engine://scan(twin6)' } })
    expect(det.enDur).toBe(true)
    expect(det.motif).toContain('Twin6')
  })

  it('fiche de compétences en toutes lettres dans un gabarit -> alerte', () => {
    const det = detectReferentielEnDur({
      prompts: [{ role: 'x', nom: 'x', texte: '## 1.01 — Pensée Critique\n\nCritères…' }],
      code: { orchestration: 'export async function run({ referentiel }) {}' },
    })
    expect(det.enDur).toBe(true)
    expect(det.motif).toContain('en dur')
  })

  it('orchestration sandbox qui ignore son paramètre referentiel -> alerte', () => {
    const det = detectReferentielEnDur({
      prompts: [{ role: 'x', nom: 'x', texte: 'Analyse la feuille.' }],
      code: { orchestration: 'export async function run({ providers }) { return {} }' },
    })
    expect(det.enDur).toBe(true)
    expect(det.motif).toContain('referentiel')
  })
})

describe('extractCompetenceDetail — traces du jury', () => {
  it('résout pièces, extraits verbatim, pédagogue et verdict', () => {
    const detail = extractCompetenceDetail(jourFixture, '2.01')
    expect(detail.statut).toBe('présence établie')
    expect(detail.poleNum).toBe('2')
    expect(detail.pieces).toHaveLength(2)
    // L'extrait verbatim vient de passagesSaillants (résolution par pid).
    expect(detail.pieces[0].extraitVerbatim).toContain('Naël')
    expect(detail.pedagogue.presomptionAbsence.piecesQuiResistent).toHaveLength(2)
    expect(detail.verdict.motif).toBeTruthy()
  })

  it('code absent du document -> null', () => {
    expect(extractCompetenceDetail(jourFixture, '9.99')).toBeNull()
  })
})

describe('buildCompetenceDiff — écarts avec traces des deux côtés', () => {
  it('compétence établie en A seulement : statuts et détails des deux côtés', () => {
    const docB = structuredClone(jourFixture)
    for (const pole of docB.poles) {
      for (const comp of pole.competences) {
        if (comp.code === '2.01') comp.verdict.statut = 'présence non établie'
      }
    }
    const diff = buildCompetenceDiff(
      { days: [{ iso: '2026-01-05', document: jourFixture }] },
      { days: [{ iso: '2026-01-05', document: docB }] },
    )
    expect(diff.parJour).toHaveLength(1)
    const jour = diff.parJour[0]
    expect(jour.communes).toEqual(['3.04', '5.03', '7.01'])
    expect(jour.seulementB).toEqual([])
    expect(jour.seulementA).toHaveLength(1)
    const entry = jour.seulementA[0]
    expect(entry.code).toBe('2.01')
    expect(entry.statutA).toBe('présence établie')
    expect(entry.statutB).toBe('présence non établie')
    expect(entry.detailA.pieces).toHaveLength(2)
    expect(entry.detailB.pedagogue).toBeTruthy()
  })

  it('journées disjointes : union des jours, détail absent = null', () => {
    const diff = buildCompetenceDiff(
      { days: [{ iso: '2026-01-05', document: jourFixture }] },
      { days: [{ iso: '2026-01-06', document: jour2Fixture }] },
    )
    expect(diff.parJour.map((j) => j.iso)).toEqual(['2026-01-05', '2026-01-06'])
    const j5 = diff.parJour[0]
    expect(j5.seulementA.length).toBeGreaterThan(0)
    expect(j5.seulementA[0].detailB).toBeNull()
    expect(j5.seulementA[0].statutB).toBeNull()
  })
})

describe('normalizeReferenceImport', () => {
  it('document cartographie-jour seul', () => {
    const run = normalizeReferenceImport(structuredClone(jourFixture))
    expect(run.reference).toBe(true)
    expect(run.days).toEqual([{ iso: '2026-01-05', document: expect.any(Object) }])
    expect(run.pkg.id).toBe('reference-importee')
    expect(run.llmCalls).toBe(0)
  })

  it('tableau de documents, trié par date', () => {
    const run = normalizeReferenceImport([structuredClone(jour2Fixture), structuredClone(jourFixture)])
    expect(run.days.map((d) => d.iso)).toEqual(['2026-01-05', '2026-01-06'])
  })

  it('un export du banc (buildRunReport) se réimporte tel quel', () => {
    const report = buildRunReport({
      portfolioLabel: 'Maya',
      run: {
        pkg: { id: 'aurora-demo', version: '1.0.0' },
        days: [{ iso: '2026-01-05', document: structuredClone(jourFixture) }],
        llmCalls: 8,
        durationMs: 2000,
      },
      config: { modele: 'demo' },
      now: () => '2026-07-17T00:00:00.000Z',
    })
    expect(report.kind).toBe('rapport-run-banc')
    const run = normalizeReferenceImport(structuredClone(report))
    expect(run.pkg).toEqual({ id: 'aurora-demo', version: '1.0.0' })
    expect(run.days.map((d) => d.iso)).toEqual(['2026-01-05'])
    expect(run.label).toContain('Maya')
  })

  it('documents invalides, dates en double, formes inconnues -> erreurs', () => {
    expect(() => normalizeReferenceImport({ kind: 'cartographie-jour', date: '2026-01-05', poles: [] }))
      .toThrow(/invalide au schéma/)
    expect(() =>
      normalizeReferenceImport([structuredClone(jourFixture), structuredClone(jourFixture)]),
    ).toThrow(/en double/)
    expect(() => normalizeReferenceImport({ nimporte: 'quoi' })).toThrow(/non reconnu/)
    expect(() => normalizeReferenceImport('texte')).toThrow(/illisible/)
    expect(() => normalizeReferenceImport({ days: [] })).toThrow(/vide/)
  })

  it('document à périmètre partiel VALIDE accepté (sonde tolérante, marqueur retiré)', () => {
    const partiel = {
      schemaVersion: '1.0.0',
      kind: 'cartographie-jour',
      date: '2026-01-05',
      poles: [structuredClone(jourFixture.poles[1])],
      kairos: null,
      perimetre: { partiel: true, poles: [2], competences: ['2.01'] },
    }
    const run = normalizeReferenceImport(partiel)
    expect(run.days[0].document.poles).toHaveLength(1)
  })

  it('le marqueur perimetre.partiel ne DÉSACTIVE PAS la validation (JSON forgé refusé)', () => {
    // Un fichier hostile pose le marqueur pour faire passer un objet arbitraire :
    // la sonde tolérante doit quand même valider la structure des pôles.
    const forge = {
      schemaVersion: '1.0.0',
      kind: 'cartographie-jour',
      date: '2026-01-05',
      poles: [{ poleNum: '2', competences: [{ code: '2.01', pieces: [{ contexte: { a: 1 } }] }] }],
      kairos: null,
      perimetre: { partiel: true },
    }
    expect(() => normalizeReferenceImport(forge)).toThrow(/invalide au schéma/)
  })
})

describe('validatePartialJour — sonde de validation à moins de 7 pôles', () => {
  it('document partiel valide via la sonde ; document complet inchangé', () => {
    const partiel = {
      schemaVersion: '1.0.0',
      kind: 'cartographie-jour',
      date: '2026-01-05',
      poles: [structuredClone(jourFixture.poles[1])],
      kairos: null,
    }
    expect(validatePartialJour('cartographie-jour', partiel).valid).toBe(true)
    expect(validatePartialJour('cartographie-jour', structuredClone(jourFixture)).valid).toBe(true)
    // Un pôle structurellement invalide reste refusé.
    const casse = { ...partiel, poles: [{ poleNum: '2' }] }
    expect(validatePartialJour('cartographie-jour', casse).valid).toBe(false)
  })

  it('le marqueur perimetre (hors schéma) est retiré avant la sonde', () => {
    const partiel = {
      schemaVersion: '1.0.0',
      kind: 'cartographie-jour',
      date: '2026-01-05',
      poles: [structuredClone(jourFixture.poles[1])],
      kairos: null,
      perimetre: { partiel: true, poles: [2], competences: ['2.01'] },
    }
    expect(validatePartialJour('cartographie-jour', partiel).valid).toBe(true)
  })

  it('PLUS de 7 pôles : validation stricte (refusé), jamais tronqué par la sonde', () => {
    const huit = structuredClone(jourFixture)
    huit.poles.push(structuredClone(huit.poles[0]))
    const { valid, errors } = validatePartialJour('cartographie-jour', huit)
    expect(valid).toBe(false)
    expect(JSON.stringify(errors)).toContain('7')
  })
})

describe('runVersionOnDays — périmètre restreint et température', () => {
  const perimetre = { competences: ['2.01'] }

  it('moteur : le périmètre est transmis à extractDay', async () => {
    const extractDayFn = vi.fn(async ({ date }) => ({ ...structuredClone(jourFixture), date }))
    await runVersionOnDays({
      pkg: BUILTIN_PACKAGE,
      dayGroups: [DAYS[0]],
      referentiel: referentielFixture,
      provider: { complete: async () => ({ text: '' }) },
      model: 'test',
      perimetre,
      extractDayFn,
      sandboxRunner: vi.fn(),
    })
    expect(extractDayFn.mock.calls[0][0].perimetre).toEqual(perimetre)
  })

  it('sandbox : référentiel restreint + validation tolérante injectés, document MARQUÉ partiel', async () => {
    const sandboxRunner = vi.fn(async () => ({
      document: structuredClone(jourFixture),
      llmCalls: 3,
    }))
    const result = await runVersionOnDays({
      pkg: { ...structuredClone(pkgFixture), id: 'custom', version: '0.1.0' },
      dayGroups: [DAYS[0]],
      referentiel: referentielFixture,
      provider: { complete: async () => ({ text: '' }) },
      model: 'test',
      perimetre,
      extractDayFn: vi.fn(),
      sandboxRunner,
    })
    const args = sandboxRunner.mock.calls[0][0]
    expect(args.referentiel.competences.map((c) => c.code)).toEqual(['2.01'])
    expect(args.referentiel.poles.map((p) => p.num)).toEqual([2])
    expect(args.validateFn).toBe(validatePartialJour)
    // Même marqueur que le moteur : sans lui, l'export du run ne se
    // réimporterait pas comme référence (validation stricte 7 pôles).
    expect(result.days[0].document.perimetre).toEqual({
      partiel: true,
      poles: [2],
      competences: ['2.01'],
    })
  })

  it('run sandbox partiel exporté (buildRunReport) -> réimportable comme référence', async () => {
    const partialDoc = {
      schemaVersion: '1.0.0',
      kind: 'cartographie-jour',
      date: '2026-01-05',
      poles: [structuredClone(jourFixture.poles[1])],
      kairos: null,
    }
    const run = await runVersionOnDays({
      pkg: { ...structuredClone(pkgFixture), id: 'custom', version: '0.1.0' },
      dayGroups: [DAYS[0]],
      referentiel: referentielFixture,
      provider: { complete: async () => ({ text: '' }) },
      model: 'test',
      perimetre,
      extractDayFn: vi.fn(),
      sandboxRunner: vi.fn(async () => ({ document: partialDoc, llmCalls: 1 })),
    })
    const report = buildRunReport({
      portfolioLabel: 'Maya',
      run,
      now: () => '2026-07-17T00:00:00.000Z',
    })
    const reimport = normalizeReferenceImport(JSON.parse(JSON.stringify(report)))
    expect(reimport.days[0].document.perimetre.partiel).toBe(true)
  })

  it('Twin6 + périmètre restreint -> refus explicite (référentiel en dur)', async () => {
    const pkg = {
      id: 'twin6-ouverte',
      version: '1.0.0',
      code: { orchestration: 'engine://scan(twin6)' },
      prompts: [],
    }
    await expect(
      runVersionOnDays({
        pkg,
        dayGroups: DAYS,
        referentiel: referentielFixture,
        provider: { complete: async () => ({ text: '' }) },
        model: 'test',
        perimetre,
      }),
    ).rejects.toThrow(TWIN6_PERIMETRE_NOTE)
  })

  it('température : chaque appel provider la porte (enveloppe uniforme)', async () => {
    const complete = vi.fn(async () => ({ text: '' }))
    const extractDayFn = vi.fn(async ({ provider, date }) => {
      await provider.complete({ model: 'test', prompt: 'p' })
      return { ...structuredClone(jourFixture), date }
    })
    await runVersionOnDays({
      pkg: BUILTIN_PACKAGE,
      dayGroups: [DAYS[0]],
      referentiel: referentielFixture,
      provider: { complete },
      model: 'test',
      temperature: 0,
      extractDayFn,
      sandboxRunner: vi.fn(),
    })
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0 }))
  })
})

describe('buildAbReport — union des journées des deux côtés', () => {
  it('les journées présentes seulement côté B figurent dans parJour (référence plus large)', () => {
    const a = {
      pkg: { id: 'a', version: '1.0.0' },
      days: [{ iso: '2026-01-05', document: structuredClone(jourFixture) }],
      llmCalls: 8,
      durationMs: 1000,
    }
    const b = {
      pkg: { id: 'ref', version: 'import' },
      days: [
        { iso: '2026-01-05', document: structuredClone(jourFixture) },
        { iso: '2026-01-06', document: structuredClone(jour2Fixture) },
      ],
      llmCalls: 0,
      durationMs: 0,
    }
    const report = buildAbReport({ portfolioLabel: 'Maya', a, b, now: () => 'T' })
    expect(report.parJour.map((j) => j.iso)).toEqual(['2026-01-05', '2026-01-06'])
    expect(report.portfolio.jours).toEqual(['2026-01-05', '2026-01-06'])
    // Drapeaux de couverture : le 06 n'existe que côté B (scoreVsReference s'en sert).
    expect(report.parJour[0]).toMatchObject({ couvertA: true, couvertB: true })
    expect(report.parJour[1]).toMatchObject({ couvertA: false, couvertB: true })
    // Cohérence interne : etabliesTotal de B = somme des lignes parJour côté b.
    const sommeLignes = report.parJour.reduce((s, j) => s + j.b.etablies.length, 0)
    expect(report.versions.b.etabliesTotal).toBe(sommeLignes)
  })
})

describe('buildAbReport — configurations par branche', () => {
  it('embarque la configuration de chaque branche dans le rapport', () => {
    const run = (id) => ({
      pkg: { id, version: '1.0.0' },
      days: [{ iso: '2026-01-05', document: structuredClone(jourFixture) }],
      llmCalls: 8,
      durationMs: 2000,
    })
    const report = buildAbReport({
      portfolioLabel: 'Maya',
      a: run('a'),
      b: run('b'),
      configs: {
        a: { fournisseur: 'anthropic', modele: 'claude-sonnet-5', referentiel: '7.0.0' },
        b: { fournisseur: 'openai', modele: 'gpt-4o-mini', referentiel: '8.0.0' },
      },
      now: () => '2026-07-17T00:00:00.000Z',
    })
    expect(report.configurations.a.modele).toBe('claude-sonnet-5')
    expect(report.configurations.b.fournisseur).toBe('openai')
  })
})

describe('runVersionOnDays — usage réel cumulé (D16)', () => {
  it('cumule les compteurs usage des réponses provider (moteur)', async () => {
    const provider = {
      complete: async () => ({ text: '', usage: { inputTokens: 100, outputTokens: 40 } }),
    }
    const extractDayFn = vi.fn(async ({ provider: p, date }) => {
      await p.complete({ model: 'test', prompt: 'a' })
      await p.complete({ model: 'test', prompt: 'b' })
      return { ...structuredClone(jourFixture), date }
    })
    const result = await runVersionOnDays({
      pkg: BUILTIN_PACKAGE,
      dayGroups: DAYS,
      referentiel: referentielFixture,
      provider,
      model: 'test',
      extractDayFn,
      sandboxRunner: vi.fn(),
    })
    expect(result.usage).toEqual({ inputTokens: 400, outputTokens: 160, mesures: 4 })
  })

  it('fournisseur muet sur usage -> compteurs à zéro, mesures 0', async () => {
    const provider = { complete: async () => ({ text: '' }) }
    const extractDayFn = vi.fn(async ({ provider: p, date }) => {
      await p.complete({ model: 'test', prompt: 'a' })
      return { ...structuredClone(jourFixture), date }
    })
    const result = await runVersionOnDays({
      pkg: BUILTIN_PACKAGE,
      dayGroups: [DAYS[0]],
      referentiel: referentielFixture,
      provider,
      model: 'test',
      extractDayFn,
      sandboxRunner: vi.fn(),
    })
    expect(result.usage.mesures).toBe(0)
  })
})

describe('realCostUsd — coût réel depuis la table de prix (D16)', () => {
  it('calcule depuis les tokens mesurés, null si modèle hors table ou sans mesure', () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, mesures: 8 }
    // claude-sonnet : 3 $/M entrée + 15 $/M sortie.
    expect(realCostUsd(usage, 'claude-sonnet-5')).toBe(18)
    expect(realCostUsd(usage, 'modele-inconnu-de-la-table')).toBeNull()
    expect(realCostUsd({ inputTokens: 0, outputTokens: 0, mesures: 0 }, 'claude-sonnet-5')).toBeNull()
    expect(realCostUsd(null, 'claude-sonnet-5')).toBeNull()
  })

  it('micro-run payant : arrondi au dix-millième, jamais un faux « 0 $ »', () => {
    // gpt-4o-mini : 0.15 $/M entrée + 0.6 $/M sortie -> 0.0014 $ (pas 0).
    const usage = { inputTokens: 6000, outputTokens: 800, mesures: 1 }
    expect(realCostUsd(usage, 'gpt-4o-mini')).toBeCloseTo(0.0014, 6)
    expect(realCostUsd(usage, 'gpt-4o-mini')).toBeGreaterThan(0)
  })
})

describe('sumUsages — totaux de session multi-run (D16)', () => {
  it('additionne, tolère null et champs manquants', () => {
    expect(
      sumUsages([
        { inputTokens: 100, outputTokens: 40, mesures: 2 },
        null,
        { inputTokens: 50, outputTokens: 10, mesures: 1 },
      ]),
    ).toEqual({ inputTokens: 150, outputTokens: 50, mesures: 3 })
    expect(sumUsages([])).toEqual({ inputTokens: 0, outputTokens: 0, mesures: 0 })
  })
})

describe('scoreVsReference — pur calcul d’ensembles (D16)', () => {
  it('précision/rappel/F1 depuis communes / seulementA / seulementB', () => {
    const report = {
      parJour: [
        { iso: '2026-01-05', communes: ['a', 'b', 'c'], seulementA: ['x'], seulementB: ['y', 'z'] },
        { iso: '2026-01-06', communes: ['d'], seulementA: [], seulementB: [] },
      ],
    }
    const score = scoreVsReference(report)
    expect(score.vraisPositifs).toBe(4)
    expect(score.fauxPositifs).toBe(1)
    expect(score.fauxNegatifs).toBe(2)
    expect(score.precision).toBeCloseTo(4 / 5)
    expect(score.rappel).toBeCloseTo(4 / 6)
    expect(score.f1).toBeCloseTo((2 * (4 / 5) * (4 / 6)) / (4 / 5 + 4 / 6))
    expect(score.parJour[1]).toEqual({ iso: '2026-01-06', precision: 1, rappel: 1 })
  })

  it('dénominateurs nuls -> null (jamais NaN)', () => {
    const score = scoreVsReference({ parJour: [{ iso: 'x', communes: [], seulementA: [], seulementB: [] }] })
    expect(score.precision).toBeNull()
    expect(score.rappel).toBeNull()
    expect(score.f1).toBeNull()
  })

  it('désaccord total : F1 = 0 (pire score), pas null (indétermination)', () => {
    const score = scoreVsReference({
      parJour: [{ iso: 'x', communes: [], seulementA: ['a'], seulementB: ['b'] }],
    })
    expect(score.precision).toBe(0)
    expect(score.rappel).toBe(0)
    expect(score.f1).toBe(0)
  })

  it('journées couvertes d’un seul côté : exclues du score, listées dans joursExclus', () => {
    // Référence de 2 jours, run généré d'1 jour parfait sur le jour commun :
    // le jour non testé ne doit PAS plomber le rappel.
    const score = scoreVsReference({
      parJour: [
        { iso: '2026-01-05', couvertA: true, couvertB: true, communes: ['a', 'b'], seulementA: [], seulementB: [] },
        { iso: '2026-01-06', couvertA: false, couvertB: true, communes: [], seulementA: [], seulementB: ['c', 'd'] },
      ],
    })
    expect(score.precision).toBe(1)
    expect(score.rappel).toBe(1)
    expect(score.f1).toBe(1)
    expect(score.joursExclus).toEqual(['2026-01-06'])
    expect(score.parJour.map((j) => j.iso)).toEqual(['2026-01-05'])
  })

  it('périmètre restreint (codesRetenus) : les compétences hors périmètre ne comptent pas', () => {
    const score = scoreVsReference(
      {
        parJour: [
          // La référence établit aussi 3.04 et 5.03, hors du périmètre testé.
          { iso: 'x', communes: ['2.01'], seulementA: [], seulementB: ['3.04', '5.03'] },
        ],
      },
      { codesRetenus: ['2.01'] },
    )
    expect(score.fauxNegatifs).toBe(0)
    expect(score.rappel).toBe(1)
    expect(score.f1).toBe(1)
  })
})

describe('buildAbMultiReport — écarts francs vs bruit stochastique (D16)', () => {
  const docSans = (code) => {
    const doc = structuredClone(jourFixture)
    for (const pole of doc.poles) {
      for (const comp of pole.competences) {
        if (comp.code === code) comp.verdict.statut = 'présence non établie'
      }
    }
    return doc
  }
  const run = (doc) => ({ days: [{ iso: '2026-01-05', document: doc }] })

  it('classe écart franc (stable opposé), bruit (instable), accord (stable identique)', () => {
    // A établit 2.01 dans ses 2 runs ; B jamais -> écart franc vers A.
    // 3.04 : établi 1 run sur 2 côté B -> bruit.
    const report = buildAbMultiReport({
      runsA: [run(structuredClone(jourFixture)), run(structuredClone(jourFixture))],
      runsB: [run(docSans('2.01')), run(docSans('3.04'))],
    })
    const byCode = Object.fromEntries(report.lignes.map((l) => [l.code, l]))
    expect(byCode['2.01'].classe).toBe('bruit') // B : 1/2 -> instable
    // Recomposons un cas net : B sans 2.01 dans SES DEUX runs.
    const net = buildAbMultiReport({
      runsA: [run(structuredClone(jourFixture)), run(structuredClone(jourFixture))],
      runsB: [run(docSans('2.01')), run(docSans('2.01'))],
    })
    const netByCode = Object.fromEntries(net.lignes.map((l) => [l.code, l]))
    expect(netByCode['2.01']).toMatchObject({ classe: 'ecart-vers-a', pA: 1, pB: 0 })
    expect(netByCode['3.04'].classe).toBe('accord')
    expect(net.resume.ecartsVersA).toBe(1)
    expect(net.consistance.a.nbRuns).toBe(2)
    expect(net.consistance.b.nbRuns).toBe(2)
  })

  it('1 run par branche : pas de consistance interne, classes calculées sur p ∈ {0,1}', () => {
    const report = buildAbMultiReport({
      runsA: [run(structuredClone(jourFixture))],
      runsB: [run(docSans('2.01'))],
    })
    expect(report.consistance).toEqual({ a: null, b: null })
    const l = report.lignes.find((x) => x.code === '2.01')
    expect(l.classe).toBe('ecart-vers-a')
  })

  it('exige au moins 1 run par branche', () => {
    expect(() => buildAbMultiReport({ runsA: [], runsB: [run(jourFixture)] })).toThrow(/au moins 1/)
  })
})
