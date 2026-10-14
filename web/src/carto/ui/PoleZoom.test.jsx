// Interface ultime — ouvrir un pôle sur 360° dans le soleil (demande de
// Christian du 2026-10-14, journal D-45) : un double-clic sur l'arc d'un pôle
// l'ouvre, ses compétences occupent tout le cercle à la place du soleil
// principal ; un clic au centre revient à tous les pôles.
import { useEffect, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import CartoApp from './CartoApp.jsx'
import { SharedView } from './SharedView.jsx'
import { ZOOM_MS } from './Sun.jsx'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { importFiles } from '../core/import.js'
import { createDataset } from '../core/model.js'
import { parseHash, subscribe } from '../../router.js'
import { LOU_PORTFOLIO, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'
import sharedDoc from '../../../../schemas/fixtures/partage/carto-partage-exemple.json'

const NOW = '2026-10-13T12:00:00.000Z'

// Points de Lou : pôle 1 → 1.01 (1) ; pôle 2 → 2.01 (1) ; pôle 3 → 3.01 (½) et 3.02 (2).
async function louStore({ reducedMotion } = {}) {
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  let ds = createDataset({ datasetId: 'ds-lou', title: 'Lou', referential: miniReferential(), now: NOW })
  if (reducedMotion) ds = { ...ds, preferences: { ...ds.preferences, reducedMotion } }
  const files = [{ path: 'lou.md', text: LOU_PORTFOLIO }]
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  await store.commit(await importFiles(files, ds, { now: NOW }))
  return store
}

function Harness({ store }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => subscribe(setRoute), [])
  return <CartoApp route={route} deps={{ store, loadReferential: async () => ({ doc: miniReferential() }) }} />
}

async function openLou(opts) {
  render(<Harness store={await louStore(opts)} />)
  await waitFor(() => expect(sunEl()).toBeTruthy())
  await waitFor(() => expect(sectorCodes()).toEqual(['1.01', '2.01', '3.01', '3.02']))
}

const sunEl = () => document.querySelector('.carto-col-center .carto-sun') ?? document.querySelector('.carto-shared .carto-sun')
const pole = (name) => sunEl().querySelector(`path[role="button"][aria-label^="Pôle ${name}"]`)
const sectors = () => [...sunEl().querySelectorAll('path[role="button"]')].filter((el) => /^\d\.\d\d /.test(el.getAttribute('aria-label')))
const sectorCodes = () => sectors().map((el) => el.getAttribute('aria-label').slice(0, 4))
const sector = (code) => sectors().find((el) => el.getAttribute('aria-label').startsWith(`${code} `))
const center = () => sunEl().querySelector('.carto-sun-center')
const fading = () => sunEl().querySelectorAll('path[aria-hidden="true"]').length
/** Fin de l'ouverture ou de la fermeture : plus aucun secteur de passage. */
const settled = () => waitFor(() => expect(fading()).toBe(0), { timeout: ZOOM_MS * 4 })

beforeEach(() => {
  window.location.hash = '#/cartographie'
  try {
    localStorage.clear()
  } catch {
    /* rien */
  }
})
afterEach(cleanup)

describe('ouvrir un pôle sur 360°', () => {
  it('double-clic sur l’arc d’un pôle : ses seules compétences occupent tout le cercle, selon leur part des points du pôle ; un clic au centre revient à tous les pôles', async () => {
    await openLou()
    fireEvent.doubleClick(pole('MAIN'))

    // L'arc s'ouvre : pendant le passage, les secteurs des autres pôles s'effacent (ni cliquables ni atteignables).
    await waitFor(() => expect(sectorCodes()).toEqual(['3.01', '3.02']))
    expect(fading()).toBeGreaterThan(0)
    await settled()

    expect(sector('3.01').getAttribute('aria-label')).toMatch(/^3\.01 Fabrication : 20\.0 % du pôle \(11\.1 % du soleil\)/)
    expect(sector('3.02').getAttribute('aria-label')).toMatch(/^3\.02 Itération : 80\.0 % du pôle \(44\.4 % du soleil\)/)
    expect(pole('MAIN').getAttribute('aria-label')).toMatch(/ouvert sur 360°.*double-clic ou o : revenir aux 3 pôles/)
    expect(center().getAttribute('aria-label')).toBe('Centre : revenir aux 3 pôles')
    expect(sunEl().querySelector('svg').getAttribute('aria-label')).toBe('Pôle MAIN — Créer ouvert sur 360° : 2 compétences. Centre : revenir aux 3 pôles.')
    // Chaque compétence porte son code ; le pôle est sélectionné, le détail le montre.
    expect([...sunEl().querySelectorAll('.carto-sun-code-label')].map((t) => t.textContent)).toEqual(['3.01', '3.02'])
    expect(screen.getByRole('article', { name: 'Détail : pôle MAIN — Créer' })).toBeTruthy()
    // La légende garde le chemin du retour, même pôle sélectionné.
    const caption = () => sunEl().querySelector('.carto-sun-caption').textContent
    expect(caption()).toMatch(/^MAIN — Créer — ouvert sur 360°2 compétences · 55\.6 % du soleil · confiance .* · clic au centre : revenir aux 3 pôles$/)

    fireEvent.click(center())
    await settled()
    expect(sectorCodes()).toEqual(['1.01', '2.01', '3.01', '3.02'])
    expect(center().getAttribute('aria-label')).toBe('Centre : tout désélectionner')
    expect(screen.getByRole('article', { name: 'Détail : pôle MAIN — Créer' })).toBeTruthy() // la sélection reste
    expect(caption()).toMatch(/^MAIN — Créer55\.6 % du soleil/)
    expect(sunEl().querySelectorAll('.carto-sun-code-label')).toHaveLength(0)
  })

  it('un nouveau double-clic sur l’anneau du pôle ouvert le referme', async () => {
    await openLou()
    fireEvent.doubleClick(pole('CŒUR'))
    await settled()
    expect(sectorCodes()).toEqual(['2.01'])
    expect(sector('2.01').getAttribute('aria-label')).toMatch(/100\.0 % du pôle/)
    fireEvent.doubleClick(pole('CŒUR'))
    await settled()
    expect(sectorCodes()).toEqual(['1.01', '2.01', '3.01', '3.02'])
  })

  it('au clavier : « o » (ou Maj+Entrée) sur un pôle l’ouvre ; Échap désélectionne, puis referme', async () => {
    await openLou()
    const tete = pole('TÊTE')
    tete.focus()
    fireEvent.keyDown(tete, { key: 'o' })
    await settled()
    expect(sectorCodes()).toEqual(['1.01'])
    expect(screen.getByRole('article', { name: 'Détail : pôle TÊTE — Penser' })).toBeTruthy()

    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.getByRole('article', { name: 'Résumé du profil' })).toBeTruthy())
    expect(sectorCodes()).toEqual(['1.01']) // toujours ouvert
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await settled()
    expect(sectorCodes()).toEqual(['1.01', '2.01', '3.01', '3.02'])

    fireEvent.keyDown(pole('MAIN'), { key: 'Enter', shiftKey: true })
    await settled()
    expect(sectorCodes()).toEqual(['3.01', '3.02'])
  })

  it('Échap sur le soleil même (pôle ouvert et sélectionné) : un appui désélectionne, le suivant referme — jamais les deux d’un coup', async () => {
    await openLou()
    const main = pole('MAIN')
    main.focus()
    fireEvent.doubleClick(main)
    await settled()
    fireEvent.keyDown(pole('MAIN'), { key: 'Escape' })
    await waitFor(() => expect(screen.getByRole('article', { name: 'Résumé du profil' })).toBeTruthy())
    await new Promise((r) => setTimeout(r, ZOOM_MS + 100))
    expect(center().getAttribute('aria-label')).toBe('Centre : revenir aux 3 pôles')
    expect(sectorCodes()).toEqual(['3.01', '3.02'])
    fireEvent.keyDown(pole('MAIN'), { key: 'Escape' })
    await settled()
    expect(sectorCodes()).toEqual(['1.01', '2.01', '3.01', '3.02'])
  })

  it('« o » avec Ctrl, Cmd ou Alt reste au navigateur : le pôle ne s’ouvre pas', async () => {
    await openLou()
    for (const mod of ['ctrlKey', 'metaKey', 'altKey']) fireEvent.keyDown(pole('MAIN'), { key: 'o', [mod]: true })
    await new Promise((r) => setTimeout(r, 50))
    expect(center().getAttribute('aria-label')).toBe('Centre : tout désélectionner')
    expect(sectorCodes()).toEqual(['1.01', '2.01', '3.01', '3.02'])
  })

  it('depuis le détail du pôle : « Ouvrir ce pôle sur 360° », puis « Revenir aux 3 pôles »', async () => {
    await openLou()
    fireEvent.click(pole('CŒUR'))
    const detail = await screen.findByRole('article', { name: 'Détail : pôle CŒUR — Relier' })
    fireEvent.click(within(detail).getByRole('button', { name: 'Ouvrir ce pôle sur 360°' }))
    await settled()
    expect(sectorCodes()).toEqual(['2.01'])
    fireEvent.click(within(screen.getByRole('article', { name: 'Détail : pôle CŒUR — Relier' })).getByRole('button', { name: 'Revenir aux 3 pôles' }))
    await settled()
    expect(sectorCodes()).toEqual(['1.01', '2.01', '3.01', '3.02'])
  })

  it('choisir une compétence d’un autre pôle referme le pôle ouvert ; une du même pôle le garde', async () => {
    await openLou()
    fireEvent.doubleClick(pole('MAIN'))
    await settled()
    fireEvent.click(sector('3.02'))
    expect(await screen.findByRole('article', { name: 'Détail : 3.02 Itération' })).toBeTruthy()
    expect(sectorCodes()).toEqual(['3.01', '3.02'])

    const list = screen.getByRole('navigation', { name: 'Compétences observées' })
    fireEvent.click(within(list).getByRole('button', { name: 'Ouvrir TÊTE — Penser' }))
    fireEvent.click(within(list).getByRole('button', { name: /^1\.01 Pensée critique/ }))
    await settled()
    expect(sectorCodes()).toEqual(['1.01', '2.01', '3.01', '3.02'])
    expect(screen.getByRole('article', { name: 'Détail : 1.01 Pensée critique' })).toBeTruthy()
  })

  it('le pôle reste ouvert quand la date t change : son soleil suit l’état cumulé', async () => {
    await openLou()
    fireEvent.doubleClick(pole('MAIN'))
    await settled()
    fireEvent.click(document.getElementById('carto-hm-2025-12-22'))
    await waitFor(() => expect(sectorCodes()).toEqual(['3.01']))
    expect(sector('3.01').getAttribute('aria-label')).toMatch(/100\.0 % du pôle/)
    // Le retour se dit au nombre de pôles du soleil complet à cette date (deux le 22 décembre).
    expect(center().getAttribute('aria-label')).toBe('Centre : revenir aux 2 pôles')
    fireEvent.click(center())
    await settled()
    expect(sectorCodes()).toEqual(['1.01', '3.01'])
  })

  it('« Pourquoi cette surface ? » dit aussi la part dans le pôle ouvert', async () => {
    await openLou()
    fireEvent.doubleClick(pole('MAIN'))
    await settled()
    fireEvent.click(sector('3.02'))
    await screen.findByRole('article', { name: 'Détail : 3.02 Itération' })
    fireEvent.keyDown(document.body, { key: 'w' })
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Dans le pôle ouvert')).toBeTruthy()
    expect(within(dialog).getByText('288,0° (80,0 %)')).toBeTruthy()
    expect(dialog.textContent).toMatch(/θ = 360° × points \/ points du pôle/)
  })

  it('mouvement réduit : le pôle s’ouvre et se referme d’un coup, sans secteur de passage', async () => {
    await openLou({ reducedMotion: 'reduce' })
    await act(async () => {
      fireEvent.doubleClick(pole('MAIN'))
    })
    expect(sectorCodes()).toEqual(['3.01', '3.02'])
    expect(fading()).toBe(0)
    await act(async () => {
      fireEvent.click(center())
    })
    expect(sectorCodes()).toEqual(['1.01', '2.01', '3.01', '3.02'])
    expect(fading()).toBe(0)
  })
})

