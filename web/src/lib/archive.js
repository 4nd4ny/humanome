// Archive export / import (P8.6, chantier C) — the RGPD portability pivot
// (ADR-006, cahier §6.1/§6.3): assembles a SELF-CONTAINED document conforming
// to schemas/archive-export.schema.json from the LOCAL stores (portfolios,
// cartographies) plus the current referentiel, validates it through the
// engine BEFORE any download, and restores an archive into the local stores
// (ids regenerated, duplicates skipped by content).
//
// Everything runs in the browser: the archive never transits through the
// server. The only network calls are read-only lookups (account identity,
// published referentiel, default prompt package) and they all degrade to
// a purely local, anonymous archive when the API is unreachable.

import { validateDocument } from '@engine/validation.js'
import { apiFetch, fetchMe } from '../api/client.js'
import { frenchDate } from '../data/load.js'
import { loadPublishedReferentiel } from '../data/referentiel.js'
import { createPortfolioStore } from './portfolio-store.js'
import { createCartoStore } from './carto-store.js'

export const ARCHIVE_SCHEMA_VERSION = '1.0.0'

// Traceability fallbacks for cartographies saved without run metadata (e.g.
// a document imported by drag & drop): the archive schema REQUIRES the
// prompt-package couple, so a neutral marker keeps the archive valid without
// fabricating provenance. Mapped back to null on import.
export const UNKNOWN_ID = 'inconnu'
export const UNKNOWN_VERSION = '0.0.0'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Default browser download (Blob + <a download>). Injectable in tests. */
function browserDownload(filename, text) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/**
 * Downloads any JSON-serialisable value as a pretty-printed .json file.
 * Shared by the archive export and the per-cartography « Télécharger le
 * JSON » action of CartographiesPanel.
 *
 * @param {string} filename
 * @param {unknown} data
 * @param {(filename: string, text: string) => void} [download] test seam
 */
export function downloadJson(filename, data, download = browserDownload) {
  download(filename, JSON.stringify(data, null, 2))
}

/** account block from the session, or null (anonymous archive) on any failure. */
async function defaultGetAccount(fetchFn) {
  try {
    const { user } = await fetchMe(fetchFn ? { fetchFn } : undefined)
    if (!user) return null
    const account = { roles: Array.isArray(user.roles) ? user.roles : [] }
    if (typeof user.email === 'string' && user.email !== '') account.email = user.email
    if (typeof user.displayName === 'string' && user.displayName !== '') {
      account.displayName = user.displayName
    }
    return account
  } catch {
    return null
  }
}

/** Default published prompt package via the API, or [] when unreachable. */
async function defaultGetPromptPackages(fetchFn) {
  const options = fetchFn ? { fetchFn } : undefined
  try {
    const list = await apiFetch('prompt-packages', options)
    if (!Array.isArray(list) || list.length === 0) return []
    const { id, version } = list[0] ?? {}
    if (typeof id !== 'string' || typeof version !== 'string') return []
    const doc = await apiFetch(
      `prompt-packages/${encodeURIComponent(id)}/${encodeURIComponent(version)}`,
      options,
    )
    return doc && doc.kind === 'prompt-package' ? [doc] : []
  } catch {
    return []
  }
}

/** Maps a portfolio-store record to the archive `portfolios[]` shape. */
function toArchivePortfolio(record) {
  const segmentation = (record.segments ?? [])
    .filter(
      (s) =>
        s &&
        ISO_DATE_RE.test(String(s.date)) &&
        Number.isInteger(s.debut) &&
        Number.isInteger(s.fin) &&
        s.debut >= 0 &&
        s.fin >= s.debut,
    )
    .map((s) => ({ date: s.date, debut: s.debut, fin: s.fin }))
  return {
    id: record.id,
    titre: record.titre ?? 'Portfolio sans titre',
    source: ['colle', 'gdocs', 'fichier'].includes(record.source) ? record.source : 'colle',
    texte: record.texte ?? '',
    segmentation,
  }
}

