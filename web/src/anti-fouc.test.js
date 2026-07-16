// Traçabilité — exigence « refonte ergonomie/navigation », point 9 (thème
// sombre, anti-FOUC) : web/index.html embarque un <script> inline qui pose
// data-theme depuis localStorage AVANT le premier paint (avant le bundle).
// Il partage la clé 'humanome-theme' avec lib/theme.js : une divergence de
// clé, la suppression du script au refactor du <head>, ou une valeur non
// filtrée casseraient silencieusement le premier paint. Ce test lit le HTML
// réel et EXÉCUTE le script inline contre des doublures.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// vitest s'exécute depuis web/ (racine du projet front) ; import.meta.url est
// réécrit par vite en jsdom, on résout donc depuis le cwd.
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const themeSource = readFileSync(resolve(process.cwd(), 'src/lib/theme.js'), 'utf8')

/** Corps du premier <script> inline (sans attribut src) du document. */
function inlineScript() {
  const match = html.match(/<script>([\s\S]*?)<\/script>/)
  return match?.[1] ?? ''
}

/**
 * Exécute le script anti-FOUC avec un localStorage et un document factices.
 * @returns {import('vitest').Mock} le spy setAttribute de documentElement
 */
function runInlineScript(stored, { getItemThrows = false } = {}) {
  const setAttribute = vi.fn()
  const fakeLocalStorage = {
    getItem: () => {
      if (getItemThrows) throw new Error('stockage indisponible')
      return stored
    },
  }
  const fakeDocument = { documentElement: { setAttribute } }
  // Les identifiants globaux du script sont capturés par les paramètres.
  new Function('localStorage', 'document', inlineScript())(fakeLocalStorage, fakeDocument)
  return setAttribute
}

describe('index.html — script anti-FOUC', () => {
  it('est présent AVANT le module principal (premier paint) et lit la clé humanome-theme', () => {
    expect(inlineScript()).not.toBe('')
    expect(inlineScript()).toContain('humanome-theme')
    const scriptIndex = html.indexOf('<script>')
    const moduleIndex = html.indexOf('src="/src/main.jsx"')
    expect(scriptIndex).toBeGreaterThan(-1)
    expect(moduleIndex).toBeGreaterThan(-1)
    expect(scriptIndex).toBeLessThan(moduleIndex)
  })

  it('utilise la MÊME clé localStorage que lib/theme.js (STORAGE_KEY)', () => {
    const match = themeSource.match(/const STORAGE_KEY = '([^']+)'/)
    expect(match).not.toBeNull()
    expect(inlineScript()).toContain(`'${match[1]}'`)
  })

  it('déclare la double palette au navigateur (meta color-scheme light dark)', () => {
    expect(html).toMatch(/<meta name="color-scheme" content="light dark"\s*\/?>/)
  })

  it("choix stocké 'dark' ou 'light' -> data-theme posé avant le premier paint", () => {
    expect(runInlineScript('dark')).toHaveBeenCalledWith('data-theme', 'dark')
    expect(runInlineScript('light')).toHaveBeenCalledWith('data-theme', 'light')
  })

  it('valeur inconnue ou absente -> ne pose RIEN (le suivi du système est préservé)', () => {
    expect(runInlineScript('bleu-canard')).not.toHaveBeenCalled()
    expect(runInlineScript(null)).not.toHaveBeenCalled()
  })

  it('localStorage qui jette (mode privé) -> pas de crash, rien posé', () => {
    let spy
    expect(() => {
      spy = runInlineScript(null, { getItemThrows: true })
    }).not.toThrow()
    expect(spy).not.toHaveBeenCalled()
  })
})
