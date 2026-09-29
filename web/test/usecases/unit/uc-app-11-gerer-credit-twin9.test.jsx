// UC-APP-11 — Gérer son crédit Twin9 : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-11-gerer-credit-twin9.md
//
// Code sollicité appelé directement : la route #/compte/credit (y compris le
// retour PayPal porté DANS le fragment), les fonctions du client
// web/src/api/twin9.js dédiées au crédit (URL, méthode, corps, jeton CSRF,
// erreurs typées) et le composant de facture imprimable FactureTwin9.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { parseHash } from '../../../src/router.js'
import { ApiError, fetchMe, resetApiClient } from '../../../src/api/client.js'
import {
  capturerRecharge,
  creerRecharge,
  fetchCredit,
  fetchDepenses,
  fetchFacture,
  formatUsd,
  rembourserSolde,
} from '../../../src/api/twin9.js'
import FactureTwin9 from '../../../src/views/twin9/FactureTwin9.jsx'
import { jsonResponse } from '../support/twin.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

describe('UC-APP-11 — route', () => {
  it('UC-APP-11-U01 — #/compte/credit, y compris au retour PayPal (?paypal=retour&token=…), ouvre l’espace crédit', () => {
    expect(parseHash('#/compte/credit')).toEqual({ name: 'account', section: 'credit' })
    expect(parseHash('#/compte/credit?paypal=retour&token=ORDER-1')).toEqual({ name: 'account', section: 'credit' })
    expect(parseHash('#/compte/credit?paypal=annule')).toEqual({ name: 'account', section: 'credit' })
  })
})

describe('UC-APP-11 — segments de route hors « credit »', () => {
  it('UC-APP-11-U17 — #/compte/<segment> : segment décodé et transmis tel quel (casse, barre finale, paramètres encodés), sans décider de l’aiguillage (App.jsx, couvert par UC-APP-11-F29) ; « #/compte/ » introuvable ; pourcentage mal formé → URIError (comportement actuel, anomalie AN1 de UC-VIS-02)', () => {
    expect(parseHash('#/compte')).toEqual({ name: 'account', section: null })
    expect(parseHash('#/compte/profil')).toEqual({ name: 'account', section: 'profil' })
    expect(parseHash('#/compte/CREDIT')).toEqual({ name: 'account', section: 'CREDIT' })
    expect(parseHash('#/compte/credit/')).toEqual({ name: 'account', section: 'credit/' })
    expect(parseHash('#/compte/%63redit')).toEqual({ name: 'account', section: 'credit' })
    // Un « ? » encodé n'est pas une query : il reste dans le segment.
    expect(parseHash('#/compte/credit%3Fpaypal%3Dretour')).toEqual({ name: 'account', section: 'credit?paypal=retour' })
    expect(parseHash('#/compte/')).toEqual({ name: 'not-found', hash: '/compte/' })
    for (const hash of ['#/compte/%', '#/compte/credit%E9']) expect(() => parseHash(hash)).toThrow(URIError)
  })
})

describe('UC-APP-11 — montants', () => {
  it('UC-APP-11-U16 — formatUsd (RG1) : micro-USD → « x,yy $ », 4 décimales sous le centime, signe conservé', () => {
    expect(formatUsd(4_200)).toBe('0,0042 $')
    expect(formatUsd(0)).toBe('0,00 $')
    expect(formatUsd(-120_000)).toBe('-0,12 $')
    expect(formatUsd(22_340_000)).toBe('22,34 $')
    expect(formatUsd(10_000)).toBe('0,01 $')
  })
})

describe('UC-APP-11 — client API du crédit', () => {
  it('UC-APP-11-U02 — lectures (crédit, dépenses, facture) en GET ; mutations (créer, capturer, rembourser) en POST avec le jeton CSRF', async () => {
    const fetchFn = vi.fn(async (url) =>
      url === 'api/auth/me' ? jsonResponse(200, { user: { id: 3 }, csrfToken: 'csrf-uc-app-11' }) : jsonResponse(200, { ok: true }),
    )
    await fetchMe({ fetchFn })
    await fetchCredit({ fetchFn })
    await fetchDepenses({ fetchFn })
    await fetchFacture('2026', '07', { fetchFn })
    await creerRecharge(1, { fetchFn })
    await capturerRecharge('ORDER-42', { fetchFn })
    await rembourserSolde({ fetchFn })

    const appels = fetchFn.mock.calls.slice(1).map(([url, init]) => [
      init.method,
      url,
      init.body === undefined ? undefined : JSON.parse(init.body),
      init.headers['X-CSRF-Token'],
    ])
    expect(appels).toEqual([
      ['GET', 'api/twin9/credit', undefined, undefined],
      ['GET', 'api/twin9/depenses', undefined, undefined],
      ['GET', 'api/twin9/facture?annee=2026&mois=7', undefined, undefined],
      ['POST', 'api/twin9/credit/paypal/creer', { pack_index: 1 }, 'csrf-uc-app-11'],
      ['POST', 'api/twin9/credit/paypal/capturer', { order_id: 'ORDER-42' }, 'csrf-uc-app-11'],
      ['POST', 'api/twin9/credit/rembourser', {}, 'csrf-uc-app-11'],
    ])
  })

  it('UC-APP-11-U03 — refus serveur → ApiError portant le statut et le message français du serveur', async () => {
    for (const [status, error] of [
      [403, 'Cet ordre de paiement ne vous appartient pas.'],
      [422, 'Aucun solde remboursable pour le moment.'],
      [503, 'Recharge PayPal non configurée'],
      [429, 'Trop de tentatives, réessayez plus tard.'],
    ]) {
      const fetchFn = vi.fn(async () => jsonResponse(status, { error }))
      const err = await capturerRecharge('ORDER-X', { fetchFn }).catch((e) => e)
      expect(err).toBeInstanceOf(ApiError)
      expect([err.status, err.message]).toEqual([status, error])
    }
  })
})

