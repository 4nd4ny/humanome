// UC-APP-10 — Lancer une analyse approfondie (Twin9) : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-10-analyse-approfondie-twin9.md
//
// Code sollicité appelé directement : la route #/twin9, le backend serveur
// (makeServerBackend) et son adaptation au contrat du moteur
// (makeServerFactory, etageDeLabel), la logique pure du parcours
// (run-helpers : devis, roster, journées), la persistance locale de reprise
// (twin9-store), la persistance locale du résultat (carto-store, type twin9),
// le composant de résultats (assainissement du narratif, export, ADR-007) et
// la branche 402 de Twin9View rendue seule, moteur injecté.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { parseHash } from '../../../src/router.js'
import { ApiError, ApiUnavailableError, resetApiClient } from '../../../src/api/client.js'
import { fetchTwin9Meta, formatUsd, makeServerBackend, referentielPourMoteur } from '../../../src/api/twin9.js'
import Twin9View, { etageDeLabel, makeServerFactory } from '../../../src/views/Twin9View.jsx'
import {
  ETAGE_TOKENS,
  PASSES_TAGGERS,
  SALT_DEVIS,
  calculerDevis,
  journeesDepuisCarto,
  rosterFromModele,
} from '../../../src/views/twin9/run-helpers.js'
import { createMemoryTwin9Store } from '../../../src/views/twin9/twin9-store.js'
import { createCartoStore, createMemoryAdapter } from '../../../src/lib/carto-store.js'
import ResultatsTwin9 from '../../../src/views/twin9/ResultatsTwin9.jsx'
import { htmlResponse, jsonResponse, metaTwin9 } from '../support/twin.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

const appelOk = (extra = {}) =>
  jsonResponse(200, { sortie: 'sortie filtrée', tokens_in: 900, tokens_out: 120, cout_microusd: 5400, stop_reason: 'end_turn', ...extra })

describe('UC-APP-10 — route', () => {
  it('UC-APP-10-U12 — #/twin9 ouvre l’analyse ; #/twin9/demo pré-câble la démonstration', () => {
    expect(parseHash('#/twin9')).toEqual({ name: 'twin9', section: null })
    expect(parseHash('#/twin9/demo')).toEqual({ name: 'twin9', section: 'demo' })
  })
})

describe('UC-APP-10 — offre (GET api/twin9/meta)', () => {
  it('UC-APP-10-U31 — fetchTwin9Meta : GET api/twin9/meta ; copie statique (page HTML) → ApiUnavailableError ; 401 → ApiError', async () => {
    const ok = vi.fn(async () => jsonResponse(200, { enabled: true, etapes: [] }))
    expect(await fetchTwin9Meta({ fetchFn: ok })).toEqual({ enabled: true, etapes: [] })
    expect(ok.mock.calls[0][0]).toBe('api/twin9/meta')
    expect(ok.mock.calls[0][1].method).toBe('GET')

    const statique = vi.fn(async () => htmlResponse(200))
    await expect(fetchTwin9Meta({ fetchFn: statique })).rejects.toBeInstanceOf(ApiUnavailableError)
    const anonyme = vi.fn(async () => jsonResponse(401, { error: 'Authentification requise' }))
    const err = await fetchTwin9Meta({ fetchFn: anonyme }).catch((e) => e)
    expect([err instanceof ApiError, err.status]).toEqual([true, 401])
  })
})

