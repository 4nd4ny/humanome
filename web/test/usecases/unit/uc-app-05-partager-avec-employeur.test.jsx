// UC-APP-05 — Partager une cartographie avec un employeur (côté apprenant) :
// tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-05-partager-avec-employeur.md
//
// Code sollicité appelé directement : les constantes et l'URL absolue du
// dialogue de partage, le routeur (le lien produit est bien celui que
// l'employeur ouvrira, UC-EMP-01), le client API (jeton CSRF sur les routes
// de partage), le composant ShareDialog rendu isolément (contrôles locaux,
// handleCreate / handleRevoke / handleCopy, rendu de la liste des liens) et
// le bouton « Partager » de CartographiesPanel (conditionné par serverId).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ShareDialog, {
  absoluteShareUrl,
  SHARE_DEFAULT_EXPIRES_DAYS,
  SHARE_PASSWORD_MIN_LENGTH,
} from '../../../src/views/espace/ShareDialog.jsx'
import { parseHash } from '../../../src/router.js'
import { apiFetch, resetApiClient } from '../../../src/api/client.js'
import CartographiesPanel from '../../../src/views/espace/CartographiesPanel.jsx'
import { createCartoStore, createMemoryAdapter } from '../../../src/lib/carto-store.js'
import {
  createMemoryAdapter as createPortfolioMemoryAdapter,
  createPortfolioStore,
} from '../../../src/lib/portfolio-store.js'
import { APPS_CSRF, createFakeApi, jsonResponse, meRoute, noContentResponse } from '../support/apps.js'

const TOKEN = '0123456789abcdef0123456789abcdef'
const ENTRY = { id: 'local-1', titre: 'Journée du 05/01/2026', serverId: 42 }

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
  resetApiClient()
})

describe('UC-APP-05 — règles et lien produit', () => {
  it('UC-APP-05-U07 — mot de passe de 8 caractères minimum et expiration par défaut de 90 jours, comme l’API', () => {
    expect(SHARE_PASSWORD_MIN_LENGTH).toBe(8)
    expect(SHARE_DEFAULT_EXPIRES_DAYS).toBe(90)
  })

  it('UC-APP-05-U08 — absoluteShareUrl : origine + chemin de déploiement + #/partage/<jeton> ; repli relatif hors navigateur', () => {
    window.history.replaceState(null, '', '/humanome/index.html')
    expect(absoluteShareUrl(TOKEN)).toBe(`${window.location.origin}/humanome/index.html#/partage/${TOKEN}`)

    vi.stubGlobal('location', undefined)
    expect(absoluteShareUrl(TOKEN)).toBe(`/#/partage/${TOKEN}`)
  })

  it('UC-APP-05-U09 — le fragment du lien produit ouvre la route publique « share » avec le même jeton', () => {
    const url = new URL(absoluteShareUrl(TOKEN))
    expect(parseHash(url.hash)).toEqual({ name: 'share', token: TOKEN })
  })
})

