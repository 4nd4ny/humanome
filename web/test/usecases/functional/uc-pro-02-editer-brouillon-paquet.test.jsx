// UC-PRO-02 — Créer et éditer un brouillon de paquet de prompts : tests
// FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-02-editer-brouillon-paquet.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) : le promptologue
// part de l'accueil de l'atelier (#/promptologue), crée une « Nouvelle
// version » depuis une version publiée, arrive dans l'éditeur
// (#/promptologue/editeur/<draftId>), modifie un gabarit, le valide et
// l'enregistre. Réseau simulé par le faux serveur du lot
// (test/usecases/support/pro.js : statuts, formes et jeton CSRF de l'API PHP).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { CSRF, PROMPTOLOGUE, createPromptologueBackend, packageDoc } from '../support/pro.js'

function reservedDoc() {
  const doc = packageDoc({ id: 'twin6-ouverte', description: 'Cartographie ouverte Twin6.' })
  doc.metadata.reserved = true
  return doc
}

function openApp(hash, backend) {
  vi.stubGlobal('fetch', backend.fetchMock)
  window.location.hash = hash
  render(<App lib={fakeLib} fetchMeFn={async () => ({ user: PROMPTOLOGUE })} />)
}

/** Éditeur chargé (sélecteur direct : l'arbre d'accessibilité de l'éditeur est lourd). */
async function waitEditor(title) {
  await waitFor(() => expect(document.querySelector('.promptologue-editeur h2')?.textContent).toBe(title))
}

async function click(element) {
  await act(async () => {
    fireEvent.click(element)
  })
}

