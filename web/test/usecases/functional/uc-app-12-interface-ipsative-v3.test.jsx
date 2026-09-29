// UC-APP-12 — Explorer sa cartographie dans l'interface ipsative V3 : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-12-interface-ipsative-v3.md
//
// L'apprenant ouvre #/cartographie dans l'application ENTIÈRE (<App/>), puis
// travaille sur SES données : import de fichiers (JSON journaliers, ZIP
// journalier ou corpus, master V3, instantané employeur), vues par persona,
// grille de tuiles, comparaison avec soi-même, droit de réponse, éditeur JSON,
// constructeur de partage et réimport. Réseau simulé : seules les données
// statiques de la démonstration (fixtures versionnées) ; le téléchargement
// final est intercepté (download-json simulé). Rien ne quitte le navigateur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Component } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { clearReferentielCache } from '../../../src/data/referentiel.js'
import { downloadJson } from '../../../src/lib/download-json.js'
import { normalizeReferential } from '../../../src/v3/core/referentiel.js'
import { importJourDocuments } from '../../../src/v3/core/import.js'
import { contentDigest } from '../../../src/v3/core/canonical-json.js'
import {
  addLearnerSummary,
  applyScopeInclusion,
  buildShareSnapshot,
  newShareProject,
  planScopeInclusion,
  shareFilename,
} from '../../../src/v3/core/share.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import referentielDoc from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import { browserFile, dayZipFiles, demoNetwork, FIXTURE_DAYS, storedZip } from '../support/vis.js'

vi.mock('../../../src/lib/download-json.js', () => ({ downloadJson: vi.fn(() => true) }))

/** Journée « à moi » : un document du corpus redaté, verbatims réécrits (contenu distinct). */
function myDay(source, date, tag) {
  const day = structuredClone(FIXTURE_DAYS[source])
  day.date = date
  for (const pole of day.poles) {
    for (const p of pole.passagesSaillants ?? []) {
      p.feuille = date
      p.extraitVerbatim = `${tag} — pôle ${pole.poleNum}, passage ${p.pid} : écrit de ma propre journée.`
    }
    for (const c of pole.competences ?? []) {
      for (const piece of c.pieces ?? []) {
        if (typeof piece.extraitVerbatim === 'string') piece.extraitVerbatim = `${tag} — pièce ${piece.numero} (${c.code}).`
      }
    }
  }
  return day
}

class Boundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    return this.state.error ? <p data-testid="crash">{String(this.state.error.message)}</p> : this.props.children
  }
}

async function openV3() {
  demoNetwork()
  window.location.hash = '#/cartographie'
  render(<App lib={fakeLib} fetchMeFn={async () => ({ user: { id: 1, displayName: 'Maya', roles: ['apprenant'] } })} />)
  await screen.findByRole('toolbar', { name: 'Barre de contexte' })
}

async function importFiles(...files) {
  const input = document.querySelector('.v3-root input[type="file"]')
  await act(async () => {
    fireEvent.change(input, { target: { files } })
  })
  await screen.findByRole('toolbar', { name: 'Barre de contexte' })
}

const jsonFile = (doc, name) => browserFile(JSON.stringify(doc), name)
const bar = () => screen.getByRole('toolbar', { name: 'Barre de contexte' })
const setMode = (value) => fireEvent.change(screen.getByLabelText(/Mode/), { target: { value } })
const sectors = () => document.querySelectorAll('.v3-sector:not(.v3-sector-family)')
const stat = (label) => within(screen.getByRole('region', { name: 'Indicateurs synthétiques' })).getByText(label).nextSibling.textContent
const tileLabels = () => [...document.querySelectorAll('.v3-tile-label')].map((n) => n.textContent)
const articleCodes = (portfolio) => [...portfolio.querySelectorAll('article h4')].map((h) => h.textContent.split(' ')[0])
const shareCount = () => within(screen.getByRole('region', { name: 'Préparer un partage' })).getByText(/association\(s\) autorisée\(s\)/).textContent

/** Inclut la famille COEUR (2) dans le partage, avec la confirmation groupée. */
function includeCoeur() {
  const share = within(screen.getByRole('region', { name: 'Préparer un partage' }))
  fireEvent.click(share.getByLabelText(/COEUR — Relier & Naviguer/))
  fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Confirmation d’inclusion groupée' })).getByRole('button', { name: 'Confirmer' }))
}

beforeEach(() => {
  resetApiClient()
  clearReferentielCache()
  localStorage.clear()
  vi.mocked(downloadJson).mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.location.hash = ''
  localStorage.clear()
})

