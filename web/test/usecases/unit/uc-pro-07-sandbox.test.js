// UC-PRO-07 — Exécuter le code d'un paquet en sandbox : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-07-sandbox.md
//
// Code sollicité appelé directement : runPackageInSandbox (pont parent : quota,
// délai, validation, routage LLM), buildWorkerSource (source RÉELLE du worker,
// exécutée ici en processus par l'hôte simulé du support), buildPromptsMap,
// buildSrcdoc et createIframeHost (filtrage des messages par source) ; côté
// banc, runVersionOnDays (branche sandbox), validatePartialJour et
// usesEngineOrchestration.
//
// Deux hôtes de test : l'hôte SIMULÉ du support (vrai worker, vrai module du
// paquet) et un hôte FACTICE (fakeHost) qui laisse le test émettre lui-même
// des messages — pour présenter au pont des messages FORGÉS, comme le ferait
// un paquet hostile qui contourne l'adaptateur providers.complete du worker
// (le worker est aussi non fiable que le paquet : la frontière de confiance
// est le pont).
//
// Prérequis : Node ≥ 21.7 (import dynamique de l'hôte simulé,
// vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER).
//
// Limite assumée : jsdom n'a ni Worker, ni exécution de srcdoc, ni CSP. Ces
// tests prouvent le PROTOCOLE et la logique du pont ; l'ISOLATION réelle
// (réseau coupé, origine opaque) est prouvée en navigateur réel par
// web/e2e/sandbox-isolation.e2e.js et web/e2e/parcours-promptologue.e2e.js.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_LLM_CALLS_PER_RUN,
  SANDBOX_CSP,
  buildPromptsMap,
  buildSrcdoc,
  buildWorkerSource,
} from '../../../src/lib/sandbox/protocol.js'
import { createIframeHost, runPackageInSandbox } from '../../../src/lib/sandbox/sandbox.js'
import { SANDBOX_TIMEOUT_MS, usesEngineOrchestration } from '../../../src/lib/sandbox/index.js'
import { runVersionOnDays, validatePartialJour } from '../../../src/views/promptologue/bench.js'
import { BUILTIN_PACKAGE } from '../../../src/lib/run-launcher.js'
import pkgFixture from '../../../../schemas/fixtures/prompt-package-exemple.json'
import referentielFixture from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import { DAY_DOCS, clone, llmReplyFor, simulatedSandbox } from '../support/banc.js'

/** Hôte FACTICE : enregistre les envois du pont, le test émet les messages. */
function fakeHost() {
  let handler = () => {}
  const host = {
    sent: [],
    terminated: false,
    onMessage(cb) {
      handler = cb
    },
    start() {},
    send(msg) {
      host.sent.push(msg)
    },
    terminate() {
      host.terminated = true
    },
    emit(msg) {
      handler(msg)
    },
  }
  return host
}

/** Paquet dont le module d'orchestration est remplacé par `code`. */
const withCode = (code, entrypoint = 'run') => ({ ...clone(pkgFixture), code: { orchestration: code, entrypoint } })

/** Fournisseur « parent » qui rejoue les fixtures (prompts du paquet). */
const replayProvider = () => ({ complete: vi.fn(async ({ prompt }) => ({ text: llmReplyFor(prompt) })) })

