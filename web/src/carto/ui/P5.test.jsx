// Interface ultime — P5 : exports JSON / HTML autonome / rapport imprimable et
// « Préparer une démo » (spec §11). Critères d'acceptation (§14) : la démo
// anonymisée garde ses surlignages ; le HTML s'ouvre en file:// (vérifié en
// navigateur réel par e2e/carto-export.e2e.js ; ici, le contenu du fichier).
import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CartoApp from './CartoApp.jsx'
import { ViewerApp } from '../viewer/ViewerApp.jsx'
import { readEmbeddedArchive } from '../viewer/embedded.js'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { importFiles } from '../core/import.js'
import { buildArchive, looksLikeArchive } from '../core/archive.js'
import { DATA_SLOT } from '../core/standalone.js'
import { createDataset, observationKey } from '../core/model.js'
import { addReflection, setPreferences, setReflectionVersed, setReview } from '../core/ops.js'
import { parseHash, subscribe } from '../../router.js'
import { LOU_PORTFOLIO, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'
import { showCartoTiles } from '../test/tiles.js'

const NOW = '2026-10-13T12:00:00.000Z'
const TEMPLATE = `<!doctype html><html><head><title>copie</title></head><body><div id="root"></div>${DATA_SLOT}<script>/* moteur */</script></body></html>`

function louFiles() {
  const files = [{ path: 'Lou-Martin/journal.md', text: LOU_PORTFOLIO }]
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `Lou-Martin/${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `Lou-Martin/${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  return files
}

async function louStore({ mutate } = {}) {
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  const res = await importFiles(louFiles(), createDataset({ datasetId: 'ds-lou', title: 'Lou Martin', referential: miniReferential(), now: NOW }), { now: NOW })
  if (mutate) res.dataset = mutate(res.dataset)
  await store.commit(res)
  return store
}

const templateFetch = (template = TEMPLATE) =>
  vi.fn(async (url) => (url === 'carto/viewer-template.html' && template ? { ok: true, status: 200, text: async () => template } : { ok: false, status: 404, text: async () => '' }))

function Harness({ store, fetchFn }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => subscribe(setRoute), [])
  return <CartoApp route={route} deps={{ store, fetchFn, loadReferential: async () => ({ doc: miniReferential() }) }} />
}

async function openExport(store, fetchFn = templateFetch()) {
  window.location.hash = '#/cartographie/export'
  render(<Harness store={store} fetchFn={fetchFn} />)
  return screen.findByRole('region', { name: 'Exporter' })
}

// Téléchargements : les Blob passés à URL.createObjectURL et les noms des liens cliqués.
let downloads
beforeEach(() => {
  downloads = []
  URL.createObjectURL = vi.fn((blob) => {
    downloads.push({ blob })
    return `blob:test/${downloads.length}`
  })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    const d = downloads.find((x) => `blob:test/${downloads.indexOf(x) + 1}` === this.href)
    if (d) d.name = this.download
  })
  window.print = vi.fn()
  try {
    localStorage.clear()
  } catch {
    /* rien */
  }
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.body.className = ''
})

const readBlob = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsText(blob)
  })
const lastDownload = async () => {
  await waitFor(() => expect(downloads.at(-1)?.name).toBeTruthy())
  const d = downloads.at(-1)
  return { name: d.name, text: await readBlob(d.blob), type: d.blob.type }
}

describe('P5 — archive JSON', () => {
  it('télécharge le master complet, réimportable ; sans le portfolio sur demande', async () => {
    const store = await louStore({ mutate: (ds) => setReview(ds, observationKey('2025-12-23', ds.days[1].activeVariantId, '2.01'), 'nuanced', 'Pas seulement écouter.', { now: NOW }) })
    const page = await openExport(store)
    expect(within(page).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Archive complète (JSON)',
      'Copie autonome (HTML)',
      'Portfolio (Markdown)',
      'Rapport imprimable (PDF)',
      'Préparer une démo',
    ])
    fireEvent.click(within(page).getByRole('button', { name: 'Télécharger l’archive' }))
    let file = await lastDownload()
    expect(file.name).toMatch(/^cartographie-archive-\d{4}-\d{2}-\d{2}\.json$/)
    let archive = JSON.parse(file.text)
    expect(looksLikeArchive(archive)).toBe(true)
    expect(archive.includesPortfolio).toBe(true)
    expect(archive.details['2025-12-23'].portfolio.text).toMatch(/J’ai écouté Sam/)
    expect(Object.values(archive.reviews)[0]).toMatchObject({ state: 'nuanced', note: 'Pas seulement écouter.' })
    expect((await within(page).findByRole('status')).textContent).toMatch(/cartographie-archive-.*téléchargé/)

    // Réimport dans un jeu vide : mêmes journées, même réponse.
    const back = await importFiles([{ path: file.name, text: file.text }], createDataset({ datasetId: 'ds-new', title: 'Nouveau', referential: miniReferential(), now: NOW }), { now: NOW })
    expect(back.dataset.days.map((d) => d.date)).toEqual(['2025-12-22', '2025-12-23', '2025-12-24'])
    expect(back.dataset.reviews).toEqual(archive.reviews)

    fireEvent.click(within(page).getByRole('checkbox', { name: 'inclure le texte du portfolio (et le carnet du dialogue)' }))
    expect(within(page).getByText(/Sans le texte, le surlignage des passages sera indisponible/)).toBeTruthy()
    fireEvent.click(within(page).getByRole('button', { name: 'Télécharger l’archive' }))
    await waitFor(() => expect(downloads).toHaveLength(2))
    file = await lastDownload()
    archive = JSON.parse(file.text)
    expect(archive.includesPortfolio).toBe(false)
    expect(file.text).not.toMatch(/Ce matin j’ai relu mes notes/)
  })
})

