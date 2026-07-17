// Interface V3 — adaptateurs des formats historiques (spec §6, §9.5).
//
// Chaque adaptateur transforme un JSON historique en entités normalisées V3
// SANS jamais réécrire la source : les octets originaux restent conservés à
// part (import.js), les valeurs historiques restent dans rawStatus/legacy*,
// et toute ambiguïté produit une entrée de rapport — jamais une déduction
// silencieuse (§6.4 : « il ne doit pas deviner silencieusement une relation »).
//
// Gravités du rapport (§8.3) :
//   blocking  — JSON invalide, schéma inconnu, date absente non résolue ;
//   arbitrate — variantes concurrentes, statut inconnu, numéro dupliqué ;
//   warning   — référence pendante, rapport nul, champ facultatif absent ;
//   info      — champ historique conservé mais non utilisé par les métriques.

import {
  evidenceLinkId,
  legacyPassageId,
  legacyPieceId,
  observationId,
} from './ids.js'

export const ADAPTER_VERSION = 'v3-adapter-1.0.0'

/** Statuts historiques → statuts normalisés (spec §6.5). */
const STATUS_MAP = new Map([
  ['présence établie', 'established'],
  ['présence non établie', 'not_established'],
  ['renvoi au cartographe', 'needs_review'],
  ['à arbitrer par le cartographe', 'needs_review'],
])

/** @param {string | null | undefined} raw */
export function normalizeStatus(raw) {
  if (typeof raw !== 'string') return 'unknown'
  return STATUS_MAP.get(raw.trim()) ?? 'unknown'
}

/** Entrée de rapport d'import. */
function entry(severity, code, message, context = {}) {
  return { severity, code, message, ...context }
}

/**
 * Adapte un `carto_Pn.json` historique (ou un pôle embarqué d'un document-jour
 * du site — même forme, poleNum numérique) en entités normalisées.
 *
 * @param {object} raw JSON du pôle, déjà parsé
 * @param {{docId: string, dayKey: string, expectedPole?: number | null}} ctx
 *   docId = sourceDocumentId (déjà dérivé des octets) ; dayKey = clé de la
 *   journée source (pour rattacher les entités) ; expectedPole = numéro attendu
 *   d'après le nom de fichier (contrôle de concordance §6.1).
 * @returns {{poleNum: number | null, passages: Array, observations: Array,
 *   evidenceLinks: Array, narratives: Array, legacyAudit: object | null,
 *   report: Array}}
 */