function launch({ pkg = pkgFixture, provider = replayProvider(), ...params } = {}) {
  const sandbox = simulatedSandbox()
  const promise = runPackageInSandbox({
    pkg,
    dayText: 'Texte de la journée du 5 janvier.',
    date: '2026-01-05',
    referentiel: referentielFixture,
    provider,
    model: 'modele-choisi-par-l-utilisateur',
    maxTokens: 2048,
    hostFactory: sandbox.factory,
    ...params,
  })
  promise.catch(() => {})
  return { promise, provider, sandbox }
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('UC-PRO-07 — exécution du code d’un paquet (source réelle du worker)', () => {
  it('UC-PRO-07-U01 — paquet fixture : 8 demandes LLM routées au fournisseur, progression notifiée, document valide rendu, hôte détruit', async () => {
    const onLlmCall = vi.fn()
    const { promise, provider, sandbox } = launch({ onLlmCall })
    const result = await promise

    // Étape 5 : chaque demande comptée est notifiée (progression du banc).
    expect(onLlmCall.mock.calls.map(([info]) => info)).toEqual(
      Array.from({ length: 8 }, (_, i) => ({ calls: i + 1, max: MAX_LLM_CALLS_PER_RUN })),
    )

    expect(result.llmCalls).toBe(8) // 7 pôles + kairos, par le code du paquet
    expect(result.document).toEqual({ ...DAY_DOCS['2026-01-05'] })
    expect(provider.complete).toHaveBeenCalledTimes(8)
    // Les prompts viennent des GABARITS du paquet, rendus par son code.
    expect(provider.complete.mock.calls[0][0].prompt).toContain('Tu es le Greffier du protocole de cartographie')
    expect(provider.complete.mock.calls[0][0].prompt).toContain('Texte de la journée du 5 janvier.')
    const [host] = sandbox.hosts
    expect(host.toWorker[0]).toEqual({
      type: 'run',
      dayText: 'Texte de la journée du 5 janvier.',
      date: '2026-01-05',
      referentiel: referentielFixture,
    })
    expect(host.fromWorker.at(-1).type).toBe('result')
    expect(host.terminated).toBe(true)
  })

  it('UC-PRO-07-U02 — par l’API offerte au paquet : le fournisseur, le modèle et les bornes sont ceux du PARENT, jamais ceux du paquet', async () => {
    // Le code tente de choisir son modèle et une URL via providers.complete :
    // l'adaptateur du worker n'en transmet que le texte. (Vérification
    // complémentaire : la frontière de confiance est le pont, voir U12.)
    const code = `export async function run(ctx) {
      await ctx.providers.complete('Pôle unique (n° 1) du 2026-01-05', { model: 'modele-pirate', url: 'https://exfil.invalid' });
      return { kind: 'x' };
    }`
    const { promise, provider, sandbox } = launch({ pkg: withCode(code) })
    await expect(promise).rejects.toThrow()
    expect(provider.complete).toHaveBeenCalledTimes(1)
    const params = provider.complete.mock.calls[0][0]
    expect(Object.keys(params).sort()).toEqual(['maxTokens', 'model', 'prompt', 'signal'])
    expect(params).toMatchObject({ model: 'modele-choisi-par-l-utilisateur', maxTokens: 2048 })
    expect(sandbox.hosts[0].fromWorker[0]).toEqual({ type: 'llm', id: 1, prompt: 'Pôle unique (n° 1) du 2026-01-05' })

    // RG4, nuance : par l'API offerte au paquet, un prompt non textuel est
    // d'abord CONVERTI en chaîne par l'adaptateur du worker (String) — il
    // atteint donc le fournisseur (« undefined »), il n'est pas refusé.
    const converti = launch({ pkg: withCode("export async function run(ctx) { await ctx.providers.complete(); return { kind: 'x' } }") })
    await expect(converti.promise).rejects.toThrow()
    expect(converti.provider.complete.mock.calls.map(([p]) => p.prompt)).toEqual(['undefined'])
  })

  it(`UC-PRO-07-U03 — quota : le ${MAX_LLM_CALLS_PER_RUN + 1}e appel est refusé et le run interrompu`, async () => {
    const code = `export async function run(ctx) {
      for (let i = 0; i < 40; i++) await ctx.providers.complete('Pôle (n° 1) du 2026-01-05 #' + i);
      return {};
    }`
    const { promise, provider, sandbox } = launch({ pkg: withCode(code) })
    await expect(promise).rejects.toThrow(
      `Sandbox : quota d'appels LLM dépassé (${MAX_LLM_CALLS_PER_RUN} max par run) — exécution interrompue.`,
    )
    expect(provider.complete).toHaveBeenCalledTimes(MAX_LLM_CALLS_PER_RUN)
    expect(sandbox.hosts[0].toWorker.at(-1)).toMatchObject({ type: 'llm-error', id: MAX_LLM_CALLS_PER_RUN + 1, message: 'quota dépassé' })
    expect(sandbox.hosts[0].terminated).toBe(true)
  })

  it('UC-PRO-07-U04 — délai global : un paquet qui ne rend jamais la main est détruit ; délai par défaut de 5 min', async () => {
    const { promise, sandbox } = launch({ pkg: withCode('export async function run() { await new Promise(() => {}) }'), timeoutMs: 30 })
    await expect(promise).rejects.toThrow('Sandbox : délai global de 1 min dépassé — exécution interrompue (worker détruit).')
    expect(sandbox.hosts[0].terminated).toBe(true)

    // Sans couture timeoutMs : SANDBOX_TIMEOUT_MS (5 min), libellé « 5 min ».
    expect(SANDBOX_TIMEOUT_MS).toBe(5 * 60 * 1000)
    vi.useFakeTimers()
    const host = fakeHost()
    const bloque = runPackageInSandbox({ pkg: pkgFixture, provider: replayProvider(), model: 'm', hostFactory: () => host })
    bloque.catch(() => {})
    vi.advanceTimersByTime(SANDBOX_TIMEOUT_MS - 1)
    expect(host.terminated).toBe(false)
    vi.advanceTimersByTime(1)
    await expect(bloque).rejects.toThrow('Sandbox : délai global de 5 min dépassé — exécution interrompue (worker détruit).')
    expect(host.terminated).toBe(true)
  })

  it('UC-PRO-07-U05 — un refus LLM (llm-error) est rendu au paquet, qui peut dégrader et continuer', async () => {
    const provider = { complete: vi.fn(async () => { throw new Error('HTTP 429 — quota fournisseur') }) }
    const code = `export async function run(ctx) {
      let erreur = null;
      try { await ctx.providers.complete('Pôle (n° 1) du 2026-01-05'); } catch (e) { erreur = e.message; }
      return { kind: 'cartographie-jour', erreur };
    }`
    const { promise, sandbox } = launch({ pkg: withCode(code), provider, validateFn: () => ({ valid: true, errors: [] }) })
    const { document } = await promise
    expect(document.erreur).toBe('HTTP 429 — quota fournisseur')
    expect(sandbox.hosts[0].toWorker.find((m) => m.type === 'llm-error')).toEqual({ type: 'llm-error', id: 1, message: 'HTTP 429 — quota fournisseur' })
  })

  it('UC-PRO-07-U06 — erreurs du paquet : export introuvable, exception levée, module qui ne se charge pas → rejet « Sandbox : … »', async () => {
    const absent = launch({ pkg: withCode('export const autre = 1', 'run') })
    await expect(absent.promise).rejects.toThrow("Sandbox : entrypoint introuvable dans le module d'orchestration : run")
    const leve = launch({ pkg: withCode("export async function run() { throw new Error('gabarit manquant') }") })
    await expect(leve.promise).rejects.toThrow('Sandbox : gabarit manquant')
    // Erreur de chargement : module syntaxiquement invalide, import() rejeté.
    const casse = launch({ pkg: withCode('export async function run( {') })
    await expect(casse.promise).rejects.toThrow(/^Sandbox : /)
    expect(casse.provider.complete).not.toHaveBeenCalled()
    expect(casse.sandbox.hosts[0].terminated).toBe(true)
  })

  it('UC-PRO-07-U07 — résultat empoisonné : kind inattendu ou document invalide au schéma → refusé', async () => {
    const kind = launch({ pkg: withCode("export async function run() { return { kind: 'cartographie-merge' } }") })
    await expect(kind.promise).rejects.toThrow(
      'Sandbox : le paquet a produit un document de type « cartographie-merge » au lieu de « cartographie-jour ».',
    )
    const invalide = launch({ pkg: withCode("export async function run(ctx) { return { kind: 'cartographie-jour', date: ctx.date, poles: [] } }") })
    await expect(invalide.promise).rejects.toThrow(/^Sandbox : document final invalide au schéma cartographie-jour \(\d+ erreur\(s\)/)
  })

  it('UC-PRO-07-U08 — pré-conditions : provider sans complete() ou paquet sans code → rejet AVANT toute création d’hôte', async () => {
    const hostFactory = vi.fn()
    await expect(runPackageInSandbox({ pkg: pkgFixture, provider: {}, hostFactory })).rejects.toThrow('provider avec complete() requis')
    await expect(
      runPackageInSandbox({ pkg: { code: { orchestration: '', entrypoint: 'run' } }, provider: replayProvider(), hostFactory }),
    ).rejects.toThrow('buildWorkerSource : code.orchestration requis')
    // Point d'entrée VIDE (≠ export introuvable, E5) : TypeError sans préfixe « Sandbox : ».
    const sansEntree = runPackageInSandbox({ pkg: { code: { orchestration: 'export function run(){}', entrypoint: '' } }, provider: replayProvider(), hostFactory })
    await expect(sansEntree).rejects.toThrow(TypeError)
    await expect(sansEntree).rejects.toThrow('buildWorkerSource : code.entrypoint requis')
    expect(hostFactory).not.toHaveBeenCalled()
  })
})

describe('UC-PRO-07 — constructeurs du protocole et hôte iframe', () => {
  it('UC-PRO-07-U09 — buildPromptsMap : par rôle (premier gabarit) et par « rôle/nom » ; entrées invalides ignorées', () => {
    const map = buildPromptsMap([
      { role: 'extraction-pole', nom: 'Principal', texte: 'A' },
      { role: 'extraction-pole', nom: 'Variante', texte: 'B' },
      { role: 'kairos', texte: 'K' },
      { role: 42, texte: 'ignoré' },
      null,
    ])
    expect(map).toEqual({
      'extraction-pole': 'A',
      'extraction-pole/Principal': 'A',
      'extraction-pole/Variante': 'B',
      kairos: 'K',
    })
  })

  it('UC-PRO-07-U10 — buildWorkerSource / buildSrcdoc : code et données par JSON.stringify, srcdoc figé, worker classique, filtre de source ; le code ne transite que par postMessage', async () => {
    const piege = withCode('export async function run(){ return "</script><script>alert(1)</script>" }')
    const source = buildWorkerSource(piege)
    expect(source).toContain(`const PKG_CODE = ${JSON.stringify(piege.code.orchestration)};`)
    expect(source).toContain(`const PROMPTS = ${JSON.stringify(buildPromptsMap(piege.prompts))};`)
    const srcdoc = buildSrcdoc()
    expect(srcdoc).toContain(`<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">`)
    expect(srcdoc).toContain('if (event.source !== window.parent) return;')
    expect(srcdoc).toContain('worker = new Worker(url);')
    expect(srcdoc).not.toMatch(/new Worker\([^)]*type/) // pas de worker « module » (refusé en origine opaque)

    // RG1, preuve de transit : le pont ne livre le code QUE dans le message
    // {type:'init', workerSource}, après le boot de l'hôte.
    const host = fakeHost()
    const controller = new AbortController()
    const run = runPackageInSandbox({ pkg: piege, provider: replayProvider(), model: 'm', signal: controller.signal, hostFactory: () => host })
    run.catch(() => {})
    expect(host.sent).toEqual([]) // rien avant le boot
    host.emit({ type: 'boot' })
    host.emit({ type: 'ready' })
    expect(host.sent[0]).toEqual({ type: 'init', workerSource: source })
    expect(host.sent[0].workerSource).toContain(JSON.stringify(piege.code.orchestration))
    expect(host.sent.slice(1).some((m) => JSON.stringify(m).includes('alert(1)'))).toBe(false)
    controller.abort()
    await expect(run).rejects.toThrow('Sandbox : exécution annulée.')

    // Hôte RÉEL pour ce même paquet piégé : l'iframe créée porte le srcdoc
    // figé, identique quel que soit le paquet — le code n'y figure pas.
    const reel = new AbortController()
    const avecIframe = runPackageInSandbox({ pkg: piege, provider: replayProvider(), model: 'm', signal: reel.signal })
    avecIframe.catch(() => {})
    const iframe = document.querySelector('iframe[title="Sandbox prompt-package"]')
    expect(iframe.getAttribute('srcdoc')).toBe(buildSrcdoc())
    expect(iframe.getAttribute('srcdoc')).not.toContain('alert(1)')
    reel.abort()
    await expect(avecIframe).rejects.toThrow('Sandbox : exécution annulée.')
    expect(document.querySelector('iframe[title="Sandbox prompt-package"]')).toBeNull()
  })

  it('UC-PRO-07-U11 — createIframeHost : iframe allow-scripts (sans allow-same-origin), messages filtrés par SOURCE, retrait complet', () => {
    const host = createIframeHost()
    const recus = []
    host.onMessage((msg) => recus.push(msg))
    host.start()
    const iframe = document.querySelector('iframe[title="Sandbox prompt-package"]')
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts')
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(iframe.getAttribute('aria-hidden')).toBe('true')
    expect(iframe.getAttribute('srcdoc')).toBe(buildSrcdoc())

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'boot' }, source: iframe.contentWindow }))
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'llm', id: 1, prompt: 'usurpation' }, source: window }))
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'result', document: {} } }))
    expect(recus).toEqual([{ type: 'boot' }])

    host.terminate()
    expect(document.querySelector('iframe[title="Sandbox prompt-package"]')).toBeNull()
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'ready' }, source: iframe.contentWindow }))
    expect(recus).toHaveLength(1) // écouteur retiré
  })
})

