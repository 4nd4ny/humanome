// UC-APP-10 — Lancer une analyse approfondie (Twin9) : tests UNITAIRES (moteur).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-10-analyse-approfondie-twin9.md
//
// Le moteur Twin9 (engine/src/twin9/) est appelé directement, sur des données
// FICTIVES versionnées ici même (référentiel réduit, portfolio de 3 journées,
// réglages de pipeline non secrets) — jamais les oracles gitignorés :
//   - devis : exécution mock déterministe (même sel → même graphe d'appels) ;
//   - contrat des appels (ADR-010) : chaque appel porte le CHEMIN du gabarit et
//     ses variables d'état, jamais les fiches confidentielles ;
//   - couture `backends` du run réel, reprise par état persistant ;
//   - briques déterministes : ancrage verbatim, résolution calculée du
//     tribunal, statut temporel, empreinte de journée, projection sunburst.
//   - découpage du portfolio collé (portfolio.js) et backends (backends.js) :
//     vecteurs VERSIONNÉS engine/test/twin9-vectors/ (synthétiques), lus dans
//     les it() seulement.
// CONFIDENTIALITÉ : aucun gabarit n'est lu (le mock les ignore).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { executerTwin9 } from '../../../src/twin9/index.js'
import { KINDS, fetchBackend, makeBackend as mockBackendFactory } from '../../../src/twin9/backends.js'
import { feuillesBlock, sentencesOf, splitPortfolio } from '../../../src/twin9/portfolio.js'
import { varsClient, VARS_FICHES } from '../../../src/twin9/templates.js'
import { ancrer } from '../../../src/twin9/heatmap.js'
import { calculerConfiance, resoudre } from '../../../src/twin9/tribunal.js'
import { statutTemporel, trajectoire } from '../../../src/twin9/merge.js'
import { cleObs, resoudreJournees } from '../../../src/twin9/scan.js'
import { empreinteJournee } from '../../../src/twin9/journee.js'
import { twin9ToMergeDocument } from '../../../src/twin9/mapper.js'
import { pyJsonDumpsWriteJson } from '../../../src/twin9/py/pyJson.js'

// ── Jeu FICTIF (même forme que /api/twin9/meta et que le front) ─────────────
const REFERENTIEL = [
  { num: 1, nom: 'TÊTE — Penser & Comprendre', competences: [{ code: '1.01', nom: 'Pensée critique' }, { code: '1.02', nom: 'Cadrage de l’intention' }] },
  { num: 2, nom: 'CŒUR — Relier & Naviguer', competences: [{ code: '2.01', nom: 'Écoute active' }, { code: '2.02', nom: 'Coopération située' }] },
  { num: 3, nom: 'MAIN — Créer & Incarner', competences: [{ code: '3.01', nom: 'Itération concrète' }] },
]
const PORTFOLIO = `# Journal fictif du lot twin

### 2026-04-06

J'ai démarré le projet de nichoir connecté. Avant d'affirmer quoi que ce soit sur
la température idéale, j'ai comparé deux sources contradictoires et noté l'écart
dans mon carnet daté. Une camarade a proposé un autre capteur ; je l'ai écoutée
jusqu'au bout avant que nous décidions ensemble.

### 2026-04-09

Deuxième montage : quatre essais, chacun documenté avec l'heure et le résultat.
Le quatrième fonctionne. J'ai présenté ma démarche au groupe sans couper la
parole et nous avons réparti la suite du travail.

### 2026-04-13

Rédaction de la synthèse. J'ai recoupé mes notes, écarté une hypothèse fragile
et relu chaque phrase pour vérifier qu'elle renvoyait à une trace concrète.
`
const PIPELINE = {
  seuils_consensus: { conf_min: 0.4, corrobore: 0.6, instruire: 0.25, instruire_min_modeles: 2, suspicion_min: 0.15 },
  juge_leger: { passes: 2, contre_lecture: true },
  jury: { mode: 'socle4+1', taille_aleatoire: 5, graine: 1, archiviste_si_produite: true },
  premiere_impression: true,
  backend_tribunal: { kind: 'claude-cli', model: 'fictif-tribunal', model_mini: 'fictif-mini' },
  backend_rapide: { kind: 'claude-cli', model: 'fictif-mini' },
  merge: { relectures: true, second_ressort: true, seuil_faisceau_journees: 2, rapporteur: true },
  scan_global: { enabled: false },
}
// Roster mono-famille dérivé du modèle choisi (web/src/views/twin9/run-helpers.js).
const ROSTER = {
  modeles: [{ name: 'claude-sonnet-5', kind: 'anthropic', model: 'claude-sonnet-5', family: 'anthropic', enabled: true, passes: 3 }],
}
const SALT = 'twin9-devis'

