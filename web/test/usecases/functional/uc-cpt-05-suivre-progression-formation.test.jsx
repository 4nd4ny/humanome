// UC-CPT-05 — Suivre sa progression de formation : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/compte/UC-CPT-05-suivre-progression-formation.md
//
// Scénarios joués sur l'application ENTIÈRE (<App/>) : #/espace/formation,
// une page de chapitre, le hub public #/guides/<parcours>. Le VRAI store de
// progression est utilisé (localStorage jsdom + client API) ; le réseau est
// le faux serveur du lot (web/test/usecases/support/cpt.js), qui rejoue le
// contrat de GET/PUT /api/training/progress.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { clearLocalStorage, installFakeAccountApi, jsonResponse } from '../support/cpt.js'

const ADA = { id: 7, email: 'ada@example.org', password: 'correct horse battery', displayName: 'Ada' }
const CH1 = '01-pourquoi-un-portfolio-reflexif'
const CH2 = '02-ecrire-des-traces-exploitables'
const CH5 = '05-relire-sa-cartographie'

function openApp(hash) {
  window.location.hash = hash
  render(<App lib={fakeLib} />)
}

const progress = () => screen.getByTestId('formation-progress').textContent

async function toggle(label) {
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox', { name: label }))
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

describe('UC-CPT-05 — l’utilisateur suit sa formation', () => {
  it('UC-CPT-05-F06 — nominal : connecté, cocher un chapitre → PUT (CSRF) et compteur « synchronisée avec votre compte »', async () => {
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: ADA.email })
    openApp('#/espace/formation')

    await waitFor(() => expect(progress()).toBe('Progression : 0 / 7 chapitres terminés (0 %) — synchronisée avec votre compte'))
    expect(screen.getByRole('heading', { name: 'Formation apprenant — mode expert' })).toBeDefined()
    expect(screen.getAllByRole('checkbox')).toHaveLength(7)

    await toggle('Chapitre terminé : Pourquoi un portfolio réflexif')

    await waitFor(() => expect(progress()).toContain('1 / 7 chapitres terminés (14 %)'))
    const [put] = api.callsTo('training/progress', 'PUT')
    expect(put.body).toEqual({ parcours: 'apprenant', chapitre: CH1, completed: true })
    expect(put.headers['X-CSRF-Token']).toBe(api.session.csrf)
    expect(localStorage.getItem('humanome-training')).toBeNull() // le serveur fait foi
  })

  it('UC-CPT-05-F07 — A1 : sans compte, la progression reste dans ce navigateur (localStorage), aucune requête', async () => {
    const api = installFakeAccountApi()
    openApp('#/espace/formation')
    await screen.findByTestId('espace-anonyme')
    expect(screen.getByText(/Sans compte, la progression reste dans ce navigateur/)).toBeDefined()

    await toggle('Chapitre terminé : Écrire des traces exploitables')

    expect(progress()).toBe('Progression : 1 / 7 chapitres terminés (14 %)')
    expect(JSON.parse(localStorage.getItem('humanome-training'))).toEqual({ apprenant: { chapitresTermines: [CH2] } })
    expect(api.callsTo('training/progress')).toHaveLength(0)
  })

  it('UC-CPT-05-F08 — A2 : à la connexion, la progression locale est migrée (un PUT par chapitre) puis effacée du navigateur', async () => {
    localStorage.setItem('humanome-training', JSON.stringify({ apprenant: { chapitresTermines: [CH1, CH2] } }))
    const api = installFakeAccountApi({ users: [{ ...ADA, training: { apprenant: [CH5] } }], loggedInAs: ADA.email })
    openApp('#/espace/formation')

    await waitFor(() => expect(progress()).toBe('Progression : 3 / 7 chapitres terminés (43 %) — synchronisée avec votre compte'))
    expect(api.callsTo('training/progress', 'PUT').map((c) => c.body)).toEqual([
      { parcours: 'apprenant', chapitre: CH1, completed: true },
      { parcours: 'apprenant', chapitre: CH2, completed: true },
    ])
    expect(localStorage.getItem('humanome-training')).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Chapitre terminé : Relire sa cartographie et travailler avec son cartographe' }).checked).toBe(true)
  })

  it('UC-CPT-05-F09 — A3 : décocher un chapitre → PUT completed:false, compteur décrémenté', async () => {
    const api = installFakeAccountApi({ users: [{ ...ADA, training: { apprenant: [CH1] } }], loggedInAs: ADA.email })
    openApp('#/espace/formation')
    await waitFor(() => expect(progress()).toContain('1 / 7'))

    await toggle('Chapitre terminé : Pourquoi un portfolio réflexif')

    await waitFor(() => expect(progress()).toContain('0 / 7'))
    expect(api.callsTo('training/progress', 'PUT')[0].body).toEqual({ parcours: 'apprenant', chapitre: CH1, completed: false })
  })

  it('UC-CPT-05-F10 — A4 : page d’un chapitre → contenu rendu, liens internes réécrits, case « Chapitre terminé »', async () => {
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: ADA.email })
    openApp(`#/espace/formation/${CH1}`)

    const article = await screen.findByTestId('formation-chapitre')
    expect(article.querySelector('h1').textContent).toBe('Pourquoi un portfolio réflexif')
    expect(article.querySelector(`a[href="#/espace/formation/${CH2}"]`)).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Écrire des traces exploitables →' }).getAttribute('href')).toBe(`#/espace/formation/${CH2}`)
    await screen.findByTestId('espace-connecte')

    await toggle('Chapitre terminé')

    await waitFor(() => expect(api.callsTo('training/progress', 'PUT')).toHaveLength(1))
    expect(api.callsTo('training/progress', 'PUT')[0].body.chapitre).toBe(CH1)
    expect(screen.getByRole('checkbox', { name: 'Chapitre terminé' }).checked).toBe(true)
  })

  it('UC-CPT-05-F11 — A5 : connecté mais API de progression en panne → repli sur la progression locale, sans mention de synchronisation', async () => {
    localStorage.setItem('humanome-training', JSON.stringify({ apprenant: { chapitresTermines: [CH2] } }))
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: ADA.email })
    api.override('PUT training/progress', () => jsonResponse(500, { error: 'Erreur interne' }))
    openApp('#/espace/formation')
    await screen.findByTestId('espace-connecte')

    await waitFor(() => expect(api.callsTo('training/progress', 'PUT').length).toBeGreaterThan(0))
    await waitFor(() => expect(progress()).toBe('Progression : 1 / 7 chapitres terminés (14 %)'))
    expect(localStorage.getItem('humanome-training')).not.toBeNull() // conservée tant que la migration échoue
  })

  it('UC-CPT-05-F12 — A6 : hub public #/guides/<parcours> — la progression d’un autre parcours est rattachée au compte', async () => {
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: ADA.email })
    openApp('#/guides/cartographe')
    await waitFor(() => expect(progress()).toContain('— synchronisée avec votre compte'))

    await toggle('Chapitre terminé : Le rôle du cartographe')

    await waitFor(() => expect(api.callsTo('training/progress', 'PUT')).toHaveLength(1))
    expect(api.callsTo('training/progress', 'PUT')[0].body).toEqual({
      parcours: 'cartographe',
      chapitre: '01-le-role-du-cartographe',
      completed: true,
    })
    expect(screen.getByRole('link', { name: 'Le rôle du cartographe' }).getAttribute('href')).toBe(
      '#/guides/cartographe/01-le-role-du-cartographe',
    )
  })

  it('UC-CPT-05-F13 — E1 : enregistrement refusé → case rétablie et message d’erreur', async () => {
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: ADA.email })
    openApp('#/espace/formation')
    await waitFor(() => expect(progress()).toContain('synchronisée'))
    api.failNext('PUT training/progress', jsonResponse(500, { error: 'Erreur interne' }))

    await toggle('Chapitre terminé : Pourquoi un portfolio réflexif')

    expect((await screen.findByRole('alert')).textContent).toBe('Erreur interne')
    expect(screen.getByRole('checkbox', { name: 'Chapitre terminé : Pourquoi un portfolio réflexif' }).checked).toBe(false)
    expect(progress()).toContain('0 / 7')
  })

  it('UC-CPT-05-F14 — E2 : chapitre inconnu → message et lien de retour vers la liste', async () => {
    installFakeAccountApi()
    openApp('#/espace/formation/99-inconnu')

    expect((await screen.findByRole('alert')).textContent).toBe('Chapitre introuvable : « 99-inconnu ».')
    expect(screen.getByRole('link', { name: 'Retour à la liste des chapitres' }).getAttribute('href')).toBe('#/espace/formation')
  })
})
