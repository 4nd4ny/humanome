// UC-PRO-06 — Régénérer rétrospectivement des cartographies : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-06-retrospective.md
//
// La section « Rétrospective » de l'atelier (#/promptologue/retro) est jouée
// comme par un promptologue connecté : réseau simulé (API humanome, proxy LLM
// du « Service humanome », API Anthropic directe), VRAI moteur (extractDay) et
// VRAIE comparaison (retro.js). Le texte de la journée vient des portfolios
// LOCAUX (couture retroDeps.portfolioStore de PromptologueView — IndexedDB
// n'existe pas en jsdom) ; sans elle (<App/>), le texte est introuvable et le
// promptologue le colle, ce qui est le scénario A1.
//
// Le référentiel « plus récent » est ici un cas FICTIF où le NOM de 1.03 est
// révisé — seul un changement de nom (ou de structure) modifie le prompt du
// moteur ; une redéfinition réelle (`description`) n'atteint jamais le LLM
// (anomalie AN-3 de la fiche, figée par UC-PRO-06-U13).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import PromptologueView from '../../../src/views/PromptologueView.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import referentielFixture from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import mergeFixture from '../../../../schemas/fixtures/cartographie-merge-3-jours.json'
import {
  DAY_DOCS,
  ANTHROPIC_URL,
  PROMPTOLOGUE,
  STATUT_RENVOI,
  anthropicDirect,
  authMe,
  clone,
  jsonResponse,
  serviceHumanome,
  stubNetwork,
  withStatuts,
} from '../support/banc.js'

// Scénarios bout à bout (vrai moteur, dizaines d'appels LLM simulés) : marge
// pour une exécution parallèle chargée de toutes les suites.
vi.setConfig({ testTimeout: 30_000 })
const LONG = { timeout: 15_000 }
const ETABLIE = 'présence établie'
const TEXTE_LOCAL = 'Texte LOCAL du 5 janvier : visite de l’Astrolabe avec les CM2, synthèse des retours.'

/** Référentiel 7.1.0 FICTIF : NOM de 1.03 révisé (le schéma fixe 61 compétences). */
function referentiel710() {
  const doc = clone(referentielFixture)
  doc.version = '7.1.0'
  doc.label = 'RESPIRE v7.1.0'
  doc.competences.find((c) => c.code === '1.03').nom = 'Synthèse intégrative (nom révisé)'
  return doc
}

/** Le LLM factice établit 1.03 dès que le prompt porte son nom révisé. */
const etablit103SiRevisee = (doc, iso, n, prompt) =>
  prompt.includes('(nom révisé)') ? withStatuts(doc, { '1.03': ETABLIE }) : doc

/**
 * Routes API de la section : session, mes cartographies, original (avec sa base
 * 7.0.0), versions du référentiel. `versions` suit par défaut la forme ATTENDUE
 * par le front ({version}) — la forme réelle de l'API ({semver}) est l'objet
 * de F15 (anomalie AN-1).
 */
function retroRoutes({
  user = PROMPTOLOGUE,
  cartographies = [{ id: 3, type: 'jour', titre: 'Journée du 5 janvier', visibility: 'privee' }],
  original = { id: 3, type: 'jour', titre: 'Journée du 5 janvier', document: clone(DAY_DOCS['2026-01-05']), referentiel: { id: 'respire', version: '7.0.0' } },
  versions = [{ version: '7.1.0', label: 'RESPIRE v7.1.0' }, { version: '7.0.0', label: 'RESPIRE v7' }],
  listStatus = 200,
  listError = 'Accès refusé',
  versionsStatus = 200,
} = {}) {
  return {
    'api/auth/me': authMe(user),
    'api/cartographies': () =>
      listStatus === 200 ? jsonResponse(200, cartographies) : jsonResponse(listStatus, { error: listError }),
    'api/cartographies/3': () => jsonResponse(200, original),
    'api/referentiel/versions': () =>
      versionsStatus === 200 ? jsonResponse(200, versions) : jsonResponse(versionsStatus, { error: 'Erreur interne' }),
    'api/referentiel/versions/7.1.0': () => jsonResponse(200, referentiel710()),
    'api/referentiel/versions/7.0.0': () => jsonResponse(200, clone(referentielFixture)),
  }
}

const localStore = (texte = TEXTE_LOCAL) => ({
  list: vi.fn(async () => [{ id: 'p1', titre: 'Journal de Maya', segments: [{ date: '2026-01-05', texte }] }]),
})

