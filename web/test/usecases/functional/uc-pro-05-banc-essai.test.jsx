// UC-PRO-05 — Évaluer un paquet au banc d'essai : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-05-banc-essai.md
//
// Les scénarios sont joués sur l'application ENTIÈRE (<App/>, route
// #/promptologue/banc-essai) comme le ferait un promptologue connecté : seul le
// RÉSEAU est simulé (vi.stubGlobal('fetch')) — API humanome (session, paquets,
// référentiel, proxy LLM « Service humanome » avec preuve de travail) et API
// directe Anthropic (clé personnelle). Le LLM factice rejoue les documents jour
// fixtures : c'est le VRAI moteur (extractDay, compareRuns, estimations) et la
// VRAIE logique du banc (bench.js) qui produisent les rapports affichés.
//
// Quelques scénarios exigent une couture que <App/> n'expose pas (portfolios
// locaux IndexedDB, moteur Twin6) : ils rendent la vue PromptologueView avec
// ses coutures documentées (deps.benchDeps), le réseau restant simulé.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import PromptologueView from '../../../src/views/PromptologueView.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { runVersionOnDays, TWIN6_PERIMETRE_NOTE } from '../../../src/views/promptologue/bench.js'
import { TWIN6_MODE_NOTE } from '../../../src/views/promptologue/BancEssaiSection.jsx'
import { compareRuns } from '../../../../engine/src/consistency.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import pkgFixture from '../../../../schemas/fixtures/prompt-package-exemple.json'
import referentielFixture from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import mergeFixture from '../../../../schemas/fixtures/cartographie-merge-3-jours.json'
import {
  DAY_DOCS,
  PROMPTOLOGUE,
  STATUT_NON_ETABLIE,
  anthropicDirect,
  authMe,
  clone,
  decodeDataUrl,
  etablies,
  jsonResponse,
  serviceHumanome,
  stubNetwork,
  withStatuts,
} from '../support/banc.js'

// Scénarios bout à bout (vrai moteur, dizaines d'appels LLM simulés) : marge
// pour une exécution parallèle chargée de toutes les suites.
vi.setConfig({ testTimeout: 30_000 })
const LONG = { timeout: 15_000 }

/** Compteur au format affiché par le banc (fr-FR : espace fine insécable). */
const fr = (n) => new Intl.NumberFormat('fr-FR').format(n)

/** Paquet publié dont l'orchestration est DÉLÉGUÉE au moteur (marqueur engine://). */
function enginePackage(id, version) {
  return {
    ...clone(pkgFixture),
    id,
    version,
    code: { ...pkgFixture.code, orchestration: '// engine://humanome-engine@0.1.0\nexport const engineRef = 1' },
  }
}

/** Paquet Twin6 réservé (fiches embarquées, marqueur « (twin6) »). */
function twin6Package() {
  return {
    ...clone(pkgFixture),
    id: 'twin6-ouverte',
    version: '1.0.0',
    prompts: [
      { role: 'twin6-scan-pole', nom: 'Scan', texte: 'scan {{pole}}' },
      { role: 'twin6-kairos', nom: 'Kairos', texte: 'kairos' },
      { role: 'twin6-fiche-1', nom: 'Fiche 1', texte: '## 1.01 — Pensée critique' },
    ],
    code: { ...pkgFixture.code, orchestration: '// engine://humanome-engine@0.1.0 (twin6)\nexport const engineRef = 1' },
    metadata: { ...pkgFixture.metadata, reserved: true },
  }
}

/** Routes API humanome communes : session promptologue + sources du banc. */
function bancRoutes({ user = PROMPTOLOGUE, published = [], packages = {}, drafts = [], referentielVersions = [], referentiels = {} } = {}) {
  const routes = {
    'api/auth/me': authMe(user),
    'api/prompt-packages': () => jsonResponse(200, published),
    'api/prompt-packages/drafts': () => jsonResponse(200, drafts.map(({ document, ...meta }) => meta)),
    'api/referentiel/versions': () => jsonResponse(200, referentielVersions),
  }
  for (const [key, doc] of Object.entries(packages)) {
    routes[`api/prompt-packages/${key}`] = () => jsonResponse(200, doc)
  }
  for (const draft of drafts) {
    routes[`api/prompt-packages/drafts/${draft.draftId}`] = () => jsonResponse(200, draft)
  }
  for (const [semver, doc] of Object.entries(referentiels)) {
    routes[`api/referentiel/versions/${semver}`] = () => jsonResponse(200, doc)
  }
  return routes
}

function openBanc() {
  window.location.hash = '#/promptologue/banc-essai'
  render(<App lib={fakeLib} />)
}

