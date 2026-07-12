import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  currentRoute,
  dayHash,
  isValidIsoDate,
  parseHash,
  referentielHash,
  subscribe,
} from './router.js'

afterEach(() => {
  window.location.hash = ''
})

describe('isValidIsoDate', () => {
  it('accepte une date calendaire réelle', () => {
    expect(isValidIsoDate('2026-03-15')).toBe(true)
    expect(isValidIsoDate('2025-12-22')).toBe(true)
    expect(isValidIsoDate('2024-02-29')).toBe(true) // bissextile
  })

  it('rejette les dates hors calendrier ou mal formées', () => {
    expect(isValidIsoDate('2026-13-45')).toBe(false)
    expect(isValidIsoDate('2026-02-30')).toBe(false)
    expect(isValidIsoDate('2025-02-29')).toBe(false) // non bissextile
    expect(isValidIsoDate('2026-3-15')).toBe(false)
    expect(isValidIsoDate('15/03/2026')).toBe(false)
    expect(isValidIsoDate('')).toBe(false)
    expect(isValidIsoDate('not-a-date')).toBe(false)
  })
})

describe('parseHash', () => {
  it('route vers l’accueil pour un hash vide, "#" ou "#/"', () => {
    expect(parseHash('')).toEqual({ name: 'home' })
    expect(parseHash('#')).toEqual({ name: 'home' })
    expect(parseHash('#/')).toEqual({ name: 'home' })
    expect(parseHash(undefined)).toEqual({ name: 'home' })
  })

  it('route vers la vue merge', () => {
    expect(parseHash('#/merge')).toEqual({ name: 'merge' })
  })

  it('route vers la vue journée pour une date valide', () => {
    expect(parseHash('#/jour/2026-03-15')).toEqual({
      name: 'day',
      date: '2026-03-15',
      focus: null,
    })
  })

  it('extrait le paramètre focus', () => {
    expect(parseHash('#/jour/2026-03-15?focus=1.01')).toEqual({
      name: 'day',
      date: '2026-03-15',
      focus: '1.01',
    })
  })

  it('décode un focus encodé et ignore un focus vide', () => {
    expect(parseHash('#/jour/2026-03-15?focus=7.03&autre=x').focus).toBe('7.03')
    expect(parseHash('#/jour/2026-03-15?focus=').focus).toBe(null)
    expect(parseHash('#/jour/2026-03-15?focus=a%2Fb').focus).toBe('a/b')
  })

  it('rejette une date invalide vers not-found', () => {
    expect(parseHash('#/jour/2026-13-45')).toEqual({
      name: 'not-found',
      hash: '/jour/2026-13-45',
    })
    expect(parseHash('#/jour/2026-02-30?focus=1.01').name).toBe('not-found')
    expect(parseHash('#/jour/pas-une-date').name).toBe('not-found')
    expect(parseHash('#/jour/').name).toBe('not-found')
  })

  it('rejette une route inconnue vers not-found', () => {
    expect(parseHash('#/inconnu')).toEqual({ name: 'not-found', hash: '/inconnu' })
    expect(parseHash('#/merge/extra').name).toBe('not-found')
    expect(parseHash('#/jour/2026-03-15/extra').name).toBe('not-found')
  })
})

describe('routes référentiel et compte (P4.4)', () => {
  it('route vers le référentiel public, sans ou avec code permalié', () => {
    expect(parseHash('#/referentiel')).toEqual({ name: 'referentiel', code: null })
    expect(parseHash('#/referentiel/1.01')).toEqual({ name: 'referentiel', code: '1.01' })
    expect(parseHash('#/referentiel/7.09')).toEqual({ name: 'referentiel', code: '7.09' })
  })

  it('décode un code encodé et rejette les segments supplémentaires', () => {
    expect(parseHash('#/referentiel/a%2Fb').code).toBe('a/b')
    expect(parseHash('#/referentiel/').name).toBe('not-found')
    expect(parseHash('#/referentiel/1.01/extra').name).toBe('not-found')
  })

  it('route vers le compte', () => {
    expect(parseHash('#/compte')).toEqual({ name: 'account' })
    expect(parseHash('#/compte/extra').name).toBe('not-found')
  })

  it('route vers la démo publique « Essayer » (P6)', () => {
    expect(parseHash('#/essayer')).toEqual({ name: 'essayer' })
    expect(parseHash('#/essayer/extra').name).toBe('not-found')
  })

  it('route vers le module portfolio (P7)', () => {
    expect(parseHash('#/portfolio')).toEqual({ name: 'portfolio' })
    expect(parseHash('#/portfolio/extra').name).toBe('not-found')
  })

  it('referentielHash est l’inverse de parseHash', () => {
    expect(referentielHash()).toBe('#/referentiel')
    expect(referentielHash('1.01')).toBe('#/referentiel/1.01')
    expect(parseHash(referentielHash('4.07'))).toEqual({ name: 'referentiel', code: '4.07' })
  })
})

describe('dayHash', () => {
  it('construit la route jour, avec et sans focus', () => {
    expect(dayHash('2026-03-15')).toBe('#/jour/2026-03-15')
    expect(dayHash('2026-03-15', '1.01')).toBe('#/jour/2026-03-15?focus=1.01')
    expect(dayHash('2026-03-15', null)).toBe('#/jour/2026-03-15')
  })

  it('est l’inverse de parseHash', () => {
    expect(parseHash(dayHash('2026-01-04', '4.07'))).toEqual({
      name: 'day',
      date: '2026-01-04',
      focus: '4.07',
    })
  })
})

describe('subscribe / currentRoute', () => {
  it('notifie la route parsée à chaque hashchange et se désabonne', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)

    window.location.hash = '#/merge'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(listener).toHaveBeenLastCalledWith({ name: 'merge' })

    window.location.hash = '#/jour/2026-01-04?focus=1.01'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(listener).toHaveBeenLastCalledWith({
      name: 'day',
      date: '2026-01-04',
      focus: '1.01',
    })
    expect(currentRoute()).toEqual({ name: 'day', date: '2026-01-04', focus: '1.01' })

    unsubscribe()
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
