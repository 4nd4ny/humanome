// Interface V3 — projet de partage et instantané employeur (spec §18–19).
//
// LISTE POSITIVE (§3.2) : une version employeur est construite depuis les
// éléments explicitement autorisés — jamais le dossier complet avec des
// propriétés `hidden`. Un nouveau projet commence SANS preuve autorisée
// (AC-SHARE-02). L'action s'appelle « Retirer de cette version partagée »,
// jamais « Supprimer » (§18.1).
//
// Le constructeur (§18.6) : 1. part de la liste blanche ; 2. reconstruit les
// relations ; 3. omet raisonnements adversariaux et non-présences ; 4. omet ou
// régénère les narratifs depuis le sous-ensemble public ; 5. recalcule tous
// les compteurs ; 6. remappe les identifiants ; 7. recherche les verbatims
// exclus dans le JSON final ; 8. bloque la publication sur correspondance
// exacte ou relation orpheline.

import { uuidV4, sha256Hex } from './ids.js'
import { canonicalStringify, contentDigest } from './canonical-json.js'
import { masterDigest } from './master.js'
import { computeEvents } from './events.js'
import { metricForPrecision, monthOf } from './metrics.js'
import { referentialForShare } from './referentiel.js'

export const PROJECT_SCHEMA_VERSION = '3.0.0'
export const RENDERER_PROFILE = 'employer-renderer-v1'

/** Nouveau projet privé de partage — vide (AC-SHARE-02). */
export function newShareProject({ master, name, now = new Date().toISOString() }) {
  return {
    kind: 'competency-map-project',
    schemaVersion: PROJECT_SCHEMA_VERSION,
    private: true,
    id: uuidV4(),
    name,
    state: 'draft',
    masterDatasetId: master.datasetId,
    masterRevisionId: master.revision.id,
    masterDigest: masterDigest(master),
    temporalPrecision: 'day',
    allowed: {
      evidenceLinkIds: [],
      passageIds: [],
      documentModes: {}, // docId → 'none' | 'extracts' | 'summary' ('full' réservé : nos documents sont synthétiques)
      fields: { learnerRole: false, outcome: false, tags: false, contexte: false, auteur: false },
    },
    summaries: [], // synthèses sans source choisies explicitement (§18.4 mode 3)
    journal: [{ at: now, action: 'created', summary: 'Projet créé (aucune preuve autorisée)' }],
    previewLock: null,
    publishedRevisions: [],
  }
}

/** Empreinte de la politique d'un projet (verrouillage de prévisualisation §18.8). */
export function policyDigest(project) {
  const policy = {
    temporalPrecision: project.temporalPrecision,
    allowed: {
      evidenceLinkIds: [...project.allowed.evidenceLinkIds].sort(),
      passageIds: [...project.allowed.passageIds].sort(),
      documentModes: project.allowed.documentModes,
      fields: project.allowed.fields,
    },
    summaries: project.summaries,
  }
  return sha256Hex(canonicalStringify(policy))
}

/** Journalise (append-only, §19.3) et invalide la prévisualisation (AC-SHARE-15). */
function amend(project, action, summary, mutate, now = new Date().toISOString()) {
  const next = structuredClone(project)
  mutate(next)
  next.journal.push({ at: now, action, summary })
  next.previewLock = null
  return next
}

// --- Granularités d'inclusion (§18.3) ---------------------------------------

