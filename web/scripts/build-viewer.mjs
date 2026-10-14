// Construit le MODÈLE de la copie autonome (spec §11, point 2) :
// vite build (vite.viewer.config.js) puis inlining du JS et du CSS dans un
// seul fichier HTML : public/carto/viewer-template.html. L'interface y insère
// l'archive au moment de l'export ; le fichier s'ouvre en file://.
import { build } from 'vite'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = dirname(dirname(fileURLToPath(import.meta.url)))
const out = join(web, 'dist-viewer')
await build({ configFile: join(web, 'vite.viewer.config.js'), root: web, logLevel: 'warn' })

let html = readFileSync(join(out, 'carto-viewer.html'), 'utf8')
const read = (rel) => readFileSync(join(out, rel.replace(/^\.\//, '')), 'utf8')
// CSS : <link rel="stylesheet" crossorigin href="./assets/x.css"> → <style>
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => `<style>${read(href)}</style>`)
// JS : <script type="module" crossorigin src="./assets/x.js"></script> → script classique en fin de body
let js = ''
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  js += read(src)
  return ''
})
if (!js) throw new Error('bundle JS introuvable dans dist-viewer')
const safeJs = js.replace(/<\/script/gi, '<\\/script')
// Remplacement par FONCTION : une chaîne de remplacement interpréterait les
// motifs $& $` $' que le code minifié contient forcément.
html = html.replace('</body>', () => `<script>${safeJs}</script>\n</body>`)
if (!/id="carto-data">null<\/script>/.test(html)) throw new Error('emplacement des données absent du modèle')
mkdirSync(join(web, 'public', 'carto'), { recursive: true })
writeFileSync(join(web, 'public', 'carto', 'viewer-template.html'), html)
rmSync(out, { recursive: true, force: true })
console.log(`viewer-template.html : ${(html.length / 1024).toFixed(0)} Ko`)
