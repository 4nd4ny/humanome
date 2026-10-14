import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import HomeView from './HomeView.jsx'

afterEach(cleanup)

/** Fichier minimal (jsdom) : un nom et son contenu en octets. */
function fakeFile(name, content) {
  return { name, arrayBuffer: async () => new TextEncoder().encode(content).buffer }
}

describe('HomeView', () => {
  it('présente la démo (interface de cartographie), l’ouverture de fichiers et la garantie de confidentialité', () => {
    render(<HomeView onUserFiles={() => {}} />)
    expect(screen.getByRole('heading', { name: 'humanome.xyz' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Explorer la cartographie de démonstration' }).getAttribute('href')).toBe('#/cartographie')
    expect(screen.getByRole('link', { name: 'Essayer avec votre propre texte' }).getAttribute('href')).toBe('#/essayer')
    expect(screen.getByRole('button', { name: 'Ouvrir mes fichiers de cartographie' })).toBeDefined()
    expect(screen.getByText(/vos fichiers ne quittent pas votre navigateur/i)).toBeDefined()
  })

  it('les fichiers déposés sont lus dans le navigateur et remis tels quels à la cartographie', async () => {
    const onUserFiles = vi.fn()
    render(<HomeView onUserFiles={onUserFiles} />)
    fireEvent.drop(screen.getByTestId('dropzone'), {
      dataTransfer: { files: [fakeFile('2026-01-05.json', '{"kind":"cartographie-jour"}'), fakeFile('journal.md', '# Journal')] },
    })
    await waitFor(() => expect(onUserFiles).toHaveBeenCalledTimes(1))
    const files = onUserFiles.mock.calls[0][0]
    expect(files.map((f) => f.path)).toEqual(['2026-01-05.json', 'journal.md'])
    expect(new TextDecoder().decode(files[1].bytes)).toBe('# Journal')
    expect(screen.queryByRole('alert')).toBe(null)
  })

  it('le sélecteur accepte plusieurs fichiers', async () => {
    const onUserFiles = vi.fn()
    render(<HomeView onUserFiles={onUserFiles} />)
    fireEvent.change(screen.getByLabelText('Ouvrir mes fichiers de cartographie'), {
      target: { files: [fakeFile('a.json', '{}'), fakeFile('b.json', '{}')] },
    })
    await waitFor(() => expect(onUserFiles).toHaveBeenCalledTimes(1))
    expect(onUserFiles.mock.calls[0][0]).toHaveLength(2)
  })

  it('un fichier illisible est signalé sans rien transmettre', async () => {
    const onUserFiles = vi.fn()
    render(<HomeView onUserFiles={onUserFiles} />)
    fireEvent.drop(screen.getByTestId('dropzone'), {
      dataTransfer: { files: [{ name: 'x.json', arrayBuffer: async () => Promise.reject(new Error('fichier verrouillé')) }] },
    })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Lecture impossible : fichier verrouillé'))
    expect(onUserFiles).not.toHaveBeenCalled()
  })
})
