// UC-APP-08 — Rejoindre une cohorte, déposer son portfolio, quitter : tests
// FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-08-rejoindre-cohorte.md
//
// Le scénario est joué sur l'espace apprenant rendu (EspaceView, section
// « cohortes » = #/espace/cohortes) : vraie vérification de session (fetchMe
// → jeton CSRF), vraie section « Mes cohortes ». Seuls le portfolio local
// (portfolio-store mémoire) et le réseau (fetch global → serveur factice à
// état reproduisant les routes /api/cohortes…, y compris la réponse 404
// générique de Slim pour un code mal formé) sont simulés.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import EspaceView from '../../../src/views/EspaceView.jsx'
import { createMemoryAdapter, createPortfolioStore } from '../../../src/lib/portfolio-store.js'
import { ApiUnavailableError, resetApiClient } from '../../../src/api/client.js'
import { APPS_CSRF, createFakeApi, jsonResponse, meRoute, mutations, noContentResponse } from '../support/apps.js'

const CODE = 'K7TQZ2M9RC'
const ELISE = { id: 12, email: 'elise@example.org', displayName: 'Élise', roles: ['apprenant'] }

/**
 * Serveur factice à état : une cohorte « BTS SIO 2026 » du Lycée Astrolabe.
 * Comme l'API, les routes /cohortes… exigent le rôle apprenant (403 « Rôle
 * insuffisant » sinon, après le contrôle CSRF des mutations).
 */
function createServer({ user = ELISE, member = false, deposited = false, onDeposit = null } = {}) {
  const state = {
    member,
    joinedAt: member ? '2026-07-02T10:00:00' : null,
    portfolio: deposited ? { titre: 'Ancien dépôt', journees: 1, deposeLe: '2026-07-03T10:00:00' } : null,
  }
  const role = () =>
    user && !user.roles?.includes('apprenant') ? jsonResponse(403, { error: 'Rôle insuffisant' }) : null
  const csrf = (headers) =>
    headers['X-CSRF-Token'] === APPS_CSRF ? role() : jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' })
  const api = createFakeApi([
    meRoute(user),
    [
      'GET',
      'cohortes',
      () =>
        role() ??
        jsonResponse(
          200,
          state.member
            ? [
                {
                  id: 7,
                  nom: 'BTS SIO 2026',
                  etablissement: 'Lycée Astrolabe',
                  joinedAt: state.joinedAt,
                  portfolioDepose: state.portfolio !== null,
                  portfolio: state.portfolio,
                },
              ]
            : [],
        ),
    ],
    [
      'POST',
      /^cohortes\/([^/]+)\/rejoindre$/,
      ({ body, headers, match }) => {
        // Route Slim {code:[A-Za-z0-9]{10}} : sinon aucune route → 404 générique.
        if (!/^[A-Za-z0-9]{10}$/.test(decodeURIComponent(match[1]))) {
          return jsonResponse(404, { message: '404 Not Found' })
        }
        const refused = csrf(headers)
        if (refused) return refused
        if (body?.consentement !== true) {
          return jsonResponse(422, { error: 'Consentement explicite requis', consentement: '…' })
        }
        if (match[1].toUpperCase() !== CODE) return jsonResponse(404, { error: 'Cohorte introuvable' })
        const created = !state.member
        state.member = true
        state.joinedAt ??= '2026-07-12T09:30:00'
        return jsonResponse(created ? 201 : 200, { cohorteId: 7, nom: 'BTS SIO 2026', consentement: '…' })
      },
    ],
    [
      'POST',
      'cohortes/7/portfolio',
      ({ body, headers }) => {
        const refused = csrf(headers) ?? onDeposit?.(body)
        if (refused) return refused
        if (!state.member) return jsonResponse(404, { error: 'Cohorte introuvable' })
        state.portfolio = { titre: body.titre, journees: body.segments.length, deposeLe: '2026-07-12T10:00:00' }
        return jsonResponse(201, { id: 3, segments: body.segments.length })
      },
    ],
    [
      'DELETE',
      'cohortes/7/quitter',
      ({ headers }) => {
        const refused = csrf(headers)
        if (refused) return refused
        if (!state.member) return jsonResponse(404, { error: 'Cohorte introuvable' })
        Object.assign(state, { member: false, joinedAt: null, portfolio: null })
        return noContentResponse()
      },
    ],
  ])
  vi.stubGlobal('fetch', api.fetch)
  return { ...api, state }
}

