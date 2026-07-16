// Redimensionnement d'avatar côté client (D6 / AD-D4) : recadre au carré central,
// met à l'échelle à ~256 px, encode en WebP (repli JPEG) sous 200 Ko. Le serveur
// re-valide toujours (magic number + taille) : ce redimensionnement est un confort
// côté client, jamais une garantie de sécurité.

/** Taille cible du côté de l'avatar carré (px). */
export const AVATAR_SIZE = 256
/** Plafond dur côté serveur (AvatarValidator::MAX_BYTES). */
export const MAX_AVATAR_BYTES = 200 * 1024

/**
 * Charge un File image, le recadre en carré, le met à l'échelle et l'encode.
 * @param {File|Blob} file fichier image choisi par l'utilisateur
 * @param {{size?: number, canvas?: HTMLCanvasElement, loadImage?: Function}} [opts]
 *   coutures de test (canvas/loadImage injectables).
 * @returns {Promise<{base64: string, mime: string, bytes: number}>}
 */
export async function resizeAvatar(file, opts = {}) {
  const size = opts.size ?? AVATAR_SIZE
  const img = await (opts.loadImage ?? loadImageFromBlob)(file)
  const canvas = opts.canvas ?? document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  // Recadrage carré centré (cover), puis mise à l'échelle.
  const srcW = img.width || img.naturalWidth || size
  const srcH = img.height || img.naturalHeight || size
  const side = Math.min(srcW, srcH)
  const sx = (srcW - side) / 2
  const sy = (srcH - side) / 2
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)

  // WebP d'abord (meilleure compression), repli JPEG si non supporté.
  for (const [mime, quality] of [['image/webp', 0.85], ['image/jpeg', 0.85]]) {
    const dataUrl = canvas.toDataURL(mime, quality)
    if (!dataUrl.startsWith(`data:${mime}`)) continue // encodeur non supporté
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    const bytes = Math.floor((base64.length * 3) / 4)
    if (bytes <= MAX_AVATAR_BYTES) {
      return { base64, mime, bytes }
    }
  }
  // Dernier recours : JPEG plus compressé.
  const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return { base64, mime: 'image/jpeg', bytes: Math.floor((base64.length * 3) / 4) }
}

/** Charge un Blob dans un HTMLImageElement (via object URL). */
function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image illisible.'))
    }
    image.src = url
  })
}