/** Ligne du tableau « Paquets publiés » pour id@version. */
async function publishedRow(id, version) {
  const table = await screen.findByRole('table')
  return within(table)
    .getAllByRole('row')
    .find((r) => r.cells[0]?.textContent === id && r.cells[1]?.textContent.startsWith(version))
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-PRO-02 — créer puis éditer un brouillon', () => {
  it('UC-PRO-02-F17 — nominal : « Nouvelle version » → éditeur → modifier, Valider, Enregistrer (PUT {document} + jeton CSRF)', async () => {
    const backend = createPromptologueBackend()
    openApp('#/promptologue', backend)

    // 1-3. Nouvelle version depuis aurora-demo 1.0.0 : version suggérée 1.0.1, ajustée.
    await click(within(await publishedRow('aurora-demo', '1.0.0')).getByRole('button', { name: 'Nouvelle version' }))
    const version = screen.getByLabelText('Version du brouillon')
    expect(version.value).toBe('1.0.1')
    fireEvent.change(version, { target: { value: '1.1.0' } })
    await click(screen.getByRole('button', { name: 'Créer le brouillon' }))

    const [create] = backend.callsTo('POST', 'api/prompt-packages/drafts')
    expect(create.body).toEqual({ fromId: 'aurora-demo', fromVersion: '1.0.0', version: '1.1.0' })
    expect(create.headers['X-CSRF-Token']).toBe(CSRF)

    // 4. L'atelier ouvre l'éditeur du brouillon créé.
    await waitFor(() => expect(window.location.hash).toBe('#/promptologue/editeur/100'))
    await waitEditor('Brouillon aurora-demo@1.1.0')

    // 5. Édition du premier gabarit, validation client, enregistrement serveur.
    const texte = screen.getByLabelText('Texte du gabarit')
    fireEvent.change(texte, { target: { value: `${texte.value}\nConsigne ajoutée en 1.1.0.` } })
    await click(screen.getByText('Valider'))
    expect(screen.getByTestId('validation-ok').textContent).toBe('Document valide au schéma prompt-package.')
    await click(screen.getByText('Enregistrer'))

    await waitFor(() => expect(screen.getByText('Brouillon enregistré.')).toBeDefined())
    const [save] = backend.callsTo('PUT', 'api/prompt-packages/drafts/100')
    expect(save.headers['X-CSRF-Token']).toBe(CSRF)
    expect(save.body.document.version).toBe('1.1.0')
    expect(save.body.document.prompts[0].texte.endsWith('Consigne ajoutée en 1.1.0.')).toBe(true)
    expect(backend.state.drafts[0].document.prompts[0].texte.endsWith('Consigne ajoutée en 1.1.0.')).toBe(true)
  })

  it('UC-PRO-02-F18 — A2 : forker twin6-ouverte sous un nouveau nom, puis « Diff contre l’original »', async () => {
    const backend = createPromptologueBackend({ published: [packageDoc(), reservedDoc()] })
    openApp('#/promptologue', backend)

    await click(await screen.findByRole('button', { name: 'Partir du Twin6 (1.0.0)' }))
    const name = screen.getByLabelText('Nom du paquet copié')
    expect(name.value).toBe('twin6-ouverte-ma-copie')
    fireEvent.change(name, { target: { value: '  mon-twin6 ' } })
    await click(screen.getByRole('button', { name: 'Créer le brouillon' }))

    expect(backend.callsTo('POST', 'api/prompt-packages/drafts')[0].body).toEqual({
      fromId: 'twin6-ouverte',
      fromVersion: '1.0.0',
      version: '1.0.1',
      toId: 'mon-twin6', // nom trimé par l'IHM
    })
    await waitEditor('Brouillon mon-twin6@1.0.1')

    fireEvent.change(screen.getByLabelText('Texte du gabarit'), { target: { value: 'Mon gabarit réécrit.' } })
    await click(screen.getByText('Enregistrer'))
    await waitFor(() => expect(screen.getByText('Brouillon enregistré.')).toBeDefined())
    await click(screen.getByText('Diff contre l’original twin6-ouverte@1.0.0'))

    const diff = await screen.findByTestId('promptologue-diff')
    expect(backend.callsTo('GET', 'api/prompt-packages/drafts/100/diff-origin')).toHaveLength(1)
    expect(diff.textContent).toContain('+ Mon gabarit réécrit.')
  })

  it('UC-PRO-02-F19 — E6 (IHM) : fork réservé sans nom → refus local, aucune requête', async () => {
    const backend = createPromptologueBackend({ published: [reservedDoc()] })
    openApp('#/promptologue', backend)

    await click(await screen.findByRole('button', { name: 'Forker (copie)' }))
    fireEvent.change(screen.getByLabelText('Nom du paquet copié'), { target: { value: '   ' } })
    await click(screen.getByRole('button', { name: 'Créer le brouillon' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Ce paquet est réservé : donnez un nouveau nom à votre copie.')
    expect(backend.callsTo('POST', 'api/prompt-packages/drafts')).toHaveLength(0)
  })

  it('UC-PRO-02-F20 — E5 : version déjà prise → message du serveur, on reste sur l’accueil', async () => {
    const backend = createPromptologueBackend({ published: [packageDoc(), packageDoc({ version: '1.0.1' })] })
    openApp('#/promptologue', backend)

    await click(within(await publishedRow('aurora-demo', '1.0.0')).getByRole('button', { name: 'Nouvelle version' }))
    await click(screen.getByRole('button', { name: 'Créer le brouillon' })) // 1.0.1 suggérée… déjà publiée

    expect((await screen.findByRole('alert')).textContent).toBe('Version 1.0.1 of prompt package "aurora-demo" already exists')
    expect(window.location.hash).toBe('#/promptologue')
  })

  it('UC-PRO-02-F21 — E7 (IHM) : « Valider » liste les erreurs de schéma et « Enregistrer » n’envoie rien', async () => {
    const backend = createPromptologueBackend({ drafts: [{ draftId: 100, document: packageDoc({ version: '1.1.0' }) }] })
    openApp('#/promptologue/editeur/100', backend)
    await waitEditor('Brouillon aurora-demo@1.1.0')

    fireEvent.change(screen.getByLabelText('Texte du gabarit'), { target: { value: '' } })
    await click(screen.getByText('Enregistrer'))

    const errors = await screen.findByTestId('validation-errors')
    expect(errors.textContent).toContain('erreur(s) de schéma')
    expect(errors.textContent).toContain('/prompts/0/texte')
    expect(backend.callsTo('PUT', 'api/prompt-packages/drafts/100')).toHaveLength(0)
  })

  it('UC-PRO-02-F22 — E8 : brouillon d’autrui ou inconnu → « Brouillon introuvable » et retour à l’atelier', async () => {
    const backend = createPromptologueBackend({ drafts: [{ draftId: 100, owner: 999, document: packageDoc({ version: '1.1.0' }) }] })
    openApp('#/promptologue/editeur/100', backend)

    expect((await screen.findByRole('alert')).textContent).toBe('Brouillon introuvable')
    expect(screen.getByRole('link', { name: 'Retour à l’atelier' }).getAttribute('href')).toBe('#/promptologue')
  })

  it('UC-PRO-02-F23 — anomalie AN-1 (comportement figé) : « Mes brouillons » affiche « brouillon <n> », pas id@version', async () => {
    const backend = createPromptologueBackend({ drafts: [{ draftId: 100, document: packageDoc({ version: '1.1.0' }) }] })
    openApp('#/promptologue', backend)

    const section = await screen.findByRole('region', { name: 'Mes brouillons' })
    const link = await within(section).findByRole('link', { name: 'brouillon 100' })
    expect(link.getAttribute('href')).toBe('#/promptologue/editeur/100')
    // L'API renvoie pourtant id et version dans GET drafts.
    expect(within(section).queryByText('aurora-demo@1.1.0')).toBeNull()
  })
})
