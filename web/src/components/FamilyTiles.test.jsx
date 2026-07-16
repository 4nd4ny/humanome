import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import FamilyTiles from './FamilyTiles.jsx'

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

/** La grille de tuiles (au sein de la section « Plan du site »). */
function tiles() {
  return within(screen.getByRole('region', { name: 'Plan du site' }))
}

describe('FamilyTiles — landing de profil', () => {
  it('visiteur : tuiles Découvrir + Compte, sans famille de travail', () => {
    render(<FamilyTiles roles={[]} />)
    const t = tiles()
    expect(t.getByText('Découvrir')).toBeDefined()
    expect(t.getByRole('link', { name: /^Accueil/ }).getAttribute('href')).toBe('#/')
    expect(t.getByRole('link', { name: 'Se connecter' })).toBeDefined()
    expect(t.queryByText('Ma cartographie')).toBeNull()
    expect(t.getByRole('button', { name: 'Voir les profils d’utilisateurs' })).toBeDefined()
  })

  it('connecté : tuiles des familles de SES rôles, sans bouton profils', () => {
    render(<FamilyTiles roles={['apprenant', 'cartographe']} />)
    const t = tiles()
    expect(t.getByText('Vos espaces')).toBeDefined()
    expect(t.getByText('Ma cartographie')).toBeDefined()
    expect(t.getByText('Encadrer et garantir')).toBeDefined()
    expect(t.getByRole('link', { name: 'Ma file de relecture' }).getAttribute('href')).toBe(
      '#/cartographe',
    )
    expect(t.queryByRole('button', { name: /profils d’utilisateurs/ })).toBeNull()
  })

  it('visiteur : le bouton révèle la persona-bar, un profil montre ses familles', () => {
    render(<FamilyTiles roles={[]} />)
    const t = tiles()
    fireEvent.click(t.getByRole('button', { name: 'Voir les profils d’utilisateurs' }))

    const bar = within(t.getByRole('group', { name: 'Choisir un profil à explorer' }))
    expect(bar.getByRole('button', { name: 'Visiteur' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(bar.getByRole('button', { name: 'Cartographe' }))
    expect(t.getByText('Encadrer et garantir')).toBeDefined()
    expect(t.getByText('Ma cartographie')).toBeDefined() // apprenant est porté par tous
    expect(t.getByRole('status').textContent).toContain('Aperçu du profil')
  })

  it('visiteur : le profil Employeur explique le lien de partage (pas de tuiles)', () => {
    render(<FamilyTiles roles={[]} />)
    const t = tiles()
    fireEvent.click(t.getByRole('button', { name: 'Voir les profils d’utilisateurs' }))
    fireEvent.click(t.getByRole('button', { name: 'Employeur' }))
    expect(t.getByText(/cartographie qu’un apprenant vous a partagée/i)).toBeDefined()
    expect(t.queryByText('Découvrir')).toBeNull()
  })

  it('visiteur : le profil Employeur présente l’offre de recherche À VENIR (tarif + contact)', () => {
    render(<FamilyTiles roles={[]} />)
    const t = tiles()
    fireEvent.click(t.getByRole('button', { name: 'Voir les profils d’utilisateurs' }))
    fireEvent.click(t.getByRole('button', { name: 'Employeur' }))

    // Second volet : le moteur de recherche de profils.
    expect(t.getByText('Rechercher des profils')).toBeDefined()
    // Modèle tarifaire en clair + financement des pays émergents.
    expect(t.getByText(/1 USD/)).toBeDefined()
    expect(t.getByText(/dégressif à partir de 10, 100 et\s+1000/)).toBeDefined()
    expect(t.getByText(/pays émergents/)).toBeDefined()
    // Contact factorisé (constante), en mailto.
    const contact = t.getByRole('link', { name: 'contact@humanome.xyz' })
    expect(contact.getAttribute('href')).toMatch(/^mailto:contact@humanome\.xyz/)

    // AUCUNE promesse de disponibilité immédiate : c'est une offre « à venir ».
    const section = screen.getByRole('region', { name: 'Plan du site' })
    expect(within(section).getAllByText(/à venir/i).length).toBeGreaterThan(0)
    expect(section.textContent).not.toMatch(/disponible (dès )?maintenant|disponible aujourd’hui/i)
  })

  it('le survol d’un lien remplit le callout avec l’aide de la rubrique (« ? »)', () => {
    render(<FamilyTiles roles={[]} />)
    const t = tiles()
    const callout = t.getByRole('note')
    expect(callout.textContent).toContain('Survolez une entrée')

    fireEvent.mouseEnter(t.getByRole('link', { name: /^Essayer/ }))
    expect(callout.textContent).toContain('Essayer sur votre texte') // help/registry.js
    fireEvent.mouseLeave(t.getByRole('link', { name: /^Essayer/ }))
    expect(callout.textContent).toContain('Survolez une entrée')
  })

  it('premier clic = aide + sélection sans naviguer ; second clic = navigation', () => {
    render(<FamilyTiles roles={[]} />)
    const t = tiles()
    const link = t.getByRole('link', { name: /^Essayer/ })

    fireEvent.click(link)
    expect(window.location.hash).toBe('') // pas de navigation au premier clic
    const callout = t.getByRole('note')
    expect(callout.textContent).toContain('Essayer sur votre texte')
    expect(callout.textContent).toContain('Cliquez à nouveau')

    fireEvent.click(link)
    expect(window.location.hash).toBe('#/essayer') // le second clic ouvre
  })

  it('lien armé : le survol d’un AUTRE lien reprend la main sur le callout', () => {
    render(<FamilyTiles roles={[]} />)
    const t = tiles()
    const callout = t.getByRole('note')

    fireEvent.click(t.getByRole('link', { name: /^Essayer/ })) // armé
    expect(callout.textContent).toContain('Cliquez à nouveau')

    // Le survol de « Référentiel » doit afficher SON aide, sans invite (elle
    // ne concerne que le lien armé), puis rendre la main à l'armé au départ.
    fireEvent.mouseEnter(t.getByRole('link', { name: /^Référentiel/ }))
    expect(callout.textContent).toContain('référentiel de compétences')
    expect(callout.textContent).not.toContain('Cliquez à nouveau')

    fireEvent.mouseLeave(t.getByRole('link', { name: /^Référentiel/ }))
    expect(callout.textContent).toContain('Essayer sur votre texte')
    expect(callout.textContent).toContain('Cliquez à nouveau')
  })

  it('deux items partageant le même href s’arment indépendamment (alias #/espace)', () => {
    render(<FamilyTiles roles={['apprenant']} />)
    const t = tiles()
    const dashboard = t.getByRole('link', { name: /^Tableau de bord/ })
    const partage = t.getByRole('link', { name: /^Partager ma cartographie/ })

    fireEvent.click(dashboard) // arme « Tableau de bord » seulement
    expect(dashboard.className).toContain('route-armed')
    expect(partage.className).not.toContain('route-armed')

    fireEvent.click(partage) // 1er clic sur l'alias : arme, ne navigue PAS
    expect(window.location.hash).toBe('')
    expect(partage.className).toContain('route-armed')
    expect(dashboard.className).not.toContain('route-armed')
  })

  it('changer de profil purge le callout (sélection ET survol)', () => {
    render(<FamilyTiles roles={[]} />)
    const t = tiles()
    fireEvent.click(t.getByRole('button', { name: 'Voir les profils d’utilisateurs' }))
    fireEvent.click(t.getByRole('button', { name: 'Cartographe' }))

    // Survol souris d'un lien propre au profil, puis bascule de profil au
    // clavier (aucun mouseleave émis) : l'aide ne doit pas rester affichée.
    fireEvent.mouseEnter(t.getByRole('link', { name: /^Ma file de relecture/ }))
    expect(t.getByRole('note').textContent).toContain('garde-fou humain')

    fireEvent.click(t.getByRole('button', { name: 'Apprenant' }))
    expect(t.getByRole('note').textContent).toContain('Survolez une entrée')
  })

  it('un clic modifié (cmd/ctrl) garde le comportement natif du navigateur', () => {
    render(<FamilyTiles roles={[]} />)
    const t = tiles()
    const link = t.getByRole('link', { name: /^Essayer/ })

    // metaKey : pas de preventDefault, pas de sélection — le navigateur gère.
    fireEvent.click(link, { metaKey: true })
    expect(t.getByRole('note').textContent).not.toContain('Cliquez à nouveau')

    fireEvent.click(link, { ctrlKey: true })
    expect(t.getByRole('note').textContent).not.toContain('Cliquez à nouveau')
  })

  it('Échap désarme la sélection en cours', () => {
    render(<FamilyTiles roles={[]} />)
    const t = tiles()
    fireEvent.click(t.getByRole('link', { name: /^Essayer/ }))
    expect(t.getByRole('note').textContent).toContain('Cliquez à nouveau')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(t.getByRole('note').textContent).not.toContain('Cliquez à nouveau')

    // Après Échap, un clic redevient un premier clic (sélection, pas navigation).
    fireEvent.click(t.getByRole('link', { name: /^Essayer/ }))
    expect(window.location.hash).toBe('')
  })
})
