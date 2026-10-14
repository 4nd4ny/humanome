// Interface ultime — archive de l'apprenant (spec §11, point 1) : le master
// v4 COMPLET, autoporteur (référentiel embarqué, journées, variantes, verdicts,
// détails par journée, détails de run, portfolio, ensembles, revues, repères,
// narratifs, métriques, préférences), réimportable sans perte.
//
// Forme : l'index du master ({kind: 'competency-map-master', schemaVersion:
// '4.x', …}) augmenté de `details` (date → détail de journée) et
// `runDetails` (clé → délibération de run), plus `exportedAt` et
// `includesPortfolio`. Sans le portfolio, les volumes par jour restent (la
// heatmap reste juste) mais le texte part : le surlignage devient indisponible.

import { KIND, SCHEMA_VERSION } from './model.js'
import { isIsoDate } from './dates.js'

/** Nom de fichier conseillé : cartographie-<type>-<date>.json */
export function archiveFileName(type, now = new Date().toISOString(), ext = 'json') {
  const safe = String(type ?? 'archive')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `cartographie-${safe || 'archive'}-${now.slice(0, 10)}.${ext}`
}

/**
 * Construit l'archive à partir de ce que le magasin exporte (`exportAll`).
 * @param {{dataset: object, details: Record<string, object>, runDetails: Record<string, object>}} exported
 * @param {{includePortfolio?: boolean, includeReflections?: boolean, now?: string}} [opts]
 *   includeReflections : le carnet du dialogue (P7), écrit par la personne comme
 *   son journal — par défaut le même choix que le portfolio ; la copie autonome
 *   HTML ne l'emporte jamais.
 */
export function buildArchive(exported, { includePortfolio = true, includeReflections = includePortfolio, now = new Date().toISOString() } = {}) {
  const dataset = structuredClone(exported.dataset)
  const details = structuredClone(exported.details ?? {})
  if (!includePortfolio) {
    for (const d of Object.values(details)) if (d && d.portfolio) d.portfolio = null
    if (dataset.portfolio) dataset.portfolio = { ...dataset.portfolio, undated: [] }
  }
  if (!includeReflections) dataset.reflections = []
  return {
    ...dataset,
    kind: KIND,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    includesPortfolio: includePortfolio,
    details,
    runDetails: structuredClone(exported.runDetails ?? {}),
  }
}

/** Le document est-il une archive de cette interface ? */
export function looksLikeArchive(doc) {
  return Boolean(doc && doc.kind === KIND && String(doc.schemaVersion ?? '').startsWith('4.') && Array.isArray(doc.days))
}

/**
 * Lit une archive pour la chaîne d'import : variantes (résumé + détail),
 * portfolio, narratifs, métriques, détails de run, référentiel et
 * « extras » (cases, étiquettes, choix de variantes, ensembles, revues,
 * repères, comparaisons, carnet du dialogue, titre, préférences) que la
 * fusion applique.
 * @param {object} doc
 * @param {{fileName?: string}} [opts]
 */
export function importArchive(doc, { fileName = 'archive.json' } = {}) {
  const report = []
  const variants = []
  const portfolio = []
  const details = doc.details ?? {}
  for (const day of doc.days ?? []) {
    if (!isIsoDate(day?.date)) {
      report.push({ severity: 'blocking', code: 'date-absente', message: `${fileName} : journée sans date valide — ignorée` })
      continue
    }
    const detail = details[day.date] ?? null
    for (const summary of day.variants ?? []) {
      variants.push({
        date: day.date,
        summary,
        detail: detail?.variants?.[summary.id] ?? { verdicts: {}, passages: [], poleReports: {}, audits: {}, kairos: null, kairosRaw: null, emergences: null },
      })
    }
    if (detail?.portfolio && typeof detail.portfolio.text === 'string') {
      portfolio.push({ date: day.date, title: detail.portfolio.title ?? null, text: detail.portfolio.text, source: detail.portfolio.source ?? fileName })
    }
  }
  if (doc.includesPortfolio === false) report.push({ severity: 'info', code: 'archive-sans-portfolio', message: `${fileName} : archive sans le texte du portfolio (surlignage indisponible)` })
  report.push({ severity: 'info', code: 'archive', message: `${fileName} : archive du ${String(doc.exportedAt ?? '').slice(0, 10) || '?'} — ${(doc.days ?? []).length} journée(s)` })
  return {
    variants,
    portfolio,
    undated: doc.portfolio?.undated ?? [],
    narratives: doc.narratives ?? [],
    metrics: doc.metrics ?? null,
    runDetails: Object.entries(doc.runDetails ?? {}).map(([key, value]) => ({ key, value })),
    referential: doc.referential ?? null,
    extras: {
      title: doc.title ?? null,
      preferences: doc.preferences ?? null,
      portfolioMeta: doc.portfolio ? { title: doc.portfolio.title ?? null, sources: doc.portfolio.sources ?? [] } : null,
      days: (doc.days ?? []).filter((d) => isIsoDate(d?.date)).map((d) => ({
        date: d.date,
        active: d.active !== false,
        tags: Array.isArray(d.tags) ? d.tags : [],
        variantChoice: d.variantChoice ?? 'auto',
        activeVariantId: d.activeVariantId ?? null,
        portfolio: d.portfolio ?? null,
      })),
      sets: doc.sets ?? [],
      reviews: doc.reviews ?? {},
      markers: doc.markers ?? [],
      comparisons: doc.comparisons ?? [],
      reflections: doc.reflections ?? [],
    },
    report,
  }
}