describe('P5 — copie autonome HTML', () => {
  it('un seul fichier : le modèle et l’archive embarquée ; portfolio seulement sur demande, avec avertissement ; du carnet, les seuls dialogues versés au portfolio', async () => {
    const fetchFn = templateFetch()
    const withNotebook = (ds) => {
      let out = addReflection(ds, { entries: [{ threadId: 't', kind: 'silence', question: 'Que s’est-il passé ?', answer: 'Une réponse intime.' }] }, { now: NOW })
      out = addReflection(out, { entries: [{ threadId: 'u', kind: 'apparition', question: 'Et ensuite ?', answer: 'Une réponse versée.' }] }, { now: '2026-10-13T13:00:00.000Z' })
      return setReflectionVersed(out, out.reflections[1].id, true, { now: NOW })
    }
    const page = await openExport(await louStore({ mutate: withNotebook }), fetchFn)
    fireEvent.click(within(page).getByRole('button', { name: 'Télécharger la copie' }))
    let file = await lastDownload()
    expect(file.name).toMatch(/^cartographie-copie-\d{4}-\d{2}-\d{2}\.html$/)
    expect(file.type).toBe('text/html')
    let archive = readEmbeddedArchive(new DOMParser().parseFromString(file.text, 'text/html'))
    expect(archive.includesPortfolio).toBe(false)
    expect(archive.days).toHaveLength(3)
    expect(archive.reflections).toEqual([]) // sans le portfolio, aucun dialogue
    expect(fetchFn).toHaveBeenCalledWith('carto/viewer-template.html')

    const box = within(page).getByRole('checkbox', { name: /inclure le portfolio/ })
    expect(within(page).queryByText(/contiendra le texte intégral/)).toBeNull()
    fireEvent.click(box)
    expect((within(page).getByRole('note')).textContent).toMatch('Le fichier contiendra le texte intégral de votre portfolio, avec les dialogues que vous y avez versés')
    fireEvent.click(within(page).getByRole('button', { name: 'Télécharger la copie' }))
    await waitFor(() => expect(downloads).toHaveLength(2))
    file = await lastDownload()
    archive = readEmbeddedArchive(new DOMParser().parseFromString(file.text, 'text/html'))
    expect(archive.includesPortfolio).toBe(true)
    expect(archive.details['2025-12-22'].portfolio.text).toMatch(/Ce matin j’ai relu mes notes/)
    // Une copie autonome se donne : du carnet, seuls les dialogues versés au portfolio y entrent, avec lui.
    expect(archive.reflections.map((r) => r.entries[0].answer)).toEqual(['Une réponse versée.'])
    expect(file.text).not.toContain('Une réponse intime')
  })

  it('modèle absent : un message dit quoi faire, rien n’est téléchargé', async () => {
    const page = await openExport(await louStore(), templateFetch(null))
    fireEvent.click(within(page).getByRole('button', { name: 'Télécharger la copie' }))
    expect((await within(page).findByRole('alert')).textContent).toMatch(/copie autonome n’a pas pu être produite/)
    expect(downloads).toHaveLength(0)
  })
})

