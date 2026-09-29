// UC-APP-02 — Lancer une cartographie standard : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-02-lancer-cartographie-standard.md
//
// L'assistant #/espace/nouveau-run est joué dans l'application ENTIÈRE
// (<App/>), sans aucune couture de test : portfolio-store, checkpoints de run
// (engine createIndexedDbStorage) et carto-store réels écrivent dans un
// IndexedDB factice ; le moteur réel exécute l'extraction ; seul le réseau
// est simulé (fetch global) — proxy « Service humanome » (défi + preuve de
// travail + POST api/llm) ou API Messages d'Anthropic (clé personnelle),
// qui répondent par les fixtures versionnées. Aucun appel réseau réel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { createPortfolioStore } from '../../../src/lib/portfolio-store.js'
import { computeDayGroups } from '../../../src/lib/run-launcher.js'
import { clearReferentielCache } from '../../../src/data/referentiel.js'
import { getReferentiel } from '../../../src/data/load.js'
import { segmentText } from '@engine/portfolio/segment.js'
import { buildExtractionPrompt } from '@engine/pipeline/extract.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { FakeIDBKeyRange, createFakeIndexedDb } from '../support/appl-fake-indexeddb.js'
import { bodyOf, jsonResponse, routedFetch } from '../support/appl-http.js'
import { anthropicAnswer, portfolioText, proxyAnswer } from '../support/appl-llm.js'

const idb = createFakeIndexedDb()
const CARTOS = ['humanome-cartographies', 'cartographies']
const RUNS = ['humanome-runs', 'kv']
const USER = { id: 7, email: 'maya@example.org', displayName: 'Maya', roles: ['apprenant'] }
const KEY = 'sk-ant-perso-0123456789'

async function seedPortfolio(titre = 'Journal de Maya', dates = ['2026-01-05', '2026-01-06', '2026-01-07']) {
  const texte = portfolioText(dates)
  return createPortfolioStore().create({ titre, texte, segments: segmentText(texte, { today: '2026-07-12' }) })
}

/**
 * Réseau simulé. `llm(prompt, init, n)` produit la réponse du proxy ; les
 * défis de preuve de travail sont de difficulté 0 (résolus instantanément).
 */
function stubNetwork({ me = USER, packages = [], defaut = null, llm, anthropic, extra = [] } = {}) {
  let challenges = 0
  let posts = 0
  const fetchMock = routedFetch([
    ...extra,
    ['api/auth/me', () => (me ? jsonResponse(200, { user: me, csrfToken: 'csrf-maya' }) : jsonResponse(401, { error: 'Non connecté' }))],
    ['api/prompt-packages/default', () => (defaut ? jsonResponse(200, defaut) : jsonResponse(404, { error: 'Aucun paquet publié' }))],
    ['api/prompt-packages', () => jsonResponse(200, packages)],
    ['api/llm/challenge', () => jsonResponse(200, { challenge: `v1.defi-${++challenges}`, difficultyBits: 0, expiresAt: Math.floor(Date.now() / 1000) + 300 })],
    ['api/llm', (url, init) => (llm ?? ((p) => jsonResponse(200, proxyAnswer(p))))(bodyOf({ init }).prompt, init, ++posts)],
    ['https://api.anthropic.com/v1/messages', (url, init) => (anthropic ?? ((p) => jsonResponse(200, anthropicAnswer(p))))(bodyOf({ init }).messages[0].content, init)],
  ])
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function openWizard() {
  window.location.hash = '#/espace/nouveau-run'
  return render(<App lib={fakeLib} fetchMeFn={async () => ({ user: USER })} />)
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))

/** Étapes 2 à 5 de l'assistant, jusqu'au bouton « Lancer le run ». */
async function walkToExecution({ portfolio = /Journal de Maya — 3 journée\(s\)/, pkg = null, mode = 'humanome', key = KEY, sync = false } = {}) {
  fireEvent.click(await screen.findByRole('radio', { name: portfolio }))
  next()
  await screen.findByTestId('step-prompt')
  await waitFor(() => expect(screen.queryByText('Chargement des versions publiées…')).toBeNull())
  if (pkg) fireEvent.click(screen.getByRole('radio', { name: pkg }))
  next()
  await screen.findByTestId('step-fournisseur')
  if (mode === 'humanome') {
    fireEvent.click(screen.getByRole('radio', { name: /Service humanome/ }))
  } else {
    fireEvent.change(screen.getByLabelText('Clé API'), { target: { value: key } })
    if (sync) fireEvent.click(screen.getByRole('checkbox', { name: /Synchroniser sur le serveur/ }))
  }
  next()
  await screen.findByTestId('run-estimate')
  next()
  await screen.findByTestId('step-execution')
}

