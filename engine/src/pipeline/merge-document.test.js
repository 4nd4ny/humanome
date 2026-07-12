import { describe, it, expect } from 'vitest'
import {
  buildMergeDocument,
  buildFeedbackHtml,
  buildPoleRapportHtml,
  buildKairosHtml,
  computeArchetype,
  computeNiveaux,
  computeTendance,
  escapeHtml,
  frDate,
  isRendered,
  markdownToHtml,
  quantilesExclusive,
} from './merge-document.js'

// ---------------------------------------------------------------------------
// Règles découvertes sur les 54 exemples réels (voir scripts/parity/parity-document.mjs :
// parité 100 % contre web/public/data/demo/merge.json).
// ---------------------------------------------------------------------------

describe('filtrage (règle 1)', () => {
  it('rend uniquement les compétences au statut final « présence établie »', () => {
    expect(isRendered({ statut_final: 'présence établie' })).toBe(true)
    expect(isRendered({ statut_final: 'présence non établie' })).toBe(false)
    expect(isRendered({ statut_final: 'renvoi au cartographe' })).toBe(false)
  })
})

describe('quantilesExclusive', () => {
  it('reproduit statistics.quantiles(v, n=5) de Python (méthode exclusive)', () => {
    // 54 valeurs -> positions (55·k/5) = 11, 22, 33, 44 (1-based) : seuils exacts.
    const v = Array.from({ length: 54 }, (_, i) => i + 1)
    expect(quantilesExclusive(v, 5)).toEqual([11, 22, 33, 44])
  })

  it('interpole linéairement quand la position tombe entre deux valeurs', () => {
    // statistics.quantiles([1..4], n=4) == [1.25, 2.5, 3.75]
    expect(quantilesExclusive([1, 2, 3, 4], 4)).toEqual([1.25, 2.5, 3.75])
  })
})

describe('niveau (règle 2 — quintile du score moyen par feuille)', () => {
  it('découpe 54 valeurs distinctes en 10/11/11/11/11', () => {
    const comps = Array.from({ length: 54 }, (_, i) => ({
      code: `c${i}`,
      score_moyen_par_feuille: i + 1,
    }))
    const niveaux = computeNiveaux(comps)
    const dist = [1, 2, 3, 4, 5].map(
      (n) => [...niveaux.values()].filter((x) => x === n).length,
    )
    expect(dist).toEqual([10, 11, 11, 11, 11])
  })

  it('une valeur égale au seuil bascule dans le quintile supérieur', () => {
    const comps = Array.from({ length: 54 }, (_, i) => ({
      code: `c${i}`,
      score_moyen_par_feuille: i + 1,
    }))
    const niveaux = computeNiveaux(comps)
    // seuils = 11, 22, 33, 44 ; la valeur 11 est niveau 2 (>= seuil), la valeur 10 niveau 1.
    expect(niveaux.get('c9')).toBe(1) // valeur 10
    expect(niveaux.get('c10')).toBe(2) // valeur 11 == seuil
    expect(niveaux.get('c43')).toBe(5) // valeur 44 == seuil
  })
})

describe('archetype (règle 4 — arbre de décision)', () => {
  const comp = (nbe, renv, pole = 1) => ({
    nb_feuilles_etablies: nbe,
    nb_feuilles_renvois: renv,
    pole,
  })

  it('renvois >= établies -> frontiere_en_mouvement (priorité absolue)', () => {
    expect(computeArchetype(comp(5, 5), 5, 3)).toBe('frontiere_en_mouvement')
    expect(computeArchetype(comp(1, 9), 1, 3)).toBe('frontiere_en_mouvement')
  })

  it('niveau 3 -> en_formation quelle que soit la fréquence', () => {
    expect(computeArchetype(comp(32, 4), 3, 22)).toBe('en_formation') // 7.06 réel
    expect(computeArchetype(comp(6, 4), 3, 12)).toBe('en_formation') // 4.01 réel
  })

  it('niveau >= 4 : trait_fondateur si nbe >= médiane du pôle, sinon pic_intensite', () => {
    expect(computeArchetype(comp(7, 4), 4, 7)).toBe('trait_fondateur') // 2.07 réel (== médiane)
    expect(computeArchetype(comp(14, 12), 5, 18.5)).toBe('pic_intensite') // 1.07 réel
    expect(computeArchetype(comp(1, 0), 5, 5)).toBe('pic_intensite') // 6.01 réel
  })

  it('niveau <= 2 : presence_arriere_plan si nbe >= médiane du pôle, sinon touche_occasionnelle', () => {
    expect(computeArchetype(comp(5, 1), 2, 5)).toBe('presence_arriere_plan') // 6.03 réel (== médiane)
    expect(computeArchetype(comp(5, 2), 2, 7)).toBe('touche_occasionnelle') // 2.03 réel
    expect(computeArchetype(comp(11, 9), 1, 12)).toBe('touche_occasionnelle') // 4.07 réel
  })
})

