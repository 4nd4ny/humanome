// Chaque information une fois (journal D-66) : ce qui se lit déjà au-dessus
// n'est pas redit — synthèse complète du kairos, statut et confiance d'une
// journée, confiance finale du Pédagogue, décision du président, extraits des
// territoires denses — et les textes complets qui ne font que reprendre leurs
// rubriques ne sont pas gardés.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DayKairos } from './Narratives.jsx'
import { DayPieces, PedagogueReview, RunJury, VerdictFacts, pieceFates } from './Jury.jsx'
import { placePassages } from './PoleReports.jsx'
import { sameAsCompetency, saidByRun } from './Observations.jsx'
import { adaptAuroraDay } from '../core/importers/aurora-day.js'
import { importV3Master } from '../core/importers/v3-master.js'
import { importJourDocuments } from '../../v3/core/import.js'
import { normalizeReferential as normalizeV3Referential } from '../../v3/core/referentiel.js'
import { addedMarkdown, addedSentences, hasKairosFields, hasPoleReportFields, keepKairosMarkdown, withoutRestatements } from '../core/restatement.js'
import { importArchive } from '../core/archive.js'
import { cartoPole, kairosDoc, miniReferential } from '../test/fixtures.js'

afterEach(cleanup)

const verdict = { status: 'established', rawStatus: 'présence établie', courtCircuit: false, confidence: 0.8, proofs: 1, hints: 2 }
const detail = { motif: 'Le motif.', prescription: 'La prescription.' }
const terms = () => [...document.querySelectorAll('.carto-verdict-facts dt')].map((dt) => dt.textContent)

describe('ce qu’un texte complet ajoute à ses rubriques', () => {
  const parts = ['Le portrait tient en deux phrases. Il parle de soin.', 'Architecture de systèmes — Conception d’un pipeline à plusieurs modèles.', 'C’est comme avec la génération de code.']
  it('rien, quand il les redit — à la typographie, au balisage et à une étiquette près', () => {
    const md = [
      '## Portrait',
      '',
      'Le portrait tient en deux phrases. Il parle de soin.',
      '',
      '## Territoires',
      '',
      '**Architecture de systèmes.** Conception d\'un pipeline à plusieurs modèles.',
      '',
      'Extrait : « C\'est comme avec la génération de code. »',
    ].join('\n')
    expect(addedSentences(md, parts)).toEqual([])
    expect(addedMarkdown(md, parts)).toBe('')
  })
  it('ses phrases neuves, sous le titre de leur section', () => {
    const md = '## Portrait\n\nLe portrait tient en deux phrases. Une phrase que les rubriques ne disent pas.\n\n## Suite\n\nUne autre encore.'
    expect(addedSentences(md, parts).map((s) => s.text)).toEqual(['Une phrase que les rubriques ne disent pas.', 'Une autre encore.'])
    expect(addedMarkdown(md, parts)).toBe('#### Portrait\n\nUne phrase que les rubriques ne disent pas.\n\n#### Suite\n\nUne autre encore.')
  })
  it('une négation, un nombre, un mot changé, une précision ajoutée font une phrase neuve', () => {
    const field = 'Sur cette feuille, trois compétences du pôle Tête sont établies avec des preuves nombreuses et variées.'
    const variants = [
      'Sur cette feuille, trois compétences du pôle Tête ne sont pas établies avec des preuves nombreuses et variées.',
      'Sur cette feuille, cinq compétences du pôle Tête sont établies avec des preuves nombreuses et variées.',
      'Sur cette feuille, trois compétences du pôle Tête sont contestées avec des preuves nombreuses et variées.',
      'Sur cette feuille, trois compétences du pôle Tête sont établies avec des preuves nombreuses et variées, sauf la 1.04.',
      'Sur cette feuille, trois compétences du pôle Tête sont établies avec des preuves toujours nombreuses et variées.',
    ]
    for (const v of variants) expect(addedSentences(v, [field]).map((x) => x.text)).toEqual([v])
    expect(addedSentences('La pensée critique tient lieu de fil rouge, mais la relation reste en pointillé.', ['La pensée critique tient lieu de fil rouge sur la feuille.', 'Ici, la relation reste en pointillé.'])).toHaveLength(1)
  })
  it('une coquille corrigée n’en fait pas une (« errors » / « erreurs »), un préfixe de sens si', () => {
    const field = 'Trois ans d’usage nourrissent la décision actuelle, errors de méthode nourrissent la qualité d’après.'
    expect(addedSentences('Trois ans d’usage nourrissent la décision actuelle, erreurs de méthode nourrissent la qualité d’après.', [field])).toEqual([])
    expect(addedSentences('Ce chemin reste possible pour la suite du projet.', ['Ce chemin reste impossible pour la suite du projet.'])).toHaveLength(1)
  })
  it('titres en gras et étiquettes ne sont pas des phrases ; une liste reste une liste ; on ne coupe pas dans des guillemets', () => {
    const md = ['**Portrait**', '', 'Le portrait tient en deux phrases.', '', 'Invitations :', '', '- Une invitation neuve. Avec sa suite.', '- Une autre invitation.', '', 'Il écrit « Je doute. Puis je vérifie. » ce matin-là.'].join('\n')
    const added = addedSentences(md, parts)
    expect(added.map((x) => [x.heading, x.text])).toEqual([
      ['Invitations', 'Une invitation neuve.'],
      ['Invitations', 'Avec sa suite.'],
      ['Invitations', 'Une autre invitation.'],
      ['Invitations', 'Il écrit « Je doute. Puis je vérifie. » ce matin-là.'],
    ])
    expect(addedMarkdown(md, parts)).toBe('#### Invitations\n\n- Une invitation neuve. Avec sa suite.\n- Une autre invitation.\n\nIl écrit « Je doute. Puis je vérifie. » ce matin-là.')
  })
})

