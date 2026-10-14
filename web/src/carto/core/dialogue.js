// Interface ultime — dialogue d'accompagnement scripté (spec §14, P7 ;
// prototype proto_chatbot_socratique).
//
// Des questions tirées des PROPRES traces de la personne, jamais d'un texte
// écrit à l'avance sur quelqu'un : une citation datée de son journal, un
// silence, une compétence qui apparaît, une compétence qui revient, une
// présence que l'analyse renvoie à un cartographe, un changement de
// vocabulaire, un écart entre les deux ensembles qu'elle compare. Chaque fil
// n'existe que si ses données existent.
//
// C'est un questionnement, pas une conversation : le script ne lit pas les
// réponses pour choisir la suite (comme le prototype, mais en le disant).
// Les questions sont ouvertes, sans valence (ni « progrès », ni « faible »),
// sans conseil, sans comparaison à quiconque. Sans modèle de langage par
// défaut : rien ne quitte le navigateur. Une relance par un modèle de langage
// est possible en option, à la demande et après consentement explicite ; la
// requête n'emporte que la question, la réponse et le passage cité
// (`buildRelaunchRequest`).

import { daysBetween, formatLong, todayIso } from './dates.js'
import { hasAnalysis, hasPortfolio } from './model.js'
import { stripMarkdownMarks } from './highlight.js'
import { median, lexicalData } from './dashboard.js'
import { changeNarrative, compareSets } from './compare.js'

export const THREAD_KINDS = Object.freeze(['citation', 'silence', 'apparition', 'constance', 'renvoi', 'rupture', 'ecart'])

/** Sources affichées en pastilles sous chaque question. */
export const SOURCE_LABELS = Object.freeze({ portfolio: 'votre journal', cartographie: 'votre cartographie', calendrier: 'votre calendrier', comparaison: 'votre comparaison' })

export const OPENING =
  'Voici quelques questions tirées de vos propres traces. Elles ne jugent pas et ne vous comparent à personne. ' +
  'Vous pouvez répondre, passer une question ou vous arrêter quand vous voulez. ' +
  'Ce dialogue ne lit pas vos réponses pour choisir la suite : c’est un questionnement, pas une conversation. Rien ne quitte ce navigateur.'
export const CLOSING = 'C’est tout pour cette fois. Voulez-vous garder vos réponses dans votre carnet ? Il reste dans ce navigateur.'
export const NO_THREAD = 'Il n’y a pas encore assez de traces pour ouvrir un dialogue : importez des journées analysées, puis revenez.'

export const MAX_ANSWER_CHARS = 4000
export const MAX_QUOTE_CHARS = 600
/** Silence : au moins une semaine, et trois fois l'écart habituel de la personne. */
export const SILENCE_MIN_DAYS = 7
export const SILENCE_FACTOR = 3

