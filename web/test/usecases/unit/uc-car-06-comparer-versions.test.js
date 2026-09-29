// UC-CAR-06 — Comparer des versions de cartographie : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-06-comparer-versions.md
//
// Code sollicité appelé directement : le modèle pur du tableau des
// divergences (web/src/views/cartographe/compare-model.js) — champs comparés,
// extraction par type de document, comparaison ligne à ligne — puis
// CompareSection rendue SEULE (sans <App/>, réseau injecté par la couture
// `fetchFn`) : filtre « même apprenant » (RG1) et rendu des diagrammes.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Component, createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { resetApiClient } from '../../../src/api/client.js'
import {
  COMPARE_FIELDS,
  compareCartographies,
  extractComparable,
} from '../../../src/views/cartographe/compare-model.js'
import CompareSection from '../../../src/views/cartographe/CompareSection.jsx'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import * as sunburstLib from '../../../src/lib/sunburst/index.js'
import referentielFixture from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import { dayDoc, detailBody, jsonResponse, mergeDoc, queueEntry } from '../support/car.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

/** Les 15 codes de la journée de référence, dans l'ordre des codes. */
const DAY_CODES = [
  '1.01', '1.03', '2.01', '2.02', '2.06', '3.04', '3.07',
  '4.05', '4.06', '5.01', '5.03', '6.05', '6.07', '7.01', '7.03',
]

const dayComp = (doc, code) => doc.poles.flatMap((p) => p.competences).find((c) => c.code === code)
const mergeComp = (doc, code) => doc.domains.flatMap((d) => d.competences).find((c) => c.code === code)

describe('UC-CAR-06 — champs comparés', () => {
  it('UC-CAR-06-U01 — COMPARE_FIELDS : statut, niveau, points, confiance (ordre des colonnes), figé', () => {
    expect(COMPARE_FIELDS).toEqual(['statut', 'niveau', 'points', 'confiance'])
    expect(Object.isFrozen(COMPARE_FIELDS)).toBe(true)
  })
})

describe('UC-CAR-06 — extractComparable', () => {
  it('UC-CAR-06-U02 — journée : statut + confiance du verdict, niveau/points absents ; confiance non numérique -> null', () => {
    const doc = dayDoc()
    dayComp(doc, '2.01').verdict.confiance = 'haute'
    delete dayComp(doc, '3.04').verdict

    const map = extractComparable(doc)

    expect(map.size).toBe(15)
    expect(map.get('1.03')).toEqual({ statut: 'renvoi au cartographe', niveau: null, points: null, confiance: 0.4 })
    expect(map.get('2.01').confiance).toBeNull()
    expect(map.get('3.04')).toEqual({ statut: null, niveau: null, points: null, confiance: null })
  })

  it('UC-CAR-06-U03 — parcours (merge) : statut, niveau, points, confiance_moyenne ; valeurs non numériques -> null', () => {
    const doc = mergeDoc()
    mergeComp(doc, '2.06').niveau = 'trois'
    mergeComp(doc, '2.06').points = '1'
    mergeComp(doc, '3.04').confiance_moyenne = '0.6'

    const map = extractComparable(doc)

    expect(map.size).toBe(10)
    expect(map.get('2.01')).toEqual({ statut: 'présence établie', niveau: 5, points: 3, confiance: 0.7433 })
    expect(map.get('2.06').niveau).toBeNull()
    expect(map.get('2.06').points).toBeNull()
    expect(map.get('3.04').confiance).toBeNull()
    expect(extractComparable({ kind: 'autre' }).size).toBe(0)
    expect(extractComparable(null).size).toBe(0)
  })
})

describe('UC-CAR-06 — compareCartographies', () => {
  it('UC-CAR-06-U04 — une ligne par code (union triée), champs divergents nommés, champs absents des deux ignorés', () => {
    const b = dayDoc()
    dayComp(b, '1.03').verdict.statut = 'présence établie'
    dayComp(b, '1.03').verdict.confiance = 0.8

    const result = compareCartographies(dayDoc(), b)

    expect(result.nbCompetences).toBe(15)
    expect(result.rows.map((r) => r.code)).toEqual([...result.rows.map((r) => r.code)].sort())
    expect(result.nbDivergences).toBe(1)
    const row = result.rows.find((r) => r.code === '1.03')
    expect(row).toMatchObject({ divergent: true, champs: ['statut', 'confiance'] })
    expect(row.a.statut).toBe('renvoi au cartographe')
    expect(row.b.confiance).toBe(0.8)
    // niveau/points null des deux côtés : jamais une divergence.
    expect(result.rows.filter((r) => r.code !== '1.03').every((r) => r.champs.length === 0)).toBe(true)
  })

  it('UC-CAR-06-U05 — compétence présente d’un seul côté : ligne divergente, côté manquant entièrement vide', () => {
    const b = mergeDoc()
    b.domains[0].competences = [] // 1.01 disparaît du second parcours

    const row = compareCartographies(mergeDoc(), b).rows.find((r) => r.code === '1.01')

    expect(row.divergent).toBe(true)
    expect(row.b).toEqual({ statut: null, niveau: null, points: null, confiance: null })
    expect(row.champs).toEqual(['statut', 'niveau', 'points', 'confiance'])
  })

  it('UC-CAR-06-U06 — limite : journée contre parcours → niveau/points divergents dès que le parcours les porte (comportement actuel)', () => {
    const result = compareCartographies(dayDoc(), mergeDoc())

    const row = result.rows.find((r) => r.code === '2.01') // établie des deux côtés
    expect(row.a.statut).toBe(row.b.statut)
    expect(row.champs).toEqual(expect.arrayContaining(['niveau', 'points']))
    // Compétence absente du parcours : niveau/points null des deux côtés (RG3).
    expect(result.rows.find((r) => r.code === '1.03').champs).toEqual(['statut', 'confiance'])
    expect(result.nbCompetences).toBe(15) // union : les 10 codes du merge sont inclus dans les 15 de la journée
  })

  it('UC-CAR-06-U07 — union dans les DEUX sens et tri réel par code (documents en ordre inverse)', () => {
    // (a) Le document 1 est le plus petit : l'union doit reprendre les codes du 2.
    const reverse = compareCartographies(mergeDoc(), dayDoc())
    expect(reverse.nbCompetences).toBe(15)
    expect(reverse.rows.map((r) => r.code)).toEqual(DAY_CODES)
    expect(reverse.rows.find((r) => r.code === '7.03')).toMatchObject({ divergent: true, a: { statut: null } })

    // (b) Pôles et compétences en ordre inverse : le tri est réellement exercé.
    const shuffled = dayDoc()
    shuffled.poles.reverse()
    shuffled.poles.forEach((pole) => pole.competences.reverse())
    expect(compareCartographies(shuffled, dayDoc()).rows.map((r) => r.code)).toEqual(DAY_CODES)
    expect(compareCartographies(mergeDoc(), shuffled).rows.map((r) => r.code)).toEqual(DAY_CODES)
  })

  it('UC-CAR-06-U09 — égalité stricte, sans tolérance : 0.7433 contre 0.74 diverge alors que l’affichage arrondit les deux à 74 %', () => {
    const b = mergeDoc()
    mergeComp(b, '2.01').confiance_moyenne = 0.74

    const row = compareCartographies(mergeDoc(), b).rows.find((r) => r.code === '2.01')

    expect(row.champs).toEqual(['confiance'])
    expect([row.a.confiance, row.b.confiance].map((v) => Math.round(v * 100))).toEqual([74, 74])
  })
})

