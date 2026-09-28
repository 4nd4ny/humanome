// Outils partagés du lot « Établissement et traitement de masse » (UC-ETA-01..04).
// Fiches : docs/cas-utilisation/etablissement/
//
// - Réponses HTTP simulées aux FORMES RÉELLES de l'API (api/src/routes/
//   etablissement.php) : liste de cohortes nue, détail à plat, tableau de run
//   {id, status, jobs, coutUsd, tokens, erreurs[{jobId, userId, date, …}]}.
// - Réseau simulé par vi.stubGlobal('fetch', …) routé par « MÉTHODE url » :
//   l'application ENTIÈRE (<App/>) tourne sans couture, comme dans le
//   navigateur de l'établissement ; chaque appel est journalisé (en-têtes et
//   corps JSON) pour vérifier CSRF et charges utiles.
import { createElement } from 'react'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import App from '../../../src/App.jsx'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'

export const CSRF = 'csrf-etablissement-42'

export const ETAB_USER = Object.freeze({
  id: 90,
  email: 'lycee@example.org',
  displayName: 'Lycée Astrolabe',
  roles: ['etablissement'],
})

export const LEARNER_USER = Object.freeze({
  id: 12,
  email: 'maya@example.org',
  displayName: 'Maya',
  roles: ['apprenant'],
})

/** Réponse JSON minimale compatible avec api/client.js. */
export function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

/** 204 No Content (DELETE de cohorte). */
export function noContent() {
  return { ok: true, status: 204, headers: { get: () => null }, json: async () => null }
}

/**
 * Remplace le fetch global. `routes` : {'MÉTHODE url': réponse | (init, calls) => réponse}.
 * GET api/auth/me répond par défaut la session établissement (jeton CSRF inclus) ;
 * toute autre URL non routée répond 404 JSON (copie statique absente).
 */
export function stubApi(routes = {}, { user = ETAB_USER } = {}) {
  const calls = []
  const fetchMock = vi.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const key = `${method} ${url}`
    calls.push({
      key,
      method,
      url: String(url),
      headers: init.headers ?? {},
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    const handler = routes[key]
    if (handler) return typeof handler === 'function' ? handler(init, calls) : handler
    if (key === 'GET api/auth/me') {
      return user ? jsonResponse(200, { user, csrfToken: CSRF }) : jsonResponse(401, { error: 'Authentification requise' })
    }
    return jsonResponse(404, { error: 'absent' })
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    fetchMock,
    calls,
    /** Appels reçus pour une clé « MÉTHODE url ». */
    callsTo: (key) => calls.filter((c) => c.key === key),
  }
}

/** Ouvre l'application entière sur un hash de l'espace établissement. */
export function openApp(hash, { user = ETAB_USER } = {}) {
  window.location.hash = hash
  return render(createElement(App, { lib: fakeLib, fetchMeFn: async () => ({ user }) }))
}

// --- Formes réelles de l'API (contrat M8) -------------------------------------

/** GET api/etablissement/cohortes : liste NUE (CohorteRepository::listForEtablissement). */
export function cohorteListItem(overrides = {}) {
  return {
    id: 7,
    nom: 'BTS SIO 2026',
    codeInvitation: 'COHORTE7AZ',
    createdAt: '2026-07-01T10:00:00',
    membres: 2,
    ...overrides,
  }
}

/** Membre de GET api/etablissement/cohortes/{id} (CohorteRepository::membersOf). */
export function membre(overrides = {}) {
  return {
    userId: 12,
    displayName: 'Maya',
    consentAt: '2026-07-02T10:00:00',
    portfolioDepose: true,
    portfolio: { titre: 'Journal Astrolabe', journees: 3, taille: 9000, deposeLe: '2026-07-03T10:00:00' },
    avancement: { jobsTotal: 0, jobsDone: 0 },
    ...overrides,
  }
}

/** GET api/etablissement/cohortes/{id} : détail À PLAT. */
export function cohorteDetail(overrides = {}) {
  return {
    id: 7,
    nom: 'BTS SIO 2026',
    codeInvitation: 'COHORTE7AZ',
    createdAt: '2026-07-01T10:00:00',
    consentement:
      "En rejoignant cette cohorte, vous acceptez que l'établissement voie les cartographies produites dans ce cadre.",
    membres: [
      membre(),
      membre({
        userId: 13,
        displayName: 'Noé',
        consentAt: '2026-07-02T11:00:00',
        portfolioDepose: false,
        portfolio: null,
      }),
    ],
    ...overrides,
  }
}

/** GET api/etablissement/config : projection (jamais la clé). */
export function configProjection(overrides = {}) {
  return {
    provider: 'humanome',
    endpointUrl: null,
    model: null,
    budgetCapUsd: 100,
    spentUsd: 12.5,
    hasApiKey: false,
    hasWorkerToken: false,
    ...overrides,
  }
}

/** GET api/etablissement/runs/{runId} : tableau d'avancement. */
export function runBoard(overrides = {}) {
  return {
    id: 42,
    cohorteId: 7,
    status: 'active',
    promptPackage: { id: 'aurora-v3-reconstruit', version: '1.0.0' },
    referentiel: { id: 'respire', version: '7.0.0' },
    createdAt: '2026-07-04T10:00:00',
    finishedAt: null,
    jobs: { queued: 3, running: 0, done: 0, failed: 0, budget_exceeded: 0, cancelled: 0 },
    coutUsd: 0,
    tokens: { input: 0, output: 0 },
    erreurs: [],
    ...overrides,
  }
}

/**
 * GET api/prompt-packages : paquets publiés, liste nue triée par slug puis
 * date de publication (PromptPackageRepository::listPublished) — l'API ne
 * porte PAS de marqueur « défaut ».
 */
export const PUBLISHED_PACKAGES = [
  {
    id: 'aurora-v3-reconstruit',
    version: '1.0.0',
    description: 'Paquet par défaut reconstruit depuis les gabarits du moteur',
    publishedAt: '2026-06-01T09:00:00',
    reserved: false,
  },
  {
    id: 'aurora-v3-reconstruit',
    version: '1.1.0',
    description: null,
    publishedAt: '2026-06-15T09:00:00',
    reserved: false,
  },
]
