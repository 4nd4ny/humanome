// Atelier promptologue (P10) — client fin du contrat d'API M7.
//
// Toutes les routes du contrat au même endroit, injectables (apiFetchFn) pour
// les tests. Les méthodes renvoient le JSON de l'API tel quel : la tolérance
// aux formes ({document} ou document nu…) est gérée par les appelants.

import { apiFetch } from '../../api/client.js'

const e = encodeURIComponent

/**
 * @param {typeof apiFetch} [apiFetchFn]
 * @returns {object} client promptologue
 */
export function createPromptologueApi(apiFetchFn = apiFetch) {
  return {
    /** GET api/prompt-packages — versions publiées (métadonnées). */
    listPublished: () => apiFetchFn('prompt-packages'),

    /** GET api/prompt-packages/{id}/{version} — document complet publié. */
    getPackage: (id, version) => apiFetchFn(`prompt-packages/${e(id)}/${e(version)}`),

    /** GET api/prompt-packages/default — {id, version} du paquet par défaut. */
    getDefault: () => apiFetchFn('prompt-packages/default'),

    /** GET api/prompt-packages/drafts — MES brouillons (rôle promptologue). */
    listDrafts: () => apiFetchFn('prompt-packages/drafts'),

    /** GET api/prompt-packages/drafts/{draftId} — UN brouillon AVEC document. */
    getDraft: (draftId) => apiFetchFn(`prompt-packages/drafts/${e(draftId)}`),

    /** POST api/prompt-packages/drafts — nouvelle version depuis une publiée. */
    createDraft: ({ fromId, fromVersion, version }) =>
      apiFetchFn('prompt-packages/drafts', {
        method: 'POST',
        body: { fromId, fromVersion, version },
      }),

    /** PUT api/prompt-packages/drafts/{draftId} — enregistre le document. */
    saveDraft: (draftId, document) =>
      apiFetchFn(`prompt-packages/drafts/${e(draftId)}`, {
        method: 'PUT',
        body: { document },
      }),

    /** POST …/publish — publication immuable (semver croissant + changelog). */
    publishDraft: (draftId, changelog) =>
      apiFetchFn(`prompt-packages/drafts/${e(draftId)}/publish`, {
        method: 'POST',
        body: { changelog },
      }),

    /** GET api/prompt-packages/{id}/diff/{v1}/{v2} — diff structurel. */
    diff: (id, v1, v2) => apiFetchFn(`prompt-packages/${e(id)}/diff/${e(v1)}/${e(v2)}`),

    /** POST api/prompt-packages/{id}/{version}/propose-default. */
    proposeDefault: (id, version) =>
      apiFetchFn(`prompt-packages/${e(id)}/${e(version)}/propose-default`, { method: 'POST' }),

    /** GET api/cartographies — mes cartographies serveur (métadonnées). */
    listCartographies: () => apiFetchFn('cartographies'),

    /** GET api/cartographies/{id} — document complet. */
    getCartography: (id) => apiFetchFn(`cartographies/${e(id)}`),

    /** GET api/referentiel/versions — versions publiées (métadonnées). */
    listReferentielVersions: () => apiFetchFn('referentiel/versions'),

    /** GET api/referentiel/versions/{semver} — document référentiel. */
    getReferentielVersion: (semver) => apiFetchFn(`referentiel/versions/${e(semver)}`),
  }
}

/**
 * Suggestion de prochaine version (bump patch) pour « nouvelle version ».
 * @param {string} version semver de départ
 * @returns {string} ex. '1.0.0' -> '1.0.1' ('1.0.1' si non parsable)
 */
export function suggestNextVersion(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version ?? ''))
  if (!m) return '1.0.1'
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
}

/**
 * Normalise une entrée de la liste des brouillons : l'API M7 est en chantier
 * parallèle, on tolère {draftId, document, fromId?, fromVersion?} comme un
 * document nu accompagné d'un draftId.
 * @param {object} entry
 * @returns {{draftId: string, document: object, fromId: string|null,
 *   fromVersion: string|null, updatedAt: string|null} | null}
 */
export function normalizeDraftEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const draftId = entry.draftId ?? entry.id ?? null
  const document = entry.document ?? (entry.kind === 'prompt-package' ? entry : null)
  if (draftId === null) return null
  return {
    draftId: String(draftId),
    document: document && typeof document === 'object' ? document : null,
    fromId: typeof entry.fromId === 'string' ? entry.fromId : null,
    fromVersion: typeof entry.fromVersion === 'string' ? entry.fromVersion : null,
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : null,
  }
}
