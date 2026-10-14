// Scénario bout-en-bout de l'espace cartographe (DoD P9, plan-prompts) —
// le cartographe est le garde-fou humain obligatoire (cahier §3.3, §8).
// Joué contre le dev-server Vite (proxy /api -> docker :8080, provider mock) :
//
//   APPRENANT : création de compte -> portfolio (fixture 3 jours) -> run mock
//   complet (24 appels /api/llm) -> confidentialité « partagée avec mon
//   cartographe » sur une cartographie de journée -> copie serveur (opt-in)
//   -> émission d'un code d'invitation.
//   CARTOGRAPHE (contexte navigateur séparé) : compte + rôle `cartographe`
//   (endpoint admin grant-role, jeton dev — outillage pré-P12) -> accepte
//   l'invitation -> la cartographie apparaît dans sa file -> relecture ->
//   annotation « hallucination » sur une compétence -> correction du verdict
//   (statut « renvoi au cartographe », motif sentinelle) -> nouvelle révision
//   visible dans l'historique -> « valider et garantir » (révision figée).
//   APPRENANT : l'ancien partage est RETIRÉ (journal de la cartographie
//   D-43) — « Liens déjà créés » ne crée rien, l'API refuse (422) ; il ouvre
//   la cartographie dans l'interface (« Partager depuis l'interface »),
//   atteste sa majorité et crée un code de demande de version garantie.
//   CARTOGRAPHE : ouvre la RÉVISION garantie dans l'interface (« Ouvrir dans
//   l'interface de cartographie »), ouvre la demande, compose et publie la
//   version partagée dans le compte de l'apprenant, avec sa garantie (D-42).
//   APPRENANT : crée le lien (mot de passe) de cette version garantie.
//   CONTEXTE NEUF (employeur) : la page affiche « Relue et garantie par » ET
//   la correction du cartographe (compétence corrigée « à confirmer » :
//   c'est la RÉVISION qui a été publiée, pas le document d'origine).
//
// Un seul test séquentiel (l'état se construit d'étape en étape) ; emails
// uniques par run : rejouable sans nettoyage.
//
// Note d'implémentation : l'émission du code d'invitation par l'apprenant
// passe par l'API (POST api/cartographe/invitations, session + CSRF du
// navigateur apprenant) — le contrat M7 est côté serveur, l'UI apprenant
// dédiée n'existe pas encore (backlog M7).

import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

/** Requête SQL sur la base de DÉVELOPPEMENT du conteneur docker (jamais ailleurs). */
function devSql(query) {
  return execFileSync('docker', ['compose', 'exec', '-T', 'mysql', 'mysql', '-uhumanome', '-phumanome_dev', 'humanome', '-N', '-e', query], { cwd: root, stdio: 'pipe' }).toString().trim()
}

const FIXTURE_PATH = fileURLToPath(
  new URL('../../schemas/fixtures/portfolio-3-jours.md', import.meta.url),
)
const MIGRATE_TOKEN = 'dev_migrate_token' // docker-compose.yml (dev uniquement)
const APPRENANT_PASSWORD = 'mot-de-passe-e2e-2'
const CARTOGRAPHE_PASSWORD = 'mot-de-passe-e2e-3'
const SHARE_PASSWORD = 'partage-carto-1'
const JOUR_TITRE = 'Journée 2026-01-05 — Journal de Maya (carto e2e)'
const ANNOTATION_TEXTE =
  'Hallucination détectée : le passage cité ne figure pas dans la journée.'
const MOTIF_CORRIGE =
  'Correction e2e : preuve non concluante après relecture humaine, renvoi au cartographe.'

/**
 * Attribue un rôle du référentiel §2 à un compte (outillage admin pré-P12).
 * L'endpoint est gardé par le jeton de déploiement (X-Migrate-Token), MAIS il
 * reste soumis au CSRF global : joué depuis un navigateur porteur de session,
 * il faut donc aussi le jeton CSRF (double-submit). On le lit sur api/auth/me.
 */
