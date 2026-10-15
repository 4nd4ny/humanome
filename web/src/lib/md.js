// Rendu Markdown du site (P8.2, puis journal carto D-54) : la bibliothèque
// marked (CommonMark et tableaux GFM), réglée pour les textes qu'on y lit —
// portfolios (exports de Google Docs surtout), chapitres de formation,
// réflexions du jury, résultats de Twin9 —, puis DOMPurify : renderMarkdown
// passe toute la sortie par renderNarrativeHtml (web/src/lib/narrative.js,
// ADR-007). Même un lien javascript: ou une balise script collée dans un
// fichier Markdown ne peut pas atteindre le DOM.
//
// Réglages, et pourquoi — un journal n'est pas un document technique, et rien
// de ce qui y est écrit ne doit disparaître de l'écran :
// - tableaux (« | … | », puis « | --- | ») : de vrais tableaux, classe
//   md-table, dans un conteneur qui défile sur un écran étroit ; l'alignement
//   des colonnes est une classe (md-align-left|center|right), l'attribut style
//   étant interdit par l'assainissement. Une ligne qui a plus de cases que
//   l'en-tête garde le surplus dans sa dernière case (marked le jetterait) ;
// - un tableau d'une seule case, sans autre ligne : un encadré
//   (<div class="md-box">) — Google Docs exporte ainsi ses encadrés, sans
//   échapper les « | » qu'ils contiennent (du code, par exemple) ;
// - listes numérotées : le numéro écrit est celui affiché (« 1. », puis
//   « 3. » restent 1 et 3) ;
// - pas de titre « souligné » (setext) : un trait sous une ligne de texte
//   reste un trait, comme pour le découpage en journées ;
// - pas de bloc de code indenté (dans un journal, un retrait n'est pas du
//   code) ; un bloc ``` ou ~~~ n'en est un que s'il est refermé ;
// - le HTML écrit dans le texte reste du texte (échappé), jamais des balises ;
// - seul « [texte](url) » fait un lien : une adresse, nue ou entre chevrons,
//   reste du texte, comme avant (l'anonymisation des démonstrations remplace
//   les adresses en gardant leurs chevrons, et le surlignage suit le texte) ;
// - une ligne « [nom]: valeur » reste du texte : seules les données d'image
//   que Google Docs met en fin de document (« [image1]: <data:…> ») sont des
//   définitions, cachées ;
// - barré : « ~~texte~~ » seulement (« ~2 h~ » reste tel quel) ;
// - échappements « \* », « \! », « \- »… : le caractère seul, y compris dans
//   le code inline (écart assumé au CommonMark : Google Docs échappe aussi là) ;
// - un gras fermé après un blanc (« **texte **suite ») ou ouvert avant
//   (« ** texte** ») — ce qu'écrit Google Docs quand le blanc voisin est en
//   gras — reste du gras : le blanc passe hors des astérisques, hors code ;
// - images : jamais chargées (ADR-007, `img` interdit) ; « [image] » ou
//   « [image : texte] » à leur place, même quand la référence manque
//   (« ![][image1] », dont Google Docs met les données en fin de document) ;
// - U+000B, que Google Docs écrit pour un retour à la ligne dans une case de
//   tableau : un saut de ligne (<br>), au lieu d'un carré « VT » à l'écran ;
// - une case de liste de tâches reste « [ ] » ou « [x] » (pas d'<input>).
//
// Le surlignage des passages lit le texte AFFICHÉ (carto/ui/highlight-dom.js) :
// ce qu'un extrait recopié du texte brut porte en plus (marques, barres de
// tableau) est retiré avant de chercher (carto/core/highlight.js). La version
// de marked est donc figée (package.json) : le texte affiché en dépend.

import { Marked, Tokenizer } from 'marked'
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

