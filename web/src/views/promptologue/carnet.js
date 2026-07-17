// Carnet du banc d'essai (D15) — logique pure, sans React.
//
// Méta-page ÉDITABLE par chaque promptologue : un texte markdown qui décrit
// son banc (protocoles maison, conventions, prototypes composites JS+markdown
// type Twin9), et des CONFIGURATIONS EMBLÉMATIQUES nommées — instantanés
// complets des réglages du banc, rechargeables en un clic.
//
// Stockage : localStorage du navigateur (client-first, comme les portfolios).
// Le carnet s'exporte/s'importe en JSON pour circuler entre navigateurs.
// RGPD : les clés API ne sont JAMAIS écrites dans le carnet (sanitizeConfig).

export const CARNET_STORAGE_KEY = 'humanome-banc-carnet'

/** Texte initial de la méta-page (modifiable librement par le promptologue). */
export const DEFAULT_CARNET_TEXTE = `# Carnet du banc d'essai

Cette page vous appartient : décrivez ici VOTRE façon d'utiliser le banc —
protocoles de comparaison, seuils de consistance acceptés, modèles de
prédilection, journées de test de référence.

## Ce que le banc sait faire

- **Périmètre du journal** : tout le portfolio, une journée précise, ou une période.
- **Périmètre du référentiel** : référentiel entier, un pôle, ou UNE compétence.
- **Version du référentiel** : embarquée ou n'importe quelle version publiée
  (attention aux paquets à référentiel *en dur*, signalés par le banc).
- **A/B** : deux versions de prompts, et/ou deux fournisseurs LLM, et/ou deux
  versions du référentiel — sur le même portfolio.
- **Référence importée** : comparer un run à un JSON de référence (un run
  téléchargé depuis le banc se réimporte tel quel).
- **Diff de compétences** : établies d'un côté et pas de l'autre, avec les
  traces de délibération du jury (greffier, pédagogue, verdict) des deux côtés.

## Prototypes composites (javascript + markdown)

Un prototype composite à la Twin9 est un *paquet de prompts* dont
l'orchestration est du code : gabarits markdown dans \`prompts[]\`, module
javascript dans \`code.orchestration\` (exécuté en sandbox, seule sortie réseau :
\`providers.complete\`). Créez-en un depuis l'atelier (« Nouveau brouillon », ou
fork de \`twin6-ouverte\`), puis sélectionnez le brouillon sur le banc.

## Configurations emblématiques

Sauvegardez la configuration courante du banc avec le bouton ci-dessous : elle
apparaît ici, nommée, rechargeable en un clic. Les clés API ne sont jamais
enregistrées.
`

/** Forme canonique d'un carnet vide (texte par défaut, aucune configuration). */
export function emptyCarnet() {
  return { texte: DEFAULT_CARNET_TEXTE, configs: [] }
}

function normalizeCarnet(data) {
  if (!data || typeof data !== 'object') return emptyCarnet()
  const texte = typeof data.texte === 'string' ? data.texte : DEFAULT_CARNET_TEXTE
  const configs = (Array.isArray(data.configs) ? data.configs : [])
    .filter((c) => c && typeof c === 'object' && typeof c.nom === 'string' && c.nom !== '')
    .map((c) => ({
      nom: c.nom,
      note: typeof c.note === 'string' ? c.note : '',
      creeLe: typeof c.creeLe === 'string' ? c.creeLe : null,
      config: sanitizeConfig(c.config ?? {}),
    }))
  return { texte, configs }
}

function carnetStorage(storage) {
  return storage ?? globalThis.localStorage ?? null
}

/**
 * Lit le carnet du navigateur (carnet vide par défaut : premier usage,
 * stockage indisponible ou JSON corrompu).
 * @param {Storage} [storage] couture de test
 * @returns {{texte: string, configs: Array}}
 */
export function readCarnet(storage) {
  const s = carnetStorage(storage)
  if (!s) return emptyCarnet()
  try {
    return normalizeCarnet(JSON.parse(s.getItem(CARNET_STORAGE_KEY) ?? 'null'))
  } catch {
    return emptyCarnet()
  }
}

/**
 * Écrit le carnet (silencieux si le stockage est indisponible : le carnet
 * vit alors en mémoire de session).
 * @param {{texte: string, configs: Array}} carnet
 * @param {Storage} [storage] couture de test
 */
export function writeCarnet(carnet, storage) {
  const s = carnetStorage(storage)
  if (!s) return
  try {
    s.setItem(CARNET_STORAGE_KEY, JSON.stringify(normalizeCarnet(carnet)))
  } catch {
    /* quota plein ou stockage bloqué : pas d'erreur bloquante */
  }
}

/**
 * Purge récursivement toute clé sensible d'un instantané de configuration :
 * une clé API ne doit JAMAIS atteindre le carnet (ni son export JSON).
 * @param {object} config
 * @returns {object} copie sans champs apiKey/cle/secret/token/password
 */
export function sanitizeConfig(config) {
  const BLOCKED = /^(apikey|api_key|cle|clé|secret|token|password)$/i
  const walk = (value) => {
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === 'object') {
      const out = {}
      for (const [key, v] of Object.entries(value)) {
        if (BLOCKED.test(key)) continue
        out[key] = walk(v)
      }
      return out
    }
    return value
  }
  return walk(config ?? {})
}

/**
 * Ajoute (ou remplace, à nom identique) une configuration emblématique.
 * @param {{texte, configs}} carnet
 * @param {{nom: string, note?: string, config: object}} entry
 * @param {() => string} [now] horloge injectable
 * @returns {{texte, configs}} nouveau carnet (l'original n'est pas muté)
 */
export function addConfig(carnet, { nom, note = '', config }, now = () => new Date().toISOString()) {
  const nomPropre = String(nom ?? '').trim()
  if (nomPropre === '') throw new Error('Nommez la configuration avant de l’enregistrer.')
  const entry = { nom: nomPropre, note, creeLe: now(), config: sanitizeConfig(config) }
  const configs = [...(carnet?.configs ?? []).filter((c) => c.nom !== nomPropre), entry]
  return { ...normalizeCarnet(carnet), configs }
}

/**
 * Retire une configuration par nom.
 * @param {{texte, configs}} carnet @param {string} nom
 * @returns {{texte, configs}} nouveau carnet
 */
export function removeConfig(carnet, nom) {
  const base = normalizeCarnet(carnet)
  return { ...base, configs: base.configs.filter((c) => c.nom !== nom) }
}

/**
 * Export du carnet : JSON portable (téléchargeable puis réimportable).
 * @param {{texte, configs}} carnet
 * @returns {string} JSON indenté
 */
export function exportCarnet(carnet) {
  return JSON.stringify({ kind: 'carnet-banc-promptologue', ...normalizeCarnet(carnet) }, null, 2)
}

/**
 * Import d'un carnet exporté (remplace le carnet courant).
 * @param {string} jsonText contenu du fichier
 * @returns {{texte, configs}}
 */
export function importCarnet(jsonText) {
  let data
  try {
    data = JSON.parse(jsonText)
  } catch {
    throw new Error('Fichier de carnet illisible : JSON attendu.')
  }
  if (data?.kind !== 'carnet-banc-promptologue') {
    throw new Error('Ce fichier n’est pas un carnet du banc (kind carnet-banc-promptologue attendu).')
  }
  return normalizeCarnet(data)
}
