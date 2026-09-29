// UC-APP-11 — Gérer son crédit Twin9 : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-11-gerer-credit-twin9.md
//
// Les scénarios sont joués sur l'application ENTIÈRE (<App/>, #/compte/credit)
// avec le vrai client API (session → jeton CSRF → POST) ; seul le réseau est
// simulé (fetch global). Quand le scénario quitte le site (redirection vers
// PayPal) ou dépend du mois courant (liste des factures), la vue CreditView
// est rendue seule avec ses coutures `redirect` / `now` — le réseau reste le
// fetch global. PayPal n'est jamais appelé : ce sont les routes API qui le font.
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import CreditView from '../../../src/views/CreditView.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { bodyOf, htmlResponse, jsonResponse, meResponse, metaTwin9, stubFetch } from '../support/twin.js'

const CREDIT = {
  solde_microusd: 4_500_000,
  evenements: [
    { kind: 'debit', montant_microusd: -120_000, label: 'lourd/20-greffier (réserve)', model: 'claude-sonnet-5', tokens_in: null, tokens_out: null, date: '2026-07-02 10:15:00' },
    { kind: 'topup', montant_microusd: 10_000_000, label: 'Recharge PayPal', model: null, tokens_in: null, tokens_out: null, date: '2026-07-01 09:00:00' },
  ],
}
const DEPENSES = {
  solde_microusd: 4_500_000,
  mois: [{ mois: '2026-07', recharges_microusd: 10_000_000, consomme_microusd: 5_500_000, appels: 42 }],
}
const FACTURE = {
  numero: 'HUM-TW9-202607-7',
  periode: '2026-07',
  emetteur: { nom: 'Harmonia Éducation' },
  client: { nom: 'Léa', email: 'lea@example.org' },
  lignes: [{ model: 'claude-sonnet-5', appels: 42, tokens_in: 52000, tokens_out: 14000, consomme_microusd: 5_500_000 }],
  recharges: [],
  ajustements: [],
  total_consomme_microusd: 5_500_000,
  total_recharges_microusd: 10_000_000,
  solde_fin_periode_microusd: 4_500_000,
  mentions: [],
}

function routes(overrides = {}) {
  return {
    'GET auth/me': meResponse(['apprenant']),
    'GET twin9/meta': jsonResponse(200, metaTwin9({ solde_microusd: 4_500_000 })),
    'GET twin9/credit': jsonResponse(200, CREDIT),
    'GET twin9/depenses': jsonResponse(200, DEPENSES),
    'GET twin9/facture': jsonResponse(200, FACTURE),
    ...overrides,
  }
}

function openApp(hash = '#/compte/credit', user = { id: 7, roles: ['apprenant'] }, { strict = false } = {}) {
  window.location.hash = hash
  const app = <App lib={fakeLib} fetchMeFn={async () => ({ user })} />
  // StrictMode : comme web/src/main.jsx (effets montés, démontés puis remontés en développement).
  render(strict ? <StrictMode>{app}</StrictMode> : app)
}

const posts = (calls, path) => calls.filter((c) => c.key === `POST ${path}`)

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  window.location.hash = ''
  resetApiClient()
  vi.restoreAllMocks()
})

