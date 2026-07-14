// Port INTÉGRAL de aurora/tribunal9.py — tribunal conforme au mémoire Aurora :
// une équipe de recherche, pas un banc de vote.
//
// Séquence sur un dossier (journée, ou faisceau inter-journées) :
//   20-greffier (mini) → [DOSSIER VIDE → court-circuit]     (journée seulement)
//   21a accusation → 21b défense → 22a réplique → 22b briefing
//   23   jurés de fond, positions à trois voies :
//        détection / contestation (piège nommé) / abstention
//   23b/23c SECOND TOUR — un seul — si une position minoritaire subsiste :
//        la relance est rédigée par le juré minoritaire, chacun reprend la
//        parole une fois
//   25   DEUX gardiens de l'instrument (support, raisonnement) — jamais de
//        position sur la présence
//   RÉSOLUTION CALCULÉE (personne ne vote, aucun modèle ne décide)
//   24-president : PORTE-PAROLE — récit + prescription ; le statut est calculé.
//
// Traces probantes = pièces du Greffier citées par les détections survivantes,
// RÉ-ANCRÉES dans le texte source (findVerbatim) : une citation introuvable ne
// devient jamais une preuve (incident « trace_tribunal_non_ancree »).
//
// Divergences assumées avec tribunal9.py (contrat spec-index §4.10) :
//   - PAS de ThreadPool : jurés appelés SÉQUENTIELLEMENT dans l'ordre du jury
//     (le mock ne dépend que de (salt, task, meta, model) et tous les dicts
//     de résultat sont indexés par nom puis relus dans l'ordre du jury — le
//     résultat est bit-identique à Python quel que soit l'ordre d'achèvement) ;
//   - pas de fs : caches d'étapes via ctx.artefacts (store injectable,
//     artefacts.js), gabarits confidentiels via ctx.protocole(relPath)
//     (défaut "" — le mock ignore le prompt ; les gabarits protocole/**/*.md
//     ne sont JAMAIS recopiés ici).
// Tous les index et troncatures sont en POINTS DE CODE.

import { pjoin } from "./artefacts.js";
import { resolveContent, varsClient } from "./templates.js";
import { extractJson, findVerbatim, logWarn, neutraliserBalises, stableHash } from "./util.js";
import { dictGet, pyTruthy } from "./py/pyDict.js";
import { pyIntOf } from "./py/pyDict.js";
import { PyFloat, codePointCompare } from "./py/pyJson.js";
import { PyRandom } from "./py/mt19937.js";
import { pyRound } from "./py/pyRound.js";
import { pyFormat, pyStr } from "./py/pyStr.js";
import { PY_WS_CLASS, cpSlice, pyStrip } from "./py/pyText.js";

// Le SOCLE : les quatre lunettes historiques (mémoire §3) — toujours présentes.
// Textes d'angle recopiés CARACTÈRE PAR CARACTÈRE depuis tribunal9.py (ce sont
// des constantes du code Python, pas des gabarits) : ils sont injectés dans
// les prompts ET entrent dans l'empreinte infosPersonas().
/** @type {[string, string][]} */
export const JURES_SOCLE = [
  ["Linguiste", "Tu lis la LANGUE : précision sémantique, glissements de sens, registres, " +
                "marqueurs d'appropriation. Ce que la manière de dire montre ou trahit."],
  ["Historien", "Tu lis le TEMPS, à l'échelle de ce dossier : la pièce décrit-elle un mouvement " +
                "(avant/après, essai/correction, mûrissement entre les dates) ou un état figé ?"],
  ["Pédagogue", "Tu lis l'APPRENTISSAGE : l'erreur travaillée, le geste d'apprendre. Une compétence " +
                "émergente n'est pas une absence ; un état n'est pas un mouvement."],
  ["Sociologue", "Tu lis le RELATIONNEL : comment l'apprenant parle des autres, quel rôle il se donne. " +
                 "Un élève qui s'ajuste sans briller montre des compétences relationnelles réelles — " +
                 "l'ordinaire n'est pas l'absence."],
];

// Le SPÉCIALISTE du pôle : cinquième siège, sensibilité liée au pôle.
/** @type {Map<number, [string, string]>} */
export const SPECIALISTES_POLE = new Map([
  [1, ["Ingénieur", "Tu lis le DISPOSITIF : la mécanique décrite tient-elle debout ? Chaînes " +
                    "causales, ordres de grandeur, choix techniques justifiés, détails vérifiables. " +
                    "Un montage réel résiste et surprend ; un récit technique fluide où rien ne " +
                    "casse jamais est un signal, pas une preuve."]],
  [2, ["Interprète", "Tu lis les PASSAGES DE FRONTIÈRE : changements de registre selon " +
                     "l'interlocuteur, traduction entre codes et cultures, ce que l'apprenant FAIT " +
                     "des différences. L'accommodation réelle laisse des traces (reformulation, " +
                     "renoncement à son propre code) ; l'ouverture déclarée n'en laisse pas."]],
  [3, ["Artisan", "Tu lis le GESTE et la matière : itérations, prototypes, ratés retravaillés, " +
                  "économie de moyens. La matière se venge — un vrai faire rencontre des " +
                  "résistances (outil, matériau, temps) ; un faire narré n'en rencontre aucune."]],
  [4, ["Éthicien", "Tu lis le DISCERNEMENT : un dilemme réellement pesé laisse des traces — le " +
                   "coût du renoncement, l'argument adverse honoré, la décision datée et assumée. " +
                   "Une posture morale déclarée n'en laisse pas. Tu lis le raisonnement éthique de " +
                   "l'apprenant, jamais celui du collège."]],
  [5, ["Clinicien du récit", "Tu lis la TRANSFORMATION : tension réelle entre l'ancien et le " +
                             "nouveau, deuil traversé vs rationalisation lisse (« c'est mieux comme " +
                             "ça »), affects situés vs intensité déclarée. La trace fiable contient " +
                             "une tension non résolue ; le récit embelli résout tout."]],
  [6, ["Politiste", "Tu lis la CITÉ, au sens large : le rapport aux règles et aux communs, la " +
                    "participation EN ACTE (quelle règle suivie, pliée, contestée ; qui convaincu ; " +
                    "quelle décision collective), et la place faite au vivant et aux non-humains " +
                    "dans les décisions. L'opinion déclarée n'est pas l'engagement."]],
  [7, ["Compagnon", "Tu lis la TRANSMISSION et le PILOTAGE : l'apprenant rend-il les autres " +
                    "capables (explicitation pour autrui, délégation outillée, retour donné) ? " +
                    "Tient-il un cap daté, le révise-t-il en le disant ? Faire soi-même n'est pas " +
                    "faire faire ; annoncer n'est pas piloter."]],
]);

