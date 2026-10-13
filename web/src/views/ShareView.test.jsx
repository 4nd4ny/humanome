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

// Version partagée de l'interface ultime (spec §12) : liens ouverts, rendu
// « employeur » et noindex.
import sharedFixture from '../../../schemas/fixtures/partage/carto-partage-exemple.json'

describe('ShareView — version partagée (interface ultime, §12)', () => {
  const shared = { titre: 'Mes compétences — année 2025-2026', type: 'partage', document: sharedFixture, garantie: null }

  it('lien ouvert : GET api/share/<token> dès l’ouverture, puis vue lecture seule (soleil, extraits)', async () => {
    const token = 'd'.repeat(32)
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse(200, shared))
    const getRef = vi.fn(getReferentiel)
    render(<ShareView token={token} open lib={fakeLib} fetchFn={fetchFn} getReferentiel={getRef} />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Mes compétences — année 2025-2026' })).toBeDefined()
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe(`api/share/${token}`)
    expect(init.method).toBe('GET')
    expect(screen.getByText('J’ai vérifié chaque source avant de conclure.')).toBeDefined()
    expect(screen.getByText(/Pensée critique/)).toBeDefined()
    expect(screen.getByText('de décembre 2025 à janvier 2026')).toBeDefined()
    expect(screen.getByRole('group', { name: /Soleil : 2 compétences partagées/ })).toBeDefined()
    // Ni formulaire, ni comparaison, ni droit de réponse ; le référentiel est embarqué.
    expect(screen.queryByLabelText('Mot de passe du lien')).toBeNull()
    expect(screen.queryByText(/Comparaison|Confirmer|Nuancer|Contester/)).toBeNull()
    expect(getRef).not.toHaveBeenCalled()
  })

  it('lien ouvert qui demande finalement un mot de passe (401) : formulaire, puis POST', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Mot de passe requis', code: 'password_required' }))
      .mockResolvedValueOnce(jsonResponse(403, {}))
      .mockResolvedValueOnce(jsonResponse(200, shared))
    render(<ShareView token={'e'.repeat(32)} open lib={fakeLib} fetchFn={fetchFn} getReferentiel={getReferentiel} />)

    expect(await screen.findByLabelText('Mot de passe du lien')).toBeDefined()
    await submitPassword('mauvais-mot')
    expect((await screen.findByRole('alert')).textContent).toBe('Mot de passe incorrect.')
    expect(screen.getByLabelText('Mot de passe du lien')).toBeDefined() // le formulaire reste
    await submitPassword('sesame-employeur')
    expect(await screen.findByRole('heading', { level: 1, name: 'Mes compétences — année 2025-2026' })).toBeDefined()
  })

  it('lien ouvert révoqué ou expiré : message homogène, sans formulaire', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse(404, { error: 'Lien de partage introuvable ou expiré' }))
    render(<ShareView token={'f'.repeat(32)} open lib={fakeLib} fetchFn={fetchFn} getReferentiel={getReferentiel} />)
    expect((await screen.findByRole('alert')).textContent).toBe('Ce lien de partage n’existe pas, a expiré ou a été révoqué par son auteur.')
    expect(screen.queryByLabelText('Mot de passe du lien')).toBeNull()
  })

  it('demande aux moteurs de ne pas indexer la page, le temps qu’elle est affichée', () => {
    const { unmount } = render(<ShareView token={'a'.repeat(32)} lib={fakeLib} fetchFn={vi.fn()} getReferentiel={getReferentiel} />)
    const meta = document.head.querySelector('meta[name="robots"][data-share-noindex]')
    expect(meta?.getAttribute('content')).toBe('noindex, nofollow, noarchive')
    unmount()
    expect(document.head.querySelector('meta[data-share-noindex]')).toBeNull()
  })
})
