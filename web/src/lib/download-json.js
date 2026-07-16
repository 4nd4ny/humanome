// Téléchargement « un clic » d'un résultat JSON (D4) — util UNIQUE partagé par
// les trois surfaces qui exportent une cartographie : Twin9 (ResultatsTwin9),
// Essayer (cartographie-jour) et Twin6 ouverte (cartographie-merge). Avant, seul
// Twin9 avait ce bouton et son code de téléchargement était dupliqué.
//
// RGPD : purement client (Blob application/json + <a download>), rien n'est
// envoyé au serveur ; garde jsdom/SSR (URL.createObjectURL absent -> no-op).

/**
 * Déclenche le téléchargement d'un document JSON.
 *
 * @param {object|string} data document (objet sérialisé JSON.stringify(…, null, 2))
 *   ou chaîne d'octets déjà sérialisée (ex. les octets canoniques de Twin9).
 * @param {string} filename nom de fichier proposé (ex. « cartographie.json »).
 * @returns {boolean} true si le téléchargement a été déclenché, false sinon.
 */
export function downloadJson(data, filename) {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return false
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return true
}
