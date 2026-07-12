// Étage A — merge numérique (P5/M4, plan-portage-moteur.md).
//
// Rétro-conception du pipeline Python `carto_merge.py` (non disponible) depuis
// son artefact réel `assets-existants/merge-prototype/intermediate/carto_merge.json`
// (oracle, parité 100 % vérifiée par scripts/parity/parity-merge.mjs sur les
// 59 journées réelles).
//
// Formules découvertes (toutes vérifiées champ par champ contre l'oracle) :
//
// - score d'une feuille pour une compétence :
//     score = round(preuves + indices × confiance, 2)
// - agrégats par compétence, calculés sur les SEULES feuilles « présence établie » :
//     cumul_preuves / cumul_indices = sommes sur les feuilles établies
//     confiance_moyenne = round(moyenne des confiances établies, 4)   (0 si aucune)
//     score = round(cumul_preuves + cumul_indices × confiance_moyenne, 2)
//       (avec confiance_moyenne DÉJÀ arrondie à 4 décimales)
//     score_moyen_par_feuille = round(score / nb_feuilles_etablies, 4) (0 si aucune)
//     statut_final = « présence établie » si ≥ 1 feuille établie, sinon
//       « présence non établie » (« renvoi au cartographe » jamais observé en
//       statut final dans le corpus ; règle de déclenchement indécidable — documenté)
// - compétence absente d'un pôle d'une journée (9 cas réels le 2026-03-26) :
//     entrée synthétique { statut: « présence non établie », court_circuit: true,
//     confiance: 0, motif: « Compétence non triée pour cette feuille (court-circuit). »,
//     prescription: '', traces: [], pieces: [] } SANS clé pedagogue
// - pedagogue null (court-circuits et 40 cas hors court-circuit) → {} dans le merge
// - verdict court-circuit (raison/prescriptionMinimale) → motif: '', prescription: ''
// - enrichissement des pièces (jointure pid → passagesSaillants du pôle) :
//     extraitVerbatim = pièce si présent, sinon passage, sinon ''
//     auteur          = pièce si présent, sinon passage, sinon ''
// - enrichissement des traces (jointure pieceId → pieces[].numero puis pid →
//   passage) : { pieceId, pidPassage: pièce.pid (null si pièce introuvable),
//     type, role, extraitVerbatim: PASSAGE (pas la pièce), contexte: pièce,
//     auteur: pièce enrichie } ('' à défaut de chaque champ)
// - par pôle : score_cumule = round(Σ scores arrondis des compétences du pôle, 2) ;
//     evolution_par_feuille[].score = round(Σ scores des présences ÉTABLIES du jour, 2)
// - ipsatif : proportions = round(score / Σ tous les scores arrondis, 4) ;
//     Herfindahl = round(Σ (score_i / total)², 4) sur les scores de compétences
//     (zéro si total nul) — idem par feuille sur les scores établis du jour
// - arrondis : round() de Python 3 = arrondi décimal de la valeur binaire exacte,
//     demi vers le pair (banker's rounding) — reproduit par pythonRound() ci-dessous
//     (Math.round(x·10^n)/10^n diverge réellement sur le corpus : 1 cas à 4 décimales).
//
// Le moteur ne lit ni n'écrit rien lui-même (P5) : les documents jour et le
// référentiel sont fournis par l'appelant.

const STATUT_ETABLIE = 'présence établie'
const STATUT_RENVOI = 'renvoi au cartographe'
const STATUT_NON_ETABLIE = 'présence non établie'
const MOTIF_NON_TRIEE = 'Compétence non triée pour cette feuille (court-circuit).'

/**
 * Arrondi décimal « à la Python 3 » : arrondit la valeur binaire exacte du
 * double à `ndigits` décimales, demi vers le chiffre pair. Nécessaire pour la
 * parité : Math.round(x·10^n)/10^n réintroduit une erreur binaire au moment de
 * la multiplication (ex. round(5.17/8, 4) = 0.6462 en Python, 0.6463 via
 * Math.round).
 * @param {number} x
 * @param {number} ndigits
 * @returns {number}
 */