describe('UC-APP-10 — backend serveur (POST api/twin9/appel)', () => {
  it('UC-APP-10-U13 — corps {etape, variables, modele, etage, facturation, max_tokens?} ; renvoie la sortie ; enregistre les tokens réels', async () => {
    const fetchFn = vi.fn(async () => appelOk())
    const debits = []
    const backend = makeServerBackend({
      modele: 'claude-sonnet-5',
      facturation: 'platform',
      onDebit: (c, s) => debits.push([c, s]),
      fetchFn,
    })

    const out = await backend.call('', { etape: 'lourd/20-greffier', variables: { CODE: '1.01' }, etage: 'rapide', maxTokens: 2048 })
    const out2 = await backend.call('', { label: 'tag_1_P1' })

    expect(out).toEqual({ text: 'sortie filtrée' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('api/twin9/appel')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      etape: 'lourd/20-greffier',
      variables: { CODE: '1.01' },
      modele: 'claude-sonnet-5',
      etage: 'rapide',
      facturation: 'platform',
      max_tokens: 2048,
    })
    // Repli : étiquette comme étape, étage « rapide », pas de max_tokens.
    expect(JSON.parse(fetchFn.mock.calls[1][1].body)).toEqual({
      etape: 'tag_1_P1',
      variables: {},
      modele: 'claude-sonnet-5',
      etage: 'rapide',
      facturation: 'platform',
    })
    expect(out2).toEqual({ text: 'sortie filtrée' })
    expect(backend.records).toEqual([
      { label: 'lourd/20-greffier', tokensIn: 900, tokensOut: 120 },
      { label: 'tag_1_P1', tokensIn: 900, tokensOut: 120 },
    ])
    expect(debits).toEqual([[5400, null], [5400, null]])
  })

  it('UC-APP-10-U14 — 402 (solde épuisé) remonte en ApiError typée ; rien n’est enregistré ni débité côté client', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(402, { error: 'Solde insuffisant', solde_microusd: 0, requis_estime_microusd: 99 }))
    const onDebit = vi.fn()
    const backend = makeServerBackend({ modele: 'claude-sonnet-5', facturation: 'platform', onDebit, fetchFn })
    const err = await backend.call('', { etape: 'x' }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(402)
    expect(backend.records).toEqual([])
    expect(onDebit).not.toHaveBeenCalled()
  })

  it('UC-APP-10-U15 — adaptation au moteur : chemin de gabarit sans .md, variables d’état, étage déduit de l’étiquette ; jamais le prompt ni les méta internes', async () => {
    const fetchFn = vi.fn(async () => appelOk({ sortie: 'Position : détection' }))
    const onDebit = vi.fn()
    const factory = makeServerFactory({
      modele: 'claude-opus-4-8',
      facturation: 'platform',
      onDebit,
      makeBackend: (p) => makeServerBackend({ ...p, fetchFn }),
    })
    const backend = factory({ kind: 'claude-cli', model: 'ignoré' })
    const text = await backend.call('PROMPT LOCAL IGNORÉ', {
      gabarit: 'lourd/24-president.md',
      variables: { CODE: '1.01', POSITIONS: 'x' },
      label: 'president_1.01',
      meta: { interne: true },
      task: 'tribunal',
      maxTokens: 4096,
    })

    expect(text).toBe('Position : détection')
    const body = JSON.parse(fetchFn.mock.calls[0][1].body)
    expect(body).toEqual({
      etape: 'lourd/24-president',
      variables: { CODE: '1.01', POSITIONS: 'x' },
      modele: 'claude-opus-4-8',
      etage: 'tribunal',
      facturation: 'platform',
      max_tokens: 4096,
    })
    expect(JSON.stringify(body)).not.toContain('PROMPT LOCAL')
    expect(JSON.stringify(body)).not.toContain('interne')
    expect(onDebit).toHaveBeenCalledTimes(1)
  })

  it('UC-APP-10-U36 — ANOMALIE figée : la fabrique envoie le MÊME modèle à tous les étages (Haiku sur le tribunal → refus serveur 422)', async () => {
    const fetchFn = vi.fn(async () => appelOk())
    const factory = makeServerFactory({
      modele: 'claude-haiku-4-5-20251001',
      facturation: 'platform',
      onDebit: () => {},
      makeBackend: (p) => makeServerBackend({ ...p, fetchFn }),
    })
    const backend = factory({ kind: 'claude-cli', model: 'fictif-tribunal' })
    await backend.call('', { gabarit: 'tagger/1-tag-pole.md', variables: {}, label: 'tag_1_P1' })
    await backend.call('', { gabarit: 'lourd/24-president.md', variables: { CODE: '1.01' }, label: 'president_1.01' })

    // Comportement ACTUEL : le modèle choisi dans la vue part tel quel, quel que
    // soit l'étage ; or l'offre par défaut limite Haiku à taggers/rapide (RG6).
    expect(fetchFn.mock.calls.map(([, init]) => JSON.parse(init.body)).map((b) => [b.modele, b.etage])).toEqual([
      ['claude-haiku-4-5-20251001', 'taggers'],
      ['claude-haiku-4-5-20251001', 'tribunal'],
    ])
  })

  it('UC-APP-10-U16 — étiquette d’appel → étage de facturation (taggers / rapide / tribunal)', () => {
    expect(etageDeLabel('tag_2_P3')).toBe('taggers')
    for (const l of ['lecteur_j1', 'greffier_1.01', 'leger_1.01_p1', 'contre-lecture_1.01']) expect(etageDeLabel(l)).toBe('rapide')
    for (const l of ['condense_j1', 'arpenteur', 'retour_1', 'merge_kairos', 'accusation_1.01', 'jure_x', 'president_1.01', undefined]) {
      expect(etageDeLabel(l)).toBe('tribunal')
    }
  })
})

