// UC-EPI-02 — Voter sur une proposition : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-02-voter-proposition.md
//
// Code sollicité appelé directement : les clients fins des deux grains
// (competence-api.js et api.js : chemins et corps des routes de vote) et le
// composant EpistemiarqueView ISOLÉ (coutures deps.fetchMeFn / deps.api) pour
// les éléments de présentation du vote : panneau de décompte, puce de
// l'atelier, messages d'issue, aperçu des changements, « Mon vote », lien Decidim.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import EpistemiarqueView from '../../../src/views/EpistemiarqueView.jsx'
import { createCompetenceApi } from '../../../src/views/epistemiarque/competence-api.js'
import { createEpistemiarqueApi } from '../../../src/views/epistemiarque/api.js'
import { competenceContent, tallyOf } from '../support/epi.js'

const member = async () => ({ user: { id: 42, displayName: 'Iris', roles: ['epistemiarque'] } })
const adminOnly = async () => ({ user: { id: 9, displayName: 'Admin', roles: ['admin'] } })

function proposal(overrides = {}) {
  const base = competenceContent('1.01', 'Pensée Critique', 'Douter méthodiquement.')
  const content = structuredClone(base)
  content.identite.definition = 'Douter, y compris de soi.'
  return {
    id: 11,
    code: '1.01',
    nom: 'Pensée Critique',
    semver: '1.1.0',
    status: 'review',
    baseVersion: '1.0.0',
    baseContent: base,
    content,
    decidimUrl: null,
    tally: tallyOf(3, [{ vote: 'pour' }]),
    votes: [{ userId: 7, displayName: 'Bao', vote: 'pour', comment: 'Bien instruit.' }],
    ...overrides,
  }
}

function renderProposal(p, fetchMeFn = member) {
  const api = { getProposal: vi.fn(async () => p), vote: vi.fn(), withdrawDraft: vi.fn(), publishDraft: vi.fn() }
  render(<EpistemiarqueView section="proposition/11" deps={{ fetchMeFn, api }} />)
  return api
}

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('UC-EPI-02 — clients des routes de vote', () => {
  it('UC-EPI-02-U08 — grain compétence : liste, détail et vote (commentaire null par défaut)', async () => {
    const apiFetchFn = vi.fn(async () => ({}))
    const api = createCompetenceApi(apiFetchFn)

    await api.listProposals()
    await api.getProposal(11)
    await api.vote(11, 'pour')
    await api.vote(11, 'contre', 'Recouvre 4.02')

    expect(apiFetchFn.mock.calls).toEqual([
      ['competences/proposals'],
      ['competences/proposals/11'],
      ['competences/proposals/11/votes', { method: 'POST', body: { vote: 'pour', comment: null } }],
      ['competences/proposals/11/votes', { method: 'POST', body: { vote: 'contre', comment: 'Recouvre 4.02' } }],
    ])
  })

  it('UC-EPI-02-U09 — grain version (api.js) : mêmes routes sous referentiel/proposals', async () => {
    const apiFetchFn = vi.fn(async () => ({}))
    const api = createEpistemiarqueApi(apiFetchFn)

    await api.listProposals()
    await api.getProposal(5)
    await api.vote(5, 'abstention', 'Trop tôt')

    expect(apiFetchFn.mock.calls).toEqual([
      ['referentiel/proposals'],
      ['referentiel/proposals/5'],
      ['referentiel/proposals/5/votes', { method: 'POST', body: { vote: 'abstention', comment: 'Trop tôt' } }],
    ])
  })
})

