// Twin9 → viewer (D12) — mappe `carto_evolutive.json` (sortie de l'analyse
// approfondie Twin9) vers le document `cartographie-merge` du viewer sunburst,
// en RÉUTILISANT le pipeline de merge par jour (mergeDays + buildMergeDocument),
// exactement comme l'adaptateur Twin6 (twin6/mapper.js) — aucune logique
// d'agrégation, de quintiles, d'archétypes ou d'ipsatif dupliquée.
//
// Idée clé : chaque compétence de carto_evolutive porte des `attestations`
// datées ({jour_index, date, confiance, score_preuves, score_indices, …}) et
// des `signaux` ({jour_index, type: renvoi|minoritaire|instruite}). On
// reconstitue donc un instantané par JOURNÉE DATÉE : une compétence est
// « présence établie » sur la feuille F ssi une attestation la date de F, et
// « renvoi au cartographe » ssi un signal de type renvoi tombe ce jour-là
// (jour_index → date résolu via les attestations de TOUTES les compétences).
// Les scores par feuille (preuves, indices, confiance) viennent tels quels de
// l'attestation ; fréquences, niveaux, archétypes, ipsatif et HTML sont ensuite
// calculés par le code de merge déjà testé (parité octet sur le corpus réel).
//
// Limites assumées (jamais d'invention de données, cf. convention du dépôt) :
//   - un signal dont le jour_index ne correspond à AUCUNE date connue est
//     ignoré dans la reconstruction par feuille (il reste porté par le
//     narratif et par le statut temporel de carto_evolutive) ;
//   - pieces/traces/passages ne sont PAS reconstitués : le document merge
//     final n'en émet pas (cf. docs/contrats.md — recopie feuilles{} exclue).
//
// Narratifs : carto_evolutive les porte déjà — `histoires[code]` (histoire
// d'apprentissage par compétence), `rapports_poles[num]` (rapport de pôle),
// kairos (synthèse). Aucun appel LLM supplémentaire.
//
// Ce fichier est NOUVEAU (D12) : il ne fait pas partie du périmètre de parité
// CPython (contrairement à merge.js/scan.js), il CONSOMME leur sortie.
//
// Aucune E/S ici (convention moteur, P5) : entrées pures → document pur.

import { mergeDays } from '../pipeline/merge.js'
import { buildMergeDocument } from '../pipeline/merge-document.js'

const STATUT_ETABLIE = 'présence établie'
const STATUT_RENVOI = 'renvoi au cartographe'

/** Entrée de compétence d'un document-jour (contrat cartographie-jour). */
function competenceEntry(code, verdict) {
  return { code, courtCircuit: false, pieces: [], tracesRetenues: [], pedagogue: {}, verdict }
}

/**
 * Mappe un `carto_evolutive.json` Twin9 vers un document `cartographie-merge`.
 *
 * @param {object} carto carto_evolutive.json déjà aplani en objet JSON
 *   (Maps/PyFloat sérialisés — même forme que ce que rend ResultatsTwin9).
 * @param {{competences: Array<{code:string, nom:string, pole:number}>,
 *   poles: Array<{num:number, nom:string}>}} referentiel même forme que pour
 *   l'adaptateur Twin6 (referentielPourMoteur / référentiel publié).
 * @param {object} [meta] { generatedAt, sourceProtocole, journalId } passé à
 *   buildMergeDocument (journalId défaut = carto.journal_id).
 * @returns {object} document `cartographie-merge` (schéma du viewer).
 * @throws {Error} message en français si aucune attestation datée (rien à
 *   placer sur la ligne de temps du sunburst).
 */
