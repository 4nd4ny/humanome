// Utilitaires partagés des tests IHM du lot « Promptologue : cycle de vie des
// paquets de prompts » (UC-PRO-01 à UC-PRO-04, UC-ADM-03) — fiches sous
// docs/cas-utilisation/promptologue/ et
// docs/cas-utilisation/administration/UC-ADM-03-valider-paquet-defaut-reglages.md.
//
// Un faux serveur EN MÉMOIRE répond aux routes réellement appelées par l'IHM
// (api/auth/me, api/prompt-packages/**, api/admin/settings**, api/admin/demo-config)
// avec les MÊMES statuts, formes et messages que l'API PHP
// (api/src/routes/packages.php, routes/admin.php, PromptPackageRepository,
// PlatformStatus) : versions publiées immuables, brouillons à portée de leur
// auteur (404 homogène), semver strictement croissant, jeton CSRF exigé sur
// les mutations, garde de rôle (RoleGuard : 401/403 en anglais ; RequireRole :
// messages français). Il sert de réseau simulé via vi.stubGlobal('fetch', …) :
// l'application entière (<App/>) est rendue sans aucun appel réseau réel.
import { vi } from 'vitest'
import pkgFixture from '../../../../schemas/fixtures/prompt-package-exemple.json'

export const CSRF = 'csrf-promptologue-de-test'

export function jsonResponse(status, data, headers = {}) {
  const all = { 'content-type': 'application/json', ...headers }
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => all[name.toLowerCase()] ?? null },
    json: async () => data,
  }
}

export const PROMPTOLOGUE = {
  id: 7,
  email: 'pom@example.org',
  displayName: 'Pom',
  roles: ['apprenant', 'promptologue'],
}

export const ADMIN = { id: 1, email: 'root@example.org', displayName: 'Root Admin', roles: ['admin'] }

/** Document prompt-package (fixture versionnée) à la version donnée. */
export function packageDoc(overrides = {}) {
  return structuredClone({ ...pkgFixture, ...overrides })
}

/** Motif semver 2.0.0 du schéma prompt-package (champ version). */
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

/** Semver x.y.z (le format des paquets de test) : -1, 0, 1. */
function semverCompare(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1
  }
  return 0
}

/** Diff de lignes naïf (ensembles) — suffisant pour la forme {op, line, text} du serveur. */
function naiveLineDiff(from, to) {
  if (from === to) return null
  const a = String(from ?? '').split('\n')
  const b = String(to ?? '').split('\n')
  const ops = []
  a.forEach((text, i) => {
    if (!b.includes(text)) ops.push({ op: 'del', line: i + 1, text })
  })
  b.forEach((text, i) => {
    if (!a.includes(text)) ops.push({ op: 'add', line: i + 1, text })
  })
  return ops
}

/** Diff structurel à la forme de api/src/Packages/PackageDiff.php (sous-ensemble). */
export function structuralDiff(from, to) {
  const key = (p) => `${p.role}\u0000${p.nom}`
  const before = new Map((from.prompts ?? []).map((p) => [key(p), p]))
  const after = new Map((to.prompts ?? []).map((p) => [key(p), p]))
  const added = [...after.values()].filter((p) => !before.has(key(p))).map(({ role, nom }) => ({ role, nom }))
  const removed = [...before.values()].filter((p) => !after.has(key(p))).map(({ role, nom }) => ({ role, nom }))
  const modified = [...after.values()]
    .filter((p) => before.has(key(p)))
    .map((p) => ({ role: p.role, nom: p.nom, texte: naiveLineDiff(before.get(key(p)).texte, p.texte), variables: null }))
    .filter((m) => m.texte !== null)
  const fields = {}
  if (from.description !== to.description) fields.description = { from: from.description, to: to.description }
  const orchestration = naiveLineDiff(from.code?.orchestration, to.code?.orchestration)
  return {
    packageId: to.id,
    from: { version: from.version },
    to: { version: to.version },
    identical: Object.keys(fields).length === 0 && !added.length && !removed.length && !modified.length && !orchestration,
    fields,
    prompts: { added, removed, modified },
    code: { entrypoint: null, orchestration },
    metadata: {},
    summary: { promptsAdded: added.length, promptsRemoved: removed.length, promptsModified: modified.length },
  }
}