// Transversaux, convoqués par des RÈGLES mécaniques (jamais par un modèle).
/** @type {[string, string]} */
export const ARCHIVISTE = ["Archiviste", "Tu lis la MATÉRIALITÉ des pièces : dates qui se recoupent, objets " +
                                         "nommés, quantités, personnes, cohérence factuelle ENTRE les pièces. " +
                                         "Tu ne juges pas le fond : tu vérifies que les faits cités tiennent " +
                                         "ensemble. Une incohérence factuelle est un motif de contestation " +
                                         "(piège : fabrication)."];
/** @type {[string, string]} */
export const PORTRAITISTE = ["Portraitiste", "Tu lis L'ÉCART À SOI : ce passage sort-il de la texture habituelle " +
                                             "de CE scripteur (précision soudaine, rupture de registre, première " +
                                             "personne inhabituelle) ? Appuie-toi sur la première impression. " +
                                             "L'ordinaire de l'un est l'exploit de l'autre — mais l'écart à soi " +
                                             "éclaire une pièce, il ne la remplace jamais."];

/** @type {Map<string, string>} */
export const BANQUE_ANGLES = new Map(JURES_SOCLE);
for (const [nom, angle] of SPECIALISTES_POLE.values()) BANQUE_ANGLES.set(nom, angle);
BANQUE_ANGLES.set(ARCHIVISTE[0], ARCHIVISTE[1]);
BANQUE_ANGLES.set(PORTRAITISTE[0], PORTRAITISTE[1]);

// Versionnage des personas — la version se déclare à la main à chaque
// évolution de la banque, l'empreinte se calcule toute seule sur le TEXTE des
// angles. Valeur CPython vérifiée : 1ec337d3a2ef (un test verrouille la
// coïncidence entre la constante et le calcul sur la banque portée).
export const PERSONAS_VERSION = "personas-v1";
export const PERSONAS_EMPREINTE = "1ec337d3a2ef";

/** @type {{version: string, empreinte: string}|null} */
let personasCache = null;

/** infos_personas() — {version, empreinte} (objet neuf à chaque appel). */
export function infosPersonas() {
  if (personasCache === null) {
    const noms = Array.from(BANQUE_ANGLES.keys()).sort(codePointCompare);
    const joint = noms.map((n) => pyFormat("%s=%s", n, BANQUE_ANGLES.get(n))).join("|");
    personasCache = { version: PERSONAS_VERSION, empreinte: stableHash(joint).toString(16) };
  }
  return { version: personasCache.version, empreinte: personasCache.empreinte };
}

// Mode « socle2+2 » (banc d'essai A/B) : socle réduit à Linguiste + Pédagogue,
// deux sièges variables par pôle.
/** @type {Map<number, [string, string]>} */
export const PAIRES_2PLUS2 = new Map([
  [1, ["Ingénieur", "Historien"]],
  [2, ["Interprète", "Sociologue"]],
  [3, ["Artisan", "Historien"]],
  [4, ["Éthicien", "Archiviste"]],
  [5, ["Clinicien du récit", "Portraitiste"]],
  [6, ["Politiste", "Sociologue"]],
  [7, ["Compagnon", "Historien"]],
]);

/**
 * Composition CALCULÉE du jury (aucun modèle ne choisit les jurés).
 * Modes (config jury.mode) : « socle4+1 » (défaut), « socle2+2 », « aleatoire »
 * (tirage MT19937 déterministe, bras de contrôle sans règles transversales).
 * Hors aléatoire : écriture « produite » → l'Archiviste siège ; second
 * ressort → le Portraitiste. Surcharges : jury.par_competence /
 * jury.specialistes (référentiel = loi).
 * @param {number} poleNum @param {object} config
 * @param {{authenticite?: string|null, faisceau?: boolean, code?: string|null,
 *   contexte?: string|null}} [opts]
 * @returns {[string, string][]}
 */
export function composerJury(poleNum, config, opts = {}) {
  const { authenticite = null, faisceau = false, code = null, contexte = null } = opts;
  // config.get("jury", {}) or {} — un jury: null compte comme {}
  const cfgjRaw = dictGet(config, "jury", {});
  const cfgj = pyTruthy(cfgjRaw) ? /** @type {object} */ (cfgjRaw) : {};
  const mode = pyStr(dictGet(cfgj, "mode", "socle4+1")).toLowerCase();

  if (mode === "aleatoire" || mode === "random") {
    const taille = Math.max(2, Math.min(6, pyIntOf(dictGet(cfgj, "taille_aleatoire", 5))));
    const noms = Array.from(BANQUE_ANGLES.keys()).sort(codePointCompare);
    // "jury|%s|%s|%s|%s" % (graine, code, contexte, pole) — None → "None"
    const rng = new PyRandom(
      stableHash(pyFormat("jury|%s|%s|%s|%s", dictGet(cfgj, "graine", 1), code, contexte, poleNum)),
    );
    return rng
      .sample(noms, Math.min(taille, noms.length))
      .map((n) => [n, /** @type {string} */ (BANQUE_ANGLES.get(n))]);
  }

  // (cfgj.par_competence or {})[code] or (cfgj.specialistes or {})[str(pole)]
  const parCompRaw = dictGet(cfgj, "par_competence", null);
  let nomSpec = dictGet(pyTruthy(parCompRaw) ? /** @type {object} */ (parCompRaw) : {}, /** @type {string} */ (code), null);
  if (!pyTruthy(nomSpec)) {
    const specsRaw = dictGet(cfgj, "specialistes", null);
    nomSpec = dictGet(pyTruthy(specsRaw) ? /** @type {object} */ (specsRaw) : {}, pyStr(poleNum), null);
  }

  /** @type {[string, string][]} */
  let jures;
  if (mode === "socle2+2" || mode === "2+2") {
    jures = JURES_SOCLE.filter(([n]) => n === "Linguiste" || n === "Pédagogue");
    let variables = Array.from(PAIRES_2PLUS2.has(poleNum) ? /** @type {[string, string]} */ (PAIRES_2PLUS2.get(poleNum)) : []);
    if (pyTruthy(nomSpec) && BANQUE_ANGLES.has(/** @type {string} */ (nomSpec))) {
      variables = [/** @type {string} */ (nomSpec), ...variables.slice(1)];
    }
    for (const n of variables) {
      if (BANQUE_ANGLES.has(n)) jures.push([n, /** @type {string} */ (BANQUE_ANGLES.get(n))]);
    }
  } else {
    // socle4+1 (défaut, et tout autre libellé de mode)
    jures = Array.from(JURES_SOCLE);
    if (pyTruthy(nomSpec) && BANQUE_ANGLES.has(/** @type {string} */ (nomSpec))) {
      jures.push([/** @type {string} */ (nomSpec), /** @type {string} */ (BANQUE_ANGLES.get(/** @type {string} */ (nomSpec)))]);
    } else if (SPECIALISTES_POLE.has(poleNum)) {
      jures.push(/** @type {[string, string]} */ (SPECIALISTES_POLE.get(poleNum)));
    }
  }

  if (faisceau && pyTruthy(dictGet(cfgj, "portraitiste_au_second_ressort", true))) {
    jures.push(PORTRAITISTE);
  }
  if (authenticite === "produite" && pyTruthy(dictGet(cfgj, "archiviste_si_produite", true))) {
    jures.push(ARCHIVISTE);
  }
  /** @type {Set<string>} */
  const vus = new Set();
  /** @type {[string, string][]} */
  const out = [];
  for (const [nj, angle] of jures) {
    if (!vus.has(nj)) {
      vus.add(nj);
      out.push([nj, angle]);
    }
  }
  return out;
}

