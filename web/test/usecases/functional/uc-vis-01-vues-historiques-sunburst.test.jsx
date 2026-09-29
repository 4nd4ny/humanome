// UC-VIS-01 — Explorer la cartographie de démonstration : tests FONCTIONNELS
// des vues historiques rendues avec la VRAIE bibliothèque sunburst.
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-01-explorer-cartographie-demonstration.md
//
// Chaque scénario est joué sur l'application ENTIÈRE (<App/>), dans un
// navigateur de visiteur (aucune session), SANS module sunburst injecté : les
// vues chargent la bibliothèque de production (web/src/data/sunburst.js →
// web/src/lib/sunburst/index.js), contrairement à
// uc-vis-01-explorer-cartographie-demonstration.test.jsx qui injecte le faux
// module de test. Seul le réseau des fichiers statiques est simulé
// (support/vis.js) : les journées servies par ce réseau et le merge chargé
// depuis l'accueil sont les fixtures versionnées
// schemas/fixtures/cartographie-*.json. Le reste vient de données GÉNÉRÉES
// (gitignorées, UC-SYS-04) : App.jsx importe web/src/data/load.js, qui importe
// statiquement web/public/data/demo/merge.json et
// web/public/data/referentiel/respire-v7.json (produit par
// scripts/extract-referentiel.mjs) ; sans eux, l'import échoue. Les noms et
// couleurs des pôles de F21, et le total « / 61 » de F22, viennent de ce
// référentiel EMBARQUÉ (getReferentiel(), passé tel quel par App.jsx aux vues
// historiques), pas de schemas/fixtures/referentiel-respire-v7.json.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { clearDayCache } from '../../../src/data/load.js'
import { clearReferentielCache } from '../../../src/data/referentiel.js'
import mergeFixture from '../../../../schemas/fixtures/cartographie-merge-3-jours.json'
import { FIXTURE_DAYS, browserFile, demoNetwork } from '../support/vis.js'

/** Application de visiteur, bibliothèque sunburst de production (aucune injection). */
function openApp(hash) {
  window.location.hash = hash
  return render(<App fetchMeFn={async () => ({ user: null })} />)
}

function goTo(hash) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

/** Charge un document depuis l'accueil (« Charger ma cartographie (JSON) »). */
function loadFromHome(doc, name) {
  fireEvent.change(screen.getByLabelText('Charger ma cartographie (JSON)'), {
    target: { files: [browserFile(JSON.stringify(doc), name)] },
  })
}

/** Ouvre la vue chronologique sur un merge chargé localement ; renvoie le SVG du soleil. */
async function openMerge(doc = mergeFixture) {
  openApp('#/')
  loadFromHome(doc, 'ma-cartographie.json')
  await waitFor(() => expect(window.location.hash).toBe('#/merge'))
  return screen.findByRole('group', { name: 'Cartographie cumulée des compétences' })
}

/** Libellés accessibles des secteurs interactifs (pôles puis compétences, ordre du DOM), sans le disque central. */
const sectorNames = (svg) =>
  within(svg)
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label'))
    .filter((name) => name !== 'Réinitialiser la sélection')
const competenceSectors = (svg) => svg.querySelectorAll('path[data-kind="competence"]')
const profileLines = () =>
  [...document.querySelectorAll('.profile-summary .stat-line')].map((line) => [
    line.querySelector('dt').textContent,
    line.querySelector('dd').textContent,
  ])

