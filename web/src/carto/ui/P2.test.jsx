// Interface ultime — P2 : lecteur de portfolio surligné, panneau de détail,
// jury, droit de réponse, synthèses évolutives, impression. Critère
// d'acceptation (spec §14) : le passage d'une trace est surligné dans le
// portfolio importé, Y COMPRIS EN CARTOGRAPHIE FUSIONNÉE.
import { useEffect, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import CartoApp from './CartoApp.jsx'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { importFiles } from '../core/import.js'
import { createDataset, observationKey } from '../core/model.js'
import { parseHash, subscribe } from '../../router.js'
import { LOU_PORTFOLIO, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'
import { showCartoTiles } from '../test/tiles.js'

const NOW = '2026-10-13T12:00:00.000Z'

function louFiles({ portfolio = LOU_PORTFOLIO } = {}) {
  const files = portfolio ? [{ path: 'lou.md', text: portfolio }] : []
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  return files
}

async function storeWith(files, { mutate } = {}) {
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  const ds = createDataset({ datasetId: 'ds-lou', title: 'Lou', referential: miniReferential(), now: NOW })
  const res = await importFiles(files, ds, { now: NOW })
  if (mutate) res.dataset = mutate(res.dataset)
  await store.commit(res)
  return store
}

function Harness({ store }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => subscribe(setRoute), [])
  return <CartoApp route={route} deps={{ store, loadReferential: async () => ({ doc: miniReferential() }) }} />
}

async function mount(store) {
  render(<Harness store={store} />)
  await screen.findByRole('heading', { name: 'Cartographie' })
}

const sector = (prefix) => document.querySelector(`[data-tile="sun"] .carto-sun [role="button"][aria-label^="${prefix}"]`)
const detail = () => document.querySelector('[data-tile="detail"]')
const reader = () => screen.queryByRole('region', { name: /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) / })
const marks = (root) => [...root.querySelectorAll('.carto-reader-text mark.carto-hl')]
const markedText = (root) => marks(root).map((m) => m.textContent).join('')
const caption = (root) => root.querySelector('.carto-reader-quote figcaption')?.textContent ?? null

async function openTraceButtons() {
  const section = await within(detail()).findByRole('region', { name: 'Traces de la compétence' })
  await waitFor(() => expect(within(section).queryAllByText('Chargement de l’extrait…')).toHaveLength(0))
  return within(section).getAllByRole('button', { name: 'Ouvrir dans le portfolio' })
}

beforeEach(() => {
  window.location.hash = '#/cartographie'
  try {
    localStorage.clear()
    // Ces tests manipulent la liste, la heatmap… : toutes les tuiles affichées (D-53).
    showCartoTiles()
  } catch {
    /* rien */
  }
})
afterEach(cleanup)

