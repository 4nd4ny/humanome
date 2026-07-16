// Assistant tuteur (D9) — panneau de chat : ouverture, envoi/rendu, disclaimer,
// historique sessionStorage, effacement. `ask` est injecté (aucun réseau).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TuteurPanel from './TuteurPanel.jsx'

afterEach(cleanup)
beforeEach(() => sessionStorage.clear())

describe('TuteurPanel', () => {
  it('ouvre le panneau, envoie une question et rend la réponse', async () => {
    const ask = vi.fn(async () => ({ text: 'Ouvre #/essayer pour cartographier votre texte.' }))
    render(<TuteurPanel route="home" ask={ask} />)

    // Fermé au départ.
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Assistant/ }))
    // Disclaimer IA + zone de saisie.
    expect(screen.getByText(/Assistant automatique \(IA\)/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Votre question/), {
      target: { value: 'Comment cartographier mon texte ?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    // La question passe la rubrique courante, pas de portfolio.
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1))
    expect(ask.mock.calls[0][0]).toEqual({
      question: 'Comment cartographier mon texte ?',
      rubrique: 'home',
    })

    expect(await screen.findByText(/Ouvre #\/essayer/)).toBeTruthy()
    // Le message utilisateur est affiché aussi.
    expect(screen.getByText('Comment cartographier mon texte ?')).toBeTruthy()
  })

  it('persiste l’historique en sessionStorage et l’efface', async () => {
    const ask = vi.fn(async () => ({ text: 'Réponse.' }))
    render(<TuteurPanel route="merge" ask={ask} />)
    fireEvent.click(screen.getByRole('button', { name: /Assistant/ }))
    fireEvent.change(screen.getByLabelText(/Votre question/), { target: { value: 'Bonjour' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    await screen.findByText('Réponse.')

    const stored = JSON.parse(sessionStorage.getItem('humanome-tuteur'))
    expect(stored).toEqual([
      { role: 'user', text: 'Bonjour' },
      { role: 'assistant', text: 'Réponse.' },
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Effacer' }))
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem('humanome-tuteur'))).toEqual([]))
  })

  it('affiche une erreur claire si l’assistant échoue', async () => {
    const ask = vi.fn(async () => {
      throw new Error('L’assistant est saturé, réessayez plus tard.')
    })
    render(<TuteurPanel route="home" ask={ask} />)
    fireEvent.click(screen.getByRole('button', { name: /Assistant/ }))
    fireEvent.change(screen.getByLabelText(/Votre question/), { target: { value: 'Salut' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect((await screen.findByRole('alert')).textContent).toContain('saturé')
  })
})
