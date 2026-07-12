// humanome sunburst lib — tree builders.
//
// buildMergeTree() is a port of generateData() from
// assets-existants/merge-prototype/cartographie.html (l.765-836), fed by a
// `cartographie-merge` document instead of the legacy global `domainsData`
// (mergeDoc.domains is the verbatim copy of that constant, docs/contrats.md §2.1).
//
// buildDayTree() builds a tree of the SAME SHAPE from a `cartographie-jour`
// document, following the visual mapping of docs/plan-fusion-visu.md §Vue Journée.
// DOM-free ESM module.

/**
 * Quintile mapping of verdict.confiance (0..1) to a niveau (1..5):
 * [0, 0.2) -> 1, [0.2, 0.4) -> 2, [0.4, 0.6) -> 3, [0.6, 0.8) -> 4, [0.8, 1] -> 5.
 * Clamped to 1..5 (confiance = 1 stays in the fifth quintile).
 */
export function confidenceQuintile(confiance) {
  return Math.min(5, Math.max(1, Math.floor(confiance * 5) + 1))
}

/**
 * Build the sunburst tree of a `cartographie-merge` document:
 * root -> 7 poles -> established competences.
 * Exact port of generateData() (l.765-836) — same fields, same accumulations.
 * Returns `{ root }` (the original return shape) or null when the document
 * carries no domains (mirror of the original guard on `domainsData`).
 */
export function buildMergeTree(mergeDoc) {
  const domainsData = mergeDoc && mergeDoc.domains
  if (!Array.isArray(domainsData)) return null

  const rootNode = {
    id: 'Compétences RESPIRE',
    parent: null,
    children: [],
    isLeaf: false,
    niveau: 0,
    points: 0,
  }

  domainsData.forEach((domain) => {
    const dNode = {
      id: domain.id,
      parent: rootNode,
      color: domain.color,
      rapport_html: domain.rapport_html || '',
      children: [],
      isLeaf: false,
      points: 0,
      niveau: 0,
      niveau_moyen: 0,
      // v3: temporal trend of the pole (title + description kept separate)
      tendance_temporelle: domain.tendance_temporelle || null,
      tendance_titre: domain.tendance_titre || '',
      tendance_description: domain.tendance_description || '',
      tendance_stats: domain.tendance_stats || null,
    }

    domain.competences.forEach((comp) => {
      const cNode = {
        id: comp.id,
        parent: dNode,
        points: comp.points,
        niveau: comp.niveau,
        statut: comp.statut || 'présence établie',
        code: comp.code || '',
        description: comp.description,
        feedback: comp.feedback,
        temporal: comp.temporal || null,
        deliberation: comp.deliberation || null,
        color: domain.color,
        children: [],
        isLeaf: true,
        // v3: qualitative archetype (title + description kept separate)
        archetype: comp.archetype || null,
        archetype_titre: comp.archetype_titre || '',
        archetype_description: comp.archetype_description || '',
      }
      dNode.children.push(cNode)
      dNode.points += cNode.points
      dNode.niveau = Math.max(dNode.niveau, Math.abs(cNode.niveau))
    })

    // Average niveau: mean of positive niveaux (established or orphan
    // competences). Renvois (niveau = -1) are left out.
    const positifs = dNode.children.filter((c) => c.niveau > 0)
    if (positifs.length > 0) {
      const sum = positifs.reduce((s, c) => s + c.niveau, 0)
      dNode.niveau_moyen = sum / positifs.length
    }

    rootNode.children.push(dNode)
    rootNode.points += dNode.points
  })

  return { root: rootNode }
}

/**
 * Build the sunburst tree of a `cartographie-jour` document (same shape as
 * buildMergeTree's) plus the competences excluded from the diagram.
 * Mapping (docs/plan-fusion-visu.md §Vue Journée, docs/contrats.md):
 * - angular width (points) = nombrePreuves*2 + nombreIndices, floored at 1;
 * - niveau = quintile of verdict.confiance (1..5) for 'présence établie';
 * - 'renvoi au cartographe' -> niveau = -1 (hatched, RENVOI_RADIUS_FACTOR);
 * - court-circuits and 'présence non établie' are EXCLUDED from the diagram
 *   and returned apart in `exclus`.
 * Pole colors and competence names come from the `referentiel` document.
 * Returns { tree: { root }, exclus: { nonEtablies: [], courtCircuits: [] } }.
 */
export function buildDayTree(dayDoc, referentiel) {
  const polesByNum = new Map(referentiel.poles.map((p) => [String(p.num), p]))
  const compsByCode = new Map(referentiel.competences.map((c) => [c.code, c]))

  const rootNode = {
    id: 'Compétences RESPIRE',
    parent: null,
    children: [],
    isLeaf: false,
    niveau: 0,
    points: 0,
  }
  const exclus = { nonEtablies: [], courtCircuits: [] }

  dayDoc.poles.forEach((pole) => {
    const refPole = polesByNum.get(String(pole.poleNum))
    const dNode = {
      id: refPole ? refPole.nom : `Pôle ${pole.poleNum}`,
      poleNum: pole.poleNum,
      parent: rootNode,
      color: refPole ? refPole.couleur : '#94a3b8',
      rapport_html: '',
      children: [],
      isLeaf: false,
      points: 0,
      niveau: 0,
      niveau_moyen: 0,
    }

    pole.competences.forEach((comp) => {
      const refComp = compsByCode.get(comp.code)
      const nom = refComp ? refComp.nom : comp.code
      const verdict = comp.verdict
      // Excluded from the diagram, listed apart (pole panel).
      if (comp.courtCircuit) {
        exclus.courtCircuits.push({ code: comp.code, nom, poleNum: pole.poleNum, statut: verdict.statut, verdict })
        return
      }
      if (verdict.statut === 'présence non établie') {
        exclus.nonEtablies.push({ code: comp.code, nom, poleNum: pole.poleNum, statut: verdict.statut, verdict })
        return
      }

      const cNode = {
        id: `${comp.code} — ${nom}`,
        parent: dNode,
        points: Math.max(1, verdict.nombrePreuves * 2 + verdict.nombreIndices),
        niveau: verdict.statut === 'renvoi au cartographe' ? -1 : confidenceQuintile(verdict.confiance),
        statut: verdict.statut,
        code: comp.code,
        description: nom,
        confiance: verdict.confiance,
        verdict,
        color: dNode.color,
        children: [],
        isLeaf: true,
      }
      dNode.children.push(cNode)
      dNode.points += cNode.points
      dNode.niveau = Math.max(dNode.niveau, Math.abs(cNode.niveau))
    })

    const positifs = dNode.children.filter((c) => c.niveau > 0)
    if (positifs.length > 0) {
      const sum = positifs.reduce((s, c) => s + c.niveau, 0)
      dNode.niveau_moyen = sum / positifs.length
    }

    rootNode.children.push(dNode)
    rootNode.points += dNode.points
  })

  return { tree: { root: rootNode }, exclus }
}