describe('UC-PRO-07 — frontière de confiance : messages FORGÉS présentés au pont', () => {
  it('UC-PRO-07-U12 — RG2 : un message llm forgé (model, maxTokens, url, provider, apiKey) — le pont n’en retient que le prompt', async () => {
    const host = fakeHost()
    const provider = replayProvider()
    const run = runPackageInSandbox({
      pkg: pkgFixture,
      provider,
      model: 'modele-choisi-par-l-utilisateur',
      maxTokens: 2048,
      hostFactory: () => host,
    })
    run.catch(() => {})
    host.emit({ type: 'boot' })
    host.emit({ type: 'ready' })
    // Un paquet hostile peut appeler self.postMessage directement.
    host.emit({
      type: 'llm',
      id: 1,
      prompt: 'Pôle unique (n° 1) du 2026-01-05',
      model: 'modele-pirate',
      maxTokens: 999999,
      url: 'https://exfil.invalid',
      provider: 'x',
      apiKey: 'k',
    })
    await vi.waitFor(() => expect(provider.complete).toHaveBeenCalledTimes(1))
    expect(provider.complete.mock.calls[0][0]).toStrictEqual({
      model: 'modele-choisi-par-l-utilisateur',
      prompt: 'Pôle unique (n° 1) du 2026-01-05',
      maxTokens: 2048,
      signal: undefined,
    })
    await vi.waitFor(() => expect(host.sent.some((m) => m.type === 'llm-ok' && m.id === 1)).toBe(true))
    host.emit({ type: 'result', document: clone(DAY_DOCS['2026-01-05']) })
    expect((await run).llmCalls).toBe(1)
  })

  it('UC-PRO-07-U16 — RG4 : types hors protocole et message nul ignorés ; prompt non textuel refusé (« prompt vide »), compté, sans appel au fournisseur', async () => {
    const host = fakeHost()
    const provider = replayProvider()
    const run = runPackageInSandbox({ pkg: pkgFixture, provider, model: 'm', hostFactory: () => host })
    host.emit({ type: 'boot' })
    host.emit({ type: 'exfiltrate', data: 'x' })
    host.emit(null)
    host.emit({ type: 'llm', id: 9, prompt: 42 })
    host.emit({ type: 'llm', id: 10, prompt: '' })
    expect(host.sent.filter((m) => m.type === 'llm-error')).toEqual([
      { type: 'llm-error', id: 9, message: 'prompt vide' },
      { type: 'llm-error', id: 10, message: 'prompt vide' },
    ])
    expect(host.sent.map((m) => m.type)).toEqual(['init', 'llm-error', 'llm-error'])
    host.emit({ type: 'result', document: clone(DAY_DOCS['2026-01-05']) })
    const result = await run
    expect(provider.complete).not.toHaveBeenCalled()
    expect(result.llmCalls).toBe(2) // anti-spam : les refus comptent dans le quota
  })
})

