// UC-CAR-06 — Comparer des versions de cartographie : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-06-comparer-versions.md
//
// L'application ENTIÈRE (<App/>) est ouverte sur #/cartographe/comparer : le
// cartographe choisit deux cartographies d'un même apprenant (par exemple
// deux versions de prompts sur le même portfolio), voit deux sunbursts et le
// tableau des divergences surlignées. Réseau simulé (fetch global) aux formes
// réelles de l'API ; sunburst = faux module de test.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { resetApiClient } from '../../../src/api/client.js'
import {
  dayDoc,
  detailBody,
  jsonResponse,
  mergeDoc,
  openCartographe,
  queueEntry,
  stubNetwork,
} from '../support/car.js'

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  window.location.hash = ''
  resetApiClient()
})

const MAYA = { id: 1, displayName: 'Maya' }
const NOE = { id: 2, displayName: 'Noé' }

const dayComp = (doc, code) => doc.poles.flatMap((p) => p.competences).find((c) => c.code === code)

/** Deux versions de prompt de la même journée : 1.03 tranchée différemment. */
function versionB() {
  const doc = dayDoc()
  dayComp(doc, '1.03').verdict.statut = 'présence établie'
  dayComp(doc, '1.03').verdict.confiance = 0.8
  return doc
}

function entries(list) {
  return list.map((e) => queueEntry(e))
}

/** File + détails à la demande ; `docs` : id -> document. */
function network(queue, docs, extra = {}) {
  const routes = { 'GET api/cartographe/cartographies': jsonResponse(200, entries(queue)), ...extra }
  for (const entry of queue) {
    if (docs[entry.id]) {
      routes[`GET api/cartographe/cartographies/${entry.id}`] = jsonResponse(
        200,
        detailBody({ ...entry, document: docs[entry.id] }),
      )
    }
  }
  return stubNetwork(routes)
}

const QUEUE = [
  { id: 21, titre: 'Prompt v1', apprenant: MAYA, createdAt: '2026-07-02T10:00:00' },
  { id: 22, titre: 'Prompt v2', apprenant: MAYA, createdAt: '2026-07-03T10:00:00' },
  { id: 23, titre: 'Feuille de Noé', apprenant: NOE, createdAt: '2026-07-03T11:00:00' },
]

async function choose(first, second) {
  fireEvent.change(await screen.findByLabelText('Cartographie 1'), { target: { value: String(first) } })
  if (second !== undefined) {
    fireEvent.change(screen.getByLabelText('Cartographie 2 (même apprenant)'), { target: { value: String(second) } })
  }
}

function row(code) {
  return within(screen.getByTestId('compare-table'))
    .getAllByRole('row')
    .find((tr) => tr.querySelector('th')?.textContent === code)
}

