// UC-APP-06 — Exporter et importer son archive complète : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-06-exporter-importer-archive.md
//
// La section « Mes données » du tableau de bord (#/espace) est jouée dans
// l'application ENTIÈRE (<App/>), sans couture de test : l'archive est
// assemblée depuis les stores réels (IndexedDB factice), validée par le
// moteur puis « téléchargée » (Blob + lien, capturés) ; l'import passe par le
// vrai champ fichier. Le réseau simulé ne sert qu'aux recherches en lecture
// seule (compte, paquet de prompts, documents de masse, référentiel).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { createCartoStore } from '../../../src/lib/carto-store.js'
import { createPortfolioStore } from '../../../src/lib/portfolio-store.js'
import { validateDocument } from '@engine/validation.js'
import { segmentText } from '@engine/portfolio/segment.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import packageFixture from '../../../../schemas/fixtures/prompt-package-exemple.json'
import exemple from '../../../../schemas/fixtures/archive-export-exemple.json'
import day05 from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import day06 from '../../../../schemas/fixtures/cartographie-jour-2026-01-06.json'
import day07 from '../../../../schemas/fixtures/cartographie-jour-2026-01-07.json'
import merge3 from '../../../../schemas/fixtures/cartographie-merge-3-jours.json'
import { createFakeIndexedDb } from '../support/appl-fake-indexeddb.js'
import { jsonResponse, routedFetch } from '../support/appl-http.js'
import { portfolioText } from '../support/appl-llm.js'

const idb = createFakeIndexedDb()
const USER = { id: 7, email: 'maya@example.org', displayName: 'Maya', roles: ['apprenant'] }
const BUILTIN = { id: 'aurora-v3-reconstruit', version: '1.0.0' }
const RUN_META = {
  portfolioId: 'p-1',
  portfolioTitre: 'Journal de Maya',
  mode: 'humanome',
  provider: 'humanome',
  model: 'impose par la plateforme',
  jours: 3,
  generatedAt: '2026-01-08T09:59:00.000Z',
  usage: { inputTokens: 24000, outputTokens: 6000, mesures: 24 },
}

/** Ce qu'a laissé un run (UC-APP-02) dont la fusion a été copiée sur le serveur. */
async function seedAfterRun({ extra = [] } = {}) {
  const texte = portfolioText()
  await createPortfolioStore().create({ titre: 'Journal de Maya', texte, segments: segmentText(texte, { today: '2026-07-12' }) })
  const store = createCartoStore()
  const trace = { promptPackage: BUILTIN, referentiel: { id: 'respire', version: '7.0.0' }, runMeta: RUN_META }
  for (const doc of [day05, day06, day07]) {
    await store.saveCartography({ type: 'jour', titre: `Journée ${doc.date} — Journal de Maya`, document: doc, ...trace })
  }
  await store.saveCartography({ type: 'merge', titre: 'Cartographie — Journal de Maya', document: merge3, serverId: 42, visibility: 'publique', ...trace })
  for (const entry of extra) await store.saveCartography(entry)
}

function stubNetwork({ me = USER, offline = false, packages = [BUILTIN], mass = [] } = {}) {
  const fetchMock = offline
    ? Object.assign(vi.fn(async () => { throw new TypeError('Failed to fetch') }), { calls: [] })
    : routedFetch([
        ['api/auth/me', () => (me ? jsonResponse(200, { user: me, csrfToken: 'csrf' }) : jsonResponse(401, { error: 'Authentification requise' }))],
        ['api/prompt-packages', () => jsonResponse(200, packages)],
        [/^api\/prompt-packages\/[^/]+\/[^/]+$/, (url) => {
          const [, id, version] = /^api\/prompt-packages\/([^/]+)\/([^/]+)$/.exec(url)
          return jsonResponse(200, { ...packageFixture, id: decodeURIComponent(id), version: decodeURIComponent(version) })
        }],
        ['api/mes-documents-masse', () => (me ? jsonResponse(200, { documents: mass }) : jsonResponse(401, { error: 'Authentification requise' }))],
      ])
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Capture le téléchargement (Blob + <a download>) et relit le fichier produit. */
function captureDownloads() {
  const files = []
  URL.createObjectURL = vi.fn((blob) => {
    files.push({ blob })
    return `blob:${files.length}`
  })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    files.at(-1).name = this.download
  })
  return {
    files,
    async json(index = 0) {
      const text = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.readAsText(files[index].blob)
      })
      return JSON.parse(text)
    },
  }
}

