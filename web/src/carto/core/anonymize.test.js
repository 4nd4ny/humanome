// P5 — « Préparer une démo » (spec §11.1). Critère d'acceptation : la démo
// anonymisée garde ses surlignages.
import { describe, expect, it } from 'vitest'
import { REMOVED, anonymizeArchive, archiveTexts, highlightStatuses, makeReplacer, patternCounts, remainingNames, suggestNames, thirdPartySentences } from './anonymize.js'
import { buildArchive } from './archive.js'
import { importFiles } from './import.js'
import { createDataset } from './model.js'
import { createCartoStore, createMemoryAdapter } from './store.js'
import { LOU_PORTFOLIO, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'

const NOW = '2026-10-13T12:00:00.000Z'

async function louArchive() {
  const files = [{ path: 'Lou-Martin/journal.md', text: LOU_PORTFOLIO }]
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `Lou-Martin/${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `Lou-Martin/${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  await store.commit(await importFiles(files, createDataset({ datasetId: 'ds', title: 'Lou Martin', referential: miniReferential(), now: NOW }), { now: NOW }))
  return buildArchive(await store.exportAll('ds'), { now: NOW })
}

describe('propositions et remplacements', () => {
  it('propose les mots à majuscule fréquents hors début de phrase', () => {
    const s = suggestNames([LOU_PORTFOLIO, 'Avec Sam et Noé, puis Sam encore. Samedi, rien.'])
    expect(s.map((x) => x.word)).toEqual(expect.arrayContaining(['Sam', 'Noé']))
    expect(s.map((x) => x.word)).not.toContain('Samedi')
  })

  it('élisions, noms composés, guillemets ; « J’ai » n’est pas un nom', () => {
    const words = suggestNames(['Hier, J’ai vu l’Arnaud et Jean-Pierre. J’ai revu l’Arnaud, puis « Jean-Pierre » est parti.'], { min: 2 }).map((x) => x.word)
    expect(words).toEqual(['Arnaud', 'Jean-Pierre'])
  })

  it('les apostrophes et les blancs d’un nom sont indifférents, comme pour la recherche des passages', () => {
    const { apply } = makeReplacer({ dictionary: [{ from: 'O’Brien', to: 'Personne A' }, { from: 'Jean Paul', to: 'Personne B' }] })
    expect(apply("O'Brien, o’brien et Jean\u00a0Paul ou Jean  Paul")).toBe('Personne A, Personne A et Personne B ou Personne B')
  })

  it('noms en mot entier seulement ; courriels, liens, téléphones, adresses', () => {
    const { apply, counts } = makeReplacer({ dictionary: [{ from: 'Sam', to: 'Alex' }] })
    expect(apply('Sam et SAM, mais pas Samedi ni Samuel.')).toBe('Alex et ALEX, mais pas Samedi ni Samuel.')
    expect(apply('Écrire à lou.martin@ecole.ch ou voir https://exemple.org/a?b=1.')).toBe('Écrire à ‹courriel› ou voir ‹lien›.')
    expect(apply('Appeler le 079 123 45 67, le +41 79 123 45 67 ou le 06 12 34 56 78.')).toBe('Appeler le ‹téléphone›, le ‹téléphone› ou le ‹téléphone›.')
    expect(apply('Rendez-vous au 12 rue du Lac, puis au 3 bis avenue de la Gare.')).toBe('Rendez-vous au ‹adresse›, puis au ‹adresse›.')
    expect(apply('Le 2025-12-22 à 14 h 30, 3 essais.')).toBe('Le 2025-12-22 à 14 h 30, 3 essais.')
    expect(counts.get('Sam → Alex')).toBe(2)
  })

  it('une seule passe, sans tenir compte de la casse ; les repères neutres et les identifiants sont protégés', () => {
    const r = makeReplacer({ dictionary: [{ from: 'Christian', to: 'Personne A' }, { from: 'Personne', to: 'Quelqu’un' }, { from: 'Lien', to: 'Lio' }, { from: 'Ada', to: 'Iris' }] })
    // Un remplacement n'est jamais remplacé à son tour.
    expect(r.apply('Christian et Personne')).toBe('Personne A et Quelqu’un')
    // La recherche des passages ignore la casse : le remplacement aussi (capitales gardées).
    expect(r.apply('christian, CHRISTIAN, Christian2 et Christian_3')).toBe('Personne A, PERSONNE A, Personne A2 et Personne A_3')
    // « ‹lien› » est un repère neutre, pas le nom « Lien ».
    expect(r.apply('voir https://a.org/x et Lien')).toBe('voir ‹lien› et Lio')
    // Dans le Markdown, la ponctuation d'un lien reste en place (le texte affiché ne bouge pas).
    expect(r.apply('[https://a.org](https://a.org), <https://b.org> et \\<https://c.org\\>')).toBe('[‹lien›](‹lien›), <‹lien›> et \\<‹lien›\\>')
    // Identifiants : forme exacte seulement, jamais au milieu de chiffres hexadécimaux.
    expect(r.applyTechnicalNames('v-3f9ada12')).toBe('v-3f9ada12')
    expect(r.applyTechnicalNames('Ada@2026-01-01|1.01')).toBe('Iris@2026-01-01|1.01')
  })
})

describe('anonymiser une archive (critère P5 : les surlignages tiennent)', () => {
  it('plus aucun nom ; mêmes substitutions dans le portfolio, les extraits et les ancres ; chaque passage reste retrouvé', async () => {
    const archive = await louArchive()
    const { archive: out, report } = anonymizeArchive(archive, {
      dictionary: [
        { from: 'Sam', to: 'Alex' },
        { from: 'Noé', to: 'Lior' },
        { from: 'Lou', to: 'Camille' },
        { from: 'Martin', to: 'Durand' },
      ],
      pseudonym: 'Camille (démo)',
      now: NOW,
    })
    const json = JSON.stringify(out)
    expect(json).not.toMatch(/\bSam\b|Noé|\bLou\b|Martin/u)
    expect(out.title).toBe('Camille (démo)')
    expect(out.importLog).toEqual([])
    expect(report.highlight.before).toBeGreaterThan(0)
    expect(report.highlight.after).toBe(report.highlight.before)
    expect(report.highlight.broken).toEqual([])
    // L'extrait de 2.01 et ses ancres portent le même nouveau prénom que le portfolio.
    const d23 = out.details['2025-12-23']
    const t = Object.values(Object.values(d23.variants)[0].verdicts['2.01'].traces)[0]
    expect(t.extract).toMatch(/^J’ai écouté Alex expliquer/)
    expect(t.start).toMatch(/Alex/)
    expect(d23.portfolio.text).toMatch(/J’ai écouté Alex expliquer/)
    expect(report.replacements.find((r) => r.label === 'Sam → Alex').count).toBeGreaterThan(2)
    // Volumes recalculés.
    expect(out.days.find((d) => d.date === '2025-12-23').portfolio.chars).toBe(d23.portfolio.text.length)
  })

  it('passages de tiers : signalés, retirés à la demande ; un surlignage cassé est signalé', async () => {
    const archive = await louArchive()
    const third = thirdPartySentences(archive, ['Sam'])
    expect(third.map((x) => x.date)).toEqual(['2025-12-22', '2025-12-23'])
    const target = third.find((x) => x.date === '2025-12-23')
    const { archive: out, report } = anonymizeArchive(archive, { dictionary: [{ from: 'Sam', to: 'Alex' }], remove: [target], now: NOW })
    expect(report.removed).toBe(1)
    expect(out.details['2025-12-23'].portfolio.text).toContain(REMOVED)
    // La trace de 2.01 citait cette phrase : l'extrait part aussi (sinon le
    // passage retiré resterait lisible dans le jury), le surlignage est perdu
    // et le rapport dit pourquoi.
    const t = Object.values(Object.values(out.details['2025-12-23'].variants)[0].verdicts['2.01'].traces)[0]
    expect(t.extract).toBe(REMOVED)
    expect(JSON.stringify(out)).not.toMatch(/expliquer son idée/)
    expect(report.highlight.broken).toEqual([expect.objectContaining({ code: '2.01', reason: 'retrait' })])
  })

  it('la table de correspondance n’est jamais dans l’export', async () => {
    const { archive: out } = anonymizeArchive(await louArchive(), { dictionary: [{ from: 'Sam', to: 'Alex' }], now: NOW })
    expect(JSON.stringify(out)).not.toMatch(/Sam → Alex|dictionary|correspondance/)
  })
})

describe('garde-fous de l’anonymisation', () => {
  it('les identifiants ne reçoivent jamais les motifs (un identifiant hexadécimal peut ressembler à un téléphone)', async () => {
    const archive = await louArchive()
    const day = archive.days.find((d) => d.date === '2025-12-23')
    const oldId = day.variants[0].id
    const newId = 'v-0612345678abcdefabcd'
    const doc = JSON.parse(JSON.stringify(archive).split(oldId).join(newId))
    const { archive: out, report } = anonymizeArchive(doc, { dictionary: [{ from: 'Sam', to: 'Alex' }], now: NOW })
    const d23 = out.days.find((d) => d.date === '2025-12-23')
    expect(d23.variants[0].id).toBe(newId)
    expect(d23.activeVariantId).toBe(newId)
    expect(Object.keys(out.details['2025-12-23'].variants)).toContain(newId)
    expect(report.highlight.broken).toEqual([])
    expect(report.replacements.map((r) => r.label)).not.toContain('téléphones')
  })

  it('le référentiel n’est pas touché, même si un mot du dictionnaire y figure', async () => {
    const archive = await louArchive()
    const { archive: out } = anonymizeArchive(archive, { dictionary: [{ from: 'Écoute', to: 'Xyz' }], now: NOW })
    expect(out.referential).toEqual(archive.referential)
  })

  it('revue : les mots à majuscule restants, noms de fichiers compris ; les remplacements n’y sont pas', async () => {
    const archive = await louArchive()
    const dictionary = [{ from: 'Sam', to: 'Personne A' }]
    const { archive: out } = anonymizeArchive(archive, { dictionary, now: NOW })
    const words = remainingNames(out, dictionary).map((x) => x.word)
    expect(words).toEqual(expect.arrayContaining(['Noé', 'Lou', 'Martin']))
    expect(words).not.toContain('Sam')
    expect(words).not.toContain('Personne')
  })

  it('compte les motifs ; textes de recherche : le portfolio, à défaut les extraits', async () => {
    expect(patternCounts(['lou@ecole.ch et https://x.org', 'tél. 079 123 45 67'])).toEqual({ emails: 1, urls: 1, phones: 1, addresses: 0 })
    const archive = await louArchive()
    expect(archiveTexts(archive).join('\n')).toMatch(/Journal de Lou/)
    const bare = JSON.parse(JSON.stringify(archive))
    for (const d of Object.values(bare.details)) d.portfolio = null
    expect(archiveTexts(bare).some((t) => t.startsWith('J’ai écouté Sam'))).toBe(true)
  })

  it('statuts de surlignage calculés comme le lecteur (journée de la trace, puis ailleurs)', async () => {
    const archive = await louArchive()
    const st = [...highlightStatuses(archive).values()]
    expect(st.length).toBeGreaterThan(0)
    expect(st.every((s) => s.status === 'found' || s.status === 'partial')).toBe(true)
    // Le texte affiché fourni remplace le texte brut (ici : rien d'affiché).
    const none = [...highlightStatuses(archive, () => '').values()]
    expect(none.every((s) => s.status === 'no-text')).toBe(true)
    const other = [...highlightStatuses(archive, () => 'Un tout autre texte, sans aucun des passages.').values()]
    expect(other.every((s) => s.status === 'not-found')).toBe(true)
  })

  it('ancres coupées au milieu d’un nom ou écrites dans une autre casse : réalignées, le passage reste retrouvé, aucun fragment ne reste', async () => {
    const archive = await louArchive()
    const traceOf = (a, date, code) => Object.values(Object.values(a.details[date].variants)[0].verdicts[code].traces)[0]
    const d24 = Object.values(Object.values(archive.details['2025-12-24'].variants)[0].verdicts['3.02'].traces)
    // 2.01 : bord gauche coupé dans « Sam ».
    Object.assign(traceOf(archive, '2025-12-23', '2.01'), { extract: 'am expliquer son idée jusqu’au bout sans l’interrompre', start: 'am expliquer son', end: 'bout sans l’interrompre' })
    // 3.02 (24 déc.) : ancre de début coupée à l'intérieur (« Troisième essai de la maq »), ancres en minuscules.
    Object.assign(d24[0], { extract: 'troisième essai de la maq […] noté chaque modification dans un tableau.', start: 'troisième essai de la maq', end: 'noté chaque modification dans un tableau.' })
    const before = [...highlightStatuses(archive).values()].filter((x) => x.status === 'found').length
    const { archive: out, report } = anonymizeArchive(archive, { dictionary: [{ from: 'Sam', to: 'Alex' }, { from: 'Maquette', to: 'Ouvrage' }, { from: 'Troisième', to: 'Dernier' }], now: NOW })
    expect(report.highlight.broken).toEqual([])
    expect(report.highlight.aligned).toBe(2)
    expect([...highlightStatuses(out).values()].filter((x) => x.status === 'found').length).toBe(before)
    const t201 = traceOf(out, '2025-12-23', '2.01')
    expect(t201.start).toBe('Alex expliquer son')
    expect(t201.extract).toBe('Alex expliquer son idée jusqu’au bout sans l’interrompre')
    const t302 = Object.values(Object.values(out.details['2025-12-24'].variants)[0].verdicts['3.02'].traces)[0]
    expect(t302.start).toBe('Dernier essai de la Ouvrage')
    expect(t302.extract).toBe('Dernier essai de la Ouvrage […] noté chaque modification dans un tableau.')
    expect(out.details['2025-12-24'].portfolio.text).toMatch(/Dernier essai de la Ouvrage/)
    expect(JSON.stringify(out)).not.toMatch(/\bmaq\b|\bam expliquer/u)
  })
})
