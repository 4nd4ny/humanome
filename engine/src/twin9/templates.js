// Port de aurora/templates.py — résolution des gabarits de prompts {$VARIABLE}.
// Les gabarits protocole/*.md sont CONFIDENTIELS : chargés comme données par
// l'hôte (jamais recopiés ici), puis résolus par ce module.

import { pyStr } from "./py/pyStr.js";
import { codePointCompare } from "./py/pyJson.js";
import { universalNewlines } from "./py/pyText.js";
import { logWarn } from "./util.js";

const RE_VAR = /\{\$([A-Z_][A-Z0-9_]*)\}/g;

/** Appartenance et lecture dans un dict porté (objet simple ou Map). */
function hasVar(variables, key) {
  if (variables instanceof Map) return variables.has(key);
  return Object.prototype.hasOwnProperty.call(variables, key);
}

function getVar(variables, key) {
  return variables instanceof Map ? variables.get(key) : variables[key];
}

/**
 * Remplace chaque {$VAR} par str(variables['VAR']) (sémantique str() Python :
 * null → "None", true → "True", PyFloat → repr float). Les variables absentes
 * sont laissées telles quelles (warning) sauf en mode strict (erreur).
 * Une clé PRÉSENTE à valeur null est substituée par "None", pas manquante.
 * Pas de ré-analyse de la valeur substituée (un {$X} dans la valeur reste
 * littéral, comme re.sub).
 * @param {string} text
 * @param {Record<string, unknown>|Map<string, unknown>} variables
 * @param {boolean} [strict=false]
 * @returns {string}
 */
export function resolve(text, variables, strict = false) {
  /** @type {Set<string>} */
  const missing = new Set();
  // Forme fonctionnelle obligatoire : la valeur peut contenir $&, $1…
  const out = text.replace(RE_VAR, (m0, key) => {
    if (hasVar(variables, key)) return pyStr(getVar(variables, key));
    missing.add(key);
    return m0;
  });
  if (missing.size) {
    const msg =
      "Variables non résolues : " + Array.from(missing).sort(codePointCompare).join(", ");
    if (strict) throw new Error(msg); // KeyError Python
    logWarn(msg);
  }
  return out;
}

/**
 * resolve_file porté navigateur : l'hôte fournit le CONTENU du gabarit (déjà
 * lu) ; la normalisation universal newlines de read_text est appliquée ici.
 * @param {string} content
 * @param {Record<string, unknown>|Map<string, unknown>} variables
 * @param {boolean} [strict=false]
 * @returns {string}
 */
export function resolveContent(content, variables, strict = false) {
  return resolve(universalNewlines(content), variables, strict);
}

/**
 * Variables CONFIDENTIELLES dérivées des fiches (ADR-010) : le client ne les
 * envoie JAMAIS au serveur (côté client elles ne sont que des placeholders) —
 * c'est le serveur qui les injecte au rendu, à partir des clés de lookup
 * fournies par le moteur (CODE ; POLE_NUM + POLE_FICHES_ORDRE).
 */
export const VARS_FICHES = new Set(["COMPETENCE_FICHE", "POLE_FICHES"]);

/**
 * Sous-ensemble des variables à TRANSMETTRE AU SERVEUR pour un appel : l'état
 * de run (code, pôle, texte, calques…), SANS les variables-fiches secrètes
 * (le serveur les injecte). `extra` ajoute les clés de lookup nécessaires
 * (ex. POLE_FICHES_ORDRE). Valeurs coercées en chaînes/nombres sûrs pour JSON.
 * @param {Record<string, unknown>|Map<string, unknown>} variables
 * @param {Record<string, unknown>} [extra]
 * @returns {Record<string, unknown>}
 */
export function varsClient(variables, extra = null) {
  const src = variables instanceof Map ? Object.fromEntries(variables) : variables;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of Object.keys(src)) {
    if (!VARS_FICHES.has(key)) out[key] = src[key];
  }
  if (extra) for (const key of Object.keys(extra)) out[key] = extra[key];
  return out;
}