describe('UC-EPI-02 — présentation du vote (EpistemiarqueView isolée)', () => {
  it('UC-EPI-02-U10 — panneau de décompte : voix pour / seuil, électorat, barre de progression, compteurs', async () => {
    renderProposal(proposal())

    const panel = await screen.findByRole('region', { name: 'Décompte des voix' })
    expect(within(panel).getByRole('heading').textContent).toBe('Décompte — en cours')
    expect(panel.textContent).toContain('1 voix « pour » sur 2 requises · 3 membres épistémiarques.')
    const bar = within(panel).getByRole('progressbar')
    expect([bar.getAttribute('aria-valuenow'), bar.getAttribute('aria-valuemax')]).toEqual(['1', '2'])
    expect(bar.firstChild.style.width).toBe('50%')
    expect(within(panel).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Pour : 1',
      'Contre : 0',
      'Abstention : 0',
      'N’ont pas voté : 2',
    ])
    cleanup()

    renderProposal(proposal({ tally: tallyOf(1, []) }))
    expect((await screen.findByRole('region', { name: 'Décompte des voix' })).textContent).toContain(
      '0 voix « pour » sur 1 requises · 1 membre épistémiarque.',
    )
  })

  it.each([
    ['pending', tallyOf(3, [{ vote: 'pour' }]), 'Vote en cours : 1 voix « pour » sur 2 requises. La publication sera possible dès la majorité'],
    ['rejected', tallyOf(3, [{ vote: 'contre' }, { vote: 'contre' }]), 'Cette proposition a été rejetée par la majorité des membres.'],
    ['blocked', tallyOf(0, []), 'Aucun compte ne porte le rôle épistémiarque : personne ne peut valider.'],
  ])('UC-EPI-02-U11 — issue « %s » : message de la section Décision, pas de bouton d’entérinement', async (_, tally, message) => {
    renderProposal(proposal({ tally }))

    const decision = await screen.findByRole('region', { name: 'Décision' })
    expect(decision.textContent).toContain(message)
    expect(within(decision).queryByRole('button', { name: 'Entériner cette compétence' })).toBeNull()
  })

  it('UC-EPI-02-U12 — aperçu des changements : seuls les champs modifiés ; première version ; aucun changement textuel', async () => {
    renderProposal(proposal())
    const changes = await screen.findByRole('region', { name: 'Changements proposés' })
    expect(within(changes).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Définition : « Douter méthodiquement. » → « Douter, y compris de soi. »',
    ])
    cleanup()

    renderProposal(proposal({ baseContent: null, baseVersion: null }))
    expect((await screen.findByRole('region', { name: 'Changements proposés' })).textContent).toContain(
      'Première version publiée de cette compétence.',
    )
    expect(screen.getByText(/version en vigueur —/)).toBeDefined()
    cleanup()

    const same = proposal()
    renderProposal({ ...same, content: same.baseContent })
    expect((await screen.findByRole('region', { name: 'Changements proposés' })).textContent).toContain(
      'Aucun changement textuel majeur',
    )
  })

  it('UC-EPI-02-U13 — « Mon vote » reflète le bulletin du membre ; un admin non membre n’a pas de boutons de vote', async () => {
    renderProposal(
      proposal({
        votes: [
          { userId: 7, displayName: 'Bao', vote: 'pour', comment: 'Bien instruit.' },
          { userId: 42, displayName: 'Iris', vote: 'contre', comment: null },
        ],
      }),
    )
    const mine = await screen.findByRole('region', { name: 'Mon vote' })
    expect(within(mine).getByRole('heading').textContent).toBe('Mon vote (actuel : Contre)')
    expect(within(mine).getAllByRole('button').map((b) => b.textContent)).toEqual(['Pour', 'Contre', 'Abstention'])
    const ballots = screen.getByRole('region', { name: 'Votes exprimés' })
    expect(within(ballots).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'BaoPour« Bien instruit. »',
      'IrisContre',
    ])
    cleanup()

    renderProposal(proposal(), adminOnly)
    await screen.findByRole('region', { name: 'Décompte des voix' })
    expect(screen.queryByRole('region', { name: 'Mon vote' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pour' })).toBeNull()
    expect(screen.getByText(/seuls les membres épistémiarques y prennent part/)).toBeDefined()
  })

  it('UC-EPI-02-U16 — lien « Débattre sur Decidim » : fil joint (« (fil joint) ») ou, sans lien, espace Decidim général', async () => {
    const thread = 'https://participer.harmonia.education/processes/referentiel/f/12/debates/7'
    renderProposal(proposal({ decidimUrl: thread }))
    const link = await screen.findByRole('link', { name: 'Débattre sur Decidim' })
    expect(link.getAttribute('href')).toBe(thread)
    expect(link.parentElement.textContent).toContain('Débattre sur Decidim (fil joint).')
    cleanup()

    renderProposal(proposal({ decidimUrl: null }))
    const general = await screen.findByRole('link', { name: 'Débattre sur Decidim' })
    expect(general.getAttribute('href')).toBe('https://participer.harmonia.education')
    expect(general.parentElement.textContent).not.toContain('(fil joint)')
  })

  it('UC-EPI-02-U14 — atelier : puce de décompte « pour/seuil · issue » et lien Voter / voir (Voir le vote pour un non-membre)', async () => {
    const drafts = [
      { id: 11, code: '1.01', nom: 'Pensée Critique', semver: '1.1.0', status: 'review', tally: tallyOf(3, [{ vote: 'pour' }, { vote: 'pour' }]) },
      { id: 12, code: '2.01', nom: 'Écoute', semver: '1.1.0', status: 'review', tally: tallyOf(0, []) },
    ]
    const api = { list: vi.fn(async () => []), listDrafts: vi.fn(async () => drafts), cutRelease: vi.fn() }
    render(<EpistemiarqueView section={null} deps={{ fetchMeFn: member, api }} />)

    const vote = await screen.findByRole('region', { name: 'Propositions au vote' })
    const items = within(vote).getAllByRole('listitem')
    expect(items[0].textContent).toContain('2/2 pour · majorité atteinte')
    expect(items[1].textContent).toContain('0/— pour · aucun électeur')
    expect(within(items[0]).getByRole('link', { name: 'Voter / voir' }).getAttribute('href')).toBe('#/epistemiarque/proposition/11')
    cleanup()

    render(<EpistemiarqueView section={null} deps={{ fetchMeFn: adminOnly, api }} />)
    const forAdmin = await screen.findByRole('region', { name: 'Propositions au vote' })
    expect(within(forAdmin).getAllByRole('link', { name: 'Voir le vote' })).toHaveLength(2)
  })
})
