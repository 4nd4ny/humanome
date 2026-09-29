// UC-CAR-04 — Corriger une cartographie (révision) : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-04-corriger-cartographie.md
//
// Code sollicité appelé directement : le module pur de construction de
// révision (VERDICT_STATUTS, verdictFields, buildRevision), la validation
// engine avant envoi (validateDocument) et les appels API des révisions.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateDocument } from '@engine/validation.js'
import { resetApiClient } from '../../../src/api/client.js'
import {
  fetchRevisionDocument,
  fetchRevisions,
  postRevision,
} from '../../../src/views/cartographe/cartographe-api.js'
import {
  VERDICT_STATUTS,
  buildRevision,
  verdictFields,
} from '../../../src/views/cartographe/revision.js'
import jourSchema from '../../../../schemas/cartographie-jour.schema.json'
import { dayDoc, jsonResponse, mergeDoc } from '../support/car.js'

afterEach(() => resetApiClient())

const comp = (doc, code) =>
  doc.poles.flatMap((p) => p.competences).find((c) => c.code === code)

describe('UC-CAR-04 — champs contrôlés de l’éditeur de verdict', () => {
  it('UC-CAR-04-U08 — VERDICT_STATUTS : figé et identique à l’énumération du schéma cartographie-jour', () => {
    expect(VERDICT_STATUTS).toEqual(jourSchema.$defs.verdict.properties.statut.enum)
    expect(Object.isFrozen(VERDICT_STATUTS)).toBe(true)
  })

  it('UC-CAR-04-U09 — verdictFields : valeurs du verdict, replis raison/prescriptionMinimale, défauts, code inconnu', () => {
    expect(verdictFields(dayDoc(), '1.03')).toEqual({
      statut: 'renvoi au cartographe',
      confiance: 0.4,
      motif: comp(dayDoc(), '1.03').verdict.motif,
      prescription: comp(dayDoc(), '1.03').verdict.prescription,
    })
    const court = verdictFields(dayDoc(), '1.01') // court-circuit : raison / prescriptionMinimale
    expect(court.motif).toBe('aucune pièce extraite par le Greffier')
    expect(court.prescription).toBe(comp(dayDoc(), '1.01').verdict.prescriptionMinimale)

    const doc = dayDoc()
    comp(doc, '2.01').verdict = { confiance: 'haute' }
    expect(verdictFields(doc, '2.01')).toEqual({
      statut: 'renvoi au cartographe',
      confiance: 0.5,
      motif: '',
      prescription: '',
    })
    expect(verdictFields(dayDoc(), '9.99')).toBeNull()
  })
})

describe('UC-CAR-04 — buildRevision', () => {
  it('UC-CAR-04-U10 — corrections sur deux pôles (Map) : verdicts patchés, audits recalculés, entrée intacte', () => {
    const base = dayDoc()
    const revised = buildRevision(
      base,
      new Map([
        ['1.03', { statut: 'présence établie', confiance: '0.8', motif: '  Note retrouvée.  ', prescription: '   ' }],
        ['5.01', { statut: 'renvoi au cartographe', confiance: 0.5, motif: '', prescription: 'Décrire l’imprévu.' }],
      ]),
    )

    const v103 = comp(revised, '1.03').verdict
    expect(v103.statut).toBe('présence établie')
    expect(v103.confiance).toBe(0.8) // chaîne convertie en nombre
    expect(v103.motif).toBe('Note retrouvée.') // nettoyé
    expect(v103.prescription).toBe(comp(base, '1.03').verdict.prescription) // blanc = inchangé
    const v501 = comp(revised, '5.01').verdict
    expect(v501.raison).toBe('aucune pièce extraite par le Greffier') // motif vide : rien d'ajouté
    expect(v501.motif).toBeUndefined()
    expect(v501.prescription).toBe('Décrire l’imprévu.')

    expect(revised.poles[0].auditPole).toMatchObject({ presencesEtablies: 1, nonEtablies: 1, renvoisCartographe: 0 })
    expect(revised.poles[4].auditPole).toMatchObject({ presencesEtablies: 1, nonEtablies: 0, renvoisCartographe: 1 })
    expect(revised.poles[4].auditPole.competencesTotales).toBe(2) // autres compteurs conservés
    expect(comp(base, '1.03').verdict.statut).toBe('renvoi au cartographe')
    expect(validateDocument('cartographie-jour', revised).valid).toBe(true)
  })

  it('UC-CAR-04-U11 — compétence sans verdict : verdict minimal créé ; confiance non numérique, statut inconnu, code absent, document non journée refusés', () => {
    const doc = dayDoc()
    delete comp(doc, '2.01').verdict
    const revised = buildRevision(doc, { '2.01': { statut: 'présence établie', confiance: 0.7 } })
    expect(comp(revised, '2.01').verdict).toEqual({
      nombrePreuves: 0,
      nombreIndices: 0,
      statut: 'présence établie',
      confiance: 0.7,
    })

    expect(() => buildRevision(dayDoc(), { '1.03': { statut: 'présence établie', confiance: 'beaucoup' } })).toThrow(
      'Confiance hors bornes (0..1) pour 1.03',
    )
    expect(() => buildRevision(dayDoc(), { '1.03': { statut: 'présence établie', confiance: -0.1 } })).toThrow(/bornes/)
    expect(() => buildRevision(dayDoc(), { '1.03': { statut: 'peut-être', confiance: 0.5 } })).toThrow(
      'Statut de verdict invalide pour 1.03 : « peut-être »',
    )
    expect(() => buildRevision(dayDoc(), { '9.99': { statut: 'présence établie', confiance: 0.5 } })).toThrow(
      'Compétence inconnue dans le document : 9.99',
    )
    expect(() => buildRevision(mergeDoc(), {})).toThrow(/cartographies de journée/)
  })

  it('UC-CAR-04-U15 — AN14 : confiance vide, nulle ou blanche convertie en 0 sans erreur (comportement actuel)', () => {
    // Number('') === 0 : un champ « Confiance » vidé dans l'IHM enregistre 0 %.
    for (const confiance of ['', null, ' ']) {
      const revised = buildRevision(dayDoc(), { '1.03': { statut: 'présence établie', confiance } })
      expect(comp(revised, '1.03').verdict.confiance).toBe(0)
    }
  })
})

