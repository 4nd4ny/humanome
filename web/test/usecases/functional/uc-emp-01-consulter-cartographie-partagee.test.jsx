// UC-EMP-01 — Consulter une cartographie partagée : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/employeur/UC-EMP-01-consulter-cartographie-partagee.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) comme le ferait
// l'employeur : il ouvre le lien #/partage/<jeton>, saisit le mot de passe reçu
// et lit la cartographie. Seul le réseau est simulé (fetch global) : le shell
// garde sa vraie sonde de session (fetchMe → GET api/auth/me, 401 pour un
// navigateur sans session) et le client API réel. Le module sunburst est le
// faux module de test (contrat de web/src/lib/sunburst/), sauf pour F16 qui
// exige le vrai module pour reproduire l'anomalie AN1.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Component } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import * as sunburstLib from '../../../src/lib/sunburst/index.js'
import dayFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import mergeFixture from '../../../../schemas/fixtures/cartographie-merge-3-jours.json'

const TOKEN = '0123456789abcdef0123456789abcdef'
const SHARE_URL = `api/share/${TOKEN}`

/** carto_evolutive Twin9 minimal (même forme que CartographyViewer.test.jsx). */
const CARTO_TWIN9 = {
  journal_id: 'demo',
  date: '2026-03-10',
  periode: { debut: '2026-03-02', fin: '2026-03-02', n_journees: 1 },
  competences: {
    '1.01': {
      code: '1.01',
      nom: 'Pensée critique',
      pole: 1,
      attestations: [
        { jour_index: 0, journee: 'J01', date: '2026-03-02', confiance: 0.8, score_preuves: 2, score_indices: 1 },
      ],
      signaux: [],
    },
  },
  histoires: { '1.01': 'Une histoire attestée.' },
  kairos_evolutif: 'Synthèse évolutive.',
}

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

/** Navigateur sans session : la sonde du shell répond 401 (visiteur = absence de session). */
const anonymousMe = () => jsonResponse(401, { error: 'Authentification requise' })

/**
 * Réseau simulé : la sonde de session et la route de partage répondent, le
 * reste est absent (le référentiel publié retombe sur la copie embarquée).
 */