function openRetro(portfolioStore = localStore()) {
  render(<PromptologueView section="retro" deps={{ retroDeps: { portfolioStore } }} />)
}

async function choisirOriginal() {
  const select = await screen.findByLabelText('Cartographie d’origine', {}, LONG)
  await act(async () => {
    fireEvent.change(select, { target: { value: '3' } })
  })
  return screen.findByTestId('retro-original', {}, LONG)
}

async function regenerer() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Régénérer et comparer' }))
  })
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-PRO-06 — scénario nominal', () => {
  it('UC-PRO-06-F05 — nominal : journée d’origine, texte LOCAL retrouvé, référentiel 7.1.0 → 1.03 nouvellement détectée', async () => {
    const llm = serviceHumanome({ mutate: etablit103SiRevisee })
    const net = stubNetwork({ ...retroRoutes(), ...llm.routes })
    openRetro()

    // 3. L'original est chargé ; le texte vient du portfolio local, pas du serveur.
    const bandeau = await choisirOriginal()
    expect(bandeau.textContent).toBe('Journée du 2026-01-05 — texte retrouvé dans « Journal de Maya » (local).')
    expect(screen.getByLabelText(/Texte de la journée/).value).toBe(TEXTE_LOCAL)

    // 4. Référentiel plus récent + fournisseur par défaut (Service humanome).
    fireEvent.change(screen.getByLabelText('Version du référentiel'), { target: { value: '7.1.0' } })
    await regenerer()

    // 6. Tableau de comparaison.
    const result = await screen.findByTestId('retro-result', {}, LONG)
    expect(result.textContent).toContain('Original vs référentiel 7.1.0')
    const rows = within(result).getAllByRole('row').slice(1).map((r) => r.textContent)
    expect(rows).toEqual(['1.03nouvellement détectée'])
    expect(result.textContent).toContain('4 compétence(s) stable(s) : 2.01, 3.04, 5.03, 7.01')

    // 5. Le vrai moteur a instruit la journée LOCALE avec le référentiel 7.1.0.
    expect(net.calls('api/referentiel/versions/7.1.0')).toHaveLength(1)
    expect(llm.prompts).toHaveLength(8)
    expect(llm.prompts.every((p) => p.includes(TEXTE_LOCAL))).toBe(true)
    // RGPD (RG1, RG6) : le texte ne part QUE vers le proxy LLM, et aucune
    // écriture n'atteint une autre route serveur (ni texte, ni régénération).
    const porteurs = net.calls((c) => typeof c.init.body === 'string' && c.init.body.includes(TEXTE_LOCAL))
    expect(porteurs).toHaveLength(8)
    expect(porteurs.every((c) => c.url === 'api/llm')).toBe(true)
    expect(net.calls((c) => c.method !== 'GET').every((c) => c.url === 'api/llm')).toBe(true)
  })
})

