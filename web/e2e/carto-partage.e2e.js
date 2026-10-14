// e2e — P6 de l'interface ultime de cartographie (spec §12, §14) : copie
// serveur et lien de partage RÉSERVÉS AUX ADULTES, contre la vraie API.
// Critère d'acceptation : « un mineur n'a jamais accès à la fonction ».
//
// Parcours réel dans Chromium : un compte apprenant SANS attestation ne voit
// que l'attestation, et le serveur refuse (403) de stocker une version
// partagée ou d'en créer un lien même si on l'appelle directement ; une fois
// l'attestation posée, l'apprenant compose, relit (un nom de tiers remplacé),
// publie et crée un lien sans mot de passe ; un navigateur anonyme ouvre le
// lien (vue employeur, jamais indexée, jeton jamais dans l'URL de l'API) ;
// l'auteur voit la consultation dans son journal des accès ; une nouvelle
// version publiée À LA PLACE de la première est servie par le même lien ;
// retirer l'attestation efface la version et son lien.
//
// LOCAL UNIQUEMENT (docs/tests-e2e.md) : API docker sur :8080 avec les
// migrations à jour (dont 022), dev-server Vite lancé par Playwright. Le code
// d'activation du compte part par mail(), absent en dev : le test active son
// compte jetable directement dans la base de DÉVELOPPEMENT (jamais ailleurs).
//   npx playwright test e2e/carto-partage.e2e.js

import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOU_PORTFOLIO, kairosDoc, louDays } from '../src/carto/test/fixtures.js'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const PASSWORD = 'mot-de-passe-e2e-partage'

