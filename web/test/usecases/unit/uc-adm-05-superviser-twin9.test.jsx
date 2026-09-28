// UC-ADM-05 — Superviser Twin9 : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/administration/UC-ADM-05-superviser-twin9.md
//
// Code sollicité appelé directement : la route #/admin/twin9 et son entrée de
// navigation (admin seul), le client de supervision (web/src/api/twin9.js) et
// le composant Twin9Section rendu isolément (construction du DIFF envoyé au
// serveur, validation cliente, table des comptes).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { parseHash } from '../../../src/router.js'
import { navGroups } from '../../../src/nav.js'
import { fetchMe, resetApiClient } from '../../../src/api/client.js'
import { fetchComptes, fetchTwin9Config, saveTwin9Config } from '../../../src/api/twin9.js'
import Twin9Section from '../../../src/views/admin/Twin9Section.jsx'
import { jsonResponse } from '../support/twin.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

/** Config telle que le serveur la renvoie AVANT tout enregistrement (défauts PHP). */
const CONFIG = {
  marge: 1.2,
  marge_twin6: 1.1,
  twin9_cle_perso_ouverte: false,
  packs: [
    { montant_usd: 10, libelle: 'Pack découverte — 10 $' },
    { montant_usd: 20, libelle: 'Pack standard — 20 $' },
  ],
  modeles: {
    'claude-haiku-4-5-20251001': { prix_usd_mtok: [1, 5], etages: ['taggers', 'rapide'] },
  },
  enabled: true,
  appels_par_minute: 30,
  pipeline: {},
}

function monter(config = CONFIG, comptes = []) {
  const fetchFn = vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    if (key === 'GET api/twin9/admin/config') return jsonResponse(200, config)
    if (key === 'GET api/twin9/admin/comptes') return jsonResponse(200, { comptes })
    if (key === 'PUT api/twin9/admin/config') return jsonResponse(200, { ...config, ...JSON.parse(init.body) })
    return jsonResponse(404, { error: 'absent' })
  })
  render(<Twin9Section fetchFn={fetchFn} />)
  return fetchFn
}

const puts = (fetchFn) => fetchFn.mock.calls.filter(([, init]) => init?.method === 'PUT').map(([, init]) => JSON.parse(init.body))

async function enregistrer() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }))
  })
}

describe('UC-ADM-05 — accès à la supervision', () => {
  it('UC-ADM-05-U01 — #/admin/twin9 ; entrée « Supervision Twin9 » réservée aux administrateurs', () => {
    expect(parseHash('#/admin/twin9')).toEqual({ name: 'admin', section: 'twin9' })
    const hrefs = (roles) => navGroups({ roles }).flatMap((g) => g.items.map((i) => i.href))
    expect(hrefs(['admin'])).toContain('#/admin/twin9')
    expect(hrefs(['promptologue'])).not.toContain('#/admin/twin9')
    expect(hrefs(['apprenant', 'etablissement'])).not.toContain('#/admin/twin9')
  })

  it('UC-ADM-05-U02 — client : lecture de la config et des comptes en GET, mise à jour PARTIELLE en PUT avec CSRF', async () => {
    const fetchFn = vi.fn(async (url) =>
      url === 'api/auth/me' ? jsonResponse(200, { user: { id: 1 }, csrfToken: 'csrf-uc-adm-05' }) : jsonResponse(200, {}),
    )
    await fetchMe({ fetchFn })
    await fetchTwin9Config({ fetchFn })
    await saveTwin9Config({ twin9_cle_perso_ouverte: true }, { fetchFn })
    await fetchComptes({ fetchFn })
    expect(fetchFn.mock.calls.slice(1).map(([url, init]) => [init.method, url, init.body, init.headers['X-CSRF-Token']])).toEqual([
      ['GET', 'api/twin9/admin/config', undefined, undefined],
      ['PUT', 'api/twin9/admin/config', '{"twin9_cle_perso_ouverte":true}', 'csrf-uc-adm-05'],
      ['GET', 'api/twin9/admin/comptes', undefined, undefined],
    ])
  })
})

