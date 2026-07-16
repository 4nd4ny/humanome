// Administration (P12.1) : garde de rôle. Sans rôle admin, l'espace est
// remplacé par l'explication ; l'admin voit l'accueil et les sections. La
// copie statique (API absente) dégrade proprement. Nav refondue (chantier A,
// mobile-friendly) : accueil en cartes + onglets-pastilles sur les pages de
// section (aria-current='page', lien Accueil).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import AdminView from './AdminView.jsx'
import { ApiUnavailableError, resetApiClient } from '../api/client.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

const anonyme = async () => ({ user: null })
const apprenant = async () => ({ user: { id: 2, email: 'a@b.fr', displayName: 'Maya', roles: ['apprenant'] } })
const admin = async () => ({ user: { id: 1, email: 'root@b.fr', displayName: 'Root', roles: ['admin'] } })

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

describe('AdminView — garde de rôle', () => {
  it('montre l’explication du rôle à un visiteur anonyme', async () => {
    render(<AdminView section={null} deps={{ fetchMeFn: anonyme }} />)
    await screen.findByTestId('admin-reserve')
    expect(screen.getByText(/réservé à l’administration/i)).toBeTruthy()
    expect(screen.getByText(/Connectez-vous/i)).toBeTruthy()
  })

  it('refuse un compte sans rôle admin', async () => {
    render(<AdminView section="roles" deps={{ fetchMeFn: apprenant }} />)
    await screen.findByTestId('admin-reserve')
    // La section rôles ne doit pas s’afficher.
    expect(screen.queryByText(/Comptes et rôles/i)).toBeNull()
  })

  it('dégrade proprement quand l’API est absente (copie statique)', async () => {
    const fetchMeFn = async () => {
      throw new ApiUnavailableError()
    }
    render(<AdminView section={null} deps={{ fetchMeFn }} />)
    await screen.findByText(/copie statique du site/i)
  })

  it('affiche l’accueil et les sections pour un admin', async () => {
    render(<AdminView section={null} deps={{ fetchMeFn: admin }} />)
    await screen.findByTestId('admin-connecte')
    expect(screen.getByRole('link', { name: /Rôles/i })).toBeTruthy()
    // Nom accessible complet (label + hint) pour lever l'ambiguïté avec la
    // carte Twin9 dont le hint mentionne aussi « Golden Prompt ».
    expect(screen.getByRole('link', { name: /Golden Prompt Import privé/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Twin9/i })).toBeTruthy()
  })

  it('rend la section rôles pour un admin', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, { users: [], total: 0, page: 1, pageSize: 20 }))
    render(<AdminView section="roles" deps={{ fetchMeFn: admin, fetchFn }} />)
    await screen.findByRole('heading', { name: /Comptes et rôles/i })
    expect(fetchFn).toHaveBeenCalled()
  })

  it('signale une section inconnue', async () => {
    render(<AdminView section="inconnue" deps={{ fetchMeFn: admin }} />)
    await screen.findByText(/Section inconnue/i)
  })

  it('affiche les onglets-pastilles sur une page de section (nav mobile-friendly)', async () => {
    // Données minimales pour que ReglagesSection finisse son chargement.
    const routes = {
      'GET api/admin/settings': jsonResponse(200, {
        defaultPackage: { stored: null, proposal: null, effective: null },
        worker: { jobsInQueue: 0, byStatus: {}, activeRuns: 0, lastActivity: null },
        config: {},
      }),
      'GET api/prompt-packages': jsonResponse(200, []),
      'GET api/admin/demo-config': jsonResponse(200, {
        effective: {
          enabled: true,
          provider: 'anthropic',
          model: 'claude-haiku-4-5-20251001',
          maxTokensPerRequest: 2048,
          maxInputChars: 20000,
          perIpPerHour: 20,
          dailyGlobalTokens: 2000000,
          dailyBudgetUsd: 5,
          powDifficultyBits: 20,
          upstreamTimeoutSeconds: 60,
        },
        sources: {},
        allowedModels: ['claude-haiku-4-5-20251001'],
        apiKeyConfigured: true,
      }),
    }
    const fetchFn = vi.fn(async (url, init = {}) => {
      const key = `${init.method ?? 'GET'} ${url}`
      if (!routes[key]) throw new Error(`route non mockée : ${key}`)
      return routes[key]
    })

    render(<AdminView section="reglages" deps={{ fetchMeFn: admin, fetchFn }} />)
    await screen.findByRole('heading', { name: /Réglages plateforme/i })

    // Les onglets : nav dédiée, section active marquée aria-current='page'.
    const nav = screen.getByRole('navigation', { name: /Sections d.administration/i })
    const active = within(nav).getByRole('link', { name: 'Réglages' })
    expect(active.getAttribute('aria-current')).toBe('page')
    expect(active.getAttribute('href')).toBe('#/admin/reglages')

    // Lien Accueil (retour aux cartes) + les 5 sections, toutes présentes.
    const home = within(nav).getByRole('link', { name: /Accueil de l.administration/i })
    expect(home.getAttribute('href')).toBe('#/admin')
    for (const label of ['Rôles', 'Golden Prompt', 'Réglages', 'Configuration serveur', 'Twin9']) {
      expect(within(nav).getByRole('link', { name: label })).toBeTruthy()
    }
    // Un onglet inactif ne porte pas aria-current.
    expect(within(nav).getByRole('link', { name: 'Rôles' }).getAttribute('aria-current')).toBeNull()
  })
})
