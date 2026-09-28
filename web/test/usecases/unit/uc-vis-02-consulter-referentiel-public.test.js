// UC-VIS-02 — Consulter le référentiel public : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-02-consulter-referentiel-public.md
//
// Code sollicité appelé directement : routes #/referentiel[/<code>] et
// permaliens, chargeur du référentiel publié (export STATIQUE produit par
// api/src/Referentiel/StaticExporter.php : index.json + un fichier par
// version) avec ses gardes et son repli sur le référentiel embarqué.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseHash, referentielHash } from '../../../src/router.js'
import { clearReferentielCache, loadPublishedReferentiel } from '../../../src/data/referentiel.js'
import respire from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import { jsonResponse } from '../support/vis.js'

afterEach(() => clearReferentielCache())

const v710 = { ...respire, version: '7.1.0', label: 'RESPIRE v7.1.0' }

/** Index au format EXACT de StaticExporter (plusieurs référentiels, plus récent d'abord). */
const staticIndex = [
  { referentielId: 'autre', semver: '1.0.0', label: 'Autre', publishedAt: '2026-07-20T10:00:00', fichier: 'autre-v1.0.0.json' },
  { referentielId: 'respire', semver: '7.1.0', label: 'RESPIRE v7.1.0', publishedAt: '2026-07-15T09:00:00', fichier: 'respire-v7.1.0.json' },
  { referentielId: 'respire', semver: '7.0.0', label: 'RESPIRE v7', publishedAt: '2026-07-01T09:00:00', fichier: 'respire-v7.0.0.json' },
]

describe('UC-VIS-02 — routes et permaliens', () => {
  it('UC-VIS-02-U08 — #/referentiel et #/referentiel/<code> ; referentielHash encode le code ; chemin plus profond → introuvable', () => {
    expect(parseHash('#/referentiel')).toEqual({ name: 'referentiel', code: null })
    expect(parseHash('#/referentiel/1.01')).toEqual({ name: 'referentiel', code: '1.01' })
    expect(parseHash('#/referentiel/9.99')).toEqual({ name: 'referentiel', code: '9.99' }) // validé par la vue
    expect(parseHash('#/referentiel/1.01/extra').name).toBe('not-found')
    expect(referentielHash()).toBe('#/referentiel')
    expect(referentielHash('7.03')).toBe('#/referentiel/7.03')
    expect(parseHash(referentielHash('a b'))).toEqual({ name: 'referentiel', code: 'a b' })
  })
})

describe('UC-VIS-02 — chargement de l’export statique publié', () => {
  it('UC-VIS-02-U09 — lit index.json, préfère le référentiel « respire », puis la version indiquée (plus récente)', async () => {
    const fetchFn = vi.fn(async (url) => {
      if (url === 'data/referentiel/index.json') return jsonResponse(200, staticIndex)
      if (url === 'data/referentiel/respire-v7.1.0.json') return jsonResponse(200, v710)
      return jsonResponse(404, {})
    })
    const result = await loadPublishedReferentiel({ fetchFn, protocol: 'https:' })
    expect(result.origin).toBe('published')
    expect(result.doc.version).toBe('7.1.0')
    expect(fetchFn.mock.calls.map(([u]) => u)).toEqual(['data/referentiel/index.json', 'data/referentiel/respire-v7.1.0.json'])
    // Un seul chargement par session (cache module).
    await loadPublishedReferentiel({ fetchFn, protocol: 'https:' })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['index vide', () => jsonResponse(200, []), null],
    ['index illisible (HTTP 500)', () => jsonResponse(500, {}), null],
    ['document de forme inattendue', () => jsonResponse(200, staticIndex.slice(1)), () => jsonResponse(200, { version: '7.1.0' })],
    ['version absente (404)', () => jsonResponse(200, staticIndex.slice(1)), () => jsonResponse(404, {})],
  ])('UC-VIS-02-U10 — %s → repli silencieux sur le référentiel embarqué (jamais de rejet)', async (_, index, doc) => {
    const fetchFn = vi.fn(async (url) => (url === 'data/referentiel/index.json' ? index() : doc()))
    const result = await loadPublishedReferentiel({ fetchFn, protocol: 'https:' })
    expect(result.origin).toBe('bundled')
    expect(result.doc.version).toBe('7.0.0')
    expect(result.doc.competences).toHaveLength(61)
  })
})
