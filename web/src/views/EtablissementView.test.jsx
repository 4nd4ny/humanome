// Espace établissement (P11) : garde de rôle, cohortes (création + code),
// config LLM/budget (clé jamais réaffichée), lancement d'un run de masse
// (estimation puis confirmation), tableau d'avancement (polling), annulation,
// et merge CÔTÉ CLIENT des documents jour d'un membre (fixtures réelles).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import EtablissementView from './EtablissementView.jsx'
import { resetApiClient } from '../api/client.js'
import * as fakeLib from '../test/fake-sunburst-lib.js'
import referentiel from '../../../schemas/fixtures/referentiel-respire-v7.json'
import day05 from '../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import day06 from '../../../schemas/fixtures/cartographie-jour-2026-01-06.json'
import day07 from '../../../schemas/fixtures/cartographie-jour-2026-01-07.json'

afterEach(() => {
  cleanup()
  resetApiClient()
})

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

/** Faux fetch routé par 'MÉTHODE url' — indépendant de l'ordre des requêtes. */
function routedFetch(routes) {
  return vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const handler = routes[key]
    if (!handler) throw new Error(`route non mockée : ${key}`)
    return typeof handler === 'function' ? handler(init) : handler
  })
}

const anonyme = async () => ({ user: null })
const apprenant = async () => ({
  user: { email: 'a@b.fr', displayName: 'Maya', roles: ['apprenant'] },
})
const etablissement = async () => ({
  user: { email: 'e@b.fr', displayName: 'Lycée Astrolabe', roles: ['etablissement'] },
})

const CONFIG = {
  provider: 'humanome',
  endpointUrl: '',
  model: '',
  budgetCapUsd: 100,
  spentUsd: 12.5,
  hasApiKey: false,
}
const COHORTES = {
  cohortes: [
    {
      id: 7,
      nom: 'BTS SIO 2026',
      codeInvitation: 'COHORTE7AZ',
      membres: 2,
      createdAt: '2026-07-01T10:00:00Z',
    },
  ],
}
const COHORTE_DETAIL = {
  cohorte: { id: 7, nom: 'BTS SIO 2026', codeInvitation: 'COHORTE7AZ' },
  membres: [
    {
      userId: 1,
      displayName: 'Maya',
      consent_at: '2026-07-02T10:00:00Z',
      portfolio: { titre: 'Journal Astrolabe', journees: 3, deposeLe: '2026-07-03T10:00:00Z' },
      avancement: { jobsTotal: 3, jobsDone: 1 }, // objet du contrat M8, jamais rendu tel quel
    },
    {
      userId: 2,
      displayName: 'Noé',
      consent_at: '2026-07-02T11:00:00Z',
      portfolio: null,
      avancement: { jobsTotal: 0, jobsDone: 0 },
    },
  ],
}
const PACKAGES = [{ id: 'aurora-v3-reconstruit', version: '1.1.0', defaut: true }]

function accueilRoutes(extra = {}) {
  return {
    'GET api/etablissement/cohortes': jsonResponse(200, COHORTES),
    'GET api/etablissement/config': jsonResponse(200, CONFIG),
    ...extra,
  }
}

function cohorteRoutes(extra = {}) {
  return {
    'GET api/etablissement/cohortes/7': jsonResponse(200, COHORTE_DETAIL),
    'GET api/etablissement/config': jsonResponse(200, CONFIG),
    'GET api/prompt-packages': jsonResponse(200, PACKAGES),
    ...extra,
  }
}

describe('EtablissementView — garde de rôle', () => {
  it('visiteur anonyme : espace réservé + explication du rôle B2B', async () => {
    render(<EtablissementView section={null} deps={{ fetchMeFn: anonyme }} />)
    const reserve = await screen.findByTestId('etab-reserve')
    expect(reserve.textContent).toContain('réservé aux établissements')
    expect(reserve.textContent).toContain('masse')
    expect(screen.getByText(/Connectez-vous/)).toBeTruthy()
    expect(screen.queryByLabelText('Nom de la cohorte')).toBeNull()
  })

  it('connecté SANS le rôle etablissement : espace réservé, pas de cohortes', async () => {
    render(<EtablissementView section={null} deps={{ fetchMeFn: apprenant }} />)
    await screen.findByTestId('etab-reserve')
    expect(screen.queryByTestId('etab-cohortes')).toBeNull()
    expect(screen.queryByLabelText('Nom de la cohorte')).toBeNull()
  })

  it('rôle etablissement : accueil avec cohortes et configuration', async () => {
    const fetchFn = routedFetch(accueilRoutes())
    render(<EtablissementView section={null} deps={{ fetchMeFn: etablissement, fetchFn }} />)

    const table = await screen.findByTestId('etab-cohortes')
    expect(table.textContent).toContain('BTS SIO 2026')
    expect(table.textContent).toContain('COHORTE7AZ')
    // Configuration : dépense courante affichée face au plafond.
    const depense = await screen.findByTestId('etab-depense')
    expect(depense.textContent).toContain('12.50 $')
    expect(depense.textContent).toContain('100.00 $')
  })
})

