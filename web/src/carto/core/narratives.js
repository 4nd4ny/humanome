// Interface ultime — textes de synthèse évolutive (spec §6.4).
//
// Un texte évolutif (kairos évolutif, pôle évolutif, compétence évolutive)
// a été écrit pour UN ensemble de journées (son ensemble source). Il ne
// s'affiche que si cet ensemble est exactement celui de l'état affiché ; sinon
// il est masqué avec un message, et reste en base locale.

/** Deux listes de dates désignent-elles le même ensemble ? */
export function sameDates(a, b) {
  const sa = new Set(a ?? [])
  const sb = new Set(b ?? [])
  if (sa.size !== sb.size) return false
  for (const d of sa) if (!sb.has(d)) return false
  return true
}

function scopeMatches(n, scope) {
  if (scope.code !== undefined) return n.scope?.code === scope.code
  if (scope.pole !== undefined) return Number(n.scope?.pole) === Number(scope.pole)
  return true
}

/**
 * Textes évolutifs d'une portée, avec leur visibilité pour l'état affiché.
 * @param {object} dataset
 * @param {'competence-evolutive' | 'pole-evolutif' | 'kairos-evolutif'} kind
 * @param {{code?: string, pole?: number}} scope
 * @param {string[]} shownDates journées qui fondent l'état affiché (state.dates)
 * @returns {Array<{narrative: object, visible: boolean, sourceCount: number, shownCount: number, from: string | null, to: string | null}>}
 */
export function narrativesFor(dataset, kind, scope, shownDates) {
  return (dataset?.narratives ?? [])
    .filter((n) => n.kind === kind && scopeMatches(n, scope))
    .map((n) => {
      const src = [...new Set(n.sourceDates ?? [])].sort()
      return {
        narrative: n,
        visible: src.length > 0 && sameDates(src, shownDates),
        sourceCount: src.length,
        shownCount: new Set(shownDates).size,
        from: src[0] ?? null,
        to: src.at(-1) ?? null,
      }
    })
}
