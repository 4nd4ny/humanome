// Banc d'essai promptologue (P10.4, refondu D15) — logique pure, sans React.
//
// Exécution d'UNE version (publiée ou MON brouillon) sur un portfolio de test :
//   - paquet « moteur » (orchestration engine://) -> extractDay direct ;
//   - paquet avec code d'orchestration personnalisé -> sandbox (P10.3).
// Multi-run de consistance (engine compareRuns), comparaison A/B (fournisseur,
// modèle et référentiel PAR BRANCHE), comparaison contre une référence JSON
// importée, périmètre restreint (journées choisies, pôle ou compétence unique),
// diff de compétences avec traces de délibération du jury.

import { extractDay, restreindreReferentiel } from '@engine/pipeline/extract.js'
import { compareRuns } from '@engine/consistency.js'
import { getModelPricing } from '@engine/providers/index.js'
import { executerTwin6 } from '@engine/twin6/index.js'
import { validateDocument } from '@engine/validation.js'
import { runPackageInSandbox, usesEngineOrchestration } from '../../lib/sandbox/index.js'

export const STATUT_ETABLIE = 'présence établie'
export const STATUT_RENVOI = 'renvoi au cartographe'

/**
 * Paquet « Cartographie ouverte Twin6 » (ou un fork) : l'orchestration porte le
 * marqueur engine://…(twin6). Son exécution n'est PAS une extraction par jour
 * (aurora) mais un run Twin6 sur le portfolio ENTIER (7 scan-pole + kairos ->
 * cartographie-merge), comme la page publique #/twin6-ouverte (D1/AD-D1).
 * @param {object} pkg prompt-package (complet ou métadonnées)
 * @returns {boolean}
 */
export function usesTwin6Engine(pkg) {
  const orchestration = pkg?.code?.orchestration
  return typeof orchestration === 'string' && orchestration.includes('(twin6)')
}

/**
 * Extrait les gabarits Twin6 (scanPole, kairos, fiches{1..7}) des prompts[] d'un
 * paquet Twin6, dans la forme attendue par executerTwin6.
 * @param {{prompts: Array<{role: string, texte: string}>}} pkg
 * @returns {{scanPole: string, kairos: string, fiches: Record<string, string>}}
 */
export function extractTwin6Templates(pkg) {
  const byRole = {}
  for (const p of pkg?.prompts ?? []) {
    if (p && typeof p.role === 'string' && typeof p.texte === 'string') byRole[p.role] = p.texte
  }
  const scanPole = byRole['twin6-scan-pole']
  const kairos = byRole['twin6-kairos']
  const fiches = {}
  for (let n = 1; n <= 7; n += 1) {
    const t = byRole[`twin6-fiche-${n}`]
    if (typeof t === 'string') fiches[String(n)] = t
  }
  if (!scanPole || !kairos || Object.keys(fiches).length === 0) {
    throw new Error(
      'Paquet Twin6 incomplet : gabarits twin6-scan-pole, twin6-kairos et twin6-fiche-1..7 attendus.',
    )
  }
  return { scanPole, kairos, fiches }
}

/**
 * Assemble un portfolio markdown (feuilles `### AAAA-MM-JJ`) depuis les journées
 * du banc d'essai — Twin6 tourne sur le portfolio entier, pas jour par jour.
 * @param {Array<{iso: string, texte: string}>} dayGroups
 * @returns {string}
 */
export function dayGroupsToPortfolio(dayGroups) {
  return (dayGroups ?? []).map((g) => `### ${g.iso}\n\n${g.texte}`).join('\n\n')
}

/**
 * Filtre les journées du portfolio selon la sélection du banc : tout le
 * journal, UNE journée précise, ou une période [du..au] (bornes incluses,
 * bornes vides = ouvertes).
 *
 * @param {Array<{iso: string, texte: string}>} dayGroups
 * @param {{type: 'tous'|'jour'|'periode', jour?: string, du?: string, au?: string}} [selection]
 * @returns {Array<{iso: string, texte: string}>} sous-ensemble non vide
 */
export function filterDayGroups(dayGroups, selection = { type: 'tous' }) {
  const groups = dayGroups ?? []
  const type = selection?.type ?? 'tous'
  let kept
  if (type === 'tous') {
    kept = [...groups]
  } else if (type === 'jour') {
    kept = groups.filter((g) => g.iso === selection.jour)
  } else if (type === 'periode') {
    if (selection.du && selection.au && selection.du > selection.au) {
      throw new Error('Période invalide : la date de début est postérieure à la date de fin.')
    }
    const du = selection.du || '0000-00-00'
    const au = selection.au || '9999-99-99'
    kept = groups.filter((g) => g.iso >= du && g.iso <= au)
  } else {
    throw new Error(`Sélection de journées inconnue : « ${type} ».`)
  }
  if (kept.length === 0) {
    throw new Error('Aucune journée du portfolio ne correspond à la sélection.')
  }
  return kept
}

