// Interface ultime — mesures de style calculées DANS LE NAVIGATEUR (spec §10,
// carte « Style (local) » ; PROTO empreinte_cognitive_*), sans modèle de
// langage : uniquement des expressions régulières et des comptes. Aucune
// mesure n'est comparée à une norme ni à une autre personne ; la carte les
// normalise ligne par ligne au sein des journées de la personne (ipsatif).
//
// Les listes de mots sont volontairement courtes et lisibles (elles sont
// affichées dans l'interface) : ce sont des indicateurs de surface, pas une
// analyse du sens. Une mesure sans dénominateur (texte sans phrase…) vaut
// null, jamais 0.

const LETTERS = /[\p{L}\p{M}]+/gu
const SENTENCE_END = /[.!?…]+(?=\s|$)|\n{2,}/gu
const EMOJI = /\p{Extended_Pictographic}/gu
const PUNCT = /[,;:—–()«»"!?…]/gu

const set = (s) => new Set(s.split(/\s+/u).filter(Boolean))
const FIRST_PERSON = set('je j me m moi mon ma mes')
const THIRD_PERSON = set('il elle ils elles lui leur leurs eux son sa ses')
const INTERJECTIONS = set('ah oh ha bah ben hein ouf waouh wouah wow hélas zut eh hum hmm pff oups euh aïe chut')
const ADVERSATIVE_WORDS = set('mais pourtant cependant toutefois néanmoins quoique malgré')
const ADVERSATIVE_PHRASES = ['en revanche', 'par contre', 'alors que', 'tandis que', 'bien que']
const CAUSAL_WORDS = set('car puisque donc ainsi')
const CAUSAL_PHRASES = ['parce que', 'parce qu', 'c est pourquoi', 'en effet', 'du coup', 'par conséquent', 'grâce à', 'à cause']
const MODAL_WORDS = set('probablement vraisemblablement possible possiblement éventuellement apparemment plutôt presque environ sûrement certainement')
const MODAL_PREFIXES = ['sembl', 'parai', 'paraî']
const MODAL_PHRASES = ['peut être', 'sans doute', 'il me semble', 'a priori', 'je crois', 'je pense', 'il se peut']
const COGNITIVE_PREFIXES = ['pens', 'réfléch', 'compren', 'compris', 'savoir', 'sais', 'savais', 'croi', 'analys', 'concev', 'conçoi', 'imagin', 'appren', 'appris', 'constat', 'remarqu', 'réalis', 'dédui', 'suppos', 'dout', 'raisonn', 'interrog']
const META_PHRASES = ['c est à dire', 'autrement dit', 'en d autres termes', 'je veux dire', 'en somme', 'bref', 'pour résumer', 'en résumé', 'premièrement', 'deuxièmement', 'en conclusion', 'pour conclure', 'd abord', 'ensuite', 'enfin']
const EMOTION_PREFIXES = ['joie', 'joyeu', 'heureu', 'content', 'trist', 'peur', 'craint', 'inquiet', 'inquièt', 'angoiss', 'stress', 'colère', 'énerv', 'frustr', 'fier', 'fière', 'fierté', 'honte', 'déçu', 'déception', 'plaisir', 'enthousias', 'émotion', 'ému', 'soulag', 'fatigu', 'épuis', 'découragé', 'motivé', 'aime', 'aimé', 'adore', 'détest', 'serein', 'sérénité', 'apais', 'excité', 'impatien']

/** Les mesures, dans l'ordre d'affichage. */
export const STYLE_METRICS = Object.freeze([
  { key: 'wordLength', label: 'Longueur moyenne des mots', group: 'lexique', unit: 'lettres' },
  { key: 'ttr', label: 'Variété du vocabulaire (TTR glissant, 100 mots)', group: 'lexique', unit: '' },
  { key: 'hapax', label: 'Mots employés une seule fois', group: 'lexique', unit: 'part des formes' },
  { key: 'sentenceLength', label: 'Longueur moyenne des phrases', group: 'syntaxe', unit: 'mots' },
  { key: 'questions', label: 'Phrases interrogatives', group: 'syntaxe', unit: 'part des phrases' },
  { key: 'exclamations', label: 'Phrases exclamatives', group: 'syntaxe', unit: 'part des phrases' },
  { key: 'punctuation', label: 'Ponctuation interne', group: 'syntaxe', unit: 'signes par mot' },
  { key: 'parentheses', label: 'Parenthèses', group: 'syntaxe', unit: 'par phrase' },
  { key: 'firstPerson', label: '1re personne (je, me, moi, mon…)', group: 'registre', unit: 'part des mots' },
  { key: 'thirdPerson', label: '3e personne (il, elle, leur…)', group: 'registre', unit: 'part des mots' },
  { key: 'adversative', label: 'Connecteurs d’opposition (mais, pourtant…)', group: 'raisonnement', unit: 'pour 100 mots' },
  { key: 'causal', label: 'Connecteurs de cause (car, donc, parce que…)', group: 'raisonnement', unit: 'pour 100 mots' },
  { key: 'modal', label: 'Modalisateurs (peut-être, il me semble…)', group: 'raisonnement', unit: 'pour 100 mots' },
  { key: 'cognitive', label: 'Verbes de pensée (penser, comprendre…)', group: 'réflexivité', unit: 'pour 100 mots' },
  { key: 'meta', label: 'Méta-discours (c’est-à-dire, bref…)', group: 'réflexivité', unit: 'pour 100 mots' },
  { key: 'selfQuestions', label: 'Questions qu’on se pose (je… ?)', group: 'réflexivité', unit: 'part des phrases' },
  { key: 'emotion', label: 'Mots d’émotion', group: 'émotion', unit: 'pour 100 mots' },
  { key: 'interjections', label: 'Interjections (ah, ouf…)', group: 'émotion', unit: 'pour 100 mots' },
  { key: 'emojis', label: 'Émojis', group: 'émotion', unit: 'pour 1 000 mots' },
])

/** Texte normalisé pour les expressions : minuscules, tout ce qui n'est pas lettre ou chiffre → espace. */
function flat(text) {
  return ` ${String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()} `
}

/** Mots (lettres seulement, élisions séparées : « j’ai » → « j », « ai »). */
export function words(text) {
  return String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’'`´]/gu, ' ')
    .match(LETTERS) ?? []
}

/** Phrases (fin par . ! ? … ou paragraphe vide), avec leur ponctuation finale. */
export function sentences(text) {
  const t = String(text ?? '').replace(/\r\n?/g, '\n')
  const out = []
  let last = 0
  for (const m of t.matchAll(SENTENCE_END)) {
    const s = t.slice(last, m.index + m[0].length).trim()
    if ((s.match(LETTERS) ?? []).length > 0) out.push(s)
    last = m.index + m[0].length
  }
  const tail = t.slice(last).trim()
  if ((tail.match(LETTERS) ?? []).length > 0) out.push(tail)
  return out
}

function countPhrases(flatText, phrases) {
  let n = 0
  for (const p of phrases) {
    const needle = ` ${p} `
    let i = flatText.indexOf(needle)
    while (i >= 0) {
      n++
      i = flatText.indexOf(needle, i + needle.length - 1)
    }
  }
  return n
}

const startsWithAny = (w, prefixes) => prefixes.some((p) => w.startsWith(p))

/** TTR glissant (MATTR) : moyenne des TTR sur des fenêtres de `size` mots. */
export function movingTtr(ws, size = 100) {
  if (ws.length === 0) return null
  if (ws.length <= size) return new Set(ws).size / ws.length
  const counts = new Map()
  let distinct = 0
  for (let i = 0; i < size; i++) {
    counts.set(ws[i], (counts.get(ws[i]) ?? 0) + 1)
    if (counts.get(ws[i]) === 1) distinct++
  }
  let total = distinct / size
  let windows = 1
  for (let i = size; i < ws.length; i++) {
    const out = ws[i - size]
    counts.set(out, counts.get(out) - 1)
    if (counts.get(out) === 0) distinct--
    counts.set(ws[i], (counts.get(ws[i]) ?? 0) + 1)
    if (counts.get(ws[i]) === 1) distinct++
    total += distinct / size
    windows++
  }
  return total / windows
}

/**
 * Mesures de style d'un texte.
 * @param {string} text
 * @returns {{words: number, sentences: number} & Record<string, number | null>}
 */
export function styleMetrics(text) {
  const ws = words(text)
  const ss = sentences(text)
  const n = ws.length
  const f = flat(text)
  const per = (count, base = n, scale = 1) => (base > 0 ? (count / base) * scale : null)
  const freq = new Map()
  for (const w of ws) freq.set(w, (freq.get(w) ?? 0) + 1)
  const hapax = [...freq.values()].filter((c) => c === 1).length
  const isQuestion = (s) => /\?\s*$/u.test(s)
  const selfQ = ss.filter((s) => isQuestion(s) && words(s).some((w) => FIRST_PERSON.has(w))).length
  return {
    words: n,
    sentences: ss.length,
    wordLength: n > 0 ? ws.reduce((s, w) => s + w.length, 0) / n : null,
    ttr: movingTtr(ws),
    hapax: freq.size > 0 ? hapax / freq.size : null,
    sentenceLength: per(n, ss.length),
    questions: per(ss.filter(isQuestion).length, ss.length),
    exclamations: per(ss.filter((s) => /!\s*$/u.test(s)).length, ss.length),
    punctuation: per((String(text ?? '').match(PUNCT) ?? []).length),
    parentheses: per((String(text ?? '').match(/\(/gu) ?? []).length, ss.length),
    firstPerson: per(ws.filter((w) => FIRST_PERSON.has(w)).length),
    thirdPerson: per(ws.filter((w) => THIRD_PERSON.has(w)).length),
    adversative: per(ws.filter((w) => ADVERSATIVE_WORDS.has(w)).length + countPhrases(f, ADVERSATIVE_PHRASES), n, 100),
    causal: per(ws.filter((w) => CAUSAL_WORDS.has(w)).length + countPhrases(f, CAUSAL_PHRASES), n, 100),
    modal: per(ws.filter((w) => MODAL_WORDS.has(w) || startsWithAny(w, MODAL_PREFIXES)).length + countPhrases(f, MODAL_PHRASES), n, 100),
    cognitive: per(ws.filter((w) => startsWithAny(w, COGNITIVE_PREFIXES)).length, n, 100),
    meta: per(countPhrases(f, META_PHRASES), n, 100),
    selfQuestions: per(selfQ, ss.length),
    emotion: per(ws.filter((w) => startsWithAny(w, EMOTION_PREFIXES)).length, n, 100),
    interjections: per(ws.filter((w) => INTERJECTIONS.has(w)).length, n, 100),
    emojis: per((String(text ?? '').match(EMOJI) ?? []).length, n, 1000),
  }
}

/** Les listes de mots, pour les montrer telles quelles dans l'interface. */
export const STYLE_LEXICONS = Object.freeze({
  firstPerson: [...FIRST_PERSON],
  thirdPerson: [...THIRD_PERSON],
  adversative: [...ADVERSATIVE_WORDS, ...ADVERSATIVE_PHRASES],
  causal: [...CAUSAL_WORDS, ...CAUSAL_PHRASES],
  modal: [...MODAL_WORDS, ...MODAL_PHRASES, ...MODAL_PREFIXES.map((p) => `${p}…`)],
  cognitive: COGNITIVE_PREFIXES.map((p) => `${p}…`),
  meta: META_PHRASES,
  emotion: EMOTION_PREFIXES.map((p) => `${p}…`),
  interjections: [...INTERJECTIONS],
})

// ---- Rupture lexicale ------------------------------------------------------------------------

const STOPWORDS = set(`les des une que qui quoi dans pour par sur avec sans sous chez entre vers plus moins très trop bien
  est sont était étaient être été avoir ont avait avaient fait faire cette ces cet son ses sur leur leurs mais donc car
  aussi alors comme tout tous toute toutes rien même encore déjà puis pas peu non oui elle elles ils nous vous lui eux
  mon ton ma ta mes tes notre votre nos vos aux mes ses dont ainsi quand où comment pourquoi parce cela ceci celui celle
  ceux celles sont suis sera seront serait peut peuvent doit doivent avais avait aurait autre autres jour fois chose
  choses ici là cest`)

/** Profil lexical d'un texte : fréquences des mots pleins (≥ 3 lettres, hors mots-outils). */
export function lexicalProfile(text) {
  const freq = new Map()
  let total = 0
  for (const w of words(text)) {
    if (w.length < 3 || STOPWORDS.has(w)) continue
    freq.set(w, (freq.get(w) ?? 0) + 1)
    total++
  }
  return { freq, total }
}

/**
 * Distance lexicale entre deux profils : 1 − cosinus des fréquences de mots
 * pleins (0 = mêmes mots dans les mêmes proportions, 1 = aucun mot commun).
 * Null si l'un des textes a moins de `minWords` mots pleins.
 */
export function lexicalDistance(a, b, { minWords = 20 } = {}) {
  if (!a || !b || a.total < minWords || b.total < minWords) return null
  let dot = 0
  for (const [w, x] of a.freq) {
    const y = b.freq.get(w)
    if (y) dot += x * y
  }
  const norm = (p) => Math.sqrt([...p.freq.values()].reduce((s, x) => s + x * x, 0))
  const d = norm(a) * norm(b)
  return d > 0 ? 1 - dot / d : null
}
