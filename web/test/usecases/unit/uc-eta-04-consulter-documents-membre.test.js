// UC-ETA-04 — Consulter les documents produits pour un membre : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/etablissement/UC-ETA-04-consulter-documents-membre.md
//
// Code sollicité appelé directement : la route #/etablissement/membre/<id>,
// la normalisation de l'enveloppe {membre, documents} de l'API, le
// dédoublonnage des journées et la fusion CÔTÉ CLIENT par le moteur
// (mergeDays + buildMergeDocument + narratifs locaux, validée au schéma), le
// formatage des dates de journée (frDate, fuseau fixé par le test), la
// section MembreSection rendue isolément (coutures fetchFn, getReferentiel)
// et le chargement du référentiel publié avec repli embarqué.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { validateDocument } from '@engine/validation.js'
import { parseHash } from '../../../src/router.js'
import { resetApiClient } from '../../../src/api/client.js'
import { clearReferentielCache, loadPublishedReferentiel } from '../../../src/data/referentiel.js'
import { fetchMembreDocuments, frDate } from '../../../src/views/etablissement/etablissement-api.js'
import { buildMemberMerge, uniqueDayDocuments } from '../../../src/views/etablissement/membre-merge.js'
import MembreSection from '../../../src/views/etablissement/MembreSection.jsx'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { fakeFetch, jsonResponse } from '../support/eta.js'
import referentiel from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import day05 from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import day06 from '../../../../schemas/fixtures/cartographie-jour-2026-01-06.json'
import day07 from '../../../../schemas/fixtures/cartographie-jour-2026-01-07.json'

afterEach(() => {
  cleanup()
  resetApiClient()
  clearReferentielCache()
})

/** Exécute fn sous un fuseau horaire donné (process.env.TZ est relu par Node à chaque changement). */
function inTimeZone(tz, fn) {
  const saved = process.env.TZ
  process.env.TZ = tz
  try {
    return fn()
  } finally {
    if (saved === undefined) delete process.env.TZ
    else process.env.TZ = saved
  }
}

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

  it('UC-ETA-04-U05 — buildMemberMerge : document valide, provenance « membre-<id> », horodatage à la seconde ; échec expliqué ; liste vide → message dédié', () => {
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

describe('UC-ETA-04 — dates, section membre et référentiel', () => {
  it('UC-ETA-04-U06 — frDate : date-heure locale → jj/mm/aaaa, vide → « — », illisible telle quelle ; date seule décalée d’un jour en fuseau UTC− (comportement actuel)', () => {
    inTimeZone('America/Martinique', () => {
      expect(frDate('2026-07-02T10:00:00')).toBe('02/07/2026') // date-heure sans fuseau : heure locale
      expect(frDate('')).toBe('—')
      expect(frDate('pas une date')).toBe('pas une date')
    })
    // Date seule AAAA-MM-JJ = minuit UTC, affichée en heure locale : le libellé
    // « Journée jj/mm/aaaa » de la page membre dépend du fuseau (voir Anomalies).
    expect(inTimeZone('Europe/Paris', () => frDate('2026-01-06'))).toBe('06/01/2026')
    expect(inTimeZone('America/Martinique', () => frDate('2026-01-06'))).toBe('05/01/2026')
    expect(inTimeZone('Pacific/Tahiti', () => frDate('2026-01-06'))).toBe('05/01/2026')
  })

  it('UC-ETA-04-U07 — MembreSection isolée : 404 (message + texte E1), fusion impossible expliquée, référentiel nu accepté, consentement daté', async () => {
    const bareReferentiel = async () => referentiel // document nu (sans {doc})
    const section = (fetchFn) =>
      render(createElement(MembreSection, { userId: '12', lib: fakeLib, fetchFn, getReferentiel: bareReferentiel }))

    // (a) 404 : message du serveur et invitation à lancer un run.
    section(fakeFetch({ 'GET api/etablissement/membres/12/documents': jsonResponse(404, { error: 'Aucun document pour ce membre' }) }).fetchMock)
    expect((await screen.findByRole('alert')).textContent).toBe('Aucun document pour ce membre')
    expect(await screen.findByText(/Aucun document produit pour ce membre dans vos cohortes/)).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Documents du membre' })).toBeDefined()
    cleanup()

    // (b) une journée à un seul pôle : fusion impossible expliquée ;
    // (c) le référentiel nu fourni par getReferentiel suffit ; (d) consentement daté.
    section(
      fakeFetch({
        'GET api/etablissement/membres/12/documents': jsonResponse(200, {
          membre: { userId: 12, displayName: 'Maya', consentAt: '2026-07-02T10:00:00' },
          documents: [entry('2026-01-05', { ...day05, poles: day05.poles.slice(0, 1) })],
        }),
      }).fetchMock,
    )
    expect((await screen.findByTestId('etab-merge-erreur')).textContent).toMatch(/^La cartographie fusionnée n’a pas pu être construite/)
    expect(screen.getByRole('heading', { name: 'Documents de Maya' })).toBeDefined()
    expect(screen.getByTestId('etab-membre-consentement').textContent).toContain('(donné le 02/07/2026)')
    cleanup()

    // Fusion constructible avec le même référentiel nu → vue fusionnée.
    section(
      fakeFetch({
        'GET api/etablissement/membres/12/documents': jsonResponse(200, {
          membre: { userId: 12, displayName: 'Maya', consentAt: null },
          documents: [entry('2026-01-05', day05), entry('2026-01-06', day06), entry('2026-01-07', day07)],
        }),
      }).fetchMock,
    )
    await waitFor(() => expect(document.querySelector('.merge-view')).toBeTruthy())
    expect(screen.getByTestId('etab-membre-consentement').textContent).not.toContain('donné le')
  })

  it('UC-ETA-04-U08 — loadPublishedReferentiel : index publié → version publiée ; index absent → copie embarquée (jamais de rejet)', async () => {
    const published = { ...referentiel, version: '7.1.0' }
    const ok = vi.fn(async (url) => {
      if (url === 'data/referentiel/index.json') {
        return { ok: true, status: 200, json: async () => [{ referentielId: 'respire', semver: '7.1.0', fichier: 'respire-7.1.0.json' }] }
      }
      if (url === 'data/referentiel/respire-7.1.0.json') return { ok: true, status: 200, json: async () => published }
      return { ok: false, status: 404, json: async () => ({}) }
    })
    const loaded = await loadPublishedReferentiel({ fetchFn: ok })
    expect(loaded.origin).toBe('published')
    expect(loaded.doc.version).toBe('7.1.0')
    expect(ok.mock.calls.map(([url]) => url)).toEqual(['data/referentiel/index.json', 'data/referentiel/respire-7.1.0.json'])

    clearReferentielCache()
    const missing = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    const fallback = await loadPublishedReferentiel({ fetchFn: missing })
    expect(fallback.origin).toBe('bundled')
    expect(fallback.doc.poles).toHaveLength(7)
    expect(fallback.doc.competences).toHaveLength(61)
  })
})
