// Interface ultime — un jeu de données lu à la demande (journal D-67).
//
// L'archive d'un jeu (master v4) se découpe en fichiers statiques, que
// l'interface lit au moment où l'on ouvre ce qu'ils contiennent : un INDEX (le
// jeu sans ses détails : journées, verdicts résumés, référentiel, état…) et,
// dans un dossier de version, les détails rangés par ce que l'on ouvre :
//
//   jours/<date>.json         ce qui ne tient qu'à la journée : portrait
//                             (kairos), émergences, identifiant de run (et
//                             l'ordre des passages, s'il n'est pas par pôle)
//   portfolio/<date>.json     le texte du portfolio de la journée
//   competences/<code>.json   les verdicts détaillés d'une compétence, toutes
//                             journées (extraits, jury, pièces)
//   poles/<n>.json            les rapports de pôle et passages saillants d'un
//                             pôle, toutes journées
//   lectures/<i>.json         une délibération (run AuroraCore, seconde lecture)
//
// Chaque information est dans un fichier, un seul. Ouvrir une compétence lit
// un fichier (ses verdicts sur toutes ses journées), et non toutes ces
// journées entières ; ouvrir un pôle, un fichier. L'index dit où est chaque
// fichier (`remote`) : rien n'est demandé qui n'existe pas.
//
// Ici, des fonctions pures : le découpage (script de construction de la
// démonstration) et le remontage d'une journée à partir des fichiers lus
// (magasin). Rien sur le réseau.

import { canonicalJson, contentHash } from './model.js'

/** Besoins d'un lecteur de détails : tout, la journée seule, son texte, une compétence, un pôle. */
export const NEED_ALL = 'all'
export const NEED_DAY = 'day'
export const NEED_PORTFOLIO = 'portfolio'
export const needCode = (code) => `code:${code}`
export const needPole = (num) => `pole:${Number(num)}`

const byKey = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
const poleNumber = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/** Nom de fichier sûr pour une clé (compétence, délibération), unique dans `used`. */
function fileName(dir, key, used) {
  const base = `${dir}/${String(key).replace(/[^A-Za-z0-9._-]+/g, '_') || 'x'}`
  let name = `${base}.json`
  for (let i = 2; used.has(name); i++) name = `${base}-${i}.json`
  used.add(name)
  return name
}

/**
 * Découpe une archive complète (master v4) en un index et des fichiers de
 * détails, sous un dossier de version (empreinte du contenu).
 * @param {object} archive archive de l'interface (`buildArchive`)
 * @returns {{index: object, files: Array<{path: string, value: object}>}} chemins relatifs au dossier de l'index
 */
export function splitArchive(archive) {
  const used = new Set()
  const files = []
  const remote = { days: {}, portfolio: {}, codes: {}, poles: {}, runs: {} }
  const codes = new Map() // code → {code, days: {date: {vid: verdict}}}
  const poles = new Map() // n → {pole, days: {date: {vid: {report?, audit?, passages?}}}}
  const poleEntry = (n, date, vid) => {
    if (!poles.has(n)) poles.set(n, { pole: n, days: {} })
    const days = poles.get(n).days
    days[date] ??= {}
    days[date][vid] ??= {}
    return days[date][vid]
  }

  for (const [date, detail] of Object.entries(archive.details ?? {}).sort(byKey)) {
    if (detail?.portfolio) {
      const path = `portfolio/${date}.json`
      files.push({ path, value: { date, portfolio: detail.portfolio } })
      remote.portfolio[date] = path
    }
    const dayVariants = {}
    for (const [vid, vd] of Object.entries(detail?.variants ?? {})) {
      const { verdicts, passages, poleReports, audits, ...rest } = vd ?? {}
      for (const [code, verdict] of Object.entries(verdicts ?? {})) {
        if (!codes.has(code)) codes.set(code, { code, days: {} })
        const days = codes.get(code).days
        days[date] ??= {}
        days[date][vid] = verdict
      }
      const loose = []
      for (const p of passages ?? []) {
        const n = poleNumber(p?.pole)
        if (n === null) loose.push(p)
        else (poleEntry(n, date, vid).passages ??= []).push(p)
      }
      // Remontés, les passages viennent par pôle, puis ceux sans pôle : un
      // autre ordre d'origine est noté, pour que l'archive refaite soit la même.
      const order = (passages ?? []).map((p) => poleNumber(p?.pole))
      const canonical = [...order.filter((n) => n !== null)].sort((a, b) => a - b).concat(order.filter((n) => n === null))
      if (order.some((n, i) => n !== canonical[i])) rest.passageOrder = order
      for (const [n, report] of Object.entries(poleReports ?? {})) {
        if (poleNumber(n) === null) rest.poleReports = { ...(rest.poleReports ?? {}), [n]: report }
        else poleEntry(poleNumber(n), date, vid).report = report
      }
      for (const [n, audit] of Object.entries(audits ?? {})) {
        if (poleNumber(n) === null) rest.audits = { ...(rest.audits ?? {}), [n]: audit }
        else poleEntry(poleNumber(n), date, vid).audit = audit
      }
      dayVariants[vid] = loose.length > 0 ? { ...rest, passages: loose } : rest
    }
    if (Object.keys(dayVariants).length > 0) {
      const path = `jours/${date}.json`
      files.push({ path, value: { date, variants: dayVariants } })
      remote.days[date] = path
    }
  }
  for (const [code, value] of [...codes].sort(byKey)) {
    const path = fileName('competences', code, used)
    files.push({ path, value })
    remote.codes[code] = path
  }
  for (const [n, value] of [...poles].sort(([a], [b]) => a - b)) {
    const path = `poles/${n}.json`
    files.push({ path, value })
    remote.poles[n] = path
  }
  for (const [key, value] of Object.entries(archive.runDetails ?? {}).sort(byKey)) {
    const path = fileName('lectures', key, used)
    files.push({ path, value: { key, value } })
    remote.runs[key] = path
  }

  const index = { ...archive, details: {}, runDetails: {} }
  delete index.remote
  const version = `v-${contentHash(canonicalJson({ index, files })).slice(0, 12)}`
  index.remote = { version, base: `${version}/`, ...remote }
  return { index, files: files.map((f) => ({ path: `${version}/${f.path}`, value: f.value })) }
}