const nameOf = (ref, code) => ref.compByCode.get(code)?.name ?? code
/** Guillemets français avec espaces insécables (jamais « coupé en fin de ligne). */
const quoted = (s) => `«\u00a0${s}\u00a0»`
const label = (ref, code) => `${quoted(nameOf(ref, code))} (${code})`
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`

/** Coupe à `max` points de code (jamais au milieu d'un émoji), avec « … ». */
function cut(text, max) {
  const chars = Array.from(String(text ?? ''))
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('')
}

/** Passage cité, nettoyé et borné. */
export function quoteText(extract) {
  return cut(stripMarkdownMarks(String(extract ?? '')).replace(/\s+/gu, ' ').trim(), MAX_QUOTE_CHARS)
}

/**
 * Traces candidates à la citation : preuves des compétences de l'état, par
 * confiance décroissante puis de la plus récente à la plus ancienne.
 * @returns {Array<{code: string, date: string, variantId: string, traceId: string, confidence: number}>}
 */
export function quoteCandidates(state) {
  const out = []
  for (const c of state.competencies.values()) {
    for (const t of c.traces) if (t.role === 'preuve') out.push({ code: c.code, date: t.date, variantId: t.variantId, traceId: t.id, confidence: t.confidence ?? 0 })
  }
  return out.sort((a, b) => b.confidence - a.confidence || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || a.code.localeCompare(b.code))
}

/** Plus long silence du journal, s'il dépasse l'écart habituel de la personne. */
export function longestSilence(dataset) {
  const dates = dataset.days.filter((d) => hasAnalysis(d) || hasPortfolio(d)).map((d) => d.date).sort()
  if (dates.length < 3) return null
  const gaps = dates.slice(1).map((to, i) => ({ from: dates[i], to, days: daysBetween(dates[i], to) }))
  const usual = median(gaps.map((g) => g.days))
  const longest = gaps.reduce((best, g) => (g.days > best.days ? g : best), gaps[0])
  const silent = longest.days - 1
  return silent >= SILENCE_MIN_DAYS && longest.days >= SILENCE_FACTOR * usual ? { from: longest.from, to: longest.to, days: silent, usual } : null
}

/**
 * Fils du dialogue, dans un ordre fixe ; chacun n'existe que si ses données
 * existent.
 * @param {object} dataset
 * @param {object} state computeState(...) de l'ensemble coché
 * @param {object} ref référentiel normalisé
 * @param {{getDetail?: (date: string) => object | undefined, params?: object}} [opts]
 *   getDetail : détails chargés (citation, rupture de vocabulaire) ; sans eux, ces fils sont absents
 * @returns {Array<{id: string, kind: string, text: string, quote?: {text: string, raw: string, date: string, code: string},
 *   refs: {dates: string[], codes: string[]}, sources: string[]}>}
 */
export function dialogueThreads(dataset, state, ref, { getDetail = () => undefined, params } = {}) {
  const threads = []
  const comps = ref.competencies.map((c) => state.competencies.get(c.code)).filter((c) => c && c.theta > 0)

  // 1. Citation datée : la preuve la plus sûre, la plus récente à confiance égale.
  for (const cand of quoteCandidates(state)) {
    const vd = getDetail(cand.date)?.variants?.[cand.variantId]?.verdicts?.[cand.code]
    const raw = String(vd?.traces?.[cand.traceId]?.extract ?? '')
    const text = quoteText(raw)
    if (!text) continue
    threads.push({
      id: `citation:${cand.date}:${cand.code}`,
      kind: 'citation',
      text: `Le ${formatLong(cand.date)}, vous écrivez ce passage, où l’analyse lit ${label(ref, cand.code)}. Qu’est-ce qui se jouait pour vous ce jour-là ?`,
      quote: { text, raw, date: cand.date, code: cand.code },
      refs: { dates: [cand.date], codes: [cand.code] },
      sources: ['portfolio', 'cartographie'],
    })
    break
  }

  // 2. Silence : une donnée, pas un trou.
  const silence = longestSilence(dataset)
  if (silence) {
    threads.push({
      id: `silence:${silence.from}:${silence.to}`,
      kind: 'silence',
      text: `Entre le ${formatLong(silence.from)} et le ${formatLong(silence.to)}, votre journal se tait pendant ${plural(silence.days, 'jour', 'jours')}. Un silence est une donnée, pas un trou. Que s’est-il passé pendant ce temps ?`,
      refs: { dates: [silence.from, silence.to], codes: [] },
      sources: ['calendrier'],
    })
  }

  // 3. Apparition : la compétence apparue le plus tard (pas dès la première journée).
  const first = state.dates[0]
  const late = comps.filter((c) => c.days[0] > first).sort((a, b) => (a.days[0] < b.days[0] ? 1 : a.days[0] > b.days[0] ? -1 : 0))[0]
  if (late) {
    threads.push({
      id: `apparition:${late.code}`,
      kind: 'apparition',
      text: `${label(ref, late.code)} apparaît pour la première fois le ${formatLong(late.days[0])} dans vos traces. Qu’est-ce qui a changé pour vous à ce moment-là ?`,
      refs: { dates: [late.days[0]], codes: [late.code] },
      sources: ['cartographie'],
    })
  }

  // 4. Constance : la compétence qui revient le plus souvent (au moins trois journées).
  const steady = [...comps].sort((a, b) => b.days.length - a.days.length)[0]
  if (steady && steady.days.length >= 3) {
    threads.push({
      id: `constance:${steady.code}`,
      kind: 'constance',
      text: `${label(ref, steady.code)} revient dans ${steady.days.length} de vos journées, du ${formatLong(steady.days[0])} au ${formatLong(steady.days.at(-1))}. Comment la décririez-vous, avec vos mots ?`,
      refs: { dates: [steady.days[0], steady.days.at(-1)], codes: [steady.code] },
      sources: ['cartographie'],
    })
  }

  // 5. Renvoi : une présence que l'analyse ne tranche pas.
  const doubt = comps.filter((c) => c.status === 'needs_review').sort((a, b) => b.days.length - a.days.length)[0]
  if (doubt) {
    threads.push({
      id: `renvoi:${doubt.code}`,
      kind: 'renvoi',
      text: `Pour ${label(ref, doubt.code)}, l’analyse hésite et renvoie à un cartographe. Avez-vous en tête une situation qui l’éclairerait ?`,
      refs: { dates: doubt.days.slice(-1), codes: [doubt.code] },
      sources: ['cartographie'],
    })
  }

  // 6. Rupture de vocabulaire : le plus grand écart entre deux journées écrites
  //    consécutives, relatif à la personne (aucun seuil fixe).
  const texts = new Map()
  for (const d of dataset.days.filter(hasPortfolio)) {
    const t = getDetail(d.date)?.portfolio?.text
    if (typeof t === 'string' && t.trim()) texts.set(d.date, t)
  }
  const lexical = texts.size >= 4 ? lexicalData(texts) : null
  const valued = (lexical?.transitions ?? []).filter((t) => t.distance !== null)
  if (valued.length >= 3) {
    const top = valued.reduce((best, t) => (t.distance > best.distance ? t : best), valued[0])
    if (top.distance > lexical.median) {
      threads.push({
        id: `rupture:${top.from}:${top.to}`,
        kind: 'rupture',
        text: `Entre le ${formatLong(top.from)} et le ${formatLong(top.to)}, les mots de votre journal changent plus qu’entre vos autres journées. Vous souvenez-vous de ce qui se passait alors ?`,
        refs: { dates: [top.from, top.to], codes: [] },
        sources: ['portfolio'],
      })
    }
  }

  // 7. Écart entre les deux ensembles que la personne compare (§9.4).
  const saved = dataset.preferences?.compare
  if (saved?.a && saved?.b) {
    const cmp = compareSets(dataset, ref, saved.a, saved.b, { params })
    const facts = changeNarrative(cmp, { nameOf: (code) => nameOf(ref, code) }).filter((s) => s.refs?.codes?.length)
    if (facts.length) {
      threads.push({
        id: `ecart:${cmp.a.name}:${cmp.b.name}`,
        kind: 'ecart',
        text: `Entre ${quoted(cmp.a.name)} et ${quoted(cmp.b.name)} : ${facts[0].text.replace(/\.$/u, '')}. Qu’est-ce qui, selon vous, explique cet écart ?`,
        refs: { dates: facts[0].refs.dates ?? [], codes: facts[0].refs.codes },
        sources: ['comparaison'],
      })
    }
  }

  return threads
}

// ---------------------------------------------------------------------------
// Relance facultative par un modèle de langage

export const RELAUNCH_SYSTEM =
  'Vous accompagnez une personne qui relit son propre journal réflexif. Posez UNE seule question courte (une ou deux phrases), ' +
  'ouverte, qui l’aide à approfondir ce qu’elle vient d’écrire. Pas de jugement, pas d’évaluation, pas de conseil, pas de diagnostic, ' +
  'aucune comparaison avec d’autres personnes. Vouvoiement. Répondez uniquement par la question, en français.'
export const MAX_RELAUNCH_CHARS = 400

/**
 * La requête de relance : SEULEMENT la question posée, la réponse de la
 * personne et, s'il y en a un, le passage cité. Rien d'autre de la
 * cartographie ni du portfolio.
 * @param {{question: string, answer: string, quote?: string | null}} input
 * @returns {{system: string, prompt: string}}
 */
export function buildRelaunchRequest({ question, answer, quote = null }) {
  const lines = [`Question posée : ${String(question ?? '').trim()}`]
  if (quote) lines.push(`Passage cité de son journal : ${quoted(quoteText(quote))}`)
  lines.push(`Sa réponse : ${Array.from(String(answer ?? '').trim()).slice(0, MAX_ANSWER_CHARS).join('')}`)
  return { system: RELAUNCH_SYSTEM, prompt: lines.join('\n') }
}

/** Texte de relance affichable : simple texte, une question, bornée. */
export function cleanRelaunch(text) {
  return cut(stripMarkdownMarks(String(text ?? '')).replace(/\s+/gu, ' ').trim(), MAX_RELAUNCH_CHARS)
}

// ---------------------------------------------------------------------------
// Carnet

/** Jour d'un dialogue gardé, dans le fuseau de la personne (l'horodatage est en UTC). */
export function reflectionDay(at) {
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? String(at ?? '').slice(0, 10) : formatLong(todayIso(d))
}

/**
 * Le carnet en Markdown (à recopier dans son journal, par exemple).
 * @param {{at: string, entries: Array<{question: string, quote?: string | null, answer: string, relaunch?: {text: string, model: string} | null}>}} reflection
 */
export function reflectionMarkdown(reflection) {
  const lines = [`## Dialogue du ${reflectionDay(reflection.at)}`, '']
  for (const e of reflection.entries) {
    lines.push(`**${e.question}**`, '')
    if (e.quote) lines.push(`> ${quoted(e.quote)}`, '')
    lines.push(e.answer ? e.answer : '_(sans réponse)_', '')
    if (e.relaunch?.text) lines.push(`> Relance (${e.relaunch.model}) : ${e.relaunch.text}`, '')
  }
  return lines.join('\n').trim() + '\n'
}
