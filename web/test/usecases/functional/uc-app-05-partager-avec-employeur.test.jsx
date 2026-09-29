// UC-APP-05 — Partager une cartographie avec un employeur (côté apprenant) :
// tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-05-partager-avec-employeur.md
//
// Le scénario est joué dans l'espace apprenant rendu (EspaceView, #/espace) :
// session vérifiée au montage (vrai fetchMe → jeton CSRF), panneau « Mes
// cartographies » réel, dialogue de partage réel. Seuls le stockage local
// (carto-store mémoire) et le réseau (fetch global → serveur factice à état
// reproduisant les routes de partage) sont simulés. La consultation par
// l'employeur est l'objet de UC-EMP-01.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import EspaceView from '../../../src/views/EspaceView.jsx'
import CartographiesPanel from '../../../src/views/espace/CartographiesPanel.jsx'
import { createCartoStore, createMemoryAdapter } from '../../../src/lib/carto-store.js'
import {
  createMemoryAdapter as createPortfolioMemoryAdapter,
  createPortfolioStore,
} from '../../../src/lib/portfolio-store.js'
import { resetApiClient } from '../../../src/api/client.js'
import {
  APPS_CSRF,
  APPS_USER,
  createFakeApi,
  fakeTrainingStore,
  jsonResponse,
  meRoute,
  mutations,
  noContentResponse,
} from '../support/apps.js'
import dayFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'

const TITRE = 'Journée du 05/01/2026'
const PASSWORD = 'sesame-employeur'

/**
 * Serveur factice à état : liens de partage de la copie serveur 42
 * (contrat de api/src/routes/share.php côté apprenant : 401 sans session sur
 * les trois routes, 403 sans jeton CSRF, 404 hors propriété, 422 selon les
 * règles serveur du mot de passe — points de code via mb_strlen, octets).
 */
function createServer({ user = APPS_USER, cartoIds = [42], links = [], failRevoke = false } = {}) {
  const shares = links.map((l) => ({ ...l }))
  let seq = shares.length
  const known = (id) => cartoIds.includes(Number(id))
  const anonymous = () => (user ? null : jsonResponse(401, { error: 'Authentification requise' }))
  const passwordError = (password) => {
    if (typeof password !== 'string' || [...password].length < 8) {
      return 'Le mot de passe doit contenir au moins 8 caractères'
    }
    return new TextEncoder().encode(password).length > 1024 ? 'Mot de passe trop long' : null
  }
  const api = createFakeApi([
    meRoute(user),
    [
      'GET',
      /^cartographies\/(\d+)\/shares$/,
      ({ match }) =>
        anonymous() ??
        (known(match[1])
          ? jsonResponse(200, shares.map(({ token, ...rest }) => rest))
          : jsonResponse(404, { error: 'Cartographie introuvable' })),
    ],
    [
      'POST',
      /^cartographies\/(\d+)\/share$/,
      ({ body, headers, match }) => {
        if (!user) return jsonResponse(401, { error: 'Authentification requise' })
        if (headers['X-CSRF-Token'] !== APPS_CSRF) return jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' })
        if (!known(match[1])) return jsonResponse(404, { error: 'Cartographie introuvable' })
        const refused = passwordError(body.password)
        if (refused) return jsonResponse(422, { error: 'Validation échouée', fields: { password: refused } })
        seq += 1
        const token = String(seq).repeat(32).slice(0, 32).replace(/[^0-9a-f]/g, 'a')
        const created = new Date(Date.UTC(2026, 6, 1, 10, 0, 0))
        const expires = new Date(created.getTime() + body.expiresInDays * 86400000)
        shares.push({
          shareId: seq,
          createdAt: created.toISOString().slice(0, 19),
          expiresAt: expires.toISOString().slice(0, 19),
          revokedAt: null,
          token,
        })
        return jsonResponse(201, { shareId: seq, token, url: `/#/partage/${token}` })
      },
    ],
    [
      'DELETE',
      /^shares\/(\d+)$/,
      ({ headers, match }) => {
        const refused = anonymous()
        if (refused) return refused
        if (headers['X-CSRF-Token'] !== APPS_CSRF) return jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' })
        const link = shares.find((s) => s.shareId === Number(match[1]))
        if (!link || failRevoke) return jsonResponse(404, { error: 'Lien de partage introuvable' })
        link.revokedAt ??= '2026-07-12T11:00:00'
        return noContentResponse()
      },
    ],
  ])
  vi.stubGlobal('fetch', api.fetch)
  return { ...api, shares }
}

