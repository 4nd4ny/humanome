// Port de aurora/referentiel.py — référentiel RESPIRE v7 : parsing des fiches
// de pôle P1..P7.md. Chaque fiche = un préambule (avant la première
// compétence) + des sections `## X.YY — Nom` (tiret U+2014 obligatoire).
//
// Les fiches vivent dans les gabarits confidentiels (protocole/tagger/) : le
// moteur navigateur reçoit le référentiel PARSÉ en entrée (injecté par l'hôte
// — côté serveur ou tests). Ce module porte le PARSING (utilisable côté
// import/serveur et par les tests avec une fiche factice) ainsi que la
// permutation déterministe.

import { PY_WS_CLASS, pyStrip, pyRStrip } from "./py/pyText.js";
import { pyFormat, pyStr } from "./py/pyStr.js";
import { stableHash } from "./py/stableHash.js";

export const POLE_NOMS = {
  1: "TÊTE — Penser & Comprendre",
  2: "CŒUR — Relier & Naviguer",
  3: "MAIN — Créer & Incarner",
  4: "ÂME — Discerner & Juger",
  5: "RACINES — Évoluer & Résister",
  6: "CITÉ — Gouverner & S'ouvrir",
  7: "FLAMBEAU — Transmettre & Piloter",
};

// ^##\s+(\d\.\d{2})\s*—\s*(.+?)\s*$ MULTILINE — « . » Python → [^\n],
// \s Python → [PY_WS_CLASS] ; exactement ## (### ne matche pas : le 3e #
// n'est pas un espace).
const RE_COMP = new RegExp(
  "^##[" +
    PY_WS_CLASS +
    "]+(\\d\\.\\d{2})[" +
    PY_WS_CLASS +
    "]*—[" +
    PY_WS_CLASS +
    "]*([^\\n]+?)[" +
    PY_WS_CLASS +
    "]*$",
  "gm",
);

/**
 * @typedef {{code: string, nom: string, fiche_md: string}} Competence
 */

export class Pole {
  /**
   * @param {number} num
   * @param {string} header — préambule NON strippé (avant la 1re compétence).
   * @param {Competence[]} competences
   */
  constructor(num, header, competences) {
    this.num = num;
    this.nom = POLE_NOMS[num] !== undefined ? POLE_NOMS[num] : pyFormat("Pôle %d", num);
    this.header = header;
    this.competences = competences;
  }

  /**
   * Fiche du pôle, sections éventuellement réordonnées (décorrélation).
   * @param {number[]|null} [ordre=null] — indices (typiquement permutation()).
   * @returns {string}
   */
  ficheComplete(ordre = null) {
    let comps = this.competences;
    if (ordre !== null) comps = ordre.map((i) => this.competences[i]);
    return (
      pyRStrip(this.header) +
      "\n\n" +
      comps.map((c) => pyStrip(c.fiche_md)).join("\n\n---\n\n") +
      "\n"
    );
  }

  /**
   * Première compétence de code exact, sinon null.
   * @param {string} code @returns {Competence|null}
   */
  competence(code) {
    for (const c of this.competences) {
      if (c.code === code) return c;
    }
    return null;
  }
}

/**
 * parse_pole porté : prend le CONTENU de la fiche (déjà lu par l'hôte ; la
 * normalisation universal newlines de read_text doit avoir été appliquée par
 * l'appelant si la source peut contenir des CRLF — loadReferentiel le fait).
 * @param {string} text — contenu de P{num}.md (universal newlines déjà faites).
 * @param {number} num
 * @param {string} [label] — nom affiché dans l'erreur (défaut "P{num}.md").
 * @returns {Pole}
 */
export function parsePole(text, num, label) {
  const matches = Array.from(text.matchAll(RE_COMP));
  if (!matches.length) {
    throw new Error(
      pyFormat("Aucune section '## X.YY — Nom' dans %s", label !== undefined ? label : pyFormat("P%d.md", num)),
    );
  }
  const header = text.slice(0, /** @type {number} */ (matches[0].index));
  /** @type {Competence[]} */
  const comps = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = /** @type {number} */ (m.index);
    const end = i + 1 < matches.length ? /** @type {number} */ (matches[i + 1].index) : text.length;
    comps.push({ code: m[1], nom: pyStrip(m[2]), fiche_md: pyStrip(text.slice(start, end)) });
  }
  return new Pole(num, header, comps);
}

