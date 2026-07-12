import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import EssayerView from './EssayerView.jsx'
import * as fakeLib from '../test/fake-sunburst-lib.js'
import dayFixture from '../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import { DEMO_TEXT_MAX_CHARS, localIsoToday } from '../lib/demo-llm.js'

// Texte de démo plausible, au-dessus du minimum de 80 caractères.
const SAMPLE_TEXT =
  'Aujourd’hui j’ai animé la réunion de l’atelier vélo : j’ai préparé l’ordre du jour, ' +
  'écouté les désaccords sur le budget et proposé un vote. Le soir, j’ai rédigé le compte rendu.'

/** Synthèse kairos minimale valide au schéma cartographie-jour ($defs.kairosJour). */
const KAIROS_RESPONSE = {
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
  emergencesCrossPoles: {
    connexionsTransversales: [],
    noeudsConceptuels: [],
    competencesOrphelines: [],
  },
}

function jsonResponse(status, data, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    json: async () => data,
  }
}

/**
 * Fake fetch du contrat /api/llm : GET défi (one-time) puis POST proxy.
 * `llm(body, n, init)` peut surcharger la réponse du n-ième POST.
 */
function makeFetch({ llm } = {}) {
  const issued = []
  const posts = []
  const fetchFn = vi.fn(async (url, init = {}) => {
    if (String(url).endsWith('llm/challenge')) {
      const challenge = `ch-${issued.length + 1}`
      issued.push(challenge)
      return jsonResponse(200, { challenge, difficultyBits: 2, expiresAt: null })
    }
    const body = JSON.parse(init.body)
    posts.push(body)
    const override = llm?.(body, posts.length, init)
    if (override) return override
    const text =
      posts.length <= 7
        ? JSON.stringify(dayFixture.poles[posts.length - 1])
        : JSON.stringify(KAIROS_RESPONSE)
    return jsonResponse(200, { text, usage: { inputTokens: 9, outputTokens: 9 }, model: 'demo' })
  })
  return { fetchFn, issued, posts }
}

async function pasteAndStart(text = SAMPLE_TEXT) {
  const textarea = screen.getByLabelText('Texte à cartographier')
  fireEvent.change(textarea, { target: { value: text } })
  const button = screen.getByRole('button', { name: 'Cartographier ce texte' })
  await waitFor(() => expect(button.disabled).toBe(false)) // référentiel chargé
  fireEvent.click(button)
}

beforeEach(() => {
  // jsdom n'implémente pas IndexedDB : un stub espionné suffit à prouver
  // que la page ne tente JAMAIS d'y écrire (exigence « aucune persistance »).
  globalThis.indexedDB = { open: vi.fn(), deleteDatabase: vi.fn() }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete globalThis.indexedDB
})

describe('EssayerView — saisie', () => {
  it('affiche le plafond, le compteur, et bloque un texte trop court', async () => {
    render(<EssayerView lib={fakeLib} fetchFn={makeFetch().fetchFn} />)

    expect(screen.getByTestId('char-counter').textContent).toBe('0 / 12 000 caractères')
    expect(screen.getByText(/il faudra recoller le texte/)).toBeDefined()

    fireEvent.change(screen.getByLabelText('Texte à cartographier'), {
      target: { value: 'Trop court.' },
    })
    expect(screen.getByTestId('text-too-short').textContent).toContain('Texte trop court')
    const button = screen.getByRole('button', { name: 'Cartographier ce texte' })
    await waitFor(() => expect(button.disabled).toBe(true))
  })

  it('bloque un texte au-delà du plafond avec le dépassement chiffré', () => {
    render(<EssayerView lib={fakeLib} fetchFn={makeFetch().fetchFn} />)

    fireEvent.change(screen.getByLabelText('Texte à cartographier'), {
      target: { value: 'x'.repeat(DEMO_TEXT_MAX_CHARS + 42) },
    })
    expect(screen.getByTestId('text-too-long').textContent).toContain('Texte trop long')
    expect(screen.getByTestId('text-too-long').textContent).toContain('retirez 42 caractères')
    expect(screen.getByTestId('char-counter').className).toContain('char-counter-over')
    expect(screen.getByRole('button', { name: 'Cartographier ce texte' }).disabled).toBe(true)
  })
})