export const STATUTS = new Set(["présence établie", "présence non établie", "renvoi au cartographe"]);

/** Gabarit par chemin relatif au protocole (mock : contenu facultatif). */
function gabaritDe(ctx, rel) {
  const content = ctx.protocole ? ctx.protocole(rel) : "";
  return content === null || content === undefined ? "" : content;
}

/** str(e) Python d'une exception JS (message seul, comme str(Exception)). */
function strErr(e) {
  return e instanceof Error ? e.message : pyStr(e);
}

/** incidents[k] = incidents.get(k, 0) + 1 (dict-compteur muté en place). */
function incr(incidents, k) {
  incidents[k] = /** @type {number} */ (dictGet(incidents, k, 0)) + 1;
}

/**
 * _slug Python : NFD → suppression de tout non-ASCII (encode ascii ignore)
 * → minuscules. "Éthicien" → "ethicien" ; "Clinicien du récit" →
 * "clinicien du recit" (l'espace RESTE : noms de fichiers avec espaces).
 * @param {string} s @returns {string}
 */
function slug(s) {
  let out = "";
  for (const ch of (s || "").normalize("NFD")) {
    if (/** @type {number} */ (ch.codePointAt(0)) < 128) out += ch;
  }
  return out.toLowerCase();
}

// ── Parsing mécanique des sorties (positions, pièces, gardiens) ───────────────
const W = PY_WS_CLASS;
const RE_POSITION = new RegExp(
  "\\*\\*[" + W + "]*Position(?:[" + W + "]+maintenue|[" + W + "]+finale)?[" + W + "]*\\*\\*[" + W + "]*:[" + W + "]*([^\\n]+)",
  "i",
);
const RE_PIECES_L = new RegExp(
  "\\*\\*[" + W + "]*Pi[èe]ces[" + W + "]*\\*\\*[" + W + "]*:[" + W + "]*([^\\n]+)",
  "i",
);
const RE_PIEGE = new RegExp(
  "\\*\\*[" + W + "]*Pi[èe]ge[^*]*\\*\\*[" + W + "]*:[" + W + "]*([^\\n]+)",
  "i",
);
const RE_P_NUM = new RegExp("\\bP[" + W + "]*(\\d+)\\b", "g");
// ####\s*Pi[èe]ce\s+(\d+)\s*\n(.*?)(?=####\s*Pi[èe]ce\s+\d|\Z) — DOTALL,
// IGNORECASE ; \Z Python == $ JS sans flag m (fin absolue de chaîne).
const RE_PIECE_BLOC = new RegExp(
  "####[" + W + "]*Pi[èe]ce[" + W + "]+(\\d+)[" + W + "]*\\n([\\s\\S]*?)(?=####[" + W + "]*Pi[èe]ce[" + W + "]+\\d|$)",
  "gi",
);
const RE_EXTRAIT_GUILLEMETS = new RegExp(
  "\\*\\*Extrait\\*\\*[" + W + "]*:[" + W + "]*«[" + W + "]*([\\s\\S]*?)[" + W + "]*»",
);
const RE_EXTRAIT_LIGNE = new RegExp("\\*\\*Extrait\\*\\*[" + W + "]*:[" + W + "]*([^\\n]+)");
const RE_DATE = new RegExp("\\*\\*Date\\*\\*[" + W + "]*:[" + W + "]*([^\\n]+)");
const RE_TYPE = new RegExp("\\*\\*Type\\*\\*[" + W + "]*:[" + W + "]*([^\\n]+)");
const RE_GARDIEN_CONSTAT = new RegExp("\\*\\*[" + W + "]*constat[" + W + "]*\\*\\*[" + W + "]*:[" + W + "]*([^\\n]+)");
const RE_GARDIEN_DRAPEAU = new RegExp("\\*\\*[" + W + "]*drapeau[" + W + "]*\\*\\*[" + W + "]*:[" + W + "]*([^\\n]+)");

/**
 * _norm_position : slug puis vocabulaire à trois voies (tolérance ancien
 * vocabulaire « établie »/« non établie »).
 * @param {string|null|undefined} raw @returns {string|null}
 */
function normPosition(raw) {
  const s = slug(raw || "");
  if (s.includes("detection")) return "détection";
  if (s.includes("contestation")) return "contestation";
  if (s.includes("abstention") || s.includes("sans eclairage")) return "abstention";
  if (s.includes("non etablie")) return "contestation";
  if (s.includes("etablie")) return "détection";
  return null;
}

/**
 * Avis d'un juré (23/23b/23c) → {position, pieces: [int], piege: str|null} ;
 * position null si illisible.
 * @param {string|null|undefined} texte
 * @returns {{position: string|null, pieces: number[], piege: string|null}}
 */
export function parsePosition(texte) {
  const t = texte || "";
  const m = t.match(RE_POSITION);
  const position = m ? normPosition(m[1]) : null;
  const mp = t.match(RE_PIECES_L);
  const zone = mp ? mp[1] : t;
  /** @type {Set<number>} */
  const nums = new Set();
  RE_P_NUM.lastIndex = 0;
  for (const mm of zone.matchAll(RE_P_NUM)) nums.add(parseInt(mm[1], 10));
  const pieces = Array.from(nums).sort((a, b) => a - b);
  let piege = null;
  const mg = t.match(RE_PIEGE);
  if (mg) {
    const val = pyStrip(mg[1]);
    if (pyTruthy(val) && val !== "—" && val !== "-" && val !== "aucun" && val !== "Aucun") {
      piege = cpSlice(val, 0, 200);
    }
  }
  return { position, pieces, piege };
}

/**
 * Pièces du Greffier → [{num, extrait, date, type}].
 * @param {string|null|undefined} dossierMd @returns {object[]}
 */
export function parsePieces(dossierMd) {
  /** @type {object[]} */
  const out = [];
  RE_PIECE_BLOC.lastIndex = 0;
  for (const m of (dossierMd || "").matchAll(RE_PIECE_BLOC)) {
    const bloc = m[2];
    let me = bloc.match(RE_EXTRAIT_GUILLEMETS);
    if (!me) me = bloc.match(RE_EXTRAIT_LIGNE);
    const md = bloc.match(RE_DATE);
    const mt = bloc.match(RE_TYPE);
    if (me) {
      out.push({
        num: parseInt(m[1], 10),
        extrait: cpSlice(pyStrip(me[1]), 0, 600),
        date: md ? pyStrip(md[1]) : null,
        type: mt ? pyStrip(mt[1]) : "",
      });
    }
  }
  return out;
}

