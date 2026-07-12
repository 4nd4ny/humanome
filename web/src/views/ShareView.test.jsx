import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ShareView from './ShareView.jsx'
import * as fakeLib from '../test/fake-sunburst-lib.js'
import dayFixture from '../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import mergeFixture from '../../../schemas/fixtures/cartographie-merge-3-jours.json'
import referentielFixture from '../../../schemas/fixtures/referentiel-respire-v7.json'
import { resetApiClient } from '../api/client.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

const getReferentiel = async () => ({ doc: referentielFixture, origin: 'bundled' })

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

async function submitPassword(value = 'motdepasse-employeur') {
  fireEvent.change(screen.getByLabelText('Mot de passe du lien'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Consulter la cartographie' }))
}

describe('ShareView — formulaire mot de passe (public, sans compte)', () => {
  it('affiche le bandeau et le formulaire, sans appel réseau au montage', () => {
    const fetchFn = vi.fn()
    render(<ShareView token={'a'.repeat(32)} lib={fakeLib} fetchFn={fetchFn} getReferentiel={getReferentiel} />)

    expect(screen.getByRole('note').textContent).toContain(
      'Cartographie partagée par son auteur — humanome.xyz',
    )
    expect(screen.getByLabelText('Mot de passe du lien')).toBeDefined()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('bloque côté client un mot de passe trop court (< 8), sans requête', async () => {
    const fetchFn = vi.fn()
    render(<ShareView token={'a'.repeat(32)} lib={fakeLib} fetchFn={fetchFn} getReferentiel={getReferentiel} />)

    await submitPassword('court')
    expect((await screen.findByRole('alert')).textContent).toContain('au moins 8 caractères')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('404 -> message « lien inconnu, expiré ou révoqué »', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse(404, { error: 'Introuvable' }))
    render(<ShareView token={'a'.repeat(32)} lib={fakeLib} fetchFn={fetchFn} getReferentiel={getReferentiel} />)

    await submitPassword()
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Ce lien de partage n’existe pas, a expiré ou a été révoqué par son auteur.',
    )
  })

  it('403 -> « Mot de passe incorrect. » (réponse homogène anti-énumération)', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse(403, {}))
    render(<ShareView token={'a'.repeat(32)} lib={fakeLib} fetchFn={fetchFn} getReferentiel={getReferentiel} />)

    await submitPassword()
    expect((await screen.findByRole('alert')).textContent).toBe('Mot de passe incorrect.')
  })

  it('429 -> message rate-limit français', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse(429, {}))
    render(<ShareView token={'a'.repeat(32)} lib={fakeLib} fetchFn={fetchFn} getReferentiel={getReferentiel} />)

    await submitPassword()
    expect((await screen.findByRole('alert')).textContent).toContain('Trop de tentatives')
  })
})

describe('ShareView — rendu lecture seule après déverrouillage', () => {
  it('POST api/share/<token> {password} puis rend une journée avec DayView', async () => {
    const token = 'b'.repeat(32)
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        titre: 'Ma cartographie du 5 janvier',
        type: 'jour',
        document: dayFixture,
        garantie: null,
      }),
    )
    render(<ShareView token={token} lib={fakeLib} fetchFn={fetchFn} getReferentiel={getReferentiel} />)

    await submitPassword('secret-employeur')

    expect(await screen.findByRole('heading', { name: 'Ma cartographie du 5 janvier' })).toBeDefined()
    // La vue Journée existante rend le document partagé (lecture seule).
    expect(await screen.findByText('Journée du 05/01/2026')).toBeDefined()
    expect(screen.queryByTestId('share-garantie')).toBeNull() // garantie null tant que P9 n'est pas livré

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe(`api/share/${token}`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ password: 'secret-employeur' })
  })

  it('rend un merge avec MergeView et la mention de garantie si non-null', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        titre: 'Parcours complet',
        type: 'merge',
        document: mergeFixture,
        garantie: { par: 'Iris Cartographe', date: '2026-07-10T09:00:00Z' },
      }),
    )
    render(<ShareView token={'c'.repeat(32)} lib={fakeLib} fetchFn={fetchFn} getReferentiel={getReferentiel} />)

    await submitPassword()

    expect(await screen.findByRole('heading', { name: 'Parcours complet' })).toBeDefined()
    const garantie = await screen.findByTestId('share-garantie')
    expect(garantie.textContent).toContain('garantie par Iris Cartographe')
    expect(garantie.textContent).toContain('2026-07-10')
    // Le formulaire de mot de passe a disparu.
    expect(screen.queryByLabelText('Mot de passe du lien')).toBeNull()
  })
})
