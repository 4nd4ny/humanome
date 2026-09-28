// UC-APP-10 — Lancer une analyse approfondie (Twin9) : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-10-analyse-approfondie-twin9.md
//
// Deux niveaux :
//   - l'application ENTIÈRE (<App/>) sur #/twin9 et #/twin9/demo, avec le VRAI
//     moteur Twin9 (devis mock, démonstration) ; seul le réseau est simulé ;
//   - la vue Twin9View rendue seule quand le scénario exige une couture de
//     test (magasin de reprise en mémoire, moteur piloté pour l'annulation et
//     la reprise après 402).
// CONFIDENTIALITÉ : aucun gabarit n'intervient (le front n'en voit jamais).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../../../src/App.jsx'
import Twin9View from '../../../src/views/Twin9View.jsx'
import { ApiError, resetApiClient } from '../../../src/api/client.js'
import { executerTwin9 } from '@engine/twin9/index.js'
import { rosterFromModele, SALT_DEVIS } from '../../../src/views/twin9/run-helpers.js'
import { createMemoryTwin9Store } from '../../../src/views/twin9/twin9-store.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { META_REFERENTIEL, htmlResponse, jsonResponse, meResponse, metaTwin9, stubFetch } from '../support/twin.js'

const PORTFOLIO = `### 2026-04-06

J'ai comparé deux sources contradictoires avant d'affirmer quoi que ce soit, puis noté l'écart dans mon carnet daté.

### 2026-04-09

Quatre essais documentés ; j'ai présenté ma démarche au groupe sans couper la parole.
`
// Réglages de pipeline NON secrets (mêmes clés que config.json de Twin9).
const PIPELINE = {
  juge_leger: { passes: 2, contre_lecture: true },
  jury: { mode: 'socle4+1', taille_aleatoire: 5, graine: 1 },
  backend_tribunal: { kind: 'claude-cli', model: 'fictif-tribunal', model_mini: 'fictif-mini' },
  merge: { relectures: true, second_ressort: true, rapporteur: true },
}

function routes(meta = metaTwin9({ pipeline: PIPELINE }), overrides = {}) {
  return {
    'GET auth/me': meResponse(['apprenant']),
    'GET twin9/meta': jsonResponse(200, meta),
    ...overrides,
  }
}

function openApp(hash, user = { id: 7, roles: ['apprenant'] }) {
  window.location.hash = hash
  render(<App lib={fakeLib} fetchMeFn={async () => ({ user })} />)
}

async function remplirEtEstimer(texte = PORTFOLIO) {
  fireEvent.change(await screen.findByTestId('twin9-portfolio'), { target: { value: texte } })
  fireEvent.click(screen.getByTestId('twin9-consentement'))
  await act(async () => {
    fireEvent.click(screen.getByTestId('twin9-estimer'))
  })
  return screen.findByTestId('twin9-devis')
}

const appelsTwin9 = (calls) => calls.filter((c) => c.key === 'POST twin9/appel')

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  window.location.hash = ''
  resetApiClient()
  delete window.__pwned
})

