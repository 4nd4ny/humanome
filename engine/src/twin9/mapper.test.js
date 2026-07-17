// Adaptateur Twin9 → cartographie-merge (D12). Fixtures : le VRAI
// carto_evolutive du vecteur figé (chain.carto_evolutive_json, généré par le
// Python de référence) + un référentiel minimal 7 pôles, et des cas construits
// pour les règles fines (renvoi daté, signal non daté ignoré, priorité
// attestation > renvoi, absence d'attestation datée → erreur).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { twin9ToMergeDocument } from './mapper.js'
import { validateDocument } from '../validation.js'

const VEC = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../test/twin9-vectors/merge.vec.json', import.meta.url)), 'utf8'),
)
const CARTO = JSON.parse(VEC.chain.carto_evolutive_json)

// Le schéma cartographie-merge exige les 7 pôles RESPIRE (domains minItems 7).
const REFERENTIEL = {
  poles: [
    { num: 1, nom: 'TÊTE — Penser & Comprendre' },
    { num: 2, nom: 'CŒUR — Relier & Naviguer' },
    { num: 3, nom: 'MAIN — Créer & Incarner' },
    { num: 4, nom: 'ÂME — Discerner & Juger' },
    { num: 5, nom: 'RACINES — Évoluer & Résister' },
    { num: 6, nom: 'CITÉ — Gouverner & S’ouvrir' },
    { num: 7, nom: 'FLAMBEAU — Transmettre & Piloter' },
  ],
  competences: [
    { code: '1.01', nom: 'Analyse critique', pole: 1 },
    { code: '1.03', nom: 'Synthèse écrite', pole: 1 },
    { code: '1.05', nom: 'Vérification des sources', pole: 1 },
    { code: '4.03', nom: 'Position éthique', pole: 4 },
    { code: '4.07', nom: 'Discernement', pole: 4 },
  ],
}

describe('twin9ToMergeDocument (vecteur réel)', () => {
  const doc = twin9ToMergeDocument(CARTO, REFERENTIEL, { generatedAt: '2026-02-01T12:00:00' })

  it('est conforme au schéma, aux pôles VIDES près (portfolio épars — le viewer les tolère)', () => {
    // Le schéma (écrit depuis le corpus complet : « 5 à 10 par pôle observées »)
    // exige ≥ 1 compétence par domaine. Le vecteur réel n'active que 2 pôles :
    // les 5 autres restent vides — SEULE déviation tolérée ici (build-tree
    // itère sur un tableau vide sans broncher). Tout autre écart est un bug.
    const res = validateDocument('cartographie-merge', doc)
    const inattendus = (res.errors ?? []).filter(
      (e) =>
        !(
          e.keyword === 'minItems' &&
          /^\/(domains|profilIpsatif)\/\d+\/competences$/.test(e.path)
        ),
    )
    expect(inattendus).toEqual([])
  })

  it('est STRICTEMENT valide quand chaque pôle a une attestation', () => {
    // Même vecteur, complété d'une attestation par pôle vide (données de test
    // marquées, pas de réutilisation du corpus) : plus aucune déviation.
    const complet = JSON.parse(JSON.stringify(CARTO))
    const refComplet = {
      poles: REFERENTIEL.poles,
      competences: [
        ...REFERENTIEL.competences,
        { code: '2.01', nom: 'Empathie (test)', pole: 2 },
        { code: '3.01', nom: 'Prototypage (test)', pole: 3 },
        { code: '4.01', nom: 'Éthique (test)', pole: 4 }, // 4.03/4.07 du vecteur = renvois seuls
        { code: '5.01', nom: 'Résilience (test)', pole: 5 },
        { code: '6.01', nom: 'Coopération (test)', pole: 6 },
        { code: '7.01', nom: 'Transmission (test)', pole: 7 },
      ],
    }
    for (const code of ['2.01', '3.01', '4.01', '5.01', '6.01', '7.01']) {
      complet.competences[code] = {
        attestations: [
          { jour_index: 0, journee: 'J01', date: '2026-01-05', confiance: 0.7, score_preuves: 1, score_indices: 1, citations: [] },
        ],
        signaux: [],
      }
      complet.histoires[code] = `Histoire de test pour ${code}.`
    }
    const docComplet = twin9ToMergeDocument(complet, refComplet, { generatedAt: '2026-02-01T12:00:00' })
    const res = validateDocument('cartographie-merge', docComplet)
    expect(res.errors ?? []).toEqual([])
    expect(res.valid).toBe(true)
  })

  it('projette les attestations datées en feuilles chronologiques', () => {
    // Les dates viennent des attestations du vecteur (aucune inventée).
    const datesAttendues = new Set()
    for (const c of Object.values(CARTO.competences)) {
      for (const a of c.attestations ?? []) if (a.date) datesAttendues.add(a.date)
    }
    expect(doc.feuilles.map((f) => f.date)).toEqual([...datesAttendues].sort())
    expect(doc.periode.nbFeuilles).toBe(datesAttendues.size)
  })

  it('reporte les scores d’attestation tels quels sur la feuille', () => {
    // 1.01 : attestation J01 (2026-01-05) avec 3 preuves / 2 indices.
    const att = CARTO.competences['1.01'].attestations[0]
    const tete = doc.domains.find((d) => d.id.startsWith('TÊTE'))
    const c101 = tete.competences.find((c) => c.code === '1.01')
    const feuille = c101.parFeuille.find((e) => e.date === att.date)
    expect(feuille.preuves).toBe(att.score_preuves)
    expect(feuille.indices).toBe(att.score_indices)
    expect(feuille.confiance).toBe(att.confiance)
  })

  it('injecte les narratifs de carto_evolutive (histoires, rapports de pôle, kairos)', () => {
    const tete = doc.domains.find((d) => d.id.startsWith('TÊTE'))
    const c101 = tete.competences.find((c) => c.code === '1.01')
    // L'histoire d'apprentissage du vecteur se retrouve dans le feedback HTML
    // (fragments sans apostrophe : le HTML échappe ' en &#x27;).
    expect(c101.feedback).toContain('de façon isolée')
    expect(tete.rapport_html).toContain('Évolution du pôle 1')
    expect(doc.narratifs.kairosHtml.length).toBeGreaterThan(0)
  })

  it('la provenance dit Twin9 et reprend le journal_id', () => {
    expect(doc.source.protocole).toContain('Twin9')
    expect(doc.source.journalId).toBe(CARTO.journal_id)
  })
})

