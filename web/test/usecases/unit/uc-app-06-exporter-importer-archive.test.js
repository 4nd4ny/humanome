// UC-APP-06 — Exporter et importer son archive complète : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-06-exporter-importer-archive.md
//
// web/src/lib/archive.js appelé directement : assemblage (projection des
// portfolios, des cartographies et de leurs métadonnées de run), recherches
// en lecture seule (compte, paquet de prompts, documents de masse) par un
// fetch simulé, restauration (segments reconstruits, marqueurs neutres,
// titres, dédoublonnage) et refus des fichiers invalides.
import { describe, expect, it, vi } from 'vitest'
import { validateDocument } from '@engine/validation.js'
import {
  ARCHIVE_SCHEMA_VERSION,
  UNKNOWN_ID,
  UNKNOWN_VERSION,
  exportArchive,
  importArchive,
} from '../../../src/lib/archive.js'
import { createMemoryAdapter as cartoMemory, createCartoStore } from '../../../src/lib/carto-store.js'
import { createMemoryAdapter as portfolioMemory, createPortfolioStore } from '../../../src/lib/portfolio-store.js'
import referentiel from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import packageFixture from '../../../../schemas/fixtures/prompt-package-exemple.json'
import day05 from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import merge3 from '../../../../schemas/fixtures/cartographie-merge-3-jours.json'
import exemple from '../../../../schemas/fixtures/archive-export-exemple.json'
import { jsonResponse, routedFetch } from '../support/appl-http.js'

function stores() {
  return {
    cartoStore: createCartoStore(cartoMemory(), { now: () => '2026-01-08T10:00:00.000Z' }),
    portfolioStore: createPortfolioStore(portfolioMemory(), { now: () => '2026-01-08T09:00:00.000Z' }),
  }
}

/** Dépendances hors réseau par défaut ; chaque test surcharge ce qu'il exerce. */
function offline(extra = {}) {
  return {
    getAccount: async () => null,
    getReferentiel: async () => ({ doc: referentiel, origin: 'bundled' }),
    getPromptPackages: async () => [],
    getMassDocuments: async () => [],
    now: () => new Date('2026-07-12T08:30:00.000Z'),
    download: vi.fn(),
    ...extra,
  }
}

