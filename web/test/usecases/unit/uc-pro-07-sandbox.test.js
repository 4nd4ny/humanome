// UC-PRO-07 — Exécuter le code d'un paquet en sandbox : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-07-sandbox.md
//
// Code sollicité appelé directement : runPackageInSandbox (pont parent : quota,
// délai, validation, routage LLM), buildWorkerSource (source RÉELLE du worker,
// exécutée ici en processus par l'hôte simulé du support), buildPromptsMap,
// buildSrcdoc et createIframeHost (filtrage des messages par source).
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
import pkgFixture from '../../../../schemas/fixtures/prompt-package-exemple.json'
import referentielFixture from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import { DAY_DOCS, clone, llmReplyFor, simulatedSandbox } from '../support/banc.js'

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
  document.body.innerHTML = ''
})

describe('UC-PRO-07 — exécution du code d’un paquet (source réelle du worker)', () => {
  it('UC-PRO-07-U01 — paquet fixture : 8 demandes LLM routées au fournisseur, document valide rendu, hôte détruit', async () => {
    const { promise, provider, sandbox } = launch()
    const result = await promise

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

  it('UC-PRO-07-U02 — le fournisseur, le modèle et les bornes sont ceux du PARENT, jamais ceux du paquet', async () => {
    // Le code tente de choisir son modèle et une URL : seul le texte du prompt passe.
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

  it('UC-PRO-07-U04 — délai global : un paquet qui ne rend jamais la main est détruit', async () => {
    const { promise, sandbox } = launch({ pkg: withCode('export async function run() { await new Promise(() => {}) }'), timeoutMs: 30 })
    await expect(promise).rejects.toThrow('Sandbox : délai global de 1 min dépassé — exécution interrompue (worker détruit).')
    expect(sandbox.hosts[0].terminated).toBe(true)
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

  it('UC-PRO-07-U06 — erreurs du paquet : entrypoint absent, exception levée → rejet « Sandbox : … »', async () => {
    const absent = launch({ pkg: withCode('export const autre = 1', 'run') })
    await expect(absent.promise).rejects.toThrow("Sandbox : entrypoint introuvable dans le module d'orchestration : run")
    const leve = launch({ pkg: withCode("export async function run() { throw new Error('gabarit manquant') }") })
    await expect(leve.promise).rejects.toThrow('Sandbox : gabarit manquant')
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

  it('UC-PRO-07-U10 — buildWorkerSource / buildSrcdoc : code et données par JSON.stringify, srcdoc figé, worker classique, filtre de source', () => {
    const piege = withCode('export async function run(){ return "</script><script>alert(1)</script>" }')
    const source = buildWorkerSource(piege)
    expect(source).toContain(`const PKG_CODE = ${JSON.stringify(piege.code.orchestration)};`)
    expect(source).toContain(`const PROMPTS = ${JSON.stringify(buildPromptsMap(piege.prompts))};`)
    const srcdoc = buildSrcdoc()
    expect(srcdoc).toContain(`<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">`)
    expect(srcdoc).toContain('if (event.source !== window.parent) return;')
    expect(srcdoc).toContain('worker = new Worker(url);')
    expect(srcdoc).not.toMatch(/new Worker\([^)]*type/) // pas de worker « module » (refusé en origine opaque)
    expect(srcdoc).not.toContain('alert(1)') // le code ne transite jamais par le HTML
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