describe('UC-CAR-06 — comparer deux cartographies d’un même apprenant', () => {
  it('UC-CAR-06-F01 — nominal : sélection contrainte, deux sunbursts, divergences surlignées', async () => {
    const net = network(QUEUE, { 21: dayDoc(), 22: versionB() })
    const { container } = openCartographe('comparer')

    // 1-2. Sélecteurs : la seconde liste attend la première, puis se limite à Maya.
    const selectB = await screen.findByLabelText('Cartographie 2 (même apprenant)')
    expect(selectB.disabled).toBe(true)
    const optionsA = within(screen.getByLabelText('Cartographie 1')).getAllByRole('option').map((o) => o.textContent)
    expect(optionsA).toContain('Maya · Prompt v1 — Journée du 02/07/2026')
    await choose(21)
    expect(selectB.disabled).toBe(false)
    expect(within(selectB).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '— choisir —',
      'Prompt v2 — Journée du 03/07/2026',
    ])
    await choose(21, 22)

    // 3. Documents chargés à la demande, seulement ceux sélectionnés.
    await screen.findByTestId('compare-diagrams')
    await waitFor(() => expect(container.querySelectorAll('svg.sunburst')).toHaveLength(2))
    const captions = [...container.querySelectorAll('figcaption')].map((f) => f.textContent)
    expect(captions).toEqual(['Prompt v1 — Journée du 02/07/2026', 'Prompt v2 — Journée du 03/07/2026'])
    expect(net.called('GET api/cartographe/cartographies/21').length).toBeGreaterThan(0)
    expect(net.called('GET api/cartographe/cartographies/22').length).toBeGreaterThan(0)
    expect(net.called('GET api/cartographe/cartographies/23')).toHaveLength(0) // Noé : jamais chargé
    // RG4 : uniquement des lectures — session, référentiel publié, file, les deux documents.
    expect(net.calls.every((call) => call.key.startsWith('GET '))).toBe(true)
    const allowed = /^GET (api\/auth\/me|api\/cartographe\/cartographies(\/2[12])?|data\/referentiel\/.+)$/
    expect(net.calls.filter((call) => !allowed.test(call.key))).toEqual([])

    // 4. Tableau : résumé, ligne surlignée, cellules divergentes.
    expect(screen.getByTestId('compare-summary').textContent).toBe('1 compétence(s) divergente(s) sur 15 comparée(s).')
    const divergente = row('1.03')
    expect(divergente.getAttribute('data-divergent')).toBe('true')
    expect(divergente.className).toBe('compare-divergent')
    const cells = within(divergente).getAllByRole('cell')
    expect(cells.map((td) => td.textContent)).toEqual([
      'renvoi au cartographe / présence établie',
      '— / —',
      '— / —',
      '40 % / 80 %',
    ])
    expect(cells.map((td) => td.className)).toEqual(['compare-champ-divergent', '', '', 'compare-champ-divergent'])
    expect(row('2.01').getAttribute('data-divergent')).toBe('false')
  })

  it('UC-CAR-06-F02 — A1 : deux parcours (merge) → niveau, points et confiance moyenne comparés et surlignés', async () => {
    const b = mergeDoc()
    const mc = (code) => b.domains.flatMap((d) => d.competences).find((x) => x.code === code)
    const c = mc('1.01')
    c.niveau = 3
    c.points = 9
    mc('3.04').confiance_moyenne = 0.5 // 60 % → 50 %
    mc('2.01').confiance_moyenne = 0.74 // 0.7433 → 0.74 : divergence stricte, même affichage (Limites)
    network(
      [
        { id: 31, titre: 'Parcours v1', type: 'merge', apprenant: MAYA },
        { id: 32, titre: 'Parcours v2', type: 'merge', apprenant: MAYA },
      ],
      { 31: mergeDoc(), 32: b },
    )
    openCartographe('comparer')
    await choose(31, 32)

    expect((await screen.findByTestId('compare-summary')).textContent).toBe('3 compétence(s) divergente(s) sur 10 comparée(s).')
    const cells = within(row('1.01')).getAllByRole('cell')
    expect(cells.map((td) => td.textContent)).toEqual(['présence établie / présence établie', '1 / 3', '1 / 9', '62 % / 62 %'])
    expect(cells.map((td) => td.className)).toEqual(['', 'compare-champ-divergent', 'compare-champ-divergent', ''])
    const confiance = (code) => within(row(code)).getAllByRole('cell')[3]
    expect(confiance('3.04').textContent).toBe('60 % / 50 %')
    expect(confiance('3.04').className).toBe('compare-champ-divergent')
    expect(confiance('2.01').textContent).toBe('74 % / 74 %') // surlignée alors que l'affichage est identique
    expect(confiance('2.01').className).toBe('compare-champ-divergent')
  })

  it('UC-CAR-06-F03 — A3 : deux versions identiques → aucune divergence', async () => {
    network(QUEUE, { 21: dayDoc(), 22: dayDoc() })
    openCartographe('comparer')
    await choose(21, 22)

    expect((await screen.findByTestId('compare-summary')).textContent).toBe('0 compétence(s) divergente(s) sur 15 comparée(s).')
    expect(screen.getByTestId('compare-table').querySelectorAll('tr[data-divergent="true"]')).toHaveLength(0)
  })

  it('UC-CAR-06-F04 — A4 : compétence instruite d’un seul côté → ligne divergente, « — » en face', async () => {
    const b = dayDoc()
    b.poles[6].competences = b.poles[6].competences.filter((c) => c.code !== '7.03')
    network(QUEUE, { 21: dayDoc(), 22: b })
    openCartographe('comparer')
    await choose(21, 22)

    await screen.findByTestId('compare-summary')
    const cells = within(row('7.03')).getAllByRole('cell').map((td) => td.textContent)
    expect(cells[0]).toBe('présence non établie / —')
    expect(cells[3]).toBe('100 % / —')
    expect(row('7.03').getAttribute('data-divergent')).toBe('true')
  })

  it('UC-CAR-06-F05 — A2 / limite : journée contre parcours → niveau et points signalés divergents', async () => {
    network(
      [
        { id: 21, titre: 'Journée', apprenant: MAYA },
        { id: 33, titre: 'Parcours', type: 'merge', apprenant: MAYA },
      ],
      { 21: dayDoc(), 33: mergeDoc() },
    )
    openCartographe('comparer')
    await choose(21, 33)

    await screen.findByTestId('compare-summary')
    const cells = within(row('2.01')).getAllByRole('cell')
    expect(cells[0].textContent).toBe('présence établie / présence établie')
    expect(cells[1].textContent).toBe('— / 5')
    expect(cells[1].className).toBe('compare-champ-divergent')
    expect(cells[2].textContent).toBe('— / 3')
    expect(cells[2].className).toBe('compare-champ-divergent')
  })

  it('UC-CAR-06-F06 — A5 : changer la cartographie 1 réinitialise la 2 ; un document déjà chargé n’est pas redemandé', async () => {
    const net = network(QUEUE, { 21: dayDoc(), 22: versionB() })
    openCartographe('comparer')
    await choose(21, 22)
    await screen.findByTestId('compare-summary')
    const loaded = net.calls.length

    await choose(22)
    expect(screen.getByLabelText('Cartographie 2 (même apprenant)').value).toBe('')
    expect(screen.queryByTestId('compare-table')).toBeNull()

    fireEvent.change(screen.getByLabelText('Cartographie 2 (même apprenant)'), { target: { value: '21' } })
    expect((await screen.findByTestId('compare-summary')).textContent).toContain('1 compétence(s) divergente(s)')
    expect(net.calls.length).toBe(loaded) // documents servis depuis le cache de la section
  })
})

