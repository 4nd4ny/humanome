import { describe, expect, it } from 'vitest'
import { GDOC_UNAVAILABLE_MESSAGE, extractGdocId, fetchGdocText } from './gdoc.js'

const DOC_ID = '1AbC-dEfGhIjKlMnOpQrStUvWxYz0123456789abcd'

function textResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/plain; charset=utf-8' },
    text: async () => body,
  }
}

function jsonError(status, error) {
  return {
    ok: false,
    status,
    headers: { get: () => 'application/json' },
    json: async () => ({ error }),
  }
}

describe('extractGdocId', () => {
  it('extrait l’id des URL Google Docs usuelles', () => {
    expect(extractGdocId(`https://docs.google.com/document/d/${DOC_ID}/edit?usp=sharing`)).toBe(
      DOC_ID,
    )
    expect(extractGdocId(`https://docs.google.com/document/d/${DOC_ID}`)).toBe(DOC_ID)
    expect(extractGdocId(`https://docs.google.com/document/u/0/d/${DOC_ID}/edit`)).toBe(DOC_ID)
    expect(extractGdocId(`https://docs.google.com/open?id=${DOC_ID}`)).toBe(DOC_ID)
  })

  it('accepte un id brut collé seul', () => {
    expect(extractGdocId(`  ${DOC_ID}  `)).toBe(DOC_ID)
  })

  it('renvoie null pour tout le reste', () => {
    expect(extractGdocId('')).toBe(null)
    expect(extractGdocId('https://example.com/document/pas-un-doc')).toBe(null)
    expect(extractGdocId('pas un id')).toBe(null)
    expect(extractGdocId(null)).toBe(null)
  })
})

describe('fetchGdocText (contrat api/gdoc-text : 200 text/plain, erreurs JSON)', () => {
  it('appelle api/gdoc-text?docId=… et renvoie le texte brut', async () => {
    let requested
    const fetchFn = async (url) => {
      requested = url
      return textResponse('Contenu du document.')
    }
    const text = await fetchGdocText(DOC_ID, { fetchFn })
    expect(text).toBe('Contenu du document.')
    expect(requested).toBe(`api/gdoc-text?docId=${DOC_ID}`)
  })

  it('relaye le message d’erreur français du serveur (403 accès refusé)', async () => {
    const fetchFn = async () =>
      jsonError(403, 'Document non accessible : vérifiez qu’il est partagé en lecture.')
    await expect(fetchGdocText(DOC_ID, { fetchFn })).rejects.toThrow(/Document non accessible/)
  })

  it('erreur JSON sans message : repli français selon le statut', async () => {
    const fetchFn = async () => ({
      ok: false,
      status: 404,
      headers: { get: () => 'application/json' },
      json: async () => ({}),
    })
    await expect(fetchGdocText(DOC_ID, { fetchFn })).rejects.toThrow(
      /public ou partagé « en lecture »/,
    )
  })

  it('serveur injoignable (réseau coupé) : message dédié à l’import Google Docs', async () => {
    const fetchFn = async () => {
      throw new TypeError('network down')
    }
    await expect(fetchGdocText(DOC_ID, { fetchFn })).rejects.toThrow(GDOC_UNAVAILABLE_MESSAGE)
  })

  it('copie statique (200 HTML au lieu du texte) : API absente', async () => {
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => '<!doctype html>…',
    })
    await expect(fetchGdocText(DOC_ID, { fetchFn })).rejects.toThrow(GDOC_UNAVAILABLE_MESSAGE)
  })

  it('protocole file:// : API absente, message dédié', async () => {
    await expect(fetchGdocText(DOC_ID, { protocol: 'file:' })).rejects.toThrow(
      GDOC_UNAVAILABLE_MESSAGE,
    )
  })
})
