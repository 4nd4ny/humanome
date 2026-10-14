// Régénère schemas/fixtures/partage/carto-partage-exemple.json DEPUIS
// buildSharedVersion (interface ultime, P6) : la fixture est le contrat entre
// le client et la liste blanche du serveur (api/src/Share/SharedVersion.php).
// Après un changement voulu du format :
//   cd web && npx vite-node scripts/carto-share-fixture.mjs
// puis rejouer src/carto/core/share.test.js et api/tests/CartoPartageTest.php.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildSharedVersion } from '../src/carto/core/share.js'
import { contractInput } from '../src/carto/test/share-contract.js'

const out = fileURLToPath(new URL('../../schemas/fixtures/partage/carto-partage-exemple.json', import.meta.url))
writeFileSync(out, `${JSON.stringify(buildSharedVersion(contractInput()), null, 2)}\n`)
console.log(`écrit : ${out}`)
