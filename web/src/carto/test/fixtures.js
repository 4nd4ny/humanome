// Jeux d'essai SYNTHÉTIQUES de l'interface ultime de cartographie.
//
// Aucune donnée personnelle : apprenante fictive (« Lou »), référentiel réduit
// à 3 pôles et 6 compétences (forme publiée du site), journées Aurora v3
// construites à la main avec la même structure que les vrais carto_Pn.json
// (passages saillants → pièces → traces retenues).

import { createDataset, createDay } from '../core/model.js'

/** Référentiel réduit (forme publiée : poles[] + competences[]). */
export function miniReferential() {
  return {
    kind: 'referentiel',
    id: 'mini',
    version: '1.0.0',
    label: 'Mini 1.0',
    poles: [
      { num: 1, nom: 'TÊTE — Penser', couleur: '#2563eb' },
      { num: 2, nom: 'CŒUR — Relier', couleur: '#10b981' },
      { num: 3, nom: 'MAIN — Créer', couleur: '#ec4899' },
    ],
    competences: [
      { code: '1.01', nom: 'Pensée critique', pole: 1, description: 'Douter avec méthode.' },
      { code: '1.02', nom: 'Cadrage', pole: 1, description: 'Poser le bon problème.' },
      { code: '2.01', nom: 'Écoute', pole: 2, description: 'Accueillir autrui.' },
      { code: '2.02', nom: 'Coopération', pole: 2, description: 'Faire ensemble.' },
      { code: '3.01', nom: 'Fabrication', pole: 3, description: 'Donner forme.' },
      { code: '3.02', nom: 'Itération', pole: 3, description: 'Reprendre et améliorer.' },
    ],
  }
}

/**
 * Document carto_Pn.json synthétique.
 * @param {number} poleNum
 * @param {Array<{code: string, statut?: string, confiance?: number, courtCircuit?: boolean,
 *   traces?: Array<{role: string, extrait: string, type?: string}>, motif?: string, raison?: string,
 *   prescription?: string, prescriptionMinimale?: string, nombrePreuves?: number, nombreIndices?: number}>} comps
 * @param {{date: string}} opts
 */
export function cartoPole(poleNum, comps, { date }) {
  const passagesSaillants = []
  let pid = 1
  const competences = comps.map((c) => {
    const pieces = []
    const tracesRetenues = []
    for (const [i, t] of (c.traces ?? []).entries()) {
      passagesSaillants.push({ pid, feuille: date, extraitVerbatim: t.extrait, contexte: `Contexte de ${c.code}`, auteur: 'apprenant' })
      pieces.push({ numero: i + 1, pid, contexte: `Pièce ${i + 1} de ${c.code}` })
      tracesRetenues.push({ pieceId: i + 1, type: t.type ?? 'trace concrète', role: t.role })
      pid++
    }
    const nPreuves = (c.traces ?? []).filter((t) => t.role.startsWith('preuve')).length
    return {
      code: c.code,
      courtCircuit: c.courtCircuit ?? false,
      pieces,
      pedagogue: {
        presomptionAbsence: { raisonnement: `Je doute de ${c.code}.`, piecesQuiResistent: [] },
        presomptionSycophantie: { raisonnement: 'Je me méfie de ma complaisance.', examenPieces: [] },
        conclusionAdversariale: { raisonnement: 'Après examen, la pièce tient.', confianceFinale: c.confiance ?? 0.5 },
      },
      verdict: {
        statut: c.statut ?? 'présence établie',
        nombrePreuves: c.nombrePreuves ?? nPreuves,
        nombreIndices: c.nombreIndices ?? (c.traces ?? []).length - nPreuves,
        confiance: c.confiance ?? 0.8,
        ...(c.motif !== undefined ? { motif: c.motif } : {}),
        ...(c.raison !== undefined ? { raison: c.raison } : {}),
        ...(c.prescription !== undefined ? { prescription: c.prescription } : {}),
        ...(c.prescriptionMinimale !== undefined ? { prescriptionMinimale: c.prescriptionMinimale } : {}),
      },
      tracesRetenues,
    }
  })
  return {
    poleNum: String(poleNum),
    passagesSaillants,
    competences,
    auditPole: { competencesTotales: comps.length },
    rapport: {
      portraitPole: `Portrait du pôle ${poleNum} le ${date}.`,
      territoiresDenses: [],
      territoiresNonVisites: 'Rien à signaler.',
      emergencesPole: 'Une ligne émerge.',
      pistes: ['Continuer.'],
      // Le rapport complet redit ses rubriques, comme d'ordinaire : il n'est pas gardé (D-66).
      rapportCompletMarkdown: `## Portrait du pôle ${poleNum}\n\nPortrait du pôle ${poleNum} le ${date}.\n\n## Pistes\n\n- Continuer.`,
    },
  }
}