export function pythonRound (x, ndigits) {
  if (!Number.isFinite(x)) return x
  const neg = x < 0
  const abs = Math.abs(x)
  // toFixed(n) tronque/arrondit sur l'expansion décimale EXACTE du double ;
  // avec 60 décimales supplémentaires on capture l'expansion complète pour
  // les ordres de grandeur du corpus (< 10^5).
  const s = abs.toFixed(Math.min(100, ndigits + 60))
  const dot = s.indexOf('.')
  const digits = s.replace('.', '')
  const keep = dot + ndigits
  const head = digits.slice(0, keep) || '0'
  const tail = digits.slice(keep)
  let roundUp = false
  if (tail.length > 0) {
    if (tail[0] > '5') roundUp = true
    else if (tail[0] === '5') {
      if (/[1-9]/.test(tail.slice(1))) roundUp = true
      else roundUp = parseInt(head[head.length - 1] || '0', 10) % 2 === 1
    }
  }
  let n = BigInt(head)
  if (roundUp) n += 1n
  const out = n.toString().padStart(ndigits + 1, '0')
  const intPart = out.slice(0, out.length - ndigits) || '0'
  const frac = ndigits > 0 ? out.slice(out.length - ndigits) : ''
  const val = parseFloat(frac ? `${intPart}.${frac}` : intPart)
  return neg ? -val : val
}

/**
 * Score d'une feuille pour une compétence.
 * @param {number} preuves @param {number} indices @param {number} confiance
 */
export function feuilleScore (preuves, indices, confiance) {
  return pythonRound(preuves + indices * confiance, 2)
}

/**
 * Enrichit les pièces d'une compétence par jointure pid → passagesSaillants du pôle.
 * @param {Array<object>} pieces
 * @param {Map<*, object>} passagesByPid
 */
function enrichPieces (pieces, passagesByPid) {
  return (pieces ?? []).map(piece => {
    const passage = passagesByPid.get(piece.pid)
    return {
      ...piece,
      extraitVerbatim: piece.extraitVerbatim ?? passage?.extraitVerbatim ?? '',
      auteur: piece.auteur ?? passage?.auteur ?? ''
    }
  })
}

/**
 * Enrichit les traces retenues par jointure pieceId → pieces[].numero puis
 * pid → passagesSaillants. `extraitVerbatim` vient du PASSAGE (pas de la
 * pièce : vérifié sur les 15 cas du corpus où les deux textes divergent),
 * `contexte` de la pièce, `auteur` de la pièce enrichie.
 * @param {Array<object>} traces
 * @param {Map<*, object>} piecesByNumero pièces déjà enrichies
 * @param {Map<*, object>} passagesByPid
 */
function enrichTraces (traces, piecesByNumero, passagesByPid) {
  return (traces ?? []).map(trace => {
    const piece = piecesByNumero.get(trace.pieceId)
    const passage = piece ? passagesByPid.get(piece.pid) : undefined
    return {
      pieceId: trace.pieceId,
      pidPassage: piece?.pid ?? null,
      type: trace.type,
      role: trace.role,
      extraitVerbatim: passage?.extraitVerbatim ?? piece?.extraitVerbatim ?? '',
      contexte: piece?.contexte ?? '',
      auteur: piece?.auteur ?? ''
    }
  })
}

/** Entrée de présence pour une compétence trouvée dans le document jour. */
function presenceFromCompetence (date, comp, passagesByPid) {
  const verdict = comp.verdict ?? {}
  const preuves = verdict.nombrePreuves ?? 0
  const indices = verdict.nombreIndices ?? 0
  const confiance = verdict.confiance ?? 0
  const pieces = enrichPieces(comp.pieces, passagesByPid)
  const piecesByNumero = new Map(pieces.map(p => [p.numero, p]))
  return {
    date,
    statut: verdict.statut,
    court_circuit: comp.courtCircuit,
    preuves,
    indices,
    confiance,
    score: feuilleScore(preuves, indices, confiance),
    motif: verdict.motif ?? '',
    prescription: verdict.prescription ?? '',
    traces: enrichTraces(comp.tracesRetenues, piecesByNumero, passagesByPid),
    pieces,
    pedagogue: comp.pedagogue ?? {}
  }
}

/** Entrée synthétique pour une compétence absente de la journée (non triée). */
function presenceNonTriee (date) {
  return {
    date,
    statut: STATUT_NON_ETABLIE,
    court_circuit: true,
    preuves: 0,
    indices: 0,
    confiance: 0,
    score: 0,
    motif: MOTIF_NON_TRIEE,
    prescription: '',
    traces: [],
    pieces: []
    // pas de clé pedagogue (conforme à l'oracle)
  }
}

/** Entrée de rapports_par_feuille d'un pôle (défauts si rapport null/absent). */
function rapportEntry (date, pole) {
  const rapport = pole?.rapport ?? {}
  return {
    date,
    rapportCompletMarkdown: rapport.rapportCompletMarkdown ?? '',
    portraitPole: rapport.portraitPole ?? '',
    territoiresDenses: rapport.territoiresDenses ?? [],
    territoiresNonVisites: rapport.territoiresNonVisites ?? '',
    emergencesPole: rapport.emergencesPole ?? '',
    pistes: rapport.pistes ?? [],
    passagesSaillants: pole?.passagesSaillants ?? [],
    auditPole: pole?.auditPole ?? {}
  }
}

