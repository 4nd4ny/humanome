// Port de aurora/util.py — extraction JSON des réponses LLM, neutralisation
// anti-injection, ancrage verbatim (difflib), hash stable et empreinte de
// contexte. Parité bit-à-bit avec CPython (mode mock = oracle).
//
// Différences assumées avec util.py (documentées dans spec-noyau.md) :
//   - pas d'IO fichier ici (module navigateur) : read_text/write_text vivent
//     côté hôte ; universalNewlines (py/pyText.js) reproduit le mode texte
//     de Python et DOIT être appliqué par l'hôte à toute lecture ;
//   - le logging est injectable (no-op par défaut) et n'influence aucun
//     artefact ;
//   - extract_json : NaN/Infinity acceptés par json.loads mais rejetés par
//     JSON.parse — divergence assumée (le mock n'en émet jamais).

import { PY_WS_CLASS, pyIsSpace, pyStrip, cpLen, u16ToCpIndexer } from "./py/pyText.js";
import { stableHash } from "./py/stableHash.js";
import { pyJsonDumpsEmpreinte } from "./py/pyJson.js";
import { SequenceMatcher } from "./py/difflib.js";

// ── Logging injectable (aucun effet sur les artefacts) ───────────────────────
const NOOP = () => {};
let _logger = { log: NOOP, ok: NOOP, warn: NOOP, err: NOOP };

/**
 * Injecte un logger ({log, ok, warn, err} — champs optionnels).
 * @param {{log?: (m: string) => void, ok?: (m: string) => void,
 *          warn?: (m: string) => void, err?: (m: string) => void}} logger
 */
export function setLogger(logger) {
  _logger = {
    log: logger.log || NOOP,
    ok: logger.ok || NOOP,
    warn: logger.warn || NOOP,
    err: logger.err || NOOP,
  };
}

/** @param {string} msg */
export function log(msg) {
  _logger.log(msg);
}
/** @param {string} msg */
export function logOk(msg) {
  _logger.ok(msg);
}
/** @param {string} msg */
export function logWarn(msg) {
  _logger.warn(msg);
}
/** @param {string} msg */
export function logErr(msg) {
  _logger.err(msg);
}

// ── Extraction JSON depuis une réponse LLM ────────────────────────────────────
// _RE_FENCE Python : ```(?:json)?\s*\n(.*?)\n``` avec DOTALL. Le \s Python est
// reproduit par [PY_WS_CLASS] ; (.*?) DOTALL → [\s\S]*? non gourmand.
const RE_FENCE = new RegExp("```(?:json)?[" + PY_WS_CLASS + "]*\\n([\\s\\S]*?)\\n```", "g");

// Virgule finale avant } ou ] (le \s Python, pas celui de JS).
const RE_TRAILING_COMMA = new RegExp(",[" + PY_WS_CLASS + "]*([}\\]])", "g");

/**
 * _repair_json Python : guillemets typographiques puis virgules finales.
 * (U+2018 « ‘ » n'est volontairement PAS traité ici — fidèle à la source.)
 * @param {string} s @returns {string}
 */
function repairJson(s) {
  s = s.replace(/“/g, '"').replace(/”/g, '"').replace(/’/g, "'");
  return s.replace(RE_TRAILING_COMMA, "$1");
}

/** json.loads → JSON.parse ; toute exception → undefined. */
function tryParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/**
 * Extrait le premier (ou dernier) objet JSON d'une réponse LLM. Cherche
 * d'abord les blocs ```json, puis les {...} équilibrés. Jamais d'exception.
 * @param {string|null|undefined} text
 * @param {boolean} [last=true] — parcourir les candidats du dernier au premier.
 * @returns {unknown|null}
 */
export function extractJson(text, last = true) {
  if (!text) return null;
  /** @type {string[]} */
  const candidates = [];
  RE_FENCE.lastIndex = 0;
  for (const m of text.matchAll(RE_FENCE)) candidates.push(m[1]);
  let ordered = last ? candidates.slice().reverse() : candidates;
  for (const c of ordered) {
    for (const attempt of [c, repairJson(c)]) {
      const parsed = tryParse(attempt);
      if (parsed !== undefined) return parsed;
    }
  }
  // Fallback : balayage d'objets {...} équilibrés (les tableaux de tête ne
  // sont pas détectés). L'automate de chaîne est actif même à profondeur 0
  // (un « " » isolé dans la prose ouvre un faux état chaîne — fidèle au Python).
  /** @type {string[]} */
  const spans = [];
  let depth = 0;
  /** @type {number|null} */
  let start = null;
  let inStr = false;
  let esc = false;
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start !== null) spans.push(chars.slice(start, i + 1).join(""));
      }
    }
  }
  ordered = last ? spans.slice().reverse() : spans;
  for (const c of ordered) {
    for (const attempt of [c, repairJson(c)]) {
      const parsed = tryParse(attempt);
      if (parsed !== undefined) return parsed;
    }
  }
  return null;
}

// ── Neutralisation anti-injection des balises de prompt ──────────────────────
// Ordre de l'alternation IDENTIQUE au Python (FICHE avant FICHES_POLE : les
// deux moteurs backtrackent pareil).
const RE_BALISE = new RegExp(
  "</?[" +
    PY_WS_CLASS +
    "]*(PORTFOLIO|FEUILLES|DOSSIER|FICHE|FICHES_POLE|EXTRAITS|BRIEFING|REQUISITOIRE|" +
    "PLAIDOIRIE|REPLIQUE|AVIS_JURES|RELANCE|MA_POSITION_R1|GARDIENS|VERDICT_CALCULE)[" +
    PY_WS_CLASS +
    "]*>",
  "gi",
);