export function twin9ToMergeDocument(carto, referentiel, meta = {}) {
  const competences = carto?.competences
  if (!competences || typeof competences !== 'object') {
    throw new Error('twin9ToMergeDocument : carto_evolutive.competences requis')
  }
  if (!referentiel?.competences || !referentiel?.poles) {
    throw new Error('twin9ToMergeDocument : referentiel { competences[], poles[] } requis')
  }

  const poleOf = new Map(referentiel.competences.map((c) => [c.code, Number(c.pole)]))

  // 1. jour_index → date ISO, depuis les attestations de TOUTES les compétences
  //    (seule source datée du document — il ne porte pas de tableau `journees`).
  /** @type {Map<number, string>} */
  const dateOfJour = new Map()
  for (const c of Object.values(competences)) {
    for (const a of c?.attestations ?? []) {
      if (typeof a?.jour_index === 'number' && typeof a?.date === 'string' && a.date !== '') {
        if (!dateOfJour.has(a.jour_index)) dateOfJour.set(a.jour_index, a.date)
      }
    }
  }
  const dates = [...new Set(dateOfJour.values())].sort()
  if (dates.length === 0) {
    throw new Error(
      'twin9ToMergeDocument : aucune attestation datée dans carto_evolutive — rien à projeter sur la ligne de temps',
    )
  }

  // 2. Présences et renvois par date : date → code → verdict.
  /** @type {Map<string, Map<string, object>>} */
  const parDate = new Map(dates.map((d) => [d, new Map()]))
  for (const [code, c] of Object.entries(competences)) {
    for (const a of c?.attestations ?? []) {
      const date = typeof a?.date === 'string' && a.date !== '' ? a.date : dateOfJour.get(a?.jour_index)
      const jour = parDate.get(date)
      if (!jour) continue
      jour.set(code, {
        statut: STATUT_ETABLIE,
        nombrePreuves: Number(a?.score_preuves) || 0,
        nombreIndices: Number(a?.score_indices) || 0,
        confiance: Number(a?.confiance) || 0,
        motif: '',
        prescription: '',
      })
    }
    for (const s of c?.signaux ?? []) {
      if (!String(s?.type ?? '').includes('renvoi')) continue
      const date = dateOfJour.get(s?.jour_index)
      const jour = date ? parDate.get(date) : null
      // Une attestation du même jour prime (établie > renvoi sur la feuille).
      if (jour && !jour.has(code)) {
        jour.set(code, {
          statut: STATUT_RENVOI,
          nombrePreuves: 0,
          nombreIndices: 0,
          confiance: 0,
          motif: '',
          prescription: '',
        })
      }
    }
  }

  // 3. Un document-jour par date ; le kairos (global, déjà à la forme
  //    jour-doc {kairos:{apprenant}, emergencesCrossPoles}) va au dernier.
  const dayDocs = dates.map((date, di) => {
    const jour = parDate.get(date)
    const doc = {
      date,
      poles: referentiel.poles.map((p) => ({
        poleNum: Number(p.num),
        passagesSaillants: [],
        competences: [...jour.entries()]
          .filter(([code]) => poleOf.get(code) === Number(p.num))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([code, verdict]) => competenceEntry(code, verdict)),
        rapport: {},
        auditPole: {},
      })),
    }
    if (carto.kairos && di === dates.length - 1) doc.kairos = carto.kairos
    return doc
  })

  // 4. Agrégation par le code de merge déjà testé.
  const agrege = mergeDays(dayDocs, referentiel)
  agrege.date_construction = meta.generatedAt ?? null

  // 5. Narratifs — défauts vides pour chaque entrée du référentiel, puis on
  //    injecte ceux que carto_evolutive porte déjà (markdown, tels quels).
  const narrativeTexts = { competences: {}, poles: {}, kairos: '' }
  for (const c of referentiel.competences) narrativeTexts.competences[c.code] = ''
  for (const p of referentiel.poles) narrativeTexts.poles[String(p.num)] = ''
  for (const [code, histoire] of Object.entries(carto.histoires ?? {})) {
    if (typeof histoire === 'string') narrativeTexts.competences[code] = histoire
  }
  for (const [num, rapport] of Object.entries(carto.rapports_poles ?? {})) {
    if (typeof rapport === 'string') narrativeTexts.poles[String(Number(num))] = rapport
  }
  narrativeTexts.kairos =
    carto.kairos?.kairos?.apprenant?.syntheseCompleteMarkdown ?? carto.kairos_evolutif ?? ''

  // 6. Document merge final — mêmes niveaux/archétypes/HTML que toute carto.
  return buildMergeDocument(agrege, narrativeTexts, {
    journalId: meta.journalId ?? carto.journal_id ?? null,
    sourceProtocole: meta.sourceProtocole ?? 'Twin9 — analyse approfondie (merge évolutif)',
    generatedAt: meta.generatedAt ?? null,
  })
}
