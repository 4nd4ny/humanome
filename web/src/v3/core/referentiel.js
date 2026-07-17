// Interface V3 — référentiel externe versionné (spec §6.3, §9.2).
//
// Les JSON historiques ne portent que des codes (« 1.01 ») : les libellés,
// descriptions, ordres et symboles viennent d'un référentiel identifié et
// versionné (le référentiel publié du site, forme respire-v7). Chaque famille
// reçoit un SYMBOLE et un MOTIF stables — la même famille garde le même
// symbole et le même motif dans l'arbre, le soleil, la heatmap, le portfolio
// et l'impression (spec §15.3) : l'identité ne repose jamais sur la seule
// couleur.

/** Symboles et motifs par numéro de famille (stables, jamais recalculés). */
const FAMILY_MARKS = {
  1: { symbol: '●', pattern: 'solid' },
  2: { symbol: '◆', pattern: 'diagonal' },
  3: { symbol: '■', pattern: 'dots' },
  4: { symbol: '▲', pattern: 'cross' },
  5: { symbol: '⬟', pattern: 'horizontal' },
  6: { symbol: '⬢', pattern: 'vertical' },
  7: { symbol: '★', pattern: 'grid' },
}

/**
 * Normalise le référentiel publié du site vers la forme V3.
 *
 * @param {{id?: string, version?: string, poles: Array<{num: number, nom: string, couleur?: string}>,
 *   competences: Array<{code: string, nom: string, pole: number, description?: string}>}} doc
 * @returns {{
 *   id: string, version: string,
 *   families: Array<{id: string, num: number, name: string, color: string, symbol: string, pattern: string, order: number}>,
 *   competencies: Array<{code: string, name: string, familyNum: number, description: string, order: number}>,
 *   familyByNum: Map<number, object>, competencyByCode: Map<string, object>,
 * }}
 */
export function normalizeReferential(doc) {
  if (!doc || !Array.isArray(doc.poles) || !Array.isArray(doc.competences)) {
    throw new Error('Référentiel invalide : { poles[], competences[] } requis')
  }
  const families = [...doc.poles]
    .sort((a, b) => a.num - b.num)
    .map((p, i) => ({
      id: `family-${p.num}`,
      num: p.num,
      name: p.nom,
      color: p.couleur ?? '#6b7280',
      symbol: FAMILY_MARKS[p.num]?.symbol ?? '○',
      pattern: FAMILY_MARKS[p.num]?.pattern ?? 'solid',
      order: i,
    }))
  const competencies = [...doc.competences]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((c, i) => ({
      code: c.code,
      name: c.nom,
      familyNum: Number(c.pole),
      description: c.description ?? '',
      order: i,
    }))
  return {
    id: doc.id ?? 'referentiel-inconnu',
    version: doc.version ?? 'version-inconnue',
    families,
    competencies,
    familyByNum: new Map(families.map((f) => [f.num, f])),
    competencyByCode: new Map(competencies.map((c) => [c.code, c])),
  }
}

/**
 * Projection publique du référentiel pour un instantané employeur : seules les
 * familles et compétences RÉFÉRENCÉES par la projection sont exportées.
 * @param {ReturnType<typeof normalizeReferential>} referential
 * @param {Set<string>} usedCodes
 */
export function referentialForShare(referential, usedCodes) {
  const competencies = referential.competencies
    .filter((c) => usedCodes.has(c.code))
    .map(({ code, name, familyNum, order }) => ({ code, name, familyNum, order }))
  const usedFamilies = new Set(competencies.map((c) => c.familyNum))
  const families = referential.families
    .filter((f) => usedFamilies.has(f.num))
    .map(({ id, num, name, color, symbol, pattern, order }) => ({ id, num, name, color, symbol, pattern, order }))
  return { id: referential.id, version: referential.version, families, competencies }
}