/** Inclut/retire UNE association passage–compétence (la granularité de base). */
export function setLinkShared(project, master, linkId, shared, now) {
  const link = master.evidenceLinks.find((l) => l.id === linkId)
  if (!link) throw new Error('Lien de preuve introuvable')
  return amend(project, shared ? 'include-link' : 'remove-link',
    `${shared ? 'Inclusion' : 'Retrait'} d'une association (${linkId.slice(0, 8)})`,
    (p) => {
      const set = new Set(p.allowed.evidenceLinkIds)
      const passages = new Set(p.allowed.passageIds)
      if (shared) {
        set.add(linkId)
        if (link.passageId) {
          passages.add(link.passageId)
          const passage = master.passages.find((x) => x.id === link.passageId)
          if (passage && !p.allowed.documentModes[passage.documentId]) {
            p.allowed.documentModes[passage.documentId] = 'extracts'
          }
        }
      } else {
        set.delete(linkId)
        // Le passage reste si une AUTRE association autorisée l'utilise (§18.5).
        if (link.passageId) {
          const stillUsed = master.evidenceLinks.some(
            (l) => l.id !== linkId && set.has(l.id) && l.passageId === link.passageId,
          )
          if (!stillUsed) passages.delete(link.passageId)
        }
      }
      p.allowed.evidenceLinkIds = [...set]
      p.allowed.passageIds = [...passages]
    }, now)
}

/**
 * Inclusion groupée d'une portée (famille, compétence, journée ou document) :
 * sélectionne les observations STRUCTURÉES admissibles (liens résolus non
 * contestés), sans jamais rendre public un document intégral, une URI ou un
 * champ sensible (AC-SHARE-14). Retourne d'abord un RÉCAPITULATIF ; l'appelant
 * confirme (§18.3).
 */
export function planScopeInclusion(project, master, scope) {
  const { admissible } = computeEvents(master)
  const links = []
  for (const e of admissible) {
    const code = e.observation.rawCode
    const matches =
      scope.type === 'all' ||
      (scope.type === 'competency' && code === scope.code) ||
      (scope.type === 'family' && code.startsWith(`${scope.familyNum}.`)) ||
      (scope.type === 'day' && e.date === scope.date) ||
      (scope.type === 'document' && e.links.some((l) => {
        const p = master.passages.find((x) => x.id === l.passageId)
        return p?.documentId === scope.documentId
      }))
    if (!matches) continue
    for (const l of e.links) links.push(l.id)
  }
  const current = new Set(project.allowed.evidenceLinkIds)
  const toAdd = [...new Set(links)].filter((id) => !current.has(id))
  return { linkIds: toAdd, count: toAdd.length }
}

/** Applique un plan d'inclusion groupée confirmé — UN SEUL amendement (perf §22.2). */
export function applyScopeInclusion(project, master, plan, now) {
  if (plan.linkIds.length === 0) return project
  const linkById = new Map(master.evidenceLinks.map((l) => [l.id, l]))
  return amend(project, 'include-scope', `Inclusion groupée de ${plan.linkIds.length} association(s)`, (p) => {
    const links = new Set(p.allowed.evidenceLinkIds)
    const passages = new Set(p.allowed.passageIds)
    for (const linkId of plan.linkIds) {
      const link = linkById.get(linkId)
      if (!link) continue
      links.add(linkId)
      if (link.passageId) {
        passages.add(link.passageId)
        const passage = master.passages.find((x) => x.id === link.passageId)
        if (passage && !p.allowed.documentModes[passage.documentId]) {
          p.allowed.documentModes[passage.documentId] = 'extracts'
        }
      }
    }
    p.allowed.evidenceLinkIds = [...links]
    p.allowed.passageIds = [...passages]
  }, now)
}

