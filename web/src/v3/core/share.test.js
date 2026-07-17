// Interface V3 — partage, révisions, comparaison, panneaux (spec §12, §14,
// §16–19 ; AC-EDIT-01→04, AC-REFL-01/02, AC-SHARE-01→20 côté logique,
// AC-UI-01/04). Master de travail : le VRAI document-jour démo importé.
import { describe, expect, it } from 'vitest'
import demoDay from '../../../public/data/demo/jours/2026-01-04.json'
import referentielDoc from '../../../public/data/referentiel/respire-v7.json'
import { normalizeReferential } from './referentiel.js'
import { importJourDocuments } from './import.js'
import { computeEvents } from './events.js'
import { masterDigest, reviewEvidenceLink, annotate, applyExpertJson, withRevision } from './master.js'
import { resolveBaselinePreset, compareStates, whatChanged } from './compare.js'
import { availablePanels, renderedPanels, switchMode, initialState, selectScope, inspectDay } from './state.js'
import {
  addLearnerSummary,
  buildShareSnapshot,
  configureProject,
  lockPreview,
  newShareProject,
  planScopeInclusion,
  applyScopeInclusion,
  publishSnapshot,
  removeScope,
  scopeTriState,
  setLinkShared,
  shareFilename,
} from './share.js'
import { openShareSnapshot, duplicateAsProject, snapshotToViewModel } from './reimport.js'

const REF = normalizeReferential(referentielDoc)
const NOW = '2026-07-17T12:00:00Z'

/**
 * Master à DEUX journées : le doc démo réel + une variante décalée d'un mois
 * dont les verbatims sont PRÉFIXÉS (deux jours au contenu distinct — sinon les
 * assertions sur les verbatims ne peuvent pas distinguer les documents).
 */
function buildMaster() {
  const day2 = structuredClone(demoDay)
  day2.date = '2026-02-10'
  for (const pole of day2.poles) {
    for (const p of pole.passagesSaillants ?? []) {
      p.extraitVerbatim = `Deuxième journée, pôle ${pole.poleNum}, passage ${p.pid} : un contenu entièrement réécrit, sans reprise du texte du 4 janvier.`
    }
    for (const c of pole.competences ?? []) {
      for (const piece of c.pieces ?? []) {
        if (typeof piece.extraitVerbatim === 'string') {
          piece.extraitVerbatim = `Deuxième journée, pièce ${piece.numero} de ${c.code} : contenu réécrit.`
        }
      }
    }
  }
  const { master } = importJourDocuments(
    [
      { run: 'site', sourceDate: demoDay.date, payload: demoDay },
      { run: 'site', sourceDate: '2026-02-10', payload: day2 },
    ],
    { referential: REF, now: NOW },
  )
  return master
}

describe('master — révisions et droit de réponse (spec §16–17)', () => {
  const master = buildMaster()

  it('AC-EDIT-01 : réviser ne réécrit pas la source (le master d’entrée garde son empreinte)', () => {
    const avant = masterDigest(master)
    const après = reviewEvidenceLink(master, master.evidenceLinks[0].id, 'confirmed', { now: NOW })
    expect(masterDigest(master)).toBe(avant) // l'entrée n'a pas bougé
    expect(après.revision.number).toBe(master.revision.number + 1)
    expect(après.revision.parentId).toBe(master.revision.id)
  })

  it('AC-EDIT-03 : modifier une preuve marque les narratifs dépendants stale', () => {
    const linkRésolu = master.evidenceLinks.find((l) => l.linkState === 'resolved')
    const après = reviewEvidenceLink(master, linkRésolu.id, 'contested', { now: NOW })
    const obs = après.observations.find((o) => o.id === linkRésolu.observationId)
    const stale = après.derivedNarratives.filter((n) => n.freshness === 'stale')
    expect(stale.length).toBeGreaterThan(0)
    expect(stale.some((n) => n.dayId === obs.dayId)).toBe(true)
  })

  it('AC-EDIT-02 : un JSON invalide ne remplace jamais une révision valide', () => {
    const invalide = structuredClone(master)
    invalide.observations[0].normalizedStatus = 'super-fort' // hors union
    const res = applyExpertJson(master, invalide, { now: NOW })
    expect(res.ok).toBe(false)
    expect(res.errors.length).toBeGreaterThan(0)
    expect(res.master).toBe(master) // la révision valide reste
  })

  it('annotations : learnerRole/outcome saisis, jamais déduits du rôle argumentatif (§6.6)', () => {
    const obs = master.observations[0]
    const annoté = annotate(master, {
      targetType: 'observation', targetId: obs.id,
      learnerRole: 'animateur du débat', outcome: 'décision collective adoptée',
      tags: ['atelier'], effectiveDay: '2026-01-04', now: NOW,
    })
    const a = annoté.annotations.find((x) => x.targetId === obs.id)
    expect(a.learnerRole).toBe('animateur du débat')
    expect(a.originRevisionId).toBe(master.revision.id)
    // Les liens de preuve conservent leur rôle ARGUMENTATIF distinct.
    expect(master.evidenceLinks[0].evidentialRole).not.toBe(a.learnerRole)
  })
})

