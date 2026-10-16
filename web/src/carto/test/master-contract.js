// Contrat de l'archive de l'interface de cartographie (master v4, journal
// D-25 ; question 10) : la fixture schemas/fixtures/carto/competency-map-master-exemple.json
// est EXACTEMENT masterContractArchive() — régénérée par
// `npx vite-node scripts/carto-master-fixture.mjs` (dossier web/), vérifiée
// par src/carto/core/master-schema.test.js (égalité, et conformité au schéma
// schemas/competency-map-master.schema.json) et par les tests du moteur
// (validation) et de l'archive de compte (archive-export 1.1.0).
//
// Un jeu synthétique (Lou) qui touche chaque partie du conteneur : deux
// analyses d'une même journée (arbitrées), seconde lecture (un run AuroraCore
// et ses délibérations, D-68), portfolio et passage sans date, case décochée,
// étiquette, ensemble figé, réponse au jury, repère et phase, note de
// comparaison, préférences, carnet du dialogue (un dialogue versé au
// portfolio, un autre non).

import { importFiles } from '../core/import.js'
import { buildArchive } from '../core/archive.js'
import { createDataset, observationKey } from '../core/model.js'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import {
  addMarker,
  addReflection,
  addTag,
  chooseVariant,
  saveSet,
  setActive,
  setComparisonNote,
  setPreferences,
  setReflectionVersed,
  setReview,
} from '../core/ops.js'
import { LOU_PORTFOLIO, cartoPole, kairosDoc, louCoreRun, louDays, miniReferential } from './fixtures.js'

export const MASTER_NOW = '2026-10-14T10:00:00.000Z'

function louFiles() {
  const files = [
    { path: 'lou.md', text: LOU_PORTFOLIO },
    { path: 'vacances.md', text: 'Un passage écrit pendant les vacances, sans date.\n' },
  ]
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  return files
}

/** L'archive complète du jeu « Lou », déterministe. */
export async function masterContractArchive() {
  const now = MASTER_NOW
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  let res = await importFiles(louFiles(), createDataset({ datasetId: 'ds-lou', title: 'Lou', referential: miniReferential(), now }), { now })
  await store.commit(res)
  // Une seconde analyse du 23 décembre : variante concurrente, puis arbitrée.
  const other = cartoPole(2, [{ code: '2.02', statut: 'présence établie', confiance: 0.6, traces: [{ role: 'indice corroboratif', extrait: 'puis j’ai reformulé ce que j’avais compris' }] }], { date: '2025-12-23' })
  res = await importFiles([{ path: 'run2/2025-12-23/carto_P2.json', text: JSON.stringify(other) }], res.dataset, { now })
  await store.commit(res)
  // Un run AuroraCore sur tout le journal : seconde lecture, sans effet sur le soleil (D-68).
  res = await importFiles(louCoreRun(), res.dataset, { now })
  await store.commit(res)

  let ds = res.dataset
  const d23 = ds.days.find((d) => d.date === '2025-12-23')
  ds = chooseVariant(ds, '2025-12-23', d23.variants[1].id, { now })
  ds = setActive(ds, ['2025-12-24'], false, { now })
  ds = addTag(ds, ['2025-12-22', '2025-12-23'], 'projet pont', { now })
  ds = saveSet(ds, { name: 'Pont', definition: { kind: 'tags', tags: ['projet pont'] }, freeze: true, id: 'set-pont' }, { now })
  const vid22 = ds.days.find((d) => d.date === '2025-12-22').activeVariantId
  ds = setReview(ds, observationKey('2025-12-22', vid22, '1.01'), 'nuanced', 'Pas seulement deux sources.', { now })
  ds = addMarker(ds, { date: '2025-12-23', label: 'Premier pont', kind: 'repere' }, { now })
  ds = addMarker(ds, { date: '2025-12-22', to: '2025-12-24', label: 'Semaine du pont', kind: 'phase' }, { now })
  ds = setComparisonNote(ds, { a: 'set-pont', b: 'selection', note: 'Ma lecture de la semaine.' }, { now })
  ds = setPreferences(ds, { calendarMode: 'free', reinforced: true }, { now })
  ds = addReflection(
    ds,
    {
      entries: [
        {
          threadId: 'citation:2025-12-22:1.01',
          kind: 'citation',
          question: 'Le 22 décembre 2025, vous écrivez ce passage. Qu’est-ce qui se jouait pour vous ce jour-là ?',
          quote: 'J’ai vérifié deux sources contradictoires avant de conclure',
          answer: 'Je doutais de la date du chantier.',
          refs: { dates: ['2025-12-22'], codes: ['1.01'] },
          relaunch: { text: 'Qu’est-ce qui vous a fait douter ?', model: 'Ollama — llama3.1' },
        },
      ],
    },
    { now: '2026-10-13T12:00:00.000Z' },
  )
  ds = addReflection(ds, { entries: [{ threadId: 'silence:a:b', kind: 'silence', question: 'Que s’est-il passé pendant ce temps ?', answer: 'Une pause voulue.' }] }, { now })
  ds = setReflectionVersed(ds, ds.reflections[0].id, true, { now })
  // Identifiants des repères : tirés au hasard à la création ; figés ici pour
  // que la fixture soit stable.
  ds = { ...ds, markers: ds.markers.map((m, i) => ({ ...m, id: `mk-${i + 1}` })) }
  await store.saveDataset(ds)
  return buildArchive(await store.exportAll('ds-lou'), { now })
}
