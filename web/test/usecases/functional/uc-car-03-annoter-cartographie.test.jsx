// UC-CAR-03 — Annoter une cartographie : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-03-annoter-cartographie.md
//
// L'application ENTIÈRE (<App/>) est ouverte sur #/cartographe/relecture/12 ;
// le cartographe choisit une compétence, lit le fil, annote, supprime sa
// propre note. Réseau simulé (fetch global) aux formes réelles de l'API :
// détail plat, fil d'annotations en liste nue.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { resetApiClient } from '../../../src/api/client.js'
import {
  CSRF,
  detailBody,
  jsonResponse,
  mergeDoc,
  noContent,
  openCartographe,
  stubNetwork,
} from '../support/car.js'

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  window.location.hash = ''
  resetApiClient()
})

const DE_MAYA = {
  id: 4,
  competenceCode: '1.03',
  type: 'commentaire',
  texte: 'La note de synthèse existe, je peux la joindre.',
  author: { id: 1, displayName: 'Maya' },
  createdAt: '2026-07-03T10:00:00',
}
const DE_CAMILLE = {
  id: 5,
  competenceCode: '1.03',
  type: 'hallucination',
  texte: 'L’extrait cité ne figure pas dans la feuille.',
  author: { id: 9, displayName: 'Camille' },
  createdAt: '2026-07-03T11:00:00',
}

async function chooseCompetence(code) {
  fireEvent.change(await screen.findByLabelText('Compétence'), { target: { value: code } })
}

async function annotate(type, texte) {
  fireEvent.change(screen.getByLabelText('Type'), { target: { value: type } })
  fireEvent.change(screen.getByLabelText('Annotation'), { target: { value: texte } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Annoter' }))
  })
}