async function launch(label = 'Lancer le run') {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: label }))
  })
}

const llmPosts = (fetchMock) => fetchMock.calls.filter((c) => c.url === 'api/llm')

/** Réponse bloquée jusqu'à l'abandon de la requête (clic « Interrompre »). */
function hangUntilAbort(init) {
  return new Promise((resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  })
}

/** Réponse RÉELLE de PUT /api/keys : 204 sans corps. */
const noContent = () => ({ ok: true, status: 204, headers: { get: () => null }, json: async () => null, text: async () => '' })

beforeEach(() => {
  resetApiClient()
  // Référentiel : data/referentiel/index.json n'est pas routé (404) => copie
  // embarquée ; le cache de module est vidé pour isoler chaque scénario.
  clearReferentielCache()
  vi.stubGlobal('indexedDB', idb.factory)
  vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange)
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  idb.reset()
  localStorage.clear()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-APP-02 — scénario nominal : Service humanome', () => {
  it('UC-APP-02-F01 — nominal : 5 étapes, 24 appels avec preuve de travail, 3 jours + 1 fusion enregistrés en « privée »', async () => {
    await seedPortfolio()
    const fetchMock = stubNetwork()
    openWizard()

    expect(await screen.findByTestId('espace-connecte')).toBeDefined()
    fireEvent.click(await screen.findByRole('radio', { name: /Journal de Maya — 3 journée\(s\)/ }))
    next()
    await screen.findByTestId('step-prompt')
    expect(screen.getByRole('radio', { name: /aurora-v3-reconstruit@1\.0\.0/ }).checked).toBe(true)
    next()
    fireEvent.click(await screen.findByRole('radio', { name: /Service humanome/ }))
    next()
    const estimate = await screen.findByTestId('run-estimate')
    expect(estimate.textContent).toContain('3 journée(s)')
    expect(estimate.textContent).toContain('93 appels au modèle')
    expect(estimate.textContent).toMatch(/Coût estimé : ≈ \d+\.\d{2} \$ US/)
    next()
    await screen.findByTestId('step-execution')
    await launch()

    const success = await screen.findByTestId('run-success', {}, { timeout: 15000 })
    expect(success.textContent).toBe(
      'Cartographie terminée et enregistrée (3 document(s) jour + le document merge, visibilité « privée »).',
    )
    expect(screen.getByTestId('run-usage').textContent).toContain('sur 24 appel(s)')

    // Proxy : 24 POST (3 × (7 pôles + kairos)), un défi distinct chacun, pot de miel vide.
    const posts = llmPosts(fetchMock).map(bodyOf)
    expect(posts).toHaveLength(24)
    expect(new Set(posts.map((b) => b.challenge)).size).toBe(24)
    expect(posts.every((b) => b.website === '' && b.nonce === '0' && b.model === 'demo')).toBe(true)

    // Enregistrement local : 3 journées + la fusion, privées, traçables.
    const saved = idb.values(...CARTOS)
    expect(saved.map((c) => c.type).sort()).toEqual(['jour', 'jour', 'jour', 'merge'])
    expect(saved.every((c) => c.visibility === 'privee' && c.serverId === null)).toBe(true)
    const merge = saved.find((c) => c.type === 'merge')
    expect(merge.titre).toBe('Cartographie — Journal de Maya')
    expect(merge.promptPackage).toEqual({ id: 'aurora-v3-reconstruit', version: '1.0.0' })
    expect(merge.runMeta).toMatchObject({
      portfolioTitre: 'Journal de Maya',
      mode: 'humanome',
      provider: 'humanome',
      model: 'impose par la plateforme',
      jours: 3,
      usage: { mesures: 24 },
    })
    expect(merge.document.kind).toBe('cartographie-merge')
    expect(idb.values(...RUNS).length).toBeGreaterThan(3) // checkpoints + journal

    // Retour au tableau de bord.
    fireEvent.click(screen.getByRole('button', { name: 'Retour à l’espace apprenant' }))
    expect(window.location.hash).toBe('#/espace')
  })
})

