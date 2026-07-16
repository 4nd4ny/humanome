// Traçabilité — exigence utilisateur « documentation en ligne complète par
// rôle », canal (a) : les manuels de prise en main doivent être « accessibles
// via le site sous forme de pages tutoriel ». Ce scénario le prouve en
// conditions réelles : un visiteur ANONYME (aucun compte, aucune connexion)
// ouvre le hub #/guides, voit les 9 cartes (8 rôles + portail noésiologie),
// ouvre le parcours visiteur, lit un chapitre rendu, coche sa progression —
// et la retrouve après rechargement (localStorage, sans compte).
//
// LOCAL UNIQUEMENT (CLAUDE.md) : joué contre le dev-server Vite lancé par
// Playwright (webServer, voir playwright.config.js). Aucun appel LLM : le hub
// est du Markdown embarqué au build ; l'API n'est utilisée que par fetchMe
// (session absente -> visiteur anonyme).

import { test, expect } from '@playwright/test'

test('hub public des guides : accès anonyme, lecture d’un chapitre, progression locale', async ({
  page,
}) => {
  await test.step('Visite anonyme de #/guides : 9 cartes visibles sans connexion', async () => {
    await page.goto('/#/guides')
    await expect(page.getByRole('heading', { level: 1, name: /Guides/ })).toBeVisible()
    // Une carte par parcours : 8 rôles + le portail noésiologie.
    await expect(page.locator('.guides-card')).toHaveCount(9)
    // Les deux cartes du « +1 » exigé : documentation admin et noésiologie.
    await expect(page.getByText('Administrer la plateforme')).toBeVisible()
    await expect(page.getByText('La noésiologie : une discipline sœur')).toBeVisible()
  })

  await test.step('Carte visiteur -> liste des chapitres du parcours', async () => {
    await page.getByText('Découvrir humanome.xyz').click()
    await expect(page).toHaveURL(/#\/guides\/visiteur$/)
    // La liste des chapitres et la progression (0 / 4) s'affichent sans compte.
    await expect(page.getByTestId('formation-progress')).toContainText('0 / 4')
  })

  await test.step('Ouverture du chapitre 01 : contenu rendu', async () => {
    await page
      .getByRole('link', { name: /cartographie de compétences humaines/ })
      .click()
    await expect(page).toHaveURL(/#\/guides\/visiteur\/01-qu-est-ce-qu-une-cartographie$/)
    const article = page.getByTestId('formation-chapitre')
    await expect(article).toBeVisible()
    await expect(article.getByRole('heading', { level: 1 })).toContainText(
      /cartographie de compétences humaines/,
    )
  })

  await test.step('La progression cochée persiste en local (rechargement) sans compte', async () => {
    const done = page.getByLabel('Chapitre terminé', { exact: true })
    await done.check()
    await expect(done).toBeChecked()
    // Sans compte : la progression est annoncée comme locale au navigateur.
    await expect(page.getByText(/Progression enregistrée dans ce navigateur/)).toBeVisible()

    await page.reload()
    await expect(page.getByLabel('Chapitre terminé', { exact: true })).toBeChecked()

    // Et la liste du parcours compte désormais 1 chapitre terminé sur 4.
    await page.goto('/#/guides/visiteur')
    await expect(page.getByTestId('formation-progress')).toContainText('1 / 4')
  })
})
