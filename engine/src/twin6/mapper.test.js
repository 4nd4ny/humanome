import { describe, it, expect } from 'vitest'
import { twin6ToMergeDocument } from './mapper.js'
import { validateDocument } from '../validation.js'

// Référentiel minimal : 2 pôles, 3 compétences.
// Le schéma cartographie-merge exige les 7 pôles RESPIRE (domains minItems 7) ;
// en production Twin6 tourne toujours sur le référentiel complet. Les pôles 3–7
// sans compétence attestée deviennent des domaines vides (légitimes).
const referentiel = {
  poles: [
    { num: 1, nom: 'TÊTE — Penser & Comprendre' },
    { num: 2, nom: 'CŒUR — Relier & Naviguer' },
    { num: 3, nom: 'MAIN — Créer & Incarner' },
    { num: 4, nom: 'ÂME — Discerner & Juger' },
    { num: 5, nom: 'RACINES — Évoluer & Résister' },
    { num: 6, nom: 'CITÉ — Gouverner & S’ouvrir' },
    { num: 7, nom: 'FLAMBEAU — Transmettre & Piloter' },
  ],
  competences: [
    { code: '1.01', nom: 'Pensée critique', pole: 1 },
    { code: '1.02', nom: 'Cadrage de l’intention', pole: 1 },
    { code: '2.01', nom: 'Intelligence émotionnelle', pole: 2 },
    { code: '3.01', nom: 'Créativité itérative', pole: 3 },
    { code: '4.01', nom: 'Raisonnement éthique', pole: 4 },
    { code: '5.01', nom: 'Résilience', pole: 5 },
    { code: '6.01', nom: 'Red-teaming', pole: 6 },
    { code: '7.01', nom: 'Maïeutique', pole: 7 },
  ],
}

// carto_pole minimal : une compétence attestée par une trace concrète sur UNE feuille.
function poleFixture(num, code) {
  return {
    poleNum: num,
    passagesSaillants: [{ pid: 1, feuille: '2026-01-12', extraitVerbatim: `Trace pôle ${num}.`, contexte: 'projet', auteur: 'apprenant' }],
    competences: [
      {
        code,
        courtCircuit: false,
        pieces: [{ numero: 1, pid: 1, contexte: 'acte documenté' }],
        pedagogue: { conclusionAdversariale: { raisonnement: `Attestation pôle ${num}.`, confianceFinale: 0.6 } },
        verdict: { statut: 'présence établie', nombrePreuves: 1, nombreIndices: 0, confiance: 0.6, motif: 'Trace concrète.', prescription: 'Poursuivre.' },
        tracesRetenues: [{ pieceId: 1, type: 'trace concrète', role: 'preuve décisive' }],
      },
    ],
    rapport: { rapportCompletMarkdown: `## Portrait du pôle ${num}\n\nUn travail présent.`, portraitPole: '.' },
    auditPole: { competencesTotales: 1, presencesEtablies: 1 },
  }
}

// Un `carto_pole` Twin6 pour le pôle 1 : deux feuilles (05 et 12 janvier).
// 1.01 est attestée sur les DEUX feuilles (2 traces concrètes) → points = 2.
// 1.02 est attestée sur UNE feuille (1 indice) → points = 1.
const cartoPole1 = {
  poleNum: 1,
  passagesSaillants: [
    { pid: 1, feuille: '2026-01-05', extraitVerbatim: 'J’ai remis en cause la source.', contexte: 'atelier', auteur: 'apprenant' },
    { pid: 2, feuille: '2026-01-12', extraitVerbatim: 'J’ai recoupé trois références.', contexte: 'projet', auteur: 'apprenant' },
    { pid: 3, feuille: '2026-01-05', extraitVerbatim: 'Je voulais clarifier mon but.', contexte: 'atelier', auteur: 'apprenant' },
  ],
  competences: [
    {
      code: '1.01',
      courtCircuit: false,
      pieces: [
        { numero: 1, pid: 1, contexte: 'remise en cause' },
        { numero: 2, pid: 2, contexte: 'recoupement' },
      ],
      pedagogue: { conclusionAdversariale: { raisonnement: 'La double lecture tient.', confianceFinale: 0.8 } },
      verdict: { statut: 'présence établie', nombrePreuves: 2, nombreIndices: 0, confiance: 0.8, motif: 'Deux traces concrètes.', prescription: 'Continuer à documenter les recoupements.' },
      tracesRetenues: [
        { pieceId: 1, type: 'trace concrète', role: 'preuve décisive' },
        { pieceId: 2, type: 'trace concrète', role: 'preuve décisive' },
      ],
    },
    {
      code: '1.02',
      courtCircuit: false,
      pieces: [{ numero: 1, pid: 3, contexte: 'clarification du but' }],
      pedagogue: { conclusionAdversariale: { raisonnement: 'Un indice étayé.', confianceFinale: 0.5 } },
      verdict: { statut: 'présence établie', nombrePreuves: 0, nombreIndices: 1, confiance: 0.5, motif: 'Déclaration étayée.', prescription: 'Expliciter le cadrage plus souvent.' },
      tracesRetenues: [{ pieceId: 1, type: 'déclaration étayée', role: 'indice corroboratif' }],
    },
  ],
  rapport: { rapportCompletMarkdown: '## Portrait du pôle 1\n\nUn travail d’analyse net.', portraitPole: 'Analyse.' },
  auditPole: { competencesTotales: 2, presencesEtablies: 2 },
}