describe('UC-APP-10 — montants et référentiel (api/twin9.js)', () => {
  it('UC-APP-10-U38 — formatUsd (virgule, 4 décimales sous le centime) ; referentielPourMoteur (pôles + compétences aplaties portant leur pôle)', () => {
    expect(formatUsd(5_000_000)).toBe('5,00 $')
    expect(formatUsd(1234)).toBe('0,0012 $')
    expect(formatUsd(0)).toBe('0,00 $')
    expect(
      referentielPourMoteur([
        { num: 1, nom: 'TÊTE', competences: [{ code: '1.01', nom: 'Pensée critique', fiche_md: 'jamais transmis' }] },
        { num: 2, nom: 'CŒUR', competences: [{ code: '2.01', nom: 'Écoute active' }] },
      ]),
    ).toEqual({
      poles: [{ num: 1, nom: 'TÊTE' }, { num: 2, nom: 'CŒUR' }],
      competences: [
        { code: '1.01', nom: 'Pensée critique', pole: 1 },
        { code: '2.01', nom: 'Écoute active', pole: 2 },
      ],
    })
    expect(referentielPourMoteur(undefined)).toEqual({ poles: [], competences: [] })
  })
})

describe('UC-APP-10 — logique pure du parcours (run-helpers)', () => {
  it('UC-APP-10-U17 — devis : appels exacts du mock × fourchettes de tokens par étage × prix margé ; étape inconnue = rapide', () => {
    const devis = calculerDevis({ tagging: { appels: 2 }, 'etape-nouvelle': { appels: 1 }, tribunal: { appels: 0 } }, [3.6, 18])
    const bas = (n, e) => Math.round(n * (ETAGE_TOKENS[e].in[0] * 3.6 + ETAGE_TOKENS[e].out[0] * 18))
    const haut = (n, e) => Math.round(n * (ETAGE_TOKENS[e].in[1] * 3.6 + ETAGE_TOKENS[e].out[1] * 18))
    expect(devis).toEqual({
      appels: 3,
      basMicrousd: bas(2, 'taggers') + bas(1, 'rapide'),
      hautMicrousd: haut(2, 'taggers') + haut(1, 'rapide'),
      etages: [
        { etage: 'taggers', appels: 2, basMicrousd: bas(2, 'taggers'), hautMicrousd: haut(2, 'taggers') },
        { etage: 'rapide', appels: 1, basMicrousd: bas(1, 'rapide'), hautMicrousd: haut(1, 'rapide') },
      ],
    })
    expect(bas(2, 'taggers')).toBe(19_440) // 2 × (1200 × 3,6 + 300 × 18)
    expect(calculerDevis({ tagging: { appels: 5 } }, undefined).basMicrousd).toBe(0)
  })

  it('UC-APP-10-U18 — roster mono-famille Anthropic à 3 passes décorrélées ; sel de devis fixe', () => {
    expect(PASSES_TAGGERS).toBe(3)
    expect(SALT_DEVIS).toBe('twin9-devis')
    expect(rosterFromModele('claude-sonnet-5')).toEqual({
      modeles: [{ name: 'claude-sonnet-5', kind: 'anthropic', model: 'claude-sonnet-5', family: 'anthropic', enabled: true, passes: 3 }],
    })
  })

  it('UC-APP-10-U19 — journées reconstituées : attestations = établies, seuls les signaux « renvoi » comptent en renvois', () => {
    const journees = journeesDepuisCarto({
      competences: {
        '2.01': { attestations: [{ jour_index: 1, journee: 'j2', date: '2026-04-09' }], signaux: [{ jour_index: 0, journee: 'j1', type: 'minoritaire' }] },
        '1.01': { attestations: [{ jour_index: 1, journee: 'j2', date: '2026-04-09' }], signaux: [{ jour_index: 2, journee: 'j3', type: 'renvoi' }] },
        '3.01': { attestations: [{ jour_index: 'x' }], signaux: [] },
      },
    })
    expect(journees).toEqual([
      { jour_index: 0, date: null, journee: 'j1', etablies: [], renvois: [] },
      { jour_index: 1, date: '2026-04-09', journee: 'j2', etablies: ['1.01', '2.01'], renvois: [] },
      { jour_index: 2, date: null, journee: 'j3', etablies: [], renvois: ['1.01'] },
    ])
  })
})

