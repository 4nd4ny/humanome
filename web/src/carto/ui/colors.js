// Interface ultime — couleurs calculées (heatmap, soleil). Les couleurs des
// pôles viennent du référentiel ; la heatmap n'a JAMAIS de couleur de verdict
// (§5.7) : teinte de la famille si une seule est observée, rampe neutre sinon.

/** @param {string} hex « #rrggbb » @returns {[number, number, number]} */
export function hexToRgb(hex) {
  const h = String(hex ?? '').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6)
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0)
}

/** @returns {string} « #rrggbb » */
export function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
}

/** Mélange linéaire de deux couleurs (t = 0 → a, t = 1 → b). */
export function mix(a, b, t) {
  const [ra, ga, ba] = hexToRgb(a)
  const [rb, gb, bb] = hexToRgb(b)
  return rgbToHex([ra + (rb - ra) * t, ga + (gb - ga) * t, ba + (bb - ba) * t])
}

/** Luminance relative WCAG. */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Rapport de contraste WCAG entre deux couleurs. */
export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** Encre lisible sur un fond donné. */
export function inkOn(bg) {
  return contrast(bg, '#ffffff') >= contrast(bg, '#1e293b') ? '#ffffff' : '#1e293b'
}

const NEUTRAL = '#475569'
const PAPER = '#ffffff'

/**
 * Couleur d'une case de heatmap (niveaux 1..5). La surface de visualisation
 * reste claire dans les deux thèmes (jeton --viz-surface), d'où un mélange
 * vers le blanc.
 * @param {number} level 1..5
 * @param {string | null} tint couleur de la famille, ou null (neutre)
 * @param {{highContrast?: boolean}} [opts]
 */
export function heatColor(level, tint, { highContrast = false } = {}) {
  const base = tint ?? NEUTRAL
  const steps = highContrast ? [0.25, 0.45, 0.65, 0.82, 1] : [0.16, 0.32, 0.5, 0.7, 0.92]
  const t = steps[Math.min(5, Math.max(1, level)) - 1]
  return mix(PAPER, base, t)
}

/** Teinte d'un pôle pour l'anneau intérieur (légèrement plus claire). */
export function poleFill(color) {
  return mix(PAPER, color, 0.78)
}
