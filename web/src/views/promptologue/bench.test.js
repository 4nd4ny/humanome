// Banc d'essai (P10.4) — logique pure : routage moteur/sandbox, résumés,
// consistance multi-run (engine compareRuns), rapport A/B.
import { describe, expect, it, vi } from 'vitest'
import jourFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import jour2Fixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-06.json'
import pkgFixture from '../../../../schemas/fixtures/prompt-package-exemple.json'
import referentielFixture from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import { BUILTIN_PACKAGE } from '../../lib/run-launcher.js'
import {
  buildAbReport,
  buildMultiRunReport,
  compareCodes,
  dayGroupsToPortfolio,
  extractTwin6Templates,
  reportDataUrl,
  runVersionOnDays,
  summarizeDocument,
  usesTwin6Engine,
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
