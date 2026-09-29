// UC-PRO-01 — Consulter les paquets de prompts publiés et leurs différences :
// tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-01-consulter-paquets-publies.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) comme le ferait le
// promptologue : il ouvre #/promptologue (accueil « Paquets »), lit la liste
// des versions publiées et la version par défaut, puis compare deux versions
// depuis l'éditeur. Seul le réseau est simulé, par un faux serveur en mémoire
// fidèle aux statuts et formes de l'API PHP (test/usecases/support/pro.js) ;
// le module sunburst est remplacé par le faux module de test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { PROMPTOLOGUE, createPromptologueBackend, packageDoc } from '../support/pro.js'

function reservedDoc() {
  const doc = packageDoc({ id: 'twin6-ouverte', description: 'Cartographie ouverte Twin6.' })
  doc.metadata.reserved = true
  return doc
}

/** Ouvre l'application sur `hash`, réseau = faux serveur, session = backend.me. */
function openApp(hash, backend, me = PROMPTOLOGUE) {
  vi.stubGlobal('fetch', backend.fetchMock)
  window.location.hash = hash
  render(<App lib={fakeLib} fetchMeFn={async () => ({ user: me })} />)
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-PRO-01 — le promptologue consulte les paquets publiés', () => {
  it('UC-PRO-01-F11 — nominal : tableau des versions publiées, défaut marqué, paquet réservé signalé', async () => {
    const backend = createPromptologueBackend({
      published: [packageDoc(), packageDoc({ version: '2.0.0', description: 'Deuxième itération.' }), reservedDoc()],
    })
    openApp('#/promptologue', backend)

    const table = within(await screen.findByRole('region', { name: 'Paquets publiés' })).getByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.cells[0].textContent + '@' + r.cells[1].textContent.split(' ')[0])).toEqual([
      'aurora-demo@1.0.0',
      'aurora-demo@2.0.0',
      'twin6-ouverte@1.0.0',
    ])
    // Sans défaut validé : la dernière publication est le défaut (repli serveur),
    // ici le paquet RÉSERVÉ twin6-ouverte — anomalie AN-2 de la fiche (le repli
    // ne filtre pas les paquets réservés), comportement actuel figé.
    expect(rows[2].querySelector('.promptologue-defaut')?.textContent).toBe('par défaut')
    expect(rows[0].querySelector('.promptologue-defaut')).toBeNull()
    expect(rows[2].textContent).toContain('réservé')
    // Ligne par défaut : pas de « Proposer par défaut » ; paquet réservé : fork avec copie.
    expect(within(rows[2]).queryByRole('button', { name: 'Proposer par défaut' })).toBeNull()
    expect(within(rows[2]).getByRole('button', { name: 'Forker (copie)' })).toBeDefined()
    expect(within(rows[0]).getByRole('button', { name: 'Nouvelle version' })).toBeDefined()
    // Encart « Partir du Twin6 » dès que twin6-ouverte est publié.
    expect(screen.getByRole('button', { name: 'Partir du Twin6 (1.0.0)' })).toBeDefined()
    // Trois lectures au chargement : publiées, mes brouillons, défaut.
    expect(backend.callsTo('GET', 'api/prompt-packages')).toHaveLength(1)
    expect(backend.callsTo('GET', 'api/prompt-packages/drafts')).toHaveLength(1)
    expect(backend.callsTo('GET', 'api/prompt-packages/default')).toHaveLength(1)
  })

  it('UC-PRO-01-F12 — A1 : un défaut validé par l’admin est marqué, même s’il n’est pas la dernière publication', async () => {
    const backend = createPromptologueBackend({
      published: [packageDoc(), packageDoc({ version: '2.0.0' })],
      stored: { id: 'aurora-demo', version: '1.0.0' },
    })
    openApp('#/promptologue', backend)

    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows[0].querySelector('.promptologue-defaut')).not.toBeNull()
    expect(rows[1].querySelector('.promptologue-defaut')).toBeNull()
    expect(within(rows[1]).getByRole('button', { name: 'Proposer par défaut' })).toBeDefined()
    // Étape 6 : la ligne par défaut (paquet NON réservé) n'offre pas « Proposer par défaut ».
    expect(within(rows[0]).queryByRole('button', { name: 'Proposer par défaut' })).toBeNull()
    expect(within(rows[0]).getByRole('button', { name: 'Nouvelle version' })).toBeDefined()
  })

  it('UC-PRO-01-F13 — E3 : aucune version publiée → message dédié, pas de tableau', async () => {
    const backend = createPromptologueBackend({ published: [] })
    openApp('#/promptologue', backend)

    expect(await screen.findByText('Aucune version publiée sur ce serveur.')).toBeDefined()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('UC-PRO-01-F14 — E4 : visiteur sans session → invitation à se connecter, aucune lecture de paquets', async () => {
    const backend = createPromptologueBackend({ me: null })
    openApp('#/promptologue', backend, null)

    expect((await screen.findByTestId('promptologue-anonyme')).textContent).toContain('nécessite une session')
    expect(backend.calls.some((c) => c.url.startsWith('api/prompt-packages'))).toBe(false)
  })

  it('UC-PRO-01-F15 — E5 : compte sans rôle promptologue → refus explicite', async () => {
    const apprenant = { ...PROMPTOLOGUE, roles: ['apprenant'] }
    const backend = createPromptologueBackend({ me: apprenant })
    openApp('#/promptologue', backend, apprenant)

    expect((await screen.findByTestId('promptologue-sans-role')).textContent).toContain('réservé au rôle')
    expect(backend.calls.some((c) => c.url.startsWith('api/prompt-packages'))).toBe(false)
  })

  it('UC-PRO-01-F16 — E6 : copie statique du site (API injoignable) → message dédié', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    window.location.hash = '#/promptologue'
    render(<App lib={fakeLib} fetchMeFn={async () => ({ user: null })} />)

    expect((await screen.findByTestId('promptologue-indisponible')).textContent).toContain('Copie statique')
  })
})