export function adaptCartoPole(raw, { docId, dayKey, expectedPole = null }) {
  const report = []
  const passages = []
  const observations = []
  const evidenceLinks = []
  const narratives = []

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      poleNum: null,
      passages,
      observations,
      evidenceLinks,
      narratives,
      legacyAudit: null,
      report: [entry('blocking', 'schema-inconnu', 'Document de pôle illisible (objet attendu)')],
    }
  }

  const poleNum = raw.poleNum != null && raw.poleNum !== '' ? Number(raw.poleNum) : null
  if (poleNum === null || Number.isNaN(poleNum)) {
    report.push(entry('blocking', 'pole-absent', 'poleNum absent ou invalide'))
  } else if (expectedPole !== null && poleNum !== expectedPole) {
    report.push(
      entry('blocking', 'pole-discordant', `poleNum ${poleNum} ≠ pôle attendu ${expectedPole} (nom de fichier)`),
    )
  }

  // --- Passages (chaque passage historique = passage canonique distinct §9.2)
  const passagesByPid = new Map()
  const saillants = Array.isArray(raw.passagesSaillants) ? raw.passagesSaillants : []
  saillants.forEach((p, i) => {
    const passage = {
      id: legacyPassageId(docId, p?.pid ?? 'sans-pid', i),
      documentId: null, // rattaché au document de portfolio synthétique par import.js
      dayKey,
      sourceDocumentId: docId,
      sourcePid: p?.pid ?? null,
      sourcePole: poleNum,
      verbatim: typeof p?.extraitVerbatim === 'string' ? p.extraitVerbatim : '',
      contexte: typeof p?.contexte === 'string' ? p.contexte : '',
      feuille: typeof p?.feuille === 'string' ? p.feuille : null,
      auteur: typeof p?.auteur === 'string' ? p.auteur : null,
    }
    passages.push(passage)
    // pid réutilisés : portée LOCALE au fichier — premier gagnant, doublon signalé.
    if (p?.pid != null) {
      if (passagesByPid.has(p.pid)) {
        report.push(entry('warning', 'pid-duplique', `pid ${p.pid} dupliqué dans passagesSaillants`, { pid: p.pid }))
      } else {
        passagesByPid.set(p.pid, passage)
      }
    }
  })

  // --- Compétences → observations + liens de preuve
  const comps = Array.isArray(raw.competences) ? raw.competences : []
  comps.forEach((comp, ci) => {
    const rawCode = typeof comp?.code === 'string' ? comp.code : `inconnu-${ci}`
    const obsId = observationId(docId, rawCode, ci)
    const rawStatus = comp?.verdict?.statut ?? null
    const normalizedStatus = normalizeStatus(rawStatus)
    if (normalizedStatus === 'unknown' && rawStatus != null) {
      report.push(entry('arbitrate', 'statut-inconnu', `Statut inconnu « ${rawStatus} » (${rawCode})`, { competency: rawCode }))
    }

    // pieces[] : numero → pid (portée locale à la compétence).
    const piecesByNumero = new Map()
    const pieces = Array.isArray(comp?.pieces) ? comp.pieces : []
    pieces.forEach((piece, pi) => {
      const numero = piece?.numero
      const rec = {
        legacyId: legacyPieceId(docId, rawCode, numero ?? 'sans-numero', pi),
        numero: numero ?? null,
        pid: piece?.pid ?? null,
        contexte: typeof piece?.contexte === 'string' ? piece.contexte : '',
        extraitVerbatim: typeof piece?.extraitVerbatim === 'string' ? piece.extraitVerbatim : '',
      }
      if (numero != null) {
        if (piecesByNumero.has(numero)) {
          report.push(
            entry('arbitrate', 'numero-duplique', `Numéro de pièce ${numero} dupliqué (${rawCode})`, { competency: rawCode }),
          )
        } else {
          piecesByNumero.set(numero, rec)
        }
      }
    })

    // tracesRetenues[] : pieceId → numero → pid → passage. Jamais de devinette.
    const traces = Array.isArray(comp?.tracesRetenues) ? comp.tracesRetenues : []
    const links = traces.map((trace, ti) => {
      const link = {
        id: evidenceLinkId(obsId, 'trace', ti),
        observationId: obsId,
        passageId: null,
        linkState: 'dangling',
        evidentialRole: typeof trace?.role === 'string' ? trace.role : '', // rôle ARGUMENTATIF (§6.6), jamais learnerRole
        reviewState: 'unreviewed',
        learnerNote: null,
        sourcePieceRef: trace?.pieceId ?? null,
      }
      const piece = trace?.pieceId != null ? piecesByNumero.get(trace.pieceId) : undefined
      if (piece && piece.pid != null && passagesByPid.has(piece.pid)) {
        link.passageId = passagesByPid.get(piece.pid).id
        link.linkState = 'resolved'
      } else if (trace?.pieceId != null && !piece && passagesByPid.has(trace.pieceId)) {
        // Variante historique : la trace pointe DIRECTEMENT un pid (§6.4).
        // Alerte + provenance conservée, PAS de résolution silencieuse.
        report.push(
          entry('warning', 'trace-alternative-pid', `Trace de ${rawCode} pointe directement un pid (${trace.pieceId}) — relation non résolue automatiquement`, { competency: rawCode }),
        )
      } else if (trace?.pieceId != null) {
        report.push(
          entry('warning', 'reference-pendante', `Trace de ${rawCode} référence la pièce ${trace.pieceId} introuvable`, { competency: rawCode }),
        )
      }
      return link
    })
    evidenceLinks.push(...links)

    observations.push({
      id: obsId,
      dayKey,
      sourceDocumentId: docId,
      rawCode,
      normalizedStatus,
      rawStatus,
      verdictConfidence:
        typeof comp?.verdict?.confiance === 'number' ? comp.verdict.confiance : null,
      courtCircuit: comp?.courtCircuit === true,
      motif: comp?.verdict?.motif ?? comp?.verdict?.raison ?? null,
      prescription: comp?.verdict?.prescription ?? comp?.verdict?.prescriptionMinimale ?? null,
      legacyPieces: pieces.length,
    })
  })

  // --- Rapport narratif du pôle (privé par défaut, §6.7)
  if (raw.rapport == null) {
    report.push(entry('warning', 'rapport-nul', `Rapport de pôle absent (pôle ${poleNum ?? '?'})`))
  } else if (typeof raw.rapport === 'object') {
    const md = raw.rapport.rapportCompletMarkdown ?? raw.rapport.rapport_complet_markdown ?? null
    narratives.push({
      id: `${docId}:rapport`,
      scope: { type: 'pole', poleNum, dayKey },
      text: typeof md === 'string' ? md : JSON.stringify(raw.rapport),
      dependsOn: observations.map((o) => o.id),
      engineVersion: ADAPTER_VERSION,
      freshness: 'current',
    })
  }

  return {
    poleNum,
    passages,
    observations,
    evidenceLinks,
    narratives,
    legacyAudit: raw.auditPole ?? null, // trace historique, JAMAIS un agrégat courant (§6.7)
    report,
  }
}

