// Atelier promptologue (P10) : garde de rôle, accueil (publiés + brouillons +
// défaut marqué), « nouvelle version », dispatch formation (API chantier C).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PromptologueView from './PromptologueView.jsx'
import { ApiUnavailableError } from '../api/client.js'
import pkgFixture from '../../../schemas/fixtures/prompt-package-exemple.json'

const anonyme = async () => ({ user: null })
const apprenant = async () => ({
  user: { email: 'a@b.fr', displayName: 'Maya', roles: ['apprenant'] },
})
const promptologue = async () => ({
  user: { email: 'p@b.fr', displayName: 'Pom', roles: ['apprenant', 'promptologue'] },
})

/** Client API factice minimal pour l'accueil. */
function fakeApi(overrides = {}) {
  return {
    listPublished: vi.fn(async () => [
      { id: 'aurora-v3-reconstruit', version: '1.0.0', description: 'Paquet par défaut M6' },
      { id: 'aurora-lab', version: '2.0.0', description: 'Variante de laboratoire' },
    ]),
    listDrafts: vi.fn(async () => [
      { draftId: 7, document: { ...pkgFixture, version: '1.1.0' }, updatedAt: '2026-07-11' },
    ]),
    getDefault: vi.fn(async () => ({ id: 'aurora-lab', version: '2.0.0' })),
    createDraft: vi.fn(async () => ({ draftId: 12 })),
    proposeDefault: vi.fn(async () => ({ ok: true })),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('PromptologueView — garde de rôle', () => {
  it('anonyme : invite à se connecter, aucun contenu d’atelier', async () => {
    render(<PromptologueView section={null} deps={{ fetchMeFn: anonyme }} />)
    await screen.findByTestId('promptologue-anonyme')
    expect(screen.queryByText('Paquets publiés')).toBeNull()
  })

  it('connecté SANS rôle promptologue : refus explicite', async () => {
    render(<PromptologueView section={null} deps={{ fetchMeFn: apprenant }} />)
    await screen.findByTestId('promptologue-sans-role')
    expect(screen.queryByText('Paquets publiés')).toBeNull()
  })

  it('API indisponible (copie statique) : message dédié', async () => {
    const fetchMeFn = async () => {
      throw new ApiUnavailableError()
    }
    render(<PromptologueView section={null} deps={{ fetchMeFn }} />)
    await screen.findByTestId('promptologue-indisponible')
  })

  it('rôle promptologue : bandeau connecté + navigation de l’atelier', async () => {
    render(<PromptologueView section={null} deps={{ fetchMeFn: promptologue, api: fakeApi() }} />)
    await screen.findByTestId('promptologue-connecte')
    expect(screen.getByRole('link', { name: 'Banc d’essai' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Rétrospective' })).toBeTruthy()
  })
})

describe('PromptologueView — accueil (paquets publiés, brouillons, défaut)', () => {
  it('liste les versions publiées et MARQUE la version par défaut du serveur', async () => {
    render(<PromptologueView section={null} deps={{ fetchMeFn: promptologue, api: fakeApi() }} />)
    await screen.findByText('aurora-lab')
    const rows = screen.getAllByRole('row')
    const labRow = rows.find((r) => r.textContent.includes('aurora-lab'))
    expect(labRow.querySelector('.promptologue-defaut')).toBeTruthy()
    const otherRow = rows.find((r) => r.textContent.includes('aurora-v3-reconstruit'))
    expect(otherRow.querySelector('.promptologue-defaut')).toBeNull()
  })

  it('liste mes brouillons avec lien vers l’éditeur', async () => {
    render(<PromptologueView section={null} deps={{ fetchMeFn: promptologue, api: fakeApi() }} />)
    const link = await screen.findByRole('link', { name: 'aurora-demo@1.1.0' })
    expect(link.getAttribute('href')).toBe('#/promptologue/editeur/7')
  })

  it('« nouvelle version » : POST drafts {fromId, fromVersion, version} puis navigation', async () => {
    const api = fakeApi()
    render(<PromptologueView section={null} deps={{ fetchMeFn: promptologue, api }} />)
    await screen.findByText('aurora-lab')
    fireEvent.click(screen.getAllByRole('button', { name: 'Nouvelle version' })[1])
    // Suggestion semver : bump patch depuis la version d'origine.
    const input = screen.getByLabelText('Version du brouillon')
    expect(input.value).toBe('2.0.1')
    fireEvent.change(input, { target: { value: '2.1.0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer le brouillon' }))
    await waitFor(() =>
      expect(api.createDraft).toHaveBeenCalledWith({
        fromId: 'aurora-lab',
        fromVersion: '2.0.0',
        version: '2.1.0',
      }),
    )
    await waitFor(() => expect(window.location.hash).toBe('#/promptologue/editeur/12'))
  })

  it('« proposer par défaut » : POST propose-default sur la version choisie', async () => {
    const api = fakeApi()
    render(<PromptologueView section={null} deps={{ fetchMeFn: promptologue, api }} />)
    await screen.findByText('aurora-lab')
    // aurora-lab est déjà défaut : seul aurora-v3-reconstruit propose le bouton.
    fireEvent.click(screen.getByRole('button', { name: 'Proposer par défaut' }))
    await waitFor(() =>
      expect(api.proposeDefault).toHaveBeenCalledWith('aurora-v3-reconstruit', '1.0.0'),
    )
    await screen.findByText(/Proposition envoyée/)
  })
})

describe('PromptologueView — dispatch des sections', () => {
  it('formation : compose FormationSection avec parcours="promptologue" (API chantier C)', async () => {
    const seen = []
    function FakeFormation(props) {
      seen.push(props)
      return <p data-testid="fake-formation">formation</p>
    }
    render(
      <PromptologueView
        section="formation/01-prompt-engineering-applique"
        deps={{ fetchMeFn: promptologue, formationSection: FakeFormation }}
      />,
    )
    await screen.findByTestId('fake-formation')
    expect(seen[0].parcours).toBe('promptologue')
    expect(seen[0].chapter).toBe('01-prompt-engineering-applique')
    expect(seen[0].connected).toBe(true)
  })

  it('section inconnue : alerte + retour à l’atelier', async () => {
    render(<PromptologueView section="zzz" deps={{ fetchMeFn: promptologue, api: fakeApi() }} />)
    await screen.findByText(/Section inconnue de l’atelier promptologue/)
    expect(screen.getByRole('link', { name: 'Retour à l’atelier' })).toBeTruthy()
  })
})
