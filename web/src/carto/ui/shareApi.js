// Interface ultime — appels serveur du partage (spec §12). Seul module de
// l'interface qui parle à l'API ; il n'est utilisé que lorsque le partage est
// activé (serverEnabled) ET que la personne l'a demandé. Contrat :
//   GET    api/auth/me/adult                    -> {adult, attestedAt, required}
//   PUT    api/auth/me/adult {adult}            -> idem (false : efface les versions et leurs liens)
//   GET    api/partage/versions                 -> [{id, titre, createdAt, updatedAt, shares, garantie: {par, date} | null}]
//   POST   api/cartographies {type: 'partage', titre, visibility: 'privee', document} -> {id}
//   GET    api/cartographies/{id}               -> {…, document}
//   PUT    api/cartographies/{id}/document {document} -> métadonnées (nouvelle version À LA PLACE : même lien)
//   DELETE api/cartographies/{id}               -> 204 (version et liens effacés)
//   POST   api/cartographies/{id}/share {expiresInDays, password?} -> {shareId, token, url}
//   GET    api/cartographies/{id}/shares        -> [{shareId, createdAt, expiresAt, revokedAt}]
//   GET    api/shares/{shareId}/consultations   -> {shareId, withPassword, count, lastAt, items[{at}]}
//   DELETE api/shares/{shareId}                 -> 204
// Version garantie par un cartographe (décision du 2026-10-14, journal D-42) :
//   POST   api/partage/demandes {adult: true, replacesId?} -> {code, createdAt, expiresAt, replaces: {id, titre} | null}
//   GET    api/partage/demandes                 -> [{code, createdAt, expiresAt, replaces}] (en attente)
//   DELETE api/partage/demandes/{code}          -> 204
//   GET    api/cartographe/demandes/{code}      -> {code, apprenant: {displayName}, garant: {displayName}, createdAt, expiresAt, replaces: {titre} | null}
//   POST   api/cartographe/demandes/{code}/publier {document, garant: true} -> {replaced, apprenant, garantie}

import { apiFetch } from '../../api/client.js'

/**
 * @param {{fetchFn?: typeof fetch, protocol?: string}} [seams] coutures de test
 */
export function createShareApi(seams = {}) {
  const opts = (extra = {}) => ({ ...seams, ...extra })
  const id = (v) => encodeURIComponent(String(v))
  return {
    getAdult: () => apiFetch('auth/me/adult', opts()),
    setAdult: (adult) => apiFetch('auth/me/adult', opts({ method: 'PUT', body: { adult } })),
    async listVersions() {
      const list = await apiFetch('partage/versions', opts())
      return Array.isArray(list) ? list : []
    },
    publish: (document) =>
      apiFetch('cartographies', opts({ method: 'POST', body: { type: 'partage', titre: document.title, visibility: 'privee', document } })),
    replaceVersion: (cartoId, document) => apiFetch(`cartographies/${id(cartoId)}/document`, opts({ method: 'PUT', body: { document } })),
    getVersion: (cartoId) => apiFetch(`cartographies/${id(cartoId)}`, opts()),
    deleteVersion: (cartoId) => apiFetch(`cartographies/${id(cartoId)}`, opts({ method: 'DELETE' })),
    createLink: (cartoId, { expiresInDays, password }) =>
      apiFetch(`cartographies/${id(cartoId)}/share`, opts({ method: 'POST', body: password ? { expiresInDays, password } : { expiresInDays } })),
    async listLinks(cartoId) {
      const list = await apiFetch(`cartographies/${id(cartoId)}/shares`, opts())
      return Array.isArray(list) ? list : []
    },
    consultations: (shareId) => apiFetch(`shares/${id(shareId)}/consultations`, opts()),
    revokeLink: (shareId) => apiFetch(`shares/${id(shareId)}`, opts({ method: 'DELETE' })),
    requestGuarantee: ({ replacesId = null } = {}) =>
      apiFetch('partage/demandes', opts({ method: 'POST', body: replacesId == null ? { adult: true } : { adult: true, replacesId } })),
    async listRequests() {
      const list = await apiFetch('partage/demandes', opts())
      return Array.isArray(list) ? list : []
    },
    cancelRequest: (code) => apiFetch(`partage/demandes/${id(code)}`, opts({ method: 'DELETE' })),
    openRequest: (code) => apiFetch(`cartographe/demandes/${id(code)}`, opts()),
    publishGuaranteed: (code, document) => apiFetch(`cartographe/demandes/${id(code)}/publier`, opts({ method: 'POST', body: { document, garant: true } })),
  }
}

/** État d'un lien à l'instant `now` : actif, expiré ou révoqué. */
export function linkStatus(link, now = new Date()) {
  if (link.revokedAt) return 'revoked'
  if (link.expiresAt && new Date(link.expiresAt.replace(' ', 'T')) <= now) return 'expired'
  return 'active'
}

export const LINK_STATUS_LABELS = { active: 'actif', expired: 'expiré', revoked: 'révoqué' }
