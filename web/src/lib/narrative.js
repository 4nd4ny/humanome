// Narrative HTML pipeline (ADR-007 + docs/contrats.md §2.3):
// 1. sanitize every data-borne HTML fragment with DOMPurify, without exception;
// 2. AFTER sanitization, rewrite the legacy links
//    `feuilles/<date>/carto-day.html[?focus=<code>]` (1262 of them in the real
//    corpus) to the internal hash routes `#/jour/<date>[?focus=<code>]`.
// The data itself is never rewritten — only the rendered output.
import DOMPurify from 'dompurify'
import { dayHash, isValidIsoDate } from '../router.js'

const DAY_LINK_RE = /^(?:\.\/)?feuilles\/(\d{4}-\d{2}-\d{2})\/carto-day\.html(?:\?([^#]*))?(?:#.*)?$/

// Beyond XSS, the narrative HTML must not trigger ANY network request when
// rendered (cahier §6 « rien ne quitte le navigateur », plan-fusion-visu
// « aucune donnée envoyée nulle part ») : a locally-loaded document could
// otherwise embed a tracking pixel (<img src=https://…>, style backgrounds)
// or an exfiltration form. The real corpus uses none of these tags/attributes
// (checked: 0 occurrences in merge.json and the 59 day documents).
const SANITIZE_OPTIONS = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: [
    'img', 'picture', 'source', 'video', 'audio', 'track',
    'embed', 'object', 'iframe', 'link',
    'form', 'input', 'textarea', 'select', 'button',
  ],
  FORBID_ATTR: ['style', 'src', 'srcset', 'poster', 'background', 'ping', 'formaction', 'action'],
}

/**
 * Maps a legacy day-page href to its internal hash route.
 * @param {string} href e.g. 'feuilles/2026-01-04/carto-day.html?focus=1.01'
 * @returns {string | null} '#/jour/2026-01-04?focus=1.01', or null when the
 *   href is not a legacy day link (left untouched by the rewriter).
 */
export function dayHrefToRoute(href) {
  const match = DAY_LINK_RE.exec(String(href ?? ''))
  if (!match) return null
  const [, date, query] = match
  if (!isValidIsoDate(date)) return null
  const focus = new URLSearchParams(query ?? '').get('focus')
  return dayHash(date, focus || null)
}

/**
 * Rewrites every legacy day link inside an already-sanitized DOM subtree.
 * @param {ParentNode} root container whose <a href> descendants are rewritten in place
 */
export function rewriteDayLinks(root) {
  for (const anchor of root.querySelectorAll('a[href]')) {
    const route = dayHrefToRoute(anchor.getAttribute('href'))
    if (route !== null) anchor.setAttribute('href', route)
  }
}

/**
 * Sanitizes a narrative HTML fragment then rewrites its legacy day links.
 * The rewrite happens strictly after DOMPurify (ADR-007).
 * @param {string} html raw HTML from the data (feedback, rapport_html, kairosHtml…)
 * @returns {string} safe HTML ready for injection
 */
export function renderNarrativeHtml(html) {
  const clean = DOMPurify.sanitize(String(html ?? ''), SANITIZE_OPTIONS)
  const container = document.createElement('div')
  container.innerHTML = clean
  rewriteDayLinks(container)
  return container.innerHTML
}
