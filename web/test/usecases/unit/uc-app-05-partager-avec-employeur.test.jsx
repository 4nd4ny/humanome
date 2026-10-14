// UC-APP-05 — Partager une cartographie avec un employeur (côté apprenant) :
// tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-05-partager-avec-employeur.md
//
// Ancien partage RETIRÉ (décision du 2026-10-14, journal de la cartographie
// D-43) : on ne crée plus de lien vers une cartographie du site ; le partage
// passe par une version partagée de l'interface de cartographie (espace
// Partage). Restent ici : la gestion des liens DÉJÀ CRÉÉS (ShareDialog rendu
// isolément : liste, échéance, révocation), le client API (jeton CSRF sur la
// révocation) et le panneau « Mes cartographies » (« Liens déjà créés »
// conditionné par serverId, « Partager depuis l'interface » qui remet la
// cartographie à l'interface). U07–U11, U13, U15 et U16 (création d'un lien)
// sont retirés avec elle.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ShareDialog from '../../../src/views/espace/ShareDialog.jsx'
import { apiFetch, resetApiClient } from '../../../src/api/client.js'
import CartographiesPanel from '../../../src/views/espace/CartographiesPanel.jsx'
import { createCartoStore, createMemoryAdapter } from '../../../src/lib/carto-store.js'
import {
  createMemoryAdapter as createPortfolioMemoryAdapter,
  createPortfolioStore,
} from '../../../src/lib/portfolio-store.js'
import { APPS_CSRF, createFakeApi, jsonResponse, meRoute, noContentResponse } from '../support/apps.js'
import dayFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import referentielFixture from '../../../../schemas/fixtures/referentiel-respire-v7.json'

const TOKEN = '0123456789abcdef0123456789abcdef'
const ENTRY = { id: 'local-1', titre: 'Journée du 05/01/2026', serverId: 42 }
/** Instant figé des scénarios : les échéances de juillet à octobre 2026 sont à venir. */
const NOW = () => new Date('2026-07-15T12:00:00')

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
  resetApiClient()
})