/**
 * Détecte les paquets dont les gabarits ou l'orchestration embarquent le
 * référentiel EN DUR : le choix d'une version du référentiel sur le banc n'a
 * alors pas (ou peu) d'effet sur le contenu réellement instruit.
 *
 * Heuristiques : marqueur Twin6 (fiches P1..P7 inline), fiches de compétences
 * en toutes lettres dans les gabarits (« ## X.YY — … »), orchestration sandbox
 * qui n'utilise jamais son paramètre `referentiel`.
 *
 * @param {object} pkg prompt-package (complet)
 * @returns {{enDur: boolean, motif: string|null}}
 */
export function detectReferentielEnDur(pkg) {
  if (!pkg || typeof pkg !== 'object') return { enDur: false, motif: null }
  if (pkg.builtin === true) return { enDur: false, motif: null }
  if (usesTwin6Engine(pkg)) {
    return {
      enDur: true,
      motif:
        'paquet Twin6 : les fiches P1..P7 (compétences en toutes lettres) sont embarquées '
        + 'dans les gabarits — le référentiel choisi ne sert qu’à lister les pôles.',
    }
  }
  const ficheInline = (pkg.prompts ?? []).some(
    (p) => typeof p?.texte === 'string' && /^##? \d\.\d\d — /m.test(p.texte),
  )
  if (ficheInline) {
    return {
      enDur: true,
      motif:
        'des gabarits du paquet contiennent des fiches de compétences en dur (« ## X.YY — … ») : '
        + 'la version du référentiel choisie ne pilote pas leur contenu.',
    }
  }
  const orchestration = pkg.code?.orchestration
  if (
    typeof orchestration === 'string'
    && !orchestration.includes('engine://')
    && !orchestration.includes('referentiel')
  ) {
    return {
      enDur: true,
      motif:
        'l’orchestration du paquet n’utilise jamais son paramètre `referentiel` : les compétences '
        + 'instruites sont figées dans le code ou les gabarits.',
    }
  }
  return { enDur: false, motif: null }
}

/**
 * Résumé structurel d'un document cartographie-jour : codes par statut.
 * @param {object} doc document cartographie-jour
 * @returns {{etablies: string[], renvois: string[], nonEtablies: string[]}}
 */
export function summarizeDocument(doc) {
  const etablies = []
  const renvois = []
  const nonEtablies = []
  for (const pole of doc?.poles ?? []) {
    for (const comp of pole.competences ?? []) {
      const statut = comp?.verdict?.statut
      if (statut === STATUT_ETABLIE) etablies.push(comp.code)
      else if (statut === STATUT_RENVOI) renvois.push(comp.code)
      else nonEtablies.push(comp.code)
    }
  }
  return { etablies: etablies.sort(), renvois: renvois.sort(), nonEtablies: nonEtablies.sort() }
}

/**
 * Compare deux listes de codes établis.
 * @param {string[]} a @param {string[]} b
 * @returns {{communes: string[], seulementA: string[], seulementB: string[]}}
 */
export function compareCodes(a, b) {
  const setA = new Set(a)
  const setB = new Set(b)
  return {
    communes: a.filter((c) => setB.has(c)),
    seulementA: a.filter((c) => !setB.has(c)),
    seulementB: b.filter((c) => !setA.has(c)),
  }
}

/**
 * Détail de la délibération du jury pour UNE compétence d'un document
 * cartographie-jour : pièces du greffier (extraits verbatim résolus via
 * passagesSaillants), présomptions du pédagogue (absence puis sycophantie,
 * attaques a..h), traces retenues, verdict motivé.
 *
 * @param {object} document cartographie-jour
 * @param {string} code code compétence (ex. « 3.04 »)
 * @returns {{code: string, poleNum: string, statut: string|null,
 *   courtCircuit: boolean, pieces: Array, pedagogue: object|null,
 *   tracesRetenues: Array, verdict: object|null} | null}
 */