describe('UC-PRO-07 — appel par le banc (runVersionOnDays, branche sandbox)', () => {
  it('UC-PRO-07-U15 — une exécution sandbox PAR journée, référentiel filtré, validation tolérante, document marqué partiel, progression', async () => {
    // Routage : ni paquet embarqué, ni marqueur engine:// -> sandbox.
    expect(usesEngineOrchestration(BUILTIN_PACKAGE)).toBe(true)
    expect(usesEngineOrchestration({ code: { orchestration: '// engine://humanome-engine@0.1.0' } })).toBe(true)
    expect(usesEngineOrchestration(pkgFixture)).toBe(false)

    const sb = simulatedSandbox()
    const runner = vi.fn((params) => runPackageInSandbox({ ...params, hostFactory: sb.factory }))
    const progress = []
    const dayGroups = [
      { iso: '2026-01-05', texte: 'Texte du 5 janvier.' },
      { iso: '2026-01-06', texte: 'Texte du 6 janvier.' },
    ]
    const result = await runVersionOnDays({
      pkg: pkgFixture,
      dayGroups,
      referentiel: referentielFixture,
      provider: replayProvider(),
      model: 'modele-choisi-par-l-utilisateur',
      perimetre: { poles: [2] },
      sandboxRunner: runner,
      onProgress: (p) => progress.push(p),
    })

    expect(result.engine).toBe(false)
    expect(sb.hosts).toHaveLength(2) // un hôte (quota et délai propres) par journée
    expect(runner).toHaveBeenCalledTimes(2)
    expect(runner.mock.calls.every(([p]) => p.validateFn === validatePartialJour)).toBe(true)
    for (const [i, host] of sb.hosts.entries()) {
      const run = host.toWorker.find((m) => m.type === 'run')
      expect(run.date).toBe(dayGroups[i].iso)
      expect(run.referentiel.poles.map((p) => p.num)).toEqual([2])
      expect(run.referentiel.competences.every((c) => c.pole === 2)).toBe(true)
      expect(host.terminated).toBe(true)
    }
    const codesPole2 = referentielFixture.competences.filter((c) => c.pole === 2).map((c) => c.code).sort()
    for (const { document } of result.days) {
      expect(document.perimetre).toEqual({ partiel: true, poles: [2], competences: codesPole2 })
      expect(document.poles.map((p) => p.poleNum)).toEqual(['2'])
    }
    // Pôle 2 + kairos par journée (le paquet fixture instruit referentiel.poles).
    expect(result.llmCalls).toBe(4)
    const calls = progress.map((p) => p.calls)
    expect(calls).toEqual([...calls].sort((a, b) => a - b))
    expect(progress.at(-1)).toMatchObject({ iso: '2026-01-06', position: 2, total: 2, calls: 4 })

    // validatePartialJour : un document partiel conforme passe la sonde ; à 7
    // pôles, c'est la validation stricte qui s'applique.
    expect(validatePartialJour('cartographie-jour', result.days[0].document)).toEqual({ valid: true, errors: [] })
    const septPoles = { ...clone(DAY_DOCS['2026-01-05']), perimetre: { partiel: true } }
    expect(validatePartialJour('cartographie-jour', septPoles).valid).toBe(true)
    delete septPoles.poles[3].competences
    expect(validatePartialJour('cartographie-jour', septPoles).valid).toBe(false)
  })
})

