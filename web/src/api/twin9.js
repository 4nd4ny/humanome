// Client de l'API Twin9 (ADR-010) — le SEUL point où le front parle au
// serveur Twin9. Les gabarits restent côté serveur : le front n'envoie que
// {etape, variables} et ne reçoit que la sortie du modèle (déjà filtrée).
//
// apiFetch (api/client.js) gère la session (cookie), le CSRF et la dégradation
// propre en copie statique (ApiUnavailableError).

import { apiFetch } from './client.js'

/** Offre publique + solde + structure du référentiel + clé privée dispo. */
export function fetchTwin9Meta(options) {
  return apiFetch('twin9/meta', options)
}

/**
 * Fabrique de backend pour le moteur (engine/src/twin9) : chaque appel LLM
 * passe par POST /api/twin9/appel. Le moteur appelle backend.call(prompt, opts)
 * mais en PRODUCTION le prompt est rendu SERVEUR — le front envoie donc
 * l'étiquette d'étape + les variables (portées par opts.etape/opts.variables/
 * opts.etage), jamais le gabarit. Renvoie {text}.
 *
 * @param {{modele: string, facturation: 'platform'|'cle_privee',
 *   onDebit?: (microusd: number, soldeApres: number|null) => void,
 *   fetchFn?: typeof fetch}} params
 */
export function makeServerBackend({ modele, facturation, onDebit, fetchFn }) {
  const records = []
  return {
    records,
    async call(_prompt, opts = {}) {
      const body = {
        etape: opts.etape ?? opts.label,
        variables: opts.variables ?? {},
        modele,
        etage: opts.etage ?? 'rapide',
        facturation,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }
      const data = await apiFetch('twin9/appel', {
        ...(fetchFn ? { fetchFn } : {}),
        method: 'POST',
        body,
      })
      records.push({ label: body.etape, tokensIn: data.tokens_in, tokensOut: data.tokens_out })
      if (typeof onDebit === 'function') onDebit(data.cout_microusd ?? 0, null)
      return { text: data.sortie ?? '' }
    },
  }
}

/** Solde + 50 derniers événements du grand-livre. */
export function fetchCredit(options) {
  return apiFetch('twin9/credit', options)
}

/** Suivi des dépenses par mois (12 derniers) + solde. */
export function fetchDepenses(options) {
  return apiFetch('twin9/depenses', options)
}

/** Facture récapitulative d'un mois (données ; le rendu imprimable est côté vue). */
export function fetchFacture(annee, mois, options) {
  return apiFetch(`twin9/facture?annee=${Number(annee)}&mois=${Number(mois)}`, options)
}

/** Crée un ordre PayPal pour un pack -> {approve_url, order_id}. */
export function creerRecharge(packIndex, options) {
  return apiFetch('twin9/credit/paypal/creer', {
    ...options,
    method: 'POST',
    body: { pack_index: packIndex },
  })
}

/** Capture un ordre PayPal approuvé (idempotent) -> {solde_microusd}. */
export function capturerRecharge(orderId, options) {
  return apiFetch('twin9/credit/paypal/capturer', {
    ...options,
    method: 'POST',
    body: { order_id: orderId },
  })
}

/**
 * Rembourse le solde inutilisé À LA DEMANDE (jamais automatique) vers PayPal.
 * Sans montant : rembourse tout le solde remboursable. -> {rembourse_microusd,
 * solde_microusd}.
 */
export function rembourserSolde(options) {
  return apiFetch('twin9/credit/rembourser', {
    ...options,
    method: 'POST',
    body: {},
  })
}

// ---- Administration (rôle admin) ----------------------------------------

export function fetchProtocoleList(options) {
  return apiFetch('twin9/admin/protocole', options)
}

export function fetchProtocole(name, options) {
  return apiFetch(`twin9/admin/protocole/${encodeURIComponent(name)}`, options)
}

export function saveProtocole(name, content, options) {
  return apiFetch(`twin9/admin/protocole/${encodeURIComponent(name)}`, {
    ...options,
    method: 'PUT',
    body: { content },
  })
}

export function fetchProtocoleVersions(name, options) {
  return apiFetch(`twin9/admin/protocole/${encodeURIComponent(name)}/versions`, options)
}

export function fetchTwin9Config(options) {
  return apiFetch('twin9/admin/config', options)
}

export function saveTwin9Config(partial, options) {
  return apiFetch('twin9/admin/config', { ...options, method: 'PUT', body: partial })
}

export function testerProtocole(name, variables, options) {
  return apiFetch('twin9/admin/tester', {
    ...options,
    method: 'POST',
    body: { name, variables },
  })
}

/** Table de surveillance des comptes (soldes, cumuls, dernière activité). */
export function fetchComptes(options) {
  return apiFetch('twin9/admin/comptes', options)
}

/** Micro-USD -> chaîne « 1,23 $ » (les montants voyagent en micro-USD entiers). */
export function formatUsd(microusd) {
  const usd = (Number(microusd) || 0) / 1_000_000
  return `${usd.toFixed(usd !== 0 && Math.abs(usd) < 0.01 ? 4 : 2).replace('.', ',')} $`
}

/**
 * Référentiel du /twin9/meta ([{num, nom, competences:[{code, nom}]}]) mis à la
 * forme moteur/adaptateurs : { poles: [{num, nom}], competences: [{code, nom,
 * pole}] }. Utilisé par les adaptateurs Twin6 ET Twin9 (mapper → sunburst).
 *
 * @param {Array<{num:number, nom:string, competences?:Array<{code:string, nom:string}>}>} metaReferentiel
 */
export function referentielPourMoteur(metaReferentiel) {
  const src = Array.isArray(metaReferentiel) ? metaReferentiel : []
  return {
    poles: src.map((p) => ({ num: p.num, nom: p.nom })),
    competences: src.flatMap((p) =>
      (p.competences ?? []).map((c) => ({ code: c.code, nom: c.nom, pole: p.num })),
    ),
  }
}