describe('UC-APP-11 — facture récapitulative imprimable (FactureTwin9)', () => {
  const FACTURE = {
    numero: 'HUM-TW9-202607-3',
    periode: '2026-07',
    emetteur: { nom: 'Harmonia Éducation', service: 'humanome.xyz — cartographie de compétences humaines', site: 'https://humanome.xyz' },
    client: { nom: 'Léa', email: 'lea@example.org' },
    lignes: [{ model: 'claude-sonnet-5', appels: 3, tokens_in: 12000, tokens_out: 3400, consomme_microusd: 104_400 }],
    recharges: [{ montant_microusd: 20_000_000, libelle: 'Recharge PayPal', paypal_order_id: 'ORDER-42', date: '2026-07-02 09:00:00' }],
    ajustements: [
      { montant_microusd: 2_000_000, libelle: 'Geste commercial', date: '2026-07-05 10:00:00' },
      { montant_microusd: -500_000, libelle: 'Correction', date: '2026-07-06 10:00:00' },
    ],
    total_consomme_microusd: 104_400,
    total_recharges_microusd: 20_000_000,
    solde_fin_periode_microusd: 21_395_600,
    mentions: ['Crédit prépayé consommé sur humanome.xyz (système Twin9).', 'Paiements traités par PayPal.'],
  }

  it('UC-APP-11-U04 — document formel : numéro, période, client, lignes par modèle, recharges, ajustements signés, totaux, mentions ; impression déclenchée', () => {
    const onImprimer = vi.fn()
    render(<FactureTwin9 facture={FACTURE} onImprimer={onImprimer} />)
    const doc = screen.getByRole('article', { name: 'Facture HUM-TW9-202607-3' })

    expect(doc.textContent).toMatch(/Période\s:\s2026-07/)
    expect(within(doc).getByText('lea@example.org')).toBeDefined()
    const ligne = within(doc).getByText('claude-sonnet-5').closest('tr')
    expect(ligne.textContent.replace(/\s/g, '')).toBe('claude-sonnet-531200034000,10$')
    expect(within(doc).getByText('ORDER-42')).toBeDefined()
    expect(within(doc).getByText('2026-07-02')).toBeDefined() // date calendaire seule
    expect(within(doc).getByText('+2,00 $')).toBeDefined()
    expect(within(doc).getByText('-0,50 $')).toBeDefined()
    expect(within(doc).getByText('Solde en fin de période').nextSibling.textContent).toBe('21,40 $')
    expect(within(doc).getByText('Paiements traités par PayPal.')).toBeDefined()

    // Le bouton d'impression vit HORS du document imprimé.
    expect(within(doc).queryByRole('button')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Imprimer / exporter en PDF' }))
    expect(onImprimer).toHaveBeenCalledTimes(1)
  })

  it('UC-APP-11-U05 — mois sans activité : « Aucune consommation », sections recharges/ajustements absentes ; rien sans données', () => {
    const vide = { ...FACTURE, lignes: [], recharges: [], ajustements: [], total_consomme_microusd: 0, total_recharges_microusd: 0 }
    const { container } = render(<FactureTwin9 facture={vide} onImprimer={() => {}} />)
    expect(screen.getByText('Aucune consommation sur cette période.')).toBeDefined()
    expect(screen.queryByText('Recharges de la période')).toBeNull()
    expect(screen.queryByText('Ajustements')).toBeNull()
    cleanup()
    const { container: rien } = render(<FactureTwin9 facture={null} />)
    expect(rien.innerHTML).toBe('')
    expect(container).toBeDefined()
  })
})
