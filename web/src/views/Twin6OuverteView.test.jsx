import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import Twin6OuverteView from './Twin6OuverteView.jsx'
import * as fakeLib from '../test/fake-sunburst-lib.js'

afterEach(cleanup)

const ETABLIE = 'présence établie'

const MERGE_DOC = {
  kind: 'cartographie-merge',
  periode: { premiere: '2026-01-05', derniere: '2026-01-05', nbFeuilles: 1 },
  domains: [
    {
      id: 'TÊTE — Penser & Comprendre',
      color: '#2563eb',
      rapport_html: '<p>Rapport TÊTE.</p>',
      competences: [
        {
          id: '1.01 — Pensée', code: '1.01', points: 1, niveau: 3, statut: ETABLIE,
          description: 'Pensée', feedback: '<p>Feedback 1.01.</p>', score_moyen_par_feuille: 1,
          parFeuille: [{ date: '2026-01-05', statut: ETABLIE, preuves: 1, indices: 0, confiance: 0.7, score: 1 }],
        },
      ],
    },
  ],
  profilMeta: {
    competences_etablies: 1, competences_renvoyees: 0, competences_orphelines: 0, score_total: 1,
    evolution_globale: [{ date: '2026-01-05', score_total: 1, etablies: 1 }],
  },
  feuilles: [{ iso: '2026-01-05', label: '05/01/2026' }],
  narratifs: { kairosHtml: '<h3>Synthèse</h3><p>Kairos ouvert.</p>' },
}

const PKG = {
  id: 'twin6-ouverte', version: '1.0.0', modeleCibleDefaut: 'claude-sonnet-5',
  templates: { scanPole: 'SCAN ${POLE}', kairos: 'KAIROS', fiches: { 1: 'F1' } },
}
const OFFER = {
  modeles: { 'claude-sonnet-5': [3.3, 16.5] },
  twin9PromoOuverte: false,
  referentiel: [{ num: 1, nom: 'TÊTE — Penser & Comprendre', competences: [{ code: '1.01', nom: 'Pensée' }] }],
}

function baseDeps(over = {}) {
  return {
    fetchMeFn: async () => ({ user: { id: 1, roles: ['apprenant'] } }),
    loadPackage: async () => PKG,
    fetchOffer: async () => OFFER,
    makeCreditsProvider: () => ({ name: 'twin6-credits', complete: async () => ({}) }),
    makeOwnKeyProvider: () => ({ name: 'anthropic', complete: async () => ({}) }),
    runEngine: vi.fn(async () => ({ document: MERGE_DOC, calls: new Array(8).fill(0) })),
    now: () => new Date('2026-07-15T00:00:00Z'),
    lib: fakeLib,
    ...over,
  }
}

describe('Twin6OuverteView', () => {
  it('invite un visiteur anonyme à se connecter', async () => {
    render(<Twin6OuverteView deps={baseDeps({ fetchMeFn: async () => ({ user: null }) })} />)
    expect(await screen.findByRole('link', { name: 'Connectez-vous' })).toBeDefined()
  })

  it('affiche le formulaire ouvert (clé perso gratuite ou crédits) une fois connecté', async () => {
    render(<Twin6OuverteView deps={baseDeps()} />)
    expect(await screen.findByLabelText(/Votre portfolio/)).toBeDefined()
    expect(screen.getByRole('radio', { name: /Avec nos crédits/ })).toBeDefined()
    expect(screen.getByRole('radio', { name: /Avec ma propre clé API/ })).toBeDefined()
    // Lien de téléchargement des prompts open source.
    expect(screen.getByRole('link', { name: 'Télécharger les prompts' })).toBeDefined()
  })

  it('lance le moteur et rend le résultat dans le sunburst', async () => {
    const deps = baseDeps()
    render(<Twin6OuverteView deps={deps} />)

    const textarea = await screen.findByLabelText(/Votre portfolio/)
    fireEvent.change(textarea, {
      target: { value: '### 2026-01-05\n---\nAujourd’hui j’ai réparé l’horloge et réfléchi à ma méthode de travail.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' }))

    await waitFor(() => expect(deps.runEngine).toHaveBeenCalledTimes(1))
    const arg = deps.runEngine.mock.calls[0][0]
    expect(arg.model).toBe('claude-sonnet-5')
    expect(arg.portfolio).toContain('réparé l’horloge')
    expect(arg.referentiel.poles).toEqual([{ num: 1, nom: 'TÊTE — Penser & Comprendre' }])
    expect(arg.referentiel.competences).toEqual([{ code: '1.01', nom: 'Pensée', pole: 1 }])

    // Résultat rendu (le sunburst réutilise MergeView).
    expect(await screen.findByText(/Cartographie ouverte terminée/)).toBeDefined()
    expect(screen.getByText('Feuilles de portfolio')).toBeDefined()
  })

  it('exige une clé API quand la voie « clé perso » est choisie', async () => {
    const deps = baseDeps()
    render(<Twin6OuverteView deps={deps} />)
    await screen.findByLabelText(/Votre portfolio/)
    fireEvent.change(screen.getByLabelText(/Votre portfolio/), {
      target: { value: 'Un portfolio suffisamment long pour être analysé, avec du contenu réflexif réel.' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /Avec ma propre clé API/ }))
    // Sans clé, le bouton reste désactivé.
    expect(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' })).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByLabelText('Clé API Anthropic'), { target: { value: 'sk-ant-user' } })
    expect(screen.getByRole('button', { name: 'Lancer la cartographie ouverte' })).toHaveProperty('disabled', false)
  })
})