function run(extra = {}) {
  return executerTwin9({
    portfolioTexte: PORTFOLIO,
    nomJournal: 'twin9.md',
    referentiel: REFERENTIEL,
    roster: ROSTER,
    config: JSON.parse(JSON.stringify(PIPELINE)),
    mock: true,
    etat: null,
    salt: SALT,
    options: {},
    nowIso: '2026-01-01T00:00:00',
    ...extra,
  })
}

const aplatir = (carto) => JSON.parse(pyJsonDumpsWriteJson(carto))

describe('UC-APP-10 — devis et exécution (moteur mock)', () => {
  it('UC-APP-10-U01 — devis reproductible : même sel → même graphe d’appels et même carto_evolutive ; métriques cohérentes', async () => {
    const a = await run()
    const b = await run()

    expect(a.metrics.par_etape).toEqual(b.metrics.par_etape)
    expect(pyJsonDumpsWriteJson(a.cartoEvolutive)).toBe(pyJsonDumpsWriteJson(b.cartoEvolutive))
    const somme = Object.values(a.metrics.par_etape).reduce((s, e) => s + e.appels, 0)
    expect(a.metrics.appels_llm).toBe(somme)
    expect(a.metrics.par_etape.tagging.appels).toBe(3 * 3 * 3) // 3 journées × 3 passes × 3 pôles
    expect(a.metrics.mono_famille).toBe(true)
    expect(a.metrics.n_journees).toBe(3)

    const carto = aplatir(a.cartoEvolutive)
    expect(carto.periode).toEqual({ debut: '2026-04-06', fin: '2026-04-13', n_journees: 3 })
    expect(Object.keys(carto.competences).sort()).toEqual(['1.01', '1.02', '2.01', '2.02', '3.01'])
    expect(Object.values(carto.statuts).reduce((s, n) => s + n, 0)).toBe(5)
  })

  it('UC-APP-10-U02 — contrat des appels : chaque appel porte gabarit + variables d’état, jamais les fiches ; tout {$VAR} est fourni ou injectable serveur ; variables sérialisées scalaires ou listes plates (anomalie 5 figée)', async () => {
    const contrat = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../../src/twin9/protocole-contrat.json', import.meta.url)), 'utf8'),
    )
    const injectees = new Set(contrat.injectees_serveur)
    const appels = []
    const enregistreuse = (spec) => {
      const inner = mockBackendFactory(spec)
      return {
        records: inner.records,
        async call(prompt, opts = {}) {
          appels.push({
            gabarit: opts.gabarit ?? null,
            vars: Object.keys(opts.variables ?? {}),
            label: opts.label,
            // Ce que makeServerBackend enverra réellement (JSON.stringify du corps).
            json: JSON.parse(JSON.stringify(opts.variables ?? {})),
          })
          return inner.call(prompt, opts)
        },
      }
    }
    await run({ backends: enregistreuse, options: { scanGlobal: true } })

    expect(appels.length).toBeGreaterThan(50)
    const manques = []
    const vus = new Set()
    for (const { gabarit, vars } of appels) {
      if (!gabarit) {
        manques.push('appel sans gabarit')
        continue
      }
      const nom = gabarit.replace(/\.md$/, '')
      vus.add(nom)
      const attendues = contrat.gabarits[nom]
      if (!attendues) {
        manques.push(`gabarit hors contrat : ${nom}`)
        continue
      }
      for (const v of vars) if (VARS_FICHES.has(v)) manques.push(`${nom} : fiche confidentielle envoyée (${v})`)
      for (const v of attendues) {
        if (vars.includes(v)) continue
        if (!injectees.has(v)) manques.push(`${nom} : ${v} ni fournie ni injectable`)
        if (v === 'COMPETENCE_FICHE' && !vars.includes('CODE')) manques.push(`${nom} : CODE manquant`)
        if (v === 'POLE_FICHES' && !(vars.includes('POLE_NUM') && vars.includes('POLE_FICHES_ORDRE'))) {
          manques.push(`${nom} : POLE_NUM/POLE_FICHES_ORDRE manquants`)
        }
      }
    }
    expect([...new Set(manques)]).toEqual([])
    for (const cle of ['tagger/1-tag-pole', 'lourd/20-greffier', 'lourd/20b-juge-leger', 'merge/04-rapporteur', 'scan/01-arpenteur']) {
      expect(vus).toContain(cle)
    }

    // RG9 : une fois sérialisée, chaque variable doit être un scalaire ou une
    // liste plate de scalaires. ANOMALIE figée (fiche, anomalie 5) : deux
    // variables de merge/03-competence-evolution partent en objets PyFloat
    // sérialisés {"value": x} — le serveur les accepte (objet plat) et les rend
    // en JSON dans le prompt au lieu du nombre.
    const scalaire = (v) => v === null || typeof v !== 'object'
    const nonPlates = new Set()
    for (const { gabarit, json } of appels) {
      for (const [nom, v] of Object.entries(json)) {
        if (scalaire(v) || (Array.isArray(v) && v.every(scalaire))) continue
        nonPlates.add(`${gabarit}:${nom}`)
        expect(Object.keys(v)).toEqual(['value'])
      }
    }
    expect([...nonPlates].sort()).toEqual([
      'merge/03-competence-evolution.md:CONFIANCE_MOY',
      'merge/03-competence-evolution.md:SCORE_CUMULE',
    ])
  })

  it('UC-APP-10-U03 — run réel (mock=false) : TOUS les backends (collège, rapide, tribunal) sont construits par la fabrique injectée', async () => {
    const specs = []
    let appels = 0
    const fabrique = (spec) => {
      specs.push(spec.kind)
      const inner = mockBackendFactory({ ...spec, kind: 'mock', salt: SALT })
      return {
        records: inner.records,
        async call(prompt, opts) {
          appels += 1
          return inner.call(prompt, opts)
        },
      }
    }
    const res = await run({ mock: false, salt: null, backends: fabrique })

    // 3 lecteurs (passes) + tribunal + rapide, avec leurs kinds de production.
    expect(specs).toEqual(['anthropic', 'anthropic', 'anthropic', 'claude-cli', 'claude-cli'])
    expect(appels).toBe(res.metrics.appels_llm)
    expect(appels).toBeGreaterThan(0)
  })

  it('UC-APP-10-U04 — cause de l’anomalie : run réel SANS fabrique injectée → « Backend inconnu » avant tout appel', async () => {
    await expect(run({ mock: false, salt: null })).rejects.toThrow('Backend inconnu : anthropic (choix : mock)')
  })

  it('UC-APP-10-U05 — reprise (RG12) : avec le même état persistant, les journées déjà analysées ne sont PAS rejouées', async () => {
    const etat = {}
    await run({ etat, options: { jours: 2 } })
    expect(Object.keys(etat.journees)).toHaveLength(2)

    const suite = await run({ etat })
    expect(suite.metrics.n_journees_reprises_etat).toBe(2)
    expect(suite.metrics.par_etape.tagging.appels).toBe(3 * 3) // seule la 3e journée est lue
    expect(Object.keys(etat.journees)).toHaveLength(3)
  })

  it('UC-APP-10-U34 — ANOMALIE figée : une erreur d’appel serveur (402…) est AVALÉE par le moteur ; le run se termine, dégradé, et ses journées sont mémorisées comme faites', async () => {
    // Fabrique qui imite /api/twin9/appel : 5 appels servis, puis 402 (solde épuisé).
    let appels = 0
    let refus = 0
    const fabrique = (spec) => {
      const inner = mockBackendFactory({ ...spec, kind: 'mock', salt: SALT })
      return {
        records: inner.records,
        async call(prompt, opts) {
          appels += 1
          if (appels > 5) {
            refus += 1
            throw Object.assign(new Error('Solde insuffisant'), { status: 402 })
          }
          return inner.call(prompt, opts)
        },
      }
    }
    const etat = {}
    // Comportement ACTUEL : la promesse est RÉSOLUE (aucune erreur ne remonte à la
    // vue, dont la pause « Rechargez… » est donc inatteignable).
    const res = await run({ mock: false, salt: null, backends: fabrique, etat })
    expect(refus).toBeGreaterThan(0)
    const carto = aplatir(res.cartoEvolutive)
    expect(carto.statuts['présence établie'] ?? 0).toBe(0) // analyse vidée : aucune présence
    // Les 3 journées dégradées sont mémorisées avec leur empreinte…
    expect(Object.keys(etat.journees)).toHaveLength(3)

    // …donc une « reprise » après recharge ne les rejoue PAS : seules la fusion et
    // les relectures repartent (contraire de la promesse de E5).
    let appelsReprise = 0
    const saine = (spec) => {
      const inner = mockBackendFactory({ ...spec, kind: 'mock', salt: SALT })
      return {
        records: inner.records,
        async call(prompt, opts) {
          appelsReprise += 1
          return inner.call(prompt, opts)
        },
      }
    }
    const suite = await run({ mock: false, salt: null, backends: saine, etat })
    expect(suite.metrics.n_journees_reprises_etat).toBe(3)
    expect(suite.metrics.par_etape.tagging).toBeUndefined() // aucune journée relue
    expect(appelsReprise).toBeLessThan(10)
  })
})

