// Thème clair / sombre. Trois états logiques :
//   - aucun choix explicite : on SUIT le système (prefers-color-scheme),
//     l'attribut data-theme est absent, le CSS s'en charge seul ;
//   - 'light' / 'dark' : choix explicite persistant, posé sur <html data-theme>.
//
// Le script anti-FOUC d'index.html pose data-theme AVANT le premier paint
// quand un choix est stocké ; ce module gère ensuite la bascule à chaud.

const STORAGE_KEY = 'humanome-theme'

/** @returns {boolean} true si l'environnement expose un DOM (pas les tests unitaires headless purs) */
function hasDom() {
  return typeof document !== 'undefined' && !!document.documentElement
}

/** @returns {'light' | 'dark' | null} choix explicite stocké, sinon null (= suit le système) */
export function storedTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

/** @returns {'light' | 'dark'} thème du système (défaut clair si indécidable) */
export function systemTheme() {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

/** @returns {'light' | 'dark'} thème EFFECTIF (choix explicite sinon système) */
export function resolvedTheme() {
  return storedTheme() ?? systemTheme()
}

/**
 * Applique un thème et le persiste comme choix explicite.
 * @param {'light' | 'dark'} theme
 */
export function applyTheme(theme) {
  if (hasDom()) document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* stockage indisponible (mode privé) : la bascule reste valable pour la session */
  }
}

/**
 * S'abonne aux changements du thème système, UNIQUEMENT tant qu'aucun choix
 * explicite n'est stocké (sinon le choix prime). Appelle `cb(theme)` au change.
 * @param {(theme: 'light' | 'dark') => void} cb
 * @returns {() => void} désabonnement
 */
export function subscribeSystemTheme(cb) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (event) => {
    if (storedTheme() === null) cb(event.matches ? 'dark' : 'light')
  }
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', handler)
  else if (typeof mq.addListener === 'function') mq.addListener(handler)
  return () => {
    if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', handler)
    else if (typeof mq.removeListener === 'function') mq.removeListener(handler)
  }
}
