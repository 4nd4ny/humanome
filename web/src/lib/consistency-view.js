// Rapport de consistance multi-run LISIBLE (P9, cahier §3.3) : transforme la
// sortie de l'engine compareRuns (engine/src/consistency.js) en modèle
// d'affichage — accord global, compétences stables / divergentes avec badges
// par statut, tableau détaillé. Module pur, testé unitairement.

/** Classe de badge par statut de verdict (mêmes classes que DayView). */
export const STATUT_BADGES = Object.freeze({
  'présence établie': 'etablie',
  'renvoi au cartographe': 'renvoi',
  'présence non établie': 'non-etablie',
})

/** Badge d'un statut (null = compétence absente du run ≡ non instruite). */
export function statutBadge(statut) {
  return STATUT_BADGES[statut] ?? 'absente'
}

/** Libellé d'un statut (null = compétence absente du run). */
export function statutLabel(statut) {
  return statut ?? 'non instruite'
}

/**
 * Construit le modèle d'affichage du rapport de consistance.
 *
 * @param {ReturnType<import('@engine/consistency.js').compareRuns>} result
 * @param {{competenceNames?: Record<string, string>}} [options] noms du
 *   référentiel (code -> nom) pour libeller les lignes
 * @returns {{
 *   nbRuns: number,
 *   accordPourcent: number,              // (1 - distanceStructurelle) × 100, arrondi
 *   distanceStructurelle: number,
 *   stables: Array<{code, nom, statut, badge}>,        // établies dans TOUS les runs
 *   divergentes: Array<{code, nom, statuts: Array<{statut, label, badge, runs: number[]}>,
 *     presenteDans: number[], absenteDans: number[]}>,
 *   lignes: Array<{code, nom, statuts: Array<{statut, label, badge}>,
 *     confiances: Array<number|null>, ecartType: number, stable: boolean}>,
 * }}
 */
export function buildConsistencyView(result, options = {}) {
  const names = options.competenceNames ?? {}
  const nameOf = (code) => names[code] ?? null

  const stables = (result.competencesCommunes ?? []).map((code) => ({
    code,
    nom: nameOf(code),
    statut: 'présence établie',
    badge: STATUT_BADGES['présence établie'],
  }))

  const divergentes = (result.competencesDivergentes ?? []).map((entry) => {
    // Regroupe les runs par statut pour un rendu compact : « établie (runs
    // 1, 3) · non établie (run 2) ».
    const parStatut = new Map()
    entry.statuts.forEach((statut, run) => {
      const key = statut ?? null
      if (!parStatut.has(key)) parStatut.set(key, [])
      parStatut.get(key).push(run + 1) // numérotation humaine 1..N
    })
    return {
      code: entry.code,
      nom: nameOf(entry.code),
      statuts: [...parStatut.entries()].map(([statut, runs]) => ({
        statut,
        label: statutLabel(statut),
        badge: statutBadge(statut),
        runs,
      })),
      presenteDans: entry.presenteDans.map((i) => i + 1),
      absenteDans: entry.absenteDans.map((i) => i + 1),
    }
  })

  const lignes = Object.entries(result.parCompetence ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, detail]) => {
      const statuts = detail.statuts.map((statut) => ({
        statut,
        label: statutLabel(statut),
        badge: statutBadge(statut),
      }))
      const distinct = new Set(detail.statuts.map((s) => s ?? null))
      return {
        code,
        nom: nameOf(code),
        statuts,
        confiances: detail.confiances,
        ecartType: detail.ecartType,
        stable: distinct.size === 1,
      }
    })

  return {
    nbRuns: result.nbRuns,
    accordPourcent: Math.round((1 - result.distanceStructurelle) * 100),
    distanceStructurelle: result.distanceStructurelle,
    stables,
    divergentes,
    lignes,
  }
}
