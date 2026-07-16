// Util partagé d'export JSON (D4) : Blob application/json + <a download>,
// accepte un objet (sérialisé) ou une chaîne d'octets, no-op hors navigateur.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadJson } from './download-json.js'

afterEach(() => vi.restoreAllMocks())

function stubUrl() {
  const urls = []
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => {
      const u = `blob:mock-${urls.length}`
      urls.push(u)
      return u
    }),
    revokeObjectURL: vi.fn(),
  })
  return urls
}

describe('downloadJson', () => {
  // Faux Blob capturant ses parts (jsdom n'implémente pas Blob.text()).
  function stubBlob() {
    const made = []
    vi.stubGlobal(
      'Blob',
      class {
        constructor(parts, opts = {}) {
          this.parts = parts
          this.type = opts.type
          made.push(this)
        }
      },
    )
    return made
  }

  it('sérialise un objet et déclenche un <a download> avec le bon nom + contenu', () => {
    stubUrl()
    const blobs = stubBlob()
    const clicks = []
    const orig = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () {
      clicks.push({ download: this.download, href: this.href })
    }
    try {
      const ok = downloadJson({ a: 1, b: [2, 3] }, 'carto.json')
      expect(ok).toBe(true)
      expect(clicks).toHaveLength(1)
      expect(clicks[0].download).toBe('carto.json')
      expect(clicks[0].href).toMatch(/^blob:/)
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
      expect(blobs).toHaveLength(1)
      expect(blobs[0].type).toBe('application/json')
      // Contenu = l'objet sérialisé (indenté).
      expect(blobs[0].parts[0]).toBe(JSON.stringify({ a: 1, b: [2, 3] }, null, 2))
    } finally {
      HTMLAnchorElement.prototype.click = orig
    }
  })

  it('accepte une chaîne d’octets déjà sérialisée (bytes de Twin9)', () => {
    stubUrl()
    const blobs = stubBlob()
    const orig = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () {}
    try {
      downloadJson('{"deja":"serialise"}', 'x.json')
      // La chaîne est passée telle quelle (pas re-sérialisée).
      expect(blobs[0].parts[0]).toBe('{"deja":"serialise"}')
    } finally {
      HTMLAnchorElement.prototype.click = orig
    }
  })

  it('no-op quand createObjectURL est indisponible (SSR/jsdom minimal)', () => {
    vi.stubGlobal('URL', {})
    expect(downloadJson({ a: 1 }, 'x.json')).toBe(false)
  })
})
