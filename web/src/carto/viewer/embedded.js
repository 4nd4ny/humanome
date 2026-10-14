// Interface ultime — copie autonome : lecture de l'archive embarquée et
// magasin EN MÉMOIRE (rien n'est écrit sur le disque de la personne qui
// ouvre le fichier).

import { createCartoStore, createMemoryAdapter } from '../core/store.js'

/** Lit l'archive embarquée (null si absente ou illisible). */
export function readEmbeddedArchive(doc) {
  try {
    const el = doc.getElementById('carto-data')
    const data = el ? JSON.parse(el.textContent || 'null') : null
    return data && data.kind === 'competency-map-master' && Array.isArray(data.days) ? data : null
  } catch {
    return null
  }
}

/** Magasin en mémoire rempli avec l'archive (jeu, détails par journée, détails de run). */
export async function storeFromArchive(archive) {
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  const dataset = {}
  for (const [k, v] of Object.entries(archive)) {
    if (!['details', 'runDetails', 'exportedAt', 'includesPortfolio', 'anonymizedAt'].includes(k)) dataset[k] = v
  }
  await store.commit({
    dataset,
    detailPatches: new Map(Object.entries(archive.details ?? {}).map(([date, d]) => [date, { variants: d?.variants ?? {}, ...(d?.portfolio ? { portfolio: d.portfolio } : {}) }])),
    runDetails: Object.entries(archive.runDetails ?? {}).map(([key, value]) => ({ key, value })),
  })
  return store
}
