// humanome engine — étage C : extraction journalière (plan-portage-moteur §Étage C).
//
// Les prompts d'extraction originaux du protocole Aurora v3 n'existent pas dans
// les assets : ce module les RECRÉE depuis le protocole OBSERVÉ dans les
// 59 documents `cartographie-jour` réels (web/public/data/demo/jours/) et le
// schéma qui en est déduit (schemas/cartographie-jour.schema.json) :
//
//  1. LE GREFFIER relève les passages saillants du pôle puis verse, compétence
//     par compétence, des pièces {pid, numero, contexte}. Aucune pièce →
//     court-circuit (pedagogue: null, verdict {raison, prescriptionMinimale,
//     confiance: 1, 0 preuve / 0 indice} — constantes observées sur les
//     1653 court-circuits du corpus).
//  2. LE PÉDAGOGUE adversarial : présomption d'ABSENCE (piecesQuiResistent) →
//     présomption de SYCOPHANTIE (examenPieces, attaques a..h) → conclusion
//     adversariale {raisonnement, confianceFinale}. La typologie a..h est
//     rétro-nommée depuis le corpus lui-même (les raisonnements citent
//     littéralement « (a) insuffisance probatoire », « (g) mouvement-vers »…).
//  3. LE VERDICT : tracesRetenues qualifiées {type, role}, puis verdict
//     {statut à 3 valeurs, nombrePreuves, nombreIndices, confiance, motif,
//     prescription}. Invariants observés : confiance = confianceFinale
//     (1937/1937), nombrePreuves/nombreIndices = comptage des rôles des
//     tracesRetenues (1126/1162).
//  4. auditPole (6 compteurs) + rapport narratif du pôle.
//  5. KAIROS transversal (1 appel pour la journée entière) : portrait de
//     l'apprenant + émergences cross-pôles.
//
// Aucune parité de contenu possible (pas d'oracle amont) : la sortie est
// vérifiée STRUCTURELLEMENT via ajv (validation.js) — cf. plan, points de
// non-parité assumés.
//
// Module ESM pur : zéro DOM, zéro E/S — le texte de la journée, le référentiel
// et le provider sont injectés par l'appelant.

import { validateDocument } from '../validation.js'
import { formatDateFr } from './narrative-prompts.js'

// --- Typologie des attaques du pédagogue (protocole Aurora v3) --------------
// Noms retrouvés dans les raisonnements du corpus réel (« l'attaque (a)
// insuffisance probatoire… ») ; définitions déduites des 2895 motifAttaque.
export const ATTAQUES = Object.freeze({
  a: Object.freeze({
    nom: 'insuffisance probatoire',
    description:
      "la pièce dit moins que ce qu'on lui fait dire : trace brève ou terminale, "
      + 'cadre posé sans le travail concret montré, portée plus limitée que la compétence visée.',
  }),
  b: Object.freeze({
    nom: 'confusion de compétence',
    description:
      "la pièce active en réalité une AUTRE compétence du référentiel que celle du dossier "
      + '(citer le code de la compétence mieux servie).',
  }),
  c: Object.freeze({
    nom: 'biais de medium',
    description:
      "l'acte s'exerce dans un cadre au rabais — face à une IA, dans le journal lui-même, "
      + 'hors situation réelle — qui réduit sa portée transférable.',
  }),
  d: Object.freeze({
    nom: 'glissement lexical',
    description:
      'le vocabulaire de la compétence apparaît sans sa charge sémantique : mot plaqué, '
      + 'formule sans la mécanique qui la justifierait.',
  }),
  e: Object.freeze({
    nom: 'surinterprétation pédagogique',
    description:
      "le sens est projeté par l'analyste : lecture ajoutée que le texte de l'apprenant "
      + "n'autorise pas explicitement.",
  }),
  f: Object.freeze({
    nom: 'récit performatif',
    description:
      "l'apprenant raconte, nomme ou conceptualise l'acte au lieu de le montrer en acte : "
      + 'déclaration sans démonstration.',
  }),
  g: Object.freeze({
    nom: 'mouvement-vers',
    description:
      "intention, annonce ou projet différé : le geste est à venir, pas accompli sur cette feuille.",
  }),
  h: Object.freeze({
    nom: 'faux positif de fiche',
    description:
      'le marqueur de la compétence est activé à tort : production co-écrite par une IA ou '
      + 'coïncidence de surface avec le critère.',
  }),
})