export function extractCompetenceDetail(document, code) {
  for (const pole of document?.poles ?? []) {
    const comp = (pole.competences ?? []).find((c) => c?.code === code)
    if (!comp) continue
    const passages = new Map((pole.passagesSaillants ?? []).map((p) => [p.pid, p]))
    const pieces = (comp.pieces ?? []).map((piece) => ({
      ...piece,
      extraitVerbatim: passages.get(piece.pid)?.extraitVerbatim ?? null,
    }))
    return {
      code,
      poleNum: pole.poleNum,
      statut: comp.verdict?.statut ?? null,
      courtCircuit: comp.courtCircuit === true,
      pieces,
      pedagogue: comp.pedagogue ?? null,
      tracesRetenues: comp.tracesRetenues ?? [],
      verdict: comp.verdict ?? null,
    }
  }
  return null
}

/**
 * Diff de compétences entre deux runs : par journée, compétences établies d'un
 * côté et pas de l'autre (et inversement), chacune accompagnée du détail de
 * délibération du jury DES DEUX côtés (pour comprendre ce qui a conduit au
 * choix). Les deux runs peuvent couvrir des journées différentes (référence
 * importée partielle) : le diff porte l'union des journées.
 *
 * @param {{days: Array<{iso: string, document: object}>}} a
 * @param {{days: Array<{iso: string, document: object}>}} b
 * @returns {{parJour: Array<{iso: string, communes: string[],
 *   seulementA: Array<{code, statutA, statutB, detailA, detailB}>,
 *   seulementB: Array<{code, statutA, statutB, detailA, detailB}>}>}}
 */
export function buildCompetenceDiff(a, b) {
  const daysA = a?.days ?? []
  const daysB = b?.days ?? []
  const isos = [...new Set([...daysA.map((d) => d.iso), ...daysB.map((d) => d.iso)])].sort()
  const parJour = isos.map((iso) => {
    const docA = daysA.find((d) => d.iso === iso)?.document ?? null
    const docB = daysB.find((d) => d.iso === iso)?.document ?? null
    const vide = { etablies: [], renvois: [], nonEtablies: [] }
    const resumeA = docA ? summarizeDocument(docA) : vide
    const resumeB = docB ? summarizeDocument(docB) : vide
    const diff = compareCodes(resumeA.etablies, resumeB.etablies)
    const entry = (code) => {
      const detailA = docA ? extractCompetenceDetail(docA, code) : null
      const detailB = docB ? extractCompetenceDetail(docB, code) : null
      return {
        code,
        statutA: detailA?.statut ?? null,
        statutB: detailB?.statut ?? null,
        detailA,
        detailB,
      }
    }
    return {
      iso,
      communes: diff.communes,
      seulementA: diff.seulementA.map(entry),
      seulementB: diff.seulementB.map(entry),
    }
  })
  return { parJour }
}

/**
 * Rapport d'un run simple, sérialisable et RÉIMPORTABLE comme référence
 * (normalizeReferenceImport reconnaît sa forme {days: [{iso, document}]}).
 *
 * @param {object} params {portfolioLabel, run, config?, now?}
 * @returns {object} rapport JSON
 */
export function buildRunReport({ portfolioLabel, run, config = {}, now = () => new Date().toISOString() }) {
  return {
    kind: 'rapport-run-banc',
    genereLe: now(),
    portfolio: { label: portfolioLabel, jours: run.days.map((d) => d.iso) },
    pkg: run.pkg,
    config,
    llmCalls: run.llmCalls,
    durationMs: run.durationMs,
    usage: run.usage ?? null,
    days: run.days,
  }
}

/**
 * Normalise un JSON de référence importé en pseudo-run comparable
 * (mêmes champs que runVersionOnDays). Formes acceptées :
 *   - un document cartographie-jour seul ;
 *   - un tableau de documents cartographie-jour ;
 *   - un export du banc {days: [{iso, document}]} (rapport-run-banc).
 * Chaque document complet est validé au schéma ; les documents à périmètre
 * partiel (marqueur perimetre.partiel) sont acceptés sans validation stricte
 * (le schéma exige 7 pôles).
 *
 * @param {object|Array} json contenu du fichier importé
 * @param {{validateFn?: typeof validateDocument}} [deps]
 * @returns {{pkg: {id, version}, reference: true, engine: null,
 *   days: Array<{iso, document}>, llmCalls: 0, durationMs: 0, label: string}}
 */
