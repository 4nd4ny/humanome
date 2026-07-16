// Accueil de l'atelier (P10) — encart « Partir du Twin6 » et fork-with-rename
// d'un paquet réservé (D1/AD-D1) : le fork d'un paquet réservé impose un
// nouveau nom (toId), transmis à l'API.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AccueilSection from './AccueilSection.jsx'

afterEach(cleanup)

function fakeApi(overrides = {}) {
  return {
    listPublished: vi.fn(async () => [
      { id: 'aurora-v3-reconstruit', version: '1.0.0', description: 'défaut', reserved: false },
      { id: 'twin6-ouverte', version: '1.0.0', description: 'Twin6 open source', reserved: true },
    ]),
    listDrafts: vi.fn(async () => []),
    getDefault: vi.fn(async () => ({ id: 'aurora-v3-reconstruit', version: '1.0.0' })),
    createDraft: vi.fn(async () => ({ draftId: 77 })),
    proposeDefault: vi.fn(async () => ({ ok: true })),
    ...overrides,
  }
}

describe('AccueilSection — encart Partir du Twin6', () => {
  it('affiche l’encart quand twin6-ouverte est publié', async () => {
    render(<AccueilSection api={fakeApi()} />)
    expect(await screen.findByRole('heading', { name: 'Partir du Twin6' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Partir du Twin6 \(1\.0\.0\)/ })).toBeTruthy()
  })

  it('un fork de paquet réservé demande un nouveau nom et le transmet (toId)', async () => {
    const api = fakeApi()
    render(<AccueilSection api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: /Partir du Twin6/ }))

    // Le formulaire propose un nom de copie pré-rempli, éditable.
    const nameInput = await screen.findByLabelText('Nom du paquet copié')
    expect(nameInput.value).toBe('twin6-ouverte-ma-copie')
    fireEvent.change(nameInput, { target: { value: 'mon-twin6' } })

    fireEvent.click(screen.getByRole('button', { name: 'Créer le brouillon' }))
    await waitFor(() => expect(api.createDraft).toHaveBeenCalledTimes(1))
    expect(api.createDraft).toHaveBeenCalledWith({
      fromId: 'twin6-ouverte',
      fromVersion: '1.0.0',
      version: '1.0.1',
      toId: 'mon-twin6',
    })
  })

  it('un paquet non réservé garde le flux « Nouvelle version » sans toId', async () => {
    const api = fakeApi()
    render(<AccueilSection api={api} />)
    await screen.findByRole('heading', { name: 'Paquets publiés' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Nouvelle version' })[0])
    // Pas de champ « Nom du paquet copié » pour un paquet non réservé.
    expect(screen.queryByLabelText('Nom du paquet copié')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Créer le brouillon' }))
    await waitFor(() => expect(api.createDraft).toHaveBeenCalledTimes(1))
    expect(api.createDraft).toHaveBeenCalledWith({
      fromId: 'aurora-v3-reconstruit',
      fromVersion: '1.0.0',
      version: '1.0.1',
      toId: undefined,
    })
  })
})
