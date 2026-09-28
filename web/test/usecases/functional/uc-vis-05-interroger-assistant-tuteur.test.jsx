// UC-VIS-05 — Interroger l'assistant tuteur : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-05-interroger-assistant-tuteur.md
//
// Le visiteur ouvre le panneau « Assistant » (bouton 💬 de l'en-tête) depuis
// n'importe quelle rubrique de l'application ENTIÈRE (<App/>). Le réseau est
// le faux serveur aux règles de la démo (défi à usage unique partagé avec
// /api/llm, preuve vérifiée par sha256 via node:crypto, champ piège vide) :
// une requête mal formée serait refusée. Aucun appel LLM réel.
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { fakeDemoServer, jsonResponse } from '../support/vis.js'

const answer = (text) => () => jsonResponse(200, { text, usage: { inputTokens: 900, outputTokens: 30 }, model: 'claude-haiku-4-5-20251001' })

function openApp(hash = '#/referentiel', fetchMeFn = async () => ({ user: null })) {
  window.location.hash = hash
  return render(<App lib={fakeLib} fetchMeFn={fetchMeFn} />)
}

function openAssistant() {
  fireEvent.click(screen.getByRole('button', { name: 'Assistant : poser une question sur le site' }))
  return within(screen.getByRole('dialog', { name: 'Assistant tuteur' }))
}

async function ask(panel, question) {
  fireEvent.change(panel.getByLabelText('Votre question à l’assistant'), { target: { value: question } })
  await act(async () => {
    fireEvent.click(panel.getByRole('button', { name: 'Envoyer' }))
  })
}

beforeEach(() => {
  resetApiClient()
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.location.hash = ''
  sessionStorage.clear()
})

describe('UC-VIS-05 — le visiteur interroge l’assistant', () => {
  it('UC-VIS-05-F10 — nominal : 💬 → avertissement IA, question, défi résolu, réponse en texte simple ; seule la question et la rubrique partent', async () => {
    const server = fakeDemoServer({
      createHash,
      difficultyBits: 6,
      answer: answer('Ouvrez **Référentiel** puis cherchez `1.01` : #/referentiel/1.01.'),
    })
    openApp('#/referentiel')

    const panel = openAssistant()
    expect(panel.getByRole('note').textContent).toContain('Assistant automatique (IA)')
    expect(panel.getByRole('note').textContent).toContain('Il ne voit pas votre portfolio')
    expect(panel.getByRole('button', { name: 'Envoyer' }).disabled).toBe(true)
    await ask(panel, 'Où trouver la pensée critique ?')

    await waitFor(() =>
      expect(panel.getByText('Ouvrez Référentiel puis cherchez 1.01 : #/referentiel/1.01.')).toBeDefined(),
    )
    expect(panel.getByText('Où trouver la pensée critique ?').className).toContain('tuteur-msg-user')
    expect(server.rejected).toEqual([])
    expect(server.posts).toEqual([
      expect.objectContaining({ question: 'Où trouver la pensée critique ?', rubrique: 'referentiel', website: '' }),
    ])
    expect(Object.keys(server.posts[0]).sort()).toEqual(['challenge', 'nonce', 'question', 'rubrique', 'website'])
    // Historique de SESSION de l'onglet (jamais serveur, jamais localStorage).
    expect(JSON.parse(sessionStorage.getItem('humanome-tuteur'))).toHaveLength(2)
    expect(JSON.stringify({ ...localStorage })).not.toContain('pensée critique')
  })

  it('UC-VIS-05-F11 — A2/A3 : l’historique survit au changement de page dans l’onglet ; « Effacer » le vide', async () => {
    fakeDemoServer({ createHash, difficultyBits: 2, answer: answer('Commencez par #/essayer.') })
    const { unmount } = openApp('#/')
    const panel = openAssistant()
    await ask(panel, 'Par où commencer ?')
    await waitFor(() => expect(panel.getByText('Commencez par #/essayer.')).toBeDefined())
    unmount()

    openApp('#/guides')
    const again = openAssistant()
    expect(again.getByText('Par où commencer ?')).toBeDefined()
    expect(again.getByText('Commencez par #/essayer.')).toBeDefined()
    fireEvent.click(again.getByRole('button', { name: 'Effacer' }))
    expect(again.getByText(/Posez une question/)).toBeDefined()
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem('humanome-tuteur'))).toEqual([]))
  })

  it('UC-VIS-05-F12 — A1 : compte connecté — même panneau, la rubrique courante part, aucun rôle n’est envoyé (le serveur le lit dans la session)', async () => {
    const server = fakeDemoServer({ createHash, difficultyBits: 2, answer: answer('Votre file est dans #/cartographe.') })
    openApp('#/cartographe', async () => ({ user: { id: 3, displayName: 'Camille', roles: ['apprenant', 'cartographe'] } }))
    await screen.findByRole('link', { name: 'Ma file de relecture' })

    const panel = openAssistant()
    await ask(panel, 'Où relire ?')
    await waitFor(() => expect(panel.getByText('Votre file est dans #/cartographe.')).toBeDefined())
    expect(server.posts[0].rubrique).toBe('cartographe')
    expect(server.posts[0]).not.toHaveProperty('role')
    expect(server.posts[0]).not.toHaveProperty('roles')
  })

  it('UC-VIS-05-F13 — E4 : budget du jour épuisé → message du serveur, la saisie redevient possible', async () => {
    fakeDemoServer({
      createHash,
      difficultyBits: 2,
      answer: () => jsonResponse(503, { error: 'L’assistant a atteint son budget du jour, revenez demain.' }),
    })
    openApp('#/')
    const panel = openAssistant()
    await ask(panel, 'Une question ?')

    expect((await panel.findByRole('alert')).textContent).toBe('L’assistant a atteint son budget du jour, revenez demain.')
    expect(panel.getByLabelText('Votre question à l’assistant').disabled).toBe(false)
    expect(panel.queryByRole('status')).toBeNull() // plus d'indicateur « écrit… »
  })

  it('UC-VIS-05-F14 — E5 : démo désactivée → défi refusé ; le panneau affiche le message TECHNIQUE du client (limite L1)', async () => {
    const server = fakeDemoServer({
      createHash,
      answer: answer('jamais'),
      challengeAnswer: () => jsonResponse(503, { error: 'La démonstration est désactivée pour le moment.' }),
    })
    openApp('#/')
    const panel = openAssistant()
    await ask(panel, 'Bonjour ?')

    expect((await panel.findByRole('alert')).textContent).toBe('démo : HTTP 503 sur api/llm/challenge')
    expect(server.posts).toHaveLength(0)
  })

  it('UC-VIS-05-F15 — E1 : question vide non envoyable ; saisie bornée à 1 500 caractères', () => {
    const server = fakeDemoServer({ createHash, answer: answer('x') })
    openApp('#/')
    const panel = openAssistant()
    const input = panel.getByLabelText('Votre question à l’assistant')
    expect(input.getAttribute('maxLength')).toBe('1500')
    fireEvent.change(input, { target: { value: '    ' } })
    expect(panel.getByRole('button', { name: 'Envoyer' }).disabled).toBe(true)
    fireEvent.submit(input.closest('form'))
    expect(server.issuedCount()).toBe(0)
    fireEvent.click(panel.getByRole('button', { name: 'Fermer l’assistant' }))
    expect(screen.queryByRole('dialog', { name: 'Assistant tuteur' })).toBeNull()
  })
})