function stubNetwork(shareAnswer, { me = anonymousMe } = {}) {
  const fetchMock = vi.fn(async (url) => {
    const target = String(url)
    if (target === 'api/auth/me') return me()
    if (target === SHARE_URL) return shareAnswer()
    return jsonResponse(404, { error: 'absent' })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const calledUrls = (fetchMock) => fetchMock.mock.calls.map(([url]) => String(url))

/** Ouvre le lien reçu ; attend que la sonde de session du shell soit résolue. */
async function openSharedLink({ lib = fakeLib, wrap = (app) => app } = {}) {
  window.location.hash = `#/partage/${TOKEN}`
  render(wrap(<App lib={lib} />))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function submitPassword(value) {
  fireEvent.change(screen.getByLabelText('Mot de passe du lien'), { target: { value } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Consulter la cartographie' }))
  })
}

/**
 * Sonde de test placée AU-DESSUS de <App/> : elle ne reçoit une erreur de
 * rendu que si aucun composant de l'application ne l'a interceptée. En
 * production (pas de sonde), React 18 démonte alors tout l'arbre : page blanche.
 */
class RenderCrashProbe extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    this.props.onCrash(error)
  }

  render() {
    return this.state.error ? <p data-testid="crash-probe">{String(this.state.error)}</p> : this.props.children
  }
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-EMP-01 — l’employeur consulte le lien reçu', () => {
  it('UC-EMP-01-F10 — nominal : bandeau, mot de passe, puis journée rendue en lecture seule', async () => {
    const fetchMock = stubNetwork(() =>
      jsonResponse(200, { titre: 'Journée du 5 janvier', type: 'jour', document: dayFixture, garantie: null }),
    )
    await openSharedLink()

    // 1. Le lien ouvre l'écran de déverrouillage public. ShareView n'appelle
    //    pas l'API de partage ; seul le shell sonde la session (401 ici).
    expect(screen.getByRole('heading', { name: 'Cartographie partagée' })).toBeDefined()
    expect(screen.getByRole('note').textContent).toContain('Cartographie partagée par son auteur')
    expect(calledUrls(fetchMock)).toEqual(['api/auth/me'])

    // 2-3. Saisie du mot de passe transmis par l'apprenant.
    await submitPassword('sesame-employeur')

    // 6. La cartographie s'affiche (vue journée), sans formulaire ni mention de garantie.
    expect(await screen.findByRole('heading', { name: 'Journée du 5 janvier' })).toBeDefined()
    expect(await screen.findByText('Journée du 05/01/2026')).toBeDefined()
    expect(document.querySelector('.day-view')).not.toBeNull()
    expect(document.querySelector('.merge-view')).toBeNull()
    expect(screen.queryByLabelText('Mot de passe du lien')).toBeNull()
    expect(screen.queryByTestId('share-garantie')).toBeNull()
    const [, init] = fetchMock.mock.calls.find(([url]) => url === SHARE_URL)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ password: 'sesame-employeur' })
    expect(init.headers['X-CSRF-Token']).toBeUndefined()
    // Après l'ouverture : le POST de partage et, au premier déverrouillage
    // (cache du module), le référentiel publié — rien d'autre.
    expect(
      calledUrls(fetchMock)
        .slice(1)
        .every((url) => url === SHARE_URL || url.startsWith('data/referentiel/')),
    ).toBe(true)
  })

  it('UC-EMP-01-F11 — A1 : cartographie fusionnée garantie → mention « garantie par » et vue chronologique', async () => {
    stubNetwork(() =>
      jsonResponse(200, {
        titre: 'Mon parcours',
        type: 'merge',
        document: mergeFixture,
        garantie: { par: 'Camille', date: '2026-07-10T09:00:00', revisionId: 4 },
      }),
    )
    await openSharedLink()
    await submitPassword('sesame-employeur')

    expect(await screen.findByRole('heading', { name: 'Mon parcours' })).toBeDefined()
    const mention = await screen.findByTestId('share-garantie')
    expect(mention.textContent).toContain('garantie par Camille')
    expect(mention.textContent).toContain('2026-07-10')
    // Le titre et la mention précèdent le chargement du référentiel : on
    // attend la vue chronologique elle-même (MergeView), pas DayView.
    await waitFor(() => expect(document.querySelector('.merge-view')).not.toBeNull())
    expect(document.querySelector('.day-view')).toBeNull()
  })

  it('UC-EMP-01-F12 — E0 : mot de passe trop court refusé localement, aucune requête', async () => {
    const fetchMock = stubNetwork(() => jsonResponse(200, {}))
    await openSharedLink()
    await submitPassword('court')

    expect((await screen.findByRole('alert')).textContent).toContain('au moins 8 caractères')
    expect(calledUrls(fetchMock).includes(SHARE_URL)).toBe(false)
  })

  it('UC-EMP-01-F13 — E1 : mauvais mot de passe → message, le formulaire reste disponible pour réessayer', async () => {
    let calls = 0
    stubNetwork(() => {
      calls += 1
      return calls === 1
        ? jsonResponse(403, { error: 'Mot de passe incorrect' })
        : jsonResponse(200, { titre: 'Seconde chance', type: 'jour', document: dayFixture, garantie: null })
    })
    await openSharedLink()

    await submitPassword('mauvais-mdp')
    expect((await screen.findByRole('alert')).textContent).toBe('Mot de passe incorrect.')
    expect(screen.getByLabelText('Mot de passe du lien')).toBeDefined()

    await submitPassword('sesame-employeur')
    expect(await screen.findByRole('heading', { name: 'Seconde chance' })).toBeDefined()
  })

  it('UC-EMP-01-F14 — E3 : lien inconnu, expiré ou révoqué → un seul message neutre', async () => {
    stubNetwork(() => jsonResponse(404, { error: 'Lien de partage introuvable ou expiré' }))
    await openSharedLink()
    await submitPassword('sesame-employeur')

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Ce lien de partage n’existe pas, a expiré ou a été révoqué par son auteur.',
    )
  })

  it('UC-EMP-01-F15 — E4 : trop de tentatives → invitation à patienter', async () => {
    stubNetwork(() => jsonResponse(429, { error: 'Trop de tentatives, réessayez plus tard' }))
    await openSharedLink()
    await submitPassword('sesame-employeur')

    expect((await screen.findByRole('alert')).textContent).toContain('Patientez quelques minutes')
  })

  it('UC-EMP-01-F16 — AN1 : une analyse Twin9 partagée fait planter le rendu (DayView → buildDayTree) — comportement actuel', async () => {
    // ANOMALIE AN1 (fiche) — comportement ACTUEL figé, pas le comportement
    // voulu : ShareView ne distingue que « merge » et passe tout autre type à
    // DayView ; un carto_evolutive Twin9 (pas de tableau `poles`) fait lever
    // une TypeError au vrai buildDayTree, qu'aucun composant de l'application
    // n'intercepte. CartographyViewer sait pourtant traiter ce type
    // (twin9ToMergeDocument → MergeView). À corriger dans ShareView ; ce test
    // devra alors vérifier le rendu MergeView.
    const crashes = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const swallow = (event) => event.preventDefault()
    window.addEventListener('error', swallow)
    try {
      stubNetwork(() =>
        jsonResponse(200, { titre: 'Analyse Twin9', type: 'twin9', document: CARTO_TWIN9, garantie: null }),
      )
      await openSharedLink({
        lib: sunburstLib,
        wrap: (app) => <RenderCrashProbe onCrash={(error) => crashes.push(error)}>{app}</RenderCrashProbe>,
      })
      await submitPassword('sesame-employeur')

      await waitFor(() => expect(crashes.length).toBeGreaterThan(0))
      expect(crashes[0].name).toBe('TypeError')
      expect(crashes[0].message).toContain('forEach')
      // L'erreur a traversé toute l'application : plus de bandeau, de titre ni
      // de vue de partage (en production : page blanche).
      expect(screen.getByTestId('crash-probe')).toBeDefined()
      expect(screen.queryByRole('note')).toBeNull()
      expect(screen.queryByRole('heading', { name: 'Analyse Twin9' })).toBeNull()
      expect(document.querySelector('.share-view')).toBeNull()
    } finally {
      window.removeEventListener('error', swallow)
    }
  })

  it('UC-EMP-01-F23 — A3 : navigateur connecté → le shell obtient le jeton CSRF (GET api/auth/me) et le POST de partage le renvoie', async () => {
    const fetchMock = stubNetwork(
      () => jsonResponse(200, { titre: 'Journée du 5 janvier', type: 'jour', document: dayFixture, garantie: null }),
      {
        me: () =>
          jsonResponse(200, {
            user: { id: 7, displayName: 'Recruteur', roles: ['apprenant'], hasAvatar: false },
            csrfToken: 'csrf-de-la-session',
          }),
      },
    )
    await openSharedLink()
    expect(calledUrls(fetchMock)).toEqual(['api/auth/me'])

    await submitPassword('sesame-employeur')

    expect(await screen.findByRole('heading', { name: 'Journée du 5 janvier' })).toBeDefined()
    const [, init] = fetchMock.mock.calls.find(([url]) => url === SHARE_URL)
    expect(init.headers['X-CSRF-Token']).toBe('csrf-de-la-session')
    expect(JSON.parse(init.body)).toEqual({ password: 'sesame-employeur' })
  })

  it('UC-EMP-01-F24 — AN2 : cookie de session périmé → le 403 CSRF est affiché « Mot de passe incorrect. » — comportement actuel', async () => {
    // ANOMALIE AN2 (fiche) — comportement ACTUEL figé : le navigateur garde un
    // cookie que le serveur ne connaît plus ; GET api/auth/me répond 401 sans
    // csrfToken, le POST part sans X-CSRF-Token et le middleware CSRF répond
    // 403 (cf. UC-EMP-01-F22). ShareView traduit TOUT 403 en « Mot de passe
    // incorrect. » alors que le mot de passe saisi est le bon.
    const fetchMock = stubNetwork(() => jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' }))
    await openSharedLink()

    await submitPassword('sesame-employeur')

    expect((await screen.findByRole('alert')).textContent).toBe('Mot de passe incorrect.')
    const [, init] = fetchMock.mock.calls.find(([url]) => url === SHARE_URL)
    expect(init.headers['X-CSRF-Token']).toBeUndefined()
    expect(screen.getByLabelText('Mot de passe du lien')).toBeDefined()
  })
})