/** Portfolio local segmenté (UC-APP-01), qui n'a jamais quitté le navigateur. */
async function localPortfolios(withOne = true) {
  const store = createPortfolioStore(createMemoryAdapter())
  const record = withOne
    ? await store.create({
        titre: 'Journal Astrolabe',
        texte: 'Jour 1…\n\nJour 2…',
        segments: [
          { date: '2026-01-05', texte: 'Jour 1…', debut: 0, fin: 7 },
          { date: '2026-01-06', texte: 'Jour 2…', debut: 9, fin: 16 },
        ],
      })
    : null
  return { store, record }
}

function openCohortes(portfolioStore) {
  render(<EspaceView section="cohortes" deps={{ portfolioStore }} />)
}

async function join(code, { consent = true } = {}) {
  fireEvent.change(await screen.findByLabelText('Code d’invitation'), { target: { value: code } })
  if (consent) fireEvent.click(screen.getByRole('checkbox', { name: /consentement explicite/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Rejoindre la cohorte' }))
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetApiClient()
})

describe('UC-APP-08 — l’apprenante rejoint la cohorte de son établissement, dépose, puis quitte', () => {
  it('UC-APP-08-F15 — nominal : consentement lu et coché, jointure, dépôt du portfolio local, état « déposé »', async () => {
    const server = createServer()
    const { store, record } = await localPortfolios()
    openCohortes(store)
    expect((await screen.findByTestId('espace-connecte')).textContent).toContain('Élise')
    expect(await screen.findByText('Vous n’avez rejoint aucune cohorte pour l’instant.')).toBeDefined()

    // 1-2. Le texte RGPD précède le bouton, inactif tant que rien n'est coché.
    const consent = screen.getByTestId('cohorte-consent-texte')
    expect(consent.textContent).toContain('l’établissement verra les cartographies produites dans ce cadre')
    const button = screen.getByRole('button', { name: 'Rejoindre la cohorte' })
    expect(button.disabled).toBe(true)
    expect(consent.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // 3-5. Jointure (code normalisé en majuscules, consentement dans le corps).
    await join('k7tqz2m9rc')
    expect((await screen.findByTestId('cohorte-info')).textContent).toContain('votre consentement est enregistré')
    const [joinRequest] = mutations(server.requests)
    expect(joinRequest).toMatchObject({ path: `cohortes/${CODE}/rejoindre`, body: { consentement: true } })
    expect(joinRequest.headers['X-CSRF-Token']).toBe(APPS_CSRF)
    const item = within(await screen.findByTestId('cohorte-liste')).getByRole('listitem')
    expect(item.textContent).toContain('BTS SIO 2026 — Lycée Astrolabe (rejointe le 12/07/2026)')
    expect(item.textContent).toContain('Portfolio non déposé')
    expect(screen.getByLabelText('Code d’invitation').value).toBe('')
    expect(screen.getByRole('checkbox', { name: /consentement explicite/ }).checked).toBe(false)

    // 6-8. Dépôt : l'avertissement d'opt-in est affiché, puis envoi du portfolio local.
    expect(item.textContent).toContain('envoie ce portfolio au serveur')
    fireEvent.change(within(item).getByLabelText('Portfolio à déposer'), { target: { value: record.id } })
    fireEvent.click(within(item).getByRole('button', { name: 'Déposer dans la cohorte' }))
    expect((await screen.findByText('Portfolio « Journal Astrolabe » déposé dans la cohorte « BTS SIO 2026 ».'))).toBeDefined()
    const deposit = mutations(server.requests)[1]
    expect(deposit).toMatchObject({ method: 'POST', path: 'cohortes/7/portfolio' })
    expect(deposit.body).toEqual({ titre: 'Journal Astrolabe', texte: 'Jour 1…\n\nJour 2…', segments: record.segments })
    expect(deposit.headers['X-CSRF-Token']).toBe(APPS_CSRF)
    await waitFor(() => expect(screen.getByTestId('cohorte-liste').textContent).toContain('Portfolio déposé'))
    // Limite (fiche) : plus de formulaire de dépôt une fois déposé — le re-dépôt n'est pas proposé.
    expect(screen.queryByLabelText('Portfolio à déposer')).toBeNull()
  })

  it('UC-APP-08-F16 — A1 : re-jointure d’une cohorte déjà rejointe → même confirmation, une seule adhésion', async () => {
    const server = createServer({ member: true })
    const { store } = await localPortfolios()
    openCohortes(store)
    await screen.findByTestId('cohorte-liste')

    await join(CODE)

    expect((await screen.findByTestId('cohorte-info')).textContent).toContain('votre consentement est enregistré')
    expect(within(screen.getByTestId('cohorte-liste')).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByTestId('cohorte-liste').textContent).toContain('(rejointe le 02/07/2026)')
    expect(mutations(server.requests)).toHaveLength(1)
  })

  it('UC-APP-08-F17 — A4 : quitter en deux temps → DELETE avec CSRF, consentement retiré, cohorte retirée de la liste', async () => {
    const server = createServer({ member: true, deposited: true })
    const { store } = await localPortfolios()
    openCohortes(store)
    await screen.findByTestId('cohorte-liste')

    fireEvent.click(screen.getByRole('button', { name: 'Quitter la cohorte' }))
    expect(mutations(server.requests)).toEqual([]) // premier clic = armement
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le départ' }))

    expect((await screen.findByTestId('cohorte-info')).textContent).toBe(
      'Vous avez quitté la cohorte « BTS SIO 2026 » : votre consentement est retiré pour la suite. ' +
        'Les cartographies déjà produites dans ce cadre restent à vous.',
    )
    const [quit] = mutations(server.requests)
    expect(quit).toMatchObject({ method: 'DELETE', path: 'cohortes/7/quitter' })
    expect(quit.headers['X-CSRF-Token']).toBe(APPS_CSRF)
    expect(await screen.findByText('Vous n’avez rejoint aucune cohorte pour l’instant.')).toBeDefined()
  })

  it('UC-APP-08-F18 — A6 : aucun portfolio local → lien vers le module portfolio, pas de dépôt possible', async () => {
    createServer({ member: true })
    const { store } = await localPortfolios(false)
    openCohortes(store)

    const item = within(await screen.findByTestId('cohorte-liste')).getByRole('listitem')
    expect(within(item).getByRole('link', { name: 'créez d’abord un portfolio' }).getAttribute('href')).toBe('#/portfolio')
    expect(within(item).queryByRole('button', { name: 'Déposer dans la cohorte' })).toBeNull()
  })

  it('UC-APP-08-F19 — A7 : visiteur non connecté → invitation à se connecter, aucun formulaire ni appel aux cohortes', async () => {
    const server = createServer({ user: null })
    const { store } = await localPortfolios()
    openCohortes(store)
    // D'abord la session résolue « anonyme » : le bloc anonyme s'affiche aussi
    // pendant le chargement (anomalie 4), il ne prouve rien avant.
    await screen.findByTestId('espace-anonyme')

    expect(screen.getByTestId('cohortes-anonyme').textContent).toContain('nécessite un compte')
    expect(screen.queryByLabelText('Code d’invitation')).toBeNull()
    expect(server.requests.map((r) => r.path)).toEqual(['auth/me'])
  })

  it('UC-APP-08-F20 — E1 : sans case cochée le bouton reste inactif ; code vide refusé localement', async () => {
    const server = createServer()
    const { store } = await localPortfolios()
    openCohortes(store)

    await join(CODE, { consent: false })
    expect(screen.getByRole('button', { name: 'Rejoindre la cohorte' }).disabled).toBe(true)
    expect(mutations(server.requests)).toEqual([])

    fireEvent.change(screen.getByLabelText('Code d’invitation'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /consentement explicite/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre la cohorte' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Saisissez le code d’invitation transmis par votre établissement.',
    )
    expect(mutations(server.requests)).toEqual([])
  })

  it.each([
    ['E2 — code inconnu', 'ZZZZZZZZZZ', 'Cohorte introuvable'],
    // Anomalie figée (fiche) : message technique anglais de Slim affiché tel quel.
    ['E3 — code mal formé (anomalie figée)', 'ABC', '404 Not Found'],
  ])('UC-APP-08-F21 — %s → message affiché, aucune adhésion', async (_label, code, message) => {
    const server = createServer()
    const { store } = await localPortfolios()
    openCohortes(store)

    await join(code)

    expect((await screen.findByRole('alert')).textContent).toBe(message)
    expect(server.state.member).toBe(false)
    expect(screen.getByText('Vous n’avez rejoint aucune cohorte pour l’instant.')).toBeDefined()
  })

  it('UC-APP-08-F22 — E5 : dépôt refusé par le serveur (422) → message, cohorte toujours « non déposé »', async () => {
    createServer({
      member: true,
      onDeposit: () =>
        jsonResponse(422, { error: 'Validation échouée', fields: { segments: 'date en double dans les segments : 2026-01-05' } }),
    })
    const { store, record } = await localPortfolios()
    openCohortes(store)

    fireEvent.change(await screen.findByLabelText('Portfolio à déposer'), { target: { value: record.id } })
    fireEvent.click(screen.getByRole('button', { name: 'Déposer dans la cohorte' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Validation échouée')
    expect(screen.getByTestId('cohorte-liste').textContent).toContain('Portfolio non déposé')
    expect(screen.queryByTestId('cohorte-info')).toBeNull()
  })

  it('UC-APP-08-F24 — anomalie 4 figée : pendant la vérification de session, et sur la copie statique, la vue invite à se connecter', async () => {
    // Comportement ACTUEL (fiche, anomalie 4) : CohorteSection traite les
    // états « loading » et « unavailable » comme l'état anonyme.
    const { store } = await localPortfolios()
    const pending = vi.fn(() => new Promise(() => {}))
    render(<EspaceView section="cohortes" deps={{ portfolioStore: store, fetchMeFn: pending }} />)
    expect(screen.getByTestId('cohortes-anonyme').textContent).toContain('nécessite un compte : connectez-vous')
    expect(pending).toHaveBeenCalled()
    expect(screen.queryByTestId('espace-connecte')).toBeNull()
    expect(screen.queryByTestId('espace-anonyme')).toBeNull() // la session n'est pas encore connue
    cleanup()

    // Copie statique (API absente) : se connecter y est impossible, l'invitation demeure.
    render(
      <EspaceView
        section="cohortes"
        deps={{ portfolioStore: store, fetchMeFn: () => Promise.reject(new ApiUnavailableError()) }}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('cohortes-anonyme')).toBeDefined())
    expect(screen.getByTestId('cohortes-anonyme').textContent).toContain('connectez-vous')
    expect(screen.getByRole('link', { name: 'connectez-vous' }).getAttribute('href')).toBe('#/compte')
  })

  it('UC-APP-08-F25 — E7 : compte sans rôle apprenant (établissement) → formulaire affiché, liste vide et alerte « Rôle insuffisant », aucune mutation', async () => {
    const server = createServer({ user: { ...ELISE, displayName: 'Lycée Astrolabe', roles: ['etablissement'] } })
    const { store } = await localPortfolios()
    openCohortes(store)

    expect((await screen.findByRole('alert')).textContent).toBe('Rôle insuffisant')
    expect(screen.getByLabelText('Code d’invitation')).toBeDefined()
    expect(screen.getByText('Vous n’avez rejoint aucune cohorte pour l’instant.')).toBeDefined()
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET auth/me', 'GET cohortes'])
    expect(mutations(server.requests)).toEqual([])
  })
})