/** Retire une portée entière (cascade §18.5 : liens → passages → observations). */
export function removeScope(project, master, scope, now) {
  const allowed = new Set(project.allowed.evidenceLinkIds)
  const obsById = new Map(master.observations.map((o) => [o.id, o]))
  const passageById = new Map(master.passages.map((p) => [p.id, p]))
  const dayById = new Map(master.days.map((d) => [d.id, d]))
  const toRemove = new Set()
  for (const link of master.evidenceLinks) {
    if (!allowed.has(link.id)) continue
    const obs = obsById.get(link.observationId)
    const passage = link.passageId ? passageById.get(link.passageId) : null
    const day = obs ? dayById.get(obs.dayId) : null
    const matches =
      (scope.type === 'competency' && obs?.rawCode === scope.code) ||
      (scope.type === 'family' && obs?.rawCode?.startsWith(`${scope.familyNum}.`)) ||
      (scope.type === 'day' && day?.effectiveDate === scope.date) ||
      (scope.type === 'document' && passage?.documentId === scope.documentId) ||
      (scope.type === 'passage' && link.passageId === scope.passageId)
    if (matches) toRemove.add(link.id)
  }
  if (toRemove.size === 0) return project
  return amend(project, 'remove-scope', `Retrait de ${toRemove.size} association(s) de cette version partagée`, (p) => {
    const links = new Set(p.allowed.evidenceLinkIds)
    for (const id of toRemove) links.delete(id)
    // Un passage ne reste que si une AUTRE association autorisée l'utilise (§18.5).
    const stillUsed = new Set()
    for (const l of master.evidenceLinks) {
      if (links.has(l.id) && l.passageId) stillUsed.add(l.passageId)
    }
    p.allowed.evidenceLinkIds = [...links]
    p.allowed.passageIds = p.allowed.passageIds.filter((id) => stillUsed.has(id))
  }, now)
}

/** État à trois cases d'une portée : included | partial | excluded (§18.3). */
export function scopeTriState(project, master, scope) {
  const plan = planScopeInclusion({ ...project, allowed: { ...project.allowed, evidenceLinkIds: [] } }, master, scope)
  if (plan.count === 0) return 'excluded'
  const allowed = new Set(project.allowed.evidenceLinkIds)
  const included = plan.linkIds.filter((id) => allowed.has(id)).length
  if (included === 0) return 'excluded'
  return included === plan.count ? 'included' : 'partial'
}

/** Choix des champs sensibles et de la précision temporelle (§18.3, §18.7). */
export function configureProject(project, { fields = null, temporalPrecision = null, name = null }, now) {
  return amend(project, 'configure', 'Configuration du projet', (p) => {
    if (fields) p.allowed.fields = { ...p.allowed.fields, ...fields }
    if (temporalPrecision) {
      if (!['day', 'month', 'hidden'].includes(temporalPrecision)) throw new Error('Précision inconnue')
      p.temporalPrecision = temporalPrecision
    }
    if (name) p.name = name
  }, now)
}

/** Synthèse sans source (§18.4 mode 3) — zéro contribution au rayon documenté. */
export function addLearnerSummary(project, { code, text }, now) {
  return amend(project, 'add-summary', `Synthèse sans source (${code})`, (p) => {
    p.summaries.push({ id: uuidV4(), code, text, provenance: 'déclaration de l’apprenant' })
  }, now)
}

// --- Constructeur d'instantané (§18.6, §19.4) --------------------------------

/**
 * Construit l'instantané employeur depuis la liste blanche. Retourne soit
 * {ok: true, snapshot, digests}, soit {ok: false, blockers[]} — la publication
 * est BLOQUÉE sur relation orpheline ou fuite de verbatim exclu.
 *
 * @param {object} master
 * @param {object} project
 * @param {{referential: object, now?: string, randomId?: () => string}} opts
 */
