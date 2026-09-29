// Lot Épistémiarque (UC-EPI-01 à UC-EPI-04) — faux serveur de l'API
// compétences pour les tests FONCTIONNELS IHM (web/test/usecases/functional/).
// Fiches : docs/cas-utilisation/epistemiarque/
//
// <App/> est rendu tel quel ; seul `fetch` est remplacé (vi.stubGlobal) par ce
// faux serveur À ÉTAT, qui rejoue le contrat de api/src/routes/competences.php
// (chemins, méthodes, codes HTTP, messages) juste assez pour enchaîner un
// scénario complet : fork → édition If-Match → soumission → vote → entérinement
// → coupe de release. Les règles fines (schéma, semver…) sont vérifiées côté
// PHP ; ici on vérifie ce que l'IHM envoie et affiche. Chaque requête est
// journalisée dans `calls` ({method, url, headers, body}).
import { vi } from 'vitest'

export const CSRF = 'csrf-epistemiarque-test'

export function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

/** Réponse non-JSON (copie statique du site : pas d'API PHP). */
export function htmlResponse(status = 404) {
  return {
    ok: false,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'text/html' : null) },
    json: async () => {
      throw new Error('not json')
    },
  }
}

/** Contenu riche minimal d'une compétence (forme de schemas/competence.schema.json). */
export function competenceContent(code, nom, definition = `Définition de ${nom}.`) {
  return {
    identite: {
      code,
      nom,
      definition,
      marqueurs_fondamentaux: ['Marqueur observable'],
      argument_employeur: `Argument employeur de ${nom}.`,
    },
    protocole: { passe_1: { signaux_declencheurs: ['j’ai vérifié'], token_budget: 40 } },
    fiche: `## ${code} — ${nom}\n\n**Essence** — ${definition}\n\n---`,
  }
}

/** Même règle que MajorityTally (seuil = floor(N/2)+1 de l'électorat). */
export function tallyOf(electorateSize, ballots) {
  const counts = { pour: 0, contre: 0, abstention: 0 }
  for (const b of ballots) counts[b.vote] += 1
  const threshold = electorateSize > 0 ? Math.floor(electorateSize / 2) + 1 : null
  let outcome = 'blocked'
  if (threshold !== null) {
    if (counts.pour >= threshold) outcome = 'adopted'
    else if (counts.contre >= threshold) outcome = 'rejected'
    else outcome = 'pending'
  }
  const voted = counts.pour + counts.contre + counts.abstention
  return {
    electorateSize,
    threshold,
    ...counts,
    notVoted: Math.max(0, electorateSize - voted),
    outcome,
    reached: outcome === 'adopted',
  }
}

function metadata(v) {
  return {
    id: v.id,
    code: v.code,
    semver: v.semver,
    pole: v.pole,
    nom: v.nom,
    status: v.status,
    contentHash: v.contentHash,
    releaseNote: v.releaseNote ?? null,
    publishedAt: v.publishedAt ?? null,
    submittedAt: v.submittedAt ?? null,
    decidimUrl: v.decidimUrl ?? null,
  }
}

