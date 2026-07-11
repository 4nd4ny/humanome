import { describe, expect, it } from 'vitest'
import { SUPPORTED_KINDS, validateDocument } from './validation.js'

// Minimal but real-shaped "cartographie-merge" document: same field names and
// value shapes as web/public/data/demo/merge.json, reduced to 1 sheet and
// 1 competence per pole. PHP twin fixture: api/tests/ValidationTest.php.
const POLES = [
  ['TETE — Penser & Comprendre', '#2563eb'],
  ['COEUR — Relier & Naviguer', '#10b981'],
  ['MAIN — Créer & Incarner', '#ec4899'],
  ['AME — Discerner & Juger', '#8b5cf6'],
  ['RACINES — Évoluer & Résister', '#f59e0b'],
  ["CITE — Gouverner & S'ouvrir", '#06b6d4'],
  ['FLAMBEAU — Transmettre & Piloter', '#f97316'],
]

function makeCompetence(poleNum) {
  const code = `${poleNum}.01`
  return {
    id: `${code} — Compétence démo`,
    code,
    description: 'Compétence démo',
    niveau: 3,
    points: 2,
    statut: 'présence établie',
    archetype: 'trait_fondateur',
    archetype_titre: 'Trait fondateur',
    archetype_description: 'Revient souvent et avec densité',
    feedback: '<div class="verdict-badge etablie">Présence établie</div>',
    score_cumule: 3.56,
    score_moyen_par_feuille: 3.56,
    confiance_moyenne: 0.78,
    cumul_preuves: 2,
    cumul_indices: 2,
    nb_feuilles_etablies: 1,
    nb_feuilles_renvois: 0,
    parFeuille: [
      {
        date: '2025-12-22',
        statut: 'présence établie',
        confiance: 0.78,
        preuves: 2,
        indices: 2,
        score: 3.56,
      },
    ],
  }
}

function makeDomain(poleNum) {
  const [id, color] = POLES[poleNum - 1]
  return {
    id,
    color,
    competences: [makeCompetence(poleNum)],
    parFeuille: [{ date: '2025-12-22', score: 3.56, etablies: 1, renvois: 0 }],
    rapport_html: '<p>Rapport évolutif du pôle.</p>',
    tendance_temporelle: 'presence_reguliere',
    tendance_titre: 'Présence régulière',
    tendance_description: 'Pôle mobilisé tout au long de la période',
    tendance_stats: { t1: 1, t2: 1, t3: 1, p1: 33.3, p2: 33.3, p3: 33.4, ecart_max_min: 0.1 },
  }
}

function makeProfilIpsatif() {
  const entries = POLES.map(([poleNom], index) => {
    const poleNum = index + 1
    return [
      String(poleNum),
      {
        pole_num: poleNum,
        pole_nom: poleNom,
        score_cumule: 3.56,
        proportion_globale: 0.1429,
        competences_etablies: 1,
        competences: [
          {
            code: `${poleNum}.01`,
            nom: 'Compétence démo',
            score: 3.56,
            proportion_globale: 0.1429,
            proportion_intra_pole: 1,
          },
        ],
      },
    ]
  })
  return Object.fromEntries(entries)
}

function makeMergeDocument() {
  return {
    schemaVersion: '1.0.0',
    kind: 'cartographie-merge',
    generatedAt: '2026-01-05T12:00:00',
    source: {
      protocole: 'Aurora v3 — pédagogue adversarial · merge évolutif v3',
      journalId: 'merged',
    },
    periode: { premiere: '2025-12-22', derniere: '2025-12-22', nbFeuilles: 1 },
    domains: [1, 2, 3, 4, 5, 6, 7].map(makeDomain),
    profilMeta: {
      journal_id: 'merged',
      nb_feuilles: 1,
      premiere_date: '2025-12-22',
      derniere_date: '2025-12-22',
      date_construction: '2026-01-05T12:00:00',
      source_protocole: 'Aurora v3 — pédagogue adversarial · merge évolutif v3',
      score_total: 24.92,
      indice_herfindahl: 0.1429,
      competences_etablies: 7,
      competences_renvoyees: 0,
      competences_orphelines: 0,
      feuilles_chronologiques: ['2025-12-22'],
      evolution_globale: [
        {
          date: '2025-12-22',
          score_total: 24.92,
          etablies: 7,
          renvois: 0,
          non_etablies: 54,
          herfindahl: 0.1429,
        },
      ],
    },
    profilIpsatif: makeProfilIpsatif(),
    feuilles: [
      {
        date: '2025-12-22',
        iso: '2025-12-22',
        label: '22/12/2025',
        ordre: 0,
        carto_day_url: 'feuilles/2025-12-22/carto-day.html',
      },
    ],
    narratifs: {
      kairosHtml: '<p>Synthèse évolutive.</p>',
      rapportHtml: '<p>Synthèse évolutive.</p>',
    },
    reserved: {
      connexionsData: [],
      noeudsConceptuels: [],
      patternTemporel: { pattern: '', description: '' },
      piecesData: {},
    },
  }
}

describe('validateDocument', () => {
  it('supports the five document kinds', () => {
    expect([...SUPPORTED_KINDS].sort()).toEqual([
      'archive-export',
      'cartographie-jour',
      'cartographie-merge',
      'prompt-package',
      'referentiel',
    ])
  })

  it('compiles the five schemas (cross-schema $ref included)', () => {
    for (const kind of SUPPORTED_KINDS) {
      // an empty object is never a valid document, but validation must run
      // without throwing: that proves the schema compiled and its $ref resolved
      const result = validateDocument(kind, {})
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    }
  })

  it('rejects an unsupported kind', () => {
    expect(() => validateDocument('inconnu', {})).toThrow(/Unsupported document kind/)
  })

  it('accepts a minimal real cartographie-merge document', () => {
    const result = validateDocument('cartographie-merge', makeMergeDocument())
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('rejects a statut outside the enum with an actionable error', () => {
    const doc = makeMergeDocument()
    doc.domains[0].competences[0].statut = 'présence cosmique'

    const result = validateDocument('cartographie-merge', doc)

    expect(result.valid).toBe(false)
    const enumError = result.errors.find(
      (error) => error.keyword === 'enum' && error.path === '/domains/0/competences/0/statut',
    )
    expect(enumError).toBeDefined()
    expect(enumError.message).toMatch(/equal to one of the allowed values/)
  })
})
