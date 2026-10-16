// Interface ultime — chaque information une fois (journal D-66).
//
// Les analyses livrent souvent, à côté de leurs rubriques (portrait, forme du
// profil, invitations ; portrait du pôle, territoires, pistes…), un texte
// complet rédigé qui les redit. Ce module dit ce qu'un tel texte AJOUTE à ses
// rubriques : ses phrases qu'aucune rubrique ne contient. Rien : le texte ne
// fait que redire, il n'est ni affiché ni gardé ; quelque chose : ce reste
// seul s'affiche, et le texte est gardé. Fonctions pures, sans DOM.

const LETTERS = /\p{L}/gu
const SHINGLE = 4 // mots par suite comparée
const COVERED = 0.85 // part des mots retrouvés pour qu'une phrase soit « déjà dite »

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

/**
 * Phrases d'un Markdown, chacune avec le titre de sa section ; titres,
 * puces et séparateurs écartés.
 * @returns {Array<{heading: string | null, text: string}>}
 */
export function markdownSentences(markdown) {
  const out = []
  let heading = null
  let para = []
  const flush = () => {
    const text = para.join(' ').trim()
    para = []
    if (!text) return
    for (const s of text.split(/(?<=[.!?…])\s+/)) {
      const t = s.trim()
      if ((t.match(LETTERS) ?? []).length >= 3) out.push({ heading, text: t })
    }
  }
  for (const raw of String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const h = /^\s*#{1,6}\s+(.*)$/.exec(raw)
    if (h) {
      flush()
      heading = h[1].replace(/[*_`]/g, '').trim() || null
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
      flush()
      continue
    }
    para.push(raw.trim())
  }
  flush()
  return out
}

/**
 * Phrases d'un texte complet qu'aucune rubrique ne contient — à une coquille
 * ou une étiquette près : une phrase dont 85 % des mots se retrouvent, par
 * suites de quatre, dans les rubriques est déjà dite.
 * @param {string | null | undefined} markdown
 * @param {Array<string | null | undefined>} parts textes des rubriques
 * @returns {Array<{heading: string | null, text: string}>}
 */
export function addedSentences(markdown, parts) {
  if (!markdown) return []
  const hay = ` ${parts
    .filter((p) => typeof p === 'string' && p.trim())
    .map(plainText)
    .join(' | ')} `
  const words = hay.split(' ')
  const shingles = new Set()
  for (let i = 0; i + SHINGLE <= words.length; i++) shingles.add(words.slice(i, i + SHINGLE).join(' '))
  return markdownSentences(markdown).filter(({ text }) => {
    const p = plainText(text)
    if (!p || hay.includes(` ${p} `)) return false
    const w = p.split(' ')
    if (w.length < SHINGLE) return true
    const covered = new Array(w.length).fill(false)
    for (let i = 0; i + SHINGLE <= w.length; i++) {
      if (shingles.has(w.slice(i, i + SHINGLE).join(' '))) covered.fill(true, i, i + SHINGLE)
    }
    return covered.filter(Boolean).length / w.length < COVERED
  })
}

/** Le reste, en Markdown : chaque section qui a quelque chose de neuf, sous son titre. */
export function addedMarkdown(markdown, parts) {
  const added = addedSentences(markdown, parts)
  const groups = []
  for (const s of added) {
    const last = groups.at(-1)
    if (last && last.heading === s.heading) last.text.push(s.text)
    else groups.push({ heading: s.heading, text: [s.text] })
  }
  return groups.map((g) => `${g.heading ? `#### ${g.heading}\n\n` : ''}${g.text.join(' ')}`).join('\n\n')
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
