// Client de « Cartographie ouverte Twin6 » — le point de contact du front avec
// le protocole Twin6 (OPEN SOURCE). Deux voies, comme demandé :
//   - CLÉ PERSO : le moteur (executerTwin6) tourne côté client, appel DIRECT au
//     fournisseur avec la clé de l'utilisateur → GRATUIT (rien ne nous est dû).
//   - CRÉDITS : chaque appel passe par POST /api/twin6/appel (notre clé), la
//     contribution +10 % est débitée du solde prépayé. Le prompt étant PUBLIC,
//     il n'y a aucun secret à protéger (pas de LeakFilter côté serveur).
//
// Le paquet de prompts est PUBLIC et téléchargeable : web/public/data/twin6/.

import { apiFetch } from './client.js'
import { createProvider } from '@engine/providers/index.js'
import { fetchTwin9Meta } from './twin9.js'

/** Paquet de prompts open source (servi statiquement, téléchargeable). */
export const TWIN6_PACKAGE_URL = 'data/twin6/twin6-ouverte-1.0.0.json'

/**
 * Charge le paquet PUBLIC de prompts Twin6 (scanPole, kairos, fiches P1..P7)
 * dans la forme attendue par le moteur (twin6.executerTwin6).
 *
 * @param {{fetchFn?: typeof fetch, url?: string}} [opts]
 */
export async function loadTwin6Package({ fetchFn = fetch, url = TWIN6_PACKAGE_URL } = {}) {
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`Paquet Twin6 introuvable (${res.status})`)
  const pkg = await res.json()
  if (!pkg?.scanPole || !pkg?.kairos || !pkg?.fiches) {
    throw new Error('Paquet Twin6 invalide (scanPole/kairos/fiches attendus)')
  }
  return {
    id: pkg.id,
    version: pkg.version,
    nom: pkg.nom,
    licence: pkg.licence,
    modeleCibleDefaut: pkg.modeleCibleDefaut ?? 'claude-sonnet-5',
    templates: { scanPole: pkg.scanPole, kairos: pkg.kairos, fiches: pkg.fiches },
  }
}

/**
 * Provider CRÉDITS (voie « nos crédits ») : chaque complete() passe par POST
 * /api/twin6/appel — apiFetch porte la session (cookie) et le CSRF. Facturé
 * +10 % côté serveur. Contrat moteur {complete(params)} → {text, usage, model,
 * stopReason} (identique à createProvider).
 *
 * @param {{onCout?: (microusd:number)=>void, fetchFn?: typeof fetch}} [opts]
 */
export function makeCreditsProvider({ onCout, fetchFn } = {}) {
  return {
    name: 'twin6-credits',
    transport: 'proxy',
    async complete({ model, prompt, maxTokens, system = null, signal } = {}) {
      const data = await apiFetch('twin6/appel', {
        method: 'POST',
        body: { model, prompt, system, max_tokens: maxTokens },
        ...(fetchFn ? { fetchFn } : {}),
        ...(signal ? { signal } : {}),
      })
      if (typeof onCout === 'function') onCout(data.cout_microusd ?? 0)
      return {
        text: data.text ?? '',
        usage: {
          inputTokens: data.usage?.inputTokens ?? 0,
          outputTokens: data.usage?.outputTokens ?? 0,
        },
        model: data.model ?? model,
        stopReason: data.stopReason ?? null,
      }
    },
  }
}

/**
 * Provider CLÉ PERSO (voie gratuite) : appel DIRECT navigateur → fournisseur,
 * avec la clé de l'utilisateur. Réutilise createProvider (même chemin que les
 * cartographies régulières en clé perso). La clé ne quitte pas le navigateur.
 *
 * @param {{provider?: string, apiKey: string, fetchFn?: typeof fetch}} params
 */
export function makeOwnKeyProvider({ provider = 'anthropic', apiKey, fetchFn } = {}) {
  return createProvider({
    provider,
    transport: 'direct',
    apiKey,
    ...(fetchFn ? { fetchFn } : {}),
  })
}

// referentielPourMoteur a déménagé dans api/twin9.js (D12 : il sert les DEUX
// adaptateurs, Twin6 et Twin9) — ré-exporté ici pour les importeurs existants.
export { referentielPourMoteur } from './twin9.js'

/**
 * Prix Twin6 (contribution +10 % déjà appliquée) par modèle + état de la promo
 * Twin9, lus dans /twin9/meta (le serveur applique la marge, jamais exposée).
 */
export async function fetchTwin6Offer(options) {
  const meta = await fetchTwin9Meta(options)
  return {
    modeles: meta.modeles_twin6 ?? {},
    twin9PromoOuverte: Boolean(meta.twin9_cle_perso_ouverte),
    referentiel: Array.isArray(meta.referentiel) ? meta.referentiel : [],
    // Solde prépayé du compte : sert de garde-fou avant un run sur crédits
    // (on ne lance pas si le solde ne couvre pas le poids du portfolio).
    solde_microusd: Number(meta.solde_microusd ?? 0),
  }
}
