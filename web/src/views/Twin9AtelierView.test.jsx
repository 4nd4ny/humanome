// Atelier Twin9 (#/twin9-atelier, AD-D2) — édition des gabarits du Golden
// Prompt réservée à admin ∧ promptologue (les DEUX rôles). Garde front doublée
// côté serveur (RequireRole::all). Gabarits FICTIFS (noms plats).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Twin9AtelierView from './Twin9AtelierView.jsx'
import { resetApiClient } from '../api/client.js'

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

const baseRoutes = {
  'GET api/twin9/admin/protocole': () => jsonResponse(200, PROTOCOLES),
}

describe('Twin9AtelierView — garde admin ∧ promptologue', () => {
  it('refuse un admin SEUL (pas promptologue) : rien du contenu, aucun appel réseau', async () => {
    const fetchFn = routedFetch(baseRoutes)
    render(<Twin9AtelierView roles={['admin']} deps={{ fetchFn }} />)
    await screen.findByTestId('twin9-atelier-reserve')
    expect(screen.queryByText(/Gabarits du Golden Prompt/)).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('refuse un promptologue SEUL (pas admin)', async () => {
    const fetchFn = routedFetch(baseRoutes)
    render(<Twin9AtelierView roles={['promptologue']} deps={{ fetchFn }} />)
    await screen.findByTestId('twin9-atelier-reserve')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('autorise un administrateur-promptologue (les deux rôles)', async () => {
    const fetchFn = routedFetch(baseRoutes)
    render(<Twin9AtelierView roles={['admin', 'promptologue']} deps={{ fetchFn }} />)
    expect(await screen.findByRole('button', { name: /gabarit-alpha/ })).toBeTruthy()
    expect(screen.getByText(/Contenu confidentiel/i)).toBeTruthy()
    expect(fetchFn).toHaveBeenCalled()
  })
})

describe('Twin9AtelierView — édition et banc d’essai', () => {
  async function renderAtelier(routes) {
    const fetchFn = routedFetch(routes)
    render(<Twin9AtelierView roles={['admin', 'promptologue']} deps={{ fetchFn }} />)
    await screen.findByRole('button', { name: /gabarit-alpha/ })
    return fetchFn
  }

  it('charge le contenu, l’édite et enregistre (PUT versionné, texte brut)', async () => {
    let putBody = null
    await renderAtelier({
      ...baseRoutes,
      'GET api/twin9/admin/protocole/gabarit-alpha': jsonResponse(200, {
        name: 'gabarit-alpha',
        content: 'CONTENU FICTIF {$TEXTE_JOURNEE}',
        variables: ['TEXTE_JOURNEE', 'PIECES'],
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
    expect(textarea.tagName).toBe('TEXTAREA')
  })

  it('banc d’essai : rendu du gabarit en texte brut (aucun appel LLM)', async () => {
    let postBody = null
    await renderAtelier({
      ...baseRoutes,
      'POST api/twin9/admin/tester': (init) => {
        postBody = JSON.parse(init.body)
        return jsonResponse(200, { rendu: 'RENDU FICTIF DU GABARIT', non_resolues: [] })
      },
    })

    fireEvent.change(screen.getByLabelText('Gabarit'), { target: { value: 'gabarit-alpha' } })
    const champ = await screen.findByLabelText('TEXTE_JOURNEE')
    fireEvent.change(champ, { target: { value: 'exemple' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rendre le gabarit' }))

    const rendu = await screen.findByTestId('twin9-rendu')
    expect(rendu.textContent).toBe('RENDU FICTIF DU GABARIT')
    expect(rendu.tagName).toBe('PRE')
    expect(postBody).toEqual({ name: 'gabarit-alpha', variables: { TEXTE_JOURNEE: 'exemple', PIECES: '' } })
  })
})