describe('P5 — portfolio en Markdown (question 20)', () => {
  it('le texte de chaque journée et les dialogues versés, chacun à sa journée ; rien à exporter : bouton désactivé', async () => {
    const versedOne = (ds) => {
      const out = addReflection(ds, { entries: [{ threadId: 't', kind: 'silence', question: 'Que s’est-il passé ?', answer: 'Une pause voulue.' }] }, { now: NOW })
      return setReflectionVersed(addReflection(out, { entries: [{ threadId: 'u', kind: 'silence', question: 'Et là ?', answer: 'Une réponse gardée pour moi.' }] }, { now: NOW }), out.reflections[0].id, true, { now: NOW })
    }
    const page = await openExport(await louStore({ mutate: versedOne }))
    expect(within(page).getByText('1 dialogue versé au portfolio.')).toBeTruthy()
    fireEvent.click(within(page).getByRole('button', { name: 'Télécharger le portfolio (.md)' }))
    const file = await lastDownload()
    expect(file.name).toMatch(/^cartographie-portfolio-\d{4}-\d{2}-\d{2}\.md$/)
    expect(file.type).toBe('text/markdown')
    expect(file.text).toContain('Ce matin j’ai relu mes notes avant d’écrire.')
    expect(file.text).toContain('### Dialogue d’accompagnement du 13 octobre 2026')
    expect(file.text).toContain('**Réponse.** Une pause voulue.')
    expect(file.text).not.toContain('Une réponse gardée pour moi.')
    expect((await within(page).findByRole('status')).textContent).toMatch(/cartographie-portfolio-.*téléchargé : 4 journées, 1 dialogue versé\./)
    cleanup()

    const empty = createCartoStore({ adapter: createMemoryAdapter() })
    await empty.commit(
      await importFiles(
        [{ path: '2025-12-22/carto_P1.json', text: JSON.stringify(louDays()['2025-12-22'][0]) }],
        createDataset({ datasetId: 'ds-sans', title: 'Sans portfolio', referential: miniReferential(), now: NOW }),
        { now: NOW },
      ),
    )
    const bare = await openExport(empty)
    expect(within(bare).getByRole('button', { name: 'Télécharger le portfolio (.md)' }).disabled).toBe(true)
    expect(within(bare).getByText('Rien à exporter : importez votre portfolio, ou versez-y un dialogue.')).toBeTruthy()
  })
})