describe('UC-APP-10 — persistances locales', () => {
  it('UC-APP-10-U20 — reprise : un seul run « courant » (paramètres seulement), écrasé puis effacé', async () => {
    const store = createMemoryTwin9Store({ now: () => '2026-04-13T10:00:00Z' })
    expect(await store.charger()).toBeUndefined()
    await store.save({ portfolioTexte: 'A', modele: 'm1', facturation: 'platform', phase: 'running', faits: 1, total: 3 })
    await store.save({ portfolioTexte: 'B', modele: 'm2', facturation: 'cle_privee', phase: 'running', faits: 2, total: 3 })
    expect(await store.charger()).toEqual({
      id: 'run-courant',
      portfolioTexte: 'B',
      modele: 'm2',
      facturation: 'cle_privee',
      phase: 'running',
      faits: 2,
      total: 3,
      updatedAt: '2026-04-13T10:00:00Z',
    })
    await store.effacer()
    expect(await store.charger()).toBeUndefined()
  })

  it('UC-APP-10-U21 — enregistrement local du résultat : type « twin9 », privé, carto_evolutive NATIF conservé', async () => {
    const store = createCartoStore(createMemoryAdapter(), { now: () => '2026-04-13T10:00:00Z', id: () => 'c-twin9' })
    const natif = { journal_id: 'twin9', competences: { '1.01': { attestations: [] } }, periode: { debut: '2026-04-06' } }
    const { id } = await store.saveCartography({ type: 'twin9', titre: 'Twin9 — twin9', document: natif, visibility: 'privee' })
    expect(id).toBe('c-twin9')
    expect(await store.getCartography(id)).toMatchObject({
      id: 'c-twin9',
      type: 'twin9',
      visibility: 'privee',
      serverId: null,
      document: natif,
    })
  })
})

