// UC-EPI-03 — Entériner et publier : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-03-enteriner-publier.md
//
// L'application ENTIÈRE (<App/>) est rendue pour une épistémiarque dont le
// vote fait basculer une proposition à la majorité ; elle l'entérine puis
// coupe une release du référentiel depuis l'atelier. Seul le réseau est simulé
// (faux serveur à état du lot, web/test/usecases/support/epi.js) ; le module
// sunburst est le faux module de test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { CSRF, createEpiBackend, jsonResponse } from '../support/epi.js'

const IRIS = { id: 42, displayName: 'Iris', roles: ['apprenant', 'epistemiarque'] }
const BAO = { id: 7, displayName: 'Bao' }
const PUBLISHED = [
  { code: '1.01', nom: 'Pensée Critique', pole: 1, definition: 'Douter méthodiquement.' },
  { code: '2.01', nom: 'Écoute', pole: 2 },
]

function adoptedProposal() {
  const backend = createEpiBackend({ me: IRIS, members: [IRIS, BAO], published: PUBLISHED })
  const id = backend.seedProposal('1.01', '1.1.0', (content) => {
    content.identite.definition = 'Douter méthodiquement, y compris de soi.'
    return content
  })
  backend.castBallot(id, BAO, 'pour')
  return { backend, id }
}

function start(backend, hash) {
  vi.stubGlobal('fetch', backend.fetchMock)
  window.location.hash = hash
  render(<App lib={fakeLib} />)
}

async function click(element) {
  await act(async () => {
    fireEvent.click(element)
  })
}

async function cut(semver) {
  const card = await screen.findByRole('region', { name: 'Coupe de release' })
  fireEvent.change(within(card).getByLabelText('Version du référentiel (semver)'), { target: { value: semver } })
  await click(within(card).getByRole('button', { name: 'Publier le snapshot' }))
  return card
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-EPI-03 — entériner une compétence puis couper une release', () => {
  it('UC-EPI-03-F15 — nominal : le vote décisif, l’entérinement avec note, l’atelier à jour, la release 7.1.0', async () => {
    const { backend, id } = adoptedProposal()
    start(backend, `#/epistemiarque/proposition/${id}`)

    // Le vote d'Iris atteint la majorité (2 sur 2 membres).
    await click(await screen.findByRole('button', { name: 'Pour' }))
    const decision = await screen.findByRole('region', { name: 'Décision' })
    expect(await within(decision).findByText('Majorité atteinte : la compétence peut être entérinée.')).toBeDefined()

    // 1-2. Note de publication puis « Entériner cette compétence ».
    fireEvent.change(screen.getByLabelText('Note de publication'), { target: { value: 'Définition précisée (Decidim n° 7).' } })
    await click(screen.getByRole('button', { name: 'Entériner cette compétence' }))
    const [publish] = backend.callsTo('POST', new RegExp(`drafts/${id}/publish$`))
    expect(publish.body).toEqual({ releaseNote: 'Définition précisée (Decidim n° 7).' })
    expect(publish.headers['X-CSRF-Token']).toBe(CSRF)

    // 4. Retour à l'atelier : 1.01 est en vigueur en 1.1.0, plus rien au vote.
    const referentiel = await screen.findByRole('region', { name: 'Les 61 compétences' })
    expect(window.location.hash).toBe('#/epistemiarque')
    const row = within(referentiel).getByText('1.01').closest('li')
    expect(within(row).getByText('v1.1.0')).toBeDefined()
    expect(within(row).getByRole('button', { name: 'Proposer une évolution' })).toBeDefined()
    expect(screen.queryByRole('region', { name: 'Propositions au vote' })).toBeNull()

    // 5-7. Coupe de release depuis les compétences publiées.
    const card = await cut('7.1.0')
    expect(backend.callsTo('POST', /^api\/competences\/release$/)[0].body).toEqual({ semver: '7.1.0', label: 'RESPIRE v7.1.0' })
    expect(within(card).getByRole('status').textContent).toBe('Release 7.1.0 publiée (snapshot du référentiel).')
  })

  it('UC-EPI-03-F16 — A2 : sans note saisie, l’entérinement porte « Entérinée par le vote des membres. »', async () => {
    const { backend, id } = adoptedProposal()
    backend.castBallot(id, IRIS, 'pour')
    start(backend, `#/epistemiarque/proposition/${id}`)

    await click(await screen.findByRole('button', { name: 'Entériner cette compétence' }))

    expect(backend.callsTo('POST', /\/publish$/)[0].body).toEqual({ releaseNote: 'Entérinée par le vote des membres.' })
    expect(await screen.findByRole('region', { name: 'Les 61 compétences' })).toBeDefined()
    expect(backend.versions.get(id).status).toBe('published')
  })

  it('UC-EPI-03-F17 — E1 : la majorité a été perdue entre-temps (409) → message, on reste sur la proposition', async () => {
    const { backend, id } = adoptedProposal()
    backend.castBallot(id, IRIS, 'pour')
    start(backend, `#/epistemiarque/proposition/${id}`)
    const button = await screen.findByRole('button', { name: 'Entériner cette compétence' })
    backend.ballots.get(id).delete(BAO.id) // Bao a perdu le rôle : son bulletin ne compte plus

    await click(button)

    expect((await screen.findByRole('alert')).textContent).toBe('Majorité non atteinte : 1 voix « pour » sur 2 requises (2 membres).')
    expect(window.location.hash).toBe(`#/epistemiarque/proposition/${id}`)
    expect(backend.versions.get(id).status).toBe('review')
  })

  it('UC-EPI-03-F18 — E6/E7 : release refusée — corpus incomplet (422), version déjà publiée (409) — message affiché', async () => {
    const backend = createEpiBackend({ me: IRIS, published: PUBLISHED })
    let first = true
    backend.override('POST', /^api\/competences\/release$/, () => {
      if (!first) return null
      first = false
      return jsonResponse(422, { error: 'Document does not conform to the referentiel schema', errors: { '/competences': ['minItems'] } })
    })
    start(backend, '#/epistemiarque')

    let card = await cut('7.1.0')
    expect(within(card).getByRole('alert').textContent).toBe('Document does not conform to the referentiel schema')

    card = await cut('7.1.0')
    expect(within(card).getByRole('status').textContent).toBe('Release 7.1.0 publiée (snapshot du référentiel).')
    card = await cut('7.1.0')
    expect(within(card).getByRole('alert').textContent).toBe('Version 7.1.0 of referentiel "respire" already exists')
    expect(backend.releases).toHaveLength(1)
  })
})