async function ready() {
  return screen.findByLabelText('Version à tester', {}, LONG)
}

async function lancer() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
  })
}

function choisirJournee(iso) {
  fireEvent.click(screen.getByRole('radio', { name: /Une journée/ }))
  fireEvent.change(screen.getByLabelText('Journée'), { target: { value: iso } })
}

/** Ligne d'un tableau (th scope=row) -> cellules de données. */
function rowCells(section, label) {
  const header = within(section).getByRole('rowheader', { name: label })
  return [...header.parentElement.querySelectorAll('td')].map((td) => td.textContent)
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  try {
    localStorage.clear()
  } catch {
    /* stockage indisponible */
  }
  resetApiClient()
})

describe('UC-PRO-05 — scénario nominal : comparaison A/B de deux versions', () => {
  it('UC-PRO-05-F06 — nominal : A/B embarqué vs publiée sur la fixture, tableau, coûts réels, diff du jury, rapport JSON', async () => {
    const llm = serviceHumanome()
    const net = stubNetwork({
      ...bancRoutes({
        published: [{ id: 'aurora-lab', version: '2.0.0', reserved: false }],
        packages: { 'aurora-lab/2.0.0': enginePackage('aurora-lab', '2.0.0') },
      }),
      ...llm.routes,
    })
    openBanc()
    const select = await ready()

    // 2. Les sources : moteur embarqué + versions publiées (+ mes brouillons).
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'aurora-v3-reconstruit@1.0.0 (moteur embarqué)',
      'aurora-lab@2.0.0 (publiée)',
    ])

    // 3. A/B : A = étalon embarqué, B = version publiée ; fixture Maya, Service humanome.
    fireEvent.click(screen.getByRole('radio', { name: /A\/B/ }))
    fireEvent.change(screen.getByLabelText('Version A'), { target: { value: 'builtin' } })
    fireEvent.change(screen.getByLabelText('Version B'), { target: { value: 'pub:aurora-lab@2.0.0' } })
    expect(screen.getByLabelText('Portfolio de test').value).toBe('fixture')
    await lancer()

    // 6. Rapport A/B.
    const ab = await screen.findByTestId('banc-ab', {}, LONG)
    // 4. La version publiée est résolue via l'API ; 5. 3 journées × 8 appels × 2 branches.
    expect(net.calls('api/prompt-packages/aurora-lab/2.0.0')).toHaveLength(1)
    expect(llm.prompts).toHaveLength(48)
    expect(ab.textContent).toContain('aurora-v3-reconstruit@1.0.0 vs aurora-lab@2.0.0')
    const total = Object.values(DAY_DOCS).reduce((sum, doc) => sum + etablies(doc).length, 0)
    expect(rowCells(ab, 'Compétences établies (total)')).toEqual([String(total), String(total)])
    expect(rowCells(ab, 'Appels LLM')).toEqual(['24', '24'])
    // Usage RÉEL mesuré (24 appels × 1 000 / 200 tokens) et coût réel sur le
    // modèle de référence du service (claude-sonnet-5 : 3 $ / 15 $ par Mtok).
    const tokens = `${fr(24000)} / ${fr(4800)}`
    expect(rowCells(ab, 'Tokens réels (entrée / sortie)')).toEqual([tokens, tokens])
    expect(rowCells(ab, 'Coût réel (table de prix)')).toEqual(['0.144 $', '0.144 $'])
    expect(rowCells(ab, 'Estimation (coût / durée)')[0]).toMatch(/\$ \/ ~\d+ min$/)
    // Par journée : mêmes prompts moteur, mêmes réponses -> tout en commun.
    const jours = within(ab).getAllByRole('row').filter((r) => /^2026-01-0\d/.test(r.textContent))
    expect(jours.map((r) => r.firstChild.textContent)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    expect(screen.getByTestId('banc-diff-competences').textContent).toContain('Aucun écart')

    // Le rapport téléchargeable porte la configuration de chaque branche.
    const report = decodeDataUrl(screen.getByRole('link', { name: 'Télécharger le rapport JSON' }).getAttribute('href'))
    expect(report.kind).toBe('rapport-ab-prompt-packages')
    expect(report.versions.b.version).toBe('aurora-lab@2.0.0')
    expect(report.configurations.a).toMatchObject({ fournisseur: 'service humanome', modeleTarif: 'claude-sonnet-5' })
    expect(report.parJour).toHaveLength(3)
  })
})

