// UC-PRO-08 — Éditer les gabarits du Golden Prompt Twin9 : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-08-editer-gabarits-twin9.md
//
// Code sollicité appelé directement : la route #/twin9-atelier, l'entrée de
// navigation réservée à la CONJONCTION admin ∧ promptologue (AD-D2), les
// fonctions d'atelier du client web/src/api/twin9.js (noms HIÉRARCHIQUES
// encodés, méthodes, corps, CSRF) et le rendu en TEXTE BRUT des contenus
// confidentiels par Twin9AtelierView. Gabarits FICTIFS.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { parseHash } from '../../../src/router.js'
import { navGroups } from '../../../src/nav.js'
import { fetchMe, resetApiClient } from '../../../src/api/client.js'
import {
  fetchProtocole,
  fetchProtocoleList,
  fetchProtocoleVersion,
  fetchProtocoleVersions,
  restoreProtocoleVersion,
  saveProtocole,
  testerProtocole,
} from '../../../src/api/twin9.js'
import Twin9AtelierView from '../../../src/views/Twin9AtelierView.jsx'
import { jsonResponse } from '../support/twin.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

const hrefs = (roles) => navGroups({ roles }).flatMap((g) => g.items.map((i) => i.href))

describe('UC-PRO-08 — accès à l’atelier', () => {
  it('UC-PRO-08-U01 — #/twin9-atelier est la route de l’atelier (distincte de la supervision #/admin/twin9)', () => {
    expect(parseHash('#/twin9-atelier')).toEqual({ name: 'twin9atelier', section: null })
    expect(parseHash('#/admin/twin9')).toEqual({ name: 'admin', section: 'twin9' })
  })

  it('UC-PRO-08-U02 — le lien « Atelier Twin9 » n’apparaît qu’avec les DEUX rôles admin et promptologue', () => {
    expect(hrefs(['admin', 'promptologue'])).toContain('#/twin9-atelier')
    expect(hrefs(['promptologue', 'admin', 'apprenant'])).toContain('#/twin9-atelier')
    expect(hrefs(['admin'])).not.toContain('#/twin9-atelier')
    expect(hrefs(['promptologue'])).not.toContain('#/twin9-atelier')
    expect(hrefs([])).not.toContain('#/twin9-atelier')
  })
})

describe('UC-PRO-08 — client API de l’atelier', () => {
  it('UC-PRO-08-U03 — noms hiérarchiques encodés (%2F), lectures en GET, écritures avec corps et jeton CSRF', async () => {
    const fetchFn = vi.fn(async (url) =>
      url === 'api/auth/me' ? jsonResponse(200, { user: { id: 1 }, csrfToken: 'csrf-uc-pro-08' }) : jsonResponse(200, {}),
    )
    await fetchMe({ fetchFn })
    const opts = { fetchFn }
    await fetchProtocoleList(opts)
    await fetchProtocole('lourd/20-greffier', opts)
    await saveProtocole('lourd/20-greffier', 'Nouveau contenu {$CODE}', opts)
    await fetchProtocoleVersions('lourd/20-greffier', opts)
    await fetchProtocoleVersion('lourd/20-greffier', 2, opts)
    await restoreProtocoleVersion('lourd/20-greffier', 2, opts)
    await testerProtocole('lourd/20-greffier', { CODE: '1.01' }, opts)

    expect(
      fetchFn.mock.calls.slice(1).map(([url, init]) => [init.method, url, init.body && JSON.parse(init.body), init.headers['X-CSRF-Token']]),
    ).toEqual([
      ['GET', 'api/twin9/admin/protocole', undefined, undefined],
      ['GET', 'api/twin9/admin/protocole/lourd%2F20-greffier', undefined, undefined],
      ['PUT', 'api/twin9/admin/protocole/lourd%2F20-greffier', { content: 'Nouveau contenu {$CODE}' }, 'csrf-uc-pro-08'],
      ['GET', 'api/twin9/admin/protocole/lourd%2F20-greffier/versions', undefined, undefined],
      ['GET', 'api/twin9/admin/protocole/lourd%2F20-greffier/versions/2', undefined, undefined],
      ['POST', 'api/twin9/admin/protocole/lourd%2F20-greffier/restore', { version: 2 }, 'csrf-uc-pro-08'],
      ['POST', 'api/twin9/admin/tester', { name: 'lourd/20-greffier', variables: { CODE: '1.01' } }, 'csrf-uc-pro-08'],
    ])
  })
})

describe('UC-PRO-08 — rendu des contenus confidentiels (composant isolé)', () => {
  it('UC-PRO-08-U04 — gabarit et rendu du banc d’essai affichés en TEXTE BRUT (jamais interprétés comme HTML) ; champs générés depuis les variables', async () => {
    const piege = 'Consigne FICTIVE <img src=x onerror="window.__pwned=1"> <b>gras</b> {$CODE}'
    const fetchFn = vi.fn(async (url, init = {}) => {
      const key = `${init.method ?? 'GET'} ${url}`
      if (key === 'GET api/twin9/admin/protocole') {
        return jsonResponse(200, { protocole: [{ name: 'lourd/20-greffier', longueur: piege.length, variables: ['CODE', 'EXTRAIT'], updated_at: '2026-07-10 09:00:00' }] })
      }
      if (key === 'GET api/twin9/admin/protocole/lourd%2F20-greffier') return jsonResponse(200, { name: 'lourd/20-greffier', content: piege, variables: ['CODE'] })
      if (key === 'POST api/twin9/admin/tester') return jsonResponse(200, { rendu: piege.replace('{$CODE}', '1.01'), non_resolues: ['EXTRAIT'] })
      return jsonResponse(404, { error: 'absent' })
    })
    const { container } = render(<Twin9AtelierView roles={['admin', 'promptologue']} deps={{ fetchFn }} />)

    fireEvent.click(await screen.findByRole('button', { name: /lourd\/20-greffier/ }))
    expect((await screen.findByLabelText('Contenu du gabarit (texte brut)')).value).toBe(piege)

    fireEvent.change(screen.getByLabelText('Gabarit'), { target: { value: 'lourd/20-greffier' } })
    expect(screen.getByLabelText('CODE')).toBeDefined()
    expect(screen.getByLabelText('EXTRAIT')).toBeDefined()
    fireEvent.change(screen.getByLabelText('CODE'), { target: { value: '1.01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rendre le gabarit' }))

    expect((await screen.findByTestId('twin9-rendu')).textContent).toContain('<img src=x onerror=')
    expect(screen.getByText('Variables non résolues : EXTRAIT')).toBeDefined()
    expect(container.querySelector('img, b, [onerror]')).toBeNull()
    expect(window.__pwned).toBeUndefined()
    expect(JSON.parse(fetchFn.mock.calls.find(([u]) => u === 'api/twin9/admin/tester')[1].body)).toEqual({
      name: 'lourd/20-greffier',
      variables: { CODE: '1.01', EXTRAIT: '' },
    })
  })
})
