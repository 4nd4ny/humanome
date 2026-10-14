// Garde anti-dérive : la CSP de production (web/public/.htaccess) doit laisser
// le navigateur appeler DIRECTEMENT chaque fournisseur de modèles de langage
// que le moteur sait joindre avec la clé personnelle de l'utilisateur (runs
// « clé personnelle », relances du dialogue de la cartographie) — décision du
// 2026-10-14 (journal carto, question 22). Sans cette garde, l'ajout d'un
// fournisseur au moteur casserait silencieusement ce mode en production
// (ni vitest ni le dev-server n'appliquent la CSP du .htaccess), comme
// `connect-src 'self'` le cassait jusque-là. Et rien d'autre ne s'ouvre.

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ANTHROPIC_BASE_URL } from '@engine/providers/anthropic.js'
import { GOOGLE_BASE_URL } from '@engine/providers/google.js'
import { OLLAMA_BASE_URL } from '@engine/providers/ollama.js'
import { OPENAI_BASE_URL } from '@engine/providers/openai.js'
import { OPENROUTER_BASE_URL } from '@engine/providers/openrouter.js'
import { XAI_BASE_URL } from '@engine/providers/xai.js'

function htaccess() {
  for (const c of [resolve(process.cwd(), 'public/.htaccess'), resolve(process.cwd(), 'web/public/.htaccess')]) {
    if (existsSync(c)) return readFileSync(c, 'utf8')
  }
  throw new Error(`csp-providers: web/public/.htaccess introuvable (cwd=${process.cwd()})`)
}

/** Directives de la CSP de production : nom → sources. */
function productionCsp() {
  const m = htaccess().match(/Header always set Content-Security-Policy\s+"([^"]+)"/)
  if (!m) throw new Error('CSP de production introuvable dans web/public/.htaccess')
  return new Map(
    m[1]
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...sources]) => [name, sources]),
  )
}

const PROVIDER_ORIGINS = [ANTHROPIC_BASE_URL, OPENAI_BASE_URL, GOOGLE_BASE_URL, XAI_BASE_URL, OPENROUTER_BASE_URL, OLLAMA_BASE_URL].map((url) => new URL(url).origin)

describe('CSP de production — appels directs aux fournisseurs (clé personnelle)', () => {
  const csp = productionCsp()

  it('connect-src autorise chaque fournisseur que le moteur appelle en direct', () => {
    const connect = csp.get('connect-src') ?? []
    for (const origin of PROVIDER_ORIGINS) expect(connect, `connect-src doit autoriser ${origin}`).toContain(origin)
  })

  it('et rien d’autre : notre API et ces fournisseurs seulement', () => {
    expect([...(csp.get('connect-src') ?? [])].sort()).toEqual(["'self'", ...PROVIDER_ORIGINS].sort())
  })

  it('les autres directives ne s’ouvrent pas', () => {
    expect(csp.get('default-src')).toEqual(["'self'"])
    expect(csp.get('object-src')).toEqual(["'none'"])
    expect(csp.get('frame-ancestors')).toEqual(["'self'"])
    expect(csp.get('img-src')).toEqual(["'self'", 'data:'])
  })
})