/** kairos.json synthétique. */
export function kairosDoc(date) {
  return {
    kairos: {
      apprenant: {
        portrait: `Portrait du ${date}.`,
        formeProfil: 'Deux massifs.',
        ceQuiRelieLesPoles: 'Le soin du détail.',
        ceQuiEmergeEntreLesLignes: 'Une curiosité.',
        invitationsPourLaSuite: ['Raconter une erreur.'],
        // La synthèse complète redit ses rubriques, comme d'ordinaire : elle n'est pas gardée (D-66).
        syntheseCompleteMarkdown: `## Portrait\n\nPortrait du ${date}.\n\n## Forme du profil\n\nDeux massifs.`,
      },
    },
    emergencesCrossPoles: { competencesOrphelines: [], connexionsTransversales: [], noeudsConceptuels: [] },
  }
}

/** Portfolio synthétique de Lou (trois journées datées + préambule). */
export const LOU_PORTFOLIO = `# Journal de Lou

### 2025-12-22

Ce matin j’ai relu mes notes avant d’écrire. J'ai vérifié deux sources contradictoires avant de conclure sur la date du chantier.
Ensuite nous avons construit la maquette du pont en carton, avec Sam et Noé.

### 23.12.2025

J’ai écouté Sam expliquer son idée jusqu’au bout sans l’interrompre, puis j’ai reformulé ce que j’avais compris.
La maquette a cédé : nous avons recommencé en changeant les appuis.

### 24 décembre 2025

Troisième essai de la maquette : cette fois, les appuis tiennent. J'ai noté chaque modification dans un tableau.
`

/** Journées Aurora v3 de Lou, cohérentes avec LOU_PORTFOLIO. */
export function louDays() {
  return {
    '2025-12-22': [
      cartoPole(1, [
        { code: '1.01', statut: 'présence établie', confiance: 0.8, traces: [{ role: 'preuve décisive', extrait: "J'ai vérifié deux sources contradictoires avant de conclure sur la date du chantier." }], motif: 'Vérification explicite.', prescriptionMinimale: 'Raconter un doute.' },
        { code: '1.02', statut: 'présence non établie', confiance: 0.7, traces: [] },
      ], { date: '2025-12-22' }),
      cartoPole(3, [
        { code: '3.01', statut: 'présence établie', confiance: 0.6, traces: [{ role: 'indice corroboratif', extrait: 'nous avons construit la maquette du pont en carton' }] },
      ], { date: '2025-12-22' }),
    ],
    '2025-12-23': [
      cartoPole(2, [
        { code: '2.01', statut: 'présence établie', confiance: 0.9, traces: [{ role: 'preuve décisive', extrait: 'J’ai écouté Sam expliquer son idée jusqu’au bout sans l’interrompre, puis j’ai reformulé ce que j’avais compris.' }] },
      ], { date: '2025-12-23' }),
      cartoPole(3, [
        { code: '3.02', statut: 'renvoi au cartographe', confiance: 0.5, traces: [{ role: 'indice corroboratif', extrait: 'La maquette a cédé [...] en changeant les appuis.' }] },
        { code: '3.01', statut: 'présence établie', confiance: 0.4, courtCircuit: true, traces: [] },
      ], { date: '2025-12-23' }),
    ],
    '2025-12-24': [
      cartoPole(3, [
        { code: '3.02', statut: 'présence établie', confiance: 0.7, traces: [{ role: 'preuve décisive', extrait: "Troisième essai de la maquette : cette fois, les appuis tiennent. J'ai noté chaque modification dans un tableau." }, { role: 'indice corroboratif', extrait: 'Troisième essai de la maquette' }] },
      ], { date: '2025-12-24' }),
    ],
  }
}

/**
 * Jeu de données construit DIRECTEMENT au niveau de l'index (sans import),
 * pour tester les formules : chaque journée a une variante active.
 * @param {Array<{date: string, active?: boolean, verdicts: Array<{code: string, status?: string,
 *   confidence?: number|null, roles?: string[], courtCircuit?: boolean}>}>} days
 */
export function indexDataset(days, { referential = miniReferential() } = {}) {
  const ds = createDataset({ datasetId: 'ds-test', title: 'Test', referential, now: '2026-01-01T00:00:00.000Z' })
  for (const spec of days) {
    const day = createDay(spec.date)
    const vid = `v-${spec.date}`
    day.active = spec.active ?? true
    day.variants = [
      {
        id: vid,
        provenance: { source: 'test' },
        verdicts: spec.verdicts.map((v) => ({
          code: v.code,
          status: v.status ?? 'established',
          rawStatus: null,
          courtCircuit: v.courtCircuit ?? false,
          confidence: v.confidence === undefined ? 0.8 : v.confidence,
          proofs: (v.roles ?? []).filter((r) => r === 'preuve').length,
          hints: (v.roles ?? []).filter((r) => r !== 'preuve').length,
          traces: (v.roles ?? ['preuve']).map((role, i) => ({ id: `${vid}:${v.code}:${i}`, role })),
        })),
        anomalies: [],
      },
    ]
    day.activeVariantId = vid
    ds.days.push(day)
  }
  ds.days.sort((a, b) => (a.date < b.date ? -1 : 1))
  return ds
}
