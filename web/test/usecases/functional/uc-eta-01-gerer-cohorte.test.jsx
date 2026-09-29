// UC-ETA-01 — Créer et gérer une cohorte : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/etablissement/UC-ETA-01-gerer-cohorte.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) ouverte sur
// #/etablissement, comme le ferait le compte établissement : seule l'API est
// simulée (fetch global, formes réelles des réponses), la session et le jeton
// CSRF viennent de GET api/auth/me comme en production.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { resetApiClient } from '../../../src/api/client.js'
import {
  CSRF,
  LEARNER_USER,
  cohorteDetail,
  cohorteListItem,
  configProjection,
  jsonResponse,
  membre,
  noContent,
  openApp,
  PUBLISHED_PACKAGES,
  stubApi,
} from '../support/eta.js'

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

async function goTo(hash) {
  await act(async () => {
    window.location.hash = hash
  })
}

describe('UC-ETA-01 — l’établissement crée et gère ses cohortes', () => {
  it('UC-ETA-01-F08 — nominal : création, code affiché, liste rechargée, puis détail des membres', async () => {
    let cohortes = []
    const api = stubApi({
      'GET api/etablissement/cohortes': () => jsonResponse(200, cohortes),
      'GET api/etablissement/config': jsonResponse(200, configProjection()),
      'POST api/etablissement/cohortes': () => {
        cohortes = [cohorteListItem({ id: 8, nom: 'CAP Cuisine', codeInvitation: 'NOUVCODE42', membres: 0 })]
        return jsonResponse(201, { id: 8, codeInvitation: 'NOUVCODE42' })
      },
      'GET api/etablissement/cohortes/8': jsonResponse(
        200,
        cohorteDetail({
          id: 8,
          nom: 'CAP Cuisine',
          codeInvitation: 'NOUVCODE42',
          membres: [membre({ avancement: { jobsTotal: 3, jobsDone: 1 } })],
        }),
      ),
      'GET api/prompt-packages': jsonResponse(200, PUBLISHED_PACKAGES),
    })
    openApp('#/etablissement')

    // 1-2. Accueil : aucune cohorte encore.
    expect(await screen.findByText(/Aucune cohorte pour l’instant/)).toBeDefined()

    // 3. Saisie du nom puis création.
    fireEvent.change(screen.getByLabelText('Nom de la cohorte'), { target: { value: '  CAP Cuisine  ' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Créer la cohorte' }))
    })

    // 4-5. Code d'invitation à transmettre, tableau rechargé.
    const notice = await screen.findByTestId('etab-cohorte-creee')
    expect(notice.textContent).toContain('Cohorte « CAP Cuisine » créée.')
    expect(notice.textContent).toContain('NOUVCODE42')
    const [post] = api.callsTo('POST api/etablissement/cohortes')
    expect(post.body).toEqual({ nom: 'CAP Cuisine' })
    expect(post.headers['X-CSRF-Token']).toBe(CSRF)
    const table = await screen.findByTestId('etab-cohortes')
    expect(table.textContent).toContain('CAP Cuisine')
    expect(table.textContent).toContain('NOUVCODE42')
    expect(api.callsTo('GET api/etablissement/cohortes')).toHaveLength(2)

    // 7. Ouverture de la cohorte : code rappelé, membres suivis sans contenu.
    await goTo('#/etablissement/cohorte/8')
    expect(await screen.findByRole('heading', { name: 'Cohorte « CAP Cuisine »' })).toBeDefined()
    expect(screen.getByText('NOUVCODE42')).toBeDefined()
    const rows = within(await screen.findByTestId('etab-membres')).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('Maya')
    expect(rows[0].textContent).toContain('Consenti le 02/07/2026')
    expect(rows[0].textContent).toContain('« Journal Astrolabe » — 3 journée(s), déposé le 03/07/2026')
    expect(rows[0].textContent).toContain('1/3 journées')
  })

  it('UC-ETA-01-F09 — A1 : suppression en deux temps (armer puis confirmer), DELETE puis liste rechargée', async () => {
    let cohortes = [cohorteListItem()]
    const api = stubApi({
      'GET api/etablissement/cohortes': () => jsonResponse(200, cohortes),
      'GET api/etablissement/config': jsonResponse(200, configProjection()),
      'DELETE api/etablissement/cohortes/7': () => {
        cohortes = []
        return noContent()
      },
    })
    openApp('#/etablissement')
    await screen.findByTestId('etab-cohortes')

    // Premier clic : l'action est seulement armée, aucune requête.
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(screen.getByRole('button', { name: 'Confirmer la suppression' })).toBeDefined()
    expect(api.callsTo('DELETE api/etablissement/cohortes/7')).toHaveLength(0)

    // Second clic : suppression réelle, avec le jeton CSRF.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }))
    })
    const [del] = api.callsTo('DELETE api/etablissement/cohortes/7')
    expect(del.headers['X-CSRF-Token']).toBe(CSRF)
    expect(await screen.findByText(/Aucune cohorte pour l’instant/)).toBeDefined()
    expect(screen.queryByTestId('etab-cohortes')).toBeNull()
  })

  it('UC-ETA-01-F10 — E0, E1 : nom vide refusé localement (E0) ; refus du serveur (422) affiché (E1)', async () => {
    const api = stubApi({
      'GET api/etablissement/cohortes': jsonResponse(200, []),
      'GET api/etablissement/config': jsonResponse(200, configProjection()),
      'POST api/etablissement/cohortes': jsonResponse(422, {
        error: 'Validation échouée',
        fields: { nom: 'Nom requis (190 caractères maximum)' },
      }),
    })
    openApp('#/etablissement')
    await screen.findByLabelText('Nom de la cohorte')

    fireEvent.change(screen.getByLabelText('Nom de la cohorte'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer la cohorte' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Donnez un nom à la cohorte')
    expect(api.callsTo('POST api/etablissement/cohortes')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Nom de la cohorte'), { target: { value: 'x'.repeat(191) } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Créer la cohorte' }))
    })
    // Seul le message général est affiché : le détail fields.nom ne l'est pas.
    expect((await screen.findByRole('alert')).textContent).toBe('Validation échouée')
    expect(screen.queryByText(/190 caractères maximum/)).toBeNull()
    expect(screen.queryByTestId('etab-cohorte-creee')).toBeNull()
  })

  it('UC-ETA-01-F11 — E2 : cohorte inconnue ou étrangère (404) → message, aucune donnée affichée', async () => {
    stubApi({
      'GET api/etablissement/cohortes/99': jsonResponse(404, { error: 'Cohorte introuvable' }),
      'GET api/etablissement/config': jsonResponse(200, configProjection()),
      'GET api/prompt-packages': jsonResponse(200, PUBLISHED_PACKAGES),
    })
    openApp('#/etablissement/cohorte/99')

    expect((await screen.findByRole('alert')).textContent).toBe('Cohorte introuvable')
    expect(screen.queryByTestId('etab-membres')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Cohorte' })).toBeDefined()
    expect(screen.queryByText(/Code d’invitation/)).toBeNull()
    // Comportement ACTUEL (fiche, « Anomalies constatées ») : l'échec de
    // chargement laisse un état vide trompeur, comme pour une cohorte vide.
    expect(screen.getByText(/Aucun membre : transmettez le code d’invitation/)).toBeDefined()
  })

  it('UC-ETA-01-F12 — E3 : sans le rôle établissement (apprenant, visiteur) → espace réservé, aucun appel cohorte', async () => {
    const api = stubApi({}, { user: LEARNER_USER })
    openApp('#/etablissement', { user: LEARNER_USER })
    expect((await screen.findByTestId('etab-reserve')).textContent).toContain('réservé aux établissements')
    expect(screen.queryByLabelText('Nom de la cohorte')).toBeNull()
    expect(api.calls.some((c) => c.url.startsWith('api/etablissement/'))).toBe(false)
    cleanup()
    vi.unstubAllGlobals()

    const visitorApi = stubApi({}, { user: null })
    openApp('#/etablissement', { user: null })
    await screen.findByTestId('etab-reserve')
    expect(screen.getByText(/Connectez-vous/)).toBeDefined()
    expect(visitorApi.calls.some((c) => c.url.startsWith('api/etablissement/'))).toBe(false)
  })

  it('UC-ETA-01-F13 — erreur de chargement (500) : message affiché MAIS états vides trompeurs (comportement actuel)', async () => {
    // Accueil : la liste contient une cohorte, mais la configuration échoue ;
    // le Promise.all rejette et l'accueil affiche « aucune cohorte ».
    stubApi({
      'GET api/etablissement/cohortes': jsonResponse(200, [cohorteListItem()]),
      'GET api/etablissement/config': jsonResponse(500, { error: 'Erreur interne' }),
    })
    openApp('#/etablissement')
    expect((await screen.findByRole('alert')).textContent).toBe('Erreur interne')
    expect(screen.getByText(/Aucune cohorte pour l’instant/)).toBeDefined()
    expect(screen.queryByTestId('etab-cohortes')).toBeNull()
    cleanup()
    vi.unstubAllGlobals()

    // Page cohorte : la cohorte a un membre, mais la liste des paquets échoue ;
    // la page affiche « aucun membre » et « aucun paquet publié ».
    stubApi({
      'GET api/etablissement/cohortes/7': jsonResponse(200, cohorteDetail()),
      'GET api/etablissement/config': jsonResponse(200, configProjection()),
      'GET api/prompt-packages': jsonResponse(500, { error: 'Erreur interne' }),
    })
    openApp('#/etablissement/cohorte/7')
    expect((await screen.findByRole('alert')).textContent).toBe('Erreur interne')
    expect(screen.getByText(/Aucun membre : transmettez le code d’invitation/)).toBeDefined()
    expect(screen.getByText(/Aucun paquet de prompts publié n’est disponible/)).toBeDefined()
    expect(screen.queryByTestId('etab-membres')).toBeNull()
  })

  it('UC-ETA-01-F14 — E5 : API injoignable (copie statique) → message dédié, aucun appel cohorte', async () => {
    const api = stubApi({
      'GET api/auth/me': () => {
        throw new TypeError('Failed to fetch')
      },
    })
    openApp('#/etablissement')

    expect((await screen.findByText(/Copie statique du site/)).textContent).toContain(
      'l’espace établissement a besoin de l’API',
    )
    expect(screen.queryByTestId('etab-reserve')).toBeNull()
    expect(screen.queryByLabelText('Nom de la cohorte')).toBeNull()
    expect(api.calls.some((c) => c.url.startsWith('api/etablissement/'))).toBe(false)
  })
})

