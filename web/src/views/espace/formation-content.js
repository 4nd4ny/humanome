// Contenu de formation (P8.2 puis M7, cahier §4.6) — EMBARQUÉ AU BUILD,
// MULTI-PARCOURS ('apprenant' | 'cartographe' | 'promptologue').
//
// Les Markdown de content/formation/<parcours>/ sont importés statiquement
// (import.meta.glob eager + ?raw) : ils voyagent dans le bundle IIFE et la
// formation fonctionne donc aussi sur une copie statique/file:// (ADR-003).
// import.meta.glob exige des motifs LITTÉRAUX : un glob par parcours.
// index.md est exclu de la liste des chapitres : l'accueil de la formation est
// reconstruit depuis les front-matter (le mini-parseur md.js ne rend pas les
// tableaux Markdown de l'index, volontairement).
//
// Compatibilité : tous les points d'entrée gardent 'apprenant' par défaut —
// les appels existants de l'espace apprenant sont inchangés.

import { parseFrontMatter } from '../../lib/md.js'

// Chemins relatifs depuis web/src/views/espace/ vers la racine du monorepo.
const FILES_BY_PARCOURS = {
  apprenant: import.meta.glob('../../../../content/formation/apprenant/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  cartographe: import.meta.glob('../../../../content/formation/cartographe/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  promptologue: import.meta.glob('../../../../content/formation/promptologue/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
}

/** Parcours de formation disponibles (cahier §4.6). */
export const FORMATION_PARCOURS = Object.freeze(Object.keys(FILES_BY_PARCOURS))

/** Base du hash de route de chaque parcours (routing pré-câblé, ADR-009). */
export const FORMATION_BASE_HASH = Object.freeze({
  apprenant: '#/espace/formation',
  cartographe: '#/cartographe/formation',
  promptologue: '#/promptologue/formation',
})

/** @param {string} path @returns {string} slug = nom de fichier sans .md */
function slugOf(path) {
  return path.split('/').pop().replace(/\.md$/, '')
}

/** @param {string} parcours @returns {Record<string, string>} fichiers du parcours */
function filesOf(parcours) {
  const files = FILES_BY_PARCOURS[parcours]
  if (!files) {
    throw new Error(
      `Parcours de formation inconnu « ${parcours} » (attendus : ${FORMATION_PARCOURS.join(', ')})`,
    )
  }
  return files
}

const caches = new Map()

/**
 * Chapitres d'un parcours de formation, triés par numéro d'ordre.
 * @param {'apprenant'|'cartographe'|'promptologue'} [parcours='apprenant']
 * @returns {Array<{slug: string, ordre: number, titre: string, raw: string}>}
 */
export function listChapters(parcours = 'apprenant') {
  if (caches.has(parcours)) return caches.get(parcours)
  const chapters = Object.entries(filesOf(parcours))
    .map(([path, raw]) => ({ slug: slugOf(path), raw: String(raw) }))
    .filter(({ slug }) => slug !== 'index')
    .map(({ slug, raw }) => {
      const { meta } = parseFrontMatter(raw)
      const prefix = /^(\d+)/.exec(slug)
      return {
        slug,
        ordre: typeof meta.chapitre === 'number' ? meta.chapitre : Number(prefix?.[1] ?? 0),
        titre: typeof meta.titre === 'string' && meta.titre !== '' ? meta.titre : slug,
        raw,
      }
    })
    .sort((a, b) => a.ordre - b.ordre || a.slug.localeCompare(b.slug))
  caches.set(parcours, chapters)
  return chapters
}

/**
 * @param {string} slug
 * @param {'apprenant'|'cartographe'|'promptologue'} [parcours='apprenant']
 * @returns {{slug: string, ordre: number, titre: string, raw: string} | null}
 */
export function getChapter(slug, parcours = 'apprenant') {
  return listChapters(parcours).find((c) => c.slug === slug) ?? null
}

/**
 * Réécrit les liens internes des chapitres (« 02-….md » ->
 * « #/<espace du parcours>/formation/02-… ») ; les autres href sont laissés
 * intacts.
 * @param {string} href
 * @param {'apprenant'|'cartographe'|'promptologue'} [parcours='apprenant']
 * @returns {string}
 */
export function rewriteChapterLink(href, parcours = 'apprenant') {
  const match = /^(?:\.\/)?([0-9][0-9a-z-]*)\.md$/.exec(String(href ?? ''))
  if (match && getChapter(match[1], parcours)) {
    return `${FORMATION_BASE_HASH[parcours]}/${match[1]}`
  }
  return href
}
