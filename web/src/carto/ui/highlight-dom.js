// Interface ultime — surlignage dans le portfolio RENDU (spec §8.1).
//
// Le Markdown du portfolio est rendu puis assaini (DOMPurify, ADR-007) ; le
// texte AFFICHÉ est la concaténation de ses nœuds texte, avec un saut de
// ligne virtuel entre deux blocs (sans quoi « fin du paragraphe.Début du
// suivant » ne correspondrait pas à un extrait qui enjambe deux paragraphes).
// Les plages trouvées par le moteur (core/highlight.js) sont enveloppées par
// des <mark> posés SEGMENT PAR SEGMENT : un par nœud texte, jamais un élément
// englobant des <p> ; les segments blancs sont ignorés. Tout passe par
// l'API DOM (aucune chaîne HTML assemblée à la main) sur un <template> inerte,
// puis la sortie repasse par DOMPurify.

import { renderMarkdown } from '../../lib/md.js'
import { renderNarrativeHtml } from '../../lib/narrative.js'
import { locateRendered } from '../core/highlight.js'

const BLOCKS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE', 'FOOTER',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION',
  'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
])

/** Bloc le plus proche d'un nœud (sous la racine). */
function blockOf(node, root) {
  let el = node.parentNode
  while (el && el !== root) {
    if (el.nodeType === 1 && BLOCKS.has(el.nodeName)) return el
    el = el.parentNode
  }
  return root
}

/**
 * Texte affiché d'un fragment et correspondance vers ses nœuds texte.
 * @param {Node} root
 * @returns {{text: string, segments: Array<{node: Text, start: number, end: number}>}}
 */
export function collectText(root) {
  const doc = root.ownerDocument ?? root
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */)
  const segments = []
  let text = ''
  let lastBlock = null
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const block = blockOf(node, root)
    if (lastBlock !== null && block !== lastBlock && text !== '' && !text.endsWith('\n')) text += '\n'
    lastBlock = block
    segments.push({ node, start: text.length, end: text.length + node.data.length })
    text += node.data
  }
  return { text, segments }
}

/**
 * Enveloppe des plages du texte affiché par des <mark>, nœud par nœud.
 * @param {{segments: Array<{node: Text, start: number, end: number}>}} collected sortie de collectText
 * @param {Array<{from: number, to: number, complete: boolean}>} ranges plages (non chevauchantes après tri)
 * @param {{current?: number | null}} [opts] occurrence mise en avant (classe carto-hl--current)
 * @returns {number} nombre de <mark> posés
 */
export function wrapRanges(collected, ranges, { current = null } = {}) {
  const pieces = new Map() // nœud → [{a, b, occurrence, complete}]
  ranges.forEach((r, occurrence) => {
    for (const seg of collected.segments) {
      if (seg.end <= r.from || seg.start >= r.to) continue
      const a = Math.max(r.from, seg.start) - seg.start
      const b = Math.min(r.to, seg.end) - seg.start
      if (b <= a) continue
      if (!pieces.has(seg.node)) pieces.set(seg.node, [])
      pieces.get(seg.node).push({ a, b, occurrence, complete: r.complete })
    }
  })
  let count = 0
  for (const [node, list] of pieces) {
    // De la fin vers le début : les découpes n'invalident pas les positions restantes.
    list.sort((x, y) => y.a - x.a)
    let limit = node.data.length
    for (const p of list) {
      const b = Math.min(p.b, limit)
      if (b <= p.a) continue
      limit = p.a
      const slice = node.data.slice(p.a, b)
      if (slice.trim() === '') continue // segment blanc : ignoré
      const doc = node.ownerDocument
      const target = p.a > 0 ? node.splitText(p.a) : node
      if (b - p.a < target.data.length) target.splitText(b - p.a)
      const mark = doc.createElement('mark')
      mark.className = `carto-hl ${p.complete ? 'carto-hl--complete' : 'carto-hl--partial'}${p.occurrence === current ? ' carto-hl--current' : ''}`
      mark.setAttribute('data-occurrence', String(p.occurrence))
      target.parentNode.replaceChild(mark, target)
      mark.appendChild(target)
      count++
    }
  }
  return count
}

/** Fragment inerte (aucun script, aucune ressource chargée). */
function inertFragment(html) {
  const tpl = document.createElement('template')
  tpl.innerHTML = renderNarrativeHtml(html) // déjà assaini en amont : on réassainit quand même
  return tpl.content
}

// Cache du rendu par segment de portfolio (les objets de détail sont immuables).
const rendered = new WeakMap()

/**
 * Rendu assaini d'un segment de portfolio et son texte affiché.
 * @param {{text: string}} portfolio détail `portfolio` d'une journée
 * @returns {{html: string, text: string}}
 */
export function renderPortfolio(portfolio) {
  if (!portfolio || typeof portfolio.text !== 'string') return { html: '', text: '' }
  const hit = rendered.get(portfolio)
  if (hit) return hit
  const html = renderMarkdown(portfolio.text)
  const { text } = collectText(inertFragment(html))
  const out = { html, text }
  rendered.set(portfolio, out)
  return out
}

/**
 * Plages d'un extrait dans le texte affiché d'un segment (ou null sans texte).
 * @param {{text: string} | null | undefined} portfolio
 * @param {{start?: string, end?: string | null, extract?: string}} anchors
 */
export function locateInPortfolio(portfolio, anchors) {
  if (!portfolio || typeof portfolio.text !== 'string' || portfolio.text.trim() === '') return null
  return locateRendered(renderPortfolio(portfolio).text, anchors)
}

/**
 * HTML du segment avec les plages surlignées.
 * @param {string} html HTML assaini du segment (renderPortfolio(...).html)
 * @param {Array<{from: number, to: number, complete: boolean}>} ranges plages dans le texte affiché
 * @param {{current?: number | null}} [opts] occurrence mise en avant
 * @returns {{html: string, marks: number}}
 */
export function highlightHtml(html, ranges, { current = null } = {}) {
  const frag = inertFragment(html)
  const marks = ranges.length > 0 ? wrapRanges(collectText(frag), ranges, { current }) : 0
  const box = document.createElement('div')
  box.appendChild(frag)
  return { html: renderNarrativeHtml(box.innerHTML), marks }
}