async function grantRole(page, { email, role }) {
  return page.evaluate(
    async ({ email, role, token }) => {
      const me = await fetch('api/auth/me', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      }).then((r) => r.json())
      const res = await fetch('api/admin/grant-role', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Migrate-Token': token,
          'X-CSRF-Token': me.csrfToken,
        },
        credentials: 'same-origin',
        body: JSON.stringify({ email, role }),
      })
      return { status: res.status, body: await res.json().catch(() => null) }
    },
    { email, role, token: MIGRATE_TOKEN },
  )
}

/** Appel d'API depuis la page (cookie de session + jeton CSRF lu sur api/auth/me). */
async function apiCall(page, method, path, body) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const me = await fetch('api/auth/me', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      }).then((r) => r.json())
      const res = await fetch(`api/${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(me.csrfToken ? { 'X-CSRF-Token': me.csrfToken } : {}),
        },
        credentials: 'same-origin',
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: res.status, body: await res.json().catch(() => null) }
    },
    { method, path, body },
  )
}

/**
 * Inscription par l'UI #/compte (mêmes libellés que le parcours apprenant),
 * activation, connexion. Le code d'activation (D5) part par mail(), absent en
 * dev : le compte jetable est activé directement dans la base de DÉVELOPPEMENT.
 */
async function registerAccount(page, { displayName, email, password }) {
  await page.goto('/#/compte')
  await page.getByRole('button', { name: 'Inscription' }).click()
  await page.getByLabel('Nom affiché').fill(displayName)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Confirmez l’email').fill(email)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await expect(page.getByRole('heading', { name: 'Activer votre compte' })).toBeVisible()
  devSql(`UPDATE users SET email_verified_at = NOW() WHERE email = '${email}'`)
  await page.getByRole('button', { name: 'Retour à la connexion' }).click()
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByText(email, { exact: true })).toBeVisible()
}

test('parcours cartographe : invitation, relecture, annotation, révision, garantie, constat employeur', async ({
  page,
  browser,
}) => {
  const stamp = Date.now()
  const apprenantEmail = `e2e-apprenant-${stamp}@humanome.test`
  const cartographeEmail = `e2e-cartographe-${stamp}@humanome.test`
  const fixtureText = readFileSync(FIXTURE_PATH, 'utf8')

  await test.step('Apprenant : création de compte', async () => {
    await registerAccount(page, {
      displayName: 'Apprenante E2E',
      email: apprenantEmail,
      password: APPRENANT_PASSWORD,
    })
  })

  await test.step('Apprenant : portfolio (fixture 3 jours, segmentation vérifiée)', async () => {
    await page.goto('/#/portfolio')
    await page.getByRole('button', { name: 'Nouveau portfolio' }).click()
    await page.getByLabel('Titre du portfolio').fill('Journal de Maya (carto e2e)')
    await page.getByLabel('Texte du portfolio').fill(fixtureText)
    await expect(
      page.getByRole('heading', { name: 'Découpage en journées (3)' }),
    ).toBeVisible()
    await expect(page.getByText(/Enregistré localement à/)).toBeVisible()
  })

  await test.step('Apprenant : run mock complet (assistant 5 étapes, service humanome)', async () => {
    await page.goto('/#/espace/nouveau-run')
    await expect(page.getByTestId('espace-connecte')).toBeVisible()
    await page
      .getByRole('radio', { name: /Journal de Maya \(carto e2e\) — 3 journée\(s\)/ })
      .check()
    await page.getByRole('button', { name: 'Continuer' }).click()
    await expect(page.getByTestId('step-prompt')).toBeVisible()
    await page.getByRole('button', { name: 'Continuer' }).click()
    await expect(page.getByTestId('step-fournisseur')).toBeVisible()
    await page.getByRole('radio', { name: /Service humanome/ }).check()
    await page.getByRole('button', { name: 'Continuer' }).click()
    await expect(page.getByTestId('run-estimate')).toBeVisible()
    await page.getByRole('button', { name: 'Continuer' }).click()
    await expect(page.getByTestId('step-execution')).toBeVisible()
    await page.getByRole('button', { name: 'Lancer le run' }).click()
    // 24 appels mock + preuve de travail par appel : minutes, pas secondes.
    await expect(page.getByTestId('run-success')).toBeVisible({ timeout: 300_000 })
    await page.getByRole('button', { name: 'Retour à l’espace apprenant' }).click()
    await expect(page.getByTestId('carto-item')).toHaveCount(4) // 3 jours + 1 merge
  })

  const jourItem = page.getByTestId('carto-item').filter({ hasText: JOUR_TITRE })

  await test.step('Apprenant : confidentialité « partagée avec mon cartographe » + copie serveur (opt-in)', async () => {
    await expect(jourItem).toHaveCount(1)
    const visibility = jourItem.getByLabel(`Confidentialité de ${JOUR_TITRE}`)
    await visibility.selectOption('cartographe')
    await expect(visibility).toHaveValue('cartographe')

    await jourItem.getByRole('button', { name: 'Copier sur le serveur' }).click()
    await page
      .getByRole('button', { name: 'Je confirme la copie sur le serveur' })
      .click()
    await expect(jourItem.getByText('copie serveur')).toBeVisible()
  })

  let invitationCode = ''
  await test.step('Apprenant : émission d’un code d’invitation (10 caractères A-Z2-9, 30 jours)', async () => {
    // Contrat M7 : POST api/cartographe/invitations, session + CSRF — joué
    // depuis le navigateur apprenant (le jeton CSRF vient de GET api/auth/me).
    const invitation = await page.evaluate(async () => {
      const me = await fetch('api/auth/me', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      }).then((r) => r.json())
      const res = await fetch('api/cartographe/invitations', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-Token': me.csrfToken,
        },
        credentials: 'same-origin',
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(`POST invitations : HTTP ${res.status}`)
      return res.json()
    })
    invitationCode = invitation.code
    expect(invitationCode).toMatch(/^[A-Z2-9]{10}$/)
  })

  // ------------------------------------------------------------------
  // CARTOGRAPHE — contexte navigateur séparé (autre personne, autre session).
  // ------------------------------------------------------------------
  const cartoContext = await browser.newContext()
  const cartoPage = await cartoContext.newPage()

  await test.step('Cartographe : compte + rôle via l’endpoint admin (outillage pré-P12)', async () => {
    await registerAccount(cartoPage, {
      displayName: 'Cartographe E2E',
      email: cartographeEmail,
      password: CARTOGRAPHE_PASSWORD,
    })
    const granted = await grantRole(cartoPage, { email: cartographeEmail, role: 'cartographe' })
    expect(granted.status).toBe(200)
    expect(granted.body?.status).toBe('granted')
    // Rôle attribué après la connexion : la page est rechargée pour que
    // l'application relise la session (menus, espace Partage de l'interface).
    await cartoPage.reload()
    await expect(cartoPage.getByRole('group', { name: 'Encadrer et garantir' })).toHaveCount(1)
  })

  await test.step('Cartographe : accepte l’invitation, l’apprenant apparaît, la file se remplit', async () => {
    await cartoPage.goto('/#/cartographe')
    await expect(cartoPage.getByTestId('cartographe-connecte')).toBeVisible()
    await cartoPage.getByLabel('Code d’invitation').fill(invitationCode)
    await cartoPage.getByRole('button', { name: 'Accepter l’invitation' }).click()
    await expect(
      cartoPage.getByText('Invitation acceptée : l’apprenant est maintenant rattaché à vous.'),
    ).toBeVisible()
    await expect(cartoPage.getByTestId('apprentis-list')).toContainText('Apprenante E2E')

    const queueRow = cartoPage
      .getByTestId('cartographe-queue')
      .locator('tbody tr')
      .filter({ hasText: JOUR_TITRE })
    await expect(queueRow).toHaveCount(1)
    await expect(queueRow.getByText('À relire')).toBeVisible()
    await queueRow.getByRole('link', { name: 'Relire' }).click()
  })

  let competenceCode = ''
  await test.step('Cartographe : ouverture de la relecture (document + statut non garanti)', async () => {
    await expect(cartoPage.getByTestId('relecture-meta')).toContainText('Apprenante E2E')
    await expect(cartoPage.getByTestId('garantie-absente')).toBeVisible()

    // Choix ROBUSTE de la compétence à corriger : la première « présence
    // établie » du document réellement produit par le run mock (lue via
    // l'API cartographe, même session navigateur).
    competenceCode = await cartoPage.evaluate(async () => {
      const id = window.location.hash.split('/').pop()
      const res = await fetch(`api/cartographe/cartographies/${id}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      })
      if (!res.ok) throw new Error(`GET cartographie : HTTP ${res.status}`)
      const data = await res.json()
      const doc = data.cartographie?.document ?? data.document
      for (const pole of doc?.poles ?? []) {
        for (const comp of pole.competences ?? []) {
          if (!comp.courtCircuit && comp.verdict?.statut === 'présence établie') {
            return comp.code
          }
        }
      }
      return ''
    })
    expect(competenceCode).toMatch(/^\d/)
  })

  await test.step('Cartographe : annotation « hallucination » sur la compétence', async () => {
    await cartoPage.getByLabel('Compétence', { exact: true }).selectOption(competenceCode)
    await expect(cartoPage.getByTestId('annotation-panel')).toBeVisible()
    await cartoPage.getByLabel('Type', { exact: true }).selectOption('hallucination')
    await cartoPage.getByLabel('Annotation', { exact: true }).fill(ANNOTATION_TEXTE)
    await cartoPage.getByRole('button', { name: 'Annoter' }).click()
    await expect(cartoPage.getByTestId('annotations-list')).toContainText(
      'Hallucination signalée',
    )
    await expect(cartoPage.getByTestId('annotations-list')).toContainText(ANNOTATION_TEXTE)
  })

  await test.step('Cartographe : correction du verdict -> révision validée au schéma', async () => {
    await expect(cartoPage.getByTestId('correction-editor')).toBeVisible()
    await cartoPage
      .getByLabel('Statut', { exact: true })
      .selectOption('renvoi au cartographe')
    await cartoPage.getByLabel('Motif', { exact: true }).fill(MOTIF_CORRIGE)
    await cartoPage
      .getByRole('button', { name: `Enregistrer la correction pour ${competenceCode}` })
      .click()
    await expect(cartoPage.getByTestId('pending-corrections')).toContainText(competenceCode)
    await expect(cartoPage.getByTestId('pending-corrections')).toContainText(
      'renvoi au cartographe',
    )

    await cartoPage
      .getByLabel('Note de révision')
      .fill('Relecture e2e : hallucination signalée, verdict renvoyé au cartographe.')
    await cartoPage.getByRole('button', { name: 'Proposer la révision' }).click()
    await expect(
      cartoPage.getByText('Révision enregistrée : elle apparaît dans l’historique ci-dessous.'),
    ).toBeVisible()
    await expect(cartoPage.getByTestId('revisions-list').locator('li')).toHaveCount(1)
    await expect(cartoPage.getByTestId('revisions-list')).toContainText('Cartographe E2E')
    // La vue bascule sur la révision fraîchement créée : c'est ELLE qui sera figée.
    await expect(cartoPage.getByTestId('viewing-revision')).toBeVisible()
  })

  await test.step('Cartographe : « valider et garantir » (signature, révision figée)', async () => {
    await cartoPage.getByRole('button', { name: 'Valider et garantir' }).click()
    await expect(cartoPage.getByTestId('garantie-confirm')).toContainText('sera figée')
    await cartoPage.getByRole('button', { name: 'Confirmer et garantir' }).click()
    await expect(cartoPage.getByTestId('garantie-badge')).toBeVisible()
    await expect(cartoPage.getByTestId('garantie-badge')).toContainText(
      'garantie par Cartographe E2E',
    )
    await expect(cartoPage.getByTestId('garantie-badge')).toContainText('figée')

    // Le badge de la file passe à « Garantie par … ».
    await cartoPage.goto('/#/cartographe')
    const queueRow = cartoPage
      .getByTestId('cartographe-queue')
      .locator('tbody tr')
      .filter({ hasText: JOUR_TITRE })
    await expect(queueRow.getByText('Garantie par Cartographe E2E')).toBeVisible()
  })

  await test.step('Apprenant : l’ancien partage est retiré (rien ne se crée, l’API refuse)', async () => {
    await page.goto('/#/espace')
    await expect(jourItem).toBeVisible()
    await expect(jourItem.getByRole('button', { name: 'Partager', exact: true })).toHaveCount(0)
    await jourItem.getByRole('button', { name: 'Liens déjà créés' }).click()
    const dialog = page.getByRole('region', { name: `Liens de partage de ${JOUR_TITRE}` })
    await expect(dialog).toContainText('Le partage par lien de cette cartographie est retiré')
    await expect(dialog.getByText('Aucun lien de partage pour cette cartographie.')).toBeVisible()
    await expect(dialog.getByLabel(/Mot de passe/)).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Fermer' }).click()

    // Même en appelant l'API directement : 422 share_retired.
    const list = await apiCall(page, 'GET', 'cartographies')
    const copy = (Array.isArray(list.body) ? list.body : list.body?.cartographies ?? []).find((c) => c.titre === JOUR_TITRE)
    expect(copy?.id).toBeTruthy()
    const refused = await apiCall(page, 'POST', `cartographies/${copy.id}/share`, { password: SHARE_PASSWORD, expiresInDays: 30 })
    expect(refused.status).toBe(422)
    expect(refused.body?.code).toBe('share_retired')
  })

  let requestCode = ''
  await test.step('Apprenant : « Partager depuis l’interface », attestation, code de demande de version garantie', async () => {
    await jourItem.getByRole('button', { name: 'Partager depuis l’interface' }).click()
    await expect(page).toHaveURL(/#\/cartographie\/partage$/)
    await expect(page.locator('.carto-context-dataset')).toHaveText(JOUR_TITRE)
    await page.getByRole('checkbox', { name: /J’atteste avoir 18 ans ou plus/ }).check()
    await page.getByRole('button', { name: 'Confirmer et continuer' }).click()
    const section = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Faire publier une version par votre cartographe' }),
    })
    await section.getByRole('checkbox', { name: /au moment de cette demande/ }).check()
    await section.getByRole('button', { name: 'Créer un code de demande' }).click()
    requestCode = (await section.locator('.carto-share-created code').innerText()).trim()
    expect(requestCode).toMatch(/^[A-Z2-9]{10}$/)
  })

  const VERSION_TITRE = 'Journée relue par le cartographe (e2e)'
  await test.step('Cartographe : ouvre la révision garantie dans l’interface, puis la demande', async () => {
    const queueRow = cartoPage
      .getByTestId('cartographe-queue')
      .locator('tbody tr')
      .filter({ hasText: JOUR_TITRE })
    await queueRow.getByRole('link', { name: 'Relire' }).click()
    await expect(cartoPage.getByTestId('garantie-badge')).toContainText('garantie par Cartographe E2E')
    await cartoPage.getByTestId('revisions-list').getByRole('button', { name: 'Voir' }).first().click()
    await expect(cartoPage.getByTestId('viewing-revision')).toBeVisible()
    await cartoPage.getByRole('button', { name: 'Ouvrir dans l’interface de cartographie' }).click()

    await expect(cartoPage).toHaveURL(/#\/cartographie\/partage$/)
    await expect(cartoPage.locator('.carto-context-dataset')).toHaveText(new RegExp(`^${JOUR_TITRE.replace(/[()]/g, '\\$&')} — révision \\d+$`))
    await cartoPage.getByLabel(/Code de demande/).fill(requestCode)
    await cartoPage.getByRole('button', { name: 'Ouvrir la demande' }).click()
    await expect(cartoPage.getByRole('heading', { name: 'Version garantie pour Apprenante E2E' })).toBeVisible()
  })

  await test.step('Cartographe : compose, garantit et publie dans le compte de l’apprenant', async () => {
    await cartoPage.getByRole('textbox', { name: 'Titre vu par le destinataire' }).fill(VERSION_TITRE)
    await cartoPage.getByRole('button', { name: 'Suivant : relire' }).click()
    await cartoPage.getByRole('checkbox', { name: /J’ai relu le titre et les extraits/ }).check()
    await cartoPage.getByRole('button', { name: 'Suivant : aperçu' }).click()
    const preview = cartoPage.getByLabel('Aperçu verrouillé de la version partagée')
    await expect(preview.getByTestId('share-garantie')).toContainText('Relue et garantie par Cartographe E2E')
    await cartoPage.getByRole('checkbox', { name: /Je garantis cette version/ }).check()
    await cartoPage.getByRole('button', { name: 'Publier pour Apprenante E2E, avec ma garantie' }).click()
    await expect(cartoPage.getByText(/est publiée dans le compte de Apprenante E2E, avec votre garantie/)).toBeVisible()
  })

  let shareUrl = ''
  await test.step('Apprenant : la version garantie est là ; il crée son lien, avec mot de passe', async () => {
    await page.reload()
    await page.getByRole('link', { name: 'Partage', exact: true }).click()
    const item = page.locator('.carto-share-version').filter({ hasText: VERSION_TITRE })
    await expect(item.getByText(/Garantie par Cartographe E2E, le .* : publiée à votre demande\./)).toBeVisible()
    await item.getByRole('button', { name: 'Liens et accès' }).click()
    await item.getByLabel('Mot de passe (facultatif)').fill(SHARE_PASSWORD)
    await item.getByRole('button', { name: 'Créer le lien' }).click()
    shareUrl = await page.getByRole('textbox', { name: 'Lien de partage' }).inputValue()
    expect(shareUrl).toMatch(/\/#\/partage\/[0-9a-f]{32}$/)
  })

  await test.step('Employeur (contexte NEUF) : « Relue et garantie par » ET la correction du cartographe', async () => {
    const employerContext = await browser.newContext({ locale: 'fr-FR' })
    const employerPage = await employerContext.newPage()
    await employerPage.goto(shareUrl)
    await employerPage.getByLabel('Mot de passe du lien').fill(SHARE_PASSWORD)
    await employerPage
      .getByRole('button', { name: 'Consulter la cartographie' })
      .click()
    await expect(employerPage.getByRole('heading', { level: 1, name: VERSION_TITRE })).toBeVisible()

    // 1. La garantie du cartographe qui a publié.
    await expect(employerPage.getByTestId('share-garantie')).toContainText(
      'Relue et garantie par Cartographe E2E',
    )

    // 2. C'est la RÉVISION garantie qui a été publiée : la compétence dont le
    // verdict « présence établie » a été corrigé en « renvoi au cartographe »
    // est « à confirmer » (elle ne l'est pas dans le document d'origine).
    const corrected = employerPage
      .locator('.carto-shared-comp')
      .filter({ has: employerPage.locator('.carto-code').getByText(competenceCode, { exact: true }) })
    await expect(corrected).toHaveCount(1)
    await expect(corrected).toContainText('à confirmer')
    await employerContext.close()
  })

  await cartoContext.close()
})
