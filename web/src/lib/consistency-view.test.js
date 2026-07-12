// Modèle d'affichage du rapport de consistance (P9.4, cahier §3.3) : branché
// sur la SORTIE RÉELLE de l'engine compareRuns (pas de résultat forgé à la
// main), pour que le modèle suive le contrat de l'engine.
import { describe, expect, it } from 'vitest'
import { compareRuns } from '@engine/consistency.js'
import dayFixture from '../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import { buildConsistencyView, statutBadge, statutLabel } from './consistency-view.js'

const clone = () => JSON.parse(JSON.stringify(dayFixture))

/** Force le statut d'une compétence d'un run. */
function withStatut(doc, code, statut) {
  for (const pole of doc.poles) {
    for (const comp of pole.competences) {
      if (comp.code === code) comp.verdict.statut = statut
    }
  }
  return doc
}

describe('statutBadge / statutLabel', () => {
  it('mappe les trois statuts + le cas « absente du run »', () => {
    expect(statutBadge('présence établie')).toBe('etablie')
    expect(statutBadge('renvoi au cartographe')).toBe('renvoi')
    expect(statutBadge('présence non établie')).toBe('non-etablie')
    expect(statutBadge(null)).toBe('absente')
    expect(statutLabel(null)).toBe('non instruite')
  })
})

describe('buildConsistencyView', () => {
  it('runs identiques : accord 100 %, aucune divergente, lignes toutes stables', () => {
    const result = compareRuns([clone(), clone()])
    const view = buildConsistencyView(result)
    expect(view.nbRuns).toBe(2)
    expect(view.accordPourcent).toBe(100)
    expect(view.divergentes).toEqual([])
    expect(view.lignes.every((l) => l.stable)).toBe(true)
    expect(view.lignes.map((l) => l.code)).toEqual([...view.lignes.map((l) => l.code)].sort())
  })

  it('divergence de statut : compétence listée avec badges par statut et runs groupés', () => {
    const runA = withStatut(withStatut(clone(), '1.01', 'présence établie'), '1.03', 'présence établie')
    const runB = withStatut(withStatut(clone(), '1.01', 'présence non établie'), '1.03', 'présence établie')
    const runC = withStatut(withStatut(clone(), '1.01', 'présence établie'), '1.03', 'présence établie')

    const view = buildConsistencyView(compareRuns([runA, runB, runC]), {
      competenceNames: { '1.01': 'Pensée Critique & Anti-Hallucination' },
    })

    expect(view.accordPourcent).toBeLessThan(100)

    // 1.03 établie partout -> stable.
    expect(view.stables.map((s) => s.code)).toContain('1.03')
    expect(view.stables[0].badge).toBe('etablie')

    // 1.01 divergente : runs groupés par statut, numérotation humaine 1..N.
    const divergente = view.divergentes.find((d) => d.code === '1.01')
    expect(divergente).toBeDefined()
    expect(divergente.nom).toBe('Pensée Critique & Anti-Hallucination')
    expect(divergente.presenteDans).toEqual([1, 3])
    expect(divergente.absenteDans).toEqual([2])
    const etablie = divergente.statuts.find((s) => s.statut === 'présence établie')
    expect(etablie.runs).toEqual([1, 3])
    expect(etablie.badge).toBe('etablie')

    // Tableau détaillé : la ligne 1.01 n'est pas stable, l'écart-type est un nombre.
    const ligne = view.lignes.find((l) => l.code === '1.01')
    expect(ligne.stable).toBe(false)
    expect(ligne.statuts).toHaveLength(3)
    expect(ligne.ecartType).toBeTypeOf('number')
  })
})