export function normalizeReferenceImport(json, { validateFn = validateDocument } = {}) {
  if (json === null || typeof json !== 'object') {
    throw new Error('JSON de référence illisible : objet ou tableau attendu.')
  }
  let days
  let label
  if (Array.isArray(json)) {
    days = json.map((doc) => ({ iso: doc?.date, document: doc }))
    label = `Référence importée (${days.length} journée(s))`
  } else if (json.kind === 'cartographie-jour') {
    days = [{ iso: json.date, document: json }]
    label = `Référence importée (${json.date})`
  } else if (Array.isArray(json.days)) {
    days = json.days.map((d) => ({ iso: d?.iso ?? d?.document?.date, document: d?.document }))
    label = json.portfolio?.label
      ? `Référence : ${json.portfolio.label}`
      : `Référence importée (${days.length} journée(s))`
  } else {
    throw new Error(
      'JSON de référence non reconnu : document cartographie-jour, tableau de documents, '
      + 'ou export du banc ({days: [{iso, document}]}) attendus.',
    )
  }
  if (days.length === 0) {
    throw new Error('JSON de référence vide : aucune journée à comparer.')
  }
  const seen = new Set()
  for (const { iso, document } of days) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      throw new Error('JSON de référence : chaque journée doit porter une date AAAA-MM-JJ.')
    }
    if (document?.kind !== 'cartographie-jour') {
      throw new Error(`JSON de référence : la journée ${iso} ne porte pas un document cartographie-jour.`)
    }
    if (seen.has(iso)) throw new Error(`JSON de référence : date en double (${iso}).`)
    seen.add(iso)
    // Le marqueur perimetre.partiel vient du FICHIER importé : il ne doit pas
    // désactiver la validation (un JSON forgé y échapperait), il bascule
    // seulement vers la sonde tolérante (< 7 pôles, marqueur retiré).
    const { valid, errors } =
      document.perimetre?.partiel === true
        ? validatePartialJour('cartographie-jour', document)
        : validateFn('cartographie-jour', document)
    if (!valid) {
      const detail = errors.slice(0, 3).map((e) => `${e.path} ${e.message}`).join(' ; ')
      throw new Error(
        `JSON de référence : document du ${iso} invalide au schéma `
        + `(${errors.length} erreur(s) : ${detail}).`,
      )
    }
  }
  days = [...days].sort((x, y) => (x.iso < y.iso ? -1 : 1))
  const pkgId = typeof json.pkg?.id === 'string' ? json.pkg.id : 'reference-importee'
  const pkgVersion = typeof json.pkg?.version === 'string' ? json.pkg.version : 'import'
  return {
    pkg: { id: pkgId, version: pkgVersion },
    reference: true,
    engine: null,
    days,
    llmCalls: 0,
    durationMs: 0,
    label,
  }
}

/**
 * Coût RÉEL d'un run à partir des tokens mesurés (table de prix indicative du
 * moteur). Pur calcul — null si le modèle est inconnu de la table ou si aucun
 * usage n'a été mesuré (fournisseur muet sur les compteurs).
 *
 * @param {{inputTokens: number, outputTokens: number, mesures?: number}} usage
 * @param {string} model
 * @returns {number|null} coût USD arrondi au dix-millième — le banc mesure des
 *   runs volontairement petits (périmètre restreint) : au centième, un run
 *   payant réel s'afficherait « 0 $ », indistinguable d'un modèle local gratuit
 */
export function realCostUsd(usage, model) {
  if (!usage || (usage.mesures ?? 0) === 0) return null
  const pricing = getModelPricing(model)
  if (!pricing) return null
  const cost =
    (usage.inputTokens * pricing.input) / 1e6 + (usage.outputTokens * pricing.output) / 1e6
  return Math.round(cost * 1e4) / 1e4
}

/**
 * Additionne des compteurs d'usage (totaux de session multi-run).
 * @param {Array<{inputTokens: number, outputTokens: number, mesures: number}|null>} usages
 * @returns {{inputTokens: number, outputTokens: number, mesures: number}}
 */
export function sumUsages(usages) {
  const total = { inputTokens: 0, outputTokens: 0, mesures: 0 }
  for (const u of usages ?? []) {
    if (!u || typeof u !== 'object') continue
    total.inputTokens += Number(u.inputTokens) || 0
    total.outputTokens += Number(u.outputTokens) || 0
    total.mesures += Number(u.mesures) || 0
  }
  return total
}

