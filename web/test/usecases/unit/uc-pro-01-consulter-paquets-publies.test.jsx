// UC-PRO-01 — Consulter les paquets de prompts publiés et leurs différences :
// tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-01-consulter-paquets-publies.md
//
// Code sollicité appelé directement : le client de l'atelier
// (createPromptologueApi — routes de lecture publiques), le routeur par hash
// (#/promptologue), le composant DiffView isolé (rendu tolérant de la sortie
// de PackageDiff) et le consommateur apprenant du paquet par défaut
// (fetchPromptPackages, lanceur de runs).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createPromptologueApi } from '../../../src/views/promptologue/api.js'
import { DiffView } from '../../../src/views/promptologue/EditeurSection.jsx'
import { parseHash } from '../../../src/router.js'
import { BUILTIN_PACKAGE, fetchPromptPackages } from '../../../src/lib/run-launcher.js'

afterEach(cleanup)

describe('UC-PRO-01 — client de l’atelier : lectures publiques', () => {
  it('UC-PRO-01-U12 — listPublished, getPackage, getDefault et diff : GET sur les routes du contrat, segments encodés', async () => {
    const apiFetchFn = vi.fn(async () => ({}))
    const api = createPromptologueApi(apiFetchFn)

    await api.listPublished()
    await api.getPackage('aurora demo', '1.0.0+build')
    await api.getDefault()
    await api.diff('aurora-demo', '1.0.0', '2.0.0-rc.1')

    expect(apiFetchFn.mock.calls).toEqual([
      ['prompt-packages'],
      ['prompt-packages/aurora%20demo/1.0.0%2Bbuild'],
      ['prompt-packages/default'],
      ['prompt-packages/aurora-demo/diff/1.0.0/2.0.0-rc.1'],
    ])
  })
})

describe('UC-PRO-01 — routeur : l’atelier', () => {
  it('UC-PRO-01-U13 — #/promptologue ouvre l’accueil de l’atelier (section nulle)', () => {
    expect(parseHash('#/promptologue')).toEqual({ name: 'promptologue', section: null })
    expect(parseHash('#/promptologue/')).toEqual({ name: 'not-found', hash: '/promptologue/' })
  })
})

describe('UC-PRO-01 — DiffView isolé : rendu tolérant', () => {
  it('UC-PRO-01-U14 — rien pour un diff absent ; en-tête depuis {version} OU chaîne ; sections vides omises', () => {
    const { container } = render(<DiffView diff={null} />)
    expect(container.textContent).toBe('')

    render(
      <DiffView
        diff={{
          from: '1.0.0', // forme historique tolérée (chaîne)
          to: { version: '1.1.0' },
          identical: false,
          fields: {},
          prompts: { added: ['libre'], removed: [], modified: [{ role: 'kairos', nom: 'K', texte: ['+ ligne brute'] }] },
          code: { entrypoint: null, orchestration: null },
          metadata: { auteur: { from: null, to: { nom: 'Pom' } } },
        }}
      />,
    )
    const block = screen.getByTestId('promptologue-diff')
    expect(block.querySelector('h3').textContent).toBe('Diff 1.0.0 → 1.1.0')
    expect(block.textContent).toContain('Ajoutés : libre')
    expect(block.textContent).toContain('+ ligne brute')
    // Valeur objet rendue en JSON, null en tiret : jamais « [object Object] ».
    expect(block.textContent).toContain('auteur : — → {"nom":"Pom"}')
    expect(block.textContent).not.toContain('[object Object]')
    const titles = [...block.querySelectorAll('h4')].map((h) => h.textContent)
    expect(titles).toEqual(['Prompts', 'Métadonnées'])
  })
})

describe('UC-PRO-01 — consommateur du paquet par défaut (lanceur de runs)', () => {
  it('UC-PRO-01-U15 — fetchPromptPackages marque la version servie par GET default ; repli sans défaut ; repli embarqué', async () => {
    const list = [
      { id: 'aurora-demo', version: '1.0.0' },
      { id: 'aurora-demo', version: '2.0.0' },
    ]
    const ok = await fetchPromptPackages({
      apiFetchFn: vi.fn(async (path) => (path === 'prompt-packages/default' ? { id: 'aurora-demo', version: '1.0.0' } : list)),
    })
    expect(ok.origin).toBe('api')
    expect(ok.defaut).toEqual({ id: 'aurora-demo', version: '1.0.0' })
    expect(ok.packages[0]).toBe(BUILTIN_PACKAGE)
    expect(ok.packages.filter((p) => p.defaut === true).map((p) => p.version)).toEqual(['1.0.0'])

    const noDefault = await fetchPromptPackages({
      apiFetchFn: vi.fn(async (path) => {
        if (path === 'prompt-packages/default') throw new Error('404 Aucun paquet publié')
        return list
      }),
    })
    expect(noDefault.defaut).toBeNull()
    expect(noDefault.packages).toHaveLength(3)

    const down = await fetchPromptPackages({ apiFetchFn: vi.fn(async () => Promise.reject(new Error('réseau'))) })
    expect(down).toEqual({ packages: [BUILTIN_PACKAGE], origin: 'embarque', defaut: null })
  })
})