describe('UC-PRO-06 — scénarios alternatifs', () => {
  it('UC-PRO-06-F06 — A1 + A2 : texte introuvable localement, collé par le promptologue ; clé personnelle Anthropic', async () => {
    const anthropic = anthropicDirect({ mutate: etablit103SiRevisee })
    const net = stubNetwork({ ...retroRoutes(), ...anthropic.routes })
    // Application entière : aucun portfolio local (IndexedDB absent).
    window.location.hash = '#/promptologue/retro'
    render(<App lib={fakeLib} />)

    const bandeau = await choisirOriginal()
    expect(bandeau.textContent).toBe('Journée du 2026-01-05 — texte local introuvable, collez-le :')
    fireEvent.change(screen.getByLabelText(/Texte de la journée/), { target: { value: 'Texte collé du 5 janvier.' } })
    fireEvent.change(screen.getByLabelText('Version du référentiel'), { target: { value: '7.1.0' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Clé personnelle' }))
    fireEvent.change(screen.getByLabelText(/Clé API/), { target: { value: 'sk-ant-retro' } })
    await regenerer()

    const result = await screen.findByTestId('retro-result', {}, LONG)
    expect(result.textContent).toContain('1.03')
    expect(anthropic.requests).toHaveLength(8)
    expect(anthropic.requests[0].headers['x-api-key']).toBe('sk-ant-retro')
    expect(anthropic.requests[0].body.model).toBe('claude-sonnet-4-6') // modèle par défaut du fournisseur
    expect(anthropic.requests[0].body.messages[0].content).toContain('Texte collé du 5 janvier.')
    // Le texte collé ne part que vers le fournisseur choisi, jamais vers humanome.
    const porteurs = net.calls((c) => typeof c.init.body === 'string' && c.init.body.includes('Texte collé du 5 janvier.'))
    expect(porteurs).toHaveLength(8)
    expect(porteurs.every((c) => c.url === ANTHROPIC_URL)).toBe(true)
    expect(net.calls((c) => c.url.startsWith('api/') && c.method !== 'GET')).toHaveLength(0)
  })

  it('UC-PRO-06-F07 — A3 : régénération identique — « Aucun changement : mêmes compétences établies. »', async () => {
    const llm = serviceHumanome()
    stubNetwork({ ...retroRoutes(), ...llm.routes })
    openRetro()
    await choisirOriginal()
    fireEvent.change(screen.getByLabelText('Version du référentiel'), { target: { value: '7.1.0' } })
    await regenerer()

    const result = await screen.findByTestId('retro-result', {}, LONG)
    expect(result.textContent).toContain('Aucun changement : mêmes compétences établies.')
  })

  it('UC-PRO-06-F08 — A4 : une compétence établie à l’origine ne l’est plus — « disparue (désormais : …) »', async () => {
    const llm = serviceHumanome({ mutate: (doc) => withStatuts(doc, { '2.01': STATUT_RENVOI }) })
    stubNetwork({ ...retroRoutes(), ...llm.routes })
    openRetro()
    await choisirOriginal()
    fireEvent.change(screen.getByLabelText('Version du référentiel'), { target: { value: '7.1.0' } })
    await regenerer()

    const result = await screen.findByTestId('retro-result', {}, LONG)
    const row = within(result).getAllByRole('row').find((r) => r.textContent.startsWith('2.01'))
    expect(row.textContent).toBe('2.01disparue (désormais : renvoi au cartographe)')
    expect(row.className).toBe('retro-disparue')
  })

  it('UC-PRO-06-F20 — dégradations silencieuses : versions du référentiel indisponibles (liste vide, aucun message) ; magasin local en échec → texte à coller (A1)', async () => {
    // COMPORTEMENT ACTUEL : un échec de GET referentiel/versions est avalé —
    // la liste reste vide, sans message ; le promptologue ne l'apprend qu'au
    // lancement, par le message générique de E4.
    const llm = serviceHumanome()
    stubNetwork({ ...retroRoutes({ versionsStatus: 500 }), ...llm.routes })
    openRetro({ list: vi.fn(async () => Promise.reject(new Error('IndexedDB indisponible'))) })
    const bandeau = await choisirOriginal()
    expect(bandeau.textContent).toBe('Journée du 2026-01-05 — texte local introuvable, collez-le :')
    expect([...screen.getByLabelText('Version du référentiel').options].map((o) => o.value)).toEqual([''])
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.change(screen.getByLabelText(/Texte de la journée/), { target: { value: 'Texte collé.' } })
    await regenerer()
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Choisissez une version du référentiel (plus récente que celle du run d’origine).',
    )
    expect(llm.prompts).toHaveLength(0)
  })

  it('UC-PRO-06-F21 — A4 : une compétence ABSENTE de la régénération s’affiche « disparue », sans nouveau statut', async () => {
    const sans701 = (doc) => {
      const pole7 = doc.poles.find((p) => p.poleNum === '7')
      if (pole7) pole7.competences = pole7.competences.filter((c) => c.code !== '7.01')
      return doc
    }
    const llm = serviceHumanome({ mutate: sans701 })
    stubNetwork({ ...retroRoutes(), ...llm.routes })
    openRetro()
    await choisirOriginal()
    fireEvent.change(screen.getByLabelText('Version du référentiel'), { target: { value: '7.1.0' } })
    await regenerer()

    const result = await screen.findByTestId('retro-result', {}, LONG)
    const row = within(result).getAllByRole('row').find((r) => r.textContent.startsWith('7.01'))
    expect(row.textContent).toBe('7.01disparue')
    expect(result.textContent).toContain('3 compétence(s) stable(s) : 2.01, 3.04, 5.03')
  })
})

describe('UC-PRO-06 — scénarios d’erreur', () => {
  it('UC-PRO-06-F09 — E1 : compte sans rôle promptologue — section refusée, aucune cartographie chargée', async () => {
    const net = stubNetwork(retroRoutes({ user: { id: 3, email: 'maya@example.org', displayName: 'Maya', roles: ['apprenant'] } }))
    window.location.hash = '#/promptologue/retro'
    render(<App lib={fakeLib} />)
    expect((await screen.findByTestId('promptologue-sans-role', {}, LONG)).textContent).toContain('réservé au rôle')
    expect(net.calls('api/cartographies')).toHaveLength(0)
  })

  it('UC-PRO-06-F10 — E2 : cartographies serveur refusées (403, compte sans rôle apprenant) — message explicatif', async () => {
    stubNetwork(retroRoutes({ listStatus: 403 }))
    openRetro()
    expect((await screen.findByRole('alert', {}, LONG)).textContent).toBe(
      'Les cartographies serveur nécessitent une session avec des cartographies stockées (opt-in apprenant).',
    )
    expect(screen.queryByLabelText('Cartographie d’origine')).toBeNull()
  })

  it('UC-PRO-06-F11 — E3 : cartographie de fusion (merge) ou Twin9 — régénération refusée (v1 : à l’unité, jour par jour)', async () => {
    const routes = retroRoutes({
      cartographies: [
        { id: 3, type: 'merge', titre: 'Mon parcours' },
        { id: 4, type: 'twin9', titre: 'Analyse approfondie' },
      ],
      original: { id: 3, type: 'merge', titre: 'Mon parcours', document: clone(mergeFixture), referentiel: null },
    })
    // Twin9 : le document stocké est le carto_evolutive NATIF (pas un cartographie-jour).
    routes['api/cartographies/4'] = () =>
      jsonResponse(200, { id: 4, type: 'twin9', titre: 'Analyse approfondie', document: { meta: { format: 'carto_evolutive' } }, referentiel: null })
    stubNetwork(routes)
    openRetro()
    const select = await screen.findByLabelText('Cartographie d’origine', {}, LONG)
    for (const id of ['3', '4']) {
      await act(async () => {
        fireEvent.change(select, { target: { value: id } })
      })
      expect((await screen.findByRole('alert')).textContent).toContain('n’est pas une cartographie de journée')
      expect(screen.queryByRole('button', { name: 'Régénérer et comparer' })).toBeNull()
    }
  })

  it('UC-PRO-06-F12 — E4 : aucune version du référentiel choisie — message, aucun appel LLM', async () => {
    const llm = serviceHumanome()
    stubNetwork({ ...retroRoutes(), ...llm.routes })
    openRetro()
    await choisirOriginal()
    await regenerer()
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Choisissez une version du référentiel (plus récente que celle du run d’origine).',
    )
    expect(llm.prompts).toHaveLength(0)
  })

  it('UC-PRO-06-F13 — E5 : texte de la journée vide — rappel RGPD, aucun appel LLM', async () => {
    const llm = serviceHumanome()
    stubNetwork({ ...retroRoutes(), ...llm.routes })
    openRetro({ list: vi.fn(async () => []) })
    await choisirOriginal()
    fireEvent.change(screen.getByLabelText('Version du référentiel'), { target: { value: '7.1.0' } })
    await regenerer()
    expect((await screen.findByRole('alert')).textContent).toContain(
      'il n’est jamais stocké sur le serveur, RGPD §6.1',
    )
    expect(llm.prompts).toHaveLength(0)
  })

  it('UC-PRO-06-F17 — E1 : sans session — section refusée, aucune cartographie chargée', async () => {
    const net = stubNetwork(retroRoutes({ user: null }))
    window.location.hash = '#/promptologue/retro'
    render(<App lib={fakeLib} />)
    expect((await screen.findByTestId('promptologue-anonyme', {}, LONG)).textContent).toContain('nécessite une session')
    expect(net.calls('api/auth/me').length).toBeGreaterThan(0)
    expect(net.calls((c) => c.url.startsWith('api/cartographies') || c.url.startsWith('api/referentiel'))).toHaveLength(0)
  })

  it('UC-PRO-06-F18 — E2 : 401 → même message explicatif ; autre échec → message de l’API', async () => {
    stubNetwork(retroRoutes({ listStatus: 401 }))
    openRetro()
    expect((await screen.findByRole('alert', {}, LONG)).textContent).toBe(
      'Les cartographies serveur nécessitent une session avec des cartographies stockées (opt-in apprenant).',
    )
    cleanup()

    stubNetwork(retroRoutes({ listStatus: 500, listError: 'Erreur interne' }))
    openRetro()
    expect((await screen.findByRole('alert', {}, LONG)).textContent).toBe('Erreur interne')
    expect(screen.queryByLabelText('Cartographie d’origine')).toBeNull()
  })

  it('UC-PRO-06-F22 — E7 (IHM) : la cartographie choisie n’est plus lisible (404) — message de l’API, rien à régénérer', async () => {
    const routes = retroRoutes()
    routes['api/cartographies/3'] = () => jsonResponse(404, { error: 'Cartographie introuvable' })
    stubNetwork(routes)
    openRetro()
    const select = await screen.findByLabelText('Cartographie d’origine', {}, LONG)
    await act(async () => {
      fireEvent.change(select, { target: { value: '3' } })
    })
    expect((await screen.findByRole('alert')).textContent).toBe('Cartographie introuvable')
    expect(screen.queryByTestId('retro-original')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Régénérer et comparer' })).toBeNull()
  })

  it('UC-PRO-06-F19 — E6 : clé personnelle choisie mais vide — message, aucune requête vers le fournisseur', async () => {
    const anthropic = anthropicDirect()
    const net = stubNetwork({ ...retroRoutes(), ...anthropic.routes })
    openRetro()
    await choisirOriginal()
    fireEvent.change(screen.getByLabelText('Version du référentiel'), { target: { value: '7.1.0' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Clé personnelle' }))
    await regenerer()
    expect((await screen.findByRole('alert', {}, LONG)).textContent).toContain('Une clé API Anthropic (Claude) est requise')
    expect(anthropic.requests).toHaveLength(0)
    expect(net.calls(ANTHROPIC_URL)).toHaveLength(0)
    expect(screen.queryByTestId('retro-result')).toBeNull()
  })

  it('UC-PRO-06-F14 — E6 : échec du fournisseur LLM — message, pas de résultat', async () => {
    const llm = serviceHumanome({ fail: () => jsonResponse(429, { error: 'Quota de démonstration atteint' }) })
    stubNetwork({ ...retroRoutes(), ...llm.routes })
    openRetro()
    await choisirOriginal()
    fireEvent.change(screen.getByLabelText('Version du référentiel'), { target: { value: '7.1.0' } })
    await regenerer()
    expect((await screen.findByRole('alert', {}, LONG)).textContent).toMatch(/^extractDay : pôle 1 \(2026-01-05\) — .*HTTP 429/)
    expect(screen.queryByTestId('retro-result')).toBeNull()
  })
})

describe('UC-PRO-06 — anomalies constatées (comportement ACTUEL figé)', () => {
  it('UC-PRO-06-F15 — anomalie AN-1 : avec la forme RÉELLE de GET referentiel/versions ({semver}), aucun référentiel n’est proposé — le cas est bloqué', async () => {
    // COMPORTEMENT ACTUEL : l'API renvoie {semver, label, …} ; la section ne
    // retient que les entrées portant « version ». La liste est vide et la
    // régénération ne peut jamais être lancée contre l'API réelle.
    const llm = serviceHumanome()
    stubNetwork({
      ...retroRoutes({
        versions: [
          { id: 2, referentielId: 'respire', semver: '7.1.0', label: 'RESPIRE v7.1.0', status: 'published' },
          { id: 1, referentielId: 'respire', semver: '7.0.0', label: 'RESPIRE v7', status: 'published' },
        ],
      }),
      ...llm.routes,
    })
    openRetro()
    await choisirOriginal()
    expect([...screen.getByLabelText('Version du référentiel').options].map((o) => o.value)).toEqual([''])
    await regenerer()
    expect((await screen.findByRole('alert')).textContent).toContain('Choisissez une version du référentiel')
    expect(llm.prompts).toHaveLength(0)
  })

  it('UC-PRO-06-F16 — anomalie AN-2 : la base de l’original (7.1.0) est ignorée — une version ANTÉRIEURE reste proposée', async () => {
    // COMPORTEMENT ACTUEL : GET cartographies/{id} indique la version du
    // référentiel d'origine, mais RetroSection appelle
    // newerReferentielVersions(versions, null) : aucun filtrage « plus récent ».
    stubNetwork(
      retroRoutes({
        original: { id: 3, type: 'jour', titre: 'Journée du 5 janvier', document: clone(DAY_DOCS['2026-01-05']), referentiel: { id: 'respire', version: '7.1.0' } },
      }),
    )
    openRetro()
    await choisirOriginal()
    await waitFor(() =>
      expect([...screen.getByLabelText('Version du référentiel').options].map((o) => o.value)).toEqual(['', '7.1.0', '7.0.0']),
    )
  })
})
