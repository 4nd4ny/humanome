// Support partagé du lot « banc » (tests JS des cas d'utilisation) :
//   UC-PRO-05 (banc d'essai), UC-PRO-06 (rétrospective), UC-PRO-07 (sandbox),
//   UC-ADM-02 (Golden Prompt).
// Fiches : docs/cas-utilisation/promptologue/UC-PRO-0{5,6,7}-*.md,
//          docs/cas-utilisation/administration/UC-ADM-02-gerer-golden-prompt.md
//
// Trois outils, sans aucun appel réseau réel :
//   1. un RÉSEAU SIMULÉ (vi.stubGlobal('fetch', …)) routé par URL : l'API
//      humanome (session, paquets, référentiel, cartographies, proxy LLM du
//      « Service humanome ») et l'API directe d'un fournisseur (Anthropic) ;
//   2. un LLM factice qui REJOUE les documents jour fixtures
//      (schemas/fixtures/cartographie-jour-2026-01-0{5,6,7}.json) : il lit la
//      date et le pôle dans le prompt (prompts du moteur Aurora ET gabarits du
//      paquet fixture prompt-package-exemple.json) et renvoie le JSON du pôle
//      ou du kairos correspondant — le vrai moteur (extractDay) ou le vrai code
//      d'orchestration du paquet en tire donc un document valide au schéma ;
//   3. un HÔTE SANDBOX SIMULÉ pour runPackageInSandbox : il exécute la VRAIE
//      source du worker (buildWorkerSource) et le VRAI module d'orchestration
//      du paquet, en processus, et relaie le protocole postMessage. Ce n'est
//      PAS une isolation (jsdom n'a ni iframe exécutable ni Worker ni CSP) :
//      l'isolation réelle est prouvée par web/e2e/sandbox-isolation.e2e.js.
//      L'import dynamique repose sur vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER
//      (Node ≥ 21.7, signalé « experimental » par Node au premier usage).
import vm from 'node:vm'
import { vi } from 'vitest'
import jour05 from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import jour06 from '../../../../schemas/fixtures/cartographie-jour-2026-01-06.json'
import jour07 from '../../../../schemas/fixtures/cartographie-jour-2026-01-07.json'

export const STATUT_ETABLIE = 'présence établie'
export const STATUT_NON_ETABLIE = 'présence non établie'
export const STATUT_RENVOI = 'renvoi au cartographe'

/** Documents jour fixtures, indexés par date (sortie « idéale » du LLM). */
export const DAY_DOCS = Object.freeze({
  '2026-01-05': jour05,
  '2026-01-06': jour06,
  '2026-01-07': jour07,
})

export const clone = (value) => structuredClone(value)

/** Réponse HTTP JSON minimale (apiFetch, providers du moteur). */
export function jsonResponse(status, data, headers = {}) {
  const all = { 'content-type': 'application/json', ...headers }
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => all[String(name).toLowerCase()] ?? null },
    json: async () => clone(data),
  }
}

/**
 * Copie d'un document jour où le statut du verdict d'une compétence est forcé.
 * @param {object} doc cartographie-jour
 * @param {Record<string, string>} statuts code -> statut
 */
export function withStatuts(doc, statuts) {
  const copy = clone(doc)
  for (const pole of copy.poles) {
    for (const comp of pole.competences) {
      if (statuts[comp.code] !== undefined) comp.verdict.statut = statuts[comp.code]
    }
  }
  return copy
}

/** Codes établis d'un document jour (ordre croissant). */
export function etablies(doc) {
  return doc.poles
    .flatMap((p) => p.competences)
    .filter((c) => c.verdict?.statut === STATUT_ETABLIE)
    .map((c) => c.code)
    .sort()
}

