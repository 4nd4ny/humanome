// UC-ETA-04 — Consulter les documents produits pour un membre : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/etablissement/UC-ETA-04-consulter-documents-membre.md
//
// Code sollicité appelé directement : la route #/etablissement/membre/<id>,
// la normalisation de l'enveloppe {membre, documents} de l'API, le
// dédoublonnage des journées et la fusion CÔTÉ CLIENT par le moteur
// (mergeDays + buildMergeDocument + narratifs locaux, validée au schéma).
import { describe, expect, it, vi } from 'vitest'
import { validateDocument } from '@engine/validation.js'
import { parseHash } from '../../../src/router.js'
import { fetchMembreDocuments } from '../../../src/views/etablissement/etablissement-api.js'
import { buildMemberMerge, uniqueDayDocuments } from '../../../src/views/etablissement/membre-merge.js'
import { jsonResponse } from '../support/eta.js'
import referentiel from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import day05 from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import day06 from '../../../../schemas/fixtures/cartographie-jour-2026-01-06.json'
import day07 from '../../../../schemas/fixtures/cartographie-jour-2026-01-07.json'

/** Entrée de document telle que servie par l'API (routes/etablissement.php). */
function entry(date, document, overrides = {}) {
  return {
    jobId: 100,
    runId: 42,
    cohorteId: 7,
    cohorte: 'BTS SIO 2026',
    date,
    promptPackage: { id: 'aurora-v3-reconstruit', version: '1.0.0' },
    referentiel: { id: 'respire', version: '7.0.0' },
    document,
    ...overrides,
  }
}

describe('UC-ETA-04 — route et appel API', () => {
  it('UC-ETA-04-U01 — #/etablissement/membre/<id> ouvre la section membre de l’espace établissement', () => {
    expect(parseHash('#/etablissement/membre/12')).toEqual({ name: 'etablissement', section: 'membre/12' })
  })

  it('UC-ETA-04-U02 — fetchMembreDocuments normalise l’enveloppe réelle {membre, documents}', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        membre: { userId: 12, displayName: 'Maya', consentAt: '2026-07-02T10:00:00' },
        documents: [entry('2026-01-05', day05), entry('2026-01-06', day06, { jobId: 101 })],
      }),
    )

    const data = await fetchMembreDocuments(12, fetchFn)

    expect(fetchFn.mock.calls[0][0]).toBe('api/etablissement/membres/12/documents')
    expect(data.membre).toEqual({ userId: 12, displayName: 'Maya', consentAt: '2026-07-02T10:00:00' })
    expect(data.documents).toEqual([
      { date: '2026-01-05', cohorte: 'BTS SIO 2026', document: day05 },
      { date: '2026-01-06', cohorte: 'BTS SIO 2026', document: day06 },
    ])
  })

  it('UC-ETA-04-U03 — fetchMembreDocuments : replis (membre absent, date lue dans le document) et entrées inexploitables écartées', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        documents: [
          { cohorte: { nom: 'Option théâtre' }, document: day07 }, // date prise dans le document
          entry('2026-01-05', null), // pas de document
          { document: { kind: 'cartographie-jour' } }, // aucune date
        ],
      }),
    )

    const data = await fetchMembreDocuments(12, fetchFn)

    expect(data.membre).toEqual({ userId: 12, displayName: 'membre 12', consentAt: null })
    expect(data.documents).toEqual([{ date: '2026-01-07', cohorte: 'Option théâtre', document: day07 }])
  })
})

describe('UC-ETA-04 — fusion côté client', () => {
  it('UC-ETA-04-U04 — uniqueDayDocuments : une journée par date (la dernière reçue gagne), ordre chronologique', () => {
    const rejoue = { ...day05, note: 'second run' }
    const docs = uniqueDayDocuments([
      { date: '2026-01-07', document: day07 },
      { date: '2026-01-05', document: day05 },
      { date: '2026-01-06', document: day06 },
      { date: '2026-01-05', document: rejoue },
      { date: '2026-01-08', document: null },
    ])
    expect(docs.map((d) => d.date)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    expect(docs[0].note).toBe('second run')
    expect(uniqueDayDocuments(null)).toEqual([])
  })

  it('UC-ETA-04-U05 — buildMemberMerge : document valide, provenance « membre-<id> », horodatage à la seconde ; échec expliqué', () => {
    const { document, error } = buildMemberMerge([day05, day06, day07], referentiel, {
      journalId: 'membre-12',
      now: () => '2026-07-12T10:00:00.987Z',
    })

    expect(error).toBeNull()
    expect(validateDocument('cartographie-merge', document).valid).toBe(true)
    expect(document.generatedAt).toBe('2026-07-12T10:00:00')
    expect(document.source.journalId).toBe('membre-12')
    expect(document.source.protocole).toBe('Extraction de masse M8 — merge déterministe calculé côté client (moteur JS)')
    expect(document.periode).toEqual({ premiere: '2026-01-05', derniere: '2026-01-07', nbFeuilles: 3 })

    const failed = buildMemberMerge([{ ...day05, poles: day05.poles.slice(0, 1) }], referentiel)
    expect(failed.document).toBeNull()
    expect(failed.error).toMatch(/^La cartographie fusionnée n’a pas pu être construite/)
    expect(failed.error).toContain('Détail technique :')

    expect(buildMemberMerge([], referentiel)).toEqual({ document: null, error: 'Aucun document jour à fusionner.' })
  })
})
