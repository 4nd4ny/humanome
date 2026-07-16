#!/usr/bin/env node
// Builds the PUBLISHED prompt-package « twin6-ouverte » 1.0.0 from the SAME
// open-source corpus that feeds the public static package
// (web/public/data/twin6/prompts/*.md) — so a promptologue can FORK it in the
// workshop (P10) and work on a copy (plan v1.1, D1 / AD-D1).
//
// Two artifacts derive from ONE corpus:
//   - web/public/data/twin6/twin6-ouverte-1.0.0.json (build-twin6-package.mjs) —
//     the PUBLIC static package the #/twin6-ouverte page serves and downloads ;
//   - build/prompt-packages/twin6-ouverte-1.0.0.json (THIS script) — a
//     schemas/prompt-package.schema.json document imported PUBLISHED in base,
//     forkable in the atelier (same mechanism as aurora-v3-reconstruit).
// The scan-pole / kairos / fiche TEXTS are byte-identical between the two:
// same source corpus, no drift (proven by scripts/…/twin6-prompt-package test).
//
// Execution is DELEGATED to the embedded engine (executerTwin6): the
// orchestration carries the « engine://…(twin6) » marker, so the run launcher
// and the promptologue banc d'essai recognize it and call executerTwin6 on the
// whole test portfolio (7 scan-pole + kairos -> cartographie-merge), exactly
// like the #/twin6-ouverte page — never the per-day aurora extractDay path.
//
// The package is marked metadata.reserved: true — the source-unique pipeline
// owns « twin6-ouverte » ; a promptologue's fork must be RENAMED before it can
// be published (PromptPackageRepository::createDraft rename guard).
//
// Deterministic (fixed dates, no Date.now()): re-running yields byte-identical
// JSON, keeping the server import (hash-idempotent) a no-op.
//
// Usage: node scripts/build-twin6-prompt-package.mjs

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENGINE_VERSION, validateDocument } from '../engine/src/index.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(repoRoot, 'web/public/data/twin6/prompts')
const referentiel = JSON.parse(
  readFileSync(join(repoRoot, 'web/public/data/referentiel/respire-v7.json'), 'utf8'),
)

const PACKAGE_ID = 'twin6-ouverte'
const PACKAGE_VERSION = '1.0.0'
// Fixed publication date (determinism — see header). Update on republish.
const BUILD_DATE = '2026-07-16'

function read(name) {
  const p = join(srcDir, name)
  if (!existsSync(p)) throw new Error(`prompt manquant : ${p}`)
  return readFileSync(p, 'utf8')
}

const scanPole = read('1-scan-pole.md')
const kairos = read('2-kairos-final.md')
const megaPrompt = read('0-mega-prompt.md')
const fiches = {}
for (let n = 1; n <= 7; n += 1) fiches[String(n)] = read(`P${n}.md`)

/** Nom lisible d'un pôle (referentiel.poles[].nom) — pour l'éditeur. */
function poleNom(num) {
  return referentiel.poles.find((p) => p.num === num)?.nom ?? `Pôle ${num}`
}

// --- prompts[] : scan-pole, kairos, mega-prompt, 7 fiches (tous éditables) ---

const prompts = [
  {
    role: 'twin6-scan-pole',
    nom: 'Scan d’un pôle (Greffier / Pédagogue adversarial / Rapporteur)',
    texte: scanPole,
    variables: [
      {
        nom: 'POLE',
        description:
          'Numéro du pôle RESPIRE instruit (1..7), injecté en lieu et place de ${POLE}. '
          + 'La fiche du pôle (P${POLE}.md) et le portfolio entier sont attachés en entrée par le moteur.',
        exemple: '1',
      },
    ],
  },
  {
    role: 'twin6-kairos',
    nom: 'Synthèse Kairos finale (transversale)',
    texte: kairos,
    variables: [
      {
        nom: 'cartos_pole',
        description:
          'Les 7 carto_pole produits par le scan-pole (étiquetés carto_P1..P7) sont attachés en entrée '
          + 'par le moteur, suivis du portfolio original. Aucun placeholder dédié dans le gabarit.',
        exemple: '## carto_P1\n```json\n{ "poleNum": 1, … }\n```',
      },
    ],
  },
  {
    role: 'twin6-mega-prompt',
    nom: 'Méga-prompt (vue d’ensemble du protocole, non exécuté)',
    texte: megaPrompt,
    variables: [],
  },
  ...[1, 2, 3, 4, 5, 6, 7].map((num) => ({
    role: `twin6-fiche-${num}`,
    nom: `Fiche des compétences — Pôle ${num} : ${poleNom(num)}`,
    texte: fiches[String(num)],
    variables: [],
  })),
]

