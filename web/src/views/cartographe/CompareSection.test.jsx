// Comparaison côte à côte (P9.4) : sélecteurs contraints au même apprenant,
// deux sunbursts, tableau des divergences surlignées.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import CompareSection from './CompareSection.jsx'
import { resetApiClient } from '../../api/client.js'
import * as fakeLib from '../../test/fake-sunburst-lib.js'
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

// Second run : même journée, verdict 1.01 divergent.
const runB = JSON.parse(JSON.stringify(dayFixture))
runB.poles[0].competences.find((c) => c.code === '1.01').verdict.statut = 'présence établie'

const QUEUE = {
  cartographies: [
    { id: 21, titre: 'Run prompt v1', type: 'jour', apprenant: { id: 1, displayName: 'Maya' }, createdAt: '2026-07-02' },
    { id: 22, titre: 'Run prompt v2', type: 'jour', apprenant: { id: 1, displayName: 'Maya' }, createdAt: '2026-07-03' },
    { id: 23, titre: 'Autre élève', type: 'jour', apprenant: { id: 2, displayName: 'Noé' }, createdAt: '2026-07-03' },
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

describe('CompareSection', () => {
  it('contraint la seconde cartographie au même apprenant', async () => {
    const fetchFn = routedFetch({ 'GET api/cartographe/cartographies': jsonResponse(200, QUEUE) })
    render(<CompareSection lib={fakeLib} fetchFn={fetchFn} getReferentiel={getReferentiel} />)

    const selectA = await screen.findByLabelText('Cartographie 1')
    fireEvent.change(selectA, { target: { value: '21' } })

    const selectB = screen.getByLabelText('Cartographie 2 (même apprenant)')
    const options = within(selectB).getAllByRole('option').map((o) => o.textContent)
    expect(options.join(' ')).toContain('Run prompt v2')
    expect(options.join(' ')).not.toContain('Autre élève')
  })

  it('affiche deux sunbursts et le tableau des divergences surlignées', async () => {
    const fetchFn = routedFetch({
      'GET api/cartographe/cartographies': jsonResponse(200, QUEUE),
      'GET api/cartographe/cartographies/21': detail(21, dayFixture),
      'GET api/cartographe/cartographies/22': detail(22, runB),
    })
    const { container } = render(
      <CompareSection lib={fakeLib} fetchFn={fetchFn} getReferentiel={getReferentiel} />,
    )

    fireEvent.change(await screen.findByLabelText('Cartographie 1'), { target: { value: '21' } })
    fireEvent.change(screen.getByLabelText('Cartographie 2 (même apprenant)'), {
      target: { value: '22' },
    })

    // Deux diagrammes côte à côte.
    await screen.findByTestId('compare-diagrams')
    await waitFor(() => expect(container.querySelectorAll('svg.sunburst')).toHaveLength(2))

    // Tableau des divergences : 1.01 surlignée, résumé correct.
    const summary = await screen.findByTestId('compare-summary')
    expect(summary.textContent).toContain('1 compétence(s) divergente(s)')

    const table = screen.getByTestId('compare-table')
    const divergentes = table.querySelectorAll('tr[data-divergent="true"]')
    expect(divergentes).toHaveLength(1)
    expect(divergentes[0].textContent).toContain('1.01')
    expect(divergentes[0].textContent).toContain('présence non établie / présence établie')
    expect(divergentes[0].querySelector('.compare-champ-divergent')).toBeTruthy()
  })
})
