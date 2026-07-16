// Éditeur de brouillon (P10.2) : validation client (engine validateDocument),
// enregistrement PUT, publication (confirmation semver + changelog), diff.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import EditeurSection from './EditeurSection.jsx'
import pkgFixture from '../../../../schemas/fixtures/prompt-package-exemple.json'

function draftDocument() {
  return structuredClone({ ...pkgFixture, version: '1.1.0' })
}

function fakeApi(overrides = {}) {
  return {
    getDraft: vi.fn(async () => ({
      draftId: 42,
      document: draftDocument(),
      fromId: 'aurora-demo',
      fromVersion: '1.0.0',
    })),
    saveDraft: vi.fn(async () => ({ ok: true })),
    publishDraft: vi.fn(async () => ({ ok: true })),
    // Forme RÉELLE renvoyée par le serveur (api/src/Packages/PackageDiff.php) :
    // from/to sont des objets {version}, les clés sont anglaises, les lignes
    // sont {op, line, text}. Le test reproduit EXACTEMENT cette forme pour ne
    // plus masquer le crash « Objects are not valid as a React child ».
    diff: vi.fn(async () => ({
      packageId: 'aurora-demo',
      from: { version: '1.0.0' },
      to: { version: '1.1.0' },
      identical: false,
      fields: {},
      prompts: {
        added: [],
        removed: [],
        modified: [
          {
            role: 'kairos',
            nom: 'Synthèse transversale de la journée',
            texte: [
              { op: 'del', line: 3, text: 'ancien texte' },
              { op: 'add', line: 3, text: 'nouveau texte' },
            ],
            variables: null,
          },
        ],
      },
      code: { entrypoint: null, orchestration: null },
      metadata: { auteur: { from: 'A', to: 'B' } },
      summary: { promptsModified: 1 },
    })),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function renderEditor(api = fakeApi()) {
  render(<EditeurSection api={api} draftId="42" />)
  await screen.findByText('aurora-demo')
  return api
}

describe('EditeurSection — chargement et édition', () => {
  it('affiche le brouillon : prompts (role — nom), compteur, code, métadonnées', async () => {
    await renderEditor()
    expect(screen.getByRole('tab', { name: /extraction-pole — Extraction des traces/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /kairos — Synthèse transversale/ })).toBeTruthy()
    const texte = pkgFixture.prompts[0].texte
    expect(screen.getByTestId('prompt-counter').textContent).toBe(`${texte.length} caractères`)
    expect(screen.getByLabelText('Entrypoint (fonction exportée)').value).toBe('run')
  })

  it('éditer le texte d’un prompt met le compteur à jour', async () => {
    await renderEditor()
    const textarea = screen.getByLabelText('Texte du gabarit')
    fireEvent.change(textarea, { target: { value: 'Nouveau gabarit.' } })
    expect(screen.getByTestId('prompt-counter').textContent).toBe('16 caractères')
  })

  it('les variables {nom, description, exemple} sont éditables', async () => {
    await renderEditor()
    fireEvent.click(screen.getByRole('tab', { name: /kairos — Synthèse/ }))
    // getAllByLabelText('Nom')[0] est le nom du PROMPT ; [1] = 1re variable.
    const nomVariable = screen.getAllByLabelText('Nom')[1]
    expect(nomVariable.value).toBe('date_feuille')
    fireEvent.change(nomVariable, { target: { value: 'date_renommee' } })
    expect(screen.getAllByLabelText('Nom')[1].value).toBe('date_renommee')
    const exemples = screen.getAllByLabelText('Exemple')
    fireEvent.change(exemples[0], { target: { value: '2026-02-01' } })
    expect(screen.getAllByLabelText('Exemple')[0].value).toBe('2026-02-01')
  })

  it('brouillon inconnu : erreur explicite (brouillons d’autrui invisibles)', async () => {
    // GET drafts/{id} répond un 404 homogène pour un brouillon étranger ou inconnu.
    const api = fakeApi({
      getDraft: vi.fn(async () => {
        throw new Error('Brouillon introuvable')
      }),
    })
    render(<EditeurSection api={api} draftId="42" />)
    await screen.findByText(/Brouillon introuvable/)
  })
})

describe('EditeurSection — diff d’un fork renommé contre son original (D1)', () => {
  function forkApi() {
    const doc = structuredClone({ ...pkgFixture, id: 'mon-twin6', version: '1.0.0' })
    doc.metadata = { ...doc.metadata, forkedFrom: { id: 'twin6-ouverte', version: '1.0.0' } }
    return fakeApi({
      getDraft: vi.fn(async () => ({ draftId: 42, document: doc })),
      diffDraftOrigin: vi.fn(async () => ({
        packageId: 'mon-twin6',
        from: { version: '1.0.0' },
        to: { version: '1.0.0' },
        identical: false,
        fields: {},
        prompts: { added: [], removed: [], modified: [] },
        code: { entrypoint: null, orchestration: null },
        metadata: {},
      })),
    })
  }

  it('propose « Diff contre l’original » et appelle diffDraftOrigin', async () => {
    const api = forkApi()
    render(<EditeurSection api={api} draftId="42" />)
    await screen.findByText('mon-twin6')
    const button = screen.getByRole('button', {
      name: /Diff contre l’original twin6-ouverte@1\.0\.0/,
    })
    fireEvent.click(button)
    await waitFor(() => expect(api.diffDraftOrigin).toHaveBeenCalledWith('42'))
    expect(await screen.findByTestId('promptologue-diff')).toBeTruthy()
  })
})

describe('EditeurSection — Valider (validation client au schéma)', () => {
  it('document conforme : message de validité', async () => {
    await renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    await screen.findByTestId('validation-ok')
  })

  it('document non conforme : erreurs de schéma listées, pas de PUT', async () => {
    const api = await renderEditor()
    fireEvent.change(screen.getByLabelText('Texte du gabarit'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    const errors = await screen.findByTestId('validation-errors')
    expect(errors.textContent).toContain('erreur(s) de schéma')
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(screen.getByTestId('validation-errors')).toBeTruthy())
    expect(api.saveDraft).not.toHaveBeenCalled()
  })
})

describe('EditeurSection — Enregistrer et Publier', () => {
  it('Enregistrer : PUT drafts/{draftId} avec le document édité', async () => {
    const api = await renderEditor()
    fireEvent.change(screen.getByLabelText('Texte du gabarit'), {
      target: { value: 'Gabarit révisé, plus concis.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await screen.findByText('Brouillon enregistré.')
    expect(api.saveDraft).toHaveBeenCalledTimes(1)
    const [draftId, doc] = api.saveDraft.mock.calls[0]
    expect(draftId).toBe('42')
    expect(doc.prompts[0].texte).toBe('Gabarit révisé, plus concis.')
    expect(doc.version).toBe('1.1.0')
  })

  it('Publier : confirmation semver + changelog OBLIGATOIRE puis POST publish', async () => {
    const api = await renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Publier…' }))
    const form = await screen.findByRole('form', { name: 'Publication' })
    expect(form.textContent).toContain('aurora-demo@1.1.0')
    expect(form.textContent).toContain('immuable')
    const confirm = screen.getByRole('button', { name: 'Confirmer la publication' })
    expect(confirm.disabled).toBe(true) // changelog vide -> pas de publication
    fireEvent.change(screen.getByLabelText('Changelog de la version (obligatoire)'), {
      target: { value: 'Resserre le prompt kairos.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la publication' }))
    await screen.findByText(/publiée — elle est désormais immuable/)
    expect(api.publishDraft).toHaveBeenCalledWith('42', 'Resserre le prompt kairos.')
  })

  it('publication refusée par le serveur (semver non croissant) : message affiché', async () => {
    const api = fakeApi({
      publishDraft: vi.fn(async () => {
        throw new Error('La version doit être strictement supérieure à 1.1.0.')
      }),
    })
    await renderEditor(api)
    fireEvent.click(screen.getByRole('button', { name: 'Publier…' }))
    fireEvent.change(await screen.findByLabelText('Changelog de la version (obligatoire)'), {
      target: { value: 'x' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la publication' }))
    await screen.findByText(/strictement supérieure/)
  })
})

describe('EditeurSection — diff contre la version d’origine', () => {
  it('GET diff {id}/{fromVersion}/{version} et rendu structurel', async () => {
    const api = await renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Diff contre 1.0.0' }))
    const diffBlock = await screen.findByTestId('promptologue-diff')
    expect(api.diff).toHaveBeenCalledWith('aurora-demo', '1.0.0', '1.1.0')
    // En-tête : versions extraites des objets {version}, pas rendues telles quelles.
    expect(diffBlock.textContent).toContain('Diff 1.0.0 → 1.1.0')
    expect(diffBlock.textContent).toContain('kairos')
    // Lignes {op,text} : marqueur + texte (et non le numéro de ligne).
    expect(diffBlock.textContent).toContain('- ancien texte')
    expect(diffBlock.textContent).toContain('+ nouveau texte')
    // Métadonnées {from,to} rendues lisiblement, sans planter.
    expect(diffBlock.textContent).toContain('auteur')
  })
})
