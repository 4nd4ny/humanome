// UC-CPT-03 — Gérer son profil (nom affiché, avatar) : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/compte/UC-CPT-03-gerer-profil.md
//
// Code sollicité appelé directement : initiales et composant Avatar (image
// servie ou repli), URL d'avatar (cassage de cache), redimensionnement client
// resizeAvatar (recadrage carré centré, replis d'encodage, plafond lu dans
// AvatarValidator.php), fonctions du client API de profil, gestionnaires
// d'AccountView rendu seul (faux serveur du lot) et identité de navigation
// d'App (couture fetchMeFn).
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import AccountView from '../../../src/views/AccountView.jsx'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
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
import { installFakeAccountApi, jsonResponse, noContentResponse } from '../support/cpt.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

const ADA = { id: 7, email: 'ada@example.org', password: 'correct horse battery', displayName: 'Ada' }

/** AccountView rendu SEUL (sans le shell), session ouverte sur le faux serveur du lot. */
async function renderProfileAlone(userOverrides = {}) {
  const api = installFakeAccountApi({ users: [{ ...ADA, ...userOverrides }], loggedInAs: ADA.email })
  render(<AccountView />)
  const profile = within(await screen.findByRole('region', { name: 'Profil' }))
  return { api, profile }
}

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

  it('UC-CPT-03-U12 — plafond client = plafond serveur (lu dans AvatarValidator.php), taille cible 256 px', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const php = readFileSync(resolve(here, '../../../../api/src/Media/AvatarValidator.php'), 'utf8')
    const match = /MAX_BYTES\s*=\s*(\d+)\s*\*\s*1024/.exec(php)
    expect(match).not.toBeNull()
    expect(MAX_AVATAR_BYTES).toBe(Number(match[1]) * 1024)
    expect(AVATAR_SIZE).toBe(256)
  })

  it('UC-CPT-03-U18 — resizeAvatar : repli JPEG 0,85 si WebP non supporté ; au-delà de 200 Ko, dernier recours JPEG 0,6 rendu SANS recontrôle', async () => {
    const drawImage = vi.fn()
    const square = { width: 256, height: 256 }

    // (a) Navigateur sans encodeur WebP : toDataURL rend du PNG pour « image/webp ».
    const noWebp = vi.fn((mime) => (mime === 'image/webp' ? 'data:image/png;base64,PNG' : `data:${mime};base64,AAAA`))
    const a = await resizeAvatar(new Blob(['x']), {
      canvas: { getContext: () => ({ drawImage }), toDataURL: noWebp },
      loadImage: async () => square,
    })
    expect(noWebp.mock.calls).toEqual([
      ['image/webp', 0.85],
      ['image/jpeg', 0.85],
    ])
    expect(a).toEqual({ base64: 'AAAA', mime: 'image/jpeg', bytes: 3 })

    // (b) Image trop lourde à chaque qualité : WebP 0,85 → JPEG 0,85 → JPEG 0,6,
    // renvoyé même au-delà du plafond (le serveur refusera : « Limites »).
    const huge = 'A'.repeat(300_000) // ≈ 225 000 octets décodés
    const tooBig = vi.fn((mime) => `data:${mime};base64,${huge}`)
    const b = await resizeAvatar(new Blob(['x']), {
      canvas: { getContext: () => ({ drawImage }), toDataURL: tooBig },
      loadImage: async () => square,
    })
    expect(tooBig.mock.calls).toEqual([
      ['image/webp', 0.85],
      ['image/jpeg', 0.85],
      ['image/jpeg', 0.6],
    ])
    expect(b.mime).toBe('image/jpeg')
    expect(b.bytes).toBeGreaterThan(MAX_AVATAR_BYTES)
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
    expect(del.mock.calls[0][0]).toBe('api/auth/me/avatar')
    expect(del.mock.calls[0][1].method).toBe('DELETE')
    expect(del.mock.calls[0][1].body).toBeUndefined()
    for (const fn of [patch, put, del]) expect(fn.mock.calls[0][1].headers['X-CSRF-Token']).toBe('tok-p')
    expect(events).toHaveBeenCalledTimes(3) // nom et avatar de la navigation rafraîchis
  })
})

