// Interface ultime — couleurs calculées (heatmap, soleil). Les couleurs des
// pôles viennent du référentiel ; la heatmap n'a JAMAIS de couleur de verdict
// (§5.7) : teinte de la famille si une seule est observée, rampe neutre sinon.
//
// Deux thèmes (journal D-60) : le soleil et la heatmap suivent le thème du
// site. Chaque couleur calculée existe en clair et en sombre ; l'élément porte
// les deux en propriétés CSS (`themed`), la feuille de style choisit — pas de
// rendu à refaire quand le thème change, et l'impression reste claire.
//
// Les couleurs du référentiel sont des données (les épistémiarques les
// choisissent) : l'affichage les traduit, en sombre (D-60) comme en clair
// (D-63), en marches validées pour les daltoniens et lisibles sur la surface.

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

/**
 * Encre d'un petit texte posé sur une couleur (nom d'un pôle, code d'une
 * compétence) : au moins 4,5:1, le seuil du texte courant. L'encre du site ou
 * le blanc si l'un suffit ; sinon le noir ou le blanc, dont l'un atteint
 * toujours 4,58:1.
 */
export function labelInk(bg) {
  const ink = inkOn(bg)
  if (contrast(bg, ink) >= 4.5) return ink
  return contrast(bg, '#000000') >= contrast(bg, '#ffffff') ? '#000000' : '#ffffff'
}

// ---- OKLCH (luminance perçue) -------------------------------------------------

const toLinear = (v) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const fromLinear = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

/** @returns {{L: number, C: number, H: number}} OKLCH (H en radians) */
export function hexToOklch(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, C: Math.hypot(A, B), H: Math.atan2(B, A) }
}

/** OKLCH → « #rrggbb », la saturation réduite juste assez pour rester affichable. */
export function oklchToHex({ L, C, H }) {
  let c = C
  for (let i = 0; i < 80; i++) {
    const A = c * Math.cos(H)
    const B = c * Math.sin(H)
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
    const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
    if (lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4)) return rgbToHex(lin.map((v) => fromLinear(Math.min(1, Math.max(0, v)))))
    c *= 0.97
  }
  return rgbToHex(hexToRgb('#808080'))
}

// ---- Thèmes -------------------------------------------------------------------

/** Surface des visualisations par thème : le blanc, ou la carte du thème sombre (--card). */
export const VIZ_SURFACE = Object.freeze({ light: '#ffffff', dark: '#141d31' })
const NEUTRAL = Object.freeze({ light: '#475569', dark: '#94a3b8' })
const isDark = (theme) => theme === 'dark'

/** Bande de luminance OKLCH d'une couleur de donnée sur la surface sombre (skill dataviz). */
export const DARK_BAND = Object.freeze({ min: 0.52, max: 0.66 })

/**
 * Marches sombres SÉLECTIONNÉES des sept couleurs du référentiel RESPIRE v7 :
 * même teinte, luminance dans la bande sombre, au moins 3:1 sur la surface
 * sombre. CŒUR descend et MAIN reste haut : l'écart de luminance les sépare
 * pour les daltoniens (ΔE 11 entre voisins, contre 4,9 avec les couleurs du
 * référentiel) — validé par le script validate_palette de la skill dataviz
 * (journal D-60).
 */
const DARK_STEPS = new Map([
  ['#2563eb', '#2563eb'], // TÊTE
  ['#10b981', '#03835a'], // CŒUR
  ['#ec4899', '#ed499a'], // MAIN
  ['#8b5cf6', '#8b5cf6'], // ÂME
  ['#f59e0b', '#c88007'], // RACINES
  ['#06b6d4', '#0b96af'], // CITÉ
  ['#f97316', '#db6410'], // FLAMBEAU
])

/**
 * Marches claires SÉLECTIONNÉES (journal D-63) : CŒUR, RACINES, CITÉ et
 * FLAMBEAU plus sombres, mêmes teintes. CŒUR et MAIN, voisins dans le soleil,
 * se séparent pour les daltoniens (ΔE 10,4 entre voisins, contre 4,9 avec les
 * couleurs du référentiel) et les sept atteignent 3:1 sur le blanc. RACINES
 * garde sa teinte (c'est aussi sa marche sombre) et FLAMBEAU descend plus
 * bas : assombris au même niveau, ces deux-là se confondraient pour un
 * deutéranope (ΔE 1,6) ; ainsi, ΔE 10,4 (6,2 avec le référentiel). Validé par
 * le script validate_palette de la skill dataviz.
 */
const LIGHT_STEPS = new Map([
  ['#2563eb', '#2563eb'], // TÊTE
  ['#10b981', '#047857'], // CŒUR
  ['#ec4899', '#ec4899'], // MAIN
  ['#8b5cf6', '#8b5cf6'], // ÂME
  ['#f59e0b', '#c88007'], // RACINES
  ['#06b6d4', '#0891b2'], // CITÉ
  ['#f97316', '#c2410c'], // FLAMBEAU
])

