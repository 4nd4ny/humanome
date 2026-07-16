#!/usr/bin/env node
// SOURCE UNIQUE du référentiel — extrait les fiches de scan PAR COMPÉTENCE
// depuis les P1..P7.md (Twin6 public = tagger Twin9, octet-à-octet) en
// RÉUTILISANT le vrai parsePole du moteur (garantie de parité prod), puis
// PROUVE qu'on les régénère octet pour octet (règle de réassemblage (b)).
//
// Sortie : scripts/data/fiches-v7.json = { poleHeaders: {num: header_brut},
// fiches: {code: fiche_md} }. C'est la matière du champ competence.content.fiche
// (source unique). generate-fiches.mjs et FicheGenerator (PHP) réutilisent la règle.
//
// Règle (b) — réassemblage BYTE-EXACT d'un P*.md (≠ ficheComplete runtime) :
//   P*.md = header_brut + competences.map(fiche_md).join("\n\n") + "\n"
//
// Usage : node scripts/extract-fiches.mjs   (échoue si la parité octet casse)
import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parsePole } from '../engine/src/twin9/referentiel.js'

/** Réassemblage BYTE-EXACT d'un pôle en P*.md (règle b). Importé par generate-fiches.mjs. */
export function reassembleFiche(header, competences) {
  return header + competences.map((c) => c.fiche_md).join('\n\n') + '\n'
}

function main() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const promptsDir = `${repoRoot}/web/public/data/twin6/prompts`
  const out = `${repoRoot}/scripts/data/fiches-v7.json`

  const poleHeaders = {}
  const fiches = {}
  let ok = 0

  for (let n = 1; n <= 7; n += 1) {
    const src = readFileSync(`${promptsDir}/P${n}.md`, 'utf8')
    const pole = parsePole(src, n)

    // PREUVE : régénérer depuis (header + fiches par compétence) === source.
    const rebuilt = reassembleFiche(pole.header, pole.competences)
    if (rebuilt !== src) {
      let i = 0
      while (i < Math.min(rebuilt.length, src.length) && rebuilt[i] === src[i]) i += 1
      console.error(
        `ÉCHEC PARITÉ P${n}.md : régénéré (${rebuilt.length} o) ≠ source (${src.length} o), ` +
          `1er écart au char ${i} : src=${JSON.stringify(src.slice(i - 15, i + 15))} ` +
          `rebuilt=${JSON.stringify(rebuilt.slice(i - 15, i + 15))}`,
      )
      process.exit(1)
    }
    ok += 1

    poleHeaders[String(n)] = pole.header
    for (const c of pole.competences) {
      if (fiches[c.code]) {
        console.error(`Code dupliqué entre pôles : ${c.code}`)
        process.exit(1)
      }
      fiches[c.code] = c.fiche_md
    }
  }

  writeFileSync(
    out,
    JSON.stringify(
      {
        _comment:
          'Fiches de scan par compétence + en-têtes de pôle, extraites des P*.md (Twin6 public = tagger Twin9) via le parsePole du moteur. SOURCE UNIQUE : injecté dans competence.content.fiche par le seed ; generate-fiches.mjs et FicheGenerator (PHP) reconstruisent P*.md (règle b) + le setting twin9_fiches à l’identique. Parité octet prouvée.',
        poleHeaders,
        fiches,
      },
      null,
      2,
    ) + '\n',
  )

  console.log(
    `parité octet OK sur ${ok}/7 pôles · ${Object.keys(fiches).length} fiches de compétence · 7 en-têtes → ${out}`,
  )
}

if (import.meta.url === pathToFileURL(argv[1] ?? '').href) main()
