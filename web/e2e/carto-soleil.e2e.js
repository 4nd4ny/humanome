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

const SUN = '[data-tile="sun"] .carto-sun'
// Rayons de sondage (unités du dessin) : l'anneau des pôles va de 30 à 60, les
// compétences partent de 65 (D-58) ; juste au-delà, toute compétence dessinée
// est atteinte, quelle que soit sa confiance (épaisseur minimale de 2).
const R_POLES = 45
const R_LEAVES = 66

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

/** Un point du secteur lui-même, à l'écran (le centre de sa boîte peut tomber sur un autre secteur). */
async function sectorPoint(page, labelStart) {
  const sector = page.locator(`${SUN} path[role="button"][aria-label^="${labelStart}"]`)
  const pt = await sector.evaluate((el) => {
    const svg = el.ownerSVGElement
    const m = svg.getScreenCTM()
    for (let r = 32; r < 195; r += 4) {
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
  return pt
}

/** Pointeur hors des tuiles, sur le titre de la cartographie (le bord gauche ouvrirait le menu du site). */
const away = (page) => page.locator('.carto-context h1').hover()

/** Clique le secteur lui-même. */
async function clickSector(page, labelStart) {
  const pt = await sectorPoint(page, labelStart)
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
    const ring = await coverage(page, R_LEAVES, '')
    expect(ring.vide).toBeUndefined()
    await page.locator(SUN).screenshot({ path: test.info().outputPath('1-soleil-principal.png') })
  })

  await test.step('un clic sur un pôle ne fait pas défiler la page (le second clic d’un double-clic doit tomber au même endroit)', async () => {
    const pole = page.locator(`${SUN} path[role="button"][aria-label^="Pôle MAIN"]`)
    await pole.scrollIntoViewIfNeeded()
    const scrollY = await page.evaluate(() => window.scrollY)
    const before = await page.locator(`${SUN} svg`).boundingBox()
    // Un point de l'arc lui-même : l'anneau des pôles est mince (D-58), le centre de sa boîte tombe ailleurs.
    await clickSector(page, 'Pôle MAIN')
    await expect(page.getByRole('article', { name: 'Détail : pôle MAIN' })).toBeVisible()
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
    expect(await page.locator(`${SUN} svg`).boundingBox()).toEqual(before)
    await page.locator(`${SUN} .carto-sun-center`).click() // désélectionne
    await expect(page.getByRole('article', { name: 'Résumé du profil' })).toBeVisible()
  })

  await test.step('double-clic sur l’arc de MAIN : il s’ouvre sur 360°', async () => {
    const arc = await sectorPoint(page, 'Pôle MAIN')
    await page.mouse.dblclick(arc.x, arc.y)
    await expect.poll(() => sectorCodes(page)).toEqual(['3.01', '3.02'])
    await expect(fading).toHaveCount(0)
    await expect(center).toHaveAttribute('aria-label', 'Centre : revenir aux 3 pôles')
    // Deux clics puis le double-clic : le pôle finit sélectionné, le détail le montre.
    await expect(page.getByRole('article', { name: 'Détail : pôle MAIN — Créer' })).toBeVisible()
    await expect(page.locator(`${SUN} .carto-sun-caption`)).toContainText('clic au centre : revenir aux 3 pôles')

    // L'anneau du pôle fait le tour entier ; ses compétences aussi, 20 % / 80 % des points du pôle.
    const ring = await coverage(page, R_POLES, 'Pôle')
    expect(Object.keys(ring)).toHaveLength(1)
    expect(Object.keys(ring)[0]).toMatch(/^Pôle MAIN .* ouvert sur 360°$/)
    expect(Object.values(ring)).toEqual([360])
    const comps = await coverage(page, R_LEAVES, '3.')
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
    expect((await coverage(page, R_LEAVES, '')).vide).toBeUndefined()
  })

  await test.step('au clavier : « o » sur l’arc de COEUR l’ouvre, Échap désélectionne puis referme', async () => {
    await page.locator(`${SUN} path[role="button"][aria-label^="Pôle COEUR"]`).focus()
    await page.keyboard.press('o')
    await expect.poll(() => sectorCodes(page)).toEqual(['2.01'])
    await expect(fading).toHaveCount(0)
    expect(await coverage(page, R_LEAVES, '2.')).toEqual({ '2.01': 360 })
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

  await test.step('la légende sous le soleil garde sa hauteur de deux lignes, survolé ou non (D-52)', async () => {
    const caption = page.locator(`${SUN} .carto-sun-caption`)
    const h0 = (await caption.boundingBox()).height
    const pt = await sectorPoint(page, '3.02 ')
    await page.mouse.move(pt.x, pt.y)
    await expect(caption).toContainText('3.02')
    expect((await caption.boundingBox()).height).toBe(h0)
    const lineHeight = await caption.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))
    expect(Math.round(h0)).toBe(Math.round(2 * lineHeight))
  })

  await test.step('la liste, affichée par « Panneaux », suit la sélection dans sa tuile, la page ne bouge pas', async () => {
    // Au départ, seuls le soleil et le détail sont affichés (D-53).
    await expect(page.locator('.carto-tiles [data-tile]')).toHaveCount(2)
    await page.locator('.carto-panels-menu > summary').click()
    await page.getByRole('checkbox', { name: 'Compétences' }).check()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-tile="competencies"]')).toBeVisible()
    await page.locator('[data-tile="competencies"]').scrollIntoViewIfNeeded()
    await page.locator(SUN).scrollIntoViewIfNeeded()
    const scrollY = await page.evaluate(() => window.scrollY)
    const before = await page.locator(`${SUN} svg`).boundingBox()
    await clickSector(page, '3.02 ')
    await expect(page.getByRole('article', { name: /^Détail : 3\.02 / })).toBeAttached()
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
    expect(await page.locator(`${SUN} svg`).boundingBox()).toEqual(before)
    // L'élément choisi est dans la partie visible de la tuile Compétences.
    const item = page.locator('[data-tile="competencies"] .carto-list-label.is-selected')
    await expect(item).toHaveCount(1)
    const inView = await item.evaluate((el) => {
      const box = el.closest('.v3-tile-content').getBoundingClientRect()
      const r = el.getBoundingClientRect()
      return r.top >= box.top - 1 && r.bottom <= box.bottom + 1
    })
    expect(inView).toBe(true)
  })

  await test.step('thème sombre : le soleil le suit, couleurs sombres choisies (D-60) ; retour au clair', async () => {
    const colors = () =>
      page.locator(SUN).evaluate((fig) => ({
        surface: getComputedStyle(fig).backgroundColor,
        leaf: getComputedStyle(fig.querySelector('path[role="button"][aria-label^="2.01 "]')).fill,
        pole: getComputedStyle(fig.querySelector('path[role="button"][aria-label^="Pôle COEUR"]')).fill,
      }))
    const light = await colors()
    expect(light.surface).toBe('rgb(255, 255, 255)')
    expect(light.leaf).toBe('rgb(4, 120, 87)') // #047857, la marche claire de #10b981 (D-63)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(async () => (await colors()).surface).toBe('rgb(20, 29, 49)')
    const dark = await colors()
    expect(dark.leaf).toBe('rgb(3, 131, 90)') // #03835a, sa marche sombre
    expect(dark.pole).not.toBe(light.pole)
    await page.locator(SUN).screenshot({ path: test.info().outputPath('3-soleil-sombre.png') })
    // Le choix explicite « clair » l'emporte sur un système sombre.
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
    await expect.poll(async () => (await colors()).surface).toBe('rgb(255, 255, 255)')
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'))
    await page.emulateMedia({ colorScheme: 'light' })
  })

  await test.step('la disposition est gardée au rechargement ; « Réinitialiser l’affichage » revient au départ', async () => {
    await page.reload()
    await expect(page.locator(`${SUN} [role="button"][aria-label^="2.01 "]`)).toHaveCount(1)
    await expect(page.locator('.carto-tiles [data-tile]')).toHaveCount(3)
    await page.getByRole('button', { name: 'Réinitialiser l’affichage' }).click()
    await page.getByRole('button', { name: 'Revenir à la vue de départ' }).click()
    await expect(page.locator('.carto-tiles [data-tile]')).toHaveCount(2)
  })

  await test.step('à la souris, les commandes d’une tuile paraissent à son survol ou au clavier ; le titre garde toute la barre (D-61)', async () => {
    const sunTile = page.locator('.v3-tile[data-tile-id="sun"]')
    const tools = sunTile.locator('.v3-tile-tools')
    const opacity = (loc) => loc.evaluate((el) => getComputedStyle(el).opacity)
    await away(page)
    await expect.poll(() => opacity(tools)).toBe('0')
    await expect.poll(() => opacity(sunTile.locator('.v3-tile-handle'))).toBe('0')
    await expect.poll(() => opacity(sunTile.locator('.v3-tile-resize'))).toBe('0')
    expect(await opacity(sunTile.locator('.v3-tile-label'))).toBe('1')
    await page.screenshot({ path: test.info().outputPath('4-tuiles-sans-survol.png') })
    const box = await sunTile.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + 12)
    await expect.poll(() => opacity(tools)).toBe('1')
    await page.screenshot({ path: test.info().outputPath('5-tuiles-survol.png') })
    // Un clic de souris sur une commande ne les retient pas : le pointeur parti, elles s'effacent.
    await sunTile.getByRole('button', { name: 'Reculer Soleil' }).click()
    await expect(page.locator('.carto-tiles .v3-tile').first()).toHaveAttribute('data-tile-id', 'detail')
    await away(page)
    await expect.poll(() => opacity(tools)).toBe('0')
    await sunTile.getByRole('button', { name: 'Avancer Soleil' }).click()
    await expect(page.locator('.carto-tiles .v3-tile').first()).toHaveAttribute('data-tile-id', 'sun')
    await away(page)
    await expect.poll(() => opacity(tools)).toBe('0')
    // Au clavier : arrivé sur une commande, elles paraissent toutes ; dans la tuile, elles restent.
    await page.locator('.carto-panels-menu > summary').focus()
    const inSun = (part) => sunTile.evaluate((t, part) => (part === 'bar' ? t.querySelector('.v3-tile-tools') : t.querySelector('.v3-tile-content')).contains(document.activeElement), part)
    for (let i = 0; i < 25 && !(await inSun('bar')); i++) await page.keyboard.press('Tab')
    expect(await inSun('bar')).toBe(true)
    await expect.poll(() => opacity(tools)).toBe('1')
    for (let i = 0; i < 8 && !(await inSun('content')); i++) await page.keyboard.press('Tab')
    expect(await inSun('content')).toBe(true)
    await expect.poll(() => opacity(tools)).toBe('1')
    // Le focus parti ailleurs, elles s'effacent.
    await page.locator('.carto-context h1').click()
    await expect.poll(() => opacity(tools)).toBe('0')
    // Une tuile étroite : sans survol, son titre n'est plus coupé par des commandes invisibles.
    await page.locator('.carto-panels-menu > summary').click()
    await page.getByRole('checkbox', { name: 'Compétences' }).check()
    await page.keyboard.press('Escape')
    await away(page)
    const label = page.locator('.v3-tile[data-tile-id="competencies"] .v3-tile-label')
    await expect(label).toHaveText('Compétences')
    expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.locator('.carto-panels-menu > summary').click()
    await page.getByRole('checkbox', { name: 'Compétences' }).uncheck()
    await page.keyboard.press('Escape')
  })

  await test.step('tableau de bord : au départ, le profil et le rythme ; « Panneaux » et « Réinitialiser » dans l’en-tête (D-61)', async () => {
    await page.goto('/#/cartographie/tableau-de-bord')
    const cards = page.locator('.carto-dashboard section.carto-card')
    await expect(cards).toHaveCount(2)
    await expect(cards.nth(0)).toHaveAttribute('aria-label', 'Profil')
    await expect(cards.nth(1)).toHaveAttribute('aria-label', 'Rythme')
    // Côte à côte : même rangée.
    const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()]
    expect(Math.abs(a.y - b.y)).toBeLessThan(2)
    await away(page)
    const dashTools = page.locator('.v3-tile[data-tile-id="profile"] .v3-tile-tools')
    await expect.poll(() => dashTools.evaluate((el) => getComputedStyle(el).opacity)).toBe('0')
    await page.locator('.carto-dashboard').screenshot({ path: test.info().outputPath('6-tableau-de-bord.png') })
    await page.locator('.carto-context .carto-panels-menu > summary').click()
    await page.getByRole('checkbox', { name: 'Constance' }).check()
    await expect(cards).toHaveCount(3)
    await page.screenshot({ path: test.info().outputPath('7-tableau-panneaux.png') })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Réinitialiser l’affichage' }).click()
    await page.getByRole('button', { name: 'Revenir à la vue de départ' }).click()
    await expect(cards).toHaveCount(2)
  })
})

