// UC-ADM-02 — Gérer le Golden Prompt et ses accès : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/administration/UC-ADM-02-gerer-golden-prompt.md
//
// L'administrateur joue le scénario sur l'application ENTIÈRE (<App/>, route
// #/admin/golden) : seul le réseau est simulé, par un petit serveur factice à
// état qui répond comme routes/admin.php + GoldenRepository (statuts et
// messages repris de l'API, dont la logique est testée côté PHP).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { API_UNAVAILABLE_MESSAGE, resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import pkgFixture from '../../../../schemas/fixtures/prompt-package-exemple.json'
import { ADMIN, PROMPTOLOGUE, authMe, clone, jsonResponse, stubNetwork } from '../support/banc.js'

// Scénarios bout à bout (vrai moteur, dizaines d'appels LLM simulés) : marge
// pour une exécution parallèle chargée de toutes les suites.
vi.setConfig({ testTimeout: 30_000 })
const LONG = { timeout: 15_000 }
const GOLDEN = 'golden-reference'
const golden = (overrides = {}) => ({ ...clone(pkgFixture), id: GOLDEN, description: 'Golden de référence (privé).', ...overrides })

/** Serveur factice à état : liste, import (idempotent / immuable), autorisation. */
function fakeGoldenServer({ user = ADMIN, comptes = { 7: { displayName: 'Pom', email: 'pom@example.org', roles: ['promptologue'] } }, listStatus = 200 } = {}) {
  const paquets = [] // {id, packageId, description, versions, grants, contenus}
  const routes = {
    'api/auth/me': authMe(user),
    'GET api/admin/golden': () =>
      listStatus !== 200
        ? jsonResponse(listStatus, { error: 'Erreur interne' })
        : jsonResponse(200, paquets.map(({ contenus, ...meta }) => meta)),
    'POST api/admin/golden': ({ body }) => {
      const doc = body?.document
      if (!doc || !Array.isArray(doc.prompts) || doc.prompts.length === 0) {
        return jsonResponse(422, { error: 'Document prompt-package invalide' })
      }
      let paquet = paquets.find((p) => p.id === doc.id)
      if (paquet?.contenus[doc.version]) {
        return JSON.stringify(paquet.contenus[doc.version]) === JSON.stringify(doc)
          ? jsonResponse(200, { status: 'unchanged', id: doc.id, version: doc.version })
          : jsonResponse(409, { error: `La version ${doc.version} du Golden « ${doc.id} » existe déjà avec un contenu différent (versions immuables)` })
      }
      if (!paquet) {
        paquet = { id: doc.id, packageId: paquets.length + 4, description: doc.description ?? null, versions: [], grants: [], contenus: {} }
        paquets.push(paquet)
      }
      paquet.versions.push(doc.version)
      paquet.contenus[doc.version] = doc
      return jsonResponse(201, { status: 'imported', id: doc.id, version: doc.version })
    },
    [`POST api/admin/golden/${GOLDEN}/grant`]: ({ body }) => {
      const paquet = paquets.find((p) => p.id === GOLDEN)
      if (!paquet) return jsonResponse(404, { error: 'Golden Prompt introuvable' })
      if (!Number.isInteger(body?.userId) || body.userId <= 0) return jsonResponse(422, { error: 'Champ requis : userId (entier)' })
      const compte = comptes[body.userId]
      if (!compte) return jsonResponse(404, { error: 'Compte introuvable' })
      if (!compte.roles.includes('promptologue')) {
        return jsonResponse(422, { error: 'L\'accès au Golden Prompt ne peut être accordé qu\'à un compte promptologue' })
      }
      if (paquet.grants.some((g) => g.userId === body.userId)) {
        return jsonResponse(200, { status: 'unchanged', id: GOLDEN, userId: body.userId })
      }
      paquet.grants.push({ userId: body.userId, displayName: compte.displayName, email: compte.email, createdAt: '2026-07-10T09:30:00' })
      return jsonResponse(200, { status: 'granted', id: GOLDEN, userId: body.userId })
    },
  }
  return { routes, paquets }
}

function openGolden(server) {
  const net = stubNetwork(server.routes)
  window.location.hash = '#/admin/golden'
  render(<App lib={fakeLib} />)
  return net
}

async function importer(doc) {
  const zone = await screen.findByLabelText('Document prompt-package (JSON)', {}, LONG)
  fireEvent.change(zone, { target: { value: typeof doc === 'string' ? doc : JSON.stringify(doc) } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }))
  })
}

