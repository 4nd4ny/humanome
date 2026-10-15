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
// La traduction suit une PALETTE, au choix dans « Réglages » (D-64) :
// Contrastée par défaut, Vive, Pastel, Terre ou Profonde.

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
/** Encre du texte courant par thème (--ink). */
const INK = Object.freeze({ light: '#1e293b', dark: '#e7edf6' })
const isDark = (theme) => theme === 'dark'
const modeOf = (theme) => (isDark(theme) ? 'dark' : 'light')

/** Bande de luminance OKLCH d'une couleur de donnée sur la surface sombre (skill dataviz). */
export const DARK_BAND = Object.freeze({ min: 0.52, max: 0.66 })

// ---- Palettes (journal D-64) --------------------------------------------------

/**
 * Les sept couleurs du référentiel RESPIRE v7, dans l'ordre des pôles (TÊTE,
 * CŒUR, MAIN, ÂME, RACINES, CITÉ, FLAMBEAU) : la clé des palettes.
 */
export const RESPIRE_COLORS = Object.freeze(['#2563eb', '#10b981', '#ec4899', '#8b5cf6', '#f59e0b', '#06b6d4', '#f97316'])

/**
 * Palettes des pôles, au choix dans « Réglages » (journal D-64). Chacune donne
 * aux sept couleurs du référentiel une marche en clair et une en sombre, dans
 * leurs familles de teintes (bleu, vert, rose, violet, or, bleu-vert, orangé) :
 * la palette change le ton, jamais l'identité d'un pôle.
 *
 * Toutes passent le script validate_palette de la skill dataviz sur les
 * voisins du soleil, bouclage FLAMBEAU → TÊTE compris : distincts pour les
 * daltoniens (ΔE ≥ 8) et en vision normale (ΔE ≥ 15). Contrastée, Terre et
 * Profonde atteignent aussi 3:1 sur la surface, dans les deux thèmes ; Vive
 * et Pastel, plus claires, ne l'atteignent pas en clair et s'appuient sur les
 * noms des pôles et le tableau équivalent. Pastel sort, par nature, de la
 * bande de luminance.
 *
 * - Contrastée (par défaut) : les marches claires D-63 et sombres D-60.
 *   CŒUR et MAIN se séparent par la luminance (ΔE 10,4 en clair, 11 en
 *   sombre, contre 4,9 avec les couleurs du référentiel) ; RACINES garde sa
 *   teinte et FLAMBEAU descend plus bas, sans quoi un deutéranope les
 *   confondrait (ΔE 1,6).
 * - Vive : proche des couleurs du référentiel, en plus éclatant (ΔE 15 en
 *   clair, 8,1 en sombre).
 * - Pastel : la même en clair et en sombre (ΔE 11,4).
 * - Terre : des tons rompus (ΔE 11,8 en clair, 10,5 en sombre).
 * - Profonde : des tons denses, 4,7:1 au moins sur le blanc (ΔE 10,9 ; 11,8
 *   en sombre).
 */
export const PALETTES = Object.freeze(
  [
    {
      id: 'contrastee',
      name: 'Contrastée',
      light: ['#2563eb', '#047857', '#ec4899', '#8b5cf6', '#c88007', '#0891b2', '#c2410c'],
      dark: ['#2563eb', '#03835a', '#ed499a', '#8b5cf6', '#c88007', '#0b96af', '#db6410'],
    },
    {
      id: 'vive',
      name: 'Vive',
      light: ['#2084f7', '#1cd08a', '#df2781', '#8b5afe', '#d7a214', '#0ca1c4', '#f5694a'],
      dark: ['#0780fb', '#0eb073', '#db117d', '#9180f4', '#b68f12', '#1294bb', '#dd6652'],
    },
    {
      id: 'pastel',
      name: 'Pastel',
      light: ['#9dbafe', '#8ee5bf', '#ea86ae', '#f1c8fe', '#efc167', '#6fd3f2', '#fe9e85'],
      dark: ['#9dbafe', '#8ee5bf', '#ea86ae', '#f1c8fe', '#efc167', '#6fd3f2', '#fe9e85'],
    },
    {
      id: 'terre',
      name: 'Terre',
      light: ['#5c8ece', '#377b4c', '#cb7c97', '#85579b', '#b58f25', '#02859d', '#b55f42'],
      dark: ['#5594e5', '#2a7d4e', '#c87a92', '#8c5caf', '#a6810e', '#048aa2', '#ae5038'],
    },
    {
      id: 'profonde',
      name: 'Profonde',
      light: ['#0454bd', '#136536', '#bd377e', '#692b9c', '#9d6a17', '#007a99', '#8b2b08'],
      dark: ['#2b7ee6', '#288d4c', '#ef4e99', '#8e53d6', '#a56e0b', '#249dbe', '#d4765b'],
    },
  ].map((p) => Object.freeze({ ...p, light: Object.freeze(p.light), dark: Object.freeze(p.dark) })),
)

