// UC-PRO-07 — Exécuter le code d'un paquet en sandbox : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-07-sandbox.md
//
// Le promptologue lance, au banc d'essai de l'atelier (PromptologueView,
// section banc-essai), un paquet dont l'orchestration est du CODE : le banc le
// route vers la sandbox. Tout est réel — banc, pont runPackageInSandbox,
// source du worker (buildWorkerSource), module d'orchestration du paquet,
// validation au schéma — sauf :
//   - le réseau (API humanome + proxy LLM « Service humanome », simulés) ;
//   - l'hôte d'exécution : jsdom ne sait ni exécuter un srcdoc ni créer un
//     Worker. La couture benchDeps.sandboxRunner injecte l'hôte SIMULÉ du
//     support (qui exécute la vraie source du worker en processus). F11 garde
//     l'hôte iframe RÉEL pour vérifier ce que la page insère et détruit.
// L'ISOLATION (réseau coupé par la CSP, origine opaque) n'est PAS observable
// ici : elle est prouvée en Chromium par web/e2e/sandbox-isolation.e2e.js.
// Prérequis : Node ≥ 21.7 (hôte simulé : vm USE_MAIN_CONTEXT_DEFAULT_LOADER).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PromptologueView from '../../../src/views/PromptologueView.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { runPackageInSandbox } from '../../../src/lib/sandbox/index.js'
import pkgFixture from '../../../../schemas/fixtures/prompt-package-exemple.json'
import {
  DAY_DOCS,
  PROMPTOLOGUE,
  authMe,
  clone,
  decodeDataUrl,
  jsonResponse,
  serviceHumanome,
  simulatedSandbox,
  stubNetwork,
} from '../support/banc.js'

// Scénarios bout à bout (vrai moteur, dizaines d'appels LLM simulés) : marge
// pour une exécution parallèle chargée de toutes les suites.
vi.setConfig({ testTimeout: 30_000 })
const LONG = { timeout: 15_000 }

/** Paquet publié à code personnalisé (aurora-demo 1.0.0), code éventuellement remplacé. */
function sandboxPackage(code, version = '1.0.0') {
  const pkg = { ...clone(pkgFixture), version }
  if (code) pkg.code = { ...pkg.code, orchestration: code }
  return pkg
}

function bancRoutes({ published = [{ id: 'aurora-demo', version: '1.0.0', reserved: false }], packages = { 'aurora-demo/1.0.0': sandboxPackage() }, drafts = [] } = {}) {
  const routes = {
    'api/auth/me': authMe(PROMPTOLOGUE),
    'api/prompt-packages': () => jsonResponse(200, published),
    'api/prompt-packages/drafts': () => jsonResponse(200, drafts.map(({ document, ...meta }) => meta)),
    'api/referentiel/versions': () => jsonResponse(200, []),
  }
  for (const [key, doc] of Object.entries(packages)) routes[`api/prompt-packages/${key}`] = () => jsonResponse(200, doc)
  for (const draft of drafts) routes[`api/prompt-packages/drafts/${draft.draftId}`] = () => jsonResponse(200, draft)
  return routes
}

/** Banc avec la vraie sandbox (pont + worker) sur l'hôte simulé. */
function openBanc({ timeoutMs } = {}) {
  const sandbox = simulatedSandbox()
  const sandboxRunner = vi.fn((params) =>
    runPackageInSandbox({ ...params, hostFactory: sandbox.factory, ...(timeoutMs ? { timeoutMs } : {}) }),
  )
  render(<PromptologueView section="banc-essai" deps={{ benchDeps: { sandboxRunner } }} />)
  return { sandbox, sandboxRunner }
}

async function choisir(value, label = 'Version à tester') {
  const select = await screen.findByLabelText(label, {}, LONG)
  await waitFor(() => expect([...select.options].map((o) => o.value)).toContain(value))
  fireEvent.change(select, { target: { value } })
}

function uneJournee(iso = '2026-01-05') {
  fireEvent.click(screen.getByRole('radio', { name: /Une journée/ }))
  fireEvent.change(screen.getByLabelText('Journée'), { target: { value: iso } })
}

async function lancer() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
  })
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  resetApiClient()
})