// --- code.orchestration : marqueur engine://…(twin6), délégué au moteur ------

const orchestration =
  `// engine://humanome-engine@${ENGINE_VERSION} (twin6)\n`
  + '// Paquet « Cartographie ouverte Twin6 » : l\'orchestration est exécutée par\n'
  + `// le moteur intégré (engine/src/twin6, version ${ENGINE_VERSION}) — executerTwin6()\n`
  + '// enchaîne 7 appels twin6-scan-pole (un par pôle, fiche + portfolio attachés)\n'
  + '// puis 1 appel twin6-kairos, et mappe la sortie vers une cartographie-merge\n'
  + '// (mapper.js). Les gabarits ci-dessus (scan-pole, kairos, fiches P1..P7) sont\n'
  + '// les textes EXACTS que ce moteur instancie. Le banc d\'essai promptologue et\n'
  + '// la page #/twin6-ouverte suivent ce même chemin (jamais l\'extraction aurora).\n'
  + `export const engineRef = 'engine://humanome-engine@${ENGINE_VERSION} (twin6)'\n`

/**
 * Le document prompt-package « twin6-ouverte » (déterministe). Exporté pour le
 * test de byte-identité (les textes scan-pole/kairos/fiches === paquet statique).
 * @returns {object}
 */
export function buildTwin6PromptPackageDoc() {
  return doc
}

const doc = {
  schemaVersion: '1.0.0',
  kind: 'prompt-package',
  id: PACKAGE_ID,
  version: PACKAGE_VERSION,
  auteur: 'Harmonia Éducation — protocole Aurora (Twin6), open source',
  description:
    'Cartographie de compétences open source (protocole Aurora one-shot v2, Twin6) : un scan par '
    + 'pôle RESPIRE (Greffier / Pédagogue adversarial / Rapporteur) puis une synthèse Kairos, sur '
    + 'le portfolio entier (8 appels LLM). Paquet PUBLIÉ et forkable dans l\'atelier promptologue — '
    + 'la page publique #/twin6-ouverte continue de servir le paquet statique équivalent.',
  modeleCible: 'claude-sonnet-5',
  referentielCompatible: { id: 'respire', versionMin: '7.0.0' },
  changelog: [
    {
      version: PACKAGE_VERSION,
      date: BUILD_DATE,
      description:
        'Première publication : import du protocole Twin6 open source (scan-pole, kairos, fiches '
        + 'P1..P7) depuis le corpus source unique, pour rendre le paquet forkable dans l\'atelier.',
    },
  ],
  prompts,
  code: {
    orchestration,
    entrypoint: 'executerTwin6',
  },
  metadata: {
    creeLe: `${BUILD_DATE}T00:00:00Z`,
    publieLe: `${BUILD_DATE}T00:00:00Z`,
    licence: 'AGPL-3.0-only',
    // Réservé au pipeline source-unique : un fork de promptologue DOIT être
    // renommé avant publication (PromptPackageRepository::createDraft).
    reserved: true,
    genereLePar: 'scripts/build-twin6-prompt-package.mjs',
    moteur: `humanome-engine@${ENGINE_VERSION} (twin6)`,
  },
}

// --- CLI: validate through the engine's own validators, then write ----------

function main() {
  const result = validateDocument('prompt-package', doc)
  if (!result.valid) {
    console.error('Generated Twin6 package fails schemas/prompt-package.schema.json:')
    for (const err of result.errors ?? []) console.error(' -', JSON.stringify(err))
    process.exit(1)
  }

  const outDir = join(repoRoot, 'build', 'prompt-packages')
  mkdirSync(outDir, { recursive: true })
  const outFile = join(outDir, `${PACKAGE_ID}-${PACKAGE_VERSION}.json`)
  writeFileSync(outFile, JSON.stringify(doc, null, 2) + '\n')
  console.log(
    `wrote ${outFile.replace(repoRoot + '/', '')} `
    + `(${doc.prompts.length} prompts : scan-pole + kairos + mega + 7 fiches, engine ${ENGINE_VERSION})`,
  )
}

// Exécuté en CLI (pas à l'import par un test).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
}