describe('UC-APP-02 — scénarios alternatifs', () => {
  it('UC-APP-02-F02 — A1 : clé personnelle Anthropic, appels directs, clé mémorisée localement et synchronisée (opt-in)', async () => {
    await seedPortfolio()
    const fetchMock = stubNetwork({ extra: [['api/keys', noContent]] })
    openWizard()
    await screen.findByTestId('espace-connecte')

    await walkToExecution({ mode: 'cle', sync: true })
    await launch()
    await screen.findByTestId('run-success', {}, { timeout: 15000 })

    const direct = fetchMock.calls.filter((c) => c.url === 'https://api.anthropic.com/v1/messages')
    expect(direct).toHaveLength(24)
    expect(direct.every((c) => c.init.headers['x-api-key'] === KEY)).toBe(true)
    expect(llmPosts(fetchMock)).toHaveLength(0)
    // La clé ne part vers humanome QUE par l'opt-in explicite (PUT api/keys, CSRF).
    const toHumanome = fetchMock.calls.filter((c) => c.url.startsWith('api/') && JSON.stringify(c).includes(KEY))
    expect(toHumanome.map((c) => [c.url, c.init.method])).toEqual([['api/keys', 'PUT']])
    expect(toHumanome[0].init.headers['X-CSRF-Token']).toBe('csrf-maya')
    expect(JSON.parse(localStorage.getItem('humanome-keys'))).toEqual({ anthropic: KEY })

    const merge = idb.values(...CARTOS).find((c) => c.type === 'merge')
    expect(merge.runMeta).toMatchObject({ mode: 'cle', provider: 'anthropic', model: 'claude-sonnet-4-6' })
  })

  it('UC-APP-02-F03 — A2 : API injoignable : bandeau « copie statique », version embarquée seule, synchronisation désactivée', async () => {
    await seedPortfolio()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    openWizard()

    expect((await screen.findByTestId('espace-anonyme')).textContent).toContain('Copie statique du site')
    fireEvent.click(await screen.findByRole('radio', { name: /Journal de Maya — 3 journée\(s\)/ }))
    next()
    expect((await screen.findByTestId('packages-fallback')).textContent).toContain('version embarquée proposée')
    expect(screen.getAllByRole('radio').map((r) => r.closest('label').textContent)).toEqual([
      expect.stringContaining('aurora-v3-reconstruit@1.0.0 (embarqué)'),
    ])
    next()
    await screen.findByTestId('step-fournisseur')
    expect(screen.getByRole('checkbox', { name: /Synchroniser sur le serveur/ }).disabled).toBe(true)
    expect(screen.getByText(/pour activer la synchronisation/)).toBeDefined()
  })

  it('UC-APP-02-F04 — A3 : version publiée choisie : tracée avec la cartographie, pipeline embarqué exécuté ; défaut serveur non présélectionné', async () => {
    await seedPortfolio()
    const fetchMock = stubNetwork({
      defaut: { id: 'aurora-lab', version: '2.0.0' },
      packages: [{ id: 'aurora-lab', version: '2.0.0', description: 'Extraction affinée' }],
    })
    openWizard()
    fireEvent.click(await screen.findByRole('radio', { name: /Journal de Maya — 3 journée\(s\)/ }))
    next()
    await screen.findByRole('radio', { name: /aurora-lab@2\.0\.0/ })
    // [comportement ACTUEL, anomalie A-01] : le défaut désigné par le serveur
    // n'est ni présélectionné ni signalé — l'embarqué reste coché.
    expect(screen.getByRole('radio', { name: /aurora-v3-reconstruit@1\.0\.0/ }).checked).toBe(true)
    expect(screen.getByRole('radio', { name: /aurora-lab@2\.0\.0/ }).checked).toBe(false)
    expect(screen.getByRole('radio', { name: /aurora-lab@2\.0\.0/ }).closest('label').textContent).not.toMatch(/défaut/i)
    fireEvent.click(screen.getByRole('radio', { name: /aurora-lab@2\.0\.0/ }))
    next()
    fireEvent.click(await screen.findByRole('radio', { name: /Service humanome/ }))
    next()
    await screen.findByTestId('run-estimate')
    next()
    await launch()
    await screen.findByTestId('run-success', {}, { timeout: 15000 })

    const saved = idb.values(...CARTOS)
    expect(saved.every((c) => c.promptPackage.id === 'aurora-lab' && c.promptPackage.version === '2.0.0')).toBe(true)
    expect(idb.values(...RUNS).length).toBeGreaterThan(0)
    expect(idb.entries(...RUNS).some(([k]) => k.includes('::aurora-lab@2.0.0:checkpoint:'))).toBe(true)
    // v1 : le prompt exécuté reste celui du pipeline embarqué (Aurora v3) —
    // le document du paquet publié n'est même jamais téléchargé…
    expect(fetchMock.calls.some((c) => c.url.startsWith('api/prompt-packages/aurora-lab/'))).toBe(false)
    // …et le 1er prompt est exactement celui du moteur embarqué (pôle 1, 1re journée).
    const [portfolio] = await createPortfolioStore().list()
    const [firstDay] = computeDayGroups(portfolio.segments)
    expect(bodyOf(llmPosts(fetchMock)[0]).prompt).toBe(
      buildExtractionPrompt({ referentiel: getReferentiel(), poleNum: 1, dayText: firstDay.texte, date: firstDay.iso }),
    )
  })

  it('UC-APP-02-F05 — A4 : interrompre pendant la journée 2 puis reprendre : la journée 1 checkpointée est sautée', async () => {
    await seedPortfolio()
    let hung = false
    let release
    const gate = new Promise((resolve) => (release = resolve))
    const fetchMock = stubNetwork({
      llm: async (prompt, init) => {
        if (prompt.includes('(2026-01-06)') && !hung) {
          hung = true
          return hangUntilAbort(init)
        }
        if (prompt.includes('(2026-01-07)')) await gate
        return jsonResponse(200, proxyAnswer(prompt))
      },
    })
    openWizard()
    await walkToExecution()
    await launch()

    await waitFor(() => expect(screen.getByTestId('run-progress').textContent).toContain('Journée 2/3 (2026-01-06)'), { timeout: 10000 })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Interrompre' }))
    })
    expect((await screen.findByTestId('run-interrupted')).textContent).toContain('la reprise sautera ce qui est déjà fait')
    const beforeResume = llmPosts(fetchMock).length

    await launch('Reprendre le run')
    expect((await screen.findByTestId('run-resumed')).textContent).toBe(
      'Repris à la journée 2/3 : les 1 journée(s) déjà checkpointée(s) sont sautées.',
    )
    release()
    await screen.findByTestId('run-success', {}, { timeout: 15000 })

    const resumedPrompts = llmPosts(fetchMock).slice(beforeResume).map((c) => bodyOf(c).prompt)
    expect(resumedPrompts).toHaveLength(16)
    expect(resumedPrompts.some((p) => p.includes('(2026-01-05)'))).toBe(false)
  })

  it('UC-APP-02-F06 — A5 : rechargement de la page pendant le run : la reprise repart des checkpoints IndexedDB', async () => {
    await seedPortfolio()
    let session = 1
    let release
    let sessionOneSignal = null
    const gate = new Promise((resolve) => (release = resolve))
    const fetchMock = stubNetwork({
      llm: async (prompt, init) => {
        if (session === 1 && prompt.includes('(2026-01-06)')) {
          sessionOneSignal = init.signal
          return hangUntilAbort(init)
        }
        if (session === 2 && prompt.includes('(2026-01-07)')) await gate
        return jsonResponse(200, proxyAnswer(prompt))
      },
    })
    const first = openWizard()
    await walkToExecution()
    await launch()
    await waitFor(() => expect(screen.getByTestId('run-progress').textContent).toContain('Journée 2/3'), { timeout: 10000 })

    // Rechargement : l'assistant est démonté (le run en cours est interrompu).
    await waitFor(() => expect(sessionOneSignal).not.toBeNull())
    expect(sessionOneSignal.aborted).toBe(false)
    await act(async () => first.unmount())
    // Le démontage abandonne VRAIMENT la requête en cours (signal transmis au fetch).
    expect(sessionOneSignal.aborted).toBe(true)
    session = 2
    const beforeReload = llmPosts(fetchMock).length
    openWizard()
    await walkToExecution()
    expect(screen.getByText(/checkpoint après chaque journée/)).toBeDefined()
    await launch()

    expect((await screen.findByTestId('run-resumed')).textContent).toContain('Repris à la journée 2/3')
    release()
    await screen.findByTestId('run-success', {}, { timeout: 15000 })
    expect(llmPosts(fetchMock).length - beforeReload).toBe(16)
    expect(idb.values(...CARTOS)).toHaveLength(4)
  })

  it('UC-APP-02-F07 — A6 : portfolio trop court (2 journées) : documents jour enregistrés, fusion expliquée', async () => {
    await seedPortfolio('Deux jours', ['2026-01-05', '2026-01-06'])
    stubNetwork()
    openWizard()
    await walkToExecution({ portfolio: /Deux jours — 2 journée\(s\)/ })
    await launch()

    expect((await screen.findByTestId('run-success', {}, { timeout: 15000 })).textContent).toBe(
      'Run terminé : 2 document(s) jour enregistrés (visibilité « privée »).',
    )
    expect(screen.getByTestId('run-merge-notice').textContent).toContain('au moins une compétence établie dans chacun des 7 pôles')
    expect(idb.values(...CARTOS).map((c) => c.type)).toEqual(['jour', 'jour'])
  })
})