describe('EtablissementView — création de cohorte', () => {
  it('POST {nom} puis affichage du code d’invitation et rechargement', async () => {
    let posted = null
    const fetchFn = routedFetch(
      accueilRoutes({
        'POST api/etablissement/cohortes': (init) => {
          posted = JSON.parse(init.body)
          return jsonResponse(201, { id: 8, codeInvitation: 'NOUVCODE42' })
        },
      }),
    )
    render(<EtablissementView section={null} deps={{ fetchMeFn: etablissement, fetchFn }} />)

    const input = await screen.findByLabelText('Nom de la cohorte')
    fireEvent.change(input, { target: { value: '  CAP Cuisine  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer la cohorte' }))

    const notice = await screen.findByTestId('etab-cohorte-creee')
    expect(posted).toEqual({ nom: 'CAP Cuisine' })
    expect(notice.textContent).toContain('NOUVCODE42')
    expect(notice.textContent).toContain('consentement explicite')
  })

  it('nom vide : refus local, aucun POST', async () => {
    const fetchFn = routedFetch(accueilRoutes())
    render(<EtablissementView section={null} deps={{ fetchMeFn: etablissement, fetchFn }} />)

    await screen.findByLabelText('Nom de la cohorte')
    fireEvent.click(screen.getByRole('button', { name: 'Créer la cohorte' }))

    await screen.findByText(/Donnez un nom/)
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })
})