async function openEspace(entries) {
  const store = createCartoStore(createMemoryAdapter())
  for (const entry of entries) await store.saveCartography(entry)
  const Panel = (props) => <CartographiesPanel {...props} store={store} />
  render(
    <EspaceView
      section={null}
      deps={{
        portfolioStore: createPortfolioStore(createPortfolioMemoryAdapter()),
        trainingStore: fakeTrainingStore(),
        cartographiesPanel: Panel,
      }}
    />,
  )
  await screen.findAllByTestId('carto-item')
  return store
}

function itemOf(titre) {
  return screen.getAllByTestId('carto-item').find((item) => within(item).queryByText(titre))
}

/** Ouvre le dialogue de partage de la cartographie et attend la liste des liens. */
async function openDialog(titre = TITRE) {
  fireEvent.click(within(itemOf(titre)).getByRole('button', { name: 'Partager' }))
  const dialog = await screen.findByRole('region', { name: `Partage de ${titre}` })
  await waitFor(() => expect(within(dialog).queryByText('Chargement des liens…')).toBeNull())
  return dialog
}

function fillAndCreate(dialog, { password = PASSWORD, days } = {}) {
  fireEvent.change(within(dialog).getByLabelText('Mot de passe du lien (8 caractères min)'), {
    target: { value: password },
  })
  if (days !== undefined) {
    fireEvent.change(within(dialog).getByLabelText('Expiration (jours)'), { target: { value: days } })
  }
  fireEvent.click(within(dialog).getByRole('button', { name: 'Créer le lien de partage' }))
}

const SHARED_ENTRY = { type: 'jour', titre: TITRE, visibility: 'publique', document: dayFixture, serverId: 42 }

let clipboardWrite
beforeEach(() => {
  resetApiClient()
  clipboardWrite = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: clipboardWrite }, configurable: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete window.navigator.clipboard
  resetApiClient()
})

