import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PortfolioView from './PortfolioView.jsx'
import { createMemoryAdapter, createPortfolioStore } from '../lib/portfolio-store.js'

afterEach(cleanup)

const TODAY = '2026-07-12'

const THREE_DAYS =
  '## Lundi 5 janvier 2026\n\nMatin à l’Astrolabe.\n\n' +
  '## Mardi 6 janvier 2026\n\nAtelier avec les quatrièmes.\n\n' +
  '## Mercredi 7 janvier 2026\n\nLe vernissage.\n'

/** Rend la vue sur un store mémoire, sans délai de sauvegarde. */
function renderView(props = {}) {
  const store = createPortfolioStore(createMemoryAdapter())
  const utils = render(
    <PortfolioView store={store} today={TODAY} saveDelay={0} {...props} />,
  )
  return { store, ...utils }
}

/** Crée un portfolio et colle le texte 3 journées. */
async function createWithText(text = THREE_DAYS, props = {}) {
  const context = renderView(props)
  fireEvent.click(screen.getByRole('button', { name: 'Nouveau portfolio' }))
  const editor = await screen.findByLabelText('Texte du portfolio')
  fireEvent.change(editor, { target: { value: text } })
  return { ...context, editor }
}

describe('PortfolioView', () => {
  it('affiche en permanence le bandeau « vos textes ne quittent pas ce navigateur » (§4.2/§6)', () => {
    renderView()
    expect(screen.getByRole('note').textContent).toContain(
      'Vos textes ne quittent pas ce navigateur.',
    )
  })

  it('crée un portfolio et propose les trois sources (coller, fichier, Google Docs)', async () => {
    await createWithText()
    expect(screen.getByLabelText('Texte du portfolio')).toBeDefined()
    expect(screen.getByLabelText('Importer un fichier .txt ou .md')).toBeDefined()
    expect(screen.getByLabelText('URL du document Google Docs')).toBeDefined()
    // Message CLAIR sur le transit serveur de la source Google Docs.
    expect(
      screen.getByText(/transite par le serveur humanome\.xyz/).textContent,
    ).toContain('il n’y est jamais conservé')
  })

  it('segmente automatiquement le texte collé en journées éditables', async () => {
    await createWithText()
    expect(
      screen.getByRole('heading', { name: 'Découpage en journées (3)' }),
    ).toBeDefined()
    expect(screen.getByDisplayValue('2026-01-05')).toBeDefined()
    expect(screen.getByDisplayValue('2026-01-06')).toBeDefined()
    expect(screen.getByDisplayValue('2026-01-07')).toBeDefined()
  })

  it('persiste en continu dans le store local (base humanome-portfolios)', async () => {
    const { store } = await createWithText()
    await waitFor(async () => {
      const [record] = await store.list()
      expect(record?.texte).toBe(THREE_DAYS)
      expect(record?.segments).toHaveLength(3)
      expect(record?.segments[0].date).toBe('2026-01-05')
    })
    expect(await screen.findByText(/Enregistré localement à/)).toBeDefined()
  })

  it('renomme la date d’une journée (validation AAAA-MM-JJ)', async () => {
    await createWithText()
    const dateInput = screen.getByDisplayValue('2026-01-05')

    fireEvent.change(dateInput, { target: { value: 'pas-une-date' } })
    fireEvent.blur(dateInput)
    expect(screen.getByText(/Date invalide/)).toBeDefined()

    fireEvent.change(dateInput, { target: { value: '2026-02-01' } })
    fireEvent.blur(dateInput)
    expect(screen.getByDisplayValue('2026-02-01')).toBeDefined()
    expect(screen.queryByText(/Date invalide/)).toBe(null)
  })

  it('fusionne une journée avec la précédente', async () => {
    await createWithText()
    const mergeButtons = screen.getAllByRole('button', {
      name: 'Fusionner avec la journée précédente',
    })
    expect(mergeButtons).toHaveLength(2) // pas de fusion pour la première
    fireEvent.click(mergeButtons[0])
    expect(
      screen.getByRole('heading', { name: 'Découpage en journées (2)' }),
    ).toBeDefined()
  })

  it('scinde une journée au curseur', async () => {
    await createWithText()
    const dayText = screen.getByLabelText('Texte de la journée 2026-01-07')
    const offset = dayText.value.indexOf('Le vernissage')
    dayText.setSelectionRange(offset, offset)
    fireEvent.click(screen.getAllByRole('button', { name: 'Scinder au curseur' })[2])
    expect(
      screen.getByRole('heading', { name: 'Découpage en journées (4)' }),
    ).toBeDefined()
  })

  it('scission sans curseur placé : message d’aide, pas d’erreur', async () => {
    await createWithText()
    const dayText = screen.getByLabelText('Texte de la journée 2026-01-05')
    dayText.setSelectionRange(0, 0)
    fireEvent.click(screen.getAllByRole('button', { name: 'Scinder au curseur' })[0])
    expect(screen.getByRole('alert').textContent).toContain('placez le curseur')
  })

  it('importe un Google Docs public via l’API (succès)', async () => {
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/plain; charset=utf-8' },
      text: async () => '## 2026-03-01\nTexte importé depuis Google Docs.',
    })
    await createWithText('', { fetchFn })
    const urlInput = screen.getByLabelText('URL du document Google Docs')
    fireEvent.change(urlInput, {
      target: {
        value:
          'https://docs.google.com/document/d/1AbC-dEfGhIjKlMnOpQrStUvWxYz0123456789abcd/edit',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Importer le document' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Texte du portfolio').value).toContain(
        'Texte importé depuis Google Docs.',
      )
    })
    expect(screen.getByText(/le serveur n’en conserve aucune copie/)).toBeDefined()
    expect(screen.getByDisplayValue('2026-03-01')).toBeDefined()
  })

  it('import Google Docs refusé : message d’erreur du serveur affiché', async () => {
    const fetchFn = async () => ({
      ok: false,
      status: 403,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Document non accessible : partagez-le en lecture.' }),
    })
    await createWithText('', { fetchFn })
    fireEvent.change(screen.getByLabelText('URL du document Google Docs'), {
      target: {
        value:
          'https://docs.google.com/document/d/1AbC-dEfGhIjKlMnOpQrStUvWxYz0123456789abcd/edit',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Importer le document' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Document non accessible',
    )
  })

  it('URL Google Docs non reconnue : erreur claire sans appel réseau', async () => {
    let called = false
    await createWithText('', {
      fetchFn: async () => {
        called = true
        throw new Error('ne doit pas être appelé')
      },
    })
    fireEvent.change(screen.getByLabelText('URL du document Google Docs'), {
      target: { value: 'https://example.com/pas-un-doc' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Importer le document' }))

    expect((await screen.findByRole('alert')).textContent).toContain('URL non reconnue')
    expect(called).toBe(false)
  })

  it('« Cartographier » : écran « disponible dans l’espace apprenant (bientôt) »', async () => {
    await createWithText()
    fireEvent.click(screen.getByRole('button', { name: 'Cartographier' }))
    const panel = screen.getByRole('status', { name: 'Cartographier' })
    expect(panel.textContent).toContain('disponible')
    expect(panel.textContent).toContain('l’espace apprenant (bientôt)')
    expect(panel.textContent).toContain('Essayer')
  })

  it('bouton « Exporter (.md) » présent pour le portfolio courant', async () => {
    await createWithText()
    expect(screen.getByRole('button', { name: 'Exporter (.md)' })).toBeDefined()
  })

  it('supprime un portfolio en deux temps (confirmation inline)', async () => {
    const { store } = await createWithText()
    await waitFor(async () => {
      expect(await store.list()).toHaveLength(1)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }))
    await waitFor(async () => {
      expect(await store.list()).toHaveLength(0)
    })
    expect(screen.getByText('Aucun portfolio pour l’instant.')).toBeDefined()
  })

  it('recharge les portfolios existants depuis le store au montage', async () => {
    const store = createPortfolioStore(createMemoryAdapter())
    await store.create({ titre: 'Journal hiver', texte: 'Un texte.' })
    render(<PortfolioView store={store} today={TODAY} saveDelay={0} />)
    expect(await screen.findByRole('button', { name: 'Journal hiver' })).toBeDefined()
  })

  it('éditeur : compteur mots/caractères et plein écran (ADR-010)', async () => {
    await createWithText('Bonjour le monde')
    expect(screen.getByTestId('editor-counter').textContent).toContain('3 mots')
    expect(screen.getByTestId('editor-counter').textContent).toContain('16 caractères')
    fireEvent.click(screen.getByRole('button', { name: 'Plein écran' }))
    expect(
      screen.getByRole('button', { name: 'Quitter le plein écran (Échap)' }),
    ).toBeDefined()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Plein écran' })).toBeDefined()
  })
})