describe('UC-CAR-04 — validation engine avant envoi', () => {
  it('UC-CAR-04-U12 — validateDocument : révision valide ; document cassé -> erreurs avec chemin ; type inconnu -> exception', () => {
    expect(validateDocument('cartographie-jour', buildRevision(dayDoc(), {}))).toEqual({ valid: true, errors: [] })

    const broken = dayDoc()
    delete broken.kairos
    comp(broken, '1.03').verdict.statut = 'peut-être'
    const { valid, errors } = validateDocument('cartographie-jour', broken)
    expect(valid).toBe(false)
    expect(errors.length).toBeGreaterThan(0)
    for (const error of errors) {
      expect(error.path.startsWith('/')).toBe(true)
      expect(typeof error.message).toBe('string')
    }
    expect(() => validateDocument('cartographie-twin9', {})).toThrow(/Unsupported document kind/)
  })
})

describe('UC-CAR-04 — appels API des révisions', () => {
  it('UC-CAR-04-U13 — postRevision POST {document, note} ; fetchRevisions liste ; fetchRevisionDocument extrait le document', async () => {
    const post = vi.fn().mockResolvedValue(jsonResponse(201, { revisionId: 21 }))
    expect(await postRevision(12, { document: { kind: 'x' }, note: 'n' }, post)).toEqual({ revisionId: 21 })
    expect(post.mock.calls[0][0]).toBe('api/cartographies/12/revisions')
    expect(post.mock.calls[0][1].method).toBe('POST')
    expect(JSON.parse(post.mock.calls[0][1].body)).toEqual({ document: { kind: 'x' }, note: 'n' })

    const history = [{ id: 21, note: 'n', author: null, createdAt: '2026-07-05T10:00:00' }]
    const list = vi.fn().mockResolvedValue(jsonResponse(200, history))
    expect(await fetchRevisions(12, list)).toEqual(history)
    expect(list.mock.calls[0][0]).toBe('api/cartographies/12/revisions')

    const one = vi.fn().mockResolvedValue(jsonResponse(200, { id: 21, cartographieId: 12, document: { kind: 'y' } }))
    expect(await fetchRevisionDocument(21, one)).toEqual({ kind: 'y' })
    expect(one.mock.calls[0][0]).toBe('api/revisions/21')
    const nested = vi.fn().mockResolvedValue(jsonResponse(200, { revision: { document: { kind: 'z' } } }))
    expect(await fetchRevisionDocument(21, nested)).toEqual({ kind: 'z' })
    expect(await fetchRevisionDocument(21, vi.fn().mockResolvedValue(jsonResponse(200, {})))).toBeNull()
  })
})
