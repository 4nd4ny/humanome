import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearReferentielCache, loadPublishedReferentiel } from './referentiel.js'

afterEach(() => {
  clearReferentielCache()
})

function jsonResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data }
}

const publishedDoc = {
  version: '8.0.0',
  label: 'RESPIRE v8',
  poles: [{ num: 1, nom: 'TETE', couleur: '#123456' }],
  competences: [{ code: '1.01', nom: 'Test', pole: 1 }],
}

// Forme canonique produite par api/src/Referentiel/StaticExporter.php :
// tableau {referentielId, semver, label, publishedAt, fichier}, plus récent d'abord.
const publishedIndex = [
  {
    referentielId: 'respire',
    semver: '8.0.0',
    label: 'RESPIRE v8',
    publishedAt: '2026-07-12T00:00:00',
    fichier: 'respire-v8.0.0.json',
  },
  {
    referentielId: 'respire',
    semver: '7.0.0',
    label: 'RESPIRE v7',
    publishedAt: '2026-07-01T00:00:00',
    fichier: 'respire-v7.0.0.json',
  },
]

describe('loadPublishedReferentiel', () => {
  it('charge index.json puis la dernière version publiée', async () => {
    const fetchFn = vi.fn(async (url) => {
      if (url === 'data/referentiel/index.json') return jsonResponse(publishedIndex)
      if (url === 'data/referentiel/respire-v8.0.0.json') return jsonResponse(publishedDoc)
      throw new Error(`unexpected url ${url}`)
    })

    const { doc, origin } = await loadPublishedReferentiel({ fetchFn })
    expect(origin).toBe('published')
    expect(doc.version).toBe('8.0.0')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('met le résultat en cache (un seul chargement par session)', async () => {
    const fetchFn = vi.fn(async (url) =>
      url === 'data/referentiel/index.json' ? jsonResponse(publishedIndex) : jsonResponse(publishedDoc),
    )
    await loadPublishedReferentiel({ fetchFn })
    await loadPublishedReferentiel({ fetchFn })
    expect(fetchFn).toHaveBeenCalledTimes(2) // index + version, une seule fois
  })

  it('retombe sur le référentiel embarqué si le fetch échoue (copie statique)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('network down'))
    const { doc, origin } = await loadPublishedReferentiel({ fetchFn })
    expect(origin).toBe('bundled')
    expect(doc.version).toBe('7.0.0') // RESPIRE v7 embarqué par data/load.js
    expect(doc.competences).toHaveLength(61)
  })

  it('ne tente aucun fetch depuis file:// et sert la version embarquée', async () => {
    const fetchFn = vi.fn()
    const { origin } = await loadPublishedReferentiel({ fetchFn, protocol: 'file:' })
    expect(origin).toBe('bundled')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('rejette un nom de fichier hors répertoire (index corrompu) -> embarqué', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse([{ referentielId: 'respire', fichier: '../../etc/passwd.json' }]),
    )
    const { origin } = await loadPublishedReferentiel({ fetchFn })
    expect(origin).toBe('bundled')
    expect(fetchFn).toHaveBeenCalledTimes(1) // l'index seulement, jamais le fichier
  })
})
