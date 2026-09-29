// UC-ETA-03 — Lancer, suivre et annuler un run de masse : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/etablissement/UC-ETA-03-piloter-run-masse.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) ouverte sur la page
// d'une cohorte (#/etablissement/cohorte/7) : sélection des membres, choix du
// paquet publié, estimation OBLIGATOIRE du coût, confirmation, puis suivi par
// polling (horloge simulée pour l'intervalle de 5 s) et annulation. Seule
// l'API est simulée, aux formes réelles des réponses.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { resetApiClient } from '../../../src/api/client.js'
import {
  CSRF,
  cohorteDetail,
  configProjection,
  jsonResponse,
  membre,
  openApp,
  PUBLISHED_PACKAGES,
  runBoard,
  stubApi,
} from '../support/eta.js'

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

const THREE_MEMBERS = cohorteDetail({
  membres: [
    membre(),
    membre({
      userId: 14,
      displayName: 'Lila',
      portfolio: { titre: 'Carnet de Lila', journees: 2, taille: 4000, deposeLe: '2026-07-03T11:00:00' },
    }),
    membre({ userId: 13, displayName: 'Noé', portfolioDepose: false, portfolio: null }),
  ],
})

/** Routes de la page cohorte ; `extra` ajoute/remplace des routes. */
function cohorteApi(extra = {}, { detail = THREE_MEMBERS, config = configProjection(), packages = PUBLISHED_PACKAGES } = {}) {
  return stubApi({
    'GET api/etablissement/cohortes/7': jsonResponse(200, detail),
    'GET api/etablissement/config': jsonResponse(200, config),
    'GET api/prompt-packages': jsonResponse(200, packages),
    ...extra,
  })
}

async function estimate() {
  fireEvent.click(await screen.findByRole('button', { name: 'Estimer le coût' }))
  return screen.findByTestId('etab-run-estimate')
}

async function confirm() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer et lancer le run' }))
  })
}

