// Visionneuse du tableau de bord — dispatch par type (D12 : une analyse Twin9
// stockée est le carto_evolutive NATIF ; la vue merge est re-dérivée via
// l'adaptateur du moteur avec le référentiel publié).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import CartographyViewer from './CartographyViewer.jsx'
import * as fakeLib from '../../test/fake-sunburst-lib.js'

afterEach(cleanup)

const REFERENTIEL = {
  poles: [
    { num: 1, nom: 'TÊTE — Penser & Comprendre' },
    { num: 2, nom: 'CŒUR — Relier & Naviguer' },
    { num: 3, nom: 'MAIN — Créer & Incarner' },
    { num: 4, nom: 'ÂME — Discerner & Juger' },
    { num: 5, nom: 'RACINES — Évoluer & Résister' },
    { num: 6, nom: 'CITÉ — Gouverner & S’ouvrir' },
    { num: 7, nom: 'FLAMBEAU — Transmettre & Piloter' },
  ],
  competences: [{ code: '1.01', nom: 'Pensée critique', pole: 1 }],
}

/** carto_evolutive minimal : une compétence attestée sur une journée datée. */
const CARTO_TWIN9 = {
  journal_id: 'demo',
  date: '2026-03-10',
  periode: { debut: '2026-03-02', fin: '2026-03-02', n_journees: 1 },
  competences: {
    '1.01': {
      code: '1.01',
      nom: 'Pensée critique',
      pole: 1,
      attestations: [
        { jour_index: 0, journee: 'J01', date: '2026-03-02', confiance: 0.8, score_preuves: 2, score_indices: 1 },
      ],
      signaux: [],
    },
  },
  histoires: { '1.01': 'Une histoire attestée.' },
  rapports_poles: { 1: 'Rapport du pôle un.' },
  kairos_evolutif: 'Synthèse évolutive.',
}

const getReferentiel = vi.fn().mockResolvedValue({ doc: REFERENTIEL })

describe('CartographyViewer — type twin9 (D12)', () => {
  it('re-dérive la vue merge depuis le carto_evolutive natif et rend le sunburst', async () => {
    render(
      <CartographyViewer
        document={CARTO_TWIN9}
        entry={{ type: 'twin9', titre: 'Twin9 — demo' }}
        onClose={() => {}}
        lib={fakeLib}
        getReferentiel={getReferentiel}
      />,
    )
    // Le titre de l'entrée + le rendu MergeView (période reconstituée).
    expect(await screen.findByText('Twin9 — demo')).toBeTruthy()
    expect(await screen.findByTestId('carto-viewer')).toBeTruthy()
    // La feuille datée de l'attestation apparaît dans la vue merge (timeline).
    expect((await screen.findByTestId('carto-viewer')).textContent).toContain('2026')
  })

  it('explique en français quand aucune journée n’est datée (rien à projeter)', async () => {
    const sansDate = {
      ...CARTO_TWIN9,
      competences: {
        '1.01': { code: '1.01', nom: 'Pensée critique', pole: 1, attestations: [], signaux: [] },
      },
    }
    render(
      <CartographyViewer
        document={sansDate}
        entry={{ type: 'twin9', titre: 'Twin9 — vide' }}
        onClose={() => {}}
        lib={fakeLib}
        getReferentiel={getReferentiel}
      />,
    )
    expect((await screen.findByRole('alert')).textContent).toContain('aucune journée datée')
  })
})
