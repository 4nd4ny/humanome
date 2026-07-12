import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import HomeView from './HomeView.jsx'
import dayFixture from '../../../schemas/fixtures/cartographie-jour-2026-01-05.json'

afterEach(cleanup)

function fakeFile(content) {
  return { text: async () => content }
}

function drop(content) {
  fireEvent.drop(screen.getByTestId('dropzone'), {
    dataTransfer: { files: [fakeFile(content)] },
  })
}

describe('HomeView', () => {
  it('présente la démo, le chargement local et la garantie de confidentialité', () => {
    render(<HomeView onUserDocument={() => {}} />)
    expect(screen.getByRole('heading', { name: 'humanome.xyz' })).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'Explorer la cartographie de démonstration' }).getAttribute(
        'href',
      ),
    ).toBe('#/merge')
    expect(
      screen.getByRole('link', { name: 'Essayer avec votre propre texte' }).getAttribute('href'),
    ).toBe('#/essayer')
    expect(screen.getByRole('button', { name: 'Charger ma cartographie (JSON)' })).toBeDefined()
    expect(screen.getByText(/vos fichiers ne quittent pas votre navigateur/i)).toBeDefined()
  })

  it('accepte un document jour valide déposé en drag & drop', async () => {
    const onUserDocument = vi.fn()
    render(<HomeView onUserDocument={onUserDocument} />)

    drop(JSON.stringify(dayFixture))

    await waitFor(() => expect(onUserDocument).toHaveBeenCalledTimes(1))
    const { kind, doc } = onUserDocument.mock.calls[0][0]
    expect(kind).toBe('cartographie-jour')
    expect(doc.date).toBe('2026-01-05')
    expect(screen.queryByRole('alert')).toBe(null)
  })

  it('affiche les erreurs de validation d’un JSON non conforme', async () => {
    const onUserDocument = vi.fn()
    render(<HomeView onUserDocument={onUserDocument} />)

    drop(JSON.stringify({ kind: 'cartographie-jour', date: 'pas-une-date' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect(screen.getByRole('alert').textContent).toContain(
      'non conforme au schéma « cartographie-jour »',
    )
    expect(onUserDocument).not.toHaveBeenCalled()
  })

  it('refuse un fichier non JSON avec un message clair', async () => {
    render(<HomeView onUserDocument={() => {}} />)
    drop('const domainsData = [];')
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('carto-data.js hérité'),
    )
  })
})
