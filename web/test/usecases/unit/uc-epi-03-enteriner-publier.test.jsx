// UC-EPI-03 — Entériner et publier : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-03-enteriner-publier.md
//
// Code sollicité appelé directement : le client des compétences (routes
// d'entérinement et de coupe de release) et le composant EpistemiarqueView
// ISOLÉ (coutures deps.fetchMeFn / deps.api) pour la carte « Publier une
// version du référentiel » et la section « Décision » d'une proposition adoptée.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import EpistemiarqueView from '../../../src/views/EpistemiarqueView.jsx'
import { ApiError } from '../../../src/api/client.js'
import { createCompetenceApi } from '../../../src/views/epistemiarque/competence-api.js'
import { competenceContent, tallyOf } from '../support/epi.js'

const member = async () => ({ user: { id: 42, displayName: 'Iris', roles: ['epistemiarque'] } })

async function click(element) {
  await act(async () => {
    fireEvent.click(element)
  })
}

function atelierApi(cutRelease) {
  return { list: vi.fn(async () => []), listDrafts: vi.fn(async () => []), cutRelease }
}

function adoptedApi(publishDraft) {
  const content = competenceContent('1.01', 'Pensée Critique')
  return {
    getProposal: vi.fn(async () => ({
      id: 11,
      code: '1.01',
      nom: 'Pensée Critique',
      semver: '1.1.0',
      status: 'review',
      baseVersion: '1.0.0',
      baseContent: content,
      content,
      tally: tallyOf(3, [{ vote: 'pour' }, { vote: 'pour' }]),
      votes: [],
    })),
    publishDraft,
    vote: vi.fn(),
    withdrawDraft: vi.fn(),
  }
}

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('UC-EPI-03 — client des compétences', () => {
  it('UC-EPI-03-U11 — publishDraft et cutRelease : POST avec {releaseNote} et {semver, label}', async () => {
    const apiFetchFn = vi.fn(async () => ({}))
    const api = createCompetenceApi(apiFetchFn)

    await api.publishDraft(11, 'Définition précisée')
    await api.cutRelease('7.1.0', 'RESPIRE v7.1.0')

    expect(apiFetchFn.mock.calls).toEqual([
      ['competences/drafts/11/publish', { method: 'POST', body: { releaseNote: 'Définition précisée' } }],
      ['competences/release', { method: 'POST', body: { semver: '7.1.0', label: 'RESPIRE v7.1.0' } }],
    ])
  })
})

describe('UC-EPI-03 — carte « Publier une version du référentiel »', () => {
  it('UC-EPI-03-U12 — bouton inactif sans version ; semver rognée, libellé « RESPIRE v<semver> » ; succès puis erreur serveur affichés', async () => {
    const cutRelease = vi
      .fn()
      .mockResolvedValueOnce({ status: 'imported', id: 9, semver: '7.1.0', contentHash: 'h' })
      .mockRejectedValueOnce(Object.assign(new ApiError('Version 7.1.0 of referentiel "respire" already exists', 409), {
        serverMessage: 'Version 7.1.0 of referentiel "respire" already exists',
      }))
    render(<EpistemiarqueView section={null} deps={{ fetchMeFn: member, api: atelierApi(cutRelease) }} />)

    const card = await screen.findByRole('region', { name: 'Coupe de release' })
    const button = within(card).getByRole('button', { name: 'Publier le snapshot' })
    const input = within(card).getByLabelText('Version du référentiel (semver)')
    expect(button.disabled).toBe(true)
    fireEvent.change(input, { target: { value: '   ' } })
    expect(button.disabled).toBe(true)
    expect(card.textContent).toContain('prochain déploiement/ré-export')
    // Anomalie AN3 (comportement actuel figé) : la carte promet un snapshot
    // « immédiatement épinglable par les cartographies », alors que la
    // cartographie standard (RunWizard) épingle l'export STATIQUE ; seul le run
    // de masse (UC-ETA-03) lit la dernière version servie par l'API.
    expect(card.textContent).toContain('immédiatement épinglable par les cartographies')

    fireEvent.change(input, { target: { value: ' 7.1.0 ' } })
    await click(button)
    expect(cutRelease).toHaveBeenCalledWith('7.1.0', 'RESPIRE v7.1.0')
    expect(within(card).getByRole('status').textContent).toBe('Release 7.1.0 publiée (snapshot du référentiel).')

    await click(button)
    expect(within(card).getByRole('alert').textContent).toBe('Version 7.1.0 of referentiel "respire" already exists')
    expect(button.disabled).toBe(false)
  })
})

describe('UC-EPI-03 — section « Décision » d’une proposition adoptée', () => {
  it('UC-EPI-03-U13 — note vide → « Entérinée par le vote des membres. », note rognée sinon ; succès → retour à l’atelier', async () => {
    const publishDraft = vi.fn(async () => ({ status: 'published' }))
    window.location.hash = '#/epistemiarque/proposition/11'
    render(<EpistemiarqueView section="proposition/11" deps={{ fetchMeFn: member, api: adoptedApi(publishDraft) }} />)

    const decision = await screen.findByRole('region', { name: 'Décision' })
    expect(decision.textContent).toContain('Majorité atteinte : la compétence peut être entérinée.')
    await click(within(decision).getByRole('button', { name: 'Entériner cette compétence' }))
    expect(publishDraft).toHaveBeenLastCalledWith('11', 'Entérinée par le vote des membres.')
    await waitFor(() => expect(window.location.hash).toBe('#/epistemiarque'))
    cleanup()

    render(<EpistemiarqueView section="proposition/11" deps={{ fetchMeFn: member, api: adoptedApi(publishDraft) }} />)
    fireEvent.change(await screen.findByLabelText('Note de publication'), { target: { value: '  Définition précisée.  ' } })
    await click(screen.getByRole('button', { name: 'Entériner cette compétence' }))
    expect(publishDraft).toHaveBeenLastCalledWith('11', 'Définition précisée.')
  })

  it('UC-EPI-03-U14 — refus serveur (409) : message affiché, on reste sur la page, le bouton redevient actif', async () => {
    const publishDraft = vi.fn(async () => {
      throw Object.assign(new ApiError('Majorité non atteinte : 1 voix « pour » sur 2 requises (2 membres).', 409), {
        serverMessage: 'Majorité non atteinte : 1 voix « pour » sur 2 requises (2 membres).',
      })
    })
    window.location.hash = '#/epistemiarque/proposition/11'
    render(<EpistemiarqueView section="proposition/11" deps={{ fetchMeFn: member, api: adoptedApi(publishDraft) }} />)

    const button = await screen.findByRole('button', { name: 'Entériner cette compétence' })
    await click(button)

    expect(screen.getByRole('alert').textContent).toBe('Majorité non atteinte : 1 voix « pour » sur 2 requises (2 membres).')
    expect(window.location.hash).toBe('#/epistemiarque/proposition/11')
    expect(screen.getByRole('button', { name: 'Entériner cette compétence' }).disabled).toBe(false)
  })
})
