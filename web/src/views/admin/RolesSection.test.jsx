// Section « Rôles » (P12.1) : tableau des comptes + rôles, attribution,
// retrait, et garde d'anti-verrouillage (l'admin connecté ne peut pas retirer
// son propre rôle admin — 🔒 au lieu du bouton de retrait).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import RolesSection from './RolesSection.jsx'
import { resetApiClient } from '../../api/client.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

function routedFetch(routes) {
  return vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const handler = routes[key]
    if (!handler) throw new Error(`route non mockée : ${key}`)
    return typeof handler === 'function' ? handler(init) : handler
  })
}

const USERS = {
  users: [
    { id: 1, email: 'root@b.fr', displayName: 'Root Admin', createdAt: '2026-01-01T09:00:00', roles: ['admin'] },
    { id: 5, email: 'maya@b.fr', displayName: 'Maya', createdAt: '2026-02-01T09:00:00', roles: ['apprenant'] },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
}

const rowOf = (name) => screen.getByText(name).closest('tr')

describe('RolesSection', () => {
  it('affiche les comptes et leurs rôles', async () => {
    const fetchFn = routedFetch({ 'GET api/admin/users': jsonResponse(200, USERS) })
    render(<RolesSection currentUserId={1} fetchFn={fetchFn} />)
    await screen.findByText('Maya')
    expect(within(rowOf('Root Admin')).getByText('admin')).toBeTruthy()
    expect(within(rowOf('Maya')).getByText('apprenant')).toBeTruthy()
  })

  it('anti-verrouillage : pas de bouton de retrait pour le propre rôle admin', async () => {
    const fetchFn = routedFetch({ 'GET api/admin/users': jsonResponse(200, USERS) })
    render(<RolesSection currentUserId={1} fetchFn={fetchFn} />)
    await screen.findByText('Root Admin')

    // Le rôle admin de l'admin connecté n'a pas de bouton « Retirer ».
    expect(
      within(rowOf('Root Admin')).queryByRole('button', { name: /Retirer le rôle admin/i }),
    ).toBeNull()
    expect(within(rowOf('Root Admin')).getByTitle(/anti-verrouillage/i)).toBeTruthy()

    // Le rôle d'un autre compte, lui, est retirable.
    expect(
      within(rowOf('Maya')).getByRole('button', { name: /Retirer le rôle apprenant/i }),
    ).toBeTruthy()
  })

  it('attribue un rôle (POST puis rechargement)', async () => {
    const fetchFn = routedFetch({
      'GET api/admin/users': jsonResponse(200, USERS),
      'POST api/admin/users/5/roles': jsonResponse(200, { id: 5, role: 'cartographe', status: 'granted' }),
    })
    render(<RolesSection currentUserId={1} fetchFn={fetchFn} />)
    await screen.findByText('Maya')

    const row = within(rowOf('Maya'))
    fireEvent.change(row.getByLabelText(/Rôle à attribuer à maya@b.fr/i), {
      target: { value: 'cartographe' },
    })
    fireEvent.click(row.getByRole('button', { name: 'Attribuer' }))

    await waitFor(() =>
      expect(fetchFn).toHaveBeenCalledWith(
        'api/admin/users/5/roles',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ role: 'cartographe' }) }),
      ),
    )
    await screen.findByText(/attribué/i)
  })

  it('retire un rôle (DELETE)', async () => {
    const fetchFn = routedFetch({
      'GET api/admin/users': jsonResponse(200, USERS),
      'DELETE api/admin/users/5/roles/apprenant': jsonResponse(200, { id: 5, role: 'apprenant', status: 'revoked' }),
    })
    render(<RolesSection currentUserId={1} fetchFn={fetchFn} />)
    await screen.findByText('Maya')

    fireEvent.click(
      within(rowOf('Maya')).getByRole('button', { name: /Retirer le rôle apprenant/i }),
    )

    await waitFor(() =>
      expect(fetchFn).toHaveBeenCalledWith(
        'api/admin/users/5/roles/apprenant',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    )
    await screen.findByText(/retiré/i)
  })

  it('recherche par requête (query dans l’URL)', async () => {
    const fetchFn = routedFetch({
      'GET api/admin/users': jsonResponse(200, USERS),
      'GET api/admin/users?query=maya': jsonResponse(200, {
        users: [USERS.users[1]],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    })
    render(<RolesSection currentUserId={1} fetchFn={fetchFn} />)
    await screen.findByText('Root Admin')

    fireEvent.change(screen.getByLabelText(/Rechercher un compte/i), { target: { value: 'maya' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))

    await waitFor(() => expect(screen.queryByText('Root Admin')).toBeNull())
    expect(screen.getByText('Maya')).toBeTruthy()
  })
})
