#!/usr/bin/env node
// Enrichit le référentiel RESPIRE publié (7.0.0, code+nom+pôle) avec les
// DÉFINITIONS des compétences fournies par les épistémiarques
// (scripts/data/referentiel-v7-definitions.json, commité), et en fait une
// NOUVELLE version 7.1.0.
//
// Invariant (E1) : la définition est un champ facultatif QUI N'ENTRE PAS dans
// le hash de contenu (voir api/src/Referentiel/ContentHash.php). Le corps haché
// reste {poles:[{num,nom,couleur}], competences:[{code,nom,pole}]}, donc 7.1.0
// porte le MÊME contentHash que 7.0.0 (même structure), la version marquant
// l'évolution rédactionnelle. Aucun oracle moteur / vecteur Twin9 ne bouge.
//
// À enchaîner après scripts/extract-referentiel.mjs (qui produit le 7.0.0), et
// avant le build front / le déploiement (deploy.mjs importe les deux versions).
//
// Usage : node scripts/enrich-referentiel.mjs
//   [base 7.0.0 json] [definitions json] [sortie 7.1.0 json]
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const basePath = resolve(
  process.argv[2] ?? `${repoRoot}/web/public/data/referentiel/respire-v7.json`,
)
const definitionsPath = resolve(
  process.argv[3] ?? `${repoRoot}/scripts/data/referentiel-v7-definitions.json`,
)
const output = resolve(
  process.argv[4] ?? `${repoRoot}/web/public/data/referentiel/respire-v7.1.0.json`,
)

const NEW_VERSION = '7.1.0'
const NEW_LABEL = 'RESPIRE v7.1'

const base = JSON.parse(readFileSync(basePath, 'utf8'))
const definitions = new Map(
  Object.entries(JSON.parse(readFileSync(definitionsPath, 'utf8')).definitions ?? {}),
)

// Chaque compétence publiée doit recevoir SA définition — sinon on s'arrête
// (pas de fabrication : on n'invente pas de définition manquante).
const missing = base.competences.filter((c) => !definitions.has(c.code))
if (missing.length > 0) {
  console.error(
    `Définitions manquantes pour ${missing.length} compétence(s) : ` +
      missing.map((c) => c.code).join(', '),
  )
  process.exit(1)
}
const extra = [...definitions.keys()].filter(
  (code) => !base.competences.some((c) => c.code === code),
)
if (extra.length > 0) {
  console.error(`Définitions surnuméraires (codes inconnus) : ${extra.join(', ')}`)
  process.exit(1)
}

// Corps HACHÉ = structure seule (identique à extract-referentiel.mjs), donc
// même contentHash que 7.0.0.
const poles = [...base.poles]
  .map((p) => ({ num: p.num, nom: p.nom, couleur: p.couleur }))
  .sort((a, b) => a.num - b.num)
const bodyForHash = {
  poles,
  competences: [...base.competences]
    .map((c) => ({ code: c.code, nom: c.nom, pole: c.pole }))
    .sort((a, b) => a.code.localeCompare(b.code)),
}
const contentHash = createHash('sha256').update(JSON.stringify(bodyForHash)).digest('hex')

// Compétences STOCKÉES = structure + définition (clé « description »).
const competences = bodyForHash.competences.map((c) => ({
  ...c,
  description: definitions.get(c.code),
}))

const enriched = {
  schemaVersion: base.schemaVersion,
  kind: 'referentiel',
  id: base.id,
  version: NEW_VERSION,
  label: NEW_LABEL,
  contentHash,
  source:
    'RESPIRE v7.0.0 enrichi des définitions de compétences ' +
    '(referentiel/referentiel_liste.txt, fournies par les épistémiarques)',
  poles,
  competences,
}

writeFileSync(output, JSON.stringify(enriched, null, 2) + '\n')
console.log(
  `${NEW_LABEL} : ${poles.length} pôles, ${competences.length} compétences ` +
    `(définitions ajoutées), hash ${contentHash.slice(0, 12)}… === 7.0.0 -> ${output}`,
)
if (contentHash !== base.contentHash) {
  console.error(
    `ATTENTION : le hash ${contentHash} diffère de 7.0.0 ${base.contentHash} — ` +
      `la structure a changé (attendu identique).`,
  )
  process.exit(1)
}
