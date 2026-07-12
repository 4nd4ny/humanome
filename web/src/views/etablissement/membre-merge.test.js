// Merge côté client des documents jour d'un membre (décision M8) : la fusion
// des fixtures réelles produit un document cartographie-merge VALIDE au schéma,
// avec les résumés locaux (pattern run-launcher) — sans aucun appel LLM.
import { describe, expect, it } from 'vitest'
import { validateDocument } from '@engine/validation.js'
import { buildMemberMerge, uniqueDayDocuments } from './membre-merge.js'
import referentiel from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import day05 from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import day06 from '../../../../schemas/fixtures/cartographie-jour-2026-01-06.json'
import day07 from '../../../../schemas/fixtures/cartographie-jour-2026-01-07.json'

describe('uniqueDayDocuments', () => {
  it('déduplique par date (dernier reçu) et trie chronologiquement', () => {
    const rejoue = { ...day05, note: 'extraction rejouée' }
    const docs = uniqueDayDocuments([
      { date: '2026-01-07', document: day07 },
      { date: '2026-01-05', document: day05 },
      { date: '2026-01-05', document: rejoue },
      { date: '2026-01-06', document: day06 },
      { date: null, document: day06 }, // entrée invalide ignorée
    ])
    expect(docs.map((d) => d.date)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    expect(docs[0].note).toBe('extraction rejouée')
  })
})

describe('buildMemberMerge', () => {
  it('fusionne la fixture 3 jours en un document merge VALIDE au schéma', () => {
    const { document, error } = buildMemberMerge([day05, day06, day07], referentiel, {
      journalId: 'membre-1',
      now: () => '2026-07-12T10:00:00.000Z',
    })
    expect(error).toBeNull()
    expect(document).not.toBeNull()

    const { valid, errors } = validateDocument('cartographie-merge', document)
    expect(errors ?? []).toEqual([])
    expect(valid).toBe(true)

    // Période et provenance : merge déterministe calculé côté client.
    expect(document.periode.premiere).toBe('2026-01-05')
    expect(document.periode.derniere).toBe('2026-01-07')
    const json = JSON.stringify(document)
    expect(json).toContain('Résumé local') // narratifs locaux, pas de LLM
    expect(json).toContain('côté client')
  })

  it('fusion non constructible : erreur EXPLIQUÉE, jamais d’exception', () => {
    // Une seule journée creuse ne couvre pas les 7 pôles avec compétence
    // établie : buildMergeDocument échoue, l'erreur est restituée en français.
    const creux = {
      ...day05,
      poles: day05.poles.slice(0, 1),
    }
    const { document, error } = buildMemberMerge([creux], referentiel)
    expect(document).toBeNull()
    expect(error).toContain('7 pôles')
    expect(error).toContain('documents journaliers')
  })

  it('liste vide : message dédié', () => {
    const { document, error } = buildMemberMerge([], referentiel)
    expect(document).toBeNull()
    expect(error).toContain('Aucun document')
  })
})