const louFiles = () => [
  { name: 'journal-de-lou.md', mimeType: 'text/markdown', buffer: Buffer.from(LOU_PORTFOLIO) },
  ...Object.entries(louDays()).map(([date, poles]) => ({
    name: `${date}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ date, poles, kairos: kairosDoc(date) })),
  })),
]

/** Requête SQL sur la base de DÉVELOPPEMENT du conteneur docker. */
function devSql(query) {
  return execFileSync('docker', ['compose', 'exec', '-T', 'mysql', 'mysql', '-uhumanome', '-phumanome_dev', 'humanome', '-N', '-e', query], { cwd: root, stdio: 'pipe' }).toString().trim()
}

/** Appel d'API depuis la page (cookie de session + jeton CSRF lu sur api/auth/me). */
async function api(page, method, path, body) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const me = await fetch('api/auth/me', { headers: { Accept: 'application/json' }, credentials: 'same-origin' }).then((r) => r.json())
      const res = await fetch(`api/${path}`, {
        method,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(me.csrfToken ? { 'X-CSRF-Token': me.csrfToken } : {}) },
        credentials: 'same-origin',
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: res.status, body: await res.json().catch(() => null) }
    },
    { method, path, body },
  )
}

test('P6 : un mineur n’a jamais accès au partage ; un adulte publie, partage, puis tout se referme', async ({ page, browser }) => {
  const email = `e2e-partage-${Date.now()}@humanome.test`
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  await test.step('Compte apprenant activé, cartographie de Lou importée dans le navigateur', async () => {
    await page.goto('/#/cartographie')
    const created = await page.evaluate(
      async ({ email, password }) => {
        const res = await fetch('api/auth/register', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ email, emailConfirm: email, password, displayName: 'Lou E2E' }),
        })
        return res.status
      },
      { email, password: PASSWORD },
    )
    expect(created).toBe(201)
    devSql(`UPDATE users SET email_verified_at = NOW() WHERE email = '${email}'`)
    const login = await page.evaluate(
      async ({ email, password }) => {
        const res = await fetch('api/auth/login', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ email, password }),
        })
        window.dispatchEvent(new Event('humanome:auth'))
        return res.status
      },
      { email, password: PASSWORD },
    )
    expect(login).toBe(200)
    await page.locator('input[type="file"][accept]').setInputFiles(louFiles())
    await page.locator('.carto-col-center .carto-sun').waitFor()
  })

  await test.step('Sans attestation : l’espace ne propose que l’attestation, et le serveur refuse tout', async () => {
    await page.getByRole('link', { name: 'Partage', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Le partage par lien est réservé aux personnes majeures' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Nouvelle version partagée' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Publier|Créer le lien/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Confirmer et continuer' })).toBeDisabled()

    // Même en contournant l'interface, rien n'est stocké.
    const forged = await api(page, 'POST', 'cartographies', {
      type: 'partage',
      titre: 'Contournement',
      visibility: 'privee',
      document: { kind: 'carto-partage', schemaVersion: '1.0.0' },
    })
    expect(forged.status).toBe(403)
    expect(forged.body.code).toBe('adult_required')
    expect(devSql(`SELECT COUNT(*) FROM cartographies c JOIN users u ON u.id = c.user_id WHERE u.email = '${email}'`)).toBe('0')
  })

  let url = ''
  await test.step('Attestation, composition, relecture (nom de tiers remplacé), publication, lien sans mot de passe', async () => {
    await page.getByRole('checkbox', { name: /J’atteste avoir 18 ans ou plus/ }).check()
    await page.getByRole('button', { name: 'Confirmer et continuer' }).click()
    await expect(page.getByRole('heading', { name: 'Nouvelle version partagée' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Titre vu par le destinataire' }).fill('Lou — compétences de décembre')
    await page.getByRole('checkbox', { name: /Garder 3\.02 .* dans la version partagée/ }).uncheck()
    await page.getByRole('button', { name: 'Ajouter des extraits' }).nth(1).click()
    const picker = page.getByRole('region', { name: /Extraits proposés pour 2\.01/ })
    await picker.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: 'Suivant : relire' }).click()
    await page.getByRole('button', { name: 'Remplacer « Sam » par ‹nom›' }).click()
    await expect(page.getByText(/J’ai écouté ‹nom› expliquer/)).toBeVisible()
    await page.getByRole('checkbox', { name: /J’ai relu le titre et les extraits/ }).check()
    await page.getByRole('button', { name: 'Suivant : aperçu' }).click()
    const preview = page.getByLabel('Aperçu verrouillé de la version partagée')
    await expect(preview.getByRole('heading', { name: 'Lou — compétences de décembre' })).toBeVisible()
    await page.getByRole('checkbox', { name: /Je demande l’enregistrement/ }).check()
    await expect(page.getByRole('button', { name: 'Publier la version partagée' })).toBeDisabled()
    await page.getByRole('checkbox', { name: /J’atteste avoir 18 ans ou plus au moment de cette publication/ }).check()
    await page.getByRole('button', { name: 'Publier la version partagée' }).click()
    await expect(page.getByText(/est publiée\. Créez maintenant un lien/)).toBeVisible()

    // Ce que le serveur conserve : la version, sans portfolio ni nom de tiers.
    const stored = devSql(`SELECT c.document FROM cartographies c JOIN users u ON u.id = c.user_id WHERE u.email = '${email}' AND c.type = 'partage'`)
    expect(stored).toContain('carto-partage')
    expect(stored).not.toContain('Sam')
    expect(stored).not.toContain('maquette')
    expect(stored).not.toContain('3.02')

    await page.getByRole('button', { name: 'Créer le lien' }).click()
    url = await page.getByRole('textbox', { name: 'Lien de partage' }).inputValue()
    expect(url).toMatch(/#\/partage\/[0-9a-f]{32}\/ouvert$/)
  })

  await test.step('Un navigateur anonyme ouvre le lien : vue employeur, jamais indexée', async () => {
    const context = await browser.newContext({ locale: 'fr-FR' })
    const visitor = await context.newPage()
    const responses = []
    visitor.on('response', (r) => r.url().includes('/api/share/') && responses.push(r))
    await visitor.goto(url)
    await expect(visitor.getByRole('heading', { level: 1, name: 'Lou — compétences de décembre' })).toBeVisible()
    await expect(visitor.getByText(/J’ai écouté ‹nom› expliquer son idée/)).toBeVisible()
    await expect(visitor.getByText(/Singularité/)).toHaveCount(0) // compétence retirée
    expect(await visitor.locator('meta[name="robots"]').getAttribute('content')).toBe('noindex, nofollow, noarchive')
    expect(responses.length).toBeGreaterThan(0)
    // Le jeton voyage dans un en-tête, jamais dans l'URL de l'API.
    expect(responses.every((r) => !r.url().includes(url.split('/partage/')[1].split('/')[0]))).toBe(true)
    expect(responses[0].headers()['x-robots-tag']).toBe('noindex, nofollow, noarchive')
    await context.close()
  })

  await test.step('L’auteur voit la consultation, puis publie une nouvelle version À LA PLACE : même lien', async () => {
    await page.reload()
    await page.getByRole('link', { name: 'Partage', exact: true }).click()
    const item = page.locator('.carto-share-version').filter({ hasText: 'Lou — compétences de décembre' })
    await item.getByRole('button', { name: 'Liens et accès' }).click()
    await expect(item.getByText(/Consulté 1 fois/)).toBeVisible()

    await item.getByRole('button', { name: 'Publier une nouvelle version à la place' }).click()
    await page.getByRole('textbox', { name: 'Titre vu par le destinataire' }).fill('Lou — version allégée')
    await page.getByRole('button', { name: 'Suivant : relire' }).click()
    await page.getByRole('checkbox', { name: /J’ai relu le titre et les extraits/ }).check()
    await page.getByRole('button', { name: 'Suivant : aperçu' }).click()
    await expect(page.getByRole('radio', { name: /à la place de « Lou — compétences de décembre »/ })).toBeChecked()
    await page.getByRole('checkbox', { name: /Je demande l’enregistrement/ }).check()
    await page.getByRole('checkbox', { name: /J’atteste avoir 18 ans ou plus au moment de cette publication/ }).check()
    await page.getByRole('button', { name: 'Publier à la place de « Lou — compétences de décembre »' }).click()
    await expect(page.getByText(/« Lou — version allégée » remplace la version précédente/)).toBeVisible()
    expect(devSql(`SELECT COUNT(*) FROM cartographies c JOIN users u ON u.id = c.user_id WHERE u.email = '${email}' AND c.type = 'partage'`)).toBe('1')

    const context = await browser.newContext({ locale: 'fr-FR' })
    const visitor = await context.newPage()
    await visitor.goto(url)
    await expect(visitor.getByRole('heading', { level: 1, name: 'Lou — version allégée' })).toBeVisible()
    await expect(visitor.getByRole('heading', { level: 1, name: 'Lou — compétences de décembre' })).toHaveCount(0)
    await context.close()
  })

  await test.step('Retirer l’attestation efface la version et son lien', async () => {
    await page.getByRole('button', { name: 'Retirer mon attestation' }).click()
    await page.getByRole('button', { name: 'Confirmer : effacer mes versions partagées' }).click()
    await expect(page.getByRole('heading', { name: 'Le partage par lien est réservé aux personnes majeures' })).toBeVisible()
    await expect(page.getByText('Attestation retirée : 1 version partagée et ses liens ont été effacés du serveur.')).toBeVisible()
    expect(devSql(`SELECT COUNT(*) FROM cartographies c JOIN users u ON u.id = c.user_id WHERE u.email = '${email}'`)).toBe('0')

    const context = await browser.newContext({ locale: 'fr-FR' })
    const visitor = await context.newPage()
    await visitor.goto(url)
    await expect(visitor.getByRole('alert')).toHaveText('Ce lien de partage n’existe pas, a expiré ou a été révoqué par son auteur.')
    await context.close()
  })

  await test.step('Nettoyage : suppression du compte de test (purge réelle)', async () => {
    devSql(`DELETE FROM users WHERE email = '${email}'`)
  })

  expect(errors).toEqual([])
})
