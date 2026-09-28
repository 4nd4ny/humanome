// UC-PRO-03 — Publier une version de paquet (immuable) : tests FONCTIONNELS
// (IHM).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-03-publier-version-paquet.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) : depuis l'éditeur
// de son brouillon (#/promptologue/editeur/<draftId>), le promptologue ouvre
// « Publier… », saisit le changelog obligatoire et confirme ; il retrouve
// ensuite la version dans les paquets publiés. Réseau simulé par le faux
// serveur du lot (test/usecases/support/pro.js : semver strictement
// croissant, immuabilité, jeton CSRF).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { CSRF, PROMPTOLOGUE, createPromptologueBackend, packageDoc } from '../support/pro.js'

function openEditor(backend, draftId = 100) {
  vi.stubGlobal('fetch', backend.fetchMock)
  window.location.hash = `#/promptologue/editeur/${draftId}`
  render(<App lib={fakeLib} fetchMeFn={async () => ({ user: PROMPTOLOGUE })} />)
}

async function waitEditor(title) {
  await waitFor(() => expect(document.querySelector('.promptologue-editeur h2')?.textContent).toBe(title))
}

async function click(element) {
  await act(async () => {
    fireEvent.click(element)
  })
}

/** Alerte de l'éditeur (sélecteur direct, cf. waitEditor). */
async function editorAlert() {
  let text = null
  await waitFor(() => {
    text = document.querySelector('.promptologue-editeur [role="alert"]')?.textContent ?? null
    expect(text).not.toBeNull()
  })
  return text
}

function backendWithDraft(version = '1.1.0') {
  return createPromptologueBackend({ drafts: [{ draftId: 100, document: packageDoc({ version }) }] })
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-PRO-03 — publier depuis l’éditeur', () => {
  it('UC-PRO-03-F11 — nominal : « Publier… », changelog obligatoire, confirmation, puis la version apparaît publiée (et par défaut)', async () => {
    const backend = backendWithDraft()
    openEditor(backend)
    await waitEditor('Brouillon aurora-demo@1.1.0')

    await click(screen.getByText('Publier…'))
    const form = screen.getByRole('form', { name: 'Publication' })
    expect(form.textContent).toContain('aurora-demo@1.1.0')
    expect(form.textContent).toContain('immuable')
    const confirm = within(form).getByText('Confirmer la publication')
    expect(confirm.disabled).toBe(true)

    fireEvent.change(within(form).getByLabelText('Changelog de la version (obligatoire)'), {
      target: { value: 'Consigne de citation renforcée.' },
    })
    expect(confirm.disabled).toBe(false)
    await click(confirm)

    await waitFor(() =>
      expect(screen.getByText('Version aurora-demo@1.1.0 publiée — elle est désormais immuable.')).toBeDefined(),
    )
    const [call] = backend.callsTo('POST', 'api/prompt-packages/drafts/100/publish')
    expect(call.body).toEqual({ changelog: 'Consigne de citation renforcée.' })
    expect(call.headers['X-CSRF-Token']).toBe(CSRF)
    expect(screen.queryByRole('form', { name: 'Publication' })).toBeNull()

    // Retour à l'accueil : 1.1.0 est publiée et, sans défaut validé, devient le défaut.
    await act(async () => {
      window.location.hash = '#/promptologue'
    })
    const table = await screen.findByRole('table')
    const row = within(table).getAllByRole('row').find((r) => r.cells[1]?.textContent.startsWith('1.1.0'))
    expect(row.querySelector('.promptologue-defaut')?.textContent).toBe('par défaut')
    expect(within(screen.getByRole('region', { name: 'Mes brouillons' })).getByText(/Aucun brouillon/)).toBeDefined()
  })

  it('UC-PRO-03-F12 — E2 (IHM) : changelog blanc → confirmation impossible ; « Annuler » referme sans requête', async () => {
    const backend = backendWithDraft()
    openEditor(backend)
    await waitEditor('Brouillon aurora-demo@1.1.0')

    await click(screen.getByText('Publier…'))
    fireEvent.change(screen.getByLabelText('Changelog de la version (obligatoire)'), { target: { value: '   ' } })
    expect(screen.getByText('Confirmer la publication').disabled).toBe(true)
    await click(within(screen.getByRole('form', { name: 'Publication' })).getByText('Annuler'))

    expect(screen.queryByRole('form', { name: 'Publication' })).toBeNull()
    expect(backend.callsTo('POST', 'api/prompt-packages/drafts/100/publish')).toHaveLength(0)
  })

  it('UC-PRO-03-F13 — E4 : semver non croissant → message du serveur, le brouillon reste éditable', async () => {
    const backend = backendWithDraft('0.9.0')
    openEditor(backend)
    await waitEditor('Brouillon aurora-demo@0.9.0')

    await click(screen.getByText('Publier…'))
    fireEvent.change(screen.getByLabelText('Changelog de la version (obligatoire)'), { target: { value: 'Retour arrière' } })
    await click(screen.getByText('Confirmer la publication'))

    expect(await editorAlert()).toBe('Semver must be strictly increasing: 0.9.0 is not greater than published 1.0.0')
    expect(screen.getByRole('form', { name: 'Publication' })).toBeDefined()
    expect(backend.state.published.map((p) => p.doc.version)).toEqual(['1.0.0'])
  })

  it('UC-PRO-03-F14 — E5 : après publication, « Enregistrer » est refusé (version immuable)', async () => {
    const backend = backendWithDraft()
    openEditor(backend)
    await waitEditor('Brouillon aurora-demo@1.1.0')
    await click(screen.getByText('Publier…'))
    fireEvent.change(screen.getByLabelText('Changelog de la version (obligatoire)'), { target: { value: 'Publication' } })
    await click(screen.getByText('Confirmer la publication'))
    await waitFor(() => expect(screen.getByText(/publiée — elle est désormais immuable/)).toBeDefined())

    await click(screen.getByText('Enregistrer'))

    expect(await editorAlert()).toBe('Published versions are immutable: create a new draft instead')
    expect(backend.callsTo('PUT', 'api/prompt-packages/drafts/100')).toHaveLength(1)
  })
})