describe('P2 — lecteur de portfolio surligné (critère d’acceptation)', () => {
  it('cartographie fusionnée (3 journées) : la trace du 23 décembre est surlignée dans SON jour, puis trace suivante', async () => {
    await mount(await storeWith(louFiles()))
    fireEvent.click(sector('3.02 '))
    const buttons = await openTraceButtons()
    expect(buttons).toHaveLength(3) // 3.02 : 23 déc. (renvoi) + 24 déc. (preuve, indice)
    fireEvent.click(buttons[0])
    const r = await screen.findByRole('region', { name: 'mardi 23 décembre 2025' })
    await waitFor(() => expect(marks(r).length).toBeGreaterThan(0))
    // Extrait « La maquette a cédé [...] en changeant les appuis. » : début ET fin.
    expect(markedText(r)).toBe('La maquette a cédé : nous avons recommencé en changeant les appuis')
    expect(marks(r).every((m) => m.classList.contains('carto-hl--complete'))).toBe(true)
    // Lu par les lecteurs d'écran : la trace et la journée d'abord, pour qu'un pas d'une trace à l'autre s'entende.
    expect(within(r).getByRole('status').textContent).toBe('Trace 1 sur 3, mardi 23 décembre 2025 : Passage surligné.')
    expect(within(r).getByText(/trace 1 sur 3/)).toBeTruthy()
    // Retrouvé, l'extrait se lit surligné : il n'est pas cité une seconde fois (D-56).
    expect(within(r).queryByText(/Extrait cité par le jury/)).toBeNull()
    expect(r.querySelector('.carto-reader-quote')).toBeNull()
    // Rien que la journée, ses deux triangles et la fermeture : plus de navigation par jour.
    expect(within(r).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Trace précédente', 'Trace suivante', 'Fermer le lecteur'])
    expect(within(r).getByRole('button', { name: 'Trace précédente' }).getAttribute('aria-disabled')).toBe('true')
    // Aucun <mark> n'englobe un paragraphe.
    expect(r.querySelector('mark p, mark div')).toBeNull()

    fireEvent.click(within(r).getByRole('button', { name: 'Trace suivante' }))
    const r2 = await screen.findByRole('region', { name: 'mercredi 24 décembre 2025' })
    await waitFor(() => expect(markedText(r2)).toMatch(/^Troisième essai de la maquette.*dans un tableau$/))
    expect(within(r2).getByText(/trace 2 sur 3/)).toBeTruthy()

    // ← revient à la trace précédente, comme le triangle de gauche.
    fireEvent.keyDown(r2.querySelector('#carto-reader-title'), { key: 'ArrowLeft' })
    const r3 = await screen.findByRole('region', { name: 'mardi 23 décembre 2025' })
    expect(within(r3).getByText(/trace 1 sur 3/)).toBeTruthy()

    fireEvent.click(within(r3).getByRole('button', { name: 'Fermer le lecteur' }))
    await waitFor(() => expect(reader()).toBeNull())
    expect(within(detail()).getByRole('heading', { name: /3\.02 Itération/ })).toBeTruthy()
  })

  it('carto_merge.json (Merge v2) + portfolio : le passage est surligné aussi', async () => {
    const days = louDays()
    const merge = {
      version: 'merge-v1',
      feuilles: Object.fromEntries(Object.entries(days).map(([date, poles]) => [date, { date, carto_par_pole: Object.fromEntries(poles.map((p) => [p.poleNum, p])), kairos: kairosDoc(date) }])),
    }
    await mount(await storeWith([{ path: 'lou.md', text: LOU_PORTFOLIO }, { path: 'carto_merge.json', text: JSON.stringify(merge) }]))
    fireEvent.click(sector('2.01 '))
    fireEvent.click((await openTraceButtons())[0])
    const r = await screen.findByRole('region', { name: 'mardi 23 décembre 2025' })
    await waitFor(() => expect(markedText(r)).toBe('J’ai écouté Sam expliquer son idée jusqu’au bout sans l’interrompre, puis j’ai reformulé ce que j’avais compris'))
  })

  it('décalage de date : passage retrouvé tel quel dans la feuille d’un autre jour, et dit comme tel', async () => {
    const moved = LOU_PORTFOLIO.replace(
      'J’ai écouté Sam expliquer son idée jusqu’au bout sans l’interrompre, puis j’ai reformulé ce que j’avais compris.\n',
      '',
    ).replace('### 24 décembre 2025\n\n', '### 24 décembre 2025\n\nJ’ai écouté Sam expliquer son idée jusqu’au bout sans l’interrompre, puis j’ai reformulé ce que j’avais compris.\n')
    await mount(await storeWith(louFiles({ portfolio: moved })))
    fireEvent.click(sector('2.01 '))
    fireEvent.click((await openTraceButtons())[0])
    const r = await screen.findByRole('region', { name: 'mercredi 24 décembre 2025' })
    await waitFor(() => expect(within(r).getByRole('status').textContent).toBe('mercredi 24 décembre 2025 : Passage surligné dans cette feuille ; la trace est datée du 23 décembre 2025.'))
    expect(markedText(r)).toMatch(/^J’ai écouté Sam/)
    // Le titre dit la journée lue ; la ligne de la trace, la date que lui donne l'analyse.
    expect(r.querySelector('.carto-reader-sub').textContent).toBe('preuve, datée du 23 décembre 2025')
    expect(r.querySelector('.carto-reader-quote')).toBeNull()
  })

  it('passage introuvable : le volet le dit et cite l’extrait du jury', async () => {
    const without = LOU_PORTFOLIO.replace('J’ai écouté Sam expliquer son idée jusqu’au bout sans l’interrompre, puis j’ai reformulé ce que j’avais compris.\n', 'Une autre phrase.\n')
    await mount(await storeWith(louFiles({ portfolio: without })))
    fireEvent.click(sector('2.01 '))
    fireEvent.click((await openTraceButtons())[0])
    const r = await screen.findByRole('region', { name: 'mardi 23 décembre 2025' })
    await waitFor(() => expect(caption(r)).toBe('Extrait cité par le jury, introuvable tel quel dans le portfolio.'))
    expect(r.querySelector('.carto-reader-quote blockquote').textContent).toMatch(/^J’ai écouté Sam/)
    expect(within(r).getByRole('status').textContent).toBe('mardi 23 décembre 2025 : Extrait cité par le jury, introuvable tel quel dans le portfolio.')
    expect(marks(r)).toHaveLength(0)
  })

  it('extrait reformulé par l’analyse : passage approché, encadré en pointillés et dit comme tel (jamais « retrouvé »)', async () => {
    const reformulated = LOU_PORTFOLIO.replace(
      'J’ai écouté Sam expliquer son idée jusqu’au bout sans l’interrompre, puis j’ai reformulé ce que j’avais compris.\n',
      'Hier soir, Sam a pu expliquer son idée jusqu’au bout sans être interrompu, puis j’ai reformulé ce que j’en avais compris, avec soin.\n',
    )
    await mount(await storeWith(louFiles({ portfolio: reformulated })))
    fireEvent.click(sector('2.01 '))
    fireEvent.click((await openTraceButtons())[0])
    const r = await screen.findByRole('region', { name: 'mardi 23 décembre 2025' })
    await waitFor(() => expect(caption(r)).toBe('Extrait cité par le jury, reformulé par l’analyse : la phrase encadrée en pointillés en est la plus proche, à vérifier.'))
    expect(within(r).getByRole('status').textContent).not.toMatch(/retrouvé|surligné/)
    expect(marks(r).every((m) => m.classList.contains('carto-hl--approx'))).toBe(true)
    expect(markedText(r)).toBe('expliquer son idée jusqu’au bout sans être interrompu, puis j’ai reformulé ce que j’en avais compris')
    expect(r.querySelector('.carto-reader-quote blockquote').textContent).toMatch(/^J’ai écouté Sam/)
  })

  it('sans portfolio importé : l’extrait du jury est cité, et le volet dit comment le lire surligné', async () => {
    await mount(await storeWith(louFiles({ portfolio: null })))
    fireEvent.click(sector('1.01 '))
    fireEvent.click((await openTraceButtons())[0])
    const r = await screen.findByRole('region', { name: 'lundi 22 décembre 2025' })
    await waitFor(() => expect(caption(r)).toBe('Extrait cité par le jury. Importez le portfolio (.md) pour le lire surligné dans son texte.'))
    expect(r.querySelector('.carto-reader-quote blockquote').textContent.length).toBeGreaterThan(0)
    // La légende des couleurs n'a rien à expliquer ici.
    expect(r.querySelector('.carto-reader-note mark')).toBeNull()
  })

  it('deux occurrences : navigation de l’une à l’autre', async () => {
    const twice = LOU_PORTFOLIO.replace('### 24 décembre 2025\n\n', '### 24 décembre 2025\n\nTroisième essai de la maquette, annoncé dès le matin.\n\n')
    await mount(await storeWith(louFiles({ portfolio: twice })))
    fireEvent.click(sector('3.02 '))
    fireEvent.click((await openTraceButtons())[2]) // indice « Troisième essai de la maquette »
    const r = await screen.findByRole('region', { name: 'mercredi 24 décembre 2025' })
    await waitFor(() => expect(within(r).getByText('Occurrence 1 sur 2')).toBeTruthy())
    expect(r.querySelector('.carto-reader-text mark.carto-hl--current').getAttribute('data-occurrence')).toBe('0')
    // Les flèches, depuis les occurrences, ne changent pas de trace.
    fireEvent.keyDown(within(r).getByRole('button', { name: 'Occurrence suivante' }), { key: 'ArrowRight' })
    expect(within(r).getByText('Occurrence 1 sur 2')).toBeTruthy()
    fireEvent.click(within(r).getByRole('button', { name: 'Occurrence suivante' }))
    expect(within(r).getByText('Occurrence 2 sur 2')).toBeTruthy()
    expect(r.querySelector('.carto-reader-text mark.carto-hl--current').getAttribute('data-occurrence')).toBe('1')
  })

  it('depuis la modale du jour : le lecteur s’ouvre au-dessus ; Échap le ferme et la modale reste', async () => {
    window.location.hash = '#/cartographie/jour/2025-12-23?focus=3.02'
    await mount(await storeWith(louFiles()))
    const dialog = await screen.findByRole('dialog')
    const open = await within(dialog).findAllByRole('button', { name: 'Ouvrir dans le portfolio' })
    open[0].focus() // un clic de souris donne le focus au bouton (jsdom ne le fait pas seul)
    fireEvent.click(open[0])
    const r = await screen.findByRole('region', { name: 'mardi 23 décembre 2025' })
    await waitFor(() => expect(marks(r).length).toBeGreaterThan(0))
    expect(document.activeElement).toBe(within(r).getByRole('heading', { name: 'mardi 23 décembre 2025' }))
    fireEvent.keyDown(within(r).getByRole('button', { name: 'Fermer le lecteur' }), { key: 'Escape' })
    await waitFor(() => expect(reader()).toBeNull())
    expect(screen.getByRole('dialog')).toBeTruthy()
    // Le focus revient au bouton qui a ouvert le lecteur, dans la modale.
    expect(document.activeElement).toBe(open[0])
  })
})

describe('P2 — panneau de détail, jury et droit de réponse', () => {
  it('compétence : verdict de chaque journée (motif, prescription) et réflexions du jury (Pédagogue, Greffier)', async () => {
    await mount(await storeWith(louFiles()))
    fireEvent.click(sector('1.01 '))
    const obs = await within(detail()).findByRole('region', { name: 'Verdicts par journée' })
    await within(obs).findByText('Vérification explicite.')
    expect(within(obs).getByText('Raconter un doute.')).toBeTruthy() // prescriptionMinimale normalisée
    expect(within(obs).getByText('Je doute de 1.01.')).toBeTruthy() // présomption d'absence
    expect(within(obs).getByText(/Conclusion adversariale/)).toBeTruthy()
    expect(within(obs).getByText('Pièce 1')).toBeTruthy()
    expect(within(obs).getByText(/exploratoire/)).toBeTruthy()
  })

  it('droit de réponse : Confirmer est enregistré dans ce navigateur, sans effet sur le soleil', async () => {
    const store = await storeWith(louFiles())
    await mount(store)
    const before = sector('1.01 ').getAttribute('aria-label')
    fireEvent.click(sector('1.01 '))
    const group = await within(detail()).findByRole('group', { name: 'Votre réponse à cette observation' })
    expect(within(group).getByText('pas encore donnée')).toBeTruthy()
    fireEvent.click(within(group).getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(within(group).getByRole('button', { name: 'Confirmer' }).getAttribute('aria-pressed')).toBe('true'))
    expect(within(group).getByText('Confirmée')).toBeTruthy()
    expect(sector('1.01 ').getAttribute('aria-label')).toBe(before)
    await waitFor(async () => {
      const ds = await store.loadDataset('ds-lou')
      const vid = ds.days.find((d) => d.date === '2025-12-22').activeVariantId
      expect(ds.reviews[observationKey('2025-12-22', vid, '1.01')].state).toBe('confirmed')
    })
  })

  it('un état de revue inconnu ne s’affiche jamais « Contestée » (défaut de V3)', async () => {
    const store = await storeWith(louFiles(), {
      mutate: (ds) => {
        const vid = ds.days.find((d) => d.date === '2025-12-22').activeVariantId
        return { ...ds, reviews: { [observationKey('2025-12-22', vid, '1.01')]: { state: 'bizarre', note: '' } } }
      },
    })
    await mount(store)
    fireEvent.click(sector('1.01 '))
    const group = await within(detail()).findByRole('group', { name: 'Votre réponse à cette observation' })
    expect(within(group).getByText('pas encore donnée')).toBeTruthy()
    expect(within(group).queryByText('Contestée')).toBeNull()
  })

  it('pôle : rapport de la journée (portrait, pistes) et passages saillants ouvrables dans le portfolio', async () => {
    await mount(await storeWith(louFiles()))
    fireEvent.click(sector('Pôle MAIN'))
    const reports = await within(detail()).findByRole('region', { name: 'Rapports du pôle' })
    await within(reports).findByText('Portrait du pôle 3 le 2025-12-24.')
    expect(within(reports).queryByText('Rien à signaler.')).toBeNull() // territoires non visités : jamais affichés
    const passageButtons = within(reports).getAllByRole('button', { name: 'Ouvrir dans le portfolio' })
    fireEvent.click(passageButtons[0])
    const r = await screen.findByRole('region', { name: 'mercredi 24 décembre 2025' })
    await waitFor(() => expect(marks(r).length).toBeGreaterThan(0))
  })

  it('aucune sélection : portrait kairos de la dernière journée affichée', async () => {
    await mount(await storeWith(louFiles()))
    const k = await within(detail()).findByRole('region', { name: 'Portrait kairos' })
    expect(within(k).getByRole('heading', { name: 'Portrait du 24 décembre 2025' })).toBeTruthy()
    expect(within(k).getByText('Portrait du 2025-12-24.')).toBeTruthy()
    expect(within(k).getByText('Deux massifs.')).toBeTruthy()
  })

  it('synthèse évolutive : visible pour son ensemble source, masquée avec un message sinon, rappelable', async () => {
    const store = await storeWith(louFiles(), {
      mutate: (ds) => ({
        ...ds,
        narratives: [
          { id: 'n-101', kind: 'competence-evolutive', scope: { code: '1.01' }, sourceDates: ['2025-12-22', '2025-12-23', '2025-12-24'], html: '<p>La vérification devient une habitude.</p>' },
        ],
      }),
    })
    await mount(store)
    fireEvent.click(sector('1.01 '))
    await within(detail()).findByText('La vérification devient une habitude.')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cocher le 23 décembre 2025' }))
    await within(detail()).findByText(/Synthèse évolutive de la compétence masquée/)
    expect(within(detail()).queryByText('La vérification devient une habitude.')).toBeNull()
    fireEvent.click(within(detail()).getByRole('button', { name: 'Cocher exactement ces journées et afficher l’état complet' }))
    await within(detail()).findByText('La vérification devient une habitude.')
  })

  it('impression : tous les <details> s’ouvrent avant et se referment après', async () => {
    await mount(await storeWith(louFiles()))
    fireEvent.click(sector('1.01 '))
    await within(detail()).findByText('Vérification explicite.')
    const closed = () => [...document.querySelectorAll('.carto-app details:not([open])')]
    const before = closed().length
    expect(before).toBeGreaterThan(0)
    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    expect(closed()).toHaveLength(0)
    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(closed()).toHaveLength(before)
  })
})

describe('P2 — AuroraCore : délibération du jury et surlignage dans la feuille du jour', () => {
  const verdict = {
    code: '1.01',
    nom: 'Pensée critique',
    statut: 'présence établie',
    score_preuves: 1,
    score_indices: 0,
    confiance: 0.75,
    jury: {
      linguiste: { position: 'présence établie', confiance: 0.8, synthese: 'Vocabulaire juste.' },
      philosophe: { position: 'présence établie', confiance: 0.7, synthese: 'Doute méthodique.' },
      consensus: true,
      voix_presence: 2,
      voix_non_etablie: 0,
      voix_sans_eclairage: 0,
    },
    president: { points_convergence: 'Tous voient la vérification.', verdict_argumente: 'Le jury converge.', prescription: 'Raconter une erreur.' },
    traces_retenues: [{ piece_id: 1, type: 'trace concrète', role: 'preuve décisive', extrait: "J'ai vérifié deux sources contradictoires", date: '2025-12-22' }],
  }
  const delib = [
    'Journal : LOU | Date : 2026-04-25 | Agent : 5-tribunal-jury',
    '```',
    '====',
    'INVOCATION — LINGUISTE',
    '====',
    'J’incarne le Linguiste.',
    '```',
    '',
    'Le vocabulaire est juste.',
  ].join('\n')

  it('six éclairages et président au niveau du run ; la trace est surlignée dans la feuille du journal', async () => {
    const files = [
      { path: 'LOU/manifest.json', text: JSON.stringify({ id_portfolio: 'LOU' }) },
      { path: 'LOU/1/1.01/verdict.json', text: JSON.stringify(verdict) },
      { path: 'LOU/1/1.01/deliberation.md', text: delib },
      { path: 'LOU/1/1.01/feuilles/2025-12-22/LOU-1.01-001.md', text: '# Pièce 001\n\nExtrait versé par le Greffier.' },
      { path: 'LOU/feuilles/2025-12-22.md', text: "### 22.12.2025\n\nJ'ai vérifié deux sources contradictoires avant de conclure." },
    ]
    await mount(await storeWith(files))
    fireEvent.click(sector('1.01 '))
    const obs = await within(detail()).findByRole('region', { name: 'Verdicts par journée' })
    await within(obs).findByText(/Délibération du jury — LOU@2026-04-25/)
    await within(obs).findByText(/Linguiste — présence établie · confiance 0,8/)
    // Verdict argumenté du président : motif de chaque journée ET section du président.
    expect(within(obs).getAllByText('Le jury converge.').length).toBeGreaterThanOrEqual(2)
    expect(within(obs).getByText('Tous voient la vérification.')).toBeTruthy()
    expect(within(obs).getByText('Le vocabulaire est juste.')).toBeTruthy()
    expect(within(obs).getByText('Extrait versé par le Greffier.')).toBeTruthy()
    fireEvent.click((await openTraceButtons())[0])
    const r = await screen.findByRole('region', { name: 'lundi 22 décembre 2025' })
    await waitFor(() => expect(markedText(r)).toBe("J'ai vérifié deux sources contradictoires"))
  })
})
