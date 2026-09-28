// UC-PRO-06 — Régénérer rétrospectivement des cartographies : tests UNITAIRES (moteur).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-06-retrospective.md
//
// Mécanisme moteur de la régénération : le prompt d'extraction instruit les
// compétences DU référentiel qu'on lui passe (une définition révisée atteint
// donc le LLM), et extractDay en mode kairosOptional dégrade un kairos en échec
// au lieu de perdre la régénération. Fixtures VERSIONNÉES uniquement
// (schemas/fixtures/) — ce fichier tourne dans la CI « Tests moteur ».
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildExtractionPrompt, extractDay } from '../../../src/pipeline/extract.js'
import { createMockProvider } from '../../../src/providers/mock.js'

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../../../../schemas/fixtures/${name}`, import.meta.url), 'utf8'))

const referentiel = fixture('referentiel-respire-v7.json')
const jour05 = fixture('cartographie-jour-2026-01-05.json')

function referentiel710() {
  const doc = structuredClone(referentiel)
  doc.version = '7.1.0'
  doc.competences.find((c) => c.code === '1.03').nom = 'Synthèse intégrative (définition élargie)'
  return doc
}

describe('UC-PRO-06 — régénération avec un référentiel plus récent', () => {
  it('UC-PRO-06-U11 — buildExtractionPrompt : la définition révisée (7.1.0) est celle que reçoit le LLM', () => {
    const args = { poleNum: 1, dayText: 'Texte de la journée.', date: '2026-01-05' }
    const nouveau = buildExtractionPrompt({ referentiel: referentiel710(), ...args })
    const ancien = buildExtractionPrompt({ referentiel, ...args })
    expect(nouveau).toContain('Synthèse intégrative (définition élargie)')
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