describe('tendance temporelle des pôles (règle 5)', () => {
  const evo = (etablies) => etablies.map((e, i) => ({ date: `d${i}`, score: 0, etablies: e, renvois: 0 }))

  it('coupe les tiers à floor(n/3) et floor(2n/3) et publie t/p/ecart', () => {
    // Pôle 1 réel : 59 feuilles -> tiers de 19/20/20, t = 55/69/61.
    const counts = new Array(59).fill(0)
    // reconstitution synthétique : 55 établies sur les 19 premières, etc.
    const fill = (from, to, total) => {
      let rest = total
      for (let i = from; i < to; i++) {
        const x = Math.min(rest, 5)
        counts[i] = x
        rest -= x
      }
    }
    fill(0, 19, 55)
    fill(19, 39, 69)
    fill(39, 59, 61)
    const { tendance, stats } = computeTendance(evo(counts))
    expect(stats).toEqual({ t1: 55, t2: 69, t3: 61, p1: 29.7, p2: 37.3, p3: 33, ecart_max_min: 7.6 })
    expect(tendance).toBe('presence_reguliere')
  })

  it('écart brut > 12 avec p3 max -> crescendo', () => {
    const { tendance } = computeTendance(evo([1, 1, 1, 2, 2, 2, 5, 5, 5]))
    expect(tendance).toBe('crescendo')
  })

  it('écart brut > 12 avec p2 max -> pic_milieu', () => {
    const { tendance } = computeTendance(evo([2, 2, 2, 5, 5, 5, 3, 3, 3]))
    expect(tendance).toBe('pic_milieu')
  })

  it('écart brut exactement 12 -> presence_reguliere (pôle 7 réel : 36/38/26)', () => {
    // t = 54/57/39 -> p = 36/38/26 exactement, écart 12.0.
    const counts = []
    const per = (total, n) => Array.from({ length: n }, (_, i) => Math.floor((total * (i + 1)) / n) - Math.floor((total * i) / n))
    counts.push(...per(54, 19), ...per(57, 20), ...per(39, 20))
    const { tendance, stats } = computeTendance(evo(counts))
    expect(stats.ecart_max_min).toBe(12)
    expect(tendance).toBe('presence_reguliere')
  })

  it('les p publiés sont arrondis à 1 décimale mais l’écart se calcule sur les bruts', () => {
    // Pôle 2 réel : t = 20/27/29 -> p arrondis 26.3/35.5/38.2, écart 11.8 (≠ 38.2-26.3 = 11.9).
    const counts = []
    const per = (total, n) => Array.from({ length: n }, (_, i) => Math.floor((total * (i + 1)) / n) - Math.floor((total * i) / n))
    counts.push(...per(20, 19), ...per(27, 20), ...per(29, 20))
    const { stats, tendance } = computeTendance(evo(counts))
    expect(stats).toEqual({ t1: 20, t2: 27, t3: 29, p1: 26.3, p2: 35.5, p3: 38.2, ecart_max_min: 11.8 })
    expect(tendance).toBe('presence_reguliere')
  })
})

