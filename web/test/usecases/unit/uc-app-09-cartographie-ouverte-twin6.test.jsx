// UC-APP-09 — Lancer une cartographie ouverte (Twin6) : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-09-cartographie-ouverte-twin6.md
//
// Code sollicité appelé directement : la route #/twin6-ouverte, le client
// web/src/api/twin6.js (paquet PUBLIC, provider « crédits » via
// /api/twin6/appel, provider « clé perso » direct, offre lue dans /twin9/meta),
// l'adaptation du référentiel et le formatage des montants. Réseau simulé.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { parseHash } from '../../../src/router.js'
import { ApiError, fetchMe, resetApiClient } from '../../../src/api/client.js'
import {
  TWIN6_PACKAGE_URL,
  fetchTwin6Offer,
  loadTwin6Package,
  makeCreditsProvider,
  makeOwnKeyProvider,
  referentielPourMoteur,
} from '../../../src/api/twin6.js'
import { formatUsd } from '../../../src/api/twin9.js'
import { listKeys, revealKey } from '../../../src/api/keys.js'
import Twin6OuverteView from '../../../src/views/Twin6OuverteView.jsx'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { TWIN6_PACKAGE, jsonResponse } from '../support/twin.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

describe('UC-APP-09 — route', () => {
  it('UC-APP-09-U13 — #/twin6-ouverte ouvre la vue de cartographie ouverte', () => {
    expect(parseHash('#/twin6-ouverte')).toEqual({ name: 'twin6ouverte', section: null })
  })
})

describe('UC-APP-09 — paquet de prompts PUBLIC', () => {
  it('UC-APP-09-U14 — chargé depuis l’URL publique par défaut ; modèle cible par défaut ; HTTP en échec → message explicite', async () => {
    const { modeleCibleDefaut, ...sansDefaut } = TWIN6_PACKAGE
    expect(modeleCibleDefaut).toBe('claude-sonnet-5')
    const fetchFn = vi.fn(async () => jsonResponse(200, sansDefaut))
    const pkg = await loadTwin6Package({ fetchFn })
    expect(fetchFn).toHaveBeenCalledWith(TWIN6_PACKAGE_URL)
    expect(TWIN6_PACKAGE_URL).toBe('data/twin6/twin6-ouverte-1.0.0.json')
    expect(pkg.modeleCibleDefaut).toBe('claude-sonnet-5')
    expect(pkg.licence).toBe('AGPL-3.0-only')
    expect(Object.keys(pkg.templates)).toEqual(['scanPole', 'kairos', 'fiches'])

    const absent = vi.fn(async () => jsonResponse(404, { error: 'absent' }))
    await expect(loadTwin6Package({ fetchFn: absent })).rejects.toThrow('Paquet Twin6 introuvable (404)')
  })
})

