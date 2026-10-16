// Interface ultime — importeur d'une journée Aurora v3 (spec §3) :
// `carto_P1..P7.json` + `kairos.json`. La même forme sert pour le
// document-jour du site (`cartographie-jour` : {date, poles[], kairos}) et pour
// chaque feuille de `carto_merge.json` (Merge v2) : un seul adaptateur.
//
// Règles (reprises de V3 adapters.js, §6.4 « jamais de déduction silencieuse ») :
// - une trace pointe une PIÈCE par son numéro (`pieceId` → `pieces[].numero`),
//   la pièce pointe un PASSAGE par son `pid` ; l'extrait verbatim vient du
//   passage (ou, à défaut, de la pièce). Une trace qui pointe directement un
//   pid n'est pas résolue en silence : elle garde son rôle (et donc son poids)
//   mais n'a pas d'extrait, et le rapport le signale ;
// - les champs historiques `motif`/`raison` et `prescription`/
//   `prescriptionMinimale` sont normalisés à l'entrée (§4.2) ;
// - les compteurs sont toujours des entiers (§4.2) ;
// - les ancres de surlignage (début, fin) sont calculées dès l'import (§8.1).

import { canonicalJson, contentHash, normalizeConfidence, normalizeRole, normalizeStatus, stableId, toCount } from '../model.js'
import { splitExtract } from '../highlight.js'
import { isIsoDate } from '../dates.js'

const str = (v) => (typeof v === 'string' ? v : '')
const nullableStr = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null)

/**
 * Empreinte du CONTENU d'une journée (indépendante du conteneur : ZIP,
 * document-jour du site, feuille de carto_merge.json donnent la même) —
 * c'est elle qui fait reconnaître une analyse déjà importée.
 */
export function auroraDayDigest(poles, kairos) {
  const sorted = [...poles].sort((a, b) => Number(a?.poleNum) - Number(b?.poleNum))
  return contentHash(canonicalJson({ poles: sorted, kairos: kairos ?? null }))
}

/**
 * Adapte une journée Aurora v3.
 *
 * @param {{
 *   date: string,
 *   poles: Array<object>,          // documents carto_Pn déjà parsés
 *   kairos?: object | null,        // kairos.json parsé
 *   provenance: {source: string, run?: string | null, files?: string[], model?: string | null, prompt?: string | null, analysedAt?: string | null},
 *   now?: string,
 * }} input
 * @returns {{summary: object, detail: object, report: Array<object>, codes: string[]}}
 */