describe('UC-CAR-06 — erreurs', () => {
  it('UC-CAR-06-F07 — E1 : la file ne se charge pas → message, sélecteurs vides', async () => {
    stubNetwork({ 'GET api/cartographe/cartographies': jsonResponse(500, { error: 'Erreur interne' }) })
    openCartographe('comparer')

    expect((await screen.findByRole('alert')).textContent).toBe('Erreur interne')
    expect(within(screen.getByLabelText('Cartographie 1')).getAllByRole('option')).toHaveLength(1)
    const selectB = screen.getByLabelText('Cartographie 2 (même apprenant)')
    expect(within(selectB).getAllByRole('option')).toHaveLength(1)
    expect(selectB.disabled).toBe(true)
  })

  it('UC-CAR-06-F08 — E2 : un document devient inaccessible (404) → message, pas de tableau', async () => {
    network(QUEUE, { 21: dayDoc() }, {
      'GET api/cartographe/cartographies/22': jsonResponse(404, { error: 'Cartographie introuvable' }),
    })
    openCartographe('comparer')
    await choose(21, 22)

    expect((await screen.findByRole('alert')).textContent).toBe('Cartographie introuvable')
    expect(screen.getByText('Chargement des documents…')).toBeTruthy()
    expect(screen.queryByTestId('compare-table')).toBeNull()
  })

  it('UC-CAR-06-F09 — E3 : un seul document par apprenant → aucune seconde cartographie proposée', async () => {
    network([QUEUE[0], QUEUE[2]], {})
    openCartographe('comparer')
    await choose(23)

    expect(within(screen.getByLabelText('Cartographie 2 (même apprenant)')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '— choisir —',
    ])
  })

  it('UC-CAR-06-F10 — E4 : sans le rôle cartographe, la section est réservée et la file n’est pas lue', async () => {
    const apprenant = { id: 3, displayName: 'Zoé', roles: ['apprenant'] }
    const net = stubNetwork({}, { user: apprenant })
    openCartographe('comparer', apprenant)

    expect(await screen.findByTestId('cartographe-reserve')).toBeTruthy()
    expect(screen.queryByLabelText('Cartographie 1')).toBeNull()
    expect(net.calls.some((call) => call.key.includes('api/cartographe/'))).toBe(false)
  })

  it('UC-CAR-06-F12 — E2 (AN18) : après un 404, une comparaison réussie s’affiche sous l’alerte périmée (état ACTUEL)', async () => {
    let doc22Calls = 0
    network(QUEUE, { 21: dayDoc() }, {
      // 22 : inaccessible au premier appel, rouvert ensuite.
      'GET api/cartographe/cartographies/22': () =>
        ++doc22Calls === 1
          ? jsonResponse(404, { error: 'Cartographie introuvable' })
          : jsonResponse(200, detailBody({ ...QUEUE[1], document: versionB() })),
    })
    openCartographe('comparer')
    await choose(21, 22)
    expect((await screen.findByRole('alert')).textContent).toBe('Cartographie introuvable')

    // Nouvelle paire : 22 (rechargé, 200) puis 21 (en cache).
    await choose(22, 21)

    expect((await screen.findByTestId('compare-summary')).textContent).toBe('1 compétence(s) divergente(s) sur 15 comparée(s).')
    // Comportement actuel : loadError n'est jamais remis à zéro.
    expect(screen.getByRole('alert').textContent).toBe('Cartographie introuvable')
  })
})

describe('UC-CAR-06 — compétence instruite d’un seul côté, sens inverse', () => {
  it('UC-CAR-06-F11 — A4 : compétence absente de la cartographie 1 → « — » à gauche, ligne divergente', async () => {
    const a = dayDoc()
    a.poles[6].competences = a.poles[6].competences.filter((c) => c.code !== '7.03')
    network(QUEUE, { 21: a, 22: dayDoc() })
    openCartographe('comparer')
    await choose(21, 22)

    expect((await screen.findByTestId('compare-summary')).textContent).toBe('1 compétence(s) divergente(s) sur 15 comparée(s).')
    const cells = within(row('7.03')).getAllByRole('cell').map((td) => td.textContent)
    expect(cells[0]).toBe('— / présence non établie')
    expect(cells[3]).toBe('— / 100 %')
    expect(row('7.03').getAttribute('data-divergent')).toBe('true')
  })
})
