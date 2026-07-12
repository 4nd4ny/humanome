import { describe, expect, it } from 'vitest'
import { validateDocument } from '@engine/validation.js'
import archiveFixture from '../../../schemas/fixtures/archive-export-exemple.json'
import dayFixture from '../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import mergeFixture from '../../../schemas/fixtures/cartographie-merge-3-jours.json'
import referentielFixture from '../../../schemas/fixtures/referentiel-respire-v7.json'
import promptPackageFixture from '../../../schemas/fixtures/prompt-package-exemple.json'
import { exportArchive, importArchive, UNKNOWN_ID, UNKNOWN_VERSION } from './archive.js'
import { createCartoStore, createMemoryAdapter } from './carto-store.js'
import { createPortfolioStore, createMemoryAdapter as createPortfolioMemoryAdapter } from './portfolio-store.js'

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
    expect(counts).toEqual({ portfolios: 1, cartographies: 1 })
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
    expect(first).toEqual({ portfolios: 1, cartographies: 2 })

    // Ré-import de la même archive : dédoublonnage par contenu.
    const second = await importArchive(JSON.stringify(archive), target)
    expect(second).toEqual({ portfolios: 0, cartographies: 0 })
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
