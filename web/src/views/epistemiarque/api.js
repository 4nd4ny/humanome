// Atelier épistémiarque (cahier §3.5) — client fin du module référentiel.
//
// L'édition du référentiel est COLLECTIVE : une proposition d'un épistémiarque
// doit être VOTÉE et validée par la MAJORITÉ des membres épistémiarques pour
// être entérinée (publiée). Les débats Decidim peuvent l'étayer en cas de doute.
// Toutes les routes au même endroit, injectables (apiFetchFn) pour les tests.

import { apiFetch } from '../../api/client.js'

const e = encodeURIComponent

/**
 * @param {typeof apiFetch} [apiFetchFn]
 * @returns {object} client épistémiarque
 */
export function createEpistemiarqueApi(apiFetchFn = apiFetch) {
  return {
    /** GET api/referentiel — dernière version publiée (document complet). */
    getPublished: () => apiFetchFn('referentiel'),

    /** GET api/referentiel/versions — versions publiées (métadonnées). */
    listVersions: () => apiFetchFn('referentiel/versions'),

    /** GET api/referentiel/drafts — brouillons + propositions (méta + tally). */
    listDrafts: () => apiFetchFn('referentiel/drafts'),

    /** GET api/referentiel/drafts/{id} — un brouillon/proposition AVEC contenu. */
    getDraft: (id) => apiFetchFn(`referentiel/drafts/${e(id)}`),

    /** POST api/referentiel/drafts — nouvelle proposition forkée d'une publiée. */
    createDraft: ({ from, semver, label }) =>
      apiFetchFn('referentiel/drafts', { method: 'POST', body: { from, semver, label } }),

    /** PUT api/referentiel/drafts/{id} — enregistre le document complet édité. */
    saveDraft: (id, content) =>
      apiFetchFn(`referentiel/drafts/${e(id)}`, { method: 'PUT', body: content }),

    /** POST …/submit — ouvre le vote (brouillon → proposition), lien Decidim optionnel. */
    submitDraft: (id, decidimUrl = null) =>
      apiFetchFn(`referentiel/drafts/${e(id)}/submit`, {
        method: 'POST',
        body: decidimUrl ? { decidimUrl } : {},
      }),

    /** POST …/withdraw — retire la proposition (proposition → brouillon, votes effacés). */
    withdrawDraft: (id) =>
      apiFetchFn(`referentiel/drafts/${e(id)}/withdraw`, { method: 'POST' }),

    /** POST …/publish — entérine la proposition adoptée (immuable). */
    publishDraft: (id, releaseNote) =>
      apiFetchFn(`referentiel/drafts/${e(id)}/publish`, {
        method: 'POST',
        body: { releaseNote },
      }),

    /** GET api/referentiel/proposals — propositions ouvertes au vote (+ tally). */
    listProposals: () => apiFetchFn('referentiel/proposals'),

    /** GET api/referentiel/proposals/{id} — proposition complète : contenu, diff, tally, votes. */
    getProposal: (id) => apiFetchFn(`referentiel/proposals/${e(id)}`),

    /** POST …/votes — dépose (ou change) le vote du membre : pour|contre|abstention. */
    vote: (id, vote, comment = null) =>
      apiFetchFn(`referentiel/proposals/${e(id)}/votes`, {
        method: 'POST',
        body: { vote, comment },
      }),
  }
}

/**
 * Suggestion de prochaine version pour une nouvelle proposition (bump mineur :
 * une évolution du référentiel n'est jamais un simple correctif).
 * @param {string} version semver de départ (dernière publiée)
 * @returns {string} ex. '7.0.0' -> '7.1.0'
 */
export function suggestNextVersion(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version ?? ''))
  if (!m) return '7.1.0'
  return `${m[1]}.${Number(m[2]) + 1}.0`
}

/** URL de l'espace Decidim d'Harmonia Éducation (débats du référentiel). */
export const DECIDIM_URL = 'https://participer.harmonia.education'
