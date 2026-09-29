// UC-VIS-02 — Consulter le référentiel public : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-02-consulter-referentiel-public.md
//
// Le visiteur consulte la page publique #/referentiel dans l'application
// ENTIÈRE (<App/>), sans session. Le réseau simulé sert l'export STATIQUE
// (index.json au format de StaticExporter + respire-v7.1.0.json) : aucune
// requête d'API n'est faite pour LIRE le référentiel ; le shell, lui, sonde la
// session (GET api/auth/me → 401 sans cookie, voir F12).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { clearReferentielCache } from '../../../src/data/referentiel.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import respire from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import { calledUrls, jsonResponse } from '../support/vis.js'

const v710 = {
  ...respire,
  version: '7.1.0',
  label: 'RESPIRE v7.1.0',
  competences: respire.competences.map((c) =>
    c.code === '1.01' ? { ...c, description: 'Douter des réponses trop lisses, vérifier les sources.' } : c,
  ),
}

const INDEX = [
  { referentielId: 'respire', semver: '7.1.0', label: 'RESPIRE v7.1.0', publishedAt: '2026-07-15T09:00:00', fichier: 'respire-v7.1.0.json' },
  { referentielId: 'respire', semver: '7.0.0', label: 'RESPIRE v7', publishedAt: '2026-07-01T09:00:00', fichier: 'respire-v7.0.0.json' },
]

