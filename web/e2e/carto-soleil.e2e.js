// e2e — ouvrir un pôle du soleil sur 360° (demande de Christian du 2026-10-14,
// journal D-45) : dans un vrai navigateur, un double-clic (deux clics, puis le
// double-clic) sur l'arc d'un pôle l'ouvre ; ses seules compétences occupent
// alors tout le cercle, chacune selon sa part des points du pôle ; un clic au
// centre revient à tous les pôles. La géométrie est vérifiée sur le tracé
// rendu (point par point), pas seulement sur les libellés.
//
// Servi par le dev-server Vite, aucune API requise ; données synthétiques de Lou.
// LOCAL UNIQUEMENT (docs/tests-e2e.md) : npx playwright test e2e/carto-soleil.e2e.js

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

const SUN = '.carto-col-center .carto-sun'

/** Codes des compétences dessinées (et atteignables) dans le soleil. */
const sectorCodes = (page) =>
  page.locator(`${SUN} path[role="button"]`).evaluateAll((els) =>
    els
      .map((el) => el.getAttribute('aria-label'))
      .filter((l) => /^\d\.\d\d /.test(l))
      .map((l) => l.slice(0, 4)),
  )

/**
 * Tour complet, degré par degré, au rayon r : quel secteur (code de
 * compétence, ou « Pôle … ») couvre chaque point ? Compte les degrés par secteur.
 */
const coverage = (page, r, prefix) =>
  page.locator(SUN).evaluate(
    (fig, { r, prefix }) => {
      const svg = fig.querySelector('svg')
      const paths = [...fig.querySelectorAll('path[role="button"]')].filter((p) => p.getAttribute('aria-label').startsWith(prefix ?? ''))
      const counts = {}
      for (let deg = 0; deg < 360; deg += 1) {
        const a = (deg * Math.PI) / 180
        const point = svg.createSVGPoint()
        point.x = r * Math.cos(a)
        point.y = r * Math.sin(a)
        const hit = paths.find((p) => p.isPointInFill(point))
        const key = hit ? hit.getAttribute('aria-label').split(' :')[0].replace(/^(\d\.\d\d) .*/, '$1') : 'vide'
        counts[key] = (counts[key] ?? 0) + 1
      }
      return counts
    },
    { r, prefix },
  )

/** Clique un point du secteur lui-même (le centre de sa boîte peut tomber sur un autre secteur). */
async function clickSector(page, labelStart) {
  const sector = page.locator(`${SUN} path[role="button"][aria-label^="${labelStart}"]`)
  const pt = await sector.evaluate((el) => {
    const svg = el.ownerSVGElement
    const m = svg.getScreenCTM()
    for (let r = 40; r < 195; r += 4) {
      for (let d = 0; d < 360; d += 3) {
        const a = (d * Math.PI) / 180
        const p = svg.createSVGPoint()
        p.x = r * Math.cos(a)
        p.y = r * Math.sin(a)
        if (el.isPointInFill(p)) {
          const q = p.matrixTransform(m)
          return { x: q.x, y: q.y }
        }
      }
    }
    return null
  })
  expect(pt).not.toBeNull()
  await page.mouse.click(pt.x, pt.y)
}