/**
 * Adapte un `kairos.json` historique en narratifs dérivés.
 * Les `piecesCommunes` ne précisent ni pôle ni compétence : références
 * historiques non résolues (§6.8), simple information.
 */
export function adaptKairos(raw, { docId, dayKey }) {
  const report = []
  const narratives = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { narratives, report: [entry('blocking', 'schema-inconnu', 'Kairos illisible (objet attendu)')] }
  }
  const apprenant = raw?.kairos?.apprenant ?? raw?.apprenant ?? null
  if (apprenant && typeof apprenant === 'object') {
    const fields = [
      ['portrait', apprenant.portrait],
      ['formeProfil', apprenant.formeProfil],
      ['ceQuiRelieLesPoles', apprenant.ceQuiRelieLesPoles],
      ['ceQuiEmergeEntreLesLignes', apprenant.ceQuiEmergeEntreLesLignes],
      ['syntheseCompleteMarkdown', apprenant.syntheseCompleteMarkdown],
    ]
    for (const [field, text] of fields) {
      if (typeof text === 'string' && text.trim() !== '') {
        narratives.push({
          id: `${docId}:kairos:${field}`,
          scope: { type: 'kairos', field, dayKey },
          text,
          dependsOn: ['*day*'], // dépend de la journée entière
          engineVersion: ADAPTER_VERSION,
          freshness: 'current',
        })
      }
    }
  } else {
    // Schéma alternatif (ex. 4 mars 2026 run 2) : conservé sans narratifs
    // normalisés, à examiner en mode expert (§6.8).
    report.push(entry('arbitrate', 'kairos-alternatif', 'Kairos de schéma alternatif — adaptateur dédié requis, contenu conservé en source'))
  }
  const piecesCommunes = raw?.piecesCommunes ?? raw?.kairos?.piecesCommunes ?? null
  if (Array.isArray(piecesCommunes) && piecesCommunes.length > 0) {
    report.push(
      entry('info', 'pieces-communes-non-resolues', `${piecesCommunes.length} piecesCommunes Kairos importées comme références historiques non résolues`),
    )
  }
  return { narratives, report }
}

/**
 * Adapte un document-jour du SITE (cartographie-jour : {date, poles[], kairos})
 * en le décomposant en pôles + kairos — mêmes règles que le corpus historique.
 * C'est l'adaptateur qui branche les données existantes du site sur la V3.
 *
 * @param {object} raw document-jour parsé
 * @param {{docIdForPole: (poleNum: number) => string, docIdForKairos: () => string, dayKey: string}} ctx
 */
export function adaptJourDocument(raw, { docIdForPole, docIdForKairos, dayKey }) {
  const report = []
  const out = { passages: [], observations: [], evidenceLinks: [], narratives: [], legacyAudits: [], report }
  if (!raw || !Array.isArray(raw.poles)) {
    report.push(entry('blocking', 'schema-inconnu', 'Document-jour illisible ({date, poles[]} attendu)'))
    return out
  }
  for (const pole of raw.poles) {
    const poleNum = Number(pole?.poleNum)
    const res = adaptCartoPole(pole, {
      docId: docIdForPole(poleNum),
      dayKey,
      expectedPole: Number.isNaN(poleNum) ? null : poleNum,
    })
    out.passages.push(...res.passages)
    out.observations.push(...res.observations)
    out.evidenceLinks.push(...res.evidenceLinks)
    out.narratives.push(...res.narratives)
    if (res.legacyAudit) out.legacyAudits.push({ poleNum: res.poleNum, audit: res.legacyAudit })
    report.push(...res.report)
  }
  if (raw.kairos) {
    const res = adaptKairos(raw.kairos, { docId: docIdForKairos(), dayKey })
    out.narratives.push(...res.narratives)
    report.push(...res.report)
  }
  return out
}