export function buildShareSnapshot(master, project, { referential, now = new Date().toISOString(), randomId = uuidV4 }) {
  const blockers = []
  const precision = project.temporalPrecision
  const metric = metricForPrecision(precision)

  // 1-2. Liste blanche → relations reconstruites (liens → passages → observations).
  const allowedLinkIds = new Set(project.allowed.evidenceLinkIds)
  const allowedPassageIds = new Set(project.allowed.passageIds)
  const { admissible } = computeEvents(master, { allowedLinkIds })

  const passageById = new Map(master.passages.map((p) => [p.id, p]))
  const kept = [] // {observation, day, date, links[]}
  for (const e of admissible) {
    const links = e.links.filter((l) => l.passageId && allowedPassageIds.has(l.passageId))
    if (links.length === 0) continue
    kept.push({ ...e, links })
  }

  // 3. Raisonnements adversariaux et non-présences : jamais inclus (rien à
  //    faire — seules les observations établies admissibles sont ici).
  // 4. Narratifs dérivés : OMIS en V3 initiale (privés par défaut, §6.7) ;
  //    seules les synthèses sans source EXPLICITES sont exportées (§18.4).

  // 6. Remappage des identifiants — nouveaux identifiants aléatoires par
  //    projection (AC-SHARE-07) ; les dates disparaissent sous month/hidden.
  const dayIdMap = new Map()
  const monthIdMap = new Map()
  const passageIdMap = new Map()
  const obsIdMap = new Map()
  const docIdMap = new Map()
  const occIdMap = new Map()

  const publicDays = []
  const publicMonths = []
  for (const e of kept) {
    if (precision === 'day' && !dayIdMap.has(e.day.id)) {
      const id = randomId()
      dayIdMap.set(e.day.id, id)
      publicDays.push({ id, date: e.date })
    }
    if (precision === 'month') {
      const m = monthOf(e.date)
      if (!monthIdMap.has(m)) {
        const id = randomId()
        monthIdMap.set(m, id)
        publicMonths.push({ id, month: m })
      }
    }
  }
  publicDays.sort((a, b) => a.date.localeCompare(b.date))
  publicMonths.sort((a, b) => a.month.localeCompare(b.month))

  const fields = project.allowed.fields
  const publicPassages = []
  const publicDocuments = []
  const publicOccurrences = []
  const seenPassages = new Set()
  const seenDocs = new Set()

  for (const e of kept) {
    for (const l of e.links) {
      const passage = passageById.get(l.passageId)
      if (!passage) {
        blockers.push({ code: 'relation-orpheline', message: `Lien ${l.id} vers un passage inexistant` })
        continue
      }
      if (seenPassages.has(passage.id)) continue
      seenPassages.add(passage.id)
      const mode = project.allowed.documentModes[passage.documentId] ?? 'none'
      if (mode === 'none' || mode === 'summary') {
        blockers.push({ code: 'document-non-partage', message: `Passage autorisé mais document en mode « ${mode} »` })
        continue
      }
      if (!seenDocs.has(passage.documentId)) {
        seenDocs.add(passage.documentId)
        const srcDoc = master.portfolioDocuments.find((d) => d.id === passage.documentId)
        const docId = randomId()
        docIdMap.set(passage.documentId, docId)
        publicDocuments.push({
          id: docId,
          type: 'extracts',
          title: precision === 'day' ? (srcDoc?.title ?? null) : null, // le titre porte la date
          author: fields.auteur ? (srcDoc?.author ?? null) : null,
        })
        if (precision !== 'hidden') {
          const srcOcc = master.portfolioOccurrences.find((o) => o.documentId === passage.documentId)
          if (srcOcc) {
            const occId = randomId()
            occIdMap.set(passage.documentId, occId) // une occurrence par document synthétique
            const day = master.days.find((d) => d.id === srcOcc.dayId)
            publicOccurrences.push({
              id: occId,
              documentId: docId,
              ...(precision === 'day'
                ? { dayId: dayIdMap.get(srcOcc.dayId) ?? null }
                : { monthId: day ? monthIdMap.get(monthOf(day.effectiveDate)) ?? null : null }),
            })
          }
        }
      }
      const pubId = randomId()
      passageIdMap.set(passage.id, pubId)
      const occurrenceId = precision === 'hidden' ? null : occIdMap.get(passage.documentId) ?? null
      publicPassages.push({
        id: pubId,
        documentId: docIdMap.get(passage.documentId),
        // Sous `hidden`, aucun occurrenceId dans les passages (§19.4).
        ...(occurrenceId ? { occurrenceId } : {}),
        verbatim: passage.verbatim,
        contexte: fields.contexte ? passage.contexte : null,
      })
    }
  }

  const publicObservations = []
  const publicLinks = []
  const usedCodes = new Set()
  for (const e of kept) {
    const obsId = randomId()
    obsIdMap.set(e.observation.id, obsId)
    usedCodes.add(e.observation.rawCode)
    const annotation = master.annotations.find(
      (a) => a.targetType === 'observation' && a.targetId === e.observation.id,
    )
    publicObservations.push({
      id: obsId,
      competencyCode: e.observation.rawCode,
      ...(precision === 'day' ? { dayId: dayIdMap.get(e.day.id) } : {}),
      ...(precision === 'month' ? { monthId: monthIdMap.get(monthOf(e.date)) } : {}),
      ...(fields.learnerRole && annotation?.learnerRole ? { learnerRole: annotation.learnerRole } : {}),
      ...(fields.outcome && annotation?.outcome ? { outcome: annotation.outcome } : {}),
      ...(fields.tags && annotation?.tags?.length ? { tags: [...annotation.tags] } : {}),
    })
    for (const l of e.links) {
      const passagePub = passageIdMap.get(l.passageId)
      if (!passagePub) continue
      publicLinks.push({
        id: randomId(),
        observationId: obsId,
        passageId: passagePub,
        evidentialRole: l.evidentialRole,
      })
    }
  }

  // Synthèses sans source (§18.4 mode 3) : documents learner-summary SANS lien.
  for (const s of project.summaries) {
    usedCodes.add(s.code)
    publicDocuments.push({
      id: randomId(),
      type: 'learner-summary',
      title: null,
      author: null,
      summary: s.text,
      competencyCode: s.code,
      provenance: s.provenance,
    })
  }

  // 5. Compteurs recalculés depuis le sous-ensemble public uniquement.
  const temporal =
    precision === 'day'
      ? { precision: 'day', days: publicDays }
      : precision === 'month'
        ? { precision: 'month', months: publicMonths }
        : { precision: 'hidden' }

  const snapshot = {
    kind: 'competency-map-share',
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projection: {
      id: randomId(),
      revision: project.publishedRevisions.length + 1,
      createdAt: now,
      publishedAt: null,
      informationalExpiresAt: null,
    },
    rendererProfileVersion: RENDERER_PROFILE,
    presentation: {
      preset: 'employer-simple',
      surfaceTheme: 'system',
      colorVisionSupport: 'standard',
      sections: ['sun', 'competency-list', 'evidence'],
    },
    referential: referentialForShare(referential, usedCodes),
    metricDefinition:
      metric.id === 'public-presence-v1'
        ? { id: metric.id }
        : { id: metric.id, referencePeriods: metric.reference },
    temporal,
    portfolioDocuments: publicDocuments,
    portfolioOccurrences: precision === 'hidden' ? [] : publicOccurrences,
    passages: publicPassages,
    observations: publicObservations,
    evidenceLinks: publicLinks,
    integrity: { algorithm: 'sha-256', contentDigest: '' },
  }

  // 7. Anti-fuite : recherche des verbatims EXCLUS dans le JSON final
  //    (correspondance exacte = blocage, AC-SHARE-12). Défense secondaire —
  //    la principale est la reconstruction depuis la liste blanche. Le corpus
  //    duplique le MÊME extrait dans plusieurs pôles (passages jamais
  //    fusionnés, §9.2) : un texte identique porté par un passage AUTORISÉ
  //    n'est pas une fuite — seul un contenu qu'aucune autorisation ne couvre
  //    doit bloquer.
  const serialized = canonicalStringify(snapshot)
  const allowedVerbatims = master.passages
    .filter((p) => allowedPassageIds.has(p.id))
    .map((p) => p.verbatim?.trim())
    .filter(Boolean)
  const allowedSet = new Set(allowedVerbatims)
  // Un texte égal à — ou contenu dans — un verbatim AUTORISÉ est couvert par
  // l'autorisation explicite de l'apprenant : pas une fuite. Mémoïsé par
  // verbatim : le corpus duplique massivement les mêmes extraits (perf §22.2).
  const coveredCache = new Map()
  const covered = (v) => {
    let hit = coveredCache.get(v)
    if (hit === undefined) {
      hit = allowedSet.has(v) || allowedVerbatims.some((a) => a.includes(v))
      coveredCache.set(v, hit)
    }
    return hit
  }
  for (const passage of master.passages) {
    if (allowedPassageIds.has(passage.id)) continue
    const verbatim = passage.verbatim?.trim()
    if (!verbatim || verbatim.length < 12 || covered(verbatim)) continue
    // Recherche sous la forme ÉCHAPPÉE (le JSON sérialisé échappe guillemets
    // et sauts de ligne — un verbatim avec « " » doit quand même être détecté).
    const needle = JSON.stringify(verbatim).slice(1, -1)
    if (serialized.includes(needle)) {
      blockers.push({ code: 'fuite-verbatim', message: `Un verbatim exclu subsiste dans l'export (passage ${passage.id.slice(0, 8)})` })
    }
  }
  // 8. Relations orphelines : chaque objet public pointe vers un objet présent.
  const pubObsIds = new Set(publicObservations.map((o) => o.id))
  const pubPassageIds = new Set(publicPassages.map((p) => p.id))
  for (const l of publicLinks) {
    if (!pubObsIds.has(l.observationId) || !pubPassageIds.has(l.passageId)) {
      blockers.push({ code: 'relation-orpheline', message: `Lien public ${l.id.slice(0, 8)} orphelin` })
    }
  }

  if (blockers.length > 0) return { ok: false, blockers }

  snapshot.integrity.contentDigest = contentDigest(snapshot)
  return {
    ok: true,
    snapshot,
    digests: {
      sourceDigest: masterDigest(master),
      policyDigest: policyDigest(project),
      outputDigest: snapshot.integrity.contentDigest,
    },
  }
}