describe('compare — ipsatif et récit (spec §17.2-3)', () => {
  const master = buildMaster()
  const { daysByCompetency } = computeEvents(master)

  it('préréglage « dernière évaluation » : journée active immédiatement antérieure, sinon indisponible', () => {
    const dates = ['2026-01-04', '2026-02-10']
    expect(resolveBaselinePreset('last-evaluation', { playheadDay: '2026-02-10', activeDates: dates })).toEqual({ baselineDay: '2026-01-04' })
    const indisponible = resolveBaselinePreset('last-evaluation', { playheadDay: '2026-01-04', activeDates: dates })
    expect(indisponible.unavailable).toMatch(/indisponible/)
  })

  it('AC-REFL-01/02 : la comparaison ne contient aucune cohorte et chaque phrase porte ses références', () => {
    const diff = compareStates(daysByCompetency, { baselineDay: '2026-01-31', playheadDay: '2026-02-28' })
    expect(diff.newDays).toEqual(['2026-02-10'])
    expect(diff.reobserved.length).toBeGreaterThan(0) // mêmes codes revus au 10 février
    const récit = whatChanged(diff, { nameOf: (c) => REF.competencyByCode.get(c)?.name ?? c })
    expect(récit.length).toBeGreaterThan(0)
    for (const phrase of récit) {
      expect(phrase.text).not.toMatch(/cohorte|classement|moyenne des/i)
      expect(phrase).toHaveProperty('refs')
    }
    const avecRefs = récit.filter((p) => (p.refs.codes?.length ?? 0) + (p.refs.dates?.length ?? 0) > 0)
    expect(avecRefs.length).toBeGreaterThan(0)
  })
})

describe('state — modes et panneaux (spec §12, §14)', () => {
  it('AC-UI-04 : renderedPanels ne contient jamais un panneau interdit par audience/format/mode', () => {
    const avail = availablePanels({ format: { temporalPrecision: 'day' }, audience: 'employer', interfaceMode: 'expert' })
    expect(avail.has('jsonEditor')).toBe(false) // le mode expert n'élargit pas l'audience (§4)
    expect(avail.has('importAudit')).toBe(false)
    const rendered = renderedPanels(new Set(['jsonEditor', 'sun', 'importAudit']), avail)
    expect([...rendered]).toEqual(['sun'])
  })

  it('la précision temporelle restreint les capacités du format (§18.7/§20)', () => {
    const month = availablePanels({ format: { temporalPrecision: 'month' }, audience: 'employer', interfaceMode: 'simplified' })
    expect(month.has('heatmap')).toBe(false)
    const hidden = availablePanels({ format: { temporalPrecision: 'hidden' }, audience: 'employer', interfaceMode: 'simplified' })
    expect(hidden.has('timeline')).toBe(false)
  })

  it('AC-UI-01 : basculer simplifié ↔ expert conserve les états fonctionnels', () => {
    let s = initialState({ audience: 'learner' })
    s = selectScope(s, 'family-1')
    s = inspectDay(s, { day: '2026-01-04', source: 'heatmap' })
    s = { ...s, playheadDay: '2026-01-04' }
    const expert = switchMode(s, 'expert')
    expect(expert.activeScopeNodeId).toBe('family-1')
    expect(expert.inspection.day).toBe('2026-01-04')
    expect(expert.playheadDay).toBe('2026-01-04')
    const retour = switchMode(expert, 'simplified')
    expect(retour.visiblePanels).toEqual(s.visiblePanels) // préférences par mode restaurées
    expect(retour.activeScopeNodeId).toBe('family-1')
  })
})

