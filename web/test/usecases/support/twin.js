// Support du lot « Twin6 / Twin9 » (UC-APP-09, UC-APP-10, UC-APP-11,
// UC-PRO-08, UC-ADM-05) : réponses HTTP factices, routeur de `fetch` simulé et
// jeux de données FICTIFS.
//
// CONFIDENTIALITÉ (ADR-010) : aucun gabarit Twin9 réel ici — le front n'en voit
// de toute façon jamais (sauf l'atelier, dont les contenus sont inventés).
// Le routeur associe « MÉTHODE chemin » (chemin sans le préfixe « api/ » ni la
// query) OU « chemin » seul à une réponse (objet ou fonction (url, init) →
// réponse). Toute URL non routée répond 404 JSON. Chaque appel est consigné.
import { vi } from 'vitest'

/** Réponse JSON minimale compatible avec api/client.js et le moteur. */
export function jsonResponse(status, data, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) =>
        name.toLowerCase() === 'content-type' ? 'application/json' : (lower[name.toLowerCase()] ?? null),
    },
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
}

/** Réponse HTML (hébergement statique sans API : la page d'index répond). */
export function htmlResponse(status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'text/html' : null) },
    json: async () => {
      throw new SyntaxError('not json')
    },
    text: async () => '<!doctype html><title>humanome</title>',
  }
}