describe('UC-PRO-07 — scénario nominal', () => {
  it('UC-PRO-07-F01 — nominal : un paquet à code s’exécute en sandbox — prompts du paquet, LLM choisi par l’utilisateur, document validé', async () => {
    const llm = serviceHumanome()
    const net = stubNetwork({ ...bancRoutes(), ...llm.routes })
    const { sandbox, sandboxRunner } = openBanc()
    await choisir('pub:aurora-demo@1.0.0')
    uneJournee()
    await lancer()

    const bloc = await screen.findByTestId('banc-simple', {}, LONG)
    expect(bloc.textContent).toContain('aurora-demo@1.0.0 sur « Fixture embarquée : Maya, 3 journées »')
    expect(bloc.textContent).toContain('1 journée(s), 8 appel(s) LLM')
    expect(bloc.textContent).toContain('exécution sandbox')
    // Le banc a résolu le paquet publié puis l'a confié à la sandbox (1 run / journée).
    expect(net.calls('api/prompt-packages/aurora-demo/1.0.0')).toHaveLength(1)
    expect(sandboxRunner).toHaveBeenCalledTimes(1)
    expect(sandbox.hosts).toHaveLength(1)
    expect(sandbox.hosts[0].terminated).toBe(true) // worker détruit en fin de run
    // Les 8 demandes du CODE du paquet (ses gabarits) ont été servies par le
    // fournisseur choisi par l'utilisateur (proxy humanome), jamais par le paquet.
    expect(llm.prompts).toHaveLength(8)
    expect(llm.prompts.slice(0, 7).every((p) => p.startsWith('# Cadre\nTu es le Greffier du protocole'))).toBe(true)
    expect(llm.prompts[7]).toContain('Tu es le prompt kairos')
    const exported = decodeDataUrl(screen.getByRole('link', { name: /Télécharger le run/ }).getAttribute('href'))
    expect(exported.days[0].document).toEqual(DAY_DOCS['2026-01-05'])
  })
})

