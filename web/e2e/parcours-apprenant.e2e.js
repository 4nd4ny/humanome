// Scénario bout-en-bout du parcours apprenant (DoD P8, plan-prompts) —
// LE parcours cœur du MVP, joué contre le dev-server Vite (proxy /api ->
// docker :8080, provider LLM mock) :
//
//   création de compte -> portfolio (fixture 3 jours, segmentation vérifiée)
//   -> run mock complet via « Service humanome » (24 appels /api/llm)
//   -> cartographies dans le tableau de bord -> visualisation -> opt-in
//   copie serveur -> partage lien + mot de passe -> ouverture du lien dans
//   un CONTEXTE NAVIGATEUR NEUF (équivalent navigation privée : mauvais mdp
//   refusé, bon mdp -> document rendu) -> export d'archive (validée au
//   schéma archive-export par le moteur) -> suppression de compte -> le
//   lien de partage répond 404.
//
// Un seul test séquentiel (l'état — compte, IndexedDB, lien de partage —
// se construit d'étape en étape) ; chaque étape du DoD est un test.step
// nommé en français. Email unique par run : rejouable sans nettoyage.

import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validateDocument } from '../../engine/src/validation.js'

const FIXTURE_PATH = fileURLToPath(
  new URL('../../schemas/fixtures/portfolio-3-jours.md', import.meta.url),
)
const SHARE_PASSWORD = 'partage-test-1'
const ACCOUNT_PASSWORD = 'mot-de-passe-e2e-1'