describe('le même geste dans la version partagée (vue employeur et aperçu verrouillé)', () => {
  it('double-clic sur un pôle : il s’ouvre sur 360° ; Échap au clavier, ou le centre, ramène aux pôles', async () => {
    render(<SharedView doc={sharedDoc} />)
    await waitFor(() => expect(sectorCodes()).toEqual(['1.01', '2.01']))
    fireEvent.doubleClick(pole('TÊTE'))
    await settled()
    expect(sectorCodes()).toEqual(['1.01'])
    expect(sector('1.01').getAttribute('aria-label')).toMatch(/^1\.01 .*: 100\.0 % du pôle \(80\.0 % du soleil\)/)
    expect(center().getAttribute('aria-label')).toBe('Centre : revenir aux 2 pôles')
    fireEvent.click(center())
    await settled()
    expect(sectorCodes()).toEqual(['1.01', '2.01'])

    // Au clavier : « o » ouvre, Échap désélectionne, puis referme.
    fireEvent.keyDown(pole('CŒUR'), { key: 'o' })
    await settled()
    expect(sectorCodes()).toEqual(['2.01'])
    fireEvent.keyDown(sector('2.01'), { key: 'Escape' })
    expect(sectorCodes()).toEqual(['2.01'])
    fireEvent.keyDown(sector('2.01'), { key: 'Escape' })
    await settled()
    expect(sectorCodes()).toEqual(['1.01', '2.01'])
    expect(screen.getByText(/Un double-clic sur un pôle de l’anneau intérieur l’ouvre sur tout le cercle/)).toBeTruthy()
  })
})
