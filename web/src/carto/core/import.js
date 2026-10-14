// Interface ultime — chaîne d'import (spec §3) : inventorier → décompresser →
// reconnaître → adapter → fusionner → rapporter. Fonction PURE vis-à-vis des
// données : elle renvoie un NOUVEAU jeu de données, les retouches de détail
// par journée et le rapport ; la persistance (une seule transaction
// IndexedDB, tout ou rien) est faite par le magasin (`store.js`).
//
// Règles (V3 ImportReportPanel, §3) :
// - gravités Bloquant / À arbitrer / Avertissement / Information ;
// - un fichier invalide est mis en quarantaine et ne remplace jamais du
//   contenu valide ; il n'empêche pas le reste du lot ;
// - une analyse déjà importée (même contenu) est un doublon ignoré ;
// - plusieurs analyses de la même journée deviennent des VARIANTES ; tant que
//   l'apprenant n'a pas choisi, la journée est « à arbitrer » et ne contribue
//   pas (jamais d'addition de deux runs) ;
// - les dates restent des chaînes AAAA-MM-JJ.

import { listZipEntries, readZipEntry } from '../../v3/core/zip.js'
import { createDay, sortedDates, toCount } from './model.js'
import { isIsoDate } from './dates.js'
import { normalizeReferential, referentialErrors, toEmbeddedReferential } from './referential.js'
import { adaptAuroraDay, dateFromPassages, looksLikeCartoPole, looksLikeKairos, looksLikeSiteDay } from './importers/aurora-day.js'
import { importAuroraCoreTrees } from './importers/aurora-core.js'
import { importCartoMerge, importSiteMerge, looksLikeCartoMerge, looksLikeSiteMerge } from './importers/merge.js'
import { importPortfolioText, portfolioSummary } from './importers/portfolio.js'
import { importMetrics, looksLikeMetrics } from './importers/metrics.js'
import { importArchive, looksLikeArchive } from './archive.js'
import { importV3Master, looksLikeV3Master } from './importers/v3-master.js'
import { canonicalJson } from './model.js'
import { cleanReflectionEntries } from './ops.js'

const IGNORED = /(^|\/)(__MACOSX\/|\.DS_Store$|\._[^/]*$|Thumbs\.db$)/
const ISO_SEGMENT = /^(\d{4}-\d{2}-\d{2})(?:\.zip)?$/
const MAX_DEPTH = 3

// ---------------------------------------------------------------------------
// 1. Inventaire : ZIP décompressés (imbriqués jusqu'à 3 niveaux), textes décodés

const isZip = (f) => /\.zip$/i.test(f.path) || (f.bytes && f.bytes[0] === 0x50 && f.bytes[1] === 0x4b && f.bytes[2] === 3 && f.bytes[3] === 4)

/**
 * @param {Array<{path: string, bytes?: Uint8Array, text?: string}>} files
 * @returns {Promise<{files: Array<{path: string, text: string}>, report: Array<object>}>}
 */
export async function expandFiles(files, depth = 0) {
  const out = []
  const report = []
  const decoder = new TextDecoder('utf-8')
  for (const f of files) {
    const path = String(f.path ?? f.name ?? 'fichier').replace(/\\/g, '/').replace(/^\.?\//, '')
    if (IGNORED.test(path)) continue
    if (typeof f.text === 'string') {
      out.push({ path, text: stripBom(f.text) })
      continue
    }
    if (!f.bytes) continue
    if (isZip({ path, bytes: f.bytes })) {
      if (depth >= MAX_DEPTH) {
        report.push({ severity: 'warning', code: 'zip-trop-profond', message: `${path} : archive imbriquée trop profondément — ignorée`, file: path })
        continue
      }
      try {
        const base = path.replace(/\.zip$/i, '')
        const inner = []
        for (const entry of listZipEntries(f.bytes)) {
          if (IGNORED.test(entry.name)) continue
          inner.push({ path: `${base}/${entry.name}`, bytes: await readZipEntry(f.bytes, entry) })
        }
        const sub = await expandFiles(inner, depth + 1)
        out.push(...sub.files)
        report.push(...sub.report)
      } catch (err) {
        report.push({ severity: 'blocking', code: 'zip-invalide', message: `${path} : ${err.message} — archive en quarantaine`, file: path })
      }
      continue
    }
    if (/\.(json|md|markdown|txt|js)$/i.test(path)) {
      out.push({ path, text: stripBom(decoder.decode(f.bytes)) })
    } else {
      report.push({ severity: 'info', code: 'type-ignore', message: `${path} : type de fichier non pris en charge — ignoré`, file: path })
    }
  }
  return { files: out, report }
}

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

const dirname = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const basename = (p) => p.split('/').pop()

/** Dernier segment AAAA-MM-JJ d'un chemin de dossier, et le segment qui le précède (le run). */
function dateAndRunFromDir(dir) {
  const parts = dir.split('/').filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = ISO_SEGMENT.exec(parts[i])
    if (m && isIsoDate(m[1])) return { date: m[1], run: i > 0 ? parts[i - 1] : null }
  }
  return { date: null, run: parts.length ? parts[parts.length - 1] : null }
}