export const VERDICTS_ATTAQUE = Object.freeze([
  'attaque non recevable, pièce confirmée',
  'pièce affaiblie mais retenue',
  'pièce disqualifiée',
])

export const STATUTS = Object.freeze([
  'présence établie',
  'présence non établie',
  'renvoi au cartographe',
])

/** Raison de court-circuit, valeur unique observée sur tout le corpus. */
export const RAISON_COURT_CIRCUIT = 'aucune pièce extraite par le Greffier'

// --- Aides internes ----------------------------------------------------------

function requireReferentiel(referentiel) {
  if (!Array.isArray(referentiel?.poles) || !Array.isArray(referentiel?.competences)) {
    throw new TypeError('extract : referentiel avec poles[] et competences[] requis')
  }
}

function requireDay(dayText, date) {
  if (typeof dayText !== 'string' || dayText.trim() === '') {
    throw new TypeError('extract : dayText (texte de la journée, non vide) requis')
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError('extract : date au format AAAA-MM-JJ requise')
  }
}

function attaquesBloc() {
  return Object.entries(ATTAQUES)
    .map(([lettre, { nom, description }]) => `  ${lettre} — ${nom} : ${description}`)
    .join('\n')
}

function referentielBloc(referentiel, poleNum = null) {
  const poles = [...referentiel.poles].sort((a, b) => a.num - b.num)
  const lignes = []
  for (const pole of poles) {
    if (poleNum !== null && pole.num !== poleNum) continue
    lignes.push(`Pôle ${pole.num} — ${pole.nom}`)
    const comps = referentiel.competences
      .filter((c) => c.pole === pole.num)
      .sort((a, b) => (a.code < b.code ? -1 : 1))
    for (const c of comps) lignes.push(`  ${c.code} — ${c.nom}`)
  }
  return lignes.join('\n')
}

// --- Prompt d'extraction d'un pôle ------------------------------------------

/**
 * Construit le prompt d'extraction d'UN pôle pour une journée (recréé — les
 * prompts originaux n'existent pas ; protocole déduit du corpus réel).
 *
 * @param {object} params
 * @param {object} params.referentiel document `referentiel` (poles[], competences[])
 * @param {number|string} params.poleNum numéro du pôle (1..7)
 * @param {string} params.dayText texte intégral de la feuille de portfolio du jour
 * @param {string} params.date date ISO AAAA-MM-JJ de la feuille
 * @returns {string} prompt français exigeant une sortie JSON stricte au schéma
 *   `poles[]` de cartographie-jour.schema.json
 */
