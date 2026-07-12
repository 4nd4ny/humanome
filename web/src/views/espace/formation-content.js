// Contenu de formation apprenant (P8.2, cahier §4.6) — EMBARQUÉ AU BUILD.
//
// Les Markdown de content/formation/apprenant/ sont importés statiquement
// (import.meta.glob eager + ?raw) : ils voyagent dans le bundle IIFE et la
// formation fonctionne donc aussi sur une copie statique/file:// (ADR-003).
// index.md est exclu de la liste des chapitres : l'accueil de la formation est
// reconstruit depuis les front-matter (le mini-parseur md.js ne rend pas les
// tableaux Markdown de l'index, volontairement).

import { parseFrontMatter } from '../../lib/md.js'

// Chemin relatif depuis web/src/views/espace/ vers la racine du monorepo.
const files = import.meta.glob('../../../../content/formation/apprenant/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** @param {string} path @returns {string} slug = nom de fichier sans .md */
function slugOf(path) {
  return path.split('/').pop().replace(/\.md$/, '')
}

let cache = null

/**
 * Chapitres du parcours apprenant, triés par numéro d'ordre.
 * @returns {Array<{slug: string, ordre: number, titre: string, raw: string}>}
 */
export function listChapters() {
  if (cache) return cache
  cache = Object.entries(files)
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
  return cache
}

/**
 * @param {string} slug
 * @returns {{slug: string, ordre: number, titre: string, raw: string} | null}
 */
export function getChapter(slug) {
  return listChapters().find((c) => c.slug === slug) ?? null
}

/**
 * Réécrit les liens internes des chapitres (« 02-….md » ->
 * « #/espace/formation/02-… ») ; les autres href sont laissés intacts.
 * @param {string} href
 * @returns {string}
 */
export function rewriteChapterLink(href) {
  const match = /^(?:\.\/)?([0-9][0-9a-z-]*)\.md$/.exec(String(href ?? ''))
  if (match && getChapter(match[1])) return `#/espace/formation/${match[1]}`
  return href
}