/**
 * _type_role : type de pièce (greffier) → [type Schéma 1, rôle] ;
 * [null, null] = non probante.
 * @param {string|null|undefined} typeStr @returns {[string|null, string|null]}
 */
export function typeRole(typeStr) {
  const s = slug(typeStr || "");
  if (s.includes("trace concrete")) return ["trace_concrete", "preuve décisive"];
  if (s.includes("observation tierce")) return ["observation_tierce", "preuve décisive"];
  if (s.includes("declaration etayee")) return ["declaration_etayee", "indice corroboratif"];
  if (s.includes("nue") || s.includes("intention")) return [null, null];
  return ["indice", "indice corroboratif"];
}

/**
 * _parse_gardien_support : texte ENTIER slugifié, ligne **Constat** sinon tout.
 * @param {string|null|undefined} texte @returns {string} gonfle|masque|neutre
 */
export function parseGardienSupport(texte) {
  const s = slug(texte || "");
  const m = s.match(RE_GARDIEN_CONSTAT);
  const zone = m ? m[1] : s;
  if (zone.includes("gonfle")) return "gonfle";
  if (zone.includes("masque")) return "masque";
  return "neutre";
}

/**
 * _parse_gardien_raisonnement : ligne **Drapeau** sinon texte entier ;
 * booléen « vice ».
 * @param {string|null|undefined} texte @returns {boolean}
 */
export function parseGardienRaisonnement(texte) {
  const s = slug(texte || "");
  const m = s.match(RE_GARDIEN_DRAPEAU);
  const zone = m ? m[1] : s;
  return zone.includes("vice");
}

// ── Résolution calculée (la règle du mémoire, en code) ───────────────────────
/**
 * finaux : {nom: {position, ...}}. → [statut, motif]. Règles dans CET ordre.
 * @param {[string, string][]} jures @param {object} finaux
 * @param {string} gardienSupport @param {boolean} gardienDrapeau
 * @returns {[string, string]}
 */
export function resoudre(jures, finaux, gardienSupport, gardienDrapeau) {
  /** @type {string[]} */
  const D = [];
  /** @type {string[]} */
  const C = [];
  for (const [n] of jures) {
    const pos = dictGet(/** @type {object} */ (dictGet(finaux, n, {})), "position", null);
    if (pos === "détection") D.push(n);
    else if (pos === "contestation") C.push(n);
  }
  if (pyTruthy(gardienDrapeau)) {
    return ["renvoi au cartographe", "drapeau du gardien du raisonnement"];
  }
  if (!D.length) return ["présence non établie", "aucune détection survivante"];
  if (C.length) {
    return ["renvoi au cartographe", "détection et contestation subsistent après le second tour"];
  }
  if (gardienSupport === "gonfle" && D.length < 2) {
    return ["renvoi au cartographe", "résolution durcie (le support gonfle) : détection isolée"];
  }
  return ["présence établie", "détection(s) que personne ne conteste"];
}

/**
 * Confiance mécanique, déterministe — round(x, 3) half-even CPython (pyRound).
 * @param {string} statut @param {number} nD @param {number} nC
 * @param {number} nA @param {number} nPreuves @returns {number}
 */
export function calculerConfiance(statut, nD, nC, nA, nPreuves) {
  if (statut === "présence établie") {
    return pyRound(Math.min(0.95, 0.55 + 0.10 * Math.min(nD, 3) + 0.05 * Math.min(nPreuves, 3) - 0.05 * nA), 3);
  }
  if (statut === "présence non établie") {
    return pyRound(Math.min(0.95, 0.60 + 0.10 * nC + 0.05 * nA), 3);
  }
  return 0.5;
}

// ── Le procès (partagé : tribunal journalier et second ressort) ──────────────
/**
 * Arène + jury (+ second tour) + gardiens + résolution + porte-parole.
 * ancrer(extrait, date) → [extrait_verbatim, date] ou null.
 * rapide = [backend, modèle] de l'analyse rapide, ou null. → verdict Schéma 1.
 * @param {object} backend @param {object} ctx @param {string} tdir
 * @param {object} comp @param {object} baseVars @param {string} dossier
 * @param {object} config @param {object} meta @param {object} incidents
 * @param {(extrait: string, date: unknown) => [string, unknown]|null} ancrer
 * @param {unknown} dateDefaut @param {string} contexte
 * @param {[object|null, string|null]|null} rapide
 * @param {[string, string][]|null} jures
 * @returns {Promise<object>}
 */
