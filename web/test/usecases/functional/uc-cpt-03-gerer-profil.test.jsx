// UC-CPT-03 — Gérer son profil (nom affiché, avatar) : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/compte/UC-CPT-03-gerer-profil.md
//
// Scénarios joués sur l'application ENTIÈRE (<App/>) avec une session ouverte :
// l'utilisateur modifie son nom affiché, ajoute, remplace ou retire sa photo,
// et voit la navigation suivre. Le réseau est le faux serveur du lot
// (web/test/usecases/support/cpt.js). Le redimensionnement canvas n'existe pas
// en jsdom : resizeAvatar est remplacé par un double déterministe (la vraie
// fonction est couverte par UC-CPT-03-U11).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { clearLocalStorage, installFakeAccountApi, jsonResponse } from '../support/cpt.js'

const resize = vi.hoisted(() => ({ fn: null }))
vi.mock('../../../src/lib/resize-image.js', () => ({
  AVATAR_SIZE: 256,
  MAX_AVATAR_BYTES: 200 * 1024,
  resizeAvatar: (...args) => resize.fn(...args),
}))

const ADA = { id: 7, email: 'ada@example.org', password: 'correct horse battery', displayName: 'Ada' }

async function openProfile(userOverrides = {}) {
  const api = installFakeAccountApi({ users: [{ ...ADA, ...userOverrides }], loggedInAs: ADA.email })
  window.location.hash = '#/compte'
  render(<App lib={fakeLib} />)
  await screen.findByRole('region', { name: 'Profil' })
  return api
}

const profile = () => within(screen.getByRole('region', { name: 'Profil' }))
const nav = () => within(screen.getByRole('navigation', { name: 'Navigation principale' }))

async function click(name, scope = profile()) {
  await act(async () => {
    fireEvent.click(scope.getByRole('button', { name }))
  })
}

async function chooseFile(file = new File(['octets'], 'photo.png', { type: 'image/png' })) {
  await act(async () => {
    fireEvent.change(profile().getByLabelText('Choisir une photo de profil'), { target: { files: [file] } })
  })
}

