import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import App from './App.jsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('App', () => {
  it('affiche le statut de l’API quand /api/health répond', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', version: 'test' }),
      }),
    )

    render(<App />)

    await waitFor(() =>
      expect(screen.getByTestId('api-status').textContent).toContain('ok (version test)'),
    )
  })

  it('affiche une erreur quand l’API est indisponible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))

    render(<App />)

    await waitFor(() =>
      expect(screen.getByTestId('api-status').textContent).toContain('indisponible'),
    )
  })
})