describe('UC-APP-10 — briques déterministes du protocole', () => {
  it('UC-APP-10-U06 — varsClient : les fiches confidentielles ne sont JAMAIS transmises ; clés de lookup ajoutées', () => {
    const vars = new Map([
      ['CODE', '1.01'],
      ['COMPETENCE_FICHE', '(fiche locale)'],
      ['POLE_FICHES', '(fiches locales)'],
      ['TEXTE_JOURNEE', 'texte'],
    ])
    expect(varsClient(vars, { POLE_NUM: 1, POLE_FICHES_ORDRE: ['1.02', '1.01'] })).toEqual({
      CODE: '1.01',
      TEXTE_JOURNEE: 'texte',
      POLE_NUM: 1,
      POLE_FICHES_ORDRE: ['1.02', '1.01'],
    })
    expect([...VARS_FICHES].sort()).toEqual(['COMPETENCE_FICHE', 'POLE_FICHES'])
  })

  it('UC-APP-10-U07 — ancrage verbatim : une citation introuvable dans la journée est rejetée, jamais inventée', () => {
    const texte = "J'ai comparé deux sources contradictoires et noté l'écart dans mon carnet daté."
    const [spans, rejets] = ancrer(
      texte,
      new Map([['lecteur#1', [
        { competence: '1.01', extrait: 'comparé deux sources contradictoires', confiance: 0.8, justification: 'x' },
        { competence: '2.01', extrait: 'une phrase qui n’existe pas dans la journée', confiance: 0.9 },
      ]]]),
      [{ name: 'lecteur#1' }],
    )
    expect(spans).toHaveLength(1)
    expect(spans[0]).toMatchObject({ code: '1.01', model: 'lecteur#1', tronque: false })
    expect(texte.slice(spans[0].start, spans[0].end)).toBe('comparé deux sources contradictoires')
    expect(rejets).toEqual([
      { model: 'lecteur#1', competence: '2.01', extrait: 'une phrase qui n’existe pas dans la journée', motif: 'non ancré (citation introuvable)' },
    ])
  })

  it('UC-APP-10-U08 — tribunal : résolution CALCULÉE sans vote, dans l’ordre des règles ; confiance mécanique', () => {
    const jures = [['Sceptique', ''], ['Praticien', '']]
    const pos = (a, b) => ({ Sceptique: { position: a }, Praticien: { position: b } })
    expect(resoudre(jures, pos('détection', 'détection'), 'solide', true)[0]).toBe('renvoi au cartographe')
    expect(resoudre(jures, pos('abstention', 'contestation'), 'solide', false)).toEqual(['présence non établie', 'aucune détection survivante'])
    expect(resoudre(jures, pos('détection', 'contestation'), 'solide', false)[0]).toBe('renvoi au cartographe')
    expect(resoudre(jures, pos('détection', 'abstention'), 'gonfle', false)[1]).toMatch(/détection isolée/)
    expect(resoudre(jures, pos('détection', 'détection'), 'gonfle', false)).toEqual(['présence établie', 'détection(s) que personne ne conteste'])

    expect(calculerConfiance('présence établie', 2, 0, 0, 1)).toBe(0.8)
    expect(calculerConfiance('présence établie', 9, 0, 0, 9)).toBe(0.95)
    expect(calculerConfiance('présence non établie', 0, 2, 1, 0)).toBe(0.85)
    expect(calculerConfiance('renvoi au cartographe', 1, 1, 0, 0)).toBe(0.5)
  })

  it('UC-APP-10-U09 — fusion : statut temporel (persistance) et trajectoire développementale', () => {
    expect(statutTemporel(2, 0)).toBe('présence consolidée')
    expect(statutTemporel(1, 3)).toBe('présence établie (à confirmer)')
    expect(statutTemporel(0, 1)).toBe('renvoi au cartographe')
    expect(statutTemporel(0, 0)).toBe('présence non établie')
    expect(trajectoire([1, 2], [], 3)).toBe('consolidation')
    expect(trajectoire([0, 5], [], 6)).toBe('intermittence')
    expect(trajectoire([0, 1], [], 6)).toBe('en sommeil')
    expect(trajectoire([5], [], 6)).toBe('émergence récente')
    expect(trajectoire([], [1, 3], 6)).toBe('frontière persistante')
  })

  it('UC-APP-10-U10 — empreinte de journée (clé de reprise) : stable, change avec le texte ou le collège', () => {
    const jr = { id: 'j1', texte: 'Texte de la journée.' }
    const roster = [{ name: 'claude-sonnet-5#1', model: 'claude-sonnet-5', family: 'anthropic', kind: 'anthropic' }]
    const base = empreinteJournee(jr, roster, PIPELINE)
    expect(empreinteJournee({ ...jr }, [...roster], JSON.parse(JSON.stringify(PIPELINE)))).toBe(base)
    expect(empreinteJournee({ ...jr, texte: 'Texte modifié.' }, roster, PIPELINE)).not.toBe(base)
    expect(empreinteJournee(jr, [...roster, { ...roster[0], name: 'claude-sonnet-5#2' }], PIPELINE)).not.toBe(base)
  })

  it('UC-APP-10-U30 — scan global : références de journées résolues par id ou date (première gagne, sans doublon) ; clé d’observation normalisée', () => {
    const jours = [
      { id: 'j1', date: '2026-04-06' },
      { id: 'j1_b', date: '2026-04-06' },
      { id: 'j2', date: '2026-04-09' },
    ]
    expect(resoudreJournees(['2026-04-09', ' j1 ', '2026-04-06', 'inconnue', 'j2'], jours).map((j) => j.id)).toEqual(['j2', 'j1'])
    expect(resoudreJournees(null, jours)).toEqual([])
    expect(cleObs({ type: 'motif', titre: '  Vérifier AVANT d’affirmer ' })).toEqual(['motif', 'vérifier avant d’affirmer'])
    expect(cleObs({ type: 'graine-referentiel', code: '1.02', titre: 'ignoré' })).toEqual(['graine', '1.02'])
  })
})