/**
 * Réponse du LLM factice à UN prompt : JSON du pôle (ou du kairos) de la
 * journée visée, tiré du document fixture (éventuellement muté).
 *
 * Reconnaît les prompts du moteur (« # Pôle n — », « SYNTHÈSE KAIROS ») et
 * ceux du paquet fixture (« (n° n) », « Tu es le prompt kairos »).
 *
 * @param {string} prompt
 * @param {{docsByIso?: object, mutate?: (doc: object, iso: string) => object}} [options]
 * @returns {string} texte JSON
 */
export function llmReplyFor(prompt, { docsByIso = DAY_DOCS, mutate } = {}) {
  const iso = /(\d{4}-\d{2}-\d{2})/.exec(prompt)?.[1]
  const base = docsByIso[iso]
  if (!base) throw new Error(`LLM factice : aucune journée fixture pour « ${iso} »`)
  const doc = mutate ? mutate(clone(base), iso) : base
  if (/SYNTHÈSE KAIROS|Tu es le prompt kairos/.test(prompt)) return JSON.stringify(doc.kairos)
  const num = Number((/# Pôle (\d) — /.exec(prompt) ?? /\(n° (\d)\)/.exec(prompt))?.[1])
  const pole = doc.poles.find((p) => Number(p.poleNum) === num)
  if (!pole) throw new Error(`LLM factice : pôle introuvable dans le prompt (${num})`)
  return JSON.stringify(pole)
}

/** Usage « mesuré » renvoyé par le LLM factice : fixe, pour des coûts exacts. */
export const FAKE_USAGE = Object.freeze({ inputTokens: 1000, outputTokens: 200 })

/** Utilisateur promptologue renvoyé par GET api/auth/me. */
export const PROMPTOLOGUE = Object.freeze({
  id: 7,
  email: 'pom@example.org',
  displayName: 'Pom',
  roles: ['apprenant', 'promptologue'],
})

/** Utilisateur administrateur renvoyé par GET api/auth/me. */
export const ADMIN = Object.freeze({
  id: 1,
  email: 'root@example.org',
  displayName: 'Root Admin',
  roles: ['admin'],
})

/**
 * Installe un réseau simulé. `routes` associe une clé « MÉTHODE url » (ou
 * « url » pour toute méthode) à un gestionnaire (url, init, body) -> réponse.
 * Toute autre URL répond 404 JSON (repli local des vues). Renvoie le mock et
 * des utilitaires d'inspection.
 */
export function stubNetwork(routes) {
  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = String(input)
    const method = (init.method ?? 'GET').toUpperCase()
    let body = null
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = init.body
      }
    }
    const handler = routes[`${method} ${url}`] ?? routes[url]
    if (handler) return handler({ url, init, body, method })
    return jsonResponse(404, { error: 'absent' })
  })
  vi.stubGlobal('fetch', fetchMock)
  const calls = (predicate) =>
    fetchMock.mock.calls
      .map(([u, i]) => ({ url: String(u), method: (i?.method ?? 'GET').toUpperCase(), init: i ?? {} }))
      .filter((c) => (typeof predicate === 'string' ? c.url === predicate : predicate(c)))
  return { fetchMock, calls }
}

/** GET api/auth/me : session (et jeton CSRF) de l'utilisateur donné. */
export function authMe(user) {
  return () =>
    user
      ? jsonResponse(200, { user, csrfToken: 'csrf-test' })
      : jsonResponse(401, { error: 'Authentification requise.' })
}

/**
 * « Service humanome » (proxy api/llm + preuve de travail) : défi de
 * difficulté 0 (résolu instantanément), réponses du LLM factice.
 * `mutate(doc, iso, n, prompt)` reçoit le numéro d'appel (1..) et le prompt.
 * @returns {{routes: object, prompts: string[]}}
 */
