// Régénération rétrospective (P10.6) : comparaison pure + composant (mock).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RetroSection from './RetroSection.jsx'
import { compareRetroDocs, findLocalDayText, newerReferentielVersions } from './retro.js'
import jourFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import referentielFixture from '../../../../schemas/fixtures/referentiel-respire-v7.json'

/** Variante : 1.01 devient établie (nouvelle), 2.01 disparaît (non établie). */
function regeneratedVariant() {
  const doc = structuredClone(jourFixture)
  for (const pole of doc.poles) {
    for (const comp of pole.competences) {
      if (comp.code === '1.01') comp.verdict.statut = 'présence établie'
      if (comp.code === '2.01') comp.verdict.statut = 'présence non établie'
    }
  }
  return doc
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('retro.js — logique pure', () => {
  it('compareRetroDocs : nouvelles / disparues / stables', () => {
    const { nouvelles, disparues, stables } = compareRetroDocs(jourFixture, regeneratedVariant())
    expect(nouvelles).toEqual([{ code: '1.01', statutApres: 'présence établie' }])
    expect(disparues).toEqual([
      { code: '2.01', statutAvant: 'présence établie', statutApres: 'présence non établie' },
    ])
    expect(stables).toEqual(['3.04', '5.03', '7.01'])
  })

  it('findLocalDayText : retrouve et concatène les segments locaux de la date', () => {
    const portfolios = [
      { titre: 'Autre', segments: [{ date: '2026-01-04', texte: 'x' }] },
      {
        titre: 'Journal Astrolabe',
        segments: [
          { date: '2026-01-05', texte: 'Matin.' },
          { date: '2026-01-05', texte: 'Soir.' },
        ],
      },
    ]
    expect(findLocalDayText(portfolios, '2026-01-05')).toEqual({
      texte: 'Matin.\n\nSoir.',
      portfolioTitre: 'Journal Astrolabe',
    })
    expect(findLocalDayText(portfolios, '2026-02-01')).toBeNull()
  })

  it('newerReferentielVersions : strictement plus récentes, triées décroissantes', () => {
    const versions = [{ version: '7.0.0' }, { version: '7.2.0' }, { version: '7.10.1' }]
    expect(newerReferentielVersions(versions, '7.0.0').map((v) => v.version)).toEqual([
      '7.10.1',
      '7.2.0',
    ])
    expect(newerReferentielVersions(versions, null)).toHaveLength(3)
  })
})

describe('RetroSection — composant (mock)', () => {
  function setup(overrides = {}) {
    const api = {
      listCartographies: vi.fn(async () => [{ id: 3, titre: 'Journée du 5 janvier' }]),
      getCartography: vi.fn(async () => ({ document: structuredClone(jourFixture) })),
      listReferentielVersions: vi.fn(async () => [{ version: '7.1.0' }, { version: '7.0.0' }]),
      getReferentielVersion: vi.fn(async () => structuredClone(referentielFixture)),
      ...overrides.api,
    }
    const extractDayFn = vi.fn(async () => regeneratedVariant())
    const deps = {
      extractDayFn,
      portfolioStore: {
        list: vi.fn(async () => [
          { titre: 'Journal', segments: [{ date: '2026-01-05', texte: 'Texte local du 5.' }] },
        ]),
      },
      createBundleFn: vi.fn(() => ({
        provider: { complete: async () => ({ text: '' }) },
        prime: null,
        model: 'demo',
        maxTokens: 8192,
        estimationModel: 'claude-sonnet-5',
      })),
    }
    render(<RetroSection api={api} deps={deps} />)
    return { api, extractDayFn, deps }
  }

  it('sélectionne une cartographie jour, retrouve le texte LOCAL, régénère, compare', async () => {
    const { api, extractDayFn } = setup()
    const select = await screen.findByLabelText('Cartographie d’origine')
    fireEvent.change(select, { target: { value: '3' } })
    await screen.findByTestId('retro-original')
    // RGPD : le texte vient du portfolio local, pas du serveur.
    expect(screen.getByTestId('retro-original').textContent).toContain('Journal')
    const textarea = screen.getByLabelText(/Texte de la journée/)
    expect(textarea.value).toBe('Texte local du 5.')

    fireEvent.change(screen.getByLabelText('Version du référentiel'), {
      target: { value: '7.1.0' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Régénérer et comparer' }))

    const result = await screen.findByTestId('retro-result')
    expect(api.getReferentielVersion).toHaveBeenCalledWith('7.1.0')
    expect(extractDayFn).toHaveBeenCalledTimes(1)
    expect(extractDayFn.mock.calls[0][0]).toMatchObject({
      dayText: 'Texte local du 5.',
      date: '2026-01-05',
    })
    expect(result.textContent).toContain('1.01')
    expect(result.textContent).toContain('nouvellement détectée')
    expect(result.textContent).toContain('2.01')
    expect(result.textContent).toContain('disparue')
  })

  it('exige une version de référentiel avant de lancer', async () => {
    setup()
    fireEvent.change(await screen.findByLabelText('Cartographie d’origine'), {
      target: { value: '3' },
    })
    await screen.findByTestId('retro-original')
    fireEvent.click(screen.getByRole('button', { name: 'Régénérer et comparer' }))
    await screen.findByText(/Choisissez une version du référentiel/)
  })

  it('cartographie non-jour : explication (v1 à l’unité, jour par jour)', async () => {
    setup({
      api: {
        getCartography: vi.fn(async () => ({ document: { kind: 'cartographie-merge' } })),
      },
    })
    fireEvent.change(await screen.findByLabelText('Cartographie d’origine'), {
      target: { value: '3' },
    })
    await screen.findByText(/n’est pas une cartographie de journée/)
  })

  it('cartographies serveur inaccessibles : message, pas de crash', async () => {
    const error = Object.assign(new Error('Authentification requise.'), { status: 401 })
    setup({ api: { listCartographies: vi.fn(async () => { throw error }) } })
    await screen.findByText(/nécessitent une session/)
  })
})
