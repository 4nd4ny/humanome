// Compétences ATOMIQUES (migration 016) — client fin du module.
//
// Chaque compétence est éditée/versionnée/gouvernée/concurrente INDÉPENDAMMENT.
// L'édition d'un brouillon utilise la CONCURRENCE OPTIMISTE : on envoie le
// content_hash de base (chargé) en en-tête If-Match ; le serveur renvoie 409 si
// un autre épistémiarque a modifié la compétence entre-temps.

import { apiFetch } from '../../api/client.js'

const e = encodeURIComponent

/**
 * @param {typeof apiFetch} [apiFetchFn]
 * @returns {object} client compétences
 */
export function createCompetenceApi(apiFetchFn = apiFetch) {
  return {
    /** GET api/competences — dernière version publiée de chaque compétence (méta). */
    list: () => apiFetchFn('competences'),

    /** GET api/competences/{code} — dernière publiée AVEC contenu riche. */
    get: (code) => apiFetchFn(`competences/${e(code)}`),

    /** GET api/competences/drafts — brouillons + propositions (méta + tally). */
    listDrafts: () => apiFetchFn('competences/drafts'),

    /** GET api/competences/drafts/{id} — un brouillon/proposition AVEC contenu. */
    getDraft: (id) => apiFetchFn(`competences/drafts/${e(id)}`),

    /** POST api/competences/{code}/drafts — forke un brouillon d'UNE compétence. */
    createDraft: (code, semver) =>
      apiFetchFn(`competences/${e(code)}/drafts`, { method: 'POST', body: { semver } }),

    /** PUT api/competences/drafts/{id} — enregistre (CAS via If-Match = hash de base). */
    saveDraft: (id, content, baseHash) =>
      apiFetchFn(`competences/drafts/${e(id)}`, {
        method: 'PUT',
        body: content,
        headers: baseHash ? { 'If-Match': baseHash } : undefined,
      }),

    /** POST …/submit — ouvre le vote (lien Decidim optionnel). */
    submitDraft: (id, decidimUrl = null) =>
      apiFetchFn(`competences/drafts/${e(id)}/submit`, {
        method: 'POST',
        body: decidimUrl ? { decidimUrl } : {},
      }),

    /** POST …/withdraw — retire la proposition (→ brouillon, votes effacés). */
    withdrawDraft: (id) => apiFetchFn(`competences/drafts/${e(id)}/withdraw`, { method: 'POST' }),

    /** POST …/publish — entérine la proposition adoptée. */
    publishDraft: (id, releaseNote) =>
      apiFetchFn(`competences/drafts/${e(id)}/publish`, { method: 'POST', body: { releaseNote } }),

    /** GET api/competences/proposals — propositions au vote (+ tally). */
    listProposals: () => apiFetchFn('competences/proposals'),

    /** GET api/competences/proposals/{id} — proposition complète (contenu, tally, votes). */
    getProposal: (id) => apiFetchFn(`competences/proposals/${e(id)}`),

    /** POST …/votes — dépose (ou change) le vote du membre. */
    vote: (id, vote, comment = null) =>
      apiFetchFn(`competences/proposals/${e(id)}/votes`, { method: 'POST', body: { vote, comment } }),

    /** POST api/competences/release — coupe une release depuis les compétences publiées. */
    cutRelease: (semver, label) =>
      apiFetchFn('competences/release', { method: 'POST', body: { semver, label } }),
  }
}

/** Prochaine version mineure suggérée pour une compétence (bump mineur). */
export function nextCompetenceVersion(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version ?? ''))
  if (!m) return '1.1.0'
  return `${m[1]}.${Number(m[2]) + 1}.0`
}