/** Verrouille la prévisualisation (§18.8) : publier exigera ces trois empreintes. */
export function lockPreview(project, digests, now = new Date().toISOString()) {
  const next = structuredClone(project)
  next.previewLock = { ...digests, at: now }
  next.journal.push({ at: now, action: 'preview', summary: 'Prévisualisation verrouillée', ...digests })
  return next
}

/**
 * Publie l'instantané prévisualisé (§18.8, §19.2). Refuse si le master, la
 * politique ou la sortie ont changé depuis la prévisualisation (AC-SHARE-15).
 * `confirmedStaticExportWarning` = AC-SHARE-13 (fichier transmis irrévocable).
 */
export function publishSnapshot(project, master, currentDigests, { confirmedStaticExportWarning, now = new Date().toISOString() }) {
  if (!confirmedStaticExportWarning) {
    return { ok: false, error: 'Confirmation requise : un fichier transmis ne peut pas être révoqué (AC-SHARE-13).' }
  }
  const lock = project.previewLock
  if (!lock) return { ok: false, error: 'Prévisualisez avant de publier.' }
  if (
    lock.sourceDigest !== currentDigests.sourceDigest ||
    lock.policyDigest !== currentDigests.policyDigest ||
    lock.outputDigest !== currentDigests.outputDigest
  ) {
    return { ok: false, error: 'La prévisualisation est obsolète : le dossier ou le projet a changé. Prévisualisez de nouveau.' }
  }
  const next = structuredClone(project)
  next.state = 'published'
  next.publishedRevisions.push({ revision: next.publishedRevisions.length + 1, publishedAt: now, outputDigest: lock.outputDigest })
  next.journal.push({ at: now, action: 'publish', summary: `Publication r${next.publishedRevisions.length}`, outputDigest: lock.outputDigest, staticWarningConfirmed: true })
  return { ok: true, project: next }
}

/** Nom de fichier public NEUTRE (§19.4) — jamais de chemin, run ou date privée. */
export function shareFilename(project) {
  const r = String(project.publishedRevisions.length + 1).padStart(2, '0')
  return `cartographie-competences-partage-r${r}.json`
}
