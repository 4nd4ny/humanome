// Appels API de l'espace cartographe (contrat M7 fixé — P9). Toutes les
// fonctions passent par apiFetch (cookies de session + X-CSRF-Token, messages
// d'erreur français) et acceptent un `fetchFn` injectable (tests, pattern
// CartographiesPanel). Les réponses sont NORMALISÉES ici pour que les vues ne
// dépendent que d'une seule forme.

import { apiFetch } from '../../api/client.js'

const TYPE_LABELS = { jour: 'Journée', merge: 'Parcours (merge)' }

/** @param {string} type @returns {string} libellé français du type */
export function typeLabel(type) {
  return TYPE_LABELS[type] ?? type ?? '—'
}

/** @param {string} iso @returns {string} date française courte ('—' si vide) */
export function frDate(iso) {
  if (typeof iso !== 'string' || iso === '') return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('fr-FR')
}

/** Une liste, que l'API la renvoie nue ou enveloppée sous `key`. */
function asList(data, key) {
  if (Array.isArray(data)) return data
  return Array.isArray(data?.[key]) ? data[key] : []
}

/** GET api/cartographe/apprentis -> [{id, displayName, ...}] */
export async function fetchApprentis(fetchFn) {
  return asList(await apiFetch('cartographe/apprentis', { fetchFn }), 'apprentis')
}

/**
 * GET api/cartographe/cartographies — file des cartographies des apprentis
 * liés (visibility cartographe|publique), métadonnées seulement.
 * @returns {Promise<Array<{id, titre, type, apprenant, garantie, createdAt}>>}
 */
export async function fetchQueue(fetchFn) {
  return asList(await apiFetch('cartographe/cartographies', { fetchFn }), 'cartographies')
}

/**
 * GET api/cartographe/cartographies/{id} — document + annotations +
 * révisions (méta) + garantie.
 * @returns {Promise<{cartographie: object, annotations: object[],
 *   revisions: object[], garantie: object | null}>}
 */
export async function fetchCartographie(id, fetchFn) {
  const data = await apiFetch(`cartographe/cartographies/${encodeURIComponent(id)}`, { fetchFn })
  return {
    cartographie: data?.cartographie ?? data ?? null,
    annotations: asList(data, 'annotations'),
    revisions: asList(data, 'revisions'),
    garantie: data?.garantie ?? null,
  }
}

/** POST api/cartographe/invitations/{code}/accept (rôle cartographe). */
export function acceptInvitation(code, fetchFn) {
  return apiFetch(`cartographe/invitations/${encodeURIComponent(code)}/accept`, {
    method: 'POST',
    fetchFn,
  })
}

/** GET api/cartographies/{id}/annotations -> [{id, competenceCode, type, texte, ...}] */
export async function fetchAnnotations(cartographieId, fetchFn) {
  return asList(
    await apiFetch(`cartographies/${encodeURIComponent(cartographieId)}/annotations`, { fetchFn }),
    'annotations',
  )
}

/** POST api/cartographies/{id}/annotations {competenceCode, type, texte}. */
export function postAnnotation(cartographieId, body, fetchFn) {
  return apiFetch(`cartographies/${encodeURIComponent(cartographieId)}/annotations`, {
    method: 'POST',
    body,
    fetchFn,
  })
}

/** DELETE api/annotations/{annotationId} (auteur seul). */
export function deleteAnnotation(annotationId, fetchFn) {
  return apiFetch(`annotations/${encodeURIComponent(annotationId)}`, {
    method: 'DELETE',
    fetchFn,
  })
}

/** GET api/cartographies/{id}/revisions (métadonnées). */
export async function fetchRevisions(cartographieId, fetchFn) {
  return asList(
    await apiFetch(`cartographies/${encodeURIComponent(cartographieId)}/revisions`, { fetchFn }),
    'revisions',
  )
}

/** POST api/cartographies/{id}/revisions {document, note} -> {revisionId}. */
export function postRevision(cartographieId, body, fetchFn) {
  return apiFetch(`cartographies/${encodeURIComponent(cartographieId)}/revisions`, {
    method: 'POST',
    body,
    fetchFn,
  })
}

/** GET api/revisions/{revisionId} -> document de la révision. */
export async function fetchRevisionDocument(revisionId, fetchFn) {
  const data = await apiFetch(`revisions/${encodeURIComponent(revisionId)}`, { fetchFn })
  return data?.document ?? data?.revision?.document ?? null
}

/** POST api/cartographies/{id}/garantie {revisionId?} -> {par, date, revisionId}. */
export async function postGarantie(cartographieId, revisionId, fetchFn) {
  const body = revisionId == null ? {} : { revisionId }
  const data = await apiFetch(`cartographies/${encodeURIComponent(cartographieId)}/garantie`, {
    method: 'POST',
    body,
    fetchFn,
  })
  return data?.garantie ?? data ?? null
}

/** DELETE api/cartographies/{id}/garantie (le même cartographe). */
export function deleteGarantie(cartographieId, fetchFn) {
  return apiFetch(`cartographies/${encodeURIComponent(cartographieId)}/garantie`, {
    method: 'DELETE',
    fetchFn,
  })
}