describe('portrait kairos d’une journée', () => {
  it('ses rubriques, sans la synthèse complète qui les redit', () => {
    render(<DayKairos date="2025-12-22" kairos={{ portrait: 'Le portrait.', profileShape: 'La forme.', invitations: ['Une invitation.'], markdown: '## Portrait\n\nLe portrait.' }} />)
    expect(screen.getByText('Le portrait.')).toBeTruthy()
    expect(screen.queryByText('Synthèse complète')).toBeNull()
    expect(screen.getAllByText('Le portrait.')).toHaveLength(1)
  })
  it('ce que la synthèse ajoute se lit dans la suite du portrait, une fois', () => {
    render(<DayKairos date="2025-12-22" kairos={{ portrait: 'Le portrait.', profileShape: null, invitations: [], markdown: '## Portrait\n\nLe portrait.\n\n## Ailleurs\n\nUne phrase de plus.' }} />)
    expect(screen.getByText('Suite du portrait')).toBeTruthy()
    expect(screen.getAllByText('Une phrase de plus.')).toHaveLength(1)
    expect(screen.getAllByText('Le portrait.')).toHaveLength(1)
  })
  it('une analyse sans rubriques : sa synthèse, seule, en est le contenu', () => {
    render(<DayKairos date="2025-12-22" kairos={{ portrait: null, profileShape: null, linksAcrossPoles: null, betweenTheLines: null, invitations: [], markdown: '## Portrait\n\nUn texte seul.' }} />)
    expect(screen.getByText('Un texte seul.')).toBeTruthy()
    expect(screen.queryByText('Synthèse complète')).toBeNull()
  })
})

