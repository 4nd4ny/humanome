// UC-VIS-03 — Essayer la cartographie en direct, sans compte : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-03-essayer-cartographie-en-direct.md
//
// Le visiteur joue le scénario dans l'application ENTIÈRE (<App/>) : menu
// « Essayer », texte collé, cartographie en direct par le VRAI moteur
// (extractDay : 7 appels pôle + 1 kairos). Le réseau est un faux serveur qui
// applique les RÈGLES du serveur PHP (défi à usage unique, preuve vérifiée par
// sha256 via node:crypto, champ piège vide) : si le navigateur trichait ou
// réutilisait un défi, le faux serveur le refuserait. Aucun appel LLM réel.
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { clearReferentielCache } from '../../../src/data/referentiel.js'
import { localIsoToday } from '../../../src/lib/demo-llm.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { FIXTURE_DAYS, fakeDemoServer, jsonResponse } from '../support/vis.js'

const TEXT =
  'Aujourd’hui j’ai animé la réunion de l’atelier vélo : j’ai préparé l’ordre du jour, ' +
  'écouté les désaccords sur le budget et proposé un vote. Le soir, j’ai rédigé le compte rendu.'

/** Synthèse kairos valide au schéma (même forme que le test historique de la vue). */
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

const POLES = FIXTURE_DAYS['2026-01-05'].poles

/** Réponse « modèle » : le pôle demandé par le prompt, ou la synthèse kairos. */
function modelAnswer(body) {
  if (body.prompt.includes('SYNTHÈSE KAIROS')) {
    return jsonResponse(200, { text: JSON.stringify(KAIROS), usage: { inputTokens: 9, outputTokens: 9 }, model: 'mock' })
  }
  const num = Number(/"poleNum": "(\d)"/.exec(body.prompt)[1])
  return jsonResponse(200, { text: JSON.stringify(POLES[num - 1]), usage: { inputTokens: 9, outputTokens: 9 }, model: 'mock' })
}

function withHeaders(response, headers) {
  return { ...response, headers: { get: (n) => headers[String(n).toLowerCase()] ?? response.headers.get(n) } }
}

function openApp(hash = '#/essayer') {
  window.location.hash = hash
  render(<App lib={fakeLib} fetchMeFn={async () => ({ user: null })} />)
}

async function pasteAndRun(text = TEXT) {
  fireEvent.change(screen.getByLabelText('Texte à cartographier'), { target: { value: text } })
  const button = screen.getByRole('button', { name: 'Cartographier ce texte' })
  await waitFor(() => expect(button.disabled).toBe(false)) // référentiel chargé
  fireEvent.click(button)
}

beforeEach(() => {
  resetApiClient()
  clearReferentielCache()
  globalThis.indexedDB = { open: vi.fn(), deleteDatabase: vi.fn() }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.location.hash = ''
  delete globalThis.indexedDB
})

