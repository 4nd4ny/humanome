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
import { addReflection, setReflectionVersed } from '../core/ops.js'
import { parseHash, subscribe } from '../../router.js'
import { LOU_PORTFOLIO, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'

const NOW = '2026-10-13T12:00:00.000Z'

async function louStore({ mutate } = {}) {
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  const ds = createDataset({ datasetId: 'ds-lou', title: 'Lou', referential: miniReferential(), now: NOW })
  const files = [{ path: 'lou.md', text: LOU_PORTFOLIO }]
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  const res = await importFiles(files, ds, { now: NOW })
  if (mutate) res.dataset = mutate(res.dataset)
  await store.commit(res)
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

  it('verser un dialogue au portfolio, puis l’en retirer : versement enregistré, puis défait — sans aucune requête', async () => {
    const store = await louStore()
    render(<Harness store={store} />)
    await firstQuestion()
    fireEvent.change(screen.getByLabelText('Votre réponse'), { target: { value: 'J’apprenais à écouter sans couper.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Répondre' }))
    fireEvent.click(await screen.findByRole('button', { name: 'M’arrêter là' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Garder dans mon carnet' }))
    const carnet = await screen.findByRole('region', { name: 'Mon carnet' })
    fireEvent.click(await within(carnet).findByRole('button', { name: /Dialogue du/ }))

    fireEvent.click(within(carnet).getByRole('button', { name: 'Verser à mon portfolio' }))
    expect((await within(carnet).findByRole('status')).textContent).toMatch(/^Versé à votre portfolio, à la journée du .+ : il figure désormais dans le portfolio exporté en Markdown/)
    expect(within(carnet).getByText('versé au portfolio')).toBeTruthy()
    expect(within(carnet).getByText(/^Dans votre portfolio, à la journée du /)).toBeTruthy()
    expect(within(carnet).getByRole('button', { name: 'Retirer du carnet (et du portfolio)' })).toBeTruthy()
    await waitFor(async () => expect((await store.exportAll('ds-lou')).dataset.reflections[0].versedAt).toBeTruthy())

    fireEvent.click(within(carnet).getByRole('button', { name: 'Retirer de mon portfolio' }))
    expect((await within(carnet).findByRole('status')).textContent).toBe('Retiré de votre portfolio ; il reste dans votre carnet. Les fichiers déjà exportés ne changent pas.')
    expect(within(carnet).queryByText('versé au portfolio')).toBeNull()
    expect(within(carnet).getByRole('button', { name: 'Verser à mon portfolio' })).toBeTruthy()
    await waitFor(async () => expect((await store.exportAll('ds-lou')).dataset.reflections[0]).not.toHaveProperty('versedAt'))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('copie autonome : les dialogues versés par l’auteur se lisent, sans rien à verser ni retirer', async () => {
    const versed = (ds) => {
      const out = addReflection(ds, { entries: [{ threadId: 't', kind: 'silence', question: 'Que s’est-il passé ?', answer: 'Une pause voulue.' }] }, { now: NOW })
      return setReflectionVersed(out, out.reflections[0].id, true, { now: NOW })
    }
    render(<Harness store={await louStore({ mutate: versed })} mode="viewer" />)
    const carnet = await screen.findByRole('region', { name: 'Mon carnet' })
    expect(screen.getByText('Les dialogues que l’auteur de cette copie a versés à son portfolio.')).toBeTruthy()
    fireEvent.click(within(carnet).getByRole('button', { name: /Dialogue du/ }))
    expect(within(carnet).getByText('Une pause voulue.')).toBeTruthy()
    expect(within(carnet).getByText(/^Versé à son portfolio par son auteur, à la journée du /)).toBeTruthy()
    expect(within(carnet).queryByRole('button', { name: /Verser|Retirer/ })).toBeNull()
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

  it('une relance revenue après « Recommencer » n’est jamais rattachée au nouveau dialogue', async () => {
    const { llm, complete } = fakeLlm()
    let resolve
    complete.mockImplementationOnce(() => new Promise((r) => (resolve = r)))
    render(<Harness store={await louStore()} llm={llm} />)
    await firstQuestion()
    fireEvent.change(screen.getByLabelText('Votre réponse'), { target: { value: 'Première réponse.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Répondre' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /J’accepte que, pour chaque relance que je demande/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Demander une relance/ }))
    expect(await screen.findByText('Relance en cours…')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'M’arrêter là' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Recommencer' }))
    resolve({ text: 'Une relance de l’ancien dialogue ?', model: 'llama3.1' })
    await waitFor(() => expect(screen.getByLabelText('Votre réponse')).toBeTruthy())
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('Une relance de l’ancien dialogue ?')).toBeNull()
    expect(screen.queryByText('Première réponse.')).toBeNull()
  })

  it('un appel bloqué (politique de sécurité du site) est dit comme tel, sans relance inventée', async () => {
    const { llm, complete } = fakeLlm()
    complete.mockImplementationOnce(async () => {
      throw new TypeError('Failed to fetch')
    })
    render(<Harness store={await louStore()} llm={llm} />)
    await firstQuestion()
    fireEvent.change(screen.getByLabelText('Votre réponse'), { target: { value: 'Une réponse.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Répondre' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /J’accepte que, pour chaque relance que je demande/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Demander une relance/ }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Relance impossible : Ollama (modèle local, sans clé) n’a pas pu être joint depuis cette page (fournisseur injoignable, ou appel bloqué par la politique de sécurité du site). Aucune relance n’a été reçue.',
    )
    expect(screen.queryByText(/Relance proposée par/)).toBeNull()
    expect(screen.queryByText('Relance en cours…')).toBeNull()
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