// ---------------------------------------------------------------------------
// 2. Reconnaissance et adaptation

/**
 * Reconnaît et adapte un lot de fichiers TEXTE.
 * @returns {{
 *   variants: Array<{date: string, summary: object, detail: object}>,
 *   portfolio: Array<{date: string, title: string|null, text: string, source: string}>,
 *   undated: Array<object>, narratives: Array<object>, metrics: object|null,
 *   runDetails: Array<{key: string, value: object}>, referential: object|null,
 *   unsupported: Array<{path: string, kind: string}>, report: Array<object>,
 * }}
 */
export function recognize(files, { now = new Date().toISOString() } = {}) {
  const report = []
  const result = { variants: [], portfolio: [], undated: [], narratives: [], metrics: null, runDetails: [], referential: null, unsupported: [], extras: [], report }

  // AuroraCore d'abord : il « consomme » verdicts, délibérations, pièces et feuilles.
  const core = importAuroraCoreTrees(files, { now })
  result.variants.push(...core.variants)
  result.runDetails.push(...core.runDetails)
  result.portfolio.push(...core.portfolio)
  report.push(...core.report)

  const auroraGroups = new Map() // dossier → {poles: [], kairos, files: []}
  for (const f of files) {
    if (core.consumed.has(f.path)) continue
    const name = basename(f.path)
    if (/\.json$/i.test(name)) {
      let doc
      try {
        doc = JSON.parse(f.text)
      } catch {
        report.push({ severity: 'blocking', code: 'json-invalide', message: `${f.path} : JSON invalide — fichier en quarantaine`, file: f.path })
        continue
      }
      if (doc?.kind === 'competency-map-master') {
        if (looksLikeArchive(doc)) {
          const r = importArchive(doc, { fileName: name })
          result.variants.push(...r.variants)
          result.portfolio.push(...r.portfolio)
          result.undated.push(...r.undated)
          result.narratives.push(...r.narratives)
          result.runDetails.push(...r.runDetails)
          if (r.metrics) result.metrics = r.metrics
          if (r.referential) result.referential = r.referential
          result.extras.push(r.extras)
          report.push(...r.report.map((x) => ({ ...x, file: f.path })))
        } else if (looksLikeV3Master(doc)) {
          const r = importV3Master(doc, { fileName: name, now })
          result.variants.push(...r.variants)
          result.extras.push(r.extras)
          report.push(...r.report.map((x) => ({ ...x, file: f.path })))
        } else {
          result.unsupported.push({ path: f.path, kind: 'master-inconnu', doc })
        }
      } else if (doc?.kind === 'referentiel' || (Array.isArray(doc?.poles) && Array.isArray(doc?.competences) && !doc?.date)) {
        const errors = referentialErrors(doc)
        if (errors.length) report.push({ severity: 'blocking', code: 'referentiel-invalide', message: `${f.path} : ${errors.join(' ; ')}`, file: f.path })
        else result.referential = toEmbeddedReferential(doc)
      } else if (looksLikeSiteMerge(doc)) {
        const r = importSiteMerge(doc, { fileName: name, now })
        result.variants.push(...r.variants)
        result.narratives.push(...r.narratives)
        report.push(...r.report.map((x) => ({ ...x, file: f.path })))
      } else if (looksLikeCartoMerge(doc)) {
        const r = importCartoMerge(doc, { fileName: name, now })
        result.variants.push(...r.variants)
        report.push(...r.report.map((x) => ({ ...x, file: f.path })))
      } else if (looksLikeSiteDay(doc)) {
        const date = isIsoDate(doc.date) ? doc.date : dateAndRunFromDir(dirname(f.path)).date
        if (!date) {
          report.push({ severity: 'blocking', code: 'date-absente', message: `${f.path} : date absente — journée en quarantaine`, file: f.path })
          continue
        }
        const r = adaptAuroraDay({ date, poles: doc.poles ?? [], kairos: doc.kairos ?? null, provenance: { source: 'site-jour', run: doc.run ?? null, files: [name] }, now })
        result.variants.push({ date, summary: r.summary, detail: r.detail })
        report.push(...r.report.map((x) => ({ ...x, file: f.path })))
      } else if (looksLikeCartoPole(doc) || (/^kairos.*\.json$/i.test(name) && looksLikeKairos(doc)) || looksLikeKairos(doc)) {
        const dir = dirname(f.path)
        if (!auroraGroups.has(dir)) auroraGroups.set(dir, { poles: [], kairos: null, files: [] })
        const g = auroraGroups.get(dir)
        g.files.push(f.path)
        if (looksLikeCartoPole(doc)) {
          const expected = /carto_P(\d)\.json$/i.exec(name)?.[1]
          if (expected && Number(doc.poleNum) !== Number(expected)) {
            report.push({ severity: 'warning', code: 'pole-discordant', message: `${f.path} : poleNum ${doc.poleNum} ≠ ${expected} (nom du fichier)`, file: f.path })
          }
          g.poles.push(doc)
        } else g.kairos = doc
      } else if (looksLikeMetrics(doc)) {
        const r = importMetrics(doc, { fileName: name })
        result.metrics = r.metrics
        report.push(...r.report.map((x) => ({ ...x, file: f.path })))
      } else if (/^manifest\.json$|^triage\.json$/i.test(name)) {
        report.push({ severity: 'info', code: 'fichier-technique', message: `${f.path} : fichier technique AuroraCore sans verdict associé — ignoré`, file: f.path })
      } else {
        report.push({ severity: 'warning', code: 'json-inconnu', message: `${f.path} : format JSON non reconnu — ignoré`, file: f.path })
      }
    } else if (/\.(md|markdown|txt)$/i.test(name)) {
      if (/^(deliberation|briefing|lecteur|rapport)\.md$/i.test(name)) {
        report.push({ severity: 'info', code: 'fichier-orphelin', message: `${f.path} : fichier AuroraCore sans verdict.json voisin — ignoré`, file: f.path })
        continue
      }
      const r = importPortfolioText(f.text, { fileName: f.path })
      result.portfolio.push(...r.segments)
      result.undated.push(...r.undated)
      report.push(...r.report.map((x) => ({ ...x, file: f.path })))
    } else if (/\.js$/i.test(name)) {
      report.push({
        severity: 'info',
        code: 'donnee-derivee',
        message: `${f.path} : donnée dérivée (competences-data.js / carto-data.js) — jamais une source ; importer les verdicts ou journées d'origine`,
        file: f.path,
      })
    }
  }

  for (const [dir, g] of auroraGroups) {
    if (g.poles.length === 0) {
      report.push({ severity: 'warning', code: 'kairos-seul', message: `${dir || '(racine)'} : kairos sans pôles — ignoré` })
      continue
    }
    const { date: dirDate, run } = dateAndRunFromDir(dir)
    let date = dirDate
    if (!date) {
      date = dateFromPassages(g.poles)
      if (date) report.push({ severity: 'arbitrate', code: 'date-proposee', message: `${dir || '(racine)'} : date ${date} déduite des feuilles citées — à confirmer`, date })
    }
    if (!date) {
      report.push({ severity: 'blocking', code: 'date-absente', message: `${dir || '(racine)'} : date de la journée introuvable (ni dans le chemin, ni dans les feuilles) — en quarantaine` })
      continue
    }
    const r = adaptAuroraDay({ date, poles: g.poles, kairos: g.kairos, provenance: { source: 'aurora-v3', run, files: g.files.map(basename) }, now })
    result.variants.push({ date, summary: r.summary, detail: r.detail })
    report.push(...r.report)
  }
  return result
}