/**
 * Le texte de l'élève est une pièce, jamais une consigne : toute balise de
 * délimitation qu'il contiendrait est désamorcée (< → ‹, > → ›).
 * @param {string|null|undefined} texte @returns {string}
 */
export function neutraliserBalises(texte) {
  return (texte || "").replace(RE_BALISE, (m0) =>
    m0.replace(/</g, "‹").replace(/>/g, "›"),
  );
}

// ── Ancrage verbatim (localisation d'un extrait dans le texte source) ─────────
// Typographie 1:1 (l'index source reste valide caractère par caractère).
const TRANS_TYPO = new Map([
  ["’", "'"],
  ["‘", "'"],
  ["“", '"'],
  ["”", '"'],
  ["«", '"'],
  ["»", '"'],
  ["–", "-"],
  ["—", "-"],
  [" ", " "],
  [" ", " "],
]);

/** @param {string} ch */
function typo(ch) {
  const t = TRANS_TYPO.get(ch);
  return t === undefined ? ch : t;
}

const RE_WS_RUN = new RegExp("[" + PY_WS_CLASS + "]+", "g");

/**
 * Localise `quote` dans `source`. Retourne [start, end, ratio] — offsets en
 * POINTS DE CODE dans `source` brut, `end` exclusif — ou null.
 * 1) exact ; 2) espaces + typographie normalisés ; 3) fenêtre difflib.
 * @param {string} source @param {string} quote @param {number} [minRatio=0.82]
 * @returns {[number, number, number]|null}
 */
export function findVerbatim(source, quote, minRatio = 0.82) {
  if (!quote || !source) return null;
  let q = pyStrip(pyStrip(quote), "«»\"' ");
  q = pyStrip(q.split("[...]").join(""));
  if (!q) return null;
  // 1) recherche exacte (index reconverti en points de code)
  const i16 = source.indexOf(q);
  if (i16 >= 0) {
    const i = u16ToCpIndexer(source)(i16);
    return [i, i + cpLen(q), 1.0];
  }
  // 2) normalisation espaces + typographie : carte index_norm → index_source
  /** @type {number[]} */
  const idxMap = [];
  /** @type {string[]} */
  const buf = [];
  let prevSpace = true;
  let j = 0;
  for (const raw of source) {
    const ch = typo(raw);
    if (pyIsSpace(ch)) {
      if (!prevSpace) {
        buf.push(" ");
        idxMap.push(j);
      }
      prevSpace = true;
    } else {
      buf.push(ch);
      idxMap.push(j);
      prevSpace = false;
    }
    j++;
  }
  const flat = buf.join("");
  const qn = Array.from(q).map(typo).join("").replace(RE_WS_RUN, " ");
  const lenQn = cpLen(qn);
  const flatLower = flat.toLowerCase();
  const qnLower = qn.toLowerCase();
  const f16 = flatLower.indexOf(qnLower);
  if (f16 >= 0) {
    const i = u16ToCpIndexer(flatLower)(f16);
    if (i + lenQn - 1 < idxMap.length) {
      return [idxMap[i], idxMap[i + lenQn - 1] + 1, 0.99];
    }
  }
  // 3) approximatif : fenêtre difflib sur mots
  const words = qn.split(" ");
  if (words.length < 4) return null;
  // Premier matcher : autojunk=False ; bornes = longueurs NON minusculées
  // (fidèle au Python : find_longest_match(0, len(qn), 0, len(flat))).
  const sm = new SequenceMatcher(qnLower, flatLower, { autojunk: false });
  const m = sm.findLongestMatch(0, lenQn, 0, idxMap.length);
  // int(len(qn) * min_ratio * 0.6) : ordre flottant exact puis troncature.
  if (m.size >= Math.max(20, Math.trunc(lenQn * minRatio * 0.6))) {
    const b0 = Math.max(0, m.b - m.a);
    const b1 = Math.min(idxMap.length, b0 + lenQn);
    // Second matcher : autojunk par DÉFAUT (true) — fidèle à la source.
    const windowLower = Array.from(flat).slice(b0, b1).join("").toLowerCase();
    const ratio = new SequenceMatcher(qnLower, windowLower).ratio();
    if (ratio >= minRatio && b1 - 1 < idxMap.length) {
      return [idxMap[b0], idxMap[b1 - 1] + 1, ratio];
    }
  }
  return null;
}

// ── Hash stable et empreinte de contexte ──────────────────────────────────────
export { stableHash };

/**
 * Empreinte déterministe d'un contexte d'exécution — la reprise ne réutilise
 * un artefact que si son empreinte correspond. Hex minuscule sans zéros de
 * tête ("%x" % stable_hash(json.dumps(parts, sort_keys=True,
 * ensure_ascii=False, default=str))).
 * Les floats Python entiers (1.0) doivent transiter en PyFloat côté appelant.
 * @param {...unknown} parts @returns {string}
 */
export function empreinte(...parts) {
  return stableHash(pyJsonDumpsEmpreinte(parts)).toString(16);
}