describe('UC-PRO-05 — scénarios alternatifs', () => {
  it('UC-PRO-05-F07 — A1 : run simple d’une journée, usage et coût réels, export JSON réimportable', async () => {
    const llm = serviceHumanome()
    stubNetwork({ ...bancRoutes(), ...llm.routes })
    openBanc()
    await ready()
    choisirJournee('2026-01-06')
    await lancer()

    const bloc = await screen.findByTestId('banc-simple', {}, LONG)
    expect(bloc.textContent).toContain('1 journée(s), 8 appel(s) LLM')
    expect(bloc.textContent).toContain('exécution moteur embarqué')
    expect(screen.getByTestId('banc-usage').textContent).toBe(
      `Tokens réels : ${fr(8000)} entrée / ${fr(1600)} sortie — coût réel 0.048 $ (table de prix indicative)`,
    )
    const exported = decodeDataUrl(screen.getByRole('link', { name: /Télécharger le run/ }).getAttribute('href'))
    expect(exported.kind).toBe('rapport-run-banc')
    expect(exported.portfolio.jours).toEqual(['2026-01-06'])
    // Le vrai moteur a reconstruit le document jour à partir des réponses.
    expect(exported.days[0].document).toEqual(DAY_DOCS['2026-01-06'])
  })

  it('UC-PRO-05-F08 — A2 : multi-run de consistance (3 runs), une divergence stochastique au run 2', async () => {
    // Le LLM « change d'avis » sur 2.01 pendant le 2e run (appels 9 à 16).
    const llm = serviceHumanome({
      mutate: (doc, iso, n) => (n >= 9 && n <= 16 ? withStatuts(doc, { '2.01': STATUT_NON_ETABLIE }) : doc),
    })
    stubNetwork({ ...bancRoutes(), ...llm.routes })
    openBanc()
    await ready()
    fireEvent.click(screen.getByRole('radio', { name: /Multi-run/ }))
    fireEvent.change(screen.getByLabelText('Nombre de runs'), { target: { value: '3' } })
    choisirJournee('2026-01-05')
    await lancer()

    const bloc = await screen.findByTestId('banc-multi', {}, LONG)
    expect(llm.prompts).toHaveLength(24)
    const docs = [
      DAY_DOCS['2026-01-05'],
      withStatuts(DAY_DOCS['2026-01-05'], { '2.01': STATUT_NON_ETABLIE }),
      DAY_DOCS['2026-01-05'],
    ]
    const expected = compareRuns(docs).distanceStructurelle
    expect(expected).toBeGreaterThan(0)
    expect(bloc.textContent).toContain(`Distance structurelle moyenne : ${expected.toFixed(3)}`)
    expect(bloc.textContent).toContain('3 stable(s), 1 divergente(s)')
    const row = within(bloc).getAllByRole('row').find((r) => r.textContent.startsWith('2.01'))
    expect(row.textContent).toContain('(runs 1, 3)')
    expect(row.textContent).toContain('(run 2)')
  })

  it('UC-PRO-05-F09 — A3 + A5 : A/B croisé 2×2 runs, B sur un autre LLM (clé personnelle) : écart franc vs bruit', async () => {
    const service = serviceHumanome()
    // Branche B (Anthropic direct) : n'établit jamais 2.01 ; 3.04 seulement au run 1.
    const anthropic = anthropicDirect({
      mutate: (doc, iso, n) =>
        withStatuts(doc, n > 8 ? { '2.01': STATUT_NON_ETABLIE, '3.04': STATUT_NON_ETABLIE } : { '2.01': STATUT_NON_ETABLIE }),
    })
    const net = stubNetwork({ ...bancRoutes(), ...service.routes, ...anthropic.routes })
    openBanc()
    await ready()
    fireEvent.click(screen.getByRole('radio', { name: /A\/B/ }))
    fireEvent.change(screen.getByLabelText('Runs par branche'), { target: { value: '2' } })
    choisirJournee('2026-01-05')
    fireEvent.click(screen.getByRole('checkbox', { name: /Fournisseur\/modèle distinct pour B/ }))
    const brancheB = screen.getByText('Fournisseur LLM — branche B').closest('fieldset')
    fireEvent.click(within(brancheB).getByRole('radio', { name: 'Clé personnelle' }))
    fireEvent.change(within(brancheB).getByLabelText(/Clé API/), { target: { value: 'sk-ant-test-banc' } })
    fireEvent.change(within(brancheB).getByLabelText(/Modèle/), { target: { value: 'claude-haiku-4-5' } })
    await lancer()

    const multi = await screen.findByTestId('banc-ab-multi', {}, LONG)
    expect(service.prompts).toHaveLength(16)
    expect(anthropic.requests).toHaveLength(16)
    expect(multi.textContent).toContain('2 runs A × 2 runs B')
    expect(multi.textContent).toMatch(/1 écart\(s\) franc\(s\)/)
    expect(multi.textContent).toMatch(/1 compétence\(s\) dans le bruit/)
    const ecart = within(multi).getAllByRole('row').find((r) => r.textContent.includes('2.01'))
    expect(ecart.textContent).toContain('100 % des runs')
    expect(ecart.textContent).toContain('0 % des runs')

    // La clé personnelle ne part QUE vers le fournisseur choisi, jamais vers humanome.
    expect(anthropic.requests[0].headers['x-api-key']).toBe('sk-ant-test-banc')
    expect(anthropic.requests[0].body.model).toBe('claude-haiku-4-5')
    const versHumanome = net.calls((c) => c.url.startsWith('api/'))
    expect(versHumanome.some((c) => String(c.init.body ?? '').includes('sk-ant-test-banc'))).toBe(false)

    // Coûts réels par branche : service (sonnet-5) vs haiku (1 $ / 5 $ par Mtok),
    // run 1 puis total de SESSION (2 runs).
    const ab = screen.getByTestId('banc-ab')
    expect(rowCells(ab, 'Coût réel (table de prix) — run 1')).toEqual(['0.048 $', '0.036 $'])
    expect(rowCells(ab, 'Coût réel session')).toEqual(['0.096 $', '0.072 $'])
  })

  it('UC-PRO-05-F10 — A4 : comparaison à une référence importée — score précision/rappel/F1, journée hors score', async () => {
    const llm = serviceHumanome()
    stubNetwork({ ...bancRoutes(), ...llm.routes })
    // Référence (relue) : 1.01 établie, 2.01 non établie le 5 ; le 6 est couvert
    // par la référence seulement.
    const reference = [
      withStatuts(DAY_DOCS['2026-01-05'], { '1.01': 'présence établie', '2.01': STATUT_NON_ETABLIE }),
      clone(DAY_DOCS['2026-01-06']),
    ]
    openBanc()
    await ready()
    fireEvent.click(screen.getByRole('radio', { name: /Vs référence importée/ }))
    choisirJournee('2026-01-05')
    const content = JSON.stringify(reference)
    const file = new File([content], 'reference-relue.json', { type: 'application/json' })
    // jsdom n'implémente pas File.text() (API standard des navigateurs).
    Object.defineProperty(file, 'text', { value: async () => content })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('JSON de référence'), { target: { files: [file] } })
    })
    await screen.findByText(/reference-relue\.json/)
    await lancer()

    const score = await screen.findByTestId('banc-score', {}, LONG)
    // TP = 3.04, 5.03, 7.01 ; FP = 2.01 ; FN = 1.01 -> 75 % partout.
    expect(score.textContent).toContain('Précision 75 % · Rappel 75 % · F1 75 %')
    expect(score.textContent).toContain('3 établie(s) commune(s), 1 établie(s) seulement par le run généré')
    expect(score.textContent).toContain('Journée(s) hors score (couverte(s) d’un seul côté) : 2026-01-06.')
    expect(screen.getByRole('note').textContent).toContain('1 journée(s) exclue(s)')
    expect(llm.prompts).toHaveLength(8) // seul le côté « généré » consomme des appels
    const diff = screen.getByTestId('banc-diff-competences')
    expect(diff.textContent).toContain('2.01')
    expect(diff.textContent).toContain('1.01')
  })

  it('UC-PRO-05-F11 — A6 : périmètre restreint à UNE compétence — un seul appel LLM, document marqué partiel', async () => {
    const llm = serviceHumanome()
    stubNetwork({ ...bancRoutes(), ...llm.routes })
    openBanc()
    await ready()
    choisirJournee('2026-01-05')
    fireEvent.change(screen.getByLabelText('Périmètre du référentiel'), { target: { value: 'comp:2.01' } })
    await lancer()

    const bloc = await screen.findByTestId('banc-simple', {}, LONG)
    expect(llm.prompts).toHaveLength(1)
    expect(llm.prompts[0]).toContain('# Pôle 2 — ')
    expect(bloc.textContent).toContain('1 appel(s) LLM')
    const exported = decodeDataUrl(screen.getByRole('link', { name: /Télécharger le run/ }).getAttribute('href'))
    expect(exported.days[0].document.perimetre).toEqual({ partiel: true, poles: [2], competences: ['2.01'] })
    expect(exported.days[0].document.kairos).toBeNull()
  })

  it('UC-PRO-05-F12 — A7 : mon brouillon s’exécute depuis son document, sans aller-retour serveur', async () => {
    const llm = serviceHumanome()
    const brouillon = { draftId: 12, id: 'aurora-lab', version: '2.1.0', document: enginePackage('aurora-lab', '2.1.0') }
    const net = stubNetwork({ ...bancRoutes({ drafts: [brouillon] }), ...llm.routes })
    openBanc()
    const select = await ready()
    await waitFor(() => expect([...select.options].map((o) => o.value)).toContain('draft:12'))
    expect([...select.options].find((o) => o.value === 'draft:12').textContent).toBe('aurora-lab@2.1.0 (mon brouillon)')
    fireEvent.change(select, { target: { value: 'draft:12' } })
    choisirJournee('2026-01-07')
    await lancer()

    const bloc = await screen.findByTestId('banc-simple', {}, LONG)
    expect(bloc.textContent).toContain('aurora-lab@2.1.0 sur « Fixture embarquée : Maya, 3 journées »')
    expect(net.calls('api/prompt-packages/drafts/12')).toHaveLength(1)
    expect(net.calls((c) => c.url.startsWith('api/prompt-packages/aurora-lab/'))).toHaveLength(0)
  })

  it('UC-PRO-05-F13 — A8 : paquet à référentiel en dur signalé avant le run (drapeau reserved)', async () => {
    stubNetwork(bancRoutes({ published: [{ id: 'twin6-ouverte', version: '1.0.0', reserved: true }] }))
    openBanc()
    const select = await ready()
    await waitFor(() => expect(select.options).toHaveLength(2))
    fireEvent.change(select, { target: { value: 'pub:twin6-ouverte@1.0.0' } })
    expect(screen.getByRole('note').textContent).toContain(
      'Référentiel en dur : twin6-ouverte@1.0.0 : paquet Twin6 réservé',
    )
  })

  it('UC-PRO-05-F14 — A9 : paquet Twin6 en run simple — portfolio entier, cartographie globale, alerte définitive', async () => {
    stubNetwork(
      bancRoutes({
        published: [{ id: 'twin6-ouverte', version: '1.0.0', reserved: true }],
        packages: { 'twin6-ouverte/1.0.0': twin6Package() },
      }),
    )
    // Couture : le moteur Twin6 (8 appels sur le portfolio entier) est remplacé
    // par un double qui renvoie la cartographie merge fixture.
    const executerTwin6Fn = vi.fn(async ({ portfolio, options }) => {
      options.onProgress?.({ phase: 'scan-pole', done: 0, total: 8 })
      return { document: clone(mergeFixture), portfolio }
    })
    window.location.hash = '#/promptologue/banc-essai'
    render(
      <PromptologueView
        section="banc-essai"
        deps={{
          benchDeps: {
            runFn: (params) => runVersionOnDays({ ...params, executerTwin6Fn }),
            createBundleFn: () => ({ provider: { complete: vi.fn() }, prime: null, model: 'demo', maxTokens: 1, estimationModel: 'claude-sonnet-5' }),
          },
        }}
      />,
    )
    const select = await ready()
    await waitFor(() => expect(select.options).toHaveLength(2))
    fireEvent.change(select, { target: { value: 'pub:twin6-ouverte@1.0.0' } })
    await lancer()

    const bloc = await screen.findByTestId('banc-twin6', {}, LONG)
    expect(bloc.textContent).toContain('twin6-ouverte@1.0.0 sur « Fixture embarquée : Maya, 3 journées » — cartographie ouverte (Twin6)')
    expect(bloc.textContent).toContain('3 feuille(s)')
    // Portfolio ENTIER (3 feuilles « ### AAAA-MM-JJ »), pas un run par jour.
    expect(executerTwin6Fn).toHaveBeenCalledTimes(1)
    expect(executerTwin6Fn.mock.calls[0][0].portfolio.match(/^### \d{4}-\d{2}-\d{2}$/gm)).toHaveLength(3)
    // Alerte avant run (drapeau reserved) ET alerte définitive au run (paquet chargé).
    const notes = screen.getAllByRole('note').map((n) => n.textContent)
    expect(notes.some((t) => t.includes('paquet Twin6 réservé'))).toBe(true)
    expect(notes.some((t) => t.includes('paquet Twin6 : les fiches P1..P7'))).toBe(true)
  })

  it('UC-PRO-05-F15 — A10 : interruption volontaire pendant le 3e run — statut neutre et rapport partiel', async () => {
    const llm = serviceHumanome()
    const routes = { ...bancRoutes(), ...llm.routes }
    const repondre = routes['POST api/llm']
    let appels = 0
    routes['POST api/llm'] = (req) => {
      appels += 1
      if (appels <= 16) return repondre(req)
      // Run 3 : le fournisseur « traîne » jusqu'à l'interruption.
      return new Promise((resolve, reject) => {
        req.init.signal?.addEventListener('abort', () => reject(new DOMException('Interrompu', 'AbortError')))
      })
    }
    stubNetwork(routes)
    openBanc()
    await ready()
    fireEvent.click(screen.getByRole('radio', { name: /Multi-run/ }))
    fireEvent.change(screen.getByLabelText('Nombre de runs'), { target: { value: '3' } })
    choisirJournee('2026-01-05')
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))

    // Le 3e run a commencé (17e appel en cours) : le promptologue interrompt.
    await waitFor(() => expect(appels).toBe(17), LONG)
    // Mode « Service humanome » : l'indicateur de phase écrase la progression
    // « Run i/n — Jour x/y » (anomalie AN-2 de la fiche).
    expect(screen.getByText('Préparation (llm)…')).toBeDefined()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Interrompre' }))
    })
    expect(await screen.findByText('Run interrompu — rapport partiel affiché.', {}, LONG)).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull() // pas une erreur
    expect(screen.getByTestId('banc-multi').textContent).toContain('Consistance : 2 runs')
    expect(screen.getByRole('note').textContent).toContain('rapport partiel sur les 2 runs achevés')
  })

  it('UC-PRO-05-F16 — A11 : carnet — configuration emblématique mémorisée SANS clé API, exportée puis rechargée', async () => {
    stubNetwork(bancRoutes())
    openBanc()
    await ready()
    fireEvent.click(screen.getByRole('radio', { name: /A\/B/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Fournisseur\/modèle distinct pour B/ }))
    const brancheB = screen.getByText('Fournisseur LLM — branche B').closest('fieldset')
    fireEvent.click(within(brancheB).getByRole('radio', { name: 'Clé personnelle' }))
    fireEvent.change(within(brancheB).getByLabelText(/Clé API/), { target: { value: 'sk-ant-SECRETE' } })
    fireEvent.change(screen.getByLabelText('Nom de la configuration'), { target: { value: 'llm-vs-llm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mémoriser la configuration actuelle' }))
    await screen.findByText('Configuration « llm-vs-llm » mémorisée.')

    // RGPD/sécurité : ni le stockage local ni l'export ne contiennent la clé.
    expect(localStorage.getItem('humanome-banc-carnet')).toContain('llm-vs-llm')
    expect(localStorage.getItem('humanome-banc-carnet')).not.toContain('sk-ant-SECRETE')
    const exported = decodeDataUrl(screen.getByRole('link', { name: 'Exporter le carnet (JSON)' }).getAttribute('href'))
    expect(JSON.stringify(exported)).not.toContain('sk-ant-SECRETE')
    expect(exported.configs[0].config).toMatchObject({ mode: 'ab', dualProvider: true, fournisseurB: { mode: 'cle' } })

    // Dériver puis recharger : la configuration revient, la clé reste celle de la session.
    fireEvent.click(screen.getByRole('radio', { name: 'Run simple' }))
    fireEvent.click(screen.getByRole('button', { name: 'Charger llm-vs-llm' }))
    await screen.findByText('Configuration chargée.')
    expect(screen.getByRole('radio', { name: /A\/B/ }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: /Fournisseur\/modèle distinct pour B/ }).checked).toBe(true)
  })

  it('UC-PRO-05-F17 — A12 : portfolio LOCAL du navigateur comme portfolio de test', async () => {
    const llm = serviceHumanome()
    stubNetwork({ ...bancRoutes(), ...llm.routes })
    const portfolioStore = {
      list: vi.fn(async () => [
        {
          id: 'p1',
          titre: 'Mon journal',
          segments: [{ date: '2026-01-07', texte: 'Texte local du 7 janvier (jamais envoyé au stockage serveur).' }],
        },
      ]),
    }
    render(<PromptologueView section="banc-essai" deps={{ benchDeps: { portfolioStore } }} />)
    await ready()
    const portfolio = screen.getByLabelText('Portfolio de test')
    await waitFor(() => expect([...portfolio.options].map((o) => o.value)).toContain('p1'))
    fireEvent.change(portfolio, { target: { value: 'p1' } })
    expect(screen.getByText(/Tout le journal \(1 journée\(s\)\)/)).toBeDefined()
    await lancer()

    const bloc = await screen.findByTestId('banc-simple', {}, LONG)
    expect(bloc.textContent).toContain('sur « Mon journal »')
    expect(llm.prompts[0]).toContain('Texte local du 7 janvier')
  })
})

