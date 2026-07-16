// Traçabilité — exigence « refonte ergonomie/navigation », point 8 : bouton
// « ? » d'aide contextuelle PAR rubrique et PAR rôle (web/src/help/registry.js).
// Ce fichier prouve helpFor : variantes de rôle (cartographe, établissement),
// entrée de base inchangée pour les autres rôles, repli « Aide » pour une
// route inconnue, et la traçabilité nav <-> aide : chaque rubrique du menu
// (nav.js, point 6) doit avoir une entrée d'aide dédiée — pas le repli.

import { describe, expect, it } from 'vitest'
import { helpFor } from './registry.js'
import { navGroups } from '../nav.js'

describe('helpFor — aide par rubrique et par rôle', () => {
  it('cartographe : sur l’accueil et la cartographie, un point renvoie vers « Encadrer et garantir »', () => {
    for (const route of ['home', 'merge']) {
      const base = helpFor(route)
      const entry = helpFor(route, { roles: ['cartographe'] })
      expect(entry.titre).toBe(base.titre)
      expect(entry.points).toHaveLength((base.points ?? []).length + 1)
      const extra = entry.points.at(-1)
      expect(extra).toContain('Ma file de relecture')
      expect(extra).toContain('Encadrer et garantir')
    }
  })

  it('établissement : sur l’accueil et la cartographie, un point renvoie vers « Piloter mon organisation »', () => {
    for (const route of ['home', 'merge']) {
      const extra = helpFor(route, { roles: ['etablissement'] }).points.at(-1)
      expect(extra).toContain('Mes cohortes')
      expect(extra).toContain('Piloter mon organisation')
    }
  })

  it('la variante de rôle ne fuit pas sur les autres rubriques (référentiel inchangé)', () => {
    expect(helpFor('referentiel', { roles: ['cartographe'] })).toEqual(helpFor('referentiel'))
  })

  it('apprenant : l’entrée de base est inchangée (pas de point parasite)', () => {
    expect(helpFor('merge', { roles: ['apprenant'] })).toEqual(helpFor('merge'))
    expect(helpFor('home', { roles: ['apprenant'] })).toEqual(helpFor('home'))
  })

  it('route inconnue -> entrée de repli « Aide »', () => {
    const entry = helpFor('route-inexistante')
    expect(entry.titre).toBe('Aide')
    expect(entry.intro).toContain('navigation')
  })

  it('session absente ou sans rôles : ne jette pas, retourne l’entrée de base', () => {
    expect(helpFor('merge').titre).toBe('La cartographie évolutive')
    expect(helpFor('merge', {}).titre).toBe('La cartographie évolutive')
    expect(helpFor('merge', { roles: [] }).titre).toBe('La cartographie évolutive')
  })

  it('traçabilité nav <-> aide : chaque rubrique du menu a une entrée dédiée (pas le repli)', () => {
    // Toutes les familles possibles : session anonyme + session cumulant tous
    // les rôles (nav additive). Un item avec `route` est une rubrique du menu.
    const allRoles = [
      'apprenant',
      'cartographe',
      'promptologue',
      'epistemiarque',
      'etablissement',
      'admin',
    ]
    const routes = new Set()
    for (const session of [{ roles: [] }, { roles: allRoles }]) {
      for (const family of navGroups(session)) {
        for (const item of family.items) {
          if (item.route) routes.add(item.route)
        }
      }
    }
    expect(routes.size).toBeGreaterThan(10) // garde-fou : la nav est bien lue

    const missing = [...routes].filter((route) => helpFor(route).titre === 'Aide')
    expect(missing).toEqual([])
  })
})