describe('UC-PRO-07 — anomalies constatées (comportement ACTUEL figé)', () => {
  it('UC-PRO-07-U13 — anomalie AN-1 : un signal DÉJÀ annulé est ignoré — l’hôte est créé, le code tiers s’exécute et son résultat est rendu', async () => {
    // COMPORTEMENT ACTUEL, documenté comme anomalie (fiche, AN-1) : le pont
    // n'écoute que l'événement « abort » à venir, sans tester signal.aborted à
    // l'entrée. Attendu : rejet « Sandbox : exécution annulée. » sans hôte créé.
    const controller = new AbortController()
    controller.abort()
    const sb = simulatedSandbox()
    const code = "export async function run(ctx) { return { kind: 'cartographie-jour', date: ctx.date, sansLlm: true } }"
    const result = await runPackageInSandbox({
      pkg: withCode(code),
      date: '2026-01-05',
      provider: replayProvider(),
      model: 'm',
      signal: controller.signal,
      hostFactory: sb.factory,
      validateFn: () => ({ valid: true, errors: [] }),
    })
    expect(sb.hosts).toHaveLength(1) // ANOMALIE : devrait valoir 0
    expect(result).toMatchObject({ document: { kind: 'cartographie-jour', sansLlm: true }, llmCalls: 0 })
  })

  it('UC-PRO-07-U14 — anomalie AN-2 : en périmètre restreint, la sonde tolérante accepte un poleNum hors énumération, des pôles dupliqués ou hors périmètre', () => {
    // COMPORTEMENT ACTUEL, documenté comme anomalie (fiche, AN-2) : la sonde
    // duplique les pôles et RÉÉCRIT leur poleNum en 1..7 avant validation ;
    // elle ignore le périmètre demandé. Attendu : valid === false.
    const base = DAY_DOCS['2026-01-05']
    const pole = (num) => clone(base.poles.find((p) => p.poleNum === num))
    const partiel = (poles) => ({ ...clone(base), poles, kairos: null, perimetre: { partiel: true, poles: [2] } })

    const horsEnum = partiel([{ ...pole('2'), poleNum: '99' }])
    expect(validatePartialJour('cartographie-jour', horsEnum).valid).toBe(true) // ANOMALIE
    // La validation stricte du même pôle le refuse (poleNum hors énumération).
    const strict = { ...clone(base), poles: base.poles.map((p) => (p.poleNum === '2' ? { ...clone(p), poleNum: '99' } : clone(p))) }
    expect(validatePartialJour('cartographie-jour', strict).valid).toBe(false)

    expect(validatePartialJour('cartographie-jour', partiel([pole('2'), pole('2'), pole('2')])).valid).toBe(true) // ANOMALIE : doublons
    expect(validatePartialJour('cartographie-jour', partiel([pole('5')])).valid).toBe(true) // ANOMALIE : pôle 5 pour un périmètre « pôle 2 »
  })
})
