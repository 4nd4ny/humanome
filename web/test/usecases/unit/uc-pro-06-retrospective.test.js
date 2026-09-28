// UC-PRO-06 — Régénérer rétrospectivement des cartographies : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-06-retrospective.md
//
// Code sollicité appelé directement : comparaison original / régénération
// (compareRetroDocs), texte LOCAL de la journée (findLocalDayText), versions
// « plus récentes » du référentiel (newerReferentielVersions), client API de
// l'atelier, et la chaîne complète extractDay (vrai moteur, référentiel
// révisé) -> comparaison, avec un fournisseur factice rejouant les fixtures.
import { describe, expect, it, vi } from 'vitest'
import { extractDay } from '../../../../engine/src/pipeline/extract.js'
import { createMockProvider } from '../../../../engine/src/providers/mock.js'
import { createPromptologueApi } from '../../../src/views/promptologue/api.js'
import { compareRetroDocs, findLocalDayText, newerReferentielVersions } from '../../../src/views/promptologue/retro.js'
import referentielFixture from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import { DAY_DOCS, STATUT_RENVOI, clone, llmReplyFor, withStatuts } from '../support/banc.js'

const ETABLIE = 'présence établie'
const original = DAY_DOCS['2026-01-05']

/** Référentiel 7.1.0 : 61 compétences, 1.03 redéfinie (le schéma fixe leur nombre). */
function referentiel710() {
  const doc = clone(referentielFixture)
  doc.version = '7.1.0'
  doc.competences.find((c) => c.code === '1.03').nom = 'Synthèse intégrative (définition élargie)'
  return doc
}

describe('UC-PRO-06 — logique de la rétrospective (retro.js)', () => {
  it('UC-PRO-06-U05 — compareRetroDocs : compétence nouvellement établie, disparue (nouveau statut), stables', () => {
    const regenere = withStatuts(original, { '1.03': ETABLIE, '2.01': STATUT_RENVOI })
    const { nouvelles, disparues, stables } = compareRetroDocs(original, regenere)
    expect(nouvelles).toEqual([{ code: '1.03', statutApres: ETABLIE }])
    expect(disparues).toEqual([{ code: '2.01', statutAvant: ETABLIE, statutApres: STATUT_RENVOI }])
    expect(stables).toEqual(['3.04', '5.03', '7.01'])
  })

  it('UC-PRO-06-U06 — compareRetroDocs : compétence absente de la régénération = disparue (statut null) ; identiques = aucun changement', () => {
    const sans701 = clone(original)
    const pole7 = sans701.poles.find((p) => p.poleNum === '7')
    pole7.competences = pole7.competences.filter((c) => c.code !== '7.01')
    expect(compareRetroDocs(original, sans701).disparues).toEqual([
      { code: '7.01', statutAvant: ETABLIE, statutApres: null },
    ])
    expect(compareRetroDocs(original, clone(original))).toEqual({
      nouvelles: [],
      disparues: [],
      stables: ['2.01', '3.04', '5.03', '7.01'],
    })
  })

  it('UC-PRO-06-U07 — findLocalDayText : premier portfolio local portant la date, segments concaténés', () => {
    const portfolios = [
      { titre: 'Carnet A', segments: [{ date: '2026-01-06', texte: 'Autre jour.' }] },
      { titre: 'Journal de Maya', segments: [{ date: '2026-01-05', texte: 'Matin.' }, { date: '2026-01-05', texte: null }, { date: '2026-01-05', texte: 'Soir.' }] },
      { titre: 'Doublon', segments: [{ date: '2026-01-05', texte: 'Ignoré.' }] },
    ]
    expect(findLocalDayText(portfolios, '2026-01-05')).toEqual({ texte: 'Matin.\n\nSoir.', portfolioTitre: 'Journal de Maya' })
    expect(findLocalDayText([{ segments: [{ date: '2026-01-06', texte: 'x' }] }], '2026-01-06').portfolioTitre).toBe('Portfolio local')
    expect(findLocalDayText(portfolios, '2027-01-01')).toBeNull()
    expect(findLocalDayText(undefined, '2026-01-05')).toBeNull()
  })

  it('UC-PRO-06-U08 — newerReferentielVersions : strictement plus récentes (tri semver numérique) ; entrées {semver} de l’API écartées (AN-1)', () => {
    const front = [{ version: '7.0.0' }, { version: '7.10.0' }, { version: '7.2.0' }, { version: 'brouillon' }]
    expect(newerReferentielVersions(front, '7.2.0').map((v) => v.version)).toEqual(['7.10.0'])
    // Sans base (appel actuel de RetroSection) : toutes les versions (AN-2).
    expect(newerReferentielVersions(front, null).map((v) => v.version)).toEqual(['7.10.0', '7.2.0', '7.0.0'])
    // COMPORTEMENT ACTUEL figé : la forme réelle de GET referentiel/versions
    // ({semver, …}) ne porte pas de « version » -> rien n'est proposé.
    expect(newerReferentielVersions([{ semver: '7.1.0', label: 'RESPIRE v7.1.0' }], null)).toEqual([])
  })

  it('UC-PRO-06-U09 — client de l’atelier : cartographies serveur et référentiel par version', async () => {
    const apiFetchFn = vi.fn(async () => ({}))
    const api = createPromptologueApi(apiFetchFn)
    await api.listCartographies()
    await api.getCartography(3)
    await api.listReferentielVersions()
    await api.getReferentielVersion('7.1.0')
    expect(apiFetchFn.mock.calls.map(([path]) => path)).toEqual([
      'cartographies',
      'cartographies/3',
      'referentiel/versions',
      'referentiel/versions/7.1.0',
    ])
  })

  it('UC-PRO-06-U10 — chaîne complète : extractDay (référentiel 7.1.0, vrai moteur) puis comparaison → 1.03 nouvellement détectée', async () => {
    // Le LLM factice n'établit 1.03 que si le prompt porte la définition révisée.
    const provider = createMockProvider({
      responses: ({ prompt }) =>
        llmReplyFor(prompt, {
          mutate: prompt.includes('définition élargie') ? (doc) => withStatuts(doc, { '1.03': ETABLIE }) : undefined,
        }),
    })
    const regenere = await extractDay({
      dayText: 'Texte local de la journée du 5 janvier.',
      date: original.date,
      referentiel: referentiel710(),
      provider,
      model: 'demo',
      kairosOptional: true,
    })
    expect(provider.callCount).toBe(8)
    expect(compareRetroDocs(original, regenere)).toEqual({
      nouvelles: [{ code: '1.03', statutApres: ETABLIE }],
      disparues: [],
      stables: ['2.01', '3.04', '5.03', '7.01'],
    })
    // Avec l'ANCIEN référentiel, la même journée ne révèle rien de nouveau.
    const inchange = await extractDay({
      dayText: 'Texte local de la journée du 5 janvier.',
      date: original.date,
      referentiel: referentielFixture,
      provider,
      model: 'demo',
      kairosOptional: true,
    })
    expect(compareRetroDocs(original, inchange).nouvelles).toEqual([])
  })
})
