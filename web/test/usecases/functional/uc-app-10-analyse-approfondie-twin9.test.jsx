// UC-APP-10 — Lancer une analyse approfondie (Twin9) : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-10-analyse-approfondie-twin9.md
//
// Deux niveaux :
//   - l'application ENTIÈRE (<App/>) sur #/twin9 et #/twin9/demo, avec le VRAI
//     moteur Twin9 (devis mock, démonstration) ; seul le réseau est simulé ;
//   - la vue Twin9View rendue seule quand le scénario exige une couture de
//     test (magasin de reprise en mémoire, moteur piloté pour l'annulation, ou
//     VRAI moteur branché sur la fabrique serveur comme le serait la vue une
//     fois l'anomalie 1 corrigée).
// CONFIDENTIALITÉ : aucun gabarit n'intervient (le front n'en voit jamais).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../../../src/App.jsx'
import Twin9View, { makeServerFactory } from '../../../src/views/Twin9View.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { makeServerBackend } from '../../../src/api/twin9.js'
import { listCartographies } from '../../../src/lib/carto-store.js'
import { executerTwin9 } from '@engine/twin9/index.js'
import { calculerDevis, rosterFromModele, SALT_DEVIS } from '../../../src/views/twin9/run-helpers.js'
import { createMemoryTwin9Store } from '../../../src/views/twin9/twin9-store.js'
import { DEMO_PORTFOLIO } from '../../../src/views/twin9/demo-fixture.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { createFakeIndexedDb } from '../support/appl-fake-indexeddb.js'
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