/** runMeta restricted to the schema keys (never invents counters). */
function toArchiveRunMeta(runMeta, fallbackDate) {
  const meta = {
    modele:
      typeof runMeta?.modele === 'string' && runMeta.modele !== '' ? runMeta.modele : UNKNOWN_ID,
    dateRun:
      typeof runMeta?.dateRun === 'string' && runMeta.dateRun !== ''
        ? runMeta.dateRun
        : fallbackDate,
  }
  if (runMeta?.tokens && typeof runMeta.tokens === 'object') {
    const tokens = {}
    for (const key of ['entree', 'sortie', 'total']) {
      if (Number.isInteger(runMeta.tokens[key]) && runMeta.tokens[key] >= 0) {
        tokens[key] = runMeta.tokens[key]
      }
    }
    if (Object.keys(tokens).length > 0) meta.tokens = tokens
  }
  if (typeof runMeta?.coutEstime === 'number' && runMeta.coutEstime >= 0) {
    meta.coutEstime = runMeta.coutEstime
  }
  return meta
}

/** Maps a carto-store entry to the archive `cartographies[]` shape. */
function toArchiveCartography(entry, referentielDoc, fallbackDate) {
  return {
    id: entry.id,
    type: entry.type === 'merge' ? 'merge' : 'jour',
    document: entry.document,
    promptPackageId: entry.promptPackage?.id ?? UNKNOWN_ID,
    promptPackageVersion: entry.promptPackage?.version ?? UNKNOWN_VERSION,
    referentielId: entry.referentiel?.id ?? referentielDoc?.id ?? UNKNOWN_ID,
    referentielVersion: entry.referentiel?.version ?? referentielDoc?.version ?? UNKNOWN_VERSION,
    runMeta: toArchiveRunMeta(entry.runMeta, entry.updatedAt ?? fallbackDate),
  }
}

/**
 * Assembles, validates and downloads the complete local archive.
 *
 * @param {{
 *   cartoStore?: ReturnType<typeof createCartoStore>,
 *   portfolioStore?: ReturnType<typeof createPortfolioStore>,
 *   getAccount?: () => Promise<object | null>,
 *   getReferentiel?: () => Promise<{doc: object}>,
 *   getPromptPackages?: () => Promise<object[]>,
 *   download?: (filename: string, text: string) => void,
 *   now?: () => Date,
 *   fetchFn?: typeof fetch,
 * }} [options] every dependency is injectable (tests, chantier B)
 * @returns {Promise<{archive: object, filename: string,
 *   counts: {portfolios: number, cartographies: number}}>}
 * @throws {Error} French message; `error.validationErrors` carries the ajv
 *   errors if the assembled archive does not match its schema (never
 *   downloads an invalid archive).
 */
export async function exportArchive(options = {}) {
  const cartoStore = options.cartoStore ?? createCartoStore()
  const portfolioStore = options.portfolioStore ?? createPortfolioStore()
  const getAccount = options.getAccount ?? (() => defaultGetAccount(options.fetchFn))
  const getReferentiel = options.getReferentiel ?? loadPublishedReferentiel
  const getPromptPackages =
    options.getPromptPackages ?? (() => defaultGetPromptPackages(options.fetchFn))
  const download = options.download ?? browserDownload
  const nowDate = (options.now ?? (() => new Date()))()
  const exportedAt = nowDate.toISOString()

  const [account, portfolios, entries, referentiel, promptPackages] = await Promise.all([
    getAccount(),
    portfolioStore.list(),
    cartoStore.listCartographies(),
    getReferentiel(),
    getPromptPackages(),
  ])
  const referentielDoc = referentiel?.doc ?? referentiel ?? null

  const archive = {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    kind: 'archive-export',
    exportedAt,
    account,
    portfolios: portfolios.map(toArchivePortfolio),
    referentiels: referentielDoc ? [referentielDoc] : [],
    promptPackages,
    cartographies: entries
      .filter((entry) => entry.document != null)
      .map((entry) => toArchiveCartography(entry, referentielDoc, exportedAt)),
    audit: [],
  }

  const { valid, errors } = validateDocument('archive-export', archive)
  if (!valid) {
    const error = new Error(
      `L’archive assemblée n’est pas conforme au schéma archive-export (${errors.length} ` +
        `erreur${errors.length > 1 ? 's' : ''}) : export annulé, rien n’a été téléchargé.`,
    )
    error.validationErrors = errors
    throw error
  }

  const filename = `humanome-export-${exportedAt.slice(0, 10)}.json`
  download(filename, JSON.stringify(archive, null, 2))
  return {
    archive,
    filename,
    counts: {
      portfolios: archive.portfolios.length,
      cartographies: archive.cartographies.length,
    },
  }
}

