import { describe, expect, it } from 'vitest'
import { navGroups, workRoles } from './nav.js'

describe('navGroups', () => {
  it('un visiteur anonyme ne voit que « Découvrir »', () => {
    const groups = navGroups({ roles: [] })
    expect(groups).toHaveLength(1)
    expect(groups[0].family).toBe('Découvrir')
    expect(groups[0].items.map((i) => i.href)).toEqual([
      '#/',
      '#/merge',
      '#/essayer',
      '#/referentiel',
      '#/guides',
    ])
  })

  it('un apprenant gagne « Mon espace », « Mon portfolio » et « Analyse Twin_v9 »', () => {
    const groups = navGroups({ roles: ['apprenant'] })
    expect(groups.map((g) => g.family)).toEqual(['Découvrir', 'Mon travail'])
    expect(groups[1].items.map((i) => i.href)).toEqual(['#/espace', '#/portfolio', '#/twin9'])
  })

  it('cumule les sections de plusieurs rôles sans doublon', () => {
    const groups = navGroups({ roles: ['apprenant', 'cartographe', 'admin'] })
    const hrefs = groups[1].items.map((i) => i.href)
    expect(hrefs).toContain('#/espace')
    expect(hrefs).toContain('#/cartographe')
    expect(hrefs).toContain('#/admin')
    expect(new Set(hrefs).size).toBe(hrefs.length) // pas de doublon
  })

  it('un rôle inconnu n’ajoute rien', () => {
    const groups = navGroups({ roles: ['inconnu'] })
    expect(groups).toHaveLength(1)
  })
})

describe('workRoles', () => {
  it('retient les rôles de travail, hors « apprenant »', () => {
    expect(workRoles(['apprenant', 'cartographe', 'employeur'])).toEqual(['cartographe'])
  })
})
