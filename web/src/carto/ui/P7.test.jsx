// Interface ultime — P7 : dialogue d'accompagnement scripté (spec §14).
// Critère d'acceptation : « aucune donnée n'est envoyée sans consentement
// explicite ». Le dialogue lui-même ne fait aucune requête ; une relance par un
// modèle de langage exige un choix, un accord explicite (décoché par défaut)
// et une demande, réponse par réponse — et n'emporte que la question, la
// réponse et le passage cité.
import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CartoApp from './CartoApp.jsx'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { importFiles } from '../core/import.js'
import { createDataset } from '../core/model.js'
import { parseHash, subscribe } from '../../router.js'
import { LOU_PORTFOLIO, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'

const NOW = '2026-10-13T12:00:00.000Z'

async function louStore() {
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  const ds = createDataset({ datasetId: 'ds-lou', title: 'Lou', referential: miniReferential(), now: NOW })
  const files = [{ path: 'lou.md', text: LOU_PORTFOLIO }]
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  await store.commit(await importFiles(files, ds, { now: NOW }))
  return store
}

const PROVIDERS = [
  { id: 'ollama', label: 'Ollama (modèle local, sans clé)', defaultModel: 'llama3.1', requiresKey: false },
  { id: 'anthropic', label: 'Anthropic (Claude)', defaultModel: 'claude-sonnet-4-6', requiresKey: true },
]

function fakeLlm() {
  const complete = vi.fn(async ({ model }) => ({ text: '**Et qu’avez-vous retenu de sa façon de faire ?**', model, usage: {} }))
  const createProvider = vi.fn(() => ({ complete }))
  return { llm: { providers: PROVIDERS, getLocalKey: () => '', createProvider }, createProvider, complete }
}

function Harness({ store, llm = null, mode }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => subscribe(setRoute), [])
  return <CartoApp route={route} mode={mode} deps={{ store, loadReferential: async () => ({ doc: miniReferential() }), llm }} />
}

let fetchSpy
beforeEach(() => {
  window.location.hash = '#/cartographie/dialogue'
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    throw new Error('réseau interdit dans ce test')
  })
})
afterEach(() => {
  cleanup()
  fetchSpy.mockRestore()
})

const firstQuestion = () => screen.findByText(/^Le 23 décembre 2025, vous écrivez ce passage, où l’analyse lit « Écoute » \(2\.01\)\./)

