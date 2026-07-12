// Construction de révision (P9) : patch de verdict à champs contrôlés,
// compteurs d'audit recalculés, document résultant VALIDE au schéma engine.
import { describe, expect, it } from 'vitest'
import { validateDocument } from '@engine/validation.js'
import dayFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import { buildRevision, listCompetences, verdictFields } from './revision.js'

const clone = () => JSON.parse(JSON.stringify(dayFixture))

describe('listCompetences', () => {
  it('liste les codes du document jour, triés, avec leur verdict', () => {
    const list = listCompetences(dayFixture)
    expect(list.length).toBeGreaterThan(0)
    expect(list.map((c) => c.code)).toEqual([...list.map((c) => c.code)].sort())
    expect(list[0].verdict).toHaveProperty('statut')
  })
})

describe('verdictFields', () => {
  it('pré-remplit motif/prescription avec les replis raison/prescriptionMinimale', () => {
    const fields = verdictFields(dayFixture, '1.01') // court-circuit dans la fixture
    expect(fields.statut).toBe('présence non établie')
    expect(fields.motif).toBe('aucune pièce extraite par le Greffier')
    expect(fields.prescription).not.toBe('')
  })
})

describe('buildRevision', () => {
  it('applique la correction, recalcule l’audit, et le document reste valide au schéma', () => {
    const base = clone()
    const revised = buildRevision(base, {
      '1.01': {
        statut: 'présence établie',
        confiance: 0.8,
        motif: 'Vérifié par le cartographe : la pièce existe dans le portfolio.',
        prescription: '',
      },
    })

    // Le document d'entrée n'est pas modifié.
    expect(base.poles[0].competences[0].verdict.statut).toBe('présence non établie')

    const comp = revised.poles[0].competences.find((c) => c.code === '1.01')
    expect(comp.verdict.statut).toBe('présence établie')
    expect(comp.verdict.confiance).toBe(0.8)
    expect(comp.verdict.motif).toContain('cartographe')
    // Champs requis du schéma préservés.
    expect(comp.verdict.nombrePreuves).toBeTypeOf('number')
    expect(comp.verdict.nombreIndices).toBeTypeOf('number')

    // Audit du pôle recalculé depuis les verdicts corrigés.
    const audit = revised.poles[0].auditPole
    const statuts = revised.poles[0].competences.map((c) => c.verdict.statut)
    expect(audit.presencesEtablies).toBe(statuts.filter((s) => s === 'présence établie').length)
    expect(audit.nonEtablies).toBe(statuts.filter((s) => s === 'présence non établie').length)

    // Validation engine : la révision passe le schéma cartographie-jour.
    expect(validateDocument('cartographie-jour', revised).valid).toBe(true)
  })

  it('refuse un code absent du document, un statut inconnu, une confiance hors bornes', () => {
    expect(() =>
      buildRevision(clone(), { '9.99': { statut: 'présence établie', confiance: 0.5 } }),
    ).toThrow(/9\.99/)
    expect(() =>
      buildRevision(clone(), { '1.01': { statut: 'peut-être', confiance: 0.5 } }),
    ).toThrow(/Statut/)
    expect(() =>
      buildRevision(clone(), { '1.01': { statut: 'présence établie', confiance: 2 } }),
    ).toThrow(/bornes/)
  })

  it('refuse un document qui n’est pas une cartographie-jour', () => {
    expect(() => buildRevision({ kind: 'cartographie-merge' }, {})).toThrow(/journée/)
  })
})
