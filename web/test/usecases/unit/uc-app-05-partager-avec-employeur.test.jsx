// UC-APP-05 — Partager une cartographie avec un employeur (côté apprenant) :
// tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-05-partager-avec-employeur.md
//
// Code sollicité appelé directement : les constantes et l'URL absolue du
// dialogue de partage, le routeur (le lien produit est bien celui que
// l'employeur ouvrira, UC-EMP-01) et le composant ShareDialog rendu isolément
// (contrôles locaux de l'expiration, rendu de la liste des liens).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import ShareDialog, {
  absoluteShareUrl,
  SHARE_DEFAULT_EXPIRES_DAYS,
  SHARE_PASSWORD_MIN_LENGTH,
} from '../../../src/views/espace/ShareDialog.jsx'
import { parseHash } from '../../../src/router.js'
import { resetApiClient } from '../../../src/api/client.js'
import { createFakeApi, jsonResponse } from '../support/apps.js'

const TOKEN = '0123456789abcdef0123456789abcdef'
const ENTRY = { id: 'local-1', titre: 'Journée du 05/01/2026', serverId: 42 }

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
  resetApiClient()
})

describe('UC-APP-05 — règles et lien produit', () => {
  it('UC-APP-05-U07 — mot de passe de 8 caractères minimum et expiration par défaut de 90 jours, comme l’API', () => {
    expect(SHARE_PASSWORD_MIN_LENGTH).toBe(8)
    expect(SHARE_DEFAULT_EXPIRES_DAYS).toBe(90)
  })

  it('UC-APP-05-U08 — absoluteShareUrl : origine + chemin de déploiement + #/partage/<jeton> ; repli relatif hors navigateur', () => {
    window.history.replaceState(null, '', '/humanome/index.html')
    expect(absoluteShareUrl(TOKEN)).toBe(`${window.location.origin}/humanome/index.html#/partage/${TOKEN}`)

    vi.stubGlobal('location', undefined)
    expect(absoluteShareUrl(TOKEN)).toBe(`/#/partage/${TOKEN}`)
  })

  it('UC-APP-05-U09 — le fragment du lien produit ouvre la route publique « share » avec le même jeton', () => {
    const url = new URL(absoluteShareUrl(TOKEN))
    expect(parseHash(url.hash)).toEqual({ name: 'share', token: TOKEN })
  })
})

describe('UC-APP-05 — ShareDialog isolé', () => {
  function renderDialog(links = []) {
    const api = createFakeApi([
      ['GET', 'cartographies/42/shares', () => jsonResponse(200, links)],
      ['POST', 'cartographies/42/share', () => jsonResponse(201, { shareId: 1, token: TOKEN, url: `/#/partage/${TOKEN}` })],
    ])
    render(<ShareDialog entry={ENTRY} fetchFn={api.fetch} onClose={() => {}} />)
    return api
  }

  /**
   * Soumet le formulaire DIRECTEMENT (événement submit) : on teste ici le
   * garde-fou JavaScript de handleCreate, en deçà de la validation native
   * du champ number (min/max/step), couverte par les tests fonctionnels.
   */
  function submitForm(password, days) {
    fireEvent.change(screen.getByLabelText('Mot de passe du lien (8 caractères min)'), { target: { value: password } })
    fireEvent.change(screen.getByLabelText('Expiration (jours)'), { target: { value: days } })
    fireEvent.submit(screen.getByRole('button', { name: 'Créer le lien de partage' }).closest('form'))
  }

  it.each(['0', '366', '', '-3'])(
    'UC-APP-05-U10 — handleCreate : expiration « %s » refusée localement, sans requête',
    async (days) => {
      const api = renderDialog()
      await screen.findByText('Aucun lien de partage pour cette cartographie.')

      submitForm('sesame-employeur', days)

      expect((await screen.findByRole('alert')).textContent).toBe(
        'L’expiration doit être comprise entre 1 et 365 jours.',
      )
      expect(api.requests.filter((r) => r.method === 'POST')).toEqual([])
    },
  )

  it('UC-APP-05-U11 — handleCreate : le mot de passe est contrôlé avant l’expiration, puis envoyé avec un entier', async () => {
    const api = renderDialog()
    await screen.findByText('Aucun lien de partage pour cette cartographie.')

    submitForm('7carac!', '0')
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Le mot de passe du lien doit compter au moins 8 caractères.',
    )

    submitForm('sesame-employeur', '365')
    await screen.findByTestId('share-url')
    const post = api.requests.find((r) => r.method === 'POST')
    expect(post.body).toEqual({ password: 'sesame-employeur', expiresInDays: 365 })
  })

  it('UC-APP-05-U12 — liste des liens : dates en français, « Révoquer » si actif, date de révocation sinon', async () => {
    renderDialog([
      { shareId: 1, createdAt: '2026-07-01T10:00:00', expiresAt: '2026-09-29T10:00:00', revokedAt: null },
      { shareId: 2, createdAt: '2026-07-02T10:00:00', expiresAt: '2026-10-01T10:00:00', revokedAt: '2026-07-12T11:00:00' },
    ])

    const items = within(await screen.findByRole('list')).getAllByRole('listitem')
    expect(items[0].textContent).toContain('Créé le 01/07/2026 — expire le 29/09/2026')
    expect(within(items[0]).getByRole('button', { name: 'Révoquer' })).toBeDefined()
    expect(items[1].textContent).toContain('révoqué le 12/07/2026')
    expect(within(items[1]).queryByRole('button')).toBeNull()
    // Jamais de jeton ni d'URL dans la liste.
    expect(screen.queryByTestId('share-url')).toBeNull()
  })
})