/** Devis attendu (même calcul que la vue : moteur mock, sel fixe, prix margé). */
async function devisAttendu(meta = metaTwin9({ pipeline: PIPELINE }), modele = 'claude-sonnet-5') {
  const res = await executerTwin9({
    portfolioTexte: PORTFOLIO,
    nomJournal: 'twin9.md',
    referentiel: meta.referentiel,
    roster: rosterFromModele(modele),
    config: JSON.parse(JSON.stringify(meta.pipeline)),
    mock: true,
    etat: null,
    salt: SALT_DEVIS,
    options: {},
    nowIso: '2026-01-01T00:00:00',
  })
  return calculerDevis(res.metrics.par_etape, meta.modeles[modele].prix_usd_mtok)
}

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

    // Étape 3 : un portfolio de 20 caractères ou moins ne permet pas d'estimer.
    fireEvent.change(await screen.findByTestId('twin9-portfolio'), { target: { value: '### 2026-04-06 court' } })
    fireEvent.click(screen.getByTestId('twin9-consentement'))
    expect(screen.getByTestId('twin9-estimer').disabled).toBe(true)
    fireEvent.click(screen.getByTestId('twin9-consentement'))

    fireEvent.change(screen.getByTestId('twin9-portfolio'), { target: { value: PORTFOLIO } })
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

  it('UC-APP-10-F07 — E4 : solde sous l’estimation basse → alerte + lien de recharge, lancement impossible ; entre basse et haute → simple avertissement', async () => {
    stubFetch(routes(metaTwin9({ pipeline: PIPELINE, solde_microusd: 1_000 })))
    openApp('#/twin9')
    await remplirEtEstimer()

    const alerte = screen.getByTestId('twin9-solde-insuffisant')
    expect(alerte.textContent).toContain('Solde insuffisant pour lancer l’analyse.')
    expect(alerte.querySelector('a').getAttribute('href')).toBe('#/compte/credit')
    expect(screen.getByTestId('twin9-lancer').disabled).toBe(true)
    cleanup()
    resetApiClient()

    // Étape 4 : solde exactement à l'estimation basse (< haute) → avertissement, lancement permis.
    const { basMicrousd, hautMicrousd } = await devisAttendu()
    expect(basMicrousd).toBeLessThan(hautMicrousd)
    stubFetch(routes(metaTwin9({ pipeline: PIPELINE, solde_microusd: basMicrousd })))
    openApp('#/twin9')
    await remplirEtEstimer()
    expect(screen.queryByTestId('twin9-solde-insuffisant')).toBeNull()
    expect(screen.getByText(/couvre l’estimation basse mais pas la haute/)).toBeDefined()
    expect(screen.getByTestId('twin9-lancer').disabled).toBe(false)
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
    cleanup()
    resetApiClient()

    // L'option n'apparaît que si la promotion est ouverte ET qu'une clé est enregistrée.
    for (const meta of [
      metaTwin9({ pipeline: PIPELINE, twin9_cle_perso_ouverte: false, cle_privee_disponible: true }),
      metaTwin9({ pipeline: PIPELINE, twin9_cle_perso_ouverte: true, cle_privee_disponible: false }),
    ]) {
      stubFetch(routes(meta))
      openApp('#/twin9')
      await screen.findByTestId('twin9-portfolio')
      expect(screen.queryByRole('radio', { name: /Ma clé privée Anthropic/ })).toBeNull()
      cleanup()
      resetApiClient()
    }
  })

  it('UC-APP-10-F26 — étape 3 — ANOMALIE figée : le premier modèle de l’offre (Haiku : taggers, rapide) est présélectionné sans avertissement, alors qu’il ne couvre pas le tribunal', async () => {
    const modeles = {
      'claude-haiku-4-5-20251001': { etages: ['taggers', 'rapide'], prix_usd_mtok: [1.2, 6] },
      'claude-sonnet-5': { etages: ['taggers', 'rapide', 'tribunal'], prix_usd_mtok: [3.6, 18] },
    }
    stubFetch(routes(metaTwin9({ pipeline: PIPELINE, modeles })))
    openApp('#/twin9')
    await remplirEtEstimer()

    // Comportement ACTUEL : Haiku est retenu pour TOUT le run (un seul modèle
    // envoyé à tous les étages, UC-APP-10-U36) ; le serveur refuserait chaque
    // appel du tribunal (422, RG6), et rien ne bloque ni n'avertit.
    expect(screen.getByTestId('twin9-modele').value).toBe('claude-haiku-4-5-20251001')
    expect(screen.getByText(/Étages couverts/).textContent).toBe('Étages couverts : taggers, rapide')
    expect(screen.getByTestId('twin9-devis').textContent).toContain('tribunal')
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

  function monter({ runEngine, store = createMemoryTwin9Store(), meta = metaTwin9({ pipeline: PIPELINE }), serialiser = (c) => JSON.stringify(c), section = null }) {
    render(
      <Twin9View
        section={section}
        deps={{
          fetchMeFn: async () => ({ user: { id: 7 } }),
          fetchMetaFn: async () => meta,
          runEngine,
          ...(serialiser ? { serialiser } : {}),
          store,
        }}
      />,
    )
    return store
  }

  it('UC-APP-10-F09 — A3 : une analyse interrompue est détectée (IndexedDB local) ; « Restaurer » reprend portfolio, modèle, facturation et recoche le consentement ; « Ignorer » l’efface', async () => {
    // Offre à deux modèles et promotion ouverte : modèle et facturation restaurés sont discriminants.
    const meta = metaTwin9({
      pipeline: PIPELINE,
      modeles: {
        'claude-sonnet-5': { etages: ['taggers', 'rapide', 'tribunal'], prix_usd_mtok: [3.6, 18] },
        'claude-opus-4-8': { etages: ['tribunal'], prix_usd_mtok: [6, 30] },
      },
      twin9_cle_perso_ouverte: true,
      cle_privee_disponible: true,
    })
    const store = createMemoryTwin9Store()
    await store.save({ portfolioTexte: PORTFOLIO, modele: 'claude-opus-4-8', facturation: 'cle_privee', phase: 'running', faits: 1, total: 2 })
    monter({ runEngine: vi.fn(), store, meta })

    expect((await screen.findByText(/Une analyse a été interrompue/)).textContent).toContain('Restaurer vos saisies')
    expect(screen.getByTestId('twin9-modele').value).toBe('claude-sonnet-5')
    expect(screen.getByTestId('twin9-consentement').checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer les saisies' }))
    expect(screen.getByTestId('twin9-portfolio').value).toBe(PORTFOLIO)
    expect(screen.getByTestId('twin9-modele').value).toBe('claude-opus-4-8')
    expect(screen.getByRole('radio', { name: /Ma clé privée Anthropic/ }).checked).toBe(true)
    // Exception à RG11 : le consentement est recoché sans geste de l'apprenant.
    expect(screen.getByTestId('twin9-consentement').checked).toBe(true)
    expect(screen.queryByText(/Une analyse a été interrompue/)).toBeNull()
    cleanup()

    // « Ignorer » : la reprise est effacée du stockage local.
    monter({ runEngine: vi.fn(), store, meta })
    await screen.findByText(/Une analyse a été interrompue/)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ignorer' }))
    })
    expect(await store.charger()).toBeUndefined()
    expect(screen.queryByText(/Une analyse a été interrompue/)).toBeNull()
    expect(screen.getByTestId('twin9-portfolio').value).toBe('')
  })

  it('UC-APP-10-F10 — A4 puis étape 8 : « Annuler » met l’analyse en pause ; « Reprendre » relance avec le MÊME état persistant ; « Enregistrer » range le résultat (type twin9, privé) dans IndexedDB', async () => {
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

    // Étape 8 : enregistrement LOCAL (IndexedDB du navigateur, simulé), jamais le serveur.
    const idb = createFakeIndexedDb()
    vi.stubGlobal('indexedDB', idb.factory)
    try {
      await act(async () => {
        fireEvent.click(screen.getByText('Enregistrer dans mes cartographies'))
      })
      expect(await screen.findByText('Enregistrée dans mes cartographies ✓')).toBeDefined()
      const locales = await listCartographies()
      expect(locales).toHaveLength(1)
      expect(locales[0]).toMatchObject({ type: 'twin9', visibility: 'privee', serverId: null, titre: 'Twin9 — twin9 (2026-04-06 → 2026-04-09)' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('UC-APP-10-F11 — E5 — ANOMALIE figée : avec le VRAI moteur branché sur /api/twin9/appel, un 402 en cours d’analyse est avalé — pas de pause « Rechargez… », le run se termine sur une analyse dégradée', async () => {
    // Réseau : les 3 premiers appels sont servis (et facturés), puis le solde est épuisé.
    let n = 0
    const { calls } = stubFetch({
      'POST twin9/appel': () => {
        n += 1
        return n <= 3
          ? jsonResponse(200, { sortie: 'sortie fictive', tokens_in: 900, tokens_out: 120, cout_microusd: 5400, stop_reason: 'end_turn' })
          : jsonResponse(402, { error: 'Solde insuffisant', solde_microusd: 0, requis_estime_microusd: 160_000 })
      },
    })
    // Câblage qui MIME la correction de l'anomalie 1 : la fabrique serveur est
    // transmise au moteur réel (le devis, lui, reste en mock).
    const runEngine = vi.fn((a) =>
      executerTwin9(
        a.mock
          ? a
          : {
              ...a,
              backends: makeServerFactory({
                modele: 'claude-sonnet-5',
                facturation: 'platform',
                onDebit: () => {},
                makeBackend: makeServerBackend,
              }),
            },
      ),
    )
    const store = monter({ runEngine, serialiser: null })
    await remplirEtEstimer()
    await act(async () => {
      fireEvent.click(screen.getByTestId('twin9-lancer'))
    })

    // Comportement ACTUEL : aucune erreur ne remonte ; les résultats s'affichent.
    expect(await screen.findByRole('heading', { name: /Cartographie évolutive — twin9/ })).toBeDefined()
    expect(screen.queryByTestId('twin9-pause')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
    const refus = appelsTwin9(calls).length - 3
    expect(refus).toBeGreaterThan(0)
    // …et la reprise locale est effacée comme après un run réussi.
    expect(await store.charger()).toBeUndefined()
  })

  it('UC-APP-10-F25 — A1 + A4, VRAI moteur en démonstration : annulation puis reprise sur le MÊME état (journées reprises) — ANOMALIE figée : la démo écrit puis efface le « run courant » local', async () => {
    // Une vraie analyse interrompue est mémorisée localement AVANT la démonstration.
    const store = createMemoryTwin9Store()
    await store.save({ portfolioTexte: PORTFOLIO, modele: 'claude-sonnet-5', facturation: 'platform', phase: 'running', faits: 1, total: 2 })

    const etats = []
    const resultats = []
    let lancement = 0
    const runEngine = vi.fn(async (a) => {
      if (a.onProgress === undefined) return executerTwin9(a) // devis
      lancement += 1
      etats.push(a.etat)
      const annulerAuDeuxieme = lancement === 1
      let progressions = 0
      await new Promise((r) => setTimeout(r, 0)) // la vue affiche « Annuler »
      const res = await executerTwin9({
        ...a,
        onProgress: (...p) => {
          progressions += 1
          if (annulerAuDeuxieme && progressions === 2) fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
          return a.onProgress(...p)
        },
      })
      resultats.push(res)
      return res
    })
    monter({ runEngine, store, section: 'demo', serialiser: null })

    expect((await screen.findByTestId('twin9-mode-demo')).textContent).toContain('aucun appel réseau, aucun débit')
    fireEvent.click(screen.getByTestId('twin9-consentement'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('twin9-estimer'))
    })
    await screen.findByTestId('twin9-devis')
    await act(async () => {
      fireEvent.click(screen.getByTestId('twin9-lancer'))
    })
    expect((await screen.findByTestId('twin9-pause')).textContent).toContain('Analyse annulée. Vous pouvez reprendre.')

    // ANOMALIE (a) : la démonstration a ÉCRASÉ la reprise réelle par le portfolio fictif.
    expect((await store.charger()).portfolioTexte).toBe(DEMO_PORTFOLIO)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reprendre l’analyse' }))
    })
    expect(await screen.findByTestId('resultats-demo')).toBeDefined()
    expect(etats[1]).toBe(etats[0])
    expect(resultats.at(-1).metrics.n_journees_reprises_etat).toBeGreaterThanOrEqual(1)
    // ANOMALIE (b) : la fin de la démonstration efface le « run courant » — la
    // vraie analyse interrompue n'est plus proposée à la reprise.
    expect(await store.charger()).toBeUndefined()
  })
})
