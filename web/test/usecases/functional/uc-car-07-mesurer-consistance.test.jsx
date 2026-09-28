// UC-CAR-07 — Mesurer la consistance multi-run : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-07-mesurer-consistance.md
//
// L'application ENTIÈRE (<App/>) est ouverte sur #/cartographe/consistance :
// le cartographe sélectionne N runs de la même journée (depuis sa file et/ou
// des fichiers locaux), lance l'analyse (engine compareRuns, dans le
// navigateur) et lit le rapport. Réseau simulé (fetch global) aux formes
// réelles de l'API ; fichiers locaux simulés (jsdom n'implémente pas File.text).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
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

const ETABLIE = 'présence établie'
const RENVOI = 'renvoi au cartographe'

function withStatut(doc, code, statut) {
  for (const pole of doc.poles) {
    for (const comp of pole.competences) if (comp.code === code) comp.verdict.statut = statut
  }
  return doc
}

function localFile(name, content) {
  const text = typeof content === 'string' ? content : JSON.stringify(content)
  const file = new File([text], name, { type: 'application/json' })
  file.text = async () => text
  return file
}

const QUEUE = [
  queueEntry({ id: 31, titre: 'Run 1', createdAt: '2026-07-02T10:00:00' }),
  queueEntry({ id: 32, titre: 'Run 2', createdAt: '2026-07-03T10:00:00' }),
  queueEntry({ id: 33, titre: 'Parcours', type: 'merge', createdAt: '2026-07-03T11:00:00' }),
]

function network(docs = {}, queue = QUEUE, extra = {}) {
  const routes = { 'GET api/cartographe/cartographies': jsonResponse(200, queue), ...extra }
  for (const [id, document] of Object.entries(docs)) {
    routes[`GET api/cartographe/cartographies/${id}`] = jsonResponse(200, detailBody({ id: Number(id), document }))
  }
  return stubNetwork(routes)
}

function analyseButton() {
  return screen.getByRole('button', { name: /Analyser la consistance/ })
}

async function analyse() {
  await act(async () => {
    fireEvent.click(analyseButton())
  })
}

async function addFiles(...files) {
  const input = await screen.findByLabelText(/fichiers locaux/)
  await act(async () => {
    fireEvent.change(input, { target: { files } })
  })
}