describe('UC-APP-12 — l’apprenant importe ses propres fichiers', () => {
  it('UC-APP-12-F01 — nominal : deux journées JSON importées → le dossier privé est remplacé ; rapport visible en vue Expert', async () => {
    await openV3()
    expect(stat('Journées documentées')).toBe('3') // démonstration

    await importFiles(jsonFile(myDay('2026-01-05', '2026-02-10', 'A'), 'journee-10.json'), jsonFile(myDay('2026-01-07', '2026-02-11', 'B'), 'journee-11.json'))

    expect(stat('Journées documentées')).toBe('2')
    expect(screen.getByRole('gridcell', { name: '2026-02-11 : 6 compétences documentées' })).toBeDefined()
    expect(screen.queryByRole('gridcell', { name: /2026-01-05 : \d+ compétences/ })).toBeNull()
    // En « Simplifié », l'audit d'import n'est pas un panneau disponible (limite L2).
    expect(screen.queryByRole('region', { name: 'Rapport d’import' })).toBeNull()
    expect(bar().textContent).not.toContain('anomalie')
    setMode('expert')
    const report = await screen.findByRole('region', { name: 'Rapport d’import' })
    expect(within(report).getByRole('status').textContent).toMatch(/^Avertissement : \d+$/)
  })

  it('UC-APP-12-F02 — A1 + [comportement actuel, anomalie AN9] ZIP corpus de deux runs → journée concurrente « à arbitrer » (aucune contribution), choix de la variante ; badge non recalculé', async () => {
    await openV3()
    const corpus = storedZip([
      { name: 'run-A/2026-02-10.zip', data: storedZip(dayZipFiles(myDay('2026-01-05', '2026-02-10', 'A'))) },
      { name: 'run-B/2026-02-10.zip', data: storedZip(dayZipFiles(myDay('2026-01-06', '2026-02-10', 'B'))) },
      { name: 'run-A/2026-02-11.zip', data: storedZip(dayZipFiles(myDay('2026-01-07', '2026-02-11', 'C'))) },
    ])
    await importFiles(browserFile(corpus, 'corpus.zip', 'application/zip'))

    expect(within(bar()).getByRole('status').textContent).toBe('1 anomalie(s) à traiter')
    expect(stat('Journées documentées')).toBe('1') // le 10 ne contribue pas tant qu'il n'est pas arbitré
    setMode('expert')
    const arbitrage = await screen.findByRole('region', { name: 'Arbitrage des variantes' })
    expect(arbitrage.textContent).toContain('2026-02-10 — 2 variantes')
    fireEvent.click(within(arbitrage).getByLabelText('run-B'))
    expect(within(arbitrage).getByLabelText('run-B').checked).toBe(true)
    expect(stat('Journées documentées')).toBe('2')
    // C'est bien run-B (copie du 6 janvier : 1.01, 2.01, 2.06, 5.01) qui contribue, pas run-A.
    fireEvent.click(screen.getByRole('gridcell', { name: '2026-02-10 : 4 compétences documentées' }))
    const portfolio = await screen.findByRole('region', { name: 'Portfolio de la journée 2026-02-10' })
    expect(articleCodes(portfolio).sort()).toEqual(['1.01', '2.01', '2.06', '5.01'])
    // ANOMALIE AN9 — comportement ACTUEL figé : le badge est calculé sur le
    // rapport d'import figé ; il n'est pas recalculé après l'arbitrage.
    expect(within(bar()).getByRole('status').textContent).toBe('1 anomalie(s) à traiter') // attendu : plus de badge
  })

  it('UC-APP-12-F03 — A2 + [comportement actuel, anomalie AN10] master V3 déjà constitué (révision existante) chargé tel quel ; le projet de partage en cours n’est pas abandonné', async () => {
    await openV3()
    setMode('employeur')
    await screen.findByRole('region', { name: 'Préparer un partage' })
    includeCoeur()
    expect(shareCount()).toContain('10 association(s) autorisée(s)')
    const { master } = importJourDocuments(
      [{ run: 'mon-run', sourceDate: '2026-03-02', payload: myDay('2026-01-06', '2026-03-02', 'M') }],
      { referential: normalizeReferential(referentielDoc) },
    )
    await importFiles(jsonFile(master, 'mon-master.json'))

    // ANOMALIE AN10 — comportement ACTUEL figé : le projet de partage du dossier
    // PRÉCÉDENT est conservé (setProject(null) n'est appelé que pour des journées).
    expect(shareCount()).toContain('10 association(s) autorisée(s)') // attendu : 0
    expect(stat('Journées documentées')).toBe('1')
    setMode('expert')
    expect((await screen.findByRole('region', { name: 'Rapport d’import' })).textContent).toContain('Master V3 chargé (révision existante)')
  })

  it('UC-APP-12-F04 — E1 : fichier illisible ou de format inconnu → anomalies bloquantes, le dossier courant est conservé', async () => {
    await openV3()
    await importFiles(browserFile('{pas du json', 'casse.json'), jsonFile({ foo: 1 }, 'autre.json'))

    expect(within(bar()).getByRole('status').textContent).toBe('2 anomalie(s) à traiter')
    expect(stat('Journées documentées')).toBe('3') // démonstration toujours là
    setMode('expert')
    const report = await screen.findByRole('region', { name: 'Rapport d’import' })
    expect(report.textContent).toContain('fichier-invalide')
    expect(report.textContent).toContain('autre.json : format non reconnu')
  })

  it('UC-APP-12-F05 — A3/E2 + [comportement actuel, anomalie AN5] fichier d’un seul pôle → la date est DEMANDÉE ; sans réponse, quarantaine ET dossier remplacé par un master vide', async () => {
    await openV3()
    const pole = myDay('2026-01-05', '2026-03-05', 'P').poles[1]
    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce('2026-03-05').mockReturnValueOnce(null)

    await importFiles(jsonFile(pole, 'carto_P2.json'))
    expect(prompt.mock.calls[0][0]).toContain('jamais devinée depuis dateGeneration')
    expect(stat('Journées documentées')).toBe('1')

    await importFiles(jsonFile(pole, 'carto_P2.json'))
    expect(within(bar()).getByRole('status').textContent).toBe('1 anomalie(s) à traiter')
    // ANOMALIE AN5 — comportement ACTUEL figé : la journée en quarantaine
    // produit quand même un master NEUF, vide, qui remplace le dossier.
    expect(stat('Journées documentées')).toBe('0') // attendu : '1' (dossier courant conservé)
    setMode('expert')
    expect((await screen.findByRole('region', { name: 'Rapport d’import' })).textContent).toContain('date-absente')
  })

  // ANOMALIE AN1 — comportement ACTUEL figé : le nom « 2026-02-12.zip » porte la
  // date, mais sans champ « feuille » la journée est refusée.
  it('UC-APP-12-F06 — [comportement actuel, anomalie AN1] ZIP journalier daté par son NOM mais sans « feuille » → refusé', async () => {
    await openV3()
    const day = myDay('2026-01-06', '2026-02-12', 'Z')
    for (const pole of day.poles) for (const p of pole.passagesSaillants ?? []) delete p.feuille
    await importFiles(browserFile(storedZip(dayZipFiles(day)), '2026-02-12.zip', 'application/zip'))

    expect(within(bar()).getByRole('status').textContent).toBe('1 anomalie(s) à traiter')
    expect(stat('Journées documentées')).toBe('3') // attendu : la journée du 12 importée
    setMode('expert')
    expect((await screen.findByRole('region', { name: 'Rapport d’import' })).textContent).toContain('Date de la journée à saisir')
  })

  // ANOMALIE AN2 — comportement ACTUEL figé : un fichier « competency-map-master »
  // incomplet est chargé sans validation et fait tomber l'affichage (rattrapé
  // ici par une frontière d'erreur de TEST ; l'application n'en a pas).
  it('UC-APP-12-F07 — [comportement actuel, anomalie AN2] master incomplet importé → l’interface plante', async () => {
    demoNetwork()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    window.location.hash = '#/cartographie'
    render(
      <Boundary>
        <App lib={fakeLib} fetchMeFn={async () => ({ user: null })} />
      </Boundary>,
    )
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })
    const input = document.querySelector('.v3-root input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [jsonFile({ kind: 'competency-map-master' }, 'master.json')] } })
    })

    expect((await screen.findByTestId('crash')).textContent).toMatch(/Cannot read properties of undefined/)
  })
})