describe('twin9ToMergeDocument (règles fines)', () => {
  const base = () => ({
    journal_id: 'test',
    histoires: {},
    rapports_poles: {},
    competences: {
      1.01: undefined, // remplacé ci-dessous (clé numérique piège évitée)
    },
  })

  it('un signal de renvoi daté produit un renvoi sur la feuille', () => {
    const carto = base()
    carto.competences = {
      '1.01': {
        attestations: [
          { jour_index: 0, date: '2026-01-05', confiance: 0.9, score_preuves: 2, score_indices: 1 },
        ],
        signaux: [],
      },
      '1.03': {
        attestations: [],
        // renvoi le même jour (jour_index 0 → 2026-01-05 via l'attestation de 1.01)
        signaux: [{ jour_index: 0, type: 'renvoi' }],
      },
    }
    const doc = twin9ToMergeDocument(carto, REFERENTIEL)
    const tete = doc.domains.find((d) => d.id.startsWith('TÊTE'))
    // 1.03 n'est jamais établie → non rendue dans domains (contrat merge),
    // mais le renvoi compte dans parFeuille du pôle.
    expect(tete.parFeuille[0].renvois).toBe(1)
    expect(tete.competences.map((c) => c.code)).toEqual(['1.01'])
  })

  it('une attestation prime sur un renvoi du même jour', () => {
    const carto = base()
    carto.competences = {
      '1.01': {
        attestations: [
          { jour_index: 0, date: '2026-01-05', confiance: 0.8, score_preuves: 1, score_indices: 0 },
        ],
        signaux: [{ jour_index: 0, type: 'renvoi' }],
      },
    }
    const doc = twin9ToMergeDocument(carto, REFERENTIEL)
    const tete = doc.domains.find((d) => d.id.startsWith('TÊTE'))
    expect(tete.parFeuille[0].etablies).toBe(1)
    expect(tete.parFeuille[0].renvois).toBe(0)
  })

  it('un signal dont le jour n’est pas datable est ignoré (jamais de date inventée)', () => {
    const carto = base()
    carto.competences = {
      '1.01': {
        attestations: [
          { jour_index: 0, date: '2026-01-05', confiance: 0.8, score_preuves: 1, score_indices: 0 },
        ],
        signaux: [],
      },
      '1.03': { attestations: [], signaux: [{ jour_index: 7, type: 'renvoi' }] }, // jour 7 inconnu
    }
    const doc = twin9ToMergeDocument(carto, REFERENTIEL)
    expect(doc.feuilles).toHaveLength(1)
    const tete = doc.domains.find((d) => d.id.startsWith('TÊTE'))
    expect(tete.parFeuille[0].renvois).toBe(0)
  })

  it('échoue en français sans attestation datée', () => {
    const carto = base()
    carto.competences = {
      '1.01': { attestations: [], signaux: [{ jour_index: 0, type: 'renvoi' }] },
    }
    expect(() => twin9ToMergeDocument(carto, REFERENTIEL)).toThrow(/aucune attestation datée/)
  })

  it('échoue en français sans référentiel utilisable', () => {
    expect(() => twin9ToMergeDocument({ competences: {} }, null)).toThrow(/referentiel/)
  })
})
