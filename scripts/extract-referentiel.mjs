#!/usr/bin/env node
// Rebuilds the RESPIRE competence referentiel (7 poles / 61 competences) from
// the real corpus: agrege.par_competence of intermediate/carto_merge.json gives
// {code, nom, pole}; pole names come from agrege.par_pole; pole colors come
// from carto-data.js domainsData. Output conforms to
// schemas/referentiel.schema.json.
//
// Usage: node scripts/extract-referentiel.mjs [cartoMergeJson] [cartoDataJs] [output.json]
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCartoDataFile } from './convert/lib/carto-data-parser.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mergePath = resolve(
  process.argv[2] ?? `${repoRoot}/assets-existants/merge-prototype/intermediate/carto_merge.json`,
)
const cartoDataPath = resolve(
  process.argv[3] ?? `${repoRoot}/assets-existants/merge-prototype/carto-data.js`,
)
const output = resolve(
  process.argv[4] ?? `${repoRoot}/web/public/data/referentiel/respire-v7.json`,
)

const merge = JSON.parse(readFileSync(mergePath, 'utf8'))
const { domainsData } = parseCartoDataFile(cartoDataPath)

const colorByPoleName = new Map(domainsData.map((d) => [d.id, d.color]))

const poles = Object.values(merge.agrege.par_pole)
  .map((p) => ({
    num: p.pole_num,
    nom: p.pole_nom,
    couleur: colorByPoleName.get(p.pole_nom) ?? null,
  }))
  .sort((a, b) => a.num - b.num)

const competences = Object.values(merge.agrege.par_competence)
  .map((c) => ({ code: c.code, nom: c.nom, pole: c.pole }))
  .sort((a, b) => a.code.localeCompare(b.code))

const body = { poles, competences }
const contentHash = createHash('sha256').update(JSON.stringify(body)).digest('hex')

const referentiel = {
  schemaVersion: '1.0.0',
  kind: 'referentiel',
  id: 'respire',
  version: '7.0.0',
  label: 'RESPIRE v7',
  contentHash,
  source:
    'Reconstruit depuis agrege.par_competence (carto_merge.json) et domainsData (carto-data.js)',
  ...body,
}

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(referentiel, null, 2))
console.log(
  `referentiel ${referentiel.label}: ${poles.length} poles, ${competences.length} competences -> ${output}`,
)