describe('UC-VIS-03 — le visiteur cartographie son texte en direct', () => {
  it('UC-VIS-03-F11 — nominal : menu « Essayer » → 8 appels acceptés par les règles serveur → journée affichée, rien de conservé', async () => {
    const server = fakeDemoServer({ createHash, difficultyBits: 6, answer: modelAnswer })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    openApp('#/')
    const nav = within(screen.getByRole('navigation', { name: 'Navigation principale' }))
    expect(nav.getByRole('link', { name: /^Essayer/ }).getAttribute('href')).toBe('#/essayer')
    act(() => {
      window.location.hash = '#/essayer'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(screen.getByRole('heading', { name: 'Essayer avec votre propre texte' })).toBeDefined()
    expect(screen.getByText(/ne sont stockés nulle part/)).toBeDefined()
    await pasteAndRun()

    // Progression visible pendant le run.
    expect(await screen.findByTestId('essayer-progress')).toBeDefined()
    const banner = await screen.findByTestId('demo-banner', undefined, { timeout: 10_000 })
    expect(banner.textContent).toContain('ce résultat n’est pas conservé')
    const [y, m, d] = localIsoToday().split('-')
    expect(screen.getByTestId('day-badge').textContent).toBe(`Journée du ${d}/${m}/${y}`)

    // Le faux serveur n'a RIEN refusé : 8 défis distincts, 8 preuves valides.
    expect(server.rejected).toEqual([])
    expect(server.posts).toHaveLength(8)
    expect(server.issuedCount()).toBe(8)
    expect(new Set(server.posts.map((p) => p.challenge)).size).toBe(8)
    expect(server.posts.every((p) => p.website === '' && p.prompt.includes('atelier vélo'))).toBe(true)
    // Aucune persistance locale du texte ni du résultat (ni Web Storage, ni IndexedDB).
    const stored = setItem.mock.calls.map(([, value]) => String(value)).join(' ')
    expect(stored).not.toContain('atelier vélo')
    expect(stored).not.toContain('poleNum')
    expect(globalThis.indexedDB.open).not.toHaveBeenCalled()

    // Le résultat se lit comme une journée : toucher une compétence → verdict.
    fireEvent.click(screen.getByRole('button', { name: '2.01' }))
    expect(screen.getByTestId('verdict-block').textContent).toContain('présence établie')
  })

  it('UC-VIS-03-F12 — A2 : « Cartographier un autre texte » revient au formulaire (texte conservé à l’écran), « Exporter le JSON » télécharge localement', async () => {
    fakeDemoServer({ createHash, difficultyBits: 2, answer: modelAnswer })
    openApp()
    await pasteAndRun()
    await screen.findByTestId('demo-banner', undefined, { timeout: 10_000 })

    const createObjectURL = vi.fn(() => 'blob:local')
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL, revokeObjectURL: vi.fn() }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      this.dataset.clicked = this.download
    })
    fireEvent.click(screen.getByTestId('essayer-export'))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click.mock.contexts[0].download).toBe(`cartographie-jour-${localIsoToday()}.json`)

    fireEvent.click(screen.getByRole('button', { name: 'Cartographier un autre texte' }))
    expect(screen.getByLabelText('Texte à cartographier').value).toBe(TEXT)
    expect(screen.queryByTestId('demo-banner')).toBeNull()
  })

  it('UC-VIS-03-F13 — A3 : synthèse kairos inexploitable → résultat des 7 pôles tout de même, avec une note', async () => {
    fakeDemoServer({
      createHash,
      difficultyBits: 2,
      answer: (body) =>
        body.prompt.includes('SYNTHÈSE KAIROS')
          ? jsonResponse(200, { text: 'pas du JSON', usage: { inputTokens: 1, outputTokens: 1 }, model: 'mock' })
          : modelAnswer(body),
    })
    openApp()
    await pasteAndRun()

    const banner = await screen.findByTestId('demo-banner', undefined, { timeout: 10_000 })
    expect(banner.textContent).toContain('La synthèse transversale (kairos) n’a pas pu être produite cette fois')
    expect(screen.getByTestId('day-badge')).toBeDefined()
  })

  it('UC-VIS-03-F14 — A4 : incident amont transitoire (504) → un seul nouvel essai automatique, avec un défi neuf', async () => {
    let failed = false
    const server = fakeDemoServer({
      createHash,
      difficultyBits: 2,
      answer: (body) => {
        if (!failed && /"poleNum": "3"/.test(body.prompt)) {
          failed = true
          return jsonResponse(504, { error: 'Le fournisseur LLM est injoignable, réessayez plus tard.' })
        }
        return modelAnswer(body)
      },
    })
    openApp()
    await pasteAndRun()

    await screen.findByTestId('demo-banner', undefined, { timeout: 15_000 })
    expect(server.posts).toHaveLength(9) // 8 + le nouvel essai du pôle 3
    expect(new Set(server.posts.map((p) => p.challenge)).size).toBe(9)
    expect(server.rejected).toEqual([])
  }, 20_000)

  it('UC-VIS-03-F15 — A5 : annuler pendant l’analyse → retour au texte, aucun appel supplémentaire', async () => {
    const server = fakeDemoServer({
      createHash,
      difficultyBits: 2,
      // Le 2e appel reste « en vol » jusqu'à l'annulation (fetch interrompu).
      answer: (body, n, init) =>
        n === 2
          ? new Promise((_, reject) =>
              init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
            )
          : modelAnswer(body),
    })
    openApp()
    await pasteAndRun()
    await screen.findByText(/appel 2 sur 8/)

    fireEvent.click(screen.getByRole('button', { name: 'Annuler l’analyse' }))
    expect((await screen.findByText(/^Analyse annulée/)).textContent).toBe(
      'Analyse annulée. Votre texte est toujours là, rien n’a été conservé.',
    )
    expect(screen.getByLabelText('Texte à cartographier').value).toBe(TEXT)
    expect(server.posts).toHaveLength(2)
  })
})