describe('UC-APP-05 — ShareDialog isolé', () => {
  function renderDialog(links = []) {
    const api = createFakeApi([
      ['GET', 'cartographies/42/shares', () => jsonResponse(200, links)],
      ['POST', 'cartographies/42/share', () => jsonResponse(201, { shareId: 1, token: TOKEN, url: `/#/partage/${TOKEN}` })],
    ])
    render(<ShareDialog entry={ENTRY} fetchFn={api.fetch} onClose={() => {}} />)
    return api
  }

  /**
   * Soumet le formulaire DIRECTEMENT (événement submit) : on teste ici le
   * garde-fou JavaScript de handleCreate, en deçà de la validation native
   * du champ number (min/max/step), couverte par les tests fonctionnels.
   */
  function submitForm(password, days) {
    fireEvent.change(screen.getByLabelText('Mot de passe du lien (8 caractères min)'), { target: { value: password } })
    fireEvent.change(screen.getByLabelText('Expiration (jours)'), { target: { value: days } })
    fireEvent.submit(screen.getByRole('button', { name: 'Créer le lien de partage' }).closest('form'))
  }

  it.each(['0', '366', '', '-3'])(
    'UC-APP-05-U10 — handleCreate : expiration « %s » refusée localement, sans requête',
    async (days) => {
      const api = renderDialog()
      await screen.findByText('Aucun lien de partage pour cette cartographie.')

      submitForm('sesame-employeur', days)

      expect((await screen.findByRole('alert')).textContent).toBe(
        'L’expiration doit être comprise entre 1 et 365 jours.',
      )
      expect(api.requests.filter((r) => r.method === 'POST')).toEqual([])
    },
  )

  it('UC-APP-05-U11 — handleCreate : le mot de passe est contrôlé avant l’expiration, puis envoyé avec un entier', async () => {
    const api = renderDialog()
    await screen.findByText('Aucun lien de partage pour cette cartographie.')

    submitForm('7carac!', '0')
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Le mot de passe du lien doit compter au moins 8 caractères.',
    )

    submitForm('sesame-employeur', '365')
    await screen.findByTestId('share-url')
    const post = api.requests.find((r) => r.method === 'POST')
    expect(post.body).toEqual({ password: 'sesame-employeur', expiresInDays: 365 })
  })

  it('UC-APP-05-U12 — liste des liens : dates en français, « Révoquer » si actif, date de révocation sinon', async () => {
    // Serveur fautif : les entrées portent un jeton parasite — la liste ne
    // rend que les dates, jamais un jeton ni une URL.
    renderDialog([
      { shareId: 1, createdAt: '2026-07-01T10:00:00', expiresAt: '2026-09-29T10:00:00', revokedAt: null, token: TOKEN },
      {
        shareId: 2,
        createdAt: '2026-07-02T10:00:00',
        expiresAt: '2026-10-01T10:00:00',
        revokedAt: '2026-07-12T11:00:00',
        url: `/#/partage/${TOKEN}`,
      },
    ])

    const items = within(await screen.findByRole('list')).getAllByRole('listitem')
    expect(items[0].textContent).toContain('Créé le 01/07/2026 — expire le 29/09/2026')
    expect(within(items[0]).getByRole('button', { name: 'Révoquer' })).toBeDefined()
    expect(items[1].textContent).toContain('révoqué le 12/07/2026')
    expect(within(items[1]).queryByRole('button')).toBeNull()
    // Jamais de jeton ni d'URL dans la liste.
    expect(screen.queryByTestId('share-url')).toBeNull()
    expect(document.body.textContent).not.toContain(TOKEN)
    expect(document.body.textContent).not.toContain('#/partage/')
  })

  it('UC-APP-05-U13 — anomalie 2 figée : parseInt tronque une expiration en notation scientifique (« 1e2 » → 1 jour, « 3.65e2 » → 3)', async () => {
    // Comportement ACTUEL (fiche, anomalie 2) : le champ number accepte la
    // notation scientifique (valeur valide pour la validation native), mais
    // handleCreate convertit par Number.parseInt : 100 jours partent comme 1.
    const api = renderDialog()
    await screen.findByText('Aucun lien de partage pour cette cartographie.')
    const input = screen.getByLabelText('Expiration (jours)')

    submitForm('sesame-employeur', '1e2')
    expect(input.value).toBe('1e2')
    expect(input.validity.valid).toBe(true) // la validation native laisserait passer
    await screen.findByTestId('share-url')
    submitForm('sesame-employeur', '3.65e2')
    await waitFor(() => expect(api.requests.filter((r) => r.method === 'POST')).toHaveLength(2))

    expect(api.requests.filter((r) => r.method === 'POST').map((r) => r.body.expiresInDays)).toEqual([1, 3])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('UC-APP-05-U14 — handleRevoke : DELETE api/shares/{id} puis rechargement ; en échec, message brut du serveur (y compris 401)', async () => {
    let revoked = null
    const failures = [jsonResponse(401, { error: 'Authentification requise' })]
    const api = createFakeApi([
      [
        'GET',
        'cartographies/42/shares',
        () =>
          jsonResponse(200, [
            { shareId: 1, createdAt: '2026-07-01T10:00:00', expiresAt: '2026-09-29T10:00:00', revokedAt: revoked },
          ]),
      ],
      [
        'DELETE',
        'shares/1',
        () => {
          const failure = failures.shift()
          if (failure) return failure
          revoked = '2026-07-12T11:00:00'
          return noContentResponse()
        },
      ],
    ])
    render(<ShareDialog entry={ENTRY} fetchFn={api.fetch} onClose={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Révoquer' }))
    // 401 : pas de traduction « Session expirée… » ici (seule la création la fait).
    expect((await screen.findByRole('alert')).textContent).toBe('Authentification requise')
    expect(screen.getByRole('button', { name: 'Révoquer' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Révoquer' }))
    expect(await screen.findByText('révoqué le 12/07/2026')).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET cartographies/42/shares',
      'DELETE shares/1',
      'DELETE shares/1',
      'GET cartographies/42/shares',
    ])
  })

  it('UC-APP-05-U15 — handleCopy : succès → « Lien copié » ; refus du presse-papiers → libellé inchangé', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('refusé')).mockResolvedValueOnce(undefined)
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true })
    try {
      renderDialog()
      await screen.findByText('Aucun lien de partage pour cette cartographie.')
      submitForm('sesame-employeur', '90')
      const url = await screen.findByTestId('share-url')

      fireEvent.click(screen.getByRole('button', { name: 'Copier le lien' }))
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
      expect(screen.getByRole('button', { name: 'Copier le lien' })).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: 'Copier le lien' }))
      expect(await screen.findByRole('button', { name: 'Lien copié' })).toBeDefined()
      expect(writeText).toHaveBeenLastCalledWith(url.textContent)
    } finally {
      delete window.navigator.clipboard
    }
  })

  it('UC-APP-05-U16 — handleCreate : 401 → « Session expirée… » ; autre refus → message général du serveur, sans le détail des champs', async () => {
    const answers = [
      jsonResponse(401, { error: 'Authentification requise' }),
      jsonResponse(422, { error: 'Validation échouée', fields: { password: 'Mot de passe trop long' } }),
    ]
    const api = createFakeApi([
      ['GET', 'cartographies/42/shares', () => jsonResponse(200, [])],
      ['POST', 'cartographies/42/share', () => answers.shift()],
    ])
    render(<ShareDialog entry={ENTRY} fetchFn={api.fetch} onClose={() => {}} />)
    await screen.findByText('Aucun lien de partage pour cette cartographie.')

    submitForm('sesame-employeur', '90')
    expect((await screen.findByRole('alert')).textContent).toBe('Session expirée : reconnectez-vous puis réessayez.')

    submitForm('sesame-employeur', '90')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Validation échouée'))
    expect(screen.queryByTestId('share-url')).toBeNull()
    expect(screen.getByLabelText('Mot de passe du lien (8 caractères min)').value).toBe('sesame-employeur')
  })
})

