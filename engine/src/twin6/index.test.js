import { describe, it, expect, vi } from 'vitest'
import { executerTwin6, buildScanPolePrompt, buildKairosPrompt, extractJson, TWIN6_CALLS } from './index.js'
import { validateDocument } from '../validation.js'

const referentiel = {
  poles: [
    { num: 1, nom: 'TÊTE — Penser & Comprendre' },
    { num: 2, nom: 'CŒUR — Relier & Naviguer' },
    { num: 3, nom: 'MAIN — Créer & Incarner' },
    { num: 4, nom: 'ÂME — Discerner & Juger' },
    { num: 5, nom: 'RACINES — Évoluer & Résister' },
    { num: 6, nom: 'CITÉ — Gouverner & S’ouvrir' },
    { num: 7, nom: 'FLAMBEAU — Transmettre & Piloter' },
  ],
  competences: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ code: `${n}.01`, nom: `Compétence ${n}.01`, pole: n })),
}

// carto_pole canonique pour le pôle N : une compétence attestée par une trace.
function cartoPoleFor(num) {
  return {
    poleNum: num,
    passagesSaillants: [{ pid: 1, feuille: '2026-02-10', extraitVerbatim: `Trace ${num}.`, contexte: 'projet', auteur: 'apprenant' }],
    competences: [
      {
        code: `${num}.01`,
        courtCircuit: false,
        pieces: [{ numero: 1, pid: 1, contexte: 'acte' }],
        pedagogue: { conclusionAdversariale: { raisonnement: `Attestation ${num}.`, confianceFinale: 0.7 } },
        verdict: { statut: 'présence établie', nombrePreuves: 1, nombreIndices: 0, confiance: 0.7, motif: 'Trace concrète.', prescription: 'Poursuivre.' },
        tracesRetenues: [{ pieceId: 1, type: 'trace concrète', role: 'preuve décisive' }],
      },
    ],
    rapport: { rapportCompletMarkdown: `## Pôle ${num}\n\nPrésent.`, portraitPole: '.' },
    auditPole: { competencesTotales: 1, presencesEtablies: 1 },
  }
}

const kairosOut = {
  kairos: { apprenant: { portrait: 'Profil.', formeProfil: 'Massifs.', syntheseCompleteMarkdown: '## Synthèse\n\nUn tout cohérent.' } },
  emergencesCrossPoles: { competencesOrphelines: [], connexionsTransversales: [], noeudsConceptuels: [] },
}

const templates = {
  scanPole: 'Analyse le pôle ${POLE} en lisant P${POLE}.md.',
  kairos: 'Synthèse kairos des 7 carto_pole.',
  fiches: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [n, `Fiche du pôle ${n}`])),
}

/** Provider factice : renvoie le carto_pole du pôle demandé (déduit du prompt), puis le kairos. */
function mockProvider() {
  return {
    name: 'mock',
    complete: vi.fn(async ({ prompt }) => {
      const isKairos = prompt.includes('carto_P1')
      if (isKairos) {
        return { text: '```json\n' + JSON.stringify(kairosOut) + '\n```', usage: { inputTokens: 500, outputTokens: 200 }, model: 'mock-1', stopReason: 'end_turn' }
      }
      // Le prompt scan-pole contient « pôle N » après substitution de ${POLE}.
      const m = prompt.match(/Fiche des compétences du pôle (\d)/)
      const num = m ? Number(m[1]) : 1
      // Réponse volontairement bruitée (préambule + fence) pour tester extractJson.
      return { text: `Voici la cartographie.\n\n\`\`\`json\n${JSON.stringify(cartoPoleFor(num))}\n\`\`\`\nVoilà.`, usage: { inputTokens: 1000, outputTokens: 400 }, model: 'mock-1', stopReason: 'end_turn' }
    }),
  }
}

describe('executerTwin6', () => {
  it('enchaîne 7 scan-pole + 1 kairos et produit un cartographie-merge valide', async () => {
    const provider = mockProvider()
    const progress = []
    const meta = { journalId: 'run-twin6', sourceProtocole: 'twin6-ouverte@1.0.0', generatedAt: '2026-07-15T00:00:00' }
    const out = await executerTwin6({
      portfolio: '### 2026-02-10\n---\nJ’ai fait quelque chose de notable.',
      templates,
      referentiel,
      provider,
      model: 'claude-haiku-4-5-20251001',
      options: { onProgress: (p) => progress.push(p), meta },
    })

    expect(provider.complete).toHaveBeenCalledTimes(TWIN6_CALLS) // 8
    expect(out.calls).toHaveLength(8)
    expect(out.cartoPoles).toHaveLength(7)
    expect(out.usage).toEqual({ inputTokens: 7 * 1000 + 500, outputTokens: 7 * 400 + 200 })

    const res = validateDocument('cartographie-merge', out.document)
    expect(res.errors).toEqual([])
    expect(res.valid).toBe(true)
    expect(out.document.narratifs.kairosHtml).toContain('Un tout cohérent')

    // Progression : une entrée par pôle + kairos + done.
    expect(progress.at(-1)).toMatchObject({ phase: 'done', done: 8, total: 8 })
  })

  it('substitue ${POLE} par le numéro et attache fiche + portfolio', () => {
    const p = buildScanPolePrompt('Pôle ${POLE}, lis P${POLE}.md', 3, 'FICHE-3', 'PORTFOLIO-X')
    expect(p).toContain('Pôle 3, lis P3.md')
    expect(p).toContain('FICHE-3')
    expect(p).toContain('PORTFOLIO-X')
    expect(p).not.toContain('${POLE}')
  })

  it('extractJson tolère les fences et le préambule', () => {
    expect(extractJson('bla\n```json\n{"a":1}\n```\nfin')).toEqual({ a: 1 })
    expect(extractJson('{"b":2}')).toEqual({ b: 2 })
    expect(() => extractJson('aucun json ici')).toThrow(/aucun objet JSON/)
  })

  it('échoue explicitement sur une sortie tronquée (max_tokens)', async () => {
    const provider = { complete: vi.fn(async () => ({ text: '{}', usage: {}, model: 'm', stopReason: 'max_tokens' })) }
    await expect(
      executerTwin6({ portfolio: 'x', templates, referentiel, provider, model: 'm' }),
    ).rejects.toThrow(/tronquée/)
  })
})