beforeEach(() => {
  resetApiClient()
  clearDayCache()
  clearReferentielCache()
  try {
    localStorage.clear()
  } catch {
    /* stockage indisponible */
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete window.matchMedia
  window.location.hash = ''
})

describe('UC-VIS-01 — vue journée rendue par la vraie bibliothèque sunburst', () => {
  it('UC-VIS-01-F21 — A3 : #/jour/2026-01-07 → soleil réel (renvoi hachuré, bandes grises), portrait du jour, verdict, examen du pédagogue et traces retenues d’une compétence ; exclus du 6 janvier', async () => {
    demoNetwork()
    openApp('#/jour/2026-01-07')
    const svg = await screen.findByRole('group', { name: 'Cartographie de la journée du 07/01/2026' })

    // Soleil réel : 7 pôles, 7 compétences (6 présences établies + 1 renvoi), 6 × 5 bandes grises.
    expect(sectorNames(svg)).toEqual([
      'TETE — Penser & Comprendre', '1.01 — Pensée Critique & Anti-Hallucination',
      'COEUR — Relier & Naviguer', '2.01 — Intelligence Émotionnelle & Sollicitude Active',
      'MAIN — Créer & Incarner', '3.07 — Présence & Performance Live',
      'AME — Discerner & Juger', '4.05 — Décision & Tolérance à l\'Incertitude',
      'RACINES — Évoluer & Résister', '5.03 — Narration Réflexive',
      "CITE — Gouverner & S'ouvrir", '6.07 — Facilitation & Gouvernance Collective',
      'FLAMBEAU — Transmettre & Piloter', '7.01 — Maïeutique & Facilitation d\'Apprentissage',
    ])
    expect(svg.querySelectorAll('path.gray-sector')).toHaveLength(30)
    // Le renvoi au cartographe (1.01) : hachures, bordure pointillée, pas de bandes grises.
    const renvoi = svg.querySelector('path.renvoi-sector')
    expect(renvoi.getAttribute('data-id')).toBe('1.01 — Pensée Critique & Anti-Hallucination')
    expect([renvoi.getAttribute('fill'), renvoi.getAttribute('stroke-dasharray')]).toEqual(['url(#hatch)', '4,3'])
    expect(svg.querySelector('pattern#hatch')).not.toBeNull()
    expect(svg.querySelector('path.gray-sector[data-id="1.01 — Pensée Critique & Anti-Hallucination"]')).toBeNull()

    // Avant toute sélection : invitation + portrait kaïros de la journée.
    const panel = () => document.querySelector('.panel-zone .details-panel')
    const kairos = FIXTURE_DAYS['2026-01-07'].kairos.kairos.apprenant
    expect(panel().textContent).toContain('Touchez un secteur du diagramme')
    expect(panel().textContent).toContain(kairos.portrait)
    expect(panel().textContent).toContain(kairos.formeProfil)
    // Hors diagramme : seulement des court-circuits le 7 janvier.
    expect(within(screen.getByTestId('exclus')).getByText('Court-circuits (aucune pièce extraite) (8)')).toBeDefined()
    expect(screen.queryByTestId('exclus-non-etablies')).toBeNull()

    // Toucher 2.01 : verdict, examen adversarial du pédagogue, traces retenues.
    fireEvent.click(within(svg).getByRole('button', { name: '2.01 — Intelligence Émotionnelle & Sollicitude Active' }))
    expect(screen.getByRole('heading', { level: 2, name: '2.01 — Intelligence Émotionnelle & Sollicitude Active' })).toBeDefined()
    const comp = FIXTURE_DAYS['2026-01-07'].poles[1].competences[0]
    const verdict = screen.getByTestId('verdict-block')
    expect(verdict.querySelector('.verdict-badge').className).toBe('verdict-badge etablie')
    expect(verdict.querySelector('.verdict-stats').textContent).toBe('Confiance 78 % · 2 preuves · 1 indice')
    expect(verdict.textContent).toContain(`Motif — ${comp.verdict.motif}`)
    expect(verdict.textContent).toContain(`Prescription — ${comp.verdict.prescription}`)

    const pedagogue = screen.getByTestId('pedagogue')
    expect(within(pedagogue).getByRole('heading', { level: 3 }).textContent).toBe('Examen adversarial du pédagogue')
    const blocks = [...pedagogue.querySelectorAll('details.pedagogue-block')]
    expect(blocks.map((b) => b.querySelector('summary').textContent)).toEqual([
      'Présomption d’absence', 'Présomption de sycophantie', 'Conclusion adversariale',
    ])
    expect(blocks[0].textContent).toContain(comp.pedagogue.presomptionAbsence.raisonnement)
    expect(blocks[1].textContent).toContain(comp.pedagogue.presomptionSycophantie.raisonnement)
    expect(blocks[2].textContent).toContain(comp.pedagogue.conclusionAdversariale.raisonnement)
    // Seule la conclusion porte une confiance finale.
    expect(blocks.map((b) => b.textContent.includes('Confiance finale : 78 %'))).toEqual([false, false, true])

    const traces = screen.getByTestId('traces')
    expect(within(traces).getByRole('heading', { level: 3 }).textContent).toBe('Traces retenues')
    expect([...traces.querySelectorAll('li')].map((li) => li.textContent)).toEqual(
      comp.tracesRetenues.map((t) => {
        const piece = comp.pieces.find((p) => p.numero === t.pieceId)
        return `Pièce ${t.pieceId} — ${t.type} (${t.role}) · ${piece.contexte}`
      }),
    )
    // La sélection atténue les autres secteurs interactifs, pas le secteur choisi.
    const selected = within(svg).getByRole('button', { name: '2.01 — Intelligence Émotionnelle & Sollicitude Active' })
    expect(selected.getAttribute('class')).toBe('sector')
    expect(renvoi.getAttribute('class')).toBe('renvoi-sector dimmed')
    expect(renvoi.style.opacity).toBe('0.25')

    // Le renvoi : badge « renvoi au cartographe », confiance et pièces du jour.
    fireEvent.click(renvoi)
    expect(screen.getByTestId('verdict-block').querySelector('.verdict-badge').className).toBe('verdict-badge renvoi')
    expect(screen.getByTestId('verdict-block').querySelector('.verdict-stats').textContent).toBe('Confiance 45 % · 0 preuve · 1 indice')

    // Le disque central réinitialise la sélection.
    fireEvent.click(within(svg).getByRole('button', { name: 'Réinitialiser la sélection' }))
    expect(screen.queryByTestId('verdict-block')).toBeNull()
    expect(panel().textContent).toContain('Touchez un secteur du diagramme')

    // 6 janvier : une « présence non établie » (sans court-circuit) listée avec son motif.
    goTo('#/jour/2026-01-06')
    await screen.findByRole('group', { name: 'Cartographie de la journée du 06/01/2026' })
    const nonEtablies = screen.getByTestId('exclus-non-etablies')
    expect(nonEtablies.querySelector('summary').textContent).toBe('Présences non établies (1)')
    const motif406 = FIXTURE_DAYS['2026-01-06'].poles[3].competences[1].verdict.motif
    expect(nonEtablies.querySelector('li').textContent).toBe(`4.06 — Responsabilité, Courage & Intégrité · ${motif406}`)
    expect(screen.getByTestId('exclus-court-circuits').querySelector('summary').textContent).toBe('Court-circuits (aucune pièce extraite) (9)')
  })
})

describe('UC-VIS-01 — vue chronologique d’un merge chargé localement, vraie bibliothèque sunburst', () => {
  // Les libellés « 1 compétences dans ce pôle » et « 1 points » FIGENT un
  // comportement ACTUEL (anomalie AN5 de la fiche : MergeView n'accorde ni
  // « compétence » ni « point » au singulier). À corriger en « 1 compétence » /
  // « 1 point » quand l'accord sera fait.
  it('UC-VIS-01-F22 — A7 : merge 3 jours → résumé du profil (établies, renvoi, émergentes, score) ; secteur compétence puis pôle → panneau de détails ; à la première feuille, le détail est celui de la trame [comportement actuel, AN5 : « 1 compétences », « 1 points »]', async () => {
    demoNetwork()
    const svg = await openMerge()

    // Soleil réel de la dernière trame : 7 pôles, 10 compétences établies, 10 × 5 bandes grises.
    const names = sectorNames(svg)
    expect(names.filter((n) => !/^\d\.\d{2} /.test(n))).toEqual(mergeFixture.domains.map((d) => d.id))
    expect(competenceSectors(svg)).toHaveLength(10)
    expect(svg.querySelectorAll('path.gray-sector')).toHaveLength(50)

    // Aucun secteur choisi : résumé du profil (profilMeta), sans pondération temporelle (absente du document).
    expect(profileLines()).toEqual([
      ['Compétences établies', '10 / 61'],
      ['En renvoi (entretien)', '2'],
      ['Compétences émergentes', '1'],
      ['Score total', '23'],
    ])

    // Secteur d'une compétence : titre, description, niveau nommé, points, archétype, retour narratif assaini.
    const c201 = mergeFixture.domains[1].competences[0]
    fireEvent.click(within(svg).getByRole('button', { name: c201.id }))
    expect(screen.getByRole('heading', { level: 2, name: c201.id }).style.color).toBe('rgb(16, 185, 129)') // #10b981
    expect(document.querySelector('.details-description').textContent).toBe(c201.description)
    expect(document.querySelector('.details-meta').textContent).toBe('Niveau 5 — Excellence · 3 points')
    expect(document.querySelector('.details-archetype').textContent).toBe(`${c201.archetype_titre} — ${c201.archetype_description}`)
    expect(screen.getByTestId('narrative-html').textContent).toContain('Établie les trois jours avec une confiance croissante')
    expect(document.querySelector('.profile-summary')).toBeNull()
    expect(document.querySelector('.view-layout').getAttribute('data-tab')).toBe('details')

    // Secteur d'un pôle : décompte, rapport évolutif, tendance temporelle.
    const coeur = mergeFixture.domains[1]
    fireEvent.click(within(svg).getByRole('button', { name: coeur.id }))
    expect(screen.getByRole('heading', { level: 2, name: coeur.id })).toBeDefined()
    expect(document.querySelector('.details-description').textContent).toBe(
      '2 compétences dans ce pôle — 2 établies. Sélectionnez une compétence pour le détail.',
    )
    expect(document.querySelector('.details-archetype').textContent).toBe(`${coeur.tendance_titre} — ${coeur.tendance_description}`)
    expect(screen.getByTestId('narrative-html').querySelector('h3').textContent).toBe('Rapport évolutif du pôle 2 — COEUR — Relier & Naviguer')
    // Pôle à une seule compétence : « compétences » non accordé (comportement actuel, AN5).
    fireEvent.click(within(svg).getByRole('button', { name: mergeFixture.domains[0].id }))
    expect(document.querySelector('.details-description').textContent).toBe(
      '1 compétences dans ce pôle — 1 établie. Sélectionnez une compétence pour le détail.',
    )

    // Disque central : retour au résumé du profil.
    fireEvent.click(within(svg).getByRole('button', { name: 'Réinitialiser la sélection' }))
    expect(profileLines()).toHaveLength(4)

    // Première feuille (5 janvier) : 4 compétences sur la carte ; le détail de 2.01 est celui de la trame.
    fireEvent.click(screen.getByRole('button', { name: 'Première feuille' }))
    expect(competenceSectors(svg)).toHaveLength(4)
    fireEvent.click(within(svg).getByRole('button', { name: c201.id }))
    // « 1 points » : comportement actuel (AN5).
    expect(document.querySelector('.details-meta').textContent).toBe('Niveau 4 — Expertise · 1 points')

    // Un merge qui déclare une pondération temporelle l'affiche en « -X %/an ».
    goTo('#/')
    const weighted = structuredClone(mergeFixture)
    weighted.profilMeta.ponderation_temporelle = { decote_annuelle: 0.15 }
    loadFromHome(weighted, 'pondere.json')
    await waitFor(() => expect(window.location.hash).toBe('#/merge'))
    await screen.findByRole('group', { name: 'Cartographie cumulée des compétences' })
    await waitFor(() => expect(profileLines()).toHaveLength(5))
    expect(profileLines().at(-1)).toEqual(['Pondération temporelle', '-15 %/an'])
  })

  it('UC-VIS-01-F23 — A7 : lecteur de construction (faux minuteurs) — lecture « Rapide » feuille par feuille, le soleil réel et le calendrier se construisent (4 → 7 → 10 compétences), arrêt à la dernière feuille ; toucher un secteur met la lecture en pause', async () => {
    demoNetwork()
    const svg = await openMerge()
    const player = within(screen.getByRole('group', { name: 'Timeline de construction de la cartographie' }))
    const futureDays = () => document.querySelectorAll('rect[data-future="true"]').length

    fireEvent.click(player.getByRole('button', { name: 'Première feuille' }))
    expect(competenceSectors(svg)).toHaveLength(4)
    expect(sectorNames(svg).filter((n) => !/^\d\.\d{2} /.test(n))).toEqual([
      'COEUR — Relier & Naviguer', 'MAIN — Créer & Incarner', 'RACINES — Évoluer & Résister', 'FLAMBEAU — Transmettre & Piloter',
    ])
    expect(futureDays()).toBe(2)

    vi.useFakeTimers()
    fireEvent.change(player.getByRole('combobox', { name: 'Vitesse de lecture' }), { target: { value: '150' } })
    fireEvent.click(player.getByRole('button', { name: 'Lancer la lecture' }))
    act(() => vi.advanceTimersByTime(149))
    expect(competenceSectors(svg)).toHaveLength(4)
    act(() => vi.advanceTimersByTime(1))
    expect(player.getByText('Feuille 2 / 3 — 06/01/2026')).toBeDefined()
    expect(competenceSectors(svg)).toHaveLength(7)
    expect(player.getByTestId('timeline-counter').textContent).toBe('7 compétences sur la carte · score du jour 6')
    expect(futureDays()).toBe(1)
    act(() => vi.advanceTimersByTime(150))
    expect(player.getByText('Feuille 3 / 3 — 07/01/2026')).toBeDefined()
    expect(competenceSectors(svg)).toHaveLength(10)
    expect(futureDays()).toBe(0)
    // Fin : la lecture s'arrête et l'annonce, plus aucun changement.
    expect(player.getByRole('button', { name: 'Lancer la lecture' }).getAttribute('aria-pressed')).toBe('false')
    expect(player.getByRole('status').textContent).toBe('Fin de la lecture : 07/01/2026 — 10 compétences sur la carte')
    act(() => vi.advanceTimersByTime(3000))
    expect(player.getByText('Feuille 3 / 3 — 07/01/2026')).toBeDefined()

    // Relancer depuis la fin repart de la première feuille ; toucher un secteur met en pause.
    fireEvent.click(player.getByRole('button', { name: 'Lancer la lecture' }))
    expect(competenceSectors(svg)).toHaveLength(4)
    expect(player.getByRole('button', { name: 'Mettre la lecture en pause' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(svg).getByRole('button', { name: mergeFixture.domains[1].competences[0].id }))
    expect(player.getByRole('button', { name: 'Lancer la lecture' }).getAttribute('aria-pressed')).toBe('false')
    act(() => vi.advanceTimersByTime(3000))
    expect(player.getByText('Feuille 1 / 3 — 05/01/2026')).toBeDefined()
    // Tant qu'un secteur est choisi, « Lancer la lecture » est sans effet.
    fireEvent.click(player.getByRole('button', { name: 'Lancer la lecture' }))
    act(() => vi.advanceTimersByTime(3000))
    expect(player.getByText('Feuille 1 / 3 — 05/01/2026')).toBeDefined()
  })

  it('UC-VIS-01-F24 — A7 : préférence système « mouvement réduit » → lecture automatique désactivée et expliquée, construction pas à pas toujours possible', async () => {
    demoNetwork()
    window.matchMedia = vi.fn((query) => ({
      media: query,
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const svg = await openMerge()
    const player = within(screen.getByRole('group', { name: 'Timeline de construction de la cartographie' }))
    const play = player.getByRole('button', { name: 'Lancer la lecture' })
    expect(play.disabled).toBe(true)
    expect(play.getAttribute('title')).toBe('Lecture automatique désactivée (préférence système : mouvement réduit)')

    fireEvent.click(player.getByRole('button', { name: 'Première feuille' }))
    expect(competenceSectors(svg)).toHaveLength(4)
    // Faux minuteurs (comme F23) : un clic sur le bouton inactif ne lance rien,
    // même bien au-delà d'un tick « Normale » (400 ms).
    vi.useFakeTimers()
    fireEvent.click(play)
    act(() => vi.advanceTimersByTime(1000))
    expect(player.getByText('Feuille 1 / 3 — 05/01/2026')).toBeDefined()
    expect(play.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(player.getByRole('button', { name: 'Feuille suivante' }))
    expect(competenceSectors(svg)).toHaveLength(7)
    fireEvent.change(player.getByRole('slider'), { target: { value: '2' } })
    expect(competenceSectors(svg)).toHaveLength(10)
  })
})
