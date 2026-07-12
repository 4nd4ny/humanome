// Minimal API client (P3/P4 front). Design constraints:
//
// - URLs are RELATIVE ('api/...'): the app is served from any subpath and the
//   hash router never changes the path (ADR-003/ADR-009), so relative URLs hit
//   the sibling /api of the deployed site, and the Vite dev proxy in dev.
// - The session travels in the cookie (credentials: 'same-origin'); the CSRF
//   token returned by the API (login/register/me) is kept in MODULE MEMORY
//   only — never in localStorage — and echoed back in an X-CSRF-Token header
//   on every state-changing request.
// - A pure static copy of the site (file://, or a host without the PHP API)
//   must degrade cleanly: every failure mode ends in ApiUnavailableError with
//   a displayable French message, never an uncaught exception.
//
// Endpoints (contract with api/src/routes/auth.php, P3):
//   GET    api/auth/me        -> 200 {user, csrfToken} | 401 (visitor = no session)
//   POST   api/auth/register  {email, password, displayName} -> 201 {user, csrfToken}
//   POST   api/auth/login     {email, password} -> 200 {user, csrfToken}
//   POST   api/auth/logout    -> 204
//   DELETE api/auth/account   -> 204 (real purge + audit event, cahier §6.3)
// Error bodies: {error: '<French user-facing message>', fields?: {name: message}}.

let csrfToken = null

export const API_UNAVAILABLE_MESSAGE =
  'L’espace compte est indisponible sur cette copie statique du site. ' +
  'Rendez-vous sur le site en ligne (https://humanome.xyz) pour créer un compte ou vous connecter.'

/** HTTP-level error carrying a displayable French message. */
export class ApiError extends Error {
  /**
   * @param {string} message French, displayable
   * @param {number} status HTTP status
   * @param {string | null} [code] machine code from the API body, if any
   */
  constructor(message, status, code = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** The API cannot be reached at all (file://, static copy, network down). */
export class ApiUnavailableError extends Error {
  constructor(message = API_UNAVAILABLE_MESSAGE) {
    super(message)
    this.name = 'ApiUnavailableError'
    this.unavailable = true
  }
}

/** Clears the in-memory CSRF token (used by tests and on logout). */
export function resetApiClient() {
  csrfToken = null
}

/**
 * Notifies the app shell that the session changed (login/register/logout/
 * delete), so the role-adaptive navigation refreshes WITHOUT a full reload.
 * No-op outside a browser (tests).
 */
export function notifyAuthChanged() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event('humanome:auth'))
  }
}

/** @returns {string | null} current in-memory CSRF token (tests/debug) */
export function getCsrfToken() {
  return csrfToken
}

/** @param {number} status @returns {string} French fallback message per status */
function defaultMessage(status) {
  switch (status) {
    case 400:
    case 422:
      return 'Requête invalide. Vérifiez les champs saisis.'
    case 401:
      return 'Authentification requise.'
    case 403:
      return 'Action non autorisée (session expirée ?). Reconnectez-vous puis réessayez.'
    case 404:
      return 'Ressource introuvable.'
    case 409:
      return 'Conflit avec un enregistrement existant.'
    case 429:
      return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.'
    default:
      return `Erreur serveur (HTTP ${status}). Réessayez plus tard.`
  }
}

/**
 * Fetches an API endpoint and returns its parsed JSON body.
 *
 * @param {string} path endpoint path without the 'api/' prefix, e.g. 'auth/me'
 * @param {{method?: string, body?: object, fetchFn?: typeof fetch, protocol?: string}} [options]
 *   `fetchFn`/`protocol` are test seams (same pattern as data/load.js).
 * @returns {Promise<object | null>} JSON body (null for 204 No Content)
 * @throws {ApiError | ApiUnavailableError}
 */
export async function apiFetch(path, options = {}) {
  const { method = 'GET', body, fetchFn, protocol } = options

  if ((protocol ?? globalThis.location?.protocol) === 'file:') {
    throw new ApiUnavailableError()
  }
  const doFetch = fetchFn ?? globalThis.fetch?.bind(globalThis)
  if (!doFetch) throw new ApiUnavailableError()

  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (csrfToken !== null && method !== 'GET' && method !== 'HEAD') {
    headers['X-CSRF-Token'] = csrfToken
  }

  let response
  try {
    response = await doFetch(`api/${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiUnavailableError()
  }

  if (response.status === 204) return null

  const contentType = String(response.headers?.get?.('content-type') ?? '')
  let data = null
  if (contentType.includes('application/json')) {
    try {
      data = await response.json()
    } catch {
      data = null
    }
  }

  if (data === null || typeof data !== 'object') {
    // Not JSON at all: static hosting answering with an HTML page (404 or
    // index fallback) — the API simply is not there.
    throw new ApiUnavailableError()
  }

  if (typeof data.csrfToken === 'string' && data.csrfToken !== '') {
    csrfToken = data.csrfToken
  }

  if (!response.ok) {
    // The API returns user-facing French messages ({error: string}); use them
    // when present, fall back to a generic French message per status.
    const serverMessage =
      typeof data.error === 'string' && data.error !== ''
        ? data.error
        : (data.error?.message ?? data.message ?? null)
    const code = typeof data.error === 'object' ? (data.error?.code ?? null) : null
    const error = new ApiError(serverMessage ?? defaultMessage(response.status), response.status, code)
    error.serverMessage = serverMessage
    error.fields = data.fields && typeof data.fields === 'object' ? data.fields : null
    throw error
  }

  return data
}

/**
 * Session probe for the #/compte route (called when the route mounts, never
 * at app boot: the rest of the site stays 100% static).
 * @param {Parameters<typeof apiFetch>[1]} [options]
 * @returns {Promise<{user: object | null}>} 401 means "not connected", not an error
 */
export async function fetchMe(options) {
  try {
    const data = await apiFetch('auth/me', options)
    return { user: data.user ?? null }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return { user: null }
    throw error
  }
}

/** @returns {Promise<object>} {user, csrfToken} on success */
export async function login({ email, password }, options) {
  const result = await apiFetch('auth/login', { ...options, method: 'POST', body: { email, password } })
  notifyAuthChanged()
  return result
}

/** @returns {Promise<object>} {user, csrfToken} on success */
export async function register({ email, password, displayName }, options) {
  const result = await apiFetch('auth/register', {
    ...options,
    method: 'POST',
    body: { email, password, displayName },
  })
  notifyAuthChanged()
  return result
}

/** Ends the session; the in-memory CSRF token is dropped either way. */
export async function logout(options) {
  try {
    return await apiFetch('auth/logout', { ...options, method: 'POST' })
  } finally {
    csrfToken = null
    notifyAuthChanged()
  }
}

/** RGPD account deletion (real purge server side, cahier §6.3). */
export async function deleteAccount(options) {
  const result = await apiFetch('auth/account', { ...options, method: 'DELETE' })
  csrfToken = null
  notifyAuthChanged()
  return result
}
