// Traçabilité — exigence « refonte ergonomie/navigation », point 8 : bouton
// « ? » d'aide contextuelle. App.test.jsx couvre l'ouverture depuis le shell
// et la fermeture par Échap ; ce fichier prouve les comportements propres au
// panneau (Help.jsx) : fermeture au clic sur l'overlay (mais pas DANS le
// panneau), focus initial sur « Fermer l'aide », sémantique de dialogue
// modal (aria-modal, étiquetage par le titre de l'entrée).

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Help from './Help.jsx'

afterEach(cleanup)

/** Panneau ouvert sur la rubrique merge, session anonyme (entrée de base). */
function renderHelp(overrides = {}) {
  const props = {
    route: 'merge',
    session: { roles: [] },
    open: true,
    onToggle: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<Help {...props} />)
  return props
}

describe('Help — panneau « ? » d’aide contextuelle', () => {
  it('un clic sur l’overlay (hors panneau) ferme ; un clic DANS le panneau ne ferme pas', () => {
    const { onClose } = renderHelp()

    // Clic à l'intérieur du dialogue : pas de fermeture.
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    // Clic sur le voile autour : fermeture.
    fireEvent.click(document.querySelector('.help-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('à l’ouverture, le focus est posé sur le bouton « Fermer l’aide »', () => {
    renderHelp()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fermer l’aide' }))
  })

  it('le dialogue est modal et étiqueté par le titre de l’entrée de la rubrique', () => {
    renderHelp()
    const dialog = screen.getByRole('dialog', { name: 'La cartographie évolutive' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBe('help-title')
    expect(screen.getByRole('heading', { name: 'La cartographie évolutive' }).id).toBe(
      'help-title',
    )
  })

  it('fermé : seul le bouton déclencheur est rendu (aria-expanded=false, aria-haspopup=dialog)', () => {
    renderHelp({ open: false })
    const button = screen.getByRole('button', { name: 'Aide sur cette rubrique' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
