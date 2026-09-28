// UC-EPI-02 — Voter sur une proposition : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-02-voter-proposition.md
//
// L'application ENTIÈRE (<App/>) est rendue comme pour un membre épistémiarque
// qui ouvre l'atelier, suit le lien d'une compétence au vote, lit le décompte
// et vote. Électorat simulé : Iris (session), Bao et Chloé — seuil 2. Seul le
// réseau est simulé, par le faux serveur à état du lot
// (web/test/usecases/support/epi.js) ; le module sunburst est le faux module.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { CSRF, createEpiBackend, jsonResponse } from '../support/epi.js'

const IRIS = { id: 42, displayName: 'Iris', roles: ['apprenant', 'epistemiarque'] }
const BAO = { id: 7, displayName: 'Bao' }
const CHLOE = { id: 8, displayName: 'Chloé' }
const PUBLISHED = [{ code: '1.01', nom: 'Pensée Critique', pole: 1, definition: 'Douter méthodiquement.' }]

function backendWithProposal({ me = IRIS, members = [IRIS, BAO, CHLOE] } = {}) {
  const backend = createEpiBackend({ me, members, published: PUBLISHED })
  const id = backend.seedProposal('1.01', '1.1.0', (content) => {
    content.identite.definition = 'Douter méthodiquement, y compris de soi.'
    return content
  })
  return { backend, id }
}

function start(backend, hash = '#/epistemiarque') {
  vi.stubGlobal('fetch', backend.fetchMock)
  window.location.hash = hash
  render(<App lib={fakeLib} />)
}

async function click(element) {
  await act(async () => {
    fireEvent.click(element)
  })
}

