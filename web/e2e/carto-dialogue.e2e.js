// e2e — P7 de l'interface ultime de cartographie (spec §14) : dialogue
// d'accompagnement scripté. Critère d'acceptation : « aucune donnée n'est
// envoyée sans consentement explicite ».
//
// Parcours réel dans Chromium, servi par le dev-server Vite (aucune API
// requise) : import des fichiers de Lou, dialogue complet (répondre, passer,
// garder dans le carnet) en enregistrant TOUTES les requêtes du navigateur →
// aucune. Puis l'option de relance : sans accord, rien ; avec accord pour
// Ollama (modèle local, simulé ici), une seule requête vers
// localhost:11434, qui n'emporte que la question, la réponse et le passage.
// Enfin (question 20) : le dialogue gardé, versé au portfolio, figure dans le
// portfolio exporté en Markdown — sans aucune requête réseau.
//
// LOCAL UNIQUEMENT (docs/tests-e2e.md) : npx playwright test e2e/carto-dialogue.e2e.js

import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { LOU_PORTFOLIO, kairosDoc, louDays } from '../src/carto/test/fixtures.js'

const louFiles = () => [
  { name: 'journal-de-lou.md', mimeType: 'text/markdown', buffer: Buffer.from(LOU_PORTFOLIO) },
  ...Object.entries(louDays()).map(([date, poles]) => ({
    name: `${date}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ date, poles, kairos: kairosDoc(date) })),
  })),
]

test('P7 : le dialogue n’envoie rien ; une relance ne part qu’avec un accord explicite, et seulement la question, la réponse et le passage', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/#/cartographie')
  await page.locator('input[type="file"][accept]').setInputFiles(louFiles())
  await page.locator('[data-tile="sun"] .carto-sun').waitFor()

  // À partir d'ici, toute requête est enregistrée (y compris vers le site lui-même).
  const requests = []
  page.on('request', (r) => requests.push(`${r.method()} ${r.url()}`))
  const ollama = []
  await page.route('http://localhost:11434/**', async (route) => {
    ollama.push(route.request().postDataJSON())
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ model: 'llama3.1', message: { role: 'assistant', content: 'Qu’avez-vous remarqué en reformulant ?' } }) })
  })

  await test.step('Dialogue complet, carnet compris : aucune requête', async () => {
    await page.getByRole('link', { name: 'Dialogue', exact: true }).click()
    await expect(page.getByText(/vous écrivez ce passage, où l’analyse lit/)).toBeVisible()
    await page.getByLabel('Votre réponse').fill('J’apprenais à écouter sans couper.')
    await page.getByRole('button', { name: 'Répondre' }).click()
    await expect(page.getByText(/apparaît pour la première fois le 23 décembre 2025/)).toBeVisible()
    await page.getByRole('button', { name: 'Passer cette question' }).click()
    await page.getByRole('button', { name: 'Garder dans mon carnet' }).click()
    await expect(page.getByText('Gardé dans votre carnet, dans ce navigateur.')).toBeVisible()
    await page.getByText('Relances par un modèle de langage (facultatif)').click()
    await expect(page.getByRole('checkbox', { name: /J’accepte que, pour chaque relance/ })).not.toBeChecked()
    await expect(page.getByRole('button', { name: /Demander une relance/ })).toHaveCount(0)
    expect(requests).toEqual([])
  })

  await test.step('Accord explicite pour Ollama : une relance demandée = une requête, limitée au strict nécessaire', async () => {
    await page.getByRole('button', { name: 'Recommencer' }).click()
    await page.getByLabel('Votre réponse').fill('Je reformulais pour vérifier.')
    await page.getByRole('button', { name: 'Répondre' }).click()
    await page.getByRole('checkbox', { name: /J’accepte que, pour chaque relance/ }).check()
    expect(requests).toEqual([]) // l'accord seul n'envoie rien
    await page.getByRole('button', { name: 'Demander une relance à Ollama (modèle local, sans clé)' }).click()
    await expect(page.getByText('Qu’avez-vous remarqué en reformulant ?')).toBeVisible()
    expect(requests).toEqual(['POST http://localhost:11434/api/chat'])
    expect(ollama).toHaveLength(1)
    const [system, user] = ollama[0].messages
    expect(system.role).toBe('system')
    expect(user.content).toMatch(/^Question posée : Le 23 décembre 2025, vous écrivez ce passage/)
    expect(user.content).toContain('J’ai écouté Sam expliquer son idée')
    expect(user.content).toContain('Sa réponse : Je reformulais pour vérifier.')
    // Rien d'autre : ni le reste du journal, ni la cartographie.
    expect(JSON.stringify(ollama[0])).not.toMatch(/maquette|Ce matin|J’apprenais|Pensée critique|kairos/)
  })

  await test.step('Verser le dialogue gardé au portfolio, exporter le portfolio en Markdown : aucune requête réseau', async () => {
    const before = requests.length
    const carnet = page.getByRole('region', { name: 'Mon carnet' })
    await carnet.getByRole('button', { name: /Dialogue du/ }).click()
    await carnet.getByRole('button', { name: 'Verser à mon portfolio' }).click()
    await expect(carnet.getByText('versé au portfolio')).toBeVisible()
    await page.getByRole('link', { name: 'Export', exact: true }).click()
    await expect(page.getByText('1 dialogue versé au portfolio.')).toBeVisible()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Télécharger le portfolio (.md)' }).click()])
    expect(download.suggestedFilename()).toMatch(/^cartographie-portfolio-\d{4}-\d{2}-\d{2}\.md$/)
    const text = readFileSync(await download.path(), 'utf8')
    expect(text).toContain('Ce matin j’ai relu mes notes avant d’écrire.')
    expect(text).toMatch(/### Dialogue d’accompagnement du \S+ \S+ \d{4}/)
    expect(text).toContain('**Réponse.** J’apprenais à écouter sans couper.')
    // Seul le téléchargement, une URL blob: produite dans la page : aucune requête réseau.
    expect(requests.slice(before).filter((r) => !/ blob:/.test(r))).toEqual([])
  })

  expect(errors).toEqual([])
})
