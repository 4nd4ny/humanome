import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeDays, pythonRound, feuilleScore } from './merge.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

describe('pythonRound (round() de Python 3 : décimal exact, demi vers le pair)', () => {
  it('reproduit le cas réel du corpus qui diverge de Math.round (2.05)', () => {
    // Moyenne de 8 confiances = 5.17/8 : la valeur binaire exacte est
    // 0.64624999999999999112… → 0.6462 en Python ; Math.round(x*1e4)/1e4
    // donne 0.6463 (la multiplication remonte au-dessus du demi).
    expect(pythonRound(5.17 / 8, 4)).toBe(0.6462)
    expect(Math.round((5.17 / 8) * 1e4) / 1e4).toBe(0.6463) // le piège évité
  })

  it('arrondit les demis exacts vers le chiffre pair', () => {
    expect(pythonRound(0.15625, 4)).toBe(0.1562) // 5/32, demi exact → pair
    expect(pythonRound(0.125, 2)).toBe(0.12)
    expect(pythonRound(0.375, 2)).toBe(0.38)
    expect(pythonRound(-0.125, 2)).toBe(-0.12)
  })

  it('arrondit selon la valeur binaire exacte, pas le littéral décimal', () => {
    expect(pythonRound(2.675, 2)).toBe(2.67) // 2.675 ≈ 2.67499999…
    expect(pythonRound(1.005, 2)).toBe(1) // 1.005 ≈ 1.00499999…
  })

  it('gère les entiers et zéro décimale', () => {
    expect(pythonRound(3.56, 2)).toBe(3.56)
    expect(pythonRound(0, 4)).toBe(0)
    expect(pythonRound(2.5, 0)).toBe(2)
    expect(pythonRound(3.5, 0)).toBe(4)
  })
})

