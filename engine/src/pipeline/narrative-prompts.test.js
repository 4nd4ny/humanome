import { describe, expect, it } from 'vitest'

import {
  buildCompetencePrompt,
  buildKairosPrompt,
  buildNarrativePrompts,
  buildPolePrompt,
  formatDateFr,
  formatFixed2,
} from './narrative-prompts.js'

// Full-corpus parity (69/69 against intermediate/prompts/) is checked by
// scripts/parity/parity-prompts.mjs; here we pin the formatting helpers and
// the template structure on a mini-fixture.

describe('formatDateFr', () => {
  it('renders ISO dates as JJ/MM/AAAA', () => {
    expect(formatDateFr('2025-12-22')).toBe('22/12/2025')
    expect(formatDateFr('2026-03-04')).toBe('04/03/2026')
  })
})

describe('formatFixed2', () => {
  it('pads to two decimals', () => {
    expect(formatFixed2(0)).toBe('0.00')
    expect(formatFixed2(1)).toBe('1.00')
    expect(formatFixed2(0.5)).toBe('0.50')
    expect(formatFixed2(54.23)).toBe('54.23')
  })

  it('rounds on the third decimal', () => {
    expect(formatFixed2(0.7171)).toBe('0.72')
    expect(formatFixed2(2.5824)).toBe('2.58')
    expect(formatFixed2(0.996)).toBe('1.00')
    expect(formatFixed2(419.319999999999993)).toBe('419.32')
  })

  it('rounds exact binary ties half-to-even like Python %.2f (not like toFixed)', () => {
    expect(formatFixed2(0.125)).toBe('0.12') // toFixed(2) would give '0.13'
    expect(formatFixed2(0.375)).toBe('0.38')
    expect(formatFixed2(0.625)).toBe('0.62')
    expect(formatFixed2(0.875)).toBe('0.88')
    // 0.635 is NOT an exact tie: its double is 0.6350000000000000088...
    expect(formatFixed2(0.635)).toBe('0.64')
  })
})

// --- mini-fixture: 1 competence x 3 sheets, 1 pole, kairos -----------------

const periode = {
  premiere: '2026-01-01',
  derniere: '2026-01-03',
  nb_feuilles: 3,
  feuilles_chronologiques: ['2026-01-01', '2026-01-02', '2026-01-03'],
}

const competence = {
  code: '1.01',
  nom: 'Pensée Critique',
  pole: 1,
  cumul_preuves: 2,
  cumul_indices: 1,
  confiance_moyenne: 0.7171,
  score: 3.1,
  statut_final: 'présence établie',
  nb_feuilles_etablies: 1,
  presence_par_feuille: [
    {
      date: '2026-01-01',
      statut: 'présence établie',
      court_circuit: false,
      preuves: 2,
      indices: 1,
      confiance: 0.78,
      score: 2.78,
      motif: 'Deux pièces confirmées.',
      prescription: 'Documenter le protocole.',
      traces: [
        { role: 'preuve décisive', extraitVerbatim: 'Extrait A' },
        { role: 'indice corroboratif', extraitVerbatim: '' }, // skipped: no verbatim
        { role: 'indice corroboratif', extraitVerbatim: 'Extrait B' },
      ],
    },
    {
      // short-circuited sheet: only the status line, even with a motif present
      date: '2026-01-02',
      statut: 'présence non établie',
      court_circuit: true,
      preuves: 0,
      indices: 0,
      confiance: 0,
      score: 0,
      motif: 'Ignoré (court-circuit).',
      prescription: '',
      traces: [],
    },
    {
      // examined but nothing survived: no motif/prescription/traces lines
      date: '2026-01-03',
      statut: 'présence non établie',
      court_circuit: false,
      preuves: 0,
      indices: 0,
      confiance: 1,
      score: 0,
      motif: '',
      prescription: '',
      traces: [],
    },
  ],
}

const pole = {
  pole_num: 1,
  pole_nom: 'TETE — Penser & Comprendre',
  rapports_par_feuille: [
    { date: '2026-01-01', rapportCompletMarkdown: '## Portrait du pôle\n\nTexte.\n' }, // trailing \n stripped
    { date: '2026-01-02', rapportCompletMarkdown: '' }, // day run produced no report
    { date: '2026-01-03', rapportCompletMarkdown: '## Portrait du pôle\n\nSuite.' },
  ],
}

const globalAgrege = {
  kairos_par_feuille: [
    { date: '2026-01-01', syntheseCompleteMarkdown: '## Portrait\n\nKairos 1.' },
    { date: '2026-01-02', syntheseCompleteMarkdown: '## Portrait\n\nKairos 2.' },
    { date: '2026-01-03', syntheseCompleteMarkdown: '## Portrait\n\nKairos 3.' },
  ],
}