export function buildExtractionPrompt({ referentiel, poleNum, dayText, date } = {}) {
  requireReferentiel(referentiel)
  requireDay(dayText, date)
  const num = Number(poleNum)
  const pole = referentiel.poles.find((p) => p.num === num)
  if (!pole) {
    throw new TypeError(`buildExtractionPrompt : poleNum ${poleNum} absent du référentiel`)
  }
  const comps = referentiel.competences
    .filter((c) => c.pole === num)
    .sort((a, b) => (a.code < b.code ? -1 : 1))
  const codes = comps.map((c) => c.code)

  return `Tu es le moteur de cartographie de compétences du protocole Aurora v3 (humanome.xyz).
Tu analyses UNE feuille de portfolio réflexif pour UN pôle du référentiel RESPIRE, en jouant
successivement trois rôles : LE GREFFIER, LE PÉDAGOGUE adversarial, LE RAPPORTEUR.

# Feuille de portfolio du ${formatDateFr(date)} (${date})

<portfolio>
${dayText.trim()}
</portfolio>

# Pôle ${num} — ${pole.nom}

Compétences du pôle (les seules à instruire, toutes obligatoirement présentes dans ta sortie) :
${referentielBloc(referentiel, num)}

# Protocole

## 1. LE GREFFIER (instruction à décharge)
- Relève les passages du portfolio saillants pour CE pôle : \`passagesSaillants\`, chacun
  {pid (entier ≥ 1, numérotation continue dans la journée), feuille ("${date}"),
  extraitVerbatim (citation EXACTE du portfolio), contexte (ce que l'apprenant faisait ou
  racontait), auteur ("apprenant" ou "tiers_nomme")}. Tableau vide si rien de saillant.
- Pour CHAQUE compétence du pôle, verse au dossier les pièces pertinentes : \`pieces\`,
  chacune {pid (renvoie à passagesSaillants[].pid), numero (rang 1..n dans le dossier de la
  compétence), contexte (ce que la pièce montre par rapport à la compétence)}.
- Compétence sans AUCUNE pièce → COURT-CIRCUIT : courtCircuit=true, pieces=[],
  pedagogue=null, tracesRetenues=[], verdict {statut "présence non établie",
  nombrePreuves 0, nombreIndices 0, confiance 1,
  raison EXACTEMENT "${RAISON_COURT_CIRCUIT}",
  prescriptionMinimale (comment ouvrir ce dossier dans une prochaine feuille)}.

## 2. LE PÉDAGOGUE (examen adversarial, uniquement si au moins une pièce)
a) \`presomptionAbsence\` : présume la compétence ABSENTE ; raisonnement à charge, puis
   \`piecesQuiResistent\` [{pieceId (= pieces[].numero), motifResistance}] — uniquement les
   pièces qui survivent (tableau vide sinon).
b) \`presomptionSycophantie\` : attaque chaque pièce survivante comme possible complaisance ;
   raisonnement, puis \`examenPieces\` [{pieceId, attaqueDominante (une lettre a..h),
   motifAttaque (formulation de l'attaque), verdictAttaque}].
   Typologie des attaques (choisis la DOMINANTE) :
${attaquesBloc()}
   verdictAttaque ∈ {"attaque non recevable, pièce confirmée", "pièce affaiblie mais retenue",
   "pièce disqualifiée"}.
c) \`conclusionAdversariale\` : {raisonnement (synthèse : ce qui a tenu, ce qui est tombé),
   confianceFinale (nombre 0..1)}.

## 3. LE VERDICT (par compétence instruite)
- \`tracesRetenues\` : pièces qui survivent aux deux présomptions, chacune
  {pieceId, type ∈ {"trace concrète", "déclaration étayée", "observation tierce"},
  role ∈ {"preuve décisive", "indice corroboratif"}}. Tableau vide si rien ne survit.
- \`verdict\` : {statut, nombrePreuves (= nombre de tracesRetenues au role "preuve décisive"),
  nombreIndices (= nombre au role "indice corroboratif"), confiance (= confianceFinale du
  pédagogue), motif (motivation du verdict), prescription (comment mieux documenter cette
  compétence dans le portfolio)}.
- Statuts possibles, et seulement ceux-ci :
  - "présence établie" : au moins une preuve décisive, ou des indices convergents ;
    confiance ≥ 0.5 ;
  - "renvoi au cartographe" : doute réel qui appelle un arbitrage humain (indices sans preuve
    décisive, confiance typiquement entre 0.3 et 0.6) ;
  - "présence non établie" : rien n'a survécu à l'examen.

## 4. L'AUDIT DU PÔLE
\`auditPole\` : {competencesTotales (= ${codes.length}), courtCircuits,
competencesNonCourtCircuit, presencesEtablies, renvoisCartographe, nonEtablies} —
compteurs COHÉRENTS avec tes verdicts.

## 5. LE RAPPORTEUR
\`rapport\` : rapport narratif du pôle adressé à l'apprenant (vouvoiement proscrit : parle de
« l'apprenant »), {portraitPole, emergencesPole, territoiresDenses
[{competence, description, extraitVerbatim, ceQueCaDit}], territoiresNonVisites,
pistes [1..7 chaînes], rapportCompletMarkdown (rapport complet en Markdown)}.

# Contraintes de longueur (impératives — la réponse est coupée au-delà du budget de sortie)

- Le COURT-CIRCUIT est la forme compacte OBLIGATOIRE pour toute compétence sans pièce :
  ne développe le pédagogue QUE pour les compétences réellement documentées par la feuille.
- raisonnements, motifs, contextes, motifsAttaque, motifResistance : 1 à 2 phrases chacun ;
- extraitVerbatim : 150 caractères maximum (coupe avec « … ») ;
- rapport : portraitPole, emergencesPole, territoiresNonVisites en 400 caractères maximum
  chacun ; territoiresDenses et pistes : 3 éléments maximum ; rapportCompletMarkdown :
  1 000 caractères maximum.
  Densité avant exhaustivité : une instruction courte et juste vaut mieux qu'une
  instruction longue tronquée.

# Format de sortie

Réponds UNIQUEMENT par un objet JSON strict (aucun texte avant ou après, pas de bloc de code),
exactement au gabarit suivant — competences DOIT contenir les ${codes.length} codes
${codes.join(', ')} dans cet ordre :

{
  "poleNum": "${num}",
  "passagesSaillants": [
    { "pid": 1, "feuille": "${date}", "extraitVerbatim": "…", "contexte": "…", "auteur": "apprenant" }
  ],
  "competences": [
    {
      "code": "${codes[0]}",
      "courtCircuit": false,
      "pieces": [ { "pid": 1, "numero": 1, "contexte": "…" } ],
      "pedagogue": {
        "presomptionAbsence": { "raisonnement": "…", "piecesQuiResistent": [ { "pieceId": 1, "motifResistance": "…" } ] },
        "presomptionSycophantie": { "raisonnement": "…", "examenPieces": [ { "pieceId": 1, "attaqueDominante": "g", "motifAttaque": "…", "verdictAttaque": "pièce affaiblie mais retenue" } ] },
        "conclusionAdversariale": { "raisonnement": "…", "confianceFinale": 0.35 }
      },
      "tracesRetenues": [ { "pieceId": 1, "type": "déclaration étayée", "role": "indice corroboratif" } ],
      "verdict": { "statut": "renvoi au cartographe", "nombrePreuves": 0, "nombreIndices": 1, "confiance": 0.35, "motif": "…", "prescription": "…" }
    }
  ],
  "auditPole": { "competencesTotales": ${codes.length}, "courtCircuits": 0, "competencesNonCourtCircuit": 0, "presencesEtablies": 0, "renvoisCartographe": 0, "nonEtablies": 0 },
  "rapport": {
    "portraitPole": "…", "emergencesPole": "…",
    "territoiresDenses": [ { "competence": "…", "description": "…", "extraitVerbatim": "…", "ceQueCaDit": "…" } ],
    "territoiresNonVisites": "…", "pistes": [ "…" ], "rapportCompletMarkdown": "…"
  }
}`
}

