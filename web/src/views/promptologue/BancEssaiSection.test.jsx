// Banc d'essai (P10.4) — composant : sélection de versions (publiées + MES
// brouillons seulement), exécution simple, multi-run, A/B avec rapport.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import BancEssaiSection from './BancEssaiSection.jsx'
import jourFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import pkgFixture from '../../../../schemas/fixtures/prompt-package-exemple.json'
import referentielFixture from '../../../../schemas/fixtures/referentiel-respire-v7.json'

const user = { email: 'p@b.fr', displayName: 'Pom', roles: ['promptologue'] }

function fakeApi(overrides = {}) {
  return {
    listPublished: vi.fn(async () => [{ id: 'aurora-lab', version: '2.0.0' }]),
    listDrafts: vi.fn(async () => [{ draftId: '7', id: 'aurora-demo', version: '1.1.0' }]),
    getDraft: vi.fn(async () => ({
      draftId: '7',
      document: { ...structuredClone(pkgFixture), version: '1.1.0' },
    })),
    getPackage: vi.fn(async (id, version) => ({ ...structuredClone(pkgFixture), id, version })),
    ...overrides,
  }
}

function fakeDeps(runFn) {
  return {
    runFn,
    portfolioStore: { list: vi.fn(async () => [] ) },
    getReferentielFn: () => referentielFixture,
    createBundleFn: vi.fn(() => ({
      provider: { complete: async () => ({ text: '' }) },
      prime: null,
      model: 'demo',
      maxTokens: 8192,
      estimationModel: 'claude-sonnet-5',
    })),
  }
}