describe('UC-APP-06 — export : assemblage de l’archive (étapes 2-4)', () => {
  it('UC-APP-06-U07 — portfolios : texte intégral, segmentation datée seulement, source et titre normalisés', async () => {
    const { cartoStore, portfolioStore } = stores()
    await portfolioStore.create({
      titre: undefined,
      source: 'inconnue',
      texte: 'Préambule.\n## 2026-01-05\nAtelier.',
      segments: [
        { date: null, texte: 'Préambule.\n', debut: 0, fin: 11 },
        { date: '2026-01-05', titre: '2026-01-05', texte: '## 2026-01-05\nAtelier.', debut: 11, fin: 33 },
        { date: '2026-01-06', texte: 'hors bornes', debut: 40, fin: 30 },
      ],
    })
    const deps = offline()

    const { archive, filename, counts } = await exportArchive({ cartoStore, portfolioStore, ...deps })

    expect(filename).toBe('humanome-export-2026-07-12.json')
    expect(counts).toEqual({ portfolios: 1, cartographies: 0 })
    expect(archive.portfolios[0]).toMatchObject({
      titre: 'Portfolio sans titre',
      source: 'colle',
      texte: 'Préambule.\n## 2026-01-05\nAtelier.',
      segmentation: [{ date: '2026-01-05', debut: 11, fin: 33 }],
    })
    expect(archive).toMatchObject({ schemaVersion: ARCHIVE_SCHEMA_VERSION, kind: 'archive-export', account: null, audit: [] })
    expect(deps.download).toHaveBeenCalledWith(filename, JSON.stringify(archive, null, 2))
  })

  it('UC-APP-06-U08 — [comportement ACTUEL, anomalie A-02] runMeta écrit par l’assistant : modèle et tokens perdus à l’export', async () => {
    const { cartoStore, portfolioStore } = stores()
    // Forme exacte écrite par RunWizard (UC-APP-02).
    await cartoStore.saveCartography({
      type: 'jour',
      titre: 'Journée 2026-01-05 — Journal',
      document: day05,
      promptPackage: { id: 'aurora-v3-reconstruit', version: '1.0.0' },
      referentiel: { id: 'respire', version: '7.0.0' },
      runMeta: { mode: 'cle', provider: 'anthropic', model: 'claude-sonnet-4-6', jours: 1, generatedAt: '2026-01-08T09:59:00.000Z', usage: { inputTokens: 1200, outputTokens: 300, mesures: 8 } },
    })
    // Forme du schéma d'archive : conservée.
    await cartoStore.saveCartography({
      type: 'merge',
      titre: 'Import',
      document: merge3,
      runMeta: { modele: 'claude-haiku-4-5', dateRun: '2026-01-07T18:00:00Z', tokens: { entree: 10, sortie: -1, total: 12 }, coutEstime: 0.02 },
    })

    const { archive } = await exportArchive({ cartoStore, portfolioStore, ...offline() })

    const [jour] = archive.cartographies.filter((c) => c.type === 'jour')
    expect(jour.runMeta).toEqual({ modele: UNKNOWN_ID, dateRun: '2026-01-08T10:00:00.000Z' })
    const [fusion] = archive.cartographies.filter((c) => c.type === 'merge')
    expect(fusion.runMeta).toEqual({ modele: 'claude-haiku-4-5', dateRun: '2026-01-07T18:00:00Z', tokens: { entree: 10, total: 12 }, coutEstime: 0.02 })
    expect(fusion).toMatchObject({ promptPackageId: UNKNOWN_ID, promptPackageVersion: UNKNOWN_VERSION, referentielId: 'respire' })
    expect(validateDocument('archive-export', archive).valid).toBe(true)
  })

  it('UC-APP-06-U09 — recherches réseau en lecture seule : compte filtré, paquet (1er publié), documents de masse', async () => {
    const fetchFn = routedFetch([
      ['api/auth/me', () => jsonResponse(200, { user: { id: 7, email: 'maya@example.org', displayName: 'Maya', roles: ['apprenant'], hasAvatar: true }, csrfToken: 'c' })],
      ['api/prompt-packages', () => jsonResponse(200, [{ id: 'aurora-demo', version: '1.0.0' }, { id: 'aurora-lab', version: '2.0.0' }])],
      ['api/prompt-packages/aurora-demo/1.0.0', () => jsonResponse(200, packageFixture)],
      ['api/mes-documents-masse', () => jsonResponse(200, { documents: [{ jobId: 3, runId: 2, cohorteId: 1, cohorte: 'Terminale B', date: '2026-01-05', promptPackage: { id: 'aurora-demo', version: '1.0.0' }, referentiel: { id: 'respire', version: '7.0.0' }, document: day05 }] })],
    ])
    const { cartoStore, portfolioStore } = stores()

    const { archive, counts } = await exportArchive({
      cartoStore,
      portfolioStore,
      fetchFn,
      getReferentiel: async () => ({ doc: referentiel }),
      download: vi.fn(),
      now: () => new Date('2026-07-12T08:30:00.000Z'),
    })

    expect(archive.account).toEqual({ roles: ['apprenant'], email: 'maya@example.org', displayName: 'Maya' })
    expect(archive.promptPackages.map((p) => `${p.id}@${p.version}`)).toEqual(['aurora-demo@1.0.0'])
    expect(archive.cartographies).toEqual([
      expect.objectContaining({
        id: 'masse-2-3',
        type: 'jour',
        promptPackageId: 'aurora-demo',
        runMeta: { modele: 'cartographie de masse — cohorte « Terminale B »', dateRun: '2026-07-12T08:30:00.000Z' },
      }),
    ])
    expect(counts.cartographies).toBe(1)
    expect(fetchFn.calls.every((c) => (c.init.method ?? 'GET') === 'GET')).toBe(true)
  })

  it('UC-APP-06-U10 — archive non conforme (analyse Twin9 locale) : exception, AUCUN téléchargement', async () => {
    const { cartoStore, portfolioStore } = stores()
    await cartoStore.saveCartography({ type: 'twin9', titre: 'Analyse Twin9', document: { journal_id: 'demo', competences: {} } })
    const deps = offline()

    const failure = await exportArchive({ cartoStore, portfolioStore, ...deps }).catch((e) => e)

    expect(failure.message).toMatch(/^L’archive assemblée n’est pas conforme au schéma archive-export \(\d+ erreurs?\) : export annulé, rien n’a été téléchargé\.$/)
    expect(failure.validationErrors.length).toBeGreaterThan(0)
    expect(deps.download).not.toHaveBeenCalled()
  })
})