async function proces(backend, ctx, tdir, comp, baseVars, dossier, config, meta, incidents, ancrer, dateDefaut, contexte, rapide, jures) {
  const code = comp.code;
  const nom = comp.nom;
  const bk = /** @type {object} */ (dictGet(config, "backend_tribunal", {}));
  const [bkRapide, modeleRapide] = pyTruthy(rapide) ? /** @type {[object|null, string|null]} */ (rapide) : [null, null];
  let mRapide = pyTruthy(modeleRapide) ? modeleRapide : dictGet(bk, "model_mini", null);
  if (!pyTruthy(mRapide)) mRapide = dictGet(bk, "model", null);
  const jury = pyTruthy(jures) ? /** @type {[string, string][]} */ (jures) : JURES_SOCLE;

  /**
   * Étape en cache fichier (reprise : le fichier existant est relu tel quel).
   * @param {string} fichier @param {string} template @param {object} variables
   * @param {string} task
   * @param {{model?: string|null, metaExtra?: object|null, bkObj?: object|null}} [o]
   * @returns {Promise<string>}
   */
  async function etape(fichier, template, variables, task, o = {}) {
    const { model = null, metaExtra = null, bkObj = null } = o;
    const path = pjoin(tdir, fichier);
    if (ctx.artefacts.exists(path)) return ctx.artefacts.readText(path);
    const prompt = resolveContent(gabaritDe(ctx, "lourd/" + template), variables);
    const out = await (bkObj || backend).call(prompt, {
      model: pyTruthy(model) ? model : dictGet(bk, "model", null),
      task,
      meta: { ...meta, ...(metaExtra || {}) },
      label: pyFormat("%s_%s_%s", task, contexte, code),
      // Rendu SERVEUR (ADR-010) : COMPETENCE_FICHE, quand le gabarit l'exige,
      // est injectée serveur à partir de CODE (présent dans variables).
      gabarit: "lourd/" + template,
      variables: varsClient(variables),
    });
    ctx.artefacts.writeText(path, out);
    return out;
  }

  const v = { ...baseVars, DOSSIER: dossier };
  v.REQUISITOIRE = await etape("21a-accusation.md", "21a-accusation.md", v, "accusation");
  v.PLAIDOIRIE = await etape("21b-defense.md", "21b-defense.md", v, "defense");
  v.REPLIQUE = await etape("22a-replique.md", "22a-replique.md", v, "replique");
  v.BRIEFING = await etape("22b-briefing.md", "22b-briefing.md", v, "briefing");

  // — Premier tour : jurés de fond (séquentiel, ≡ ThreadPool Python : les
  // résultats sont indexés par nom puis relus dans l'ordre du jury) —
  /** @type {Record<string, string>} */
  const avisR1 = {};
  /** @type {Record<string, object>} */
  const posR1 = {};
  for (const [nj, angle] of jury) {
    const vj = { ...v, JURE_NOM: nj, JURE_ANGLE: angle };
    avisR1[nj] = await etape(pyFormat("23-%s.md", slug(nj)), "23-jure.md", vj, "jure", {
      metaExtra: { jure: nj, tour: 1 },
    });
  }
  for (const [nj] of jury) {
    const p = parsePosition(avisR1[nj]);
    if (p.position === null) {
      incr(incidents, "jure_position_illisible");
      p.position = "abstention";
    }
    posR1[nj] = p;
  }

  // — Second tour, un seul, mené par le juré minoritaire (règle du mémoire) —
  const D1 = jury.filter(([n]) => posR1[n].position === "détection").map(([n]) => n);
  const C1 = jury.filter(([n]) => posR1[n].position === "contestation").map(([n]) => n);
  const A1 = jury.filter(([n]) => posR1[n].position === "abstention").map(([n]) => n);
  /** @type {string|null} */
  let relanceur = null;
  if (D1.length && C1.length) {
    // désaccord : la relance revient au camp minoritaire (à égalité, au doute)
    const camp = D1.length < C1.length ? D1 : C1;
    relanceur = camp[0];
  } else if (D1.length === 1 && !C1.length && A1.length) {
    relanceur = D1[0]; // une seule détection suffit à ouvrir le cas
  }

  /** @type {Record<string, object>} */
  const finaux = { ...posR1 };
  /** @type {Record<string, string>} */
  const avisFinaux = { ...avisR1 };
  /** @type {string|null} */
  let relanceTxt = null;
  /** @type {Record<string, string>} */
  const textesR2 = {};
  if (relanceur) {
    const vr = {
      ...v,
      JURE_NOM: relanceur,
      MA_POSITION: posR1[relanceur].position,
      MA_POSITION_R1: avisR1[relanceur],
    };
    const relance = await etape("23b-relance.md", "23b-relance.md", vr, "relance", {
      metaExtra: { jure: relanceur, tour: 2 },
    });
    relanceTxt = relance;
    const pr = parsePosition(relance);
    if (pyTruthy(pr.position)) finaux[relanceur] = pr;
    avisFinaux[relanceur] = avisR1[relanceur] + "\n\n" + relance;

    for (const [nj, angle] of jury) {
      if (nj === relanceur) continue;
      const vj = {
        ...v,
        JURE_NOM: nj,
        JURE_ANGLE: angle,
        RELANCEUR_NOM: relanceur,
        POSITION_RELANCEUR: posR1[relanceur].position,
        MA_POSITION_R1: avisR1[nj],
        RELANCE: relance,
      };
      const texte = await etape(pyFormat("23c-%s.md", slug(nj)), "23c-second-tour.md", vj, "jure2", {
        metaExtra: { jure: nj, tour: 2, relanceur },
      });
      textesR2[nj] = texte;
      const p2 = parsePosition(texte);
      if (pyTruthy(p2.position)) finaux[nj] = p2;
      avisFinaux[nj] = avisR1[nj] + "\n\n" + texte;
    }
  }

  const avisBloc = jury.map(([nj]) => avisFinaux[nj]).join("\n\n---\n\n");

  // — Gardiens de l'instrument : jamais de position sur la présence —
  const vg = { ...v, AVIS_JURES: avisBloc };
  const gSupport = await etape("25a-gardien-support.md", "25a-gardien-support.md", vg, "gardien_support", {
    model: /** @type {string|null} */ (mRapide),
    bkObj: bkRapide,
  });
  const gRaison = await etape("25b-gardien-raisonnement.md", "25b-gardien-raisonnement.md", vg, "gardien_raisonnement");
  const support = parseGardienSupport(gSupport);
  const drapeau = parseGardienRaisonnement(gRaison);

  // — Résolution calculée —
  let [statut, motifRegle] = resoudre(jury, finaux, support, drapeau);
  const D = jury.filter(([n]) => finaux[n].position === "détection").map(([n]) => n);
  const C = jury.filter(([n]) => finaux[n].position === "contestation").map(([n]) => n);
  const A = jury.filter(([n]) => finaux[n].position === "abstention").map(([n]) => n);

  // — Traces : pièces citées par les détections, ré-ancrées —
  const pieces = parsePieces(dossier);
  /** @type {Map<number, object>} */
  const parNum = new Map();
  for (const p of pieces) parNum.set(p.num, p); // doublon de numéro : dernier gagne
  /** @type {Set<number>} */
  const citesSet = new Set();
  for (const j of D) {
    for (const n of /** @type {number[]} */ (finaux[j].pieces)) if (parNum.has(n)) citesSet.add(n);
  }
  const cites = Array.from(citesSet).sort((a, b) => a - b);
  /** @type {object[]} */
  const traces = [];
  let nonAncrees = 0;
  if (statut === "présence établie") {
    for (const num of cites) {
      const p = /** @type {object} */ (parNum.get(num));
      const [tType, role] = typeRole(p.type);
      if (tType === null) continue; // déclaration nue / intention : jamais probante
      const loc = ancrer(p.extrait, dictGet(p, "date", null));
      if (loc === null) {
        nonAncrees += 1;
        incr(incidents, "trace_tribunal_non_ancree");
        continue;
      }
      const [extraitVerbatim, date] = loc;
      traces.push({
        piece: num,
        extrait: cpSlice(extraitVerbatim, 0, 400),
        date: pyTruthy(date) ? date : dateDefaut,
        type: tType,
        role,
      });
      if (traces.length >= 5) break;
    }
    if (!traces.length) {
      // présence sans une seule trace ancrée : la publication serait une
      // affirmation sans pièce — le dossier part à l'enseignant.
      statut = "renvoi au cartographe";
      motifRegle = pyFormat("détection sans pièce ancrable (%d citation(s) introuvable(s))", nonAncrees);
    }
  }
  let sp = 0;
  for (const t of traces) if (t.role === "preuve décisive") sp += 1;
  const si = traces.length - sp;
  if (statut === "présence établie" && !(sp >= 1 || si >= 2)) {
    // garde-fou du barème (v7) : le seuil protège contre une présence gratuite
    statut = "renvoi au cartographe";
    motifRegle = pyFormat(
      "garde-fou du barème : un dossier ne se publie pas sur un indice unique (%d preuve, %d indice)",
      sp,
      si,
    );
  }
  /** @type {number|string} */
  let scoreP;
  /** @type {number|string} */
  let scoreI;
  if (statut === "présence établie") {
    scoreP = sp;
    scoreI = si;
  } else if (statut === "renvoi au cartographe") {
    scoreP = "R";
    scoreI = "R";
  } else {
    scoreP = 0;
    scoreI = 0;
  }
  const confiance = calculerConfiance(statut, D.length, C.length, A.length, sp);

  /** @type {Set<string>} */
  const piegesSet = new Set();
  for (const j of C) if (pyTruthy(finaux[j].piege)) piegesSet.add(/** @type {string} */ (finaux[j].piege));
  const pieges = Array.from(piegesSet).sort(codePointCompare);
  const cfgjJury = dictGet(config, "jury", null);
  const juryBloc = {
    mode: pyStr(dictGet(pyTruthy(cfgjJury) ? /** @type {object} */ (cfgjJury) : {}, "mode", "socle4+1")),
    personas: infosPersonas(),
    detections: D,
    contestations: C,
    abstentions: A,
    second_tour: pyTruthy(relanceur),
    relance_par: relanceur,
    composition: jury.map(([n]) => n),
    positions_r1: Object.fromEntries(jury.map(([n]) => [n, posR1[n].position])),
    positions_finales: Object.fromEntries(jury.map(([n]) => [n, finaux[n].position])),
    pieges_nommes: pieges,
    consensus: D.length > 0 && C.length === 0,
    dissidences: C.map((j) =>
      pyFormat("%s : contestation (%s)", j, pyTruthy(finaux[j].piege) ? finaux[j].piege : "sans piège nommé"),
    ),
  };
  const gardien = { support: { constat: support }, raisonnement: { drapeau } };

  /** @type {object|null} */
  let dossierCartographe = null;
  if (statut === "renvoi au cartographe") {
    /** @type {Set<number>} */
    const citesTousSet = new Set();
    for (const j of [...D, ...C]) {
      for (const n of /** @type {number[]} */ (finaux[j].pieces)) if (parNum.has(n)) citesTousSet.add(n);
    }
    const citesTous = Array.from(citesTousSet).sort((a, b) => a - b);
    dossierCartographe = {
      motif: motifRegle,
      desaccord: pyFormat(
        "détections : %s — contestations : %s",
        pyTruthy(D.join(", ")) ? D.join(", ") : "aucune",
        pyTruthy(C.join(", ")) ? C.join(", ") : "aucune",
      ),
      pieges_envisages: pieges,
      citations: citesTous.slice(0, 5).map((n) => cpSlice(/** @type {object} */ (parNum.get(n)).extrait, 0, 300)),
    };
  }

  // — Président porte-parole : récit + prescription (le statut est intangible) —
  const verdictCalcule = pyFormat(
    "Statut calculé : %s (%s)\n" +
      "Détections : %s | Contestations : %s | Abstentions : %s\n" +
      "Second tour : %s\n" +
      "Gardien du support : %s — Gardien du raisonnement : %s\n" +
      "Traces ancrées : %d (preuves %s, indices %s) — confiance %.2f",
    statut,
    motifRegle,
    pyTruthy(D.join(", ")) ? D.join(", ") : "—",
    pyTruthy(C.join(", ")) ? C.join(", ") : "—",
    pyTruthy(A.join(", ")) ? A.join(", ") : "—",
    relanceur ? pyFormat("oui, relancé par %s", relanceur) : "non",
    support,
    drapeau ? "vice signalé" : "aucun drapeau",
    traces.length,
    scoreP,
    scoreI,
    confiance,
  );
  const vp = { ...v, AVIS_JURES: avisBloc, VERDICT_CALCULE: verdictCalcule, GARDIENS: gSupport + "\n\n---\n\n" + gRaison };
  /** @type {object|null} */
  let prescription = null;
  /** @type {string|null} */
  let presTxt = null;
  try {
    const pres = await etape("24-president.md", "24-president.md", vp, "president", { metaExtra: { statut } });
    presTxt = pres;
    const data = extractJson(pres, true);
    const dataDict = data !== null && typeof data === "object" && !Array.isArray(data) ? data : null;
    const pd = dataDict !== null ? dictGet(dataDict, "prescription", null) : null;
    if (dataDict !== null && pd !== null && typeof pd === "object" && !Array.isArray(pd)) {
      // str() Python des valeurs JSON scalaires (un dict/list ici lèverait —
      // capturé ci-dessous ; le mock n'émet que chaîne/None)
      const pc = dictGet(/** @type {object} */ (pd), "pour_cartographe", null);
      prescription = {
        pour_apprenant: cpSlice(pyStr(dictGet(/** @type {object} */ (pd), "pour_apprenant", "")), 0, 800),
        pour_cartographe: pyTruthy(pc) ? cpSlice(pyStr(pc), 0, 800) : null,
      };
    }
  } catch (e) {
    // le récit ne doit jamais bloquer le verdict
    logWarn(pyFormat("Président indisponible pour %s@%s (%s) — prescription par défaut", code, contexte, strErr(e)));
  }
  if (!pyTruthy(prescription) || !pyTruthy(dictGet(/** @type {object} */ (prescription), "pour_apprenant", null))) {
    incr(incidents, "president_recit_indisponible");
    const defauts = {
      "présence établie": pyFormat(
        "Cette journée atteste %s après contre-examen du tribunal. " +
          "Pour consolider, une piste serait de documenter une nouvelle situation.",
        nom,
      ),
      "présence non établie": pyFormat("Ce dossier ne contient pas encore de pièce établie pour %s.", nom),
      "renvoi au cartographe": "Ce dossier appelle un échange avec l'enseignant.",
    };
    prescription = {
      pour_apprenant: defauts[statut],
      pour_cartographe: statut === "renvoi au cartographe" ? motifRegle : null,
    };
  }

  // — Le dossier clinique complet descend dans le JSON —
  const deliberation = {
    greffier_md: dossier,
    arene: {
      accusation_md: v.REQUISITOIRE,
      defense_md: v.PLAIDOIRIE,
      replique_md: v.REPLIQUE,
      briefing_md: v.BRIEFING,
    },
    jures: Object.fromEntries(
      jury.map(([nj]) => [
        nj,
        {
          r1_md: avisR1[nj],
          r2_md: dictGet(textesR2, nj, null),
          position_r1: posR1[nj].position,
          position_finale: finaux[nj].position,
          pieces: finaux[nj].pieces,
          piege: finaux[nj].piege,
        },
      ]),
    ),
    relance_md: relanceTxt,
    relance_par: relanceur,
    gardiens: { support_md: gSupport, raisonnement_md: gRaison },
    president_md: presTxt,
  };
  return {
    code,
    nom,
    dossier_vide: false,
    statut,
    score_preuves: scoreP,
    score_indices: scoreI,
    confiance: new PyFloat(confiance),
    jury: juryBloc,
    traces_probantes: traces,
    prescription,
    gardien,
    motif_regle: motifRegle,
    dossier_cartographe: dossierCartographe,
    deliberation,
  };
}

