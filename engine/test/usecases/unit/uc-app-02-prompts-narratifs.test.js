// UC-APP-02 — Lancer une cartographie standard : tests UNITAIRES (moteur),
// module engine/src/pipeline/narrative-prompts.js (étapes 5, 6 et 7, RG6).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-02-lancer-cartographie-standard.md
//
// Rôle réel du module dans un run standard :
//  - formatDateFr date l'en-tête « # Feuille de portfolio du JJ/MM/AAAA
//    (AAAA-MM-JJ) » de CHACUN des 8 prompts d'extraction d'une journée
//    (extract.js l'importe) ;
//  - buildNarrativePrompts produit, sur les agrégats de la fusion, les
//    69 prompts de récits de fusion (61 compétences + 7 pôles + 1 kairos)
//    que l'estimation compte (MERGE_NARRATIVE_CALLS) mais que l'assistant
//    v1 n'envoie pas (résumés locaux : UC-APP-02-U21, 24 appels en F01).
// Entrées : fixtures versionnées schemas/fixtures/ (3 journées réelles
// anonymisées + référentiel), lues paresseusement.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createMockProvider } from '../../../src/providers/mock.js'
import { CALLS_PER_DAY, MERGE_NARRATIVE_CALLS, estimateRun } from '../../../src/providers/estimate.js'
import { extractDay } from '../../../src/pipeline/extract.js'
import { mergeDays } from '../../../src/pipeline/merge.js'
import { buildNarrativePrompts, formatDateFr } from '../../../src/pipeline/narrative-prompts.js'

const cache = new Map()
function fixture(name) {
  if (!cache.has(name)) {
    const url = new URL(`../../../../schemas/fixtures/${name}`, import.meta.url)
    cache.set(name, JSON.parse(readFileSync(url, 'utf8')))
  }
  return structuredClone(cache.get(name))
}
const referentiel = () => fixture('referentiel-respire-v7.json')
const dayDoc = (iso) => fixture(`cartographie-jour-${iso}.json`)
const ISOS = ['2026-01-05', '2026-01-06', '2026-01-07']