describe('markdownToHtml (conversion du prototype)', () => {
  it('## -> <h4>, une ligne = un <p>', () => {
    expect(markdownToHtml('## Portrait\n\nPremière ligne.\nDeuxième ligne.')).toBe(
      '<h4>Portrait</h4>\n<p>Première ligne.</p>\n<p>Deuxième ligne.</p>',
    )
  })

  it('échappe comme html.escape de Python, avant les balises inline', () => {
    expect(markdownToHtml("l'a => **b** & `c` <d>")).toBe(
      '<p>l&#x27;a =&gt; <strong>b</strong> &amp; <code>c</code> &lt;d&gt;</p>',
    )
    expect(escapeHtml(`"'&<>`)).toBe('&quot;&#x27;&amp;&lt;&gt;')
  })

  it('*italique* -> <em>', () => {
    expect(markdownToHtml('phrase *clé* finale')).toBe('<p>phrase <em>clé</em> finale</p>')
  })

  it('fusionne dans un même <ul> des items séparés par des lignes vides', () => {
    expect(markdownToHtml('- a\n\n- b\n\nsuite')).toBe(
      '<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n<p>suite</p>',
    )
  })

  it('chaque bloc "> " devient un <blockquote> distinct', () => {
    expect(markdownToHtml('> q1\n\n> q2')).toBe('<blockquote>q1</blockquote>\n<blockquote>q2</blockquote>')
  })
})

// ---------------------------------------------------------------------------
// Assemblages HTML
// ---------------------------------------------------------------------------

const compFixture = {
  code: '9.01',
  nom: 'Compétence Test',
  pole: 9,
  statut_final: 'présence établie',
  nb_feuilles_etablies: 1,
  nb_feuilles_renvois: 0,
  cumul_preuves: 0,
  cumul_indices: 1,
  confiance_moyenne: 0.7171, // -> « 71 % » (troncature, pas d'arrondi)
  score: 3.6, // -> « Score 4 » (arrondi)
  score_moyen_par_feuille: 3.6,
  presence_par_feuille: [
    { date: '2026-01-01', statut: 'présence établie', court_circuit: false, preuves: 0, indices: 1, confiance: 0.72, score: 3.6 },
    { date: '2026-01-02', statut: 'présence non établie', court_circuit: true, preuves: 0, indices: 0, confiance: 1, score: 0 },
    { date: '2026-01-03', statut: 'renvoi au cartographe', court_circuit: false, preuves: 0, indices: 1, confiance: 0.4, score: 0.4 },
  ],
}

describe('buildFeedbackHtml (règle 6)', () => {
  const html = buildFeedbackHtml(compFixture, 'Récit.')

  it('badge + résumé : singulier à 1, renvois omis à 0, confiance tronquée, score arrondi', () => {
    expect(html).toContain('<div class="verdict-badge etablie">Présence établie (cumulée)</div>')
    expect(html).toContain('<span class="score-frequence">1 feuille</span>')
    expect(html).not.toContain('score-renvois') // 0 renvoi -> span omis
    expect(html).toContain('<span class="score-preuves">0 preuves décisives</span>') // pluriel à 0
    expect(html).toContain('<span class="score-indices">1 indice</span>')
    expect(html).toContain('Confiance moy. 71 %') // floor(71.71)
    expect(html).toContain('Intensité moy./feuille 3.60')
    expect(html).toContain('<strong>Score 4</strong>') // round(3.6)
  })

  it('liste uniquement les feuilles établies, avec focus et libellé JJ/MM/AAAA', () => {
    expect(html).toContain(
      '<li><a href="feuilles/2026-01-01/carto-day.html?focus=9.01" target="_blank" rel="noopener">01/01/2026</a></li>',
    )
    expect(html).not.toContain('2026-01-03') // renvoi : pas de lien
  })

  it('injecte le narratif LLM converti sous « Histoire d’apprentissage »', () => {
    expect(html).toContain("<h4>Histoire d'apprentissage</h4>\n<p>Récit.</p>")
  })
})