// --- Prompt kairos transversal -----------------------------------------------

/**
 * Construit le prompt de la synthèse kairos transversale de la journée
 * (1 appel après les 7 pôles). Recréé, comme buildExtractionPrompt.
 *
 * @param {object} params { referentiel, dayText, date }
 * @returns {string} prompt exigeant une sortie JSON stricte au schéma
 *   `kairos` (kairosJour) de cartographie-jour.schema.json
 */
export function buildKairosExtractionPrompt({ referentiel, dayText, date } = {}) {
  requireReferentiel(referentiel)
  requireDay(dayText, date)

  return `Tu es le moteur de cartographie de compétences du protocole Aurora v3 (humanome.xyz).
Les 7 pôles de la feuille du jour ont déjà été instruits séparément. Tu produis maintenant la
SYNTHÈSE KAIROS transversale de la journée : une lecture cross-pôles adressée à l'apprenant
(parle de « l'apprenant », jamais « vous »), attentive à ce qui relie les pôles et à ce qui
émerge entre les lignes.

# Feuille de portfolio du ${formatDateFr(date)} (${date})

<portfolio>
${dayText.trim()}
</portfolio>

# Référentiel RESPIRE (7 pôles, ${referentiel.competences.length} compétences)

${referentielBloc(referentiel)}

# Attendus

1. \`kairos.apprenant\` : {portrait (l'apprenant tel qu'il ressort de la feuille),
   formeProfil (relief du profil : sommets, plateaux, vallées), ceQuiRelieLesPoles
   (fils conducteurs entre pôles), ceQuiEmergeEntreLesLignes (ce que la feuille suggère
   sans le dire), invitationsPourLaSuite (3 à 5 invitations concrètes pour les prochaines
   feuilles), syntheseCompleteMarkdown (synthèse complète en Markdown)}.
2. \`emergencesCrossPoles\` :
   - connexionsTransversales [{titre, description, codesRelies (≥ 2 codes de compétences de
     pôles DIFFÉRENTS), piecesCommunes (pid des passages du jour communs, [] sinon)}] ;
   - noeudsConceptuels [{nom, description, codesRelies (≥ 2 codes)}] ;
   - competencesOrphelines [{titre, description, extraitsPortfolio (≥ 1 citation),
     enRelationAvecCodes (≥ 1 code du référentiel)}] — compétences manifestées dans la
     feuille mais ABSENTES du référentiel (matière pour les épistémiarques).
   Tableaux vides quand rien n'émerge.

# Contraintes de longueur (impératives — la réponse est coupée au-delà du budget de sortie)

- portrait, formeProfil, ceQuiRelieLesPoles, ceQuiEmergeEntreLesLignes : 500 caractères
  MAXIMUM chacun ;
- invitationsPourLaSuite : 3 invitations d'une phrase chacune ;
- syntheseCompleteMarkdown : 1 500 caractères maximum ;
- émergences : 3 éléments maximum par tableau, descriptions de 300 caractères maximum.
  Densité avant exhaustivité : une synthèse courte et juste vaut mieux qu'une synthèse
  longue tronquée.

# Format de sortie

Réponds UNIQUEMENT par un objet JSON strict (aucun texte avant ou après, pas de bloc de code),
exactement au gabarit :

{
  "kairos": {
    "apprenant": {
      "portrait": "…", "formeProfil": "…", "ceQuiRelieLesPoles": "…",
      "ceQuiEmergeEntreLesLignes": "…",
      "invitationsPourLaSuite": [ "…", "…", "…" ],
      "syntheseCompleteMarkdown": "…"
    }
  },
  "emergencesCrossPoles": {
    "connexionsTransversales": [ { "titre": "…", "description": "…", "codesRelies": [ "1.01", "4.02" ], "piecesCommunes": [] } ],
    "noeudsConceptuels": [ { "nom": "…", "description": "…", "codesRelies": [ "1.01", "4.02" ] } ],
    "competencesOrphelines": [ { "titre": "…", "description": "…", "extraitsPortfolio": [ "…" ], "enRelationAvecCodes": [ "1.01" ] } ]
  }
}`
}