function openDashboard() {
  window.location.hash = '#/espace'
  return render(<App lib={fakeLib} fetchMeFn={async () => ({ user: USER })} />)
}

async function exportAll() {
  await screen.findByRole('region', { name: 'Mes données' })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Exporter toutes mes données' }))
  })
}

async function importFile(content, name = 'archive.json') {
  const file = new File([content], name, { type: 'application/json' })
  file.text = async () => content // jsdom n'implémente pas File.prototype.text()
  await screen.findByRole('region', { name: 'Mes données' })
  await act(async () => {
    fireEvent.change(screen.getByTestId('archive-file-input'), { target: { files: [file] } })
  })
}

/** Message de la section « Mes données » (role status en succès, alert en échec). */
const notice = () =>
  waitFor(() => {
    const el = screen.getByRole('region', { name: 'Mes données' }).querySelector('.notice-info, .notice-error')
    if (!el) throw new Error('aucun message dans « Mes données »')
    return el
  })

beforeEach(() => {
  resetApiClient()
  vi.stubGlobal('indexedDB', idb.factory)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  idb.reset()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-APP-06 — scénario nominal : exporter puis restaurer sur un navigateur neuf', () => {
  it('UC-APP-06-F01 — nominal (export) : archive autoporteuse validée par le moteur, téléchargée, lectures seules', async () => {
    await seedAfterRun()
    const fetchMock = stubNetwork()
    const downloads = captureDownloads()
    openDashboard()

    await exportAll()

    expect((await notice()).textContent).toMatch(
      /^Archive téléchargée \(humanome-export-\d{4}-\d{2}-\d{2}\.json\) : 1 portfolio\(s\), 4 cartographie\(s\)\.$/,
    )
    expect(downloads.files).toHaveLength(1)
    expect(downloads.files[0].name).toMatch(/^humanome-export-\d{4}-\d{2}-\d{2}\.json$/)
    expect(downloads.files[0].blob.type).toBe('application/json')
    const archive = await downloads.json()
    expect(validateDocument('archive-export', archive)).toEqual({ valid: true, errors: [] })
    expect(archive.account).toEqual({ roles: ['apprenant'], email: 'maya@example.org', displayName: 'Maya' })
    expect(archive.portfolios[0]).toMatchObject({ titre: 'Journal de Maya', source: 'colle' })
    expect(archive.portfolios[0].segmentation.map((s) => s.date)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    expect(archive.referentiels).toHaveLength(1)
    expect(archive.promptPackages.map((p) => `${p.id}@${p.version}`)).toEqual(['aurora-v3-reconstruit@1.0.0'])
    expect(archive.cartographies.map((c) => c.type).sort()).toEqual(['jour', 'jour', 'jour', 'merge'])
    expect(archive.cartographies.every((c) => c.promptPackageId === 'aurora-v3-reconstruit')).toBe(true)
    // Ni visibilité ni copie serveur dans l'archive (choix non transférés).
    expect(JSON.stringify(archive.cartographies)).not.toMatch(/serverId|visibility/)
    // RGPD : l'archive ne transite pas par le serveur ; seules des lectures.
    expect(fetchMock.calls.every((c) => (c.init.method ?? 'GET') === 'GET')).toBe(true)
    expect(fetchMock.calls.some((c) => (c.init.body ?? '').includes('Journée du 2026-01-05'))).toBe(false)
  })

  it('UC-APP-06-F02 — nominal (import) : un navigateur neuf restaure portfolios et cartographies, privées et locales', async () => {
    await seedAfterRun()
    stubNetwork()
    const downloads = captureDownloads()
    const first = openDashboard()
    await exportAll()
    await notice()
    const archiveText = JSON.stringify(await downloads.json())
    first.unmount()

    // Autre navigateur : stockage local vide, pas de session.
    idb.reset()
    stubNetwork({ me: null })
    openDashboard()
    expect(await screen.findByText(/Aucune cartographie pour l’instant\./)).toBeDefined()
    await importFile(archiveText, 'humanome-export.json')

    expect((await notice()).textContent).toBe(
      'Import terminé : 1 portfolio(s) et 4 cartographie(s) restaurés (les doublons sont ignorés).',
    )
    await waitFor(() => expect(screen.getAllByTestId('carto-item')).toHaveLength(4))
    expect(screen.queryByText('copie serveur')).toBeNull()
    expect(screen.getAllByRole('combobox').map((s) => s.value)).toEqual(['privee', 'privee', 'privee', 'privee'])
    const [portfolio] = idb.values('humanome-portfolios', 'portfolios')
    expect(portfolio).toMatchObject({ titre: 'Journal de Maya', source: 'colle' })
    expect(portfolio.segments.map((s) => s.date)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
  })
})

describe('UC-APP-06 — scénarios alternatifs', () => {
  it('UC-APP-06-F03 — A1 : hors ligne ou sans compte : archive anonyme, référentiel embarqué, sans paquet', async () => {
    await seedAfterRun()
    stubNetwork({ offline: true })
    const downloads = captureDownloads()
    openDashboard()

    await exportAll()

    expect((await notice()).textContent).toContain('1 portfolio(s), 4 cartographie(s)')
    const archive = await downloads.json()
    expect(archive.account).toBeNull()
    expect(archive.promptPackages).toEqual([])
    expect(archive.referentiels).toHaveLength(1)
    expect(validateDocument('archive-export', archive).valid).toBe(true)
  })

  it('UC-APP-06-F04 — A2 : documents produits en cohorte (masse) inclus dans l’export (RGPD art. 15/20)', async () => {
    stubNetwork({
      mass: [
        { jobId: 11, runId: 4, cohorteId: 2, cohorte: 'Terminale B', date: '2026-01-05', promptPackage: BUILTIN, referentiel: { id: 'respire', version: '7.0.0' }, document: day05 },
      ],
    })
    const downloads = captureDownloads()
    openDashboard()

    await exportAll()

    expect((await notice()).textContent).toContain('0 portfolio(s), 1 cartographie(s)')
    const [masse] = (await downloads.json()).cartographies
    expect(masse).toMatchObject({ id: 'masse-4-11', type: 'jour', promptPackageId: 'aurora-v3-reconstruit' })
    expect(masse.runMeta.modele).toBe('cartographie de masse — cohorte « Terminale B »')
  })

  it('UC-APP-06-F05 — A3 : réimporter la même archive ne restaure rien (doublons par contenu)', async () => {
    stubNetwork()
    openDashboard()
    await importFile(JSON.stringify(exemple))
    expect((await notice()).textContent).toContain('1 portfolio(s) et 1 cartographie(s) restaurés')

    await importFile(JSON.stringify(exemple))
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Mes données' }).querySelector('.notice-info').textContent).toBe(
        'Import terminé : 0 portfolio(s) et 0 cartographie(s) restaurés (les doublons sont ignorés).',
      ),
    )
    expect(idb.values('humanome-cartographies', 'cartographies')).toHaveLength(1)
  })

  it('UC-APP-06-F06 — A4 : archive d’une autre instance (fixture) : titres dérivés, traçabilité conservée', async () => {
    stubNetwork()
    openDashboard()
    await importFile(JSON.stringify(exemple))

    const item = await screen.findByTestId('carto-item')
    expect(within(item).getByText('Parcours du 05/01/2026 au 07/01/2026')).toBeDefined()
    const [stored] = idb.values('humanome-cartographies', 'cartographies')
    expect(stored).toMatchObject({ promptPackage: { id: 'aurora-demo', version: '1.0.0' }, referentiel: { id: 'respire', version: '7.0.0' }, serverId: null })
  })
})

