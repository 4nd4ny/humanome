// Relecture d'une cartographie (P9.2/P9.3) : en-tête + visionneuse,
// annotations par compétence, construction d'une révision VALIDÉE au schéma
// avant envoi, historique, garantie / retrait.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import RelectureSection from './RelectureSection.jsx'
import { resetApiClient } from '../../api/client.js'
import { validateDocument } from '@engine/validation.js'
import * as fakeLib from '../../test/fake-sunburst-lib.js'
import dayFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import referentielFixture from '../../../../schemas/fixtures/referentiel-respire-v7.json'

afterEach(() => {
  cleanup()
  resetApiClient()
})

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

function noContentResponse() {
  return { ok: true, status: 204, headers: { get: () => null }, json: async () => null }
}

/** Faux fetch routé par 'MÉTHODE url'. */
function routedFetch(routes) {
  return vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const handler = routes[key]
    if (!handler) throw new Error(`route non mockée : ${key}`)
    return typeof handler === 'function' ? handler(init) : handler
  })
}

const user = { id: 9, displayName: 'Carla', roles: ['cartographe'] }
const getReferentiel = async () => referentielFixture

const ANNOTATION = {
  id: 1,
  competenceCode: '1.01',
  type: 'hallucination',
  texte: 'Extrait introuvable dans le portfolio.',
  author: { id: 9, displayName: 'Carla' },
  createdAt: '2026-07-03T10:00:00Z',
}

function detailResponse(overrides = {}) {
  return jsonResponse(200, {
    cartographie: {
      id: 12,
      titre: 'Journée du 05/01/2026',
      type: 'jour',
      apprenant: { id: 1, displayName: 'Maya' },
      createdAt: '2026-07-02T10:00:00Z',
      document: JSON.parse(JSON.stringify(dayFixture)),
      ...overrides.cartographie,
    },
    annotations: overrides.annotations ?? [ANNOTATION],
    revisions: overrides.revisions ?? [],
    garantie: overrides.garantie ?? null,
  })
}

function renderSection(routes) {
  const fetchFn = routedFetch(routes)
  render(
    <RelectureSection
      id="12"
      user={user}
      lib={fakeLib}
      fetchFn={fetchFn}
      getReferentiel={getReferentiel}
    />,
  )
  return fetchFn
}

async function selectCompetence(code) {
  const select = await screen.findByLabelText('Compétence')
  fireEvent.change(select, { target: { value: code } })
}

describe('RelectureSection — en-tête et visionneuse', () => {
  it('affiche apprenant, titre, type, état non garanti, et le document (DayView)', async () => {
    renderSection({ 'GET api/cartographe/cartographies/12': detailResponse() })

    const meta = await screen.findByTestId('relecture-meta')
    expect(meta.textContent).toContain('Maya')
    expect(meta.textContent).toContain('Journée')
    expect(screen.getByRole('heading', { name: 'Journée du 05/01/2026' })).toBeTruthy()
    expect(screen.getByTestId('garantie-absente')).toBeTruthy()
    // La visionneuse DayView est montée sur le document servi.
    await screen.findByTestId('day-badge')
  })
})