/** Échappement CommonMark : une barre oblique inverse devant une ponctuation ASCII. */
const ESCAPED_RE = /\\([!-/:-@[-`{-~])/g
const unescapeMarks = (s) => String(s).replace(ESCAPED_RE, '$1')

/** Saut de ligne dans une case de tableau exportée de Google Docs. */
const LINE_BREAK = '\u000b'

/**
 * Ce qui s'affiche à la place d'une image : aucune n'est jamais chargée
 * (ADR-007, `img` interdit). Même règle dans `stripMarkdownMarks`
 * (carto/core/highlight.js), pour qu'un extrait qui la cite soit retrouvé.
 * @param {string} alt texte alternatif
 */
const imagePlaceholder = (alt) => {
  const text = alt.replaceAll(LINE_BREAK, ' ').trim()
  return text ? `[image : ${text}]` : '[image]'
}

// ---------------------------------------------------------------------------
// Gras entouré d'un blanc (Google Docs) : le blanc passe dehors.

/**
 * Ouverture précédée d'un début de ligne, d'un blanc ou d'une ponctuation
 * qui ne fait qu'ouvrir — jamais d'une lettre, ni de « " » ou « ' », qui
 * ferment aussi : « *"cité"*, puis » ne doit pas passer pour une ouverture.
 */
const OPENS = String.raw`(?<=^|[\s([{«“‘])`
/** Ce qui suit une ouverture : une lettre, un chiffre ou une ponctuation ouvrante. */
const STARTS = String.raw`[\p{L}\p{N}«“‘"'(\[]`
/**
 * « **texte **suite » → « **texte** suite » (même nombre d'astérisques des
 * deux côtés) — sauf si le mot suivant se finit par un astérisque : la
 * « fermeture » en ouvrirait alors une autre.
 */
const BOLD_BLANK_AFTER_RE = new RegExp(String.raw`${OPENS}(\*{2,3})(?=${STARTS})([^*\n]*?[^\s*\\])([^\S\n]+)\1(?!\*)(?![^\s*]*\*)`, 'gu')
/** « ** texte** » → « **texte** » ; la fermeture est suivie d'un blanc ou d'une ponctuation. */
const BOLD_BLANK_BEFORE_RE = new RegExp(String.raw`${OPENS}(\*{2,3})([^\S\n]+)(${STARTS}(?:[^*\n]*?[^\s*\\])?)\1(?=$|[\s.,;:!?…»"'’”)\]}])`, 'gu')

/**
 * Parties d'une ligne, en alternance texte / code inline (indices impairs) :
 * un code s'ouvre et se ferme par le même nombre d'accents graves
 * (CommonMark) ; un accent grave échappé n'ouvre rien. En un passage : pour
 * chaque suite d'accents graves, la suivante de même longueur.
 * @param {string} line
 */
function splitInlineCode(line) {
  const runs = []
  for (let i = 0; i < line.length; ) {
    if (line[i] !== '`') {
      i++
      continue
    }
    let j = i
    while (j < line.length && line[j] === '`') j++
    if (i === 0 || line[i - 1] !== '\\') runs.push({ at: i, len: j - i })
    i = j
  }
  const sameLength = new Map() // longueur → indices des suites, dans l'ordre
  runs.forEach((run, k) => {
    if (!sameLength.has(run.len)) sameLength.set(run.len, [])
    sameLength.get(run.len).push(k)
  })
  const next = new Map() // longueur → curseur dans sameLength
  const parts = []
  let last = 0
  for (let r = 0; r < runs.length; ) {
    const { at, len } = runs[r]
    const list = sameLength.get(len)
    let c = next.get(len) ?? 0
    while (c < list.length && list[c] <= r) c++
    next.set(len, c)
    if (c === list.length) {
      r++
      continue
    }
    const close = runs[list[c]]
    parts.push(line.slice(last, at), line.slice(at, close.at + len))
    last = close.at + len
    r = list[c] + 1
  }
  parts.push(line.slice(last))
  return parts
}

/** Ouverture d'un bloc de code (``` sans accent grave dans la suite, ou ~~~). */
const FENCE_OPEN_RE = /^ {0,3}(?:(`{3,})[^`]*|(~{3,}).*)$/
/** @returns {RegExp} la ligne qui referme un bloc ouvert par `marker` */
const fenceClose = (marker) => new RegExp(String.raw`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}[ \t]*$`)

/**
 * Lignes des blocs de code refermés (ouverture et fermeture comprises) ; un
 * bloc jamais refermé n'en est pas un (réglage `fences` ci-dessous).
 * @param {string[]} lines
 * @returns {Set<number>}
 */
function fencedLines(lines) {
  const inside = new Set()
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE_OPEN_RE.exec(lines[i])
    if (!open) continue
    const close = fenceClose(open[1] ?? open[2])
    const end = lines.findIndex((l, k) => k > i && close.test(l))
    if (end < 0) continue
    for (let k = i; k <= end; k++) inside.add(k)
    i = end
  }
  return inside
}

/**
 * Passe hors des astérisques le blanc d'un gras (« ** » ou « *** »), hors
 * code (blocs refermés, code inline) : le CommonMark ne voit pas de gras après
 * un blanc ouvrant ni avant un blanc fermant, et laisserait les astérisques à
 * l'écran. L'italique seul (« * ») n'est pas touché : trop d'astérisques y
 * ont un autre sens.
 * @param {string} src
 */
function moveBoldBlanks(src) {
  if (!src.includes('**')) return src
  const lines = src.split('\n')
  const fenced = fencedLines(lines)
  return lines
    .map((line, n) => {
      if (fenced.has(n) || !line.includes('**')) return line
      return splitInlineCode(line)
        .map((part, k) => (k % 2 ? part : part.replace(BOLD_BLANK_AFTER_RE, '$1$2$1$3').replace(BOLD_BLANK_BEFORE_RE, '$2$1$3$1')))
        .join('')
    })
    .join('\n')
}

// ---------------------------------------------------------------------------
// Extensions et réglages de marked.

/** Cases d'une ligne de tableau, comme marked les découpe, sans en jeter aucune. */
function rowCells(line) {
  const cells = ['']
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') {
      cells[cells.length - 1] += '\\|'
      i++
    } else if (line[i] === '|') cells.push('')
    else cells[cells.length - 1] += line[i]
  }
  if (cells[0].trim() === '') cells.shift()
  if (cells.length > 0 && cells.at(-1).trim() === '') cells.pop()
  return cells.map((c) => c.trim())
}

/**
 * Image par référence (« ![texte][ref] ») : prise avant les liens, que la
 * référence existe ou non — sans quoi « ![][image1] » s'afficherait tel quel.
 * Texte et référence bornés : pas de recherche sans fin sur un « ![ » isolé.
 */
const referenceImage = {
  name: 'referenceImage',
  level: 'inline',
  start(src) {
    const at = src.indexOf('![')
    return at >= 0 ? at : undefined
  },
  tokenizer(src) {
    const m = /^!\[((?:\\.|[^\\\]\n]){0,1000})\]\[[^\]\n]{0,200}\]/.exec(src)
    return m ? { type: 'referenceImage', raw: m[0], alt: m[1] } : undefined
  },
  renderer(token) {
    return escapeHtml(imagePlaceholder(unescapeMarks(token.alt)))
  },
}

/** U+000B : un saut de ligne (jeton `br` de marked). */
const cellLineBreak = {
  name: 'cellLineBreak',
  level: 'inline',
  start(src) {
    const at = src.indexOf(LINE_BREAK)
    return at >= 0 ? at : undefined
  },
  tokenizer(src) {
    return src.startsWith(LINE_BREAK) ? { type: 'br', raw: LINE_BREAK } : undefined
  },
}

/**
 * Encadré : un tableau d'une seule case et sans autre ligne. Le contenu va
 * jusqu'à la dernière barre de la ligne : ses « | » intérieurs restent du
 * texte (Google Docs ne les échappe pas).
 */
const box = {
  name: 'box',
  level: 'block',
  tokenizer(src) {
    const m = /^ {0,3}\|(.*)\|[ \t]*\n {0,3}\|[ \t]*(:?)-+(:?)[ \t]*\|[ \t]*(?:\n|$)/.exec(src)
    if (!m || /^ {0,3}\|/.test(src.slice(m[0].length))) return undefined
    const align = m[2] && m[3] ? 'center' : m[3] ? 'right' : m[2] ? 'left' : null
    const token = { type: 'box', raw: m[0], align, tokens: [] }
    this.lexer.inline(m[1].trim(), token.tokens)
    return token
  },
  renderer(token) {
    const align = token.align ? ` md-align-${token.align}` : ''
    return `<div class="md-box${align}"><p>${this.parser.parseInline(token.tokens)}</p></div>\n`
  },
}

/** Classe d'alignement d'une colonne ('left' | 'center' | 'right' | null). */
const alignClass = (align) => (align ? ` class="md-align-${align}"` : '')

/**
 * Un moteur marked réglé pour le site.
 * @param {{rewriteLink?: (href: string) => string}} [options]
 */
function createEngine({ rewriteLink } = {}) {
  return new Marked({
    gfm: true,
    breaks: false,
    async: false,
    hooks: { preprocess: moveBoldBlanks },
    // Une règle qui rend undefined ne trouve rien et laisse la place aux
    // suivantes ; false rend la main à la règle d'origine de marked.
    tokenizer: {
      lheading: () => undefined,
      code: () => undefined,
      html: () => undefined,
      tag: () => undefined,
      autolink: () => undefined,
      url: () => undefined,
      fences(src) {
        const open = /^ {0,3}(`{3,}|~{3,})([^\n]*)\n/.exec(src)
        if (!open) return undefined
        if (open[1][0] === '`' && open[2].includes('`')) return undefined
        const close = new RegExp(String.raw`^ {0,3}${open[1][0] === '`' ? '`' : '~'}{${open[1].length},}[ \t]*$`, 'm')
        return close.test(src.slice(open[0].length)) ? false : undefined
      },
      def(src) {
        return /^ {0,3}\[[^\]\n]+\]:[ \t]*<?data:/i.test(src) ? false : undefined
      },
      del(src) {
        return src.startsWith('~~') ? false : undefined
      },
      table(src) {
        const token = Tokenizer.prototype.table.call(this, src)
        if (!token) return undefined
        const lines = token.raw.split('\n')
        const width = token.header.length
        token.rows.forEach((row, i) => {
          const cells = rowCells(lines[2 + i] ?? '')
          if (cells.length <= width) return
          const text = cells.slice(width - 1).join(' | ')
          row[width - 1] = { ...row[width - 1], text, tokens: this.lexer.inline(text) }
        })
        return token
      },
    },
    extensions: [referenceImage, cellLineBreak, box],
    renderer: {
      image({ text }) {
        return escapeHtml(imagePlaceholder(text ?? ''))
      },
      codespan({ text }) {
        return `<code>${escapeHtml(unescapeMarks(text)).replaceAll(LINE_BREAK, '<br>')}</code>`
      },
      code(token) {
        token.text = token.text.replaceAll(LINE_BREAK, '\n')
        return false
      },
      checkbox({ checked }) {
        return checked ? '[x] ' : '[ ] '
      },
      link(token) {
        if (!rewriteLink || token.autolink) return false
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : ''
        return `<a href="${escapeHtml(rewriteLink(token.href))}"${title}>${this.parser.parseInline(token.tokens)}</a>`
      },
      list(token) {
        if (!token.ordered) return false
        const start = token.start === '' ? 1 : Number(token.start)
        let expected = start
        let items = ''
        for (const item of token.items) {
          const written = Number(/^\s*(\d{1,9})[.)]/.exec(item.raw)?.[1] ?? expected)
          const li = this.listitem(item)
          items += written === expected ? li : li.replace(/^<li>/, `<li value="${written}">`)
          expected = written + 1
        }
        return `<ol${start === 1 ? '' : ` start="${start}"`}>\n${items}</ol>\n`
      },
      table(token) {
        const cell = (c, tag) => `<${tag}${alignClass(c.align)}>${this.parser.parseInline(c.tokens)}</${tag}>`
        const head = `<thead><tr>${token.header.map((c) => cell(c, 'th')).join('')}</tr></thead>`
        const rows = token.rows.map((row) => `<tr>${row.map((c) => cell(c, 'td')).join('')}</tr>`).join('\n')
        return `<div class="md-table-wrap"><table class="md-table">${head}${rows ? `<tbody>${rows}</tbody>` : ''}</table></div>\n`
      },
    },
  })
}

const engine = createEngine()

/**
 * Convertit un Markdown (sans front-matter) en HTML NON assaini.
 * Les appelants passent par renderMarkdown, ou par renderNarrativeHtml
 * (DOMPurify) — le lecteur de portfolio, dont le texte n'a pas de front-matter.
 *
 * @param {string} md corps Markdown
 * @param {{rewriteLink?: (href: string) => string}} [options]
 * @returns {string} HTML brut
 */
export function mdToHtml(md, options = {}) {
  const source = String(md ?? '').replace(/\r\n?/g, '\n')
  return (options.rewriteLink ? createEngine(options) : engine).parse(source).trimEnd()
}

/**
 * Rendu complet d'un document Markdown : front-matter ignoré, conversion,
 * puis assainissement DOMPurify (renderNarrativeHtml, ADR-007 — aucune
 * requête réseau possible depuis le HTML rendu).
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