describe('UC-CAR-03 — le cartographe annote par compétence', () => {
  it('UC-CAR-03-F09 — nominal : choix de la compétence, fil affiché, annotation postée puis fil rechargé', async () => {
    let trail = [DE_MAYA]
    const net = stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody({ annotations: [DE_MAYA] })),
      'POST api/cartographies/12/annotations': ({ body }) => {
        trail = [...trail, { id: 6, ...body, author: { id: 9, displayName: 'Camille' }, createdAt: '2026-07-04T09:30:00' }]
        return jsonResponse(201, { id: 6 })
      },
      'GET api/cartographies/12/annotations': () => jsonResponse(200, trail),
    })
    openCartographe('relecture/12')

    // 1. La liste propose les codes du document, nommés par le référentiel.
    const select = await screen.findByLabelText('Compétence')
    const labels = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(labels).toContain('1.01 — Pensée Critique & Anti-Hallucination')
    await chooseCompetence('1.03')

    // 2. Fil de la compétence : type, texte, auteur, date.
    const panel = await screen.findByTestId('annotation-panel')
    expect(within(panel).getByRole('heading', { name: /^Annotations — 1\.03/ })).toBeTruthy()
    const list = screen.getByTestId('annotations-list')
    expect(list.textContent).toContain('Commentaire')
    expect(list.textContent).toContain('La note de synthèse existe')
    expect(list.textContent).toContain('— Maya, 03/07/2026')

    // 3. Annotation « hallucination ».
    await annotate('hallucination', '  Le résultat de la synthèse est surévalué.  ')

    const [post] = net.called('POST api/cartographies/12/annotations')
    expect(post.body).toEqual({
      competenceCode: '1.03',
      type: 'hallucination',
      texte: 'Le résultat de la synthèse est surévalué.',
    })
    expect(post.headers['X-CSRF-Token']).toBe(CSRF)

    // 5. Fil rechargé, champ vidé.
    await waitFor(() => expect(screen.getByTestId('annotations-list').textContent).toContain('surévalué'))
    expect(screen.getByTestId('annotations-list').textContent).toContain('Hallucination signalée')
    expect(screen.getByLabelText('Annotation').value).toBe('')
  })

  it('UC-CAR-03-F10 — A2 : « Supprimer » n’apparaît que sur MES annotations ; suppression puis fil rechargé', async () => {
    let trail = [DE_MAYA, DE_CAMILLE]
    const net = stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody({ annotations: trail })),
      'DELETE api/annotations/5': () => {
        trail = [DE_MAYA]
        return noContent()
      },
      'GET api/cartographies/12/annotations': () => jsonResponse(200, trail),
    })
    openCartographe('relecture/12')
    await chooseCompetence('1.03')

    const items = within(await screen.findByTestId('annotations-list')).getAllByRole('listitem')
    expect(within(items[0]).queryByRole('button', { name: 'Supprimer' })).toBeNull() // note de Maya
    await act(async () => {
      fireEvent.click(within(items[1]).getByRole('button', { name: 'Supprimer' }))
    })

    expect(net.called('DELETE api/annotations/5')[0].headers['X-CSRF-Token']).toBe(CSRF)
    await waitFor(() =>
      expect(screen.getByTestId('annotations-list').textContent).not.toContain('ne figure pas'),
    )
    expect(screen.getByTestId('annotations-list').textContent).toContain('La note de synthèse existe')
  })

  it('UC-CAR-03-F11 — A3 : parcours (merge) → annotation possible, pas de correction de verdict', async () => {
    stubNetwork({
      'GET api/cartographe/cartographies/14': jsonResponse(
        200,
        detailBody({ id: 14, type: 'merge', titre: 'Mon parcours', document: mergeDoc() }),
      ),
    })
    openCartographe('relecture/14')
    await chooseCompetence('2.06')

    expect(await screen.findByTestId('annotation-panel')).toBeTruthy()
    expect(screen.getByText('Aucune annotation sur cette compétence.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Annoter' })).toBeTruthy()
    expect(screen.queryByTestId('correction-editor')).toBeNull()
    expect(screen.getByText(/La correction par verdict s’applique aux cartographies de journée/)).toBeTruthy()
  })

  it('UC-CAR-03-F12 — E1 : texte vide (ou blanc) refusé localement, aucune requête', async () => {
    const net = stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody()),
    })
    openCartographe('relecture/12')
    await chooseCompetence('2.01')

    await annotate('commentaire', '   ')

    expect((await screen.findByRole('alert')).textContent).toBe('Le texte de l’annotation est vide.')
    expect(net.calls.some((call) => call.key.startsWith('POST'))).toBe(false)
  })

  it('UC-CAR-03-F13 — E2/E3 : refus serveur (422, 404) → message affiché, saisie conservée', async () => {
    let answer = jsonResponse(422, { error: 'Validation échouée', fields: { texte: 'Texte requis (5000 caractères maximum)' } })
    stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody()),
      'POST api/cartographies/12/annotations': () => answer,
    })
    openCartographe('relecture/12')
    await chooseCompetence('2.01')

    await annotate('commentaire', 'Texte jugé invalide par le serveur.')
    expect((await screen.findByRole('alert')).textContent).toBe('Validation échouée')
    expect(screen.getByLabelText('Annotation').value).toBe('Texte jugé invalide par le serveur.')

    // L'apprenant a entre-temps repassé la cartographie en privée.
    answer = jsonResponse(404, { error: 'Cartographie introuvable' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Annoter' }))
    })
    expect((await screen.findByRole('alert')).textContent).toBe('Cartographie introuvable')
  })

  it('UC-CAR-03-F14 — E4 : suppression refusée par le serveur → message « Annotation introuvable »', async () => {
    stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody({ annotations: [DE_CAMILLE] })),
      'DELETE api/annotations/5': jsonResponse(404, { error: 'Annotation introuvable' }),
    })
    openCartographe('relecture/12')
    await chooseCompetence('1.03')

    const supprimer = await screen.findByRole('button', { name: 'Supprimer' })
    await act(async () => {
      fireEvent.click(supprimer)
    })

    expect((await screen.findByRole('alert')).textContent).toBe('Annotation introuvable')
    expect(screen.getByTestId('annotations-list').textContent).toContain('ne figure pas')
  })
})