/** Palette par défaut : la plus lisible (3:1 sur la surface, daltoniens compris). */
export const DEFAULT_PALETTE = 'contrastee'

const PALETTE_BY_ID = new Map(PALETTES.map((p) => [p.id, p]))
const RESPIRE_INDEX = new Map(RESPIRE_COLORS.map((c, i) => [c, i]))

/** Identifiant de palette connu ? */
export function isPalette(id) {
  return typeof id === 'string' && PALETTE_BY_ID.has(id)
}

/** La palette d'un identifiant ; la palette par défaut pour un identifiant inconnu. */
export function paletteOf(id) {
  return PALETTE_BY_ID.get(id) ?? PALETTE_BY_ID.get(DEFAULT_PALETTE)
}

/** Luminance et saturation moyennes d'une palette dans un thème : le ton d'une couleur inconnue. */
const toneOf = (palette, mode) => {
  const o = palette[mode].map(hexToOklch)
  return { L: o.reduce((s, x) => s + x.L, 0) / o.length, C: o.reduce((s, x) => s + x.C, 0) / o.length }
}
const TONES = new Map(PALETTES.map((p) => [p.id, { light: toneOf(p, 'light'), dark: toneOf(p, 'dark') }]))

/** Couleurs inconnues déjà traduites, par palette et par thème. */
const themeMemo = new Map()
const memoized = (key, compute) => {
  if (!themeMemo.has(key)) {
    if (themeMemo.size >= 512) themeMemo.clear()
    themeMemo.set(key, compute())
  }
  return themeMemo.get(key)
}

/**
 * Couleur d'un pôle (et de ses compétences) dans un thème et une palette : sa
 * marche dans la palette ; pour une couleur inconnue (un autre référentiel), la
 * même teinte, traduite au ton de la palette — dans la palette Contrastée,
 * assombrie en clair jusqu'à 3:1 sur le blanc, ramenée en sombre dans la bande
 * sombre ; dans les autres, à leur luminance et leur saturation moyennes.
 * @param {string} hex couleur du référentiel
 * @param {'light'|'dark'} [theme]
 * @param {string} [palette] identifiant de palette (D-64)
 */
export function themeColor(hex, theme = 'light', palette = DEFAULT_PALETTE) {
  if (!hex) return hex
  const key = String(hex).toLowerCase()
  const mode = modeOf(theme)
  const p = paletteOf(palette)
  const i = RESPIRE_INDEX.get(key)
  if (i !== undefined) return p[mode][i]
  // Une couleur inconnue se calcule une fois (la heatmap en demande une par case).
  return memoized(`${p.id}|${mode}|${key}`, () => {
    if (p.id === DEFAULT_PALETTE) return mode === 'dark' ? darkStep(key) : lightStep(key)
    const o = hexToOklch(key)
    const tone = TONES.get(p.id)[mode]
    // Une couleur presque grise le reste : sa teinte ne veut rien dire.
    return oklchToHex({ L: tone.L, C: o.C < 0.03 ? o.C : tone.C, H: o.H })
  })
}

/** En clair : la même teinte, assombrie jusqu'à 3:1 sur le blanc (telle quelle si elle y est déjà). */
function lightStep(key) {
  return withContrast(key, 'light', 3)
}

/**
 * La même teinte, assez contrastée sur la surface du thème : assombrie en
 * clair, éclaircie en sombre, jusqu'au rapport voulu (telle quelle si elle
 * l'atteint déjà).
 */
