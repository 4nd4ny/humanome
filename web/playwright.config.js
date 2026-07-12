// Playwright — tests bout-en-bout du parcours apprenant (DoD P8).
//
// LOCAL UNIQUEMENT (CLAUDE.md : « Tests : … Playwright (e2e, local uniquement) ») :
// jamais déployé, jamais en CI OVH. Prérequis : l'API docker tourne sur
// http://localhost:8080 avec le provider LLM mock (docker-compose.override.yml,
// DEMO_PROVIDER=mock) — voir docs/tests-e2e.md.
//
// Le serveur web est le dev-server Vite (proxy /api -> :8080), lancé par
// Playwright lui-même (webServer) ; workers: 1 car le scénario partage l'état
// serveur (compte, quotas IP) et l'état navigateur (IndexedDB).

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Suffixe .e2e.js (et non .spec.js) : les motifs par défaut de vitest
  // incluent **/*.spec.js — ce suffixe dédié évite que `npm test` (vitest,
  // environnement jsdom) ne tente d'exécuter les scénarios Playwright.
  testMatch: '**/*.e2e.js',
  workers: 1,
  fullyParallel: false,
  // Le run mock complet (24 appels LLM + preuve de travail 20 bits par appel)
  // prend de l'ordre de la minute : timeout large, assertions à 30 s.
  timeout: 420_000,
  expect: { timeout: 30_000 },
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    locale: 'fr-FR',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
