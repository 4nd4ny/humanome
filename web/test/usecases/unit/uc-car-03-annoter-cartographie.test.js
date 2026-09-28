// UC-CAR-03 — Annoter une cartographie : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-03-annoter-cartographie.md
//
// Code sollicité appelé directement : les appels API du fil d'annotations
// (postAnnotation, fetchAnnotations, deleteAnnotation) et la liste des
// compétences proposées au choix (listCompetences, jour ET merge).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetApiClient } from '../../../src/api/client.js'
import {
  deleteAnnotation,
  fetchAnnotations,
  postAnnotation,
} from '../../../src/views/cartographe/cartographe-api.js'
import { listCompetences } from '../../../src/views/cartographe/revision.js'
import { dayDoc, jsonResponse, mergeDoc, noContent } from '../support/car.js'

afterEach(() => resetApiClient())

describe('UC-CAR-03 — appels API du fil d’annotations', () => {
  it('UC-CAR-03-U06 — postAnnotation : POST {competenceCode, type, texte} sur la cartographie', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(201, { id: 5 }))
    const body = { competenceCode: '1.03', type: 'hallucination', texte: 'Extrait absent.' }

    expect(await postAnnotation(12, body, fetchFn)).toEqual({ id: 5 })

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('api/cartographies/12/annotations')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual(body)
  })

  it('UC-CAR-03-U07 — fetchAnnotations : liste nue (forme API) ou enveloppée ; 422 -> ApiError avec fields', async () => {
    const trail = [{ id: 5, competenceCode: '1.03', type: 'oubli', texte: 'x' }]
    const bare = vi.fn().mockResolvedValue(jsonResponse(200, trail))
    expect(await fetchAnnotations(12, bare)).toEqual(trail)
    expect(bare.mock.calls[0][0]).toBe('api/cartographies/12/annotations')
    expect(await fetchAnnotations(12, vi.fn().mockResolvedValue(jsonResponse(200, { annotations: trail })))).toEqual(trail)

    const invalid = vi.fn().mockResolvedValue(
      jsonResponse(422, { error: 'Validation échouée', fields: { texte: 'Texte requis (5000 caractères maximum)' } }),
    )
    const failure = await postAnnotation(12, { texte: '' }, invalid).catch((e) => e)
    expect(failure.status).toBe(422)
    expect(failure.message).toBe('Validation échouée')
    expect(failure.fields).toEqual({ texte: 'Texte requis (5000 caractères maximum)' })
  })

  it('UC-CAR-03-U08 — deleteAnnotation : DELETE api/annotations/<id> ; 204 -> null', async () => {
    const fetchFn = vi.fn().mockResolvedValue(noContent())

    expect(await deleteAnnotation(5, fetchFn)).toBeNull()
    expect(fetchFn.mock.calls[0][0]).toBe('api/annotations/5')
    expect(fetchFn.mock.calls[0][1].method).toBe('DELETE')
  })
})

describe('UC-CAR-03 — compétences proposées à l’annotation', () => {
  it('UC-CAR-03-U09 — listCompetences (jour) : tous les codes instruits, triés, avec leur verdict', () => {
    const list = listCompetences(dayDoc())
    expect(list.map((c) => c.code)).toEqual([
      '1.01', '1.03', '2.01', '2.02', '2.06', '3.04', '3.07',
      '4.05', '4.06', '5.01', '5.03', '6.05', '6.07', '7.01', '7.03',
    ])
    expect(list.find((c) => c.code === '1.03').verdict.statut).toBe('renvoi au cartographe')
  })

  it('UC-CAR-03-U10 — listCompetences (merge) : codes des domaines, sans verdict ; document inconnu -> []', () => {
    const list = listCompetences(mergeDoc())
    expect(list.map((c) => c.code)).toEqual([
      '1.01', '2.01', '2.06', '3.04', '3.07', '4.05', '5.01', '5.03', '6.07', '7.01',
    ])
    expect(list.every((c) => c.verdict === null)).toBe(true)
    expect(listCompetences({ kind: 'autre' })).toEqual([])
    expect(listCompetences(null)).toEqual([])
  })
})