describe('UC-APP-05 — client API et panneau', () => {
  it('UC-APP-05-U17 — apiFetch : après auth/me, POST …/share et DELETE shares/{id} portent X-CSRF-Token ; GET …/shares non', async () => {
    const api = createFakeApi([
      meRoute(),
      ['GET', 'cartographies/42/shares', () => jsonResponse(200, [])],
      ['POST', 'cartographies/42/share', () => jsonResponse(201, { shareId: 1, token: TOKEN, url: `/#/partage/${TOKEN}` })],
      ['DELETE', 'shares/1', () => noContentResponse()],
    ])
    const fetchFn = api.fetch

    await apiFetch('auth/me', { fetchFn })
    await apiFetch('cartographies/42/shares', { fetchFn })
    await apiFetch('cartographies/42/share', { method: 'POST', body: { password: 'x', expiresInDays: 90 }, fetchFn })
    expect(await apiFetch('shares/1', { method: 'DELETE', fetchFn })).toBeNull()

    const byKey = Object.fromEntries(api.requests.map((r) => [`${r.method} ${r.path}`, r.headers]))
    expect(byKey['GET cartographies/42/shares']['X-CSRF-Token']).toBeUndefined()
    expect(byKey['POST cartographies/42/share']['X-CSRF-Token']).toBe(APPS_CSRF)
    expect(byKey['DELETE shares/1']['X-CSRF-Token']).toBe(APPS_CSRF)
  })

  it('UC-APP-05-U18 — CartographiesPanel : « Partager » seulement avec une copie serveur ; le bouton ouvre puis referme le dialogue', async () => {
    const store = createCartoStore(createMemoryAdapter())
    await store.saveCartography({ titre: 'Locale', document: { kind: 'cartographie-jour' } })
    await store.saveCartography({ titre: 'Copiée', document: { kind: 'cartographie-jour' }, serverId: 42 })
    const api = createFakeApi([['GET', 'cartographies/42/shares', () => jsonResponse(200, [])]])
    render(
      <CartographiesPanel
        store={store}
        portfolioStore={createPortfolioStore(createPortfolioMemoryAdapter())}
        fetchFn={api.fetch}
      />,
    )
    const items = await screen.findAllByTestId('carto-item')
    const itemOf = (titre) => items.find((item) => within(item).queryByText(titre))

    expect(within(itemOf('Locale')).queryByRole('button', { name: 'Partager' })).toBeNull()
    fireEvent.click(within(itemOf('Copiée')).getByRole('button', { name: 'Partager' }))
    expect(await screen.findByRole('region', { name: 'Partage de Copiée' })).toBeDefined()
    await waitFor(() => expect(api.requests.map((r) => r.path)).toEqual(['cartographies/42/shares']))

    fireEvent.click(within(itemOf('Copiée')).getByRole('button', { name: 'Partager' }))
    expect(screen.queryByRole('region', { name: 'Partage de Copiée' })).toBeNull()
  })
})
