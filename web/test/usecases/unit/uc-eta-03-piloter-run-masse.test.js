// UC-ETA-03 — Lancer, suivre et annuler un run de masse : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/etablissement/UC-ETA-03-piloter-run-masse.md
//
// Code sollicité appelé directement : l'estimation de coût d'un run de masse
// (8 appels par journée, table de prix du moteur), la normalisation du tableau
// d'avancement réel, les appels de lancement / annulation / paquets publiés,
// et les constantes d'affichage (six statuts de jobs, polling 5 s).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRICING_DISCLAIMER } from '@engine/providers/index.js'
import { apiFetch, resetApiClient } from '../../../src/api/client.js'
import {
  cancelRun,
  DEFAULT_DAY_CHARS,
  estimateMassRun,
  EXTRACTION_CALLS_PER_DAY,
  fetchPublishedPackages,
  fetchRun,
  JOB_STATUS_LABELS,
  launchRun,
  SERVICE_MODEL,
} from '../../../src/views/etablissement/etablissement-api.js'
import { POLL_INTERVAL_MS } from '../../../src/views/etablissement/CohorteSection.jsx'
import { CSRF, jsonResponse, PUBLISHED_PACKAGES, runBoard } from '../support/eta.js'

afterEach(() => resetApiClient())

async function primeCsrf() {
  await apiFetch('auth/me', { fetchFn: async () => jsonResponse(200, { user: {}, csrfToken: CSRF }) })
}

describe('UC-ETA-03 — estimation du coût avant lancement', () => {
  it('UC-ETA-03-U08 — estimateMassRun : 8 appels par journée, tokens et coût au prix du modèle, modèle hors table → coût null', () => {
    const known = estimateMassRun({ totalJournees: 3, avgDayChars: DEFAULT_DAY_CHARS, model: SERVICE_MODEL })
    expect(known).toEqual({
      totalCalls: 24,
      tokensIn: 220000, // ceil(24 × (3 000 + 30 000) / 3,6)
      tokensOut: 24000,
      costUsd: 1.02, // 0,22 Mtok × 3 $ + 0,024 Mtok × 15 $
      disclaimer: PRICING_DISCLAIMER,
    })

    // Modèle absent de la table de prix → coût « inconnu » (null)…
    const unknown = estimateMassRun({ totalJournees: 3, model: 'phi4:14b' })
    expect(unknown.totalCalls).toBe(24)
    expect(unknown.costUsd).toBeNull()
    // …alors que les familles locales llama/mistral/qwen sont tarifées 0.
    expect(estimateMassRun({ totalJournees: 3, model: 'llama3.1:70b' }).costUsd).toBe(0)

    expect(estimateMassRun({ totalJournees: 'n/a', model: SERVICE_MODEL })).toMatchObject({
      totalCalls: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    })
  })
})

describe('UC-ETA-03 — client API du run', () => {
  it('UC-ETA-03-U09 — fetchRun normalise le tableau réel (status → statut, 6 statuts, erreurs {userId, erreur})', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(
        200,
        runBoard({
          status: 'failed',
          jobs: { queued: 0, running: 0, done: 2, failed: 1, budget_exceeded: 0, cancelled: 0 },
          coutUsd: 0.42,
          erreurs: [{ jobId: 5, userId: 12, date: '2026-01-07', status: 'failed', attempts: 3, erreur: 'pôle 3 — panne' }],
        }),
      ),
    )

    const run = await fetchRun(42, fetchFn)

    expect(fetchFn.mock.calls[0][0]).toBe('api/etablissement/runs/42')
    expect(run).toEqual({
      runId: 42,
      statut: 'failed',
      jobs: { queued: 0, running: 0, done: 2, failed: 1, budget_exceeded: 0, cancelled: 0 },
      coutUsd: 0.42,
      // Le tableau réel ne porte que l'identifiant du membre (voir Limites).
      erreurs: [{ membre: '12', message: 'pôle 3 — panne' }],
    })
  })

  it('UC-ETA-03-U10 — launchRun et cancelRun : POST avec CSRF sur les routes du run', async () => {
    await primeCsrf()
    const launch = vi.fn().mockResolvedValue(jsonResponse(201, { runId: 42, jobs: 3 }))
    const body = { promptPackageId: 'aurora-v3-reconstruit', promptPackageVersion: '1.0.0', membres: [12] }

    expect(await launchRun(7, body, launch)).toEqual({ runId: 42, jobs: 3 })
    expect(launch.mock.calls[0][0]).toBe('api/etablissement/cohortes/7/runs')
    expect(launch.mock.calls[0][1].method).toBe('POST')
    expect(launch.mock.calls[0][1].headers['X-CSRF-Token']).toBe(CSRF)
    expect(JSON.parse(launch.mock.calls[0][1].body)).toEqual(body)

    const cancel = vi.fn().mockResolvedValue(jsonResponse(200, { id: 42, status: 'cancelled' }))
    expect(await cancelRun(42, cancel)).toEqual({ id: 42, status: 'cancelled' })
    expect(cancel.mock.calls[0][0]).toBe('api/etablissement/runs/42/annuler')
    expect(cancel.mock.calls[0][1].method).toBe('POST')
    expect(cancel.mock.calls[0][1].body).toBeUndefined()
  })

  it('UC-ETA-03-U11 — fetchPublishedPackages : liste réelle, entrées sans id/version écartées', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(200, [...PUBLISHED_PACKAGES, { id: 'incomplet' }, { version: '1.0.0' }, null]),
    )

    const packages = await fetchPublishedPackages(fetchFn)

    expect(fetchFn.mock.calls[0][0]).toBe('api/prompt-packages')
    expect(packages.map((p) => `${p.id}@${p.version}`)).toEqual([
      'aurora-v3-reconstruit@1.0.0',
      'aurora-v3-reconstruit@1.1.0',
    ])
  })
})

describe('UC-ETA-03 — constantes d’affichage', () => {
  it('UC-ETA-03-U12 — six statuts de jobs libellés, 8 appels par journée, polling toutes les 5 s', () => {
    expect(JOB_STATUS_LABELS).toEqual({
      queued: 'En attente',
      running: 'En cours',
      done: 'Terminés',
      failed: 'En erreur',
      budget_exceeded: 'Budget dépassé',
      cancelled: 'Annulés',
    })
    expect(Object.isFrozen(JOB_STATUS_LABELS)).toBe(true)
    expect(EXTRACTION_CALLS_PER_DAY).toBe(8)
    expect(POLL_INTERVAL_MS).toBe(5000)
    expect(SERVICE_MODEL).toBe('claude-sonnet-5')
  })
})