describe('UC-CAR-07 — rapport de consistance', () => {
  it('UC-CAR-07-F01 — nominal : deux runs de la file → accord, stables, divergentes nommées, tableau par run', async () => {
    const net = network({ 31: dayDoc(), 32: withStatut(dayDoc(), '1.01', ETABLIE) })
    openCartographe('consistance')

    // 1. La file ne propose que les journées.
    const list = await screen.findByTestId('consistance-queue')
    expect(within(list).getAllByRole('checkbox')).toHaveLength(2)
    expect(list.textContent).toContain('Run 1 — Maya · 02/07/2026')
    expect(list.textContent).not.toContain('Parcours')
    expect(analyseButton().textContent).toBe('Analyser la consistance (0 document(s))')
    expect(analyseButton().disabled).toBe(true)

    // 2. Sélection de deux runs.
    fireEvent.click(screen.getByLabelText(/Run 1/))
    fireEvent.click(screen.getByLabelText(/Run 2/))
    expect(analyseButton().textContent).toBe('Analyser la consistance (2 document(s))')

    // 3-4. Analyse locale et rapport.
    await analyse()
    expect(net.called('GET api/cartographe/cartographies/31')).toHaveLength(1)
    expect(net.called('GET api/cartographe/cartographies/32')).toHaveLength(1)
    const rapport = await screen.findByTestId('consistance-rapport')
    expect(within(rapport).getByRole('heading', { name: '2. Rapport (2 runs)' })).toBeTruthy()
    expect(screen.getByTestId('consistance-accord').textContent).toBe(
      'Accord global : 93 % (distance structurelle 0.067).',
    )
    expect(within(rapport).getByRole('heading', { name: /Compétences stables .* — 4$/ })).toBeTruthy()
    const divergentes = screen.getByTestId('consistance-divergentes')
    expect(divergentes.textContent).toContain('1.01 — Pensée Critique & Anti-Hallucination')
    expect(divergentes.textContent).toContain('présence non établie (run 1)')
    expect(divergentes.textContent).toContain('présence établie (run 2)')

    const table = screen.getByTestId('consistance-table')
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'Compétence', 'Run 1', 'Run 2', 'Écart-type confiance',
    ])
    expect(table.querySelectorAll('tbody tr')).toHaveLength(15)
    const ligne = [...table.querySelectorAll('tbody tr')].find((tr) => tr.textContent.startsWith('1.01'))
    expect(ligne.getAttribute('data-stable')).toBe('false')
    expect(ligne.querySelectorAll('td')[0].textContent).toBe('présence non établie 100 %')
    expect(ligne.querySelectorAll('td')[2].textContent).toBe('0.000')
    expect(net.calls.some((call) => call.key.startsWith('POST'))).toBe(false)
  })

  it('UC-CAR-07-F02 — A1 : runs 100 % locaux (fichiers JSON validés) → rapport, aucun envoi au serveur', async () => {
    const net = network({}, [])
    openCartographe('consistance')
    expect(await screen.findByText('Aucune cartographie de journée dans votre file.')).toBeTruthy()

    await addFiles(localFile('run-a.json', dayDoc()), localFile('run-b.json', withStatut(dayDoc(), '1.03', ETABLIE)))

    const locaux = screen.getByTestId('consistance-locaux')
    expect(locaux.textContent).toContain('run-a.json (journée du 2026-01-05)')
    expect(analyseButton().textContent).toBe('Analyser la consistance (2 document(s))')
    await analyse()

    expect(await screen.findByTestId('consistance-rapport')).toBeTruthy()
    expect(screen.getByTestId('consistance-divergentes').textContent).toContain('1.03')
    expect(net.calls.filter((call) => call.key.includes('api/cartographe/cartographies/'))).toHaveLength(0)
    expect(net.calls.some((call) => call.key.startsWith('POST') || call.key.startsWith('PUT'))).toBe(false)
  })

  it('UC-CAR-07-F03 — A2/A3 : file + fichier local ; retirer un document masque le rapport', async () => {
    network({ 31: dayDoc() })
    openCartographe('consistance')
    fireEvent.click(await screen.findByLabelText(/Run 1/))
    await addFiles(localFile('run-local.json', withStatut(dayDoc(), '2.01', RENVOI)))
    expect(analyseButton().textContent).toBe('Analyser la consistance (2 document(s))')

    await analyse()
    expect(await screen.findByTestId('consistance-rapport')).toBeTruthy()

    fireEvent.click(within(screen.getByTestId('consistance-locaux')).getByRole('button', { name: 'Retirer' }))
    expect(screen.queryByTestId('consistance-rapport')).toBeNull()
    expect(analyseButton().textContent).toBe('Analyser la consistance (1 document(s))')
    expect(analyseButton().disabled).toBe(true)
  })

  it('UC-CAR-07-F04 — A4 : trois runs → une colonne par run, runs groupés par statut', async () => {
    network({}, [])
    openCartographe('consistance')
    await addFiles(
      localFile('r1.json', withStatut(dayDoc(), '1.03', ETABLIE)),
      localFile('r2.json', dayDoc()),
      localFile('r3.json', withStatut(dayDoc(), '1.03', ETABLIE)),
    )
    await analyse()

    expect(within(await screen.findByTestId('consistance-rapport')).getByRole('heading', { name: '2. Rapport (3 runs)' })).toBeTruthy()
    expect(screen.getByTestId('consistance-table').querySelectorAll('thead th')).toHaveLength(5)
    const divergentes = screen.getByTestId('consistance-divergentes').textContent
    expect(divergentes).toContain('présence établie (runs 1, 3)')
    expect(divergentes).toContain('renvoi au cartographe (run 2)')
  })
})

