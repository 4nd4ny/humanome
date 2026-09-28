// UC-ADM-05 — Superviser Twin9 : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/administration/UC-ADM-05-superviser-twin9.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>, #/admin/twin9) :
// la session est sondée par le shell et par AdminView (GET api/auth/me, qui
// sème le jeton CSRF), la section Twin9 parle au serveur par le fetch global.
// Seul le réseau est simulé.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { bodyOf, jsonResponse, meResponse, stubFetch } from '../support/twin.js'

const CONFIG = {
  marge: 1.2,
  marge_twin6: 1.1,
  twin9_cle_perso_ouverte: false,
  packs: [{ montant_usd: 10, libelle: 'Pack découverte — 10 $' }],
  modeles: {
    'claude-sonnet-5': { prix_usd_mtok: [3, 15], etages: ['taggers', 'rapide', 'tribunal'] },
  },
  enabled: true,
  appels_par_minute: 30,
  pipeline: {},
}
const COMPTES = {
  comptes: [
    { user_id: 7, email: 'lea@example.org', nom: 'Léa', solde_microusd: 4_500_000, recharges_microusd: 10_000_000, consomme_microusd: 5_500_000, derniere_activite: '2026-07-12 14:30:00' },
  ],
}

function routes(overrides = {}) {
  return {
    'GET auth/me': meResponse(['admin']),
    'GET twin9/admin/config': jsonResponse(200, CONFIG),
    'GET twin9/admin/comptes': jsonResponse(200, COMPTES),
    'PUT twin9/admin/config': (url, init) => jsonResponse(200, { ...CONFIG, ...JSON.parse(init.body) }),
    ...overrides,
  }
}

function openSupervision() {
  window.location.hash = '#/admin/twin9'
  render(<App lib={fakeLib} />)
}

async function enregistrer() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }))
  })
}