describe('UC-PRO-01 — comparer deux versions depuis l’éditeur', () => {
  /** L'éditeur est chargé (requête par sélecteur : l'arbre d'accessibilité
   *  de l'éditeur complet est trop coûteux à recalculer en boucle). */
  async function waitEditor(title) {
    await waitFor(() => expect(document.querySelector('.promptologue-editeur h2')?.textContent).toBe(title))
  }

  function draftBackend() {
    const draft = packageDoc({ version: '1.1.0' })
    draft.prompts[0].texte += '\nConsigne ajoutée en 1.1.0.'
    return createPromptologueBackend({ drafts: [{ draftId: 100, document: draft }] })
  }

  it('UC-PRO-01-F17 — nominal (diff) : une fois la version publiée, « Diff contre 1.0.0 » rend le diff serveur', async () => {
    const backend = draftBackend()
    openApp('#/promptologue/editeur/100', backend)
    await waitEditor('Brouillon aurora-demo@1.1.0')

    // Précondition UC-PRO-03 : la version 1.1.0 est publiée dans la même session.
    fireEvent.click(screen.getByText('Publier…'))
    fireEvent.change(screen.getByLabelText('Changelog de la version (obligatoire)'), { target: { value: 'Consigne ajoutée.' } })
    await act(async () => {
      fireEvent.click(screen.getByText('Confirmer la publication'))
    })
    await screen.findByText(/publiée — elle est désormais immuable/)

    await act(async () => {
      fireEvent.click(screen.getByText('Diff contre 1.0.0'))
    })
    const diff = await screen.findByTestId('promptologue-diff')
    expect(diff.querySelector('h3').textContent).toBe('Diff 1.0.0 → 1.1.0')
    expect(diff.textContent).toContain("Modifié : extraction-pole — Extraction des traces d'un pôle")
    expect(diff.textContent).toContain('+ Consigne ajoutée en 1.1.0.')
    expect(backend.callsTo('GET', 'api/prompt-packages/aurora-demo/diff/1.0.0/1.1.0')).toHaveLength(1)
  })

  it('UC-PRO-01-F18 — anomalie AN-1 (comportement actuel figé) : avant publication, « Diff contre 1.0.0 » échoue en 404', async () => {
    const backend = draftBackend()
    openApp('#/promptologue/editeur/100', backend)
    await waitEditor('Brouillon aurora-demo@1.1.0')

    await act(async () => {
      fireEvent.click(screen.getByText('Diff contre 1.0.0'))
    })

    // La route de diff ne compare que des versions PUBLIÉES : le brouillon 1.1.0
    // n'en est pas une. Le bouton est pourtant proposé (cf. fiche, Anomalies).
    await waitFor(() => expect(document.querySelector('.promptologue-editeur [role="alert"]')?.textContent).toBe('Version publiée introuvable'))
    expect(screen.queryByTestId('promptologue-diff')).toBeNull()
  })
})
