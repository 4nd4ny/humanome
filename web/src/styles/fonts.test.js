// D7 — garde anti-régression de la typographie iA Writer Quattro (AD-D5).
// Vérifie que les @font-face, la pile corps, les fichiers woff2 et la licence
// OFL sont bien en place (auto-hébergement, aucune origine tierce).
import { existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, 'global.css'), 'utf8')
const fontsDir = join(here, '../../public/fonts/quattro')

describe('typographie iA Writer Quattro (D7)', () => {
  it('déclare les 4 graisses en @font-face avec font-display:swap', () => {
    const faces = css.match(/@font-face\s*{[^}]*iA Writer Quattro[^}]*}/g) ?? []
    expect(faces.length).toBe(4)
    for (const face of faces) {
      expect(face).toContain('font-display: swap')
      expect(face).toMatch(/url\('\/fonts\/quattro\/iAWriterQuattroS-\w+\.woff2'\) format\('woff2'\)/)
    }
    // Les 4 couples style/graisse attendus.
    expect(css).toMatch(/font-family: 'iA Writer Quattro';\s*font-style: normal;\s*font-weight: 400/)
    expect(css).toMatch(/font-family: 'iA Writer Quattro';\s*font-style: italic;\s*font-weight: 400/)
    expect(css).toMatch(/font-family: 'iA Writer Quattro';\s*font-style: normal;\s*font-weight: 700/)
    expect(css).toMatch(/font-family: 'iA Writer Quattro';\s*font-style: italic;\s*font-weight: 700/)
  })

  it('utilise iA Writer Quattro en tête de la pile corps, repli système', () => {
    const body = css.match(/body\s*{[^}]*}/)?.[0] ?? ''
    expect(body).toMatch(/font-family:\s*\n?\s*'iA Writer Quattro',/)
    expect(body).toContain('system-ui')
  })

  it('les 4 woff2 et la licence OFL sont présents (auto-hébergés, ≤ 60 Ko chacun)', () => {
    for (const w of ['Regular', 'Italic', 'Bold', 'BoldItalic']) {
      const f = join(fontsDir, `iAWriterQuattroS-${w}.woff2`)
      expect(existsSync(f), `manquant : ${w}`).toBe(true)
      // Magic number wOF2 + taille raisonnable (une seule graisse).
      const bytes = readFileSync(f)
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2')
      expect(statSync(f).size).toBeLessThan(60 * 1024)
    }
    const license = readFileSync(join(fontsDir, 'OFL.txt'), 'utf8')
    expect(license).toContain('SIL Open Font License, Version 1.1')
  })

  it('aucune origine tierce de police (pas de fonts.googleapis / typekit)', () => {
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic|use\.typekit|@import\s+url/i)
  })
})
