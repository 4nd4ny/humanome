// « Cartographie ouverte Twin6 » — orchestrateur du pipeline open source.
//
// 8 appels sur le portfolio ENTIER : 7× `1-scan-pole` (un par pôle RESPIRE) +
// 1× `2-kairos-final`, puis mapping vers `cartographie-merge` (voir mapper.js).
// C'est le pendant GRATUIT/ouvert de Twin9 (milliers d'appels, confidentiel).
//
// Contrat des prompts (vérifié sur les .md source) : `${POLE}` = le NUMÉRO du
// pôle (1..7) ; la fiche `P${POLE}.md` et le portfolio sont des ENTRÉES attachées
// (pas de placeholder dédié), injectées ici sous des titres explicites. Le kairos
// reçoit les 7 `carto_pole` + le portfolio original.
//
// Aucune E/S ni secret ici (convention moteur, P5) : les gabarits (scan-pole,
// kairos, fiches P1..P7 — tous PUBLICS) sont injectés par l'appelant. La sortie
// LLM est du JSON ; on l'extrait de façon tolérante (fences ```json, préambule).

import { twin6ToMergeDocument } from './mapper.js'

/** Nombre d'appels d'un run Twin6 (7 pôles + kairos) — utile pour le devis. */
export const TWIN6_CALLS = 8

/** Prompt scan-pole : `${POLE}` → numéro, puis fiche du pôle + portfolio attachés. */
export function buildScanPolePrompt(scanPoleTemplate, poleNum, ficheMd, portfolio) {
  const base = scanPoleTemplate.replaceAll('${POLE}', String(poleNum))
  return (
    `${base}\n\n---\n\n# Fiche des compétences du pôle ${poleNum} (P${poleNum}.md)\n\n` +
    `${ficheMd}\n\n---\n\n# Portfolio à cartographier\n\n${portfolio}\n`
  )
}

/** Prompt kairos : les 7 `carto_pole` (étiquetés carto_P1..P7) + portfolio original. */
export function buildKairosPrompt(kairosTemplate, cartoPoles, portfolio) {
  const blocks = cartoPoles
    .map((cp) => `## carto_P${cp.poleNum}\n\n\`\`\`json\n${JSON.stringify(cp)}\n\`\`\``)
    .join('\n\n')
  return (
    `${kairosTemplate}\n\n---\n\n# Cartographies de pôle (entrée)\n\n${blocks}\n\n` +
    `---\n\n# Portfolio original\n\n${portfolio}\n`
  )
}

/**
 * Extrait le premier objet JSON d'une réponse LLM. Tolère un bloc ```json … ```
 * et un préambule/épilogue en prose. Lève si aucun objet n'est trouvable.
 */
export function extractJson(text) {
  if (typeof text !== 'string') throw new Error('extractJson: réponse non textuelle')
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('extractJson: aucun objet JSON trouvé dans la réponse')
  }
  return JSON.parse(candidate.slice(start, end + 1))
}

/**
 * Exécute une Cartographie ouverte Twin6 de bout en bout.
 *
 * @param {object} args
 * @param {string} args.portfolio portfolio markdown (feuilles `### YYYY-MM-DD`).
 * @param {{scanPole: string, kairos: string, fiches: Record<string|number,string>}} args.templates
 *   gabarits PUBLICS (scan-pole, kairos, fiche par pôle).
 * @param {{competences: Array, poles: Array<{num,nom}>}} args.referentiel structure RESPIRE.
 * @param {{complete: Function, name?: string}} args.provider handle de createProvider().
 * @param {string} args.model identifiant de modèle.
 * @param {object} [args.options] { maxTokens=8192, temperature, signal, onProgress, meta }.
 * @returns {Promise<{document: object, cartoPoles: Array, kairos: object,
 *   usage: {inputTokens:number, outputTokens:number}, calls: Array}>}
 */
export async function executerTwin6({ portfolio, templates, referentiel, provider, model, options = {} }) {
  if (typeof portfolio !== 'string' || portfolio.trim() === '') {
    throw new Error('executerTwin6: portfolio (string non vide) requis')
  }
  if (!templates?.scanPole || !templates?.kairos || !templates?.fiches) {
    throw new Error('executerTwin6: templates { scanPole, kairos, fiches } requis')
  }
  if (!referentiel?.poles || !referentiel?.competences) {
    throw new Error('executerTwin6: referentiel { poles[], competences[] } requis')
  }
  if (!provider?.complete || !model) {
    throw new Error('executerTwin6: provider (createProvider) et model requis')
  }

  const { maxTokens = 8192, temperature, signal, onProgress, meta = {} } = options
  const poleNums = referentiel.poles.map((p) => p.num).sort((a, b) => a - b)
  const total = poleNums.length + 1
  let done = 0
  const usage = { inputTokens: 0, outputTokens: 0 }
  const calls = []

  const accumulate = (etape, res) => {
    if (res.stopReason === 'max_tokens') {
      throw new Error(`executerTwin6: sortie tronquée (max_tokens) à l'étape ${etape}`)
    }
    usage.inputTokens += res.usage?.inputTokens ?? 0
    usage.outputTokens += res.usage?.outputTokens ?? 0
    calls.push({ etape, usage: res.usage ?? null, model: res.model ?? model })
  }

  // Phase 1 — 7 scan-pole.
  const cartoPoles = []
  for (const num of poleNums) {
    const fiche = templates.fiches[num] ?? templates.fiches[String(num)]
    if (!fiche) throw new Error(`executerTwin6: fiche manquante pour le pôle ${num}`)
    onProgress?.({ phase: 'scan-pole', pole: num, done, total })
    const prompt = buildScanPolePrompt(templates.scanPole, num, fiche, portfolio)
    const res = await provider.complete({ model, prompt, maxTokens, temperature, signal })
    accumulate(`scan-pole/${num}`, res)
    const cartoPole = extractJson(res.text)
    if (cartoPole.poleNum == null) cartoPole.poleNum = num
    cartoPoles.push(cartoPole)
    done += 1
  }

  // Phase 2 — kairos transversal.
  onProgress?.({ phase: 'kairos', done, total })
  const kairosPrompt = buildKairosPrompt(templates.kairos, cartoPoles, portfolio)
  const kres = await provider.complete({ model, prompt: kairosPrompt, maxTokens, temperature, signal })
  accumulate('kairos', kres)
  const kairos = extractJson(kres.text)
  done += 1
  onProgress?.({ phase: 'done', done, total })

  // Phase 3 — mapping vers le document du viewer.
  const document = twin6ToMergeDocument(cartoPoles, kairos, referentiel, meta)
  return { document, cartoPoles, kairos, usage, calls }
}