describe('P5 — rapport imprimable', () => {
  it('aperçu : pseudonyme, soleil, profil, réflexions choisies dépliées avec extraits ; seule la feuille s’imprime', async () => {
    const page = await openExport(await louStore())
    const opener = within(page).getByRole('button', { name: 'Aperçu avant impression' })
    expect((within(page).getByRole('checkbox', { name: /page de comparaison A \/ B/ })).disabled).toBe(true)
    fireEvent.change(within(page).getByLabelText('Pseudonyme en première page'), { target: { value: 'Camille' } })
    fireEvent.click(within(page).getByRole('checkbox', { name: /2\.01 Écoute/ }))
    opener.focus()
    fireEvent.click(opener)

    const dialog = await screen.findByRole('dialog', { name: 'Aperçu du rapport imprimable' })
    expect((document.body).classList.contains('carto-print-open')).toBe(true)
    expect(dialog.closest('.carto-print-portal')?.parentElement).toBe(document.body)
    expect((within(dialog).getByRole('heading', { level: 1 })).textContent).toMatch('Camille')
    expect(within(dialog).getByRole('group', { name: /^Soleil : 4 compétences observées dans 3 journées/ })).toBeTruthy()
    expect((within(dialog).getByRole('table', { name: /Compétences observées/ })).textContent).toMatch('2.01 Écoute')
    expect(within(dialog).getByRole('heading', { name: 'Précautions de lecture' })).toBeTruthy()
    const comp = within(dialog).getByRole('article', { name: '2.01 Écoute' })
    await within(comp).findByText(/J’ai écouté Sam expliquer son idée/)
    expect(within(comp).getByRole('heading', { name: /23 décembre 2025 — présence établie/ })).toBeTruthy()
    // Pas de réponse de la personne sans son accord.
    expect(within(dialog).queryByText(/Réponse de la personne/)).toBeNull()
    // Tout est déplié.
    expect([...dialog.querySelectorAll('details')].every((d) => d.open)).toBe(true)

    const print = within(dialog).getByRole('button', { name: 'Imprimer ou enregistrer en PDF' })
    await waitFor(() => expect((print).disabled).toBe(false))
    fireEvent.click(print)
    expect(window.print).toHaveBeenCalledTimes(1)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer l’aperçu' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect((document.body).classList.contains('carto-print-open')).toBe(false)
    expect(document.activeElement).toBe(opener)
  })

  it('page de comparaison quand une comparaison est définie ; Échap ferme l’aperçu', async () => {
    const store = await louStore({
      mutate: (ds) =>
        setPreferences(ds, {
          compare: { a: { name: 'Avant', def: { kind: 'period', from: '2025-12-22', to: '2025-12-22' } }, b: { name: 'Après', def: { kind: 'period', from: '2025-12-23', to: '2025-12-24' } }, view: 'suns' },
        }),
    })
    const page = await openExport(store)
    const box = within(page).getByRole('checkbox', { name: /page de comparaison A \/ B/ })
    expect((box).disabled).toBe(false)
    fireEvent.click(box)
    fireEvent.click(within(page).getByRole('button', { name: 'Aperçu avant impression' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aperçu du rapport imprimable' })
    const cmp = within(dialog).getByRole('heading', { name: 'Comparaison de soi à soi' }).closest('section')
    expect((cmp).textContent).toMatch('« Avant »')
    expect((cmp).textContent).toMatch('« Après »')
    expect(within(cmp).getByRole('heading', { name: 'Précautions de lecture' })).toBeTruthy()
    expect(cmp.textContent).not.toMatch(/meilleur(?!e? »)|progrès|recul/)
    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('P5 — préparer une démo (critère : la démo anonymisée garde ses surlignages)', () => {
  it('propositions, dictionnaire, tiers, aperçu vérifié, relecture, puis téléchargement sans aucun nom', async () => {
    const page = await openExport(await louStore())
    fireEvent.click(within(page).getByRole('button', { name: 'Ouvrir l’outil d’anonymisation' }))
    const tool = await screen.findByRole('region', { name: 'Préparer une démo anonymisée' })
    const sam = await within(tool).findByRole('checkbox', { name: /^Sam \(2\)/ })
    fireEvent.click(sam)
    expect((within(tool).getByRole('textbox', { name: 'Remplacement de Sam' })).value).toBe('Personne A')
    // Ajout manuel : Noé (une seule occurrence, donc pas proposé), Lou et Martin (noms de fichier et titre).
    for (const name of ['Noé', 'Lou', 'Martin']) {
      fireEvent.change(within(tool).getByRole('textbox', { name: 'Nom' }), { target: { value: name } })
      fireEvent.click(within(tool).getByRole('button', { name: 'Ajouter au dictionnaire' }))
    }
    expect((within(tool).getByRole('textbox', { name: 'Remplacement de Noé' })).value).toBe('Personne B')
    // Personnes tierces : les phrases qui citent un nom du dictionnaire sont signalées pour relecture
    // (dont le titre « Journal de Lou » : l'outil ne sait pas quel nom est celui de la personne).
    expect(within(tool).getByText(/3 phrases du portfolio citent une personne du dictionnaire/)).toBeTruthy()
    const flagged = [...tool.querySelectorAll('.carto-demo-third .carto-demo-sentence')].map((x) => x.textContent)
    expect(flagged).toEqual(expect.arrayContaining([expect.stringMatching(/^Ensuite nous avons construit .* avec Sam et Noé\.$/), expect.stringMatching(/^J’ai écouté Sam/)]))
    expect(within(tool).getAllByRole('checkbox', { name: 'retirer ce passage' })).toHaveLength(3)

    fireEvent.click(within(tool).getByRole('button', { name: 'Préparer l’aperçu' }))
    const report = await within(tool).findByText(/Tous les surlignages tiennent/)
    const download = within(tool).getByRole('button', { name: 'Télécharger la démo (.json)' })
    expect((report).textContent).toMatch(/Surlignage : (\d+) passages retrouvés avant l’anonymisation, \1 après ; \1 au même endroit/)
    expect((within(tool).getByRole('table', { name: 'Remplacements' })).textContent).toMatch('Sam → Personne A')
    // Relecture : le texte anonymisé, remplacements mis en évidence.
    const text = within(tool).getByLabelText(/^Texte anonymisé du/)
    expect(text.querySelector('mark')).not.toBeNull()
    expect(text.textContent).not.toMatch(/Sam|Noé/)
    expect((download).disabled).toBe(true)
    fireEvent.click(within(tool).getByRole('checkbox', { name: /J’ai relu l’aperçu/ }))
    expect((download).disabled).toBe(false)
    fireEvent.click(download)
    const file = await lastDownload()
    expect(file.name).toMatch(/^cartographie-demo-\d{4}-\d{2}-\d{2}\.json$/)
    expect(file.text).not.toMatch(/\bSam\b|Noé|\bLou\b|Martin|correspondance|dictionary/u)
    const demo = JSON.parse(file.text)
    expect(demo.title).toBe('Démonstration')
    expect(demo.details['2025-12-23'].portfolio.text).toMatch(/J’ai écouté Personne A expliquer/)

    // Un réglage change : l'aperçu n'est plus à jour, les téléchargements se ferment.
    fireEvent.change(within(tool).getByRole('textbox', { name: 'Remplacement de Sam' }), { target: { value: 'Alex' } })
    expect(within(tool).getByText(/Les réglages ont changé depuis l’aperçu/)).toBeTruthy()
    expect((download).disabled).toBe(true)
  })

  it('retirer un passage de tiers : il part partout et le rapport le dit ; la démo s’ouvre dans ce navigateur', async () => {
    const store = await louStore()
    const page = await openExport(store)
    fireEvent.click(within(page).getByRole('button', { name: 'Ouvrir l’outil d’anonymisation' }))
    const tool = await screen.findByRole('region', { name: 'Préparer une démo anonymisée' })
    fireEvent.click(await within(tool).findByRole('checkbox', { name: /^Sam \(2\)/ }))
    const third = [...tool.querySelectorAll('.carto-demo-third > li')].find((li) => li.textContent.includes('J’ai écouté'))
    fireEvent.click(within(third).getByRole('checkbox', { name: 'retirer ce passage' }))
    fireEvent.click(within(tool).getByRole('button', { name: 'Préparer l’aperçu' }))
    await within(tool).findByText(/1 surlignage perdu/)
    expect(within(tool).getByText(/2\.01 : passage retiré à votre demande/)).toBeTruthy()
    fireEvent.click(within(tool).getByRole('checkbox', { name: /J’ai relu l’aperçu/ }))
    fireEvent.click(within(tool).getByRole('button', { name: 'Ouvrir la démo dans ce navigateur' }))
    await waitFor(() => expect(window.location.hash).toBe('#/cartographie'))
    expect(await screen.findByText('Démonstration', { selector: '.carto-context-dataset' })).toBeTruthy()
    const list = await store.listDatasets()
    expect(list.map((d) => d.title).sort()).toEqual(['Démonstration', 'Lou Martin'])
    const demoId = list.find((d) => d.title === 'Démonstration').datasetId
    const exported = await store.exportAll(demoId)
    expect(JSON.stringify(exported)).not.toMatch(/J’ai écouté/)
  })
})

describe('P5 — copie autonome ouverte (lecture seule)', () => {
  it('même moteur, sans export ni import ; un bandeau le dit', async () => {
    const store = await louStore()
    const archive = JSON.parse(JSON.stringify(buildArchive(await store.exportAll('ds-lou'), { includePortfolio: false, now: NOW })))
    window.location.hash = '#/cartographie'
    render(<ViewerApp archive={archive} />)
    expect(await screen.findByRole('heading', { name: 'Cartographie' })).toBeTruthy()
    expect((screen.getByRole('note')).textContent).toMatch(/Copie autonome en lecture, exportée le 13 octobre 2026/)
    expect((screen.getByRole('note')).textContent).toMatch(/surlignage des passages est indisponible/)
    const nav = screen.getByRole('navigation', { name: 'Espaces de la cartographie' })
    expect(within(nav).queryByText('Export')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Exporter' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Importer des fichiers' })).toBeNull()
    expect(document.querySelectorAll('[data-tile="sun"] .carto-sun [role="button"]').length).toBeGreaterThan(0)
    // Ni « Importer » ni « Jeux de données » parmi les panneaux d'une copie (D-53).
    const panels = within(document.querySelector('.carto-panels-menu')).getAllByRole('checkbox').map((c) => c.closest('label').textContent.trim())
    expect(panels).not.toContain('Importer')
    expect(panels).not.toContain('Jeux de données')
    expect(panels).toEqual(expect.arrayContaining(['Soleil', 'Détail', 'Journées', 'Compétences', 'Heatmap et lecture', 'Légende']))
  })

  it('une disposition gardée qui affiche « Importer » et « Jeux de données » ne les fait pas apparaître dans une copie (D-53)', async () => {
    showCartoTiles()
    const store = await louStore()
    const archive = JSON.parse(JSON.stringify(buildArchive(await store.exportAll('ds-lou'), { includePortfolio: false, now: NOW })))
    window.location.hash = '#/cartographie'
    render(<ViewerApp archive={archive} />)
    await waitFor(() => expect(document.querySelector('[data-tile="days"]')).toBeTruthy())
    expect(document.querySelector('[data-tile="import"]')).toBeNull()
    expect(document.querySelector('[data-tile="datasets"]')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Importer des fichiers' })).toBeNull()
  })

  it('sans archive lisible : un message, pas d’écran vide', () => {
    render(<ViewerApp archive={null} />)
    expect(screen.getByText('Cette copie ne contient pas de cartographie lisible.')).toBeTruthy()
  })
})