/** Derives a French display title for an imported cartography. */
function importedTitre(item) {
  const doc = item.document ?? {}
  if (item.type === 'jour' && ISO_DATE_RE.test(String(doc.date))) {
    return `Journée du ${frenchDate(doc.date)}`
  }
  if (item.type === 'merge' && doc.periode?.premiere && doc.periode?.derniere) {
    return `Parcours du ${frenchDate(doc.periode.premiere)} au ${frenchDate(doc.periode.derniere)}`
  }
  return item.type === 'merge' ? 'Cartographie merge importée' : 'Cartographie importée'
}

/**
 * Validates an archive file and restores portfolios + cartographies into the
 * LOCAL stores. Ids are regenerated; duplicates are skipped by CONTENT
 * (portfolio: same full text; cartography: same document), so importing the
 * same archive twice restores nothing the second time.
 *
 * @param {File | Blob | string} source archive file (or its text, in tests)
 * @param {{
 *   cartoStore?: ReturnType<typeof createCartoStore>,
 *   portfolioStore?: ReturnType<typeof createPortfolioStore>,
 * }} [options]
 * @returns {Promise<{portfolios: number, cartographies: number}>} restored counts
 * @throws {Error} French message (invalid JSON, wrong kind, schema errors)
 */
export async function importArchive(source, options = {}) {
  const cartoStore = options.cartoStore ?? createCartoStore()
  const portfolioStore = options.portfolioStore ?? createPortfolioStore()

  const text = typeof source === 'string' ? source : await source.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Ce fichier n’est pas un JSON valide.')
  }
  if (!data || typeof data !== 'object' || data.kind !== 'archive-export') {
    throw new Error(
      'Document non reconnu : une archive humanome doit porter « kind: archive-export » ' +
        '(export produit par « Exporter toutes mes données »).',
    )
  }
  const { valid, errors } = validateDocument('archive-export', data)
  if (!valid) {
    const error = new Error(
      `Archive non conforme au schéma archive-export (${errors.length} ` +
        `erreur${errors.length > 1 ? 's' : ''}) : rien n’a été importé.`,
    )
    error.validationErrors = errors
    throw error
  }

  // Portfolios: dedupe by full text (existing store + within the archive).
  const existingPortfolios = await portfolioStore.list()
  const knownTexts = new Set(existingPortfolios.map((p) => p.texte))
  let restoredPortfolios = 0
  for (const portfolio of data.portfolios) {
    if (knownTexts.has(portfolio.texte)) continue
    knownTexts.add(portfolio.texte)
    await portfolioStore.create({
      titre: portfolio.titre,
      source: portfolio.source,
      texte: portfolio.texte,
      segments: portfolio.segmentation.map((s) => ({
        date: s.date,
        texte: portfolio.texte.slice(s.debut, s.fin),
        debut: s.debut,
        fin: s.fin,
      })),
    })
    restoredPortfolios += 1
  }

  // Cartographies: dedupe by document content.
  const existingEntries = await cartoStore.listCartographies()
  const knownDocuments = new Set(existingEntries.map((entry) => JSON.stringify(entry.document)))
  let restoredCartographies = 0
  for (const item of data.cartographies) {
    const key = JSON.stringify(item.document)
    if (knownDocuments.has(key)) continue
    knownDocuments.add(key)
    await cartoStore.saveCartography({
      type: item.type,
      titre: importedTitre(item),
      visibility: 'privee', // the server copy / visibility is never imported: opt-in only (§6.2)
      document: item.document,
      promptPackage:
        item.promptPackageId === UNKNOWN_ID
          ? null
          : { id: item.promptPackageId, version: item.promptPackageVersion },
      referentiel:
        item.referentielId === UNKNOWN_ID
          ? null
          : { id: item.referentielId, version: item.referentielVersion },
      runMeta: item.runMeta ?? null,
      serverId: null,
    })
    restoredCartographies += 1
  }

  return { portfolios: restoredPortfolios, cartographies: restoredCartographies }
}