describe('share — liste positive, cascades et instantané (spec §18–19)', () => {
  const master = buildMaster()
  const nowIdCounter = { n: 0 }
  const seqId = () => `00000000-0000-4000-8000-${String(++nowIdCounter.n).padStart(12, '0')}`

  function projetAvecTout() {
    let p = newShareProject({ master, name: 'Candidature test', now: NOW })
    const plan = planScopeInclusion(p, master, { type: 'all' })
    p = applyScopeInclusion(p, master, plan, NOW)
    return p
  }

  it('AC-SHARE-02 : un projet neuf n’exporte aucune preuve', () => {
    const p = newShareProject({ master, name: 'Vide', now: NOW })
    const res = buildShareSnapshot(master, p, { referential: REF, now: NOW })
    expect(res.ok).toBe(true)
    expect(res.snapshot.observations).toEqual([])
    expect(res.snapshot.passages).toEqual([])
  })

  it('AC-SHARE-01 : inclure au partage ne touche pas l’état de navigation (et inversement)', () => {
    // La séparation est structurelle : le projet ne référence aucun état d'UI.
    const p = projetAvecTout()
    expect(JSON.stringify(p)).not.toMatch(/activeScope|playhead|inspection/)
  })

  it('cases à trois états : included / partial / excluded (§18.3)', () => {
    let p = newShareProject({ master, name: 'T', now: NOW })
    const { admissible } = computeEvents(master)
    const code = admissible[0].observation.rawCode
    expect(scopeTriState(p, master, { type: 'competency', code })).toBe('excluded')
    const plan = planScopeInclusion(p, master, { type: 'competency', code })
    expect(plan.count).toBeGreaterThan(0) // le récapitulatif annonce le nombre exact
    p = applyScopeInclusion(p, master, plan, NOW)
    expect(scopeTriState(p, master, { type: 'competency', code })).toBe('included')
    p = removeScope(p, master, { type: 'day', date: '2026-02-10' }, NOW)
    const state = scopeTriState(p, master, { type: 'competency', code })
    expect(['partial', 'included']).toContain(state) // partial si la compétence avait les 2 jours
  })

  it('AC-SHARE-03/05 : retirer un document retire passages, observations et toute trace privée', () => {
    let p = projetAvecTout()
    const docId = master.passages[0].documentId
    p = removeScope(p, master, { type: 'document', documentId: docId }, NOW)
    const res = buildShareSnapshot(master, p, { referential: REF, now: NOW })
    expect(res.ok).toBe(true)
    const json = JSON.stringify(res.snapshot)
    // Aucun verbatim du document retiré ne subsiste.
    for (const passage of master.passages.filter((x) => x.documentId === docId)) {
      if (passage.verbatim.length >= 12) expect(json).not.toContain(passage.verbatim)
    }
    // Et aucun identifiant privé nulle part (AC-SHARE-05).
    expect(json).not.toContain(master.datasetId)
    expect(json).not.toContain(docId)
  })

  it('AC-SHARE-04 : retirer une association conserve le document utilisé ailleurs', () => {
    let p = projetAvecTout()
    // Deux liens autorisés du même passage ? Retirer l'un conserve le passage.
    const byPassage = new Map()
    for (const l of master.evidenceLinks.filter((l) => p.allowed.evidenceLinkIds.includes(l.id) && l.passageId)) {
      byPassage.set(l.passageId, [...(byPassage.get(l.passageId) ?? []), l])
    }
    const partagé = [...byPassage.entries()].find(([, ls]) => ls.length >= 2)
    if (!partagé) return // corpus sans passage multi-liens : rien à vérifier ici
    const [passageId, liens] = partagé
    p = setLinkShared(p, master, liens[0].id, false, NOW)
    expect(p.allowed.passageIds).toContain(passageId)
  })

  it('AC-SHARE-06/07 : prévisualisation = export exact ; identifiants publics distincts par projection', () => {
    const p = projetAvecTout()
    const a = buildShareSnapshot(master, p, { referential: REF, now: NOW, randomId: seqId })
    const compteur2 = { n: 1000 }
    const seqId2 = () => `00000000-0000-4000-8000-${String(++compteur2.n).padStart(12, '0')}`
    const b = buildShareSnapshot(master, p, { referential: REF, now: NOW, randomId: seqId2 })
    expect(a.ok && b.ok).toBe(true)
    // Mêmes données et géométries (compteurs identiques), identifiants différents.
    expect(a.snapshot.observations.length).toBe(b.snapshot.observations.length)
    expect(a.snapshot.passages.length).toBe(b.snapshot.passages.length)
    expect(a.snapshot.observations[0].id).not.toBe(b.snapshot.observations[0].id) // AC-SHARE-07
  })

  it('AC-SHARE-15/13 : publier exige une prévisualisation à jour et la confirmation d’irrévocabilité', () => {
    let p = projetAvecTout()
    const res = buildShareSnapshot(master, p, { referential: REF, now: NOW })
    p = lockPreview(p, res.digests, NOW)

    // Sans confirmation → refus (AC-SHARE-13).
    expect(publishSnapshot(p, master, res.digests, { confirmedStaticExportWarning: false, now: NOW }).ok).toBe(false)

    // Politique modifiée après prévisualisation → refus (AC-SHARE-15).
    const pModifié = configureProject(p, { fields: { contexte: true } }, NOW)
    const res2 = buildShareSnapshot(master, pModifié, { referential: REF, now: NOW })
    expect(pModifié.previewLock).toBeNull()
    expect(publishSnapshot(pModifié, master, res2.digests, { confirmedStaticExportWarning: true, now: NOW }).ok).toBe(false)

    // Prévisualisation à jour + confirmation → publication immuable.
    const ok = publishSnapshot(p, master, res.digests, { confirmedStaticExportWarning: true, now: NOW })
    expect(ok.ok).toBe(true)
    expect(ok.project.state).toBe('published')
    expect(ok.project.journal.at(-1).staticWarningConfirmed).toBe(true)
    expect(shareFilename(p)).toBe('cartographie-competences-partage-r01.json') // nom neutre §19.4
  })

  it('AC-SHARE-10/17/19 + AC-THEME-06 : précision mensuelle sans aucune date journalière', () => {
    let p = projetAvecTout()
    p = configureProject(p, { temporalPrecision: 'month' }, NOW)
    const res = buildShareSnapshot(master, p, { referential: REF, now: NOW })
    expect(res.ok).toBe(true)
    expect(res.snapshot.metricDefinition.id).toBe('documented-months-v1') // AC-SHARE-17
    expect(res.snapshot.temporal.precision).toBe('month')
    expect(res.snapshot.temporal.months.map((m) => m.month)).toEqual(['2026-01', '2026-02'])
    const json = JSON.stringify(res.snapshot)
    expect(json).not.toMatch(/2026-01-04|2026-02-10/) // aucune date journalière reconstructible
    for (const occ of res.snapshot.portfolioOccurrences) {
      expect(occ.monthId).toBeTruthy() // AC-SHARE-19
      expect(occ.dayId).toBeUndefined()
    }
  })

  it('précision masquée : aucune occurrence, aucune référence temporelle, présence binaire', () => {
    let p = projetAvecTout()
    p = configureProject(p, { temporalPrecision: 'hidden' }, NOW)
    const res = buildShareSnapshot(master, p, { referential: REF, now: NOW })
    expect(res.ok).toBe(true)
    expect(res.snapshot.metricDefinition.id).toBe('public-presence-v1')
    expect(res.snapshot.temporal).toEqual({ precision: 'hidden' })
    expect(res.snapshot.portfolioOccurrences).toEqual([])
    // Aucune date de PORTFOLIO reconstructible — la date technique de
    // génération (projection.createdAt) reste, identifiable comme telle (§15.4).
    const sansGeneration = structuredClone(res.snapshot)
    sansGeneration.projection = { ...sansGeneration.projection, createdAt: null, publishedAt: null }
    sansGeneration.passages = sansGeneration.passages.map((p) => ({ ...p, verbatim: '', contexte: '' }))
    expect(JSON.stringify(sansGeneration)).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    for (const o of res.snapshot.observations) {
      expect(o.dayId).toBeUndefined()
      expect(o.monthId).toBeUndefined()
    }
  })

  it('AC-SHARE-11 : une preuve retirée ne laisse aucun message trahissant son existence', () => {
    let p = projetAvecTout()
    const passageRetiré = master.passages.find((x) => p.allowed.passageIds.includes(x.id))
    p = removeScope(p, master, { type: 'passage', passageId: passageRetiré.id }, NOW)
    const res = buildShareSnapshot(master, p, { referential: REF, now: NOW })
    expect(res.ok).toBe(true)
    const json = JSON.stringify(res.snapshot)
    expect(json).not.toMatch(/exclu|masqu|retir|hidden-count|excluded/i)
  })

  it('synthèse sans source : présente dans la liste, zéro journée au rayon (§18.4/§18.5)', () => {
    let p = newShareProject({ master, name: 'S', now: NOW })
    p = addLearnerSummary(p, { code: '1.01', text: 'Je mobilise l’analyse critique en projet.' }, NOW)
    const res = buildShareSnapshot(master, p, { referential: REF, now: NOW })
    expect(res.ok).toBe(true)
    const doc = res.snapshot.portfolioDocuments.find((d) => d.type === 'learner-summary')
    expect(doc.provenance).toBe('déclaration de l’apprenant')
    expect(res.snapshot.evidenceLinks).toEqual([]) // aucun lien contributif
    expect(res.snapshot.observations).toEqual([]) // zéro journée documentée
    expect(res.snapshot.referential.competencies.some((c) => c.code === '1.01')).toBe(true)
  })

  it('AC-DATA-07 : les champs inconnus/audits historiques restent privés (jamais exportés)', () => {
    const p = projetAvecTout()
    const res = buildShareSnapshot(master, p, { referential: REF, now: NOW })
    const json = JSON.stringify(res.snapshot)
    expect(json).not.toMatch(/auditPole|legacyAudit|legacyExtensions/)
  })
})