describe('verdict d’une journée', () => {
  it('complet par défaut ; sans ce que la ligne de la journée dit déjà ; sans le statut seul ; sans les textes du président', () => {
    const { rerender } = render(<VerdictFacts verdict={verdict} detail={detail} />)
    expect(terms()).toEqual(['Statut', 'Confiance', 'Preuves · indices', 'Motif', 'Prescription'])
    rerender(<VerdictFacts verdict={verdict} detail={detail} summary={false} />)
    expect(terms()).toEqual(['Motif', 'Prescription'])
    rerender(<VerdictFacts verdict={verdict} detail={detail} status={false} />)
    expect(terms()).toEqual(['Confiance', 'Preuves · indices', 'Motif', 'Prescription'])
    rerender(<VerdictFacts verdict={verdict} detail={detail} summary={false} texts={false} />)
    expect(document.querySelector('.carto-verdict-facts')).toBeNull()
  })
  it('la ligne d’une journée ne redit les chiffres du panneau que s’ils diffèrent', () => {
    const comp = { days: ['2025-12-22'], confidence: 0.8, proofs: 1, hints: 2 }
    expect(sameAsCompetency(verdict, comp)).toBe(true)
    expect(sameAsCompetency(verdict, { ...comp, days: ['2025-12-22', '2025-12-23'] })).toBe(false)
    expect(sameAsCompetency({ ...verdict, proofs: 2 }, comp)).toBe(false) // compteurs du jury ≠ traces retenues : les deux se lisent
  })
  it('le motif d’un verdict AuroraCore n’est tu que si la délibération est là et le dit', () => {
    const vd = { runRef: 'run@2026-04-19|1.01', ...detail }
    const run = { president: { verdict_argumente: 'Le motif.', prescription: 'La prescription.' } }
    expect(saidByRun(run, vd)).toBe(true)
    expect(saidByRun(null, vd)).toBe(false) // délibération absente de l'import : le motif se lit à la journée
    expect(saidByRun({ president: { verdict_argumente: 'Autre chose.' } }, vd)).toBe(false)
    expect(saidByRun(run, detail)).toBe(false) // pas un verdict de run
  })
})

describe('délibération AuroraCore', () => {
  const run = {
    jury: { voix_presence: 5, voix_non_etablie: 1, voix_sans_eclairage: 0, consensus: false, linguiste: { position: 'présence', confiance: 0.7, synthese: 'La voix du linguiste.' } },
    president: { points_convergence: 'Ils convergent.', verdict_argumente: 'Le motif.', prescription: 'La prescription.' },
    deliberation: { president: { markdown: '## Délibération\n\nTout le raisonnement.' } },
    debate: {},
    pieces: [],
  }
  it('la décision du président se lit d’abord, sans rien déplier ; ce qui y a conduit se déplie', () => {
    render(<RunJury run={run} />)
    const decision = screen.getByRole('region', { name: 'Décision du président' })
    expect(decision.textContent).toContain('Le motif.')
    expect(decision.textContent).toContain('La prescription.')
    expect(decision.closest('details')).toBeNull()
    expect(screen.getByText('5 voix pour la présence, 1 non établie, 0 sans éclairage · sans consensus')).toBeTruthy()
    expect(screen.getByText('Ils convergent.').closest('details').querySelector('summary').textContent).toBe('Raisonnement du président')
    // Les membres du jury, chacun sur sa ligne, sans repli de plus (D-69).
    const members = screen.getByRole('region', { name: 'Réflexions des membres du jury' })
    expect(members.closest('details')).toBeNull()
    expect(screen.getByText('La voix du linguiste.').closest('details').querySelector('summary').textContent).toBe('Linguiste — présence · confiance 0,7')
  })
  it('la décision ne redit pas le motif et la prescription déjà lus au-dessus', () => {
    render(<RunJury run={run} shown={[detail.motif, detail.prescription]} />)
    expect(screen.queryByRole('region', { name: 'Décision du président' })).toBeNull()
    expect(screen.queryByText('Le motif.')).toBeNull()
    expect(screen.queryByText('La prescription.')).toBeNull()
    expect(screen.getByText('Ils convergent.')).toBeTruthy()
    expect(screen.getByText(/5 voix pour la présence/)).toBeTruthy()
  })
})

