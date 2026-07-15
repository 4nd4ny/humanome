// Logique pure du parcours Twin9 (ADR-010) — SANS React, SANS réseau, testée
// à part. Rassemble : dérivation du roster mono-famille, mapping étape→étage,
// calcul du DEVIS à partir des métriques mock, et reconstruction de la liste des
// journées depuis carto_evolutive.json (qui, par contrat, ne porte PAS de tableau
// `journees` — DONNEES.md : « même contenu que CARTO9.competences […] sans les
// journées »). Les journées y sont donc reconstituées depuis les attestations.

// Un collège MONO-FAMILLE (Anthropic seul, ADR-010 §4) mesure la STABILITÉ, pas
// la diversité : on lit le même modèle en plusieurs passes décorrélées. Il n'y a
// PAS de champ config.json pour ce nombre (les passes sont par-modèle dans
// models.json, non exposé au front) — c'est donc une décision client, ici fixée.
export const PASSES_TAGGERS = 3

// Sel FIXE du devis : le mock est déterministe, le devis doit être reproductible
// et surtout produire le MÊME graphe d'appels que le run réel (mêmes décisions de
// routage) — d'où roster/config/salt identiques entre devis et lancement.
export const SALT_DEVIS = 'twin9-devis'

/**
 * Roster à injecter dans le moteur, dérivé du modèle choisi. Mono-famille
 * Anthropic, `passes` lectures décorrélées. Forme = models.json ({modeles:[…]}).
 * @param {string} modeleId
 * @param {number} [passes]
 */
export function rosterFromModele(modeleId, passes = PASSES_TAGGERS) {
  return {
    modeles: [
      {
        name: modeleId,
        kind: 'anthropic',
        model: modeleId,
        family: 'anthropic',
        enabled: true,
        passes,
      },
    ],
  }
}

/**
 * Trois étages de facturation (ADR-010 / config.json) : TAGGERS (collège v8),
 * RAPIDE (lecteur, greffier, juge léger, gardien) et TRIBUNAL (arène, jurés,
 * président, second ressort, relectures, scan global). `metrics.par_etape` du
 * moteur est indexé par ÉTAPE ; on la replie sur son étage de coût.
 * @param {string} etape clé de metrics.par_etape
 * @returns {'taggers'|'rapide'|'tribunal'}
 */
export function etapeToEtage(etape) {
  switch (etape) {
    case 'tagging':
      return 'taggers'
    case 'premiere-impression':
    case 'instruction-rapide':
      return 'rapide'
    case 'tribunal':
    case 'second-ressort':
    case 'scan-global':
    case 'relectures':
      return 'tribunal'
    default:
      return 'rapide'
  }
}

// Fourchettes HONNÊTES de tokens par appel et par étage [bas, haut] : entrées et
// sorties. Ce sont des estimations (les gabarits réels sont côté serveur, non
// mesurables ici) — le serveur RÉSERVE le pire-cas par appel avant de débiter,
// puis réconcilie aux tokens réels. Le devis n'est donc qu'un ordre de grandeur.
export const ETAGE_TOKENS = {
  taggers: { in: [1200, 2800], out: [300, 900] },
  rapide: { in: [1500, 3800], out: [400, 1200] },
  tribunal: { in: [2500, 6500], out: [700, 2200] },
}

/**
 * Devis en micro-USD à partir des métriques mock (nombre d'appels EXACT par
 * étape) et du tarif MARGÉ du modèle (meta.modeles[id].prix_usd_mtok, en
 * USD/Mtok → 1 token = prix micro-USD). Fourchette bas/haut via ETAGE_TOKENS.
 *
 * @param {Record<string, {appels: number}>} parEtape metrics.par_etape
 * @param {[number, number]} prixUsdMtok [entrée, sortie] déjà margés
 * @returns {{appels: number, basMicrousd: number, hautMicrousd: number,
 *   etages: Array<{etage: string, appels: number, basMicrousd: number, hautMicrousd: number}>}}
 */
export function calculerDevis(parEtape, prixUsdMtok) {
  const [prixIn, prixOut] = prixUsdMtok || [0, 0]
  /** @type {Record<string, {appels: number, basMicrousd: number, hautMicrousd: number}>} */
  const agg = {}
  let appels = 0
  for (const [etape, m] of Object.entries(parEtape || {})) {
    const n = Number(m?.appels) || 0
    if (n <= 0) continue
    appels += n
    const etage = etapeToEtage(etape)
    const bandes = ETAGE_TOKENS[etage]
    const bas = Math.round(n * (bandes.in[0] * prixIn + bandes.out[0] * prixOut))
    const haut = Math.round(n * (bandes.in[1] * prixIn + bandes.out[1] * prixOut))
    const a = agg[etage] || (agg[etage] = { appels: 0, basMicrousd: 0, hautMicrousd: 0 })
    a.appels += n
    a.basMicrousd += bas
    a.hautMicrousd += haut
  }
  const etages = ['taggers', 'rapide', 'tribunal']
    .filter((e) => agg[e])
    .map((e) => ({ etage: e, ...agg[e] }))
  return {
    appels,
    basMicrousd: etages.reduce((s, e) => s + e.basMicrousd, 0),
    hautMicrousd: etages.reduce((s, e) => s + e.hautMicrousd, 0),
    etages,
  }
}

/**
 * Reconstitue la liste chronologique des journées depuis carto_evolutive.json.
 * Chaque compétence porte des `attestations` (présences datées) et des `signaux`
 * (renvois/minoritaires). On regroupe par `jour_index`.
 *
 * @param {object} carto carto_evolutive.json déjà sérialisé en objet plat
 * @returns {Array<{jour_index: number, date: string|null, journee: string|null,
 *   etablies: string[], renvois: string[]}>}
 */
export function journeesDepuisCarto(carto) {
  const competences = carto?.competences || {}
  /** @type {Map<number, {jour_index: number, date: string|null, journee: string|null, etablies: Set<string>, renvois: Set<string>}>} */
  const jours = new Map()
  const ensure = (idx, journee, date) => {
    let e = jours.get(idx)
    if (!e) {
      e = { jour_index: idx, journee: journee ?? null, date: date ?? null, etablies: new Set(), renvois: new Set() }
      jours.set(idx, e)
    }
    if (e.journee == null && journee != null) e.journee = journee
    if (e.date == null && date != null) e.date = date
    return e
  }
  for (const [code, c] of Object.entries(competences)) {
    for (const a of c?.attestations || []) {
      if (typeof a?.jour_index !== 'number') continue
      ensure(a.jour_index, a.journee, a.date).etablies.add(code)
    }
    for (const s of c?.signaux || []) {
      if (typeof s?.jour_index !== 'number') continue
      const e = ensure(s.jour_index, s.journee, null)
      if (String(s?.type || '').includes('renvoi')) e.renvois.add(code)
    }
  }
  return [...jours.values()]
    .sort((a, b) => a.jour_index - b.jour_index)
    .map((e) => ({
      jour_index: e.jour_index,
      date: e.date,
      journee: e.journee,
      etablies: [...e.etablies].sort(),
      renvois: [...e.renvois].sort(),
    }))
}
