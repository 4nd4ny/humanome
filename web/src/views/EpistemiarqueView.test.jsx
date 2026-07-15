// Atelier épistémiarque au grain COMPÉTENCE ATOMIQUE : garde de rôle, atelier
// (61 compétences par pôle + brouillons + votes), éditeur riche d'une compétence
// avec concurrence optimiste (If-Match), page de vote par compétence, coupe de release.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import EpistemiarqueView from './EpistemiarqueView.jsx'
import { ApiError, ApiUnavailableError } from '../api/client.js'

const anonyme = async () => ({ user: null })
const apprenant = async () => ({ user: { id: 1, roles: ['apprenant'], displayName: 'Maya' } })
const epistemiarque = async () => ({
  user: { id: 42, roles: ['apprenant', 'epistemiarque'], displayName: 'Épi' },
})

function content(code = '1.01', nom = 'Pensée Critique') {
  return {
    identite: {
      code,
      nom,
      definition: 'Douter méthodiquement.',
      marqueurs_fondamentaux: ['Validation croisée'],
      argument_employeur: 'Protège des hallucinations.',
    },
    protocole: { passe_1: { signaux_declencheurs: ['j’ai vérifié'], token_budget: 40 } },
  }
}

function fakeApi(overrides = {}) {
  return {
    list: vi.fn(async () => [
      { id: 1, code: '1.01', nom: 'Pensée Critique', pole: 1, semver: '1.0.0', status: 'published' },
      { id: 2, code: '2.01', nom: 'Écoute', pole: 2, semver: '1.0.0', status: 'published' },
      { id: 3, code: '3.01', nom: 'Créativité', pole: 3, semver: '1.0.0', status: 'published' },
    ]),
    listDrafts: vi.fn(async () => [
      { id: 10, code: '2.01', nom: 'Écoute', semver: '1.1.0', status: 'draft' },
      {
        id: 11,
        code: '1.01',
        nom: 'Pensée Critique',
        semver: '1.1.0',
        status: 'review',
        tally: { pour: 1, contre: 0, abstention: 0, notVoted: 2, electorateSize: 3, threshold: 2, outcome: 'pending', reached: false },
      },
    ]),
    getDraft: vi.fn(async () => ({
      id: 10,
      code: '2.01',
      nom: 'Écoute',
      semver: '1.1.0',
      status: 'draft',
      contentHash: 'basehash000',
      content: content('2.01', 'Écoute'),
    })),
    createDraft: vi.fn(async () => ({ id: 99, code: '1.01', semver: '1.1.0', status: 'draft', content: content() })),
    saveDraft: vi.fn(async (id, c) => ({ id, status: 'draft', content: c, contentHash: 'newhash111' })),
    submitDraft: vi.fn(async () => ({ id: 10, status: 'review' })),
    withdrawDraft: vi.fn(async () => ({ id: 11, status: 'draft' })),
    publishDraft: vi.fn(async () => ({ id: 11, status: 'published' })),
    listProposals: vi.fn(async () => []),
    getProposal: vi.fn(async () => ({
      id: 11,
      code: '1.01',
      nom: 'Pensée Critique',
      semver: '1.1.0',
      status: 'review',
      baseVersion: '1.0.0',
      baseContent: content(),
      content: { ...content(), identite: { ...content().identite, definition: 'Douter, et se douter de soi.' } },
      tally: { pour: 1, contre: 0, abstention: 0, notVoted: 2, electorateSize: 3, threshold: 2, outcome: 'pending', reached: false },
      votes: [{ userId: 7, displayName: 'Alix', vote: 'pour', comment: 'ok' }],
    })),
    vote: vi.fn(async () => ({ tally: { pour: 2, contre: 0, abstention: 0, notVoted: 1, electorateSize: 3, threshold: 2, outcome: 'adopted', reached: true } })),
    cutRelease: vi.fn(async () => ({ status: 'imported', semver: '7.2.0' })),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('EpistemiarqueView — garde de rôle', () => {
  it('anonyme : invite à se connecter', async () => {
    render(<EpistemiarqueView section={null} deps={{ fetchMeFn: anonyme }} />)
    await screen.findByTestId('epi-anonyme')
  })
  it('sans rôle épistémiarque : refus', async () => {
    render(<EpistemiarqueView section={null} deps={{ fetchMeFn: apprenant, api: fakeApi() }} />)
    await screen.findByTestId('epi-sans-role')
  })
  it('API indisponible : message copie statique', async () => {
    render(<EpistemiarqueView section={null} deps={{ fetchMeFn: async () => { throw new ApiUnavailableError() } }} />)
    await screen.findByTestId('epi-indisponible')
  })
})

describe('EpistemiarqueView — atelier (grain compétence)', () => {
  it('liste les compétences par pôle, les brouillons et les votes', async () => {
    render(<EpistemiarqueView section={null} deps={{ fetchMeFn: epistemiarque, api: fakeApi() }} />)
    await screen.findByText('Le référentiel (3 compétences)')
    expect(screen.getByText(/TÊTE/)).toBeTruthy()
    expect(screen.getByText(/CŒUR/)).toBeTruthy()
    // Compétence 1.01 est au vote -> apparaît dans « Compétences au vote » + chip.
    expect(screen.getByText(/1\/2 pour/)).toBeTruthy()
    // 2.01 a un brouillon -> lien Éditer.
    expect(screen.getByRole('link', { name: 'Éditer' }).getAttribute('href')).toBe('#/epistemiarque/editer/10')
  })

  it('propose une évolution d’une compétence et navigue vers l’éditeur', async () => {
    const api = fakeApi()
    render(<EpistemiarqueView section={null} deps={{ fetchMeFn: epistemiarque, api }} />)
    await screen.findByText('Le référentiel (3 compétences)')
    // 1.01 (review) et 2.01 (draft) sont déjà en cours -> 3.01 est proposable.
    fireEvent.click(screen.getByRole('button', { name: 'Proposer une évolution' }))
    await waitFor(() => expect(api.createDraft).toHaveBeenCalledWith('3.01', '1.1.0'))
    await waitFor(() => expect(window.location.hash).toBe('#/epistemiarque/editer/99'))
  })

  it('coupe une release depuis les compétences publiées', async () => {
    const api = fakeApi()
    render(<EpistemiarqueView section={null} deps={{ fetchMeFn: epistemiarque, api }} />)
    await screen.findByText('Publier une version du référentiel (snapshot)')
    fireEvent.change(screen.getByLabelText('Version du référentiel (semver)'), { target: { value: '7.2.0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publier le snapshot' }))
    await waitFor(() => expect(api.cutRelease).toHaveBeenCalledWith('7.2.0', 'RESPIRE v7.2.0'))
  })
})

describe('EpistemiarqueView — éditeur riche d’une compétence', () => {
  it('édite la définition et enregistre avec If-Match (concurrence optimiste)', async () => {
    const api = fakeApi()
    render(<EpistemiarqueView section="editer/10" deps={{ fetchMeFn: epistemiarque, api }} />)
    const def = await screen.findByLabelText('Définition')
    fireEvent.change(def, { target: { value: 'Nouvelle définition' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.saveDraft).toHaveBeenCalled())
    const [id, savedContent, baseHash] = api.saveDraft.mock.calls[0]
    expect(id).toBe('10')
    expect(savedContent.identite.definition).toBe('Nouvelle définition')
    expect(baseHash).toBe('basehash000') // le hash de base est envoyé en If-Match
  })

  it('ajoute un signal déclencheur (protocole passe 1)', async () => {
    const api = fakeApi()
    render(<EpistemiarqueView section="editer/10" deps={{ fetchMeFn: epistemiarque, api }} />)
    await screen.findByLabelText('Définition')
    fireEvent.click(screen.getByRole('button', { name: /Ajouter \(ex\. j’ai vérifié\)/ }))
    const signal2 = await screen.findByLabelText('signal 2')
    fireEvent.change(signal2, { target: { value: 'j’ai recoupé' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.saveDraft).toHaveBeenCalled())
    const savedContent = api.saveDraft.mock.calls[0][1]
    expect(savedContent.protocole.passe_1.signaux_declencheurs).toContain('j’ai recoupé')
  })

  it('conflit 409 (édition concurrente) : message + bouton recharger', async () => {
    const api = fakeApi({
      saveDraft: vi.fn(async () => {
        throw new ApiError('Cette compétence a été modifiée par un autre épistémiarque.', 409)
      }),
    })
    render(<EpistemiarqueView section="editer/10" deps={{ fetchMeFn: epistemiarque, api }} />)
    const def = await screen.findByLabelText('Définition')
    fireEvent.change(def, { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText(/modifiée par un autre épistémiarque/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Recharger' })).toBeTruthy()
  })

  it('compétence gelée (review) : renvoi au vote', async () => {
    const api = fakeApi({
      getDraft: vi.fn(async () => ({ id: 11, code: '1.01', nom: 'x', semver: '1.1.0', status: 'review', contentHash: 'h', content: content() })),
    })
    render(<EpistemiarqueView section="editer/11" deps={{ fetchMeFn: epistemiarque, api }} />)
    expect(await screen.findByText(/ouverte au vote/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Aller à la page de vote' }).getAttribute('href')).toBe('#/epistemiarque/proposition/11')
  })
})

describe('EpistemiarqueView — vote par compétence', () => {
  it('affiche le décompte, le changement proposé et vote', async () => {
    const api = fakeApi()
    render(<EpistemiarqueView section="proposition/11" deps={{ fetchMeFn: epistemiarque, api }} />)
    await screen.findByText('Décompte — en cours')
    // changement de définition affiché
    expect(screen.getByText(/Douter, et se douter de soi/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pour' }))
    await waitFor(() => expect(api.vote).toHaveBeenCalledWith('11', 'pour', null))
  })

  it('proposition adoptée : entérinement de la compétence', async () => {
    const api = fakeApi({
      getProposal: vi.fn(async () => ({
        id: 11, code: '1.01', nom: 'Pensée Critique', semver: '1.1.0', status: 'review',
        baseVersion: '1.0.0', baseContent: content(), content: content(),
        tally: { pour: 2, contre: 0, abstention: 0, notVoted: 1, electorateSize: 3, threshold: 2, outcome: 'adopted', reached: true },
        votes: [],
      })),
    })
    render(<EpistemiarqueView section="proposition/11" deps={{ fetchMeFn: epistemiarque, api }} />)
    const btn = await screen.findByRole('button', { name: 'Entériner cette compétence' })
    fireEvent.click(btn)
    await waitFor(() => expect(api.publishDraft).toHaveBeenCalled())
    await waitFor(() => expect(window.location.hash).toBe('#/epistemiarque'))
  })
})