// ---------------------------------------------------------------------------
// 3. Fusion dans le jeu de données (pure)

/**
 * @param {object} dataset jeu de données courant (non muté)
 * @param {ReturnType<typeof recognize>} recognized
 * @param {{now?: string, fileNames?: string[]}} [opts]
 * @returns {{dataset: object, detailPatches: Map<string, {portfolio?: object, variants: Record<string, object>}>,
 *   runDetails: Array<{key: string, value: object}>, report: Array<object>, counts: object, referentialCandidate: object | null}}
 */
export function mergeIntoDataset(dataset, recognized, { now = new Date().toISOString(), fileNames = [] } = {}) {
  const report = [...recognized.report]
  const wasEmpty = dataset.days.length === 0
  const ds = { ...dataset, days: dataset.days.map((d) => ({ ...d, variants: [...d.variants], tags: [...d.tags] })) }
  const byDate = new Map(ds.days.map((d) => [d.date, d]))
  const created = new Set()
  const patches = new Map()
  const patch = (date) => {
    if (!patches.has(date)) patches.set(date, { variants: {} })
    return patches.get(date)
  }
  const dayFor = (date) => {
    if (!byDate.has(date)) {
      const d = createDay(date)
      byDate.set(date, d)
      ds.days.push(d)
      created.add(date)
      counts.daysAdded++
    }
    return byDate.get(date)
  }
  const counts = { daysAdded: 0, variantsAdded: 0, duplicates: 0, portfolioDays: 0, narratives: 0, pendingDays: 0 }

  // Référentiel : remplacement direct seulement sur un jeu vide.
  let referentialCandidate = null
  if (recognized.referential && canonicalJson(recognized.referential) === canonicalJson(ds.referential)) {
    // Même référentiel (archive réimportée) : rien à arbitrer.
  } else if (recognized.referential) {
    if (ds.days.length === 0) {
      ds.referential = recognized.referential
      report.push({ severity: 'info', code: 'referentiel', message: `Référentiel ${recognized.referential.label} adopté` })
    } else {
      referentialCandidate = recognized.referential
      report.push({ severity: 'arbitrate', code: 'referentiel-candidat', message: `Référentiel ${recognized.referential.label} : le remplacement de ${ds.referential.label} est à confirmer` })
    }
  }

  // Variantes d'analyse.
  for (const { date, summary, detail } of recognized.variants) {
    const day = dayFor(date)
    if (day.variants.some((v) => v.id === summary.id)) {
      counts.duplicates++
      report.push({ severity: 'info', code: 'doublon', message: `${date} : analyse déjà importée — doublon ignoré`, date })
      continue
    }
    const hadVariants = day.variants.length > 0
    day.variants.push(summary)
    patch(date).variants[summary.id] = detail
    counts.variantsAdded++
    if (!hadVariants) {
      day.activeVariantId = summary.id
      day.variantChoice = 'auto'
    } else if (day.variantChoice === 'auto' || day.variantChoice === 'pending') {
      day.variantChoice = 'pending'
      report.push({ severity: 'arbitrate', code: 'variantes-concurrentes', message: `${date} : ${day.variants.length} analyses — à arbitrer, la journée ne contribue pas tant qu'aucune n'est choisie`, date })
    } else {
      report.push({ severity: 'info', code: 'variante-supplementaire', message: `${date} : nouvelle analyse disponible — votre choix de variante est conservé`, date })
    }
  }

  // Portfolio.
  for (const seg of recognized.portfolio) {
    const day = dayFor(seg.date)
    const summary = portfolioSummary(seg.text)
    if (day.portfolio && day.portfolio.chars !== summary.chars) {
      report.push({ severity: 'warning', code: 'portfolio-remplace', message: `${seg.date} : texte du portfolio remplacé par la nouvelle version`, date: seg.date })
    }
    day.portfolio = summary
    patch(seg.date).portfolio = { title: seg.title, text: seg.text, source: seg.source }
    counts.portfolioDays++
  }
  if (recognized.portfolio.length > 0 || recognized.undated.length > 0) {
    const sources = [...new Set(recognized.portfolio.map((s) => s.source).concat(recognized.undated.map((s) => s.source)))]
    ds.portfolio = {
      title: ds.portfolio?.title ?? (sources[0] ?? 'Portfolio'),
      sources: [...new Set([...(ds.portfolio?.sources ?? []), ...sources])],
      importedAt: now,
      undated: [...(ds.portfolio?.undated ?? []), ...recognized.undated],
    }
  }

  // Narratifs (upsert par identifiant) et métriques.
  if (recognized.narratives.length > 0) {
    const map = new Map(ds.narratives.map((n) => [n.id, n]))
    for (const n of recognized.narratives) map.set(n.id, n)
    ds.narratives = [...map.values()]
    counts.narratives = recognized.narratives.length
  }
  if (recognized.metrics) {
    const m = recognized.metrics
    const prev = ds.metrics ?? { source: m.source, fields: {}, byDate: {} }
    const byDateMerged = structuredClone(prev.byDate)
    for (const [d, row] of Object.entries(m.byDate)) byDateMerged[d] = { ...(byDateMerged[d] ?? {}), ...row }
    const next = { source: m.source, fields: { ...prev.fields, ...m.fields }, byDate: byDateMerged }
    const fi = { ...(prev.firstImpressions ?? {}), ...(m.firstImpressions ?? {}) }
    if (Object.keys(fi).length > 0) next.firstImpressions = fi
    const sigs = new Map([...(prev.signatures ?? []), ...(m.signatures ?? [])].map((x) => [`${x.type}|${x.date}|${x.question}`, x]))
    if (sigs.size > 0) next.signatures = [...sigs.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    ds.metrics = next
  }

  // Archives et masters V3 : état de l'apprenant (cases, étiquettes, choix de
  // variantes, ensembles, revues, repères, comparaisons). Sur un jeu existant,
  // ce qui y est déjà gagne ; sur un jeu vide, l'archive est restaurée telle quelle.
  for (const ex of recognized.extras ?? []) {
    if (wasEmpty) {
      if (ex.title) ds.title = ex.title
      if (ex.preferences) ds.preferences = { ...ds.preferences, ...structuredClone(ex.preferences) }
      if (ex.portfolioMeta && ds.portfolio) ds.portfolio = { ...ds.portfolio, title: ex.portfolioMeta.title ?? ds.portfolio.title, sources: [...new Set([...(ex.portfolioMeta.sources ?? []), ...(ds.portfolio.sources ?? [])])] }
    }
    for (const d of ex.days ?? []) {
      const day = dayFor(d.date)
      day.tags = [...new Set([...day.tags, ...(d.tags ?? [])])]
      if (!day.portfolio && d.portfolio) day.portfolio = { ...d.portfolio }
      if (created.has(d.date)) {
        day.active = d.active !== false
        const known = d.activeVariantId && day.variants.some((v) => v.id === d.activeVariantId)
        day.activeVariantId = known ? d.activeVariantId : d.variantChoice === 'pending' || d.variantChoice === 'examine' ? null : day.activeVariantId
        day.variantChoice = d.variantChoice ?? day.variantChoice
      }
    }
    const setIds = new Set(ds.sets.map((x) => x.id))
    const newSets = (ex.sets ?? []).filter((x) => x?.id && !setIds.has(x.id))
    if (newSets.length) ds.sets = [...ds.sets, ...structuredClone(newSets)]
    const newReviews = Object.entries(ex.reviews ?? {}).filter(([k]) => !(k in ds.reviews))
    if (newReviews.length) ds.reviews = { ...ds.reviews, ...Object.fromEntries(structuredClone(newReviews)) }
    const markerIds = new Set(ds.markers.map((m) => m.id))
    const newMarkers = (ex.markers ?? []).filter((m) => m?.id && !markerIds.has(m.id))
    if (newMarkers.length) ds.markers = [...ds.markers, ...structuredClone(newMarkers)].sort((a, b) => (a.date < b.date ? -1 : 1))
    const cmpKeys = new Set(ds.comparisons.map((c) => c.key))
    const newCmp = (ex.comparisons ?? []).filter((c) => c?.key && !cmpKeys.has(c.key))
    if (newCmp.length) ds.comparisons = [...ds.comparisons, ...structuredClone(newCmp)]
    ds.reflections ??= []
    const reflectionIds = new Set(ds.reflections.map((r) => r.id))
    const newReflections = (Array.isArray(ex.reflections) ? ex.reflections : [])
      .filter((r) => r && typeof r.id === 'string' && typeof r.at === 'string' && !reflectionIds.has(r.id))
      .map((r) => ({ id: r.id, at: r.at, entries: cleanReflectionEntries(r.entries) }))
      .filter((r) => r.entries.length > 0)
    if (newReflections.length) ds.reflections = [...ds.reflections, ...newReflections].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    if (newSets.length || newReviews.length || newMarkers.length || newCmp.length || newReflections.length) {
      report.push({
        severity: 'info',
        code: 'etat-restaure',
        message: `Restauré : ${newSets.length} ensemble(s), ${newReviews.length} réponse(s), ${newMarkers.length} repère(s), ${newCmp.length} note(s) de comparaison${newReflections.length ? `, ${newReflections.length} dialogue(s) du carnet` : ''}`,
      })
    }
  }

  // Formats reconnus mais non pris en charge.
  for (const u of recognized.unsupported) {
    report.push({ severity: 'warning', code: `format-${u.kind}`, message: `${u.path} : master de version inconnue (${u.doc?.schemaVersion ?? '?'}) — ignoré`, file: u.path })
  }

  // Codes hors référentiel : signalés une fois, jamais supprimés (point ouvert 8).
  const ref = normalizeReferential(ds.referential)
  const unknown = new Set()
  for (const { summary } of recognized.variants) for (const v of summary.verdicts) if (!ref.compByCode.has(v.code)) unknown.add(v.code)
  for (const code of [...unknown].sort()) {
    report.push({ severity: 'warning', code: 'code-hors-referentiel', message: `Compétence ${code} absente du référentiel ${ref.label} : conservée, sans secteur` })
  }

  ds.days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  counts.pendingDays = ds.days.filter((d) => d.variantChoice === 'pending').length
  ds.updatedAt = now
  // Le dernier rapport reste consultable après rechargement (sans les
  // informations, 300 entrées au plus) : le badge « à traiter » reste visible.
  ds.importLog = [
    ...(ds.importLog ?? []),
    {
      at: now,
      files: fileNames.slice(0, 50),
      counts: { ...counts },
      severities: severityCounts(report),
      entries: report.filter((r) => r.severity !== 'info').slice(0, 300).map(({ severity, code, message, date }) => ({ severity, code, message, ...(date ? { date } : {}) })),
      acknowledged: false,
    },
  ].slice(-20)
  return { dataset: ds, detailPatches: patches, runDetails: recognized.runDetails, report, counts, referentialCandidate }
}

/** Compte des entrées du rapport par gravité. */
export function severityCounts(report) {
  const out = { blocking: 0, arbitrate: 0, warning: 0, info: 0 }
  for (const r of report) out[r.severity] = toCount(out[r.severity]) + 1
  return out
}

/**
 * Chaîne complète : fichiers → nouveau jeu de données + retouches + rapport.
 * @param {Array<{path: string, bytes?: Uint8Array, text?: string}>} files
 * @param {object} dataset
 * @param {{now?: string}} [opts]
 */
export async function importFiles(files, dataset, { now = new Date().toISOString() } = {}) {
  const expanded = await expandFiles(files)
  const recognized = recognize(expanded.files, { now })
  recognized.report.unshift(...expanded.report)
  const merged = mergeIntoDataset(dataset, recognized, { now, fileNames: files.map((f) => f.path ?? f.name) })
  return { ...merged, dates: sortedDates(merged.dataset) }
}