// ── Le Greffier (partagé : juge léger v6 et tribunal lisent le MÊME dossier) ──
/**
 * Constitue (ou relit du cache) le dossier des pièces d'une compétence sur
 * une journée. Le Greffier est le SEUL acteur du protocole à voir la
 * superposition des calques. → [dossier_md, vide].
 * @param {import("./backends.js").Backend} backend — backend du tribunal.
 * @param {{artefacts: object, protocole?: (rel: string) => string}} ctx
 * @param {string} tdir @param {import("./referentiel.js").Pole} pole
 * @param {{code: string, nom: string, fiche_md: string}} comp
 * @param {{id: string, texte: string}} journee @param {object} config
 * @param {[string, string][]} sentences
 * @param {{rapide?: [object, string|null]|null, calques?: string|null}} [opts]
 * @returns {Promise<[string, boolean]>}
 */
export async function constituerDossier(backend, ctx, tdir, pole, comp, journee, config, sentences, opts = {}) {
  const { rapide = null, calques = null } = opts;
  const code = comp.code;
  const nom = comp.nom;
  const path = pjoin(tdir, "20-greffier.md");
  let dossier;
  if (ctx.artefacts.exists(path)) {
    dossier = ctx.artefacts.readText(path);
  } else {
    const bk = dictGet(config, "backend_tribunal", {});
    const [bkRapide, modeleRapide] = rapide || [null, null];
    const baseVars = {
      CODE: code,
      NOM: nom,
      POLE_NUM: pole.num,
      POLE_NOM: pole.nom,
      COMPETENCE_FICHE: comp.fiche_md,
      CALQUES: pyTruthy(calques) ? calques : "(aucun surlignage vivant pour cette compétence)",
      FEUILLES: pyFormat("═══ Feuille : %s ═══\n%s\n", journee.id, neutraliserBalises(journee.texte)),
    };
    const prompt = resolveContent(gabaritDe(ctx, "lourd/20-greffier.md"), baseVars);
    dossier = await (bkRapide || backend).call(prompt, {
      model: modeleRapide || dictGet(bk, "model_mini", null) || dictGet(bk, "model", null),
      task: "greffier",
      meta: { code, nom, sentences },
      label: pyFormat("greffier_%s_%s", journee.id, code),
      gabarit: "lourd/20-greffier.md",
      variables: varsClient(baseVars),
    });
    ctx.artefacts.writeText(path, dossier);
  }
  return [dossier, cpSlice(dossier, 0, 400).toUpperCase().includes("DOSSIER VIDE")];
}