describe('UC-APP-10 — parcours serveur sur <App/> (#/twin9)', () => {
  it('UC-APP-10-F01 — nominal, étapes 1-5 : consentement obligatoire, puis devis calculé par le moteur mock (0 appel LLM, 0 réseau)', async () => {
    const { calls } = stubFetch(routes())
    openApp('#/twin9')

    fireEvent.change(await screen.findByTestId('twin9-portfolio'), { target: { value: PORTFOLIO } })
    // Le modèle et son tarif MARGÉ viennent de /api/twin9/meta.
    expect(screen.getByTestId('twin9-modele').textContent).toContain('claude-sonnet-5 — 3.6 / 18 $ le Mtok')
    expect(screen.getByText(/Crédit plateforme — solde/).textContent).toContain('50,00 $')
    expect(screen.getByTestId('twin9-estimer').disabled).toBe(true) // consentement non coché

    const nbAvant = calls.length
    const devis = await remplirEtEstimer()

    // Le devis annonce EXACTEMENT le nombre d'appels du graphe mock (même sel).
    const attendu = await executerTwin9({
      portfolioTexte: PORTFOLIO,
      nomJournal: 'twin9.md',
      referentiel: META_REFERENTIEL,
      roster: rosterFromModele('claude-sonnet-5'),
      config: JSON.parse(JSON.stringify(PIPELINE)),
      mock: true,
      etat: null,
      salt: SALT_DEVIS,
      options: {},
      nowIso: '2026-01-01T00:00:00',
    })
    const appels = Object.values(attendu.metrics.par_etape).reduce((s, e) => s + e.appels, 0)
    expect(devis.querySelector('strong').textContent).toBe(appels.toLocaleString('fr-FR'))
    expect(devis.textContent).toMatch(/Coût estimé : entre .+ \$ et .+ \$/)
    expect(devis.textContent).toContain('taggers')
    expect(calls.length).toBe(nbAvant) // le devis ne touche pas le réseau
    expect(screen.getByTestId('twin9-lancer').disabled).toBe(false)
  })

  it('UC-APP-10-F02 — nominal, étape 6 — ANOMALIE figée : le lancement réel échoue (« Backend inconnu ») sans aucun appel serveur', async () => {
    const { calls } = stubFetch(routes())
    openApp('#/twin9')
    await remplirEtEstimer()

    await act(async () => {
      fireEvent.click(screen.getByTestId('twin9-lancer'))
    })

    // Comportement ACTUEL : Twin9View ne transmet pas la fabrique de backends
    // serveur au moteur → makeBackend({kind: 'anthropic'}) est refusé.
    expect((await screen.findByRole('alert')).textContent).toBe('Backend inconnu : anthropic (choix : mock)')
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeDefined()
    expect(appelsTwin9(calls)).toHaveLength(0)
  })

  it('UC-APP-10-F03 — A1 : démonstration (#/twin9/demo) sans compte — devis, run mock complet, résultats fictifs, aucun appel ni débit', async () => {
    const { calls } = stubFetch(routes(metaTwin9(), { 'GET auth/me': jsonResponse(401, { error: 'Authentification requise' }), 'GET twin9/meta': jsonResponse(401, { error: 'Authentification requise' }) }))
    openApp('#/twin9/demo', null)

    expect((await screen.findByTestId('twin9-mode-demo')).textContent).toContain('aucun appel réseau, aucun débit')
    expect(screen.getByLabelText('Portfolio de démonstration').textContent).toContain('capteur météo')
    fireEvent.click(screen.getByTestId('twin9-consentement'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('twin9-estimer'))
    })
    expect((await screen.findByTestId('twin9-devis')).textContent).toMatch(/appels au modèle/)

    const lancer = screen.getByTestId('twin9-lancer')
    expect(lancer.textContent).toBe('Lancer la démonstration')
    await act(async () => {
      fireEvent.click(lancer)
    })

    expect((await screen.findByTestId('resultats-demo')).textContent).toContain('données fictives')
    // Résultats natifs ET projection dans le sunburst commun du site.
    expect(screen.getByRole('heading', { name: 'Cartographie évolutive — sunburst' })).toBeDefined()
    expect(screen.getByTestId('twin9-sunburst')).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Journées analysées' })).toBeDefined()
    expect(screen.getByText('Exporter le JSON (carto_evolutive.json)')).toBeDefined()
    expect(screen.queryByText('Enregistrer dans mes cartographies')).toBeNull()
    expect(appelsTwin9(calls)).toHaveLength(0)
    expect(calls.every((c) => c.key.startsWith('GET '))).toBe(true)
  })

  it('UC-APP-10-F04 — E1 : visiteur sans session → garde « nécessite un compte », démonstration proposée', async () => {
    stubFetch(routes(metaTwin9(), { 'GET auth/me': jsonResponse(401, { error: 'Authentification requise' }) }))
    openApp('#/twin9', null)

    const garde = await screen.findByTestId('twin9-garde-session')
    expect(garde.textContent).toContain('nécessite un compte')
    expect(screen.queryByTestId('twin9-consentement')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Voir une démonstration (données fictives)' }))
    expect(await screen.findByTestId('twin9-mode-demo')).toBeDefined()
  })

  it('UC-APP-10-F05 — E2 : Twin9 non activé (gabarits non importés) → « momentanément indisponible »', async () => {
    stubFetch(routes(metaTwin9({ enabled: false })))
    openApp('#/twin9')
    expect((await screen.findByTestId('twin9-indisponible')).textContent).toBe('L’analyse Twin9 est momentanément indisponible.')
    expect(screen.queryByTestId('twin9-consentement')).toBeNull()
  })

  it('UC-APP-10-F06 — E3 : copie statique (pas d’API) → garde + démonstration ; API partielle (méta absente) → « indisponibles sur cette copie »', async () => {
    // Copie statique complète : ni session ni méta (pages HTML) → la garde de
    // session s'affiche (limite : elle parle de compte), la démo reste offerte.
    stubFetch({ 'GET auth/me': htmlResponse(200), 'GET twin9/meta': htmlResponse(200) })
    openApp('#/twin9', null)
    expect((await screen.findByTestId('twin9-garde-session')).textContent).toContain('nécessite un compte')
    expect(screen.getByRole('button', { name: 'Voir une démonstration (données fictives)' })).toBeDefined()
    cleanup()

    // Session servie mais /api/twin9/meta absente : message dédié.
    stubFetch({ 'GET auth/me': meResponse(['apprenant']), 'GET twin9/meta': htmlResponse(200) })
    openApp('#/twin9')
    expect((await screen.findByTestId('twin9-indisponible')).textContent).toContain('indisponibles sur cette copie')
    expect(screen.getByRole('button', { name: 'Voir une démonstration (données fictives)' })).toBeDefined()
  })

  it('UC-APP-10-F07 — E4 : solde sous l’estimation basse → alerte + lien de recharge, lancement impossible', async () => {
    stubFetch(routes(metaTwin9({ pipeline: PIPELINE, solde_microusd: 1_000 })))
    openApp('#/twin9')
    await remplirEtEstimer()

    const alerte = screen.getByTestId('twin9-solde-insuffisant')
    expect(alerte.textContent).toContain('Solde insuffisant pour lancer l’analyse.')
    expect(alerte.querySelector('a').getAttribute('href')).toBe('#/compte/credit')
    expect(screen.getByTestId('twin9-lancer').disabled).toBe(true)
  })

  it('UC-APP-10-F08 — A2 : promotion ouverte + clé enregistrée → voie « clé privée », devis sans débit, lancement permis même à solde nul', async () => {
    stubFetch(routes(metaTwin9({ pipeline: PIPELINE, solde_microusd: 0, twin9_cle_perso_ouverte: true, cle_privee_disponible: true })))
    openApp('#/twin9')

    fireEvent.change(await screen.findByTestId('twin9-portfolio'), { target: { value: PORTFOLIO } })
    expect(screen.getByRole('note').textContent).toContain('Promotion en cours')
    fireEvent.click(screen.getByRole('radio', { name: /Ma clé privée Anthropic/ }))
    fireEvent.click(screen.getByTestId('twin9-consentement'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('twin9-estimer'))
    })

    expect((await screen.findByTestId('twin9-devis')).textContent).toContain('Facturé sur votre clé privée (aucun débit plateforme).')
    expect(screen.queryByTestId('twin9-solde-insuffisant')).toBeNull()
    expect(screen.getByTestId('twin9-lancer').disabled).toBe(false)
  })
})