// Pôle 2 : 2.01 attestée sur une feuille.
const cartoPole2 = {
  poleNum: 2,
  passagesSaillants: [
    { pid: 1, feuille: '2026-01-12', extraitVerbatim: 'J’ai écouté avant de répondre.', contexte: 'conflit', auteur: 'apprenant' },
  ],
  competences: [
    {
      code: '2.01',
      courtCircuit: false,
      pieces: [{ numero: 1, pid: 1, contexte: 'écoute active' }],
      pedagogue: { conclusionAdversariale: { raisonnement: 'Écoute attestée.', confianceFinale: 0.7 } },
      verdict: { statut: 'présence établie', nombrePreuves: 1, nombreIndices: 0, confiance: 0.7, motif: 'Trace concrète.', prescription: 'Nommer les émotions en jeu.' },
      tracesRetenues: [{ pieceId: 1, type: 'trace concrète', role: 'preuve décisive' }],
    },
  ],
  rapport: { rapportCompletMarkdown: '## Portrait du pôle 2\n\nUne écoute présente.', portraitPole: 'Relation.' },
  auditPole: { competencesTotales: 1, presencesEtablies: 1 },
}

const kairos = {
  kairos: {
    apprenant: {
      portrait: 'Un profil analytique et à l’écoute.',
      formeProfil: 'Deux massifs distincts.',
      syntheseCompleteMarkdown: '## Synthèse\n\nLe travail montre une analyse solide reliée à une écoute.',
    },
  },
  emergencesCrossPoles: {
    competencesOrphelines: [],
    connexionsTransversales: [{ titre: 'Analyse ↔ écoute', description: 'Les deux se répondent.', codesRelies: ['1.01', '2.01'], piecesCommunes: [] }],
    noeudsConceptuels: [],
  },
}

describe('twin6ToMergeDocument', () => {
  const meta = { journalId: 'demo-twin6', sourceProtocole: 'twin6-ouverte@1.0.0', generatedAt: '2026-07-15T00:00:00' }
  const cartoPoles = [
    cartoPole1,
    cartoPole2,
    poleFixture(3, '3.01'),
    poleFixture(4, '4.01'),
    poleFixture(5, '5.01'),
    poleFixture(6, '6.01'),
    poleFixture(7, '7.01'),
  ]
  const doc = twin6ToMergeDocument(cartoPoles, kairos, referentiel, meta)

  it('produit un document cartographie-merge valide contre le schéma', () => {
    const res = validateDocument('cartographie-merge', doc)
    expect(res.errors).toEqual([])
    expect(res.valid).toBe(true)
    expect(doc.kind).toBe('cartographie-merge')
    expect(doc.source).toEqual({ protocole: 'twin6-ouverte@1.0.0', journalId: 'demo-twin6' })
  })

  it('reconstruit la fréquence par feuille (points = nb de feuilles attestées)', () => {
    expect(doc.profilMeta.nb_feuilles).toBe(2)
    const comps = {}
    for (const dom of doc.domains) for (const c of dom.competences) comps[c.code] = c
    expect(comps['1.01'].points).toBe(2) // attestée sur 05 ET 12 janvier
    expect(comps['1.02'].points).toBe(1) // attestée sur 05 janvier
    expect(comps['2.01'].points).toBe(1) // attestée sur 12 janvier
    expect(comps['1.01'].niveau).toBeGreaterThanOrEqual(1)
    expect(comps['1.01'].niveau).toBeLessThanOrEqual(5)
  })

  it('injecte les narratifs Twin6 (rapport de pôle, kairos, histoire synthétisée)', () => {
    expect(doc.narratifs.kairosHtml).toContain('analyse solide reliée à une écoute')
    const pole1 = doc.domains.find((d) => d.id.includes('TÊTE'))
    expect(pole1.rapport_html).toContain('Un travail d’analyse net')
    const c101 = pole1.competences.find((c) => c.code === '1.01')
    expect(c101.feedback).toContain('La double lecture tient') // raisonnement adversarial Twin6
  })

  it('refuse une entrée sans feuille datée', () => {
    const sansFeuille = { poleNum: 1, passagesSaillants: [{ pid: 1, extraitVerbatim: 'x', auteur: 'apprenant' }], competences: [] }
    expect(() => twin6ToMergeDocument([sansFeuille], null, referentiel, meta)).toThrow(/feuille datée/)
  })
})
