// UC-ETA-04 — Consulter les documents produits pour un membre : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/etablissement/UC-ETA-04-consulter-documents-membre.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) : depuis la page de
// la cohorte, l'établissement ouvre « Documents » d'un membre, lit le rappel
// du consentement, la fusion chronologique CALCULÉE DANS LE NAVIGATEUR par le
// moteur (aucun appel LLM, aucun envoi au serveur) puis une journée. Seule
// l'API est simulée (enveloppe réelle {membre, documents}) ; le référentiel
// publié est absent du réseau simulé : la copie embarquée sert de repli,
// comme sur une copie statique ; le module sunburst est le faux module de test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { resetApiClient } from '../../../src/api/client.js'
import {
  cohorteDetail,
  configProjection,
  jsonResponse,
  LEARNER_USER,
  openApp,
  PUBLISHED_PACKAGES,
  stubApi,
} from '../support/eta.js'
import day05 from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import day06 from '../../../../schemas/fixtures/cartographie-jour-2026-01-06.json'
import day07 from '../../../../schemas/fixtures/cartographie-jour-2026-01-07.json'

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

function entry(date, document, extra = {}) {
  return {
    jobId: 100,
    runId: 42,
    cohorteId: 7,
    cohorte: 'BTS SIO 2026',
    date,
    promptPackage: { id: 'aurora-v3-reconstruit', version: '1.0.0' },
    referentiel: { id: 'respire', version: '7.0.0' },
    document,
    ...extra,
  }
}

const ENVELOPE = {
  membre: { userId: 12, displayName: 'Maya', consentAt: '2026-07-02T10:00:00' },
  documents: [entry('2026-01-05', day05), entry('2026-01-06', day06, { jobId: 101 }), entry('2026-01-07', day07, { jobId: 102 })],
}

function documentsApi(answer) {
  return stubApi({
    'GET api/etablissement/cohortes/7': jsonResponse(200, cohorteDetail()),
    'GET api/etablissement/config': jsonResponse(200, configProjection()),
    'GET api/prompt-packages': jsonResponse(200, PUBLISHED_PACKAGES),
    'GET api/etablissement/membres/12/documents': answer,
  })
}

describe('UC-ETA-04 — l’établissement lit les cartographies d’un membre', () => {
  it('UC-ETA-04-F07 — nominal : depuis la cohorte, « Documents » → consentement rappelé, fusion calculée localement', async () => {
    const api = documentsApi(jsonResponse(200, ENVELOPE))
    openApp('#/etablissement/cohorte/7')

    // 1. Lien « Documents » du membre dans le tableau de la cohorte.
    const link = (await screen.findAllByRole('link', { name: 'Documents' }))[0]
    expect(link.getAttribute('href')).toBe('#/etablissement/membre/12')
    await act(async () => {
      window.location.hash = link.getAttribute('href')
    })

    // 2-4. Rappel du cadre consenti, puis vue fusionnée par défaut.
    expect(await screen.findByRole('heading', { name: 'Documents de Maya' })).toBeDefined()
    const consent = screen.getByTestId('etab-membre-consentement')
    expect(consent.textContent).toContain('consentement explicite (donné le 02/07/2026)')
    expect(consent.textContent).toContain('calculée dans votre navigateur')
    const merged = await screen.findByRole('button', { name: 'Vue fusionnée (3 journée(s))' })
    expect(merged.disabled).toBe(true)
    await waitFor(() => expect(document.querySelector('.merge-view')).toBeTruthy())
    expect(screen.queryByTestId('etab-merge-erreur')).toBeNull()

    // La fusion n'a rien envoyé : seules des lectures ont eu lieu.
    expect(api.calls.filter((c) => c.method !== 'GET')).toEqual([])
    expect(api.callsTo('GET api/etablissement/membres/12/documents')).toHaveLength(1)
  })

  it('UC-ETA-04-F08 — A1 : bascule sur une journée (DayView) puis retour à la vue fusionnée, sans nouvel appel', async () => {
    const api = documentsApi(jsonResponse(200, ENVELOPE))
    openApp('#/etablissement/membre/12')

    fireEvent.click(await screen.findByRole('button', { name: 'Journée 06/01/2026' }))
    await waitFor(() => expect(document.querySelector('.day-view')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Journée 06/01/2026' }).disabled).toBe(true)
    expect(document.querySelector('.merge-view')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Vue fusionnée (3 journée(s))' }))
    await waitFor(() => expect(document.querySelector('.merge-view')).toBeTruthy())
    expect(api.callsTo('GET api/etablissement/membres/12/documents')).toHaveLength(1)
  })

  it('UC-ETA-04-F09 — A2 : fusion non constructible → explication, journées consultables une à une', async () => {
    documentsApi(
      jsonResponse(200, {
        membre: ENVELOPE.membre,
        documents: [entry('2026-01-05', { ...day05, poles: day05.poles.slice(0, 1) })],
      }),
    )
    openApp('#/etablissement/membre/12')

    const error = await screen.findByTestId('etab-merge-erreur')
    expect(error.textContent).toContain('au moins une compétence établie dans chacun des 7 pôles')
    expect(error.textContent).toContain('Les documents journaliers restent consultables individuellement')
    expect(screen.getByRole('button', { name: 'Journée 05/01/2026' }).disabled).toBe(false)
  })

  it('UC-ETA-04-F10 — A3 : journée produite par deux runs → une seule journée affichée (la plus récente)', async () => {
    documentsApi(
      jsonResponse(200, {
        membre: ENVELOPE.membre,
        documents: [...ENVELOPE.documents, entry('2026-01-06', day06, { jobId: 200, runId: 43 })],
      }),
    )
    openApp('#/etablissement/membre/12')

    expect(await screen.findByRole('button', { name: 'Vue fusionnée (3 journée(s))' })).toBeDefined()
    expect(screen.getAllByRole('button', { name: /^Journée / })).toHaveLength(3)
  })

  it('UC-ETA-04-F11 — E1 : 404 homogène (inconnu, étranger, parti, rien de produit) → message, aucune vue', async () => {
    documentsApi(jsonResponse(404, { error: 'Aucun document pour ce membre' }))
    openApp('#/etablissement/membre/12')

    expect((await screen.findByRole('alert')).textContent).toBe('Aucun document pour ce membre')
    expect(await screen.findByText(/Aucun document produit pour ce membre dans vos cohortes/)).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Documents du membre' })).toBeDefined()
    expect(screen.queryByRole('navigation', { name: 'Vues du membre' })).toBeNull()
    expect(document.querySelector('.merge-view')).toBeNull()
  })

  it('UC-ETA-04-F12 — E2 : compte sans rôle établissement → espace réservé, documents jamais demandés', async () => {
    const api = stubApi({}, { user: LEARNER_USER })
    openApp('#/etablissement/membre/12', { user: LEARNER_USER })

    await screen.findByTestId('etab-reserve')
    expect(api.callsTo('GET api/etablissement/membres/12/documents')).toHaveLength(0)
  })
})
