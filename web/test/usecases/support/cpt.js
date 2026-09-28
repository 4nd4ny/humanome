// Lot « Compte » (UC-CPT-01 à UC-CPT-06) — utilitaires partagés des tests IHM.
// Fiches : docs/cas-utilisation/compte/
//
// createFakeAccountApi() simule, EN MÉMOIRE, le contrat HTTP des routes du
// compte (api/src/routes/auth.php, keys.php, training.php) tel que le rejouent
// les tests fonctionnels PHP : un seul navigateur (une session au plus), jeton
// CSRF exigé sur les mutations quand une session existe (CsrfMiddleware, avec
// les mêmes exemptions), messages d'erreur français identiques à l'API. Elle
// sert de `fetch` global (vi.stubGlobal) : l'IHM entière (<App/>) est jouée
// contre ce faux serveur, sans réseau réel.
//
// Toute réponse peut être forcée par `api.failNext('PUT keys', reponse)` (un
// coup) ou `api.override('GET keys', fn)` (permanent) pour les scénarios
// d'erreur.
import { vi } from 'vitest'

export function jsonResponse(status, data, extraHeaders = {}) {
  const headers = { 'content-type': 'application/json', ...extraHeaders }
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    json: async () => data,
  }
}

export function noContentResponse() {
  return { ok: true, status: 204, headers: { get: () => null }, json: async () => null }
}

const CSRF_EXEMPT = new Set(['POST auth/login', 'POST auth/register', 'POST auth/activate', 'POST auth/resend'])
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const SERVER_KEY_PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter', 'xai', 'ollama', 'mock']
const AVATAR_MIMES = ['image/jpeg', 'image/png', 'image/webp']
const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * @param {object} [options]
 * @param {Array<object>} [options.users] comptes existants
 *   {email, password, displayName, roles?, verified?, hasAvatar?, keys?, training?}
 * @param {string|null} [options.loggedInAs] email du compte dont la session est ouverte
 * @param {string} [options.today] date ISO utilisée pour createdAt des clés
 */