test.describe('écran tactile', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 780 } })

  /** Titres des tuiles affichées, et s'ils sont coupés. */
  const titles = (page) =>
    page.locator('.v3-tile-label').evaluateAll((els) => els.map((el) => ({ text: el.textContent, cut: el.scrollWidth > el.clientWidth })))

  test('les commandes des tuiles restent affichées : le survol n’existe pas ; sur un petit écran, les titres restent lisibles (D-61)', async ({ page }) => {
    await page.goto('/#/cartographie')
    await page.locator('input[type="file"][accept]').setInputFiles(louFiles())
    await expect(page.locator(`${SUN} [role="button"][aria-label^="2.01 "]`)).toHaveCount(1)
    const tools = page.locator('.v3-tile[data-tile-id="sun"] .v3-tile-tools')
    expect(await tools.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
    expect(await tools.evaluate((el) => getComputedStyle(el).position)).toBe('static') // dans la barre, à sa place
    expect(await titles(page)).toEqual([
      { text: 'Soleil', cut: false },
      { text: 'Détail', cut: false },
    ])
    await page.goto('/#/cartographie/tableau-de-bord')
    await expect(page.locator('.carto-dashboard section.carto-card')).toHaveCount(2)
    expect(await page.locator('.v3-tile[data-tile-id="rhythm"] .v3-tile-tools').evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
    expect(await titles(page)).toEqual([
      { text: 'Profil', cut: false },
      { text: 'Rythme', cut: false },
    ])
    await page.screenshot({ path: test.info().outputPath('8-tableau-tactile.png'), fullPage: true })
  })
})
