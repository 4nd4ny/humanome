// Redimensionnement d'avatar (D6) : recadrage carré + mise à l'échelle + encodage
// borné à 200 Ko. jsdom n'a pas de vrai canvas -> on injecte un faux canvas/loadImage.
import { describe, expect, it, vi } from 'vitest'
import { resizeAvatar, MAX_AVATAR_BYTES } from './resize-image.js'

function fakeCanvas(dataUrlFor) {
  return {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toDataURL: (mime, quality) => dataUrlFor(mime, quality),
  }
}

const fakeImage = { width: 800, height: 600 }
const loadImage = async () => fakeImage

describe('resizeAvatar', () => {
  it('encode en WebP quand ≤ 200 Ko et recadre au carré', async () => {
    const canvas = fakeCanvas((mime) =>
      mime === 'image/webp' ? 'data:image/webp;base64,AAAA' : 'data:image/jpeg;base64,BBBB',
    )
    const out = await resizeAvatar(new Blob(), { canvas, loadImage, size: 256 })
    expect(out.mime).toBe('image/webp')
    expect(out.base64).toBe('AAAA')
    expect(canvas.width).toBe(256)
    expect(canvas.height).toBe(256)
    expect(out.bytes).toBeLessThanOrEqual(MAX_AVATAR_BYTES)
  })

  it('repli JPEG quand l’encodeur WebP n’est pas supporté', async () => {
    // toDataURL renvoie du PNG pour webp (encodeur absent) -> on saute webp.
    const canvas = fakeCanvas((mime) =>
      mime === 'image/webp' ? 'data:image/png;base64,ZZZZ' : 'data:image/jpeg;base64,BBBB',
    )
    const out = await resizeAvatar(new Blob(), { canvas, loadImage })
    expect(out.mime).toBe('image/jpeg')
    expect(out.base64).toBe('BBBB')
  })

  it('compresse davantage si l’encodage dépasse 200 Ko', async () => {
    const big = 'x'.repeat(MAX_AVATAR_BYTES * 2) // > 200 Ko décodés
    let calls = 0
    const canvas = fakeCanvas(() => {
      calls += 1
      // Les 2 premiers encodages (webp/jpeg 0.85) sont trop lourds ; le dernier
      // recours (jpeg 0.6) est petit.
      return calls >= 3 ? 'data:image/jpeg;base64,small' : `data:image/webp;base64,${big}`
    })
    const out = await resizeAvatar(new Blob(), { canvas, loadImage })
    expect(out.mime).toBe('image/jpeg')
    expect(out.base64).toBe('small')
  })
})
