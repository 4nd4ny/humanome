// Smoke test of the BUILT bundle (dist/) under the file:// target (ADR-003,
// plan-fusion-visu étape 6): loads dist/index.html in jsdom with a file:// URL
// (no server, no fetch available), executes the IIFE bundle, and checks that
// the merge view renders the 331 sector paths of the original diagram.
//
// Usage: npm run build && node scripts/smoke-dist.mjs
import { readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(webRoot, 'dist')
const html = readFileSync(join(distDir, 'index.html'), 'utf8')

// The entry must be a classic script (type="module" is CORS-blocked on file://).
const moduleTag = html.match(/<script[^>]*type="module"[^>]*>/)
if (moduleTag) {
  throw new Error(`dist/index.html still loads a module script (breaks file://): ${moduleTag[0]}`)
}
const scriptMatch = html.match(/<script[^>]*src="(\.\/[^"]+\.js)"[^>]*><\/script>/)
if (!scriptMatch) throw new Error('dist/index.html: no relative classic <script src> found')
const bundlePath = join(distDir, scriptMatch[1])
const bundle = readFileSync(bundlePath, 'utf8')

const dom = new JSDOM(html, {
  url: `${pathToFileURL(join(distDir, 'index.html')).href}#/merge`,
  runScripts: 'outside-only',
  pretendToBeVisual: true,
})
// file:// reality: no fetch. Any network call from the merge view must fail loudly.
delete dom.window.fetch

dom.window.eval(bundle)

// React 18 flushes the initial render asynchronously (scheduler): poll briefly.
const deadline = Date.now() + 5000
await new Promise((resolveWait, rejectWait) => {
  const tick = () => {
    const paths = dom.window.document.querySelectorAll('svg.sunburst path')
    if (paths.length > 0) return resolveWait()
    if (Date.now() > deadline) return rejectWait(new Error('sunburst never rendered'))
    setTimeout(tick, 50)
  }
  tick()
})

const doc = dom.window.document
const checks = {
  'paths sunburst (vue merge)': [doc.querySelectorAll('svg.sunburst path').length, 331],
  'secteurs colorés (pôles + compétences)': [doc.querySelectorAll('svg.sunburst path.sector').length, 61],
  'fonds gris (54 x 5)': [doc.querySelectorAll('svg.sunburst path.gray-sector').length, 270],
  'jours de la heatmap': [doc.querySelectorAll('rect.heatmap-day').length, 59],
}
let failed = 0
for (const [label, [actual, expected]] of Object.entries(checks)) {
  const ok = actual === expected
  if (!ok) failed += 1
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}: ${actual} (attendu ${expected})`)
}
if (!doc.querySelector('style')?.textContent.includes('.app-header')) {
  failed += 1
  console.log('FAIL CSS inline non injectée')
} else {
  console.log('OK  CSS injectée dans <style> par le bundle')
}
if (failed > 0) {
  console.error(`\nSmoke test dist/ : ${failed} échec(s)`)
  process.exit(1)
}
console.log('\nSmoke test dist/ : OK — la vue merge fonctionne depuis file:// sans serveur')
