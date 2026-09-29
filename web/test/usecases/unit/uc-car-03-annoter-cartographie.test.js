// UC-CAR-03 — Annoter une cartographie : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-03-annoter-cartographie.md
//
// Code sollicité appelé directement : les appels API du fil d'annotations
// (postAnnotation, fetchAnnotations, deleteAnnotation) et la liste des
// compétences proposées au choix (listCompetences, jour ET merge), puis le
// panneau d'annotation de RelectureSection rendu SEUL (sans <App/>, réseau
// injecté par la couture `fetchFn`).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ApiError, resetApiClient } from '../../../src/api/client.js'
import {
  deleteAnnotation,
  fetchAnnotations,
  postAnnotation,
} from '../../../src/views/cartographe/cartographe-api.js'
import { listCompetences } from '../../../src/views/cartographe/revision.js'
import RelectureSection from '../../../src/views/cartographe/RelectureSection.jsx'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { dayDoc, detailBody, jsonResponse, mergeDoc, noContent } from '../support/car.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

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

  it('UC-CAR-03-U07 — fetchAnnotations : liste nue ou enveloppée, 404 -> ApiError ; postAnnotation : 422 -> ApiError avec fields', async () => {
    const trail = [{ id: 5, competenceCode: '1.03', type: 'oubli', texte: 'x' }]
    const bare = vi.fn().mockResolvedValue(jsonResponse(200, trail))
    expect(await fetchAnnotations(12, bare)).toEqual(trail)
    expect(bare.mock.calls[0][0]).toBe('api/cartographies/12/annotations')
    expect(await fetchAnnotations(12, vi.fn().mockResolvedValue(jsonResponse(200, { annotations: trail })))).toEqual(trail)

    const invalid = vi.fn().mockResolvedValue(
      jsonResponse(422, { error: 'Validation échouée', fields: { texte: 'Texte requis (5000 caractères maximum)' } }),
    )
    const failure = await postAnnotation(12, { texte: '' }, invalid).catch((e) => e)
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.status).toBe(422)
    expect(failure.message).toBe('Validation échouée')
    expect(failure.fields).toEqual({ texte: 'Texte requis (5000 caractères maximum)' })

    // Rechargement du fil refusé (cartographie repassée en privée).
    const gone = vi.fn().mockResolvedValue(jsonResponse(404, { error: 'Cartographie introuvable' }))
    const reload = await fetchAnnotations(12, gone).catch((e) => e)
    expect(reload).toBeInstanceOf(ApiError)
    expect(reload.status).toBe(404)
    expect(reload.message).toBe('Cartographie introuvable')
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
    // Document mélangé : pôles et compétences en ordre inverse, pour que le
    // tri soit réellement exercé (la fixture est déjà dans l'ordre des codes).
    const doc = dayDoc()
    doc.poles.reverse()
    doc.poles.forEach((pole) => pole.competences.reverse())
    expect(doc.poles[0].competences[0].code).toBe('7.03')

    const list = listCompetences(doc)
    expect(list.map((c) => c.code)).toEqual([
      '1.01', '1.03', '2.01', '2.02', '2.06', '3.04', '3.07',
      '4.05', '4.06', '5.01', '5.03', '6.05', '6.07', '7.01', '7.03',
    ])
    expect(list.find((c) => c.code === '1.03').verdict.statut).toBe('renvoi au cartographe')
  })

  it('UC-CAR-03-U10 — listCompetences (merge) : codes des domaines, triés, sans verdict ; document inconnu -> []', () => {
    const doc = mergeDoc()
    doc.domains.reverse()
    doc.domains.forEach((domain) => domain.competences.reverse())
    expect(doc.domains[0].competences[0].code).toBe('7.01')

    const list = listCompetences(doc)
    expect(list.map((c) => c.code)).toEqual([
      '1.01', '2.01', '2.06', '3.04', '3.07', '4.05', '5.01', '5.03', '6.07', '7.01',
    ])
    expect(list.every((c) => c.verdict === null)).toBe(true)
    expect(listCompetences({ kind: 'autre' })).toEqual([])
    expect(listCompetences(null)).toEqual([])
  })
})

describe('UC-CAR-03 — RelectureSection (panneau d’annotation, rendu seul)', () => {
  it('UC-CAR-03-U11 — fil filtré par code, « Supprimer » sur les seules annotations de l’utilisateur, texte blanc (Unicode) refusé sans appel', async () => {
    const annotations = [
      { id: 4, competenceCode: '1.03', type: 'commentaire', texte: 'Note de Maya.', author: { id: 1, displayName: 'Maya' }, createdAt: '2026-07-03T10:00:00' },
      { id: 5, competenceCode: '1.03', type: 'oubli', texte: 'Note de Camille.', author: { id: 9, displayName: 'Camille' }, createdAt: '2026-07-03T11:00:00' },
      { id: 6, competenceCode: '2.01', type: 'hallucination', texte: 'Sur une autre compétence.', author: { id: 9, displayName: 'Camille' }, createdAt: '2026-07-03T12:00:00' },
    ]
    const fetchFn = vi.fn(async (url, init = {}) =>
      `${init.method ?? 'GET'} ${url}` === 'GET api/cartographe/cartographies/12'
        ? jsonResponse(200, detailBody({ annotations }))
        : jsonResponse(404, { error: 'absent' }),
    )
    render(
      createElement(RelectureSection, {
        id: '12',
        user: { id: 9, displayName: 'Camille' },
        lib: fakeLib,
        fetchFn,
        getReferentiel: async () => ({ doc: { competences: [] } }),
      }),
    )

    fireEvent.change(await screen.findByLabelText('Compétence'), { target: { value: '1.03' } })

    const items = within(screen.getByTestId('annotations-list')).getAllByRole('listitem')
    expect(items.map((li) => li.textContent.includes('Sur une autre compétence'))).toEqual([false, false])
    expect(within(items[0]).queryByRole('button', { name: 'Supprimer' })).toBeNull() // Maya
    expect(within(items[1]).getByRole('button', { name: 'Supprimer' })).toBeTruthy() // Camille

    // Blancs Unicode (espace insécable, espace idéographique, tabulation) : vide.
    fireEvent.change(screen.getByLabelText('Annotation'), { target: { value: '\u00a0\u3000\t ' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Annoter' }))
    })
    expect(screen.getByRole('alert').textContent).toBe('Le texte de l’annotation est vide.')
    expect(fetchFn).toHaveBeenCalledTimes(1) // le seul chargement du détail
  })
})
