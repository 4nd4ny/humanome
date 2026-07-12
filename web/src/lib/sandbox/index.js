// Sandbox promptologue (P10.3) — API publique du module.
//
// - runPackageInSandbox : exécute le code d'un prompt-package (une journée)
//   dans l'iframe sandbox + Web Worker, via l'abstraction providers.
// - usesEngineOrchestration : reconnaît les paquets dont l'orchestration est
//   DÉLÉGUÉE au moteur embarqué (paquet par défaut construit par
//   scripts/build-default-prompt-package.mjs, marqueur « engine:// ») — pour
//   eux, le banc d'essai appelle extractDay directement, sans sandbox.

export {
  SANDBOX_CSP,
  MAX_LLM_CALLS_PER_RUN,
  SANDBOX_TIMEOUT_MS,
  buildPromptsMap,
  buildWorkerSource,
  buildSrcdoc,
} from './protocol.js'
export { createIframeHost, runPackageInSandbox } from './sandbox.js'

/**
 * Un paquet « moteur » n'a pas de code d'orchestration exécutable : son
 * orchestration est le moteur embarqué lui-même (extractDay / mergeDays).
 * Reconnu par le flag builtin (paquet embarqué du run-launcher) ou par la
 * référence engine:// posée par le script de génération du paquet par défaut.
 *
 * @param {object} pkg prompt-package (complet ou métadonnées)
 * @returns {boolean}
 */
export function usesEngineOrchestration(pkg) {
  if (!pkg || typeof pkg !== 'object') return false
  if (pkg.builtin === true) return true
  const orchestration = pkg.code?.orchestration
  if (typeof orchestration !== 'string') return false
  return orchestration.includes('engine://')
}
