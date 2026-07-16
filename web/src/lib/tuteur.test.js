// Client de l'assistant tuteur (D9) : défi PoW + POST /api/tuteur, sans jamais
// envoyer le portfolio (question + rubrique seulement).
import { describe, expect, it, vi } from 'vitest'
import { askTuteur } from './tuteur.js'

describe('askTuteur', () => {
  it('résout un défi PoW puis poste la question + rubrique (jamais le portfolio)', async () => {
    const fetchChallengeFn = vi.fn(async () => ({ challenge: 'C.123', difficultyBits: 8 }))
    // solvePow renvoie un objet { nonce, attempts } — le mock doit être fidèle.
    const solvePowFn = vi.fn(async () => ({ nonce: '4242', attempts: 17 }))
    let posted = null
    const apiFetchFn = vi.fn(async (path, opts) => {
      posted = { path, opts }
      return { text: 'Ouvre #/essayer pour cartographier votre texte.', model: 'claude-haiku-4-5' }
    })

    const out = await askTuteur(
      { question: 'Comment cartographier mon texte ?', rubrique: 'home' },
      { fetchChallengeFn, solvePowFn, apiFetchFn },
    )

    expect(fetchChallengeFn).toHaveBeenCalledTimes(1)
    expect(solvePowFn).toHaveBeenCalledWith(expect.objectContaining({ challenge: 'C.123', difficultyBits: 8 }))
    expect(posted.path).toBe('tuteur')
    expect(posted.opts.method).toBe('POST')
    // Corps : question + rubrique + PoW + honeypot vide ; PAS de portfolio.
    // Le corps ne contient QUE ces champs (aucune clé de portfolio/cartographie).
    expect(posted.opts.body).toEqual({
      question: 'Comment cartographier mon texte ?',
      rubrique: 'home',
      challenge: 'C.123',
      nonce: '4242',
      website: '',
    })
    expect(Object.keys(posted.opts.body).sort()).toEqual([
      'challenge', 'nonce', 'question', 'rubrique', 'website',
    ])
    expect(out.text).toContain('#/essayer')
  })
})