export function serviceHumanome({ mutate, usage = FAKE_USAGE, fail } = {}) {
  const prompts = []
  return {
    prompts,
    routes: {
      'api/llm/challenge': () =>
        jsonResponse(200, { challenge: `defi-${prompts.length}`, difficultyBits: 0, expiresAt: null }),
      'POST api/llm': ({ body }) => {
        prompts.push(body.prompt)
        if (fail) return fail(body, prompts.length)
        return jsonResponse(200, {
          text: llmReplyFor(body.prompt, {
            mutate: mutate && ((doc, iso) => mutate(doc, iso, prompts.length, body.prompt)),
          }),
          usage,
          model: 'claude-sonnet-5',
        })
      },
    },
  }
}

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

/**
 * API directe Anthropic (clé personnelle) : réponses du LLM factice au format
 * Messages API. `mutate(doc, iso, n, prompt)` reçoit le numéro d'appel (1..)
 * et le prompt.
 * @returns {{routes: object, requests: object[]}}
 */
export function anthropicDirect({ mutate, usage = { input_tokens: 2000, output_tokens: 500 } } = {}) {
  const requests = []
  return {
    requests,
    routes: {
      [`POST ${ANTHROPIC_URL}`]: ({ body, init }) => {
        requests.push({ body, headers: init.headers })
        const prompt = body.messages[0].content
        const n = requests.length
        return jsonResponse(200, {
          model: body.model,
          content: [
            { type: 'text', text: llmReplyFor(prompt, { mutate: mutate && ((doc, iso) => mutate(doc, iso, n, prompt)) }) },
          ],
          usage,
        })
      },
    },
  }
}

/**
 * Hôte sandbox SIMULÉ (couture hostFactory de runPackageInSandbox) : joue le
 * rôle de l'iframe (boot, init -> ready, relais) et du Web Worker, en
 * exécutant la VRAIE source générée par buildWorkerSource() et le VRAI module
 * d'orchestration du paquet (import dynamique d'une URL data:, comme le Blob du
 * vrai worker). Aucune isolation : voir l'en-tête de ce fichier.
 *
 * @returns {{factory: () => object, hosts: object[]}} fabrique + hôtes créés
 */
export function simulatedSandbox() {
  const hosts = []
  const factory = () => {
    let parentHandler = () => {}
    let worker = null
    const host = {
      started: false,
      terminated: false,
      toWorker: [],
      fromWorker: [],
      onMessage(cb) {
        parentHandler = cb
      },
      start() {
        host.started = true
        // Le bootstrap du srcdoc annonce sa présence au parent.
        setTimeout(() => !host.terminated && parentHandler({ type: 'boot' }), 0)
      },
      send(msg) {
        if (host.terminated) return
        if (msg?.type === 'init') {
          if (worker) return
          worker = startWorker(msg.workerSource, (out) => {
            host.fromWorker.push(out)
            setTimeout(() => !host.terminated && parentHandler(out), 0)
          })
          setTimeout(() => !host.terminated && parentHandler({ type: 'ready' }), 0)
          return
        }
        host.toWorker.push(msg)
        setTimeout(() => !host.terminated && worker?.onmessage?.({ data: msg }), 0)
      },
      terminate() {
        host.terminated = true
      },
    }
    hosts.push(host)
    return host
  }
  return { factory, hosts }
}

/** Démarre la source du worker dans un faux `self` ; renvoie ce `self`. */
function startWorker(workerSource, postToParent) {
  const self = { postMessage: (msg) => postToParent(clone(msg)), onmessage: null }
  const FakeBlob = class {
    constructor(parts) {
      this.text = parts.join('')
    }
  }
  const FakeURL = {
    createObjectURL: (blob) => `data:text/javascript;base64,${Buffer.from(blob.text).toString('base64')}`,
  }
  const script = new vm.Script(`(function (self, URL, Blob) {\n${workerSource}\n})`, {
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  })
  script.runInThisContext()(self, FakeURL, FakeBlob)
  return self
}

/** Mémoire clé/valeur au contrat Storage (carnet du banc). */
export function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  }
}

/** Décode le JSON d'un lien data:application/json (rapports téléchargeables). */
export function decodeDataUrl(href) {
  return JSON.parse(decodeURIComponent(String(href).split(',').slice(1).join(',')))
}