describe('UC-PRO-05 — scénarios d’erreur', () => {
  it('UC-PRO-05-F18 — E1 : sans session ou sans rôle promptologue, le banc n’est pas proposé ni chargé', async () => {
    const net = stubNetwork(bancRoutes({ user: null }))
    openBanc()
    expect(await screen.findByTestId('promptologue-anonyme', {}, LONG)).toBeDefined()
    cleanup()

    stubNetwork(bancRoutes({ user: { id: 3, email: 'a@example.org', displayName: 'Maya', roles: ['apprenant'] } }))
    openBanc()
    expect((await screen.findByTestId('promptologue-sans-role', {}, LONG)).textContent).toContain('réservé au rôle')
    expect(screen.queryByLabelText('Version à tester')).toBeNull()
    expect(net.calls('api/prompt-packages')).toHaveLength(0)
  })

  it('UC-PRO-05-F19 — E2 : période inversée — refus avant tout appel LLM', async () => {
    const llm = serviceHumanome()
    stubNetwork({ ...bancRoutes(), ...llm.routes })
    openBanc()
    await ready()
    fireEvent.click(screen.getByRole('radio', { name: /Une période/ }))
    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-01-07' } })
    fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2026-01-05' } })
    await lancer()

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Période invalide : la date de début est postérieure à la date de fin.',
    )
    expect(llm.prompts).toHaveLength(0)
  })

  it('UC-PRO-05-F20 — E3 : température hors bornes — refus avant tout appel LLM', async () => {
    const llm = serviceHumanome()
    stubNetwork({ ...bancRoutes(), ...llm.routes })
    openBanc()
    await ready()
    fireEvent.change(screen.getByLabelText('Température'), { target: { value: '2,5' } })
    await lancer()

    expect((await screen.findByRole('alert')).textContent).toContain('Température invalide : nombre entre 0 et 2')
    expect(llm.prompts).toHaveLength(0)
  })

  it('UC-PRO-05-F21 — E4 : référence absente puis référence invalide au schéma', async () => {
    const llm = serviceHumanome()
    stubNetwork({ ...bancRoutes(), ...llm.routes })
    openBanc()
    await ready()
    fireEvent.click(screen.getByRole('radio', { name: /Vs référence importée/ }))
    await lancer()
    expect((await screen.findByRole('alert')).textContent).toBe('Importez d’abord un JSON de référence (côté B).')

    const invalide = clone(DAY_DOCS['2026-01-05'])
    invalide.poles = invalide.poles.slice(0, 6) // 6 pôles, sans marqueur de périmètre
    const content = JSON.stringify(invalide)
    const file = new File([content], 'forge.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => content })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('JSON de référence'), { target: { files: [file] } })
    })
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /^JSON de référence : document du 2026-01-05 invalide au schéma/,
    )
    expect(llm.prompts).toHaveLength(0)
  })

  it('UC-PRO-05-F22 — E5 : paquet Twin6 hors run simple, ou avec périmètre restreint — refus explicite', async () => {
    const llm = serviceHumanome()
    stubNetwork({
      ...bancRoutes({
        published: [{ id: 'twin6-ouverte', version: '1.0.0', reserved: true }],
        packages: { 'twin6-ouverte/1.0.0': twin6Package() },
      }),
      ...llm.routes,
    })
    openBanc()
    const select = await ready()
    await waitFor(() => expect(select.options).toHaveLength(2))
    fireEvent.click(screen.getByRole('radio', { name: /Multi-run/ }))
    fireEvent.change(screen.getByLabelText('Version à tester'), { target: { value: 'pub:twin6-ouverte@1.0.0' } })
    await lancer()
    expect((await screen.findByRole('alert')).textContent).toBe(TWIN6_MODE_NOTE)

    fireEvent.click(screen.getByRole('radio', { name: 'Run simple' }))
    fireEvent.change(screen.getByLabelText('Périmètre du référentiel'), { target: { value: 'pole:3' } })
    await lancer()
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(TWIN6_PERIMETRE_NOTE))
    expect(llm.prompts).toHaveLength(0)
  })

  it('UC-PRO-05-F23 — E6 : périmètre absent du référentiel de la branche B — refus avant la branche A', async () => {
    const llm = serviceHumanome()
    const v8 = clone(referentielFixture)
    v8.version = '8.0.0'
    v8.competences = v8.competences.filter((c) => c.code !== '2.01')
    stubNetwork({
      // Forme attendue par le front ({version}) — voir l'anomalie AN-1 de la fiche.
      ...bancRoutes({ referentielVersions: [{ version: '8.0.0', label: 'RESPIRE v8' }], referentiels: { '8.0.0': v8 } }),
      ...llm.routes,
    })
    openBanc()
    await ready()
    fireEvent.click(screen.getByRole('radio', { name: /A\/B/ }))
    fireEvent.change(screen.getByLabelText('Périmètre du référentiel'), { target: { value: 'comp:2.01' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Référentiel distinct pour B/ }))
    const refB = screen.getByLabelText('Version du référentiel (B)')
    await waitFor(() => expect([...refB.options].map((o) => o.value)).toContain('8.0.0'))
    fireEvent.change(refB, { target: { value: '8.0.0' } })
    await lancer()

    expect((await screen.findByRole('alert')).textContent).toContain(
      'n’existe pas dans le référentiel de la branche B (8.0.0)',
    )
    expect(llm.prompts).toHaveLength(0)
  })

  it('UC-PRO-05-F24 — E7 : échec du fournisseur ou clé manquante — message, résultat précédent conservé', async () => {
    const llm = serviceHumanome()
    const routes = { ...bancRoutes(), ...llm.routes }
    const repondre = routes['POST api/llm']
    let panne = false
    routes['POST api/llm'] = (req) =>
      panne ? jsonResponse(429, { error: 'Quota de démonstration atteint' }) : repondre(req)
    stubNetwork(routes)
    openBanc()
    await ready()
    choisirJournee('2026-01-05')
    await lancer()
    await screen.findByTestId('banc-simple', {}, LONG)

    panne = true
    await lancer()
    const alerte = await screen.findByRole('alert', {}, LONG)
    expect(alerte.textContent).toMatch(/^extractDay : pôle 1 \(2026-01-05\) — .*HTTP 429/)
    expect(screen.getByTestId('banc-simple')).toBeDefined() // le résultat précédent reste affiché

    // Clé personnelle choisie mais vide : refus avant tout appel.
    const avant = llm.prompts.length
    fireEvent.click(screen.getByRole('radio', { name: 'Clé personnelle' }))
    await lancer()
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Une clé API Anthropic (Claude) est requise pour lancer ce run.'),
    )
    expect(llm.prompts.length).toBe(avant)
  })

  it('UC-PRO-05-F25 — E8 : portfolio local sans journée datée — alerte et refus', async () => {
    const llm = serviceHumanome()
    stubNetwork({ ...bancRoutes(), ...llm.routes })
    const portfolioStore = {
      list: vi.fn(async () => [{ id: 'p2', titre: 'Brouillon non daté', segments: [{ date: null, texte: 'x' }] }]),
    }
    render(<PromptologueView section="banc-essai" deps={{ benchDeps: { portfolioStore } }} />)
    await ready()
    const portfolio = screen.getByLabelText('Portfolio de test')
    await waitFor(() => expect([...portfolio.options].map((o) => o.value)).toContain('p2'))
    fireEvent.change(portfolio, { target: { value: 'p2' } })
    expect(screen.getByRole('note').textContent).toContain('aucun segment daté')
    await lancer()

    expect((await screen.findByRole('alert')).textContent).toBe('Ce portfolio local n’a aucun segment daté.')
    expect(llm.prompts).toHaveLength(0)
  })
})

