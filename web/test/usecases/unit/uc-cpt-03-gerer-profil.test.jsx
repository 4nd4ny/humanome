// UC-CPT-03 — Gérer son profil (nom affiché, avatar) : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/compte/UC-CPT-03-gerer-profil.md
//
// Code sollicité appelé directement : initiales et composant Avatar (image
// servie ou repli), URL d'avatar (cassage de cache), redimensionnement client
// resizeAvatar (recadrage carré centré, plafond aligné sur le serveur) et
// fonctions du client API de profil.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Avatar, { initials } from '../../../src/components/Avatar.jsx'
import { AVATAR_SIZE, MAX_AVATAR_BYTES, resizeAvatar } from '../../../src/lib/resize-image.js'
import {
  avatarUrl,
  deleteAvatar,
  login,
  resetApiClient,
  updateProfile,
  uploadAvatar,
} from '../../../src/api/client.js'
import { jsonResponse, noContentResponse } from '../support/cpt.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

describe('UC-CPT-03 — avatar et initiales', () => {
  it('UC-CPT-03-U08 — initials() : deux initiales (premier + dernier mot), une seule pour un mot, « ? » sinon', () => {
    expect(initials('Ada Lovelace')).toBe('AL')
    expect(initials('  jean  paul   sartre ')).toBe('JS')
    expect(initials('ada')).toBe('AD')
    expect(initials('É')).toBe('É')
    expect(initials('')).toBe('?')
    expect(initials(undefined)).toBe('?')
  })

  it('UC-CPT-03-U09 — avatarUrl() : URL relative de l’API, identifiant encodé, version en paramètre anti-cache', () => {
    expect(avatarUrl(7)).toBe('api/users/7/avatar')
    expect(avatarUrl(7, 3)).toBe('api/users/7/avatar?v=3')
    expect(avatarUrl('7/../x', 'a b')).toBe('api/users/7%2F..%2Fx/avatar?v=a%20b')
  })

  it('UC-CPT-03-U10 — <Avatar> : image quand hasAvatar, repli sur les initiales si l’image ne se charge pas', () => {
    render(<Avatar userId={7} displayName="Ada Lovelace" hasAvatar version={2} size={72} />)
    const img = screen.getByTestId('avatar-img')
    expect(img.getAttribute('src')).toBe('api/users/7/avatar?v=2')
    expect(img.getAttribute('alt')).toBe('Avatar de Ada Lovelace')
    expect(img.getAttribute('width')).toBe('72')

    fireEvent.error(img) // 404 (photo retirée ailleurs), réseau…
    expect(screen.queryByTestId('avatar-img')).toBeNull()
    expect(screen.getByTestId('avatar-initials').textContent).toBe('AL')
  })
})

describe('UC-CPT-03 — redimensionnement côté navigateur', () => {
  it('UC-CPT-03-U11 — resizeAvatar recadre un portrait au carré CENTRÉ et l’échantillonne en 256×256', async () => {
    const drawImage = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toDataURL: (mime) => `data:${mime};base64,AAAA`,
    }
    const portrait = { width: 300, height: 500 }

    const out = await resizeAvatar(new Blob(['x']), { canvas, loadImage: async () => portrait })

    expect(drawImage).toHaveBeenCalledWith(portrait, 0, 100, 300, 300, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
    expect([canvas.width, canvas.height]).toEqual([256, 256])
    expect(out).toEqual({ base64: 'AAAA', mime: 'image/webp', bytes: 3 })
  })

  it('UC-CPT-03-U12 — plafond client = plafond serveur (200 Ko), taille cible 256 px', () => {
    expect(MAX_AVATAR_BYTES).toBe(200 * 1024) // AvatarValidator::MAX_BYTES
    expect(AVATAR_SIZE).toBe(256)
  })
})

describe('UC-CPT-03 — client API de profil', () => {
  it('UC-CPT-03-U13 — PATCH auth/me, PUT/DELETE auth/me/avatar : corps, jeton CSRF et rafraîchissement de la navigation', async () => {
    await login({ email: 'a', password: 'b' }, { fetchFn: vi.fn().mockResolvedValue(jsonResponse(200, { user: {}, csrfToken: 'tok-p' })) })
    const events = vi.fn()
    window.addEventListener('humanome:auth', events)

    const patch = vi.fn().mockResolvedValue(jsonResponse(200, { user: { displayName: 'Ada L.' } }))
    await expect(updateProfile({ displayName: 'Ada L.' }, { fetchFn: patch })).resolves.toEqual({ user: { displayName: 'Ada L.' } })
    const put = vi.fn().mockResolvedValue(jsonResponse(200, { status: 'ok', mime: 'image/webp', size: 3 }))
    await uploadAvatar({ avatar: 'AAAA', mime: 'image/webp' }, { fetchFn: put })
    const del = vi.fn().mockResolvedValue(noContentResponse())
    await expect(deleteAvatar({ fetchFn: del })).resolves.toBeUndefined()
    window.removeEventListener('humanome:auth', events)

    expect(patch.mock.calls[0][0]).toBe('api/auth/me')
    expect(patch.mock.calls[0][1].method).toBe('PATCH')
    expect(JSON.parse(patch.mock.calls[0][1].body)).toEqual({ displayName: 'Ada L.' })
    expect(put.mock.calls[0][0]).toBe('api/auth/me/avatar')
    expect(put.mock.calls[0][1].method).toBe('PUT')
    expect(JSON.parse(put.mock.calls[0][1].body)).toEqual({ avatar: 'AAAA', mime: 'image/webp' })
    expect(del.mock.calls[0][1].method).toBe('DELETE')
    for (const fn of [patch, put, del]) expect(fn.mock.calls[0][1].headers['X-CSRF-Token']).toBe('tok-p')
    expect(events).toHaveBeenCalledTimes(3) // nom et avatar de la navigation rafraîchis
  })
})
