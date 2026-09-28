// UC-APP-09 — Lancer une cartographie ouverte (Twin6) : tests UNITAIRES (moteur).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-09-cartographie-ouverte-twin6.md
//
// Le moteur Twin6 (engine/src/twin6/) est appelé directement : construction
// des prompts PUBLICS (scan-pole ×7, kairos), extraction JSON tolérante,
// orchestration executerTwin6 (ordre, progression, garde de troncature),
// projection vers cartographie-merge (twin6ToMergeDocument) et provider
// « clé perso » (createProvider direct). Gabarits et portfolio FICTIFS.
import { describe, expect, it, vi } from 'vitest'
import {
  TWIN6_CALLS,
  buildKairosPrompt,
  buildScanPolePrompt,
  executerTwin6,
  extractJson,
} from '../../../src/twin6/index.js'
import { twin6ToMergeDocument } from '../../../src/twin6/mapper.js'
import { createProvider } from '../../../src/providers/index.js'
import { validateDocument } from '../../../src/validation.js'

const POLES = [
  { num: 1, nom: 'TÊTE — Penser & Comprendre' },
  { num: 2, nom: 'CŒUR — Relier & Naviguer' },
  { num: 3, nom: 'MAIN — Créer & Incarner' },
  { num: 4, nom: 'ÂME — Discerner & Juger' },
  { num: 5, nom: 'RACINES — Évoluer & Résister' },
  { num: 6, nom: 'CITÉ — Gouverner & S’ouvrir' },
  { num: 7, nom: 'FLAMBEAU — Transmettre & Piloter' },
]
const REFERENTIEL = {
  poles: POLES,
  competences: POLES.map((p) => ({ code: `${p.num}.01`, nom: `Compétence fictive ${p.num}.01`, pole: p.num })),
}
const TEMPLATES = {
  scanPole: 'Scanne le pôle ${POLE} (fiche P${POLE}.md).',
  kairos: 'Synthèse kairos fictive.',
  // Clés CHAÎNES, comme dans le JSON public téléchargé.
  fiches: Object.fromEntries(POLES.map((p) => [String(p.num), `Fiche publique fictive ${p.num}`])),
}
const PORTFOLIO = '### 2026-02-10\n---\nJ’ai recoupé deux sources avant de conclure.'

function cartoPole(num, { feuille = '2026-02-10', statut = 'présence établie', sansPoleNum = false } = {}) {
  const pole = {
    poleNum: num,
    passagesSaillants: [{ pid: 1, feuille, extraitVerbatim: `Trace ${num}.`, contexte: 'projet', auteur: 'apprenant' }],
    competences: [
      {
        code: `${num}.01`,
        courtCircuit: false,
        pieces: [{ numero: 1, pid: 1, contexte: 'acte' }],
        pedagogue: { conclusionAdversariale: { raisonnement: `Raisonnement ${num}.`, confianceFinale: 0.7 } },
        verdict: { statut, nombrePreuves: 1, nombreIndices: 0, confiance: 0.7, motif: `Motif ${num}.`, prescription: `Piste ${num}.` },
        tracesRetenues: [{ pieceId: 1, type: 'trace concrète', role: 'preuve décisive' }],
      },
    ],
    rapport: { rapportCompletMarkdown: `## Pôle ${num}\n\nRapport fictif ${num}.` },
    auditPole: {},
  }
  if (sansPoleNum) delete pole.poleNum
  return pole
}
// Même forme que la méta passée par Twin6OuverteView (journalId, protocole, date).
const META = { journalId: 'twin6-ouverte', sourceProtocole: 'twin6-ouverte@1.0.0', generatedAt: '2026-07-15T00:00:00' }
const KAIROS = {
  kairos: { apprenant: { syntheseCompleteMarkdown: '## Synthèse\n\nKairos fictif du lot.' } },
  emergencesCrossPoles: { competencesOrphelines: [], connexionsTransversales: [], noeudsConceptuels: [] },
}