describe('UC-ETA-03 — l’établissement lance et suit un run de masse', () => {
  it('UC-ETA-03-F16 — nominal : estimation, confirmation, avancement actualisé toutes les 5 s jusqu’à la fin', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const boards = [
      runBoard({ jobs: { queued: 4, running: 1, done: 0, failed: 0, budget_exceeded: 0, cancelled: 0 } }),
      runBoard({
        status: 'done',
        finishedAt: '2026-07-04T12:00:00',
        jobs: { queued: 0, running: 0, done: 5, failed: 0, budget_exceeded: 0, cancelled: 0 },
        coutUsd: 1.7,
      }),
    ]
    const api = cohorteApi({
      'POST api/etablissement/cohortes/7/runs': jsonResponse(201, { runId: 42, jobs: 5 }),
      'GET api/etablissement/runs/42': () => jsonResponse(200, boards.length > 1 ? boards.shift() : boards[0]),
    })
    openApp('#/etablissement/cohorte/7')

    // 1. Par défaut : tous les déposants cochés, le non-déposant non cochable.
    const table = await screen.findByTestId('etab-membres')
    expect(within(table).getByRole('checkbox', { name: 'Inclure Maya dans le run' }).checked).toBe(true)
    expect(within(table).getByRole('checkbox', { name: 'Inclure Lila dans le run' }).checked).toBe(true)
    expect(within(table).getByRole('checkbox', { name: 'Inclure Noé dans le run' }).disabled).toBe(true)
    // 2. Premier paquet publié présélectionné (l'API ne marque pas de « défaut »).
    expect(screen.getByLabelText('Paquet de prompts').value).toBe('aurora-v3-reconstruit@1.0.0')

    // 3. Estimation : 2 membres, 5 journées, 40 appels, modèle de référence.
    const block = await estimate()
    expect(block.textContent).toContain('2 membre(s) sélectionné(s), 5 journée(s) au total, soit 40 appels LLM')
    expect(block.textContent).toContain('claude-sonnet-5')
    // Taille moyenne tirée des dépôts : (9 000 + 4 000) / 5 journées (1.70 $ avec le repli 3 000).
    expect(screen.getByTestId('etab-cout-estime').textContent).toBe('1.69 $')
    expect(api.callsTo('POST api/etablissement/cohortes/7/runs')).toHaveLength(0)

    // 4-6. Confirmation : POST sans liste de membres (tous les déposants), CSRF.
    await confirm()
    const [post] = api.callsTo('POST api/etablissement/cohortes/7/runs')
    expect(post.body).toEqual({ promptPackageId: 'aurora-v3-reconstruit', promptPackageVersion: '1.0.0' })
    expect(post.headers['X-CSRF-Token']).toBe(CSRF)

    // 7. Avancement : premier relevé immédiat…
    const progress = await screen.findByTestId('etab-run-progress')
    expect(progress.textContent).toContain('statut : active (0/5 jobs terminés)')
    expect(screen.getByTestId('jobs-running').textContent).toBe('1')
    expect(screen.getByRole('button', { name: 'Annuler le run' })).toBeDefined()

    // 8. …puis actualisation automatique 5 s plus tard.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(screen.getByTestId('etab-run-progress').textContent).toContain('statut : done (5/5 jobs terminés)')
    expect(screen.getByTestId('etab-run-progress').textContent).toContain('1.70 $')
    expect(screen.queryByRole('button', { name: 'Annuler le run' })).toBeNull()
    expect(api.callsTo('GET api/etablissement/runs/42').length).toBeGreaterThanOrEqual(2)
  })

  it('UC-ETA-03-F17 — A1, RG4 : changement de paquet ou membre décoché → estimation effacée puis recalculée, POST avec la version et la liste membres', async () => {
    const api = cohorteApi({
      'POST api/etablissement/cohortes/7/runs': jsonResponse(201, { runId: 43, jobs: 3 }),
      'GET api/etablissement/runs/43': jsonResponse(200, runBoard({ id: 43 })),
    })
    openApp('#/etablissement/cohorte/7')

    // RG4 — autre paquet : l'estimation affichée ne vaut plus.
    await estimate()
    fireEvent.change(screen.getByLabelText('Paquet de prompts'), { target: { value: 'aurora-v3-reconstruit@1.1.0' } })
    expect(screen.queryByTestId('etab-run-estimate')).toBeNull()

    // A1 — membre décoché : idem.
    await estimate()
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Inclure Lila dans le run' }))
    expect(screen.queryByTestId('etab-run-estimate')).toBeNull()

    const block = await estimate()
    expect(block.textContent).toContain('1 membre(s) sélectionné(s), 3 journée(s) au total, soit 24 appels LLM')
    await confirm()

    expect(api.callsTo('POST api/etablissement/cohortes/7/runs')[0].body).toEqual({
      promptPackageId: 'aurora-v3-reconstruit',
      promptPackageVersion: '1.1.0',
      membres: [12],
    })
    expect(await screen.findByTestId('etab-run-progress')).toBeDefined()
  })

  it('UC-ETA-03-F18 — A4, A5 : run actif avec erreurs par membre, annulation (CSRF) puis tableau « cancelled »', async () => {
    let board = runBoard({
      status: 'active',
      jobs: { queued: 1, running: 1, done: 2, failed: 1, budget_exceeded: 0, cancelled: 0 },
      coutUsd: 0.8,
      erreurs: [{ jobId: 9, userId: 14, date: '2026-01-06', status: 'failed', attempts: 3, erreur: 'pôle 2 (2026-01-06) — panne' }],
    })
    const api = cohorteApi({
      'POST api/etablissement/cohortes/7/runs': jsonResponse(201, { runId: 42, jobs: 5 }),
      'GET api/etablissement/runs/42': () => jsonResponse(200, board),
      'POST api/etablissement/runs/42/annuler': () => {
        board = { ...board, status: 'cancelled', jobs: { ...board.jobs, queued: 0, running: 0, cancelled: 2 } }
        return jsonResponse(200, { id: 42, status: 'cancelled' })
      },
    })
    openApp('#/etablissement/cohorte/7')
    await estimate()
    await confirm()

    // A5 — erreurs par membre : identifiant du membre et message seulement
    // (date, statut, tentatives du tableau API ne sont pas affichés).
    expect((await screen.findByTestId('etab-run-erreurs')).textContent).toBe('14 — pôle 2 (2026-01-06) — panne')
    expect(screen.queryByText(/Plafond de budget atteint/)).toBeNull()

    // A4 — annulation : POST annuler (CSRF) puis relecture du tableau.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Annuler le run' }))
    })
    expect(api.callsTo('POST api/etablissement/runs/42/annuler')[0].headers['X-CSRF-Token']).toBe(CSRF)
    expect(screen.getByTestId('etab-run-progress').textContent).toContain('statut : cancelled')
    expect(screen.getByTestId('jobs-cancelled').textContent).toBe('2')
    expect(screen.queryByRole('button', { name: 'Annuler le run' })).toBeNull()
  })

  it('UC-ETA-03-F19 — E0 : aucun paquet publié ; aucun membre sélectionné → refus local, aucun POST', async () => {
    cohorteApi({}, { packages: [] })
    openApp('#/etablissement/cohorte/7')
    expect(await screen.findByText(/Aucun paquet de prompts publié n’est disponible/)).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Estimer le coût' })).toBeNull()
    cleanup()
    vi.unstubAllGlobals()

    const api = cohorteApi()
    openApp('#/etablissement/cohorte/7')
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Inclure Maya dans le run' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Inclure Lila dans le run' }))
    fireEvent.click(screen.getByRole('button', { name: 'Estimer le coût' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Aucun membre sélectionné n’a déposé son portfolio : le run n’aurait aucun job.',
    )
    expect(screen.queryByTestId('etab-run-estimate')).toBeNull()
    expect(api.callsTo('POST api/etablissement/cohortes/7/runs')).toHaveLength(0)
  })

  it('UC-ETA-03-F20 — E2-E5 : refus du serveur au lancement (422, 409) et à l’annulation (404) affichés ; erreur de polling ignorée', async () => {
    let answer = jsonResponse(422, { error: 'Paquet de prompts publié introuvable : aurora-v3-reconstruit@1.0.0' })
    cohorteApi({ 'POST api/etablissement/cohortes/7/runs': () => answer })
    openApp('#/etablissement/cohorte/7')

    await estimate()
    await confirm()
    expect((await screen.findByRole('alert')).textContent).toBe('Paquet de prompts publié introuvable : aurora-v3-reconstruit@1.0.0')

    answer = jsonResponse(422, { error: 'Aucun membre consenti n\'a déposé de portfolio dans cette cohorte' })
    await confirm()
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Aucun membre consenti n\'a déposé de portfolio dans cette cohorte',
    )

    answer = jsonResponse(409, { error: 'Aucun référentiel publié' })
    await confirm()
    expect((await screen.findByRole('alert')).textContent).toBe('Aucun référentiel publié')
    expect(screen.queryByTestId('etab-run-progress')).toBeNull()
    expect(screen.queryByText('Run lancé — chargement de l’avancement…')).toBeNull()
    cleanup()
    vi.unstubAllGlobals()

    // E5 : run disparu (cohorte supprimée entre-temps) — le polling échoue
    // en silence (tableau figé), l'annulation affiche le message du serveur.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let polls = 0
    cohorteApi({
      'POST api/etablissement/cohortes/7/runs': jsonResponse(201, { runId: 42, jobs: 5 }),
      'GET api/etablissement/runs/42': () =>
        ++polls === 1 ? jsonResponse(200, runBoard()) : jsonResponse(404, { error: 'Run introuvable' }),
      'POST api/etablissement/runs/42/annuler': jsonResponse(404, { error: 'Run introuvable' }),
    })
    openApp('#/etablissement/cohorte/7')
    await estimate()
    await confirm()
    await screen.findByTestId('etab-run-progress')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(polls).toBeGreaterThanOrEqual(2)
    expect(screen.getByTestId('etab-run-progress').textContent).toContain('statut : active')
    expect(screen.queryByRole('alert')).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Annuler le run' }))
    })
    expect((await screen.findByRole('alert')).textContent).toBe('Run introuvable')
  })

  it('UC-ETA-03-F21 — estimation au-delà du budget restant → avertissement ; modèle hors table → coût « inconnu »', async () => {
    cohorteApi({}, { config: configProjection({ budgetCapUsd: 1, spentUsd: 0.5 }) })
    openApp('#/etablissement/cohorte/7')
    await estimate()
    expect(screen.getByText(/l’estimation dépasse le budget restant \(0\.50 \$\)/)).toBeDefined()
    cleanup()
    vi.unstubAllGlobals()

    cohorteApi({}, {
      config: configProjection({ provider: 'endpoint', endpointUrl: 'http://10.0.0.12:11434', model: 'phi4:14b' }),
    })
    openApp('#/etablissement/cohorte/7')
    const block = await estimate()
    expect(block.textContent).toContain('phi4:14b')
    expect(screen.getByTestId('etab-cout-estime').textContent).toBe('inconnu (modèle hors table de prix)')
    expect(screen.queryByText(/dépasse le budget restant/)).toBeNull()
    cleanup()
    vi.unstubAllGlobals()

    // Aucune configuration encore (projection par défaut : plafond 0) :
    // l'avertissement annonce « budget dépassé » alors que les jobs resteront
    // simplement en file faute d'exécutant (A6) — comportement actuel.
    cohorteApi({}, { config: configProjection({ budgetCapUsd: 0, spentUsd: 0, model: null }) })
    openApp('#/etablissement/cohorte/7')
    await estimate()
    expect(screen.getByText(/l’estimation dépasse le budget restant \(0\.00 \$\)/)).toBeDefined()
  })

  it('UC-ETA-03-F22 — A3 : run arrêté au plafond (tableau réel : plus aucun job en file) → alerte « relancez », bouton « Annuler le run » absent (comportement actuel)', async () => {
    cohorteApi({
      'POST api/etablissement/cohortes/7/runs': jsonResponse(201, { runId: 42, jobs: 5 }),
      // Forme réelle : markBudgetExceeded a fait passer TOUS les jobs en file
      // à « budget_exceeded » (queued 0, running 0).
      'GET api/etablissement/runs/42': jsonResponse(
        200,
        runBoard({
          status: 'budget_exceeded',
          jobs: { queued: 0, running: 0, done: 1, failed: 0, budget_exceeded: 4, cancelled: 0 },
          coutUsd: 0.34,
        }),
      ),
    })
    openApp('#/etablissement/cohorte/7')
    await estimate()
    await confirm()

    const alert = await screen.findByText(/Plafond de budget atteint/)
    expect(alert.textContent).toBe(
      'Plafond de budget atteint : 4 job(s) en attente de budget. Montez le plafond dans la configuration puis relancez pour les réactiver.',
    )
    expect(screen.getByTestId('etab-run-progress').textContent).toContain('statut : budget_exceeded')
    // Voir « Anomalies constatées » : ce run ne peut pas être annulé depuis le site.
    expect(screen.queryByRole('button', { name: 'Annuler le run' })).toBeNull()
  })
})