describe('UC-ADM-05 — réglages : diff envoyé au serveur (Twin9Section isolée)', () => {
  it('UC-ADM-05-U03 — rien de modifié → aucun PUT ; contribution passée à 1.5 → {marge: 1.5} seul', async () => {
    const fetchFn = monter()
    await screen.findByRole('heading', { name: 'Réglages' })
    await enregistrer()
    expect(screen.getByText('Aucune modification à enregistrer.')).toBeDefined()
    expect(puts(fetchFn)).toEqual([])

    fireEvent.change(screen.getByLabelText(/Contribution Twin9/), { target: { value: '1.5' } })
    await enregistrer()
    expect(puts(fetchFn)).toEqual([{ marge: 1.5 }])
    expect(await screen.findByText('Réglages Twin9 enregistrés.')).toBeDefined()
  })

  it('UC-ADM-05-U04 — pack supprimé, étage ajouté (ordre canonique) : seules les clés modifiées partent', async () => {
    const fetchFn = monter()
    await screen.findByRole('heading', { name: 'Réglages' })
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le pack 1' }))
    const modele = screen.getByDisplayValue('claude-haiku-4-5-20251001').closest('li')
    fireEvent.click(within(modele).getByRole('checkbox', { name: 'tribunal' }))
    fireEvent.click(within(modele).getByRole('checkbox', { name: 'taggers' }))
    fireEvent.click(within(modele).getByRole('checkbox', { name: 'taggers' }))
    await enregistrer()

    expect(puts(fetchFn)).toEqual([
      {
        packs: [{ montant_usd: 20, libelle: 'Pack standard — 20 $' }],
        modeles: { 'claude-haiku-4-5-20251001': { prix_usd_mtok: [1, 5], etages: ['taggers', 'rapide', 'tribunal'] } },
      },
    ])
  })

  it('UC-ADM-05-U05 — validation cliente : contribution non numérique, identifiant de modèle vide, prix invalide → message, aucun PUT', async () => {
    const fetchFn = monter()
    await screen.findByRole('heading', { name: 'Réglages' })

    fireEvent.change(screen.getByLabelText(/Contribution Twin9/), { target: { value: 'beaucoup' } })
    await enregistrer()
    expect(screen.getByRole('alert').textContent).toBe('Marge invalide : nombre attendu.')

    fireEvent.change(screen.getByLabelText(/Contribution Twin9/), { target: { value: '1.3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un modèle' }))
    await enregistrer()
    expect(screen.getByRole('alert').textContent).toBe('Identifiant de modèle vide.')

    fireEvent.change(screen.getByLabelText('Identifiant du modèle', { selector: '#twin9-modele-id-1' }), { target: { value: 'modele-fictif' } })
    await enregistrer()
    expect(screen.getByRole('alert').textContent).toBe('Prix invalide pour « modele-fictif ».')
    expect(puts(fetchFn)).toEqual([])
  })

  it('UC-ADM-05-U06 — ANOMALIE figée : une config relue de MySQL (clés réordonnées) fait repartir packs et modèles inchangés dans le diff', async () => {
    // Après un premier enregistrement, la colonne JSON MySQL renvoie les clés
    // triées ({libelle, montant_usd}, {etages, prix_usd_mtok}).
    const relue = {
      ...CONFIG,
      packs: CONFIG.packs.map((p) => ({ libelle: p.libelle, montant_usd: p.montant_usd })),
      modeles: { 'claude-haiku-4-5-20251001': { etages: ['taggers', 'rapide'], prix_usd_mtok: [1, 5] } },
    }
    const fetchFn = monter(relue)
    await screen.findByRole('heading', { name: 'Réglages' })
    fireEvent.click(screen.getByLabelText(/Promo : Twin9 gratuit/))
    await enregistrer()

    const [diff] = puts(fetchFn)
    expect(Object.keys(diff).sort()).toEqual(['modeles', 'packs', 'twin9_cle_perso_ouverte'])
    expect(diff.twin9_cle_perso_ouverte).toBe(true)
  })
})

describe('UC-ADM-05 — comptes (supervision)', () => {
  it('UC-ADM-05-U07 — table des comptes en USD ; aucun compte → message dédié', async () => {
    monter(CONFIG, [
      { user_id: 3, email: 'ecole@example.org', nom: 'École fictive', solde_microusd: 2_500_000, recharges_microusd: 10_000_000, consomme_microusd: 7_500_000, derniere_activite: '2026-07-12 14:30:00' },
    ])
    const ligne = (await screen.findByText(/École fictive/)).closest('tr')
    expect(within(ligne).getByText('(ecole@example.org)')).toBeDefined()
    expect([...ligne.querySelectorAll('td')].slice(1, 4).map((td) => td.textContent)).toEqual(['2,50 $', '10,00 $', '7,50 $'])
    cleanup()

    monter(CONFIG, [])
    expect(await screen.findByText('Aucun compte avec activité pour l’instant.')).toBeDefined()
  })
})
