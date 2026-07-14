// Port de aurora/portfolio.py — découpage du portfolio en feuilles datées.
//
// Marqueurs reconnus (dans l'ordre) :
//   1. titres `### DD.MM.YY` / `### DD.MM.YYYY` / `### YYYY-MM-DD`
//   2. tout titre `## ...` ou `### ...` (journaux hebdomadaires)
//   3. à défaut : le document entier = une feuille unique
//
// Les offsets start/end sont en POINTS DE CODE dans `raw` (sémantique Python,
// persistés dans les artefacts et comparés bit-à-bit). La normalisation
// universal newlines est appliquée ICI (read_text Python la faisait à la
// lecture) — avant toute regex ^/$ et tout calcul d'offsets.

import {
  PY_WS_CLASS,
  pyStrip,
  pyLStrip,
  pySplitlines,
  universalNewlines,
  cpLen,
  u16ToCpIndexer,
} from "./py/pyText.js";
import { pyFormat } from "./py/pyStr.js";
import { codePointCompare } from "./py/pyJson.js";

// ^#{2,3}\s+.*?(\d{1,2}\.\d{1,2}\.\d{2,4}|\d{4}-\d{2}-\d{2}) MULTILINE.
// Le « . » Python n'exclut que \n → [^\n] ; le \s+ Python PEUT absorber des
// sauts de ligne (un `##` seul suivi d'une date en ligne suivante matche).
const RE_DATE_TITLE = new RegExp(
  "^#{2,3}[" + PY_WS_CLASS + "]+[^\\n]*?(\\d{1,2}\\.\\d{1,2}\\.\\d{2,4}|\\d{4}-\\d{2}-\\d{2})",
  "gm",
);
// ^#{2,3}\s+(.+)$ MULTILINE — h1 et h4+ ne sont jamais des séparateurs.
const RE_ANY_TITLE = new RegExp("^#{2,3}[" + PY_WS_CLASS + "]+([^\\n]+)$", "gm");

/**
 * _iso : DD.MM.YY(YY) → "YYYY-MM-DD" (année à 2-3 chiffres : 2000 + n ;
 * aucune validation calendaire) ; sinon chaîne inchangée.
 * @param {string} raw @returns {string}
 */
function iso(raw) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(raw);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const y = m[3].length === 4 ? parseInt(m[3], 10) : 2000 + parseInt(m[3], 10);
    return pyFormat("%04d-%02d-%02d", y, mo, d);
  }
  return raw;
}

/** os.path.splitext : coupe à la DERNIÈRE extension (les points de tête ne comptent pas). */
function stemOf(basename) {
  const dot = basename.lastIndexOf(".");
  if (dot <= 0) return basename; // pas de point, ou ".fichier" sans autre point
  let i = 0;
  while (i < dot && basename[i] === ".") i++;
  if (i === dot) return basename; // uniquement des points avant → pas d'extension
  return basename.slice(0, dot);
}

/**
 * @typedef {{id: string, date: string|null, titre: string, start: number,
 *            end: number, texte: string}} Feuille
 */

/**
 * split_portfolio porté : prend le TEXTE BRUT (l'hôte a lu le fichier) et le
 * nom de fichier (pour journal_id).
 * @param {string} texteBrut
 * @param {string} [nomFichier=""] — nom ou chemin du fichier source.
 * @returns {{journal_id: string, raw: string, feuilles: Feuille[]}}
 */
export function splitPortfolio(texteBrut, nomFichier = "") {
  const raw = universalNewlines(texteBrut);
  const basename = nomFichier.split("/").pop() || "";
  const journalId = pyStrip(stemOf(basename).replace(/[^A-Za-z0-9_-]+/g, "_"), "_");
  const toCp = u16ToCpIndexer(raw);
  let matches = Array.from(raw.matchAll(RE_DATE_TITLE));
  const dated = matches.length >= 2;
  if (!dated) matches = Array.from(raw.matchAll(RE_ANY_TITLE));
  /** @type {Feuille[]} */
  let feuilles = [];
  if (matches.length >= 2) {
    /** @type {Record<string, number>} */
    const vus = {};
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const startU16 = /** @type {number} */ (m.index);
      const endU16 = i + 1 < matches.length ? /** @type {number} */ (matches[i + 1].index) : raw.length;
      const titre = pyStrip(pyLStrip(m[0], "# "));
      const date = dated ? iso(m[1]) : null;
      let fid = date ? date : pyFormat("F%02d", i + 1);
      // Deux entrées le même jour (matin/soir…) : ids UNIQUES — la 2e occurrence
      // reçoit le suffixe _b (pas _a), la 3e _c, etc.
      if (Object.prototype.hasOwnProperty.call(vus, fid)) {
        vus[fid] += 1;
        fid = fid + "_" + String.fromCharCode("a".charCodeAt(0) + vus[fid]);
      } else {
        vus[fid] = 0;
      }
      feuilles.push({
        id: fid,
        date,
        titre,
        start: toCp(startU16),
        end: endU16 === raw.length ? cpLen(raw) : toCp(endU16),
        texte: pyStrip(raw.slice(startU16, endU16)),
      });
    }
    if (dated && feuilles.every((f) => f.date)) {
      // Tri stable par (date, id) — comparaison par points de code.
      feuilles.sort(
        (a, b) =>
          codePointCompare(/** @type {string} */ (a.date), /** @type {string} */ (b.date)) ||
          codePointCompare(a.id, b.id),
      );
    }
  }
  if (!feuilles.length) {
    feuilles = [
      { id: "F01", date: null, titre: journalId, start: 0, end: cpLen(raw), texte: pyStrip(raw) },
    ];
  }
  return { journal_id: journalId, raw, feuilles };
}

/**
 * Concatène des feuilles au format attendu par les prompts du tribunal :
 * "═══ Feuille : ID ═══\ntexte\n", jointes par "\n".
 * @param {Feuille[]|{id: string, texte: string}[]} feuilles @returns {string}
 */
export function feuillesBlock(feuilles) {
  const parts = [];
  for (const f of feuilles) parts.push(pyFormat("═══ Feuille : %s ═══\n%s\n", f.id, f.texte));
  return parts.join("\n");
}

// (?<=[.!?])\s+ — découpe en phrases après ./!/? suivis d'espaces (consommés).
const RE_SENT_SPLIT = new RegExp("(?<=[.!?])[" + PY_WS_CLASS + "]+");

/**
 * Phrases candidates (pour le backend mock et les diagnostics) :
 * [[feuille_id, phrase]] — l'ordre et le contenu exacts alimentent les tirages
 * déterministes du mock : parité stricte requise. Longueurs en points de code.
 * @param {{feuilles: Feuille[]}} portfolio
 * @param {number} [minLen=60] @param {number} [maxLen=400]
 * @returns {[string, string][]}
 */
export function sentencesOf(portfolio, minLen = 60, maxLen = 400) {
  /** @type {[string, string][]} */
  const out = [];
  for (const f of portfolio.feuilles) {
    for (const rawLine of pySplitlines(f.texte)) {
      const line = pyStrip(rawLine);
      // Filtre sur la ligne ENTIÈRE strippée, avant découpe en phrases.
      if (line.startsWith("#") || cpLen(line) < minLen) continue;
      for (const seg of line.split(RE_SENT_SPLIT)) {
        const s = pyStrip(seg);
        const n = cpLen(s);
        if (minLen <= n && n <= maxLen) out.push([f.id, s]);
      }
    }
  }
  return out;
}
