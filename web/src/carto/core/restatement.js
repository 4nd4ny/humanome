// Interface ultime — chaque information une fois (journal D-66).
//
// Les analyses livrent souvent, à côté de leurs rubriques (portrait, forme du
// profil, invitations ; portrait du pôle, territoires, pistes…), un texte
// complet rédigé qui les redit. Ce module dit ce qu'un tel texte AJOUTE à ses
// rubriques : ses phrases qu'aucune rubrique ne contient. Rien : le texte ne
// fait que redire, il n'est pas gardé ; quelque chose : il est gardé, et ce
// reste seul s'affiche là où le texte complet s'afficherait (le portrait
// d'une journée ; le rapport complet d'un pôle, lui, ne s'affiche jamais :
// il contient les territoires non visités, D-16). Fonctions pures, sans DOM.
//
// « Déjà dite » est strict : chaque mot de la phrase doit se retrouver dans
// les rubriques, dans une suite de quatre mots. Seules sont pardonnées les
// étiquettes d'un extrait cité (« Extrait : », « L'extrait — ») et une
// coquille (« errors » pour « erreurs ») : un mot changé, une négation, un
// nombre, une précision ajoutée font une phrase neuve.

const LETTERS = /\p{L}/gu
const SHINGLE = 4 // mots par suite comparée
const LABELS = new Set(['l', 'extrait', 'extraits', 'citation', 'citations'])
// Ces mots changent le sens d'une phrase : jamais pris pour une coquille.
const SENSE = new Set(['jamais', 'aucun', 'aucune', 'rien', 'sans', 'sauf', 'toujours', 'souvent', 'parfois', 'seulement', 'moins', 'plus', 'tous', 'toutes', 'nulle'])

/**
 * Texte comparable : les mots seuls, en minuscules — sans balisage Markdown
 * ni échappements, sans ponctuation, guillemets ni apostrophes (« l'avenir »
 * et « l’avenir » se comparent égaux, « **Titre.** texte » et « Titre — texte »
 * aussi).
 */
