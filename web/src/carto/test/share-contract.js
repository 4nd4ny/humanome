// Entrées du contrat de la version partagée (P6) : la fixture
// schemas/fixtures/partage/carto-partage-exemple.json est EXACTEMENT
// buildSharedVersion(contractInput()) — régénérée par
// `npx vite-node scripts/carto-share-fixture.mjs` (dossier web/), vérifiée
// par src/carto/core/share.test.js (égalité) et par
// api/tests/CartoPartageTest.php (acceptée par la liste blanche du serveur).

import { computeState } from '../core/state.js'
import { normalizeReferential } from '../core/referential.js'
import { indexDataset, miniReferential } from './fixtures.js'

export function contractInput() {
  const ref = normalizeReferential(miniReferential())
  const ds = indexDataset([
    { date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve'] }, { code: '3.01', confidence: 0.9, roles: ['preuve'] }] },
    { date: '2025-12-23', verdicts: [{ code: '2.01', confidence: 0.5, roles: ['indice'] }, { code: '1.01', confidence: 0.6, roles: ['indice'] }] },
    { date: '2025-12-27', verdicts: [{ code: '3.01', confidence: 0.9, roles: ['preuve', 'preuve'] }] },
    { date: '2026-01-05', verdicts: [{ code: '1.01', confidence: 0.7, roles: ['indice'] }] },
  ])
  return {
    state: computeState(ds, { ref }),
    ref,
    title: 'Mes compétences — année 2025-2026',
    codes: ['1.01', '2.01'],
    precision: 'month',
    now: '2026-10-14T10:00:00.000Z',
    extracts: [{ code: '1.01', date: '2025-12-22', role: 'preuve', text: 'J’ai vérifié chaque source avant de conclure.' }],
  }
}
