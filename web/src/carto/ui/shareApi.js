// Interface ultime — appels serveur du partage (spec §12). Seul module de
// l'interface qui parle à l'API ; il n'est utilisé que lorsque le partage est
// activé (serverEnabled) ET que la personne l'a demandé. Contrat :
//   GET    api/auth/me/adult                    -> {adult, attestedAt, required}
//   PUT    api/auth/me/adult {adult}            -> idem (false : révoque les liens)
//   GET    api/cartographies                    -> métadonnées (on garde type « partage »)
//   POST   api/cartographies {type: 'partage', titre, visibility: 'privee', document} -> {id}
//   GET    api/cartographies/{id}               -> {…, document}
//   DELETE api/cartographies/{id}               -> 204 (version et liens effacés)
//   POST   api/cartographies/{id}/share {expiresInDays, password?} -> {shareId, token, url}
//   GET    api/cartographies/{id}/shares        -> [{shareId, createdAt, expiresAt, revokedAt}]
//   GET    api/shares/{shareId}/consultations   -> {shareId, withPassword, count, lastAt, items[{at}]}
//   DELETE api/shares/{shareId}                 -> 204

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
      const list = await apiFetch('cartographies', opts())
      return (Array.isArray(list) ? list : []).filter((c) => c?.type === 'partage')
    },
    publish: (document) =>
      apiFetch('cartographies', opts({ method: 'POST', body: { type: 'partage', titre: document.title, visibility: 'privee', document } })),
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
  }
}

/** État d'un lien à l'instant `now` : actif, expiré ou révoqué. */
export function linkStatus(link, now = new Date()) {
  if (link.revokedAt) return 'revoked'
  if (link.expiresAt && new Date(link.expiresAt.replace(' ', 'T')) <= now) return 'expired'
  return 'active'
}

export const LINK_STATUS_LABELS = { active: 'actif', expired: 'expiré', revoked: 'révoqué' }
