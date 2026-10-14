// Régénère schemas/fixtures/carto/competency-map-master-exemple.json DEPUIS
// masterContractArchive() (archive de l'interface de cartographie, master
// v4) : la fixture illustre le schéma schemas/competency-map-master.schema.json
// et sert aux tests du moteur et de l'archive de compte. Après un changement
// voulu du format :
//   cd web && npx vite-node scripts/carto-master-fixture.mjs
// puis rejouer src/carto/core/master-schema.test.js.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { masterContractArchive } from '../src/carto/test/master-contract.js'

const out = fileURLToPath(new URL('../../schemas/fixtures/carto/competency-map-master-exemple.json', import.meta.url))
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify(await masterContractArchive(), null, 2)}\n`)
console.log(`écrit : ${out}`)