/** Provider factice : répond au pôle nommé dans le prompt, puis au kairos. */
function fakeProvider({ stopReasonKairos = 'end_turn', sansPoleNum = false } = {}) {
  return {
    name: 'fictif',
    complete: vi.fn(async ({ prompt }) => {
      if (prompt.includes('# Cartographies de pôle (entrée)')) {
        return { text: JSON.stringify(KAIROS), usage: { inputTokens: 50, outputTokens: 20 }, model: 'm', stopReason: stopReasonKairos }
      }
      const num = Number(/Fiche des compétences du pôle (\d)/.exec(prompt)[1])
      return {
        text: `Préambule.\n\`\`\`json\n${JSON.stringify(cartoPole(num, { sansPoleNum }))}\n\`\`\`\nFin.`,
        usage: { inputTokens: 100, outputTokens: 40 },
        model: 'm',
        stopReason: 'end_turn',
      }
    }),
  }
}

describe('UC-APP-09 — prompts publics Twin6', () => {
  it('UC-APP-09-U01 — scan-pole : toutes les occurrences de ${POLE} deviennent le numéro, fiche puis portfolio attachés sous des titres explicites', () => {
    const prompt = buildScanPolePrompt('Pôle ${POLE} — lire P${POLE}.md — ${POLE}', 4, 'FICHE-P4', 'PORTFOLIO-X')
    expect(prompt).toBe(
      'Pôle 4 — lire P4.md — 4\n\n---\n\n# Fiche des compétences du pôle 4 (P4.md)\n\nFICHE-P4' +
        '\n\n---\n\n# Portfolio à cartographier\n\nPORTFOLIO-X\n',
    )
  })

  it('UC-APP-09-U02 — kairos : un bloc carto_P<n> JSON par pôle, dans l’ordre reçu, puis le portfolio original', () => {
    const prompt = buildKairosPrompt('KAIROS', [{ poleNum: 2, x: 1 }, { poleNum: 1, y: 2 }], 'PORTFOLIO-Y')
    expect(prompt.startsWith('KAIROS\n\n---\n\n# Cartographies de pôle (entrée)\n\n')).toBe(true)
    expect(prompt.indexOf('## carto_P2')).toBeLessThan(prompt.indexOf('## carto_P1'))
    expect(prompt).toContain('```json\n{"poleNum":2,"x":1}\n```')
    expect(prompt.endsWith('# Portfolio original\n\nPORTFOLIO-Y\n')).toBe(true)
  })

  it('UC-APP-09-U03 — extractJson : bloc ```json prioritaire, préambule toléré, erreurs explicites sinon', () => {
    expect(extractJson('avant {"z":0}\n```json\n{"a":{"b":1}}\n```\naprès')).toEqual({ a: { b: 1 } })
    expect(extractJson('Réponse : {"c":3} merci')).toEqual({ c: 3 })
    expect(() => extractJson(null)).toThrow(/non textuelle/)
    expect(() => extractJson('pas de json')).toThrow(/aucun objet JSON/)
    expect(() => extractJson('{"tronque": ')).toThrow(/aucun objet JSON/)
    expect(() => extractJson('{"a": 1,}')).toThrow(SyntaxError)
  })
})