// --- Parseur tolérant de la réponse LLM --------------------------------------

/**
 * Retire les virgules terminales avant } ou ] (réparation JSON fréquente),
 * SANS toucher au contenu des chaînes : une regex naïve corromprait
 * silencieusement une valeur comme "x, ]" (bug relevé en revue adversariale).
 */
function stripTrailingCommas(s) {
  let out = ''
  let inString = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      out += ch
      if (ch === '\\') {
        out += s[i + 1] ?? ''
        i += 1
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      continue
    }
    if (ch === ',') {
      let j = i + 1
      while (j < s.length && /\s/.test(s[j])) j += 1
      if (s[j] === '}' || s[j] === ']') continue // virgule terminale : ignorée
    }
    out += ch
  }
  return out
}

/**
 * Extrait du texte les objets `{…}` équilibrés (accolades comptées HORS
 * chaînes), du plus long au plus court : dans une réponse LLM, la charge
 * utile est l'objet dominant, pas une accolade incidente de la prose.
 */
function balancedObjects(s, limit = 8) {
  const found = []
  for (let i = 0; i < s.length && found.length < limit; i++) {
    if (s[i] !== '{') continue
    let depth = 0
    let inString = false
    for (let j = i; j < s.length; j++) {
      const ch = s[j]
      if (inString) {
        if (ch === '\\') j += 1
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          found.push(s.slice(i, j + 1))
          i = j // reprend le balayage après cet objet
          break
        }
      }
    }
  }
  return found.sort((a, b) => b.length - a.length)
}

/**
 * Extrait l'objet JSON d'une réponse LLM, avec tolérance : bloc \`\`\`json,
 * prose autour de l'objet, virgules terminales. Erreurs claires sinon.
 *
 * @param {string} text réponse brute du provider
 * @returns {object|null} l'objet pôle/kairos (null si la réponse est le
 *   littéral JSON \`null\` — kairos absent)
 * @throws {Error} si aucun JSON exploitable n'est trouvé, ou si le JSON
 *   n'est ni un objet ni null
 */