describe('UC-APP-12 — explorer, comparer, répondre', () => {
  it('UC-APP-12-F08 — A4 + [comportement actuel, anomalie AN13] vue « Apprenant » en tuiles ; réordonner, redimensionner, mémoriser PAR vue ; masquer puis réafficher un panneau', async () => {
    await openV3()
    setMode('apprenant')
    await waitFor(() => expect(document.querySelector('.v3-tile-grid')).not.toBeNull())
    expect(tileLabels()).toEqual(['Soleil', 'Indicateurs', 'Légende', 'Heatmap', 'Comparaison', 'Timeline', 'Portfolio'])

    fireEvent.click(screen.getByRole('button', { name: 'Reculer Soleil' }))
    expect(tileLabels().slice(0, 2)).toEqual(['Indicateurs', 'Soleil'])
    expect(JSON.parse(localStorage.getItem('humanome-v3-tiles-apprenant')).order[0]).toBe('stats')

    setMode('cartographe')
    await waitFor(() => expect(tileLabels()[0]).toBe('Arbre'))
    setMode('apprenant')
    await waitFor(() => expect(tileLabels().slice(0, 2)).toEqual(['Indicateurs', 'Soleil']))
    expect(JSON.parse(localStorage.getItem('humanome-v3-presentation')).interfaceMode).toBe('apprenant')

    // Redimensionner par le menu de taille : mémorisé dans la disposition de la vue.
    fireEvent.change(screen.getByLabelText('Taille de Soleil'), { target: { value: '2x2' } })
    expect(JSON.parse(localStorage.getItem('humanome-v3-tiles-apprenant')).sizes.sun).toEqual({ w: 2, h: 2 })

    fireEvent.click(screen.getByText('Panneaux'))
    fireEvent.click(within(document.querySelector('.v3-panels-menu')).getByLabelText('Heatmap'))
    expect(tileLabels()).not.toContain('Heatmap')
    // ANOMALIE AN13 — comportement ACTUEL figé : seules les préférences de
    // panneaux de Simplifié et Expert sont persistées ; celles de la vue
    // Apprenant ne survivront pas à un rechargement (hors vue courante).
    expect(JSON.parse(localStorage.getItem('humanome-v3-presentation')).overrides).not.toHaveProperty('apprenant')
    fireEvent.click(screen.getByRole('button', { name: 'Réafficher les panneaux' }))
    expect(tileLabels()).toContain('Heatmap')
    expect(tileLabels()).toContain('Partage') // disponible en vue Apprenant
    expect(tileLabels()).not.toContain('Éditeur JSON')
  })

  it('UC-APP-12-F09 — A5 : se comparer à soi-même — « depuis la dernière évaluation » indisponible au début, puis récit référencé', async () => {
    await openV3()
    setMode('apprenant')
    const timeline = within(await screen.findByRole('region', { name: 'Lecteur temporel' }))
    const compare = within(screen.getByRole('region', { name: 'Comparaison ipsative' }))

    fireEvent.click(timeline.getByRole('button', { name: 'Aller au début' }))
    fireEvent.click(compare.getByRole('button', { name: 'Depuis la dernière évaluation' }))
    expect(compare.getByRole('status').textContent).toContain('« depuis la dernière évaluation » est indisponible')

    fireEvent.click(timeline.getByRole('button', { name: 'Aller à la fin' }))
    fireEvent.click(compare.getByRole('button', { name: 'Depuis la dernière évaluation' }))
    const region = screen.getByRole('region', { name: 'Comparaison ipsative' })
    expect(region.textContent).toContain('Référence 2026-01-06 → état courant 2026-01-07')
    expect(region.textContent).toContain('1 nouvelle journée documentée sur la période.')
    expect(region.textContent).toContain('(4.05) est documentée pour la première fois (2026-01-07)')
    expect(region.textContent).toContain('(2.01) est observée de nouveau (2026-01-07)')
    // Le récit ne compare jamais à d'autres personnes.
    expect(region.querySelector('.v3-recit').textContent).not.toMatch(/cohorte|moyenne|autres apprenants/i)
    fireEvent.click(compare.getByRole('button', { name: 'Retirer la comparaison' }))
    expect(region.textContent).toContain('Choisissez un préréglage')
  })

  it('UC-APP-12-F10 — A6 + [comportement actuel, anomalies AN6 et AN12] droit de réponse — contester la seule preuve d’une compétence la retire du soleil et du portfolio ; note privée enregistrée', async () => {
    await openV3()
    setMode('apprenant')
    fireEvent.click(await screen.findByRole('gridcell', { name: '2026-01-05 : 4 compétences documentées' }))
    const portfolio = await screen.findByRole('region', { name: 'Portfolio de la journée 2026-01-05' })
    const article = [...portfolio.querySelectorAll('article')].find((a) => a.querySelector('h4').textContent.startsWith('3.04'))
    expect(within(article).getByLabelText('État de revue').textContent).toMatch(/^Non revue/)
    expect(sectors()).toHaveLength(10)
    expect(articleCodes(portfolio)).toContain('3.04')

    fireEvent.click(within(article).getByRole('button', { name: 'Contester' }))
    expect(sectors()).toHaveLength(9)
    expect(stat('Compétences documentées')).toBe('9')
    expect(articleCodes(portfolio)).not.toContain('3.04')
    // ANOMALIE AN6 — comportement ACTUEL figé : le lien contesté disparaît du
    // portfolio ; l'état « Contestée » n'est jamais affiché et aucune commande
    // ne permet d'y revenir (seul l'éditeur JSON Expert le peut).
    expect(portfolio.textContent).not.toContain('Contestée')

    const other = [...portfolio.querySelectorAll('article')].find((a) => a.querySelector('h4').textContent.startsWith('2.01'))
    fireEvent.click(within(other).getAllByRole('button', { name: 'Confirmer' })[0])
    expect(within(other).getAllByLabelText('État de revue')[0].textContent).toMatch(/^Confirmée/)
    fireEvent.click(within(other).getByText('Note privée, rôle et résultat'))
    fireEvent.change(within(other).getByLabelText('Note privée courte'), { target: { value: 'C’était en atelier.' } })
    // ANOMALIE AN12 — comportement ACTUEL figé : un seul état « note » est
    // partagé par tous les articles : la saisie apparaît dans l'article 5.03.
    const neighbour = [...portfolio.querySelectorAll('article')].find((a) => a.querySelector('h4').textContent.startsWith('5.03'))
    expect(within(neighbour).getByLabelText('Note privée courte').value).toBe('C’était en atelier.') // attendu : vide
    fireEvent.click(within(other).getByRole('button', { name: 'Enregistrer (privé)' }))
    setMode('expert')
    const editor = await screen.findByLabelText('Copie de travail du master (JSON)')
    const master = JSON.parse(editor.value)
    expect(master.revision.number).toBe(4) // contester, confirmer, annoter = 3 révisions
    expect(master.annotations.some((a) => a.note === 'C’était en atelier.' && a.effectiveDay === '2026-01-05')).toBe(true)
  })

  it('UC-APP-12-F11 — A7/E3 : éditeur JSON expert — un brouillon invalide est refusé, un JSON valide crée une révision', async () => {
    await openV3()
    setMode('expert')
    const editor = await screen.findByLabelText('Copie de travail du master (JSON)')
    const panel = within(screen.getByRole('region', { name: 'Éditeur JSON expert' }))
    const master = JSON.parse(editor.value)

    fireEvent.change(editor, { target: { value: '{' } })
    expect(panel.getByRole('alert').textContent).toMatch(/^JSON invalide/)
    expect(panel.getByRole('button', { name: 'Valider (nouvelle révision)' }).disabled).toBe(true)
    fireEvent.change(editor, { target: { value: JSON.stringify({ ...master, kind: 'autre' }) } })
    expect(panel.getByRole('alert').textContent).toContain('kind ≠ competency-map-master')
    fireEvent.click(panel.getByRole('button', { name: 'Abandonner le brouillon' }))
    expect(panel.queryByRole('alert')).toBeNull()

    const obs = master.observations.find((o) => o.rawCode === '3.04' && o.normalizedStatus === 'established')
    for (const link of master.evidenceLinks) if (link.observationId === obs.id) link.reviewState = 'contested'
    fireEvent.change(editor, { target: { value: JSON.stringify(master) } })
    fireEvent.click(panel.getByRole('button', { name: 'Valider (nouvelle révision)' }))
    expect(sectors()).toHaveLength(9)
    expect(JSON.parse(screen.getByLabelText('Copie de travail du master (JSON)').value).revision.summary).toBe('Édition JSON experte')
  })
})