test('parcours apprenant complet : compte, portfolio, run mock, partage, export, suppression', async ({
  page,
  browser,
}, testInfo) => {
  const email = `e2e-${Date.now()}@humanome.test`
  const fixtureText = readFileSync(FIXTURE_PATH, 'utf8')

  // Compteur des appels LLM réels (POST api/llm, hors défis PoW GET
  // api/llm/challenge) : le run mock 3 jours doit en faire exactement 24
  // (3 journées × (7 pôles + 1 synthèse kairos)).
  let llmCalls = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/llm$/.test(request.url())) llmCalls += 1
  })

  await test.step('Création de compte (email unique par run)', async () => {
    await page.goto('/#/compte')
    await page.getByRole('button', { name: 'Inscription' }).click()
    await page.getByLabel('Nom affiché').fill('Testeuse E2E')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Mot de passe').fill(ACCOUNT_PASSWORD)
    await page.getByRole('button', { name: 'Créer mon compte' }).click()
    await expect(page.getByText('Compte créé, bienvenue !')).toBeVisible()
    await expect(page.getByText(email, { exact: true })).toBeVisible()
  })

  await test.step('Création du portfolio : collage de la fixture, segmentation en 3 journées', async () => {
    await page.goto('/#/portfolio')
    await page.getByRole('button', { name: 'Nouveau portfolio' }).click()
    await page.getByLabel('Titre du portfolio').fill('Journal de Maya (e2e)')
    await page.getByLabel('Texte du portfolio').fill(fixtureText)

    // Segmentation automatique vérifiée : 3 journées datées.
    await expect(
      page.getByRole('heading', { name: 'Découpage en journées (3)' }),
    ).toBeVisible()
    await expect(page.getByLabel('Date de la journée 1')).toHaveValue('2026-01-05')
    await expect(page.getByLabel('Date de la journée 2')).toHaveValue('2026-01-06')
    await expect(page.getByLabel('Date de la journée 3')).toHaveValue('2026-01-07')

    // La sauvegarde locale (différée) doit avoir eu lieu avant de quitter la vue.
    await expect(page.getByText(/Enregistré localement à/)).toBeVisible()
  })

  await test.step('Lancement du run : package par défaut, « Service humanome », estimation affichée', async () => {
    await page.goto('/#/espace/nouveau-run')
    await expect(page.getByTestId('espace-connecte')).toBeVisible()

    // (a) portfolio : la fixture segmentée en 3 journées.
    await page
      .getByRole('radio', { name: /Journal de Maya \(e2e\) — 3 journée\(s\)/ })
      .check()
    await page.getByRole('button', { name: 'Continuer' }).click()

    // (b) version de prompt : le paquet par défaut reste sélectionné.
    await expect(page.getByTestId('step-prompt')).toBeVisible()
    await expect(
      page.getByRole('radio', { name: /aurora-v3-reconstruit@1\.0\.0/ }),
    ).toBeChecked()
    await page.getByRole('button', { name: 'Continuer' }).click()

    // (c) fournisseur : « Service humanome » (proxy mock + preuve de travail).
    await expect(page.getByTestId('step-fournisseur')).toBeVisible()
    await page.getByRole('radio', { name: /Service humanome/ }).check()
    await page.getByRole('button', { name: 'Continuer' }).click()

    // (d) estimation affichée avant lancement.
    await expect(page.getByTestId('run-estimate')).toBeVisible()
    await expect(page.getByTestId('run-estimate')).toContainText('3 journée(s)')
    await expect(page.getByTestId('run-estimate')).toContainText('Coût estimé')
    await page.getByRole('button', { name: 'Continuer' }).click()
  })

  await test.step('Run complet (24 appels mock, preuve de travail par appel)', async () => {
    await expect(page.getByTestId('step-execution')).toBeVisible()
    await page.getByRole('button', { name: 'Lancer le run' }).click()
    await expect(page.getByTestId('run-progress')).toBeVisible()

    // 24 appels mock + PoW 20 bits par appel : minutes, pas secondes.
    await expect(page.getByTestId('run-success')).toBeVisible({ timeout: 300_000 })
    expect(llmCalls).toBe(24)
  })

  await test.step('Les cartographies apparaissent dans le tableau de bord', async () => {
    await page.getByRole('button', { name: 'Retour à l’espace apprenant' }).click()
    await expect(page.getByTestId('carto-item')).toHaveCount(4) // 3 jours + 1 merge
    await expect(
      page.getByTestId('carto-item').filter({ hasText: 'Parcours (merge)' }),
    ).toHaveCount(1)
  })

  const mergeItem = page.getByTestId('carto-item').filter({ hasText: 'Parcours (merge)' })

  await test.step('Ouverture de la visualisation (sunburst en lecture seule)', async () => {
    await mergeItem.getByRole('button', { name: 'Voir', exact: true }).click()
    await expect(page.getByTestId('carto-viewer')).toBeVisible()
    await expect(page.getByTestId('carto-viewer').locator('svg').first()).toBeVisible()
    await page.getByRole('button', { name: '← Retour au tableau de bord' }).click()
    await expect(mergeItem).toBeVisible()
  })

  await test.step('Opt-in explicite : copie de la cartographie sur le serveur (RGPD §6.2)', async () => {
    await mergeItem.getByRole('button', { name: 'Copier sur le serveur' }).click()
    await expect(page.getByTestId('carto-optin')).toContainText(
      'Copie serveur = choix explicite (RGPD).',
    )
    await page
      .getByRole('button', { name: 'Je confirme la copie sur le serveur' })
      .click()
    await expect(mergeItem.getByText('copie serveur')).toBeVisible()
  })

  let shareUrl = ''
  await test.step('Partage : lien + mot de passe, expiration par défaut (90 jours)', async () => {
    await mergeItem.getByRole('button', { name: 'Partager' }).click()
    await expect(page.getByLabel('Expiration (jours)')).toHaveValue('90')
    await page
      .getByLabel(/Mot de passe du lien \(8 caractères min\)/)
      .fill(SHARE_PASSWORD)
    await page.getByRole('button', { name: 'Créer le lien de partage' }).click()
    shareUrl = (await page.getByTestId('share-url').textContent())?.trim() ?? ''
    expect(shareUrl).toMatch(/\/#\/partage\/[0-9a-f]{32}$/)
    await page.getByRole('button', { name: 'Fermer' }).click()
  })

  await test.step('Lien ouvert dans un contexte neuf : mauvais mot de passe refusé, bon mot de passe -> document', async () => {
    // Contexte navigateur NEUF = navigation privée : aucune session, aucun
    // stockage local — exactement la situation de l'employeur destinataire.
    const employerContext = await browser.newContext()
    const employerPage = await employerContext.newPage()
    await employerPage.goto(shareUrl)
    await expect(
      employerPage.getByRole('heading', { name: 'Cartographie partagée' }),
    ).toBeVisible()

    // Mauvais mot de passe -> 403, message homogène, pas de document.
    await employerPage.getByLabel('Mot de passe du lien').fill('mauvais-mdp-e2e')
    await employerPage
      .getByRole('button', { name: 'Consulter la cartographie' })
      .click()
    await expect(employerPage.getByText('Mot de passe incorrect.')).toBeVisible()

    // Bon mot de passe -> le document merge est rendu en lecture seule.
    await employerPage.getByLabel('Mot de passe du lien').fill(SHARE_PASSWORD)
    await employerPage
      .getByRole('button', { name: 'Consulter la cartographie' })
      .click()
    await expect(
      employerPage.getByRole('heading', { name: /Cartographie — Journal de Maya \(e2e\)/ }),
    ).toBeVisible()
    await expect(employerPage.locator('.share-view svg').first()).toBeVisible()
    await employerContext.close()
  })

  await test.step('Export de l’archive : téléchargement + validation au schéma archive-export (moteur)', async () => {
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exporter toutes mes données' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^humanome-export-\d{4}-\d{2}-\d{2}\.json$/)

    const archivePath = testInfo.outputPath('archive-export.json')
    await download.saveAs(archivePath)
    const archive = JSON.parse(readFileSync(archivePath, 'utf8'))

    // Validation par le MOTEUR (même validateur que l'app), dans le test.
    const { valid, errors } = validateDocument('archive-export', archive)
    expect(errors).toEqual([])
    expect(valid).toBe(true)
    expect(archive.kind).toBe('archive-export')
    expect(archive.account?.email).toBe(email)
    expect(archive.portfolios).toHaveLength(1)
    expect(archive.cartographies).toHaveLength(4)
    await expect(page.getByText(/Archive téléchargée/)).toBeVisible()
  })

  await test.step('Suppression du compte (confirmation par email) : purge réelle', async () => {
    await page.goto('/#/compte')
    await page.getByLabel(/Pour confirmer, saisissez votre email/).fill(email)
    await page.getByRole('button', { name: 'Supprimer mon compte' }).click()
    await expect(
      page.getByText(/Votre compte a été supprimé : toutes vos données serveur ont été réellement purgées/),
    ).toBeVisible()
  })

  await test.step('Après la purge, le lien de partage répond 404', async () => {
    const lateContext = await browser.newContext()
    const latePage = await lateContext.newPage()
    await latePage.goto(shareUrl)
    await latePage.getByLabel('Mot de passe du lien').fill(SHARE_PASSWORD)
    await latePage.getByRole('button', { name: 'Consulter la cartographie' }).click()
    await expect(
      latePage.getByText('Ce lien de partage n’existe pas, a expiré ou a été révoqué par son auteur.'),
    ).toBeVisible()
    await lateContext.close()
  })
})
