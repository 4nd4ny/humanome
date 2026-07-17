// Interface V3 — fondations : identifiants stables, adaptateurs, import,
// admissibilité et métriques (spec §6, §8–§11 ; AC-DATA-01→09, AC-DATA-05,
// AC-SYNC-05). Fixtures : un VRAI document-jour du corpus démo + cas
// construits pour les anomalies (référence pendante, numéro dupliqué, statut
// inconnu, variantes concurrentes, trace alternative par pid).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import demoDay from '../../../public/data/demo/jours/2026-01-04.json'
import referentielDoc from '../../../public/data/referentiel/respire-v7.json'
import { sha256Hex, uuidV5, legacyPassageId } from './ids.js'
import { canonicalStringify, contentDigest, verifyIntegrity } from './canonical-json.js'
import { adaptCartoPole, normalizeStatus } from './adapters.js'
import { normalizeReferential } from './referentiel.js'
import { chooseVariant, correctEffectiveDate, importJourDocuments, summarizeReport } from './import.js'
import { computeEvents } from './events.js'
import { heatmapLevel, metricForPrecision, radialProportion, sunValues, whyRadius } from './metrics.js'

const REF = normalizeReferential(referentielDoc)
const NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

describe('ids — identifiants stables (spec §9.3)', () => {
  it('uuidV5 est conforme RFC 4122 (vecteur connu) et déterministe', () => {
    // UUIDv5(DNS, "www.example.org") — vecteur public bien connu.
    expect(uuidV5(NS, ['www.example.org'])).toBe('74738ff5-5367-5958-9aee-98fffdcd1876')
    expect(uuidV5(NS, ['a', 'b'])).toBe(uuidV5(NS, ['a', 'b']))
  })

  it('la concaténation des segments est non ambiguë', () => {
    expect(uuidV5(NS, ['ab', 'c'])).not.toBe(uuidV5(NS, ['a', 'bc']))
  })

  it('AC-DATA-03 : deux pid identiques dans deux pôles → identifiants distincts', () => {
    const doc1 = uuidV5(NS, ['run', '2026-01-04', 'P1', 'digest'])
    const doc2 = uuidV5(NS, ['run', '2026-01-04', 'P2', 'digest'])
    expect(legacyPassageId(doc1, 1, 0)).not.toBe(legacyPassageId(doc2, 1, 0))
    // Et deux index différents pour un même pid dans un même pôle aussi.
    expect(legacyPassageId(doc1, 1, 0)).not.toBe(legacyPassageId(doc1, 1, 1))
  })

  it('sha256Hex correspond au vecteur FIPS « abc »', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('canonical-json — digest d’intégrité (spec §19.4)', () => {
  it('trie les clés et rejette les nombres non finis', () => {
    expect(canonicalStringify({ b: 1, a: { z: true, k: 'é' } })).toBe('{"a":{"k":"é","z":true},"b":1}')
    expect(() => canonicalStringify({ x: Infinity })).toThrow()
  })

  it('contentDigest ignore /integrity/contentDigest et verifyIntegrity détecte l’altération', () => {
    const snap = { kind: 'competency-map-share', data: [1, 2], integrity: { algorithm: 'sha-256', contentDigest: '' } }
    snap.integrity.contentDigest = contentDigest(snap)
    expect(verifyIntegrity(snap).valid).toBe(true)
    const altered = structuredClone(snap)
    altered.data.push(3)
    expect(verifyIntegrity(altered).valid).toBe(false) // AC-SHARE-20
  })
})

describe('adaptCartoPole — anomalies (spec §6.4, §8.3)', () => {
  const base = { docId: uuidV5(NS, ['doc']), dayKey: 'v1' }

  it('normalise les statuts et conserve la valeur brute', () => {
    expect(normalizeStatus('présence établie')).toBe('established')
    expect(normalizeStatus('à arbitrer par le cartographe')).toBe('needs_review')
    expect(normalizeStatus('bizarre')).toBe('unknown')
  })

  it('référence pendante → lien dangling + avertissement (AC-DATA-04 amont)', () => {
    const res = adaptCartoPole(
      {
        poleNum: '1',
        passagesSaillants: [{ pid: 1, extraitVerbatim: 'X' }],
        competences: [{
          code: '1.01', courtCircuit: false,
          pieces: [{ numero: 1, pid: 1 }],
          tracesRetenues: [{ pieceId: 99, type: 't', role: 'r' }],
          verdict: { statut: 'présence établie', confiance: 0.8 },
        }],
      },
      base,
    )
    expect(res.evidenceLinks[0].linkState).toBe('dangling')
    expect(res.report.some((r) => r.code === 'reference-pendante')).toBe(true)
  })

  it('trace alternative pointant un pid : alerte, PAS de résolution silencieuse (§6.4)', () => {
    const res = adaptCartoPole(
      {
        poleNum: '1',
        passagesSaillants: [{ pid: 7, extraitVerbatim: 'X' }],
        competences: [{
          code: '1.01', courtCircuit: false,
          pieces: [{ numero: 1, pid: 7 }],
          tracesRetenues: [{ pieceId: 7, type: 't', role: 'r' }], // 7 = pid, pas un numero
          verdict: { statut: 'présence établie', confiance: 0.8 },
        }],
      },
      base,
    )
    expect(res.evidenceLinks[0].linkState).toBe('dangling')
    expect(res.report.some((r) => r.code === 'trace-alternative-pid')).toBe(true)
  })

  it('numéro de pièce dupliqué → à arbitrer ; discordance de pôle → bloquant', () => {
    const res = adaptCartoPole(
      {
        poleNum: '2',
        passagesSaillants: [],
        competences: [{
          code: '2.01', courtCircuit: false,
          pieces: [{ numero: 1, pid: 1 }, { numero: 1, pid: 2 }],
          tracesRetenues: [],
          verdict: { statut: 'présence non établie', confiance: 1 },
        }],
      },
      { ...base, expectedPole: 1 },
    )
    expect(res.report.some((r) => r.code === 'numero-duplique' && r.severity === 'arbitrate')).toBe(true)
    expect(res.report.some((r) => r.code === 'pole-discordant' && r.severity === 'blocking')).toBe(true)
  })
})

describe('importJourDocuments — corpus réel + arbitrage (spec §8)', () => {
  const entry = (run, payload = demoDay) => ({ run, sourceDate: payload.date, payload })

  it('importe un vrai document-jour du site sans anomalie bloquante', () => {
    const { master, report } = importJourDocuments([entry('site')], { referential: REF, now: '2026-07-17T00:00:00Z' })
    expect(summarizeReport(report).blocking).toBe(0)
    expect(master.days).toHaveLength(1)
    expect(master.days[0].activeVariantId).not.toBeNull()
    expect(master.observations.length).toBeGreaterThan(50) // 61 codes attendus
    expect(master.passages.length).toBeGreaterThan(0)
    // La provenance historique reste : auditPole en legacyExtensions (§6.7).
    expect(master.legacyExtensions.some((e) => e.jsonPointer === '/auditPole')).toBe(true)
  })

  it('AC-DATA-02 : deux runs d’une même date → journée à arbitrer, zéro contribution', () => {
    const variante = structuredClone(demoDay)
    variante.poles[0].competences[0].verdict.confiance = 0.42 // divergence
    const { master, report } = importJourDocuments(
      [entry('run#1'), entry('run#2', variante)],
      { referential: REF, now: '2026-07-17T00:00:00Z' },
    )
    expect(master.days[0].activeVariantId).toBeNull()
    expect(report.some((r) => r.code === 'variantes-concurrentes' && r.severity === 'arbitrate')).toBe(true)
    const { admissible } = computeEvents(master)
    expect(admissible).toHaveLength(0) // aucune addition silencieuse

    // L'arbitrage active UNE variante ; l'autre reste conservée, inactive.
    const v1 = master.days[0].provenance[0].variantId
    const arbitré = chooseVariant(master, master.days[0].id, v1)
    expect(arbitré.days[0].activeVariantId).toBe(v1)
    const states = arbitré.sources.dayVariants.map((v) => v.state).sort()
    expect(states).toEqual(['active', 'inactive'])
    expect(computeEvents(arbitré).admissible.length).toBeGreaterThan(0)
  })

  it('AC-DATA-09 : corriger effectiveDate ou changer de variante ne modifie aucun identifiant source', () => {
    const { master } = importJourDocuments([entry('site')], { referential: REF, now: '2026-07-17T00:00:00Z' })
    const idsAvant = master.sources.sourceDocuments.map((d) => d.id).sort()
    const obsAvant = master.observations.map((o) => o.id).sort()
    const corrigé = correctEffectiveDate(master, master.days[0].id, '2026-01-05', 'saisie décalée')
    expect(corrigé.days[0].effectiveDate).toBe('2026-01-05')
    expect(corrigé.days[0].sourceDate).toBe('2026-01-04') // source immuable
    expect(corrigé.sources.sourceDocuments.map((d) => d.id).sort()).toEqual(idsAvant)
    expect(corrigé.observations.map((o) => o.id).sort()).toEqual(obsAvant)
  })

  it('une date invalide met la journée en quarantaine sans bloquer les autres (AC-DATA-01)', () => {
    const bad = { run: 'x', sourceDate: 'pas-une-date', payload: demoDay }
    const { master, report } = importJourDocuments([bad, entry('site')], { referential: REF, now: '2026-07-17T00:00:00Z' })
    expect(report.some((r) => r.code === 'date-absente' && r.severity === 'blocking')).toBe(true)
    expect(master.days).toHaveLength(1) // la journée valide est là
  })
})

describe('events + metrics — admissibilité et rayon (spec §10–11)', () => {
  const { master } = importJourDocuments(
    [{ run: 'site', sourceDate: demoDay.date, payload: demoDay }],
    { referential: REF, now: '2026-07-17T00:00:00Z' },
  )

  it('seules les présences établies AVEC preuve résolue comptent (AC-DATA-05 inclus)', () => {
    const { admissible } = computeEvents(master)
    expect(admissible.length).toBeGreaterThan(0)
    for (const e of admissible) {
      expect(e.observation.normalizedStatus).toBe('established')
      expect(e.observation.courtCircuit).toBe(false)
      expect(e.links.length).toBeGreaterThan(0)
    }
    // Aucune non-présence, même à confiance 1, n'apparaît (AC-DATA-05).
    expect(admissible.some((e) => e.observation.normalizedStatus === 'not_established')).toBe(false)
  })

  it('contester le DERNIER lien retire l’observation ; un autre lien la maintient (AC-EDIT-04)', () => {
    const clone = structuredClone(master)
    const { admissible } = computeEvents(clone)
    const cible = admissible.find((e) => e.links.length === 1) ?? admissible[0]
    for (const l of clone.evidenceLinks) {
      if (l.observationId === cible.observation.id) l.reviewState = 'contested'
    }
    const après = computeEvents(clone)
    expect(après.admissible.some((e) => e.observation.id === cible.observation.id)).toBe(false)

    // Multi-liens : en contester UN seul conserve l'observation.
    const multi = computeEvents(master).admissible.find((e) => e.links.length >= 2)
    if (multi) {
      const clone2 = structuredClone(master)
      const premier = clone2.evidenceLinks.find((l) => l.observationId === multi.observation.id && l.linkState === 'resolved')
      premier.reviewState = 'contested'
      expect(computeEvents(clone2).admissible.some((e) => e.observation.id === multi.observation.id)).toBe(true)
    }
  })

  it('rayon log2 plafonné : 0→0, référence→1, au-delà→1 avec compte exact affiché', () => {
    expect(radialProportion(0, 64)).toBe(0)
    expect(radialProportion(64, 64)).toBe(1)
    expect(radialProportion(200, 64)).toBe(1)
    expect(radialProportion(7, 64)).toBeCloseTo(3 / 6.022, 1)
  })

  it('AC-SYNC-05 : « Pourquoi ce rayon ? » compte les unités de SA métrique (jours, mois, présence)', () => {
    const dates = new Set(['2026-01-04', '2026-01-10', '2026-02-01'])
    const jours = whyRadius('1.02', dates, { metric: metricForPrecision('day') })
    expect(jours.count).toBe(3)
    expect(jours.units).toEqual(['2026-01-04', '2026-01-10', '2026-02-01'])
    const mois = whyRadius('1.02', dates, { metric: metricForPrecision('month') })
    expect(mois.count).toBe(2)
    expect(mois.units).toEqual(['2026-01', '2026-02'])
    const présence = whyRadius('1.02', dates, { metric: metricForPrecision('hidden') })
    expect(présence.count).toBe(1)
    expect(présence.units).toEqual([]) // aucun compte temporel révélé
  })

  it('la tête de lecture borne le rayon, le futur devient fantôme (§11.1)', () => {
    const days = new Map([['1.02', new Set(['2026-01-04', '2026-02-01'])]])
    const v = sunValues(days, { playheadDay: '2026-01-15' }).get('1.02')
    expect(v.count).toBe(1)
    expect(v.futureCount).toBe(1)
  })

  it('seuils de heatmap fixes (§11.3)', () => {
    expect([0, 1, 2, 3, 4, 8].map(heatmapLevel)).toEqual([0, 1, 2, 2, 3, 4])
  })
})