describe('UC-APP-11 — l’apprenant gère son crédit prépayé', () => {
  it('UC-APP-11-F01 — nominal (consultation) : solde, suivi mensuel, grand-livre en compteurs, packs de recharge', async () => {
    stubFetch(routes())
    openApp()

    expect((await screen.findByTestId('credit-solde')).textContent).toBe('4,50 $')
    expect(screen.getByTestId('credit-connecte').textContent).toContain('Léa')
    const mois = screen.getAllByText('juillet 2026').find((e) => e.tagName === 'TD').closest('tr')
    expect(within(mois).getByText('10,00 $')).toBeDefined()
    expect(within(mois).getByText('5,50 $')).toBeDefined()
    expect(within(mois).getByText('42')).toBeDefined()
    const recharge = screen.getByText('Recharge').closest('tr')
    expect(recharge.textContent).toContain('+10,00 $')
    expect(screen.getByText('Débit').closest('tr').textContent).toContain('-0,12 $')
    expect(screen.getByText('Pack découverte — 10 $')).toBeDefined()
    expect(screen.getAllByRole('button', { name: 'Recharger' })).toHaveLength(2)
  })

  it('UC-APP-11-F02 — nominal (recharge) : choix d’un pack → ordre créé côté serveur (CSRF), redirection vers PayPal', async () => {
    const { calls } = stubFetch(
      routes({
        'POST twin9/credit/paypal/creer': jsonResponse(200, {
          order_id: 'ORDER-77',
          approve_url: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-77',
        }),
      }),
    )
    const redirect = vi.fn()
    render(<CreditView deps={{ redirect }} />)

    const boutons = await screen.findAllByRole('button', { name: 'Recharger' })
    await act(async () => {
      fireEvent.click(boutons[1])
    })

    const [creer] = posts(calls, 'twin9/credit/paypal/creer')
    expect(bodyOf(creer)).toEqual({ pack_index: 1 })
    expect(creer.init.headers['X-CSRF-Token']).toBe('csrf-twin-lot')
    expect(redirect).toHaveBeenCalledWith('https://www.sandbox.paypal.com/checkoutnow?token=ORDER-77')
    expect(screen.getByRole('button', { name: 'Redirection…' }).disabled).toBe(true)
  })

  it('UC-APP-11-F03 — nominal (retour PayPal) : capture UNE fois après la session (même sous StrictMode), nouveau solde, paramètres retirés du lien', async () => {
    const { calls } = stubFetch(
      routes({
        'POST twin9/credit/paypal/capturer': jsonResponse(200, { solde_microusd: 14_500_000 }),
        'GET twin9/credit': jsonResponse(200, { ...CREDIT, solde_microusd: 14_500_000 }),
      }),
    )
    openApp('#/compte/credit?paypal=retour&token=ORDER-77', undefined, { strict: true })

    expect((await screen.findByTestId('paypal-succes')).textContent).toMatch(/Recharge confirmée\.\s+Nouveau solde\s:\s14,50 \$/)
    const captures = posts(calls, 'twin9/credit/paypal/capturer')
    expect(captures).toHaveLength(1)
    expect(bodyOf(captures[0])).toEqual({ order_id: 'ORDER-77' })
    expect(captures[0].init.headers['X-CSRF-Token']).toBe('csrf-twin-lot')
    // La capture suit la sonde de session (qui a semé le jeton).
    expect(calls.findIndex((c) => c.key === 'GET auth/me')).toBeLessThan(calls.indexOf(captures[0]))
    expect(window.location.hash).toBe('#/compte/credit')
    expect((await screen.findByTestId('credit-solde')).textContent).toBe('14,50 $')
    // Nouvel événement de session (rendu supplémentaire) : toujours une seule capture.
    await act(async () => {
      window.dispatchEvent(new Event('humanome:auth'))
    })
    await waitFor(() => expect(screen.getByTestId('credit-solde').textContent).toBe('14,50 $'))
    expect(posts(calls, 'twin9/credit/paypal/capturer')).toHaveLength(1)
  })

  it('UC-APP-11-F04 — nominal (facture) : choix d’un mois → facture récapitulative générée, imprimable', async () => {
    const { calls } = stubFetch(routes())
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<CreditView deps={{ now: new Date('2026-07-20T12:00:00') }} />)

    const choix = await screen.findByLabelText('Période')
    expect([...choix.options].map((o) => o.value)).toEqual(['', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01'])
    await act(async () => {
      fireEvent.change(choix, { target: { value: '2026-07' } })
    })

    expect(await screen.findByRole('article', { name: 'Facture HUM-TW9-202607-7' })).toBeDefined()
    expect(calls.find((c) => c.key === 'GET twin9/facture').url).toBe('api/twin9/facture?annee=2026&mois=7')
    fireEvent.click(screen.getByRole('button', { name: 'Imprimer / exporter en PDF' }))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('UC-APP-11-F05 — A1 : paiement abandonné sur PayPal (?paypal=annule) → message neutre, aucune capture', async () => {
    const { calls } = stubFetch(routes())
    openApp('#/compte/credit?paypal=annule')

    expect((await screen.findByTestId('paypal-annule')).textContent).toBe('Recharge annulée. Aucun montant n’a été débité.')
    expect(posts(calls, 'twin9/credit/paypal/capturer')).toHaveLength(0)
    expect(window.location.hash).toBe('#/compte/credit')
  })

  it('UC-APP-11-F06 — A3 : remboursement du solde À LA DEMANDE, en deux temps (bouton puis confirmation)', async () => {
    const { calls } = stubFetch(routes({ 'POST twin9/credit/rembourser': jsonResponse(200, { rembourse_microusd: 4_500_000, solde_microusd: 0 }) }))
    openApp()

    fireEvent.click(await screen.findByRole('button', { name: 'Se faire rembourser le solde restant' }))
    expect(screen.getByText(/Rembourser votre solde restant \(4,50 \$\) vers PayPal/)).toBeDefined()
    expect(posts(calls, 'twin9/credit/rembourser')).toHaveLength(0) // rien sans confirmation
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer le remboursement' }))
    })

    expect(await screen.findByText('Remboursement de 4,50 $ envoyé vers PayPal.')).toBeDefined()
    expect(screen.getByTestId('credit-solde').textContent).toBe('0,00 $')
    const [rembourser] = posts(calls, 'twin9/credit/rembourser')
    expect(bodyOf(rembourser)).toEqual({})
    expect(rembourser.init.headers['X-CSRF-Token']).toBe('csrf-twin-lot')
  })

  it('UC-APP-11-F07 — E4 : capture refusée (ordre d’un autre compte, 403) → bandeau d’erreur, aucun crédit affiché', async () => {
    stubFetch(routes({ 'POST twin9/credit/paypal/capturer': jsonResponse(403, { error: 'Cet ordre de paiement ne vous appartient pas.' }) }))
    openApp('#/compte/credit?paypal=retour&token=ORDER-ETRANGER')

    expect((await screen.findByRole('alert')).textContent).toMatch(/Recharge non confirmée\s:\sCet ordre de paiement ne vous appartient pas\./)
    expect(screen.queryByTestId('paypal-succes')).toBeNull()
    expect((await screen.findByTestId('credit-solde')).textContent).toBe('4,50 $')
  })

  it('UC-APP-11-F08 — E2 : PayPal non configuré → « recharge indisponible », clé privée suggérée, pas de remboursement', async () => {
    stubFetch(routes({ 'GET twin9/meta': jsonResponse(200, metaTwin9({ paypalConfigured: false, cle_privee_disponible: true })) }))
    openApp()

    const indispo = await screen.findByTestId('recharge-indispo')
    expect(indispo.textContent).toContain('indisponible pour le moment')
    expect(indispo.textContent).toContain('Votre clé Anthropic privée enregistrée reste utilisable')
    expect(screen.queryByRole('button', { name: 'Recharger' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Se faire rembourser le solde restant' })).toBeNull()
  })

  it('UC-APP-11-F09 — E1 : visiteur sans session → invitation à se connecter ; copie statique → message dédié', async () => {
    const { calls } = stubFetch(routes({ 'GET auth/me': jsonResponse(401, { error: 'Authentification requise' }) }))
    openApp('#/compte/credit', null)
    expect((await screen.findByRole('link', { name: 'Connectez-vous' })).getAttribute('href')).toBe('#/compte')
    expect(calls.some((c) => c.key === 'GET twin9/credit')).toBe(false)
    cleanup()

    stubFetch({ 'GET auth/me': htmlResponse(200) })
    openApp('#/compte/credit', null)
    expect((await screen.findByText(/Copie statique du site/)).textContent).toContain('https://humanome.xyz')
  })

  it('UC-APP-11-F10 — E6 / E7 : création d’ordre en échec (PayPal en erreur, 502) et remboursement refusé (422) → messages du serveur affichés', async () => {
    stubFetch(
      routes({
        'POST twin9/credit/paypal/creer': jsonResponse(502, { error: 'Le service PayPal a renvoyé une erreur, réessayez plus tard.' }),
        'POST twin9/credit/rembourser': jsonResponse(422, { error: 'Aucun solde remboursable pour le moment.' }),
      }),
    )
    const redirect = vi.fn()
    render(<CreditView deps={{ redirect }} />)

    const [premier] = await screen.findAllByRole('button', { name: 'Recharger' })
    await act(async () => {
      fireEvent.click(premier)
    })
    expect(screen.getByText('Le service PayPal a renvoyé une erreur, réessayez plus tard.').getAttribute('role')).toBe('alert')
    expect(redirect).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: 'Recharger' })[0].disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Se faire rembourser le solde restant' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer le remboursement' }))
    })
    await waitFor(() => expect(screen.getByText('Aucun solde remboursable pour le moment.').getAttribute('role')).toBe('alert'))
    expect(screen.getByTestId('credit-solde').textContent).toBe('4,50 $')
  })
})