const okRun = (pkg) => ({
  pkg: { id: pkg.id, version: pkg.version },
  engine: pkg.builtin === true,
  days: [{ iso: '2026-01-05', document: jourFixture }],
  llmCalls: 8,
  durationMs: 2000,
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('BancEssaiSection — sélection', () => {
  it('propose le paquet embarqué, les versions publiées et MES brouillons', async () => {
    render(<BancEssaiSection api={fakeApi()} user={user} deps={fakeDeps(vi.fn())} />)
    const select = await screen.findByLabelText('Version à tester')
    const labels = [...select.options].map((o) => o.textContent)
    expect(labels[0]).toContain('moteur embarqué')
    expect(labels).toContain('aurora-lab@2.0.0 (publiée)')
    expect(labels).toContain('aurora-demo@1.1.0 (mon brouillon)')
    // Règle de sécurité : la liste des brouillons vient de GET drafts (les
    // miens uniquement) — un brouillon ne tourne que chez son auteur.
    expect(screen.getByText(/ne s’exécute que chez son auteur/)).toBeTruthy()
  })
})

describe('BancEssaiSection — exécution', () => {
  it('run simple : exécute la version choisie et affiche le résumé par jour', async () => {
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    render(<BancEssaiSection api={fakeApi()} user={user} deps={fakeDeps(runFn)} />)
    await screen.findByLabelText('Version à tester')
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    const table = await screen.findByTestId('banc-simple')
    expect(runFn).toHaveBeenCalledTimes(1)
    expect(runFn.mock.calls[0][0].pkg.id).toBe('aurora-v3-reconstruit')
    expect(runFn.mock.calls[0][0].dayGroups).toHaveLength(3) // fixture Maya
    expect(table.textContent).toContain('2026-01-05')
    expect(table.textContent).toContain('2.01')
  })

  it('un brouillon sélectionné est exécuté depuis son document local (auteur)', async () => {
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    const api = fakeApi()
    render(<BancEssaiSection api={api} user={user} deps={fakeDeps(runFn)} />)
    const select = await screen.findByLabelText('Version à tester')
    fireEvent.change(select, { target: { value: 'draft:7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    await screen.findByTestId('banc-simple')
    expect(runFn.mock.calls[0][0].pkg.version).toBe('1.1.0')
    expect(api.getPackage).not.toHaveBeenCalled() // pas d'aller-retour serveur
  })

  it('multi-run : N exécutions puis rapport de consistance', async () => {
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    render(<BancEssaiSection api={fakeApi()} user={user} deps={fakeDeps(runFn)} />)
    await screen.findByLabelText('Version à tester')
    fireEvent.click(screen.getByRole('radio', { name: /Multi-run/ }))
    fireEvent.change(screen.getByLabelText('Nombre de runs'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    const bloc = await screen.findByTestId('banc-multi')
    expect(runFn).toHaveBeenCalledTimes(3)
    expect(bloc.textContent).toContain('3 runs')
    expect(bloc.textContent).toContain('0.000') // runs identiques -> distance 0
    // Rendu via lib/consistency-view.js (chantier C) : accord % + badges.
    expect(bloc.textContent).toContain('accord 100 %')
    expect(bloc.querySelector('.verdict-badge.etablie')).toBeTruthy()
  })

  it('A/B : deux versions, tableau comparatif et rapport JSON téléchargeable', async () => {
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    const api = fakeApi()
    render(<BancEssaiSection api={api} user={user} deps={fakeDeps(runFn)} />)
    await screen.findByLabelText('Version à tester')
    fireEvent.click(screen.getByRole('radio', { name: /A\/B/ }))
    fireEvent.change(screen.getByLabelText('Version A'), { target: { value: 'builtin' } })
    fireEvent.change(screen.getByLabelText('Version B'), { target: { value: 'pub:aurora-lab@2.0.0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    const bloc = await screen.findByTestId('banc-ab')
    expect(runFn).toHaveBeenCalledTimes(2)
    expect(api.getPackage).toHaveBeenCalledWith('aurora-lab', '2.0.0')
    expect(bloc.textContent).toContain('aurora-v3-reconstruit@1.0.0')
    expect(bloc.textContent).toContain('aurora-lab@2.0.0')
    const link = screen.getByRole('link', { name: 'Télécharger le rapport JSON' })
    expect(link.getAttribute('href')).toMatch(/^data:application\/json/)
    expect(link.getAttribute('download')).toContain('rapport-ab')
  })

  it('affiche l’erreur d’exécution (echec provider, quota sandbox…)', async () => {
    const runFn = vi.fn(async () => {
      throw new Error("Sandbox : quota d'appels LLM dépassé (16 max par run) — exécution interrompue.")
    })
    render(<BancEssaiSection api={fakeApi()} user={user} deps={fakeDeps(runFn)} />)
    await screen.findByLabelText('Version à tester')
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    await screen.findByText(/quota d'appels LLM dépassé/)
  })
})

describe('BancEssaiSection — périmètre du journal et du référentiel (D15)', () => {
  it('« Une journée » : seule la journée choisie part au run', async () => {
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    render(<BancEssaiSection api={fakeApi()} user={user} deps={fakeDeps(runFn)} />)
    await screen.findByLabelText('Version à tester')
    fireEvent.click(screen.getByRole('radio', { name: /Une journée/ }))
    fireEvent.change(screen.getByLabelText('Journée'), { target: { value: '2026-01-06' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    await screen.findByTestId('banc-simple')
    expect(runFn.mock.calls[0][0].dayGroups.map((g) => g.iso)).toEqual(['2026-01-06'])
  })

  it('« Une période » : bornes incluses', async () => {
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    render(<BancEssaiSection api={fakeApi()} user={user} deps={fakeDeps(runFn)} />)
    await screen.findByLabelText('Version à tester')
    fireEvent.click(screen.getByRole('radio', { name: /Une période/ }))
    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-01-06' } })
    fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2026-01-07' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    await screen.findByTestId('banc-simple')
    expect(runFn.mock.calls[0][0].dayGroups.map((g) => g.iso)).toEqual([
      '2026-01-06',
      '2026-01-07',
    ])
  })

  it('périmètre « une compétence » : transmis au run, options issues du référentiel', async () => {
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    render(<BancEssaiSection api={fakeApi()} user={user} deps={fakeDeps(runFn)} />)
    await screen.findByLabelText('Version à tester')
    const select = screen.getByLabelText('Périmètre du référentiel')
    expect([...select.options].some((o) => o.value === 'comp:2.01')).toBe(true)
    fireEvent.change(select, { target: { value: 'comp:2.01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    await screen.findByTestId('banc-simple')
    expect(runFn.mock.calls[0][0].perimetre).toEqual({ competences: ['2.01'] })
  })
})

describe('BancEssaiSection — LLM et référentiel par branche (D15)', () => {
  it('A/B avec fournisseur distinct pour B : deux bundles construits', async () => {
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    const deps = fakeDeps(runFn)
    render(<BancEssaiSection api={fakeApi()} user={user} deps={deps} />)
    await screen.findByLabelText('Version à tester')
    fireEvent.click(screen.getByRole('radio', { name: /A\/B/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Fournisseur\/modèle distinct pour B/ }))
    // Deux blocs fournisseur visibles, un par branche.
    expect(screen.getByText('Fournisseur LLM — branche A')).toBeTruthy()
    expect(screen.getByText('Fournisseur LLM — branche B')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    await screen.findByTestId('banc-ab')
    expect(deps.createBundleFn).toHaveBeenCalledTimes(2)
    expect(runFn).toHaveBeenCalledTimes(2)
  })

  it('version du référentiel : liste API + hint « en dur » sur un paquet twin6', async () => {
    const api = fakeApi({
      listReferentielVersions: vi.fn(async () => [{ version: '8.0.0', label: 'RESPIRE v8' }]),
      listPublished: vi.fn(async () => [{ id: 'twin6-ouverte', version: '1.0.0' }]),
    })
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    render(<BancEssaiSection api={api} user={user} deps={fakeDeps(runFn)} />)
    const select = await screen.findByLabelText('Version du référentiel')
    await waitFor(() =>
      expect([...select.options].map((o) => o.value)).toEqual(['embarque', '8.0.0']),
    )
    // Sélectionner le paquet twin6 -> avertissement référentiel en dur.
    fireEvent.change(screen.getByLabelText('Version à tester'), {
      target: { value: 'pub:twin6-ouverte@1.0.0' },
    })
    await screen.findByText(/Référentiel en dur/)
  })

  it('version du référentiel choisie : chargée via l’API et transmise au run', async () => {
    const referentielV8 = structuredClone(referentielFixture)
    referentielV8.version = '8.0.0'
    const api = fakeApi({
      listReferentielVersions: vi.fn(async () => [{ version: '8.0.0' }]),
      getReferentielVersion: vi.fn(async () => ({ document: referentielV8 })),
    })
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    render(<BancEssaiSection api={api} user={user} deps={fakeDeps(runFn)} />)
    const select = await screen.findByLabelText('Version du référentiel')
    await waitFor(() => expect(select.options.length).toBe(2))
    fireEvent.change(select, { target: { value: '8.0.0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    await screen.findByTestId('banc-simple')
    expect(api.getReferentielVersion).toHaveBeenCalledWith('8.0.0')
    expect(runFn.mock.calls[0][0].referentiel.version).toBe('8.0.0')
  })
})

describe('BancEssaiSection — référence importée (D15)', () => {
  it('compare le run généré à un JSON de référence, avec diff du jury', async () => {
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    const reference = JSON.stringify(structuredClone(jourFixture))
    const deps = { ...fakeDeps(runFn), readFileTextFn: vi.fn(async () => reference) }
    render(<BancEssaiSection api={fakeApi()} user={user} deps={deps} />)
    await screen.findByLabelText('Version à tester')
    fireEvent.click(screen.getByRole('radio', { name: /Vs référence importée/ }))
    const file = new File([reference], 'reference.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('JSON de référence'), { target: { files: [file] } })
    await screen.findByText(/reference\.json/)
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    const bloc = await screen.findByTestId('banc-ab')
    expect(runFn).toHaveBeenCalledTimes(1) // seul le côté A est généré
    expect(bloc.textContent).toContain('Référence')
    // Diff de compétences avec traces du jury (les deux côtés sont identiques
    // ici : la fixture jour EST la sortie du run mocké -> aucun écart).
    const diff = screen.getByTestId('banc-diff-competences')
    expect(diff.textContent).toContain('Aucun écart')
  })

  it('sans référence importée : erreur explicite', async () => {
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    render(<BancEssaiSection api={fakeApi()} user={user} deps={fakeDeps(runFn)} />)
    await screen.findByLabelText('Version à tester')
    fireEvent.click(screen.getByRole('radio', { name: /Vs référence importée/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    await screen.findByText(/Importez d’abord un JSON de référence/)
    expect(runFn).not.toHaveBeenCalled()
  })
})

describe('BancEssaiSection — diff A/B avec traces du jury (D15)', () => {
  it('le mode A/B rend le diff de compétences en plus du tableau', async () => {
    const variant = structuredClone(jourFixture)
    for (const pole of variant.poles) {
      for (const comp of pole.competences) {
        if (comp.code === '2.01') comp.verdict.statut = 'présence non établie'
      }
    }
    let call = 0
    const runFn = vi.fn(async ({ pkg }) => {
      call += 1
      return {
        ...okRun(pkg),
        days: [{ iso: '2026-01-05', document: call === 1 ? jourFixture : variant }],
      }
    })
    render(<BancEssaiSection api={fakeApi()} user={user} deps={fakeDeps(runFn)} />)
    await screen.findByLabelText('Version à tester')
    fireEvent.click(screen.getByRole('radio', { name: /A\/B/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    await screen.findByTestId('banc-ab')
    const diff = screen.getByTestId('banc-diff-competences')
    expect(diff.textContent).toContain('Établies seulement par A')
    expect(diff.textContent).toContain('2.01')
    expect(diff.textContent).toContain('Greffier')
  })

  it('le run simple offre un export JSON réimportable comme référence', async () => {
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    render(<BancEssaiSection api={fakeApi()} user={user} deps={fakeDeps(runFn)} />)
    await screen.findByLabelText('Version à tester')
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    await screen.findByTestId('banc-simple')
    const link = screen.getByRole('link', { name: /Télécharger le run/ })
    const url = link.getAttribute('href')
    expect(url).toMatch(/^data:application\/json/)
    const parsed = JSON.parse(decodeURIComponent(url.split(',').slice(1).join(',')))
    expect(parsed.kind).toBe('rapport-run-banc')
    expect(parsed.days[0].iso).toBe('2026-01-05')
  })
})

describe('BancEssaiSection — carnet du banc (D15)', () => {
  function memStorage() {
    const map = new Map()
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
    }
  }

  it('méta-page : rendue en HTML sûr, éditable, persistée', async () => {
    const storage = memStorage()
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    render(
      <BancEssaiSection
        api={fakeApi()}
        user={user}
        deps={{ ...fakeDeps(runFn), carnetStorage: storage }}
      />,
    )
    const carnet = await screen.findByTestId('banc-carnet')
    expect(carnet.textContent).toContain('Carnet du banc')
    fireEvent.click(screen.getByRole('button', { name: 'Modifier la méta-page' }))
    fireEvent.change(screen.getByLabelText('Texte du carnet (markdown)'), {
      target: { value: '# Mon protocole Twin9\n\nComparer **toujours** à la référence.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la méta-page' }))
    expect(carnet.textContent).toContain('Mon protocole Twin9')
    expect(storage.getItem('humanome-banc-carnet')).toContain('Mon protocole Twin9')
  })

  it('température : la virgule décimale française est acceptée', async () => {
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    render(<BancEssaiSection api={fakeApi()} user={user} deps={fakeDeps(runFn)} />)
    await screen.findByLabelText('Version à tester')
    fireEvent.change(screen.getByLabelText('Température'), { target: { value: '0,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    await screen.findByTestId('banc-simple')
    expect(runFn.mock.calls[0][0].temperature).toBe(0.5)
  })

  it('charger une configuration aux références disparues : replis + réserves signalées', async () => {
    const storage = memStorage()
    storage.setItem(
      'humanome-banc-carnet',
      JSON.stringify({
        texte: 'x',
        configs: [
          {
            nom: 'orpheline',
            config: {
              mode: 'simple',
              selA: 'draft:supprime',
              portfolioChoice: '999',
              referentiel: '9.9.9',
            },
          },
        ],
      }),
    )
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    render(
      <BancEssaiSection
        api={fakeApi()}
        user={user}
        deps={{ ...fakeDeps(runFn), carnetStorage: storage }}
      />,
    )
    await screen.findByLabelText('Version à tester')
    fireEvent.click(screen.getByRole('button', { name: 'Charger orpheline' }))
    await screen.findByText(/Configuration chargée avec réserves/)
    // Replis sûrs : version embarquée, fixture, référentiel embarqué.
    expect(screen.getByLabelText('Version à tester').value).toBe('builtin')
    expect(screen.getByLabelText('Portfolio de test').value).toBe('fixture')
    expect(screen.getByLabelText('Version du référentiel').value).toBe('embarque')
  })

  it('mémorise la configuration courante puis la recharge (sans clé API)', async () => {
    const storage = memStorage()
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    render(
      <BancEssaiSection
        api={fakeApi()}
        user={user}
        deps={{ ...fakeDeps(runFn), carnetStorage: storage }}
      />,
    )
    await screen.findByLabelText('Version à tester')
    // Configurer : multi-run + une journée précise, puis mémoriser.
    fireEvent.click(screen.getByRole('radio', { name: /Multi-run/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Une journée/ }))
    fireEvent.change(screen.getByLabelText('Journée'), { target: { value: '2026-01-07' } })
    fireEvent.change(screen.getByLabelText('Nom de la configuration'), {
      target: { value: 'conso-0107' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mémoriser la configuration actuelle' }))
    await screen.findByText(/mémorisée/)
    expect(storage.getItem('humanome-banc-carnet')).toContain('conso-0107')
    // Dériver, puis recharger la configuration emblématique.
    fireEvent.click(screen.getByRole('radio', { name: 'Run simple' }))
    fireEvent.click(screen.getByRole('radio', { name: /Tout le journal/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Charger conso-0107' }))
    expect(screen.getByRole('radio', { name: /Multi-run/ }).checked).toBe(true)
    expect(screen.getByLabelText('Journée').value).toBe('2026-01-07')
  })
})