describe('feuilleScore = round(preuves + indices × confiance, 2)', () => {
  it('reproduit les triplets observés dans le corpus', () => {
    expect(feuilleScore(2, 2, 0.78)).toBe(3.56)
    expect(feuilleScore(0, 1, 0.35)).toBe(0.35)
    expect(feuilleScore(1, 3, 0.7)).toBe(3.1)
    expect(feuilleScore(0, 0, 1)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Fixtures synthétiques minimales : 2 pôles / 3 compétences / 2 journées,
// exerçant chaque règle découverte (verdict complet, court-circuit,
// compétence non triée, enrichissement pièces/traces, kairos, émergences).
// ---------------------------------------------------------------------------
const miniReferentiel = {
  poles: [
    { num: 1, nom: 'P1 — Alpha' },
    { num: 2, nom: 'P2 — Beta' }
  ],
  competences: [
    { code: '1.01', nom: 'Comp A', pole: 1 },
    { code: '1.02', nom: 'Comp B', pole: 1 },
    { code: '2.01', nom: 'Comp C', pole: 2 }
  ]
}

const day1 = {
  date: '2026-01-01',
  poles: [
    {
      poleNum: '1',
      passagesSaillants: [
        { pid: 1, feuille: '2026-01-01', extraitVerbatim: 'extrait passage 1', contexte: 'ctx passage 1', auteur: 'apprenant' },
        { pid: 2, extraitVerbatim: 'extrait passage 2', contexte: 'ctx passage 2' } // sans auteur
      ],
      competences: [
        {
          code: '1.01',
          courtCircuit: false,
          pieces: [
            { numero: 1, pid: 1, contexte: 'ctx pièce 1' }, // enrichie depuis le passage 1
            { numero: 2, pid: 2, contexte: 'ctx pièce 2', extraitVerbatim: 'extrait PROPRE pièce 2', auteur: 'pédagogue' }
          ],
          pedagogue: { conclusionAdversariale: { confianceFinale: 0.78 } },
          tracesRetenues: [
            { pieceId: 2, type: 'trace concrète', role: 'preuve décisive' },
            { pieceId: 99, type: 'déclaration étayée', role: 'indice corroboratif' } // pièce introuvable
          ],
          verdict: { statut: 'présence établie', nombrePreuves: 2, nombreIndices: 2, confiance: 0.78, motif: 'motif A', prescription: 'presc A' }
        },
        {
          code: '1.02',
          courtCircuit: true,
          pieces: [],
          pedagogue: null, // → {} dans le merge
          tracesRetenues: [],
          verdict: { statut: 'présence non établie', nombrePreuves: 0, nombreIndices: 0, confiance: 1, raison: 'aucune pièce', prescriptionMinimale: 'documenter' }
        }
      ],
      auditPole: { competencesTotales: 2 },
      rapport: {
        portraitPole: 'portrait P1',
        territoiresDenses: [{ competence: 'Comp A', description: 'dense' }],
        territoiresNonVisites: 'non visités',
        emergencesPole: 'émergences',
        pistes: ['piste 1'],
        rapportCompletMarkdown: '## P1'
      }
    },
    {
      poleNum: '2',
      passagesSaillants: [],
      competences: [
        {
          code: '2.01',
          courtCircuit: false,
          pieces: [{ numero: 1, pid: 7, contexte: 'ctx orphelin' }], // pid sans passage
          pedagogue: { x: 1 },
          tracesRetenues: [{ pieceId: 1, type: 'déclaration étayée', role: 'indice corroboratif' }],
          verdict: { statut: 'renvoi au cartographe', nombrePreuves: 0, nombreIndices: 1, confiance: 0.35, motif: 'motif C', prescription: 'presc C' }
        }
      ],
      auditPole: { competencesTotales: 1 },
      rapport: null // → défauts '' / []
    }
  ],
  kairos: {
    kairos: { apprenant: { portrait: 'portrait jour 1', syntheseCompleteMarkdown: '## K1' } },
    emergencesCrossPoles: {
      competencesOrphelines: [{ titre: 'orpheline', description: 'd', extraitsPortfolio: [], enRelationAvecCodes: [] }],
      connexionsTransversales: [],
      noeudsConceptuels: [{ nom: 'noeud', description: 'd', codesRelies: [] }]
    }
  }
}

const day2 = {
  date: '2026-01-02',
  poles: [
    {
      poleNum: '1',
      passagesSaillants: [],
      competences: [
        {
          code: '1.01',
          courtCircuit: false,
          pieces: [],
          pedagogue: { conclusionAdversariale: { confianceFinale: 0.7 } },
          tracesRetenues: [],
          verdict: { statut: 'présence établie', nombrePreuves: 1, nombreIndices: 3, confiance: 0.7, motif: 'motif A2', prescription: 'presc A2' }
        }
        // 1.02 ABSENTE → entrée synthétique « non triée »
      ],
      auditPole: { competencesTotales: 2 },
      rapport: null
    },
    {
      poleNum: '2',
      passagesSaillants: [],
      competences: [
        {
          code: '2.01',
          courtCircuit: false,
          pieces: [],
          pedagogue: { x: 2 },
          tracesRetenues: [],
          verdict: { statut: 'présence non établie', nombrePreuves: 0, nombreIndices: 0, confiance: 0.8, motif: 'rien', prescription: 'presc' }
        }
      ],
      auditPole: { competencesTotales: 1 },
      rapport: null
    }
  ],
  kairos: {
    kairos: { apprenant: { portrait: 'portrait jour 2', syntheseCompleteMarkdown: '## K2' } },
    emergencesCrossPoles: {
      competencesOrphelines: [],
      connexionsTransversales: [{ titre: 'connexion', description: 'd', codesRelies: [], piecesCommunes: [] }],
      noeudsConceptuels: []
    }
  }
}

describe('mergeDays — fixtures synthétiques (règles unitaires)', () => {
  const out = mergeDays([day2, day1], miniReferentiel) // ordre volontairement inversé
  const agg = out.agrege

  it('re-trie les journées et construit la période', () => {
    expect(out.periode).toEqual({
      premiere: '2026-01-01',
      derniere: '2026-01-02',
      nb_feuilles: 2,
      feuilles_chronologiques: ['2026-01-01', '2026-01-02']
    })
  })

  it('agrège une compétence sur ses seules feuilles établies', () => {
    const c = agg.par_competence['1.01']
    expect(c.cumul_preuves).toBe(3) // 2 + 1
    expect(c.cumul_indices).toBe(5) // 2 + 3
    expect(c.confiance_moyenne).toBe(0.74) // (0.78+0.7)/2
    expect(c.score).toBe(6.7) // 3 + 5×0.74
    expect(c.score_moyen_par_feuille).toBe(3.35)
    expect(c.statut_final).toBe('présence établie')
    expect(c.nb_feuilles_etablies).toBe(2)
    expect(c.presence_par_feuille.map(p => p.score)).toEqual([3.56, 3.1])
  })

  it('mappe un verdict court-circuit sur motif/prescription vides et pedagogue {}', () => {
    const p = agg.par_competence['1.02'].presence_par_feuille[0]
    expect(p).toMatchObject({
      statut: 'présence non établie',
      court_circuit: true,
      confiance: 1,
      score: 0,
      motif: '',
      prescription: '',
      pedagogue: {}
    })
  })

  it('synthétise une entrée « non triée » pour une compétence absente, sans clé pedagogue', () => {
    const p = agg.par_competence['1.02'].presence_par_feuille[1]
    expect(p).toEqual({
      date: '2026-01-02',
      statut: 'présence non établie',
      court_circuit: true,
      preuves: 0,
      indices: 0,
      confiance: 0,
      score: 0,
      motif: 'Compétence non triée pour cette feuille (court-circuit).',
      prescription: '',
      traces: [],
      pieces: []
    })
    expect('pedagogue' in p).toBe(false)
  })

  it("laisse à zéro les agrégats d'une compétence jamais établie", () => {
    const c = agg.par_competence['2.01']
    expect(c).toMatchObject({
      cumul_preuves: 0,
      cumul_indices: 0,
      confiance_moyenne: 0,
      score: 0,
      score_moyen_par_feuille: 0,
      statut_final: 'présence non établie',
      nb_feuilles_renvois: 1,
      nb_feuilles_non_etablies: 1
    })
  })

  it('enrichit les pièces : extraitVerbatim/auteur du passage, la pièce garde les siens', () => {
    const pieces = agg.par_competence['1.01'].presence_par_feuille[0].pieces
    expect(pieces[0]).toEqual({ numero: 1, pid: 1, contexte: 'ctx pièce 1', extraitVerbatim: 'extrait passage 1', auteur: 'apprenant' })
    expect(pieces[1]).toEqual({ numero: 2, pid: 2, contexte: 'ctx pièce 2', extraitVerbatim: 'extrait PROPRE pièce 2', auteur: 'pédagogue' })
  })

  it("enrichit les traces : extraitVerbatim du PASSAGE, contexte/auteur de la pièce, '' à défaut", () => {
    const traces = agg.par_competence['1.01'].presence_par_feuille[0].traces
    expect(traces[0]).toEqual({
      pieceId: 2,
      pidPassage: 2,
      type: 'trace concrète',
      role: 'preuve décisive',
      extraitVerbatim: 'extrait passage 2', // celui du passage, PAS « extrait PROPRE pièce 2 »
      contexte: 'ctx pièce 2',
      auteur: 'pédagogue'
    })
    expect(traces[1]).toEqual({
      pieceId: 99,
      pidPassage: null,
      type: 'déclaration étayée',
      role: 'indice corroboratif',
      extraitVerbatim: '',
      contexte: '',
      auteur: ''
    })
    // pièce trouvée mais passage introuvable (pid 7) → extrait '' et auteur ''
    const orphan = agg.par_competence['2.01'].presence_par_feuille[0].traces[0]
    expect(orphan).toMatchObject({ pieceId: 1, pidPassage: 7, extraitVerbatim: '', contexte: 'ctx orphelin', auteur: '' })
  })

  it('agrège par pôle (scores établis seulement) et copie les rapports avec défauts', () => {
    const p1 = agg.par_pole['1']
    expect(p1.pole_nom).toBe('P1 — Alpha')
    expect(p1.score_cumule).toBe(6.7)
    expect(p1.competences_etablies).toBe(1)
    expect(p1.competences_renvoyees).toBe(0)
    expect(p1.evolution_par_feuille).toEqual([
      { date: '2026-01-01', score: 3.56, etablies: 1, renvois: 0 },
      { date: '2026-01-02', score: 3.1, etablies: 1, renvois: 0 }
    ])
    expect(p1.rapports_par_feuille[0]).toMatchObject({
      date: '2026-01-01',
      rapportCompletMarkdown: '## P1',
      portraitPole: 'portrait P1',
      pistes: ['piste 1'],
      auditPole: { competencesTotales: 2 }
    })
    // rapport null → défauts
    expect(agg.par_pole['2'].rapports_par_feuille[0]).toEqual({
      date: '2026-01-01',
      rapportCompletMarkdown: '',
      portraitPole: '',
      territoiresDenses: [],
      territoiresNonVisites: '',
      emergencesPole: '',
      pistes: [],
      passagesSaillants: [],
      auditPole: { competencesTotales: 1 }
    })
  })

  it('cumule kairos et émergences (renommage snake_case + source_journal)', () => {
    expect(agg.global.kairos_par_feuille).toEqual([
      { date: '2026-01-01', portrait: 'portrait jour 1', syntheseCompleteMarkdown: '## K1' },
      { date: '2026-01-02', portrait: 'portrait jour 2', syntheseCompleteMarkdown: '## K2' }
    ])
    expect(agg.global.emergences_cumulees.competences_orphelines).toEqual([
      { titre: 'orpheline', description: 'd', extraitsPortfolio: [], enRelationAvecCodes: [], source_journal: '2026-01-01' }
    ])
    expect(agg.global.emergences_cumulees.connexions_transversales).toEqual([
      { titre: 'connexion', description: 'd', codesRelies: [], piecesCommunes: [], source_journal: '2026-01-02' }
    ])
    expect(agg.global.emergences_cumulees.noeuds_conceptuels).toHaveLength(1)
  })

  it('construit le profil ipsatif (proportions, top 5, Herfindahl, évolution)', () => {
    expect(agg.ipsatif.statistiques).toEqual({
      score_total: 6.7,
      competences_etablies: 1,
      competences_non_etablies: 2,
      competences_renvoyees: 0
    })
    expect(agg.ipsatif.indice_herfindahl_global).toBe(1) // une seule compétence porte tout
    expect(agg.ipsatif.par_pole['1']).toMatchObject({
      pole_num: 1,
      score_cumule: 6.7,
      proportion_globale: 1,
      competences: [{ code: '1.01', nom: 'Comp A', score: 6.7, proportion_globale: 1, proportion_intra_pole: 1 }]
    })
    expect(agg.ipsatif.par_pole['2'].competences).toEqual([])
    expect(agg.ipsatif.top_5_competences).toEqual([
      { code: '1.01', nom: 'Comp A', pole: 1, score: 6.7, proportion: 1 }
    ])
    expect(agg.ipsatif.evolution_globale).toEqual([
      { date: '2026-01-01', score_total: 3.56, etablies: 1, renvois: 1, non_etablies: 1, herfindahl: 1 },
      { date: '2026-01-02', score_total: 3.1, etablies: 1, renvois: 0, non_etablies: 2, herfindahl: 1 }
    ])
  })
})

describe('mergeDays — mini harnais sur 3 journées réelles', () => {
  const jours = ['2025-12-22', '2025-12-27', '2025-12-28'].map(d =>
    JSON.parse(readFileSync(join(ROOT, 'web', 'public', 'data', 'demo', 'jours', `${d}.json`), 'utf8'))
  )
  const referentiel = JSON.parse(
    readFileSync(join(ROOT, 'web', 'public', 'data', 'referentiel', 'respire-v7.json'), 'utf8')
  )
  const out = mergeDays(jours, referentiel)
  const agg = out.agrege

  it('couvre les 61 compétences × 3 feuilles', () => {
    expect(Object.keys(agg.par_competence)).toHaveLength(61)
    for (const c of Object.values(agg.par_competence)) {
      expect(c.presence_par_feuille).toHaveLength(3)
    }
    expect(Object.keys(agg.par_pole)).toHaveLength(7)
    expect(agg.global.kairos_par_feuille).toHaveLength(3)
    expect(agg.ipsatif.evolution_globale).toHaveLength(3)
  })

  it('reproduit les valeurs réelles de 1.01 (établie le 28/12 seulement)', () => {
    const c = agg.par_competence['1.01']
    expect(c.nom).toBe('Pensée Critique & Anti-Hallucination')
    expect(c.pole).toBe(1)
    expect(c.nb_feuilles_etablies).toBe(1)
    expect(c.nb_feuilles_renvois).toBe(2)
    expect(c.cumul_preuves).toBe(2)
    expect(c.cumul_indices).toBe(2)
    expect(c.confiance_moyenne).toBe(0.78)
    expect(c.score).toBe(3.56)
    expect(c.score_moyen_par_feuille).toBe(3.56)
    expect(c.statut_final).toBe('présence établie')
    expect(c.presence_par_feuille.map(p => p.score)).toEqual([0.35, 0.5, 3.56])
  })

  it("reproduit l'évolution globale de la première feuille (valeurs de l'oracle)", () => {
    // Ces valeurs ne dépendent que de la journée elle-même : elles sont
    // identiques dans carto_merge.json (agrege.ipsatif.evolution_globale[0]).
    expect(agg.ipsatif.evolution_globale[0]).toEqual({
      date: '2025-12-22',
      score_total: 12.5,
      etablies: 11,
      renvois: 13,
      non_etablies: 37,
      herfindahl: 0.1158
    })
  })
})
