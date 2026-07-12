// Test d'intégration bout-en-bout du moteur (plan-portage-moteur, ordre M4 §4) :
// portfolio 3 journées (fixture) → extraction mock (étage C) → 3 documents
// `cartographie-jour` validés → mergeDays (étage A) → prompts narratifs (B1,
// répondus par mock) → buildMergeDocument (B2) → document `cartographie-merge`
// validé. Plus : interruption après la journée 1 + reprise (runs), et
// consistance sur 2 runs mock volontairement divergents.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  buildMergeDocument,
  buildNarrativePrompts,
  compareRuns,
  createMockProvider,
  createMemoryStorage,
  createRun,
  extractDay,
  validateDocument,
} from './index.js'

const fixture = (name) =>
  readFileSync(new URL(`../../schemas/fixtures/${name}`, import.meta.url), 'utf8')

const referentiel = JSON.parse(fixture('referentiel-respire-v7.json'))
const dayFixtures = {
  '2026-01-05': JSON.parse(fixture('cartographie-jour-2026-01-05.json')),
  '2026-01-06': JSON.parse(fixture('cartographie-jour-2026-01-06.json')),
  '2026-01-07': JSON.parse(fixture('cartographie-jour-2026-01-07.json')),
}
const ISOS = Object.keys(dayFixtures)

