// Garde anti-dérive : la CSP de production (web/public/.htaccess) autorise le
// script inline FIGÉ du srcdoc de la sandbox (protocol.js) par son hash sha256.
// Ce hash est fragile : toute retouche de buildSrcdoc() le change, et la CSP de
// prod n'est PAS exercée par vitest (jsdom) ni par le dev-server. Sans cette
// garde, une édition du srcdoc re-casserait SILENCIEUSEMENT la sandbox en
// production (l'iframe srcdoc hérite de la CSP parente — voir
// web/e2e/sandbox-isolation.e2e.js). Ici on recalcule le hash depuis la source
// et on exige qu'il figure tel quel dans le .htaccess.

import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { buildSrcdoc } from './protocol.js'

/** web/public/.htaccess, que vitest soit lancé depuis web/ ou depuis la racine. */
function htaccessPath() {
  for (const c of [resolve(process.cwd(), 'public/.htaccess'), resolve(process.cwd(), 'web/public/.htaccess')]) {
    if (existsSync(c)) return c
  }
  throw new Error(`csp-hash: web/public/.htaccess introuvable (cwd=${process.cwd()})`)
}

/** Contenu EXACT du <script> inline du srcdoc (hors balises), tel que le hash CSP. */
function srcdocInlineScript() {
  const html = buildSrcdoc()
  const start = html.indexOf('<script>') + '<script>'.length
  const end = html.indexOf('</script>')
  if (start < '<script>'.length || end < 0) {
    throw new Error('csp-hash: impossible de localiser le <script> inline du srcdoc')
  }
  return html.slice(start, end)
}

describe('CSP de production — hash du srcdoc de la sandbox', () => {
  const htaccess = readFileSync(htaccessPath(), 'utf8')
  const cspLine =
    htaccess.split('\n').find((l) => l.includes('Content-Security-Policy') && l.includes('script-src')) ?? ''

  it('le srcdoc est une chaîne figée sans interpolation de données', () => {
    // Deux appels doivent donner exactement le même HTML (sinon le hash dérive
    // à l'exécution et aucune valeur statique ne pourrait l'autoriser).
    expect(buildSrcdoc()).toBe(buildSrcdoc())
  })

  it('le hash sha256 du script inline figure dans web/public/.htaccess', () => {
    const digest = createHash('sha256').update(srcdocInlineScript(), 'utf8').digest('base64')
    const token = `'sha256-${digest}'`
    expect(
      cspLine.includes(token),
      `Le hash du srcdoc a changé : mets à jour la CSP de web/public/.htaccess (script-src) ` +
        `ET de la doc avec ${token}. Sinon la sandbox promptologue est cassée en production.`,
    ).toBe(true)
  })

  it('la CSP de prod autorise blob: (import ESM du worker) et worker-src blob:', () => {
    // Les deux autres piliers de l'exécution sandbox sous CSP héritée.
    expect(cspLine, 'script-src doit inclure blob:').toMatch(/script-src[^;]*\bblob:/)
    expect(htaccess, 'worker-src blob: requis').toMatch(/worker-src\s+blob:/)
  })
})