test('double-clic sur l’arc d’un pôle : ses compétences sur 360° ; clic au centre : retour aux pôles', async ({ page }) => {
  await page.goto('/#/cartographie')
  await page.locator('input[type="file"][accept]').setInputFiles(louFiles())
  await expect(page.locator(`${SUN} [role="button"][aria-label^="2.01 "]`)).toHaveCount(1)
  const fading = page.locator(`${SUN} path[aria-hidden="true"]`)
  const center = page.locator(`${SUN} .carto-sun-center`)

  await test.step('soleil principal : les quatre compétences de Lou se partagent le tour', async () => {
    expect(await sectorCodes(page)).toEqual(['1.01', '2.01', '3.01', '3.02'])
    const ring = await coverage(page, 140, '')
    expect(ring.vide).toBeUndefined()
    await page.locator(SUN).screenshot({ path: test.info().outputPath('1-soleil-principal.png') })
  })

  await test.step('un clic sur un pôle ne fait pas défiler la page (le second clic d’un double-clic doit tomber au même endroit)', async () => {
    const pole = page.locator(`${SUN} path[role="button"][aria-label^="Pôle MAIN"]`)
    await pole.scrollIntoViewIfNeeded()
    const scrollY = await page.evaluate(() => window.scrollY)
    const before = await page.locator(`${SUN} svg`).boundingBox()
    await pole.click()
    await expect(page.getByRole('article', { name: 'Détail : pôle MAIN' })).toBeVisible()
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
    expect(await page.locator(`${SUN} svg`).boundingBox()).toEqual(before)
    await page.locator(`${SUN} .carto-sun-center`).click() // désélectionne
    await expect(page.getByRole('article', { name: 'Résumé du profil' })).toBeVisible()
  })

  await test.step('double-clic sur l’arc de MAIN : il s’ouvre sur 360°', async () => {
    await page.locator(`${SUN} path[role="button"][aria-label^="Pôle MAIN"]`).dblclick()
    await expect.poll(() => sectorCodes(page)).toEqual(['3.01', '3.02'])
    await expect(fading).toHaveCount(0)
    await expect(center).toHaveAttribute('aria-label', 'Centre : revenir aux 3 pôles')
    // Deux clics puis le double-clic : le pôle finit sélectionné, le détail le montre.
    await expect(page.getByRole('article', { name: 'Détail : pôle MAIN — Créer' })).toBeVisible()
    await expect(page.locator(`${SUN} .carto-sun-caption`)).toContainText('clic au centre : revenir aux 3 pôles')

    // L'anneau du pôle fait le tour entier ; ses compétences aussi, 20 % / 80 % des points du pôle.
    const ring = await coverage(page, 80, 'Pôle')
    expect(Object.keys(ring)).toHaveLength(1)
    expect(Object.keys(ring)[0]).toMatch(/^Pôle MAIN .* ouvert sur 360°$/)
    expect(Object.values(ring)).toEqual([360])
    const comps = await coverage(page, 140, '3.')
    expect(comps.vide).toBeUndefined()
    expect(Math.abs(comps['3.01'] - 72)).toBeLessThanOrEqual(2)
    expect(Math.abs(comps['3.02'] - 288)).toBeLessThanOrEqual(2)
    await expect(page.locator(`${SUN} .carto-sun-code-label`)).toHaveText(['3.01', '3.02'])
    await page.locator(SUN).screenshot({ path: test.info().outputPath('2-pole-ouvert.png') })
  })

  await test.step('clic au centre : retour aux trois pôles, la sélection reste', async () => {
    await center.click()
    await expect.poll(() => sectorCodes(page)).toEqual(['1.01', '2.01', '3.01', '3.02'])
    await expect(fading).toHaveCount(0)
    await expect(center).toHaveAttribute('aria-label', 'Centre : tout désélectionner')
    await expect(page.getByRole('article', { name: 'Détail : pôle MAIN — Créer' })).toBeVisible()
    expect((await coverage(page, 140, '')).vide).toBeUndefined()
  })

  await test.step('au clavier : « o » sur l’arc de COEUR l’ouvre, Échap désélectionne puis referme', async () => {
    await page.locator(`${SUN} path[role="button"][aria-label^="Pôle COEUR"]`).focus()
    await page.keyboard.press('o')
    await expect.poll(() => sectorCodes(page)).toEqual(['2.01'])
    await expect(fading).toHaveCount(0)
    expect(await coverage(page, 140, '2.')).toEqual({ '2.01': 360 })
    // Un appui d'Échap fait une seule chose : il désélectionne, le pôle reste
    // ouvert (on attend plus qu'un passage pour en être sûr)…
    await page.keyboard.press('Escape')
    await expect(page.getByRole('article', { name: 'Résumé du profil' })).toBeVisible()
    await page.waitForTimeout(700)
    await expect(center).toHaveAttribute('aria-label', 'Centre : revenir aux 3 pôles')
    expect(await sectorCodes(page)).toEqual(['2.01'])
    await expect(fading).toHaveCount(0)
    // … le suivant le referme.
    await page.keyboard.press('Escape')
    await expect.poll(() => sectorCodes(page)).toEqual(['1.01', '2.01', '3.01', '3.02'])
    await expect(center).toHaveAttribute('aria-label', 'Centre : tout désélectionner')
  })

  await test.step('la liste suit la sélection dans sa colonne, la page ne bouge pas', async () => {
    const scrollY = await page.evaluate(() => window.scrollY)
    const before = await page.locator(`${SUN} svg`).boundingBox()
    await clickSector(page, '3.02 ')
    await expect(page.getByRole('article', { name: /^Détail : 3\.02 / })).toBeVisible()
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
    expect(await page.locator(`${SUN} svg`).boundingBox()).toEqual(before)
    // L'élément choisi est visible dans la colonne de gauche.
    const item = page.locator('.carto-col-left .carto-list-label.is-selected')
    await expect(item).toHaveCount(1)
    const inView = await item.evaluate((el) => {
      const col = el.closest('.carto-col-left').getBoundingClientRect()
      const r = el.getBoundingClientRect()
      return r.top >= col.top - 1 && r.bottom <= col.bottom + 1
    })
    expect(inView).toBe(true)
  })
})