describe('UC-APP-10 — projection sunburst du résultat (twin9ToMergeDocument)', () => {
  it('UC-APP-10-U11 — carto_evolutive du run → document merge : une feuille par journée attestée, points = attestations', async () => {
    const carto = aplatir((await run()).cartoEvolutive)
    const referentiel = {
      poles: [
        ...REFERENTIEL.map((p) => ({ num: p.num, nom: p.nom })),
        { num: 4, nom: 'ÂME — Discerner & Juger' },
        { num: 5, nom: 'RACINES — Évoluer & Résister' },
        { num: 6, nom: 'CITÉ — Gouverner & S’ouvrir' },
        { num: 7, nom: 'FLAMBEAU — Transmettre & Piloter' },
      ],
      competences: REFERENTIEL.flatMap((p) => p.competences.map((c) => ({ ...c, pole: p.num }))),
    }
    const doc = twin9ToMergeDocument(carto, referentiel, { generatedAt: carto.date })

    expect(doc.kind).toBe('cartographie-merge')
    expect(doc.domains).toHaveLength(7)
    const datesAttestees = new Set(
      Object.values(carto.competences).flatMap((c) => (c.attestations ?? []).map((a) => a.date)),
    )
    expect(doc.feuilles.map((f) => f.iso)).toEqual([...datesAttestees].sort())
    for (const comp of doc.domains.flatMap((d) => d.competences)) {
      expect(comp.points).toBe(new Set(carto.competences[comp.code].attestations.map((a) => a.date)).size)
    }
    expect(() => twin9ToMergeDocument({ competences: {} }, referentiel)).toThrow(/attestation/)
  })
})

