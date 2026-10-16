// Dates écrites à la française (libellés de l'interface).
import { describe, expect, it } from 'vitest'
import { formatLong, formatShort } from './dates.js'

describe('formatShort : le libellé compact des listes', () => {
  it('jour de la semaine, jour, mois abrégé et année', () => {
    expect(formatShort('2025-12-27')).toBe('sam. 27 déc. 2025')
    expect(formatShort('2026-03-13')).toBe('ven. 13 mars 2026')
  })
  it('le premier du mois s’écrit « 1er », comme dans la date longue', () => {
    expect(formatShort('2026-01-01')).toBe('jeu. 1er janv. 2026')
    expect(formatLong('2026-01-01')).toBe('1er janvier 2026')
  })
  it('sans l’année quand elle se lit déjà ailleurs (D-71)', () => {
    expect(formatShort('2026-03-12', { year: false })).toBe('jeu. 12 mars')
    expect(formatShort('2026-03-01', { year: false })).toBe('dim. 1er mars')
  })
  it('passé à map, l’index ne retire pas l’année', () => {
    expect(['2025-12-27', '2026-01-02'].map(formatShort)).toEqual(['sam. 27 déc. 2025', 'ven. 2 janv. 2026'])
  })
  it('une date illisible : un tiret', () => {
    expect(formatShort('13/03/2026')).toBe('—')
  })
})