describe('UC-APP-09 — provider « crédits » (POST api/twin6/appel)', () => {
  it('UC-APP-09-U15 — envoie {model, prompt, system, max_tokens} avec le jeton CSRF de la session, rend le contrat moteur et remonte la contribution', async () => {
    const fetchFn = vi.fn(async (url) =>
      url === 'api/auth/me'
        ? jsonResponse(200, { user: { id: 1 }, csrfToken: 'csrf-uc-app-09' })
        : jsonResponse(200, {
            text: '{"poleNum":1}',
            usage: { inputTokens: 1000, outputTokens: 200 },
            model: 'claude-sonnet-5',
            stopReason: 'end_turn',
            cout_microusd: 6602,
          }),
    )
    await fetchMe({ fetchFn }) // sème le jeton CSRF, comme la vue au montage
    const couts = []
    const provider = makeCreditsProvider({ onCout: (c) => couts.push(c), fetchFn })

    const res = await provider.complete({ model: 'claude-sonnet-5', prompt: 'Scanne le pôle 1', maxTokens: 8192 })

    const [url, init] = fetchFn.mock.calls[1]
    expect(url).toBe('api/twin6/appel')
    expect(init.method).toBe('POST')
    expect(init.headers['X-CSRF-Token']).toBe('csrf-uc-app-09')
    expect(JSON.parse(init.body)).toEqual({ model: 'claude-sonnet-5', prompt: 'Scanne le pôle 1', system: null, max_tokens: 8192 })
    expect(res).toEqual({
      text: '{"poleNum":1}',
      usage: { inputTokens: 1000, outputTokens: 200 },
      model: 'claude-sonnet-5',
      stopReason: 'end_turn',
    })
    expect(couts).toEqual([6602])
    expect(provider).toMatchObject({ name: 'twin6-credits', transport: 'proxy' })
  })

  it('UC-APP-09-U16 — réponse partielle : valeurs par défaut sûres ; 402 serveur → ApiError typée, aucune contribution comptée', async () => {
    const partiel = vi.fn(async () => jsonResponse(200, {}))
    const couts = []
    const provider = makeCreditsProvider({ onCout: (c) => couts.push(c), fetchFn: partiel })
    expect(await provider.complete({ model: 'm', prompt: 'p', maxTokens: 10 })).toEqual({
      text: '',
      usage: { inputTokens: 0, outputTokens: 0 },
      model: 'm',
      stopReason: null,
    })
    expect(couts).toEqual([0])

    const refus = vi.fn(async () =>
      jsonResponse(402, { error: 'Solde insuffisant', solde_microusd: 0, requis_estime_microusd: 155_000 }),
    )
    const couts2 = []
    const p2 = makeCreditsProvider({ onCout: (c) => couts2.push(c), fetchFn: refus })
    const err = await p2.complete({ model: 'm', prompt: 'p', maxTokens: 10 }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(402)
    expect(err.message).toBe('Solde insuffisant')
    expect(couts2).toEqual([])
  })
})

describe('UC-APP-09 — provider « clé perso » (gratuit, direct navigateur)', () => {
  it('UC-APP-09-U17 — transport direct vers le fournisseur, jamais vers /api ; clé exigée', async () => {
    expect(() => makeOwnKeyProvider({ apiKey: '' })).toThrow(/apiKey requise/)

    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } }),
    }))
    const provider = makeOwnKeyProvider({ apiKey: 'sk-ant-perso-fictive', fetchFn })
    expect(provider).toMatchObject({ name: 'anthropic', transport: 'direct' })
    await provider.complete({ model: 'claude-sonnet-5', prompt: 'p' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(url.startsWith('api/')).toBe(false)
    expect(init.headers['x-api-key']).toBe('sk-ant-perso-fictive')
  })
})

describe('UC-APP-09 — offre et référentiel lus dans /api/twin9/meta', () => {
  it('UC-APP-09-U18 — prix Twin6 (+10 %), promo, référentiel et solde ; replis sûrs si absents', async () => {
    const complet = vi.fn(async () =>
      jsonResponse(200, {
        modeles_twin6: { 'claude-sonnet-5': [3.3, 16.5] },
        twin9_cle_perso_ouverte: true,
        referentiel: [{ num: 1, nom: 'TÊTE', competences: [] }],
        solde_microusd: '2500000',
      }),
    )
    expect(await fetchTwin6Offer({ fetchFn: complet })).toEqual({
      modeles: { 'claude-sonnet-5': [3.3, 16.5] },
      twin9PromoOuverte: true,
      referentiel: [{ num: 1, nom: 'TÊTE', competences: [] }],
      solde_microusd: 2_500_000,
    })
    expect(complet.mock.calls[0][0]).toBe('api/twin9/meta')

    const vide = vi.fn(async () => jsonResponse(200, { referentiel: {} }))
    expect(await fetchTwin6Offer({ fetchFn: vide })).toEqual({
      modeles: {},
      twin9PromoOuverte: false,
      referentiel: [],
      solde_microusd: 0,
    })
  })

  it('UC-APP-09-U19 — referentielPourMoteur : pôles {num, nom} et compétences aplaties avec leur pôle', () => {
    expect(
      referentielPourMoteur([
        { num: 1, nom: 'TÊTE', competences: [{ code: '1.01', nom: 'A' }, { code: '1.02', nom: 'B' }] },
        { num: 2, nom: 'CŒUR' },
      ]),
    ).toEqual({
      poles: [{ num: 1, nom: 'TÊTE' }, { num: 2, nom: 'CŒUR' }],
      competences: [
        { code: '1.01', nom: 'A', pole: 1 },
        { code: '1.02', nom: 'B', pole: 1 },
      ],
    })
    expect(referentielPourMoteur(null)).toEqual({ poles: [], competences: [] })
  })

  it('UC-APP-09-U20 — formatUsd : micro-USD → « x,yy $ », 4 décimales sous le centime', () => {
    expect(formatUsd(6602)).toBe('0,0066 $')
    expect(formatUsd(1_234_567)).toBe('1,23 $')
    expect(formatUsd(0)).toBe('0,00 $')
    expect(formatUsd(-7_000_000)).toBe('-7,00 $')
    expect(formatUsd('pas un nombre')).toBe('0,00 $')
  })
})