/** Vecteurs figés versionnés (engine/test/twin9-vectors/) — à lire DANS un it(). */
const vecteurs = (nom) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../twin9-vectors/${nom}`, import.meta.url)), 'utf8'))

describe('UC-APP-10 — découpage du portfolio collé en journées (portfolio.js)', () => {
  it('UC-APP-10-U42 — splitPortfolio / feuillesBlock / sentencesOf sur les vecteurs synthétiques : journées datées (JJ.MM.AA, ISO) triées, même jour suffixé _b, fins de ligne CRLF normalisées ; journal hebdomadaire (titres ## / ###) ; feuille unique à défaut ; phrases candidates du mock ; texte précédant le premier séparateur (daté ou non) ignoré', () => {
    const cas = vecteurs('portfolio_synth.vec.json')
    expect(cas).toHaveLength(5)
    for (const c of cas) {
      const pf = splitPortfolio(c.content, c.filename)
      expect(pf.journal_id, c.filename).toBe(c.journal_id)
      expect(pf.feuilles, c.filename).toEqual(c.feuilles)
      expect(feuillesBlock(pf.feuilles), c.filename).toBe(c.feuilles_block)
      expect(sentencesOf(pf), c.filename).toEqual(c.sentences)
    }
    // Les règles que ces vecteurs figent, lues sur les cas eux-mêmes :
    const par = Object.fromEntries(cas.map((c) => [c.filename, c.feuilles]))
    const journal = par['Mon Portfolio (élève) v2.final.md']
    expect(journal.map((f) => [f.id, f.date])).toEqual([
      ['2024-03-11', '2024-03-11'], // ISO antérieure remontée par le tri
      ['2024-03-12', '2024-03-12'], // « 12.3.24 » → 2024-03-12
      ['2024-03-12_b', '2024-03-12'], // même jour : suffixe _b
      ['2124-03-05', '2124-03-05'], // année à 3 chiffres : 2000 + n, sans contrôle calendaire
    ])
    expect(journal.every((f) => !f.texte.includes('\r'))).toBe(true)
    expect(par['SYNTH-hebdo.md'].map((f) => [f.id, f.date, f.titre])).toEqual([
      ['F01', null, 'Semaine 1'],
      ['F02', null, 'Détail important'],
      ['F03', null, 'Semaine 2'],
    ])
    for (const nom of ['unique.md', 'sans_titres.md']) {
      expect(par[nom].map((f) => [f.id, f.date, f.start])).toEqual([['F01', null, 0]])
    }
    // Dès deux séparateurs, le texte qui précède le premier (préambule, titre #)
    // n'appartient à aucune feuille : il n'est jamais analysé, sans avertissement.
    const preambule = '# Mon journal\nPréambule fictif\n'
    for (const [corps, ids] of [
      ['### 1.1.24\na\n### 2.1.24\nb\n', ['2024-01-01', '2024-01-02']],
      ['## Semaine 1\na\n## Semaine 2\nb\n', ['F01', 'F02']],
    ]) {
      const pf = splitPortfolio(preambule + corps, 'twin9.md')
      expect(pf.feuilles.map((f) => f.id)).toEqual(ids)
      expect(pf.feuilles[0].start).toBe(preambule.length)
      expect(pf.feuilles.some((f) => f.texte.includes('Préambule'))).toBe(false)
      expect(feuillesBlock(pf.feuilles)).not.toContain('Préambule')
    }
  })

  it('UC-APP-10-U43 — ANOMALIE figée (anomalie 7) : un portfolio d’UNE seule journée datée perd sa date — feuille F01 non datée, période « F01 », attestations sans date, projection sunburst refusée', async () => {
    const UNE_JOURNEE = PORTFOLIO.split('### 2026-04-09')[0].replace('# Journal fictif du lot twin\n\n', '')
    expect(UNE_JOURNEE.startsWith('### 2026-04-06')).toBe(true)
    // Il faut au moins DEUX titres datés pour découper par date (parité Python) ;
    // sinon le titre unique ne compte pas et le document entier devient F01.
    expect(splitPortfolio(UNE_JOURNEE, 'twin9.md').feuilles.map((f) => [f.id, f.date, f.titre])).toEqual([
      ['F01', null, 'twin9'],
    ])

    const carto = aplatir((await run({ portfolioTexte: UNE_JOURNEE })).cartoEvolutive)
    expect(carto.periode).toEqual({ debut: 'F01', fin: 'F01', n_journees: 1 })
    const attestations = Object.values(carto.competences).flatMap((c) => c.attestations ?? [])
    expect(attestations.length).toBeGreaterThan(0)
    expect(attestations.every((a) => a.date === null && a.journee === 'F01')).toBe(true)
    // La vue de résultats avale ce refus : pas de sunburst (ResultatsTwin9).
    const referentiel = {
      poles: REFERENTIEL.map((p) => ({ num: p.num, nom: p.nom })),
      competences: REFERENTIEL.flatMap((p) => p.competences.map((c) => ({ ...c, pole: p.num }))),
    }
    expect(() => twin9ToMergeDocument(carto, referentiel)).toThrow(/aucune attestation datée/)
  })
})

describe('UC-APP-10 — backends du moteur (backends.js)', () => {
  it('UC-APP-10-U44 — fabrique par défaut : « mock » seul — les kinds de production du collège (anthropic) ET du tribunal (claude-cli) sont refusés (cause de l’anomalie 1) ; le mock rejoue les 196 vecteurs à l’identique, que le prompt soit vide ou un faux gabarit (le devis ignore les gabarits, RG10), un record par appel', async () => {
    expect(Object.keys(KINDS)).toEqual(['mock'])
    expect(mockBackendFactory({}).kind).toBe('mock') // kind absent → mock
    expect(() => mockBackendFactory({ kind: 'anthropic', model: 'claude-sonnet-5' })).toThrow('Backend inconnu : anthropic (choix : mock)')
    expect(() => mockBackendFactory({ kind: 'claude-cli', model: 'fictif-tribunal' })).toThrow('Backend inconnu : claude-cli (choix : mock)')

    const { cases } = vecteurs('backends.vec.json')
    expect(cases).toHaveLength(196)
    const taches = new Set()
    for (const c of cases) {
      taches.add(c.task)
      for (const prompt of ['', 'Gabarit fictif {$TEXTE_JOURNEE} — sans effet sur le mock']) {
        const b = mockBackendFactory({ kind: 'mock', ...c.spec })
        const out = await b.call(prompt, { model: c.model, task: c.task, meta: c.meta, label: c.label })
        const ctx = `task=${c.task} label=${c.label}`
        expect(out, ctx).toBe(c.out)
        expect(b.records, ctx).toHaveLength(1)
        const { label, model, response_chars: reponse, ok } = b.records[0].asDict()
        expect([label, model, reponse, ok], ctx).toEqual([c.record.label, c.record.model, c.record.response_chars, true])
      }
    }
    for (const t of ['tagger', 'premiere_impression', 'greffier', 'jure', 'president', 'kairos']) expect(taches).toContain(t)
  })

  it('UC-APP-10-U45 — fetchBackend (transport alternatif du moteur) : NON branché par la vue, il poste {etape, variables, modele, etage, facturation} sur une URL absolue SANS jeton CSRF ni max_tokens, et réduit un refus HTTP à un message sans statut (comportement actuel)', async () => {
    const appels = []
    const ok = fetchBackend(undefined, async (url, init) => {
      appels.push({ url, init })
      return { ok: true, status: 200, json: async () => ({ sortie: 'sortie filtrée' }) }
    })
    const res = await ok.call({
      etape: 'lourd/20-greffier',
      variables: { CODE: '1.01' },
      modele: 'claude-sonnet-5',
      etage: 'rapide',
      facturation: 'platform',
      max_tokens: 2048, // ignoré : le transport ne le relaie pas
    })
    expect(res).toEqual({ text: 'sortie filtrée' })
    expect(appels[0].url).toBe('/api/twin9/appel')
    expect(appels[0].init.headers).toEqual({ 'content-type': 'application/json' }) // pas de X-CSRF-Token
    expect(JSON.parse(appels[0].init.body)).toEqual({
      etape: 'lourd/20-greffier',
      variables: { CODE: '1.01' },
      modele: 'claude-sonnet-5',
      etage: 'rapide',
      facturation: 'platform',
    })

    // Ce que CsrfMiddleware répondrait à ce corps sans jeton (UC-APP-10-F17) : 403.
    const refuse = fetchBackend(undefined, async () => ({ ok: false, status: 403, json: async () => ({ error: 'Jeton CSRF absent ou invalide' }) }))
    const err = await refuse.call({ etape: 'x' }).catch((e) => e)
    expect(err.message).toBe('twin9/appel : HTTP 403')
    expect(err.status).toBeUndefined()
  })
})
