// Faux module sunburst pour les tests des vues : il respecte le CONTRAT
// d'API de web/src/lib/sunburst/ (buildMergeTree, buildDayTree,
// layoutSunburst) sans en importer l'implémentation, développée en parallèle.
// La géométrie est factice ; seuls la forme du retour et les `meta` comptent.

export function buildMergeTree(mergeDoc) {
  return { kind: 'merge-tree', doc: mergeDoc }
}

export function buildDayTree(dayDoc, referentiel) {
  const competences = (dayDoc.poles ?? []).flatMap((p) => p.competences ?? [])
  return {
    tree: { kind: 'day-tree', doc: dayDoc, referentiel },
    exclus: {
      nonEtablies: competences.filter(
        (c) => !c.courtCircuit && c.verdict?.statut === 'présence non établie',
      ),
      courtCircuits: competences.filter((c) => c.courtCircuit),
    },
  }
}

function sector(meta, extra = {}) {
  return { d: 'M 0 0 L 1 1 Z', fill: '#ccc', class: 'sector', meta, ...extra }
}

export function layoutSunburst(tree, { size }) {
  const sectors = []
  if (tree.kind === 'merge-tree') {
    for (const domain of tree.doc.domains ?? []) {
      sectors.push(sector({ kind: 'pole', id: domain.id, domainId: domain.id }))
      for (const competence of domain.competences ?? []) {
        sectors.push(sector({ kind: 'gray', id: `gray-${competence.code}`, niveau: 1 }))
        sectors.push(
          sector({
            kind: 'competence',
            id: competence.id,
            code: competence.code,
            niveau: competence.niveau,
            domainId: domain.id,
          }),
        )
      }
    }
  } else if (tree.kind === 'day-tree') {
    const poleName = (num) =>
      (tree.referentiel?.poles ?? []).find((p) => p.num === num)?.nom ?? String(num)
    for (const pole of tree.doc.poles ?? []) {
      sectors.push(
        sector({ kind: 'pole', id: poleName(pole.poleNum), domainId: pole.poleNum }),
      )
      for (const competence of pole.competences ?? []) {
        const excluded =
          competence.courtCircuit || competence.verdict?.statut === 'présence non établie'
        if (excluded) continue
        sectors.push(
          sector({
            kind: 'competence',
            id: competence.code,
            code: competence.code,
            domainId: pole.poleNum,
          }),
        )
      }
    }
  }
  return { size, cx: size / 2, cy: size / 2, sectors }
}
