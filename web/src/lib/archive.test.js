import { describe, expect, it, vi } from 'vitest'
import { validateDocument } from '@engine/validation.js'
import archiveFixture from '../../../schemas/fixtures/archive-export-exemple.json'
import dayFixture from '../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import mergeFixture from '../../../schemas/fixtures/cartographie-merge-3-jours.json'
import referentielFixture from '../../../schemas/fixtures/referentiel-respire-v7.json'
import promptPackageFixture from '../../../schemas/fixtures/prompt-package-exemple.json'
import { exportArchive, importArchive, UNKNOWN_ID, UNKNOWN_VERSION } from './archive.js'
import { createCartoStore, createMemoryAdapter } from './carto-store.js'
import { createPortfolioStore, createMemoryAdapter as createPortfolioMemoryAdapter } from './portfolio-store.js'
import masterFixture from '../../../schemas/fixtures/carto/competency-map-master-exemple.json'
import { createCartoStore as createInterfaceStore, createMemoryAdapter as createInterfaceMemoryAdapter } from '../carto/core/store.js'
import { importFiles as importIntoInterface } from '../carto/core/import.js'
import { createDataset as createInterfaceDataset } from '../carto/core/model.js'

function makeStores() {
  let tick = 0
  let seq = 0
  const options = {
    now: () => new Date(2026, 6, 1, 12, 0, tick++).toISOString(),
    id: () => `id-${++seq}`,
  }
  return {
    cartoStore: createCartoStore(createMemoryAdapter(), options),
    portfolioStore: createPortfolioStore(createPortfolioMemoryAdapter(), options),
  }
}

/** Dépendances réseau neutralisées : archive anonyme, package par défaut absent. */
function offlineDeps() {
  return {
    getAccount: async () => null,
    getReferentiel: async () => ({ doc: referentielFixture, origin: 'bundled' }),
    getPromptPackages: async () => [],
    now: () => new Date('2026-07-12T10:00:00Z'),
  }
}