describe('P7 — dialogue scripté, local', () => {
  it('des questions tirées des traces ; répondre, passer, garder dans le carnet — sans aucune requête', async () => {
    const { llm, createProvider } = fakeLlm()
    render(<Harness store={await louStore()} llm={llm} />)
    expect(await screen.findByRole('link', { name: 'Dialogue' })).toBeTruthy()
    await firstQuestion()
    expect(screen.getByText(/« J’ai écouté Sam expliquer son idée/)).toBeTruthy()
    expect(screen.getByText(/c’est un questionnement, pas une conversation\. Rien ne quitte ce navigateur\./)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Votre réponse'), { target: { value: 'J’apprenais à écouter sans couper.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Répondre' }))
    expect(await screen.findByText(/« Écoute » \(2\.01\) apparaît pour la première fois le 23 décembre 2025/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Passer cette question' }))
    expect(await screen.findByText(/Voulez-vous garder vos réponses dans votre carnet \?/)).toBeTruthy()
    expect(screen.getByText('Question passée.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Garder dans mon carnet' }))
    expect(await screen.findByText('Gardé dans votre carnet, dans ce navigateur.')).toBeTruthy()
    const carnet = screen.getByRole('region', { name: 'Mon carnet' })
    fireEvent.click(within(carnet).getByRole('button', { name: /Dialogue du/ }))
    expect(within(carnet).getByText('J’apprenais à écouter sans couper.')).toBeTruthy()
    expect(within(carnet).getByText('1 réponse')).toBeTruthy()

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(createProvider).not.toHaveBeenCalled()

    // Retirer du carnet, en deux temps.
    fireEvent.click(within(carnet).getByRole('button', { name: 'Retirer du carnet' }))
    fireEvent.click(within(carnet).getByRole('button', { name: 'Confirmer le retrait' }))
    expect(await within(carnet).findByText('Votre carnet est vide.')).toBeTruthy()
  })

  it('s’arrêter à tout moment ; recommencer', async () => {
    render(<Harness store={await louStore()} />)
    await firstQuestion()
    fireEvent.click(screen.getByRole('button', { name: 'M’arrêter là' }))
    expect(await screen.findByText(/C’est tout pour cette fois/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Garder dans mon carnet' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Aucune réponse à garder.')
    fireEvent.click(screen.getByRole('button', { name: 'Recommencer' }))
    expect(await screen.findByLabelText('Votre réponse')).toBeTruthy()
  })
})

describe('P7 — aucune donnée envoyée sans consentement explicite', () => {
  it('sans accord, aucune relance possible ; avec accord, la relance n’emporte que la question, la réponse et le passage', async () => {
    const { llm, createProvider, complete } = fakeLlm()
    render(<Harness store={await louStore()} llm={llm} />)
    await firstQuestion()
    fireEvent.change(screen.getByLabelText('Votre réponse'), { target: { value: 'J’apprenais à écouter.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Répondre' }))
    await screen.findByText(/apparaît pour la première fois/)
    // Option repliée, accord décoché par défaut : pas de bouton de relance.
    expect(screen.queryByRole('button', { name: /Demander une relance/ })).toBeNull()
    const consent = screen.getByRole('checkbox', { name: /J’accepte que, pour chaque relance que je demande/ })
    expect(consent.checked).toBe(false)

    fireEvent.click(consent)
    const ask = await screen.findByRole('button', { name: 'Demander une relance à Ollama (modèle local, sans clé)' })
    expect(createProvider).not.toHaveBeenCalled() // l'accord seul n'envoie rien
    fireEvent.click(ask)
    expect(await screen.findByText('Et qu’avez-vous retenu de sa façon de faire ?')).toBeTruthy()
    expect(createProvider).toHaveBeenCalledWith({ provider: 'ollama', transport: 'direct', apiKey: undefined })
    const sent = complete.mock.calls[0][0]
    expect(sent.model).toBe('llama3.1')
    expect(sent.prompt).toContain('Question posée : Le 23 décembre 2025, vous écrivez ce passage')
    expect(sent.prompt).toContain('Passage cité de son journal : «\u00a0J’ai écouté Sam expliquer son idée')
    expect(sent.prompt).toContain('Sa réponse : J’apprenais à écouter.')
    // Rien d'autre du journal ni de la cartographie.
    expect(JSON.stringify(sent)).not.toMatch(/maquette|Ce matin|Pensée critique|1\.01|kairos/)
    expect(fetchSpy).not.toHaveBeenCalled() // le fournisseur simulé est la seule voie de sortie

    // Changer de modèle retire l'accord.
    fireEvent.change(screen.getByRole('combobox', { name: /Modèle de langage/ }), { target: { value: 'anthropic' } })
    expect(screen.getByRole('checkbox', { name: /J’accepte que/ }).checked).toBe(false)
    // Sans clé, l'accord n'est même pas proposé.
    expect(screen.getByRole('checkbox', { name: /J’accepte que/ }).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Clé d’API/), { target: { value: 'sk-test' } })
    expect(screen.getByRole('checkbox', { name: /J’accepte que/ }).disabled).toBe(false)
  })

  it('copie autonome : ni relance, ni carnet enregistré', async () => {
    const { llm } = fakeLlm()
    render(<Harness store={await louStore()} llm={llm} mode="viewer" />)
    await firstQuestion()
    expect(screen.queryByText(/Relances par un modèle de langage/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'M’arrêter là' }))
    expect(await screen.findByText(/Dans une copie autonome, le carnet n’est pas enregistré/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Garder dans mon carnet' })).toBeNull()
  })
})