describe('UC-APP-11 — segments de route hors « credit » (#/compte/<section>)', () => {
  it('UC-APP-11-F29 — tout segment autre que « credit » exact (après décodage) affiche la page Compte, sans aucune lecture du crédit : section inconnue, « CREDIT », « credit/ » ; « %63redit » ouvre bien le crédit ; « #/compte/ » est introuvable', async () => {
    const lecturesCredit = (calls) => calls.filter((c) => /^GET twin9\/(meta|credit|depenses)$/.test(c.key))
    const appelsTwin9 = (calls) => calls.filter((c) => c.key.includes('twin9/'))
    // Dernier cas : un retour PayPal dont le lien a été altéré (barre finale).
    for (const hash of ['#/compte/inconnue', '#/compte/CREDIT', '#/compte/credit/', '#/compte/credit/?paypal=retour&token=ORDER-1']) {
      const { calls } = stubFetch(routes())
      openApp(hash)
      expect(await screen.findByRole('heading', { name: 'Profil' })).toBeDefined()
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Compte')
      expect(screen.queryByTestId('credit-solde')).toBeNull()
      expect(appelsTwin9(calls), hash).toEqual([]) // ni lecture du crédit, ni capture PayPal
      cleanup()
      resetApiClient()
    }

    const { calls } = stubFetch(routes())
    openApp('#/compte/%63redit')
    expect((await screen.findByTestId('credit-solde')).textContent).toBe('4,50 $')
    expect(lecturesCredit(calls).map((c) => c.key).sort()).toEqual(['GET twin9/credit', 'GET twin9/depenses', 'GET twin9/meta'])
    cleanup()
    resetApiClient()

    stubFetch(routes())
    openApp('#/compte/')
    expect(screen.getByRole('alert').textContent).toBe('Page introuvable : #/compte/')
  })
})