/**
 * Verdict court-circuit quand le Greffier n'a extrait aucune pièce.
 * @param {string} code @param {string} nom @param {string} dossier
 * @returns {object}
 */
export function verdictDossierVide(code, nom, dossier) {
  return {
    code,
    nom,
    dossier_vide: true,
    statut: "présence non établie",
    score_preuves: 0,
    score_indices: 0,
    confiance: new PyFloat(0.9),
    jury: null,
    traces_probantes: [],
    prescription: {
      pour_apprenant: pyFormat("Cette journée ne contient pas encore de pièce pour %s.", nom),
      pour_cartographe: null,
    },
    gardien: null,
    etage: "tribunal-court-circuit",
    deliberation: { greffier_md: dossier },
  };
}

/** Verdict de panne technique (jury: null, scores "R"). */
function verdictPanne(code, nom, pourCartographe) {
  return {
    code,
    nom,
    dossier_vide: false,
    statut: "renvoi au cartographe",
    score_preuves: "R",
    score_indices: "R",
    confiance: new PyFloat(0.0),
    jury: null,
    traces_probantes: [],
    prescription: {
      pour_apprenant: "Ce dossier appelle un échange avec l'enseignant.",
      pour_cartographe: pourCartographe,
    },
    gardien: null,
    dossier_cartographe: null,
  };
}

const RE_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

// ── Tribunal journalier ───────────────────────────────────────────────────────
/**
 * Tribunal complet d'une compétence sur une journée. → verdict Schéma 1
 * (+etage "tribunal", ou "tribunal-court-circuit" si dossier vide).
 * Jury CALCULÉ : socle de 4 + spécialiste du pôle (+ Archiviste si l'écriture
 * du jour est perçue « produite »).
 * @param {object} backend @param {{artefacts: object, protocole?: (rel: string) => string}} ctx
 * @param {string} tdir @param {{num: number, nom: string}} pole
 * @param {{code: string, nom: string, fiche_md: string}} comp
 * @param {{id: string, texte: string, date?: string}} journee
 * @param {object} config @param {[string, string][]} sentences
 * @param {object} incidents — dict-compteur de la journée, muté par clé.
 * @param {{premiereImpression?: string|null, rapide?: [object, string|null]|null,
 *   calques?: string|null, authenticite?: string|null}} [opts]
 * @returns {Promise<object>}
 */
export async function juger(backend, ctx, tdir, pole, comp, journee, config, sentences, incidents, opts = {}) {
  const { premiereImpression = null, rapide = null, calques = null, authenticite = null } = opts;
  const code = comp.code;
  const nom = comp.nom;
  const meta = { code, nom, sentences };
  const baseVars = {
    CODE: code,
    NOM: nom,
    POLE_NUM: pole.num,
    POLE_NOM: pole.nom,
    COMPETENCE_FICHE: comp.fiche_md,
    PREMIERE_IMPRESSION: pyTruthy(premiereImpression)
      ? premiereImpression
      : "(pas de première impression disponible pour cette journée)",
    CALQUES: pyTruthy(calques) ? calques : "(aucun surlignage vivant pour cette compétence)",
    FEUILLES: pyFormat("═══ Feuille : %s ═══\n%s\n", journee.id, neutraliserBalises(journee.texte)),
  };

  /**
   * Ré-ancrage d'un extrait dans le texte de la journée. La date de la pièce
   * n'est gardée que si elle COMMENCE par AAAA-MM-JJ (re.match ancré au début).
   * @param {string} extrait @param {unknown} date
   * @returns {[string, unknown]|null}
   */
  const ancrer = (extrait, date) => {
    const loc = findVerbatim(journee.texte, extrait);
    if (loc === null) return null;
    const [s, e] = loc;
    const dateOk = pyTruthy(date) && RE_DATE_PREFIX.test(pyStr(date));
    const dateDef = pyTruthy(dictGet(journee, "date", null)) ? journee.date : journee.id;
    return [cpSlice(journee.texte, s, e), dateOk ? date : dateDef];
  };

  let verdict;
  try {
    const [dossier, vide] = await constituerDossier(backend, ctx, tdir, pole, comp, journee, config, sentences, {
      rapide,
      calques,
    });
    if (vide) return verdictDossierVide(code, nom, dossier); // etage reste "tribunal-court-circuit"
    verdict = await proces(
      backend,
      ctx,
      tdir,
      comp,
      baseVars,
      dossier,
      config,
      meta,
      incidents,
      ancrer,
      pyTruthy(dictGet(journee, "date", null)) ? journee.date : journee.id,
      journee.id,
      rapide,
      composerJury(pole.num, config, { authenticite, code, contexte: journee.id }),
    );
  } catch (e) {
    // une panne technique ne fabrique pas un verdict
    incr(incidents, "tribunal_echec_technique");
    logWarn(pyFormat("Tribunal %s@%s : échec technique (%s) → renvoi", code, journee.id, strErr(e)));
    verdict = verdictPanne(code, nom, pyFormat("Tribunal interrompu (panne technique) : %s", strErr(e)));
  }
  verdict.etage = "tribunal";
  return verdict;
}