function fixtureAnswer(prompt) {
  const iso = /\((\d{4}-\d{2}-\d{2})\)/.exec(prompt)[1]
  const doc = dayDoc(iso)
  if (prompt.includes('SYNTHÈSE KAIROS')) return JSON.stringify(doc.kairos)
  const num = Number(/# Pôle (\d) — /.exec(prompt)[1])
  return JSON.stringify(doc.poles[num - 1])
}

describe('UC-APP-02 — narrative-prompts.js : en-tête daté des prompts d’extraction (étape 6)', () => {
  it('UC-APP-02-U37 — formatDateFr : les 8 prompts d’une journée (7 pôles + kairos) portent « # Feuille de portfolio du 07/01/2026 (2026-01-07) », une seule fois', async () => {
    expect(formatDateFr('2026-01-07')).toBe('07/01/2026')
    const provider = createMockProvider({ responses: ({ prompt }) => fixtureAnswer(prompt) })

    await extractDay({
      dayText: 'Vernissage : accueil du public, micro coupé, pluie.',
      date: '2026-01-07',
      referentiel: referentiel(),
      provider,
      model: 'mock-cartographe',
    })

    expect(provider.callCount).toBe(8)
    for (const { prompt } of provider.calls) {
      expect(prompt.split('# Feuille de portfolio du 07/01/2026 (2026-01-07)\n')).toHaveLength(2)
      expect(prompt).not.toContain('2026-07-01') // jamais d'inversion jour/mois
    }
  })
})

describe('UC-APP-02 — narrative-prompts.js : récits de fusion (étape 7, RG6, limite v1)', () => {
  it('UC-APP-02-U38 — buildNarrativePrompts sur la fusion des 3 journées : 69 prompts (= MERGE_NARRATIVE_CALLS de l’estimation), ordre compétences → pôles → kairos, contenus tirés des journées', () => {
    const ref = referentiel()
    const days = ISOS.map(dayDoc)
    const merged = mergeDays(days, ref)

    const prompts = buildNarrativePrompts(merged.agrege, { periode: merged.periode })

    // Autant de prompts que d'appels de fusion comptés par l'estimation (RG6).
    const estimate = estimateRun({ days: 3, avgDayChars: 3600, model: 'claude-sonnet-5' })
    expect(prompts).toHaveLength(MERGE_NARRATIVE_CALLS)
    expect(estimate.totalCalls - 3 * CALLS_PER_DAY).toBe(prompts.length)
    const codes = ref.competences.map((c) => c.code).sort()
    expect(prompts.map((p) => p.id)).toEqual([...codes, '1', '2', '3', '4', '5', '6', '7', 'kairos'])
    expect(prompts.map((p) => p.type)).toEqual([
      ...codes.map(() => 'competence'), ...Array(7).fill('pole'), 'kairos',
    ])
    expect(prompts[0].filename).toBe('competence_1.01.prompt.md')
    expect(prompts[61].filename).toBe('pole_1.prompt.md')
    expect(prompts[68].filename).toBe('kairos.prompt.md')
    for (const p of prompts) {
      expect(p.content).toContain('du **05/01/2026** au **07/01/2026**')
      expect(p.content.match(/^## Feuille du /gm)).toHaveLength(3)
      expect(p.content).not.toContain('{{N}}')
    }

    // Compétence 1.01 : court-circuit le 05/01, établie le 06/01 (trace verbatim), renvoi le 07/01.
    const c101 = prompts[0].content
    expect(c101).toContain('- Cumul : **1** preuves décisives, **0** indices ; confiance moyenne : **0.62** ; score cumulé : **1.00**')
    expect(c101).toContain(
      '## Feuille du 05/01/2026 (date ISO : 2026-01-05)\n\n- **Statut** : court-circuit (compétence non triée pour cette feuille)\n\n---\n',
    )
    // Trace retenue du 06/01 → pièce (pieceId = numero) → passage saillant (pid) : citation EXACTE du portfolio.
    const pole1 = days[1].poles[0]
    const comp = pole1.competences.find((c) => c.code === '1.01')
    const trace = comp.tracesRetenues[0]
    const piece = comp.pieces.find((p) => p.numero === trace.pieceId)
    const passage = pole1.passagesSaillants.find((p) => p.pid === piece.pid)
    expect(c101).toContain(`- **Traces retenues** :\n  - (${trace.role}) « ${passage.extraitVerbatim} »\n`)
    expect(c101).toContain('## Feuille du 07/01/2026 (date ISO : 2026-01-07)\n\n- **Statut** : renvoi au cartographe\n')
    // Moyennes à deux décimales (formatFixed2, jumeau du « %.2f » Python).
    const c201 = prompts.find((p) => p.id === '2.01').content
    expect(c201).toContain('confiance moyenne : **0.74** ; score cumulé : **6.97**')
    // Égalité EXACTE au demi (0.625 et 2.125 sont des doubles exacts) : arrondi
    // au demi PAIR comme « %.2f » — un simple toFixed(2) donnerait 0.63 et 2.13.
    const tie = structuredClone(merged.agrege)
    tie.par_competence['1.01'].confiance_moyenne = 0.625
    tie.par_competence['1.01'].score = 2.125
    const tied = buildNarrativePrompts(tie, { periode: merged.periode })[0].content
    expect(tied).toContain('confiance moyenne : **0.62** ; score cumulé : **2.12**')

    // Pôle 2 : les rapports du pôle de chaque journée, dans l'ordre ; pôle 1 sans rapport : blocs vides.
    const pole2 = prompts.find((p) => p.type === 'pole' && p.id === '2').content
    const reports = days.map((d) => d.poles[1].rapport.rapportCompletMarkdown.trim())
    const at = reports.map((r) => pole2.indexOf(r))
    expect(at.every((i) => i > 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(prompts[61].content.endsWith(
      '## Feuille du 07/01/2026 (date ISO : 2026-01-07)\n\n\n---\n',
    )).toBe(true)

    // Kairos : seule la journée du 07/01 porte une synthèse (kairos null les deux premiers jours).
    const kairos = prompts[68].content
    const synthese = days[2].kairos.kairos.apprenant.syntheseCompleteMarkdown.trim()
    expect(kairos).toContain(`## Feuille du 07/01/2026 (date ISO : 2026-01-07)\n\n${synthese}\n\n---\n`)
    expect(kairos).toContain('## Feuille du 05/01/2026 (date ISO : 2026-01-05)\n\n\n---\n')
    expect(kairos).toContain('- Dates ISO : `2026-01-05, 2026-01-06, 2026-01-07`')

    expect(() => buildNarrativePrompts(merged.agrege, {})).toThrow('buildNarrativePrompts: meta.periode is required')
  })
})
