// Chaque information une fois (journal D-66) : ce qui se lit déjà au-dessus
// n'est pas redit — synthèse complète du kairos, statut et confiance d'une
// journée, motif du président, extraits des territoires denses — et les textes
// complets qui ne font que reprendre leurs rubriques ne sont pas gardés.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DayKairos } from './Narratives.jsx'
import { RunJury, VerdictFacts } from './Jury.jsx'
import { otherPassages } from './PoleReports.jsx'
import { adaptAuroraDay, hasKairosFields, hasPoleReportFields, withoutRestatements } from '../core/importers/aurora-day.js'
import { importArchive } from '../core/archive.js'
import { cartoPole, kairosDoc } from '../test/fixtures.js'

afterEach(cleanup)

const verdict = { status: 'established', rawStatus: 'présence établie', courtCircuit: false, confidence: 0.8, proofs: 1, hints: 2 }
const detail = { motif: 'Le motif.', prescription: 'La prescription.' }
const terms = () => [...document.querySelectorAll('.carto-verdict-facts dt')].map((dt) => dt.textContent)

describe('portrait kairos d’une journée', () => {
  it('ses rubriques, sans la synthèse complète qui les redit', () => {
    render(<DayKairos date="2025-12-22" kairos={{ portrait: 'Le portrait.', profileShape: 'La forme.', invitations: ['Une invitation.'], markdown: '## Portrait\n\nLe portrait.' }} />)
    expect(screen.getByText('Le portrait.')).toBeTruthy()
    expect(screen.queryByText('Synthèse complète')).toBeNull()
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
  it('le président ne redit pas le motif et la prescription déjà lus au-dessus', () => {
    const run = { jury: {}, president: { points_convergence: 'Ils convergent.', verdict_argumente: 'Le motif.', prescription: 'La prescription.' }, deliberation: {}, debate: {}, pieces: [] }
    const { rerender } = render(<RunJury run={run} />)
    expect(screen.getByText('Le motif.')).toBeTruthy()
    rerender(<RunJury run={run} shown={[detail.motif, detail.prescription]} />)
    expect(screen.getByText('Ils convergent.')).toBeTruthy()
    expect(screen.queryByText('Le motif.')).toBeNull()
    expect(screen.queryByText('La prescription.')).toBeNull()
  })
})

describe('rapport de pôle', () => {
  it('les passages saillants déjà cités dans les territoires denses ne sont pas redits', () => {
    const passages = [{ extract: 'Un passage cité.' }, { extract: 'Un  autre passage.' }, { extract: 'Le début d’un long passage cité en entier plus haut' }]
    const dense = [{ extraitVerbatim: 'Un passage cité.' }, { extraitVerbatim: 'Le début d’un long passage cité en entier plus haut, et sa suite.' }]
    expect(otherPassages(passages, dense)).toEqual([{ extract: 'Un  autre passage.' }])
    expect(otherPassages(passages, [])).toEqual(passages)
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
  it('rubriques présentes : ni synthèse complète du kairos, ni rapport complet du pôle', () => {
    const { detail: d } = day()
    expect(hasKairosFields(d.kairos)).toBe(true)
    expect(d.kairos.markdown).toBeNull()
    expect(hasPoleReportFields(d.poleReports[1])).toBe(true)
    expect(d.poleReports[1].markdown).toBeNull()
  })
  it('texte seul : gardé, c’est tout le contenu', () => {
    const { detail: d } = day({ rapportCompletMarkdown: '## Rapport\n\nSeul.' }, { syntheseCompleteMarkdown: '## Portrait\n\nSeule.' })
    expect(d.kairos.markdown).toBe('## Portrait\n\nSeule.')
    expect(d.poleReports[1].markdown).toBe('## Rapport\n\nSeul.')
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
    expect(lean.verdicts).toBe(old.verdicts)
    expect(old.kairos.markdown).toBe('## Portrait\n\nP.') // l'original n'est pas modifié
    const doc = { kind: 'competency-map-master', days: [{ date: '2025-12-22', variants: [{ id: 'v1', verdicts: [] }] }], details: { '2025-12-22': { variants: { v1: old } } } }
    expect(importArchive(doc).variants[0].detail.kairos.markdown).toBeNull()
  })
})
