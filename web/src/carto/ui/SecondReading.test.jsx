// Seconde lecture (journal D-68) : un run AuroraCore joint à un jeu qui a ses
// analyses par journée se lit avec chaque compétence — la décision du
// président d'abord, puis les traces que ce jury a retenues (sans redire un
// passage déjà listé plus haut), puis ce qui a conduit à la décision — et ne
// change pas le soleil. Sa délibération n'est lue qu'à l'ouverture.
import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import CartoApp from './CartoApp.jsx'
import { matchTraces, readingName } from './SecondReading.jsx'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { importFiles } from '../core/import.js'
import { createDataset } from '../core/model.js'
import { parseHash, subscribe } from '../../router.js'
import { LOU_PORTFOLIO, kairosDoc, louCoreRun, louDays, miniReferential } from '../test/fixtures.js'
import { showCartoTiles } from '../test/tiles.js'

const NOW = '2026-10-13T12:00:00.000Z'

function louFiles() {
  const files = [{ path: 'lou.md', text: LOU_PORTFOLIO }]
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  return files
}

/** Le jeu de Lou, ses journées analysées, puis le run AuroraCore ; les délibérations lues sont notées. */
async function louWithReading({ reading = true } = {}) {
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  let res = await importFiles(louFiles(), createDataset({ datasetId: 'ds-lou', title: 'Lou', referential: miniReferential(), now: NOW }), { now: NOW })
  await store.commit(res)
  if (reading) {
    res = await importFiles(louCoreRun(), res.dataset, { now: NOW })
    await store.commit(res)
  }
  const runReads = []
  const loadRunDetail = store.loadRunDetail
  store.loadRunDetail = (datasetId, key, opts) => {
    runReads.push(key)
    return loadRunDetail(datasetId, key, opts)
  }
  return { store, runReads }
}

function Harness({ store }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => subscribe(setRoute), [])
  return <CartoApp route={route} deps={{ store, loadReferential: async () => ({ doc: miniReferential() }) }} />
}

async function mount(store) {
  render(<Harness store={store} />)
  await screen.findByRole('heading', { name: 'Cartographie' })
}

const sector = (prefix) => document.querySelector(`[data-tile="sun"] .carto-sun [role="button"][aria-label^="${prefix}"]`)
const sunCodes = () => [...document.querySelectorAll('[data-tile="sun"] .carto-sun [role="button"][aria-label]')].map((el) => el.getAttribute('aria-label').slice(0, 4)).filter((c) => /^\d\.\d\d$/.test(c))
const detail = () => document.querySelector('[data-tile="detail"]')

/** Sélectionne un secteur du soleil — de nouveau si l'interface s'est remise à zéro entre-temps (jeu tout juste chargé). */
async function select(prefix) {
  await waitFor(
    () => {
      const el = sector(prefix)
      expect(el).toBeTruthy()
      if (el.getAttribute('aria-pressed') !== 'true') fireEvent.click(el)
      expect(sector(prefix).getAttribute('aria-pressed')).toBe('true')
    },
    { timeout: 3000 },
  )
}
const marks = (root) => [...root.querySelectorAll('.carto-reader-text mark.carto-hl')]

beforeEach(() => {
  window.location.hash = '#/cartographie'
  try {
    localStorage.clear()
    showCartoTiles()
  } catch {
    /* rien */
  }
})
afterEach(cleanup)

describe('seconde lecture : les traces de ce jury, rapprochées de celles des journées', () => {
  const main = [{ date: '2025-12-22', extract: "J'ai vérifié deux sources contradictoires avant de conclure sur la date du chantier." }]
  it('le même passage, le même jour (l’un contient l’autre, à la typographie près) : rapproché ; un autre jour, non', () => {
    const got = matchTraces(
      [
        { date: '2025-12-22', role: 'preuve', extract: 'vérifié deux sources contradictoires avant de conclure' },
        { date: '2025-12-23', role: 'preuve', extract: 'vérifié deux sources contradictoires avant de conclure' },
        { date: '2025-12-22', role: 'indice', extract: 'J’ai vérifié deux sources contradictoires avant de conclure sur la date du chantier. Puis la maquette.' },
      ],
      main,
    )
    expect(got.map((t) => t.same)).toEqual([{ date: '2025-12-22' }, null, { date: '2025-12-22' }])
  })
  it('un extrait trop court pour être sûr n’est jamais rapproché', () => {
    expect(matchTraces([{ date: '2025-12-22', role: 'indice', extract: 'deux sources' }], main)[0].same).toBeNull()
    expect(matchTraces([{ date: '2025-12-22', role: 'indice', extract: '' }], main)[0].same).toBeNull()
  })
  it('son nom dit le jury et la date de l’analyse', () => {
    expect(readingName({ source: 'aurora-core', analysedAt: '2026-04-25' })).toBe('jury AuroraCore du 25 avril 2026')
    expect(readingName({ source: 'autre', analysedAt: null })).toBe('jury autre')
  })
})