describe('exportArchive', () => {
  it('assemble une archive valide au schéma et la télécharge', async () => {
    const { cartoStore, portfolioStore } = makeStores()
    await portfolioStore.create({
      titre: 'Journal',
      source: 'colle',
      texte: 'Lundi.\nMardi.',
      segments: [
        { date: '2026-01-05', texte: 'Lundi.', debut: 0, fin: 6 },
        { date: '2026-01-06', texte: 'Mardi.', debut: 7, fin: 13 },
      ],
    })
    await cartoStore.saveCartography({
      type: 'jour',
      titre: 'Journée du 05/01/2026',
      document: dayFixture,
      promptPackage: { id: 'aurora-demo', version: '1.0.0' },
      referentiel: { id: 'respire', version: '7.0.0' },
      runMeta: {
        modele: 'claude-sonnet-4-5',
        dateRun: '2026-07-01T10:00:00Z',
        tokens: { entree: 100, sortie: 200 },
        extraChampInterne: 'jamais exporté', // hors schéma : doit être filtré
      },
    })

    const downloads = []
    const { archive, filename, counts } = await exportArchive({
      cartoStore,
      portfolioStore,
      ...offlineDeps(),
      download: (name, text) => downloads.push({ name, text }),
    })

    expect(validateDocument('archive-export', archive).valid).toBe(true)
    expect(filename).toBe('humanome-export-2026-07-12.json')
    expect(counts).toEqual({ portfolios: 1, cartographies: 1, jeux: 0, jeuxError: null })
    expect(archive.account).toBeNull()
    expect(archive.referentiels).toEqual([referentielFixture])
    expect(archive.promptPackages).toEqual([])
    expect(archive.portfolios[0].segmentation).toEqual([
      { date: '2026-01-05', debut: 0, fin: 6 },
      { date: '2026-01-06', debut: 7, fin: 13 },
    ])
    expect(archive.cartographies[0].runMeta).toEqual({
      modele: 'claude-sonnet-4-5',
      dateRun: '2026-07-01T10:00:00Z',
      tokens: { entree: 100, sortie: 200 },
    })
    expect(downloads).toHaveLength(1)
    expect(downloads[0].name).toBe(filename)
    expect(JSON.parse(downloads[0].text)).toEqual(archive)
  })

  it('complète la traçabilité manquante par des marqueurs neutres (archive toujours valide)', async () => {
    const { cartoStore, portfolioStore } = makeStores()
    await cartoStore.saveCartography({
      type: 'merge',
      titre: 'Import drag & drop sans métadonnées',
      document: mergeFixture,
      // ni promptPackage, ni referentiel, ni runMeta
    })

    const { archive } = await exportArchive({
      cartoStore,
      portfolioStore,
      ...offlineDeps(),
      download: () => {},
    })

    expect(validateDocument('archive-export', archive).valid).toBe(true)
    const item = archive.cartographies[0]
    expect(item.promptPackageId).toBe(UNKNOWN_ID)
    expect(item.promptPackageVersion).toBe(UNKNOWN_VERSION)
    expect(item.referentielId).toBe('respire') // référentiel courant en repli
    expect(item.referentielVersion).toBe('7.0.0')
    expect(item.runMeta.modele).toBe(UNKNOWN_ID)
    expect(item.runMeta.dateRun).toBeDefined()
  })

  it('inclut le compte connecté et le package par défaut quand disponibles', async () => {
    const { cartoStore, portfolioStore } = makeStores()
    const { archive } = await exportArchive({
      cartoStore,
      portfolioStore,
      ...offlineDeps(),
      getAccount: async () => ({ email: 'maya@exemple.fr', displayName: 'Maya', roles: ['apprenant'] }),
      getPromptPackages: async () => [promptPackageFixture],
      download: () => {},
    })
    expect(validateDocument('archive-export', archive).valid).toBe(true)
    expect(archive.account.email).toBe('maya@exemple.fr')
    expect(archive.promptPackages[0].id).toBe('aurora-demo')
  })

  it('inclut les cartographies de masse de l’apprenant (RGPD art. 15/20)', async () => {
    // Le document produit par un établissement vit côté serveur, pas dans le
    // carto-store local : l’export « un clic » doit tout de même le récupérer.
    const { cartoStore, portfolioStore } = makeStores()
    const { archive, counts } = await exportArchive({
      cartoStore,
      portfolioStore,
      ...offlineDeps(),
      getMassDocuments: async () => [
        {
          jobId: 7,
          runId: 3,
          cohorteId: 1,
          cohorte: 'Terminale B',
          date: '2026-01-05',
          promptPackage: { id: 'aurora-v3-reconstruit', version: '1.0.0' },
          referentiel: { id: 'respire', version: '7.0.0' },
          document: dayFixture,
        },
      ],
      download: () => {},
    })
    expect(validateDocument('archive-export', archive).valid).toBe(true)
    expect(counts.cartographies).toBe(1)
    expect(archive.cartographies[0].id).toBe('masse-3-7')
    expect(archive.cartographies[0].type).toBe('jour')
    expect(archive.cartographies[0].runMeta.modele).toContain('Terminale B')
  })

  // Exigence RGPD art. 15/20 — chemin réseau RÉEL de l'export « un clic » :
  // ExportSection.jsx appelle exportArchive SANS override getMassDocuments,
  // c'est donc defaultGetMassDocuments (apiFetch('mes-documents-masse')) qui
  // tourne en production. On l'exerce ici via le fetchFn injecté, au lieu du
  // seul getMassDocuments injecté du test précédent.
  describe('defaultGetMassDocuments (chemin réseau réel)', () => {
    /** Réponse JSON minimale compatible apiFetch (pattern client.test.js). */
    function jsonResponse(status, data) {
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
        json: async () => data,
      }
    }

    it('récupère GET api/mes-documents-masse et inclut les documents dans l’archive', async () => {
      const { cartoStore, portfolioStore } = makeStores()
      const fetchFn = vi.fn().mockResolvedValue(
        jsonResponse(200, {
          documents: [
            {
              jobId: 7,
              runId: 3,
              cohorteId: 1,
              cohorte: 'Terminale B',
              date: '2026-01-05',
              promptPackage: { id: 'aurora-v3-reconstruit', version: '1.0.0' },
              referentiel: { id: 'respire', version: '7.0.0' },
              document: dayFixture,
            },
          ],
        }),
      )

      const { archive, counts } = await exportArchive({
        cartoStore,
        portfolioStore,
        ...offlineDeps(), // getAccount/getReferentiel/getPromptPackages neutralisés :
        fetchFn, //          seul defaultGetMassDocuments passe par le réseau
        download: () => {},
      })

      expect(fetchFn).toHaveBeenCalledTimes(1)
      expect(fetchFn.mock.calls[0][0]).toBe('api/mes-documents-masse')
      expect(validateDocument('archive-export', archive).valid).toBe(true)
      expect(counts.cartographies).toBe(1)
      expect(archive.cartographies[0].id).toBe('masse-3-7')
      expect(archive.cartographies[0].type).toBe('jour')
      expect(archive.cartographies[0].document).toEqual(dayFixture)
      expect(archive.cartographies[0].runMeta.modele).toContain('Terminale B')
    })

    it('dégrade en [] quand le réseau échoue : l’export local aboutit quand même', async () => {
      // Hors-ligne / copie statique : la portabilité locale (art. 20) ne doit
      // jamais être bloquée par l'absence de l'API — dégradation silencieuse.
      const { cartoStore, portfolioStore } = makeStores()
      await cartoStore.saveCartography({ type: 'jour', titre: 'Locale', document: dayFixture })
      const fetchFn = vi.fn().mockRejectedValue(new TypeError('réseau coupé'))

      const { archive, counts } = await exportArchive({
        cartoStore,
        portfolioStore,
        ...offlineDeps(),
        fetchFn,
        download: () => {},
      })

      expect(validateDocument('archive-export', archive).valid).toBe(true)
      expect(counts.cartographies).toBe(1) // la cartographie locale, rien de masse
      expect(archive.cartographies.some((c) => String(c.id).startsWith('masse-'))).toBe(false)
    })

    it('dégrade en [] pour un visiteur non connecté (401)', async () => {
      const { cartoStore, portfolioStore } = makeStores()
      const fetchFn = vi
        .fn()
        .mockResolvedValue(jsonResponse(401, { error: 'Authentification requise' }))

      const { archive, counts } = await exportArchive({
        cartoStore,
        portfolioStore,
        ...offlineDeps(),
        fetchFn,
        download: () => {},
      })

      expect(validateDocument('archive-export', archive).valid).toBe(true)
      expect(counts.cartographies).toBe(0)
      expect(archive.cartographies).toEqual([])
    })
  })
})