beforeEach(() => {
  resetApiClient()
  clearLocalStorage()
  resize.fn = vi.fn(async () => ({ base64: 'UklGRg==', mime: 'image/webp', bytes: 6 }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
  clearLocalStorage()
})

describe('UC-CPT-03 — l’utilisateur gère son profil', () => {
  it('UC-CPT-03-F09 — nominal : « Modifier » → nouveau nom enregistré (PATCH + CSRF), profil et navigation à jour', async () => {
    const api = await openProfile()
    expect(await nav().findByText('Ada')).toBeDefined()

    await click('Modifier')
    const field = profile().getByLabelText('Nom affiché')
    expect(field.value).toBe('Ada') // pré-rempli
    expect(field.getAttribute('maxLength')).toBe('190')
    fireEvent.change(field, { target: { value: '  Ada Lovelace ' } })
    await click('Enregistrer')

    expect(await screen.findByText('Nom affiché mis à jour.')).toBeDefined()
    expect(profile().getByText(/Ada Lovelace/)).toBeDefined()
    const [patch] = api.callsTo('auth/me', 'PATCH')
    expect(patch.body).toEqual({ displayName: 'Ada Lovelace' })
    expect(patch.headers['X-CSRF-Token']).toBe(api.session.csrf)
    expect(await nav().findByText('Ada Lovelace')).toBeDefined()
  })

  it('UC-CPT-03-F10 — A1 : ajout d’une photo → image redimensionnée envoyée, avatar affiché (cache cassé), bouton « Retirer »', async () => {
    const api = await openProfile()
    expect(profile().getByTestId('avatar-initials').textContent).toBe('AD')
    expect(profile().getByText('Ajouter une photo')).toBeDefined()

    const file = new File(['octets'], 'photo.png', { type: 'image/png' })
    await chooseFile(file)

    expect(await screen.findByText('Photo de profil mise à jour.')).toBeDefined()
    expect(resize.fn).toHaveBeenCalledWith(file)
    expect(api.callsTo('auth/me/avatar', 'PUT')[0].body).toEqual({ avatar: 'UklGRg==', mime: 'image/webp' })
    expect(profile().getByTestId('avatar-img').getAttribute('src')).toBe('api/users/7/avatar?v=1')
    expect(profile().getByText('Changer la photo')).toBeDefined()
    expect(profile().getByRole('button', { name: 'Retirer la photo' })).toBeDefined()
    // La navigation affiche désormais l'image (hasAvatar relu par /me).
    expect(await nav().findByTestId('avatar-img')).toBeDefined()
  })

  it('UC-CPT-03-F11 — A2 : « Retirer la photo » → DELETE, retour aux initiales', async () => {
    const api = await openProfile({ hasAvatar: true })
    expect(profile().getByTestId('avatar-img')).toBeDefined()

    await click('Retirer la photo')

    expect(await screen.findByText('Photo de profil retirée.')).toBeDefined()
    expect(api.callsTo('auth/me/avatar', 'DELETE')).toHaveLength(1)
    expect(profile().getByTestId('avatar-initials').textContent).toBe('AD')
    expect(profile().queryByRole('button', { name: 'Retirer la photo' })).toBeNull()
  })

  it('UC-CPT-03-F12 — A3 : « Annuler » l’édition → nom inchangé, aucune requête', async () => {
    const api = await openProfile()
    await click('Modifier')
    fireEvent.change(profile().getByLabelText('Nom affiché'), { target: { value: 'Autre nom' } })
    await click('Annuler')

    expect(profile().queryByLabelText('Nom affiché')).toBeNull()
    expect(profile().getByRole('button', { name: 'Modifier' })).toBeDefined()
    expect(profile().queryByText(/Autre nom/)).toBeNull()
    expect(api.callsTo('auth/me', 'PATCH')).toHaveLength(0)
  })

  it('UC-CPT-03-F13 — A4 : la photo ne se charge plus (retirée ailleurs, 404) → repli sur les initiales', async () => {
    await openProfile({ hasAvatar: true, displayName: 'Ada Lovelace' })
    fireEvent.error(profile().getByTestId('avatar-img'))

    expect(profile().getByTestId('avatar-initials').textContent).toBe('AL')
  })

  it('UC-CPT-03-F14 — E1 : nom vide refusé localement ; un refus serveur (422) est affiché', async () => {
    const api = await openProfile()
    await click('Modifier')
    fireEvent.change(profile().getByLabelText('Nom affiché'), { target: { value: '   ' } })
    await click('Enregistrer')
    expect(profile().getByRole('alert').textContent).toBe('Le nom affiché est requis.')
    expect(api.callsTo('auth/me', 'PATCH')).toHaveLength(0)

    api.failNext(
      'PATCH auth/me',
      jsonResponse(422, { error: 'Validation échouée', fields: { displayName: 'Le nom affiché est requis (190 caractères maximum)' } }),
    )
    fireEvent.change(profile().getByLabelText('Nom affiché'), { target: { value: 'Nom refusé' } })
    await click('Enregistrer')
    // Le profil n'affiche que le message général du serveur (voir « Limites »).
    expect((await profile().findByRole('alert')).textContent).toBe('Validation échouée')
    expect(profile().getByLabelText('Nom affiché')).toBeDefined() // l'édition reste ouverte
  })

  it('UC-CPT-03-F15 — E4 : image refusée par le serveur (contenu déguisé) → message du serveur, pas d’avatar', async () => {
    const api = await openProfile()
    api.failNext('PUT auth/me/avatar', jsonResponse(422, { error: 'Le contenu du fichier ne correspond pas à une image WebP.' }))

    await chooseFile()

    expect((await profile().findByRole('alert')).textContent).toBe('Le contenu du fichier ne correspond pas à une image WebP.')
    expect(profile().getByTestId('avatar-initials')).toBeDefined()
    expect(profile().getByText('Ajouter une photo')).toBeDefined()
  })

  it('UC-CPT-03-F16 — E5 : image illisible par le navigateur → message local, aucune requête', async () => {
    const api = await openProfile()
    resize.fn = vi.fn(async () => {
      throw new Error('Image illisible.')
    })

    await chooseFile(new File(['pas une image'], 'notes.txt', { type: 'text/plain' }))

    expect((await profile().findByRole('alert')).textContent).toBe('Image non prise en charge (JPEG, PNG ou WebP).')
    expect(api.callsTo('auth/me/avatar')).toHaveLength(0)
  })
})
