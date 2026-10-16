// Découpe l'archive d'un jeu de l'interface (master v4) en fichiers lus à la
// demande (journal D-67) — la démonstration du site :
//
//   node web/scripts/carto-demo-split.mjs <archive.json> <dossier>
//
// écrit <dossier>/index.json et <dossier>/<version>/… (jours, portfolio,
// compétences, pôles, délibérations). À déposer sous data/demo/carto/ du site :
// le dossier de version d'abord, l'index ensuite (il le désigne). Un ancien
// dossier de version ne se retire JAMAIS : une démonstration qu'un visiteur a
// enrichie (une réponse, un repère) n'est plus remplacée (D-57) et continue
// d'y lire ses fichiers. Le site seulement : la démonstration contient un
// journal réel, elle n'entre jamais dans le dépôt.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { splitArchive } from '../src/carto/core/split.js'

const [src, out] = process.argv.slice(2)
if (!src || !out) {
  console.error('usage : node web/scripts/carto-demo-split.mjs <archive.json> <dossier>')
  process.exit(2)
}
const archive = JSON.parse(readFileSync(src, 'utf8'))
if (archive?.kind !== 'competency-map-master' || !String(archive.schemaVersion ?? '').startsWith('4.')) {
  console.error(`${src} : pas une archive de l’interface (master v4)`)
  process.exit(1)
}
const { index, files } = splitArchive(archive)
let bytes = 0
for (const f of files) {
  const path = join(out, f.path)
  mkdirSync(dirname(path), { recursive: true })
  const text = JSON.stringify(f.value)
  bytes += Buffer.byteLength(text)
  writeFileSync(path, text)
}
const indexText = JSON.stringify(index)
writeFileSync(join(out, 'index.json'), indexText)
console.log(JSON.stringify({ version: index.remote.version, files: files.length, indexBytes: Buffer.byteLength(indexText), filesBytes: bytes }))