describe('importArchive', () => {
  it('restaure la fixture d’exemple (portfolios + cartographies, ids régénérés)', async () => {
    const { cartoStore, portfolioStore } = makeStores()
    const report = await importArchive(JSON.stringify(archiveFixture), {
      cartoStore,
      portfolioStore,
    })

    expect(report.portfolios).toBe(archiveFixture.portfolios.length)
    expect(report.cartographies).toBe(archiveFixture.cartographies.length)

    const portfolios = await portfolioStore.list()
    expect(portfolios).toHaveLength(archiveFixture.portfolios.length)
    expect(portfolios[0].id).not.toBe(archiveFixture.portfolios[0].id) // id régénéré
    expect(portfolios[0].texte).toBe(archiveFixture.portfolios[0].texte)
    // segments reconstruits depuis les offsets
    const seg = portfolios[0].segments[0]
    expect(seg.texte).toBe(archiveFixture.portfolios[0].texte.slice(seg.debut, seg.fin))

    const entries = await cartoStore.listCartographies()
    expect(entries).toHaveLength(archiveFixture.cartographies.length)
    for (const entry of entries) {
      expect(entry.serverId).toBeNull() // jamais de copie serveur implicite (§6.2)
      expect(entry.visibility).toBe('privee')
    }
  })

  it('round-trip export -> import : tout restauré, puis doublons ignorés', async () => {
    const source = makeStores()
    await source.portfolioStore.create({
      titre: 'Journal',
      source: 'colle',
      texte: 'Lundi.',
      segments: [{ date: '2026-01-05', texte: 'Lundi.', debut: 0, fin: 6 }],
    })
    await source.cartoStore.saveCartography({ type: 'jour', titre: 'J1', document: dayFixture })
    await source.cartoStore.saveCartography({ type: 'merge', titre: 'M1', document: mergeFixture })

    const { archive } = await exportArchive({
      ...source,
      ...offlineDeps(),
      download: () => {},
    })

    const target = makeStores()
    const first = await importArchive(JSON.stringify(archive), target)
    expect(first).toEqual({ portfolios: 1, cartographies: 2, jeux: 0 })

    // Ré-import de la même archive : dédoublonnage par contenu.
    const second = await importArchive(JSON.stringify(archive), target)
    expect(second).toEqual({ portfolios: 0, cartographies: 0, jeux: 0 })
    expect(await target.cartoStore.listCartographies()).toHaveLength(2)
    expect(await target.portfolioStore.list()).toHaveLength(1)

    // Les marqueurs neutres redeviennent null à l'import (pas de fausse traçabilité).
    const entries = await target.cartoStore.listCartographies()
    expect(entries.every((e) => e.promptPackage === null)).toBe(true)
  })

  it('rejette un JSON invalide avec un message français', async () => {
    const stores = makeStores()
    await expect(importArchive('{pas du json', stores)).rejects.toThrow(
      'Ce fichier n’est pas un JSON valide.',
    )
  })

  it('rejette un document d’un autre kind', async () => {
    const stores = makeStores()
    await expect(importArchive(JSON.stringify(dayFixture), stores)).rejects.toThrow(
      /archive-export/,
    )
  })

  it('rejette une archive non conforme au schéma sans rien importer', async () => {
    const stores = makeStores()
    const broken = { ...archiveFixture, portfolios: [{ id: 'x' }] } // portfolio incomplet
    await expect(importArchive(JSON.stringify(broken), stores)).rejects.toThrow(
      /non conforme au schéma/,
    )
    expect(await stores.portfolioStore.list()).toEqual([])
    expect(await stores.cartoStore.listCartographies()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Question 10 (décision du 2026-10-14, « tout sauvegarder ») : depuis la 1.1.0,
// l'archive de compte emporte aussi les jeux de données de l'interface de
// cartographie (master v4 complet, schéma competency-map-master), la
// démonstration publique exceptée, et les restaure à l'import.

/** Le jeu « Lou » (fixture du master v4) et la démonstration, dans un stockage de l'interface. */
async function interfaceWithLouAndDemo() {
  const store = createInterfaceStore({ adapter: createInterfaceMemoryAdapter() })
  const base = createInterfaceDataset({ datasetId: masterFixture.datasetId, title: masterFixture.title, referential: masterFixture.referential, now: masterFixture.createdAt })
  await store.commit(await importIntoInterface([{ path: 'lou.json', text: JSON.stringify(masterFixture) }], base, { now: masterFixture.createdAt }))
  const demo = { ...createInterfaceDataset({ datasetId: 'ds-demo', title: 'Démonstration', referential: masterFixture.referential }), origin: 'demo' }
  await store.commit({ dataset: demo })
  return store
}

describe('archive 1.1.0 : les jeux de l’interface de cartographie', () => {
  it('export : chaque jeu en archive complète (portfolio et carnet compris), la démonstration exceptée ; archive conforme', async () => {
    const { cartoStore, portfolioStore } = makeStores()
    const interfaceStore = await interfaceWithLouAndDemo()
    const { archive, counts } = await exportArchive({ cartoStore, portfolioStore, interfaceStore, ...offlineDeps(), download: () => {} })
    expect(archive.schemaVersion).toBe('1.1.0')
    expect(counts).toEqual({ portfolios: 0, cartographies: 0, jeux: 1, jeuxError: null })
    expect(archive.jeuxCartographie.map((j) => j.datasetId)).toEqual(['ds-lou'])
    const [jeu] = archive.jeuxCartographie
    expect(jeu.includesPortfolio).toBe(true)
    expect(jeu.exportedAt).toBe('2026-07-12T10:00:00.000Z')
    expect(jeu.details['2025-12-22'].portfolio.text).toBe(masterFixture.details['2025-12-22'].portfolio.text)
    expect(jeu.reflections.map((r) => r.id)).toEqual(masterFixture.reflections.map((r) => r.id))
    expect(validateDocument('archive-export', archive)).toEqual({ valid: true, errors: [] })
    // Un jeu non conforme au schéma du master rend l'archive non conforme (et l'export s'arrête, E4).
    const broken = { ...archive, jeuxCartographie: [{ ...jeu, days: [{ date: 'hier', variants: [] }] }] }
    expect(validateDocument('archive-export', broken).errors.some((e) => e.path.startsWith('/jeuxCartographie/0/days/0/date'))).toBe(true)
  })

  it('une archive 1.0.0 (sans jeux) reste valide et s’importe', async () => {
    expect(validateDocument('archive-export', archiveFixture).valid).toBe(true)
    const { cartoStore, portfolioStore } = makeStores()
    const interfaceStore = createInterfaceStore({ adapter: createInterfaceMemoryAdapter() })
    const report = await importArchive(JSON.stringify(archiveFixture), { cartoStore, portfolioStore, interfaceStore })
    expect(report.jeux).toBe(0)
    expect(await interfaceStore.listDatasets()).toEqual([])
  })

  it('import : un navigateur neuf retrouve le jeu à l’identique ; réimporter ne restaure rien ; un jeu complété compte', async () => {
    const source = await interfaceWithLouAndDemo()
    const { archive } = await exportArchive({ ...makeStores(), interfaceStore: source, ...offlineDeps(), download: () => {} })
    const text = JSON.stringify(archive)

    const target = createInterfaceStore({ adapter: createInterfaceMemoryAdapter() })
    const first = await importArchive(text, { ...makeStores(), interfaceStore: target })
    expect(first).toEqual({ portfolios: 0, cartographies: 0, jeux: 1 })
    const [before, after] = [await source.exportAll('ds-lou'), await target.exportAll('ds-lou')]
    expect(after.details).toEqual(before.details)
    expect(after.runDetails).toEqual(before.runDetails)
    for (const key of ['title', 'days', 'sets', 'reviews', 'markers', 'comparisons', 'reflections', 'referential', 'preferences']) {
      expect(after.dataset[key], key).toEqual(before.dataset[key])
    }
    expect(await target.loadDataset('ds-demo')).toBeNull() // la démonstration ne voyage pas

    expect(await importArchive(text, { ...makeStores(), interfaceStore: target })).toEqual({ portfolios: 0, cartographies: 0, jeux: 0 })

    // Le jeu local a perdu un dialogue que l'archive porte : il est complété (et compté).
    const local = await target.loadDataset('ds-lou')
    await target.saveDataset({ ...local, reflections: local.reflections.slice(1) })
    expect((await importArchive(text, { ...makeStores(), interfaceStore: target })).jeux).toBe(1)
    expect((await target.loadDataset('ds-lou')).reflections.map((r) => r.id).sort()).toEqual(before.dataset.reflections.map((r) => r.id).sort())
  })

  it('stockage de l’interface illisible : l’export aboutit et le dit ; l’import restaure le reste et le dit', async () => {
    const failing = { listDatasets: async () => { throw new Error('base verrouillée') } }
    const { cartoStore, portfolioStore } = makeStores()
    await portfolioStore.create({ titre: 'Journal', source: 'colle', texte: 'Lundi.', segments: [] })
    const downloads = []
    const { archive, counts } = await exportArchive({ cartoStore, portfolioStore, interfaceStore: failing, ...offlineDeps(), download: (name, t) => downloads.push(t) })
    expect(downloads).toHaveLength(1)
    expect(archive.jeuxCartographie).toEqual([])
    expect(counts).toMatchObject({ portfolios: 1, jeux: 0, jeuxError: 'base verrouillée' })

    const withJeu = { ...archive, jeuxCartographie: [masterFixture] }
    const report = await importArchive(JSON.stringify(withJeu), { ...makeStores(), interfaceStore: failing })
    expect(report).toEqual({ portfolios: 1, cartographies: 0, jeux: 0, jeuxError: 'base verrouillée' })
  })
})
