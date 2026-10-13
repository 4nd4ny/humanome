// P2 — où lire le passage d'une trace (spec §8.1) et synthèses évolutives (§6.4).
import { describe, expect, it } from 'vitest'
import { findPassage, searchOrder } from './passages.js'
import { locateExtract } from './highlight.js'
import { narrativesFor, sameDates } from './narratives.js'

const TEXTS = {
  '2025-12-22': 'Ce matin j’ai relu mes notes. J’ai vérifié deux sources contradictoires avant de conclure sur la date du chantier.',
  '2025-12-23': 'J’ai écouté Sam expliquer son idée jusqu’au bout sans l’interrompre.',
  '2025-12-27': 'La maquette a cédé : nous avons recommencé en changeant les appuis.',
  '2026-01-10': 'Une autre journée, sans rapport.',
}
const locateIn = (texts, anchors) => (date) => (date in texts ? locateExtract(texts[date], anchors) : null)

describe('ordre de recherche', () => {
  it('journée du passage, journée de la trace, puis distance croissante (la plus ancienne à égalité)', () => {
    expect(searchOrder('2025-12-23', '2025-12-24', ['2025-12-20', '2025-12-22', '2025-12-24', '2025-12-26', '2026-01-30'])).toEqual([
      '2025-12-23',
      '2025-12-24',
      '2025-12-22',
      '2025-12-20',
      '2025-12-26',
      '2026-01-30',
    ])
    expect(searchOrder('2025-12-23', '2025-12-23', ['2025-12-23'])).toEqual(['2025-12-23'])
  })
})

describe('findPassage', () => {
  const dates = Object.keys(TEXTS)

  it('retrouvé dans sa journée : début et fin', () => {
    const r = findPassage({ primary: '2025-12-22', dates, locate: locateIn(TEXTS, { extract: 'J’ai vérifié deux sources contradictoires avant de conclure sur la date du chantier.' }) })
    expect(r).toMatchObject({ date: '2025-12-22', status: 'found', searchedDays: 1 })
    expect(r.ranges[0].complete).toBe(true)
  })

  it('décalage de date : retrouvé TEL QUEL dans la feuille d’un autre jour', () => {
    const r = findPassage({ primary: '2025-12-23', secondary: '2025-12-23', dates, locate: locateIn(TEXTS, { extract: 'La maquette a cédé [...] en changeant les appuis.' }) })
    expect(r).toMatchObject({ date: '2025-12-27', status: 'relocated' })
    expect(r.ranges).toHaveLength(1)
  })

  it('une ancre raccourcie ailleurs ne suffit pas à déplacer le lecteur', () => {
    // « J’ai écouté Sam … » réduit à deux mots se trouverait partout : pas de relocalisation.
    const texts = { ...TEXTS, '2025-12-30': 'J’ai écouté la radio.' }
    const r = findPassage({ primary: '2025-12-22', dates: Object.keys(texts), locate: locateIn(texts, { extract: 'J’ai écouté longuement le silence de la salle avant de parler' }) })
    expect(r.status).not.toBe('relocated')
  })

  it('un seul bout dans sa journée, rien d’exact ailleurs : partiel (orange)', () => {
    const r = findPassage({ primary: '2025-12-27', dates, locate: locateIn(TEXTS, { extract: 'La maquette a cédé [...] puis tout est reparti de zéro' }) })
    expect(r).toMatchObject({ date: '2025-12-27', status: 'partial' })
    expect(r.ranges[0].complete).toBe(false)
  })

  it('nulle part : non retrouvé ; aucun texte : no-text', () => {
    expect(findPassage({ primary: '2025-12-22', dates, locate: locateIn(TEXTS, { extract: 'Une phrase qui n’existe dans aucune feuille du journal.' }) }).status).toBe('not-found')
    expect(findPassage({ primary: '2025-12-22', dates: [], locate: () => null })).toMatchObject({ status: 'no-text', ranges: [] })
  })
})

describe('synthèses évolutives : visibles seulement pour leur ensemble source', () => {
  const ds = {
    narratives: [
      { id: 'n1', kind: 'competence-evolutive', scope: { code: '1.01' }, sourceDates: ['2025-12-22', '2025-12-23'], html: '<p>Texte</p>' },
      { id: 'n2', kind: 'pole-evolutif', scope: { pole: 1 }, sourceDates: ['2025-12-22'], html: '<p>Pôle</p>' },
    ],
  }
  it('sameDates compare des ensembles', () => {
    expect(sameDates(['a', 'b'], ['b', 'a', 'a'])).toBe(true)
    expect(sameDates(['a'], ['a', 'b'])).toBe(false)
  })
  it('visible si l’ensemble affiché est exactement l’ensemble source', () => {
    expect(narrativesFor(ds, 'competence-evolutive', { code: '1.01' }, ['2025-12-23', '2025-12-22'])[0]).toMatchObject({ visible: true, sourceCount: 2, shownCount: 2 })
    expect(narrativesFor(ds, 'competence-evolutive', { code: '1.01' }, ['2025-12-22'])[0]).toMatchObject({ visible: false, from: '2025-12-22', to: '2025-12-23' })
    expect(narrativesFor(ds, 'competence-evolutive', { code: '1.02' }, ['2025-12-22'])).toEqual([])
    expect(narrativesFor(ds, 'pole-evolutif', { pole: 1 }, ['2025-12-22'])[0].visible).toBe(true)
  })
})