describe('UC-APP-09 — orchestration executerTwin6', () => {
  it('UC-APP-09-U04 — entrées invalides refusées AVANT tout appel au modèle', async () => {
    const provider = fakeProvider()
    const base = { portfolio: PORTFOLIO, templates: TEMPLATES, referentiel: REFERENTIEL, provider, model: 'm' }
    await expect(executerTwin6({ ...base, portfolio: '   ' })).rejects.toThrow(/portfolio/)
    await expect(executerTwin6({ ...base, templates: { scanPole: 'x' } })).rejects.toThrow(/templates/)
    await expect(executerTwin6({ ...base, referentiel: { poles: [] } })).rejects.toThrow(/referentiel/)
    await expect(executerTwin6({ ...base, model: '' })).rejects.toThrow(/provider/)
    expect(provider.complete).not.toHaveBeenCalled()
  })

  it('UC-APP-09-U05 — 8 appels : pôles triés 1→7 (quel que soit l’ordre du référentiel), puis kairos ; progression et usage cumulés', async () => {
    const provider = fakeProvider({ sansPoleNum: true })
    const progress = []
    const out = await executerTwin6({
      portfolio: PORTFOLIO,
      templates: TEMPLATES,
      referentiel: { ...REFERENTIEL, poles: [...POLES].reverse() },
      provider,
      model: 'claude-sonnet-5',
      options: { maxTokens: 2048, onProgress: (p) => progress.push(p), meta: META },
    })

    expect(TWIN6_CALLS).toBe(8)
    expect(out.calls.map((c) => c.etape)).toEqual([
      'scan-pole/1', 'scan-pole/2', 'scan-pole/3', 'scan-pole/4', 'scan-pole/5', 'scan-pole/6', 'scan-pole/7', 'kairos',
    ])
    // poleNum absent de la sortie : complété par le numéro demandé.
    expect(out.cartoPoles.map((c) => c.poleNum)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(out.usage).toEqual({ inputTokens: 7 * 100 + 50, outputTokens: 7 * 40 + 20 })
    // Chaque appel reçoit le modèle et le plafond de sortie choisis.
    for (const [params] of provider.complete.mock.calls) {
      expect(params).toMatchObject({ model: 'claude-sonnet-5', maxTokens: 2048 })
    }
    expect(progress.map((p) => p.phase)).toEqual([...Array(7).fill('scan-pole'), 'kairos', 'done'])
    expect(progress.at(-1)).toEqual({ phase: 'done', done: 8, total: 8 })
    expect(validateDocument('cartographie-merge', out.document).valid).toBe(true)
  })

  it('UC-APP-09-U06 — fiche publique manquante pour un pôle : arrêt explicite, aucun appel pour ce pôle', async () => {
    const provider = fakeProvider()
    const fiches = { ...TEMPLATES.fiches }
    delete fiches['3']
    await expect(
      executerTwin6({ portfolio: PORTFOLIO, templates: { ...TEMPLATES, fiches }, referentiel: REFERENTIEL, provider, model: 'm' }),
    ).rejects.toThrow(/fiche manquante pour le pôle 3/)
    expect(provider.complete).toHaveBeenCalledTimes(2) // pôles 1 et 2 seulement
  })

  it('UC-APP-09-U07 — sortie tronquée (stopReason max_tokens) au kairos : échec explicite nommant l’étape', async () => {
    const provider = fakeProvider({ stopReasonKairos: 'max_tokens' })
    await expect(
      executerTwin6({ portfolio: PORTFOLIO, templates: TEMPLATES, referentiel: REFERENTIEL, provider, model: 'm' }),
    ).rejects.toThrow(/tronquée \(max_tokens\) à l'étape kairos/)
  })

  it('UC-APP-09-U12 — LIMITE figée : référentiel vide (Twin9 non importé) → aucun scan-pole, UN appel kairos, puis échec du mapping', async () => {
    const provider = fakeProvider()
    await expect(
      executerTwin6({ portfolio: PORTFOLIO, templates: TEMPLATES, referentiel: { poles: [], competences: [] }, provider, model: 'm' }),
    ).rejects.toThrow(/cartoPoles doit être un tableau non vide/)
    // Comportement ACTUEL : sur la voie crédits, cet appel unique est facturé.
    expect(provider.complete).toHaveBeenCalledTimes(1)
    expect(provider.complete.mock.calls[0][0].prompt).toContain('# Cartographies de pôle (entrée)')
  })
})

describe('UC-APP-09 — projection vers le sunburst (twin6ToMergeDocument)', () => {
  it('UC-APP-09-U08 — une feuille par date de passage ; un verdict « renvoi » n’est jamais promu en présence ; kairos et narratifs rattachés', () => {
    const poles = POLES.map((p) => cartoPole(p.num))
    poles[1] = cartoPole(2, { feuille: '2026-02-12', statut: 'renvoi au cartographe' })
    const doc = twin6ToMergeDocument(poles, KAIROS, REFERENTIEL, META)

    expect(doc.feuilles.map((f) => f.iso)).toEqual(['2026-02-10', '2026-02-12'])
    expect(doc.source).toEqual({ protocole: 'twin6-ouverte@1.0.0', journalId: 'twin6-ouverte' })
    const comps = Object.fromEntries(doc.domains.flatMap((d) => d.competences).map((c) => [c.code, c]))
    expect(comps['1.01'].points).toBe(1)
    expect(comps['1.01'].parFeuille.map((f) => f.date)).toEqual(['2026-02-10'])
    // 2.01 : verdict global « renvoi » → jamais une présence établie ; le pôle
    // compte le renvoi sur SA feuille (12/02), rien sur l'autre.
    expect(comps['2.01']).toBeUndefined()
    const pole2 = doc.domains.find((d) => d.id === 'CŒUR — Relier & Naviguer')
    expect(pole2.parFeuille.map((f) => [f.date, f.etablies, f.renvois])).toEqual([
      ['2026-02-10', 0, 0],
      ['2026-02-12', 0, 1],
    ])
    // Narratifs Twin6 sans appel supplémentaire : kairos, rapport de pôle, histoire synthétisée.
    expect(doc.narratifs.kairosHtml).toContain('Kairos fictif du lot')
    expect(doc.domains[0].rapport_html).toContain('Rapport fictif 1.')
    expect(comps['1.01'].feedback).toContain('Raisonnement 1.')
    expect(comps['1.01'].feedback).toContain('Piste 1.')
  })

  it('UC-APP-09-U09 — ANOMALIE figée : un pôle sans aucune présence établie produit un domaine vide, refusé par le schéma cartographie-merge', () => {
    const poles = POLES.map((p) => cartoPole(p.num))
    poles[1] = cartoPole(2, { statut: 'présence non établie' })
    const doc = twin6ToMergeDocument(poles, KAIROS, REFERENTIEL, META)

    const pole2 = doc.domains.find((d) => d.id === 'CŒUR — Relier & Naviguer')
    expect(pole2.competences).toEqual([])
    // Comportement ACTUEL (documenté dans la fiche, « Anomalies constatées ») :
    // le JSON exporté par la vue n'est pas conforme au schéma.
    const res = validateDocument('cartographie-merge', doc)
    expect(res.valid).toBe(false)
    expect(res.errors.map((e) => `${e.path} ${e.keyword}`)).toContain('/domains/1/competences minItems')
  })

  it('UC-APP-09-U10 — entrées vides refusées avec un message explicite', () => {
    expect(() => twin6ToMergeDocument([], KAIROS, REFERENTIEL)).toThrow(/tableau non vide/)
    expect(() => twin6ToMergeDocument([cartoPole(1)], KAIROS, { poles: POLES })).toThrow(/referentiel/)
  })
})

describe('UC-APP-09 — voie « clé perso » : provider direct navigateur', () => {
  it('UC-APP-09-U11 — appel DIRECT à api.anthropic.com avec la clé de l’utilisateur ; la réponse ne porte PAS stopReason (comportement actuel, cf. anomalie)', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'claude-sonnet-5',
        content: [{ type: 'text', text: '{"tronque": ' }],
        usage: { input_tokens: 10, output_tokens: 8192 },
        stop_reason: 'max_tokens',
      }),
    }))
    const provider = createProvider({ provider: 'anthropic', transport: 'direct', apiKey: 'sk-ant-perso-fictive', fetchFn })
    const res = await provider.complete({ model: 'claude-sonnet-5', prompt: 'Scanne le pôle 1', maxTokens: 8192 })

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('sk-ant-perso-fictive')
    expect(init.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 8192 })
    // ANOMALIE figée : stop_reason n'est pas relayé → la garde « tronquée »
    // d'executerTwin6 ne se déclenche pas sur la voie clé perso.
    expect(res.stopReason).toBeUndefined()
  })
})
