// Traçabilité — exigence « refonte ergonomie/navigation », point 9 : thème
// sombre complet qui SUIT le système (prefers-color-scheme) tant qu'aucun
// choix n'est fait, avec une bascule manuelle PERSISTÉE (localStorage
// 'humanome-theme') qui PRIME sur le système. Ce fichier prouve lib/theme.js :
// storedTheme, systemTheme, resolvedTheme, applyTheme et subscribeSystemTheme
// (y compris le repli addListener/removeListener des vieux navigateurs et la
// coupure du suivi système dès qu'un choix explicite est stocké).

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyTheme,
  resolvedTheme,
  storedTheme,
  subscribeSystemTheme,
  systemTheme,
} from './theme.js'

const STORAGE_KEY = 'humanome-theme'

/** MediaQueryList factice, API moderne (addEventListener/removeEventListener). */
function fakeMq({ matches = false } = {}) {
  return {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
}

/** MediaQueryList factice « vieux Safari » : seulement addListener/removeListener. */
function legacyMq({ matches = false } = {}) {
  return {
    matches,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }
}

function stubMatchMedia(mq) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mq))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('storedTheme', () => {
  it("retourne le choix explicite stocké ('light' ou 'dark')", () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    expect(storedTheme()).toBe('dark')
    localStorage.setItem(STORAGE_KEY, 'light')
    expect(storedTheme()).toBe('light')
  })

  it('retourne null sans choix stocké (= suit le système)', () => {
    expect(storedTheme()).toBeNull()
  })

  it('retourne null pour une valeur invalide stockée', () => {
    localStorage.setItem(STORAGE_KEY, 'bleu-canard')
    expect(storedTheme()).toBeNull()
  })

  it("retourne null si localStorage jette (navigation privée) au lieu d'exploser", () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('stockage indisponible')
    })
    expect(storedTheme()).toBeNull()
  })
})

describe('systemTheme', () => {
  it("retourne 'dark' quand le système préfère le sombre", () => {
    stubMatchMedia(fakeMq({ matches: true }))
    expect(systemTheme()).toBe('dark')
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
  })

  it("retourne 'light' quand le système préfère le clair", () => {
    stubMatchMedia(fakeMq({ matches: false }))
    expect(systemTheme()).toBe('light')
  })

  it("retourne 'light' (défaut sûr) sans matchMedia", () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(systemTheme()).toBe('light')
  })
})

describe('resolvedTheme', () => {
  it('le choix explicite stocké PRIME sur le thème système', () => {
    stubMatchMedia(fakeMq({ matches: true })) // système sombre…
    localStorage.setItem(STORAGE_KEY, 'light') // …mais choix clair stocké
    expect(resolvedTheme()).toBe('light')
  })

  it('sans choix stocké, suit le système', () => {
    stubMatchMedia(fakeMq({ matches: true }))
    expect(resolvedTheme()).toBe('dark')
    stubMatchMedia(fakeMq({ matches: false }))
    expect(resolvedTheme()).toBe('light')
  })
})

describe('applyTheme', () => {
  it('pose data-theme sur <html> ET persiste le choix', () => {
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')

    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
  })

  it("n'explose pas si localStorage jette : la bascule reste valable pour la session", () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota / mode privé')
    })
    expect(() => applyTheme('dark')).not.toThrow()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})

describe('subscribeSystemTheme', () => {
  it('relaie les changements système au callback tant qu’AUCUN choix n’est stocké', () => {
    const mq = fakeMq()
    stubMatchMedia(mq)
    const cb = vi.fn()
    subscribeSystemTheme(cb)

    expect(mq.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    const handler = mq.addEventListener.mock.calls[0][1]

    handler({ matches: true })
    expect(cb).toHaveBeenLastCalledWith('dark')
    handler({ matches: false })
    expect(cb).toHaveBeenLastCalledWith('light')
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('n’appelle JAMAIS le callback quand un choix explicite est stocké (le choix prime)', () => {
    const mq = fakeMq()
    stubMatchMedia(mq)
    localStorage.setItem(STORAGE_KEY, 'light')
    const cb = vi.fn()
    subscribeSystemTheme(cb)

    const handler = mq.addEventListener.mock.calls[0][1]
    handler({ matches: true })
    expect(cb).not.toHaveBeenCalled()
  })

  it('coupe le suivi dès qu’un choix est stocké APRÈS l’abonnement', () => {
    const mq = fakeMq()
    stubMatchMedia(mq)
    const cb = vi.fn()
    subscribeSystemTheme(cb)
    const handler = mq.addEventListener.mock.calls[0][1]

    handler({ matches: true })
    expect(cb).toHaveBeenCalledTimes(1)

    applyTheme('light') // choix explicite en cours de route
    handler({ matches: false })
    expect(cb).toHaveBeenCalledTimes(1) // plus aucun appel
  })

  it('le désabonnement retire le listener (même handler)', () => {
    const mq = fakeMq()
    stubMatchMedia(mq)
    const unsubscribe = subscribeSystemTheme(vi.fn())
    const handler = mq.addEventListener.mock.calls[0][1]

    unsubscribe()
    expect(mq.removeEventListener).toHaveBeenCalledWith('change', handler)
  })

  it('repli addListener/removeListener quand addEventListener manque (vieux Safari)', () => {
    const mq = legacyMq()
    stubMatchMedia(mq)
    const cb = vi.fn()
    const unsubscribe = subscribeSystemTheme(cb)

    expect(mq.addListener).toHaveBeenCalledWith(expect.any(Function))
    const handler = mq.addListener.mock.calls[0][0]
    handler({ matches: true })
    expect(cb).toHaveBeenCalledWith('dark')

    unsubscribe()
    expect(mq.removeListener).toHaveBeenCalledWith(handler)
  })

  it('sans matchMedia : retourne un désabonnement inoffensif', () => {
    vi.stubGlobal('matchMedia', undefined)
    const unsubscribe = subscribeSystemTheme(vi.fn())
    expect(typeof unsubscribe).toBe('function')
    expect(() => unsubscribe()).not.toThrow()
  })
})