describe('buildPoleRapportHtml', () => {
  const pole = {
    pole_num: 9,
    pole_nom: 'TEST — Pôle & Cie',
    evolution_par_feuille: [
      { date: '2026-01-01', score: 2.1, etablies: 1, renvois: 4 },
      { date: '2026-01-02', score: 0, etablies: 0, renvois: 0 },
    ],
    rapports_par_feuille: [
      { date: '2026-01-01', rapportCompletMarkdown: 'x' },
      { date: '2026-01-02', rapportCompletMarkdown: '' }, // feuille vide -> pas de lien
    ],
  }
  const html = buildPoleRapportHtml(pole, '## Portrait du pôle\n\nTexte.')

  it('titre échappé + narratif + tableau', () => {
    expect(html).toContain('<h3>Rapport évolutif du pôle 9 — TEST — Pôle &amp; Cie</h3>')
    expect(html).toContain('<h4>Portrait du pôle</h4>\n<p>Texte.</p>')
    expect(html).toContain(
      '<table class="evolution-pole"><tr><th>Date</th><th>Score</th><th>Établies</th><th>Renvois</th></tr>',
    )
  })

  it('lie la ligne ssi le rapport de feuille existe (rapportCompletMarkdown non vide)', () => {
    expect(html).toContain(
      '<tr><td><a href="feuilles/2026-01-01/carto-day.html" target="_blank" rel="noopener">01/01/2026</a></td><td>2.10</td><td>1</td><td>4</td></tr>',
    )
    expect(html).toContain('<tr><td>02/01/2026</td><td>0.00</td><td>0</td><td>0</td></tr>')
  })
})

describe('buildKairosHtml', () => {
  const html = buildKairosHtml(
    { premiere: '2025-12-22', derniere: '2026-03-29', nb_feuilles: 59 },
    [{ date: '2025-12-22', score_total: 12.5, etablies: 11, renvois: 13, non_etablies: 37, herfindahl: 0.1158 }],
    '## Portrait\n\nTexte.',
  )

  it('préambule + narratif + tableau global (score .2f, herfindahl .4f)', () => {
    expect(html.startsWith('<h3>Synthèse évolutive du portfolio</h3>')).toBe(true)
    expect(html).toContain(
      '<p class="periode-resume"><em>59 feuilles cartographiées entre 22/12/2025 et 29/03/2026.</em></p>',
    )
    expect(html).toContain('<h4>Portrait</h4>\n<p>Texte.</p>')
    expect(html).toContain(
      '<table class="evolution-globale"><tr><th>Date</th><th>Score total</th><th>Établies</th><th>Renvois</th><th>Herfindahl</th></tr>',
    )
    expect(html).toContain('<td>12.50</td><td>11</td><td>13</td><td>0.1158</td>')
  })
})

// ---------------------------------------------------------------------------
// Document complet sur une fixture minimale
// ---------------------------------------------------------------------------

