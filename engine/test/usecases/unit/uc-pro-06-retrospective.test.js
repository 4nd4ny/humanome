// UC-PRO-06 — Régénérer rétrospectivement des cartographies : tests UNITAIRES (moteur).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-06-retrospective.md
//
// Mécanisme moteur de la régénération : le prompt d'extraction instruit les
// compétences DU référentiel qu'on lui passe — par leur code et leur NOM
// seulement : un nom révisé atteint le LLM, une définition (`description`)
// jamais (anomalie AN-3 de la fiche) —, et extractDay en mode kairosOptional
// dégrade un kairos en échec au lieu de perdre la régénération. Fixtures
// VERSIONNÉES uniquement (schemas/fixtures/) — ce fichier tourne dans la CI
// « Tests moteur ». createMockProvider est un double de test.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildExtractionPrompt, buildKairosExtractionPrompt, extractDay } from '../../../src/pipeline/extract.js'
import { createMockProvider } from '../../../src/providers/mock.js'

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../../../../schemas/fixtures/${name}`, import.meta.url), 'utf8'))

const referentiel = fixture('referentiel-respire-v7.json')
const jour05 = fixture('cartographie-jour-2026-01-05.json')

/** Version plus récente FICTIVE : le NOM de 1.03 est révisé (champ structurel). */
function referentiel710() {
  const doc = structuredClone(referentiel)
  doc.version = '7.1.0'
  doc.competences.find((c) => c.code === '1.03').nom = 'Synthèse intégrative (nom révisé)'
  return doc
}

/** Forme RÉELLE d'une version plus récente (7.1.0) : mêmes noms, définitions ajoutées. */
function referentielRedefini() {
  const doc = structuredClone(referentiel)
  doc.version = '7.1.0'
  for (const c of doc.competences) c.description = `DEFINITION-REVISEE ${c.code} : capacité observable…`
  return doc
}

describe('UC-PRO-06 — régénération avec un référentiel plus récent', () => {
  it('UC-PRO-06-U11 — buildExtractionPrompt : un NOM de compétence révisé (cas fictif) est celui que reçoit le LLM', () => {
    const args = { poleNum: 1, dayText: 'Texte de la journée.', date: '2026-01-05' }
    const nouveau = buildExtractionPrompt({ referentiel: referentiel710(), ...args })
    const ancien = buildExtractionPrompt({ referentiel, ...args })
    expect(nouveau).toContain('Synthèse intégrative (nom révisé)')
    expect(nouveau).not.toContain('Synthèse Intégrative')
    expect(ancien).toContain('Synthèse Intégrative')
    expect(nouveau).toContain('# Pôle 1 — ')
  })

  it('UC-PRO-06-U12 — extractDay (kairosOptional) : un kairos inexploitable dégrade la régénération (kairos null) sans la perdre', async () => {
    const provider = createMockProvider({
      responses: ({ prompt }) => {
        if (prompt.includes('SYNTHÈSE KAIROS')) return 'réponse inexploitable'
        const num = Number(/# Pôle (\d) — /.exec(prompt)[1])
        return JSON.stringify(jour05.poles[num - 1])
      },
    })
    const doc = await extractDay({
      dayText: 'Texte de la journée.',
      date: '2026-01-05',
      referentiel: referentiel710(),
      provider,
      model: 'demo',
      kairosOptional: true,
    })
    expect(doc.kind).toBe('cartographie-jour')
    expect(doc.kairos).toBeNull()
    expect(doc.poles).toHaveLength(7)
    expect(provider.callCount).toBe(9) // 7 pôles + kairos + 1 nouvel essai du kairos

    await expect(
      extractDay({ dayText: 'Texte.', date: '2026-01-05', referentiel: referentiel710(), provider, model: 'demo' }),
    ).rejects.toThrow(/kairos \(2026-01-05\)/)
  })
})

describe('UC-PRO-06 — anomalies constatées (comportement ACTUEL figé)', () => {
  it('UC-PRO-06-U13 — anomalie AN-3 : une redéfinition par `description` n’atteint pas le LLM — prompts pôle et kairos identiques octet pour octet', () => {
    // COMPORTEMENT ACTUEL, documenté comme anomalie (fiche, AN-3) : le bloc
    // référentiel des prompts ne porte que « code — nom ». La version réelle
    // 7.1.0 ne différant de 7.0.0 que par les définitions, une rétrospective
    // 7.0.0 → 7.1.0 envoie exactement les mêmes prompts.
    const args = { dayText: 'Texte de la journée.', date: '2026-01-05' }
    for (const poleNum of [1, 2, 3, 4, 5, 6, 7]) {
      const redefini = buildExtractionPrompt({ referentiel: referentielRedefini(), poleNum, ...args })
      expect(redefini).toBe(buildExtractionPrompt({ referentiel, poleNum, ...args }))
      expect(redefini).not.toContain('DEFINITION-REVISEE')
    }
    const kairos = buildKairosExtractionPrompt({ referentiel: referentielRedefini(), ...args })
    expect(kairos).toBe(buildKairosExtractionPrompt({ referentiel, ...args }))
    expect(kairos).not.toContain('DEFINITION-REVISEE')
  })
})