/**
 * Merge numérique chronologique de N documents `cartographie-jour`.
 *
 * @param {Array<object>} dayDocs documents `cartographie-jour` (ordre libre,
 *   re-triés par date croissante)
 * @param {object} referentiel document `referentiel` (respire-v7) : fournit
 *   nom et pôle de chaque compétence, et le nom de chaque pôle
 * @returns {{version: string, periode: object, agrege: object}} agrégats au
 *   format de `carto_merge.json` (sans `date_construction` ni la recopie
 *   `feuilles{}` des entrées, volontairement exclues — cf. docs/contrats.md)
 */
export function mergeDays (dayDocs, referentiel) {
  if (!Array.isArray(dayDocs) || dayDocs.length === 0) {
    throw new Error('mergeDays: dayDocs must be a non-empty array')
  }
  if (!referentiel?.competences || !referentiel?.poles) {
    throw new Error('mergeDays: referentiel with competences[] and poles[] is required')
  }

  const days = [...dayDocs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const dates = days.map(d => d.date)
  const refComps = [...referentiel.competences].sort((a, b) => (a.code < b.code ? -1 : 1))
  const poleNoms = new Map(referentiel.poles.map(p => [p.num, p.nom]))

  // Index par journée : code compétence → { comp, passagesByPid }, et pôle num → pôle brut.
  const byDay = new Map()
  for (const day of days) {
    const comps = new Map()
    const poles = new Map()
    for (const pole of day.poles ?? []) {
      poles.set(Number(pole.poleNum), pole)
      const passagesByPid = new Map((pole.passagesSaillants ?? []).map(ps => [ps.pid, ps]))
      for (const comp of pole.competences ?? []) comps.set(comp.code, { comp, passagesByPid })
    }
    byDay.set(day.date, { day, comps, poles })
  }

  // --- par_competence -----------------------------------------------------
  const parCompetence = {}
  for (const ref of refComps) {
    const presences = dates.map(date => {
      const found = byDay.get(date).comps.get(ref.code)
      return found
        ? presenceFromCompetence(date, found.comp, found.passagesByPid)
        : presenceNonTriee(date)
    })
    const etablies = presences.filter(p => p.statut === STATUT_ETABLIE)
    const cumulPreuves = etablies.reduce((s, p) => s + p.preuves, 0)
    const cumulIndices = etablies.reduce((s, p) => s + p.indices, 0)
    const confianceMoyenne = etablies.length
      ? pythonRound(etablies.reduce((s, p) => s + p.confiance, 0) / etablies.length, 4)
      : 0
    const score = pythonRound(cumulPreuves + cumulIndices * confianceMoyenne, 2)
    parCompetence[ref.code] = {
      code: ref.code,
      nom: ref.nom,
      pole: ref.pole,
      cumul_preuves: cumulPreuves,
      cumul_indices: cumulIndices,
      confiance_moyenne: confianceMoyenne,
      score,
      score_moyen_par_feuille: etablies.length ? pythonRound(score / etablies.length, 4) : 0,
      statut_final: etablies.length > 0 ? STATUT_ETABLIE : STATUT_NON_ETABLIE,
      nb_feuilles_etablies: etablies.length,
      nb_feuilles_renvois: presences.filter(p => p.statut === STATUT_RENVOI).length,
      nb_feuilles_non_etablies: presences.filter(p => p.statut === STATUT_NON_ETABLIE).length,
      presence_par_feuille: presences
    }
  }

  // --- par_pole -------------------------------------------------------------
  const parPole = {}
  for (const [num, nom] of poleNoms) {
    const compsOfPole = refComps.filter(c => c.pole === num).map(c => parCompetence[c.code])
    const evolution = dates.map((date, di) => {
      let score = 0
      let etablies = 0
      let renvois = 0
      for (const comp of compsOfPole) {
        const p = comp.presence_par_feuille[di]
        if (p.statut === STATUT_ETABLIE) { etablies++; score += p.score }
        else if (p.statut === STATUT_RENVOI) renvois++
      }
      return { date, score: pythonRound(score, 2), etablies, renvois }
    })
    parPole[String(num)] = {
      pole_num: num,
      pole_nom: nom,
      score_cumule: pythonRound(compsOfPole.reduce((s, c) => s + c.score, 0), 2),
      competences_etablies: compsOfPole.filter(c => c.statut_final === STATUT_ETABLIE).length,
      competences_renvoyees: compsOfPole.filter(c => c.statut_final === STATUT_RENVOI).length,
      evolution_par_feuille: evolution,
      rapports_par_feuille: dates.map(date => rapportEntry(date, byDay.get(date).poles.get(num)))
    }
  }

  // --- global ---------------------------------------------------------------
  const kairosParFeuille = dates.map(date => ({
    date,
    ...(byDay.get(date).day.kairos?.kairos?.apprenant ?? {})
  }))
  const emergences = {
    competences_orphelines: [],
    connexions_transversales: [],
    noeuds_conceptuels: []
  }
  const emergenceMapping = [
    ['competencesOrphelines', 'competences_orphelines'],
    ['connexionsTransversales', 'connexions_transversales'],
    ['noeudsConceptuels', 'noeuds_conceptuels']
  ]
  for (const date of dates) {
    const cross = byDay.get(date).day.kairos?.emergencesCrossPoles ?? {}
    for (const [src, dst] of emergenceMapping) {
      for (const entry of cross[src] ?? []) {
        emergences[dst].push({ ...entry, source_journal: date })
      }
    }
  }

  // --- ipsatif ----------------------------------------------------------------
  const allComps = Object.values(parCompetence)
  const scoreTotalRaw = allComps.reduce((s, c) => s + c.score, 0)
  const etabliesComps = allComps.filter(c => c.statut_final === STATUT_ETABLIE)

  const ipsatifParPole = {}
  for (const [num, nom] of poleNoms) {
    const pole = parPole[String(num)]
    const compsEtablies = etabliesComps
      .filter(c => c.pole === num)
      .sort((a, b) => b.score - a.score)
    ipsatifParPole[String(num)] = {
      pole_num: num,
      pole_nom: nom,
      score_cumule: pole.score_cumule,
      proportion_globale: scoreTotalRaw > 0 ? pythonRound(pole.score_cumule / scoreTotalRaw, 4) : 0,
      competences_etablies: pole.competences_etablies,
      competences: compsEtablies.map(c => ({
        code: c.code,
        nom: c.nom,
        score: c.score,
        proportion_globale: scoreTotalRaw > 0 ? pythonRound(c.score / scoreTotalRaw, 4) : 0,
        proportion_intra_pole: pole.score_cumule > 0 ? pythonRound(c.score / pole.score_cumule, 4) : 0
      }))
    }
  }

  const top5 = [...etabliesComps]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(c => ({
      code: c.code,
      nom: c.nom,
      pole: c.pole,
      score: c.score,
      proportion: scoreTotalRaw > 0 ? pythonRound(c.score / scoreTotalRaw, 4) : 0
    }))

  const herfindahlGlobal = scoreTotalRaw > 0
    ? pythonRound(allComps.reduce((s, c) => s + (c.score / scoreTotalRaw) ** 2, 0), 4)
    : 0

  const evolutionGlobale = dates.map((date, di) => {
    let etablies = 0
    let renvois = 0
    let nonEtablies = 0
    const dayScores = []
    for (const comp of allComps) {
      const p = comp.presence_par_feuille[di]
      if (p.statut === STATUT_ETABLIE) { etablies++; dayScores.push(p.score) }
      else if (p.statut === STATUT_RENVOI) renvois++
      else nonEtablies++
    }
    const total = dayScores.reduce((s, x) => s + x, 0)
    return {
      date,
      score_total: pythonRound(total, 2),
      etablies,
      renvois,
      non_etablies: nonEtablies,
      herfindahl: total > 0
        ? pythonRound(dayScores.reduce((s, x) => s + (x / total) ** 2, 0), 4)
        : 0
    }
  })

  return {
    version: 'merge-v1',
    periode: {
      premiere: dates[0],
      derniere: dates[dates.length - 1],
      nb_feuilles: dates.length,
      feuilles_chronologiques: dates
    },
    agrege: {
      par_competence: parCompetence,
      par_pole: parPole,
      global: {
        kairos_par_feuille: kairosParFeuille,
        emergences_cumulees: emergences
      },
      ipsatif: {
        par_pole: ipsatifParPole,
        top_5_competences: top5,
        indice_herfindahl_global: herfindahlGlobal,
        statistiques: {
          score_total: pythonRound(scoreTotalRaw, 2),
          competences_etablies: etabliesComps.length,
          competences_non_etablies: allComps.filter(c => c.statut_final === STATUT_NON_ETABLIE).length,
          competences_renvoyees: allComps.filter(c => c.statut_final === STATUT_RENVOI).length
        },
        evolution_globale: evolutionGlobale
      }
    }
  }
}
