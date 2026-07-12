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
//   APPRENANT : crée un lien de partage employeur sur cette cartographie.
//   CONTEXTE NEUF (employeur) : la page de partage affiche la mention
//   « garantie par » ET le verdict corrigé (motif sentinelle servi par la
//   RÉVISION garantie, pas par le document d'origine).
//
// Un seul test séquentiel (l'état se construit d'étape en étape) ; emails
// uniques par run : rejouable sans nettoyage.
//
// Note d'implémentation : l'émission du code d'invitation par l'apprenant
// passe par l'API (POST api/cartographe/invitations, session + CSRF du
// navigateur apprenant) — le contrat M7 est côté serveur, l'UI apprenant
// dédiée n'existe pas encore (backlog M7).

import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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

/** Inscription par l'UI #/compte (mêmes libellés que le parcours apprenant). */
async function registerAccount(page, { displayName, email, password }) {
  await page.goto('/#/compte')
  await page.getByRole('button', { name: 'Inscription' }).click()
  await page.getByLabel('Nom affiché').fill(displayName)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await expect(page.getByText('Compte créé, bienvenue !')).toBeVisible()
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

  let shareUrl = ''
  await test.step('Apprenant : création du lien de partage employeur', async () => {
    await page.goto('/#/espace')
    await expect(jourItem).toBeVisible()
    await jourItem.getByRole('button', { name: 'Partager' }).click()
    await page
      .getByLabel(/Mot de passe du lien \(8 caractères min\)/)
      .fill(SHARE_PASSWORD)
    await page.getByRole('button', { name: 'Créer le lien de partage' }).click()
    shareUrl = (await page.getByTestId('share-url').textContent())?.trim() ?? ''
    expect(shareUrl).toMatch(/\/#\/partage\/[0-9a-f]{32}$/)
    await page.getByRole('button', { name: 'Fermer' }).click()
  })

  await test.step('Employeur (contexte NEUF) : mention « garantie par » ET verdict corrigé', async () => {
    const employerContext = await browser.newContext()
    const employerPage = await employerContext.newPage()
    await employerPage.goto(shareUrl)
    await employerPage.getByLabel('Mot de passe du lien').fill(SHARE_PASSWORD)
    await employerPage
      .getByRole('button', { name: 'Consulter la cartographie' })
      .click()
    await expect(employerPage.getByRole('heading', { name: JOUR_TITRE })).toBeVisible()

    // 1. La garantie posée en P9 remplace le null de M6 : mention visible.
    await expect(employerPage.getByTestId('share-garantie')).toContainText(
      'garantie par Cartographe E2E',
    )

    // 2. Le document servi est celui de la RÉVISION garantie : la compétence
    // corrigée porte le statut « renvoi au cartographe » et le motif
    // sentinelle — qui n'existent QUE dans la révision. Sélection au clavier
    // (secteur = role button, Entrée = sélection).
    const sector = employerPage.locator(
      `path[data-kind="competence"][data-id^="${competenceCode} "]`,
    )
    await expect(sector).toHaveCount(1)
    await sector.press('Enter')
    const verdict = employerPage.getByTestId('verdict-block')
    await expect(verdict).toBeVisible()
    await expect(verdict).toContainText('renvoi au cartographe')
    await expect(verdict).toContainText(MOTIF_CORRIGE)
    await employerContext.close()
  })

  await cartoContext.close()
})