const putsConfig = (calls) => calls.filter((c) => c.key === 'PUT twin9/admin/config')

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-ADM-05 — l’administrateur supervise Twin9', () => {
  it('UC-ADM-05-F01 — nominal : réglages et comptes affichés, contribution modifiée → PUT partiel (CSRF) → confirmation', async () => {
    const { calls } = stubFetch(routes())
    openSupervision()

    expect(await screen.findByRole('heading', { name: 'Twin9 — supervision' })).toBeDefined()
    expect(screen.getByText(/L’édition des gabarits du Golden Prompt a déménagé/).querySelector('a').getAttribute('href')).toBe('#/twin9-atelier')
    expect(screen.getByLabelText(/Contribution Twin9/).value).toBe('1.2')
    expect(screen.getByLabelText(/Contribution Twin6/).value).toBe('1.1')
    const compte = screen.getByText('(lea@example.org)').closest('tr')
    expect(within(compte).getByText('4,50 $')).toBeDefined()

    fireEvent.change(screen.getByLabelText(/Contribution Twin9/), { target: { value: '1.35' } })
    await enregistrer()

    expect(await screen.findByText('Réglages Twin9 enregistrés.')).toBeDefined()
    const [put] = putsConfig(calls)
    expect(bodyOf(put)).toEqual({ marge: 1.35 })
    expect(put.init.headers['X-CSRF-Token']).toBe('csrf-twin-lot')
    expect(screen.getByLabelText(/Contribution Twin9/).value).toBe('1.35') // resynchronisé
  })

  it('UC-ADM-05-F02 — A1 : ouvrir la promotion « Twin9 gratuit avec sa propre clé »', async () => {
    const { calls } = stubFetch(routes())
    openSupervision()
    fireEvent.click(await screen.findByLabelText(/Promo : Twin9 gratuit avec la clé perso/))
    await enregistrer()
    expect(bodyOf(putsConfig(calls)[0])).toEqual({ twin9_cle_perso_ouverte: true })
  })

  it('UC-ADM-05-F03 — A2 : ajouter un pack de recharge (montant + libellé) ; anomalie figée : borne affichée 1 – 100', async () => {
    const { calls } = stubFetch(routes())
    openSupervision()
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter un pack' }))
    // ANOMALIE figée : le champ annonce « 1 – 100 » (max=100) alors que le
    // serveur accepte jusqu'à 500 USD et que les packs par défaut vont à 500.
    const montant = screen.getByLabelText('Montant (USD)', { selector: '#twin9-pack-montant-1' })
    expect(montant.getAttribute('max')).toBe('100')
    expect(montant.parentElement.textContent).toContain('1 – 100')
    fireEvent.change(screen.getByLabelText('Montant (USD)', { selector: '#twin9-pack-montant-1' }), { target: { value: '250' } })
    fireEvent.change(screen.getByLabelText('Libellé', { selector: '#twin9-pack-libelle-1' }), { target: { value: 'Pack cohorte — 250 $' } })
    await enregistrer()
    expect(bodyOf(putsConfig(calls)[0])).toEqual({
      packs: [
        { montant_usd: 10, libelle: 'Pack découverte — 10 $' },
        { montant_usd: 250, libelle: 'Pack cohorte — 250 $' },
      ],
    })
  })

  it('UC-ADM-05-F04 — A3 : restreindre l’offre de modèles (étage retiré, prix modifié)', async () => {
    const { calls } = stubFetch(routes())
    openSupervision()
    const modele = (await screen.findByDisplayValue('claude-sonnet-5')).closest('li')
    fireEvent.click(within(modele).getByRole('checkbox', { name: 'tribunal' }))
    fireEvent.change(within(modele).getByLabelText('Prix sortie (USD / Mtok)'), { target: { value: '12.5' } })
    await enregistrer()
    expect(bodyOf(putsConfig(calls)[0])).toEqual({
      modeles: { 'claude-sonnet-5': { prix_usd_mtok: [3, 12.5], etages: ['taggers', 'rapide'] } },
    })
  })

  it('UC-ADM-05-F05 — E1 : compte non administrateur (promptologue) → espace réservé, aucune donnée Twin9 demandée', async () => {
    const { calls } = stubFetch(routes({ 'GET auth/me': meResponse(['promptologue']) }))
    openSupervision()
    expect(await screen.findByTestId('admin-reserve')).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Twin9 — supervision' })).toBeNull()
    expect(calls.some((c) => c.key.startsWith('GET twin9/admin'))).toBe(false)
  })

  it('UC-ADM-05-F06 — E2 : valeur hors bornes refusée par le serveur (422) → message du serveur, formulaire intact', async () => {
    stubFetch(routes({ 'PUT twin9/admin/config': jsonResponse(422, { error: 'Marge hors bornes (entre 1 et 5)' }) }))
    openSupervision()
    fireEvent.change(await screen.findByLabelText(/Contribution Twin9/), { target: { value: '7' } })
    await enregistrer()
    expect((await screen.findByRole('alert')).textContent).toBe('Marge hors bornes (entre 1 et 5)')
    expect(screen.getByLabelText(/Contribution Twin9/).value).toBe('7')
  })

  it('UC-ADM-05-F07 — E3 : saisie invalide détectée dans le navigateur → message, aucun PUT', async () => {
    const { calls } = stubFetch(routes())
    openSupervision()
    const modele = (await screen.findByDisplayValue('claude-sonnet-5')).closest('li')
    fireEvent.change(within(modele).getByLabelText('Identifiant du modèle'), { target: { value: '  ' } })
    await enregistrer()
    expect(screen.getByRole('alert').textContent).toBe('Identifiant de modèle vide.')
    expect(putsConfig(calls)).toHaveLength(0)
  })

  it('UC-ADM-05-F08 — E4 : chargement impossible (erreur serveur) → message, pas de formulaire', async () => {
    stubFetch(routes({ 'GET twin9/admin/comptes': jsonResponse(500, { error: 'Erreur interne' }) }))
    openSupervision()
    expect((await screen.findByText('Chargement impossible.')).getAttribute('role')).toBe('alert')
    expect(screen.queryByRole('button', { name: 'Enregistrer les réglages' })).toBeNull()
  })
})