export function adaptAuroraDay({ date, poles, kairos = null, provenance, now = new Date().toISOString() }) {
  const report = []
  const add = (severity, code, message) => report.push({ severity, code, message, date })
  if (!isIsoDate(date)) throw new Error(`Date de journée invalide : ${date}`)

  const digest = auroraDayDigest(poles, kairos)
  const variantId = stableId('v', [date, digest])
  const summaryVerdicts = []
  const detailVerdicts = {}
  const passages = []
  const poleReports = {}
  const audits = {}
  const seenCodes = new Set()
  const seenPoles = new Set()
  let unresolved = 0
  let unknownRoles = 0

  for (const doc of poles) {
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.competences)) {
      add('warning', 'pole-illisible', 'Document de pôle sans competences[] — ignoré')
      continue
    }
    const poleNum = Number(doc.poleNum)
    if (!Number.isInteger(poleNum)) add('warning', 'pole-sans-numero', 'poleNum absent ou invalide')
    else if (seenPoles.has(poleNum)) add('warning', 'pole-duplique', `Pôle ${poleNum} présent deux fois — second ignoré`)
    if (Number.isInteger(poleNum) && seenPoles.has(poleNum)) continue
    if (Number.isInteger(poleNum)) seenPoles.add(poleNum)

    // Passages saillants : pid → passage (portée locale au fichier de pôle).
    const byPid = new Map()
    for (const p of Array.isArray(doc.passagesSaillants) ? doc.passagesSaillants : []) {
      const passage = {
        pid: p?.pid ?? null,
        pole: Number.isInteger(poleNum) ? poleNum : null,
        date: isIsoDate(p?.feuille) ? p.feuille : date,
        extract: str(p?.extraitVerbatim),
        context: str(p?.contexte),
        author: nullableStr(p?.auteur),
      }
      passages.push(passage)
      if (passage.pid !== null) {
        if (byPid.has(passage.pid)) add('warning', 'pid-duplique', `pid ${passage.pid} dupliqué (pôle ${poleNum})`)
        else byPid.set(passage.pid, passage)
      }
    }

    for (const [ci, comp] of doc.competences.entries()) {
      const code = typeof comp?.code === 'string' ? comp.code.trim() : null
      if (!code) {
        add('warning', 'competence-sans-code', `Compétence n° ${ci + 1} du pôle ${poleNum} sans code — ignorée`)
        continue
      }
      if (seenCodes.has(code)) {
        add('warning', 'code-duplique', `Compétence ${code} présente deux fois — seconde ignorée`)
        continue
      }
      seenCodes.add(code)
      const verdict = comp?.verdict ?? {}
      const rawStatus = nullableStr(verdict.statut)
      const status = normalizeStatus(rawStatus)
      if (status === 'unknown' && rawStatus) add('arbitrate', 'statut-inconnu', `Statut inconnu « ${rawStatus} » (${code})`)
      const confidence = normalizeConfidence(verdict.confiance)
      const courtCircuit = comp?.courtCircuit === true

      const pieces = []
      const byNumero = new Map()
      for (const piece of Array.isArray(comp?.pieces) ? comp.pieces : []) {
        const rec = {
          numero: piece?.numero ?? null,
          pid: piece?.pid ?? null,
          context: str(piece?.contexte),
          extract: str(piece?.extraitVerbatim) || (byPid.get(piece?.pid)?.extract ?? ''),
        }
        pieces.push(rec)
        if (rec.numero !== null && !byNumero.has(rec.numero)) byNumero.set(rec.numero, rec)
      }

      const traceSummaries = []
      const traceDetails = {}
      const traces = Array.isArray(comp?.tracesRetenues) ? comp.tracesRetenues : []
      traces.forEach((t, ti) => {
        const id = `${variantId}:${code}:${ti}`
        const { role, known } = normalizeRole(t?.role)
        if (!known) unknownRoles++
        const piece = t?.pieceId != null ? byNumero.get(t.pieceId) : undefined
        const passage = piece?.pid != null ? byPid.get(piece.pid) : undefined
        const extract = passage?.extract || piece?.extract || ''
        const resolved = Boolean(extract)
        if (!resolved) unresolved++
        const anchors = splitExtract(extract)
        traceSummaries.push({ id, role })
        traceDetails[id] = {
          role,
          rawRole: nullableStr(t?.role),
          pieceType: nullableStr(t?.type),
          pieceId: t?.pieceId ?? null,
          pid: piece?.pid ?? null,
          extract,
          start: anchors.start,
          end: anchors.end,
          context: passage?.context || piece?.context || '',
          author: passage?.author ?? null,
          sourceDate: passage?.date ?? date,
          resolved,
        }
      })

      const proofs = toCount(verdict.nombrePreuves)
      const hints = toCount(verdict.nombreIndices)
      if (traceSummaries.length === 0 && proofs + hints > 0 && (status === 'established' || status === 'needs_review') && !courtCircuit) {
        // Verdict sans traces détaillées mais avec compteurs : des traces
        // anonymes (sans extrait) en tiennent lieu, pour ne pas perdre le poids.
        const synth = [...Array(proofs).fill('preuve'), ...Array(hints).fill('indice')]
        synth.forEach((role, k) => {
          const id = `${variantId}:${code}:c${k}`
          traceSummaries.push({ id, role })
          traceDetails[id] = { role, rawRole: null, pieceType: null, pieceId: null, pid: null, extract: '', start: '', end: null, context: '', author: null, sourceDate: date, resolved: false, synthetic: true }
        })
        add('info', 'traces-depuis-compteurs', `${code} : ${synth.length} trace(s) reconstituée(s) depuis les compteurs (sans extrait)`)
      }

      summaryVerdicts.push({
        code,
        status,
        rawStatus,
        courtCircuit,
        confidence,
        proofs,
        hints,
        traces: traceSummaries,
      })
      detailVerdicts[code] = {
        motif: nullableStr(verdict.motif) ?? nullableStr(verdict.raison),
        prescription: nullableStr(verdict.prescription) ?? nullableStr(verdict.prescriptionMinimale),
        pedagogue: comp?.pedagogue ?? null,
        jury: comp?.jury ?? null,
        president: comp?.president ?? null,
        pieces,
        traces: traceDetails,
      }
    }

    if (Number.isInteger(poleNum)) {
      if (doc.rapport && typeof doc.rapport === 'object') {
        const r = doc.rapport
        const report = {
          portrait: nullableStr(r.portraitPole) ?? nullableStr(r.portrait),
          denseTerritories: Array.isArray(r.territoiresDenses) ? r.territoiresDenses : [],
          unvisited: nullableStr(r.territoiresNonVisites),
          emergences: nullableStr(r.emergencesPole),
          leads: Array.isArray(r.pistes) ? r.pistes : [],
        }
        // Le rapport complet rédigé reprend ses rubriques mot pour mot : gardé
        // seulement quand il est seul (journal D-66).
        poleReports[poleNum] = { ...report, markdown: hasPoleReportFields(report) ? null : (nullableStr(r.rapportCompletMarkdown) ?? nullableStr(r.rapport_complet_markdown)) }
      }
      if (doc.auditPole) audits[poleNum] = doc.auditPole
    }
  }

  if (seenPoles.size > 0 && seenPoles.size < 7) {
    add('warning', 'journee-incomplete', `${seenPoles.size} pôle(s) sur 7 pour cette journée`)
  }
  if (unresolved > 0) {
    add('warning', 'traces-sans-extrait', `${unresolved} trace(s) sans extrait résolu : elles comptent dans les calculs mais ne peuvent pas être surlignées`)
  }
  if (unknownRoles > 0) {
    add('warning', 'role-inconnu', `${unknownRoles} trace(s) de rôle inconnu, comptées comme indices`)
  }

  let kairosDetail = null
  let emergences = null
  if (kairos && typeof kairos === 'object') {
    const ap = kairos?.kairos?.apprenant ?? kairos?.apprenant ?? null
    if (ap && typeof ap === 'object') {
      const fields = {
        portrait: nullableStr(ap.portrait),
        profileShape: nullableStr(ap.formeProfil),
        linksAcrossPoles: nullableStr(ap.ceQuiRelieLesPoles),
        betweenTheLines: nullableStr(ap.ceQuiEmergeEntreLesLignes),
        invitations: Array.isArray(ap.invitationsPourLaSuite) ? ap.invitationsPourLaSuite : [],
      }
      // La synthèse complète reprend ces rubriques mot pour mot : gardée
      // seulement quand elle est seule (journal D-66).
      kairosDetail = { ...fields, markdown: hasKairosFields(fields) ? null : nullableStr(ap.syntheseCompleteMarkdown) }
    } else {
      add('arbitrate', 'kairos-alternatif', 'Kairos de schéma inconnu : conservé tel quel, non affiché')
    }
    emergences = kairos.emergencesCrossPoles ?? kairos?.kairos?.emergencesCrossPoles ?? null
  } else {
    add('info', 'kairos-absent', 'Pas de kairos pour cette journée')
  }

  const summary = {
    id: variantId,
    digest,
    provenance: {
      source: provenance.source,
      run: provenance.run ?? null,
      files: provenance.files ?? [],
      model: provenance.model ?? null,
      prompt: provenance.prompt ?? null,
      analysedAt: provenance.analysedAt ?? null,
      importedAt: now,
    },
    verdicts: summaryVerdicts,
    anomalies: report.filter((r) => r.severity === 'warning' || r.severity === 'arbitrate').map(({ severity, code, message }) => ({ severity, code, message })),
  }
  const detail = {
    verdicts: detailVerdicts,
    passages,
    poleReports,
    audits,
    kairos: kairosDetail,
    kairosRaw: kairosDetail ? null : kairos ?? null,
    emergences,
  }
  return { summary, detail, report, codes: [...seenCodes] }
}