export function parseExtractionResponse(text) {
  if (typeof text !== 'string') {
    throw new TypeError('parseExtractionResponse : text (string) requis')
  }
  const candidates = []
  const trimmed = text.replace(/^﻿/, '').trim()
  candidates.push(trimmed)
  // Bloc(s) de code ```json … ``` (le premier).
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) candidates.push(fence[1].trim())
  // Objets équilibrés trouvés dans le texte (prose autour/entre accolades),
  // du plus long au plus court — couvre aussi « bla {…} : {vrai objet} ».
  candidates.push(...balancedObjects(trimmed))
  // Filet : du premier { au dernier } (objet tronqué → message d'erreur utile).
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1))

  let lastError = null
  for (const candidate of candidates) {
    if (candidate === '') continue
    for (const variant of [candidate, stripTrailingCommas(candidate)]) {
      try {
        const parsed = JSON.parse(variant)
        if (parsed === null) return null
        if (typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
        throw new Error(
          `parseExtractionResponse : JSON de type ${Array.isArray(parsed) ? 'array' : typeof parsed}, objet attendu`,
        )
      } catch (err) {
        lastError = err
        if (err instanceof Error && err.message.startsWith('parseExtractionResponse :')) throw err
      }
    }
  }
  const extrait = trimmed.slice(0, 160).replace(/\s+/g, ' ')
  throw new Error(
    'parseExtractionResponse : aucun JSON valide trouvé dans la réponse '
    + `(début : « ${extrait}${trimmed.length > 160 ? '…' : ''} ») — ${lastError?.message ?? 'réponse vide'}`,
  )
}

// --- Extraction complète d'une journée ----------------------------------------

/**
 * Recomputes the pole audit counters from the verdicts themselves (LLM-emitted
 * counters drift easily; the source data is authoritative). Semantics verified
 * against the real corpus: nonEtablies counts EVERY « présence non établie »
 * verdict, court-circuits included (sums to competencesTotales with the two
 * other statuses).
 *
 * @param {Array<object>} competences
 * @returns {{competencesTotales: number, competencesNonCourtCircuit: number,
 *   presencesEtablies: number, renvoisCartographe: number, nonEtablies: number,
 *   courtCircuits: number}}
 */
export function computeAuditPole(competences) {
  const count = (fn) => competences.filter(fn).length
  const courtCircuits = count((c) => c.courtCircuit === true)
  return {
    competencesTotales: competences.length,
    competencesNonCourtCircuit: competences.length - courtCircuits,
    presencesEtablies: count((c) => c.verdict?.statut === 'présence établie'),
    renvoisCartographe: count((c) => c.verdict?.statut === 'renvoi au cartographe'),
    nonEtablies: count((c) => c.verdict?.statut === 'présence non établie'),
    courtCircuits,
  }
}

/**
 * Extraction complète d'une journée : 7 appels pôle + 1 appel kairos, puis
 * assemblage et validation ajv du document `cartographie-jour`.
 *
 * Zéro E/S propre (P5) : le texte, le référentiel et le provider viennent de
 * l'appelant ; l'interruption passe par `signal` (transmis aux appels).
 *
 * @param {object} params
 * @param {string} params.dayText texte intégral de la feuille du jour
 * @param {string} params.date date ISO AAAA-MM-JJ
 * @param {object} params.referentiel document `referentiel`
 * @param {{complete: Function}} params.provider provider LLM (createProvider
 *   ou createMockProvider)
 * @param {string} [params.model='default'] modèle passé au provider
 * @param {number} [params.maxTokens] budget de sortie par appel
 * @param {number} [params.temperature]
 * @param {AbortSignal} [params.signal]
 * @param {boolean} [params.kairosOptional=false] quand vrai, un échec de la
 *   synthèse kairos DÉGRADE le document (kairos: null, accepté par le schéma)
 *   au lieu de faire échouer le run entier — utilisé par la démo publique où
 *   les 7 documents de pôle sont la valeur principale
 * @param {(progress: {step: 'pole'|'kairos', poleNum: number|null,
 *   done: number, total: number, skipped?: boolean}) => void} [params.onProgress]
 *   appelé après chaque appel réussi (done = appels terminés, total = 8)
 * @returns {Promise<object>} document `cartographie-jour` validé
 * @throws {Error} appel/parse en échec (contexte pôle + date dans le message),
 *   ou document final invalide au schéma
 */