describe('UC-APP-05 — ShareDialog isolé : les liens déjà créés', () => {
  function renderDialog(links = [], props = {}) {
    const api = createFakeApi([['GET', 'cartographies/42/shares', () => jsonResponse(200, links)]])
    render(<ShareDialog entry={ENTRY} fetchFn={api.fetch} onClose={() => {}} now={NOW} {...props} />)
    return api
  }

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
    render(<ShareDialog entry={ENTRY} fetchFn={api.fetch} onClose={() => {}} now={NOW} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Révoquer' }))
    // 401 : message brut du serveur, sans traduction.
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

  it('UC-APP-05-U19 — retrait : le dialogue le dit, ne propose ni mot de passe ni création, et ne poste rien', async () => {
    const api = renderDialog()
    const dialog = await screen.findByRole('region', { name: 'Liens de partage de Journée du 05/01/2026' })
    expect(await within(dialog).findByText('Aucun lien de partage pour cette cartographie.')).toBeDefined()

    expect(within(dialog).getByRole('heading', { name: 'Liens de partage de « Journée du 05/01/2026 »' })).toBeDefined()
    expect(dialog.textContent).toContain('Le partage par lien de cette cartographie est retiré : on n’en crée plus de nouveau.')
    expect(dialog.textContent).toContain('restent valables jusqu’à leur expiration')
    expect(within(dialog).queryByLabelText(/Mot de passe/)).toBeNull()
    expect(within(dialog).queryByLabelText(/Expiration/)).toBeNull()
    expect(within(dialog).queryByRole('button', { name: /Créer/ })).toBeNull()
    expect(dialog.querySelector('form')).toBeNull()
    // Sans renvoi câblé, pas de bouton vers l'interface.
    expect(within(dialog).queryByRole('button', { name: 'Partager depuis l’interface' })).toBeNull()
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET cartographies/42/shares'])
  })

  it('UC-APP-05-U20 — renvoi vers l’interface : le bouton n’apparaît qu’avec le rappel, et l’appelle', async () => {
    const onShareInInterface = vi.fn()
    renderDialog([], { onShareInInterface })
    const dialog = await screen.findByRole('region', { name: 'Liens de partage de Journée du 05/01/2026' })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Partager depuis l’interface' }))
    expect(onShareInInterface).toHaveBeenCalledTimes(1)
  })

  it('UC-APP-05-U21 — lien échu : « expiré le », sans « Révoquer » (le serveur ne le sert plus) ; actif et révoqué inchangés ; échu depuis moins d’un jour : « Révoquer » reste (heure du serveur sans fuseau)', async () => {
    renderDialog([
      { shareId: 1, createdAt: '2026-01-01T10:00:00', expiresAt: '2026-01-02T10:00:00', revokedAt: null },
      { shareId: 2, createdAt: '2026-07-01T10:00:00', expiresAt: '2026-09-29T10:00:00', revokedAt: null },
      { shareId: 3, createdAt: '2026-01-01T10:00:00', expiresAt: '2026-01-02T10:00:00', revokedAt: '2026-01-01T12:00:00' },
      { shareId: 4, createdAt: '2026-04-16T10:00:00', expiresAt: '2026-07-15T10:00:00', revokedAt: null },
    ])

    const items = within(await screen.findByRole('list')).getAllByRole('listitem')
    expect(items[0].textContent).toBe('Créé le 01/01/2026 — expiré le 02/01/2026')
    expect(within(items[0]).queryByRole('button')).toBeNull()
    expect(items[1].textContent).toContain('Créé le 01/07/2026 — expire le 29/09/2026')
    expect(within(items[1]).getByRole('button', { name: 'Révoquer' })).toBeDefined()
    // Révoqué avant son échéance : la révocation prime.
    expect(items[2].textContent).toContain('expire le 02/01/2026')
    expect(items[2].textContent).toContain('révoqué le 01/01/2026')
    // Échu il y a deux heures (heure du serveur) : dit échu, encore révocable.
    expect(items[3].textContent).toContain('Créé le 16/04/2026 — expiré le 15/07/2026')
    expect(within(items[3]).getByRole('button', { name: 'Révoquer' })).toBeDefined()
  })
})

describe('UC-APP-05 — client API et panneau', () => {
  it('UC-APP-05-U17 — apiFetch : après auth/me, DELETE shares/{id} porte X-CSRF-Token ; GET …/shares non', async () => {
    const api = createFakeApi([
      meRoute(),
      ['GET', 'cartographies/42/shares', () => jsonResponse(200, [])],
      ['DELETE', 'shares/1', () => noContentResponse()],
    ])
    const fetchFn = api.fetch

    await apiFetch('auth/me', { fetchFn })
    await apiFetch('cartographies/42/shares', { fetchFn })
    expect(await apiFetch('shares/1', { method: 'DELETE', fetchFn })).toBeNull()

    const byKey = Object.fromEntries(api.requests.map((r) => [`${r.method} ${r.path}`, r.headers]))
    expect(byKey['GET cartographies/42/shares']['X-CSRF-Token']).toBeUndefined()
    expect(byKey['DELETE shares/1']['X-CSRF-Token']).toBe(APPS_CSRF)
  })

  it('UC-APP-05-U18 — CartographiesPanel : « Liens déjà créés » seulement avec une copie serveur, il ouvre puis referme le dialogue ; « Partager depuis l’interface » pour toutes', async () => {
    const store = createCartoStore(createMemoryAdapter())
    await store.saveCartography({ titre: 'Locale', document: { kind: 'cartographie-jour' } })
    await store.saveCartography({ titre: 'Copiée', document: { kind: 'cartographie-jour' }, serverId: 42 })
    const api = createFakeApi([['GET', 'cartographies/42/shares', () => jsonResponse(200, [])]])
    render(
      <CartographiesPanel
        store={store}
        portfolioStore={createPortfolioStore(createPortfolioMemoryAdapter())}
        fetchFn={api.fetch}
        onShareInInterface={() => {}}
      />,
    )
    const items = await screen.findAllByTestId('carto-item')
    const itemOf = (titre) => items.find((item) => within(item).queryByText(titre))

    expect(within(itemOf('Locale')).queryByRole('button', { name: 'Liens déjà créés' })).toBeNull()
    expect(within(itemOf('Locale')).getByRole('button', { name: 'Partager depuis l’interface' })).toBeDefined()
    expect(within(itemOf('Copiée')).getByRole('button', { name: 'Partager depuis l’interface' })).toBeDefined()
    // L'ancien bouton « Partager » n'existe plus.
    expect(screen.queryByRole('button', { name: 'Partager' })).toBeNull()

    const toggle = within(itemOf('Copiée')).getByRole('button', { name: 'Liens déjà créés' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(await screen.findByRole('region', { name: 'Liens de partage de Copiée' })).toBeDefined()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    await waitFor(() => expect(api.requests.map((r) => r.path)).toEqual(['cartographies/42/shares']))

    fireEvent.click(toggle)
    expect(screen.queryByRole('region', { name: 'Liens de partage de Copiée' })).toBeNull()
  })

  it('UC-APP-05-U22 — handleShareInInterface : journée et parcours partent tels quels ; une analyse Twin9 passe par l’adaptateur du moteur ; sans journée datée, message et rien ne part', async () => {
    const twin9 = {
      journal_id: 'demo',
      date: '2026-03-10',
      competences: {
        '1.01': {
          code: '1.01',
          nom: 'Pensée critique',
          pole: 1,
          attestations: [{ jour_index: 0, journee: 'J01', date: '2026-03-02', confiance: 0.8, score_preuves: 2, score_indices: 1 }],
          signaux: [],
        },
      },
    }
    const store = createCartoStore(createMemoryAdapter())
    await store.saveCartography({ type: 'jour', titre: 'Ma journée du 5 janvier', document: dayFixture })
    await store.saveCartography({ type: 'twin9', titre: 'Twin9 — demo', document: twin9 })
    await store.saveCartography({ type: 'twin9', titre: 'Twin9 — vide', document: { journal_id: 'vide', competences: {} } })
    const onShareInInterface = vi.fn()
    const getReferentiel = vi.fn(async () => ({ doc: referentielFixture }))
    render(
      <CartographiesPanel
        store={store}
        portfolioStore={createPortfolioStore(createPortfolioMemoryAdapter())}
        fetchFn={vi.fn()}
        onShareInInterface={onShareInInterface}
        getReferentiel={getReferentiel}
      />,
    )
    const items = await screen.findAllByTestId('carto-item')
    const share = (titre) =>
      fireEvent.click(
        within(items.find((item) => within(item).queryByText(titre))).getByRole('button', {
          name: 'Partager depuis l’interface',
        }),
      )

    share('Ma journée du 5 janvier')
    await waitFor(() => expect(onShareInInterface).toHaveBeenCalledTimes(1))
    expect(onShareInInterface.mock.calls[0]).toEqual([
      [{ path: 'cartographie-jour-2026-01-05.json', text: JSON.stringify(dayFixture) }],
      { title: 'Ma journée du 5 janvier' }, // le nouveau jeu de l'interface porte ce titre
    ])
    expect(getReferentiel).not.toHaveBeenCalled()

    share('Twin9 — demo')
    await waitFor(() => expect(onShareInInterface).toHaveBeenCalledTimes(2))
    const [{ path, text }] = onShareInInterface.mock.calls[1][0]
    expect(path).toBe('cartographie-twin9-2026-03-10.json')
    expect(JSON.parse(text)).toMatchObject({ kind: 'cartographie-merge' })

    share('Twin9 — vide')
    expect((await screen.findByRole('alert')).textContent).toBe(
      '« Twin9 — vide » ne peut pas s’ouvrir dans l’interface de cartographie : aucune journée datée à y placer.',
    )
    expect(onShareInInterface).toHaveBeenCalledTimes(2)
  })
})
