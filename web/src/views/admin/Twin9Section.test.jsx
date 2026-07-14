// Section « Twin_v9 » (chantier T4-ADMIN, ADR-010) : le SEUL endroit du front
// où le contenu d'un gabarit est visible, réservé au rôle admin. On vérifie les
// quatre blocs (liste + édition/versionnage, banc d'essai, réglages bornés,
// table des comptes), la dépêche depuis AdminView, et la garde de rôle.
//
// Les gabarits de test sont FICTIFS (noms plats -> pas d'encodage %2F dans les
// clés de route) : jamais un vrai prompt.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

const PROTOCOLES = {
  protocole: [
    { name: 'gabarit-alpha', longueur: 1200, variables: ['TEXTE_JOURNEE', 'PIECES'], updated_at: '2026-07-10 09:00:00' },
    { name: 'gabarit-beta', longueur: 640, variables: [], updated_at: '2026-07-09 08:00:00' },
  ],
}

const CONFIG = {
  marge: 1.1,
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
  'GET api/twin9/admin/protocole': () => jsonResponse(200, PROTOCOLES),
  'GET api/twin9/admin/config': jsonResponse(200, CONFIG),
  'GET api/twin9/admin/comptes': jsonResponse(200, COMPTES),
}

/** Attend la fin du chargement initial (la liste des gabarits est rendue). */
async function renderReady(routes) {
  const fetchFn = routedFetch(routes)
  render(<Twin9Section fetchFn={fetchFn} />)
  await screen.findByRole('button', { name: /gabarit-alpha/ })
  return fetchFn
}

describe('Twin9Section — gabarits (liste + édition + versionnage)', () => {
  it('liste les gabarits avec leurs métadonnées et l’avertissement de confidentialité', async () => {
    await renderReady(baseRoutes)
    expect(screen.getByText(/Contenu confidentiel/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /gabarit-alpha/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /gabarit-beta/ })).toBeTruthy()
    expect(screen.getByText(/1200 caractères · 2 variables/)).toBeTruthy()
  })

  it('charge le contenu, l’édite et enregistre (PUT versionné)', async () => {
    let putBody = null
    const fetchFn = await renderReady({
      ...baseRoutes,
      'GET api/twin9/admin/protocole/gabarit-alpha': jsonResponse(200, {
        name: 'gabarit-alpha',
        content: 'CONTENU FICTIF {$TEXTE_JOURNEE}',
        variables: ['TEXTE_JOURNEE', 'PIECES'],
        updated_at: '2026-07-10 09:00:00',
      }),
      'PUT api/twin9/admin/protocole/gabarit-alpha': (init) => {
        putBody = JSON.parse(init.body)
        return jsonResponse(200, { name: 'gabarit-alpha', variables: ['TEXTE_JOURNEE'], status: 'updated' })
      },
    })

    fireEvent.click(screen.getByRole('button', { name: /gabarit-alpha/ }))
    const textarea = await screen.findByLabelText(/Contenu du gabarit/)
    expect(textarea.value).toBe('CONTENU FICTIF {$TEXTE_JOURNEE}')

    fireEvent.change(textarea, { target: { value: 'CONTENU FICTIF MODIFIÉ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await screen.findByText(/nouvelle version archivée/)
    expect(putBody).toEqual({ content: 'CONTENU FICTIF MODIFIÉ' })
    // Le contenu confidentiel n'est pas rendu en HTML : c'est du texte brut.
    expect(textarea.tagName).toBe('TEXTAREA')
  })

  it('affiche l’historique des versions à la demande', async () => {
    await renderReady({
      ...baseRoutes,
      'GET api/twin9/admin/protocole/gabarit-alpha': jsonResponse(200, {
        name: 'gabarit-alpha',
        content: 'CONTENU FICTIF',
        variables: [],
        updated_at: '2026-07-10 09:00:00',
      }),
      'GET api/twin9/admin/protocole/gabarit-alpha/versions': jsonResponse(200, {
        name: 'gabarit-alpha',
        versions: [{ version: 2, longueur: 900, variables: [], created_at: '2026-07-05 10:00:00' }],
      }),
    })

    fireEvent.click(screen.getByRole('button', { name: /gabarit-alpha/ }))
    await screen.findByLabelText(/Contenu du gabarit/)
    fireEvent.click(screen.getByRole('button', { name: /Voir les versions/ }))

    // La table des versions apparaît (métadonnées seules : version + longueur).
    await screen.findByText('900') // longueur de la version archivée
    const cells = screen.getAllByRole('cell')
    expect(cells.some((c) => c.textContent === '2')).toBe(true) // numéro de version
  })
})

describe('Twin9Section — banc d’essai', () => {
  it('génère les champs de variables et affiche le rendu (aucun appel LLM)', async () => {
    let postBody = null
    await renderReady({
      ...baseRoutes,
      'POST api/twin9/admin/tester': (init) => {
        postBody = JSON.parse(init.body)
        return jsonResponse(200, { rendu: 'RENDU FICTIF DU GABARIT', non_resolues: [] })
      },
    })

    fireEvent.change(screen.getByLabelText('Gabarit'), { target: { value: 'gabarit-alpha' } })
    // Les champs sont générés depuis les variables du gabarit choisi.
    const champ = await screen.findByLabelText('TEXTE_JOURNEE')
    expect(screen.getByLabelText('PIECES')).toBeTruthy()
    fireEvent.change(champ, { target: { value: 'exemple' } })

    fireEvent.click(screen.getByRole('button', { name: 'Rendre le gabarit' }))

    const rendu = await screen.findByTestId('twin9-rendu')
    expect(rendu.textContent).toBe('RENDU FICTIF DU GABARIT')
    expect(rendu.tagName).toBe('PRE') // texte brut, jamais du HTML
    expect(postBody).toEqual({ name: 'gabarit-alpha', variables: { TEXTE_JOURNEE: 'exemple', PIECES: '' } })
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

    fireEvent.change(screen.getByLabelText(/Marge/), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/hors bornes/)
  })

  it('signale quand il n’y a rien à enregistrer (aucun PUT)', async () => {
    await renderReady(baseRoutes) // aucun PUT mocké : il ne doit pas partir
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }))
    await screen.findByText('Aucune modification à enregistrer.')
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

    await screen.findByText('Réglages Twin_v9 enregistrés.')
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

describe('AdminView — dépêche twin9 et garde de rôle', () => {
  const admin = async () => ({ user: { id: 1, email: 'root@b.fr', displayName: 'Root', roles: ['admin'] } })
  const apprenant = async () => ({ user: { id: 2, email: 'a@b.fr', displayName: 'Maya', roles: ['apprenant'] } })

  it('rend la section Twin_v9 pour un admin', async () => {
    const fetchFn = routedFetch(baseRoutes)
    render(<AdminView section="twin9" deps={{ fetchMeFn: admin, fetchFn }} />)
    await screen.findByRole('heading', { name: /Twin_v9 — Golden Prompt/ })
    expect(fetchFn).toHaveBeenCalled()
  })

  it('ne montre RIEN de Twin_v9 à un non-admin', async () => {
    render(<AdminView section="twin9" deps={{ fetchMeFn: apprenant }} />)
    await screen.findByTestId('admin-reserve')
    expect(screen.queryByText(/Twin_v9 — Golden Prompt/)).toBeNull()
    expect(screen.queryByText(/Contenu confidentiel/i)).toBeNull()
  })
})
