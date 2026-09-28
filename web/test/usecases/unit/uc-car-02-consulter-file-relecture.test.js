// UC-CAR-02 — Consulter sa file de relecture : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-02-consulter-file-relecture.md
//
// Code sollicité appelé directement : le routeur (#/cartographe/relecture/<id>),
// les appels de lecture de l'espace cartographe (fetchQueue,
// fetchCartographie — normalisation de la forme RÉELLE, plate, de l'API) et
// le libellé des types (typeLabel).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseHash } from '../../../src/router.js'
import { resetApiClient } from '../../../src/api/client.js'
import {
  fetchCartographie,
  fetchQueue,
  typeLabel,
} from '../../../src/views/cartographe/cartographe-api.js'
import { detailBody, jsonResponse, queueEntry } from '../support/car.js'

afterEach(() => resetApiClient())

describe('UC-CAR-02 — routeur', () => {
  it('UC-CAR-02-U06 — #/cartographe/relecture/<id> et les autres sections sont transmises décodées', () => {
    expect(parseHash('#/cartographe/relecture/12')).toEqual({
      name: 'cartographe',
      section: 'relecture/12',
    })
    expect(parseHash('#/cartographe/comparer')).toEqual({ name: 'cartographe', section: 'comparer' })
    expect(parseHash('#/cartographe/relecture/a%20b').section).toBe('relecture/a b')
  })
})

describe('UC-CAR-02 — fetchQueue', () => {
  it('UC-CAR-02-U07 — GET api/cartographe/cartographies : liste nue (forme API) ou enveloppée', async () => {
    const queue = [queueEntry(), queueEntry({ id: 13, type: 'merge' })]

    const bare = vi.fn().mockResolvedValue(jsonResponse(200, queue))
    expect(await fetchQueue(bare)).toEqual(queue)
    expect(bare.mock.calls[0][0]).toBe('api/cartographe/cartographies')
    expect(bare.mock.calls[0][1].method).toBe('GET')

    const wrapped = vi.fn().mockResolvedValue(jsonResponse(200, { cartographies: queue }))
    expect(await fetchQueue(wrapped)).toEqual(queue)
    expect(await fetchQueue(vi.fn().mockResolvedValue(jsonResponse(200, {})))).toEqual([])
  })
})

describe('UC-CAR-02 — fetchCartographie', () => {
  it('UC-CAR-02-U08 — forme PLATE de l’API : cartographie = l’objet entier, listes et garantie extraites', async () => {
    const body = detailBody({
      annotations: [{ id: 1, competenceCode: '1.01', type: 'oubli', texte: 'x' }],
      revisions: [{ id: 4, note: null, author: null, createdAt: '2026-07-05T10:00:00' }],
      garantie: { par: 'Camille', date: '2026-07-10T09:00:00', revisionId: 4 },
    })
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, body))

    const loaded = await fetchCartographie(12, fetchFn)

    expect(fetchFn.mock.calls[0][0]).toBe('api/cartographe/cartographies/12')
    expect(loaded.cartographie.titre).toBe('Journée du 5 janvier')
    expect(loaded.cartographie.document.kind).toBe('cartographie-jour')
    expect(loaded.cartographie.apprenant).toEqual({ id: 1, displayName: 'Maya' })
    expect(loaded.annotations).toHaveLength(1)
    expect(loaded.revisions[0].id).toBe(4)
    expect(loaded.garantie).toEqual({ par: 'Camille', date: '2026-07-10T09:00:00', revisionId: 4 })
  })

  it('UC-CAR-02-U09 — forme enveloppée tolérée ; garantie absente -> null ; id encodé ; 404 -> ApiError', async () => {
    const wrapped = vi.fn().mockResolvedValue(
      jsonResponse(200, { cartographie: { id: 12, titre: 'T' }, annotations: [], revisions: [] }),
    )
    const loaded = await fetchCartographie('12', wrapped)
    expect(loaded.cartographie).toEqual({ id: 12, titre: 'T' })
    expect(loaded.garantie).toBeNull()

    const missing = vi
      .fn()
      .mockResolvedValue(jsonResponse(404, { error: 'Cartographie introuvable' }))
    const failure = await fetchCartographie('1 2', missing).catch((e) => e)
    expect(missing.mock.calls[0][0]).toBe('api/cartographe/cartographies/1%202')
    expect(failure.status).toBe(404)
    expect(failure.message).toBe('Cartographie introuvable')
  })
})

describe('UC-CAR-02 — typeLabel', () => {
  it('UC-CAR-02-U10 — jour -> Journée, merge -> Parcours (merge), autre type tel quel, absent -> « — »', () => {
    expect(typeLabel('jour')).toBe('Journée')
    expect(typeLabel('merge')).toBe('Parcours (merge)')
    expect(typeLabel('twin9')).toBe('twin9')
    expect(typeLabel(undefined)).toBe('—')
  })
})
