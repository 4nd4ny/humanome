// Client de l'assistant tuteur (D9) — POST /api/tuteur, protégé par preuve de
// travail (même défi que la démo, GET api/llm/challenge). N'envoie JAMAIS le
// portfolio : seulement la question + la rubrique courante (nom de route). Le
// rôle est déterminé CÔTÉ SERVEUR d'après la session ; on ne l'envoie pas.
import { apiFetch } from '../api/client.js'
import { fetchChallenge } from './demo-llm.js'
import { solvePow } from './pow.js'

/**
 * Pose une question au tuteur.
 * @param {{question: string, rubrique?: string}} params
 * @param {{apiFetchFn?: typeof apiFetch, fetchChallengeFn?: typeof fetchChallenge,
 *   solvePowFn?: typeof solvePow, signal?: AbortSignal}} [deps]
 * @returns {Promise<{text: string, model?: string}>}
 */
export async function askTuteur(
  { question, rubrique = '' },
  { apiFetchFn = apiFetch, fetchChallengeFn = fetchChallenge, solvePowFn = solvePow, signal } = {},
) {
  const challenge = await fetchChallengeFn({ signal })
  // solvePow renvoie { nonce, attempts } : on n'envoie que le nonce.
  const { nonce } = await solvePowFn({
    challenge: challenge.challenge,
    difficultyBits: challenge.difficultyBits,
    signal,
  })
  const data = await apiFetchFn('tuteur', {
    method: 'POST',
    body: {
      question,
      rubrique,
      challenge: challenge.challenge,
      nonce,
      website: '', // honeypot (doit rester vide)
    },
    ...(signal ? { signal } : {}),
  })
  return { text: typeof data?.text === 'string' ? data.text : '', model: data?.model }
}