// Le portfolio fixture porte 3 journées sous des titres « ## <jour> … 2026 ».
const portfolio = fixture('portfolio-3-jours.md')
const dayTexts = portfolio.split(/^## /m).slice(1)

/**
 * Provider mock d'extraction : rejoue les documents jour fixtures comme
 * réponses LLM. La journée visée est lue dans le prompt (date ISO), le pôle
 * dans son en-tête « # Pôle <n> — » ; l'appel kairos est reconnu à son
 * marqueur « SYNTHÈSE KAIROS ». Les réponses de la 2e journée sont enrobées
 * de prose + bloc ```json pour exercer le parseur tolérant.
 */
function extractionMock(docsByIso = dayFixtures) {
  return createMockProvider({
    responses: ({ prompt }) => {
      const iso = prompt.match(/\((\d{4}-\d{2}-\d{2})\)/)[1]
      const doc = docsByIso[iso]
      let payload
      if (prompt.includes('SYNTHÈSE KAIROS')) {
        payload = JSON.stringify(doc.kairos)
      } else {
        const num = Number(prompt.match(/# Pôle (\d) — /)[1])
        payload = JSON.stringify(doc.poles[num - 1])
      }
      return iso === '2026-01-06'
        ? `Voici la cartographie demandée :\n\`\`\`json\n${payload}\n\`\`\`\nBonne lecture.`
        : payload
    },
  })
}

function makeDays() {
  return ISOS.map((iso, i) => ({ iso, text: dayTexts[i] }))
}

function makeRun({ runId, storage, provider, signal = null, finalize = null }) {
  return createRun({
    runId,
    storage,
    days: makeDays(),
    referentiel,
    processDay: (day, ctx) =>
      extractDay({
        dayText: day.text,
        date: day.iso,
        referentiel,
        provider,
        model: 'mock-cartographe',
        signal: ctx.signal,
      }),
    validateDay: async (document) => {
      const { valid, errors } = validateDocument('cartographie-jour', document)
      if (!valid) throw new Error(`document jour invalide : ${JSON.stringify(errors[0])}`)
    },
    finalize,
    now: () => '2026-01-08T12:00:00',
  })
}

/** Étages B1+B2 : narratifs générés par un provider mock, puis document final. */
async function finalizeWithNarratives(merged, narrativeProvider) {
  const prompts = buildNarrativePrompts(merged.agrege, { periode: merged.periode })
  const narrativeTexts = { competences: {}, poles: {}, kairos: '' }
  for (const p of prompts) {
    const { text } = await narrativeProvider.complete({ model: 'mock-narrateur', prompt: p.content })
    if (p.type === 'competence') narrativeTexts.competences[p.id] = text
    else if (p.type === 'pole') narrativeTexts.poles[p.id] = text
    else narrativeTexts.kairos = text
  }
  return buildMergeDocument(
    { ...merged, date_construction: '2026-01-08T12:00:00' },
    narrativeTexts,
    { journalId: 'fixture-3-jours', sourceProtocole: 'Aurora v3 — run mock bout-en-bout' },
  )
}

describe('pipeline bout-en-bout (mock, fixture portfolio 3 jours)', () => {
  it('extraction → merge → narratifs → document merge validé, avec interruption + reprise', async () => {
    const storage = createMemoryStorage()
    const provider = extractionMock()
    const narrativeProvider = createMockProvider({
      responses: (_, i) => `## Narratif mock ${i + 1}\n\nSynthèse déterministe pour le test.`,
    })

    // --- Passe 1 : interruption coopérative après la journée 1 -------------
    const controller = new AbortController()
    const run1 = createRun({
      runId: 'e2e-fixture',
      storage,
      days: makeDays(),
      referentiel,
      processDay: async (day, ctx) => {
        const document = await extractDay({
          dayText: day.text,
          date: day.iso,
          referentiel,
          provider,
          model: 'mock-cartographe',
          signal: ctx.signal,
        })
        if (day.iso === '2026-01-05') controller.abort() // interrompt APRÈS la journée 1
        return document
      },
      now: () => '2026-01-08T11:00:00',
    })
    const res1 = await run1.start({ signal: controller.signal })
    expect(res1.aborted).toBe(true)
    expect(res1.document).toBeNull()
    expect(res1.status).toMatchObject({ total: 3, done: 1, remaining: 2, failed: [] })
    expect(provider.callCount).toBe(8) // 7 pôles + 1 kairos, journée 1 uniquement

    // --- Passe 2 : reprise sur le même stockage — la journée 1 est sautée --
    const run2 = makeRun({
      runId: 'e2e-fixture',
      storage,
      provider,
      finalize: (merged) => finalizeWithNarratives(merged, narrativeProvider),
    })
    const res2 = await run2.start()
    expect(res2.aborted).toBe(false)
    expect(res2.status).toMatchObject({ total: 3, done: 3, remaining: 0, failed: [] })
    expect(provider.callCount).toBe(24) // 8 + 2 journées × 8 (la 1re non retraitée)

    // Les 3 documents jour checkpointés sont validés et fidèles aux fixtures.
    const dayDocs = await run2.getDayDocuments()
    expect(dayDocs.map((d) => d.date)).toEqual(ISOS)
    for (const doc of dayDocs) {
      expect(validateDocument('cartographie-jour', doc).valid).toBe(true)
    }
    expect(dayDocs[0].poles).toEqual(dayFixtures['2026-01-05'].poles)
    expect(dayDocs[1].kairos).toEqual(dayFixtures['2026-01-06'].kairos) // via ```json + prose
    expect(dayDocs[2].kairos).toEqual(dayFixtures['2026-01-07'].kairos)

    // Narratifs : 61 compétences + 7 pôles + 1 kairos.
    expect(narrativeProvider.callCount).toBe(69)

    // Document merge final : validé par le schéma, période et domaines cohérents.
    const doc = res2.document
    const { valid, errors } = validateDocument('cartographie-merge', doc)
    expect(errors).toEqual([])
    expect(valid).toBe(true)
    expect(doc.kind).toBe('cartographie-merge')
    expect(doc.periode).toEqual({ premiere: '2026-01-05', derniere: '2026-01-07', nbFeuilles: 3 })
    expect(doc.domains).toHaveLength(7)
    const renderedCodes = doc.domains.flatMap((d) => d.competences.map((c) => c.code))
    // Compétences établies au moins une fois dans les 3 fixtures.
    expect(renderedCodes).toEqual([
      '1.01', '2.01', '2.06', '3.04', '3.07', '4.05', '5.01', '5.03', '6.07', '7.01',
    ])
    expect(doc.profilMeta.nb_feuilles).toBe(3)

    // Journal : la reprise est tracée.
    const entries = await run2.journal.entries()
    const types = entries.map((e) => e.type)
    expect(types).toContain('run_started')
    expect(types).toContain('run_resumed')
    expect(types).toContain('run_completed')
    expect(types.filter((t) => t === 'day_completed')).toHaveLength(3)
  })

  it('consistance : 2 runs mock volontairement divergents sur la même journée', async () => {
    const iso = '2026-01-05'
    const dayText = dayTexts[0]

    // Run A : la fixture telle quelle.
    const runA = await extractDay({
      dayText, date: iso, referentiel, provider: extractionMock(), model: 'mock-cartographe',
    })

    // Run B : mêmes réponses, mais 2 verdicts délibérément divergents.
    const divergent = structuredClone(dayFixtures)
    for (const pole of divergent[iso].poles) {
      for (const comp of pole.competences) {
        if (comp.code === '2.01') {
          comp.verdict.statut = 'présence non établie' // établie (0.7) dans le run A
          comp.verdict.confiance = 0.2
        }
        if (comp.code === '3.04') {
          comp.verdict.statut = 'renvoi au cartographe' // établie (0.6) dans le run A
          comp.verdict.confiance = 0.4
        }
      }
    }
    const runB = await extractDay({
      dayText, date: iso, referentiel, provider: extractionMock(divergent), model: 'mock-cartographe',
    })

    const result = compareRuns([runA, runB])
    expect(result.nbRuns).toBe(2)
    // Établies dans les DEUX runs : 5.03 et 7.01 restent, 2.01 et 3.04 divergent.
    expect(result.competencesCommunes).toEqual(['5.03', '7.01'])
    expect(result.competencesDivergentes).toEqual([
      {
        code: '2.01',
        statuts: ['présence établie', 'présence non établie'],
        presenteDans: [0],
        absenteDans: [1],
      },
      {
        code: '3.04',
        statuts: ['présence établie', 'renvoi au cartographe'],
        presenteDans: [0],
        absenteDans: [1],
      },
    ])
    // 15 compétences dans la fixture : 13 accords (0) + 1×1 + 1×0.5 → 1.5/15.
    expect(result.distanceStructurelle).toBeCloseTo(1.5 / 15, 10)
    expect(result.parCompetence['2.01']).toMatchObject({
      statuts: ['présence établie', 'présence non établie'],
      confiances: [0.7, 0.2],
    })
    expect(result.parCompetence['2.01'].ecartType).toBeCloseTo(0.25, 10)
    expect(result.parCompetence['1.01'].ecartType).toBe(0)
  })
})
