// humanome engine — consistance multi-run (plan-portage-moteur §Consistance ;
// base cartographe §3.3 / promptologue §3.4) : N runs du MÊME prompt sur le
// MÊME portfolio → où les runs s'accordent, où ils divergent, à quelle distance.
//
// Module ESM pur : zéro DOM, zéro E/S.

const STATUT_ETABLIE = 'présence établie'
const STATUT_NON_ETABLIE = 'présence non établie'
const STATUT_RENVOI = 'renvoi au cartographe'

// Distance élémentaire entre deux statuts (voir doc de distanceStructurelle).
// L'échelle ordinale observée est : non établie < renvoi au cartographe < établie.
// Une compétence ABSENTE d'un run (non instruite) est assimilée à « présence
// non établie » — c'est ce que fait le merge (presence non triée).
const RANKS = {
  [STATUT_NON_ETABLIE]: 0,
  [STATUT_RENVOI]: 1,
  [STATUT_ETABLIE]: 2,
}

function statutRank(statut) {
  return RANKS[statut] ?? 0
}

/** Distance 0..1 entre deux statuts : |écart de rang| / 2 (0, 0.5 ou 1). */
export function statutDistance(a, b) {
  return Math.abs(statutRank(a) - statutRank(b)) / 2
}

/** Écart-type (population) ; 0 si moins de 2 valeurs. */
function ecartType(values) {
  if (values.length < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/** Index code compétence → verdict pour un document cartographie-jour. */
function indexVerdicts(doc, i) {
  if (!Array.isArray(doc?.poles)) {
    throw new TypeError(`compareRuns : docs[${i}] n'est pas un document cartographie-jour (poles[] manquant)`)
  }
  const map = new Map()
  for (const pole of doc.poles) {
    for (const comp of pole.competences ?? []) {
      map.set(comp.code, comp.verdict ?? null)
    }
  }
  return map
}

/**
 * Compare N runs de cartographie de la MÊME journée (documents
 * `cartographie-jour` produits par des runs indépendants).
 *
 * « Présente » dans un run = verdict au statut « présence établie ».
 *
 * distanceStructurelle (0..1, documentée) : moyenne, sur l'union des codes de
 * compétences et sur toutes les paires de runs, de la distance élémentaire
 * entre statuts — 0 si mêmes statuts, 0.5 entre « renvoi au cartographe » et
 * l'un des deux autres statuts, 1 entre « présence établie » et « présence non
 * établie » (échelle ordinale non établie < renvoi < établie ; compétence
 * absente d'un run ≡ « présence non établie »). 0 = runs structurellement
 * identiques (accord parfait des statuts), 1 = désaccord maximal partout.
 *
 * @param {Array<object>} docs au moins 2 documents `cartographie-jour`
 * @returns {{
 *   nbRuns: number,
 *   competencesCommunes: string[],       // établies dans TOUS les runs
 *   competencesDivergentes: Array<{code: string, statuts: Array<string|null>,
 *     presenteDans: number[], absenteDans: number[]}>, // établies dans certains runs seulement
 *   distanceStructurelle: number,
 *   parCompetence: Record<string, {statuts: Array<string|null>,
 *     confiances: Array<number|null>, ecartType: number}>
 * }}
 */
export function compareRuns(docs) {
  if (!Array.isArray(docs) || docs.length < 2) {
    throw new TypeError('compareRuns : au moins 2 documents cartographie-jour requis')
  }
  const indexes = docs.map((doc, i) => indexVerdicts(doc, i))
  const codes = [...new Set(indexes.flatMap((m) => [...m.keys()]))].sort()

  const parCompetence = {}
  const competencesCommunes = []
  const competencesDivergentes = []
  let distanceSum = 0
  let distanceCount = 0

  for (const code of codes) {
    const verdicts = indexes.map((m) => m.get(code) ?? null)
    const statuts = verdicts.map((v) => v?.statut ?? null)
    const confiances = verdicts.map((v) => (typeof v?.confiance === 'number' ? v.confiance : null))

    parCompetence[code] = {
      statuts,
      confiances,
      ecartType: ecartType(confiances.filter((c) => c !== null)),
    }

    const presenteDans = []
    const absenteDans = []
    statuts.forEach((s, i) => (s === STATUT_ETABLIE ? presenteDans : absenteDans).push(i))
    if (absenteDans.length === 0) {
      competencesCommunes.push(code)
    } else if (presenteDans.length > 0) {
      competencesDivergentes.push({ code, statuts, presenteDans, absenteDans })
    }

    for (let i = 0; i < statuts.length; i++) {
      for (let j = i + 1; j < statuts.length; j++) {
        distanceSum += statutDistance(statuts[i], statuts[j])
        distanceCount += 1
      }
    }
  }

  return {
    nbRuns: docs.length,
    competencesCommunes,
    competencesDivergentes,
    distanceStructurelle: distanceCount > 0 ? distanceSum / distanceCount : 0,
    parCompetence,
  }
}