describe('UC-APP-10 — résultats (composant isolé)', () => {
  const CARTO = {
    journal_id: 'twin9',
    periode: { debut: '2026-04-06', fin: '2026-04-13', n_journees: 3 },
    kairos: {
      kairos: {
        apprenant: {
          syntheseCompleteMarkdown: '## Portrait\n\nSynthèse fictive.<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>',
        },
      },
    },
    rapport: { rapport_complet_markdown: '[lien](javascript:alert(1)) Rapport fictif.' },
    profil_ipsatif: {},
    competences: {},
    statuts: {},
  }

  it('UC-APP-10-U22 — narratif du modèle assaini (ADR-007) : ni script, ni gestionnaire, ni lien javascript: ; échec d’enregistrement signalé', async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error('IndexedDB est indisponible dans ce navigateur.'))
    const { container } = render(<ResultatsTwin9 carto={CARTO} cartoStr="{}" saveFn={saveFn} />)

    // Le HTML du modèle n'est JAMAIS interprété : il reste du texte inerte.
    expect(screen.getByText(/Synthèse fictive/).textContent).toContain('<img src=x onerror=')
    expect(container.querySelector('script, img, [onerror]')).toBeNull()
    const lien = screen.getByText('lien')
    expect(lien.tagName).toBe('A')
    expect(lien.getAttribute('href')).toBeNull() // href javascript: retiré
    expect(window.__pwned).toBeUndefined()

    fireEvent.click(screen.getByText('Enregistrer dans mes cartographies'))
    expect((await screen.findByRole('alert')).textContent).toContain('IndexedDB est indisponible')
    expect(screen.getByText('Enregistrer dans mes cartographies').disabled).toBe(false)
  })

  it('UC-APP-10-U37 — étape 8 : « Exporter » livre les octets canoniques sous carto_evolutive_<journal>.json ; « Enregistrer » envoie {type twin9, privée, titre daté, document natif}, puis confirme et se désactive', async () => {
    const saveFn = vi.fn(async () => ({ id: 'c-1' }))
    const onExport = vi.fn()
    render(<ResultatsTwin9 carto={CARTO} cartoStr='{"octets":"canoniques"}' saveFn={saveFn} onExport={onExport} />)

    fireEvent.click(screen.getByText('Exporter le JSON (carto_evolutive.json)'))
    expect(onExport).toHaveBeenCalledWith('{"octets":"canoniques"}', 'carto_evolutive_twin9.json')

    await act(async () => {
      fireEvent.click(screen.getByText('Enregistrer dans mes cartographies'))
    })
    expect(saveFn).toHaveBeenCalledTimes(1)
    expect(saveFn).toHaveBeenCalledWith({
      type: 'twin9',
      titre: 'Twin9 — twin9 (2026-04-06 → 2026-04-13)',
      document: CARTO,
      visibility: 'privee',
    })
    expect(screen.getByRole('status').textContent).toContain('Enregistrée dans « Mes cartographies » (ce navigateur uniquement)')
    const bouton = screen.getByText('Enregistrée dans mes cartographies ✓')
    expect(bouton.disabled).toBe(true)
  })
})

describe('UC-APP-10 — branche 402 de la vue (moteur injecté)', () => {
  it('UC-APP-10-U35 — Twin9View isolée : si le moteur REJETTE une ApiError 402, la vue se met en pause « Rechargez… » et « Reprendre » relance avec le MÊME état (branche aujourd’hui inatteignable avec le vrai moteur, anomalie 3)', async () => {
    const etats = []
    const runEngine = vi
      .fn()
      .mockResolvedValueOnce({ metrics: { par_etape: { tagging: { appels: 4 } } }, cartoEvolutive: {} })
      .mockImplementationOnce(async (args) => {
        etats.push(args.etat)
        args.etat.journees = { j1: { empreinte: 'e1' } }
        throw new ApiError('Solde insuffisant', 402)
      })
      .mockImplementationOnce(async (args) => {
        etats.push(args.etat)
        return {
          etat: args.etat,
          cartoEvolutive: {
            journal_id: 'twin9',
            periode: { debut: '2026-04-06', fin: '2026-04-06', n_journees: 1 },
            kairos: { kairos: { apprenant: { syntheseCompleteMarkdown: '## Portrait\n\nSynthèse fictive après reprise.' } } },
            profil_ipsatif: {},
            competences: {},
            statuts: {},
          },
        }
      })
    render(
      <Twin9View
        deps={{
          fetchMeFn: async () => ({ user: { id: 7 } }),
          fetchMetaFn: async () => metaTwin9(),
          runEngine,
          serialiser: (c) => JSON.stringify(c),
          store: createMemoryTwin9Store(),
        }}
      />,
    )
    fireEvent.change(await screen.findByTestId('twin9-portfolio'), { target: { value: '### 2026-04-06\n\nUne journée fictive assez longue.' } })
    fireEvent.click(screen.getByTestId('twin9-consentement'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('twin9-estimer'))
    })
    await screen.findByTestId('twin9-devis')
    await act(async () => {
      fireEvent.click(screen.getByTestId('twin9-lancer'))
    })

    expect((await screen.findByTestId('twin9-pause')).textContent).toContain('les journées déjà analysées ne seront pas refacturées')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reprendre l’analyse' }))
    })
    await waitFor(() => expect(screen.getByText(/Synthèse fictive/)).toBeDefined())
    expect(etats[1]).toBe(etats[0])
    expect(etats[1].journees).toEqual({ j1: { empreinte: 'e1' } })
  })
})