async function autoriser(userId) {
  const champ = await screen.findByLabelText('Autoriser un promptologue (identifiant de compte)', {}, LONG)
  fireEvent.change(champ, { target: { value: String(userId) } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Autoriser' }))
  })
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-ADM-02 — scénario nominal', () => {
  it('UC-ADM-02-F12 — nominal : liste vide, import privé, autorisation d’un promptologue, liste mise à jour', async () => {
    const server = fakeGoldenServer()
    const net = openGolden(server)

    // 2. État initial.
    expect(await screen.findByText('Aucun Golden Prompt importé pour l’instant.', {}, LONG)).toBeDefined()
    expect(screen.getByRole('button', { name: 'Importer' }).disabled).toBe(true)

    // 3-5. Import.
    await importer(golden())
    expect(await screen.findByText(`Golden « ${GOLDEN} » 1.0.0 importé (privé).`)).toBeDefined()
    expect(screen.getByLabelText('Document prompt-package (JSON)').value).toBe('')
    const [post] = net.calls((c) => c.url === 'api/admin/golden' && c.method === 'POST')
    expect(post.init.headers['X-CSRF-Token']).toBe('csrf-test')
    expect(JSON.parse(post.init.body)).toEqual({ document: golden() })
    const item = (await screen.findByRole('heading', { name: GOLDEN })).closest('li')
    expect(item.textContent).toContain('Versions : 1.0.0')
    expect(item.textContent).toContain('Promptologues autorisés : aucun')

    // 6-8. Autorisation.
    await autoriser(7)
    expect(await screen.findByText('Accès accordé au compte 7.')).toBeDefined()
    await waitFor(() => expect(within(item).getByRole('list').textContent).toBe('Pom (pom@example.org) — 10/07/2026'))
    expect(net.calls((c) => c.url === 'api/admin/golden' && c.method === 'GET')).toHaveLength(3) // montage + 2 rechargements
  })
})

describe('UC-ADM-02 — scénarios alternatifs', () => {
  it('UC-ADM-02-F13 — A1 + A2 : ré-import identique « inchangé » ; nouvelle version ajoutée à la liste', async () => {
    const server = fakeGoldenServer()
    openGolden(server)
    await screen.findByText('Aucun Golden Prompt importé pour l’instant.', {}, LONG)
    await importer(golden())
    await screen.findByText(`Golden « ${GOLDEN} » 1.0.0 importé (privé).`)

    await importer(golden())
    expect(await screen.findByText(`Golden « ${GOLDEN} » 1.0.0 déjà présent, inchangé.`)).toBeDefined()

    await importer(golden({ version: '1.1.0' }))
    await screen.findByText(`Golden « ${GOLDEN} » 1.1.0 importé (privé).`)
    await waitFor(() => expect(screen.getByRole('heading', { name: GOLDEN }).closest('li').textContent).toContain('Versions : 1.0.0, 1.1.0'))
  })

  it('UC-ADM-02-F14 — A3 : autoriser un compte déjà autorisé — « avait déjà accès »', async () => {
    const server = fakeGoldenServer()
    const net = openGolden(server)
    await screen.findByText('Aucun Golden Prompt importé pour l’instant.', {}, LONG)
    await importer(golden())
    await autoriser(7)
    await screen.findByText('Accès accordé au compte 7.')
    await autoriser(7)
    expect(await screen.findByText('Le compte 7 avait déjà accès.')).toBeDefined()
    // Côté IHM : deux demandes identiques envoyées, une seule ligne affichée.
    const posts = net.calls((c) => c.method === 'POST' && c.url.endsWith('/grant'))
    expect(posts.map((c) => JSON.parse(c.init.body))).toEqual([{ userId: 7 }, { userId: 7 }])
    const item = screen.getByRole('heading', { name: GOLDEN }).closest('li')
    await waitFor(() => expect(within(item).getAllByRole('listitem')).toHaveLength(1))
  })
})