describe('UC-PRO-05 — anomalies constatées (comportement ACTUEL figé)', () => {
  it('UC-PRO-05-F26 — anomalie AN-1 : avec la forme RÉELLE de GET referentiel/versions ({semver}), aucune version publiée n’est proposée', async () => {
    // COMPORTEMENT ACTUEL, documenté comme anomalie : l'API renvoie des
    // métadonnées {semver, label, …} (ReferentielRepository::metadata) alors que
    // le banc filtre les entrées sur une clé « version ». Seule la version
    // embarquée reste sélectionnable. À corriger côté front ou API (fiche, AN-1).
    stubNetwork(
      bancRoutes({
        published: [{ id: 'aurora-lab', version: '2.0.0', reserved: false }],
        referentielVersions: [
          { id: 2, referentielId: 'respire', semver: '7.1.0', label: 'RESPIRE v7.1.0', status: 'published' },
          { id: 1, referentielId: 'respire', semver: '7.0.0', label: 'RESPIRE v7', status: 'published' },
        ],
      }),
    )
    openBanc()
    const versions = await ready()
    // Les sources sont chargées ensemble (Promise.all) : la publiée est visible…
    await waitFor(() => expect(versions.options).toHaveLength(2))
    // … mais les versions publiées du référentiel ont été écartées.
    const select = screen.getByLabelText('Version du référentiel')
    expect([...select.options].map((o) => o.value)).toEqual(['embarque'])
  })
})
