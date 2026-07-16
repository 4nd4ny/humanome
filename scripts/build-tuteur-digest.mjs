#!/usr/bin/env node
// Digest de documentation pour l'assistant tuteur (D9). Condense, à la build,
// (1) le plan du site par INTENTION (web/src/nav.js — les routes #/… par
// famille de but) et (2) les parcours de formation (content/formation/**, titres
// de chapitres). Le tuteur (proxy Haiku côté serveur) injecte ce digest dans son
// prompt système pour pointer chacun vers la bonne route — sans jamais exposer
// de contenu confidentiel (gabarits Twin9 exclus : on ne lit QUE nav + titres).
//
// Sortie : scripts/data/tuteur-digest.md (embarqué dans la release API par
// stage-api.sh, qui copie scripts/data/). Déterministe.
//
// Usage : node scripts/build-tuteur-digest.mjs

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FAMILIES, ROLE_LABELS } from '../web/src/nav.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const formationDir = join(repoRoot, 'content/formation')

/** Front-matter minimal (parcours, titre, chapitre) d'un fichier markdown. */
function frontMatter(raw) {
  const m = /^---\n([\s\S]*?)\n---/.exec(raw)
  const meta = {}
  if (m) {
    for (const line of m[1].split('\n')) {
      const kv = /^([a-zA-Z_]+):\s*(.*)$/.exec(line.trim())
      if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '')
    }
  }
  return meta
}

// --- 1. Plan du site par intention (nav.js) ---------------------------------

const lignes = []
lignes.push('# Digest de navigation humanome.xyz (pour l’assistant tuteur)')
lignes.push('')
lignes.push('## Ce que chaque profil peut faire, et par où passer (routes #/…)')
lignes.push('')
for (const family of FAMILIES) {
  const audience = family.audience ? ` — pour : ${family.audience}` : ''
  lignes.push(`### ${family.label} (${family.intent})${audience}`)
  for (const item of family.items) {
    const hint = item.hint ? ` — ${item.hint}` : ''
    const badge = item.badge ? ` [${item.badge}]` : ''
    lignes.push(`- ${item.label} : \`${item.href}\`${badge}${hint}`)
  }
  lignes.push('')
}

// --- 2. Parcours de formation (titres de chapitres) -------------------------

lignes.push('## Manuels de formation par profil (hub public #/guides)')
lignes.push('')
const parcours = readdirSync(formationDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()
for (const p of parcours) {
  const dir = join(formationDir, p)
  const index = existsSync(join(dir, 'index.md')) ? frontMatter(readFileSync(join(dir, 'index.md'), 'utf8')) : {}
  const titre = index.titre ?? p
  lignes.push(`### ${titre} (\`#/guides/${p}\`)`)
  const chapitres = readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'index.md')
    .map((f) => {
      const meta = frontMatter(readFileSync(join(dir, f), 'utf8'))
      return { ordre: Number(meta.chapitre ?? 0), titre: meta.titre ?? f, slug: f.replace(/\.md$/, '') }
    })
    .sort((a, b) => a.ordre - b.ordre)
  for (const c of chapitres) lignes.push(`- ${c.titre} (\`#/guides/${p}/${c.slug}\`)`)
  lignes.push('')
}

lignes.push('## Libellés des rôles')
lignes.push(Object.entries(ROLE_LABELS).map(([k, v]) => `${k} = ${v}`).join(' · '))
lignes.push('')

const out = lignes.join('\n')
const outDir = join(repoRoot, 'scripts/data')
writeFileSync(join(outDir, 'tuteur-digest.md'), out, 'utf8')
console.log(`wrote scripts/data/tuteur-digest.md (${out.length} caractères, ${parcours.length} parcours)`)
