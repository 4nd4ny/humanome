// e2e — P5 de l'interface ultime de cartographie (spec §14) :
//   « la démo anonymisée garde ses surlignages ; le HTML s'ouvre en file:// ».
//
// Parcours réel dans Chromium, servi par le dev-server Vite (aucune API
// docker requise) : import des fichiers de Lou (données synthétiques),
// téléchargement de la copie autonome (portfolio inclus), ouverture du
// fichier téléchargé en file:// avec TOUT le réseau coupé, surlignage d'une
// trace dans le portfolio ; puis démo anonymisée (Sam → Personne A),
// téléchargée et ouverte de la même façon : le passage se surligne encore,
// sous son nouveau nom, et le vrai nom n'y figure plus nulle part.
//
// LOCAL UNIQUEMENT (docs/tests-e2e.md) : npx playwright test e2e/carto-export.e2e.js

import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { LOU_PORTFOLIO, kairosDoc, louDays } from '../src/carto/test/fixtures.js'

const web = dirname(dirname(fileURLToPath(import.meta.url)))
const out = mkdtempSync(join(tmpdir(), 'carto-export-'))

const louFiles = () => [
  { name: 'journal-de-lou.md', mimeType: 'text/markdown', buffer: Buffer.from(LOU_PORTFOLIO) },
  ...Object.entries(louDays()).map(([date, poles]) => ({
    name: `${date}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ date, poles, kairos: kairosDoc(date) })),
  })),
]

test.beforeAll(() => {
  // Le modèle de la copie autonome (public/carto/viewer-template.html) est un
  // produit de construction : on le reconstruit pour tester le code courant.
  execFileSync(process.execPath, [join(web, 'scripts', 'build-viewer.mjs')], { cwd: web, stdio: 'pipe' })
})

/** Ouvre un fichier HTML téléchargé en file://, réseau coupé ; renvoie la page et les erreurs. */
async function openOffline(browser, path) {
  const context = await browser.newContext({ locale: 'fr-FR' })
  const requests = []
  await context.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('file:')) return route.continue()
    requests.push(url)
    return route.abort()
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(pathToFileURL(path).href)
  return { context, page, errors, requests }
}

/** Sélectionne une compétence du soleil et ouvre sa première trace dans le portfolio. */
async function openFirstTrace(page, code) {
  const sector = page.locator(`.carto-col-center .carto-sun [role="button"][aria-label^="${code} "]`)
  await expect(sector).toHaveCount(1)
  await sector.focus()
  await page.keyboard.press('Enter')
  const traces = page.getByRole('region', { name: 'Traces de la compétence' })
  await traces.getByRole('button', { name: 'Ouvrir dans le portfolio' }).first().click()
  const reader = page.getByRole('region', { name: /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) / })
  await expect(reader).toBeVisible()
  return reader
}

test('P5 : copie autonome en file:// et démo anonymisée, surlignages compris', async ({ page, browser }) => {
  await page.goto('/#/cartographie')

  await test.step('import des fichiers de Lou dans le navigateur', async () => {
    await page.locator('input[type="file"][accept]').setInputFiles(louFiles())
    await expect(page.getByRole('heading', { name: 'Cartographie', level: 1 })).toBeVisible()
    await expect(page.locator('.carto-col-center .carto-sun [role="button"][aria-label^="2.01 "]')).toHaveCount(1)
  })

  let copyPath
  await test.step('export de la copie autonome, portfolio inclus', async () => {
    await page.goto('/#/cartographie/export')
    await page.getByRole('checkbox', { name: /inclure le portfolio/ }).check()
    await expect(page.getByRole('note').filter({ hasText: 'texte intégral' })).toBeVisible()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Télécharger la copie' }).click()])
    expect(download.suggestedFilename()).toMatch(/^cartographie-copie-\d{4}-\d{2}-\d{2}\.html$/)
    copyPath = join(out, download.suggestedFilename())
    await download.saveAs(copyPath)
  })

  await test.step('la copie s’ouvre en file://, sans réseau, et surligne le passage d’une trace', async () => {
    const { context, page: copy, errors, requests } = await openOffline(browser, copyPath)
    await expect(copy.getByRole('note').filter({ hasText: 'Copie autonome en lecture' })).toBeVisible()
    await expect(copy.getByRole('link', { name: 'Exporter' })).toHaveCount(0)
    const reader = await openFirstTrace(copy, '2.01')
    await expect(reader.locator('mark.carto-hl').first()).toBeVisible()
    await expect.poll(async () => (await reader.locator('mark.carto-hl').allTextContents()).join('')).toContain('J’ai écouté Sam expliquer son idée')
    expect(requests).toEqual([])
    expect(errors).toEqual([])
    await context.close()
  })

  let demoPath
  await test.step('préparer une démo : Sam devient Personne A, l’aperçu vérifie les surlignages', async () => {
    await page.getByRole('button', { name: 'Ouvrir l’outil d’anonymisation' }).click()
    const tool = page.getByRole('region', { name: 'Préparer une démo anonymisée' })
    await tool.getByRole('checkbox', { name: /^Sam \(2\)/ }).check()
    await expect(tool.getByRole('textbox', { name: 'Remplacement de Sam' })).toHaveValue('Personne A')
    for (const name of ['Noé', 'Lou']) {
      await tool.getByRole('textbox', { name: 'Nom', exact: true }).fill(name)
      await tool.getByRole('button', { name: 'Ajouter au dictionnaire' }).click()
    }
    await tool.getByRole('button', { name: 'Préparer l’aperçu' }).click()
    await expect(tool.getByText(/Tous les surlignages tiennent/)).toBeVisible()
    await tool.getByRole('checkbox', { name: /J’ai relu l’aperçu/ }).check()
    const [download] = await Promise.all([page.waitForEvent('download'), tool.getByRole('button', { name: 'Télécharger sa copie autonome (.html)' }).click()])
    expect(download.suggestedFilename()).toMatch(/^cartographie-demo-\d{4}-\d{2}-\d{2}\.html$/)
    demoPath = join(out, download.suggestedFilename())
    await download.saveAs(demoPath)
  })

  await test.step('la démo anonymisée s’ouvre en file:// et garde ses surlignages', async () => {
    const html = readFileSync(demoPath, 'utf8')
    const data = html.slice(html.indexOf('id="carto-data">'), html.indexOf('</script>', html.indexOf('id="carto-data">')))
    expect(data).not.toMatch(/\bSam\b|Noé|\bLou\b/u)
    const { context, page: demo, errors, requests } = await openOffline(browser, demoPath)
    await expect(demo.locator('.carto-context-dataset')).toHaveText('Démonstration')
    const reader = await openFirstTrace(demo, '2.01')
    await expect.poll(async () => (await reader.locator('mark.carto-hl').allTextContents()).join('')).toContain('J’ai écouté Personne A expliquer son idée')
    await expect(reader).not.toContainText('Sam')
    expect(requests).toEqual([])
    expect(errors).toEqual([])
    await context.close()
  })
})