const tallyText = () => screen.getByRole('region', { name: 'Décompte des voix' }).textContent

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-EPI-02 — un membre vote sur une proposition de compétence', () => {
  it('UC-EPI-02-F13 — nominal : de l’atelier à la page de vote, vote « pour » commenté, majorité atteinte', async () => {
    const { backend, id } = backendWithProposal()
    backend.castBallot(id, BAO, 'pour', 'Bien instruit.')
    start(backend)

    // 1. L'atelier liste la compétence au vote avec sa puce de décompte.
    const vote = await screen.findByRole('region', { name: 'Propositions au vote' })
    expect(vote.textContent).toContain('1/2 pour · en cours')
    await click(within(vote).getByRole('link', { name: 'Voter / voir' }))

    // 2-3. La page de vote : changement proposé, décompte, votes exprimés.
    const changes = await screen.findByRole('region', { name: 'Changements proposés' })
    expect(changes.textContent).toContain('« Douter méthodiquement. » → « Douter méthodiquement, y compris de soi. »')
    expect(screen.getByText(/version en vigueur 1\.0\.0/)).toBeDefined()
    expect(tallyText()).toContain('1 voix « pour » sur 2 requises · 3 membres épistémiarques.')
    expect(screen.getByRole('region', { name: 'Votes exprimés' }).textContent).toContain('« Bien instruit. »')
    expect(screen.getByRole('heading', { name: 'Mon vote' })).toBeDefined()

    // 4-5. Commentaire puis « Pour ».
    fireEvent.change(screen.getByLabelText('Commentaire (optionnel)'), { target: { value: '  Recouvrement avec 1.02 écarté.  ' } })
    await click(screen.getByRole('button', { name: 'Pour' }))
    const [ballot] = backend.callsTo('POST', new RegExp(`proposals/${id}/votes$`))
    expect(ballot.body).toEqual({ vote: 'pour', comment: 'Recouvrement avec 1.02 écarté.' })
    expect(ballot.headers['X-CSRF-Token']).toBe(CSRF)

    // 6. Rechargement : mon vote, le décompte à jour, la décision possible.
    expect(await screen.findByRole('heading', { name: 'Mon vote (actuel : Pour)' })).toBeDefined()
    expect(tallyText()).toContain('Décompte — majorité atteinte')
    expect(tallyText()).toContain('N’ont pas voté : 1')
    const ballots = within(screen.getByRole('region', { name: 'Votes exprimés' })).getAllByRole('listitem')
    expect(ballots.map((li) => li.textContent)).toContain('IrisPour« Recouvrement avec 1.02 écarté. »')
    expect(screen.getByRole('region', { name: 'Décision' }).textContent).toContain('Majorité atteinte : la compétence peut être entérinée.')
    expect(screen.getByLabelText('Commentaire (optionnel)').value).toBe('')
  })

  it('UC-EPI-02-F14 — A1 : le membre change son vote (« Contre » sans commentaire)', async () => {
    const { backend, id } = backendWithProposal()
    start(backend, `#/epistemiarque/proposition/${id}`)
    await click(await screen.findByRole('button', { name: 'Pour' }))
    await screen.findByRole('heading', { name: 'Mon vote (actuel : Pour)' })

    await click(screen.getByRole('button', { name: 'Contre' }))

    expect(await screen.findByRole('heading', { name: 'Mon vote (actuel : Contre)' })).toBeDefined()
    expect(backend.callsTo('POST', /votes$/).map((c) => c.body)).toEqual([
      { vote: 'pour', comment: null },
      { vote: 'contre', comment: null },
    ])
    expect(within(screen.getByRole('region', { name: 'Votes exprimés' })).getAllByRole('listitem')).toHaveLength(1)
    expect(tallyText()).toContain('Contre : 1')
  })

  it('UC-EPI-02-F15 — A2 : majorité « contre » → « rejetée », pas de bouton d’entérinement', async () => {
    const { backend, id } = backendWithProposal()
    backend.castBallot(id, BAO, 'contre', 'Recouvre 4.02')
    backend.castBallot(id, CHLOE, 'contre')
    start(backend, `#/epistemiarque/proposition/${id}`)

    expect(await screen.findByRole('heading', { name: 'Décompte — rejetée' })).toBeDefined()
    const decision = screen.getByRole('region', { name: 'Décision' })
    expect(decision.textContent).toContain('Cette proposition a été rejetée par la majorité des membres.')
    expect(within(decision).queryByRole('button', { name: 'Entériner cette compétence' })).toBeNull()
  })

  it('UC-EPI-02-F16 — A4 : un administrateur non membre suit le vote sans pouvoir voter', async () => {
    const admin = { id: 1, displayName: 'Admin', roles: ['admin'] }
    const { backend, id } = backendWithProposal({ me: admin })
    start(backend)

    const vote = await screen.findByRole('region', { name: 'Propositions au vote' })
    await click(within(vote).getByRole('link', { name: 'Voir le vote' }))

    await screen.findByRole('region', { name: 'Décompte des voix' })
    expect(window.location.hash).toBe(`#/epistemiarque/proposition/${id}`)
    expect(screen.queryByRole('button', { name: 'Pour' })).toBeNull()
    expect(screen.getByText(/seuls les membres épistémiarques y prennent part/)).toBeDefined()
    expect(backend.callsTo('POST', /votes$/)).toHaveLength(0)
  })

  it('UC-EPI-02-F17 — E4 : proposition retirée entre-temps (409) → message ; proposition inconnue (404) → retour à l’atelier', async () => {
    const { backend, id } = backendWithProposal()
    start(backend, `#/epistemiarque/proposition/${id}`)
    await screen.findByRole('region', { name: 'Mon vote' })
    backend.versions.get(id).status = 'draft' // l'auteur a retiré la proposition

    await click(screen.getByRole('button', { name: 'Abstention' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Le vote n\'est ouvert que sur une proposition soumise au vote.')
    cleanup()

    start(backend, '#/epistemiarque/proposition/999')
    expect((await screen.findByRole('alert')).textContent).toBe('Proposition introuvable')
    expect(screen.getByRole('link', { name: 'Retour à l’atelier' }).getAttribute('href')).toBe('#/epistemiarque')
  })

  it('UC-EPI-02-F18 — E5 : aucun membre épistémiarque → « aucun électeur », personne ne peut valider', async () => {
    const admin = { id: 1, displayName: 'Admin', roles: ['admin'] }
    const { backend, id } = backendWithProposal({ me: admin, members: [] })
    start(backend)

    expect((await screen.findByRole('region', { name: 'Propositions au vote' })).textContent).toContain('0/— pour · aucun électeur')
    window.location.hash = `#/epistemiarque/proposition/${id}`
    expect(await screen.findByRole('heading', { name: 'Décompte — aucun électeur' })).toBeDefined()
    expect(screen.getByRole('region', { name: 'Décision' }).textContent).toContain(
      'Aucun compte ne porte le rôle épistémiarque : personne ne peut valider.',
    )
  })

  it('UC-EPI-02-F19 — E3 : bulletin refusé par le serveur (422) → message affiché, décompte inchangé', async () => {
    const { backend, id } = backendWithProposal()
    backend.override('POST', /votes$/, () =>
      jsonResponse(422, { error: 'Invalid vote "pour": expected one of pour, contre, abstention', errors: { '/vote': ['Vote invalide'] } }),
    )
    start(backend, `#/epistemiarque/proposition/${id}`)

    await click(await screen.findByRole('button', { name: 'Pour' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Invalid vote')
    expect(screen.getByRole('heading', { name: 'Mon vote' })).toBeDefined()
    expect(tallyText()).toContain('0 voix « pour » sur 2 requises')
  })
})