/**
 * load_referentiel porté : l'hôte fournit les contenus des 7 fiches.
 * Vérifie l'unicité GLOBALE des codes. Retourne une Map à clés numériques
 * 1..7 (ordre d'insertion = ordre numérique ; itérer via un ordre explicite).
 * @param {Record<number|string, string>|Map<number, string>} fiches —
 *   contenus bruts par numéro de pôle (1..7) ; fiche manquante → erreur.
 * @returns {Map<number, Pole>}
 */
export function loadReferentiel(fiches) {
  /** @type {Map<number, Pole>} */
  const poles = new Map();
  /** @type {Set<string>} */
  const seen = new Set();
  for (let n = 1; n <= 7; n++) {
    const content = fiches instanceof Map ? fiches.get(n) : fiches[n];
    if (typeof content !== "string") {
      throw new Error(pyFormat("Fiche de pôle manquante : P%d.md", n));
    }
    const p = parsePole(content, n);
    for (const c of p.competences) {
      if (seen.has(c.code)) {
        throw new Error(pyFormat("Code dupliqué dans le référentiel : %s", c.code));
      }
      seen.add(c.code);
    }
    poles.set(n, p);
  }
  return poles;
}

/**
 * Reconstruit {num: Pole} depuis la structure injectée (test/twin9-oracles/
 * referentiel.json ou API) : [{num, nom, competences: [{code, nom,
 * fiche_md?}]}]. Les fiches confidentielles absentes sont remplacées par des
 * gabarits factices — sans effet sur la parité mock (le mock ignore le texte
 * des prompts ; seul prompt_chars des métriques en dépendrait, hors oracle).
 * @param {{num: number, nom?: string,
 *          competences: {code: string, nom: string, fiche_md?: string}[]}[]} structure
 * @returns {Map<number, Pole>}
 */
export function polesFromStructure(structure) {
  /** @type {Map<number, Pole>} */
  const poles = new Map();
  for (const p of structure) {
    const comps = p.competences.map((c) => ({
      code: c.code,
      nom: c.nom,
      fiche_md:
        c.fiche_md !== undefined
          ? c.fiche_md
          : pyFormat("## %s — %s\n\n(fiche injectée absente — factice)", c.code, c.nom),
    }));
    poles.set(p.num, new Pole(p.num, pyFormat("# Pôle %d — %s\n", p.num, POLE_NOMS[p.num] || ""), comps));
  }
  return poles;
}

/**
 * all_competences : tuples [num, code, nom] — pôles en ordre NUMÉRIQUE
 * croissant (jamais l'ordre d'insertion implicite).
 * @param {Map<number, Pole>} poles
 * @returns {[number, string, string][]}
 */
export function allCompetences(poles) {
  /** @type {[number, string, string][]} */
  const out = [];
  const nums = Array.from(poles.keys()).sort((a, b) => a - b);
  for (const n of nums) {
    for (const c of /** @type {Pole} */ (poles.get(n)).competences) {
      out.push([n, c.code, c.nom]);
    }
  }
  return out;
}

/**
 * Permutation déterministe (rotation + inversion) pour décorréler les passes.
 * h est un entier 48 bits : JAMAIS d'opérateur binaire JS dessus (troncature
 * 32 bits) — h >> 8 devient Math.floor(h / 256).
 * @param {number} nItems
 * @param {unknown} seedKey — passé dans str() Python (pyStr).
 * @returns {number[]}
 */
export function permutation(nItems, seedKey) {
  const h = stableHash(pyStr(seedKey));
  let idx = Array.from({ length: nItems }, (_v, i) => i);
  const rot = nItems ? h % nItems : 0;
  idx = idx.slice(rot).concat(idx.slice(0, rot));
  if (Math.floor(h / 256) % 2) idx.reverse();
  return idx;
}
