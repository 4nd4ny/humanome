// Comparaison côte à côte de deux cartographies d'un même apprenant (P9,
// cahier §3.3 — versions de prompts différentes) : modèle du tableau des
// divergences par compétence (statut / niveau / points ; confiance pour les
// documents jour). Module pur, testé unitairement.

/** Champs comparés, dans l'ordre d'affichage. */
export const COMPARE_FIELDS = Object.freeze(['statut', 'niveau', 'points', 'confiance'])

/**
 * Extrait, par code de compétence, les valeurs comparables d'un document
 * cartographie (jour OU merge).
 * @param {object} doc
 * @returns {Map<string, {statut: string|null, niveau: number|null,
 *   points: number|null, confiance: number|null}>}
 */
export function extractComparable(doc) {
  const map = new Map()
  if (doc?.kind === 'cartographie-jour') {
    for (const pole of doc.poles ?? []) {
      for (const comp of pole.competences ?? []) {
        map.set(comp.code, {
          statut: comp.verdict?.statut ?? null,
          niveau: null,
          points: null,
          confiance: typeof comp.verdict?.confiance === 'number' ? comp.verdict.confiance : null,
        })
      }
    }
  } else if (doc?.kind === 'cartographie-merge') {
    for (const domain of doc.domains ?? []) {
      for (const comp of domain.competences ?? []) {
        map.set(comp.code, {
          statut: comp.statut ?? null,
          niveau: typeof comp.niveau === 'number' ? comp.niveau : null,
          points: typeof comp.points === 'number' ? comp.points : null,
          confiance: typeof comp.confiance_moyenne === 'number' ? comp.confiance_moyenne : null,
        })
      }
    }
  }
  return map
}

const EMPTY = Object.freeze({ statut: null, niveau: null, points: null, confiance: null })

/**
 * Compare deux cartographies : une ligne par compétence (union des codes),
 * champs divergents identifiés pour le surlignage.
 *
 * @param {object} docA
 * @param {object} docB
 * @returns {{
 *   rows: Array<{code: string, a: object, b: object, divergent: boolean,
 *     champs: string[]}>,
 *   nbDivergences: number,
 *   nbCompetences: number,
 * }}
 */
export function compareCartographies(docA, docB) {
  const a = extractComparable(docA)
  const b = extractComparable(docB)
  const codes = [...new Set([...a.keys(), ...b.keys()])].sort()

  const rows = codes.map((code) => {
    const va = a.get(code) ?? EMPTY
    const vb = b.get(code) ?? EMPTY
    const champs = COMPARE_FIELDS.filter((field) => {
      const fa = va[field]
      const fb = vb[field]
      if (fa === null && fb === null) return false // champ absent des deux documents
      return fa !== fb
    })
    return { code, a: va, b: vb, divergent: champs.length > 0, champs }
  })

  return {
    rows,
    nbDivergences: rows.filter((r) => r.divergent).length,
    nbCompetences: rows.length,
  }
}