describe('UC-PRO-07 — scénarios alternatifs', () => {
  it('UC-PRO-07-F02 — A1 : A/B moteur embarqué vs paquet à code — une branche moteur, une branche sandbox', async () => {
    const llm = serviceHumanome()
    stubNetwork({ ...bancRoutes(), ...llm.routes })
    const { sandboxRunner } = openBanc()
    await screen.findByLabelText('Version à tester', {}, LONG)
    fireEvent.click(screen.getByRole('radio', { name: /A\/B/ }))
    await choisir('builtin', 'Version A')
    await choisir('pub:aurora-demo@1.0.0', 'Version B')
    uneJournee()
    await lancer()

    const ab = await screen.findByTestId('banc-ab', {}, LONG)
    expect(ab.textContent).toContain('aurora-v3-reconstruit@1.0.0 vs aurora-demo@1.0.0')
    expect(sandboxRunner).toHaveBeenCalledTimes(1) // branche B seulement
    expect(llm.prompts.filter((p) => p.includes('# Pôle 1 — '))).toHaveLength(1) // prompt moteur (A)
    expect(llm.prompts.filter((p) => p.includes('Tu es le Greffier du protocole'))).toHaveLength(7) // gabarits du paquet (B)
    expect(screen.getByTestId('banc-diff-competences').textContent).toContain('Aucun écart')
  })

  it('UC-PRO-07-F03 — A2 : périmètre restreint — la sandbox reçoit un référentiel filtré et valide avec tolérance', async () => {
    const llm = serviceHumanome()
    stubNetwork({ ...bancRoutes(), ...llm.routes })
    const { sandbox } = openBanc()
    await choisir('pub:aurora-demo@1.0.0')
    uneJournee()
    fireEvent.change(screen.getByLabelText('Périmètre du référentiel'), { target: { value: 'pole:2' } })
    await lancer()

    await screen.findByTestId('banc-simple', {}, LONG)
    const run = sandbox.hosts[0].toWorker.find((m) => m.type === 'run')
    expect(run.referentiel.poles.map((p) => p.num)).toEqual([2])
    expect(new Set(run.referentiel.competences.map((c) => c.pole))).toEqual(new Set([2]))
    expect(llm.prompts).toHaveLength(2) // le code itère referentiel.poles : 1 pôle + kairos
    const exported = decodeDataUrl(screen.getByRole('link', { name: /Télécharger le run/ }).getAttribute('href'))
    expect(exported.days[0].document.perimetre).toMatchObject({ partiel: true, poles: [2] })
  })

  it('UC-PRO-07-F04 — A3 : mon brouillon à code s’exécute en sandbox chez moi, son code modifié compris', async () => {
    const llm = serviceHumanome()
    // Brouillon : même paquet, mais le code saute le kairos (7 appels au lieu de 8).
    const code = pkgFixture.code.orchestration
      .replace(/const kairos = JSON\.parse\([\s\S]*?\)\);\n/, '')
      .replace('poles: passes, kairos }', 'poles: passes, kairos: null }')
    expect(code).not.toBe(pkgFixture.code.orchestration)
    const brouillon = { draftId: 21, id: 'aurora-demo', version: '1.1.0', document: sandboxPackage(code, '1.1.0') }
    stubNetwork({ ...bancRoutes({ drafts: [brouillon] }), ...llm.routes })
    const { sandbox } = openBanc()
    await choisir('draft:21')
    uneJournee()
    await lancer()

    const bloc = await screen.findByTestId('banc-simple', {}, LONG)
    expect(bloc.textContent).toContain('aurora-demo@1.1.0')
    expect(bloc.textContent).toContain('7 appel(s) LLM')
    expect(sandbox.hosts[0].terminated).toBe(true)
  })
  it('UC-PRO-07-F12 — A4 : un refus du fournisseur est rendu au paquet, qui réessaie et termine son run', async () => {
    // Le fournisseur refuse le TOUT PREMIER appel (429) ; le paquet intercepte
    // le llm-error et réessaie (sa propre politique), le run aboutit.
    let appels = 0
    const llm = serviceHumanome()
    const routes = { ...llm.routes }
    const repondre = routes['POST api/llm']
    routes['POST api/llm'] = (req) => {
      appels += 1
      return appels === 1 ? jsonResponse(429, { error: 'Quota momentané' }) : repondre(req)
    }
    const code = pkgFixture.code.orchestration
      .replaceAll('await providers.complete(', 'await essai(providers, ')
      .replace(
        'export async function run(',
        'async function essai(providers, p) { try { return await providers.complete(p) } catch { return await providers.complete(p) } }\nexport async function run(',
      )
    stubNetwork({ ...bancRoutes({ packages: { 'aurora-demo/1.0.0': sandboxPackage(code) } }), ...routes })
    const { sandbox } = openBanc()
    await choisir('pub:aurora-demo@1.0.0')
    uneJournee()
    await lancer()

    const bloc = await screen.findByTestId('banc-simple', {}, LONG)
    expect(bloc.textContent).toContain('9 appel(s) LLM') // 8 + le premier, refusé
    expect(sandbox.hosts[0].toWorker.find((m) => m.type === 'llm-error')).toMatchObject({ id: 1 })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('UC-PRO-07 — scénarios d’erreur', () => {
  async function runWithCode(code, options) {
    const llm = serviceHumanome()
    stubNetwork({ ...bancRoutes({ packages: { 'aurora-demo/1.0.0': sandboxPackage(code) } }), ...llm.routes })
    const handle = openBanc(options)
    await choisir('pub:aurora-demo@1.0.0')
    uneJournee()
    await lancer()
    return { ...handle, llm }
  }

  it('UC-PRO-07-F05 — E1 : quota de 16 appels LLM dépassé — run interrompu, message au banc', async () => {
    const { llm, sandbox } = await runWithCode(
      "export async function run(ctx) { for (let i = 0; i < 50; i++) await ctx.providers.complete('Pôle (n° 1) du ' + ctx.date); return {} }",
    )
    expect((await screen.findByRole('alert', {}, LONG)).textContent).toBe(
      "Sandbox : quota d'appels LLM dépassé (16 max par run) — exécution interrompue.",
    )
    expect(llm.prompts).toHaveLength(16)
    expect(sandbox.hosts[0].terminated).toBe(true)
  })

  it('UC-PRO-07-F06 — E2 : délai global dépassé (boucle sans fin) — worker détruit, message', async () => {
    const { sandbox } = await runWithCode('export async function run() { await new Promise(() => {}) }', { timeoutMs: 40 })
    expect((await screen.findByRole('alert', {}, LONG)).textContent).toBe(
      'Sandbox : délai global de 1 min dépassé — exécution interrompue (worker détruit).',
    )
    expect(sandbox.hosts[0].terminated).toBe(true)
  })

  it('UC-PRO-07-F07 — E3 : document final invalide au schéma — refusé avant d’atteindre le banc', async () => {
    await runWithCode("export async function run(ctx) { return { kind: 'cartographie-jour', date: ctx.date, poles: [] } }")
    expect((await screen.findByRole('alert', {}, LONG)).textContent).toMatch(
      /^Sandbox : document final invalide au schéma cartographie-jour \(\d+ erreur\(s\) : /,
    )
    expect(screen.queryByTestId('banc-simple')).toBeNull()
  })

  it('UC-PRO-07-F08 — E4 : document d’un autre type (kind inattendu) — refusé', async () => {
    await runWithCode("export async function run() { return { kind: 'cartographie-merge', domains: [] } }")
    expect((await screen.findByRole('alert', {}, LONG)).textContent).toBe(
      'Sandbox : le paquet a produit un document de type « cartographie-merge » au lieu de « cartographie-jour ».',
    )
  })

  it('UC-PRO-07-F09 — E5 : erreur du code du paquet (entrypoint absent) — message « Sandbox : … »', async () => {
    const llm = serviceHumanome()
    const pkg = sandboxPackage()
    pkg.code = { ...pkg.code, entrypoint: 'lancer' }
    stubNetwork({ ...bancRoutes({ packages: { 'aurora-demo/1.0.0': pkg } }), ...llm.routes })
    openBanc()
    await choisir('pub:aurora-demo@1.0.0')
    uneJournee()
    await lancer()
    expect((await screen.findByRole('alert', {}, LONG)).textContent).toBe(
      "Sandbox : entrypoint introuvable dans le module d'orchestration : lancer",
    )
    expect(llm.prompts).toHaveLength(0)
  })

  it('UC-PRO-07-F10 — E6 : interruption par le promptologue — sandbox détruite, statut neutre', async () => {
    const { sandbox } = await runWithCode('export async function run() { await new Promise(() => {}) }')
    await waitFor(() => expect(sandbox.hosts[0]?.toWorker.some((m) => m.type === 'run')).toBe(true), LONG)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Interrompre' }))
    })
    expect(await screen.findByText('Run interrompu.', {}, LONG)).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(sandbox.hosts[0].terminated).toBe(true)
  })
})

describe('UC-PRO-07 — anomalies constatées (comportement ACTUEL figé)', () => {
  it('UC-PRO-07-F13 — anomalie AN-1 : « Interrompre » pendant la préparation — le code tiers s’exécute quand même et son résultat s’affiche', async () => {
    // COMPORTEMENT ACTUEL, documenté comme anomalie (fiche, AN-1) : le banc
    // affiche « Interrompre » dès « Préparation… », mais ni la preuve de
    // travail (prime, sans signal) ni la lecture du paquet ne testent
    // l'annulation ; le pont reçoit un signal DÉJÀ annulé et l'ignore.
    const llm = serviceHumanome()
    const routes = { ...bancRoutes({ packages: { 'aurora-demo/1.0.0': sandboxPackage(
      `export async function run() { return ${JSON.stringify(DAY_DOCS['2026-01-05'])} }`,
    ) } }), ...llm.routes }
    const defi = routes['api/llm/challenge']
    let libererDefi = null
    routes['api/llm/challenge'] = (req) => new Promise((resolve) => { libererDefi = () => resolve(defi(req)) })
    stubNetwork(routes)
    const { sandbox } = openBanc()
    await choisir('pub:aurora-demo@1.0.0')
    uneJournee()
    await lancer()

    // Préparation en cours (défi de preuve de travail en attente) : interruption.
    await waitFor(() => expect(libererDefi).not.toBeNull(), LONG)
    expect(sandbox.hosts).toHaveLength(0)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Interrompre' }))
    })
    await act(async () => {
      libererDefi()
    })

    // ANOMALIE : la sandbox est quand même créée, le code du paquet tourne, et
    // son document s'affiche comme un run abouti — aucun « Run interrompu ».
    const bloc = await screen.findByTestId('banc-simple', {}, LONG)
    expect(bloc.textContent).toContain('exécution sandbox')
    expect(sandbox.hosts).toHaveLength(1)
    expect(screen.queryByText(/Run interrompu/)).toBeNull()
    expect(llm.prompts).toHaveLength(0)
  })
})