export async function extractDay({
  dayText,
  date,
  referentiel,
  provider,
  model = 'default',
  maxTokens,
  temperature,
  signal,
  kairosOptional = false,
  onProgress,
} = {}) {
  requireReferentiel(referentiel)
  requireDay(dayText, date)
  if (typeof provider?.complete !== 'function') {
    throw new TypeError('extractDay : provider avec complete() requis')
  }

  const poleNums = [...referentiel.poles].map((p) => p.num).sort((a, b) => a - b)
  const total = poleNums.length + 1
  let done = 0
  const poles = []

  for (const num of poleNums) {
    const prompt = buildExtractionPrompt({ referentiel, poleNum: num, dayText, date })
    let pole
    try {
      const res = await provider.complete({ model, prompt, maxTokens, temperature, signal })
      if (res.stopReason === 'max_tokens') {
        // Fail loudly: a truncated response parses into a FRAGMENT (typically
        // one inner competence object) and poisons the final document.
        throw new Error(
          'réponse tronquée (budget de sortie atteint) — réduisez le texte de la journée',
        )
      }
      pole = parseExtractionResponse(res.text)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`extractDay : pôle ${num} (${date}) — ${message}`, { cause: err })
    }
    if (pole === null) {
      throw new Error(`extractDay : pôle ${num} (${date}) — réponse null, objet pôle attendu`)
    }
    if (!Array.isArray(pole.competences)) {
      // Typical signature of a fragment extracted from a broken response.
      throw new Error(
        `extractDay : pôle ${num} (${date}) — réponse sans tableau competences (objet ${Object.keys(pole).slice(0, 5).join('/')})`,
      )
    }
    // Réparation minimale : poleNum normalisé en chaîne, injecté si absent.
    pole.poleNum = pole.poleNum === undefined ? String(num) : String(pole.poleNum)
    if (pole.poleNum !== String(num)) {
      throw new Error(
        `extractDay : pôle ${num} (${date}) — poleNum incohérent dans la réponse (« ${pole.poleNum} »)`,
      )
    }
    // Compteurs d'audit recalculés (déterministes) : les compteurs produits
    // par le modèle dérivent facilement ; la donnée source fait foi.
    pole.auditPole = computeAuditPole(pole.competences)
    if (!Array.isArray(pole.passagesSaillants)) pole.passagesSaillants = []
    if (pole.rapport === undefined) pole.rapport = null
    poles.push(pole)
    done += 1
    onProgress?.({ step: 'pole', poleNum: num, done, total })
  }

  let kairos
  let kairosSkipped = false
  try {
    const prompt = buildKairosExtractionPrompt({ referentiel, dayText, date })
    const res = await provider.complete({ model, prompt, maxTokens, temperature, signal })
    if (res.stopReason === 'max_tokens') {
      throw new Error('réponse kairos tronquée (budget de sortie atteint)')
    }
    kairos = parseExtractionResponse(res.text)
  } catch (err) {
    // Les 7 documents de pôle portent la valeur ; le schéma accepte
    // kairos: null. En mode kairosOptional (démo publique), un échec de la
    // synthèse transversale dégrade le résultat au lieu de perdre le run.
    if (!kairosOptional || signal?.aborted) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`extractDay : kairos (${date}) — ${message}`, { cause: err })
    }
    kairos = null
    kairosSkipped = true
  }
  done += 1
  onProgress?.({ step: 'kairos', poleNum: null, done, total, skipped: kairosSkipped })

  const document = {
    schemaVersion: '1.0.0',
    kind: 'cartographie-jour',
    date,
    poles,
    kairos,
  }
  const { valid, errors } = validateDocument('cartographie-jour', document)
  if (!valid) {
    const detail = errors.slice(0, 5).map((e) => `${e.path} ${e.message}`).join(' ; ')
    throw new Error(
      `extractDay : document du ${date} invalide au schéma cartographie-jour `
      + `(${errors.length} erreur(s) : ${detail})`,
    )
  }
  return document
}