describe('buildMergeDocument', () => {
  const excluded = {
    code: '9.02',
    nom: 'Compétence Absente',
    pole: 9,
    statut_final: 'présence non établie',
    nb_feuilles_etablies: 0,
    nb_feuilles_renvois: 0,
    cumul_preuves: 0,
    cumul_indices: 0,
    confiance_moyenne: 0,
    score: 0,
    score_moyen_par_feuille: 0,
    presence_par_feuille: [],
  }
  const agrege = {
    version: 'merge-v1',
    date_construction: '2026-05-24T15:48:57',
    periode: {
      premiere: '2026-01-01',
      derniere: '2026-01-03',
      nb_feuilles: 3,
      feuilles_chronologiques: ['2026-01-01', '2026-01-02', '2026-01-03'],
    },
    feuilles: {},
    agrege: {
      par_competence: { 9.01: { ...compFixture }, 9.02: excluded },
      par_pole: {
        9: {
          pole_num: 9,
          pole_nom: 'TEST — Pôle',
          evolution_par_feuille: [
            { date: '2026-01-01', score: 3.6, etablies: 1, renvois: 0 },
            { date: '2026-01-02', score: 0, etablies: 0, renvois: 0 },
            { date: '2026-01-03', score: 0.4, etablies: 0, renvois: 1 },
          ],
          rapports_par_feuille: [
            { date: '2026-01-01', rapportCompletMarkdown: 'x' },
            { date: '2026-01-02', rapportCompletMarkdown: '' },
            { date: '2026-01-03', rapportCompletMarkdown: 'y' },
          ],
        },
      },
      global: {
        emergences_cumulees: { competences_orphelines: [{}, {}, {}], connexions_transversales: [], noeuds_conceptuels: [] },
      },
      ipsatif: {
        par_pole: { 9: { pole_num: 9, score_cumule: 3.6 } },
        statistiques: { score_total: 3.6, competences_etablies: 1, competences_renvoyees: 0, competences_non_etablies: 1 },
        indice_herfindahl_global: 0.5,
        evolution_globale: [
          { date: '2026-01-01', score_total: 3.6, etablies: 1, renvois: 0, non_etablies: 1, herfindahl: 1 },
          { date: '2026-01-02', score_total: 0, etablies: 0, renvois: 0, non_etablies: 2, herfindahl: 0 },
          { date: '2026-01-03', score_total: 0.4, etablies: 0, renvois: 1, non_etablies: 1, herfindahl: 0 },
        ],
      },
    },
  }
  const narratives = { competences: { 9.01: 'Récit.' }, poles: { 9: '## Portrait du pôle\n\nTexte.' }, kairos: '## Portrait\n\nK.' }
  const meta = { journalId: 'merged', sourceProtocole: 'Aurora v3' }
  const doc = buildMergeDocument(agrege, narratives, meta)

  it('enveloppe conforme au contrat (§2.1 contrats.md)', () => {
    expect(doc.schemaVersion).toBe('1.0.0')
    expect(doc.kind).toBe('cartographie-merge')
    expect(doc.generatedAt).toBe('2026-05-24T15:48:57')
    expect(doc.source).toEqual({ protocole: 'Aurora v3', journalId: 'merged' })
    expect(doc.periode).toEqual({ premiere: '2026-01-01', derniere: '2026-01-03', nbFeuilles: 3 })
    expect(doc.reserved).toEqual({
      connexionsData: [],
      noeudsConceptuels: [],
      patternTemporel: { pattern: '', description: '' },
      piecesData: {},
    })
  })

  it('filtre les compétences non établies et copie les champs agrégés', () => {
    expect(doc.domains).toHaveLength(1)
    const codes = doc.domains[0].competences.map((c) => c.code)
    expect(codes).toEqual(['9.01'])
    const c = doc.domains[0].competences[0]
    expect(c.id).toBe('9.01 — Compétence Test')
    expect(c.points).toBe(1)
    expect(c.statut).toBe('présence établie')
    expect(c.score_cumule).toBe(3.6)
  })

  it('parFeuille de compétence : entrées non court-circuitées, projetées sur 6 champs', () => {
    const c = doc.domains[0].competences[0]
    expect(c.parFeuille).toEqual([
      { date: '2026-01-01', statut: 'présence établie', preuves: 0, indices: 1, confiance: 0.72, score: 3.6 },
      { date: '2026-01-03', statut: 'renvoi au cartographe', preuves: 0, indices: 1, confiance: 0.4, score: 0.4 },
    ])
  })

  it('profilMeta : orphelines = longueur du tableau des émergences cumulées', () => {
    expect(doc.profilMeta.competences_orphelines).toBe(3)
    expect(doc.profilMeta.journal_id).toBe('merged')
    expect(doc.profilMeta.score_total).toBe(3.6)
    expect(doc.profilMeta.indice_herfindahl).toBe(0.5)
    expect(doc.profilMeta.evolution_globale).toEqual(agrege.agrege.ipsatif.evolution_globale)
  })

  it('feuilles : {date, iso, label, ordre, carto_day_url}', () => {
    expect(doc.feuilles[1]).toEqual({
      date: '2026-01-02',
      iso: '2026-01-02',
      label: '02/01/2026',
      ordre: 1,
      carto_day_url: 'feuilles/2026-01-02/carto-day.html',
    })
  })

  it('narratifs : rapportHtml est un alias de kairosHtml (corpus actuel)', () => {
    expect(doc.narratifs.rapportHtml).toBe(doc.narratifs.kairosHtml)
    expect(doc.narratifs.kairosHtml).toContain('<h3>Synthèse évolutive du portfolio</h3>')
  })

  it('échoue explicitement si un narratif manque', () => {
    expect(() => buildMergeDocument(agrege, { competences: {}, poles: {}, kairos: 'k' }, meta)).toThrow(
      /narratif manquant/,
    )
  })
})

describe('frDate', () => {
  it('convertit ISO en JJ/MM/AAAA', () => {
    expect(frDate('2026-03-29')).toBe('29/03/2026')
  })
})
