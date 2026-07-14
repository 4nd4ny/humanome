import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import CreditView from './CreditView.jsx'
import { resetApiClient } from '../api/client.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetApiClient()
  window.location.hash = ''
})

// --- Fixtures serveur -------------------------------------------------------

const META = {
  enabled: true,
  etapes: [],
  modeles: {},
  packs: [
    { montant_usd: 10, libelle: 'Pack découverte — 10 $' },
    { montant_usd: 20, libelle: 'Pack standard — 20 $' },
  ],
  pipeline: {},
  referentiel: {},
  paypalConfigured: true,
  solde_microusd: 4_500_000,
  cle_privee_disponible: false,
}

const CREDIT = {
  solde_microusd: 4_500_000,
  evenements: [
    {
      kind: 'topup',
      montant_microusd: 10_000_000,
      label: 'Recharge PayPal',
      model: null,
      tokens_in: null,
      tokens_out: null,
      date: '2026-07-01T09:00:00',
    },
    {
      kind: 'debit',
      montant_microusd: -120_000,
      label: '20-greffier (réserve)',
      model: 'claude-haiku',
      tokens_in: 1200,
      tokens_out: 340,
      date: '2026-07-02T10:15:00',
    },
  ],
}

const DEPENSES = {
  solde_microusd: 4_500_000,
  mois: [
    { mois: '2026-07', recharges_microusd: 10_000_000, consomme_microusd: 5_500_000, appels: 42 },
    { mois: '2026-06', recharges_microusd: 20_000_000, consomme_microusd: 1_200_000, appels: 9 },
  ],
}

const FACTURE = {
  numero: 'HUM-TW9-202607-7',
  periode: '2026-07',
  emetteur: {
    nom: 'Harmonia Éducation',
    service: 'humanome.xyz — cartographie de compétences humaines',
    site: 'https://humanome.xyz',
  },
  client: { nom: 'Alice', email: 'alice@exemple.fr' },
  lignes: [
    { model: 'claude-haiku', appels: 42, tokens_in: 52000, tokens_out: 14000, consomme_microusd: 5_500_000 },
  ],
  recharges: [
    {
      montant_microusd: 10_000_000,
      libelle: 'Recharge PayPal',
      paypal_order_id: 'ORDER-XYZ',
      date: '2026-07-01T09:00:00',
    },
  ],
  ajustements: [],
  total_consomme_microusd: 5_500_000,
  total_recharges_microusd: 10_000_000,
  solde_fin_periode_microusd: 4_500_000,
  mentions: ['Crédit prépayé consommé sur humanome.xyz (système Twin_v9).'],
}

const alice = { email: 'alice@exemple.fr', displayName: 'Alice', roles: ['apprenant'] }

