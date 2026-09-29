// UC-CAR-07 — Mesurer la consistance multi-run : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-07-mesurer-consistance.md
//
// Code sollicité appelé directement : le modèle d'affichage du rapport
// (web/src/lib/consistency-view.js), branché sur la sortie RÉELLE de l'engine
// compareRuns, et le contrôle des fichiers locaux (validateDocument).
// Les mesures elles-mêmes (compareRuns) : engine/test/usecases/unit/uc-car-07-….
import { describe, expect, it } from 'vitest'
import { compareRuns } from '@engine/consistency.js'
import { validateDocument } from '@engine/validation.js'
import {
  STATUT_BADGES,
  buildConsistencyView,
  statutBadge,
  statutLabel,
} from '../../../src/lib/consistency-view.js'
import { dayDoc, mergeDoc } from '../support/car.js'

const ETABLIE = 'présence établie'
const NON_ETABLIE = 'présence non établie'
const RENVOI = 'renvoi au cartographe'

function withStatut(doc, code, statut) {
  for (const pole of doc.poles) {
    for (const comp of pole.competences) if (comp.code === code) comp.verdict.statut = statut
  }
  return doc
}

describe('UC-CAR-07 — badges et libellés de statut', () => {
  it('UC-CAR-07-U09 — trois statuts + « non instruite » ; table figée', () => {
    expect(STATUT_BADGES).toEqual({ [ETABLIE]: 'etablie', [RENVOI]: 'renvoi', [NON_ETABLIE]: 'non-etablie' })
    expect(Object.isFrozen(STATUT_BADGES)).toBe(true)
    expect(statutBadge(null)).toBe('absente')
    expect(statutBadge('inconnu')).toBe('absente')
    expect(statutLabel(null)).toBe('non instruite')
    expect(statutLabel(RENVOI)).toBe(RENVOI)
  })
})

describe('UC-CAR-07 — buildConsistencyView', () => {
  it('UC-CAR-07-U10 — accord arrondi, stables nommées, divergentes groupées par statut (runs numérotés 1..N)', () => {
    const result = compareRuns([dayDoc(), withStatut(dayDoc(), '1.03', ETABLIE), withStatut(dayDoc(), '1.03', NON_ETABLIE)])

    const view = buildConsistencyView(result, { competenceNames: { '1.03': 'Synthèse', '2.01': 'Sollicitude' } })

    expect(view.nbRuns).toBe(3)
    expect(view.accordPourcent).toBe(96) // (1 - 2/45) × 100 = 95,56 -> 96
    expect(view.stables.map((s) => s.code)).toEqual(['2.01', '3.04', '5.03', '7.01'])
    expect(view.stables[0]).toEqual({ code: '2.01', nom: 'Sollicitude', statut: ETABLIE, badge: 'etablie' })
    expect(view.stables[1].nom).toBeNull()
    expect(view.divergentes).toEqual([
      {
        code: '1.03',
        nom: 'Synthèse',
        statuts: [
          { statut: RENVOI, label: RENVOI, badge: 'renvoi', runs: [1] },
          { statut: ETABLIE, label: ETABLIE, badge: 'etablie', runs: [2] },
          { statut: NON_ETABLIE, label: NON_ETABLIE, badge: 'non-etablie', runs: [3] },
        ],
        presenteDans: [2],
        absenteDans: [1, 3],
      },
    ])
    expect(view.lignes.map((l) => l.code)).toEqual([...view.lignes.map((l) => l.code)].sort())
    expect(view.lignes.filter((l) => !l.stable).map((l) => l.code)).toEqual(['1.03'])

    // Tri propre à la vue : un résultat dont les clés arrivent dans le
    // désordre (compareRuns, lui, les trie déjà) ressort trié.
    const unsorted = buildConsistencyView({
      nbRuns: 2,
      competencesCommunes: [],
      competencesDivergentes: [],
      distanceStructurelle: 0,
      parCompetence: {
        '7.01': { statuts: [ETABLIE, ETABLIE], confiances: [1, 1], ecartType: 0 },
        '1.03': { statuts: [ETABLIE, ETABLIE], confiances: [1, 1], ecartType: 0 },
        '4.05': { statuts: [ETABLIE, ETABLIE], confiances: [1, 1], ecartType: 0 },
      },
    })
    expect(unsorted.lignes.map((l) => l.code)).toEqual(['1.03', '4.05', '7.01'])
  })

  it('UC-CAR-07-U11 — run où la compétence est absente : groupe « non instruite » ; ligne marquée instable', () => {
    const b = dayDoc()
    for (const pole of b.poles) pole.competences = pole.competences.filter((c) => c.code !== '2.01')

    const view = buildConsistencyView(compareRuns([dayDoc(), b, dayDoc()]))

    const divergente = view.divergentes.find((d) => d.code === '2.01')
    expect(divergente.statuts).toEqual([
      { statut: ETABLIE, label: ETABLIE, badge: 'etablie', runs: [1, 3] },
      { statut: null, label: 'non instruite', badge: 'absente', runs: [2] },
    ])
    expect(view.lignes.find((l) => l.code === '2.01').confiances).toEqual([0.7, null, 0.7])
  })

  it('UC-CAR-07-U12 — limites figées : « non établie » vs « renvoi » hors divergentes ; absente vs non établie instable à 100 %', () => {
    const renvoi = buildConsistencyView(compareRuns([dayDoc(), withStatut(dayDoc(), '1.01', RENVOI)]))
    expect(renvoi.accordPourcent).toBe(97)
    expect(renvoi.divergentes).toEqual([])
    expect(renvoi.lignes.find((l) => l.code === '1.01').stable).toBe(false)

    const b = dayDoc()
    for (const pole of b.poles) pole.competences = pole.competences.filter((c) => c.code !== '7.03')
    const absente = buildConsistencyView(compareRuns([dayDoc(), b]))
    expect(absente.accordPourcent).toBe(100) // absente ≡ non établie pour la distance…
    expect(absente.lignes.find((l) => l.code === '7.03').stable).toBe(false) // … mais pas pour la stabilité
  })
})

describe('UC-CAR-07 — contrôle des fichiers locaux', () => {
  it('UC-CAR-07-U13 — validateDocument(cartographie-jour) : journée réelle acceptée, merge ou autre refusés', () => {
    expect(validateDocument('cartographie-jour', dayDoc()).valid).toBe(true)
    expect(validateDocument('cartographie-jour', mergeDoc()).valid).toBe(false)
    expect(validateDocument('cartographie-jour', { kind: 'autre' }).valid).toBe(false)
  })
})