/**
 * Sonde placée AU-DESSUS du composant : elle ne reçoit une erreur de rendu
 * que si rien ne l'a interceptée (l'application n'a pas d'ErrorBoundary).
 */
class RenderCrashProbe extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    this.props.onCrash(error)
  }

  render() {
    return this.state.error
      ? createElement('p', { 'data-testid': 'crash-probe' }, String(this.state.error))
      : this.props.children
  }
}

/** Faux fetch : la file donnée, et un détail par id de `docs`. */
function compareFetch(queue, docs) {
  return vi.fn(async (url) => {
    if (url === 'api/cartographe/cartographies') return jsonResponse(200, queue)
    const id = url.match(/^api\/cartographe\/cartographies\/(\d+)$/)?.[1]
    return id && docs[id]
      ? jsonResponse(200, detailBody({ id: Number(id), document: docs[id] }))
      : jsonResponse(404, { error: 'Cartographie introuvable' })
  })
}

describe('UC-CAR-06 — CompareSection (rendu seul)', () => {
  it('UC-CAR-06-U08 — RG1 : liste 2 inactive avant choix, puis limitée au même apprenant, comparé par NOM à défaut d’id', async () => {
    const queue = [
      queueEntry({ id: 41, titre: 'Prompt v1', apprenant: { displayName: 'Maya' } }),
      queueEntry({ id: 42, titre: 'Prompt v2', apprenant: { displayName: 'Maya' } }),
      queueEntry({ id: 43, titre: 'Feuille de Noé', apprenant: { displayName: 'Noé' } }),
    ]
    render(
      createElement(CompareSection, {
        lib: fakeLib,
        fetchFn: compareFetch(queue, {}),
        getReferentiel: async () => referentielFixture,
      }),
    )

    const selectB = await screen.findByLabelText('Cartographie 2 (même apprenant)')
    expect(selectB.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Cartographie 1'), { target: { value: '41' } })

    expect(selectB.disabled).toBe(false)
    expect(within(selectB).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '— choisir —',
      'Prompt v2 — Journée du 02/07/2026',
    ])
  })

  it('UC-CAR-06-U10 — AN17 : documents arrivés avant le référentiel → le VRAI module sunburst lève une TypeError au rendu (comportement actuel)', async () => {
    // ANOMALIE AN17 (fiche) — comportement ACTUEL figé : MiniSunburst appelle
    // buildDayTree(doc, null) tant que le référentiel publié n'est pas chargé ;
    // rien ne l'intercepte dans l'application (page blanche en production).
    const crashes = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const swallow = (event) => event.preventDefault()
    window.addEventListener('error', swallow)
    try {
      const queue = [
        queueEntry({ id: 21, titre: 'Prompt v1' }),
        queueEntry({ id: 22, titre: 'Prompt v2' }),
      ]
      render(
        createElement(
          RenderCrashProbe,
          { onCrash: (error) => crashes.push(error) },
          createElement(CompareSection, {
            lib: sunburstLib,
            fetchFn: compareFetch(queue, { 21: dayDoc(), 22: dayDoc() }),
            getReferentiel: () => new Promise(() => {}), // référentiel jamais arrivé
          }),
        ),
      )
      fireEvent.change(await screen.findByLabelText('Cartographie 1'), { target: { value: '21' } })
      fireEvent.change(screen.getByLabelText('Cartographie 2 (même apprenant)'), { target: { value: '22' } })

      await waitFor(() => expect(crashes.length).toBeGreaterThan(0))
      expect(crashes[0].name).toBe('TypeError')
      expect(crashes[0].message).toContain('poles')
      expect(screen.getByTestId('crash-probe')).toBeTruthy()
      expect(screen.queryByLabelText('Cartographie 1')).toBeNull() // toute la section démontée
    } finally {
      window.removeEventListener('error', swallow)
      vi.restoreAllMocks()
    }
  })
})