/** Couleurs inconnues déjà traduites, par thème. */
const themeMemo = new Map()

/**
 * Couleur d'un pôle (et de ses compétences) dans un thème : sa marche
 * sélectionnée ; pour une couleur inconnue (un autre référentiel), la même
 * teinte, assombrie en clair jusqu'à 3:1 sur le blanc, ramenée en sombre
 * dans la bande sombre.
 */
export function themeColor(hex, theme = 'light') {
  if (!hex) return hex
  const key = String(hex).toLowerCase()
  const mode = isDark(theme) ? 'dark' : 'light'
  const steps = mode === 'dark' ? DARK_STEPS : LIGHT_STEPS
  if (steps.has(key)) return steps.get(key)
  // Une couleur inconnue se calcule une fois (la heatmap en demande une par case).
  const memo = `${mode}|${key}`
  if (!themeMemo.has(memo)) {
    if (themeMemo.size >= 256) themeMemo.clear()
    themeMemo.set(memo, mode === 'dark' ? darkStep(key) : lightStep(key))
  }
  return themeMemo.get(memo)
}

/** En clair : la même teinte, assombrie jusqu'à 3:1 sur le blanc (telle quelle si elle y est déjà). */
function lightStep(key) {
  if (contrast(key, VIZ_SURFACE.light) >= 3) return key
  const o = hexToOklch(key)
  let L = o.L
  let out = key
  while (contrast(out, VIZ_SURFACE.light) < 3 && L > 0.2) {
    L -= 0.01
    out = oklchToHex({ ...o, L })
  }
  return out
}

/** En sombre : la même teinte, ramenée dans la bande sombre, au moins 3:1 sur la surface sombre. */
function darkStep(key) {
  const o = hexToOklch(key)
  let L = Math.min(DARK_BAND.max, Math.max(DARK_BAND.min, o.L))
  let out = L === o.L ? key : oklchToHex({ ...o, L })
  // Au moins 3:1 sur la surface sombre : on éclaircit, sans quitter la bande.
  while (contrast(out, VIZ_SURFACE.dark) < 3 && L < DARK_BAND.max) {
    L = Math.min(DARK_BAND.max, L + 0.01)
    out = oklchToHex({ ...o, L })
  }
  return out
}

/** Part de la teinte à chaque niveau (1..5) : l'écart le plus lisible entre deux niveaux. */
export const HEAT_STEPS = Object.freeze([0.25, 0.45, 0.65, 0.82, 1])

/**
 * Couleur d'une case de heatmap (niveaux 1..5), toujours en contraste
 * renforcé (journal D-59 : la case à cocher a disparu) : un mélange de la
 * surface du thème vers la teinte, le niveau le plus fort étant la teinte
 * pleine — en clair du blanc vers la couleur, en sombre de la surface sombre
 * vers la couleur (D-60).
 * @param {number} level 1..5
 * @param {string | null} tint couleur de la famille, ou null (neutre)
 * @param {'light'|'dark'} [theme]
 */
export function heatColor(level, tint, theme = 'light') {
  const mode = isDark(theme) ? 'dark' : 'light'
  const base = tint ? themeColor(tint, mode) : NEUTRAL[mode]
  const t = HEAT_STEPS[Math.min(5, Math.max(1, level)) - 1]
  return mix(VIZ_SURFACE[mode], base, t)
}

/**
 * Teinte d'un pôle pour l'anneau intérieur : un peu fondue dans la surface
 * (plus claire en clair, plus sombre en sombre) pour que l'anneau, élément
 * d'interface, reste en retrait des compétences (D-58, D-60).
 */
export function poleFill(color, theme = 'light') {
  const mode = isDark(theme) ? 'dark' : 'light'
  return mix(VIZ_SURFACE[mode], themeColor(color, mode), 0.78)
}

/**
 * Une couleur calculée pour les deux thèmes, en propriétés CSS : la classe
 * `carto-c-fill` (remplissage SVG) ou `carto-c-bg` (fond HTML) en choisit
 * une selon le thème affiché.
 * @param {string} light @param {string} dark
 */
export function themed(light, dark) {
  return { '--c': light, '--c-dark': dark }
}

/** Fond et encre d'une case HTML (pastille de légende), pour les deux thèmes. */
export function themedSwatch(light, dark) {
  return { '--c': light, '--c-dark': dark, '--c-ink': inkOn(light), '--c-ink-dark': inkOn(dark) }
}

/** Couleur d'un pôle pour un dessin SVG (classe `carto-c-fill`), dans ses deux marches. */
export function poleTone(color) {
  return color ? themed(themeColor(color), themeColor(color, 'dark')) : undefined
}

/**
 * Couleur d'un pôle sur un élément HTML (bordure, puce, marque) : avec la
 * classe `carto-pole`, la feuille de style en fait `--pole-color`, claire ou
 * sombre selon le thème (D-63).
 */
export function poleVars(color) {
  return color ? { '--pole-light': themeColor(color), '--pole-dark': themeColor(color, 'dark') } : undefined
}