/** Un portrait kairos a-t-il ses rubriques (portrait, forme du profil…) ? */
export function hasKairosFields(k) {
  return Boolean(k?.portrait || k?.profileShape || k?.linksAcrossPoles || k?.betweenTheLines || k?.invitations?.length)
}

/** Un rapport de pôle a-t-il ses rubriques ? */
export function hasPoleReportFields(r) {
  return Boolean(r?.portrait || r?.denseTerritories?.length || r?.unvisited || r?.emergences || r?.leads?.length)
}

/**
 * Détail d'une variante sans les textes complets qui ne font que redire leurs
 * rubriques (journal D-66) : appliqué aussi aux archives et aux démonstrations
 * construites avant, pour que ce qui est gardé dans ce navigateur soit allégé.
 * @param {object} detail
 */
export function withoutRestatements(detail) {
  if (!detail || typeof detail !== 'object') return detail
  const kairos = detail.kairos && detail.kairos.markdown && hasKairosFields(detail.kairos) ? { ...detail.kairos, markdown: null } : detail.kairos
  let poleReports = detail.poleReports
  if (poleReports && typeof poleReports === 'object') {
    for (const [num, r] of Object.entries(poleReports)) {
      if (r?.markdown && hasPoleReportFields(r)) {
        if (poleReports === detail.poleReports) poleReports = { ...poleReports }
        poleReports[num] = { ...r, markdown: null }
      }
    }
  }
  return kairos === detail.kairos && poleReports === detail.poleReports ? detail : { ...detail, kairos, poleReports }
}

/** Le document ressemble-t-il à un carto_Pn.json ? */
export function looksLikeCartoPole(doc) {
  return Boolean(doc && typeof doc === 'object' && !Array.isArray(doc) && Array.isArray(doc.competences) && ('poleNum' in doc || 'passagesSaillants' in doc))
}

/** … à un kairos.json ? */
export function looksLikeKairos(doc) {
  return Boolean(doc && typeof doc === 'object' && !Array.isArray(doc) && (doc.kairos || doc.emergencesCrossPoles || doc.apprenant) && !Array.isArray(doc.competences))
}

/** … à un document-jour du site (cartographie-jour) ? */
export function looksLikeSiteDay(doc) {
  return Boolean(doc && typeof doc === 'object' && (doc.kind === 'cartographie-jour' || (isIsoDate(doc.date) && Array.isArray(doc.poles))))
}

/**
 * Date d'une journée Aurora sans date explicite : proposée depuis les
 * `feuille` des passages seulement si TOUTES identiques (V3 §6.9).
 * @returns {string | null}
 */
export function dateFromPassages(poles) {
  const feuilles = new Set()
  for (const pole of poles) for (const p of pole?.passagesSaillants ?? []) if (p?.feuille) feuilles.add(p.feuille)
  if (feuilles.size === 1) {
    const [only] = feuilles
    return isIsoDate(only) ? only : null
  }
  return null
}
