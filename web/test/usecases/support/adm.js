// Utilitaires partagés des tests IHM du lot « Administration et exploitation »
// (UC-ADM-01, UC-ADM-04, UC-ADM-06) — fiches sous
// docs/cas-utilisation/administration/.
//
// Un faux serveur d'administration EN MÉMOIRE répond aux routes réellement
// appelées par l'IHM (api/auth/me, api/admin/*) avec les mêmes statuts et
// messages que l'API PHP (routes/admin.php, UserDirectory) : jeton CSRF exigé
// sur les mutations, anti-verrouillage 409, 404 « Compte introuvable », rôle
// inconnu 422. Il sert de réseau simulé via vi.stubGlobal('fetch', …) : l'IHM
// entière (<App/>) est rendue sans aucun appel réseau réel.
import { vi } from 'vitest'

export const CSRF = 'csrf-admin-de-test'

export function jsonResponse(status, data, headers = {}) {
  const all = { 'content-type': 'application/json', ...headers }
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => all[name.toLowerCase()] ?? null },
    json: async () => data,
  }
}

export const ADMIN_USER = {
  id: 1,
  email: 'root@example.org',
  displayName: 'Root Admin',
  roles: ['admin'],
}

const ROLES = ['apprenant', 'cartographe', 'promptologue', 'epistemiarque', 'employeur', 'etablissement', 'admin']

/**
 * @param {object} options
 * @param {object|null} [options.me] utilisateur de la session (null = visiteur)
 * @param {Array<object>} [options.users] comptes {id, email, displayName, createdAt, roles}
 * @param {Record<string, Function|object>} [options.routes] routes supplémentaires « MÉTHODE url »
 */
export function createAdminBackend({ me = ADMIN_USER, users = [], routes = {} } = {}) {
  const state = { users: users.map((u) => ({ createdAt: '2026-01-01T09:00:00', ...u, roles: [...u.roles] })) }
  const calls = []

  function listUsers(url) {
    const params = new URL(url, 'http://x/').searchParams
    const query = (params.get('query') ?? '').toLowerCase()
    const role = params.get('role') ?? ''
    const page = Math.max(1, Number(params.get('page') ?? 1))
    const matching = state.users.filter(
      (u) =>
        (query === '' || u.email.toLowerCase().includes(query) || u.displayName.toLowerCase().includes(query)) &&
        (role === '' || u.roles.includes(role)),
    )
    return jsonResponse(200, {
      users: matching.slice((page - 1) * 20, page * 20).map((u) => ({ ...u, roles: [...u.roles].sort() })),
      total: matching.length,
      page,
      pageSize: 20,
    })
  }

  const fetchMock = vi.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const key = `${method} ${url}`
    calls.push({ method, url: String(url), init })

    if (routes[key] !== undefined) {
      const handler = routes[key]
      return typeof handler === 'function' ? handler(init, state) : handler
    }
    if (key === 'GET api/auth/me') {
      return me ? jsonResponse(200, { user: me, csrfToken: CSRF }) : jsonResponse(401, { error: 'Authentification requise' })
    }
    if (method !== 'GET' && String(url).startsWith('api/admin/') && init.headers?.['X-CSRF-Token'] !== CSRF) {
      return jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' })
    }
    if (method === 'GET' && String(url).startsWith('api/admin/users')) return listUsers(url)

    const grant = /^api\/admin\/users\/(\d+)\/roles$/.exec(url)
    if (grant && method === 'POST') {
      const role = JSON.parse(init.body ?? '{}').role
      const user = state.users.find((u) => u.id === Number(grant[1]))
      if (!ROLES.includes(role)) return jsonResponse(422, { error: `Rôle inconnu « ${role} »` })
      if (!user) return jsonResponse(404, { error: 'Compte introuvable' })
      const status = user.roles.includes(role) ? 'unchanged' : 'granted'
      if (status === 'granted') user.roles.push(role)
      return jsonResponse(200, { id: user.id, role, status })
    }
    const revoke = /^api\/admin\/users\/(\d+)\/roles\/([a-z]+)$/.exec(url)
    if (revoke && method === 'DELETE') {
      const [, id, role] = revoke
      const user = state.users.find((u) => u.id === Number(id))
      if (!user) return jsonResponse(404, { error: 'Compte introuvable' })
      if (role === 'admin' && me && Number(id) === me.id) {
        return jsonResponse(409, {
          error: 'Un administrateur ne peut pas retirer son propre rôle admin (anti-verrouillage)',
        })
      }
      const status = user.roles.includes(role) ? 'revoked' : 'unchanged'
      user.roles = user.roles.filter((r) => r !== role)
      return jsonResponse(200, { id: user.id, role, status })
    }
    // Tout le reste (données de démo, tuteur…) : absent, repli local de l'IHM.
    return jsonResponse(404, { error: 'absent' })
  })

  return { fetchMock, state, calls }
}

/** Appels déjà faits vers une URL (préfixe) et une méthode. */
export function callsTo(calls, method, prefix) {
  return calls.filter((c) => c.method === method && c.url.startsWith(prefix))
}

/** Date ISO (UTC, AAAA-MM-JJ) d'il y a `n` jours — même axe que MonitoringSection. */
export function isoDaysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Réponse de GET /api/admin/monitoring sans aucune activité (forme exacte de
 * Monitoring::overview) ; les tests surchargent les blocs utiles.
 */
export function emptyOverview(days = 30) {
  const zeroLlm = { requetes: 0, entree: 0, sortie: 0, coutUsd: 0 }
  const zeroTwin9 = { appels: 0, entree: 0, sortie: 0, depenseMicrousd: 0 }
  const zeroPaypal = { captures: 0, brutMicrousd: 0, rembourseMicrousd: 0 }
  return {
    periode: { jours: days },
    utilisateurs: {
      total: 0,
      nonActives: 0,
      actifsMaintenant: 0,
      sessionsAnonymes: 0,
      nouveauxPeriode: 0,
      parJour: [],
      parRole: [],
    },
    cartographies: {
      total: 0,
      parType: { jour: 0, merge: 0 },
      avecDocument: 0,
      nouvellesPeriode: 0,
      parJour: [],
      partages: { actifs: 0, creesPeriode: 0, consultationsPeriode: 0, consultationsTotal: 0, consultationsParJour: [] },
    },
    finances: {
      soldes: { totalMicrousd: 0, comptesCredites: 0 },
      periode: {},
      toutTemps: {},
      parJour: [],
      paypal: { periode: { ...zeroPaypal }, toutTemps: { ...zeroPaypal } },
    },
    tokens: {
      parJour: [],
      periode: { demo: { ...zeroLlm }, tuteur: { ...zeroLlm }, twin9: { ...zeroTwin9 } },
      toutTemps: { demo: { ...zeroLlm }, tuteur: { ...zeroLlm }, twin9: { ...zeroTwin9 } },
      twin9ParModele: [],
    },
    connexions: { periode: { reussies: 0, echouees: 0 }, parJour: [], parPays: [], dernieres: [] },
    votes: { electorat: [], competences: [], referentiel: [] },
  }
}