/**
 * Score chiffré vs référence — PUR ALGORITHME d'ensembles, aucune IA :
 * depuis le rapport A/B (A = généré, B = référence), les communes sont des
 * vrais positifs, les « seulement A » des faux positifs, les « seulement B »
 * des faux négatifs. Précision = TP/(TP+FP), rappel = TP/(TP+FN),
 * F1 = moyenne harmonique (0 si précision et rappel sont définis et nuls —
 * désaccord total, pas indétermination ; null seulement sans donnée).
 *
 * Seules les journées couvertes par LES DEUX côtés sont scorées (drapeaux
 * couvertA/couvertB de buildAbReport ; absents = couvert, compat rapports
 * anciens) : comparer une journée testée à une référence de 5 jours ne doit
 * pas compter les 4 jours non testés comme « manqués ». Les journées écartées
 * sont rendues dans joursExclus. Un périmètre restreint se déclare via
 * codesRetenus : les compétences de la référence hors périmètre sont ignorées.
 *
 * @param {{parJour: Array<{iso, communes: string[], seulementA: string[],
 *   seulementB: string[], couvertA?: boolean, couvertB?: boolean}>}} report
 * @param {{codesRetenus?: Set<string>|string[]}} [options]
 * @returns {{vraisPositifs: number, fauxPositifs: number, fauxNegatifs: number,
 *   precision: number|null, rappel: number|null, f1: number|null,
 *   joursExclus: string[],
 *   parJour: Array<{iso: string, precision: number|null, rappel: number|null}>}}
 */