describe('UC-ETA-01 — section inconnue de l’espace établissement (E6)', () => {
  it('UC-ETA-01-F15 — E6 : #/etablissement/cohortes/7 → alerte citant le segment, lien de retour ; aucun appel api/etablissement ni paquets ; la garde de rôle passe avant', async () => {
    const api = stubApi()
    // « cohortes/7 » (pluriel, comme l'URL de l'API) n'est pas « cohorte/<id> ».
    openApp('#/etablissement/cohortes/7')

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Section inconnue de l’espace établissement : « cohortes/7 ».',
    )
    expect(screen.getByTestId('etab-connecte').textContent).toContain('Lycée Astrolabe')
    const back = screen.getByRole('link', { name: 'Retour à l’accueil de l’espace' })
    expect(back.getAttribute('href')).toBe('#/etablissement')
    // Aucune section montée : ni accueil (création), ni détail de cohorte.
    expect(screen.queryByLabelText('Nom de la cohorte')).toBeNull()
    expect(screen.queryByTestId('etab-membres')).toBeNull()
    await act(async () => {})
    expect(api.calls.map((c) => c.key)).toEqual(['GET api/auth/me'])

    // Le lien de retour ramène à l'accueil, qui charge alors cohortes et configuration.
    fireEvent.click(back)
    expect(await screen.findByLabelText('Nom de la cohorte')).toBeDefined()
    expect(window.location.hash).toBe('#/etablissement')
    expect(screen.queryByText(/Section inconnue/)).toBeNull()
    expect(api.callsTo('GET api/etablissement/cohortes')).toHaveLength(1)
    expect(api.callsTo('GET api/auth/me')).toHaveLength(1)
    cleanup()
    vi.unstubAllGlobals()

    // Compte apprenant sur la même URL : espace réservé, pas le message de section.
    const learnerApi = stubApi({}, { user: LEARNER_USER })
    openApp('#/etablissement/cohortes/7', { user: LEARNER_USER })
    expect((await screen.findByTestId('etab-reserve')).textContent).toContain('réservé aux établissements')
    expect(screen.queryByText(/Section inconnue/)).toBeNull()
    expect(learnerApi.calls.map((c) => c.key)).toEqual(['GET api/auth/me'])
    cleanup()
    vi.unstubAllGlobals()

    // Comportement ACTUEL (anomalie AN1 de UC-VIS-02, commune aux routes à
    // section) : un segment au pourcentage mal formé n'atteint pas ce repli.
    // App calcule sa route au premier rendu (useState(currentRoute)) : le
    // rendu lui-même lève une URIError — ni shell, ni vérification de session.
    const brokenApi = stubApi()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => openApp('#/etablissement/100%')).toThrow(URIError)
    } finally {
      consoleError.mockRestore()
    }
    expect(document.body.textContent).toBe('')
    expect(brokenApi.calls).toEqual([])
  })
})