describe('UC-VIS-03 — refus et limites vus par le visiteur', () => {
  it('UC-VIS-03-F16 — E3 : texte trop court ou trop long → bouton inactif, aucune requête', async () => {
    const server = fakeDemoServer({ createHash, answer: modelAnswer })
    openApp()
    fireEvent.change(screen.getByLabelText('Texte à cartographier'), { target: { value: 'Trop court.' } })
    expect(screen.getByTestId('text-too-short')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Cartographier ce texte' }).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Texte à cartographier'), { target: { value: 'x'.repeat(12001) } })
    expect(screen.getByTestId('text-too-long').textContent).toContain('retirez 1 caractères')
    expect(screen.getByRole('button', { name: 'Cartographier ce texte' }).disabled).toBe(true)
    expect(server.issuedCount()).toBe(0)
  })

  it('UC-VIS-03-F17 — E4 : quota horaire atteint (429, Retry-After 120 s) → « réessayez dans 2 minutes », bouton Réessayer', async () => {
    fakeDemoServer({
      createHash,
      difficultyBits: 2,
      answer: () => withHeaders(jsonResponse(429, { error: 'Quota horaire atteint, réessayez plus tard.' }), { 'retry-after': '120' }),
    })
    openApp()
    await pasteAndRun()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('La démo est très demandée en ce moment : réessayez dans 2 minutes.')
    expect(within(alert).getByRole('button', { name: 'Réessayer' })).toBeDefined()
  })

  it('UC-VIS-03-F18 — E5/E6 : démo épuisée ou désactivée (503 dès le premier défi) → message, sans réessai, aucun appel LLM', async () => {
    const server = fakeDemoServer({
      createHash,
      answer: modelAnswer,
      challengeAnswer: () => jsonResponse(503, { error: 'La démonstration est désactivée pour le moment.' }),
    })
    openApp()
    await pasteAndRun()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('La démo est épuisée pour aujourd’hui ou momentanément désactivée.')
    expect(within(alert).queryByRole('button', { name: 'Réessayer' })).toBeNull()
    expect(server.posts).toHaveLength(0)
  })

  // ANOMALIE A1 — comportement ACTUEL figé : une difficulté de 23 bits, que
  // l'administration peut régler (bornes 8–24), est insoluble pour le
  // navigateur (22 bits max) : la démo échoue avec un message générique.
  it('UC-VIS-03-F19 — [comportement actuel, anomalie A1] difficulté 23 bits servie → échec générique, aucun appel LLM', async () => {
    const server = fakeDemoServer({ createHash, difficultyBits: 23, answer: modelAnswer })
    openApp()
    await pasteAndRun()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('L’analyse a échoué en cours de route')
    expect(alert.textContent).toContain('entre 0 et 22')
    expect(server.posts).toHaveLength(0)
  })
})