function staticExport({ offline = false, index = INDEX, gate = null } = {}) {
  const mock = vi.fn(async (url) => {
    if (url === 'api/auth/me') return jsonResponse(401, { error: 'Authentification requise' })
    if (offline) throw new TypeError('Failed to fetch')
    if (url === 'data/referentiel/index.json') {
      if (gate) await gate
      return jsonResponse(200, index)
    }
    if (url === 'data/referentiel/respire-v7.1.0.json') return jsonResponse(200, v710)
    return jsonResponse(404, {})
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

function openApp(hash) {
  window.location.hash = hash
  render(<App lib={fakeLib} fetchMeFn={async () => ({ user: null })} />)
}

function goTo(hash) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

async function search(text) {
  fireEvent.change(screen.getByLabelText('Rechercher une compétence'), { target: { value: text } })
}

beforeEach(() => {
  resetApiClient()
  clearReferentielCache()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('UC-VIS-02 — le visiteur consulte le référentiel', () => {
  it('UC-VIS-02-F12 — nominal : menu « Référentiel » → dernière version publiée, 7 pôles, 61 compétences, lien Decidim', async () => {
    let release
    const network = staticExport({ gate: new Promise((resolve) => (release = resolve)) })
    // Shell RÉEL : aucune session injectée (la sonde GET api/auth/me répond 401).
    window.location.hash = '#/'
    render(<App lib={fakeLib} />)
    // Plan du site de l'accueil : l'entrée porte l'indice « 7 pôles, 61 compétences ».
    const tile = within(screen.getByRole('region', { name: 'Plan du site' })).getByRole('link', { name: /^Référentiel/ })
    expect(tile.querySelector('.route-hint').textContent).toBe('7 pôles, 61 compétences')
    const nav = within(screen.getByRole('navigation', { name: 'Navigation principale' }))
    const menuLink = within(nav.getByRole('group', { name: 'Découvrir' })).getByRole('link', { name: 'Référentiel' })
    expect(menuLink.getAttribute('href')).toBe('#/referentiel')
    // Clic réel sur le lien du menu (navigation par fragment de jsdom → hashchange).
    await act(async () => {
      fireEvent.click(menuLink)
    })
    await waitFor(() => expect(window.location.hash).toBe('#/referentiel'))

    // Tant que l'export n'est pas lu : message d'attente.
    expect(await screen.findByText('Chargement du référentiel…')).toBeDefined()
    await act(async () => release())
    expect(await screen.findByRole('heading', { name: 'Référentiel de compétences' })).toBeDefined()
    await waitFor(() => expect(document.querySelector('.ref-version').textContent).toContain('version 7.1.0'))
    const header = document.querySelector('.ref-version').textContent
    expect(header).toContain('RESPIRE v7.1.0')
    expect(header).toContain('7 pôles, 61 compétences')
    expect(header).toContain('aucune version publiée n’est modifiée en place')
    expect(document.querySelectorAll('.ref-pole')).toHaveLength(7)
    expect(document.querySelectorAll('.ref-competence')).toHaveLength(61)
    expect(document.querySelector('.ref-pole').style.getPropertyValue('--pole-color')).toBe(respire.poles[0].couleur)
    expect(screen.getByRole('status').textContent).toBe('61 compétences.')
    // Définition publiée en 7.1.0, affichée sous la compétence.
    expect(screen.getByText('Douter des réponses trop lisses, vérifier les sources.')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Participer sur participer.harmonia.education' }).getAttribute('href')).toBe(
      'https://participer.harmonia.education',
    )
    // LECTURE du référentiel : l'export statique uniquement ; la seule requête
    // d'API est la sonde de session du shell (ni /api/referentiel, ni /api/competences).
    expect(calledUrls(network).filter((u) => !u.startsWith('api/'))).toEqual([
      'data/referentiel/index.json',
      'data/referentiel/respire-v7.1.0.json',
    ])
    expect([...new Set(calledUrls(network).filter((u) => u.startsWith('api/')))]).toEqual(['api/auth/me'])
  })

  it('UC-VIS-02-F13 — nominal : recherche insensible aux accents sur code, nom et définition ; aucun résultat', async () => {
    staticExport()
    openApp('#/referentiel')
    await waitFor(() => expect(document.querySelectorAll('.ref-competence')).toHaveLength(61))

    await search('pensee critique')
    expect(screen.getByRole('status').textContent).toBe('1 compétence sur 61 pour « pensee critique ».')
    expect(document.querySelectorAll('.ref-pole')).toHaveLength(1) // pôles vides masqués
    await search('VERIFIER LES SOURCES')
    expect(screen.getByRole('status').textContent).toBe('1 compétence sur 61 pour « VERIFIER LES SOURCES ».')
    await search('7.0')
    expect(screen.getByRole('status').textContent).toBe('8 compétences sur 61 pour « 7.0 ».')
    await search('zzz-rien')
    expect(screen.getByRole('status').textContent).toBe('0 compétence sur 61 pour « zzz-rien ».')
    expect(document.querySelectorAll('.ref-pole')).toHaveLength(0)
    await search('  ')
    expect(screen.getByRole('status').textContent).toBe('61 compétences.')
    expect(document.querySelectorAll('.ref-competence')).toHaveLength(61)
    expect(document.querySelectorAll('.ref-pole')).toHaveLength(7)
    await search('zzz-rien')
    await search('')
    expect(screen.getByRole('status').textContent).toBe('61 compétences.')
    expect(document.querySelectorAll('.ref-competence')).toHaveLength(61)
    expect(document.querySelectorAll('.ref-pole')).toHaveLength(7)
  })

  it('UC-VIS-02-F14 — A5 : permalien #/referentiel/<code> → compétence surlignée et amenée à l’écran', async () => {
    staticExport()
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    try {
      openApp('#/referentiel')
      await waitFor(() => expect(document.querySelectorAll('.ref-competence')).toHaveLength(61))

      const link = screen.getByRole('link', { name: '7.03' })
      expect(link.getAttribute('href')).toBe('#/referentiel/7.03')
      goTo('#/referentiel/7.03')

      await waitFor(() => expect(document.getElementById('competence-7.03').className).toContain('ref-competence-focus'))
      expect(screen.getByRole('link', { name: '7.03' }).getAttribute('aria-current')).toBe('true')
      expect(scroll).toHaveBeenCalledWith({ block: 'center' })
      // C'est bien la ligne de 7.03 qui défile.
      expect(scroll.mock.contexts).toContain(document.getElementById('competence-7.03'))
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      delete Element.prototype.scrollIntoView
    }
  })

  it('UC-VIS-02-F15 — A6 : hors ligne (ou copie statique) → référentiel embarqué v7, page complète', async () => {
    staticExport({ offline: true })
    openApp('#/referentiel')

    await waitFor(() => expect(document.querySelectorAll('.ref-competence')).toHaveLength(61))
    expect(document.querySelector('.ref-version').textContent).toContain('version 7.0.0')
    expect(screen.queryByText('Douter des réponses trop lisses, vérifier les sources.')).toBeNull()
  })

  it('UC-VIS-02-F16 — E4 : permalien vers un code absent de la version → message, l’arbre reste consultable', async () => {
    staticExport()
    openApp('#/referentiel/9.99')

    // Espaces insécables autour du code (typographie française).
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /^Compétence «\s9\.99\s» introuvable dans cette version du référentiel\.$/,
    )
    expect(document.querySelectorAll('.ref-competence')).toHaveLength(61)
  })

  it('UC-VIS-02-F17 — A6 : index publié désignant un fichier hors du dossier (« ../x.json ») → repli embarqué v7, page complète', async () => {
    const network = staticExport({ index: [{ ...INDEX[0], fichier: '../x.json' }] })
    openApp('#/referentiel')

    await waitFor(() => expect(document.querySelectorAll('.ref-competence')).toHaveLength(61))
    expect(document.querySelector('.ref-version').textContent).toContain('version 7.0.0')
    expect(calledUrls(network).filter((u) => u.startsWith('data/'))).toEqual(['data/referentiel/index.json'])
  })
})
