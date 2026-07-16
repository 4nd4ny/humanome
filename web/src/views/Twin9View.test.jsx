// Parcours run Twin9 (chantier T4, ADR-010) : garde de session, consentement
// obligatoire, devis affiché après un mock, et rendu des résultats depuis un
// carto_evolutive figé. Le moteur est injecté (deps.runEngine) pour rester
// rapide et déterministe ; le rendu des résultats est éprouvé sur une fixture.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import Twin9View from './Twin9View.jsx'
import ResultatsTwin9 from './twin9/ResultatsTwin9.jsx'
import { createMemoryTwin9Store } from './twin9/twin9-store.js'
import { ApiError } from '../api/client.js'

afterEach(cleanup)

const META_PRETE = {
  enabled: true,
  modeles: { 'claude-demo': { etages: ['taggers', 'rapide', 'tribunal'], prix_usd_mtok: [3.3, 16.5] } },
  packs: [],
  pipeline: { juge_leger: { passes: 2 }, merge: { relectures: true } },
  referentiel: [{ num: 1, nom: 'TÊTE', competences: [{ code: '1.01', nom: 'Pensée critique' }] }],
  paypalConfigured: false,
  solde_microusd: 5_000_000,
  cle_privee_disponible: false,
}

/** carto_evolutive.json figé (déjà aplani : nombres simples, pas de PyFloat/Map). */
const CARTO_FIXTURE = {
  journal_id: 'demo',
  date: '2026-01-01',
  version: 'Twin_v9',
  jury_mode: 'socle4+1',
  periode: { debut: '2026-03-02', fin: '2026-03-09', n_journees: 3 },
  roster: ['claude-demo'],
  statuts: { 'présence consolidée': 2, 'renvoi au cartographe': 1, 'présence non établie': 6 },
  kairos: {
    kairos: {
      apprenant: {
        syntheseCompleteMarkdown: '## Portrait\n\nUne pratique réflexive qui se précise au fil des journées.',
      },
    },
  },
  rapport: {
    rapport_complet_markdown: '## Rapport\n\nLe travail vérifie avant d’affirmer, journée après journée.',
    pour_cartographe: { renvois: [{ competence_code: '1.05', question_entretien: 'La pièce P1 relève-t-elle de 1.05 ?' }] },
  },
  profil_ipsatif: {
    competences_etablies: '2 / 9',
    competences_renvoyees: 1,
    par_pole: {
      TETE: { proportion: 40.0, competences: [{ code: '1.01', nom: 'Pensée critique', proportion: 22.2, score: 3.5 }] },
      MAIN: { proportion: 35.0, competences: [] },
    },
    concentration: { top_5_competences: [] },
  },
  competences: {
    '1.01': {
      code: '1.01',
      nom: 'Pensée critique',
      pole: 1,
      statut_temporel: 'présence consolidée',
      attestations: [
        { jour_index: 0, journee: '2026-03-02', date: '2026-03-02' },
        { jour_index: 2, journee: '2026-03-09', date: '2026-03-09' },
      ],
      signaux: [],
      heat_timeline: [1, 0, 1],
    },
    '1.05': {
      code: '1.05',
      nom: 'Pensée systémique',
      pole: 1,
      statut_temporel: 'renvoi au cartographe',
      attestations: [],
      signaux: [{ jour_index: 1, journee: '2026-03-05', type: 'renvoi' }],
      heat_timeline: [0, 0, 0],
    },
  },
  kairos_evolutif: '',
  rapports_poles: {},
  histoires: {},
}

function monter(overrides = {}) {
  const deps = {
    fetchMeFn: overrides.fetchMeFn ?? vi.fn().mockResolvedValue({ user: { email: 'a@b.c' } }),
    fetchMetaFn: overrides.fetchMetaFn ?? vi.fn().mockResolvedValue(META_PRETE),
    runEngine: overrides.runEngine ?? vi.fn(),
    serialiser: overrides.serialiser ?? ((c) => JSON.stringify(c)),
    store: overrides.store ?? createMemoryTwin9Store(),
    makeBackend: overrides.makeBackend,
  }
  render(<Twin9View section={overrides.section ?? null} deps={deps} />)
  return deps
}