describe('RelectureSection — annotations par compétence', () => {
  it('liste les annotations de la compétence choisie et poste une nouvelle annotation', async () => {
    let posted = null
    const fetchFn = renderSection({
      'GET api/cartographe/cartographies/12': detailResponse(),
      'POST api/cartographies/12/annotations': (init) => {
        posted = JSON.parse(init.body)
        return jsonResponse(201, { id: 2, ...posted })
      },
      'GET api/cartographies/12/annotations': () =>
        jsonResponse(200, {
          annotations: [
            ANNOTATION,
            {
              id: 2,
              competenceCode: '1.01',
              type: 'oubli',
              texte: 'Il manque le lavoir.',
              author: { id: 9, displayName: 'Carla' },
            },
          ],
        }),
    })

    await screen.findByTestId('relecture-meta')
    await selectCompetence('1.01')

    // Annotation existante visible, avec son type.
    const list = await screen.findByTestId('annotations-list')
    expect(list.textContent).toContain('Extrait introuvable')
    expect(list.textContent).toContain('Hallucination signalée')

    // Nouvelle annotation : type oubli + texte -> POST {competenceCode, type, texte}.
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'oubli' } })
    fireEvent.change(screen.getByLabelText('Annotation'), {
      target: { value: 'Il manque le lavoir.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Annoter' }))

    await waitFor(() =>
      expect(posted).toEqual({
        competenceCode: '1.01',
        type: 'oubli',
        texte: 'Il manque le lavoir.',
      }),
    )
    // La liste rechargée montre l'annotation ajoutée.
    await waitFor(() =>
      expect(screen.getByTestId('annotations-list').textContent).toContain('Il manque le lavoir.'),
    )
    expect(fetchFn).toHaveBeenCalled()
  })

  it('supprime une annotation dont je suis l’auteur (author.id = user.id)', async () => {
    let deleted = false
    renderSection({
      'GET api/cartographe/cartographies/12': detailResponse(),
      'DELETE api/annotations/1': () => {
        deleted = true
        return noContentResponse()
      },
      'GET api/cartographies/12/annotations': () => jsonResponse(200, { annotations: [] }),
    })

    await screen.findByTestId('relecture-meta')
    await selectCompetence('1.01')
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))

    await waitFor(() => expect(deleted).toBe(true))
    await screen.findByText('Aucune annotation sur cette compétence.')
  })
})

