// « Cartographie ouverte Twin6 » — mappe la sortie NATIVE de Twin6 (7 `carto_pole`
// produits par 1-scan-pole + 1 `kairos` produit par 2-kairos-final, sur le
// portfolio ENTIER) vers le document `cartographie-merge` du viewer, en
// RÉUTILISANT le pipeline de merge par jour (mergeDays + buildMergeDocument) —
// aucune logique d'agrégation, de quintiles, d'archétypes ou d'ipsatif dupliquée.
//
// Idée clé : un `carto_pole` Twin6 est structurellement un pôle de document-jour
// (poleNum, passagesSaillants[], competences[] avec verdict/pieces/tracesRetenues),
// mais couvre tout le portfolio. Les `passagesSaillants[].feuille` (date d'origine,
// format A1 du prompt) permettent de DÉCOMPOSER chaque `carto_pole` en instantanés
// par feuille : une compétence est « présente » sur la feuille F ssi une de ses
// `tracesRetenues` renvoie (pieceId → pieces[].numero → pid) à un passage de F.
// preuves/indices par feuille = comptage des traces de F par type. Le score, la
// fréquence (nb_feuilles_etablies = « points » du viewer), les niveaux/archétypes,
// l'ipsatif et le kairos sont ensuite calculés par le code de merge déjà testé
// (parité octet sur le corpus réel).
//
// Narratifs : Twin6 ne produit pas d'« histoire d'apprentissage » par compétence
// (contrairement au moteur intégré qui fait 61 appels dédiés). On la SYNTHÉTISE
// depuis la sortie Twin6 elle-même (raisonnement adversarial + prescription),
// SANS appel LLM supplémentaire ; les rapports de pôle et le kairos viennent
// directement de Twin6.
//
// Aucune E/S ici (convention moteur, P5) : entrées pures → document pur.

import { mergeDays } from '../pipeline/merge.js'
import { buildMergeDocument } from '../pipeline/merge-document.js'

const STATUT_ETABLIE = 'présence établie'
const STATUT_RENVOI = 'renvoi au cartographe'
const STATUT_NON_ETABLIE = 'présence non établie'
const TYPE_TRACE_CONCRETE = 'trace concrète'

/** Un `carto_pole` Twin6 restreint aux pièces/traces/passages d'UNE feuille. */
function poleSnapshotForFeuille(cartoPole, feuille) {
  const passages = (cartoPole.passagesSaillants ?? []).filter((p) => p.feuille === feuille)
  const pidsOfFeuille = new Set(passages.map((p) => p.pid))

  const competences = []
  for (const comp of cartoPole.competences ?? []) {
    // Pièces de cette compétence issues d'un passage de CETTE feuille.
    const pieces = (comp.pieces ?? []).filter((pc) => pidsOfFeuille.has(pc.pid))
    const numsOfFeuille = new Set(pieces.map((pc) => pc.numero))
    // Traces retenues rattachées à ces pièces.
    const traces = (comp.tracesRetenues ?? []).filter((t) => numsOfFeuille.has(t.pieceId))
    if (traces.length === 0) continue // compétence absente de cette feuille → non triée

    const preuves = traces.filter((t) => t.type === TYPE_TRACE_CONCRETE).length
    const indices = traces.length - preuves
    const confiance =
      comp.verdict?.confiance ??
      comp.pedagogue?.conclusionAdversariale?.confianceFinale ??
      0
    // On ne « promeut » jamais une feuille au-dessus du verdict global de la
    // compétence (établie / renvoi / non établie).
    const statut =
      comp.verdict?.statut === STATUT_ETABLIE
        ? STATUT_ETABLIE
        : comp.verdict?.statut === STATUT_RENVOI
          ? STATUT_RENVOI
          : STATUT_NON_ETABLIE

    competences.push({
      code: comp.code,
      courtCircuit: false,
      pieces,
      tracesRetenues: traces,
      pedagogue: comp.pedagogue ?? {},
      verdict: {
        statut,
        nombrePreuves: preuves,
        nombreIndices: indices,
        confiance,
        motif: comp.verdict?.motif ?? '',
        prescription: comp.verdict?.prescription ?? '',
      },
    })
  }

  return {
    poleNum: Number(cartoPole.poleNum),
    passagesSaillants: passages,
    competences,
    rapport: cartoPole.rapport ?? {},
    auditPole: cartoPole.auditPole ?? {},
  }
}