describe('UC-CPT-03 — AccountView : gestionnaires du profil (composant seul)', () => {
  it('UC-CPT-03-U14 — handleSaveName : échec hors API (réseau) → « Enregistrement impossible. », l’édition reste ouverte', async () => {
    const { api, profile } = await renderProfileAlone()
    api.override('PATCH auth/me', () => {
      throw new TypeError('Failed to fetch')
    })
    fireEvent.click(profile.getByRole('button', { name: 'Modifier' }))
    fireEvent.change(profile.getByLabelText('Nom affiché'), { target: { value: 'Ada Lovelace' } })
    await act(async () => {
      fireEvent.click(profile.getByRole('button', { name: 'Enregistrer' }))
    })

    expect((await profile.findByRole('alert')).textContent).toBe('Enregistrement impossible.')
    expect(profile.getByLabelText('Nom affiché').value).toBe('Ada Lovelace')
  })

  it('UC-CPT-03-U15 — handleAvatarDelete : refus API → message du serveur, photo conservée ; échec réseau → « Suppression impossible. »', async () => {
    const { api, profile } = await renderProfileAlone({ hasAvatar: true })
    api.failNext('DELETE auth/me/avatar', jsonResponse(401, { error: 'Authentification requise' }))
    await act(async () => {
      fireEvent.click(profile.getByRole('button', { name: 'Retirer la photo' }))
    })
    expect((await profile.findByRole('alert')).textContent).toBe('Authentification requise')
    expect(profile.getByTestId('avatar-img')).toBeDefined()
    expect(profile.getByRole('button', { name: 'Retirer la photo' })).toBeDefined()

    api.override('DELETE auth/me/avatar', () => {
      throw new TypeError('Failed to fetch')
    })
    await act(async () => {
      fireEvent.click(profile.getByRole('button', { name: 'Retirer la photo' }))
    })
    await waitFor(() => expect(profile.getByRole('alert').textContent).toBe('Suppression impossible.'))
    expect(profile.getByTestId('avatar-img')).toBeDefined()
  })

  it('UC-CPT-03-U16 — sélecteur de photo : limité à JPEG, PNG et WebP (attribut accept)', async () => {
    const { profile } = await renderProfileAlone()
    const input = profile.getByLabelText('Choisir une photo de profil')
    expect(input.getAttribute('type')).toBe('file')
    expect(input.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp')
  })
})

describe('UC-CPT-03 — identité dans la navigation (App, couture fetchMeFn)', () => {
  it('UC-CPT-03-U17 — « humanome:auth » relit /me : initiales puis photo (URL SANS version, voir « Limites ») et nouveau nom', async () => {
    const fetchMeFn = vi
      .fn()
      .mockResolvedValueOnce({ user: { id: 4, displayName: 'Ada Lovelace', roles: ['apprenant'], hasAvatar: false } })
    window.location.hash = '#/'
    render(<App lib={fakeLib} fetchMeFn={fetchMeFn} />)
    const nav = within(screen.getByRole('navigation', { name: 'Navigation principale' }))
    expect(await nav.findByText('Ada Lovelace')).toBeDefined()
    expect(nav.getByTestId('avatar-initials').textContent).toBe('AL')

    fetchMeFn.mockResolvedValueOnce({ user: { id: 4, displayName: 'Ada L.', roles: ['apprenant'], hasAvatar: true } })
    await act(async () => {
      window.dispatchEvent(new Event('humanome:auth'))
    })

    expect(await nav.findByText('Ada L.')).toBeDefined()
    expect(nav.getByTestId('avatar-img').getAttribute('src')).toBe('api/users/4/avatar')
    expect(fetchMeFn).toHaveBeenCalledTimes(2)
  })
})
