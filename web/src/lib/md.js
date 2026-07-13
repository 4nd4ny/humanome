// Mini-parseur Markdown maison (P8.2) — SANS dépendance de parsing.
//
// Couverture volontairement limitée au sous-ensemble utilisé par les contenus
// de formation (content/formation/**) : titres #/##/###(+), listes «-»/«*»,
// gras/italique, liens [texte](url), code inline, blockquote, front-matter
// YAML ignoré proprement. Tout le texte est échappé AVANT la pose des balises,
// puis la sortie complète repasse par DOMPurify (renderMarkdown réutilise
// web/src/lib/narrative.js, ADR-007) : même un lien javascript: ou une balise
// script collée dans un fichier Markdown ne peut pas atteindre le DOM.
//
// Les tableaux Markdown ne sont PAS supportés (aucun besoin dans les chapitres
// de formation ; l'index des chapitres est reconstruit depuis les front-matter,
// pas depuis le tableau de index.md).

import { renderNarrativeHtml } from './narrative.js'

/** @param {string} s @returns {string} texte échappé façon HTML */
export function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Sépare le front-matter YAML (bloc initial délimité par « --- ») du corps.
 * Analyse volontairement minimale : paires « clé: valeur » scalaires
 * uniquement (chaînes, éventuellement entre guillemets, et nombres) — les
 * structures imbriquées sont ignorées sans erreur.
 *
 * @param {string} text document Markdown complet
 * @returns {{meta: Record<string, string|number>, body: string}}
 */
export function parseFrontMatter(text) {
  const raw = String(text ?? '')
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(raw)
  if (!match) return { meta: {}, body: raw }

  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim())
    if (!pair) continue
    let value = pair[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    } else if (value !== '' && !Number.isNaN(Number(value))) {
      value = Number(value)
    }
    meta[pair[1]] = value
  }
  return { meta, body: raw.slice(match[0].length) }
}

/**
 * Balises inline sur du texte DÉJÀ échappé : code, gras, italique, liens.
 * @param {string} s ligne de texte brut (non échappé)
 * @param {{rewriteLink?: (href: string) => string}} [options]
 * @returns {string} fragment HTML
 */
function inline(s, { rewriteLink } = {}) {
  let out = escapeHtml(s)
  // Code inline d'abord : son contenu ne reçoit aucune autre balise.
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  // Liens [texte](url) — l'URL vient d'un texte échappé (donc sans quote
  // brute) ; DOMPurify neutralisera de toute façon les schémas dangereux.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const target = rewriteLink ? rewriteLink(href) : href
    return `<a href="${target}">${label}</a>`
  })
  return out
}

/** @param {string} t ligne déjà trim() @returns {boolean} item de liste «-»/«*» */
const isItem = (t) => /^[-*]\s+/.test(t)

/**
 * Rend le corps d'une citation (lignes déjà dépouillées de leur « > ») :
 * mêmes règles que le niveau racine (paragraphes + listes), mais imbriquées
 * dans le `<blockquote>` — sans quoi une liste à puces à l'intérieur d'une
 * citation (ex. les « Objectifs d'apprentissage ») se retrouve fusionnée en
 * un seul paragraphe (voir tests).
 * @param {string[]} quoteLines lignes du bloc, « > » déjà retiré
 * @param {{rewriteLink?: (href: string) => string}} options
 * @returns {string} HTML brut, sans l'enveloppe <blockquote>
 */
function blockquoteBody(quoteLines, options) {
  const out = []
  let i = 0
  while (i < quoteLines.length) {
    const t = quoteLines[i].trim()
    if (t === '') {
      i += 1
      continue
    }
    if (isItem(t)) {
      out.push('<ul>')
      while (i < quoteLines.length) {
        const line = quoteLines[i].trim()
        if (line === '' || !isItem(line)) break
        out.push(`<li>${inline(line.replace(/^[-*]\s+/, ''), options)}</li>`)
        i += 1
      }
      out.push('</ul>')
      continue
    }
    const para = []
    while (i < quoteLines.length) {
      const line = quoteLines[i].trim()
      if (line === '' || isItem(line)) break
      para.push(line)
      i += 1
    }
    out.push(`<p>${inline(para.join(' '), options)}</p>`)
  }
  return out.join('')
}

/**
 * Convertit un Markdown (sans front-matter) en HTML NON assaini.
 * Interne : les appelants passent par renderMarkdown (DOMPurify).
 *
 * @param {string} md corps Markdown
 * @param {{rewriteLink?: (href: string) => string}} [options]
 * @returns {string} HTML brut
 */
export function mdToHtml(md, options = {}) {
  const lines = String(md ?? '').replace(/\r\n/g, '\n').split('\n')
  const out = []
  let i = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (trimmed === '') {
      i += 1
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2].trim(), options)}</h${level}>`)
      i += 1
      continue
    }

    if (trimmed.startsWith('>')) {
      const quote = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''))
        i += 1
      }
      out.push(`<blockquote>${blockquoteBody(quote, options)}</blockquote>`)
      continue
    }

    if (isItem(trimmed)) {
      out.push('<ul>')
      while (i < lines.length) {
        const t = lines[i].trim()
        if (t === '') break
        if (!isItem(t)) break
        out.push(`<li>${inline(t.replace(/^[-*]\s+/, ''), options)}</li>`)
        i += 1
      }
      out.push('</ul>')
      continue
    }

    // Paragraphe : lignes non vides consécutives fusionnées.
    const para = []
    while (i < lines.length) {
      const t = lines[i].trim()
      if (t === '' || /^(#{1,6})\s/.test(t) || t.startsWith('>') || isItem(t)) break
      para.push(t)
      i += 1
    }
    out.push(`<p>${inline(para.join(' '), options)}</p>`)
  }

  return out.join('\n')
}

/**
 * Rendu complet d'un document Markdown de formation : front-matter ignoré,
 * conversion maison, puis assainissement DOMPurify (renderNarrativeHtml,
 * ADR-007 — aucune requête réseau possible depuis le HTML rendu).
 *
 * @param {string} text document Markdown (front-matter optionnel)
 * @param {{rewriteLink?: (href: string) => string}} [options] réécriture des
 *   liens relatifs (ex. « 02-chapitre.md » -> « #/espace/formation/02-chapitre »)
 * @returns {string} HTML sûr, prêt pour dangerouslySetInnerHTML
 */
export function renderMarkdown(text, options = {}) {
  const { body } = parseFrontMatter(text)
  return renderNarrativeHtml(mdToHtml(body, options))
}