describe('EssayerView — orchestration du moteur réel', () => {
  it('7 appels pôle + 1 kairos, un défi par appel, résultat rendu par la vue journée, zéro stockage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { fetchFn, issued, posts } = makeFetch()
    render(<EssayerView lib={fakeLib} fetchFn={fetchFn} />)

    await pasteAndStart()

    // Résultat : bandeau démo + vue journée existante (badge du jour local).
    const banner = await screen.findByTestId('demo-banner', undefined, { timeout: 10_000 })
    expect(banner.textContent).toContain('n’est pas conservé')
    expect(banner.textContent).toContain('Imprimer')
    expect(screen.getByTestId('day-badge').textContent).toContain('Journée du')
    const [y, m, d] = localIsoToday().split('-')
    expect(screen.getByTestId('day-badge').textContent).toContain(`${d}/${m}/${y}`)

    // Orchestration : 8 appels LLM, un défi one-time NEUF par appel.
    expect(posts).toHaveLength(8)
    expect(issued).toHaveLength(8)
    expect(new Set(posts.map((p) => p.challenge)).size).toBe(8)
    for (const body of posts) {
      expect(body.website).toBe('') // honeypot
      expect(typeof body.nonce).toBe('string')
      expect(body.prompt).toContain('atelier vélo') // le texte collé est analysé
    }
    // 7 prompts pôle puis 1 kairos.
    expect(posts[0].prompt).toContain('# Pôle 1')
    expect(posts[6].prompt).toContain('# Pôle 7')
    expect(posts[7].prompt).toContain('SYNTHÈSE KAIROS')

    // Aucune persistance d'aucune sorte (ni localStorage ni IndexedDB).
    expect(setItem).not.toHaveBeenCalled()
    expect(globalThis.indexedDB.open).not.toHaveBeenCalled()
  })

  it('montre la progression par pôle (noms + couleurs) et s’annule proprement', async () => {
    // Les appels 1..3 répondent ; le 4e reste en vol jusqu'à l'annulation.
    const { fetchFn, posts } = makeFetch({
      llm: (body, n, init) => {
        if (n !== 4) return null
        return new Promise((_, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        })
      },
    })
    render(<EssayerView lib={fakeLib} fetchFn={fetchFn} />)

    await pasteAndStart()

    // Progression : appel 4 sur 8, pôles 1..3 cochés, noms + couleurs affichés.
    await screen.findByText(/appel 4 sur 8/)
    const steps = screen.getByTestId('essayer-steps')
    expect(steps.querySelectorAll('.essayer-step-done')).toHaveLength(3)
    expect(steps.textContent).toContain('TETE — Penser & Comprendre')
    expect(steps.textContent).toContain('Synthèse kairos')
    const chips = steps.querySelectorAll('.essayer-step-chip[style]')
    expect(chips.length).toBeGreaterThanOrEqual(7) // couleurs des 7 pôles

    fireEvent.click(screen.getByRole('button', { name: 'Annuler l’analyse' }))

    // Retour à l'édition : texte conservé à l'écran, message d'annulation,
    // et pas d'appel au-delà du 4e.
    expect((await screen.findByText(/Analyse annulée/)).textContent).toContain(
      'rien n’a été conservé',
    )
    expect(screen.getByLabelText('Texte à cartographier').value).toBe(SAMPLE_TEXT)
    expect(posts.length).toBeLessThanOrEqual(4)
  })
})

describe('EssayerView — états d’erreur', () => {
  it('429 -> « la démo est très demandée », délai en minutes, réessai proposé', async () => {
    const { fetchFn } = makeFetch({
      llm: () => jsonResponse(429, { error: 'quota' }, { 'retry-after': '300' }),
    })
    render(<EssayerView lib={fakeLib} fetchFn={fetchFn} />)

    await pasteAndStart()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('très demandée')
    expect(alert.textContent).toContain('5 minutes')
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeDefined()
    // Le texte reste collé, prêt pour le réessai.
    expect(screen.getByLabelText('Texte à cartographier').value).toBe(SAMPLE_TEXT)
  })

  it('503 -> démo épuisée ou désactivée, sans bouton réessayer', async () => {
    const { fetchFn } = makeFetch({
      llm: () => jsonResponse(503, { error: 'demo off' }),
    })
    render(<EssayerView lib={fakeLib} fetchFn={fetchFn} />)

    await pasteAndStart()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/épuisée|désactivée/)
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBe(null)
  })

  it('erreur LLM (réponse inexploitable) -> détail technique + réessai possible', async () => {
    const { fetchFn } = makeFetch({
      llm: (body, n) =>
        n === 1
          ? jsonResponse(200, { text: 'pas du JSON', usage: {}, model: 'demo' })
          : null,
    })
    render(<EssayerView lib={fakeLib} fetchFn={fetchFn} />)

    await pasteAndStart()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('L’analyse a échoué')
    expect(alert.textContent).toContain('pôle 1')
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeDefined()
  })
})
