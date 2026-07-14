import { describe, expect, it } from 'vitest'
import {
  PASSES_TAGGERS,
  calculerDevis,
  etapeToEtage,
  journeesDepuisCarto,
  rosterFromModele,
} from './run-helpers.js'

describe('rosterFromModele', () => {
  it('dérive un roster mono-famille Anthropic avec passes', () => {
    const r = rosterFromModele('claude-x')
    expect(r.modeles).toHaveLength(1)
    expect(r.modeles[0]).toMatchObject({
      name: 'claude-x',
      model: 'claude-x',
      family: 'anthropic',
      enabled: true,
      passes: PASSES_TAGGERS,
    })
  })

  it('accepte un nombre de passes explicite', () => {
    expect(rosterFromModele('m', 5).modeles[0].passes).toBe(5)
  })
})

describe('etapeToEtage', () => {
  it('replie chaque étape sur son étage de coût', () => {
    expect(etapeToEtage('tagging')).toBe('taggers')
    expect(etapeToEtage('premiere-impression')).toBe('rapide')
    expect(etapeToEtage('instruction-rapide')).toBe('rapide')
    expect(etapeToEtage('tribunal')).toBe('tribunal')
    expect(etapeToEtage('second-ressort')).toBe('tribunal')
    expect(etapeToEtage('scan-global')).toBe('tribunal')
    expect(etapeToEtage('relectures')).toBe('tribunal')
    expect(etapeToEtage('autre')).toBe('rapide')
  })
})

describe('calculerDevis', () => {
  const parEtape = {
    tagging: { appels: 9 },
    'instruction-rapide': { appels: 3 },
    'premiere-impression': { appels: 1 },
    tribunal: { appels: 17 },
    relectures: { appels: 5 },
  }

  it('compte les appels exacts et une fourchette croissante', () => {
    const d = calculerDevis(parEtape, [3.3, 16.5])
    expect(d.appels).toBe(35)
    expect(d.hautMicrousd).toBeGreaterThan(d.basMicrousd)
    expect(d.basMicrousd).toBeGreaterThan(0)
  })

  it('agrège par étage (taggers/rapide/tribunal)', () => {
    const d = calculerDevis(parEtape, [3.3, 16.5])
    const parEtage = Object.fromEntries(d.etages.map((e) => [e.etage, e.appels]))
    expect(parEtage).toEqual({ taggers: 9, rapide: 4, tribunal: 22 })
  })

  it('ignore les étapes sans appel et un tarif nul donne un coût nul', () => {
    const d = calculerDevis({ tagging: { appels: 0 }, tribunal: { appels: 2 } }, [0, 0])
    expect(d.appels).toBe(2)
    expect(d.basMicrousd).toBe(0)
    expect(d.hautMicrousd).toBe(0)
  })
})

describe('journeesDepuisCarto', () => {
  const carto = {
    competences: {
      '1.01': {
        attestations: [
          { jour_index: 0, journee: '2026-03-02', date: '2026-03-02' },
          { jour_index: 2, journee: '2026-03-09', date: '2026-03-09' },
        ],
        signaux: [],
      },
      '1.05': {
        attestations: [],
        signaux: [{ jour_index: 1, journee: '2026-03-05', type: 'renvoi' }],
      },
    },
  }

  it('reconstruit la liste chronologique des journées avec statuts', () => {
    const j = journeesDepuisCarto(carto)
    expect(j.map((x) => x.jour_index)).toEqual([0, 1, 2])
    expect(j[0]).toMatchObject({ date: '2026-03-02', etablies: ['1.01'], renvois: [] })
    expect(j[1]).toMatchObject({ jour_index: 1, etablies: [], renvois: ['1.05'] })
    expect(j[2]).toMatchObject({ date: '2026-03-09', etablies: ['1.01'] })
  })

  it('renvoie une liste vide si aucune compétence', () => {
    expect(journeesDepuisCarto({ competences: {} })).toEqual([])
    expect(journeesDepuisCarto({})).toEqual([])
  })
})
