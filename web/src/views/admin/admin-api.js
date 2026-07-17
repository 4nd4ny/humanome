// Appels de l'API d'administration (P12.1 — chantier M9). Toutes les fonctions
// passent par apiFetch (cookies de session + X-CSRF-Token sur les mutations,
// messages d'erreur français) et acceptent un `fetchFn` injectable (tests,
// même pattern que etablissement-api.js). L'API est SESSION admin
// (RequireRole::any('admin')), jamais le jeton de déploiement.

import { apiFetch } from '../../api/client.js'

// --- 1. Rôles ----------------------------------------------------------------

/** GET api/admin/users?query=&page=&role= -> {users, total, page, pageSize} */
export async function listUsers({ query = '', page = 1, role = '' } = {}, fetchFn) {
  const params = new URLSearchParams()
  if (query) params.set('query', query)
  if (page && page > 1) params.set('page', String(page))
  if (role) params.set('role', role)
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const data = await apiFetch(`admin/users${suffix}`, { fetchFn })
  return {
    users: Array.isArray(data?.users) ? data.users : [],
    total: Number(data?.total ?? 0),
    page: Number(data?.page ?? 1),
    pageSize: Number(data?.pageSize ?? 20),
  }
}

/** POST api/admin/users/{id}/roles {role} */
export function grantRole(userId, role, fetchFn) {
  return apiFetch(`admin/users/${userId}/roles`, { method: 'POST', body: { role }, fetchFn })
}

/** DELETE api/admin/users/{id}/roles/{role} */
export function revokeRole(userId, role, fetchFn) {
  return apiFetch(`admin/users/${userId}/roles/${encodeURIComponent(role)}`, {
    method: 'DELETE',
    fetchFn,
  })
}

// --- 2. Golden Prompt --------------------------------------------------------

/** GET api/admin/golden -> [{id, packageId, description, versions, grants}] */
export async function fetchGolden(fetchFn) {
  const data = await apiFetch('admin/golden', { fetchFn })
  return Array.isArray(data) ? data : []
}

/** POST api/admin/golden {document} -> {status, id, version} */
export function importGolden(document, fetchFn) {
  return apiFetch('admin/golden', { method: 'POST', body: { document }, fetchFn })
}

/** POST api/admin/golden/{id}/grant {userId} -> {status, id, userId} */
export function grantGolden(id, userId, fetchFn) {
  return apiFetch(`admin/golden/${encodeURIComponent(id)}/grant`, {
    method: 'POST',
    body: { userId },
    fetchFn,
  })
}

// --- 3. Réglages plateforme --------------------------------------------------

/** GET api/admin/settings -> {defaultPackage, demo, worker, config} */
export function fetchSettings(fetchFn) {
  return apiFetch('admin/settings', { fetchFn })
}

/** POST api/admin/settings/default-package {id, version} */
export function setDefaultPackage(id, version, fetchFn) {
  return apiFetch('admin/settings/default-package', {
    method: 'POST',
    body: { id, version },
    fetchFn,
  })
}

// --- 3bis. Démo publique (chantier A : éditable, effet immédiat) -------------
// Contrat avec routes/admin.php :
//   GET    api/admin/demo-config -> {effective, sources, allowedModels, apiKeyConfigured}
//   PUT    api/admin/demo-config {champs partiels} -> même forme (422 hors bornes)
//   DELETE api/admin/demo-config -> même forme (retour env/fichier)

/** GET api/admin/demo-config */
export function fetchDemoConfig(fetchFn) {
  return apiFetch('admin/demo-config', { fetchFn })
}

/** PUT api/admin/demo-config {champs partiels} */
export function saveDemoConfig(patch, fetchFn) {
  return apiFetch('admin/demo-config', { method: 'PUT', body: patch, fetchFn })
}

/** DELETE api/admin/demo-config — supprime les overrides (retour env/fichier). */
export function resetDemoConfig(fetchFn) {
  return apiFetch('admin/demo-config', { method: 'DELETE', fetchFn })
}

/** Le geste smartphone : PUT {enabled} seul (allumer/éteindre la démo). */
export function toggleDemo(enabled, fetchFn) {
  return saveDemoConfig({ enabled: Boolean(enabled) }, fetchFn)
}

/** GET api/prompt-packages -> versions publiées (pour choisir le défaut). */
export async function listPublishedPackages(fetchFn) {
  const data = await apiFetch('prompt-packages', { fetchFn })
  return Array.isArray(data) ? data : []
}

/** Les 7 rôles du référentiel §2 attribuables (le visiteur = absence de session). */
// --- Monitoring --------------------------------------------------------------

/** GET api/admin/monitoring?days= -> agrégats du tableau de bord (lecture seule). */
export function fetchMonitoring({ days = 30 } = {}, fetchFn) {
  return apiFetch(`admin/monitoring?days=${encodeURIComponent(days)}`, { fetchFn })
}

/** Micro-USD signés -> libellé en dollars ("12,50 $"), fr-FR. */
export function usd(microusd) {
  const value = (Number(microusd) || 0) / 1_000_000
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`
}

/** Entier -> libellé fr-FR compact (12 345 ; 1,2 M au-delà du million). */
export function nb(n) {
  const value = Number(n) || 0
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`
  }
  return value.toLocaleString('fr-FR')
}

export const ASSIGNABLE_ROLES = [
  'apprenant',
  'cartographe',
  'promptologue',
  'epistemiarque',
  'employeur',
  'etablissement',
  'admin',
]

/** @param {string} iso @returns {string} date française courte ('—' si vide) */
export function frDate(iso) {
  if (typeof iso !== 'string' || iso === '') return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('fr-FR')
}
