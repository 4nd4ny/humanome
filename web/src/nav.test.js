import { describe, expect, it } from 'vitest'
import { isCurrentItem, navGroups } from './nav.js'

describe('navGroups (sept familles d’intention)', () => {
  it('un visiteur anonyme voit « Découvrir » et « Compte » (Se connecter)', () => {
    const groups = navGroups({ roles: [] })
    expect(groups.map((g) => g.id)).toEqual(['decouvrir', 'compte'])
    expect(groups[0].items.map((i) => i.href)).toEqual([
      '#/',
      '#/merge',
      '#/essayer',
      '#/referentiel',
      '#/guides',
    ])
    expect(groups[1].items.map((i) => i.label)).toEqual(['Se connecter', 'Confidentialité'])
  })

  it('un apprenant gagne « Ma cartographie », avec l’échelle de valeur badgée', () => {
    const groups = navGroups({ roles: ['apprenant'] })
    expect(groups.map((g) => g.id)).toEqual(['decouvrir', 'cartographie', 'compte'])
    const carto = groups[1]
    expect(carto.label).toBe('Ma cartographie')
    expect(carto.items.map((i) => i.label)).toEqual([
      'Tableau de bord',
      'Mon portfolio',
      'Cartographier mes écrits',
      'Cartographie ouverte',
      'Analyse approfondie',
      'Partager ma cartographie',
    ])
    // Échelle de valeur lisible depuis les libellés (friction n°1).
    const badges = Object.fromEntries(carto.items.filter((i) => i.badge).map((i) => [i.label, i.badge]))
    expect(badges).toEqual({
      'Cartographier mes écrits': 'standard',
      'Cartographie ouverte': 'gratuit',
      'Analyse approfondie': 'premium',
    })
  })

  it('chaque rôle cumulé ajoute SA famille, dans un ordre stable', () => {
    const groups = navGroups({ roles: ['apprenant', 'cartographe', 'admin'] })
    expect(groups.map((g) => g.id)).toEqual([
      'decouvrir',
      'cartographie',
      'encadrer',
      'administrer',
      'compte',
    ])
    const encadrer = groups.find((g) => g.id === 'encadrer')
    expect(encadrer.items[0]).toMatchObject({ href: '#/cartographe', label: 'Ma file de relecture' })
    const admin = groups.find((g) => g.id === 'administrer')
    expect(admin.items).toHaveLength(5)
  })

  it('« Faire évoluer » filtre ses items par rôle (promptologue vs épistémiarque)', () => {
    const promptologue = navGroups({ roles: ['apprenant', 'promptologue'] })
    const evoluer = promptologue.find((g) => g.id === 'evoluer')
    expect(evoluer.items.map((i) => i.label)).toEqual(['Atelier de prompts'])

    const both = navGroups({ roles: ['apprenant', 'promptologue', 'epistemiarque'] })
    expect(both.find((g) => g.id === 'evoluer').items.map((i) => i.label)).toEqual([
      'Atelier de prompts',
      'Édition du référentiel',
    ])

    // L'épistémiarque seul a désormais un domicile (friction découverte).
    const epistemiarque = navGroups({ roles: ['apprenant', 'epistemiarque'] })
    expect(epistemiarque.find((g) => g.id === 'evoluer').items.map((i) => i.label)).toEqual([
      'Édition du référentiel',
    ])
  })

  it('connecté, la famille compte expose profil, crédit et confidentialité', () => {
    const groups = navGroups({ roles: ['apprenant'] })
    const compte = groups.find((g) => g.id === 'compte')
    expect(compte.label).toBe('Mon compte')
    expect(compte.items.map((i) => i.href)).toEqual([
      '#/compte',
      '#/compte/credit',
      '#/confidentialite',
    ])
  })

  it('un rôle inconnu n’ajoute rien', () => {
    const groups = navGroups({ roles: ['inconnu'] })
    expect(groups.map((g) => g.id)).toEqual(['decouvrir', 'compte'])
  })
})

describe('isCurrentItem', () => {
  const dashboard = { href: '#/espace', label: 'Tableau de bord', route: 'espace' }
  const run = { href: '#/espace/nouveau-run', route: 'espace', section: 'nouveau-run' }
  const partage = { href: '#/espace', label: 'Partager ma cartographie' } // sans route

  it('un item sans section ne matche que la racine de sa route', () => {
    expect(isCurrentItem(dashboard, { name: 'espace', section: null })).toBe(true)
    expect(isCurrentItem(dashboard, { name: 'espace', section: 'nouveau-run' })).toBe(false)
  })

  it('un item avec section matche exactement sa sous-section', () => {
    expect(isCurrentItem(run, { name: 'espace', section: 'nouveau-run' })).toBe(true)
    expect(isCurrentItem(run, { name: 'espace', section: null })).toBe(false)
  })

  it('un alias sans route n’est jamais courant', () => {
    expect(isCurrentItem(partage, { name: 'espace', section: null })).toBe(false)
  })
})