// ── Tribunal de second ressort : le faisceau d'indices inter-journées ────────
/**
 * Instruit au niveau de la TRAJECTOIRE les compétences aux traces faibles
 * mais récurrentes. Question posée : ces traces, individuellement
 * insuffisantes, forment-elles ensemble un faisceau probant ?
 * → verdict Schéma 1 (+etage "faisceau").
 * @param {object} backend @param {{artefacts: object, protocole?: (rel: string) => string}} ctx
 * @param {string} tdir @param {{num: number, nom: string}} pole
 * @param {{code: string, nom: string, fiche_md: string}} comp
 * @param {object[]} suspicions — [{journee?, extrait?, date?, source?, jugee?}]
 * @param {string} periode @param {object} config
 * @param {object} incidents — dict-compteur muté par clé.
 * @param {Map<string, string>} textesParJournee — Map OBLIGATOIRE (ordre
 *   d'insertion contractuel, y compris pour des ids numériques).
 * @param {{rapide?: [object, string|null]|null}} [opts]
 * @returns {Promise<object>}
 */
export async function jugerFaisceau(backend, ctx, tdir, pole, comp, suspicions, periode, config, incidents, textesParJournee, opts = {}) {
  const { rapide = null } = opts;
  const code = comp.code;
  const nom = comp.nom;
  const meta = {
    code,
    nom,
    sentences: suspicions
      .filter((s) => pyTruthy(dictGet(s, "extrait", null)))
      .map((s) => [dictGet(s, "journee", null), dictGet(s, "extrait", "")]),
  };

  // Dossier assemblé MÉCANIQUEMENT (le greffier du temps long est un programme).
  /** @type {string[]} */
  const lignes = [
    pyFormat("# Dossier de faisceau — %s %s", code, nom),
    "",
    pyFormat(
      "Pièces réunies mécaniquement sur la période %s : signaux individuellement " +
        "trop faibles pour la carte, conservés parce qu'ils reviennent. " +
        "La question à instruire : forment-ils ENSEMBLE un faisceau probant ?",
      periode,
    ),
    "",
    "### Pièces extraites",
    "",
  ];
  const avecExtrait = suspicions.filter((s) => pyTruthy(dictGet(s, "extrait", null)));
  // tri STABLE par (bool(jugee), journee or "") : jamais jugés d'abord
  avecExtrait.sort((a, b) => {
    const ka = pyTruthy(dictGet(a, "jugee", null)) ? 1 : 0;
    const kb = pyTruthy(dictGet(b, "jugee", null)) ? 1 : 0;
    if (ka !== kb) return ka - kb;
    const ja = pyTruthy(dictGet(a, "journee", null)) ? /** @type {string} */ (dictGet(a, "journee", null)) : "";
    const jb = pyTruthy(dictGet(b, "journee", null)) ? /** @type {string} */ (dictGet(b, "journee", null)) : "";
    return codePointCompare(ja, jb);
  });
  avecExtrait.slice(0, 8).forEach((s, i0) => {
    const i = i0 + 1;
    const vigilance = pyTruthy(dictGet(s, "jugee", null))
      ? pyFormat("déjà instruite (%s) — fait ancien, versé pour contexte", s.jugee)
      : "signal faible — à instruire en constellation";
    const dateS = pyTruthy(dictGet(s, "date", null))
      ? dictGet(s, "date", null)
      : pyTruthy(dictGet(s, "journee", null))
        ? dictGet(s, "journee", null)
        : "-";
    lignes.push(
      pyFormat("#### Pièce %d", i),
      pyFormat("- **Extrait** : « %s »", neutraliserBalises(cpSlice(/** @type {string} */ (s.extrait), 0, 400))),
      pyFormat("- **Date** : %s", dateS),
      pyFormat("- **Localisation** : journée %s", pyTruthy(dictGet(s, "journee", null)) ? dictGet(s, "journee", null) : "-"),
      pyFormat("- **Type** : signal de faisceau (source : %s)", dictGet(s, "source", "?")),
      pyFormat("- **Vigilance** : %s", vigilance),
      "",
    );
  });
  const dossier = lignes.join("\n");

  const baseVars = {
    CODE: code,
    NOM: nom,
    POLE_NUM: pole.num,
    POLE_NOM: pole.nom,
    COMPETENCE_FICHE: comp.fiche_md,
    FEUILLES: dossier,
    PREMIERE_IMPRESSION: "(dossier de faisceau inter-journées : pas de première impression unique)",
    CALQUES: "(dossier de faisceau : les pièces ci-dessous SONT la superposition, réunie mécaniquement)",
  };
  /** @type {Map<unknown, object>} */
  const parJ = new Map();
  for (const s of suspicions) parJ.set(dictGet(s, "journee", null), s); // doublon : dernier gagne

  /**
   * Ré-ancrage inter-journées : première journée (ordre d'insertion de la
   * Map) où l'extrait se localise. Le paramètre date est IGNORÉ (fidèle au
   * Python : la date vient de la suspicion de la journée qui matche).
   * @param {string} extrait @param {unknown} _date
   * @returns {[string, unknown]|null}
   */
  const ancrer = (extrait, _date) => {
    for (const [jid, texte] of textesParJournee.entries()) {
      const loc = findVerbatim(texte, extrait);
      if (loc) {
        const [s0, e0] = loc;
        const sus = parJ.has(jid) ? parJ.get(jid) : null;
        const d = sus && pyTruthy(dictGet(sus, "date", null)) ? dictGet(sus, "date", null) : jid;
        return [cpSlice(texte, s0, e0), d];
      }
    }
    return null;
  };

  let verdict;
  try {
    verdict = await proces(
      backend,
      ctx,
      tdir,
      comp,
      baseVars,
      dossier,
      config,
      meta,
      incidents,
      ancrer,
      periode,
      "faisceau",
      rapide,
      composerJury(pole.num, config, { faisceau: true, code, contexte: "faisceau" }),
    );
  } catch (e) {
    incr(incidents, "faisceau_echec_technique");
    logWarn(pyFormat("Second ressort %s : échec technique (%s) → renvoi", code, strErr(e)));
    verdict = verdictPanne(code, nom, pyFormat("Second ressort interrompu : %s", strErr(e)));
  }
  verdict.etage = "faisceau";
  return verdict;
}