describe('UC-CAR-07 — erreurs', () => {
  it('UC-CAR-07-F05 — E1 : fichier illisible ou hors schéma → message, fichier ignoré', async () => {
    network({}, [])
    openCartographe('consistance')

    await addFiles(localFile('casse.json', '{ pas du json'))
    expect((await screen.findByRole('alert')).textContent).toBe('« casse.json » n’est pas un fichier JSON valide.')

    await addFiles(localFile('parcours.json', mergeDoc()))
    expect((await screen.findByRole('alert')).textContent).toBe(
      '« parcours.json » ne respecte pas le schéma cartographie-jour : fichier ignoré.',
    )
    expect(screen.queryByTestId('consistance-locaux')).toBeNull()
    expect(analyseButton().disabled).toBe(true)
  })

  it('UC-CAR-07-F06 — E2 : document de la file qui n’est pas une journée → analyse refusée', async () => {
    network({ 31: mergeDoc(), 32: dayDoc() })
    openCartographe('consistance')
    fireEvent.click(await screen.findByLabelText(/Run 1/))
    fireEvent.click(screen.getByLabelText(/Run 2/))

    await analyse()

    expect((await screen.findByRole('alert')).textContent).toBe(
      'La cartographie 31 n’est pas un document de journée : retirez-la de la sélection.',
    )
    expect(screen.queryByTestId('consistance-rapport')).toBeNull()
  })

  it('UC-CAR-07-F07 — E3 : document devenu inaccessible (404) → message', async () => {
    network({ 31: dayDoc() }, QUEUE, {
      'GET api/cartographe/cartographies/32': jsonResponse(404, { error: 'Cartographie introuvable' }),
    })
    openCartographe('consistance')
    fireEvent.click(await screen.findByLabelText(/Run 1/))
    fireEvent.click(screen.getByLabelText(/Run 2/))

    await analyse()

    expect((await screen.findByRole('alert')).textContent).toBe('Cartographie introuvable')
    expect(screen.queryByTestId('consistance-rapport')).toBeNull()
  })

  it('UC-CAR-07-F08 — E4 : file indisponible → message ; les fichiers locaux restent utilisables', async () => {
    stubNetwork({ 'GET api/cartographe/cartographies': jsonResponse(500, { error: 'Erreur interne' }) })
    openCartographe('consistance')

    expect((await screen.findByRole('alert')).textContent).toBe('Erreur interne')
    await addFiles(localFile('a.json', dayDoc()), localFile('b.json', dayDoc()))
    await analyse()
    expect(screen.getByTestId('consistance-accord').textContent).toContain('Accord global : 100 %')
  })

  it('UC-CAR-07-F09 — AN6 (anomalie) : « non établie » contre « renvoi » → « Aucune divergence de statut » malgré un accord < 100 %', async () => {
    network({}, [])
    openCartographe('consistance')
    await addFiles(localFile('a.json', dayDoc()), localFile('b.json', withStatut(dayDoc(), '1.01', RENVOI)))
    await analyse()

    // Comportement ACTUEL figé.
    expect(screen.getByTestId('consistance-accord').textContent).toContain('Accord global : 97 %')
    expect(screen.getByText('Aucune divergence de statut entre les runs.')).toBeTruthy()
    const ligne = [...screen.getByTestId('consistance-table').querySelectorAll('tbody tr')].find((tr) =>
      tr.textContent.startsWith('1.01'),
    )
    expect(ligne.getAttribute('data-stable')).toBe('false')
  })

  it('UC-CAR-07-F10 — E6 : sans le rôle cartographe, la section est réservée et rien n’est lu', async () => {
    const apprenant = { id: 3, displayName: 'Zoé', roles: ['apprenant'] }
    const net = stubNetwork({}, { user: apprenant })
    openCartographe('consistance', apprenant)

    expect(await screen.findByTestId('cartographe-reserve')).toBeTruthy()
    expect(screen.queryByLabelText(/fichiers locaux/)).toBeNull()
    expect(net.calls.some((call) => call.key.includes('api/cartographe/'))).toBe(false)
  })
})