export function createFakeAccountApi(options = {}) {
  let nextId = 1
  let tokenSeq = 0
  const users = new Map() // email -> compte
  const mailbox = [] // {to, code}
  const calls = [] // {method, path, body, headers}
  const oneShot = new Map() // 'METHOD path' -> [réponses]
  const permanent = new Map() // 'METHOD path' -> fn
  let session = null // {userId, csrf}
  const today = options.today ?? '2026-09-28'

  function addUser(u) {
    const account = {
      id: u.id ?? nextId++,
      email: u.email.toLowerCase(),
      password: u.password ?? 'motdepasse-solide',
      displayName: u.displayName ?? 'Maya',
      roles: u.roles ?? ['apprenant'],
      verified: u.verified ?? true,
      code: u.code ?? null,
      attempts: 0,
      hasAvatar: u.hasAvatar ?? false,
      keys: new Map(Object.entries(u.keys ?? {}).map(([p, k]) => [p, { apiKey: k, createdAt: `${today}T10:00:00` }])),
      training: new Map(Object.entries(u.training ?? {}).map(([p, list]) => [p, new Set(list)])),
    }
    nextId = Math.max(nextId, account.id + 1)
    users.set(account.email, account)
    return account
  }
  for (const u of options.users ?? []) addUser(u)

  const byId = (id) => [...users.values()].find((u) => u.id === id) ?? null
  const current = () => (session ? byId(session.userId) : null)
  const payload = (u) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    roles: [...u.roles].sort(),
    hasAvatar: u.hasAvatar,
  })
  function openSession(u) {
    tokenSeq += 1
    session = { userId: u.id, csrf: `csrf-${u.id}-${tokenSeq}` }
    return session.csrf
  }
  function newCode(u) {
    const code = String(1000 + ((u.id * 37 + mailbox.length * 211) % 9000))
    u.code = code
    u.attempts = 0
    mailbox.push({ to: u.email, code })
    return code
  }
  if (options.loggedInAs) openSession(users.get(options.loggedInAs.toLowerCase()))

  const unauthorized = () => jsonResponse(401, { error: 'Authentification requise' })
  const validation = (fields) => jsonResponse(422, { error: 'Validation échouée', fields })
  const progressOf = (u) => {
    const out = {}
    for (const parcours of [...u.training.keys()].sort()) {
      const list = [...u.training.get(parcours)].sort()
      if (list.length > 0) out[parcours] = { chapitresTermines: list }
    }
    return out
  }

  function route(method, path, body) {
    const me = current()
    switch (`${method} ${path}`) {
      case 'GET auth/me':
        return me ? jsonResponse(200, { user: payload(me), csrfToken: session.csrf }) : unauthorized()

      case 'POST auth/register': {
        const email = String(body?.email ?? '').trim().toLowerCase()
        const confirm = String(body?.emailConfirm ?? '').trim().toLowerCase()
        const password = String(body?.password ?? '')
        const displayName = String(body?.displayName ?? '').trim()
        const fields = {}
        if (!EMAIL_RE.test(email)) fields.email = 'Adresse email invalide'
        else if (confirm !== email) fields.emailConfirm = 'Les deux adresses email ne correspondent pas'
        if ([...password].length < 10) fields.password = 'Le mot de passe doit contenir au moins 10 caractères'
        if (displayName === '' || displayName.length > 190) {
          fields.displayName = 'Le nom affiché est requis (190 caractères maximum)'
        }
        if (Object.keys(fields).length > 0) return validation(fields)
        if (users.has(email)) return jsonResponse(409, { error: 'Un compte existe déjà avec cette adresse email' })
        const u = addUser({ email, password, displayName, roles: ['apprenant'], verified: false })
        newCode(u)
        return jsonResponse(201, {
          status: 'pending_activation',
          email,
          message: 'Un code de confirmation à 4 chiffres vous a été envoyé par email.',
        })
      }

      case 'POST auth/activate': {
        const email = String(body?.email ?? '').trim().toLowerCase()
        const code = String(body?.code ?? '').trim()
        if (email === '' || !/^\d{4}$/.test(code)) {
          return jsonResponse(422, { error: 'Email et code à 4 chiffres requis' })
        }
        const u = users.get(email)
        const generic = jsonResponse(401, { error: 'Code invalide ou expiré' })
        if (!u || u.verified || u.code === null || u.attempts >= 5) return generic
        if (u.code !== code) {
          u.attempts += 1
          return generic
        }
        u.verified = true
        u.code = null
        const csrfToken = openSession(u)
        return jsonResponse(200, { user: payload(u), csrfToken })
      }

      case 'POST auth/resend': {
        const u = users.get(String(body?.email ?? '').trim().toLowerCase())
        if (u && !u.verified) newCode(u)
        return jsonResponse(200, {
          status: 'ok',
          message: 'Si un compte non activé existe pour cette adresse, un nouveau code a été envoyé.',
        })
      }

      case 'POST auth/login': {
        const email = String(body?.email ?? '').trim().toLowerCase()
        const password = String(body?.password ?? '')
        if (email === '' || password === '') return jsonResponse(422, { error: 'Email et mot de passe requis' })
        const u = users.get(email)
        if (!u || u.password !== password) return jsonResponse(401, { error: 'Identifiants invalides' })
        if (!u.verified) {
          return jsonResponse(403, {
            error: 'Compte non activé : confirmez votre email avec le code reçu.',
            code: 'email_not_verified',
            email: u.email,
          })
        }
        const csrfToken = openSession(u)
        return jsonResponse(200, { user: payload(u), csrfToken })
      }

      case 'POST auth/logout':
        if (!me) return unauthorized()
        session = null
        return noContentResponse()

      case 'PATCH auth/me': {
        if (!me) return unauthorized()
        const name = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
        if (name === '' || name.length > 190) {
          return validation({ displayName: 'Le nom affiché est requis (190 caractères maximum)' })
        }
        me.displayName = name
        return jsonResponse(200, { user: payload(me) })
      }

      case 'PUT auth/me/avatar': {
        if (!me) return unauthorized()
        const mime = String(body?.mime ?? '').toLowerCase()
        if (typeof body?.avatar !== 'string' || body.avatar === '') {
          return jsonResponse(422, { error: 'Données d’image invalides (base64 attendu)' })
        }
        if (!AVATAR_MIMES.includes(mime)) {
          return jsonResponse(422, { error: 'Format non supporté : seuls JPEG, PNG et WebP sont acceptés.' })
        }
        me.hasAvatar = true
        return jsonResponse(200, { status: 'ok', mime, size: Math.floor((body.avatar.length * 3) / 4) })
      }

      case 'DELETE auth/me/avatar':
        if (!me) return unauthorized()
        me.hasAvatar = false
        return noContentResponse()

      case 'DELETE auth/account':
        if (!me) return unauthorized()
        users.delete(me.email)
        session = null
        return noContentResponse()

      case 'GET keys':
        if (!me) return unauthorized()
        return jsonResponse(
          200,
          [...me.keys.entries()]
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([provider, entry]) => ({ provider, createdAt: entry.createdAt })),
        )

      case 'PUT keys': {
        if (!me) return unauthorized()
        const fields = {}
        if (!SERVER_KEY_PROVIDERS.includes(body?.provider)) {
          fields.provider = `Fournisseur inconnu (attendu : ${SERVER_KEY_PROVIDERS.join(', ')})`
        }
        const apiKey = body?.apiKey
        // eslint-disable-next-line no-control-regex
        if (typeof apiKey !== 'string' || apiKey.length < 8 || apiKey.length > 4096 || /[\x00-\x1f\x7f]/.test(apiKey)) {
          fields.apiKey = 'Clé API invalide (8 à 4096 caractères imprimables)'
        }
        if (Object.keys(fields).length > 0) return validation(fields)
        me.keys.set(body.provider, { apiKey, createdAt: `${today}T12:00:00` })
        return noContentResponse()
      }

      case 'GET training/progress':
        if (!me) return unauthorized()
        return jsonResponse(200, progressOf(me))

      case 'PUT training/progress': {
        if (!me) return unauthorized()
        const fields = {}
        if (!SLUG_RE.test(String(body?.parcours ?? ''))) fields.parcours = 'Identifiant de parcours invalide'
        if (!SLUG_RE.test(String(body?.chapitre ?? ''))) fields.chapitre = 'Identifiant de chapitre invalide'
        if (typeof body?.completed !== 'boolean') fields.completed = 'completed doit être un booléen'
        if (Object.keys(fields).length > 0) return validation(fields)
        if (!me.training.has(body.parcours)) me.training.set(body.parcours, new Set())
        if (body.completed) me.training.get(body.parcours).add(body.chapitre)
        else me.training.get(body.parcours).delete(body.chapitre)
        return jsonResponse(200, progressOf(me))
      }

      default: {
        const keyMatch = /^keys\/([a-z]+)$/.exec(path)
        if (keyMatch && (method === 'GET' || method === 'DELETE')) {
          if (!me) return unauthorized()
          const entry = me.keys.get(keyMatch[1])
          if (!entry) return jsonResponse(404, { error: 'Aucune clé enregistrée pour ce fournisseur' })
          if (method === 'DELETE') {
            me.keys.delete(keyMatch[1])
            return noContentResponse()
          }
          return jsonResponse(200, { apiKey: entry.apiKey }, { 'cache-control': 'no-store' })
        }
        return jsonResponse(404, { error: 'Ressource absente du faux serveur' })
      }
    }
  }

  const fetchMock = vi.fn(async (url, init = {}) => {
    const method = String(init.method ?? 'GET').toUpperCase()
    const path = String(url).replace(/^api\//, '').replace(/\?.*$/, '')
    const headers = init.headers ?? {}
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ method, path, body, headers })
    const signature = `${method} ${path}`

    const queued = oneShot.get(signature)
    if (queued && queued.length > 0) return queued.shift()
    const forced = permanent.get(signature)?.({ method, path, body, headers })
    if (forced) return forced

    // CsrfMiddleware : mutation + session présente + route non exemptée.
    if (MUTATING.has(method) && session && !CSRF_EXEMPT.has(signature) && headers['X-CSRF-Token'] !== session.csrf) {
      return jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' })
    }
    return route(method, path, body)
  })

  return {
    fetch: fetchMock,
    calls,
    mailbox,
    users,
    addUser,
    /** Dernier code « reçu par email » pour une adresse. */
    lastCodeFor(email) {
      const found = [...mailbox].reverse().find((m) => m.to === email.toLowerCase())
      return found?.code ?? null
    },
    /** Appels vers un chemin donné (ex. 'auth/login'), éventuellement filtrés par méthode. */
    callsTo(path, method) {
      return calls.filter((c) => c.path === path && (method === undefined || c.method === method))
    },
    get session() {
      return session
    },
    failNext(signature, response) {
      if (!oneShot.has(signature)) oneShot.set(signature, [])
      oneShot.get(signature).push(response)
    },
    override(signature, fn) {
      permanent.set(signature, fn)
    },
  }
}

/** Installe le faux serveur comme fetch global et le renvoie. */
export function installFakeAccountApi(options) {
  const api = createFakeAccountApi(options)
  vi.stubGlobal('fetch', api.fetch)
  return api
}

/** Vide le localStorage sans échouer quand il est indisponible. */
export function clearLocalStorage() {
  try {
    localStorage.clear()
  } catch {
    /* jsdom sans stockage : rien à nettoyer */
  }
}
