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

  // ANOMALIE AN1 de la fiche — test qui FIGE le comportement ACTUEL :
  // parseHash applique decodeURIComponent au segment du permalien sans
  // try/catch ; un pourcentage mal formé lève une URIError, et comme App
  // calcule sa route initiale avec parseHash (sans frontière d'erreur), toute
  // l'application plante au premier rendu. À inverser après correction.
  it('UC-VIS-02-U11 — [comportement actuel, anomalie AN1] permalien au pourcentage mal formé → parseHash lève URIError', () => {
    for (const hash of ['#/referentiel/%', '#/referentiel/100%', '#/referentiel/%E9']) {
      expect(() => parseHash(hash)).toThrow(URIError)
    }
    expect(parseHash('#/referentiel/%C3%A9')).toEqual({ name: 'referentiel', code: 'é' }) // bien encodé : lu
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

    // Sans entrée « respire » : la PREMIÈRE entrée de l'index est retenue.
    clearReferentielCache()
    const autre = { ...respire, id: 'autre', version: '1.0.0', label: 'Autre' }
    const onlyOther = vi.fn(async (url) =>
      url === 'data/referentiel/index.json'
        ? jsonResponse(200, [staticIndex[0]])
        : url === 'data/referentiel/autre-v1.0.0.json' ? jsonResponse(200, autre) : jsonResponse(404, {}),
    )
    const other = await loadPublishedReferentiel({ fetchFn: onlyOther, protocol: 'https:' })
    expect(other).toMatchObject({ origin: 'published', doc: { id: 'autre', version: '1.0.0' } })
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

  it('UC-VIS-02-U10 — file://, nom de fichier dangereux ou index au JSON invalide → repli embarqué (A6)', async () => {
    // file:// : aucune lecture tentée.
    const neverCalled = vi.fn()
    expect((await loadPublishedReferentiel({ fetchFn: neverCalled, protocol: 'file:' })).origin).toBe('bundled')
    expect(neverCalled).not.toHaveBeenCalled()

    // Garde SAFE_FILE_RE : un fichier hors du dossier n'est jamais lu.
    clearReferentielCache()
    const traversal = vi.fn(async (url) =>
      url === 'data/referentiel/index.json'
        ? jsonResponse(200, [{ ...staticIndex[1], fichier: '../../etc/passwd.json' }])
        : jsonResponse(200, v710),
    )
    expect((await loadPublishedReferentiel({ fetchFn: traversal, protocol: 'https:' })).origin).toBe('bundled')
    expect(traversal).toHaveBeenCalledTimes(1)

    // Index illisible : réponse 200 dont le JSON ne se parse pas.
    clearReferentielCache()
    const garbled = vi.fn(async () => ({ ...jsonResponse(200, null), json: async () => { throw new SyntaxError('Unexpected token') } }))
    const fallback = await loadPublishedReferentiel({ fetchFn: garbled, protocol: 'https:' })
    expect(fallback.origin).toBe('bundled')
    expect(fallback.doc.version).toBe('7.0.0')
  })
})