function withContrast(hex, mode, min) {
  const surface = VIZ_SURFACE[mode]
  if (contrast(hex, surface) >= min) return hex
  const o = hexToOklch(hex)
  const lighter = mode === 'dark'
  let L = o.L
  let out = hex
  while (contrast(out, surface) < min && (lighter ? L < 0.98 : L > 0.2)) {
    L += lighter ? 0.01 : -0.01
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
 * vers la couleur (D-60). Une rampe dit une quantité : sa case la plus forte
 * atteint au moins 3:1 sur la surface, quelle que soit la palette (D-64 : la
 * marche Pastel, trop claire, y est assombrie dans sa teinte).
 * @param {number} level 1..5
 * @param {string | null} tint couleur de la famille, ou null (neutre)
 * @param {'light'|'dark'} [theme]
 * @param {string} [palette] identifiant de palette (D-64)
 */
export function heatColor(level, tint, theme = 'light', palette = DEFAULT_PALETTE) {
  const mode = modeOf(theme)
  const base = tint ? heatBase(themeColor(tint, mode, palette), mode) : NEUTRAL[mode]
  const t = HEAT_STEPS[Math.min(5, Math.max(1, level)) - 1]
  return mix(VIZ_SURFACE[mode], base, t)
}

/** Teinte pleine d'une rampe de heatmap : la couleur du pôle, à 3:1 au moins sur la surface. */
function heatBase(color, mode) {
  return memoized(`heat|${mode}|${color}`, () => withContrast(color, mode, 3))
}

/**
 * Teinte d'un pôle pour l'anneau intérieur : un peu fondue dans la surface
 * (plus claire en clair, plus sombre en sombre) pour que l'anneau, élément
 * d'interface, reste en retrait des compétences (D-58, D-60).
 * @param {string} color couleur du référentiel
 * @param {'light'|'dark'} [theme]
 * @param {string} [palette] identifiant de palette (D-64)
 */
export function poleFill(color, theme = 'light', palette = DEFAULT_PALETTE) {
  const mode = modeOf(theme)
  return mix(VIZ_SURFACE[mode], themeColor(color, mode, palette), 0.78)
}

/**
 * Encre d'un TEXTE coloré par son pôle (titre du détail) : la couleur mêlée à
 * l'encre du thème (62 % de couleur), davantage s'il le faut pour atteindre
 * 4,5:1 sur la surface — une palette claire (Pastel) reste lisible (D-64).
 */
export function poleText(color, theme = 'light', palette = DEFAULT_PALETTE) {
  const mode = modeOf(theme)
  const c = themeColor(color, mode, palette)
  return memoized(`text|${mode}|${c}`, () => {
    for (let t = 0.38; t < 1; t += 0.04) {
      const out = mix(c, INK[mode], t)
      if (contrast(out, VIZ_SURFACE[mode]) >= 4.5) return out
    }
    return INK[mode]
  })
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

/**
 * Couleur d'un pôle pour un dessin SVG (classe `carto-c-fill`), dans ses deux marches.
 * @param {string} color couleur du référentiel
 * @param {string} [palette] identifiant de palette (D-64)
 */
export function poleTone(color, palette = DEFAULT_PALETTE) {
  return color ? themed(themeColor(color, 'light', palette), themeColor(color, 'dark', palette)) : undefined
}

/**
 * Couleur d'un pôle sur un élément HTML (bordure, puce, marque) : avec la
 * classe `carto-pole`, la feuille de style en fait `--pole-color`, claire ou
 * sombre selon le thème (D-63) ; et `--pole-text`, son encre lisible pour un
 * texte (D-64).
 * @param {string} color couleur du référentiel
 * @param {string} [palette] identifiant de palette (D-64)
 */
export function poleVars(color, palette = DEFAULT_PALETTE) {
  return color
    ? {
        '--pole-light': themeColor(color, 'light', palette),
        '--pole-dark': themeColor(color, 'dark', palette),
        '--pole-text-light': poleText(color, 'light', palette),
        '--pole-text-dark': poleText(color, 'dark', palette),
      }
    : undefined
}
