// Consistance multi-run (P9.4, cahier §3.3) : sélection de N documents jour
// depuis la file, analyse engine compareRuns, rendu lisible (accord global,
// stables/divergentes avec badges, tableau détaillé).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ConsistanceSection from './ConsistanceSection.jsx'
import { resetApiClient } from '../../api/client.js'
import dayFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import referentielFixture from '../../../../schemas/fixtures/referentiel-respire-v7.json'

afterEach(() => {
  cleanup()
  resetApiClient()
})

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

function routedFetch(routes) {
  return vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const handler = routes[key]
    if (!handler) throw new Error(`route non mockée : ${key}`)
    return typeof handler === 'function' ? handler(init) : handler
  })
}

const getReferentiel = async () => referentielFixture

// Run 2 : même journée, verdict 1.01 divergent (établie au lieu de non établie).
const runB = JSON.parse(JSON.stringify(dayFixture))
runB.poles[0].competences.find((c) => c.code === '1.01').verdict.statut = 'présence établie'

const QUEUE = {
  cartographies: [
    { id: 31, titre: 'Run 1', type: 'jour', apprenant: { id: 1, displayName: 'Maya' }, createdAt: '2026-07-02' },
    { id: 32, titre: 'Run 2', type: 'jour', apprenant: { id: 1, displayName: 'Maya' }, createdAt: '2026-07-03' },
    { id: 33, titre: 'Parcours', type: 'merge', apprenant: { id: 1, displayName: 'Maya' }, createdAt: '2026-07-03' },
  ],
}

function detail(id, document) {
  return jsonResponse(200, {
    cartographie: { ...QUEUE.cartographies.find((e) => e.id === id), document },
    annotations: [],
    revisions: [],
    garantie: null,
  })
}

describe('ConsistanceSection', () => {
  it('ne propose que les documents de journée, et exige au moins 2 sélections', async () => {
    const fetchFn = routedFetch({ 'GET api/cartographe/cartographies': jsonResponse(200, QUEUE) })
    render(<ConsistanceSection fetchFn={fetchFn} getReferentiel={getReferentiel} />)

    const list = await screen.findByTestId('consistance-queue')
    expect(list.textContent).toContain('Run 1')
    expect(list.textContent).not.toContain('Parcours') // merge exclu

    const button = screen.getByRole('button', { name: /Analyser la consistance/ })
    expect(button.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText(/Run 1/))
    expect(screen.getByRole('button', { name: /Analyser la consistance/ }).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText(/Run 2/))
    expect(screen.getByRole('button', { name: /Analyser la consistance/ }).disabled).toBe(false)
  })

  it('analyse 2 runs et rend le rapport : accord global, divergentes, tableau', async () => {
    const fetchFn = routedFetch({
      'GET api/cartographe/cartographies': jsonResponse(200, QUEUE),
      'GET api/cartographe/cartographies/31': detail(31, dayFixture),
      'GET api/cartographe/cartographies/32': detail(32, runB),
    })
    render(<ConsistanceSection fetchFn={fetchFn} getReferentiel={getReferentiel} />)

    await screen.findByTestId('consistance-queue')
    fireEvent.click(screen.getByLabelText(/Run 1/))
    fireEvent.click(screen.getByLabelText(/Run 2/))
    fireEvent.click(screen.getByRole('button', { name: /Analyser la consistance/ }))

    const rapport = await screen.findByTestId('consistance-rapport')
    expect(rapport.textContent).toContain('2 runs')

    // Accord global < 100 % (une divergence de statut).
    const accord = screen.getByTestId('consistance-accord')
    expect(accord.textContent).toMatch(/Accord global/)
    expect(accord.textContent).not.toContain('100 %')

    // 1.01 divergente, avec badges par statut et nom du référentiel.
    const divergentes = screen.getByTestId('consistance-divergentes')
    expect(divergentes.textContent).toContain('1.01')
    expect(divergentes.textContent).toContain('Pensée Critique')
    expect(divergentes.querySelector('.verdict-badge.etablie')).toBeTruthy()
    expect(divergentes.querySelector('.verdict-badge.non-etablie')).toBeTruthy()

    // Tableau détaillé : une colonne par run, ligne 1.01 marquée instable.
    const table = screen.getByTestId('consistance-table')
    expect(table.querySelectorAll('thead th')).toHaveLength(4) // compétence + 2 runs + écart-type
    const unstable = [...table.querySelectorAll('tbody tr[data-stable="false"]')]
    expect(unstable.some((row) => row.textContent.includes('1.01'))).toBe(true)
  })

  it('refuse un fichier local qui ne respecte pas le schéma cartographie-jour', async () => {
    const fetchFn = routedFetch({
      'GET api/cartographe/cartographies': jsonResponse(200, { cartographies: [] }),
    })
    render(<ConsistanceSection fetchFn={fetchFn} getReferentiel={getReferentiel} />)

    const input = await screen.findByLabelText(/fichiers locaux/)
    const bad = new File(['{"kind":"autre"}'], 'mauvais.json', { type: 'application/json' })
    bad.text = async () => '{"kind":"autre"}' // jsdom ne fournit pas File.text
    fireEvent.change(input, { target: { files: [bad] } })

    await screen.findByText(/ne respecte pas le schéma cartographie-jour/)
  })

  it('accepte des fichiers locaux valides et les compte dans la sélection', async () => {
    const fetchFn = routedFetch({
      'GET api/cartographe/cartographies': jsonResponse(200, { cartographies: [] }),
    })
    render(<ConsistanceSection fetchFn={fetchFn} getReferentiel={getReferentiel} />)

    const input = await screen.findByLabelText(/fichiers locaux/)
    const mk = (name, doc) => {
      const file = new File([JSON.stringify(doc)], name, { type: 'application/json' })
      file.text = async () => JSON.stringify(doc)
      return file
    }
    fireEvent.change(input, {
      target: { files: [mk('run-a.json', dayFixture), mk('run-b.json', runB)] },
    })

    const locaux = await screen.findByTestId('consistance-locaux')
    expect(locaux.textContent).toContain('run-a.json')
    expect(locaux.textContent).toContain('run-b.json')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Analyser la consistance/ }).disabled).toBe(false),
    )

    fireEvent.click(screen.getByRole('button', { name: /Analyser la consistance/ }))
    await screen.findByTestId('consistance-rapport')
  })
})