/**
 * Un dossier de fichiers relatif, sur le même site (« v-…/ »,
 * « data/demo/carto/v-…/ ») : ni adresse d'un autre site, ni chemin absolu,
 * ni remontée.
 */
export function isLocalBase(base) {
  return typeof base === 'string' && /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\/$/.test(base) && !base.split('/').includes('..')
}

/** Un index découpé (un jeu lu à la demande) ? */
export function isSplitIndex(doc) {
  return Boolean(doc?.remote && typeof doc.remote === 'object' && typeof doc.remote.base === 'string' && doc.remote.days && typeof doc.remote.days === 'object')
}

/** Compétences des variantes d'une journée (index). */
export function codesOfDay(dataset, date) {
  const day = dataset?.days?.find((d) => d.date === date)
  const out = new Set()
  for (const v of day?.variants ?? []) for (const verdict of v.verdicts ?? []) out.add(verdict.code)
  return [...out].sort()
}

/**
 * Ce qu'un besoin demande, pour une journée d'un jeu lu à la demande : des
 * clés précises (`day`, `portfolio`, `pole:n`, `code:c`). « Tout » : la
 * journée, son texte, tous les pôles, les compétences qu'elle observe.
 * @param {object} dataset
 * @param {string} date
 * @param {string | string[]} [need]
 * @returns {string[]}
 */
export function expandNeed(dataset, date, need = NEED_ALL) {
  const keys = new Set()
  for (const k of [need].flat()) {
    if (k === NEED_ALL) {
      keys.add(NEED_DAY)
      keys.add(NEED_PORTFOLIO)
      for (const n of Object.keys(dataset?.remote?.poles ?? {})) keys.add(needPole(n))
      for (const c of codesOfDay(dataset, date)) keys.add(needCode(c))
    } else if (k) keys.add(k)
  }
  return [...keys]
}

/**
 * Le fichier qui porte une clé pour une journée, ou null (rien à lire : la clé
 * est satisfaite d'office).
 * @returns {string | null} chemin relatif au dossier de version
 */
export function partPath(remote, date, key) {
  if (key === NEED_DAY) return remote?.days?.[date] ?? null
  if (key === NEED_PORTFOLIO) return remote?.portfolio?.[date] ?? null
  if (key.startsWith('code:')) return remote?.codes?.[key.slice(5)] ?? null
  if (key.startsWith('pole:')) return remote?.poles?.[key.slice(5)] ?? null
  return null
}

/**
 * Remonte une journée à partir des fichiers lus (absents : rien de leur part).
 * @param {string} date
 * @param {string[]} variantIds variantes de la journée (index)
 * @param {{day?: object | null, portfolio?: object | null, codes?: Map<string, object>, poles?: Map<number, object>}} parts
 * @returns {{date: string, portfolio: object | null, variants: Record<string, object>}}
 */
export function assembleDay(date, variantIds, { day = null, portfolio = null, codes = new Map(), poles = new Map() } = {}) {
  const variants = {}
  const polesInOrder = [...poles].sort(([a], [b]) => a - b)
  for (const vid of variantIds) {
    const core = day?.variants?.[vid] ?? {}
    const { passages: loose = [], poleReports: loosePoleReports = {}, audits: looseAudits = {}, passageOrder = null, ...rest } = core
    const v = { verdicts: {}, passages: [], poleReports: { ...loosePoleReports }, audits: { ...looseAudits }, kairos: null, kairosRaw: null, emergences: null, ...rest }
    const queues = new Map() // pôle → ses passages (pôles lus)
    for (const [n, part] of polesInOrder) {
      const e = part?.days?.[date]?.[vid]
      if (!e) continue
      if ('report' in e) v.poleReports[n] = e.report
      if ('audit' in e) v.audits[n] = e.audit
      if (Array.isArray(e.passages)) queues.set(n, [...e.passages])
    }
    const looseQueue = [...loose]
    // L'ordre d'origine quand il est noté (pôles non lus : sautés), sinon par pôle puis sans pôle.
    if (Array.isArray(passageOrder)) {
      for (const n of passageOrder) {
        const q = n === null ? looseQueue : queues.get(n)
        if (q?.length) v.passages.push(q.shift())
      }
    }
    for (const q of [...queues.values(), looseQueue]) v.passages.push(...q)
    for (const [code, part] of codes) {
      const verdict = part?.days?.[date]?.[vid]
      if (verdict !== undefined) v.verdicts[code] = verdict
    }
    variants[vid] = v
  }
  return { date, portfolio: portfolio?.portfolio ?? null, variants }
}

/**
 * Une journée remontée, complétée par ce que la personne a écrit ici (un
 * passage rattaché, une analyse importée) : ses variantes, et son texte s'il
 * l'a changé (`portfolio` défini).
 */
export function withOverlay(record, overlay) {
  if (!overlay) return record
  return {
    ...record,
    portfolio: overlay.portfolio !== undefined ? overlay.portfolio : record.portfolio,
    variants: { ...record.variants, ...(overlay.variants ?? {}) },
  }
}
