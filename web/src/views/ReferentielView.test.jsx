import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ReferentielView from './ReferentielView.jsx'

afterEach(cleanup)

const fixture = {
  version: '1.0.0',
  label: 'Fixture v1',
  poles: [
    { num: 1, nom: 'TETE — Penser', couleur: '#2563eb' },
    { num: 2, nom: 'COEUR — Relier', couleur: '#10b981' },
  ],
  competences: [
    { code: '1.01', nom: 'Pensée Critique', pole: 1 },
    { code: '1.02', nom: 'Synthèse Intégrative', pole: 1 },
    { code: '2.01', nom: 'Communication Authentique', pole: 2 },
  ],
}

const load = async () => ({ doc: fixture, origin: 'published' })

async function renderView(props = {}) {
  render(<ReferentielView load={load} {...props} />)
  await screen.findByText('TETE — Penser')
}

describe('ReferentielView', () => {
  it('rend l’arbre pôles -> compétences avec les couleurs des pôles', async () => {
    await renderView()

    expect(screen.getByRole('heading', { name: 'Référentiel de compétences' })).toBeDefined()
    expect(screen.getByText(/Fixture v1 — version 1\.0\.0/)).toBeDefined()

    // Les deux pôles et leurs compétences.
    expect(screen.getByText('COEUR — Relier')).toBeDefined()
    expect(screen.getByText('Pensée Critique')).toBeDefined()
    expect(screen.getByText('Communication Authentique')).toBeDefined()

    // Couleur du pôle portée par la variable CSS de la section.
    const sections = document.querySelectorAll('.ref-pole')
    expect(sections).toHaveLength(2)
    expect(sections[0].style.getPropertyValue('--pole-color')).toBe('#2563eb')
    expect(sections[1].style.getPropertyValue('--pole-color')).toBe('#10b981')

    // Bandeau Decidim sobre, en lien externe.
    expect(
      screen
        .getByRole('link', { name: /Participer sur participer\.harmonia\.education/ })
        .getAttribute('href'),
    ).toBe('https://participer.harmonia.education')
    expect(screen.getByText(/nourrit et critique le référentiel/)).toBeDefined()
  })

  it('filtre par la recherche, insensible aux accents, sur code et nom', async () => {
    await renderView()
    const input = screen.getByLabelText('Rechercher une compétence')

    // Par nom, sans accents ni majuscules.
    fireEvent.change(input, { target: { value: 'pensee critique' } })
    expect(screen.getByText('Pensée Critique')).toBeDefined()
    expect(screen.queryByText('Communication Authentique')).toBe(null)
    expect(screen.queryByText('COEUR — Relier')).toBe(null) // pôle vide masqué
    expect(screen.getByRole('status').textContent).toContain('1 compétence sur 3')

    // Par code.
    fireEvent.change(input, { target: { value: '2.01' } })
    expect(screen.getByText('Communication Authentique')).toBeDefined()
    expect(screen.queryByText('Pensée Critique')).toBe(null)

    // Effacer la recherche restaure tout.
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByText('Pensée Critique')).toBeDefined()
    expect(screen.getByRole('status').textContent).toContain('3 compétences')
  })

  it('expose un permalien #/referentiel/<code> par compétence', async () => {
    await renderView()
    expect(screen.getByRole('link', { name: '1.02' }).getAttribute('href')).toBe(
      '#/referentiel/1.02',
    )
  })

  it('surligne la compétence permaliée (focusCode)', async () => {
    await renderView({ focusCode: '1.02' })

    const item = document.getElementById('competence-1.02')
    expect(item).not.toBe(null)
    expect(item.className).toContain('ref-competence-focus')
    expect(screen.getByRole('link', { name: '1.02' }).getAttribute('aria-current')).toBe('true')

    // Les autres lignes ne sont pas surlignées.
    expect(document.getElementById('competence-1.01').className).not.toContain(
      'ref-competence-focus',
    )
  })

  it('signale proprement un code permalié inconnu', async () => {
    await renderView({ focusCode: '9.99' })
    expect(screen.getByRole('alert').textContent).toContain('9.99')
    expect(screen.getByRole('alert').textContent).toContain('introuvable')
  })
})