/** Réponse fetch JSON façon api/client.js. */
function json(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

/**
 * fetch factice qui AIGUILLE par URL (les appels au montage partent en
 * parallèle : l'ordre n'est pas déterministe, on route donc par chemin).
 * `overrides` remplace/ajoute des routes ; on peut renvoyer un objet réponse
 * ou une fonction (url, init) -> réponse.
 */
function routerFetch(overrides = {}) {
  const routes = {
    'twin9/meta': json(200, META),
    'twin9/credit': json(200, CREDIT),
    'twin9/depenses': json(200, DEPENSES),
    'twin9/facture': json(200, FACTURE),
    'twin9/credit/paypal/creer': json(200, { approve_url: 'https://paypal.test/approve/ORDER-XYZ', order_id: 'ORDER-XYZ' }),
    'twin9/credit/paypal/capturer': json(200, { solde_microusd: 14_500_000 }),
    ...overrides,
  }
  return vi.fn(async (url, init) => {
    const path = String(url).replace(/^api\//, '').split('?')[0]
    const hit = routes[path]
    if (hit === undefined) throw new Error(`route non stubée: ${path}`)
    return typeof hit === 'function' ? hit(url, init) : hit
  })
}

/** Session authentifiée (couture fetchMeFn, pattern EspaceView/AdminView). */
const connecte = () => vi.fn(async () => ({ user: alice }))

function renderCredit(extra = {}) {
  const deps = {
    fetchMeFn: connecte(),
    fetchFn: routerFetch(extra.overrides),
    now: new Date('2026-07-14T12:00:00'),
    redirect: vi.fn(),
    ...extra.deps,
  }
  render(<CreditView deps={deps} />)
  return deps
}

describe('CreditView — solde et chargement', () => {
  it('affiche le solde courant formaté', async () => {
    renderCredit()
    const solde = await screen.findByTestId('credit-solde')
    expect(solde.textContent).toBe('4,50 $')
    expect(screen.getByTestId('credit-connecte').textContent).toContain('Alice')
  })

  it('affiche le grand-livre (compteurs signés) et le suivi des dépenses', async () => {
    renderCredit()
    await screen.findByTestId('credit-solde')
    expect(screen.getByText('+10,00 $')).toBeDefined() // recharge signée +
    expect(screen.getByText('-0,12 $')).toBeDefined() // débit signé -
    expect(screen.getByText('Suivi des dépenses (12 derniers mois)')).toBeDefined()
    // Deux barres (2 mois) rendues.
    expect(document.querySelectorAll('.credit-barre').length).toBe(2)
  })
})

describe('CreditView — recharge PayPal', () => {
  it('liste les packs et redirige vers approve_url au clic « Recharger »', async () => {
    const deps = renderCredit()
    await screen.findByTestId('credit-solde')

    expect(screen.getByText('Pack découverte — 10 $')).toBeDefined()
    const boutons = screen.getAllByRole('button', { name: 'Recharger' })
    expect(boutons.length).toBe(2)

    fireEvent.click(boutons[0])
    // creerRecharge(0) -> redirect(approve_url)
    expect(await screen.findByRole('button', { name: 'Redirection…' })).toBeDefined()
    await vi.waitFor(() =>
      expect(deps.redirect).toHaveBeenCalledWith('https://paypal.test/approve/ORDER-XYZ'),
    )
    // pack_index bien transmis dans le corps.
    const call = deps.fetchFn.mock.calls.find(([u]) => String(u).includes('paypal/creer'))
    expect(JSON.parse(call[1].body)).toEqual({ pack_index: 0 })
  })

  it('affiche « recharge indisponible » proprement si PayPal non configuré', async () => {
    renderCredit({
      overrides: { 'twin9/meta': json(200, { ...META, paypalConfigured: false, cle_privee_disponible: true }) },
    })
    const indispo = await screen.findByTestId('recharge-indispo')
    expect(indispo.textContent).toContain('indisponible')
    expect(indispo.textContent).toContain('clé Anthropic privée') // clé privée reste utilisable
    expect(screen.queryByRole('button', { name: 'Recharger' })).toBe(null)
  })
})

describe('CreditView — retour PayPal', () => {
  it('capture au retour (?paypal=retour&token=…) et affiche le nouveau solde', async () => {
    window.location.hash = '#/compte/credit?paypal=retour&token=ORDER-XYZ'
    const deps = renderCredit()

    const ok = await screen.findByTestId('paypal-succes')
    expect(ok.textContent).toContain('Recharge confirmée')
    expect(ok.textContent).toContain('14,50 $')
    // order_id transmis au serveur (idempotent).
    const call = deps.fetchFn.mock.calls.find(([u]) => String(u).includes('paypal/capturer'))
    expect(JSON.parse(call[1].body)).toEqual({ order_id: 'ORDER-XYZ' })
    // Paramètres retirés du hash (pas de re-capture au rechargement).
    expect(window.location.hash).toBe('#/compte/credit')
  })

  it('capture une seule fois même si le composant se re-rend', async () => {
    window.location.hash = '#/compte/credit?paypal=retour&token=ORDER-XYZ'
    const deps = renderCredit()
    await screen.findByTestId('paypal-succes')

    const captures = deps.fetchFn.mock.calls.filter(([u]) => String(u).includes('paypal/capturer'))
    expect(captures.length).toBe(1)
  })

  it('message neutre sur annulation (?paypal=annule), aucun débit', async () => {
    window.location.hash = '#/compte/credit?paypal=annule'
    const deps = renderCredit()

    const msg = await screen.findByTestId('paypal-annule')
    expect(msg.textContent).toContain('annulée')
    expect(deps.fetchFn.mock.calls.some(([u]) => String(u).includes('capturer'))).toBe(false)
    expect(window.location.hash).toBe('#/compte/credit')
  })
})

describe('CreditView — factures', () => {
  it('génère et rend la facture sélectionnée, impression déclenchable', async () => {
    renderCredit()
    await screen.findByTestId('credit-solde')

    const select = screen.getByLabelText('Période')
    fireEvent.change(select, { target: { value: '2026-07' } })

    // Document formel rendu.
    expect(await screen.findByText('HUM-TW9-202607-7')).toBeDefined()
    const facture = screen.getByLabelText('Facture HUM-TW9-202607-7')
    expect(within(facture).getByText('Consommation des tokens prépayés')).toBeDefined()
    expect(within(facture).getByText('claude-haiku')).toBeDefined()

    // Bouton d'impression -> window.print.
    const printSpy = vi.fn()
    vi.stubGlobal('print', printSpy)
    fireEvent.click(screen.getByRole('button', { name: /Imprimer/ }))
    expect(printSpy).toHaveBeenCalledTimes(1)
  })
})

describe('CreditView — session non nominale', () => {
  it('invite à se connecter si anonyme (401)', async () => {
    render(<CreditView deps={{ fetchMeFn: vi.fn(async () => ({ user: null })) }} />)
    expect((await screen.findByRole('status')).textContent).toContain('Connectez-vous')
  })

  it('dégrade proprement en copie statique (API indisponible)', async () => {
    const { ApiUnavailableError } = await import('../api/client.js')
    render(
      <CreditView
        deps={{ fetchMeFn: vi.fn(async () => { throw new ApiUnavailableError() }) }}
      />,
    )
    expect((await screen.findByRole('status')).textContent).toContain('Copie statique')
  })
})
