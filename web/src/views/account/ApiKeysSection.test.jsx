import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ApiKeysSection from './ApiKeysSection.jsx'
import { ApiError } from '../../api/client.js'

afterEach(cleanup)

function fakeDeps(overrides = {}) {
  return {
    listKeys: vi.fn(async () => [{ provider: 'anthropic', createdAt: '2026-07-15T10:00:00' }]),
    storeKey: vi.fn(async () => null),
    deleteKey: vi.fn(async () => null),
    ...overrides,
  }
}

describe('ApiKeysSection', () => {
  it('liste les clés enregistrées (sans jamais la clé)', async () => {
    render(<ApiKeysSection deps={fakeDeps()} />)
    // Date unique de la ligne (« Anthropic (Claude) » figure aussi dans le select).
    expect(await screen.findByText(/enregistrée le 2026-07-15/)).toBeTruthy()
    expect(document.querySelector('.account-keys-provider').textContent).toBe('Anthropic (Claude)')
  })

  it('aucune clé : message dédié', async () => {
    render(<ApiKeysSection deps={fakeDeps({ listKeys: vi.fn(async () => []) })} />)
    expect(await screen.findByText('Aucune clé enregistrée.')).toBeTruthy()
  })

  it('enregistre une clé (provider + champ) et recharge', async () => {
    const deps = fakeDeps({ listKeys: vi.fn(async () => []) })
    render(<ApiKeysSection deps={deps} />)
    await screen.findByText('Aucune clé enregistrée.')

    fireEvent.change(screen.getByLabelText('Clé API'), { target: { value: 'sk-ant-abcdef123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    await waitFor(() => expect(deps.storeKey).toHaveBeenCalledWith({ provider: 'anthropic', apiKey: 'sk-ant-abcdef123456' }))
    expect(await screen.findByText(/enregistrée \(chiffrée\)/)).toBeTruthy()
  })

  it('le bouton reste désactivé pour une clé trop courte', async () => {
    render(<ApiKeysSection deps={fakeDeps({ listKeys: vi.fn(async () => []) })} />)
    await screen.findByText('Aucune clé enregistrée.')
    fireEvent.change(screen.getByLabelText('Clé API'), { target: { value: 'court' } })
    expect(screen.getByRole('button', { name: 'Enregistrer la clé' })).toHaveProperty('disabled', true)
  })

  it('supprime une clé', async () => {
    const deps = fakeDeps()
    render(<ApiKeysSection deps={deps} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(deps.deleteKey).toHaveBeenCalledWith('anthropic'))
  })

  it('erreur de chargement : message', async () => {
    const deps = fakeDeps({ listKeys: vi.fn(async () => { throw new ApiError('Boom', 500) }) })
    render(<ApiKeysSection deps={deps} />)
    expect(await screen.findByText('Boom')).toBeTruthy()
  })
})
