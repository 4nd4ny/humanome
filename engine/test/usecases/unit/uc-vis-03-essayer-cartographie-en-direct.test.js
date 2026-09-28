// UC-VIS-03 — Essayer la cartographie en direct, sans compte : tests UNITAIRES (moteur).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-03-essayer-cartographie-en-direct.md
//
// Code du moteur sollicité par la page « Essayer », appelé directement dans
// la configuration de la démo : transport « proxy » vers api/llm (aucune clé
// côté navigateur, pas de nouvel essai automatique : maxAttempts 1) et
// extractDay (7 pôles + synthèse kairos facultative). Fixtures VERSIONNÉES
// lues paresseusement dans les tests (contrainte CI du moteur).
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createProvider } from '../../../src/providers/index.js'
import { extractDay } from '../../../src/pipeline/extract.js'
import { validateDocument } from '../../../src/validation.js'

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../../../../schemas/fixtures/${name}`, import.meta.url), 'utf8'))

const DAY_TEXT =
  'Aujourd’hui j’ai animé la réunion de l’atelier vélo : j’ai préparé l’ordre du jour, ' +
  'écouté les désaccords sur le budget et proposé un vote.'

const KAIROS = {
  kairos: {
    apprenant: {
      portrait: 'Un apprenant organisateur.',
      formeProfil: 'Un sommet côté CITE.',
      ceQuiRelieLesPoles: 'Le collectif.',
      ceQuiEmergeEntreLesLignes: 'Le soin des autres.',
      invitationsPourLaSuite: ['Documenter un désaccord résolu.'],
      syntheseCompleteMarkdown: '# Synthèse',
    },
  },
  emergencesCrossPoles: { connexionsTransversales: [], noeudsConceptuels: [], competencesOrphelines: [] },
}

function response(status, data, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => headers[String(n).toLowerCase()] ?? null },
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
}

/** Fournisseur « proxy » de la démo, branché sur un faux api/llm. */
function demoProvider(answer) {
  const posts = []
  const fetchFn = vi.fn(async (url, init) => {
    const body = JSON.parse(init.body)
    posts.push({ url, body, headers: init.headers })
    return answer(body, posts.length)
  })
  const provider = createProvider({ provider: 'anthropic', transport: 'proxy', proxyUrl: 'api/llm', maxAttempts: 1, fetchFn })
  return { provider, posts, fetchFn }
}

/** Réponse du modèle : le pôle demandé (d'après le prompt) ou la synthèse kairos. */
function modelAnswer(poles) {
  return (body) => {
    const text = body.prompt.includes('SYNTHÈSE KAIROS')
      ? JSON.stringify(KAIROS)
      : JSON.stringify(poles[Number(/"poleNum": "(\d)"/.exec(body.prompt)[1]) - 1])
    return response(200, { text, usage: { inputTokens: 9, outputTokens: 9 }, model: 'mock', stopReason: 'end_turn' })
  }
}

describe('UC-VIS-03 — transport « proxy » de la démo', () => {
  it('UC-VIS-03-U16 — POST api/llm {provider, model, system, prompt, maxTokens} sans clé ; réponse {text, usage, model, stopReason} relue', async () => {
    const { provider, posts } = demoProvider(() =>
      response(200, { text: '{"ok":true}', usage: { inputTokens: 12, outputTokens: 3 }, model: 'claude-haiku-4-5-20251001', stopReason: 'end_turn' }),
    )
    const result = await provider.complete({ model: 'demo', system: 'Consigne', prompt: 'Texte', maxTokens: 8192 })

    expect(provider.transport).toBe('proxy')
    expect(posts[0].url).toBe('api/llm')
    expect(posts[0].body).toEqual({ provider: 'anthropic', model: 'demo', system: 'Consigne', prompt: 'Texte', maxTokens: 8192 })
    expect(Object.keys(posts[0].headers)).toEqual(['content-type']) // ni clé ni Authorization
    expect(result).toEqual({ text: '{"ok":true}', usage: { inputTokens: 12, outputTokens: 3 }, model: 'claude-haiku-4-5-20251001', stopReason: 'end_turn' })
  })

  it('UC-VIS-03-U17 — quota de la démo (429) : aucun nouvel essai automatique, statut et Retry-After portés par l’erreur', async () => {
    const { provider, fetchFn } = demoProvider(() => response(429, { error: 'Quota horaire atteint, réessayez plus tard.' }, { 'retry-after': '120' }))
    const failure = await provider.complete({ model: 'demo', prompt: 'x' }).catch((e) => e)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(failure.status).toBe(429)
    expect(failure.retryAfterMs).toBe(120000)
    expect(failure.message).toContain('Quota horaire atteint')
  })
})

describe('UC-VIS-03 — extractDay dans la configuration de la démo', () => {
  it('UC-VIS-03-U18 — 7 appels pôle puis 1 kairos → document cartographie-jour valide au schéma, daté du jour choisi', async () => {
    const day = fixture('cartographie-jour-2026-01-05.json')
    const { provider, posts } = demoProvider(modelAnswer(day.poles))
    const progress = []
    const doc = await extractDay({
      dayText: DAY_TEXT,
      date: '2026-09-28',
      referentiel: fixture('referentiel-respire-v7.json'),
      provider,
      model: 'demo',
      maxTokens: 8192,
      kairosOptional: true,
      onProgress: (p) => progress.push(p.done),
    })

    expect(posts).toHaveLength(8)
    expect(posts.slice(0, 7).map((p) => /"poleNum": "(\d)"/.exec(p.body.prompt)[1])).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(posts.every((p) => p.body.prompt.includes('atelier vélo'))).toBe(true)
    expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(doc.date).toBe('2026-09-28')
    expect(doc.kairos).toEqual(KAIROS)
    expect(validateDocument('cartographie-jour', doc).valid).toBe(true)
  })

  it('UC-VIS-03-U19 — synthèse kairos inexploitable (deux fois) → document rendu avec kairos null et « skipped » signalé', async () => {
    const day = fixture('cartographie-jour-2026-01-06.json')
    const poles = modelAnswer(day.poles)
    const { provider, posts } = demoProvider((body, n) =>
      body.prompt.includes('SYNTHÈSE KAIROS') ? response(200, { text: 'pas du JSON', usage: {}, model: 'mock' }) : poles(body, n),
    )
    const events = []
    const doc = await extractDay({
      dayText: DAY_TEXT,
      date: '2026-09-28',
      referentiel: fixture('referentiel-respire-v7.json'),
      provider,
      model: 'demo',
      kairosOptional: true,
      onProgress: (p) => events.push(p),
    })

    expect(posts).toHaveLength(9) // 7 pôles + kairos + son unique nouvel essai
    expect(doc.kairos).toBeNull()
    expect(events.at(-1)).toMatchObject({ step: 'kairos', skipped: true, done: 8, total: 8 })
    expect(validateDocument('cartographie-jour', doc).valid).toBe(true)
  })

  it('UC-VIS-03-U20 — génération tronquée (stopReason « max_tokens » relayé par le serveur) → échec explicite du pôle après un nouvel essai', async () => {
    const { provider, posts } = demoProvider(() =>
      response(200, { text: '{"poleNum":"1","competences":[', usage: {}, model: 'mock', stopReason: 'max_tokens' }),
    )
    const failure = await extractDay({
      dayText: DAY_TEXT,
      date: '2026-09-28',
      referentiel: fixture('referentiel-respire-v7.json'),
      provider,
      model: 'demo',
      kairosOptional: true,
    }).catch((e) => e)

    expect(posts).toHaveLength(2)
    expect(failure.message).toBe('extractDay : pôle 1 (2026-09-28) — réponse tronquée (budget de sortie atteint) — réduisez le texte de la journée')
  })
})