describe('examen du Pédagogue et pièces du Greffier', () => {
  const pedagogue = { presomptionAbsence: { raisonnement: 'Absence ?' }, presomptionSycophantie: { raisonnement: 'Complaisance ?' }, conclusionAdversariale: { raisonnement: 'Conclusion.', confianceFinale: 0.8 } }
  it('la confiance finale ne se dit que si elle diffère de celle du verdict', () => {
    const { rerender } = render(<PedagogueReview pedagogue={pedagogue} confidence={0.8} />)
    expect(screen.getByText('Conclusion adversariale')).toBeTruthy()
    rerender(<PedagogueReview pedagogue={pedagogue} confidence={0.6} />)
    expect(screen.getByText('Conclusion adversariale (confiance finale 0,8)')).toBeTruthy()
    rerender(<PedagogueReview pedagogue={{ ...pedagogue, conclusionAdversariale: { raisonnement: 'Conclusion.' } }} confidence={0.6} />)
    expect(screen.getByText('Conclusion adversariale')).toBeTruthy()
  })
  it('chaque pièce dit son sort dans le verdict ; l’extrait d’une pièce retenue, lu dans les traces, ne se redit pas', () => {
    const traces = { a: { pieceId: 1, role: 'indice' }, b: { pieceId: 1, role: 'preuve' }, c: { pieceId: '3', role: 'indice' } }
    expect([...pieceFates(traces)]).toEqual([
      ['1', 'preuve'],
      ['3', 'indice'],
    ])
    const pieces = [1, 2, 3].map((n) => ({ numero: n, pid: n, context: `Contexte ${n}.`, extract: `Extrait ${n}.` }))
    render(<DayPieces pieces={pieces} traces={traces} date="2025-12-22" onOpenPassage={() => {}} />)
    expect([...document.querySelectorAll('.carto-piece-fate')].map((x) => x.textContent)).toEqual(['retenue comme preuve', 'non retenue', 'retenue comme indice'])
    expect([...document.querySelectorAll('blockquote')].map((q) => q.textContent)).toEqual(['Extrait 2.'])
    expect(screen.getAllByText('Son extrait se lit plus haut, parmi les traces.')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Ouvrir dans le portfolio' })).toHaveLength(3)
  })
  it('une trace sans numéro de pièce : le sort des autres pièces n’est pas dit', () => {
    const traces = { a: { pieceId: 1, role: 'preuve' }, c: { pieceId: null, role: 'preuve' } }
    const pieces = [1, 2].map((n) => ({ numero: n, pid: n, context: `Contexte ${n}.`, extract: `Extrait ${n}.` }))
    render(<DayPieces pieces={pieces} traces={traces} date="2025-12-22" />)
    expect([...document.querySelectorAll('.carto-piece-fate')].map((x) => x.textContent)).toEqual(['retenue comme preuve'])
  })
  it('la confiance finale se compare une fois ramenée à [0 ; 1] (80 se lit 0,8)', () => {
    render(<PedagogueReview pedagogue={{ conclusionAdversariale: { raisonnement: 'C.', confianceFinale: 80 } }} confidence={0.8} />)
    expect(screen.getByText('Conclusion adversariale')).toBeTruthy()
  })
})

describe('rapport de pôle', () => {
  const dense = [{ competence: 'Doute', extraitVerbatim: 'Un passage cité.' }, { competence: 'Soin', extraitVerbatim: 'Le début d’un long passage cité en entier plus haut, et sa suite.' }]
  it('un passage saillant dont l’extrait est déjà cité, le même jour, se lit sous son territoire', () => {
    const same = { extract: 'Un  passage cité !', context: 'Pourquoi.', date: '2025-12-22' } // à la typographie près
    const other = { extract: 'Un autre passage.', context: 'Autre.' }
    const { byTerritory, others } = placePassages([same, other], dense, '2025-12-22')
    expect(byTerritory.get(0)).toEqual([same])
    expect(others).toEqual([other])
  })
  it('à part, entier : une partie de l’extrait cité, un passage plus long, celui d’une autre feuille', () => {
    const part = { extract: 'Le début d’un long passage cité en entier plus haut' }
    const longer = { extract: 'Avant. Un passage cité. Après.' }
    const elsewhere = { extract: 'Un passage cité.', date: '2025-12-20' }
    const empty = { extract: '' }
    const { byTerritory, others } = placePassages([part, longer, elsewhere, empty], dense, '2025-12-22')
    expect(byTerritory.size).toBe(0)
    expect(others).toEqual([part, longer, elsewhere, empty])
  })
})

describe('à l’import : un texte complet qui redit ses rubriques n’est pas gardé', () => {
  const day = (rapport, apprenant) => {
    const pole = cartoPole(1, [{ code: '1.01', traces: [{ role: 'preuve décisive', extrait: 'Un extrait.' }] }], { date: '2025-12-22' })
    if (rapport !== undefined) pole.rapport = rapport
    const kairos = kairosDoc('2025-12-22')
    if (apprenant !== undefined) kairos.kairos.apprenant = apprenant
    return adaptAuroraDay({ date: '2025-12-22', poles: [pole], kairos, provenance: { source: 'aurora-v3' }, now: '2026-10-16T00:00:00Z' })
  }
  it('rubriques présentes et redites : ni synthèse complète du kairos, ni rapport complet du pôle', () => {
    const { detail: d } = day()
    expect(hasKairosFields(d.kairos)).toBe(true)
    expect(d.kairos.markdown).toBeNull()
    expect(hasPoleReportFields(d.poleReports[1])).toBe(true)
    expect(d.poleReports[1].markdown).toBeNull()
  })
  it('un texte complet qui ajoute quelque chose à ses rubriques est gardé', () => {
    const { detail: d } = day(undefined, { portrait: 'Le portrait.', syntheseCompleteMarkdown: '## Portrait\n\nLe portrait.\n\n## Suite\n\nUne phrase de plus.' })
    expect(d.kairos.markdown).toContain('Une phrase de plus.')
  })
  it('texte seul : gardé, c’est tout le contenu', () => {
    const { detail: d } = day({ rapportCompletMarkdown: '## Rapport\n\nSeul.' }, { syntheseCompleteMarkdown: '## Portrait\n\nSeule.' })
    expect(d.kairos.markdown).toBe('## Portrait\n\nSeule.')
    expect(d.poleReports[1].markdown).toBe('## Rapport\n\nSeul.')
  })
  it('master V3 : les invitations ne vivent que dans la synthèse — elle est gardée', () => {
    const date = '2025-12-22'
    const kairos = kairosDoc(date)
    kairos.kairos.apprenant.syntheseCompleteMarkdown = `## Portrait\n\nPortrait du ${date}.\n\n## Invitations pour la suite\n\n- Raconter une erreur.`
    const poles = [cartoPole(1, [{ code: '1.01', traces: [{ role: 'preuve décisive', extrait: 'Un extrait.' }] }], { date })]
    const { master } = importJourDocuments([{ run: 'site', sourceDate: date, payload: { date, poles, kairos } }], {
      referential: normalizeV3Referential(miniReferential()),
      datasetId: '7f1c2a9e-3b4d-4e5f-8a6b-1c2d3e4f5a6b',
      now: '2026-10-16T00:00:00.000Z',
    })
    const k = importV3Master(master).variants[0].detail.kairos
    expect(k.invitations).toEqual([])
    expect(k.markdown).toContain('Raconter une erreur.')
    // Les mêmes invitations en rubrique : la synthèse ne dit plus rien d'autre.
    expect(keepKairosMarkdown({ ...k, invitations: ['Raconter une erreur.'] })).toBe(false)
  })
  it('une archive construite avant : allégée à la lecture, rien d’autre ne change', () => {
    const old = {
      verdicts: { '1.01': { motif: 'M.' } },
      kairos: { portrait: 'P.', markdown: '## Portrait\n\nP.' },
      poleReports: { 1: { portrait: 'Pp.', denseTerritories: [], leads: [], markdown: '## Pôle\n\nPp.' }, 2: { portrait: null, denseTerritories: [], leads: [], markdown: 'Seul.' } },
    }
    const lean = withoutRestatements(old)
    expect(lean.kairos).toEqual({ portrait: 'P.', markdown: null })
    expect(lean.poleReports[1].markdown).toBeNull()
    expect(lean.poleReports[2].markdown).toBe('Seul.')
    expect(lean.poleReports[2]).toBe(old.poleReports[2])
    expect(lean.verdicts).toBe(old.verdicts)
    expect(old.kairos.markdown).toBe('## Portrait\n\nP.') // l'original n'est pas modifié
    expect(old.poleReports[1].markdown).toBe('## Pôle\n\nPp.')
    expect(withoutRestatements(lean)).toBe(lean) // rien à alléger : le même objet
    const doc = { kind: 'competency-map-master', days: [{ date: '2025-12-22', variants: [{ id: 'v1', verdicts: [] }] }], details: { '2025-12-22': { variants: { v1: old } } } }
    expect(importArchive(doc).variants[0].detail.kairos.markdown).toBeNull()
  })
})
