// Faux serveur de partage pour les tests de l'interface : même contrat que
// ui/shareApi.js, en mémoire (P6, D-33 ; version garantie, D-42).
import { vi } from 'vitest'
import { ApiError } from '../../api/client.js'

/**
 * @param {{adult?: boolean, required?: boolean, apprenant?: string, garant?: string}} [opts]
 *   apprenant : nom de la personne qui a créé la demande que le cartographe ouvre ;
 *   garant : nom du cartographe qui l'ouvre (le compte connecté).
 */
export function fakeShareApi({ adult = false, required = true, apprenant = 'Lou', garant = 'Carl' } = {}) {
  let attestation = { adult, attestedAt: adult ? '2026-10-01T09:00:00' : null, required }
  const versions = []
  const links = []
  const requests = []
  let nextId = 10
  let nextCode = 0
  const code = () => `ABCDEFGH${'23456789'[nextCode % 8]}${'23456789'[Math.floor(nextCode++ / 8) % 8]}`
  const meta = ({ document: _document, ...rest }) => ({ ...rest, garantie: rest.garantie ?? null, shares: links.filter((l) => l.cartoId === rest.id && !l.revokedAt).length })
  const api = {
    getAdult: vi.fn(async () => attestation),
    setAdult: vi.fn(async (on) => {
      attestation = { adult: on, attestedAt: on ? '2026-10-14T09:00:00' : null, required }
      if (on) return attestation
      // Retrait : le serveur efface les versions partagées, leurs liens et les demandes.
      const deletedVersions = versions.length
      versions.splice(0)
      links.splice(0)
      requests.splice(0)
      return { ...attestation, deletedVersions }
    }),
    listVersions: vi.fn(async () => versions.map(meta)),
    publish: vi.fn(async (document) => {
      const id = nextId++
      versions.push({ id, type: 'partage', titre: document.title, visibility: 'privee', createdAt: '2026-10-14T10:00:00', updatedAt: '2026-10-14T10:00:00', hasDocument: true, garantie: null, document })
      return { id }
    }),
    replaceVersion: vi.fn(async (id, document) => {
      const v = versions.find((x) => x.id === id)
      // Remplacée par l'apprenant : la garantie d'un cartographe tombe (D-42).
      Object.assign(v, { titre: document.title, document, updatedAt: '2026-10-15T09:00:00', garantie: null })
      const { document: _d, ...rest } = v
      return rest
    }),
    getVersion: vi.fn(async (id) => ({ ...versions.find((v) => v.id === id) })),
    deleteVersion: vi.fn(async (id) => {
      versions.splice(versions.findIndex((v) => v.id === id), 1)
      return null
    }),
    createLink: vi.fn(async (cartoId, { password }) => {
      const shareId = 100 + links.length
      const token = String(shareId).padStart(32, 'f')
      links.push({ shareId, cartoId, createdAt: '2026-10-14T10:05:00', expiresAt: '2027-01-12T10:05:00', revokedAt: null, password: Boolean(password) })
      return { shareId, token, url: `/#/partage/${token}${password ? '' : '/ouvert'}` }
    }),
    listLinks: vi.fn(async (cartoId) => links.filter((l) => l.cartoId === cartoId).map(({ shareId, createdAt, expiresAt, revokedAt }) => ({ shareId, createdAt, expiresAt, revokedAt }))),
    consultations: vi.fn(async (shareId) => ({
      shareId,
      withPassword: links.find((l) => l.shareId === shareId)?.password ?? false,
      count: 2,
      lastAt: '2026-10-14T11:20:00',
      items: [{ at: '2026-10-14T11:20:00' }, { at: '2026-10-14T10:40:00' }],
    })),
    revokeLink: vi.fn(async (shareId) => {
      links.find((l) => l.shareId === shareId).revokedAt = '2026-10-14T12:00:00'
      return null
    }),
    // --- Version garantie (D-42) ---
    requestGuarantee: vi.fn(async ({ replacesId = null } = {}) => {
      if (!attestation.adult) throw new ApiError('Le partage est réservé aux personnes majeures (attestation requise)', 403, 'adult_required')
      const target = replacesId == null ? null : versions.find((v) => v.id === replacesId)
      const made = { code: code(), createdAt: '2026-10-14T10:30:00', expiresAt: '2026-11-13T10:30:00', replaces: target ? { id: target.id, titre: target.titre } : null }
      requests.push(made)
      return made
    }),
    listRequests: vi.fn(async () => requests.map((r) => ({ ...r }))),
    cancelRequest: vi.fn(async (c) => {
      const i = requests.findIndex((r) => r.code === c)
      if (i < 0) throw new ApiError('Demande introuvable', 404)
      requests.splice(i, 1)
      return null
    }),
    openRequest: vi.fn(async (c) => {
      const r = requests.find((x) => x.code === c)
      if (!r) throw new ApiError('Demande introuvable ou expirée', 404)
      return { code: r.code, apprenant: { displayName: apprenant }, garant: { displayName: garant }, createdAt: r.createdAt, expiresAt: r.expiresAt, replaces: r.replaces ? { titre: r.replaces.titre } : null }
    }),
    publishGuaranteed: vi.fn(async (c, document) => {
      const i = requests.findIndex((x) => x.code === c)
      if (i < 0) throw new ApiError('Demande introuvable ou expirée', 404)
      const [r] = requests.splice(i, 1)
      const garantie = { par: garant, date: '2026-10-14T11:00:00', revisionId: null }
      if (r.replaces) {
        Object.assign(versions.find((v) => v.id === r.replaces.id), { titre: document.title, document, updatedAt: '2026-10-14T11:00:00', garantie })
      } else {
        versions.push({ id: nextId++, type: 'partage', titre: document.title, visibility: 'privee', createdAt: '2026-10-14T11:00:00', updatedAt: '2026-10-14T11:00:00', hasDocument: true, garantie, document })
      }
      return { replaced: Boolean(r.replaces), apprenant: { displayName: apprenant }, garantie }
    }),
  }
  return { api, versions, links, requests }
}