function semverKey(s) {
  return s.split('.').map(Number)
}
function semverGreater(a, b) {
  const [x, y] = [semverKey(a), semverKey(b)]
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

/**
 * @param {object} options
 * @param {object|null} options.me compte de la session ({id, displayName, roles}) ; null = visiteur
 * @param {Array<{id:number, displayName:string}>} [options.members] électorat (membres épistémiarques)
 * @param {Array<{code, nom, pole, semver?, definition?}>} [options.published] compétences publiées
 */
export function createEpiBackend({ me, members, published = [] } = {}) {
  let nextId = 100
  let hashSeq = 0
  const newHash = () => `hash-${String((hashSeq += 1)).padStart(4, '0')}`
  const versions = new Map()
  const ballots = new Map()
  const releases = []
  const electorate =
    members ?? (me && me.roles?.includes('epistemiarque') ? [{ id: me.id, displayName: me.displayName }] : [])
  const calls = []
  const overrides = []

  for (const c of published) {
    const id = (nextId += 1)
    versions.set(id, {
      id,
      code: c.code,
      nom: c.nom,
      pole: c.pole,
      semver: c.semver ?? '1.0.0',
      status: 'published',
      content: competenceContent(c.code, c.nom, c.definition),
      contentHash: newHash(),
      publishedAt: '2026-07-15 10:00:00',
      releaseNote: 'Seed initial',
    })
  }

  const latestPublished = (code) =>
    [...versions.values()]
      .filter((v) => v.code === code && v.status === 'published')
      .sort((a, b) => (semverGreater(a.semver, b.semver) ? -1 : 1))[0] ?? null
  const tally = (id) => tallyOf(electorate.length, [...(ballots.get(id)?.values() ?? [])])
  const votesOf = (id) => [...(ballots.get(id)?.values() ?? [])]

  function route(method, url, body, headers) {
    let m
    if (url === 'api/auth/me' && method === 'GET') {
      return me ? jsonResponse(200, { user: me, csrfToken: CSRF }) : jsonResponse(401, { error: 'Authentication required' })
    }
    if (url === 'api/competences' && method === 'GET') {
      const codes = [...new Set([...versions.values()].map((v) => v.code))].sort()
      return jsonResponse(
        200,
        codes.map((code) => latestPublished(code)).filter(Boolean).map(metadata),
      )
    }
    if (url === 'api/competences/drafts' && method === 'GET') {
      const editable = [...versions.values()]
        .filter((v) => v.status !== 'published')
        .sort((a, b) => b.id - a.id)
        .map((v) => (v.status === 'review' ? { ...metadata(v), tally: tally(v.id) } : metadata(v)))
      return jsonResponse(200, editable)
    }
    if ((m = /^api\/competences\/drafts\/(\d+)$/.exec(url)) && method === 'GET') {
      const v = versions.get(Number(m[1]))
      if (!v || v.status === 'published') return jsonResponse(404, { error: 'Brouillon introuvable' })
      const payload = { ...metadata(v), content: structuredClone(v.content) }
      if (v.status === 'review') Object.assign(payload, { tally: tally(v.id), votes: votesOf(v.id) })
      return jsonResponse(200, payload)
    }
    if ((m = /^api\/competences\/(\d\.\d{2})\/drafts$/.exec(url)) && method === 'POST') {
      const source = latestPublished(m[1])
      if (!source) return jsonResponse(404, { error: `Compétence publiée introuvable : ${m[1]}` })
      if ([...versions.values()].some((v) => v.code === m[1] && v.semver === body.semver)) {
        return jsonResponse(409, { error: `Competence ${m[1]}@${body.semver} already exists` })
      }
      const id = (nextId += 1)
      const draft = {
        ...source,
        id,
        semver: body.semver,
        status: 'draft',
        content: structuredClone(source.content),
        releaseNote: null,
        publishedAt: null,
      }
      versions.set(id, draft)
      return jsonResponse(201, { ...metadata(draft), content: structuredClone(draft.content) })
    }
    if ((m = /^api\/competences\/drafts\/(\d+)$/.exec(url)) && method === 'PUT') {
      const v = versions.get(Number(m[1]))
      if (!v) return jsonResponse(404, { error: 'Brouillon introuvable' })
      const ifMatch = headers['If-Match']
      if (!ifMatch) {
        return jsonResponse(428, { error: 'Précondition requise (If-Match) : rechargez la compétence avant d\'enregistrer.' })
      }
      if (v.status === 'review') {
        return jsonResponse(409, { error: 'This proposal is open for a vote: withdraw it before editing.' })
      }
      if (ifMatch !== v.contentHash) {
        return jsonResponse(409, {
          error: 'Cette compétence a été modifiée par un autre épistémiarque ; rechargez avant d\'enregistrer.',
        })
      }
      v.content = structuredClone(body)
      v.nom = body.identite.nom
      v.contentHash = newHash()
      return jsonResponse(200, { ...metadata(v), content: structuredClone(v.content) })
    }
    if ((m = /^api\/competences\/drafts\/(\d+)\/submit$/.exec(url)) && method === 'POST') {
      const v = versions.get(Number(m[1]))
      if (!v) return jsonResponse(404, { error: 'Brouillon introuvable' })
      if (v.status === 'review') return jsonResponse(409, { error: 'Cette proposition est déjà ouverte au vote.' })
      const url2 = body?.decidimUrl ?? null
      if (url2 !== null && !/^https?:\/\/\S+$/i.test(url2)) {
        return jsonResponse(422, {
          error: 'Le lien Decidim doit être une URL http(s) valide.',
          errors: { '/decidimUrl': ['URL invalide'] },
        })
      }
      ballots.delete(v.id)
      Object.assign(v, { status: 'review', decidimUrl: url2, submittedAt: '2026-09-28 09:00:00' })
      return jsonResponse(200, { ...metadata(v), tally: tally(v.id) })
    }
    if ((m = /^api\/competences\/drafts\/(\d+)\/withdraw$/.exec(url)) && method === 'POST') {
      const v = versions.get(Number(m[1]))
      if (!v) return jsonResponse(404, { error: 'Brouillon introuvable' })
      if (v.status !== 'review') {
        return jsonResponse(409, { error: 'Seule une proposition ouverte au vote peut être retirée.' })
      }
      ballots.delete(v.id)
      Object.assign(v, { status: 'draft', decidimUrl: null, submittedAt: null })
      return jsonResponse(200, metadata(v))
    }
    if ((m = /^api\/competences\/drafts\/(\d+)\/publish$/.exec(url)) && method === 'POST') {
      const v = versions.get(Number(m[1]))
      if (!v) return jsonResponse(404, { error: 'Brouillon introuvable' })
      if (v.status !== 'review') {
        return jsonResponse(409, { error: 'A competence proposal must be submitted for a vote before it can be published.' })
      }
      const t = tally(v.id)
      if (!t.reached) {
        return jsonResponse(409, {
          error: `Majorité non atteinte : ${t.pour} voix « pour » sur ${t.threshold ?? 0} requises (${t.electorateSize} membres).`,
        })
      }
      Object.assign(v, { status: 'published', releaseNote: body?.releaseNote ?? null, publishedAt: '2026-09-28 10:00:00' })
      return jsonResponse(200, metadata(v))
    }
    if ((m = /^api\/competences\/proposals\/(\d+)$/.exec(url)) && method === 'GET') {
      const v = versions.get(Number(m[1]))
      if (!v || v.status !== 'review') return jsonResponse(404, { error: 'Proposition introuvable' })
      const base = latestPublished(v.code)
      return jsonResponse(200, {
        ...metadata(v),
        content: structuredClone(v.content),
        baseVersion: base?.semver ?? null,
        baseContent: base ? structuredClone(base.content) : null,
        tally: tally(v.id),
        votes: votesOf(v.id),
      })
    }
    if ((m = /^api\/competences\/proposals\/(\d+)\/votes$/.exec(url)) && method === 'POST') {
      const v = versions.get(Number(m[1]))
      if (!v) return jsonResponse(404, { error: 'Proposition introuvable' })
      if (v.status !== 'review') {
        return jsonResponse(409, { error: 'Le vote n\'est ouvert que sur une proposition soumise au vote.' })
      }
      if (!ballots.has(v.id)) ballots.set(v.id, new Map())
      const comment = typeof body.comment === 'string' && body.comment.trim() !== '' ? body.comment.trim() : null
      ballots.get(v.id).set(me.id, { userId: me.id, displayName: me.displayName, vote: body.vote, comment })
      return jsonResponse(200, { tally: tally(v.id) })
    }
    if (url === 'api/competences/release' && method === 'POST') {
      if (!body?.semver) return jsonResponse(422, { error: 'Champ "semver" requis' })
      if (releases.some((r) => r.semver === body.semver)) {
        return jsonResponse(409, { error: `Version ${body.semver} of referentiel "respire" already exists` })
      }
      const release = { status: 'imported', id: (nextId += 1), semver: body.semver, contentHash: 'b'.repeat(64) }
      releases.push({ ...release, label: body.label })
      return jsonResponse(201, release)
    }
    return jsonResponse(404, { error: 'absent' })
  }

  const fetchMock = vi.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const headers = init.headers ?? {}
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ method, url: String(url), headers, body })
    for (const o of overrides) {
      if (o.method === method && o.match.test(String(url))) {
        const answer = o.respond({ body, headers, url: String(url) })
        if (answer) return answer
      }
    }
    return route(method, String(url), body, headers)
  })

  return {
    fetchMock,
    calls,
    versions,
    ballots,
    releases,
    electorate,
    /** Remplace la réponse d'une route (injection d'erreur, API muette…). */
    override(method, match, respond) {
      overrides.push({ method, match, respond })
    },
    /** Requêtes reçues pour une méthode + URL (regex). */
    callsTo(method, match) {
      return calls.filter((c) => c.method === method && match.test(c.url))
    },
    /** Bulletin déposé par un autre membre (hors IHM). */
    castBallot(id, member, vote, comment = null) {
      if (!ballots.has(id)) ballots.set(id, new Map())
      ballots.get(id).set(member.id, { userId: member.id, displayName: member.displayName, vote, comment })
    },
    /** Proposition déjà ouverte au vote pour une compétence publiée. */
    seedProposal(code, semver, edit = (c) => c) {
      const source = latestPublished(code)
      const id = (nextId += 1)
      versions.set(id, {
        ...source,
        id,
        semver,
        status: 'review',
        content: edit(structuredClone(source.content)),
        contentHash: newHash(),
        releaseNote: null,
        publishedAt: null,
        submittedAt: '2026-09-27 18:00:00',
        decidimUrl: null,
      })
      return id
    },
  }
}
