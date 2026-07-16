// Section « Twin9 » de l'admin (AD-D2) — SUPERVISION seule : réglages
// (contribution, promo, packs, modèles) + comptes. L'édition des gabarits a
// déménagé vers #/twin9-atelier (voir Twin9AtelierView.test.jsx).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Twin9Section from './Twin9Section.jsx'
import AdminView from '../AdminView.jsx'
import { resetApiClient } from '../../api/client.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

function routedFetch(routes) {
  return vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const handler = routes[key]
    if (!handler) throw new Error(`route non mockée : ${key}`)
    return typeof handler === 'function' ? handler(init) : handler
  })
}

const CONFIG = {
  marge: 1.2,
  marge_twin6: 1.1,
  twin9_cle_perso_ouverte: false,
  packs: [{ montant_usd: 10, libelle: 'Pack découverte — 10 $' }],
  modeles: {
    'modele-fictif-a': { prix_usd_mtok: [1, 5], etages: ['taggers', 'rapide'] },
  },
  enabled: true,
  appels_par_minute: 30,
  pipeline: {},
}

const COMPTES = {
  comptes: [
    {
      user_id: 7,
      email: 'ecole@example.org',
      nom: 'École Fictive',
      solde_microusd: 5_000_000,
      recharges_microusd: 20_000_000,
      consomme_microusd: 15_000_000,
      derniere_activite: '2026-07-12 14:30:00',
    },
  ],
}

const baseRoutes = {
  'GET api/twin9/admin/config': jsonResponse(200, CONFIG),
  'GET api/twin9/admin/comptes': jsonResponse(200, COMPTES),
}

/** Attend la fin du chargement initial (les réglages sont rendus). */
async function renderReady(routes) {
  const fetchFn = routedFetch(routes)
  render(<Twin9Section fetchFn={fetchFn} />)
  await screen.findByRole('heading', { name: 'Réglages' })
  return fetchFn
}

describe('Twin9Section — supervision seule (plus d’édition de gabarits)', () => {
  it('NE charge PAS les gabarits et ne montre aucun contenu confidentiel', async () => {
    const fetchFn = await renderReady(baseRoutes)
    // Aucun appel à la liste des gabarits (déplacée dans l'atelier).
    const calls = fetchFn.mock.calls.map((c) => c[0])
    expect(calls.some((u) => String(u).includes('admin/protocole'))).toBe(false)
    expect(screen.queryByText(/Gabarits du Golden Prompt/)).toBeNull()
    expect(screen.queryByText(/Contenu confidentiel/i)).toBeNull()
    // Un lien pointe vers l'atelier.
    expect(screen.getByRole('link', { name: /atelier Twin9/i })).toBeTruthy()
  })
})

describe('Twin9Section — réglages', () => {
  it('envoie un diff et affiche le message serveur 422 (marge hors bornes)', async () => {
    await renderReady({
      ...baseRoutes,
      'PUT api/twin9/admin/config': (init) => {
        expect(JSON.parse(init.body)).toEqual({ marge: 9 })
        return jsonResponse(422, { error: 'Marge hors bornes (entre 1 et 5)' })
      },
    })

    fireEvent.change(screen.getByLabelText(/Contribution Twin9/), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/hors bornes/)
  })

  it('permet d’activer la promo (Twin9 gratuit en clé perso) via un diff', async () => {
    let putBody = null
    await renderReady({
      ...baseRoutes,
      'PUT api/twin9/admin/config': (init) => {
        putBody = JSON.parse(init.body)
        return jsonResponse(200, { ...CONFIG, twin9_cle_perso_ouverte: true })
      },
    })

    fireEvent.click(screen.getByLabelText(/Twin9 gratuit avec la clé perso/))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }))

    await screen.findByText('Réglages Twin9 enregistrés.')
    expect(putBody).toEqual({ twin9_cle_perso_ouverte: true })
  })

  it('ajoute un pack et l’envoie dans le diff', async () => {
    let putBody = null
    await renderReady({
      ...baseRoutes,
      'PUT api/twin9/admin/config': (init) => {
        putBody = JSON.parse(init.body)
        return jsonResponse(200, {
          ...CONFIG,
          packs: [...CONFIG.packs, { montant_usd: 30, libelle: 'Pack test' }],
        })
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un pack' }))
    const montants = screen.getAllByLabelText('Montant (USD)')
    fireEvent.change(montants[montants.length - 1], { target: { value: '30' } })
    const libelles = screen.getAllByLabelText('Libellé')
    fireEvent.change(libelles[libelles.length - 1], { target: { value: 'Pack test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }))

    await screen.findByText('Réglages Twin9 enregistrés.')
    expect(putBody).toEqual({
      packs: [
        { montant_usd: 10, libelle: 'Pack découverte — 10 $' },
        { montant_usd: 30, libelle: 'Pack test' },
      ],
    })
  })
})

describe('Twin9Section — comptes (supervision)', () => {
  it('affiche la table des comptes avec cumuls en USD', async () => {
    await renderReady(baseRoutes)
    expect(screen.getByText(/École Fictive/)).toBeTruthy()
    expect(screen.getByText('(ecole@example.org)')).toBeTruthy()
    expect(screen.getByText('5,00 $')).toBeTruthy() // solde
    expect(screen.getByText('20,00 $')).toBeTruthy() // recharges cumulées
    expect(screen.getByText('15,00 $')).toBeTruthy() // consommé cumulé
  })
})

describe('AdminView — dépêche twin9 (supervision) et garde de rôle', () => {
  const admin = async () => ({ user: { id: 1, email: 'root@b.fr', displayName: 'Root', roles: ['admin'] } })
  const apprenant = async () => ({ user: { id: 2, email: 'a@b.fr', displayName: 'Maya', roles: ['apprenant'] } })

  it('rend la supervision Twin9 pour un admin (sans contenu de gabarit)', async () => {
    const fetchFn = routedFetch(baseRoutes)
    render(<AdminView section="twin9" deps={{ fetchMeFn: admin, fetchFn }} />)
    await screen.findByRole('heading', { name: /Twin9 — supervision/ })
    expect(screen.queryByText(/Contenu confidentiel/i)).toBeNull()
    expect(fetchFn).toHaveBeenCalled()
  })

  it('ne montre RIEN de Twin9 à un non-admin', async () => {
    render(<AdminView section="twin9" deps={{ fetchMeFn: apprenant }} />)
    await screen.findByTestId('admin-reserve')
    expect(screen.queryByText(/Twin9 — supervision/)).toBeNull()
  })
})