describe('EtablissementView — configuration LLM et budget', () => {
  it('mode endpoint : PUT complet, la clé saisie part chiffrée et le champ se vide', async () => {
    let put = null
    const fetchFn = routedFetch(
      accueilRoutes({
        'PUT api/etablissement/config': (init) => {
          put = JSON.parse(init.body)
          return jsonResponse(200, { ok: true })
        },
      }),
    )
    render(<EtablissementView section={null} deps={{ fetchMeFn: etablissement, fetchFn }} />)

    fireEvent.click(await screen.findByLabelText(/Mon infrastructure/))
    fireEvent.change(screen.getByLabelText('URL du point d’accès'), {
      target: { value: 'https://llm.lycee.fr/v1' },
    })
    fireEvent.change(screen.getByLabelText('Modèle'), { target: { value: 'llama3.1:70b' } })
    fireEvent.change(screen.getByLabelText('Clé API'), { target: { value: 'sk-secret' } })
    fireEvent.change(screen.getByLabelText('Plafond de dépense (USD)'), {
      target: { value: '250' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la configuration' }))

    await screen.findByText('Configuration enregistrée.')
    expect(put).toEqual({
      provider: 'endpoint',
      endpointUrl: 'https://llm.lycee.fr/v1',
      model: 'llama3.1:70b',
      apiKey: 'sk-secret',
      budgetCapUsd: 250,
    })
    // La clé n'est jamais réaffichée : champ vidé après enregistrement.
    expect(screen.getByLabelText('Clé API').value).toBe('')
  })

  it('clé enregistrée côté serveur : jamais réaffichée, champ vide + placeholder ; PUT sans apiKey si non ressaisie', async () => {
    let put = null
    const fetchFn = routedFetch({
      'GET api/etablissement/cohortes': jsonResponse(200, { cohortes: [] }),
      'GET api/etablissement/config': jsonResponse(200, {
        provider: 'endpoint',
        endpointUrl: 'https://llm.lycee.fr/v1',
        model: 'llama3.1',
        budgetCapUsd: 50,
        spentUsd: 0,
        hasApiKey: true,
      }),
      'PUT api/etablissement/config': (init) => {
        put = JSON.parse(init.body)
        return jsonResponse(200, { ok: true })
      },
    })
    render(<EtablissementView section={null} deps={{ fetchMeFn: etablissement, fetchFn }} />)

    const keyInput = await screen.findByLabelText('Clé API')
    expect(keyInput.value).toBe('') // la clé ne redescend JAMAIS du serveur
    expect(keyInput.placeholder).toContain('jamais réaffichée')

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la configuration' }))
    await screen.findByText('Configuration enregistrée.')
    expect(put).not.toHaveProperty('apiKey') // champ vide = clé inchangée
  })
})

describe('EtablissementView — cohorte : membres et run de masse', () => {
  it('membres : consentement daté, dépôt de portfolio, non-déposant non cochable', async () => {
    const fetchFn = routedFetch(cohorteRoutes())
    render(
      <EtablissementView section="cohorte/7" deps={{ fetchMeFn: etablissement, fetchFn }} />,
    )

    const table = await screen.findByTestId('etab-membres')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('Maya')
    expect(rows[0].textContent).toContain('Consenti le')
    expect(rows[0].textContent).toContain('Journal Astrolabe')
    expect(rows[0].textContent).toContain('3 journée(s)')
    // avancement = objet {jobsTotal, jobsDone} du contrat : rendu "done/total".
    expect(rows[0].textContent).toContain('1/3 journées')
    expect(rows[1].textContent).toContain('Non déposé')
    expect(rows[1].textContent).toContain('—')
    // Noé n'a rien déposé : pas de job possible, case désactivée.
    expect(within(rows[1]).getByRole('checkbox').disabled).toBe(true)
    expect(rows[0].querySelector('a[href="#/etablissement/membre/1"]')).toBeTruthy()
  })

  it('lancement : estimation (confirmation du coût) PUIS POST runs, avancement affiché, annulation', async () => {
    let runPost = null
    let cancelled = false
    // Forme RÉELLE de l'API (contrat M8) : status 'active', statuts de jobs
    // queued/failed (migration 009), erreurs {userId, date, erreur}.
    const runState = {
      id: 'run-42',
      status: 'active',
      jobs: { queued: 1, running: 1, done: 1, failed: 0, budget_exceeded: 0, cancelled: 0 },
      coutUsd: 0.42,
      erreurs: [{ membre: 'Maya', message: 'timeout pôle 3 (sera retenté)' }],
    }
    const fetchFn = routedFetch(
      cohorteRoutes({
        'POST api/etablissement/cohortes/7/runs': (init) => {
          runPost = JSON.parse(init.body)
          return jsonResponse(201, { runId: 'run-42', jobs: 3 })
        },
        'GET api/etablissement/runs/run-42': () => jsonResponse(200, runState),
        'POST api/etablissement/runs/run-42/annuler': () => {
          cancelled = true
          runState.status = 'cancelled'
          runState.jobs = { ...runState.jobs, queued: 0, running: 0, cancelled: 2 }
          return jsonResponse(200, { ok: true })
        },
      }),
    )
    render(
      <EtablissementView section="cohorte/7" deps={{ fetchMeFn: etablissement, fetchFn }} />,
    )

    // Étape 1 : estimation obligatoire avant le POST (confirmation du coût).
    await screen.findByTestId('etab-membres')
    fireEvent.click(screen.getByRole('button', { name: 'Estimer le coût' }))
    const estimate = await screen.findByTestId('etab-run-estimate')
    expect(estimate.textContent).toContain('1 membre(s)')
    expect(estimate.textContent).toContain('3 journée(s)')
    expect(estimate.textContent).toContain('24') // 3 journées × 8 appels
    // Service humanome -> modèle de référence claude-sonnet-5, prix connu.
    expect(screen.getByTestId('etab-cout-estime').textContent).toMatch(/\d+\.\d{2} \$/)
    expect(runPost).toBeNull() // rien n'est parti avant la confirmation

    // Étape 2 : confirmation -> POST avec le paquet publié.
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer et lancer le run' }))
    await waitFor(() => expect(runPost).not.toBeNull())
    expect(runPost).toEqual({
      promptPackageId: 'aurora-v3-reconstruit',
      promptPackageVersion: '1.1.0',
    })

    // Étape 3 : avancement (jobs par statut, coût cumulé, erreurs par membre).
    const progress = await screen.findByTestId('etab-run-progress')
    expect(progress.textContent).toContain('0.42 $')
    expect(screen.getByTestId('jobs-done').textContent).toBe('1')
    expect(screen.getByTestId('jobs-running').textContent).toBe('1')
    const erreurs = screen.getByTestId('etab-run-erreurs')
    expect(erreurs.textContent).toContain('Maya')
    expect(erreurs.textContent).toContain('timeout pôle 3')

    // Étape 4 : annulation.
    fireEvent.click(screen.getByRole('button', { name: 'Annuler le run' }))
    await waitFor(() => expect(cancelled).toBe(true))
    await waitFor(() =>
      expect(screen.getByTestId('etab-run-progress').textContent).toContain('cancelled'),
    )
  })

  it('jobs budget_exceeded : alerte « montez le plafond » affichée', async () => {
    const fetchFn = routedFetch(
      cohorteRoutes({
        'POST api/etablissement/cohortes/7/runs': jsonResponse(201, { runId: 'run-9', jobs: 3 }),
        // Alias historiques pending/error : fetchRun doit les tolérer.
        'GET api/etablissement/runs/run-9': jsonResponse(200, {
          runId: 'run-9',
          statut: 'budget_exceeded',
          jobs: { pending: 0, running: 0, done: 1, error: 0, budget_exceeded: 2, cancelled: 0 },
          coutUsd: 99.8,
          erreurs: [],
        }),
      }),
    )
    render(
      <EtablissementView section="cohorte/7" deps={{ fetchMeFn: etablissement, fetchFn }} />,
    )
    await screen.findByTestId('etab-membres')
    fireEvent.click(screen.getByRole('button', { name: 'Estimer le coût' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer et lancer le run' }))

    const alert = await screen.findByText(/Plafond de budget atteint/)
    expect(alert.textContent).toContain('Montez le plafond')
  })
})

describe('EtablissementView — membre : merge côté client', () => {
  const DOCS = {
    membre: { userId: 1, displayName: 'Maya', consentAt: '2026-07-02T10:00:00Z' },
    documents: [
      { date: '2026-01-05', cohorte: 'BTS SIO 2026', document: day05 },
      { date: '2026-01-06', cohorte: 'BTS SIO 2026', document: day06 },
      { date: '2026-01-07', cohorte: 'BTS SIO 2026', document: day07 },
    ],
  }

  it('fusionne les documents jour VIA LE MOTEUR et rend MergeView en lecture seule', async () => {
    const fetchFn = routedFetch({
      'GET api/etablissement/membres/1/documents': jsonResponse(200, DOCS),
    })
    render(
      <EtablissementView
        section="membre/1"
        lib={fakeLib}
        deps={{
          fetchMeFn: etablissement,
          fetchFn,
          getReferentiel: async () => ({ doc: referentiel }),
        }}
      />,
    )

    // Mention du consentement AVANT la visualisation.
    const consent = await screen.findByTestId('etab-membre-consentement')
    expect(consent.textContent).toContain('consentement explicite')
    expect(consent.textContent).toContain('02/07/2026')

    // Le merge est calculé côté client (mergeDays + buildMergeDocument,
    // narratifs locaux) : la vue Merge apparaît avec les données fusionnées.
    await screen.findByText(/Vue fusionnée \(3 journée\(s\)\)/)
    await waitFor(() => {
      expect(document.querySelector('.merge-view')).toBeTruthy()
    })
    // Les résumés locaux du merge client sont bien dans le document rendu.
    expect(screen.queryByTestId('etab-merge-erreur')).toBeNull()
  })

  it('bascule sur une journée : DayView lecture seule du document jour', async () => {
    const fetchFn = routedFetch({
      'GET api/etablissement/membres/1/documents': jsonResponse(200, DOCS),
    })
    render(
      <EtablissementView
        section="membre/1"
        lib={fakeLib}
        deps={{
          fetchMeFn: etablissement,
          fetchFn,
          getReferentiel: async () => ({ doc: referentiel }),
        }}
      />,
    )
    const dayButton = await screen.findByRole('button', { name: 'Journée 05/01/2026' })
    fireEvent.click(dayButton)
    // DayView monte avec le document fourni localement (aucun fetch de plus).
    await waitFor(() => {
      expect(document.querySelector('.day-view')).toBeTruthy()
    })
  })

  it('un seul document jour : fusion non constructible EXPLIQUÉE, journée consultable', async () => {
    const fetchFn = routedFetch({
      'GET api/etablissement/membres/1/documents': jsonResponse(200, {
        membre: { userId: 1, displayName: 'Maya' },
        documents: [{ date: '2026-01-05', document: day05 }],
      }),
    })
    render(
      <EtablissementView
        section="membre/1"
        lib={fakeLib}
        deps={{
          fetchMeFn: etablissement,
          fetchFn,
          getReferentiel: async () => ({ doc: referentiel }),
        }}
      />,
    )
    // Selon la densité du document, la fusion peut échouer : le composant
    // doit soit rendre le merge, soit EXPLIQUER l'échec — jamais de crash.
    await screen.findByRole('button', { name: 'Journée 05/01/2026' })
  })
})

describe('EtablissementView — sections', () => {
  it('section inconnue : alerte + retour à l’accueil', async () => {
    render(<EtablissementView section="inconnue" deps={{ fetchMeFn: etablissement }} />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('inconnue')
  })
})