/**
 * Narratif « histoire d'apprentissage » d'une compétence, assemblé depuis la
 * sortie Twin6 elle-même (aucun appel LLM en plus) : raisonnement adversarial +
 * motif du verdict + prescription.
 */
function synthCompetenceNarrative(comp) {
  const cc = comp.pedagogue?.conclusionAdversariale ?? {}
  const parts = []
  if (cc.raisonnement) parts.push(cc.raisonnement)
  if (comp.verdict?.motif) parts.push(comp.verdict.motif)
  if (comp.verdict?.prescription) parts.push(`**Piste** : ${comp.verdict.prescription}`)
  return parts.join('\n\n')
}

/**
 * Mappe une sortie Twin6 complète vers un document `cartographie-merge`.
 *
 * @param {Array<object>} cartoPoles objets `carto_pole` (sortie 1-scan-pole), un par pôle.
 * @param {object|null} kairos objet `kairos` (sortie 2-kairos-final) ou null.
 * @param {{competences: Array<{code,nom,pole}>, poles: Array<{num,nom}>}} referentiel
 * @param {object} [meta] { generatedAt, source, journal_id, ... } passé à buildMergeDocument.
 * @returns {object} document `cartographie-merge`.
 */
export function twin6ToMergeDocument(cartoPoles, kairos, referentiel, meta = {}) {
  if (!Array.isArray(cartoPoles) || cartoPoles.length === 0) {
    throw new Error('twin6ToMergeDocument: cartoPoles doit être un tableau non vide')
  }
  if (!referentiel?.competences || !referentiel?.poles) {
    throw new Error('twin6ToMergeDocument: referentiel { competences[], poles[] } requis')
  }

  // 1. Feuilles datées (union des passages de tous les pôles), triées.
  const feuilles = new Set()
  for (const pole of cartoPoles) {
    for (const ps of pole.passagesSaillants ?? []) if (ps.feuille) feuilles.add(ps.feuille)
  }
  const dates = [...feuilles].sort()
  if (dates.length === 0) {
    throw new Error('twin6ToMergeDocument: aucune feuille datée dans les passagesSaillants')
  }

  // 2. Un document-jour par feuille ; le kairos (global) est rattaché au dernier.
  const dayDocs = dates.map((date, di) => {
    const doc = { date, poles: cartoPoles.map((pole) => poleSnapshotForFeuille(pole, date)) }
    if (kairos && di === dates.length - 1) doc.kairos = kairos
    return doc
  })

  // 3. Agrégation par le code de merge déjà testé (parité octet du corpus réel).
  const agrege = mergeDays(dayDocs, referentiel)
  agrege.date_construction = meta.generatedAt ?? null

  // 4. Narratifs — défauts vides pour CHAQUE entrée du référentiel (buildMergeDocument
  //    exige un narratif string par compétence rendue et par pôle), puis on remplace
  //    par le contenu Twin6.
  const narrativeTexts = { competences: {}, poles: {}, kairos: '' }
  for (const c of referentiel.competences) narrativeTexts.competences[c.code] = ''
  for (const p of referentiel.poles) narrativeTexts.poles[String(p.num)] = ''
  narrativeTexts.kairos = kairos?.kairos?.apprenant?.syntheseCompleteMarkdown ?? ''
  for (const pole of cartoPoles) {
    narrativeTexts.poles[String(Number(pole.poleNum))] = pole.rapport?.rapportCompletMarkdown ?? ''
    for (const comp of pole.competences ?? []) {
      narrativeTexts.competences[comp.code] = synthCompetenceNarrative(comp)
    }
  }

  // 5. Document merge final — mêmes niveaux/archétypes/HTML que toute autre carto.
  return buildMergeDocument(agrege, narrativeTexts, meta)
}
