// Sandbox promptologue (P10.3) — protocole et constructeurs de sources.
//
// Pièce de SÉCURITÉ : le code d'orchestration d'un prompt-package est du code
// arbitraire écrit par un tiers. Il s'exécute exclusivement dans un Web Worker
// (blob) créé DANS un iframe sandbox="allow-scripts" (origine opaque) dont le
// document srcdoc porte une CSP « default-src 'none' » : pas de DOM utile,
// pas de cookies/storage (origine opaque), pas de réseau (fetch/XHR/WebSocket
// bloqués par la CSP). La SEULE interface du worker est postMessage :
//
//   parent -> iframe : {type:'init', workerSource}          (après 'boot')
//   parent -> iframe -> worker : {type:'run', dayText, date, referentiel}
//   worker -> iframe -> parent : {type:'llm', id, prompt}   (demande d'appel LLM)
//   parent -> iframe -> worker : {type:'llm-ok', id, text} | {type:'llm-error', id, message}
//   worker -> iframe -> parent : {type:'result', document} | {type:'error', message}
//
// Le PARENT (sandbox.js) route les demandes 'llm' vers l'abstraction providers
// avec un quota d'appels et un timeout global, puis valide le document final
// au schéma. Modèle de menace complet : docs/securite-prompts.md.
//
// IMPORTANT : le code du paquet ne transite JAMAIS par le HTML du srcdoc
// (aucun risque d'évasion par « </script> ») — il voyage par postMessage et
// n'existe que comme chaîne passée à new Blob(). Le srcdoc est une chaîne
// FIGÉE (hashable pour la CSP de production, voir docs/securite-prompts.md).

/** CSP du document iframe : rien n'est chargeable hors scripts inline + blobs. */
export const SANDBOX_CSP =
  "default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:"

/** Quota d'appels LLM par run sandboxé (anti-DoS et anti-facture). */
export const MAX_LLM_CALLS_PER_RUN = 16

/** Timeout global d'un run sandboxé : 5 minutes, puis terminate. */
export const SANDBOX_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Table des gabarits exposée au code du paquet : par rôle (premier gabarit du
 * rôle) et par « role/nom » (accès non ambigu quand un rôle a plusieurs
 * gabarits).
 * @param {Array<{role: string, nom: string, texte: string}>} prompts
 * @returns {Record<string, string>}
 */
export function buildPromptsMap(prompts) {
  const map = {}
  for (const p of prompts ?? []) {
    if (!p || typeof p.role !== 'string' || typeof p.texte !== 'string') continue
    if (!(p.role in map)) map[p.role] = p.texte
    if (typeof p.nom === 'string') map[`${p.role}/${p.nom}`] = p.texte
  }
  return map
}

/**
 * Source du Web Worker (module) : shim providers + chargement du module
 * d'orchestration du paquet comme blob ESM séparé (import dynamique), puis
 * appel de l'entrypoint. Toutes les données du paquet sont injectées par
 * JSON.stringify : jamais de concaténation de code brut dans du code.
 *
 * @param {{prompts: Array, code: {orchestration: string, entrypoint: string}}} pkg
 * @returns {string} source JavaScript du worker
 */
export function buildWorkerSource(pkg) {
  const orchestration = pkg?.code?.orchestration
  const entrypoint = pkg?.code?.entrypoint
  if (typeof orchestration !== 'string' || orchestration === '') {
    throw new TypeError('buildWorkerSource : code.orchestration requis')
  }
  if (typeof entrypoint !== 'string' || entrypoint === '') {
    throw new TypeError('buildWorkerSource : code.entrypoint requis')
  }
  const promptsMap = buildPromptsMap(pkg.prompts)
  return `// Worker sandbox humanome (P10.3) — généré par web/src/lib/sandbox/protocol.js
'use strict';
const PKG_CODE = ${JSON.stringify(orchestration)};
const ENTRYPOINT = ${JSON.stringify(entrypoint)};
const PROMPTS = ${JSON.stringify(promptsMap)};
let nextId = 0;
const pending = new Map();
const providers = {
  complete(prompt) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      self.postMessage({ type: 'llm', id, prompt: String(prompt) });
    });
  },
};
let modulePromise = null;
function loadModule() {
  if (!modulePromise) {
    const url = URL.createObjectURL(new Blob([PKG_CODE], { type: 'text/javascript' }));
    modulePromise = import(url);
  }
  return modulePromise;
}
self.onmessage = async (event) => {
  const msg = (event && event.data) || {};
  if (msg.type === 'llm-ok') {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (p) p.resolve(msg.text);
    return;
  }
  if (msg.type === 'llm-error') {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (p) p.reject(new Error(msg.message || 'appel LLM refusé'));
    return;
  }
  if (msg.type !== 'run') return;
  try {
    const mod = await loadModule();
    const fn = mod[ENTRYPOINT];
    if (typeof fn !== 'function') {
      throw new Error("entrypoint introuvable dans le module d'orchestration : " + ENTRYPOINT);
    }
    const document = await fn({
      texteFeuille: msg.dayText,
      dayText: msg.dayText,
      dateFeuille: msg.date,
      date: msg.date,
      referentiel: msg.referentiel,
      providers,
      prompts: PROMPTS,
    });
    self.postMessage({ type: 'result', document });
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
`
}

/**
 * Document srcdoc de l'iframe sandbox — chaîne FIGÉE (aucune interpolation de
 * données utilisateur) : le script de bootstrap relaie les messages entre le
 * parent et le worker, et crée le worker à la réception de {type:'init'}.
 * @returns {string} HTML complet du srcdoc
 */
export function buildSrcdoc() {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}"></head><body><script>
(function () {
  'use strict';
  var worker = null;
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    var msg = event.data || {};
    if (msg.type === 'init') {
      if (worker) return;
      try {
        var url = URL.createObjectURL(new Blob([String(msg.workerSource)], { type: 'text/javascript' }));
        // Worker CLASSIQUE volontairement : dans une iframe sandbox (origine
        // opaque), Chromium refuse de charger un worker { type: 'module' }
        // depuis un blob (fetch de module soumis à CORS, opaque -> échec,
        // constaté à l'intégration M7). Le source généré par
        // buildWorkerSource() n'utilise aucune syntaxe de module au
        // top-level ; le code du paquet, lui, reste un module ESM chargé
        // par import() dynamique — permis dans un worker classique.
        worker = new Worker(url);
        worker.onmessage = function (e) { window.parent.postMessage(e.data, '*'); };
        worker.onerror = function (e) {
          window.parent.postMessage({ type: 'error', message: 'Worker : ' + (e.message || 'erreur de chargement') }, '*');
        };
        window.parent.postMessage({ type: 'ready' }, '*');
      } catch (err) {
        window.parent.postMessage({ type: 'error', message: String((err && err.message) || err) }, '*');
      }
      return;
    }
    if (worker) worker.postMessage(msg);
  });
  window.parent.postMessage({ type: 'boot' }, '*');
})();
</` + `script></body></html>`
}
