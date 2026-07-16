// Traçabilité — exigence « refonte ergonomie/navigation » : ce scénario prouve
// les comportements PUREMENT CSS invisibles en jsdom (Vitest) :
//   • point 1 : survol de la zone du bouton Menu -> le panneau s'ouvre en
//     desktop (@media hover: hover), tap en mobile ;
//   • point 2 : tiroir qui glisse depuis le bord GAUCHE (translateX), hors
//     écran au repos, clic/tap extérieur referme ;
//   • point 3 : épinglé, le contenu est docké (padding-left) à >= 921 px,
//     superposé en dessous ; l'épinglage survit à un rechargement (localStorage) ;
//   • point 4 : la grappe .app-header-actions (thème + ? + Menu) reste fixe
//     au défilement.
// LOCAL UNIQUEMENT (docs/tests-e2e.md) : joué contre le dev-server Vite lancé
// par Playwright (webServer). Session anonyme : aucun état serveur requis.

import { test, expect } from '@playwright/test'

const PANEL = '.app-nav-panel'

/** Bord droit du panneau en px : <= ~0 = complètement hors écran (rétracté). */
async function panelRightEdge(page) {
  const box = await page.locator(PANEL).boundingBox()
  return box.x + box.width
}

test.describe('desktop (survol)', () => {
  test('le survol du bouton Menu ouvre le tiroir gauche, la sortie le rétracte après le délai de grâce', async ({
    page,
  }) => {
    await page.goto('/#/')

    // Au repos : tiroir complètement hors écran à gauche (translateX(-100%)).
    expect(await panelRightEdge(page)).toBeLessThanOrEqual(1)

    await page.getByRole('button', { name: 'Menu de navigation' }).hover()
    await expect.poll(() => panelRightEdge(page)).toBeGreaterThan(300)
    // Ouvert, le tiroir affleure le bord GAUCHE de l'écran.
    expect((await page.locator(PANEL).boundingBox()).x).toBe(0)
    await expect(
      page.locator(PANEL).getByRole('link', { name: 'Référentiel', exact: true }),
    ).toBeVisible()

    // Sortie du survol : rétraction après le délai de grâce (0,32 s + 0,2 s).
    await page.mouse.move(640, 500)
    await expect.poll(() => panelRightEdge(page)).toBeLessThanOrEqual(1)
  })

  test('épinglé : contenu docké à 1280 px, superposé à 920 px ; l’épinglage survit au rechargement', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/#/')

    await page.getByRole('button', { name: 'Menu de navigation' }).click()
    await page.getByRole('button', { name: 'Épingler le panneau ouvert' }).click()

    const paddingLeft = () =>
      page.locator('.app-main').evaluate((el) => getComputedStyle(el).paddingLeft)

    // >= 921 px : le tiroir devient une vraie barre latérale, le contenu est décalé.
    await expect.poll(paddingLeft).toBe('320px')
    expect((await page.locator(PANEL).boundingBox()).x).toBe(0)

    // Persistance (localStorage 'humanome-menu-pinned') : survit au rechargement.
    await page.reload()
    await expect.poll(paddingLeft).toBe('320px')
    expect(
      await page
        .getByRole('button', { name: 'Détacher le panneau' })
        .getAttribute('aria-pressed'),
    ).toBe('true')

    // Sous le seuil (920 px) : toujours épinglé/ouvert mais EN SUPERPOSITION.
    await page.setViewportSize({ width: 920, height: 800 })
    expect(parseFloat(await paddingLeft())).toBeLessThan(30)
    expect((await page.locator(PANEL).boundingBox()).x).toBe(0)
  })

  test('au défilement, la grappe d’actions (thème + aide + Menu) reste visible en haut à droite', async ({
    page,
  }) => {
    await page.goto('/#/referentiel')
    await expect(
      page.getByRole('heading', { name: 'Référentiel de compétences' }),
    ).toBeVisible()

    await page.evaluate(() => window.scrollTo(0, 1600))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600)

    // position: fixed — la grappe reste dans la fenêtre, collée en haut.
    const box = await page.locator('.app-header-actions').boundingBox()
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeLessThan(60)
    await expect(page.getByRole('button', { name: 'Menu de navigation' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Passer au thème/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Aide sur cette rubrique' })).toBeVisible()
  })
})

test.describe('mobile (tap)', () => {
  // Émulation mobile chromium : (hover: none) -> pas d'ouverture au survol,
  // le tap sur le bouton est la seule entrée ; tap extérieur referme.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('le tap ouvre le tiroir depuis le bord gauche, un tap extérieur le referme', async ({
    page,
  }) => {
    await page.goto('/#/')
    expect(await panelRightEdge(page)).toBeLessThanOrEqual(1)

    await page.getByRole('button', { name: 'Menu de navigation' }).tap()
    await expect.poll(() => panelRightEdge(page)).toBeGreaterThan(300)
    expect((await page.locator(PANEL).boundingBox()).x).toBe(0)

    // Tap hors du panneau (le tiroir fait 320 px de large) -> fermeture.
    await page.touchscreen.tap(370, 500)
    await expect.poll(() => panelRightEdge(page)).toBeLessThanOrEqual(1)
  })
})