describe('UC-APP-06 — scénarios d’erreur', () => {
  it.each([
    ['E1', '{ "kind": "archive-export", ', 'Ce fichier n’est pas un JSON valide.'],
    ['E2', JSON.stringify(merge3), 'Document non reconnu : une archive humanome doit porter « kind: archive-export »'],
    ['E3', JSON.stringify({ ...exemple, cartographies: [{ ...exemple.cartographies[0], type: 'jour' }] }), 'Archive non conforme au schéma archive-export'],
  ])('UC-APP-06-F07 — %s : fichier refusé, message, rien d’importé', async (_, content, message) => {
    stubNetwork()
    openDashboard()

    await importFile(content)

    const alert = await notice()
    expect(alert.getAttribute('role')).toBe('alert')
    expect(alert.textContent).toContain(message)
    expect(idb.values('humanome-cartographies', 'cartographies')).toEqual([])
    expect(idb.values('humanome-portfolios', 'portfolios')).toEqual([])
  })

  it('UC-APP-06-F08 — [comportement ACTUEL, anomalie A-03] E4 : une analyse Twin9 locale bloque TOUT l’export', async () => {
    await seedAfterRun({ extra: [{ type: 'twin9', titre: 'Analyse approfondie', document: { journal_id: 'demo', competences: {} } }] })
    stubNetwork()
    const downloads = captureDownloads()
    openDashboard()

    await exportAll()

    const alert = await notice()
    expect(alert.getAttribute('role')).toBe('alert')
    expect(alert.textContent).toMatch(/n’est pas conforme au schéma archive-export .* export annulé, rien n’a été téléchargé\./)
    expect(downloads.files).toHaveLength(0)
  })
})