describe('UC-APP-06 — import : restauration dans les stores locaux (A1)', () => {
  it('UC-APP-06-U11 — segments reconstruits, identifiants régénérés, privée sans copie serveur, marqueurs neutres → null', async () => {
    const { cartoStore, portfolioStore } = stores()
    const archive = structuredClone(exemple)
    archive.cartographies = [
      ...archive.cartographies,
      { ...archive.cartographies[0], id: 'autre', document: day05, type: 'jour', promptPackageId: UNKNOWN_ID, promptPackageVersion: UNKNOWN_VERSION, referentielId: UNKNOWN_ID, referentielVersion: UNKNOWN_VERSION },
    ]

    const report = await importArchive(JSON.stringify(archive), { cartoStore, portfolioStore })

    expect(report).toEqual({ portfolios: 1, cartographies: 2 })
    const [portfolio] = await portfolioStore.list()
    const source = exemple.portfolios[0]
    expect(portfolio.id).not.toBe(source.id)
    expect(portfolio.segments).toEqual(
      source.segmentation.map((s) => ({ date: s.date, texte: source.texte.slice(s.debut, s.fin), debut: s.debut, fin: s.fin })),
    )
    const cartos = await cartoStore.listCartographies()
    expect(cartos.every((c) => c.visibility === 'privee' && c.serverId === null)).toBe(true)
    // L'exemple embarque exactement la fusion de la fixture 3 jours.
    expect(cartos.find((c) => c.type === 'merge')).toMatchObject({
      titre: 'Parcours du 05/01/2026 au 07/01/2026',
      promptPackage: { id: 'aurora-demo', version: '1.0.0' },
      referentiel: { id: 'respire', version: '7.0.0' },
      document: merge3,
    })
    expect(cartos.find((c) => c.type === 'jour')).toMatchObject({
      titre: 'Journée du 05/01/2026',
      promptPackage: null,
      referentiel: null,
    })
  })

  it('UC-APP-06-U12 — doublons ignorés par contenu, y compris à l’intérieur d’une même archive', async () => {
    const { cartoStore, portfolioStore } = stores()
    const archive = structuredClone(exemple)
    archive.portfolios = [archive.portfolios[0], { ...archive.portfolios[0], id: 'copie', titre: 'Copie' }]

    expect(await importArchive(JSON.stringify(archive), { cartoStore, portfolioStore })).toEqual({ portfolios: 1, cartographies: 1 })
    expect(await importArchive(JSON.stringify(archive), { cartoStore, portfolioStore })).toEqual({ portfolios: 0, cartographies: 0 })
  })

  it.each([
    ['{ pas du json', 'Ce fichier n’est pas un JSON valide.'],
    [JSON.stringify(day05), 'Document non reconnu : une archive humanome doit porter « kind: archive-export »'],
    [JSON.stringify({ ...exemple, portfolios: [{ ...exemple.portfolios[0], source: 'dropbox' }] }), 'Archive non conforme au schéma archive-export (1 erreur) : rien n’a été importé.'],
  ])('UC-APP-06-U13 — fichier refusé sans rien écrire (%#)', async (text, message) => {
    const { cartoStore, portfolioStore } = stores()
    await expect(importArchive(text, { cartoStore, portfolioStore })).rejects.toThrow(message)
    expect(await portfolioStore.list()).toEqual([])
    expect(await cartoStore.listCartographies()).toEqual([])
  })
})
