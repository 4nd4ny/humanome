// @vitest-environment node
// Chaîne d'import (spec §3) sur des données synthétiques.
import { describe, expect, it } from 'vitest'
import { importFiles } from './import.js'
import { createDataset, contributingVariant, pendingAnomalyCount } from './model.js'
import { computeState } from './state.js'
import { normalizeReferential } from './referential.js'
import { parseInvocations } from './importers/aurora-core.js'
import { LOU_PORTFOLIO, cartoPole, kairosDoc, louCoreRun, louDays, miniReferential } from '../test/fixtures.js'
import { storedZip } from '../test/zip.js'

const NOW = '2026-10-13T12:00:00.000Z'
const empty = () => createDataset({ datasetId: 'ds-lou', title: 'Lou', referential: miniReferential(), now: NOW })
const json = (path, value) => ({ path, text: JSON.stringify(value) })

/** Les fichiers d'une journée comme dans un dossier AAAA-MM-JJ/ ou un ZIP journalier. */
function dayFiles(date, poles, prefix = '') {
  return [
    ...poles.map((p) => json(`${prefix}${date}/carto_P${p.poleNum}.json`, p)),
    json(`${prefix}${date}/kairos.json`, kairosDoc(date)),
  ]
}

describe('journées Aurora v3 (carto_P1..P7 + kairos)', () => {
  it('dossiers datés : journées, verdicts normalisés, traces résolues avec ancres', async () => {
    const files = Object.entries(louDays()).flatMap(([date, poles]) => dayFiles(date, poles))
    const res = await importFiles(files, empty(), { now: NOW })
    expect(res.dataset.days.map((d) => d.date)).toEqual(['2025-12-22', '2025-12-23', '2025-12-24'])
    expect(res.report.filter((r) => r.severity === 'blocking')).toEqual([])

    const day = res.dataset.days[0]
    const variant = contributingVariant(day)
    expect(variant.provenance).toMatchObject({ source: 'aurora-v3', importedAt: NOW })
    const v101 = variant.verdicts.find((v) => v.code === '1.01')
    expect(v101).toMatchObject({ status: 'established', confidence: 0.8, proofs: 1, hints: 0, courtCircuit: false })
    expect(v101.traces).toEqual([{ id: expect.stringMatching(/:1\.01:0$/), role: 'preuve' }])

    const detail = res.detailPatches.get('2025-12-22').variants[variant.id]
    const trace = detail.verdicts['1.01'].traces[v101.traces[0].id]
    expect(trace).toMatchObject({ resolved: true, sourceDate: '2025-12-22', pieceType: 'trace concrète' })
    expect(trace.extract).toMatch(/^J'ai vérifié deux sources/)
    expect(trace.start).toBe("J'ai vérifié deux sources contradictoires avant")
    expect(trace.end).toBe('de conclure sur la date du chantier.')
    // motif/raison et prescription/prescriptionMinimale normalisés (§4.2)
    expect(detail.verdicts['1.01']).toMatchObject({ motif: 'Vérification explicite.', prescription: 'Raconter un doute.' })
    expect(detail.kairos.portrait).toBe('Portrait du 2025-12-22.')
    // Le rapport complet rédigé reprend ses rubriques mot pour mot : il n'est pas gardé (D-66).
    expect(detail.poleReports[1].portrait).toMatch(/Portrait du pôle 1/)
    expect(detail.poleReports[1].markdown).toBeNull()
  })

  it('ZIP journaliers imbriqués dans un lot (run/AAAA-MM-JJ.zip)', async () => {
    const days = louDays()
    const inner = (date) =>
      storedZip(dayFiles(date, days[date]).map((f) => ({ name: f.path.split('/').pop(), data: f.text })))
    const lot = storedZip([
      { name: 'Lou-run#1/2025-12-22.zip', data: inner('2025-12-22') },
      { name: 'Lou-run#1/2025-12-23.zip', data: inner('2025-12-23') },
    ])
    const res = await importFiles([{ path: 'lot.zip', bytes: lot }], empty(), { now: NOW })
    expect(res.dataset.days.map((d) => d.date)).toEqual(['2025-12-22', '2025-12-23'])
    expect(res.dataset.days[0].variants[0].provenance.run).toBe('Lou-run#1')
  })

  it('un JSON invalide est mis en quarantaine sans empêcher le reste du lot', async () => {
    const files = [...dayFiles('2025-12-22', louDays()['2025-12-22']), { path: '2025-12-23/carto_P1.json', text: '{ pas du json' }]
    const res = await importFiles(files, empty(), { now: NOW })
    expect(res.report.find((r) => r.code === 'json-invalide')).toMatchObject({ severity: 'blocking' })
    expect(res.dataset.days.map((d) => d.date)).toEqual(['2025-12-22'])
  })

  it('date absente du chemin : proposée depuis les feuilles (à confirmer)', async () => {
    const poles = louDays()['2025-12-24']
    const res = await importFiles(poles.map((p) => json(`journee/carto_P${p.poleNum}.json`, p)), empty(), { now: NOW })
    expect(res.dataset.days[0].date).toBe('2025-12-24')
    expect(res.report.find((r) => r.code === 'date-proposee').severity).toBe('arbitrate')
  })

  it('court-circuit et renvoi conservés tels quels', async () => {
    const res = await importFiles(dayFiles('2025-12-23', louDays()['2025-12-23']), empty(), { now: NOW })
    const verdicts = contributingVariant(res.dataset.days[0]).verdicts
    expect(verdicts.find((v) => v.code === '3.01')).toMatchObject({ courtCircuit: true })
    expect(verdicts.find((v) => v.code === '3.02')).toMatchObject({ status: 'needs_review', traces: [{ role: 'indice', id: expect.any(String) }] })
  })

  it('verdict sans traces détaillées mais avec compteurs : traces reconstituées, signalées', async () => {
    const pole = cartoPole(1, [{ code: '1.01', confiance: 0.6, traces: [], nombrePreuves: 1, nombreIndices: 2 }], { date: '2025-12-22' })
    const res = await importFiles(dayFiles('2025-12-22', [pole]), empty(), { now: NOW })
    const v = contributingVariant(res.dataset.days[0]).verdicts[0]
    expect(v.traces.map((t) => t.role)).toEqual(['preuve', 'indice', 'indice'])
    expect(res.report.some((r) => r.code === 'traces-depuis-compteurs')).toBe(true)
  })
})

describe('doublons, variantes et arbitrage', () => {
  it('la même analyse importée deux fois (sous deux formes) est un doublon ignoré', async () => {
    const days = louDays()
    const first = await importFiles(dayFiles('2025-12-22', days['2025-12-22']), empty(), { now: NOW })
    // Même contenu, présenté comme document-jour du site.
    const siteDay = { kind: 'cartographie-jour', schemaVersion: '1.0.0', date: '2025-12-22', poles: days['2025-12-22'], kairos: kairosDoc('2025-12-22') }
    const second = await importFiles([json('2025-12-22.json', siteDay)], first.dataset, { now: NOW })
    expect(second.counts.duplicates).toBe(1)
    expect(second.dataset.days[0].variants).toHaveLength(1)
  })

  it('deux analyses différentes d’une même journée : variantes « à arbitrer », aucune ne contribue', async () => {
    const days = louDays()
    const first = await importFiles(dayFiles('2025-12-22', days['2025-12-22'], 'run1/'), empty(), { now: NOW })
    const other = [cartoPole(1, [{ code: '1.01', confiance: 0.3, traces: [{ role: 'indice corroboratif', extrait: 'Ce matin j’ai relu mes notes' }] }], { date: '2025-12-22' })]
    const second = await importFiles(dayFiles('2025-12-22', other, 'run2/'), first.dataset, { now: NOW })
    const day = second.dataset.days[0]
    expect(day.variants).toHaveLength(2)
    expect(day.variantChoice).toBe('pending')
    expect(contributingVariant(day)).toBeNull()
    expect(second.report.find((r) => r.code === 'variantes-concurrentes').severity).toBe('arbitrate')
    expect(pendingAnomalyCount(second.dataset)).toBe(1)
  })
})

describe('portfolio (§3.1)', () => {
  it('segmenté par dates ISO, numériques et textuelles françaises ; volume par journée', async () => {
    const res = await importFiles([{ path: 'lou.md', text: LOU_PORTFOLIO }], empty(), { now: NOW })
    expect(res.dataset.days.map((d) => d.date)).toEqual(['2025-12-22', '2025-12-23', '2025-12-24'])
    expect(res.dataset.days[0].portfolio.chars).toBeGreaterThan(100)
    expect(res.detailPatches.get('2025-12-23').portfolio.text).toMatch(/J’ai écouté Sam/)
    expect(res.dataset.days.every((d) => d.variants.length === 0)).toBe(true) // journées sans analyse
  })

  it('texte sans date : à découper et dater (À arbitrer)', async () => {
    const res = await importFiles([{ path: 'notes.txt', text: 'Un texte sans aucune date.\nDeuxième ligne.' }], empty(), { now: NOW })
    expect(res.dataset.days).toEqual([])
    expect(res.dataset.portfolio.undated).toHaveLength(1)
    expect(res.report.find((r) => r.code === 'portfolio-sans-date').severity).toBe('arbitrate')
  })

  it('analyses + portfolio dans le même lot', async () => {
    const files = [{ path: 'lou.md', text: LOU_PORTFOLIO }, ...Object.entries(louDays()).flatMap(([d, p]) => dayFiles(d, p))]
    const res = await importFiles(files, empty(), { now: NOW })
    expect(res.dataset.days.every((d) => d.portfolio && d.variants.length === 1)).toBe(true)
    const ref = normalizeReferential(res.dataset.referential)
    const state = computeState(res.dataset, { ref })
    expect([...state.competencies.keys()]).toEqual(['1.01', '2.01', '3.01', '3.02'])
    expect([...state.competencies.values()].reduce((s, c) => s + c.theta, 0)).toBeCloseTo(360)
  })
})

describe('arborescence AuroraCore (verdict.json / deliberation.md / briefing.md)', () => {
  const verdict = {
    code: '1.01',
    nom: 'Pensée critique',
    statut: 'présence établie',
    score_preuves: 1,
    score_indices: 1,
    confiance: 0.75,
    score: 1.75,
    jury: { linguiste: { position: 'présence établie', confiance: 0.8, synthese: 'Vocabulaire juste.' }, consensus: true },
    president: { verdict_argumente: 'Le jury converge.', prescription: 'Raconter une erreur.' },
    traces_retenues: [
      { piece_id: 1, type: 'trace concrète', role: 'preuve décisive', extrait: "J'ai vérifié deux sources contradictoires", date: '2025-12-22' },
      { piece_id: 2, type: 'déclaration étayée', role: 'indice corroboratif', extrait: 'Troisième essai de la maquette', date: '2025-12-24' },
      { piece_id: 3, type: 'trace concrète', role: 'indice corroboratif', extrait: 'sans date', date: 'inconnue' },
    ],
  }
  const delib = [
    '# Tribunal — Délibération du jury — 1.01',
    'Journal : LOU | Date : 2026-04-25 | Agent : 5-tribunal-jury',
    '',
    '```',
    '========================================',
    'INVOCATION — LINGUISTE',
    '========================================',
    'J’incarne le Linguiste.',
    '```',
    '',
    '**Éclairage du Linguiste**',
    '',
    'Le vocabulaire est juste.',
    '',
    '```',
    '========================================',
    'FIN DE LA VOIX DU LINGUISTE',
    '========================================',
    '```',
    '',
    '---',
    '',
    '```',
    '========================================',
    'INVOCATION — PRÉSIDENT DE SÉANCE',
    '========================================',
    'J’incarne le Président.',
    '```',
    '',
    '### Partie 1 — Délibération',
    '',
    'Convergence.',
  ].join('\n')

  it('les blocs INVOCATION sont découpés en voix', () => {
    const p = parseInvocations(delib)
    expect(p.header).toMatchObject({ journal: 'LOU', date: '2026-04-25' })
    expect(p.sections.linguiste.markdown).toBe('**Éclairage du Linguiste**\n\nLe vocabulaire est juste.')
    expect(p.sections.linguiste.preamble).toBe('J’incarne le Linguiste.')
    expect(p.sections.president.markdown).toMatch(/^### Partie 1 — Délibération/)
  })

  it('le verdict de run est réparti sur les journées de ses traces ; feuilles importées comme portfolio', async () => {
    const files = [
      json('LOU/manifest.json', { id_portfolio: 'LOU', date_derniere_preparation: '2026-04-25T02:00:00' }),
      json('LOU/1/1.01/verdict.json', verdict),
      { path: 'LOU/1/1.01/deliberation.md', text: delib },
      { path: 'LOU/1/1.01/briefing.md', text: '```\n=====\nINVOCATION — ACCUSATION\n=====\n```\n\n## Passe 1\n\nThèse.' },
      { path: 'LOU/1/1.01/feuilles/2025-12-22/LOU-1.01-2025-12-22-001.md', text: '# Pièce 001\n\nExtrait du Greffier.' },
      { path: 'LOU/feuilles/2025-12-22.md', text: '### 22.12.2025\n\nJ\'ai vérifié deux sources contradictoires avant de conclure.' },
    ]
    const res = await importFiles(files, empty(), { now: NOW })
    expect(res.dataset.days.map((d) => d.date)).toEqual(['2025-12-22', '2025-12-24'])
    const d22 = contributingVariant(res.dataset.days[0])
    expect(d22.provenance).toMatchObject({ source: 'aurora-core', run: 'LOU@2026-04-25' })
    expect(d22.verdicts).toEqual([expect.objectContaining({ code: '1.01', status: 'established', confidence: 0.75, proofs: 1, hints: 0 })])
    expect(contributingVariant(res.dataset.days[1]).verdicts[0]).toMatchObject({ proofs: 0, hints: 1 })
    expect(res.report.find((r) => r.code === 'traces-non-datees').severity).toBe('warning')
    expect(res.dataset.days[0].portfolio.chars).toBeGreaterThan(10)
    const run = res.runDetails.find((r) => r.key === 'LOU@2026-04-25|1.01').value
    expect(run.deliberation.linguiste.markdown).toMatch(/vocabulaire est juste/)
    expect(run.debate.accusation.markdown).toMatch(/Thèse/)
    expect(run.pieces).toEqual([{ date: '2025-12-22', name: 'LOU-1.01-2025-12-22-001.md', text: '# Pièce 001\n\nExtrait du Greffier.' }])
    expect(res.detailPatches.get('2025-12-22').variants[d22.id].verdicts['1.01'].runRef).toBe('LOU@2026-04-25|1.01')
    // Seul (le jeu n'a pas d'analyses par journée) : il fait le soleil, ce n'est pas une seconde lecture (D-68).
    expect(res.dataset.readings).toEqual([])
    expect(res.report.find((r) => r.code === 'aurora-core').message).toMatch(/répartis sur 2 journée/)
  })

  it('les copies de feuilles par pôle et par compétence ne remplacent jamais la feuille du journal', async () => {
    const files = [
      json('LOU/manifest.json', { id_portfolio: 'LOU' }),
      json('LOU/1/1.01/verdict.json', verdict),
      { path: 'LOU/feuilles/2025-12-22.md', text: '### 22.12.2025\n\nTexte du journal.' },
      { path: 'LOU/1/feuilles/2025-12-22.md', text: 'Copie de triage du pôle (autre contenu).' },
      { path: 'LOU/2/2.01/feuilles/2025-12-22.md', text: 'Copie pour une compétence sans verdict.' },
      { path: 'LOU/1/rapport.md', text: '# Rapport du pôle 1' },
      { path: 'LOU/1/lecteur.md', text: '# Lecture du pôle 1' },
      json('LOU/triage.json', {}),
    ]
    const res = await importFiles(files, empty(), { now: NOW })
    expect(res.report.filter((r) => r.code === 'portfolio-remplace' || r.code === 'segment-sans-date' || r.code === 'portfolio-sans-date')).toEqual([])
    expect(res.detailPatches.get('2025-12-22').portfolio.text).toMatch(/Texte du journal/)
    expect(res.runDetails.find((r) => r.key.endsWith('|pole:1')).value).toMatchObject({ pole: 1, report: '# Rapport du pôle 1', reading: '# Lecture du pôle 1' })
  })
})

describe('seconde lecture (D-68) : un run AuroraCore joint à un jeu qui a ses analyses par journée', () => {
  const louFiles = ({ portfolio = true } = {}) => [...(portfolio ? [{ path: 'lou.md', text: LOU_PORTFOLIO }] : []), ...Object.entries(louDays()).flatMap(([d, p]) => dayFiles(d, p))]
  const stateOf = (ds) => {
    const s = computeState(ds, { ref: normalizeReferential(ds.referential) })
    return [...s.competencies].map(([code, c]) => [code, c.theta, c.confidence, c.proofs, c.hints])
  }

  it('se joint à chaque compétence sans changer le soleil ; ses délibérations sont gardées, le texte du journal aussi', async () => {
    const first = await importFiles(louFiles(), empty(), { now: NOW })
    const before = stateOf(first.dataset)
    const res = await importFiles(louCoreRun(), first.dataset, { now: NOW })
    // Les journées et leurs variantes ne bougent pas : aucune variante concurrente, rien à arbitrer.
    expect(res.dataset.days.map((d) => [d.date, d.variants.map((v) => v.provenance.source)])).toEqual(first.dataset.days.map((d) => [d.date, ['aurora-v3']]))
    expect(res.counts.variantsAdded).toBe(0)
    expect(stateOf(res.dataset)).toEqual(before)
    expect(res.report.filter((r) => r.severity === 'arbitrate' || r.severity === 'blocking')).toEqual([])
    expect(res.dataset.readings).toEqual([
      {
        id: 'LOU@2026-04-25',
        source: 'aurora-core',
        journal: 'LOU',
        analysedAt: '2026-04-25',
        importedAt: NOW,
        codes: {
          '1.01': { status: 'established', rawStatus: 'présence établie', confidence: 0.75, proofs: 1, hints: 1 },
          '2.02': { status: 'established', rawStatus: 'présence établie', confidence: 0.6, proofs: 1, hints: 0 },
        },
        poles: [1],
      },
    ])
    expect(res.runDetails.map((r) => r.key).sort()).toEqual(['LOU@2026-04-25|1.01', 'LOU@2026-04-25|2.02', 'LOU@2026-04-25|pole:1'])
    expect(res.runDetails.find((r) => r.key === 'LOU@2026-04-25|1.01').value.president.verdict_argumente).toMatch(/vérification méthodique/)
    // Le compte rendu dit la seconde lecture, pas une répartition sur les journées.
    expect(res.report.find((r) => r.code === 'seconde-lecture').message).toMatch(/jointe en seconde lecture \(2 compétence\(s\)\)/)
    expect(res.report.some((r) => r.code === 'aurora-core')).toBe(false)
    // La feuille du 22 diffère du portfolio : le texte de Lou est conservé.
    expect(res.detailPatches.get('2025-12-22')?.portfolio).toBeUndefined()
    expect(res.report.find((r) => r.code === 'portfolio-conserve').message).toMatch(/^1 journée/)
  })

  it('dans le même lot que des analyses par journée : seconde lecture aussi', async () => {
    const res = await importFiles([...louFiles({ portfolio: false }), ...louCoreRun()], empty(), { now: NOW })
    expect(res.dataset.days.flatMap((d) => d.variants.map((v) => v.provenance.source))).toEqual(['aurora-v3', 'aurora-v3', 'aurora-v3'])
    expect(res.dataset.readings.map((r) => r.id)).toEqual(['LOU@2026-04-25'])
    // Sans portfolio dans le jeu, la feuille du journal donne le texte de sa journée.
    expect(res.detailPatches.get('2025-12-22').portfolio.text).toMatch(/autrement découpée/)
  })

  it('le même run joint deux fois : doublon ignoré', async () => {
    const first = await importFiles(louFiles(), empty(), { now: NOW })
    const once = await importFiles(louCoreRun(), first.dataset, { now: NOW })
    const twice = await importFiles(louCoreRun(), once.dataset, { now: NOW })
    expect(twice.dataset.readings).toHaveLength(1)
    expect(twice.counts.duplicates).toBe(1)
    expect(twice.report.find((r) => r.code === 'doublon').message).toMatch(/Seconde lecture LOU@2026-04-25 déjà jointe/)
  })

  it('dans un lot qui apporte aussi le portfolio : le texte du portfolio, pas la feuille — sans « texte remplacé »', async () => {
    const res = await importFiles([...louCoreRun(), ...louFiles()], empty(), { now: NOW })
    expect(res.dataset.readings.map((r) => r.id)).toEqual(['LOU@2026-04-25'])
    expect(res.detailPatches.get('2025-12-22').portfolio.text).toMatch(/J'ai vérifié deux sources contradictoires/)
    expect(res.report.some((r) => r.code === 'portfolio-remplace')).toBe(false)
    expect(res.report.find((r) => r.code === 'portfolio-conserve').message).toMatch(/^1 journée/)
    // Les sources du portfolio sont celles des textes gardés.
    expect(res.dataset.portfolio.sources).toEqual(['lou.md'])
  })

  it('une seconde lecture n’ajoute pas de journée ; ses traces sans date ne sont pas « non placées »', async () => {
    const first = await importFiles(louFiles(), empty(), { now: NOW })
    const run = louCoreRun().map((f) => {
      if (f.path !== 'LOU/1/1.01/verdict.json') return f
      const v = JSON.parse(f.text)
      v.traces_retenues.push({ piece_id: 3, type: 'trace concrète', role: 'indice corroboratif', extrait: 'sans date', date: 'inconnue' })
      return { ...f, text: JSON.stringify(v) }
    })
    run.push({ path: 'LOU/feuilles/2026-01-05.md', text: '### 05.01.2026\n\nUne journée que le jeu n’a pas.' })
    const res = await importFiles(run, first.dataset, { now: NOW })
    expect(res.dataset.days.map((d) => d.date)).toEqual(['2025-12-22', '2025-12-23', '2025-12-24'])
    expect(res.detailPatches.has('2026-01-05')).toBe(false)
    expect(res.report.find((r) => r.code === 'feuilles-hors-jeu').message).toMatch(/^1 feuille\(s\) de la seconde lecture/)
    expect(res.report.some((r) => r.code === 'traces-non-datees')).toBe(false)
    expect(res.dataset.readings[0].codes['1.01']).toMatchObject({ proofs: 1, hints: 2 })
  })

  it('un run déjà réparti sur les journées (importé seul, avant) n’est pas joint une seconde fois', async () => {
    const spread = await importFiles(louCoreRun(), empty(), { now: NOW })
    const withOwn = await importFiles(louFiles({ portfolio: false }), spread.dataset, { now: NOW })
    const again = await importFiles(louCoreRun(), withOwn.dataset, { now: NOW })
    expect(again.dataset.readings).toEqual([])
    expect(again.counts.duplicates).toBe(1)
    expect(again.report.find((r) => r.code === 'doublon').message).toMatch(/LOU@2026-04-25 déjà répartie sur les journées/)
  })

  it('un jeu qui n’a que des runs AuroraCore : le nouveau se répartit sur les journées, comme avant', async () => {
    const first = await importFiles(louCoreRun(), empty(), { now: NOW })
    const other = louCoreRun().map((f) => (f.path === 'LOU/manifest.json' ? { ...f, text: JSON.stringify({ id_portfolio: 'LOU', date_derniere_preparation: '2026-05-02T02:00:00' }) } : f.path.endsWith('deliberation.md') ? { ...f, text: f.text.replace('2026-04-25', '2026-05-02') } : f))
    const res = await importFiles(other, first.dataset, { now: NOW })
    expect(res.dataset.readings).toEqual([])
    expect(res.dataset.days.find((d) => d.date === '2025-12-22').variants.map((v) => v.provenance.run)).toEqual(['LOU@2026-04-25', 'LOU@2026-05-02'])
  })
})

describe('formats Merge et métriques', () => {
  it('carto_merge.json (Merge v2) : chaque feuille passe par l’adaptateur Aurora', async () => {
    const days = louDays()
    const doc = {
      version: 'merge-v1',
      date_construction: '2026-05-24T15:48:57',
      feuilles: Object.fromEntries(Object.entries(days).map(([date, poles]) => [date, { date, carto_par_pole: Object.fromEntries(poles.map((p) => [p.poleNum, p])), kairos: kairosDoc(date) }])),
    }
    const res = await importFiles([json('carto_merge.json', doc)], empty(), { now: NOW })
    expect(res.dataset.days).toHaveLength(3)
    expect(res.dataset.days[0].variants[0].provenance.source).toBe('merge-v2')
  })

  it('document cartographie-merge du site : compteurs sans extraits, narratifs évolutifs liés à leur ensemble', async () => {
    const doc = {
      kind: 'cartographie-merge',
      schemaVersion: '1.0.0',
      feuilles: [{ iso: '2025-12-22' }, { iso: '2025-12-23' }],
      domains: [
        {
          id: 'TÊTE',
          rapport_html: '<h3>Rapport évolutif</h3>',
          competences: [{ code: '1.01', feedback: '<p>Histoire d’apprentissage</p>', parFeuille: [{ date: '2025-12-22', statut: 'présence établie', preuves: 2, indices: 1, confiance: 0.7 }] }],
        },
      ],
      narratifs: { kairosHtml: '<p>Kairos évolutif</p>' },
    }
    const res = await importFiles([json('merge.json', doc)], empty(), { now: NOW })
    const v = contributingVariant(res.dataset.days.find((d) => d.date === '2025-12-22'))
    expect(v.verdicts[0].traces.map((t) => t.role)).toEqual(['preuve', 'preuve', 'indice'])
    expect(res.report.some((r) => r.code === 'merge-sans-extraits' && r.severity === 'warning')).toBe(true)
    expect(res.dataset.narratives.map((n) => n.kind).sort()).toEqual(['competence-evolutive', 'kairos-evolutif', 'pole-evolutif'])
    expect(res.dataset.narratives[0].sourceDates).toEqual(['2025-12-22', '2025-12-23'])
  })

  it('métriques metrics[date][champ] ; valeurs illisibles ignorées, jamais mises à 0', async () => {
    const res = await importFiles([json('metrics.json', { '2025-12-22': { volume: 1200, phrases: '42' }, '23.12.2025': { volume: 'n/a' } })], empty(), { now: NOW })
    expect(res.dataset.metrics.byDate).toEqual({ '2025-12-22': { volume: 1200, phrases: 42 } })
    expect(res.report.find((r) => r.code === 'metriques-ignorees').severity).toBe('warning')
  })

  it('codes hors référentiel : conservés et signalés', async () => {
    const pole = cartoPole(1, [{ code: '8.01', confiance: 0.9, traces: [{ role: 'preuve décisive', extrait: 'un passage hors cadre ici' }] }], { date: '2025-12-22' })
    const res = await importFiles(dayFiles('2025-12-22', [pole]), empty(), { now: NOW })
    expect(res.report.find((r) => r.code === 'code-hors-referentiel').message).toMatch(/8\.01/)
    expect(contributingVariant(res.dataset.days[0]).verdicts[0].code).toBe('8.01')
  })
})