export function scoreVsReference(report, { codesRetenus } = {}) {
  const retenus =
    codesRetenus === undefined || codesRetenus === null ? null : new Set(codesRetenus)
  const garde = (codes) => (retenus === null ? codes : codes.filter((c) => retenus.has(c)))
  let tp = 0
  let fp = 0
  let fn = 0
  const parJour = []
  const joursExclus = []
  for (const jour of report?.parJour ?? []) {
    if (jour.couvertA === false || jour.couvertB === false) {
      joursExclus.push(jour.iso)
      continue
    }
    const jtp = garde(jour.communes).length
    const jfp = garde(jour.seulementA).length
    const jfn = garde(jour.seulementB).length
    tp += jtp
    fp += jfp
    fn += jfn
    parJour.push({
      iso: jour.iso,
      precision: jtp + jfp > 0 ? jtp / (jtp + jfp) : null,
      rappel: jtp + jfn > 0 ? jtp / (jtp + jfn) : null,
    })
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : null
  const rappel = tp + fn > 0 ? tp / (tp + fn) : null
  const f1 =
    precision !== null && rappel !== null
      ? precision + rappel > 0
        ? (2 * precision * rappel) / (precision + rappel)
        : 0
      : null
  return {
    vraisPositifs: tp,
    fauxPositifs: fp,
    fauxNegatifs: fn,
    precision,
    rappel,
    f1,
    joursExclus,
    parJour,
  }
}

/**
 * Multi-run croisé A/B — distinguer un VRAI écart de prompt du bruit
 * stochastique. Pur calcul : pour chaque (journée, compétence) établie dans au
 * moins un run, pA = fraction des runs A qui l'établissent, pB idem côté B.
 *   - « écart franc » : les deux branches sont STABLES (p ≤ 0.25 ou ≥ 0.75)
 *     et concluent à l'OPPOSÉ — c'est le signal attribuable au prompt ;
 *   - « bruit » : au moins une branche est instable (0.25 < p < 0.75) — un
 *     écart observé sur UN run n'y serait pas fiable ;
 *   - « accord » : les deux branches stables du même côté.
 * La consistance interne de chaque branche (engine compareRuns) est jointe.
 *
 * @param {{runsA: Array<{days: Array}>, runsB: Array<{days: Array}>}} params
 * @returns {{nbRunsA: number, nbRunsB: number,
 *   consistance: {a: object|null, b: object|null},
 *   lignes: Array<{iso, code, pA, pB, classe}>,
 *   resume: {ecartsVersA: number, ecartsVersB: number, bruit: number, accords: number}}}
 */
export function buildAbMultiReport({ runsA, runsB }) {
  if (!Array.isArray(runsA) || !Array.isArray(runsB) || runsA.length < 1 || runsB.length < 1) {
    throw new TypeError('buildAbMultiReport : au moins 1 run par branche requis')
  }
  const etabliesDe = (run, iso) => {
    const doc = run.days.find((d) => d.iso === iso)?.document
    return doc ? new Set(summarizeDocument(doc).etablies) : new Set()
  }
  const isos = [
    ...new Set([...runsA, ...runsB].flatMap((run) => run.days.map((d) => d.iso))),
  ].sort()
  const stable = (p) => p <= 0.25 || p >= 0.75
  const lignes = []
  const resume = { ecartsVersA: 0, ecartsVersB: 0, bruit: 0, accords: 0 }
  for (const iso of isos) {
    const setsA = runsA.map((run) => etabliesDe(run, iso))
    const setsB = runsB.map((run) => etabliesDe(run, iso))
    const codes = [...new Set([...setsA, ...setsB].flatMap((s) => [...s]))].sort()
    for (const code of codes) {
      const pA = setsA.filter((s) => s.has(code)).length / setsA.length
      const pB = setsB.filter((s) => s.has(code)).length / setsB.length
      let classe
      if (!stable(pA) || !stable(pB)) classe = 'bruit'
      else if (pA >= 0.75 && pB <= 0.25) classe = 'ecart-vers-a'
      else if (pB >= 0.75 && pA <= 0.25) classe = 'ecart-vers-b'
      else classe = 'accord'
      lignes.push({ iso, code, pA, pB, classe })
      if (classe === 'ecart-vers-a') resume.ecartsVersA += 1
      else if (classe === 'ecart-vers-b') resume.ecartsVersB += 1
      else if (classe === 'bruit') resume.bruit += 1
      else resume.accords += 1
    }
  }
  const consistance = {
    a: runsA.length >= 2 ? buildMultiRunReport(runsA) : null,
    b: runsB.length >= 2 ? buildMultiRunReport(runsB) : null,
  }
  return { nbRunsA: runsA.length, nbRunsB: runsB.length, consistance, lignes, resume }
}

/** Note affichée quand un périmètre restreint est demandé sur un paquet Twin6. */
export const TWIN6_PERIMETRE_NOTE =
  'Périmètre restreint indisponible pour les paquets Twin6 : leurs fiches embarquent le '
  + 'référentiel en dur et le run produit une cartographie globale (merge) qui exige les 7 pôles.'

/**
 * Validation tolérante au périmètre partiel : le schéma cartographie-jour
 * exige exactement 7 pôles ; un document restreint est validé via une sonde
 * (pôles dupliqués/renumérotés 1..7), comme extractDay le fait pour chaque
 * pôle. Le marqueur `perimetre` (hors schéma, additionalProperties: false)
 * est retiré avant la sonde. Au-delà de 7 pôles, la validation STRICTE
 * s'applique (un document à pôles dupliqués doit être refusé, pas tronqué).
 * @param {string} kind @param {object} doc
 * @returns {{valid: boolean, errors: Array}}
 */
export function validatePartialJour(kind, doc) {
  if (kind !== 'cartographie-jour' || !Array.isArray(doc?.poles)) {
    return validateDocument(kind, doc)
  }
  const { perimetre: _marqueur, ...rest } = doc
  if (rest.poles.length === 0 || rest.poles.length >= 7) {
    return validateDocument(kind, rest)
  }
  const pad = Array.from({ length: 7 }, (_, i) => ({
    ...rest.poles[Math.min(i, rest.poles.length - 1)],
    poleNum: String(i + 1),
  }))
  return validateDocument(kind, { ...rest, poles: pad, kairos: rest.kairos ?? null })
}

/**
 * Exécute une version d'un paquet sur les journées données (séquentiel).
 *
 * @param {object} params
 * @param {object} params.pkg document prompt-package (ou paquet embarqué)
 * @param {Array<{iso: string, texte: string}>} params.dayGroups
 * @param {object} params.referentiel
 * @param {{complete: Function}} params.provider
 * @param {string} params.model
 * @param {number} [params.maxTokens]
 * @param {{poles?: number[], competences?: string[]}} [params.perimetre]
 *   périmètre restreint (moteur : extractDay ; sandbox : référentiel filtré +
 *   validation tolérante ; Twin6 : refusé, référentiel en dur)
 * @param {number} [params.temperature] température passée à chaque appel LLM
 * @param {AbortSignal} [params.signal]
 * @param {(info: {iso: string, position: number, total: number, calls: number}) => void} [params.onProgress]
 * @param {typeof extractDay} [params.extractDayFn] couture de test
 * @param {typeof runPackageInSandbox} [params.sandboxRunner] couture de test
 * @returns {Promise<{pkg: {id: string, version: string}, engine: boolean,
 *   days: Array<{iso: string, document: object}>, llmCalls: number, durationMs: number}>}
 */
export async function runVersionOnDays({
  pkg,
  dayGroups,
  referentiel,
  provider: rawProvider,
  model,
  maxTokens,
  perimetre,
  temperature,
  signal,
  onProgress,
  extractDayFn = extractDay,
  sandboxRunner = runPackageInSandbox,
  executerTwin6Fn = executerTwin6,
} = {}) {
  // Enveloppe UNIQUE du provider, pour couvrir uniformément les trois chemins
  // (moteur, sandbox, Twin6) : température injectée, et usage RÉEL cumulé
  // (compteurs {inputTokens, outputTokens} renvoyés par chaque fournisseur —
  // la mesure autoritaire, par opposition aux estimations pré-run).
  const usage = { inputTokens: 0, outputTokens: 0, mesures: 0 }
  const provider = {
    complete: async (params) => {
      const withTemp =
        temperature === undefined || temperature === null
          ? params
          : { ...params, temperature }
      const res = await rawProvider.complete(withTemp)
      if (res?.usage && typeof res.usage === 'object') {
        usage.inputTokens += Number(res.usage.inputTokens) || 0
        usage.outputTokens += Number(res.usage.outputTokens) || 0
        usage.mesures += 1
      }
      return res
    },
  }

  // Périmètre restreint : calculé UNE fois ici pour router (le moteur refait
  // son propre filtrage via l'option perimetre d'extractDay).
  const restriction = perimetre
    ? restreindreReferentiel(referentiel, perimetre)
    : { referentiel, partiel: false }

  // Twin6 (ou un fork) : run sur le portfolio ENTIER -> cartographie-merge.
  if (usesTwin6Engine(pkg)) {
    if (restriction.partiel) throw new Error(TWIN6_PERIMETRE_NOTE)
    const startedAt = Date.now()
    const templates = extractTwin6Templates(pkg)
    const portfolio = dayGroupsToPortfolio(dayGroups)
    let calls = 0
    const { document } = await executerTwin6Fn({
      portfolio,
      templates,
      referentiel,
      provider,
      model,
      options: {
        maxTokens,
        signal,
        onProgress: (p) => {
          if (p?.phase === 'scan-pole' || p?.phase === 'kairos') {
            calls = (p.done ?? 0) + 1
            // phase transmise : le run Twin6 porte sur le portfolio ENTIER,
            // l'UI ne doit pas afficher une progression « par jour ».
            onProgress?.({ iso: '', position: calls, total: p.total ?? 8, calls, phase: p.phase })
          }
        },
      },
    })
    return {
      pkg: { id: pkg.id, version: pkg.version },
      engine: true,
      twin6: true,
      mergeDoc: document,
      days: [],
      llmCalls: calls || 8,
      durationMs: Date.now() - startedAt,
      usage,
    }
  }

  const engine = usesEngineOrchestration(pkg)
  const startedAt = Date.now()
  const days = []
  let llmCalls = 0

  for (let i = 0; i < dayGroups.length; i++) {
    const { iso, texte } = dayGroups[i]
    const report = (calls) =>
      onProgress?.({ iso, position: i + 1, total: dayGroups.length, calls })
    report(llmCalls)
    let document
    if (engine) {
      document = await extractDayFn({
        dayText: texte,
        date: iso,
        referentiel,
        provider,
        model,
        maxTokens,
        perimetre,
        signal,
        kairosOptional: true,
        onProgress: () => {
          llmCalls += 1
          report(llmCalls)
        },
      })
    } else {
      const result = await sandboxRunner({
        pkg,
        dayText: texte,
        date: iso,
        // Sandbox : le périmètre passe par le référentiel restreint ; les
        // paquets « propres » itèrent referentiel.poles/competences et ne
        // produisent donc que le périmètre. Le schéma exigeant 7 pôles, la
        // validation devient tolérante (sonde) sur périmètre partiel.
        referentiel: restriction.referentiel,
        provider,
        model,
        maxTokens,
        signal,
        ...(restriction.partiel ? { validateFn: validatePartialJour } : {}),
        onLlmCall: ({ calls }) => report(llmCalls + calls),
      })
      llmCalls += result.llmCalls
      document = result.document
      // Même marqueur que le moteur (extractDay) : sans lui, l'export du run
      // ne se réimporterait pas comme référence (validation stricte 7 pôles).
      if (restriction.partiel && document && typeof document === 'object') {
        document = {
          ...document,
          perimetre: {
            partiel: true,
            poles: restriction.referentiel.poles.map((p) => Number(p.num)),
            competences: restriction.referentiel.competences.map((c) => c.code).sort(),
          },
        }
      }
    }
    days.push({ iso, document })
  }

  return {
    pkg: { id: pkg.id, version: pkg.version },
    engine,
    days,
    llmCalls,
    durationMs: Date.now() - startedAt,
    usage,
  }
}

/**
 * Rapport de consistance multi-run : pour chaque journée, engine compareRuns
 * sur les N documents produits par les N runs.
 *
 * @param {Array<{days: Array<{iso: string, document: object}>}>} runs ≥ 2 runs
 *   de la MÊME version sur le MÊME portfolio
 * @returns {{nbRuns: number, parJour: Array<{iso: string, comparison: object}>,
 *   distanceMoyenne: number}}
 */
export function buildMultiRunReport(runs) {
  if (!Array.isArray(runs) || runs.length < 2) {
    throw new TypeError('buildMultiRunReport : au moins 2 runs requis')
  }
  const isos = runs[0].days.map((d) => d.iso)
  const parJour = []
  let distanceSum = 0
  for (const iso of isos) {
    const docs = runs.map((run) => run.days.find((d) => d.iso === iso)?.document).filter(Boolean)
    if (docs.length !== runs.length) continue
    const comparison = compareRuns(docs)
    parJour.push({ iso, comparison })
    distanceSum += comparison.distanceStructurelle
  }
  return {
    nbRuns: runs.length,
    parJour,
    distanceMoyenne: parJour.length > 0 ? distanceSum / parJour.length : 0,
  }
}

/**
 * Rapport A/B : deux versions sur le MÊME portfolio — compétences détectées,
 * statuts, coûts/temps mesurés et estimés. Sérialisable en JSON (téléchargeable).
 *
 * @param {object} params
 * @param {string} params.portfolioLabel
 * @param {{pkg: object, days: Array, llmCalls: number, durationMs: number}} params.a
 * @param {{pkg: object, days: Array, llmCalls: number, durationMs: number}} params.b
 * @param {{a: object|null, b: object|null}} [params.estimates] sorties buildEstimate
 * @param {{a: object|null, b: object|null}} [params.configs] configuration par
 *   branche (fournisseur, modèle, version du référentiel…) — traçabilité du rapport
 * @param {() => string} [params.now] horloge injectable
 * @returns {object} rapport JSON
 */
export function buildAbReport({
  portfolioLabel,
  a,
  b,
  estimates = {},
  configs = {},
  now = () => new Date().toISOString(),
}) {
  // Union des journées des deux côtés : une référence importée (ou un run
  // restreint) peut couvrir des jours absents de l'autre branche — les totaux
  // (etabliesTotal) sommant TOUTES les journées, parJour doit faire de même.
  const isos = [
    ...new Set([...a.days.map((d) => d.iso), ...b.days.map((d) => d.iso)]),
  ].sort()
  const vide = { etablies: [], renvois: [], nonEtablies: [] }
  const parJour = isos.map((iso) => {
    const docA = a.days.find((d) => d.iso === iso)?.document
    const docB = b.days.find((d) => d.iso === iso)?.document
    const resumeA = docA ? summarizeDocument(docA) : vide
    const resumeB = docB ? summarizeDocument(docB) : vide
    const diff = compareCodes(resumeA.etablies, resumeB.etablies)
    // couvertA/couvertB : une journée absente d'un côté n'est pas un désaccord
    // (scoreVsReference l'écarte du score au lieu de la compter FP/FN).
    return {
      iso,
      couvertA: Boolean(docA),
      couvertB: Boolean(docB),
      a: resumeA,
      b: resumeB,
      ...diff,
    }
  })
  const totals = (runResult) => ({
    version: `${runResult.pkg.id}@${runResult.pkg.version}`,
    llmCalls: runResult.llmCalls,
    durationMs: runResult.durationMs,
    usage: runResult.usage ?? null,
    etabliesTotal: runResult.days.reduce(
      (sum, d) => sum + summarizeDocument(d.document).etablies.length,
      0,
    ),
  })
  return {
    kind: 'rapport-ab-prompt-packages',
    genereLe: now(),
    portfolio: { label: portfolioLabel, jours: isos },
    versions: { a: totals(a), b: totals(b) },
    configurations: {
      a: configs.a ?? null,
      b: configs.b ?? null,
    },
    estimations: {
      a: estimates.a ?? null,
      b: estimates.b ?? null,
    },
    parJour,
  }
}

/**
 * URL data: du rapport JSON (téléchargement sans Blob — fonctionne aussi en
 * environnement de test jsdom et sur copie statique).
 * @param {object} report
 * @returns {string}
 */
export function reportDataUrl(report) {
  return `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(report, null, 2))}`
}