describe('Twin9View — garde de session', () => {
  it('exige un compte et n’affiche pas le formulaire quand on n’est pas connecté', async () => {
    monter({ fetchMeFn: vi.fn().mockResolvedValue({ user: null }) })
    expect(await screen.findByTestId('twin9-garde-session')).toBeTruthy()
    expect(screen.queryByTestId('twin9-consentement')).toBeNull()
  })

  it('affiche « indisponible » quand le service est désactivé', async () => {
    monter({ fetchMetaFn: vi.fn().mockResolvedValue({ ...META_PRETE, enabled: false }) })
    expect(await screen.findByTestId('twin9-indisponible')).toBeTruthy()
    expect(screen.queryByTestId('twin9-consentement')).toBeNull()
  })
})

describe('Twin9View — consentement obligatoire + devis', () => {
  it('bloque l’estimation tant que le consentement n’est pas coché, puis affiche le devis après le mock', async () => {
    const runEngine = vi.fn().mockResolvedValue({
      metrics: { par_etape: { tagging: { appels: 9 }, tribunal: { appels: 17 }, 'instruction-rapide': { appels: 3 } } },
      cartoEvolutive: {},
    })
    monter({ runEngine })

    // Formulaire prêt (connecté + méta ok).
    const portfolio = await screen.findByTestId('twin9-portfolio')
    fireEvent.change(portfolio, {
      target: { value: 'Journée détaillée avec des traces concrètes et datées, bien au-delà de vingt caractères.' },
    })

    // Consentement non coché → estimation impossible.
    expect(screen.getByTestId('twin9-estimer').disabled).toBe(true)

    fireEvent.click(screen.getByTestId('twin9-consentement'))
    expect(screen.getByTestId('twin9-estimer').disabled).toBe(false)

    fireEvent.click(screen.getByTestId('twin9-estimer'))

    const devis = await screen.findByTestId('twin9-devis')
    expect(runEngine).toHaveBeenCalledTimes(1)
    expect(runEngine.mock.calls[0][0].mock).toBe(true) // devis = moteur en mock
    expect(devis.textContent).toContain('29') // 9 + 17 + 3 appels
  })
})

describe('Twin9View — reprise après solde épuisé (402)', () => {
  it('met en pause et propose de reprendre quand un appel renvoie 402', async () => {
    // moteur : devis OK, puis le run rejette un ApiError 402.
    const runEngine = vi
      .fn()
      .mockResolvedValueOnce({ metrics: { par_etape: { tagging: { appels: 2 } } }, cartoEvolutive: {} })
      .mockRejectedValueOnce(new ApiError('Solde insuffisant', 402))
    monter({ runEngine })

    fireEvent.change(await screen.findByTestId('twin9-portfolio'), {
      target: { value: 'Un portfolio de démonstration suffisamment long pour dépasser le seuil de saisie.' },
    })
    fireEvent.click(screen.getByTestId('twin9-consentement'))
    fireEvent.click(screen.getByTestId('twin9-estimer'))
    await screen.findByTestId('twin9-devis')

    fireEvent.click(screen.getByTestId('twin9-lancer'))
    const pause = await screen.findByTestId('twin9-pause')
    expect(pause.textContent).toMatch(/Rechargez votre crédit/i)
  })
})