describe('UC-APP-02 — scénarios d’erreur', () => {
  it('UC-APP-02-F08 — E1 : aucun portfolio local : renvoi vers le module portfolio, « Continuer » inactif', async () => {
    stubNetwork()
    openWizard()

    const empty = await screen.findByText(/Aucun portfolio local\./)
    expect(empty.querySelector('a').getAttribute('href')).toBe('#/portfolio')
    expect(screen.getByRole('button', { name: 'Continuer' }).disabled).toBe(true)
  })

  it('UC-APP-02-F09 — E2 : portfolio sans journée datée : signalé, non sélectionnable utilement', async () => {
    await createPortfolioStore().create({
      titre: 'Brouillon',
      texte: 'Notes',
      segments: [{ date: null, texte: 'Notes', debut: 0, fin: 5 }],
    })
    stubNetwork()
    openWizard()

    const radio = await screen.findByRole('radio', { name: /Brouillon — 0 journée\(s\)/ })
    expect(radio.closest('label').textContent).toContain('(aucune journée segmentée : à découper dans le module portfolio)')
    fireEvent.click(radio)
    expect(screen.getByRole('button', { name: 'Continuer' }).disabled).toBe(true)
  })

  it('UC-APP-02-F10 — E3 : clé personnelle absente : « Continuer » inactif ; Ollama ne demande pas de clé', async () => {
    await seedPortfolio()
    stubNetwork()
    openWizard()
    fireEvent.click(await screen.findByRole('radio', { name: /Journal de Maya/ }))
    next()
    await screen.findByTestId('step-prompt')
    next()
    await screen.findByTestId('step-fournisseur')

    expect(screen.getByRole('button', { name: 'Continuer' }).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Fournisseur'), { target: { value: 'ollama' } })
    expect(await screen.findByText('Ollama tourne en local : aucune clé requise.')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Continuer' }).disabled).toBe(false)
  })

  it('UC-APP-02-F11 — E4 : une journée échoue : le run continue, l’échec est listé, « Reprendre » ne retente qu’elle', async () => {
    await seedPortfolio()
    let broken = true
    let gate = null
    let firstRunDay3 = true
    let releaseDay3
    const day3Gate = new Promise((resolve) => (releaseDay3 = resolve))
    const fetchMock = stubNetwork({
      llm: async (prompt) => {
        if (firstRunDay3 && prompt.includes('(2026-01-07)')) {
          firstRunDay3 = false
          await day3Gate
        }
        if (gate) await gate
        return broken && prompt.includes('(2026-01-06)') && prompt.includes('# Pôle 3 — ')
          ? jsonResponse(200, { text: 'réponse illisible', usage: { inputTokens: 1, outputTokens: 1 }, model: 'mock' })
          : jsonResponse(200, proxyAnswer(prompt))
      },
    })
    openWizard()
    await walkToExecution()
    await launch()

    // [comportement ACTUEL, anomalie A-04] après l'échec de la journée 2, la
    // journée 3 s'affiche « Journée 2/3 » (compte des journées terminées).
    await waitFor(() => expect(screen.getByTestId('run-progress').textContent).toContain('Journée 2/3 (2026-01-07)'), { timeout: 10000 })
    releaseDay3()

    expect((await screen.findByRole('alert', {}, { timeout: 15000 })).textContent).toContain(
      '« Reprendre » ne retentera que les journées manquantes',
    )
    expect(screen.getByText(/^2026-01-06 : extractDay : pôle 3 \(2026-01-06\)/)).toBeDefined()
    expect(idb.values(...CARTOS)).toHaveLength(0) // rien d'enregistré tant que le run est incomplet

    broken = false
    let release
    gate = new Promise((resolve) => (release = resolve))
    const before = llmPosts(fetchMock).length
    await launch('Reprendre le run')
    // [comportement ACTUEL, anomalie A-04] la reprise annonce la journée 3/3
    // alors que c'est la journée 2 (2026-01-06) qui est refaite.
    expect((await screen.findByTestId('run-resumed')).textContent).toBe(
      'Repris à la journée 3/3 : les 2 journée(s) déjà checkpointée(s) sont sautées.',
    )
    await waitFor(() => expect(screen.getByTestId('run-progress').textContent).toContain('Journée 3/3 (2026-01-06)'))
    release()
    await screen.findByTestId('run-success', {}, { timeout: 15000 })
    const retried = llmPosts(fetchMock).slice(before).map((c) => bodyOf(c).prompt)
    expect(retried).toHaveLength(8)
    expect(retried.every((p) => p.includes('(2026-01-06)'))).toBe(true)
  })

  it('UC-APP-02-F12 — E5 : démo désactivée dès le défi initial (503) : message dédié, aucun appel LLM', async () => {
    await seedPortfolio()
    // Seule réponse d'erreur possible de GET api/llm/challenge : 503 (démo
    // désactivée ou secret de preuve de travail absent) — jamais 429.
    const fetchMock = stubNetwork({
      extra: [['api/llm/challenge', () => jsonResponse(503, { error: 'La démonstration est désactivée pour le moment.' })]],
    })
    openWizard()
    await walkToExecution()
    await launch()

    expect((await screen.findByRole('alert')).textContent).toBe(
      'La démo est épuisée pour aujourd’hui ou momentanément désactivée. Revenez un peu plus tard — ou créez un compte pour cartographier sans ces limites.',
    )
    expect(llmPosts(fetchMock)).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Reprendre le run' })).toBeDefined()
  })

  it('UC-APP-02-F13 — [comportement ACTUEL, anomalie A-02] service épuisé (503) en cours de run : échecs techniques par journée, 2 appels par journée', async () => {
    await seedPortfolio()
    const fetchMock = stubNetwork({
      llm: () => jsonResponse(503, { error: 'Démo épuisée pour aujourd’hui, revenez demain.' }),
    })
    openWizard()
    await walkToExecution()
    await launch()

    expect((await screen.findByRole('alert', {}, { timeout: 15000 })).textContent).toContain('Certaines journées ont échoué')
    // Pas de message « épuisé » : chaque journée affiche le détail technique…
    expect(screen.getAllByText(/HTTP 503 — Démo épuisée pour aujourd’hui/)).toHaveLength(3)
    // …et le run a continué d'appeler le proxy (1 essai + 1 nouvel essai par journée).
    expect(llmPosts(fetchMock)).toHaveLength(6)
  })

  it('UC-APP-02-F20 — [comportement ACTUEL, anomalie A-02] quota horaire (429) atteint en cours de run : journée 1 checkpointée, journées 2 et 3 en échec technique', async () => {
    await seedPortfolio()
    const fetchMock = stubNetwork({
      llm: (prompt, init, n) =>
        n <= 8
          ? jsonResponse(200, proxyAnswer(prompt))
          : jsonResponse(429, { error: 'Quota horaire atteint, réessayez plus tard.' }, { 'Retry-After': '30' }),
    })
    openWizard()
    await walkToExecution()
    await launch()

    expect((await screen.findByRole('alert', {}, { timeout: 15000 })).textContent).toContain('Certaines journées ont échoué')
    // Pas de message « réessayez dans N minutes » : le détail technique par journée.
    expect(screen.getByText(/^2026-01-06 : .*HTTP 429 — Quota horaire atteint/)).toBeDefined()
    expect(screen.getByText(/^2026-01-07 : .*HTTP 429 — Quota horaire atteint/)).toBeDefined()
    expect(screen.queryByText(/La démo est très demandée/)).toBeNull()
    expect(idb.entries(...RUNS).some(([k]) => k.endsWith(':checkpoint:2026-01-05'))).toBe(true)
    // 8 appels de la journée 1, puis 2 par journée restante (aucune reprise
    // automatique du fournisseur, mais le nouvel essai d'extractDay).
    expect(llmPosts(fetchMock)).toHaveLength(12)
    expect(idb.values(...CARTOS)).toHaveLength(0)
  })

  it('UC-APP-02-F21 — A1 : clé pré-remplie depuis localStorage ou récupérée du serveur ; SANS synchronisation, elle ne va jamais vers humanome', async () => {
    await seedPortfolio()
    const SERVER_KEY = 'sk-ant-serveur-9876543210'
    localStorage.setItem('humanome-keys', JSON.stringify({ anthropic: KEY }))
    const fetchMock = stubNetwork({ extra: [['api/keys/anthropic', () => jsonResponse(200, { apiKey: SERVER_KEY })]] })
    openWizard()
    await screen.findByTestId('espace-connecte')

    fireEvent.click(await screen.findByRole('radio', { name: /Journal de Maya — 3 journée\(s\)/ }))
    next()
    await screen.findByTestId('step-prompt')
    await waitFor(() => expect(screen.queryByText('Chargement des versions publiées…')).toBeNull())
    next()
    await screen.findByTestId('step-fournisseur')
    // Pré-remplissage depuis localStorage (« humanome-keys »).
    expect(screen.getByLabelText('Clé API').value).toBe(KEY)
    expect(screen.getByRole('checkbox', { name: /Synchroniser sur le serveur/ }).checked).toBe(false)

    // Récupération explicite de la clé enregistrée sur le serveur.
    fireEvent.click(screen.getByRole('button', { name: 'Récupérer la clé depuis le serveur' }))
    expect(await screen.findByText('Clé récupérée depuis le serveur.')).toBeDefined()
    expect(screen.getByLabelText('Clé API').value).toBe(SERVER_KEY)

    next()
    await screen.findByTestId('run-estimate')
    next()
    await screen.findByTestId('step-execution')
    await launch()
    await screen.findByTestId('run-success', {}, { timeout: 15000 })

    const direct = fetchMock.calls.filter((c) => c.url === 'https://api.anthropic.com/v1/messages')
    expect(direct).toHaveLength(24)
    expect(direct.every((c) => c.init.headers['x-api-key'] === SERVER_KEY)).toBe(true)
    // Case non cochée : aucun PUT api/keys, aucune requête vers humanome ne porte une clé.
    expect(fetchMock.calls.filter((c) => c.url === 'api/keys')).toEqual([])
    const leaked = fetchMock.calls.filter(
      (c) => c.url.startsWith('api/') && (JSON.stringify(c).includes(KEY) || JSON.stringify(c).includes(SERVER_KEY)),
    )
    expect(leaked).toEqual([])
    expect(JSON.parse(localStorage.getItem('humanome-keys'))).toEqual({ anthropic: SERVER_KEY })
  })

  it('UC-APP-02-F22 — E6 : synchronisation de la clé refusée par le serveur (422) : message du serveur, aucun appel LLM, reprise possible', async () => {
    await seedPortfolio()
    const fetchMock = stubNetwork({
      extra: [
        [
          'api/keys',
          () => jsonResponse(422, { error: 'Validation échouée', fields: { apiKey: 'Clé API invalide (8 à 4096 caractères imprimables)' } }),
        ],
      ],
    })
    openWizard()
    await screen.findByTestId('espace-connecte')
    await walkToExecution({ mode: 'cle', sync: true })
    await launch()

    expect((await screen.findByRole('alert')).textContent).toBe('Validation échouée')
    expect(fetchMock.calls.filter((c) => c.url === 'api/keys').map((c) => c.init.method)).toEqual(['PUT'])
    expect(fetchMock.calls.filter((c) => c.url.startsWith('https://api.anthropic.com'))).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Reprendre le run' })).toBeDefined()
    expect(idb.values(...CARTOS)).toHaveLength(0)
  })

  it('UC-APP-02-F25 — E7 : clé personnelle refusée par le fournisseur (401 Anthropic) : aucune reprise du transport, 2 requêtes par journée, chaque journée en échec avec le détail du fournisseur, rien d’enregistré', async () => {
    await seedPortfolio()
    const fetchMock = stubNetwork({
      anthropic: () => jsonResponse(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
    })
    openWizard()
    await screen.findByTestId('espace-connecte')
    await walkToExecution({ mode: 'cle' })
    await launch()

    expect((await screen.findByRole('alert', {}, { timeout: 15000 })).textContent).toContain('Certaines journées ont échoué')
    for (const iso of ['2026-01-05', '2026-01-06', '2026-01-07']) {
      expect(screen.getByText(`${iso} : extractDay : pôle 1 (${iso}) — anthropic: HTTP 401 — invalid x-api-key`)).toBeDefined()
    }
    // 401 non réessayé par le transport : 1 essai + le nouvel essai d'extractDay,
    // pour le seul pôle 1 de chaque journée ; le run passe à la journée suivante.
    const direct = fetchMock.calls.filter((c) => c.url === 'https://api.anthropic.com/v1/messages')
    expect(direct).toHaveLength(6)
    expect(direct.every((c) => c.init.headers['x-api-key'] === KEY)).toBe(true)
    expect(direct.map((c) => /\((\d{4}-\d{2}-\d{2})\)/.exec(bodyOf(c).messages[0].content)[1])).toEqual([
      '2026-01-05', '2026-01-05', '2026-01-06', '2026-01-06', '2026-01-07', '2026-01-07',
    ])
    expect(direct.every((c) => bodyOf(c).messages[0].content.includes('# Pôle 1 — '))).toBe(true)
    expect(llmPosts(fetchMock)).toEqual([]) // jamais de repli sur le service humanome
    expect(idb.values(...CARTOS)).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Reprendre le run' })).toBeDefined()
  })

  it('UC-APP-02-F23 — A2 : API joignable mais en erreur 5xx JSON : bandeau « non connecté », version embarquée seule, synchronisation désactivée', async () => {
    await seedPortfolio()
    stubNetwork({ extra: [[/^api\//, () => jsonResponse(503, { error: 'Service indisponible' })]] })
    openWizard()

    expect((await screen.findByTestId('espace-anonyme')).textContent).toContain('Vous n’êtes pas connecté')
    fireEvent.click(await screen.findByRole('radio', { name: /Journal de Maya — 3 journée\(s\)/ }))
    next()
    expect((await screen.findByTestId('packages-fallback')).textContent).toContain('version embarquée proposée')
    next()
    await screen.findByTestId('step-fournisseur')
    expect(screen.getByRole('checkbox', { name: /Synchroniser sur le serveur/ }).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Récupérer la clé depuis le serveur' })).toBeNull()
  })

  it('UC-APP-02-F19 — [comportement ACTUEL, anomalie A-03] relance après modification du portfolio : rien n’est recalculé, cartographies dupliquées', async () => {
    const record = await seedPortfolio()
    const fetchMock = stubNetwork()
    const first = openWizard()
    await walkToExecution()
    await launch()
    await screen.findByTestId('run-success', {}, { timeout: 15000 })
    const firstDays = idb.values(...CARTOS).filter((c) => c.type === 'jour').map((c) => c.document)
    first.unmount()

    // L'apprenant réécrit sa journée du 6 janvier dans le module portfolio.
    const texte = record.texte.replace('Journée du 2026-01-06', 'Journée RÉÉCRITE du 2026-01-06')
    await createPortfolioStore().save({ ...record, texte, segments: segmentText(texte, { today: '2026-07-12' }) })
    const postsBefore = llmPosts(fetchMock).length

    openWizard()
    await walkToExecution()
    await launch()
    await screen.findByTestId('run-success', {}, { timeout: 15000 })

    // Même runId (portfolio + version) : les 3 checkpoints sont repris tels quels.
    expect(llmPosts(fetchMock).length).toBe(postsBefore)
    const all = idb.values(...CARTOS)
    expect(all).toHaveLength(8)
    const secondDays = all.filter((c) => c.type === 'jour').map((c) => c.document)
    expect(secondDays).toHaveLength(6)
    const firstJan6 = firstDays.find((d) => d.date === '2026-01-06')
    // Le document du 6 janvier ré-enregistré est l'ANCIEN, identique au premier.
    expect(secondDays.filter((d) => d.date === '2026-01-06')).toEqual([firstJan6, firstJan6])
  })
})

