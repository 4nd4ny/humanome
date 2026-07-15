// json.dumps de Python, octet-exact, pour les DEUX profils utilisés par Twin9
// (vérifiés dans aurora/util.py) :
//   - empreinte()  : json.dumps(parts, sort_keys=True, ensure_ascii=False,
//                    default=str) → séparateurs PAR DÉFAUT ", " et ": "
//                    (AVEC espaces), tri des clés par points de code ;
//   - write_json() : json.dump(obj, f, ensure_ascii=False, indent=2) + "\n"
//                    final (le "\n" est ajouté par l'appelant) → séparateur
//                    d'items "," + saut de ligne + indentation, clé-valeur ": ",
//                    ordre d'insertion conservé.
// ensure_ascii=False : non-ASCII littéral ; seuls ", \ et les contrôles < 0x20
// sont échappés (\b \t \n \f \r puis \u00xx minuscule). NaN/Infinity autorisés
// (allow_nan par défaut). Floats en repr Python — un Number entier est un int
// Python, sauf s'il est enveloppé dans PyFloat (1.0 → "1.0").

import { PyFloat, pyFloatRepr, pyStr } from "./pyStr.js";

export { PyFloat };

/** Comparaison de chaînes par points de code (tri Python, jamais localeCompare). */
export function codePointCompare(a, b) {
  const A = Array.from(a);
  const B = Array.from(b);
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const ca = /** @type {number} */ (A[i].codePointAt(0));
    const cb = /** @type {number} */ (B[i].codePointAt(0));
    if (ca !== cb) return ca - cb;
  }
  return A.length - B.length;
}

const ESC = {
  '"': '\\"',
  "\\": "\\\\",
  "\b": "\\b",
  "\t": "\\t",
  "\n": "\\n",
  "\f": "\\f",
  "\r": "\\r",
};

/** Échappement de chaîne JSON Python (ensure_ascii=False). */
function encodeString(s) {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const esc = ESC[ch];
    if (esc !== undefined) {
      out += esc;
    } else if (ch.charCodeAt(0) < 0x20) {
      out += "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
    } else {
      out += ch; // non-ASCII littéral, ni « / » ni U+2028/U+2029 échappés
    }
  }
  return out + '"';
}

/** Nombre → littéral JSON Python (int décimal, float repr, NaN/Infinity nus). */
function encodeNumber(v) {
  if (v instanceof PyFloat) {
    const x = v.value;
    if (Number.isNaN(x)) return "NaN";
    if (x === Infinity) return "Infinity";
    if (x === -Infinity) return "-Infinity";
    return pyFloatRepr(x);
  }
  if (Number.isNaN(v)) return "NaN";
  if (v === Infinity) return "Infinity";
  if (v === -Infinity) return "-Infinity";
  if (Number.isInteger(v) && !Object.is(v, -0)) return String(v);
  return pyFloatRepr(v);
}

/** Coercition des clés non-chaîne de dict, comme le module json Python. */
function coerceKey(k) {
  if (typeof k === "string") return k;
  if (k === true) return "true";
  if (k === false) return "false";
  if (k === null || k === undefined) return "null";
  if (k instanceof PyFloat) return pyFloatRepr(k.value);
  if (typeof k === "number") {
    return Number.isInteger(k) && !Object.is(k, -0) ? String(k) : pyFloatRepr(k);
  }
  throw new TypeError("pyJsonDumps : clé de dict non portée");
}

/**
 * json.dumps(obj) Python.
 * @param {unknown} obj — null/bool/Number/PyFloat/string/Array/objet simple/Map.
 *   Une Map préserve les clés numériques dans l'ordre d'insertion (les objets
 *   JS réordonnent les clés « entières » : utiliser Map dès que des clés
 *   numériques existent — textes_par_journee, rapports_poles…).
 * @param {object} [opts]
 * @param {boolean} [opts.sortKeys=false] — sort_keys=True (tri par points de code).
 * @param {number|null} [opts.indent=null] — indent=N (null : compact par défaut).
 * @param {(v: unknown) => unknown} [opts.defaultFn] — équivalent de default=…
 *   (empreinte passe default=str : fournir (v) => pyStr(v)).
 * @returns {string}
 */
export function pyJsonDumps(obj, { sortKeys = false, indent = null, defaultFn } = {}) {
  const itemSep = indent === null ? ", " : ",";
  const keySep = ": ";

  /** @param {unknown} v @param {number} depth */
  function encode(v, depth) {
    if (v === null || v === undefined) return "null";
    if (v === true) return "true";
    if (v === false) return "false";
    if (typeof v === "string") return encodeString(v);
    if (typeof v === "number" || v instanceof PyFloat) return encodeNumber(v);
    if (Array.isArray(v)) return encodeArray(v, depth);
    if (v instanceof Map) return encodeDict(Array.from(v.entries()), depth);
    if (typeof v === "object" && (v.constructor === Object || v.constructor === undefined)) {
      return encodeDict(Object.entries(v), depth);
    }
    if (defaultFn) return encode(defaultFn(v), depth);
    throw new TypeError("pyJsonDumps : type non sérialisable sans defaultFn");
  }

  /** @param {unknown[]} arr @param {number} depth */
  function encodeArray(arr, depth) {
    if (arr.length === 0) return "[]";
    const items = arr.map((v) => encode(v, depth + 1));
    if (indent === null) return "[" + items.join(itemSep) + "]";
    const pad = "\n" + " ".repeat(indent * (depth + 1));
    const padEnd = "\n" + " ".repeat(indent * depth);
    return "[" + pad + items.join(itemSep + pad) + padEnd + "]";
  }

  /** @param {[unknown, unknown][]} entries @param {number} depth */
  function encodeDict(entries, depth) {
    if (entries.length === 0) return "{}";
    let list = entries;
    if (sortKeys) {
      // Python trie les clés ORIGINALES (mixte str/num → TypeError, comme sorted()).
      list = entries.slice().sort(([ka], [kb]) => {
        if (typeof ka === "string" && typeof kb === "string") {
          return codePointCompare(ka, kb);
        }
        const na = ka instanceof PyFloat ? ka.value : ka;
        const nb = kb instanceof PyFloat ? kb.value : kb;
        if (typeof na === "number" && typeof nb === "number") return na - nb;
        throw new TypeError("pyJsonDumps : sort_keys sur clés de types mixtes");
      });
    }
    const items = list.map(
      ([k, v]) => encodeString(coerceKey(k)) + keySep + encode(v, depth + 1),
    );
    if (indent === null) return "{" + items.join(itemSep) + "}";
    const pad = "\n" + " ".repeat(indent * (depth + 1));
    const padEnd = "\n" + " ".repeat(indent * depth);
    return "{" + pad + items.join(itemSep + pad) + padEnd + "}";
  }

  return encode(obj, 0);
}

/**
 * Profil « empreinte » (util.empreinte) : json.dumps(parts, sort_keys=True,
 * ensure_ascii=False, default=str) — parts est le tableau des arguments.
 * @param {unknown[]} parts
 * @returns {string}
 */
export function pyJsonDumpsEmpreinte(parts) {
  return pyJsonDumps(parts, { sortKeys: true, defaultFn: (v) => pyStr(v) });
}

/**
 * Profil « write_json » (util.write_json) : json.dumps(obj, ensure_ascii=False,
 * indent=2) suivi du "\n" final que write_json ajoute.
 * @param {unknown} obj
 * @returns {string}
 */
export function pyJsonDumpsWriteJson(obj) {
  return pyJsonDumps(obj, { indent: 2 }) + "\n";
}