describe('UC-PRO-07 — hôte iframe réel (ce que la page insère)', () => {
  it('UC-PRO-07-F11 — pendant le run, une iframe sandbox « allow-scripts » (srcdoc figé + CSP) est insérée, puis retirée à l’interruption', async () => {
    const llm = serviceHumanome()
    stubNetwork({ ...bancRoutes(), ...llm.routes })
    // Aucune couture : runPackageInSandbox avec createIframeHost RÉEL. jsdom
    // n'exécute pas le srcdoc : le run attend le « boot » jusqu'à l'interruption.
    render(<PromptologueView section="banc-essai" />)
    await choisir('pub:aurora-demo@1.0.0')
    uneJournee()
    await lancer()

    const iframe = await waitFor(() => {
      const found = document.querySelector('iframe[title="Sandbox prompt-package"]')
      expect(found).not.toBeNull()
      return found
    }, LONG)
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts')
    expect(iframe.getAttribute('srcdoc')).toContain(`content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:"`)
    expect(iframe.getAttribute('srcdoc')).not.toContain('Greffier') // le code du paquet n'est pas dans le HTML
    expect(iframe.style.display).toBe('none')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Interrompre' }))
    })
    expect(await screen.findByText('Run interrompu.', {}, LONG)).toBeDefined()
    expect(document.querySelector('iframe[title="Sandbox prompt-package"]')).toBeNull()
    expect(llm.prompts).toHaveLength(0)
  })
})