// Traçabilité — exigence utilisateur (credits-paypal, point 6) : garde-fou de
// lancement — « n'accepter de lancer une cartographie sur NOTRE clé que si les
// crédits restants couvrent le poids du portfolio ». L'implémentation actuelle
// passe par le DEVIS (run mock déterministe × fourchettes de tokens par étage) :
// lancement BLOQUÉ si le solde ne couvre pas l'estimation basse, avertissement
// si le solde couvre la basse mais pas la haute, et le mode démonstration reste
// lançable même à solde nul (aucun débit).
// Chiffres : prix margé [3.3, 16.5] $/Mtok, tagging = étage taggers, fourchette
// in [1200, 2800] / out [300, 900] tokens (run-helpers ETAGE_TOKENS) → pour
// 2 appels : bas = 2×(1200×3.3 + 300×16.5) = 17 820 µUSD,
//            haut = 2×(2800×3.3 + 900×16.5) = 48 180 µUSD.
describe('Twin9View — garde-fou de lancement (solde vs devis)', () => {
  const devisDeuxAppels = () =>
    vi.fn().mockResolvedValue({ metrics: { par_etape: { tagging: { appels: 2 } } }, cartoEvolutive: {} })

  async function estimerAvecSolde(solde) {
    const runEngine = devisDeuxAppels()
    monter({ runEngine, fetchMetaFn: vi.fn().mockResolvedValue({ ...META_PRETE, solde_microusd: solde }) })
    fireEvent.change(await screen.findByTestId('twin9-portfolio'), {
      target: { value: 'Un portfolio de démonstration suffisamment long pour dépasser le seuil de saisie.' },
    })
    fireEvent.click(screen.getByTestId('twin9-consentement'))
    fireEvent.click(screen.getByTestId('twin9-estimer'))
    await screen.findByTestId('twin9-devis')
  }

  it('solde sous l’estimation basse : alerte « solde insuffisant » + bouton Lancer désactivé', async () => {
    await estimerAvecSolde(10_000) // < 17 820 µUSD (estimation basse)
    const alerte = screen.getByTestId('twin9-solde-insuffisant')
    expect(alerte.textContent).toMatch(/Solde insuffisant/i)
    // Le garde-fou renvoie vers la recharge plutôt que de laisser mourir le run.
    expect(alerte.querySelector('a[href="#/compte/credit"]')).toBeTruthy()
    expect(screen.getByTestId('twin9-lancer').disabled).toBe(true)
  })

  it('solde entre estimation basse et haute : avertissement mais lancement permis', async () => {
    await estimerAvecSolde(20_000) // 17 820 ≤ solde < 48 180 µUSD
    expect(screen.queryByTestId('twin9-solde-insuffisant')).toBeNull()
    expect(screen.getByText(/couvre l’estimation basse mais pas la haute/i)).toBeTruthy()
    expect(screen.getByTestId('twin9-lancer').disabled).toBe(false)
  })

  it('solde au-dessus de l’estimation haute : aucun message, lancement permis', async () => {
    await estimerAvecSolde(5_000_000)
    expect(screen.queryByTestId('twin9-solde-insuffisant')).toBeNull()
    expect(screen.queryByText(/couvre l’estimation basse/i)).toBeNull()
    expect(screen.getByTestId('twin9-lancer').disabled).toBe(false)
  })

  it('mode démonstration : lancement permis même à solde nul (aucun débit)', async () => {
    // DEMO_META porte solde_microusd: 0 — la démonstration tourne en local,
    // sans appel réseau ni débit : le garde-fou ne doit pas la bloquer.
    const runEngine = devisDeuxAppels()
    monter({
      runEngine,
      section: 'demo',
      fetchMeFn: vi.fn().mockResolvedValue({ user: null }), // même anonyme
    })
    fireEvent.click(await screen.findByTestId('twin9-consentement'))
    fireEvent.click(screen.getByTestId('twin9-estimer'))
    await screen.findByTestId('twin9-devis')

    expect(screen.queryByTestId('twin9-solde-insuffisant')).toBeNull()
    const lancer = screen.getByTestId('twin9-lancer')
    expect(lancer.textContent).toContain('démonstration')
    expect(lancer.disabled).toBe(false)
  })
})

