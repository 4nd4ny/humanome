// Traçabilité (exigence timeline animée) : « lancer une animation et voir la
// cartographie se construire avec le temps, sur les 59 feuilles de la démo »
// — scénario joué sur la VRAIE démo (#/merge) servie par le dev-server Vite,
// dans un vrai navigateur : vue finale par défaut (331 secteurs, parité),
// retour à la première feuille (11 compétences), lecture animée (le sunburst
// se construit, la lecture s'arrête d'elle-même sur la dernière feuille et le
// rendu final correspond à la vue merge statique), pause automatique à la
// sélection d'un secteur pendant la lecture.
//
// LOCAL UNIQUEMENT (docs/tests-e2e.md). Contrairement au parcours apprenant,
// AUCUNE API docker requise : le document merge de démo est bundlé
// statiquement (ADR-003) — seul le dev-server Vite (webServer de
// playwright.config.js) est nécessaire.

import { test, expect } from '@playwright/test'

// La lecture automatique est coupée par prefers-reduced-motion : on force la
// préférence « no-preference » pour tester le chemin animé.
test.use({ reducedMotion: 'no-preference' })

test('timeline de la démo : la cartographie se construit sur les 59 feuilles de #/merge', async ({
  page,
}) => {
  const slider = page.getByRole('slider', {
    name: 'Position dans les feuilles du portfolio',
  })
  const playButton = page.getByRole('button', {
    name: /Lancer la lecture|Mettre la lecture en pause/,
  })
  const paths = page.locator('svg.sunburst path')
  const counter = page.getByTestId('timeline-counter')

  await page.goto('/#/merge')

  await test.step('Vue finale par défaut : scrubber sur la 59e feuille, 331 secteurs (parité)', async () => {
    await expect(slider).toBeVisible()
    await expect(slider).toHaveAttribute('max', '58')
    await expect(slider).toHaveValue('58')
    await expect(slider).toHaveAttribute('aria-valuetext', '29/03/2026')
    await expect(paths).toHaveCount(331)
    await expect(counter).toHaveText('54 compétences sur la carte · score du jour 61')
  })

  await test.step('Première feuille : la carte se réduit aux 11 compétences établies ce jour-là', async () => {
    await page.getByRole('button', { name: 'Première feuille' }).click()
    await expect(slider).toHaveValue('0')
    // 7 pôles + 11 compétences x 6 paths = 73.
    await expect(paths).toHaveCount(73)
    await expect(page.locator('svg.sunburst path[data-kind="competence"]')).toHaveCount(11)
    await expect(counter).toHaveText('11 compétences sur la carte · score du jour 13')
  })

  await test.step('Lecture depuis la trame 0 : le scrubber avance et le sunburst se construit', async () => {
    await page
      .getByRole('combobox', { name: 'Vitesse de lecture' })
      .selectOption('150') // Rapide : 59 trames ~ 9 s
    await playButton.click()
    await expect(playButton).toHaveAttribute('aria-pressed', 'true')
    // La valeur du slider augmente d'elle-même…
    await expect.poll(async () => Number(await slider.inputValue()), { timeout: 15_000 })
      .toBeGreaterThan(5)
    // … et le nombre de <path> du sunburst a crû depuis la trame 0 (73).
    const midCount = await paths.count()
    expect(midCount).toBeGreaterThan(73)
    expect(midCount).toBeLessThanOrEqual(331)
  })

  await test.step('La lecture s arrête d elle-même sur la dernière feuille (rendu final identique)', async () => {
    await expect(slider).toHaveValue('58', { timeout: 30_000 })
    await expect(playButton).toHaveAttribute('aria-pressed', 'false')
    await expect(paths).toHaveCount(331)
    await expect(counter).toHaveText('54 compétences sur la carte · score du jour 61')
  })

  await test.step('Sélection d un secteur pendant la lecture : pause automatique + panneau à date', async () => {
    // Relecture depuis la dernière trame : repart de 0 (comportement testé en
    // unitaire), puis on laisse quelques trames défiler.
    await playButton.click()
    await expect(playButton).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => Number(await slider.inputValue()), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(3)
    // 1.04 est établie dès la première feuille : présente sur toutes les
    // trames. dispatchEvent (pas de déplacement de souris : le survol d'un
    // autre secteur suffirait déjà à suspendre la lecture).
    const sectorId = '1.04 — Métacognition & Humilité Épistémique'
    const sector = page.locator(
      `svg.sunburst path[data-kind="competence"][data-id="${sectorId}"]`,
    )
    await sector.dispatchEvent('click')
    await expect(playButton).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('heading', { name: sectorId })).toBeVisible()
    // Agrégats cumulés à la date de la trame courante (niveau · points).
    await expect(page.locator('.details-meta')).toContainText('points')
    // La lecture est bien suspendue : la trame ne bouge plus (> 3 ticks à 150 ms).
    const frozen = await slider.inputValue()
    await page.waitForTimeout(600)
    await expect(slider).toHaveValue(frozen)
  })
})