export function plainText(text) {
  return String(text ?? '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

/** Une coquille : même début, deux lettres d'écart au plus, ni nombre ni mot de sens. */
function isTypo(a, b) {
  if (a === b || a.length < 5 || b.length < 5 || a.slice(0, 3) !== b.slice(0, 3)) return false
  if (/\d/.test(a + b) || SENSE.has(a) || SENSE.has(b)) return false
  if (Math.abs(a.length - b.length) > 2) return false
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length] <= 2
}

/** Découpe en phrases sans couper dans des guillemets ou une mise en valeur ouverts. */
function sentencesOf(text) {
  const out = []
  let acc = ''
  const count = (s, re) => (s.match(re) ?? []).length
  const open = (s) => count(s, /«/g) > count(s, /»/g) || count(s, /“/g) > count(s, /”/g) || count(s, /\*\*/g) % 2 === 1
  for (const part of text.split(/(?<=[.!?…])\s+/)) {
    acc = acc ? `${acc} ${part}` : part
    if (!open(acc)) {
      out.push(acc)
      acc = ''
    }
  }
  if (acc) out.push(acc)
  return out
}

/**
 * Phrases d'un Markdown, chacune avec le titre de sa section et son bloc
 * (paragraphe, ou élément de liste) ; titres, lignes-titres en gras,
 * étiquettes (« Invitations : »), puces et séparateurs écartés.
 * @returns {Array<{heading: string | null, text: string, block: number, item: boolean}>}
 */
export function markdownSentences(markdown) {
  const out = []
  let heading = null
  let para = []
  let block = 0
  const flush = (item = false) => {
    const text = para.join(' ').trim()
    para = []
    if (!text) return
    block++
    for (const s of sentencesOf(text)) {
      const t = s.trim()
      if ((t.match(LETTERS) ?? []).length >= 3) out.push({ heading, text: t, block, item })
    }
  }
  for (const raw of String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const h = /^\s*#{1,6}\s+(.*)$/.exec(raw) ?? /^\s*(?:\*\*|__)([^*_]+?)(?:\*\*|__)\s*:?\s*$/.exec(raw)
    const label = h ? null : /^\s*([^.!?…:]{1,60}):\s*$/.exec(raw)
    if (h || (label && label[1].trim().split(/\s+/).length <= 4)) {
      flush()
      heading =
        (h ? h[1] : label[1])
          .replace(/[*_`]/g, '')
          .replace(/\s*:\s*$/, '')
          .trim() || null
      continue
    }
    if (/^\s*$/.test(raw) || /^\s*([-*_]\s*){3,}$/.test(raw)) {
      flush()
      continue
    }
    const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(raw)
    if (item) {
      flush()
      para.push(item[2])
      flush(true)
      continue
    }
    para.push(raw.trim())
  }
  flush()
  return out
}

/**
 * Phrases d'un texte complet qu'aucune rubrique ne contient : une phrase est
 * déjà dite quand chacun de ses mots se retrouve dans les rubriques, dans une
 * suite de quatre mots — étiquettes d'un extrait et coquilles pardonnées.
 * @param {string | null | undefined} markdown
 * @param {Array<string | null | undefined>} parts textes des rubriques
 * @returns {Array<{heading: string | null, text: string, block: number, item: boolean}>}
 */
export function addedSentences(markdown, parts) {
  if (!markdown) return []
  const hay = ` ${parts
    .filter((p) => typeof p === 'string' && p.trim())
    .map(plainText)
    .join(' | ')} `
  const words = hay.trim().split(' ')
  const shingles = new Set()
  for (let i = 0; i + SHINGLE <= words.length; i++) shingles.add(words.slice(i, i + SHINGLE).join(' '))
  // Mots des rubriques par voisinage (« précédent suivant »), pour reconnaître une coquille.
  const between = new Map()
  for (let j = 1; j + 1 < words.length; j++) {
    const key = `${words[j - 1]} ${words[j + 1]}`
    if (!between.has(key)) between.set(key, [])
    between.get(key).push(words[j])
  }
  const said = (text) => {
    const p = plainText(text)
    if (!p || hay.includes(` ${p} `)) return true
    const w = p.split(' ')
    if (w.length < SHINGLE) return false
    for (let i = 1; i + 1 < w.length; i++) {
      const options = between.get(`${w[i - 1]} ${w[i + 1]}`)
      if (!options || options.includes(w[i])) continue
      const fixed = options.find((x) => isTypo(x, w[i]))
      if (fixed) w[i] = fixed
    }
    const covered = new Array(w.length).fill(false)
    for (let i = 0; i + SHINGLE <= w.length; i++) if (shingles.has(w.slice(i, i + SHINGLE).join(' '))) covered.fill(true, i, i + SHINGLE)
    return w.every((word, i) => covered[i] || LABELS.has(word))
  }
  return markdownSentences(markdown).filter(({ text }) => !said(text))
}

/**
 * Le reste, en Markdown : chaque section qui a quelque chose de neuf, sous son
 * titre ; un paragraphe reste un paragraphe, un élément de liste une puce.
 */
export function addedMarkdown(markdown, parts) {
  const sections = []
  for (const s of addedSentences(markdown, parts)) {
    let section = sections.at(-1)
    if (!section || section.heading !== s.heading) sections.push((section = { heading: s.heading, blocks: [] }))
    const last = section.blocks.at(-1)
    if (last && last.block === s.block) last.text.push(s.text)
    else section.blocks.push({ block: s.block, item: s.item, text: [s.text] })
  }
  return sections
    .map(({ heading, blocks }) => {
      const body = blocks
        .map((b, i) => {
          const text = b.text.join(' ')
          const after = i > 0 && !(b.item && blocks[i - 1].item) ? '\n' : '' // une ligne vide entre paragraphes, pas entre puces
          return `${after}${b.item ? '- ' : ''}${text}`
        })
        .join('\n')
      return `${heading ? `#### ${heading}\n\n` : ''}${body}`
    })
    .join('\n\n')
}

// ---- Portrait d'une journée (kairos) et rapport de pôle ------------------------

/** Rubriques d'un portrait kairos (forme du détail d'une variante). */
export function kairosParts(k) {
  return [k?.portrait, k?.profileShape, k?.linksAcrossPoles, k?.betweenTheLines, ...(Array.isArray(k?.invitations) ? k.invitations.map(String) : [])]
}

/** Rubriques d'un rapport de pôle. */
export function poleReportParts(r) {
  const dense = Array.isArray(r?.denseTerritories) ? r.denseTerritories : []
  return [
    r?.portrait,
    r?.unvisited,
    r?.emergences,
    ...(Array.isArray(r?.leads) ? r.leads.map(String) : []),
    ...dense.flatMap((d) => [d?.competence, d?.description, d?.extraitVerbatim, d?.ceQueCaDit, d?.competence && d?.description ? `${d.competence} — ${d.description}` : null]),
  ]
}

/** Un portrait kairos a-t-il ses rubriques ? */
export function hasKairosFields(k) {
  return kairosParts(k).some((p) => typeof p === 'string' && p.trim())
}

/** Un rapport de pôle a-t-il ses rubriques ? */
export function hasPoleReportFields(r) {
  return poleReportParts(r).some((p) => typeof p === 'string' && p.trim())
}

/** Le texte complet d'un portrait kairos est-il à garder (il dit quelque chose que ses rubriques ne disent pas) ? */
export function keepKairosMarkdown(k) {
  return Boolean(k?.markdown) && (!hasKairosFields(k) || addedSentences(k.markdown, kairosParts(k)).length > 0)
}

/** … et celui d'un rapport de pôle ? */
export function keepPoleReportMarkdown(r) {
  return Boolean(r?.markdown) && (!hasPoleReportFields(r) || addedSentences(r.markdown, poleReportParts(r)).length > 0)
}

/**
 * Détail d'une variante sans les textes complets qui ne font que redire leurs
 * rubriques : à l'import, et pour les archives et démonstrations construites
 * avant D-66. L'objet reçu n'est pas modifié.
 * @param {object} detail
 */
export function withoutRestatements(detail) {
  if (!detail || typeof detail !== 'object') return detail
  const kairos = detail.kairos?.markdown && !keepKairosMarkdown(detail.kairos) ? { ...detail.kairos, markdown: null } : detail.kairos
  let poleReports = detail.poleReports
  if (poleReports && typeof poleReports === 'object') {
    for (const [num, r] of Object.entries(poleReports)) {
      if (r?.markdown && !keepPoleReportMarkdown(r)) {
        if (poleReports === detail.poleReports) poleReports = { ...poleReports }
        poleReports[num] = { ...r, markdown: null }
      }
    }
  }
  return kairos === detail.kairos && poleReports === detail.poleReports ? detail : { ...detail, kairos, poleReports }
}
