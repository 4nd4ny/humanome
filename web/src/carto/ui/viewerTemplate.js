// Interface ultime — modèle de la copie autonome (spec §11, point 2) :
// public/carto/viewer-template.html, construit par scripts/build-viewer.mjs
// et livré avec le site. Lu une fois par session, puis gardé en mémoire.

import { DATA_SLOT } from '../core/standalone.js'

export const TEMPLATE_URL = 'carto/viewer-template.html'

const defaultFetch = (...args) => fetch(...args)
const cache = new WeakMap()

/** @param {typeof fetch} [fetchFn] */
export async function loadViewerTemplate(fetchFn = defaultFetch) {
  if (cache.has(fetchFn)) return cache.get(fetchFn)
  const res = await fetchFn(TEMPLATE_URL)
  if (!res.ok) throw new Error(`modèle de copie autonome introuvable (HTTP ${res.status})`)
  const text = await res.text()
  // Un serveur de développement renvoie la page d'accueil pour un fichier absent.
  if (!text.includes(DATA_SLOT)) throw new Error('modèle de copie autonome introuvable : lancez « npm run build:viewer »')
  cache.set(fetchFn, text)
  return text
}
