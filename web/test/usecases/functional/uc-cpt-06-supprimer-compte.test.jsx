// UC-CPT-06 — Supprimer son compte (droit à l'effacement) : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/compte/UC-CPT-06-supprimer-compte.md
//
// Scénarios joués sur l'application ENTIÈRE (<App/>) : l'utilisateur connecté
// ouvre #/compte, confirme en saisissant son email dans la « Zone de danger »
// et supprime son compte ; la navigation redevient celle d'un visiteur. Le
// réseau est le faux serveur du lot (web/test/usecases/support/cpt.js).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { createCartoStore } from '../../../src/lib/carto-store.js'
import { createPortfolioStore } from '../../../src/lib/portfolio-store.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { clearLocalStorage, installFakeAccountApi, jsonResponse } from '../support/cpt.js'
// IndexedDB factice en mémoire (outil du lot « apprenant », réutilisé tel quel).
import { createFakeIndexedDb } from '../support/appl-fake-indexeddb.js'

const idb = createFakeIndexedDb() // un seul faux par fichier (cf. support)

const ADA = {
  id: 7,
  email: 'ada@example.org',
  password: 'correct horse battery',
  displayName: 'Ada',
  roles: ['apprenant', 'cartographe'],
  keys: { anthropic: 'sk-ant-serveur' },
  training: { apprenant: ['01-pourquoi-un-portfolio-reflexif'] },
}

async function openDangerZone() {
  const api = installFakeAccountApi({ users: [ADA], loggedInAs: ADA.email })
  window.location.hash = '#/compte'
  render(<App lib={fakeLib} />)
  const zone = within(await screen.findByRole('region', { name: 'Zone de danger' }))
  return { api, zone }
}

const nav = () => within(screen.getByRole('navigation', { name: 'Navigation principale' }))

async function confirmAndDelete(zone, typed = ADA.email) {
  fireEvent.change(zone.getByLabelText(/Pour confirmer, saisissez votre email/), { target: { value: typed } })
  await act(async () => {
    fireEvent.click(zone.getByRole('button', { name: 'Supprimer mon compte' }))
  })
}

beforeEach(() => {
  resetApiClient()
  clearLocalStorage()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
  clearLocalStorage()
})

describe('UC-CPT-06 — l’utilisateur supprime son compte', () => {
  it('UC-CPT-06-F06 — nominal : confirmation par l’email → DELETE (CSRF) → message RGPD, formulaire de connexion, navigation visiteur', async () => {
    const { api, zone } = await openDangerZone()
    expect(await nav().findByRole('link', { name: 'Ma file de relecture' })).toBeDefined()
    expect(zone.getByText(/immédiate et définitive/)).toBeDefined()
    const button = zone.getByRole('button', { name: 'Supprimer mon compte' })
    expect(button.disabled).toBe(true)

    fireEvent.change(zone.getByLabelText(/Pour confirmer/), { target: { value: 'ada@example.com' } })
    expect(button.disabled).toBe(true)
    const token = api.session.csrf
    await confirmAndDelete(zone)

    expect(
      await screen.findByText(/Votre compte a été supprimé : toutes vos données serveur ont été réellement purgées/),
    ).toBeDefined()
    const [del] = api.callsTo('auth/account', 'DELETE')
    expect(del.headers['X-CSRF-Token']).toBe(token)
    expect(api.users.has(ADA.email)).toBe(false)
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeDefined()
    expect(await nav().findByRole('link', { name: 'Se connecter' })).toBeDefined()
    expect(nav().queryByRole('link', { name: 'Ma file de relecture' })).toBeNull()
  })

  it('UC-CPT-06-F07 — A1 : les données LOCALES du navigateur (localStorage, portfolios et cartographies IndexedDB) ne sont pas concernées', async () => {
    idb.reset()
    vi.stubGlobal('indexedDB', idb.factory)
    await createPortfolioStore().create({
      titre: 'Journal local',
      texte: 'Une journée.',
      segments: [{ date: '2026-01-05', texte: 'Une journée.', debut: 0, fin: 12 }],
    })
    await createCartoStore().saveCartography({ type: 'jour', titre: 'Journée locale', document: { kind: 'cartographie-jour', date: '2026-01-05', poles: [] } })
    localStorage.setItem('humanome-keys', JSON.stringify({ openai: 'sk-openai-locale' }))
    localStorage.setItem('humanome-training', JSON.stringify({ apprenant: { chapitresTermines: ['02-ecrire-des-traces-exploitables'] } }))
    const { zone } = await openDangerZone()
    expect(zone.getByText(/Vos fichiers locaux \(cartographies exportées\)\s+ne sont\s+pas concernés/)).toBeDefined()

    await confirmAndDelete(zone)
    await screen.findByText(/Votre compte a été supprimé/)

    expect(JSON.parse(localStorage.getItem('humanome-keys'))).toEqual({ openai: 'sk-openai-locale' })
    expect(localStorage.getItem('humanome-training')).not.toBeNull()
    expect((await createPortfolioStore().list()).map((p) => p.titre)).toEqual(['Journal local'])
    expect((await createCartoStore().listCartographies()).map((c) => c.titre)).toEqual(['Journée locale'])
  })

  it('UC-CPT-06-F08 — E2/E1 : suppression refusée (403 CSRF, 401 session expirée) → message, le profil reste affiché', async () => {
    const { api, zone } = await openDangerZone()
    api.failNext('DELETE auth/account', jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' }))
    await confirmAndDelete(zone)

    expect((await screen.findByRole('alert')).textContent).toBe('Jeton CSRF absent ou invalide')
    expect(screen.getByRole('region', { name: 'Profil' })).toBeDefined()
    expect(api.users.has(ADA.email)).toBe(true)

    api.failNext('DELETE auth/account', jsonResponse(401, { error: 'Authentification requise' }))
    await act(async () => {
      fireEvent.click(zone.getByRole('button', { name: 'Supprimer mon compte' }))
    })
    expect((await screen.findByRole('alert')).textContent).toBe('Authentification requise')
    expect(screen.getByRole('region', { name: 'Profil' })).toBeDefined()
    expect(api.users.has(ADA.email)).toBe(true)
  })
})
