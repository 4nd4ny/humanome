import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FILE_PROTOCOL_MESSAGE,
  clearDayCache,
  frenchDate,
  getDemoMerge,
  getReferentiel,
  loadDay,
  parseUserDocument,
} from './load.js'
import dayFixture from '../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import mergeFixture from '../../../schemas/fixtures/cartographie-merge-3-jours.json'

beforeEach(() => clearDayCache())
afterEach(() => vi.restoreAllMocks())

describe('données embarquées', () => {
  it('expose le document merge de démonstration (bundlé, file:// compatible)', () => {
    const merge = getDemoMerge()
    expect(merge.kind).toBe('cartographie-merge')
    expect(merge.domains).toHaveLength(7)
    expect(merge.feuilles.length).toBeGreaterThan(0)
  })

  it('expose le référentiel RESPIRE v7', () => {
    const referentiel = getReferentiel()
    expect(referentiel.kind).toBe('referentiel')
    expect(referentiel.poles).toHaveLength(7)
    expect(referentiel.competences).toHaveLength(61)
  })
})

describe('loadDay', () => {
  it('charge une journée en fetch relatif et la met en cache', async () => {
    const doc = { kind: 'cartographie-jour', date: '2026-01-01' }
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => doc })

    const first = await loadDay('2026-01-01', { fetchFn, protocol: 'https:' })
    const second = await loadDay('2026-01-01', { fetchFn, protocol: 'https:' })

    expect(first).toBe(doc)
    expect(second).toBe(doc)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledWith('data/demo/jours/2026-01-01.json')
  })

  it('refuse une date invalide sans appeler le réseau', async () => {
    const fetchFn = vi.fn()
    await expect(loadDay('../../etc/passwd', { fetchFn })).rejects.toThrow('Date invalide')
    await expect(loadDay('2026-13-45', { fetchFn })).rejects.toThrow('Date invalide')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('explique la limite file:// avec un message dédié', async () => {
    const fetchFn = vi.fn()
    await expect(loadDay('2026-01-01', { fetchFn, protocol: 'file:' })).rejects.toThrow(
      FILE_PROTOCOL_MESSAGE,
    )
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('signale proprement un 404 et une erreur réseau', async () => {
    const notFound = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    await expect(loadDay('2026-01-02', { fetchFn: notFound, protocol: 'https:' })).rejects.toThrow(
      'Aucune cartographie de journée pour le 02/01/2026.',
    )

    const network = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(loadDay('2026-01-03', { fetchFn: network, protocol: 'https:' })).rejects.toThrow(
      /Impossible de charger la journée du 03\/01\/2026/,
    )
  })

  it('ne met pas en cache un échec', async () => {
    const failing = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    await expect(loadDay('2026-01-04', { fetchFn: failing, protocol: 'https:' })).rejects.toThrow()

    const doc = { kind: 'cartographie-jour', date: '2026-01-04' }
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => doc })
    await expect(loadDay('2026-01-04', { fetchFn: ok, protocol: 'https:' })).resolves.toBe(doc)
  })
})

describe('frenchDate', () => {
  it('formate AAAA-MM-JJ en JJ/MM/AAAA', () => {
    expect(frenchDate('2025-12-22')).toBe('22/12/2025')
  })
})

describe('parseUserDocument (drag & drop)', () => {
  it('accepte un document cartographie-merge conforme (fixture P1)', () => {
    const { kind, doc } = parseUserDocument(JSON.stringify(mergeFixture))
    expect(kind).toBe('cartographie-merge')
    expect(doc.periode).toBeDefined()
  })

  it('accepte un document cartographie-jour conforme (fixture P1)', () => {
    const { kind, doc } = parseUserDocument(JSON.stringify(dayFixture))
    expect(kind).toBe('cartographie-jour')
    expect(doc.date).toBe('2026-01-05')
  })

  it('refuse un JSON invalide', () => {
    expect(() => parseUserDocument('{pas du json')).toThrow('n’est pas un JSON valide')
  })

  it('refuse un carto-data.js hérité avec un message explicite', () => {
    const legacy = 'const domainsData = [{"id": "TETE"}];\nconst kairosHtml = "<p>x</p>";'
    expect(() => parseUserDocument(legacy)).toThrow(/carto-data\.js hérité/)
    expect(() => parseUserDocument(legacy)).toThrow(/carto-data-to-merge-json\.mjs/)
  })

  it('refuse un kind inconnu ou absent', () => {
    expect(() => parseUserDocument('{"kind": "autre-chose"}')).toThrow(/kind/)
    expect(() => parseUserDocument('{"foo": 1}')).toThrow(/kind/)
    expect(() => parseUserDocument('"une chaîne"')).toThrow(/kind/)
  })

  it('liste les erreurs ajv pour un document non conforme', () => {
    const broken = { ...mergeFixture, periode: 'pas un objet' }
    let caught = null
    try {
      parseUserDocument(JSON.stringify(broken))
    } catch (error) {
      caught = error
    }
    expect(caught).not.toBeNull()
    expect(caught.message).toMatch(/non conforme au schéma « cartographie-merge »/)
    expect(Array.isArray(caught.validationErrors)).toBe(true)
    expect(caught.validationErrors.length).toBeGreaterThan(0)
    expect(caught.validationErrors[0]).toHaveProperty('path')
    expect(caught.validationErrors[0]).toHaveProperty('message')
  })
})