describe('seconde lecture dans le panneau de détail', () => {
  it('le soleil ne change pas : une compétence que seule la seconde lecture retient n’y entre pas', async () => {
    const { store } = await louWithReading({ reading: false })
    await mount(store)
    await waitFor(() => expect(sunCodes().length).toBeGreaterThan(0))
    const without = sunCodes()
    cleanup()
    await mount((await louWithReading()).store)
    await waitFor(() => expect(sunCodes()).toEqual(without))
    expect(without).not.toContain('2.02')
  })

  it('une compétence : sa ligne, repliée ; dépliée, la décision du président d’abord, les traces de ce jury, puis ce qui y a conduit', async () => {
    const { store, runReads } = await louWithReading()
    await mount(store)
    await select('1.01 ')
    const section = await within(detail()).findByRole('region', { name: 'Seconde lecture' }, { timeout: 3000 })
    const item = section.querySelector('details.carto-second-reading')
    expect(item.querySelector('summary').textContent).toBe('Jury AuroraCore du 25 avril 2026 : présence établie · confiance 0,75 · 1 preuve, 1 indice')
    // Repliée : la délibération n'est pas lue.
    await new Promise((r) => setTimeout(r, 30))
    expect(runReads).not.toContain('LOU@2026-04-25|1.01')
    expect(within(section).queryByText(/vérification méthodique/)).toBeNull()

    fireEvent.click(item.querySelector('summary'))
    const decision = await within(section).findByRole('region', { name: 'Décision du président' })
    expect(runReads).toContain('LOU@2026-04-25|1.01')
    expect(within(decision).getByText('Le jury retient une vérification méthodique, sur tout le journal.')).toBeTruthy()
    expect(within(decision).getByText('Raconter une erreur corrigée.')).toBeTruthy()
    // La décision se lit sans rien déplier de plus.
    expect(decision.closest('details')).toBe(item)
    expect(within(section).getByText('5 voix pour la présence, 1 non établie, 0 sans éclairage · sans consensus')).toBeTruthy()

    // Les traces de ce jury : la première est le passage déjà listé plus haut (22 déc.), elle ne le redit pas.
    const traces = within(section).getByText('Traces retenues par ce jury').closest('details')
    const items = [...traces.querySelectorAll('li.carto-trace')]
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toBe('lun. 22 déc. 2025preuveLe même passage qu’une trace listée plus haut.Ouvrir dans le portfolio')
    expect(items[0].querySelector('blockquote')).toBeNull()
    expect(items[1].querySelector('blockquote').textContent).toBe("J'ai noté chaque modification dans un tableau.")

    // Ce qui a conduit à la décision, en dessous, repliable.
    const summaries = [...section.querySelectorAll('details.carto-jury-section > summary')].map((s) => s.textContent)
    expect(summaries).toEqual(['Traces retenues par ce jury', 'Éclairages des voix', 'Raisonnement du président'])
    expect(within(section).getByText('Le Sociologue doute du contexte.')).toBeTruthy()
    expect(within(section).getByText('Le vocabulaire du doute est précis.')).toBeTruthy()

    // Une trace de ce jury s'ouvre dans le portfolio, surlignée dans sa journée.
    fireEvent.click(within(items[1]).getByRole('button', { name: 'Ouvrir dans le portfolio' }))
    const reader = await screen.findByRole('region', { name: 'mercredi 24 décembre 2025' })
    await waitFor(() => expect(marks(reader).map((m) => m.textContent).join('')).toMatch(/^J'ai noté chaque modification dans un tableau\.?$/))
  })

  it('une compétence que cette lecture n’a pas jugée : pas de section', async () => {
    const { store } = await louWithReading()
    await mount(store)
    await select('3.02 ')
    await within(detail()).findByRole('region', { name: 'Verdicts par journée' }, { timeout: 3000 })
    expect(within(detail()).queryByRole('region', { name: 'Seconde lecture' })).toBeNull()
  })

  it('un pôle : le rapport de la seconde lecture, lu à l’ouverture', async () => {
    const { store, runReads } = await louWithReading()
    await mount(store)
    await select('Pôle TÊTE')
    const reports = await within(detail()).findByRole('region', { name: 'Rapports du pôle' }, { timeout: 3000 })
    const summary = within(reports).getByText('Rapport de pôle — seconde lecture, jury AuroraCore du 25 avril 2026 (porte sur tout le journal)')
    await new Promise((r) => setTimeout(r, 30))
    expect(runReads).not.toContain('LOU@2026-04-25|pole:1')
    fireEvent.click(summary)
    await within(reports).findByText('Le doute méthodique traverse tout le journal.')
    expect(runReads).toContain('LOU@2026-04-25|pole:1')
  })
})