/** Clé de route d'une requête : « POST twin9/appel » (sans « api/ » ni query). */
export function routeKey(url, init = {}) {
  const method = String(init?.method ?? 'GET').toUpperCase()
  const path = String(url).replace(/^api\//, '').split('?')[0]
  return `${method} ${path}`
}

/**
 * Installe un `fetch` global routé. `routes` : { 'GET auth/me': réponse,
 * 'POST twin9/appel': (url, init) => réponse, 'data/twin6/x.json': … }.
 * @returns {{fetchMock: import('vitest').Mock, calls: Array<{url: string, key: string, init: object}>}}
 */
export function stubFetch(routes) {
  const calls = []
  const fetchMock = vi.fn(async (url, init = {}) => {
    const key = routeKey(url, init)
    calls.push({ url: String(url), key, init })
    const path = String(url).replace(/^api\//, '').split('?')[0]
    const hit = routes[key] ?? routes[String(url)] ?? routes[path]
    if (hit === undefined) return jsonResponse(404, { error: 'absent' })
    return typeof hit === 'function' ? hit(String(url), init) : hit
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, calls }
}

/** Corps JSON d'un appel consigné. */
export function bodyOf(call) {
  return call?.init?.body ? JSON.parse(call.init.body) : undefined
}

/** Session factice renvoyée par GET api/auth/me (sème le jeton CSRF). */
export function meResponse(roles = ['apprenant'], extra = {}) {
  return jsonResponse(200, {
    user: { id: 7, email: 'lea@example.org', displayName: 'Léa', roles, hasAvatar: false, ...extra },
    csrfToken: 'csrf-twin-lot',
  })
}

/** Les 7 pôles RESPIRE (le schéma cartographie-merge exige 7 domaines). */
export const POLES_RESPIRE = [
  { num: 1, nom: 'TÊTE — Penser & Comprendre' },
  { num: 2, nom: 'CŒUR — Relier & Naviguer' },
  { num: 3, nom: 'MAIN — Créer & Incarner' },
  { num: 4, nom: 'ÂME — Discerner & Juger' },
  { num: 5, nom: 'RACINES — Évoluer & Résister' },
  { num: 6, nom: 'CITÉ — Gouverner & S’ouvrir' },
  { num: 7, nom: 'FLAMBEAU — Transmettre & Piloter' },
]

/** Référentiel au format /api/twin9/meta : 7 pôles, une compétence N.01 chacun. */
export const META_REFERENTIEL = POLES_RESPIRE.map((p) => ({
  num: p.num,
  nom: p.nom,
  competences: [{ code: `${p.num}.01`, nom: `Compétence fictive ${p.num}.01` }],
}))

/** Paquet PUBLIC Twin6 FICTIF (même forme que web/public/data/twin6/…json). */
export const TWIN6_PACKAGE = {
  id: 'twin6-ouverte',
  version: '1.0.0',
  nom: 'Cartographie ouverte Twin6 (fictif)',
  licence: 'AGPL-3.0-only',
  modeleCibleDefaut: 'claude-sonnet-5',
  scanPole: 'Scanne le pôle ${POLE} du portfolio avec la fiche P${POLE}.md (gabarit public fictif).',
  kairos: 'Synthèse kairos fictive des carto_pole.',
  fiches: Object.fromEntries(POLES_RESPIRE.map((p) => [p.num, `Fiche publique fictive du pôle ${p.num}`])),
}

/**
 * Sortie `carto_pole` FICTIVE du pôle N : la compétence N.01 attestée par une
 * trace concrète sur la feuille `feuille`.
 */
export function cartoPoleFictif(num, feuille = '2026-02-10') {
  return {
    poleNum: num,
    passagesSaillants: [
      { pid: 1, feuille, extraitVerbatim: `Trace fictive du pôle ${num}.`, contexte: 'projet', auteur: 'apprenant' },
    ],
    competences: [
      {
        code: `${num}.01`,
        courtCircuit: false,
        pieces: [{ numero: 1, pid: 1, contexte: 'acte documenté' }],
        pedagogue: { conclusionAdversariale: { raisonnement: `Attestation fictive ${num}.`, confianceFinale: 0.7 } },
        verdict: {
          statut: 'présence établie',
          nombrePreuves: 1,
          nombreIndices: 0,
          confiance: 0.7,
          motif: 'Trace concrète.',
          prescription: 'Poursuivre.',
        },
        tracesRetenues: [{ pieceId: 1, type: 'trace concrète', role: 'preuve décisive' }],
      },
    ],
    rapport: { rapportCompletMarkdown: `## Pôle ${num}\n\nPrésence fictive.`, portraitPole: '.' },
    auditPole: { competencesTotales: 1, presencesEtablies: 1 },
  }
}

/** Sortie `kairos` FICTIVE. */
export const KAIROS_FICTIF = {
  kairos: {
    apprenant: {
      portrait: 'Profil fictif.',
      formeProfil: 'Massifs.',
      syntheseCompleteMarkdown: '## Synthèse\n\nUn portrait fictif et cohérent.',
    },
  },
  emergencesCrossPoles: { competencesOrphelines: [], connexionsTransversales: [], noeudsConceptuels: [] },
}

/**
 * Texte de réponse du modèle pour un prompt Twin6 : kairos si le prompt porte
 * les carto_pole (« carto_P1 »), sinon le carto_pole du pôle nommé dans le
 * prompt (« Fiche des compétences du pôle N »).
 */
export function twin6ModelText(prompt) {
  if (String(prompt).includes('## carto_P1')) return '```json\n' + JSON.stringify(KAIROS_FICTIF) + '\n```'
  const m = /Fiche des compétences du pôle (\d)/.exec(String(prompt))
  const num = m ? Number(m[1]) : 1
  return `Voici la cartographie.\n\n\`\`\`json\n${JSON.stringify(cartoPoleFictif(num))}\n\`\`\``
}

/** Offre Twin9 (/api/twin9/meta) FICTIVE, service activé. */
export function metaTwin9(overrides = {}) {
  return {
    enabled: true,
    etapes: [{ name: 'fictif/01-essai', longueur_gabarit: 120, variables: ['TEXTE_JOURNEE'] }],
    modeles: {
      'claude-sonnet-5': { etages: ['taggers', 'rapide', 'tribunal'], prix_usd_mtok: [3.6, 18] },
    },
    modeles_twin6: { 'claude-sonnet-5': [3.3, 16.5] },
    twin9_cle_perso_ouverte: false,
    packs: [
      { montant_usd: 10, libelle: 'Pack découverte — 10 $' },
      { montant_usd: 20, libelle: 'Pack standard — 20 $' },
    ],
    pipeline: {},
    referentiel: META_REFERENTIEL,
    paypalConfigured: true,
    solde_microusd: 50_000_000,
    cle_privee_disponible: false,
    ...overrides,
  }
}