// Traçabilité — exigences utilisateur (twin9-integration, points 5 et 6) :
// « avec une clé API personnelle, Twin9 est IMPOSSIBLE » hors promo, et le
// réglage admin « Twin9 gratuit pendant une période promotionnelle »
// (twin9_cle_perso_ouverte, renvoyé par /api/twin9/meta) doit piloter l'OFFRE
// visible côté utilisateur : option clé perso masquée promo fermée, bandeau
// promotionnel annoncé promo ouverte. La garde serveur (403) existe et est
// testée côté API ; ici on prouve que l'UI ne promet pas ce que le serveur
// refusera, et annonce la promo quand elle existe.
describe('Twin9View — offre clé perso pilotée par la promo (twin9_cle_perso_ouverte)', () => {
  const META_CLE_STOCKEE = { ...META_PRETE, cle_privee_disponible: true }

  it('promo FERMÉE : l’option « Ma clé privée » n’est pas proposée (ou est désactivée) même avec une clé stockée', async () => {
    monter({
      fetchMetaFn: vi.fn().mockResolvedValue({ ...META_CLE_STOCKEE, twin9_cle_perso_ouverte: false }),
    })
    await screen.findByTestId('twin9-portfolio')

    // Le serveur refusera 403 tout run cle_privee hors promo : l'UI ne doit
    // pas proposer une option vouée au refus (ou doit la désactiver).
    const radio = screen.queryByRole('radio', { name: /clé privée/i })
    expect(radio === null || radio.disabled).toBe(true)
    // Et aucun bandeau promotionnel hors promo.
    expect(screen.queryByText(/promotion/i)).toBeNull()
  })

  it('promo OUVERTE : option proposée + bandeau promotionnel, et parcours devis→run complet en cle_privee', async () => {
    const runEngine = vi
      .fn()
      // devis (mock: true)
      .mockResolvedValueOnce({ metrics: { par_etape: { tagging: { appels: 5 } } }, cartoEvolutive: {} })
      // run réel : carto rendable
      .mockResolvedValueOnce({ etat: {}, metrics: {}, cartoEvolutive: CARTO_FIXTURE })
    monter({
      runEngine,
      fetchMetaFn: vi.fn().mockResolvedValue({ ...META_CLE_STOCKEE, twin9_cle_perso_ouverte: true }),
    })

    fireEvent.change(await screen.findByTestId('twin9-portfolio'), {
      target: { value: 'Un portfolio de démonstration suffisamment long pour dépasser le seuil de saisie.' },
    })

    // Le public doit savoir que Twin9 est essayable gratuitement : bandeau.
    expect(screen.getByText(/promotion/i)).toBeTruthy()
    const radio = screen.getByRole('radio', { name: /clé privée/i })
    expect(radio.disabled).toBeFalsy()
    fireEvent.click(radio)

    fireEvent.click(screen.getByTestId('twin9-consentement'))
    fireEvent.click(screen.getByTestId('twin9-estimer'))
    const devis = await screen.findByTestId('twin9-devis')
    expect(devis.textContent).toMatch(/clé privée/i)
    expect(devis.textContent).toMatch(/aucun débit/i)

    fireEvent.click(screen.getByTestId('twin9-lancer'))
    // Le run aboutit et les résultats se rendent (parcours complet).
    expect(await screen.findByText(/Exporter le JSON/)).toBeTruthy()
    expect(runEngine).toHaveBeenCalledTimes(2)
  })

  it('run cle_privee refusé 403 par le serveur (promo refermée entre-temps) : erreur affichée, run arrêté proprement', async () => {
    const refus = 'Twin9 s’utilise avec nos crédits. L’usage avec votre propre clé n’est pas ouvert pour le moment.'
    const runEngine = vi
      .fn()
      .mockResolvedValueOnce({ metrics: { par_etape: { tagging: { appels: 5 } } }, cartoEvolutive: {} })
      .mockRejectedValueOnce(new ApiError(refus, 403))
    monter({
      runEngine,
      fetchMetaFn: vi.fn().mockResolvedValue({ ...META_CLE_STOCKEE, twin9_cle_perso_ouverte: true }),
    })

    fireEvent.change(await screen.findByTestId('twin9-portfolio'), {
      target: { value: 'Un portfolio de démonstration suffisamment long pour dépasser le seuil de saisie.' },
    })
    const radio = screen.getByRole('radio', { name: /clé privée/i })
    fireEvent.click(radio)
    fireEvent.click(screen.getByTestId('twin9-consentement'))
    fireEvent.click(screen.getByTestId('twin9-estimer'))
    await screen.findByTestId('twin9-devis')

    fireEvent.click(screen.getByTestId('twin9-lancer'))

    // Le message SERVEUR est montré tel quel (rôle alert), le run est arrêté :
    // ni pause « rechargez » (réservée au 402), ni progression, ni débit affiché.
    const alerte = await screen.findByRole('alert')
    expect(alerte.textContent).toContain(refus)
    expect(screen.queryByTestId('twin9-pause')).toBeNull()
    expect(screen.queryByTestId('twin9-progression')).toBeNull()
    expect(screen.queryByText(/appels effectués/)).toBeNull()
  })
})

describe('ResultatsTwin9 — rendu depuis carto_evolutive figé', () => {
  it('rend la synthèse, le rapport, le profil, les journées et l’export', () => {
    const onExport = vi.fn()
    render(<ResultatsTwin9 carto={CARTO_FIXTURE} cartoStr={JSON.stringify(CARTO_FIXTURE)} onExport={onExport} />)

    expect(screen.getByText(/Une pratique réflexive qui se précise/)).toBeTruthy()
    expect(screen.getByText(/vérifie avant d’affirmer/)).toBeTruthy()
    expect(screen.getByText('TETE')).toBeTruthy()
    expect(screen.getByText(/La pièce P1 relève-t-elle de 1\.05/)).toBeTruthy() // renvoi au cartographe

    // Journées reconstruites depuis les attestations/signaux.
    expect(screen.getByText('2026-03-02')).toBeTruthy()
    expect(screen.getByText('2026-03-05')).toBeTruthy()

    const bouton = screen.getByText(/Exporter le JSON/)
    fireEvent.click(bouton)
    expect(onExport).toHaveBeenCalledWith(JSON.stringify(CARTO_FIXTURE), 'carto_evolutive_demo.json')
  })
})