describe('UC-APP-10 — reprise, annulation et 402 (vue Twin9View, coutures de test)', () => {
  const CARTO = {
    journal_id: 'twin9',
    periode: { debut: '2026-04-06', fin: '2026-04-09', n_journees: 2 },
    kairos: { kairos: { apprenant: { syntheseCompleteMarkdown: '## Portrait\n\nSynthèse de reprise.' } } },
    profil_ipsatif: {},
    competences: {},
    statuts: {},
  }
  const devisMock = { metrics: { par_etape: { tagging: { appels: 4 } } }, cartoEvolutive: {} }

  function monter({ runEngine, store = createMemoryTwin9Store() }) {
    render(
      <Twin9View
        deps={{
          fetchMeFn: async () => ({ user: { id: 7 } }),
          fetchMetaFn: async () => metaTwin9({ pipeline: PIPELINE }),
          runEngine,
          serialiser: (c) => JSON.stringify(c),
          store,
        }}
      />,
    )
    return store
  }

  it('UC-APP-10-F09 — A3 : une analyse interrompue est détectée (IndexedDB local) ; « Restaurer » reprend portfolio, modèle et consentement', async () => {
    const store = createMemoryTwin9Store()
    await store.save({ portfolioTexte: PORTFOLIO, modele: 'claude-sonnet-5', facturation: 'platform', phase: 'running', faits: 1, total: 2 })
    monter({ runEngine: vi.fn(), store })

    expect((await screen.findByText(/Une analyse a été interrompue/)).textContent).toContain('Restaurer vos saisies')
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer les saisies' }))
    expect(screen.getByTestId('twin9-portfolio').value).toBe(PORTFOLIO)
    expect(screen.getByTestId('twin9-consentement').checked).toBe(true)
    expect(screen.queryByText(/Une analyse a été interrompue/)).toBeNull()
  })

  it('UC-APP-10-F10 — A4 : « Annuler » met l’analyse en pause ; « Reprendre » relance avec le MÊME état persistant', async () => {
    let debloquer
    const bloque = new Promise((r) => {
      debloquer = r
    })
    const etats = []
    const runEngine = vi
      .fn()
      .mockResolvedValueOnce(devisMock)
      .mockImplementationOnce(async (args) => {
        etats.push(args.etat)
        await bloque
        args.onProgress('journees', 1, 2) // lève l'annulation demandée
        return {}
      })
      .mockImplementationOnce(async (args) => {
        etats.push(args.etat)
        return { etat: args.etat, cartoEvolutive: CARTO }
      })
    const store = monter({ runEngine })
    await remplirEtEstimer()

    await act(async () => {
      fireEvent.click(screen.getByTestId('twin9-lancer'))
    })
    expect(screen.getByTestId('twin9-progression')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    await act(async () => {
      debloquer()
    })
    expect((await screen.findByTestId('twin9-pause')).textContent).toContain('Analyse annulée. Vous pouvez reprendre.')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reprendre l’analyse' }))
    })
    expect(await screen.findByText(/Synthèse de reprise/)).toBeDefined()
    expect(etats[1]).toBe(etats[0]) // même objet d'état : rien n'est recommencé
    expect(runEngine.mock.calls[2][0].mock).toBe(false)
    expect(await store.charger()).toBeUndefined() // run terminé : reprise effacée
  })

  it('UC-APP-10-F11 — E5 : solde épuisé en cours d’analyse (402) → pause « Rechargez… », reprise avec le MÊME état', async () => {
    const etats = []
    const runEngine = vi
      .fn()
      .mockResolvedValueOnce(devisMock)
      .mockImplementationOnce(async (args) => {
        etats.push(args.etat)
        args.etat.journees = { j1: { empreinte: 'e1' } } // journée déjà payée
        throw new ApiError('Solde insuffisant', 402)
      })
      .mockImplementationOnce(async (args) => {
        etats.push(args.etat)
        return { etat: args.etat, cartoEvolutive: CARTO }
      })
    monter({ runEngine })
    await remplirEtEstimer()
    await act(async () => {
      fireEvent.click(screen.getByTestId('twin9-lancer'))
    })

    expect((await screen.findByTestId('twin9-pause')).textContent).toContain('les journées déjà analysées ne seront pas refacturées')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reprendre l’analyse' }))
    })
    await waitFor(() => expect(screen.getByText(/Synthèse de reprise/)).toBeDefined())
    expect(etats[1]).toBe(etats[0])
    expect(etats[1].journees).toEqual({ j1: { empreinte: 'e1' } })
  })
})