describe('UC-APP-12 — préparer un partage employeur (liste positive)', () => {
  async function prepareFamilyShare() {
    setMode('employeur')
    const share = within(await screen.findByRole('region', { name: 'Préparer un partage' }))
    expect(share.getByText(/0 association\(s\) autorisée\(s\)/)).toBeDefined() // rien par défaut
    fireEvent.click(share.getByLabelText(/COEUR — Relier & Naviguer/))
    const confirm = within(screen.getByRole('alertdialog', { name: 'Confirmation d’inclusion groupée' }))
    expect(confirm.getByText(/ajoutera/).textContent).toContain('10 associations passage–compétence')
    fireEvent.click(confirm.getByRole('button', { name: 'Confirmer' }))
    fireEvent.click(share.getByLabelText(/Mois \(agrégé/))
    fireEvent.click(share.getByText('Ajouter une synthèse sans source (ne compte aucune journée)'))
    fireEvent.change(share.getByRole('combobox'), { target: { value: '6.07' } })
    fireEvent.change(share.getByLabelText('Synthèse déclarée (sans document source)'), { target: { value: 'J’anime le conseil de classe.' } })
    fireEvent.click(share.getByRole('button', { name: 'Ajouter la synthèse' }))
    return share
  }

  // ANOMALIE AN3 — comportement ACTUEL figé : la prévisualisation est exacte,
  // mais « Publier et exporter » reconstruit l'instantané (nouveaux
  // identifiants publics aléatoires, nouvelle date de génération) : son
  // empreinte ne peut jamais égaler celle verrouillée à la prévisualisation,
  // et la publication est TOUJOURS refusée comme « obsolète ».
  it('UC-APP-12-F12 — A8 + [comportement actuel, anomalie AN3] famille incluse, mois, synthèse → prévisualisation exacte ; la publication confirmée est refusée', async () => {
    await openV3()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const share = await prepareFamilyShare()
    expect(share.getByText(/10 association\(s\) autorisée\(s\) · précision month · prévisualisation requise/)).toBeDefined()
    expect(share.getByRole('button', { name: 'Publier et exporter le JSON employeur' }).disabled).toBe(true)

    fireEvent.click(share.getByRole('button', { name: 'Prévisualiser (vue employeur exacte)' }))
    const preview = await screen.findByRole('region', { name: 'Prévisualisation employeur' })
    expect(within(preview).getByRole('note').textContent).toContain('exactement ce que recevra l’employeur')
    expect(preview.textContent).toContain('2.01 — Intelligence Émotionnelle & Sollicitude Active')
    expect(preview.textContent).toContain('J’anime le conseil de classe.')
    expect(preview.textContent).not.toMatch(/2026-01-0[567]/) // aucune date du jour sous « mois »
    fireEvent.click(screen.getByRole('button', { name: 'Revenir à l’espace privé' }))

    const again = within(await screen.findByRole('region', { name: 'Préparer un partage' }))
    expect(again.getByText(/prévisualisation verrouillée/)).toBeDefined()
    fireEvent.click(again.getByRole('button', { name: 'Publier et exporter le JSON employeur' }))
    expect(confirm.mock.calls[0][0]).toContain('ne peut pas être révoqué')
    // Attendu : téléchargement de cartographie-competences-partage-r01.json.
    expect(again.getByRole('alert').textContent).toBe(
      'publication — La prévisualisation est obsolète : le dossier ou le projet a changé. Prévisualisez de nouveau.',
    )
    expect(downloadJson).not.toHaveBeenCalled()
  })

  it('UC-APP-12-F13 — E4 : publication sans confirmation d’irrévocabilité → refusée, rien n’est exporté', async () => {
    await openV3()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const share = await prepareFamilyShare()
    fireEvent.click(share.getByRole('button', { name: 'Prévisualiser (vue employeur exacte)' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Revenir à l’espace privé' }))
    const again = within(await screen.findByRole('region', { name: 'Préparer un partage' }))
    fireEvent.click(again.getByRole('button', { name: 'Publier et exporter le JSON employeur' }))

    expect(again.getByRole('alert').textContent).toContain('publication — Confirmation requise')
    expect(downloadJson).not.toHaveBeenCalled()
  })

  it('UC-APP-12-F14 — A9/E5 : réimporter un fichier employeur → vue en lecture seule ; fichier altéré → quarantaine', async () => {
    await openV3()
    // Le fichier qu'une publication produit (anomalie AN3 : l'IHM ne peut pas
    // l'exporter aujourd'hui) est construit par le même moteur que la
    // prévisualisation, à partir d'un dossier de l'apprenant.
    const ref = normalizeReferential(referentielDoc)
    const { master } = importJourDocuments(
      ['2026-01-05', '2026-01-06'].map((d) => ({ run: 'mon-run', sourceDate: d, payload: FIXTURE_DAYS[d] })),
      { referential: ref },
    )
    let project = newShareProject({ master, name: 'Candidature' })
    project = applyScopeInclusion(project, master, planScopeInclusion(project, master, { type: 'family', familyNum: 2 }))
    project = addLearnerSummary(project, { code: '6.07', text: 'J’anime le conseil de classe.' })
    const { snapshot } = buildShareSnapshot(master, project, { referential: ref })
    const filename = shareFilename(project)

    await importFiles(jsonFile(snapshot, filename))
    expect(bar().textContent).toContain('Cartographie partagée (lecture seule)')
    const view = screen.getByRole('region', { name: 'Cartographie partagée' })
    expect(within(view).getByRole('heading', { name: 'Forces documentées partagées' })).toBeDefined()
    expect(view.textContent).toContain('2 journées documentées')
    expect(within(view).getByRole('region', { name: 'Synthèses déclarées' }).textContent).toContain('6.07')
    expect(screen.queryByLabelText(/Mode/)).toBeNull() // aucune commande privée
    fireEvent.click(within(bar()).getByRole('button', { name: 'Fermer' }))
    expect(bar().textContent).toContain('Cartographie ipsative')

    const tampered = structuredClone(snapshot)
    tampered.passages[0].verbatim = 'Preuve inventée après coup.'
    await importFiles(jsonFile(tampered, filename))
    expect(screen.queryByRole('region', { name: 'Cartographie partagée' })).toBeNull()
    expect(within(bar()).getByRole('status').textContent).toBe('1 anomalie(s) à traiter')
    setMode('expert')
    expect((await screen.findByRole('region', { name: 'Rapport d’import' })).textContent).toContain('Erreur d’intégrité')
  })

  it('UC-APP-12-F19 — A8, RG4 : inclure une preuve depuis le portfolio, puis une famille ; décocher la famille la retire de la version partagée sans toucher au dossier', async () => {
    await openV3()
    setMode('apprenant')
    fireEvent.click(await screen.findByRole('gridcell', { name: '2026-01-05 : 4 compétences documentées' }))
    const portfolio = await screen.findByRole('region', { name: 'Portfolio de la journée 2026-01-05' })
    const article = [...portfolio.querySelectorAll('article')].find((a) => a.querySelector('h4').textContent.startsWith('3.04'))
    fireEvent.click(within(article).getByLabelText('Inclure au partage (brouillon privé)'))

    fireEvent.click(screen.getByText('Panneaux'))
    fireEvent.click(within(document.querySelector('.v3-panels-menu')).getByLabelText('Partage'))
    await screen.findByRole('region', { name: 'Préparer un partage' })
    expect(shareCount()).toContain('1 association(s) autorisée(s)')
    includeCoeur()
    expect(shareCount()).toContain('11 association(s) autorisée(s)')

    fireEvent.click(within(screen.getByRole('region', { name: 'Préparer un partage' })).getByLabelText(/COEUR — Relier & Naviguer/))
    expect(shareCount()).toContain('1 association(s) autorisée(s)')
    expect(sectors()).toHaveLength(10) // le dossier privé est intact
    expect(within(article).getByLabelText('Inclure au partage (brouillon privé)').checked).toBe(true)
  })

  it('UC-APP-12-F20 — RG5 : une synthèse qui reprend le verbatim d’un passage exclu bloque la prévisualisation (fuite-verbatim)', async () => {
    // Même corpus que la démonstration servie : passages de la famille 2 autorisés, un autre exclu.
    const ref = normalizeReferential(referentielDoc)
    const { master } = importJourDocuments(
      Object.keys(FIXTURE_DAYS).map((d) => ({ run: 'démonstration', sourceDate: d, payload: FIXTURE_DAYS[d] })),
      { referential: ref },
    )
    const base = newShareProject({ master, name: 'P' })
    const plan = planScopeInclusion(base, master, { type: 'family', familyNum: 2 })
    const allowedIds = new Set(applyScopeInclusion(base, master, plan).allowed.passageIds)
    const allowedTexts = master.passages.filter((p) => allowedIds.has(p.id)).map((p) => p.verbatim.trim())
    const leaked = master.passages
      .map((p) => ({ id: p.id, text: p.verbatim?.trim() ?? '' }))
      .find((p) => !allowedIds.has(p.id) && p.text.length >= 12 && !allowedTexts.some((a) => a.includes(p.text))).text

    await openV3()
    setMode('employeur')
    const share = within(await screen.findByRole('region', { name: 'Préparer un partage' }))
    includeCoeur()
    fireEvent.click(share.getByText('Ajouter une synthèse sans source (ne compte aucune journée)'))
    fireEvent.change(share.getByLabelText('Synthèse déclarée (sans document source)'), { target: { value: leaked } })
    fireEvent.click(share.getByRole('button', { name: 'Ajouter la synthèse' }))
    fireEvent.click(share.getByRole('button', { name: 'Prévisualiser (vue employeur exacte)' }))

    expect(share.getByRole('alert').textContent).toContain('fuite-verbatim')
    expect(screen.queryByRole('region', { name: 'Prévisualisation employeur' })).toBeNull()
    expect(share.getByRole('button', { name: 'Publier et exporter le JSON employeur' }).disabled).toBe(true)
  })
})

describe('UC-APP-12 — imports : cas limites et anomalies', () => {
  // ANOMALIE AN8 — comportement ACTUEL figé : un ZIP sans carto_Pn.json ni
  // kairos.json est ignoré SANS entrée de rapport, et le rapport (donc le
  // badge) de l'import précédent est effacé. Attendu : « schema-inconnu ».
  it('UC-APP-12-F15 — [comportement actuel, anomalie AN8] ZIP sans contenu reconnu → ignoré en silence, le rapport précédent est effacé', async () => {
    await openV3()
    await importFiles(browserFile('{pas du json', 'casse.json'))
    expect(within(bar()).getByRole('status').textContent).toBe('1 anomalie(s) à traiter')

    await importFiles(browserFile(storedZip([{ name: 'photo.txt', data: 'x' }]), 'photos.zip', 'application/zip'))
    expect(within(bar()).queryByRole('status')).toBeNull() // attendu : 1 anomalie « schema-inconnu »
    expect(stat('Journées documentées')).toBe('3') // dossier inchangé
    setMode('expert')
    expect((await screen.findByRole('region', { name: 'Rapport d’import' })).textContent).toContain('Aucune anomalie.')
  })

  // ANOMALIE AN14 — comportement ACTUEL figé : openShareSnapshot ne vérifie que
  // kind et l'empreinte (recalculable par quiconque) ; un fichier à empreinte
  // correcte mais sans observations fait planter le rendu (aucune frontière
  // d'erreur dans l'application ; rattrapé ici par une frontière de TEST).
  it('UC-APP-12-F16 — [comportement actuel, anomalie AN14] fichier employeur à empreinte valide mais mal formé → l’interface plante', async () => {
    demoNetwork()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    window.location.hash = '#/cartographie'
    render(
      <Boundary>
        <App lib={fakeLib} fetchMeFn={async () => ({ user: null })} />
      </Boundary>,
    )
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })
    const doc = { kind: 'competency-map-share', schemaVersion: '3.0.0', integrity: { algorithm: 'sha-256', contentDigest: '' } }
    doc.integrity.contentDigest = contentDigest(doc)
    const input = document.querySelector('.v3-root input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [jsonFile(doc, 'partage.json')] } })
    })

    // snapshotToViewModel parcourt snapshot.observations sans garde.
    expect((await screen.findByTestId('crash')).textContent).toBe('snapshot.observations is not iterable')
  })

  // ANOMALIE AN15 — comportement ACTUEL figé : toute journée importée en JSON
  // reçoit le run « import » ; deux runs d'une même date sont à arbitrer entre
  // deux choix portant le même libellé.
  it('UC-APP-12-F17 — [comportement actuel, anomalie AN15] deux documents-jour JSON de même date → variantes à arbitrer indiscernables (« import » ×2)', async () => {
    await openV3()
    await importFiles(
      jsonFile(myDay('2026-01-05', '2026-02-20', 'R1'), 'run-1.json'),
      jsonFile(myDay('2026-01-06', '2026-02-20', 'R2'), 'run-2.json'),
    )
    expect(within(bar()).getByRole('status').textContent).toBe('1 anomalie(s) à traiter')
    setMode('expert')
    const arbitrage = within(await screen.findByRole('region', { name: 'Arbitrage des variantes' }))
    expect(arbitrage.getAllByLabelText('import')).toHaveLength(2) // attendu : un libellé par run
  })

  it('UC-APP-12-F18 — A1 : ZIP journalier seul avec feuilles datées → date PROPOSÉE (« à confirmer »), journée importée', async () => {
    await openV3()
    await importFiles(browserFile(storedZip(dayZipFiles(myDay('2026-01-07', '2026-02-12', 'J'))), 'journee.zip', 'application/zip'))

    expect(stat('Journées documentées')).toBe('1')
    expect(screen.getByRole('gridcell', { name: '2026-02-12 : 6 compétences documentées' })).toBeDefined()
    expect(within(bar()).getByRole('status').textContent).toBe('1 anomalie(s) à traiter') // « à arbitrer » : date à confirmer
    setMode('expert')
    expect((await screen.findByRole('region', { name: 'Rapport d’import' })).textContent).toContain(
      'Date proposée depuis les feuilles (2026-02-12) — à confirmer',
    )
  })
})
