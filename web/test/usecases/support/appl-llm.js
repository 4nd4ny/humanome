// Support du lot « apprenant, parcours local » (UC-APP-02/03/06) : réponses
// LLM DÉTERMINISTES rejouant les fixtures versionnées (schemas/fixtures/
// cartographie-jour-2026-01-0{5,6,7}.json), même motif que le MockProvider
// PHP (api/src/Llm/MockProvider.php) et que les tests historiques du moteur.
//
// Aucun appel réseau réel : ces fonctions fabriquent le TEXTE qu'un modèle
// renverrait pour un prompt d'extraction (pôle n ou synthèse kairos) produit
// par engine/src/pipeline/extract.js.
import day05 from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import day06 from '../../../../schemas/fixtures/cartographie-jour-2026-01-06.json'
import day07 from '../../../../schemas/fixtures/cartographie-jour-2026-01-07.json'

export const FIXTURE_DAYS = { '2026-01-05': day05, '2026-01-06': day06, '2026-01-07': day07 }

/**
 * Texte de réponse « modèle » pour un prompt d'extraction du moteur.
 * @param {string} prompt prompt construit par buildExtractionPrompt / buildKairosExtractionPrompt
 * @returns {string} JSON du pôle (ou du kairos) de la fixture du jour cité
 */
export function fixtureAnswer(prompt) {
  const iso = /\((\d{4}-\d{2}-\d{2})\)/.exec(prompt)?.[1]
  const doc = FIXTURE_DAYS[iso] ?? day05
  if (prompt.includes('SYNTHÈSE KAIROS')) return JSON.stringify(doc.kairos)
  const num = Number(/# Pôle (\d) — /.exec(prompt)?.[1] ?? 1)
  return JSON.stringify(doc.poles[num - 1])
}

/** Corps de réponse du proxy POST api/llm (contrat routes/llm.php). */
export function proxyAnswer(prompt) {
  const text = fixtureAnswer(prompt)
  return {
    text,
    usage: { inputTokens: Math.ceil(prompt.length / 3.6), outputTokens: Math.ceil(text.length / 3.6) },
    model: 'mock',
    stopReason: 'end_turn',
  }
}

/** Corps de réponse de l'API Messages d'Anthropic (transport direct, clé personnelle). */
export function anthropicAnswer(prompt, model = 'claude-sonnet-4-6') {
  const text = fixtureAnswer(prompt)
  return {
    id: 'msg_test',
    type: 'message',
    model,
    content: [{ type: 'text', text }],
    usage: { input_tokens: Math.ceil(prompt.length / 3.6), output_tokens: Math.ceil(text.length / 3.6) },
    stop_reason: 'end_turn',
  }
}

/**
 * Texte de portfolio dont les journées sont les dates des fixtures : la
 * segmentation produit exactement ces jours, et le faux modèle y répond.
 * @param {string[]} [dates]
 */
export function portfolioText(dates = Object.keys(FIXTURE_DAYS)) {
  return dates
    .map((iso) => `## ${iso}\n\nJournée du ${iso} : atelier, visite guidée, bilan du soir.\n`)
    .join('\n')
}
