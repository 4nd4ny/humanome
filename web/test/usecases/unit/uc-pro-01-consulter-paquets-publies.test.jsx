// UC-PRO-01 — Consulter les paquets de prompts publiés et leurs différences :
// tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-01-consulter-paquets-publies.md
//
// Code sollicité appelé directement : le client de l'atelier
// (createPromptologueApi — routes de lecture publiques), le routeur par hash
// (#/promptologue), le composant DiffView isolé (rendu tolérant de la sortie
// de PackageDiff), le consommateur apprenant du paquet par défaut
// (fetchPromptPackages, lanceur de runs), la garde de PromptologueView et
// son repli « section inconnue », et l'accueil AccueilSection rendus seuls
// avec un client simulé (sans réseau).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { createPromptologueApi } from '../../../src/views/promptologue/api.js'
import { DiffView } from '../../../src/views/promptologue/EditeurSection.jsx'
import AccueilSection from '../../../src/views/promptologue/AccueilSection.jsx'
import PromptologueView from '../../../src/views/PromptologueView.jsx'
import { ApiUnavailableError } from '../../../src/api/client.js'
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
    await api.diff('aurora demo', '1.0.0+a', '2.0.0')

    expect(apiFetchFn.mock.calls).toEqual([
      ['prompt-packages'],
      ['prompt-packages/aurora%20demo/1.0.0%2Bbuild'],
      ['prompt-packages/default'],
      ['prompt-packages/aurora%20demo/diff/1.0.0%2Ba/2.0.0'],
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

describe('UC-PRO-01 — consommateur du défaut : défaut = paquet embarqué', () => {
  it('UC-PRO-01-U16 — anomalie AN-3 (comportement actuel figé) : quand le défaut servi est l’embarqué aurora-v3-reconstruit@1.0.0, aucune entrée ne porte defaut: true', async () => {
    const builtin = { id: BUILTIN_PACKAGE.id, version: BUILTIN_PACKAGE.version }
    const result = await fetchPromptPackages({
      apiFetchFn: vi.fn(async (path) =>
        path === 'prompt-packages/default' ? builtin : [{ ...builtin, description: 'copie publiée' }, { id: 'aurora-demo', version: '1.0.0' }],
      ),
    })

    expect(result.defaut).toEqual(builtin)
    // La copie publiée marquée est retirée comme doublon ; BUILTIN_PACKAGE (gelé) n'est jamais marqué.
    expect(result.packages.map((p) => `${p.id}@${p.version}`)).toEqual(['aurora-v3-reconstruit@1.0.0', 'aurora-demo@1.0.0'])
    expect(result.packages[0]).toBe(BUILTIN_PACKAGE)
    expect(result.packages.filter((p) => p.defaut === true)).toEqual([])
  })
})

/** Client promptologue simulé : chaque méthode est un vi.fn (aucun réseau). */
function fakeApi(overrides = {}) {
  return {
    listPublished: vi.fn(async () => []),
    listDrafts: vi.fn(async () => []),
    getDefault: vi.fn(async () => null),
    ...overrides,
  }
}

describe('UC-PRO-01 — PromptologueView isolée : garde de session et de rôle', () => {
  it('UC-PRO-01-U17 — visiteur, API injoignable, compte sans rôle : message dédié et aucune lecture ; promptologue : accueil de l’atelier', async () => {
    const cases = [
      ['anonyme', async () => ({ user: null }), 'promptologue-anonyme', 'nécessite une session'],
      ['indisponible', async () => Promise.reject(new ApiUnavailableError()), 'promptologue-indisponible', 'Copie statique'],
      ['sans rôle', async () => ({ user: { id: 3, email: 'e@example.org', roles: ['apprenant'] } }), 'promptologue-sans-role', 'réservé au rôle'],
    ]
    for (const [label, fetchMeFn, testId, text] of cases) {
      const api = fakeApi()
      render(<PromptologueView section={null} deps={{ fetchMeFn, api }} />)
      expect((await screen.findByTestId(testId)).textContent, label).toContain(text)
      expect(api.listPublished, label).not.toHaveBeenCalled()
      expect(screen.queryByTestId('promptologue-connecte'), label).toBeNull()
      cleanup()
    }

    const api = fakeApi()
    render(
      <PromptologueView
        section={null}
        deps={{ fetchMeFn: async () => ({ user: { id: 7, displayName: 'Pom', roles: ['promptologue'] } }), api }}
      />,
    )
    expect((await screen.findByTestId('promptologue-connecte')).textContent).toContain('Pom (promptologue)')
    expect(await screen.findByText('Aucune version publiée sur ce serveur.')).toBeDefined()
    expect(api.listPublished).toHaveBeenCalledTimes(1)
    expect(api.listDrafts).toHaveBeenCalledTimes(1)
    expect(api.getDefault).toHaveBeenCalledTimes(1)
  })
})

describe('UC-PRO-01 — PromptologueView isolée : section inconnue (E7)', () => {
  it('UC-PRO-01-U19 — PromptologueView : segment décodé par parseHash hors des sections (comparaison exacte) → sous le bandeau et la navigation, alerte citant le segment et lien de retour #/promptologue ; client jamais appelé, aucune section montée ; sans rôle → refus, jamais le message', async () => {
    // Le segment arrive décodé du routeur : « r%C3%A9tro » devient « rétro ».
    expect(parseHash('#/promptologue/r%C3%A9tro')).toEqual({ name: 'promptologue', section: 'rétro' })

    const promptologue = async () => ({ user: { id: 7, displayName: 'Pom', roles: ['promptologue'] } })
    // « editeur/ » sans identifiant, « formations », « retro/ », casse : aucune section.
    for (const section of ['rétro', 'Retro', 'retro/', 'formations', 'editeur/', 'banc-essai/1']) {
      const api = fakeApi({ getPackage: vi.fn(), diff: vi.fn() })
      const Formation = vi.fn(() => null)
      render(<PromptologueView section={section} deps={{ fetchMeFn: promptologue, api, formationSection: Formation }} />)
      expect((await screen.findByRole('alert')).textContent, section).toBe(
        `Section inconnue de l’atelier promptologue : « ${section} ».`,
      )
      expect(screen.getByTestId('promptologue-connecte').textContent).toContain('Pom (promptologue)')
      expect(screen.getByRole('navigation', { name: 'Sections de l’atelier' })).toBeDefined()
      expect(screen.getByRole('link', { name: 'Retour à l’atelier' }).getAttribute('href')).toBe('#/promptologue')
      expect(screen.queryByRole('region', { name: 'Paquets publiés' })).toBeNull()
      await act(async () => {})
      for (const [name, fn] of Object.entries(api)) expect(fn, `${section} ${name}`).not.toHaveBeenCalled()
      expect(Formation, section).not.toHaveBeenCalled()
      cleanup()
    }

    // La garde passe avant l'aiguillage : compte sans rôle → refus, pas le repli.
    const api = fakeApi()
    render(
      <PromptologueView
        section="rétro"
        deps={{ fetchMeFn: async () => ({ user: { id: 3, email: 'e@example.org', roles: ['apprenant'] } }), api }}
      />,
    )
    expect((await screen.findByTestId('promptologue-sans-role')).textContent).toContain('réservé au rôle')
    expect(screen.queryByText(/Section inconnue/)).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Sections de l’atelier' })).toBeNull()
    expect(api.listPublished).not.toHaveBeenCalled()
  })
})

describe('UC-PRO-01 — AccueilSection isolée : tolérance des lectures', () => {
  it('UC-PRO-01-U18 — chaque lecture en échec est tolérée (liste vide, pas de défaut) ; entrées mal formées filtrées ; défaut marqué', async () => {
    render(
      <AccueilSection
        api={fakeApi({
          listPublished: vi.fn(async () => Promise.reject(new Error('500'))),
          listDrafts: vi.fn(async () => Promise.reject(new Error('403'))),
          getDefault: vi.fn(async () => ({ id: 'aurora-demo', version: '1.0.0' })),
        })}
      />,
    )
    expect(await screen.findByText('Aucune version publiée sur ce serveur.')).toBeDefined()
    expect(screen.getByText(/Aucun brouillon/)).toBeDefined()
    cleanup()

    render(
      <AccueilSection
        api={fakeApi({
          listPublished: vi.fn(async () => [
            { id: 'aurora-demo', version: '1.0.0' },
            { id: 'aurora-demo' }, // sans version : filtrée
            null,
            { id: 'aurora-demo', version: '2.0.0' },
          ]),
          getDefault: vi.fn(async () => ({ id: 'aurora-demo', version: '2.0.0' })),
        })}
      />,
    )
    const rows = within(await screen.findByRole('table')).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.cells[1].textContent.split(' ')[0])).toEqual(['1.0.0', '2.0.0'])
    expect(rows[1].querySelector('.promptologue-defaut')?.textContent).toBe('par défaut')
    expect(rows[0].querySelector('.promptologue-defaut')).toBeNull()
    cleanup()

    // getDefault en échec : aucune ligne marquée, chaque ligne peut être proposée.
    render(
      <AccueilSection
        api={fakeApi({
          listPublished: vi.fn(async () => [{ id: 'aurora-demo', version: '1.0.0' }]),
          getDefault: vi.fn(async () => Promise.reject(new Error('404 Aucun paquet publié'))),
        })}
      />,
    )
    const [row] = within(await screen.findByRole('table')).getAllByRole('row').slice(1)
    expect(row.querySelector('.promptologue-defaut')).toBeNull()
    expect(within(row).getByRole('button', { name: 'Proposer par défaut' })).toBeDefined()
  })
})