/**
 * @param {object} [options]
 * @param {object|null} [options.me] utilisateur de la session (null = visiteur)
 * @param {Array<object>} [options.published] documents prompt-package publiés
 * @param {Array<object>} [options.drafts] brouillons {draftId, owner, document}
 * @param {{id: string, version: string}|null} [options.stored] défaut validé (settings)
 * @param {object|null} [options.proposal] proposition en attente (settings)
 * @param {object} [options.worker] état du worker de masse (instantané admin)
 * @param {object} [options.config] configuration serveur (instantané admin)
 * @param {Record<string, Function>} [options.routes] surcharges « MÉTHODE url » -> (init) => réponse
 */
export function createPromptologueBackend({
  me = PROMPTOLOGUE,
  published = [packageDoc()],
  drafts = [],
  stored = null,
  proposal = null,
  worker = { jobsInQueue: 0, byStatus: { queued: 0, running: 0, done: 0, failed: 0 }, activeRuns: 0, lastActivity: null },
  config = {},
  routes = {},
} = {}) {
  const state = {
    published: published.map((doc, i) => ({ doc: structuredClone(doc), publishedAt: `2026-0${1 + i}-15T10:00:00` })),
    drafts: drafts.map((d) => ({ owner: PROMPTOLOGUE.id, ...structuredClone(d) })),
    stored,
    proposal,
    nextDraftId: 100,
  }
  const calls = []
  const has = (role) => me !== null && me.roles.includes(role)

  const findPublished = (id, version) => state.published.find((p) => p.doc.id === id && p.doc.version === version)
  const myDraft = (draftId) => state.drafts.find((d) => String(d.draftId) === String(draftId) && d.owner === me?.id && !d.published)
  const latest = () => {
    const last = state.published.at(-1)
    return last ? { id: last.doc.id, version: last.doc.version } : null
  }
  const effectiveDefault = () => (state.stored ? { id: state.stored.id, version: state.stored.version } : latest())

  function promptologueGuard() {
    if (me === null) return jsonResponse(401, { error: 'Authentication required' })
    if (!has('promptologue')) return jsonResponse(403, { error: 'Forbidden' })
    return null
  }
  function adminGuard() {
    if (me === null) return jsonResponse(401, { error: 'Authentification requise' })
    if (!has('admin')) return jsonResponse(403, { error: 'Rôle insuffisant' })
    return null
  }

  function handle(method, url, init) {
    const body = init.body ? JSON.parse(init.body) : undefined
    const override = routes[`${method} ${url}`]
    if (override) return override(init, state)

    // CSRF : toute mutation d'une session doit porter le jeton (CsrfMiddleware).
    if (method !== 'GET' && me !== null && init.headers?.['X-CSRF-Token'] !== CSRF) {
      return jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' })
    }

    if (method === 'GET' && url === 'api/auth/me') {
      return me ? jsonResponse(200, { user: me, csrfToken: CSRF }) : jsonResponse(401, { error: 'Authentification requise' })
    }
    if (method === 'GET' && url === 'api/prompt-packages') {
      // Comme listPublished : tri par paquet puis par publication (tri stable,
      // state.published est dans l'ordre de publication) ; description = celle
      // du PAQUET, c.-à-d. de sa dernière version publiée, sur chaque ligne.
      const packageDescription = (id) => state.published.filter((p) => p.doc.id === id).at(-1)?.doc.description ?? null
      return jsonResponse(
        200,
        [...state.published]
          .sort((a, b) => (a.doc.id < b.doc.id ? -1 : a.doc.id > b.doc.id ? 1 : 0))
          .map((p) => ({
            id: p.doc.id,
            version: p.doc.version,
            description: packageDescription(p.doc.id),
            publishedAt: p.publishedAt,
            reserved: p.doc.metadata?.reserved === true,
          })),
      )
    }
    if (method === 'GET' && url === 'api/prompt-packages/default') {
      const current = effectiveDefault()
      return current ? jsonResponse(200, current) : jsonResponse(404, { error: 'Aucun paquet publié' })
    }

    // ---- brouillons (RoleGuard promptologue, portée auteur) ----
    if (url === 'api/prompt-packages/drafts' || url.startsWith('api/prompt-packages/drafts/')) {
      const denied = promptologueGuard()
      if (denied) return denied
      if (method === 'GET' && url === 'api/prompt-packages/drafts') {
        return jsonResponse(
          200,
          state.drafts
            .filter((d) => d.owner === me.id && !d.published)
            .map((d) => ({ draftId: d.draftId, id: d.document.id, version: d.document.version, description: d.document.description, createdAt: '2026-07-01T09:00:00' })),
        )
      }
      if (method === 'POST' && url === 'api/prompt-packages/drafts') {
        const { fromId, fromVersion, version, toId } = body ?? {}
        if (!fromId || !fromVersion || !version) {
          return jsonResponse(422, { error: 'Champs requis : fromId, fromVersion (version source) et version (nouvelle version)' })
        }
        // Comme createDraft : semver vérifié AVANT la recherche de la source ;
        // un 422 porte ses `details`, que l'IHM n'affiche pas (seul `error`).
        if (!SEMVER.test(version)) {
          return jsonResponse(422, { error: 'Document invalide', details: { '/version': ['Version semver invalide'] } })
        }
        const source = findPublished(fromId, fromVersion)?.doc
        if (!source) return jsonResponse(404, { error: 'Version source introuvable' })
        const doc = structuredClone(source)
        if (source.metadata?.reserved === true) {
          // Comme packageForReservedFork : nom requis, différent de la source,
          // kebab-case ≤ 64 caractères, jamais pris par un paquet existant.
          const target = typeof toId === 'string' ? toId.trim() : ''
          if (target === '') {
            return jsonResponse(422, { error: 'Document invalide', details: { '/toId': [`Le paquet « ${fromId} » est réservé : forkez-le sous un nouveau nom (toId requis).`] } })
          }
          if (target === fromId) {
            return jsonResponse(422, { error: 'Document invalide', details: { '/toId': [`Le nom du fork doit différer de « ${fromId} » (paquet réservé).`] } })
          }
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target) || target.length > 64) {
            return jsonResponse(422, { error: 'Document invalide', details: { '/toId': ['Identifiant de paquet invalide (kebab-case, ≤ 64 caractères : a-z, 0-9, tirets).'] } })
          }
          if (state.published.some((p) => p.doc.id === target) || state.drafts.some((d) => d.document.id === target)) {
            return jsonResponse(409, { error: `Un paquet nommé « ${target} » existe déjà — choisissez un autre nom pour votre copie.` })
          }
          doc.id = toId
          delete doc.metadata.reserved
          doc.metadata.forkedFrom = { id: fromId, version: fromVersion }
        } else if (
          state.published.some((p) => p.doc.id === fromId && p.doc.version === version) ||
          state.drafts.some((d) => d.document.id === fromId && d.document.version === version)
        ) {
          return jsonResponse(409, { error: `Version ${version} of prompt package "${fromId}" already exists` })
        }
        doc.version = version
        delete doc.metadata.publieLe
        const draftId = state.nextDraftId++
        state.drafts.push({ draftId, owner: me.id, document: doc })
        return jsonResponse(201, { draftId, id: doc.id, version })
      }
      const match = /^api\/prompt-packages\/drafts\/(\d+)(\/diff-origin|\/publish)?$/.exec(url)
      if (match) {
        const suffix = match[2] ?? ''
        // Comme updateDraft/publishDraft : une version PUBLIÉE de l'auteur répond 409, pas 404.
        const ownPublished = state.drafts.find((d) => String(d.draftId) === String(match[1]) && d.owner === me.id && d.published)
        if (ownPublished && method === 'PUT') {
          return jsonResponse(409, { error: 'Published versions are immutable: create a new draft instead' })
        }
        if (ownPublished && suffix === '/publish') {
          return jsonResponse(409, { error: 'This version is already published (published versions are immutable)' })
        }
        const draft = myDraft(match[1])
        if (!draft) return jsonResponse(404, { error: 'Brouillon introuvable' })
        if (method === 'GET' && suffix === '') {
          return jsonResponse(200, { draftId: draft.draftId, id: draft.document.id, version: draft.document.version, status: 'draft', createdAt: '2026-07-01T09:00:00', document: draft.document })
        }
        if (method === 'GET' && suffix === '/diff-origin') {
          const origin = draft.document.metadata?.forkedFrom
          if (!origin) return jsonResponse(422, { error: 'Ce brouillon n’a pas d’original de référence (ce n’est pas un fork renommé).' })
          const source = findPublished(origin.id, origin.version)?.doc
          if (!source) return jsonResponse(409, { error: 'Version d’origine introuvable (n’est plus publiée).' })
          return jsonResponse(200, structuralDiff(source, draft.document))
        }
        if (method === 'PUT' && suffix === '') {
          const doc = body?.document ?? body
          if (!doc || Object.keys(doc).length === 0) return jsonResponse(400, { error: 'Corps JSON invalide : document prompt-package complet attendu' })
          draft.document = structuredClone(doc)
          return jsonResponse(200, { draftId: draft.draftId, id: doc.id, version: doc.version, status: 'draft', createdAt: '2026-07-01T09:00:00', document: draft.document })
        }
        if (method === 'POST' && suffix === '/publish') {
          const changelog = typeof body?.changelog === 'string' ? body.changelog.trim() : ''
          if (changelog === '') return jsonResponse(422, { error: 'Champ requis : changelog (résumé des changements)' })
          const semver = draft.document.version
          const blocking = state.published.find((p) => p.doc.id === draft.document.id && semverCompare(semver, p.doc.version) <= 0)
          if (blocking) {
            return jsonResponse(409, { error: `Semver must be strictly increasing: ${semver} is not greater than published ${blocking.doc.version}` })
          }
          const doc = structuredClone(draft.document)
          doc.changelog = [...(doc.changelog ?? []).filter((e) => e.version !== semver), { version: semver, date: '2026-07-02', description: changelog }]
          draft.published = true
          state.published.push({ doc, publishedAt: '2026-07-02T10:00:00' })
          return jsonResponse(200, { id: doc.id, version: semver, status: 'published' })
        }
      }
      return jsonResponse(404, { error: 'Not found' })
    }

    const propose = /^api\/prompt-packages\/([^/]+)\/([^/]+)\/propose-default$/.exec(url)
    if (method === 'POST' && propose) {
      const denied = promptologueGuard()
      if (denied) return denied
      const [id, version] = [decodeURIComponent(propose[1]), decodeURIComponent(propose[2])]
      if (!findPublished(id, version)) return jsonResponse(404, { error: 'Version publiée introuvable' })
      state.proposal = { id, version, proposedBy: me.id, proposedAt: '2026-07-03T10:00:00+00:00' }
      return jsonResponse(200, { id, version, status: 'proposed' })
    }
    const diff = /^api\/prompt-packages\/([^/]+)\/diff\/([^/]+)\/([^/]+)$/.exec(url)
    if (method === 'GET' && diff) {
      const [id, v1, v2] = diff.slice(1).map(decodeURIComponent)
      const a = findPublished(id, v1)
      const b = findPublished(id, v2)
      if (!a || !b) return jsonResponse(404, { error: 'Version publiée introuvable' })
      return jsonResponse(200, structuralDiff(a.doc, b.doc))
    }
    const detail = /^api\/prompt-packages\/([^/]+)\/([^/]+)$/.exec(url)
    if (method === 'GET' && detail) {
      const found = findPublished(decodeURIComponent(detail[1]), decodeURIComponent(detail[2]))
      return found ? jsonResponse(200, found.doc) : jsonResponse(404, { error: 'Version publiée introuvable' })
    }

    // ---- administration (RequireRole admin) ----
    if (url === 'api/admin/settings' && method === 'GET') {
      const denied = adminGuard()
      if (denied) return denied
      return jsonResponse(200, {
        defaultPackage: { stored: state.stored, proposal: state.proposal, effective: effectiveDefault() },
        demo: { enabled: true, model: 'claude-haiku-4-5', editableInUi: false },
        worker,
        config,
      })
    }
    if (url === 'api/admin/settings/default-package' && method === 'POST') {
      const denied = adminGuard()
      if (denied) return denied
      const id = typeof body?.id === 'string' ? body.id.trim() : ''
      const version = typeof body?.version === 'string' ? body.version.trim() : ''
      if (id === '' || version === '') return jsonResponse(422, { error: 'Champs requis : id et version' })
      if (!findPublished(id, version)) return jsonResponse(404, { error: 'Version publiée introuvable' })
      state.stored = { id, version, validatedAt: '2026-07-04T10:00:00+00:00' }
      if (state.proposal?.id === id && state.proposal?.version === version) state.proposal = null
      return jsonResponse(200, { id, version, status: 'default' })
    }
    if (url === 'api/admin/demo-config' && method === 'GET') {
      const denied = adminGuard()
      if (denied) return denied
      return jsonResponse(200, {
        effective: { enabled: true, provider: 'anthropic', model: 'claude-haiku-4-5', maxTokensPerRequest: 2048, maxInputChars: 20000, perIpPerHour: 20, dailyGlobalTokens: 2000000, dailyBudgetUsd: 5, powDifficultyBits: 20, upstreamTimeoutSeconds: 60 },
        sources: {},
        allowedModels: ['claude-haiku-4-5'],
        apiKeyConfigured: true,
      })
    }

    return jsonResponse(404, { error: 'absent' })
  }

  const fetchMock = vi.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const u = String(url)
    calls.push({ method, url: u, headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined })
    return handle(method, u, init)
  })

  return {
    state,
    calls,
    fetchMock,
    /** Appels d'une méthode + URL donnés. */
    callsTo: (method, url) => calls.filter((c) => c.method === method && c.url === url),
  }
}