describe('reimport — intégrité et duplication monotone (spec §19.5)', () => {
  const master = buildMaster()

  function instantané() {
    let p = newShareProject({ master, name: 'R', now: NOW })
    p = applyScopeInclusion(p, master, planScopeInclusion(p, master, { type: 'all' }), NOW)
    const res = buildShareSnapshot(master, p, { referential: REF, now: NOW })
    return res.snapshot
  }

  it('AC-SHARE-20 : digest divergent → ni visualisation ni duplication', () => {
    const snap = instantané()
    expect(openShareSnapshot(snap).ok).toBe(true)
    const altéré = structuredClone(snap)
    altéré.observations.push({ id: 'x', competencyCode: '9.99' })
    const res = openShareSnapshot(altéré)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/intégrité/)
  })

  it('AC-SHARE-09/18 : réimport lecture seule fidèle ; duplication sans lien au master ni élargissement', () => {
    const snap = instantané()
    const vm = snapshotToViewModel(snap)
    expect(vm.observations.length).toBe(snap.observations.length)

    const { project } = duplicateAsProject(snap, { name: 'Réduit', now: NOW })
    expect(project.masterDatasetId).toBeNull() // aucun lien au master d'origine
    expect(project.allowed.evidenceLinkIds.length).toBe(snap.evidenceLinks.length) // conserver = max
    // Le nouvel univers EST l'instantané : impossible d'y élargir quoi que ce soit.
    expect(project.masterDigest).toBe(snap.integrity.contentDigest)
  })
})