describe('UC-APP-09 — clé enregistrée et garde-fou de solde', () => {
  it('UC-APP-09-U28 — clés du profil : liste sans la clé (GET api/keys), révélation au seul propriétaire (GET api/keys/anthropic)', async () => {
    const fetchFn = vi.fn(async (url) =>
      url === 'api/keys'
        ? jsonResponse(200, [{ provider: 'anthropic', createdAt: '2026-07-15' }])
        : jsonResponse(200, { provider: 'anthropic', apiKey: 'sk-ant-profil-fictive' }),
    )
    expect(await listKeys({ fetchFn })).toEqual([{ provider: 'anthropic', createdAt: '2026-07-15' }])
    expect((await revealKey('anthropic', { fetchFn })).apiKey).toBe('sk-ant-profil-fictive')
    expect(fetchFn.mock.calls.map(([url, init]) => [init.method, url])).toEqual([
      ['GET', 'api/keys'],
      ['GET', 'api/keys/anthropic'],
    ])
  })

  it('UC-APP-09-U29 — Twin6OuverteView isolée : poids du portfolio = ⌈octets / 1024⌉ $ (1 $ minimum) comparé au solde, AVANT toute construction du provider', async () => {
    const creditsFactory = vi.fn(() => ({ name: 'twin6-credits' }))
    const runEngine = vi.fn(async () => {
      throw new Error('moteur non exercé dans ce test unitaire')
    })
    render(
      <Twin6OuverteView
        deps={{
          fetchMeFn: async () => ({ user: { id: 1 } }),
          loadPackage: async () => ({ ...TWIN6_PACKAGE, templates: {} }),
          fetchOffer: async () => ({ modeles: { 'claude-sonnet-5': [3.3, 16.5] }, referentiel: [], solde_microusd: 1_999_999 }),
          listKeys: async () => [],
          makeCreditsProvider: creditsFactory,
          runEngine,
          lib: fakeLib,
        }}
      />,
    )
    const zone = await screen.findByLabelText(/Votre portfolio/)
    const lancer = () =>
      act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }))
      })

    // 1 025 octets → 2 $ requis > 1,999999 $ de solde : bloqué.
    fireEvent.change(zone, { target: { value: 'é'.repeat(512) + 'x' } })
    await lancer()
    expect(screen.getByRole('alert').textContent).toContain('~2 $ estimés, solde 2.00 $')
    expect(creditsFactory).not.toHaveBeenCalled()
    expect(runEngine).not.toHaveBeenCalled()

    // 1 024 octets → 1 $ requis ≤ solde : lancé.
    fireEvent.change(zone, { target: { value: 'é'.repeat(512) } })
    await lancer()
    expect(creditsFactory).toHaveBeenCalledTimes(1)
    expect(runEngine).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toBe('moteur non exercé dans ce test unitaire')
  })
})