describe('UC-ADM-02 — scénarios d’erreur', () => {
  it('UC-ADM-02-F15 — E1 : promptologue ou visiteur — espace réservé, aucune lecture des Golden', async () => {
    const netPro = openGolden(fakeGoldenServer({ user: PROMPTOLOGUE }))
    expect((await screen.findByTestId('admin-reserve', {}, LONG)).textContent).toContain(
      'Cet espace est réservé à l’administration de la plateforme.',
    )
    expect(screen.queryByLabelText('Document prompt-package (JSON)')).toBeNull()
    expect(netPro.calls('api/auth/me').length).toBeGreaterThan(0)
    expect(netPro.calls('api/admin/golden')).toHaveLength(0)
    cleanup()

    // Chaque rendu a son propre réseau simulé : on inspecte CELUI du visiteur.
    const netVisiteur = openGolden(fakeGoldenServer({ user: null }))
    expect(await screen.findByText(/Vous n’êtes pas connecté/, {}, LONG)).toBeDefined()
    expect(screen.getByTestId('admin-reserve')).toBeDefined()
    expect(netVisiteur.calls('api/auth/me').length).toBeGreaterThan(0)
    expect(netVisiteur.calls('api/admin/golden')).toHaveLength(0)
  })

  it('UC-ADM-02-F16 — E2 : JSON collé illisible — refus local, aucune requête', async () => {
    const net = openGolden(fakeGoldenServer())
    await screen.findByText('Aucun Golden Prompt importé pour l’instant.', {}, LONG)
    await importer('{"id": "golden-reference", ')
    expect((await screen.findByRole('alert')).textContent).toBe('Le document collé n’est pas un JSON valide.')
    expect(net.calls((c) => c.method === 'POST')).toHaveLength(0)
  })

  it('UC-ADM-02-F17 — E3 + E4 : document invalide (422) puis version immuable (409) — message de l’API', async () => {
    openGolden(fakeGoldenServer())
    await screen.findByText('Aucun Golden Prompt importé pour l’instant.', {}, LONG)
    await importer(golden({ prompts: [] }))
    expect((await screen.findByRole('alert')).textContent).toBe('Document prompt-package invalide')

    await importer(golden())
    await screen.findByText(`Golden « ${GOLDEN} » 1.0.0 importé (privé).`)
    await importer(golden({ description: 'Contenu modifié' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('versions immuables'))
  })

  it('UC-ADM-02-F18 — E6 + E7 : compte non promptologue (422) ou inconnu (404) — message, aucune autorisation', async () => {
    const server = fakeGoldenServer({
      comptes: { 3: { displayName: 'Lycée', email: 'lycee@example.org', roles: ['etablissement'] } },
    })
    const net = openGolden(server)
    await screen.findByText('Aucun Golden Prompt importé pour l’instant.', {}, LONG)
    await importer(golden())
    await autoriser(3)
    expect((await screen.findByRole('alert')).textContent).toBe(
      'L\'accès au Golden Prompt ne peut être accordé qu\'à un compte promptologue',
    )
    await autoriser(999)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Compte introuvable'))
    // Côté IHM : aucune autorisation affichée, aucun rechargement de la liste
    // après les refus (montage + rechargement après l'import seulement).
    const item = screen.getByRole('heading', { name: GOLDEN }).closest('li')
    expect(within(item).queryByRole('list')).toBeNull()
    expect(item.textContent).toContain('Promptologues autorisés : aucun')
    expect(net.calls((c) => c.url === 'api/admin/golden' && c.method === 'GET')).toHaveLength(2)
  })

  it('UC-ADM-02-F19 — E11 : liste indisponible (erreur serveur) — « Chargement impossible. » ; API injoignable — message d’indisponibilité', async () => {
    openGolden(fakeGoldenServer({ listStatus: 500 }))
    expect((await screen.findByRole('alert', {}, LONG)).textContent).toBe('Chargement impossible.')
    cleanup()

    // Réseau en échec (API injoignable) : ApiUnavailableError, son message est affiché.
    const server = fakeGoldenServer()
    server.routes['GET api/admin/golden'] = () => {
      throw new TypeError('network')
    }
    openGolden(server)
    expect((await screen.findByRole('alert', {}, LONG)).textContent).toBe(API_UNAVAILABLE_MESSAGE)
  })

  it('UC-ADM-02-F22 — E12 : API injoignable à l’import puis à l’autorisation — « Import impossible. », « Autorisation impossible. »', async () => {
    const server = fakeGoldenServer()
    const importer1 = server.routes['POST api/admin/golden']
    let panne = true
    server.routes['POST api/admin/golden'] = (req) => {
      if (panne) throw new TypeError('network')
      return importer1(req)
    }
    openGolden(server)
    await screen.findByText('Aucun Golden Prompt importé pour l’instant.', {}, LONG)
    await importer(golden())
    expect((await screen.findByRole('alert')).textContent).toBe('Import impossible.')
    expect(screen.getByLabelText('Document prompt-package (JSON)').value).not.toBe('') // saisie conservée

    panne = false
    await importer(golden())
    await screen.findByText(`Golden « ${GOLDEN} » 1.0.0 importé (privé).`)
    server.routes[`POST api/admin/golden/${GOLDEN}/grant`] = () => {
      throw new TypeError('network')
    }
    await autoriser(7)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Autorisation impossible.'))
    expect(screen.getByRole('heading', { name: GOLDEN }).closest('li').textContent).toContain('Promptologues autorisés : aucun')
  })
})