describe('buildCompetencePrompt', () => {
  const prompt = buildCompetencePrompt(competence, pole.pole_nom, periode)

  it('renders the title and the Cadre with formatted numbers and dates', () => {
    expect(prompt.startsWith("# Histoire d'apprentissage — Compétence 1.01 : Pensée Critique\n")).toBe(true)
    expect(prompt).toContain('- Compétence : **1.01 — Pensée Critique** (Pôle 1 — TETE — Penser & Comprendre)')
    expect(prompt).toContain('- Période : du **01/01/2026** au **03/01/2026**')
    expect(prompt).toContain(
      '- Nombre de feuilles cartographiées : **3** ; feuilles ayant établi cette compétence : **1**',
    )
    expect(prompt).toContain(
      '- Cumul : **2** preuves décisives, **1** indices ; confiance moyenne : **0.72** ; score cumulé : **3.10**',
    )
  })

  it('renders a full sheet block with verdict, prescription and non-empty traces only', () => {
    expect(prompt).toContain(
      '## Feuille du 01/01/2026 (date ISO : 2026-01-01)\n\n' +
        '- **Statut** : présence établie\n' +
        '- **Preuves** : 2, **Indices** : 1, **Confiance** : 0.78, **Score** : 2.78\n' +
        '- **Verdict (motif)** : Deux pièces confirmées.\n' +
        '- **Prescription** : Documenter le protocole.\n' +
        '- **Traces retenues** :\n' +
        '  - (preuve décisive) « Extrait A »\n' +
        '  - (indice corroboratif) « Extrait B »\n' +
        '\n---\n',
    )
  })

  it('reduces short-circuited sheets to the status line, ignoring their motif', () => {
    expect(prompt).toContain(
      '## Feuille du 02/01/2026 (date ISO : 2026-01-02)\n\n' +
        '- **Statut** : court-circuit (compétence non triée pour cette feuille)\n' +
        '\n---\n',
    )
    expect(prompt).not.toContain('Ignoré (court-circuit).')
  })

  it('omits verdict/prescription/traces lines when they are empty', () => {
    expect(prompt).toContain(
      '## Feuille du 03/01/2026 (date ISO : 2026-01-03)\n\n' +
        '- **Statut** : présence non établie\n' +
        '- **Preuves** : 0, **Indices** : 0, **Confiance** : 1.00, **Score** : 0.00\n' +
        '\n---\n',
    )
  })

  it('ends with a separator and a single trailing newline', () => {
    expect(prompt.endsWith('\n\n---\n')).toBe(true)
    expect(prompt.endsWith('\n\n---\n\n')).toBe(false)
  })
})

describe('buildPolePrompt', () => {
  const prompt = buildPolePrompt(pole, periode)

  it('interpolates the pole number into title, Cadre, task line and data heading', () => {
    expect(prompt.startsWith('# Synthèse évolutive du Pôle 1 — TETE — Penser & Comprendre\n')).toBe(true)
    expect(prompt).toContain('- Pôle : **1 — TETE — Penser & Comprendre**')
    expect(prompt).toContain('des rapports du pôle 1 de chacune des feuilles')
    expect(prompt).toContain('# Données : rapports du pôle 1 par feuille (ordre chronologique)')
    expect(prompt).not.toContain('{{N}}')
  })

  it('lists the ISO dates in backticks', () => {
    expect(prompt).toContain('- Dates ISO : `2026-01-01, 2026-01-02, 2026-01-03`')
  })

  it('injects day reports verbatim minus trailing newline, and collapses missing reports', () => {
    expect(prompt).toContain(
      '## Feuille du 01/01/2026 (date ISO : 2026-01-01)\n\n## Portrait du pôle\n\nTexte.\n\n---\n',
    )
    // empty report: heading directly followed by the separator (single blank line)
    expect(prompt).toContain('## Feuille du 02/01/2026 (date ISO : 2026-01-02)\n\n\n---\n')
  })
})

describe('buildKairosPrompt', () => {
  const prompt = buildKairosPrompt(globalAgrege, periode)

  it('renders the fixed kairos frame and the per-sheet syntheses', () => {
    expect(prompt.startsWith('# Synthèse évolutive du Kairos — Portfolio multi-feuilles\n')).toBe(true)
    expect(prompt).toContain('# Données : rapports Kairos par feuille (ordre chronologique)')
    expect(prompt).toContain(
      '## Feuille du 03/01/2026 (date ISO : 2026-01-03)\n\n## Portrait\n\nKairos 3.\n\n---\n',
    )
  })
})

describe('buildNarrativePrompts', () => {
  const agrege = {
    par_competence: { '1.01': competence },
    par_pole: { 1: pole },
    global: globalAgrege,
  }

  it('returns competence prompts, then pole prompts, then kairos, with oracle filenames', () => {
    const prompts = buildNarrativePrompts(agrege, { periode })
    expect(prompts.map((p) => p.filename)).toEqual([
      'competence_1.01.prompt.md',
      'pole_1.prompt.md',
      'kairos.prompt.md',
    ])
    expect(prompts.map((p) => p.type)).toEqual(['competence', 'pole', 'kairos'])
    expect(prompts[0].content).toBe(buildCompetencePrompt(competence, pole.pole_nom, periode))
    expect(prompts[1].content).toBe(buildPolePrompt(pole, periode))
    expect(prompts[2].content).toBe(buildKairosPrompt(globalAgrege, periode))
  })

  it('requires meta.periode', () => {
    expect(() => buildNarrativePrompts(agrege, {})).toThrow(/periode/)
  })
})
