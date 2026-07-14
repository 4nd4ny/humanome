// Substitut navigateur du système de fichiers de Twin_v9 (journee.py écrit
// caches LLM, calques et carto_jour.json sur disque) : un STORE INJECTABLE
// à sémantique Python. Deux magasins :
//   - artefacts : chemins POSIX → texte (caches .md) ou VALEUR JSON (les
//     .json sont stockés comme objets, avec PyFloat pour les floats entiers —
//     l'hôte qui persiste réellement sérialise via pyJsonDumpsWriteJson et
//     doit re-marquer les floats au rechargement) ;
//   - calquesStore : magasin des calques inter-runs, clé = id de journée
//     (remplace ctx["calques_dir"] ; absent/null → accumulation désactivée).
// Chaque lecture retourne une COPIE PROFONDE : en Python, chaque read_json
// relit le fichier et fabrique des objets neufs — le partage de référence
// serait une divergence de sémantique (mutations accidentelles).

import { PyFloat } from "./py/pyJson.js";
import { codePointCompare } from "./py/pyJson.js";

/**
 * os.path.join simplifié (séparateur "/", segments non vides déjà propres).
 * @param {...string} parts @returns {string}
 */
export function pjoin(...parts) {
  return parts.join("/");
}

/**
 * Copie profonde préservant PyFloat et Map (ordre d'insertion conservé).
 * @param {unknown} v @returns {unknown}
 */
export function deepCopyPy(v) {
  if (v === null || v === undefined || typeof v !== "object") return v;
  if (v instanceof PyFloat) return new PyFloat(v.value);
  if (Array.isArray(v)) return v.map(deepCopyPy);
  if (v instanceof Map) {
    const m = new Map();
    for (const [k, x] of v.entries()) m.set(k, deepCopyPy(x));
    return m;
  }
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = deepCopyPy(x);
  return out;
}

/**
 * Magasin d'artefacts en mémoire (défaut des tests et du navigateur).
 * Interface attendue par heatmap.js / tribunal.js / journee.js :
 *   exists(path) ; readText(path) ; writeText(path, text) ;
 *   readJson(path) ; writeJson(path, value) ; list(dir).
 * `list(dir)` retourne les NOMS (pas les chemins) des entrées immédiates du
 * répertoire, triés par points de code (l'appelant filtre, comme os.listdir
 * + sorted). L'hôte qui lit de vrais fichiers texte doit appliquer
 * universalNewlines (mode texte Python).
 * @returns {{exists: (p: string) => boolean, readText: (p: string) => string,
 *   writeText: (p: string, t: string) => void, readJson: (p: string) => unknown,
 *   writeJson: (p: string, v: unknown) => void, list: (d: string) => string[],
 *   raw: Map<string, unknown>}}
 */
export function memArtefacts() {
  /** @type {Map<string, unknown>} */
  const files = new Map();
  return {
    exists(path) {
      return files.has(path);
    },
    readText(path) {
      if (!files.has(path)) throw new Error(`FileNotFoundError : ${path}`);
      return /** @type {string} */ (files.get(path));
    },
    writeText(path, text) {
      files.set(path, text);
    },
    readJson(path) {
      if (!files.has(path)) throw new Error(`FileNotFoundError : ${path}`);
      return deepCopyPy(files.get(path));
    },
    writeJson(path, value) {
      files.set(path, deepCopyPy(value));
    },
    list(dir) {
      const prefix = dir.endsWith("/") ? dir : dir + "/";
      /** @type {string[]} */
      const names = [];
      for (const p of files.keys()) {
        if (p.startsWith(prefix)) {
          const rest = p.slice(prefix.length);
          if (rest && !rest.includes("/")) names.push(rest);
        }
      }
      return names.sort(codePointCompare);
    },
    raw: files,
  };
}

/**
 * Magasin de calques inter-runs en mémoire : get(jid) → objet store
 * ({journee, texte_empreinte, calques: []}) ou null si absent ;
 * set(jid, store) réécrit. Copie profonde aux deux sens (sémantique
 * lecture/écriture de fichier JSON Python).
 * @returns {{get: (jid: string) => unknown, set: (jid: string, store: unknown) => void,
 *   raw: Map<string, unknown>}}
 */
export function memCalquesStore() {
  /** @type {Map<string, unknown>} */
  const stores = new Map();
  return {
    get(jid) {
      return stores.has(jid) ? deepCopyPy(stores.get(jid)) : null;
    },
    set(jid, store) {
      stores.set(jid, deepCopyPy(store));
    },
    raw: stores,
  };
}