describe('RelectureSection — correction et révision', () => {
  it('construit une révision complète VALIDE au schéma et la poste avec la note', async () => {
    let postedRevision = null
    renderSection({
      'GET api/cartographe/cartographies/12': detailResponse(),
      'POST api/cartographies/12/revisions': (init) => {
        postedRevision = JSON.parse(init.body)
        return jsonResponse(201, { revisionId: 5 })
      },
      'GET api/cartographies/12/revisions': () =>
        jsonResponse(200, {
          revisions: [{ id: 5, note: 'Pièce vérifiée', createdAt: '2026-07-05T10:00:00Z' }],
        }),
    })

    await screen.findByTestId('relecture-meta')
    await selectCompetence('1.01')

    // Éditeur à champs contrôlés (pas de JSON brut).
    const editor = await screen.findByTestId('correction-editor')
    fireEvent.change(within(editor).getByLabelText('Statut'), {
      target: { value: 'présence établie' },
    })
    fireEvent.change(within(editor).getByLabelText('Confiance (0 à 1)'), {
      target: { value: '0.8' },
    })
    fireEvent.change(within(editor).getByLabelText('Motif'), {
      target: { value: 'Pièce retrouvée dans la feuille du 5 janvier.' },
    })
    fireEvent.click(
      within(editor).getByRole('button', { name: 'Enregistrer la correction pour 1.01' }),
    )

    // La correction apparaît dans la liste en attente.
    const pending = await screen.findByTestId('pending-corrections')
    expect(pending.textContent).toContain('1.01')
    expect(pending.textContent).toContain('présence établie')

    fireEvent.change(screen.getByLabelText('Note de révision'), {
      target: { value: 'Pièce vérifiée' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Proposer la révision' }))

    await waitFor(() => expect(postedRevision).not.toBeNull())
    expect(postedRevision.note).toBe('Pièce vérifiée')
    // Document complet, type identique, verdict corrigé, valide au schéma.
    expect(postedRevision.document.kind).toBe('cartographie-jour')
    const comp = postedRevision.document.poles[0].competences.find((c) => c.code === '1.01')
    expect(comp.verdict.statut).toBe('présence établie')
    expect(comp.verdict.confiance).toBe(0.8)
    expect(validateDocument('cartographie-jour', postedRevision.document).valid).toBe(true)

    // Historique rechargé + bascule sur la révision proposée.
    await screen.findByTestId('viewing-revision')
    expect(screen.getByTestId('revisions-list').textContent).toContain('Pièce vérifiée')
  })

  it('document révisé invalide au schéma : erreur affichée, AUCUN envoi', async () => {
    // Document de base corrompu (kairos retiré) : la révision reconstruite ne
    // passe pas le schéma -> le POST ne doit jamais partir.
    const broken = JSON.parse(JSON.stringify(dayFixture))
    delete broken.kairos
    const revisionsPost = vi.fn()
    renderSection({
      'GET api/cartographe/cartographies/12': detailResponse({
        cartographie: { document: broken },
      }),
      'POST api/cartographies/12/revisions': revisionsPost,
    })

    await screen.findByTestId('relecture-meta')
    await selectCompetence('1.01')
    const editor = await screen.findByTestId('correction-editor')
    fireEvent.click(
      within(editor).getByRole('button', { name: 'Enregistrer la correction pour 1.01' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Proposer la révision' }))

    await screen.findByText(/ne respecte pas le schéma/)
    expect(screen.getByTestId('revision-schema-errors')).toBeTruthy()
    expect(revisionsPost).not.toHaveBeenCalled()
  })
})

describe('RelectureSection — garantie', () => {
  it('valider et garantir : confirmation signée, POST, badge ; puis retrait', async () => {
    let garantiePosted = null
    let garantieDeleted = false
    renderSection({
      'GET api/cartographe/cartographies/12': detailResponse(),
      'POST api/cartographies/12/garantie': (init) => {
        garantiePosted = JSON.parse(init.body)
        return jsonResponse(201, {
          garantie: { par: 'Carla', date: '2026-07-10T09:00:00Z', revisionId: null },
        })
      },
      'DELETE api/cartographies/12/garantie': () => {
        garantieDeleted = true
        return noContentResponse()
      },
    })

    await screen.findByTestId('relecture-meta')
    fireEvent.click(screen.getByRole('button', { name: 'Valider et garantir' }))

    // Confirmation : signature au nom du cartographe, cible explicite.
    const confirm = await screen.findByTestId('garantie-confirm')
    expect(confirm.textContent).toContain('Carla')
    expect(confirm.textContent).toContain('document d’origine')

    fireEvent.click(within(confirm).getByRole('button', { name: 'Confirmer et garantir' }))
    await waitFor(() => expect(garantiePosted).toEqual({})) // pas de révision : document d'origine

    const badge = await screen.findByTestId('garantie-badge')
    expect(badge.textContent).toContain('garantie par Carla')

    // Retrait par le même cartographe.
    fireEvent.click(screen.getByRole('button', { name: 'Retirer ma garantie' }))
    await waitFor(() => expect(garantieDeleted).toBe(true))
    await screen.findByTestId('garantie-absente')
  })

  it('en consultant une révision, la garantie fige CETTE révision (revisionId)', async () => {
    let garantiePosted = null
    renderSection({
      'GET api/cartographe/cartographies/12': detailResponse({
        revisions: [
          {
            id: 5,
            note: 'Pièce vérifiée',
            createdAt: '2026-07-05T10:00:00Z',
            author: { id: 9, displayName: 'Carla' },
          },
        ],
      }),
      'GET api/revisions/5': jsonResponse(200, {
        document: JSON.parse(JSON.stringify(dayFixture)),
      }),
      'POST api/cartographies/12/garantie': (init) => {
        garantiePosted = JSON.parse(init.body)
        return jsonResponse(201, {
          garantie: { par: 'Carla', date: '2026-07-10T09:00:00Z', revisionId: 5 },
        })
      },
    })

    await screen.findByTestId('relecture-meta')

    // Historique : voir la révision.
    const historique = screen.getByTestId('revisions-list')
    expect(historique.textContent).toContain('Pièce vérifiée')
    fireEvent.click(within(historique).getByRole('button', { name: 'Voir' }))
    await screen.findByTestId('viewing-revision')

    fireEvent.click(screen.getByRole('button', { name: 'Valider et garantir' }))
    const confirm = await screen.findByTestId('garantie-confirm')
    expect(confirm.textContent).toContain('révision 5')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Confirmer et garantir' }))

    await waitFor(() => expect(garantiePosted).toEqual({ revisionId: 5 }))
    const badge = await screen.findByTestId('garantie-badge')
    expect(badge.textContent).toContain('révision 5 figée')
  })
})