describe('UC-APP-05 — l’apprenant crée, suit et révoque ses liens de partage', () => {
  it('UC-APP-05-F11 — nominal : mot de passe, 90 jours par défaut, URL absolue affichée une fois puis copiée', async () => {
    const server = createServer()
    await openEspace([SHARED_ENTRY])
    await screen.findByTestId('espace-connecte')

    // 1-2. Le dialogue s'ouvre sur la liste (vide) et le conseil du double canal.
    const dialog = await openDialog()
    expect(within(dialog).getByText('Aucun lien de partage pour cette cartographie.')).toBeDefined()
    expect(dialog.textContent).toContain('Transmettez ce mot de passe par un autre canal que le lien.')
    expect(within(dialog).getByLabelText('Expiration (jours)').value).toBe('90')

    // 3-5. Création : POST {password, expiresInDays: 90} avec le jeton CSRF.
    fillAndCreate(dialog)
    const url = await within(dialog).findByTestId('share-url')
    const [post] = mutations(server.requests)
    expect(post.path).toBe('cartographies/42/share')
    expect(post.body).toEqual({ password: PASSWORD, expiresInDays: 90 })
    expect(post.headers['X-CSRF-Token']).toBe(APPS_CSRF)
    const token = server.shares[0].token
    expect(url.textContent).toBe(`${window.location.origin}${window.location.pathname}#/partage/${token}`)
    expect(dialog.textContent).toContain('il ne sera plus jamais affiché en entier')
    expect(within(dialog).getByLabelText('Mot de passe du lien (8 caractères min)').value).toBe('')

    // 6. La liste est rafraîchie : dates seulement, bouton de révocation.
    expect(await within(dialog).findByText(/Créé le 01\/07\/2026 — expire le 29\/09\/2026/)).toBeDefined()
    expect(within(dialog).getByRole('button', { name: 'Révoquer' })).toBeDefined()

    // 7. Copie du lien dans le presse-papiers.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copier le lien' }))
    expect(await within(dialog).findByRole('button', { name: 'Lien copié' })).toBeDefined()
    expect(clipboardWrite).toHaveBeenCalledWith(url.textContent)
  })

  it('UC-APP-05-F12 — A1 : expiration choisie (30 jours) transmise et reflétée dans la liste', async () => {
    const server = createServer()
    await openEspace([SHARED_ENTRY])
    const dialog = await openDialog()

    fillAndCreate(dialog, { days: '30' })

    expect(await within(dialog).findByText(/expire le 31\/07\/2026/)).toBeDefined()
    expect(mutations(server.requests)[0].body).toEqual({ password: PASSWORD, expiresInDays: 30 })
  })

  it('UC-APP-05-F13 — A2 : « Révoquer » → DELETE api/shares/{id} (CSRF), le lien apparaît révoqué', async () => {
    const server = createServer({
      links: [
        { shareId: 1, createdAt: '2026-07-01T10:00:00', expiresAt: '2026-09-29T10:00:00', revokedAt: null },
        { shareId: 2, createdAt: '2026-07-02T10:00:00', expiresAt: '2026-09-30T10:00:00', revokedAt: null },
      ],
    })
    await openEspace([SHARED_ENTRY])
    const dialog = await openDialog()

    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Révoquer' })[0])

    expect(await within(dialog).findByText('révoqué le 12/07/2026')).toBeDefined()
    const [revoke] = mutations(server.requests)
    expect(revoke).toMatchObject({ method: 'DELETE', path: 'shares/1' })
    expect(revoke.headers['X-CSRF-Token']).toBe(APPS_CSRF)
    // A3 : l'autre lien reste actif et révocable.
    expect(within(dialog).getAllByRole('button', { name: 'Révoquer' })).toHaveLength(1)
  })

  it('UC-APP-05-F14 — A5 : sans copie serveur, pas de « Partager » ; avec copie, même « privée », le bouton est offert (anomalie figée)', async () => {
    createServer()
    await openEspace([
      { type: 'jour', titre: 'Locale seulement', document: dayFixture },
      { type: 'jour', titre: 'Copie privée', visibility: 'privee', document: dayFixture, serverId: 42 },
    ])

    const locale = itemOf('Locale seulement')
    expect(within(locale).queryByRole('button', { name: 'Partager' })).toBeNull()
    expect(within(locale).getByRole('button', { name: 'Copier sur le serveur' })).toBeDefined()

    // Comportement ACTUEL (fiche, « Anomalies constatées ») : la visibilité
    // n'est pas une condition du partage.
    expect(within(itemOf('Copie privée')).getByLabelText('Confidentialité de Copie privée').value).toBe('privee')
    expect(within(itemOf('Copie privée')).getByRole('button', { name: 'Partager' })).toBeDefined()
  })

  it('UC-APP-05-F15 — A6 : fermer puis rouvrir → l’URL n’est plus jamais réaffichée, seules les dates restent', async () => {
    createServer()
    await openEspace([SHARED_ENTRY])
    let dialog = await openDialog()
    fillAndCreate(dialog)
    await within(dialog).findByTestId('share-url')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('region', { name: `Partage de ${TITRE}` })).toBeNull()

    dialog = await openDialog()
    expect(within(dialog).queryByTestId('share-url')).toBeNull()
    expect(within(dialog).getByText(/expire le/)).toBeDefined()
  })

  it('UC-APP-05-F16 — E1 : mot de passe de moins de 8 caractères refusé localement, aucune requête', async () => {
    const server = createServer()
    await openEspace([SHARED_ENTRY])
    const dialog = await openDialog()

    fillAndCreate(dialog, { password: 'court' })

    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'Le mot de passe du lien doit compter au moins 8 caractères.',
    )
    expect(mutations(server.requests)).toEqual([])
  })

  it.each([
    ['0', 'rangeUnderflow'],
    ['400', 'rangeOverflow'],
  ])('UC-APP-05-F17 — E2 : expiration %s jours bloquée par le champ (1 à 365), aucune requête', async (days, flag) => {
    const server = createServer()
    await openEspace([SHARED_ENTRY])
    const dialog = await openDialog()

    fillAndCreate(dialog, { days })

    const input = within(dialog).getByLabelText('Expiration (jours)')
    expect(input.validity[flag]).toBe(true) // validation native du navigateur
    // Pas d'alerte « L’expiration doit être comprise… » : handleCreate n'a pas
    // été appelé — c'est bien la validation native qui a bloqué la soumission.
    expect(within(dialog).queryByRole('alert')).toBeNull()
    expect(within(dialog).queryByTestId('share-url')).toBeNull()
    expect(mutations(server.requests)).toEqual([])
  })

  it('UC-APP-05-F18 — E3 : session expirée (401) → la création invite à se reconnecter ; la liste affiche le message brut du serveur', async () => {
    createServer({ user: null })
    await openEspace([SHARED_ENTRY])
    const dialog = await openDialog()
    // Chargement de la liste en 401 : message brut, sans traduction.
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Authentification requise')

    fillAndCreate(dialog)

    // Seule la création traduit le 401 (fiche, E3).
    await waitFor(() =>
      expect(within(dialog).getAllByRole('alert').map((a) => a.textContent)).toEqual([
        'Session expirée : reconnectez-vous puis réessayez.',
        'Authentification requise',
      ]),
    )
    expect(within(dialog).queryByTestId('share-url')).toBeNull()
  })

  it('UC-APP-05-F19 — E4 : copie serveur retirée ailleurs (404) → « Cartographie introuvable »', async () => {
    createServer({ cartoIds: [] })
    await openEspace([SHARED_ENTRY])
    const dialog = await openDialog()
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Cartographie introuvable')

    fillAndCreate(dialog)

    await waitFor(() =>
      expect(within(dialog).getAllByRole('alert').map((a) => a.textContent)).toEqual([
        'Cartographie introuvable',
        'Cartographie introuvable',
      ]),
    )
    expect(within(dialog).queryByTestId('share-url')).toBeNull()
  })

  it('UC-APP-05-F20 — E5 : la révocation échoue → message, le lien reste affiché actif', async () => {
    createServer({
      failRevoke: true,
      links: [{ shareId: 1, createdAt: '2026-07-01T10:00:00', expiresAt: '2026-09-29T10:00:00', revokedAt: null }],
    })
    await openEspace([SHARED_ENTRY])
    const dialog = await openDialog()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Révoquer' }))

    expect((await within(dialog).findByRole('alert')).textContent).toBe('Lien de partage introuvable')
    expect(within(dialog).getByRole('button', { name: 'Révoquer' })).toBeDefined()
  })

  it('UC-APP-05-F21 — E6 : presse-papiers refusé → le lien reste affiché, à copier à la main', async () => {
    clipboardWrite.mockRejectedValue(new Error('refusé'))
    createServer()
    await openEspace([SHARED_ENTRY])
    const dialog = await openDialog()
    fillAndCreate(dialog)
    const url = await within(dialog).findByTestId('share-url')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copier le lien' }))

    await waitFor(() => expect(clipboardWrite).toHaveBeenCalled())
    expect(within(dialog).getByRole('button', { name: 'Copier le lien' })).toBeDefined()
    expect(url.textContent).toContain('#/partage/')
  })

  it('UC-APP-05-F22 — A4 : un lien expiré reste listé avec « Révoquer », sans mention « expiré » (limite figée)', async () => {
    createServer({
      links: [{ shareId: 1, createdAt: '2026-01-01T10:00:00', expiresAt: '2026-01-02T10:00:00', revokedAt: null }],
    })
    await openEspace([SHARED_ENTRY])
    const dialog = await openDialog()

    expect(within(dialog).getByText(/expire le 02\/01\/2026/)).toBeDefined()
    expect(within(dialog).getByRole('button', { name: 'Révoquer' })).toBeDefined()
    expect(dialog.textContent).not.toMatch(/expiré/)
  })

  it.each([
    ['4 caractères astraux (8 unités UTF-16, 4 points de code)', '😀😀😀😀'],
    ['plus de 1024 octets', 'x'.repeat(1025)],
  ])('UC-APP-05-F23 — E1 : mot de passe admis localement mais refusé par l’API (%s) → « Validation échouée » seul', async (_label, password) => {
    const server = createServer()
    await openEspace([SHARED_ENTRY])
    const dialog = await openDialog()

    fillAndCreate(dialog, { password })

    expect((await within(dialog).findByRole('alert')).textContent).toBe('Validation échouée')
    expect(mutations(server.requests)).toHaveLength(1) // le contrôle local a laissé passer
    expect(mutations(server.requests)[0].body.password).toBe(password)
    expect(within(dialog).queryByTestId('share-url')).toBeNull()
    expect(server.shares).toEqual([])
  })
})