describe('UC-APP-06 — anomalies figées', () => {
  it('UC-APP-06-F09 — [comportement ACTUEL, anomalie A-01] « prompts utilisés » = 1er paquet publié, pas celui des cartographies', async () => {
    await seedAfterRun()
    const fetchMock = stubNetwork({ packages: [{ id: 'aurora-demo', version: '1.0.0' }, BUILTIN, { id: 'aurora-lab', version: '2.0.0' }] })
    const downloads = captureDownloads()
    openDashboard()

    await exportAll()
    await notice()

    const archive = await downloads.json()
    expect(archive.cartographies.every((c) => c.promptPackageId === 'aurora-v3-reconstruit')).toBe(true)
    expect(archive.promptPackages.map((p) => p.id)).toEqual(['aurora-demo'])
    expect(fetchMock.calls.map((c) => c.url)).toContain('api/prompt-packages/aurora-demo/1.0.0')
    expect(fetchMock.calls.map((c) => c.url)).not.toContain('api/prompt-packages/aurora-v3-reconstruit/1.0.0')
  })

  it('UC-APP-06-F10 — [comportement ACTUEL, anomalie A-02] le modèle et les tokens mesurés par le run ne passent pas dans l’archive', async () => {
    await seedAfterRun()
    stubNetwork()
    const downloads = captureDownloads()
    openDashboard()

    await exportAll()
    await notice()

    const archive = await downloads.json()
    for (const carto of archive.cartographies) {
      expect(carto.runMeta.modele).toBe('inconnu')
      expect(carto.runMeta).not.toHaveProperty('tokens')
    }
  })

  it('UC-APP-06-F11 — [comportement ACTUEL, anomalie A-04] après import, « Mes portfolios » n’est rafraîchi qu’au rechargement', async () => {
    stubNetwork()
    const first = openDashboard()
    const portfolios = await screen.findByRole('region', { name: 'Mes portfolios' })
    await within(portfolios).findByText(/Aucun portfolio local pour l’instant\./)

    await importFile(JSON.stringify(exemple))
    await notice()
    expect(within(portfolios).getByText(/Aucun portfolio local pour l’instant\./)).toBeDefined()

    first.unmount()
    openDashboard()
    expect((await screen.findByTestId('espace-portfolios')).textContent).toContain(exemple.portfolios[0].titre)
  })
})
