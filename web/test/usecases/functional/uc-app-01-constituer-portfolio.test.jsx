// UC-APP-01 — Constituer son portfolio local : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-01-constituer-portfolio.md
//
// Chaque scénario est joué sur l'application ENTIÈRE (<App/>) ouverte sur
// #/portfolio, exactement comme le vit l'apprenant : AUCUNE couture de test
// dans la vue — le portfolio-store réel écrit dans un IndexedDB factice
// (base « humanome-portfolios »), le relais Google Docs passe par le fetch
// global simulé. Le « rechargement de page » est un démontage/remontage de
// l'application sur la même base IndexedDB.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { GDOC_UNAVAILABLE_MESSAGE } from '../../../src/lib/gdoc.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { createFakeIndexedDb } from '../support/appl-fake-indexeddb.js'
import { jsonResponse, routedFetch, textResponse } from '../support/appl-http.js'
import FIXTURE from '../../../../schemas/fixtures/portfolio-3-jours.md?raw'

const DOC_ID = '1AbC-dEfGhIjKlMnOpQrStUvWxYz0123456789abcd'
const DOC_URL = `https://docs.google.com/document/d/${DOC_ID}/edit?usp=sharing`
const DB = 'humanome-portfolios'
const STORE = 'portfolios'

const idb = createFakeIndexedDb() // un seul faux par fichier (cf. support)

/**
 * Fichier choisi par l'apprenant. jsdom n'implémente pas File.prototype.text()
 * (présent dans tous les navigateurs cibles) : on le fournit sur l'instance.
 */
function textFile(content, name, type = 'text/markdown') {
  const file = new File([content], name, { type })
  file.text = async () => content
  return file
}

/** Contenu d'un Blob via FileReader (jsdom n'a pas Blob.prototype.text()). */
function readBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

function stubNetwork(routes = []) {
  const fetchMock = routedFetch(routes)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function openPortfolio() {
  window.location.hash = '#/portfolio'
  return render(<App lib={fakeLib} fetchMeFn={async () => ({ user: null })} />)
}

async function createPortfolio({ titre, texte } = {}) {
  fireEvent.click(screen.getByRole('button', { name: 'Nouveau portfolio' }))
  const editor = await screen.findByLabelText('Texte du portfolio')
  if (titre !== undefined) {
    fireEvent.change(screen.getByLabelText('Titre du portfolio'), { target: { value: titre } })
  }
  if (texte !== undefined) fireEvent.change(editor, { target: { value: texte } })
  return editor
}

/** Attend la sauvegarde différée (600 ms, ADR-010) puis relit la base. */
async function savedRecords(predicate = () => true) {
  await waitFor(
    () => {
      expect(idb.values(DB, STORE).filter(predicate).length).toBeGreaterThan(0)
    },
    { timeout: 3000 },
  )
  return idb.values(DB, STORE)
}

beforeEach(() => {
  resetApiClient()
  vi.stubGlobal('indexedDB', idb.factory)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  idb.reset()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-APP-01 — scénario nominal : coller son journal, le retrouver au rechargement', () => {
  it('UC-APP-01-F01 — nominal : collage, découpage automatique, sauvegarde locale, rechargement, rien sur le réseau', async () => {
    const fetchMock = stubNetwork()
    // Les autres canaux de sortie du navigateur sont neutralisés et comptés :
    // XMLHttpRequest et navigator.sendBeacon (absent de jsdom).
    let xhrCount = 0
    vi.stubGlobal(
      'XMLHttpRequest',
      class {
        constructor() {
          xhrCount += 1
        }
      },
    )
    const beacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
    const first = openPortfolio()

    // 1. Bandeau RGPD permanent et liste vide.
    expect(screen.getByRole('note').textContent).toContain('Vos textes ne quittent pas ce navigateur.')
    expect(await screen.findByText('Aucun portfolio pour l’instant.')).toBeDefined()

    // 2-3. Nouveau portfolio, titre, collage de la fixture 3 jours.
    await createPortfolio({ titre: 'Journal de Maya', texte: FIXTURE })

    // 4. Découpage automatique en 3 journées datées.
    expect(screen.getByRole('heading', { name: 'Découpage en journées (3)' })).toBeDefined()
    expect(screen.getByLabelText('Date de la journée 1').value).toBe('2026-01-05')
    expect(screen.getByLabelText('Date de la journée 2').value).toBe('2026-01-06')
    expect(screen.getByLabelText('Date de la journée 3').value).toBe('2026-01-07')

    // 5. Sauvegarde locale différée, horodatée.
    expect(await screen.findByText(/Enregistré localement à/, {}, { timeout: 3000 })).toBeDefined()
    const [record] = await savedRecords((r) => r.texte === FIXTURE)
    expect(record).toMatchObject({ titre: 'Journal de Maya', source: 'colle', texte: FIXTURE })
    expect(record.segments.map((s) => [s.date, s.debut, s.fin])).toEqual([
      ['2026-01-05', 0, record.segments[1].debut],
      ['2026-01-06', record.segments[1].debut, record.segments[2].debut],
      ['2026-01-07', record.segments[2].debut, FIXTURE.length],
    ])

    // 7. Rechargement : le portfolio est relu depuis IndexedDB.
    first.unmount()
    openPortfolio()
    fireEvent.click(await screen.findByRole('button', { name: 'Journal de Maya' }))
    expect((await screen.findByLabelText('Texte du portfolio')).value).toBe(FIXTURE)
    expect(screen.getByRole('heading', { name: 'Découpage en journées (3)' })).toBeDefined()

    // RGPD (RG1) : AUCUNE requête pendant tout le parcours — ni fetch, ni
    // XMLHttpRequest, ni beacon (la session est injectée par fetchMeFn).
    expect(fetchMock.calls).toEqual([])
    expect(xhrCount).toBe(0)
    expect(beacon).not.toHaveBeenCalled()
    delete navigator.sendBeacon
  })
})

describe('UC-APP-01 — scénarios alternatifs', () => {
  it('UC-APP-01-F02 — A1 : fichier .md lu localement, titre dérivé du nom, source « fichier »', async () => {
    const fetchMock = stubNetwork()
    openPortfolio()
    await createPortfolio()

    const file = textFile(FIXTURE, 'journal-maya.md')
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Importer un fichier .txt ou .md'), {
        target: { files: [file] },
      })
    })

    expect(await screen.findByText(/Fichier « journal-maya\.md » importé/)).toBeDefined()
    expect(screen.getByText(/lu localement par votre navigateur/)).toBeDefined()
    expect(screen.getByLabelText('Titre du portfolio').value).toBe('journal-maya')
    expect(screen.getByRole('heading', { name: 'Découpage en journées (3)' })).toBeDefined()
    const [record] = await savedRecords((r) => r.source === 'fichier')
    expect(record).toMatchObject({ titre: 'journal-maya', source: 'fichier', texte: FIXTURE })

    // Titre déjà choisi (≠ « Portfolio sans titre ») : il est conservé.
    await createPortfolio({ titre: 'Mon carnet' })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Importer un fichier .txt ou .md'), {
        target: { files: [textFile('## 2026-03-02\nStage.', 'autre-nom.txt', 'text/plain')] },
      })
    })
    expect(await screen.findByText(/Fichier « autre-nom\.txt » importé/)).toBeDefined()
    expect(screen.getByLabelText('Titre du portfolio').value).toBe('Mon carnet')
    await savedRecords((r) => r.titre === 'Mon carnet' && r.source === 'fichier')
    expect(idb.values(DB, STORE).some((r) => r.titre === 'autre-nom')).toBe(false)
    expect(fetchMock.calls).toHaveLength(0)
  })

  it('UC-APP-01-F03 — A2 : Google Docs public relayé par GET api/gdoc-text, stocké localement (source « gdocs »)', async () => {
    const exportGdoc = `﻿${FIXTURE}`
    const fetchMock = stubNetwork([
      [`api/gdoc-text?docId=${DOC_ID}`, () => textResponse(200, exportGdoc)],
    ])
    openPortfolio()
    // Un texte existe déjà : l'import le REMPLACE (il ne s'y ajoute pas).
    await createPortfolio({ titre: 'Journal importé', texte: 'Ancien texte' })

    fireEvent.change(screen.getByLabelText('URL du document Google Docs'), { target: { value: DOC_URL } })
    fireEvent.click(screen.getByRole('button', { name: 'Importer le document' }))

    expect(await screen.findByText(/le serveur n’en conserve aucune copie/)).toBeDefined()
    expect(screen.getByLabelText('Texte du portfolio').value).toBe(exportGdoc)
    // fr-FR groupe les milliers par une espace fine insécable, que le
    // normaliseur de Testing Library ramène à une espace simple.
    const chars = exportGdoc.length.toLocaleString('fr-FR').replace(/\s/g, ' ')
    expect(screen.getByText(`Document importé (${chars} caractères).`, { exact: false })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Découpage en journées (3)' })).toBeDefined()
    expect(fetchMock.calls.map((c) => c.url)).toEqual([`api/gdoc-text?docId=${DOC_ID}`])
    expect(fetchMock.calls[0].init.method).toBe('GET')
    const [record] = await savedRecords((r) => r.source === 'gdocs')
    expect(record.texte).toBe(exportGdoc)
    expect(record.segments.map((s) => s.date)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
  })

  it('UC-APP-01-F04 — étape 6 : renommer une date, fusionner, scinder — l’état ajusté est persisté', async () => {
    stubNetwork()
    openPortfolio()
    await createPortfolio({ titre: 'Ajustements', texte: FIXTURE })

    const date3 = screen.getByLabelText('Date de la journée 3')
    fireEvent.change(date3, { target: { value: '2026-01-08' } })
    fireEvent.keyDown(date3, { key: 'Enter' })
    expect(screen.getByLabelText('Date de la journée 3').value).toBe('2026-01-08')

    fireEvent.click(screen.getAllByRole('button', { name: 'Fusionner avec la journée précédente' })[0])
    expect(screen.getByRole('heading', { name: 'Découpage en journées (2)' })).toBeDefined()

    const dayText = screen.getByLabelText('Texte de la journée 2026-01-05')
    const cursor = dayText.value.indexOf('## Mardi 6 janvier 2026')
    dayText.setSelectionRange(cursor, cursor)
    fireEvent.click(screen.getAllByRole('button', { name: 'Scinder au curseur' })[0])
    expect(screen.getByRole('heading', { name: 'Découpage en journées (3)' })).toBeDefined()
    expect(screen.getByLabelText('Date de la journée 2').value).toBe('') // à nommer

    await waitFor(
      () => {
        const [record] = idb.values(DB, STORE)
        expect(record?.segments.map((s) => s.date)).toEqual(['2026-01-05', null, '2026-01-08'])
      },
      { timeout: 3000 },
    )
    // RG3 : les ajustements ne touchent pas au texte.
    expect(idb.values(DB, STORE)[0].texte).toBe(FIXTURE)

    // Champ date vidé : la journée devient non datée (date null persistée).
    const emptied = screen.getByLabelText('Date de la journée 3')
    fireEvent.change(emptied, { target: { value: '' } })
    fireEvent.keyDown(emptied, { key: 'Enter' })
    await waitFor(
      () => expect(idb.values(DB, STORE)[0].segments.map((s) => s.date)).toEqual(['2026-01-05', null, null]),
      { timeout: 3000 },
    )

    // RG3 : toute modification du TEXTE relance la segmentation automatique
    // et réinitialise les ajustements manuels.
    fireEvent.change(screen.getByLabelText('Texte du portfolio'), { target: { value: `${FIXTURE}\nAjout.` } })
    expect(screen.getByLabelText('Date de la journée 2').value).toBe('2026-01-06')
    await waitFor(
      () =>
        expect(idb.values(DB, STORE)[0].segments.map((s) => s.date)).toEqual([
          '2026-01-05',
          '2026-01-06',
          '2026-01-07',
        ]),
      { timeout: 3000 },
    )
  })

  it('UC-APP-01-F05 — A3 : ouvrir un autre portfolio sauvegarde IMMÉDIATEMENT le courant', async () => {
    stubNetwork()
    openPortfolio()
    await createPortfolio({ titre: 'Premier', texte: '## 2026-01-05\nPremier jour.' })
    await savedRecords((r) => r.titre === 'Premier')

    await createPortfolio({ titre: 'Second' })
    fireEvent.change(screen.getByLabelText('Texte du portfolio'), {
      target: { value: '## 2026-02-01\nTexte saisi juste avant de changer.' },
    })
    // Changement de portfolio AVANT la fin de la pause de 600 ms.
    fireEvent.click(screen.getByRole('button', { name: 'Premier' }))

    // Sauvegarde IMMÉDIATE : visible bien avant l'échéance des 600 ms.
    await waitFor(
      () => {
        const second = idb.values(DB, STORE).find((r) => r.titre === 'Second')
        expect(second?.texte).toBe('## 2026-02-01\nTexte saisi juste avant de changer.')
      },
      { timeout: 300 },
    )
    expect((await screen.findByLabelText('Texte du portfolio')).value).toBe('## 2026-01-05\nPremier jour.')
  })

  it('UC-APP-01-F06 — A4 : suppression en deux temps, purge réelle de la base locale', async () => {
    stubNetwork()
    openPortfolio()
    await createPortfolio({ titre: 'À effacer', texte: 'Un texte.' })
    await savedRecords((r) => r.titre === 'À effacer')

    const item = screen.getByRole('button', { name: 'À effacer' }).closest('li')
    fireEvent.click(within(item).getByRole('button', { name: 'Supprimer' }))
    expect(idb.values(DB, STORE)).toHaveLength(1) // pas encore confirmé
    fireEvent.click(within(item).getByRole('button', { name: 'Confirmer la suppression' }))

    expect(await screen.findByText('Aucun portfolio pour l’instant.')).toBeDefined()
    await waitFor(() => expect(idb.values(DB, STORE)).toEqual([]))
  })

  it('UC-APP-01-F07 — A5 : export .md du texte à l’octet près, nom de fichier dérivé du titre', async () => {
    stubNetwork()
    let blob = null
    let anchor = null
    URL.createObjectURL = vi.fn((b) => {
      blob = b
      return 'blob:portfolio'
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      anchor = { download: this.download, href: this.getAttribute('href') }
    })
    openPortfolio()
    await createPortfolio({ titre: 'Journal d’été 2026 !', texte: FIXTURE })

    fireEvent.click(screen.getByRole('button', { name: 'Exporter (.md)' }))

    expect(anchor).toEqual({ download: 'journal-d-ete-2026.md', href: 'blob:portfolio' })
    expect(blob.type).toBe('text/markdown;charset=utf-8')
    expect(await readBlob(blob)).toBe(FIXTURE)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:portfolio')
  })
})

describe('UC-APP-01 — scénarios d’erreur', () => {
  it('UC-APP-01-F08 — E1 : IndexedDB indisponible : alerte, travail en mémoire, sauvegarde signalée en échec', async () => {
    stubNetwork()
    vi.stubGlobal('indexedDB', undefined)
    openPortfolio()

    expect((await screen.findByRole('alert')).textContent).toContain('Stockage local indisponible')
    await createPortfolio({ texte: FIXTURE })
    expect(screen.getByRole('heading', { name: 'Découpage en journées (3)' })).toBeDefined()
    expect(
      await screen.findByText(/La sauvegarde locale a échoué : IndexedDB est indisponible/, {}, { timeout: 3000 }),
    ).toBeDefined()

    // Variante « refusé » : IndexedDB présent mais ouverture refusée (quota,
    // navigation privée stricte). L'alerte s'affiche aussi ; l'ouverture est
    // retentée à l'opération suivante (U09), le travail est alors conservé.
    cleanup()
    vi.stubGlobal('indexedDB', idb.factory)
    idb.failNextOpen('quota dépassé')
    openPortfolio()
    expect((await screen.findByRole('alert')).textContent).toContain('Stockage local indisponible (quota dépassé)')
    await createPortfolio({ titre: 'Après refus', texte: 'Texte.' })
    await savedRecords((r) => r.titre === 'Après refus')
  })

  it('UC-APP-01-F09 — E2 : URL Google Docs non reconnue : message, aucune requête', async () => {
    const fetchMock = stubNetwork()
    openPortfolio()
    await createPortfolio()

    fireEvent.change(screen.getByLabelText('URL du document Google Docs'), {
      target: { value: 'https://drive.google.com/drive/folders/xyz' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Importer le document' }))

    expect((await screen.findByRole('alert')).textContent).toContain('URL non reconnue')
    expect(fetchMock.calls).toHaveLength(0)
  })

  it('UC-APP-01-F10 — E3 : document non partagé (403 de l’API) : message du serveur, texte inchangé', async () => {
    stubNetwork([
      [
        `api/gdoc-text?docId=${DOC_ID}`,
        () =>
          jsonResponse(403, {
            error: 'Document non accessible : vérifiez qu’il est partagé en lecture avec « Tous les utilisateurs disposant du lien ».',
          }),
      ],
    ])
    openPortfolio()
    await createPortfolio({ texte: 'Texte déjà saisi.' })

    fireEvent.change(screen.getByLabelText('URL du document Google Docs'), { target: { value: DOC_URL } })
    fireEvent.click(screen.getByRole('button', { name: 'Importer le document' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Tous les utilisateurs disposant du lien')
    expect(screen.getByLabelText('Texte du portfolio').value).toBe('Texte déjà saisi.')
    expect(screen.getByRole('button', { name: 'Importer le document' }).disabled).toBe(false)
  })

  it('UC-APP-01-F11 — E4 : quota horaire atteint (429) : invitation à réessayer plus tard', async () => {
    stubNetwork([
      [
        `api/gdoc-text?docId=${DOC_ID}`,
        () => jsonResponse(429, { error: 'Quota horaire atteint, réessayez plus tard.' }, { 'Retry-After': '30' }),
      ],
    ])
    openPortfolio()
    await createPortfolio()

    fireEvent.change(screen.getByLabelText('URL du document Google Docs'), { target: { value: DOC_URL } })
    fireEvent.click(screen.getByRole('button', { name: 'Importer le document' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Quota horaire atteint, réessayez plus tard.')
  })

  it('UC-APP-01-F12 — E5 : API absente (copie statique) : l’import Google Docs renvoie vers collage ou fichier', async () => {
    stubNetwork([
      [/^api\/gdoc-text/, () => textResponse(404, '<!doctype html><h1>Not found</h1>', 'text/html')],
    ])
    openPortfolio()
    await createPortfolio()

    fireEvent.change(screen.getByLabelText('URL du document Google Docs'), { target: { value: DOC_URL } })
    fireEvent.click(screen.getByRole('button', { name: 'Importer le document' }))

    expect((await screen.findByRole('alert')).textContent).toBe(GDOC_UNAVAILABLE_MESSAGE)

    // Variante réseau coupé : fetch lève (hors ligne, DNS…) — même renvoi.
    const offline = stubNetwork([
      [
        /^api\/gdoc-text/,
        () => {
          throw new TypeError('Failed to fetch')
        },
      ],
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Importer le document' }))
    await waitFor(() => expect(offline.calls).toHaveLength(1))
    expect((await screen.findByRole('alert')).textContent).toBe(GDOC_UNAVAILABLE_MESSAGE)
    expect(screen.getByLabelText('Texte du portfolio').value).toBe('')
  })

  it('UC-APP-01-F13 — E6 : date de journée invalide refusée, la date d’origine est conservée', async () => {
    stubNetwork()
    openPortfolio()
    await createPortfolio({ texte: FIXTURE })

    const date1 = screen.getByLabelText('Date de la journée 1')
    fireEvent.change(date1, { target: { value: '2026-02-30' } })
    fireEvent.blur(date1)

    expect((await screen.findByRole('alert')).textContent).toContain('Date invalide')
    expect(date1.getAttribute('aria-invalid')).toBe('true')
    await waitFor(
      () => expect(idb.values(DB, STORE)[0]?.segments[0].date).toBe('2026-01-05'),
      { timeout: 3000 },
    )
  })

  it('UC-APP-01-F14 — E7 : scission sans curseur à l’intérieur de la journée : message d’aide', async () => {
    stubNetwork()
    openPortfolio()
    await createPortfolio({ texte: FIXTURE })

    const dayText = screen.getByLabelText('Texte de la journée 2026-01-06')
    dayText.setSelectionRange(dayText.value.length, dayText.value.length)
    fireEvent.click(screen.getAllByRole('button', { name: 'Scinder au curseur' })[1])

    expect((await screen.findByRole('alert')).textContent).toContain('placez le curseur')
    expect(screen.getByRole('heading', { name: 'Découpage en journées (3)' })).toBeDefined()
  })

  it('UC-APP-01-F15 — E8 : fichier illisible : message, portfolio inchangé', async () => {
    stubNetwork()
    openPortfolio()
    await createPortfolio({ texte: 'Texte conservé.' })

    const broken = new File(['x'], 'corrompu.txt', { type: 'text/plain' })
    broken.text = () => Promise.reject(new Error('lecture interrompue'))
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Importer un fichier .txt ou .md'), {
        target: { files: [broken] },
      })
    })

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Lecture du fichier impossible : lecture interrompue',
    )
    expect(screen.getByLabelText('Texte du portfolio').value).toBe('Texte conservé.')
  })

  it('UC-APP-01-F16 — [comportement ACTUEL, anomalie A-01] fichier .md Windows (CRLF) : les entêtes « ## » ne découpent pas', async () => {
    stubNetwork()
    openPortfolio()
    await createPortfolio()

    const windows = textFile(FIXTURE.replace(/\n/g, '\r\n'), 'journal-windows.md')
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Importer un fichier .txt ou .md'), {
        target: { files: [windows] },
      })
    })

    await screen.findByText(/Fichier « journal-windows\.md » importé/)
    // Un seul bloc, daté du jour (repli « aucune date détectée ») au lieu de 3 journées.
    expect(screen.getByRole('heading', { name: 'Découpage en journées (1)' })).toBeDefined()
  })

  it('UC-APP-01-F17 — [comportement ACTUEL, anomalie A-02] identifiant brut collé : bloqué par la validation native du champ URL', async () => {
    // extractGdocId accepte un identifiant nu (20 à 80 caractères), mais le
    // champ est de type « url » : la soumission est empêchée par le navigateur
    // (typeMismatch) avant même le gestionnaire — ni requête, ni message.
    const fetchMock = stubNetwork([[/^api\/gdoc-text/, () => textResponse(200, 'jamais servi')]])
    openPortfolio()
    await createPortfolio({ texte: 'Texte conservé.' })

    const field = screen.getByLabelText('URL du document Google Docs')
    fireEvent.change(field, { target: { value: DOC_ID } })
    expect(field.validity.typeMismatch).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Importer le document' }))

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchMock.calls).toHaveLength(0)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('Texte du portfolio').value).toBe('Texte conservé.')
  })

  it('UC-APP-01-F26 — [comportement ACTUEL, anomalie A-04] changement de portfolio pendant la pause : le portfolio ouvert est réenregistré, la liste garde l’ancien titre', async () => {
    stubNetwork()
    openPortfolio()
    await createPortfolio({ titre: 'Premier', texte: '## 2026-01-05\nPremier jour.' })
    const premier = (await savedRecords((r) => r.titre === 'Premier')).find((r) => r.titre === 'Premier')

    await createPortfolio({ titre: 'Second' })
    fireEvent.change(screen.getByLabelText('Texte du portfolio'), {
      target: { value: '## 2026-02-01\nTexte saisi juste avant de changer.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Premier' }))

    // Le minuteur de la sauvegarde différée n'est pas annulé : à échéance, il
    // enregistre le portfolio COURANT, c'est-à-dire « Premier », sans aucune
    // modification (updatedAt changé, statut « Enregistré localement »).
    await waitFor(
      () => {
        const again = idb.values(DB, STORE).find((r) => r.id === premier.id)
        expect(again.updatedAt).not.toBe(premier.updatedAt)
      },
      { timeout: 3000 },
    )
    const again = idb.values(DB, STORE).find((r) => r.id === premier.id)
    expect(again.texte).toBe(premier.texte)
    expect(await screen.findByText(/Enregistré localement à/)).toBeDefined()

    // La sauvegarde immédiate de « Second » ne met pas la liste à jour : la
    // barre latérale affiche encore « Portfolio sans titre ».
    const sidebar = screen.getByRole('complementary', { name: 'Mes portfolios' })
    const titles = within(sidebar)
      .getAllByRole('button')
      .filter((button) => button.className.includes('portfolio-list-open'))
      .map((button) => button.textContent)
    expect(titles).toEqual(['Premier', 'Portfolio sans titre'])
    expect(idb.values(DB, STORE).map((r) => r.titre).sort()).toEqual(['Premier', 'Second'])
  })

  it('UC-APP-01-F27 — [comportement ACTUEL, anomalie A-05] quitter #/portfolio pendant la pause de 600 ms : la dernière modification est perdue', async () => {
    stubNetwork()
    openPortfolio()
    await createPortfolio({ titre: 'Journal', texte: 'Premier jour.' })
    await savedRecords((r) => r.texte === 'Premier jour.')

    fireEvent.change(screen.getByLabelText('Texte du portfolio'), {
      target: { value: 'Premier jour. Ajout de dernière minute.' },
    })
    // Navigation vers le tableau de bord AVANT l'échéance : la vue est
    // démontée, son minuteur annulé, et rien n'est sauvegardé au démontage.
    act(() => {
      window.location.hash = '#/espace'
    })
    await waitFor(() => expect(screen.queryByLabelText('Texte du portfolio')).toBeNull())
    await new Promise((resolve) => setTimeout(resolve, 1000))

    expect(idb.values(DB, STORE).map((r) => r.texte)).toEqual(['Premier jour.'])
  })

  it('UC-APP-01-F28 — E9 (RG6) : identifiant extrait d’une URL mais invalide → 422 du serveur, message affiché, texte conservé', async () => {
    // Côté navigateur, un identifiant extrait d'une URL n'est pas borné (20–80) :
    // la requête part, et c'est le serveur qui refuse.
    const fetchMock = stubNetwork([
      ['api/gdoc-text?docId=abc', () => jsonResponse(422, { error: 'Identifiant de document Google Docs invalide.' })],
    ])
    openPortfolio()
    await createPortfolio({ texte: 'Texte déjà saisi.' })

    fireEvent.change(screen.getByLabelText('URL du document Google Docs'), {
      target: { value: 'https://docs.google.com/document/d/abc/edit' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Importer le document' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Identifiant de document Google Docs invalide.')
    expect(fetchMock.calls.map((c) => c.url)).toEqual(['api/gdoc-text?docId=abc'])
    expect(screen.getByLabelText('Texte du portfolio').value).toBe('Texte déjà saisi.')
  })

  it('UC-APP-01-F29 — E10 : ouverture, suppression ou export locaux impossibles : message explicite, données intactes', async () => {
    stubNetwork()
    openPortfolio()
    await createPortfolio({ titre: 'Ancien', texte: 'Texte ancien.' })
    await savedRecords((r) => r.titre === 'Ancien')
    await createPortfolio({ titre: 'Courant', texte: 'Texte courant.' })
    await savedRecords((r) => r.titre === 'Courant')

    // Ouverture : la lecture IndexedDB échoue.
    idb.failNextRequest('get', 'base corrompue')
    fireEvent.click(screen.getByRole('button', { name: 'Ancien' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Impossible d’ouvrir ce portfolio : base corrompue')
    expect(screen.getByLabelText('Texte du portfolio').value).toBe('Texte courant.')

    // Suppression : l'effacement échoue, l'enregistrement reste.
    idb.failNextRequest('delete', 'disque plein')
    const item = screen.getByRole('button', { name: 'Ancien' }).closest('li')
    fireEvent.click(within(item).getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(within(item).getByRole('button', { name: 'Confirmer la suppression' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Suppression impossible : disque plein')
    expect(idb.values(DB, STORE).map((r) => r.titre).sort()).toEqual(['Ancien', 'Courant'])

    // Export : le navigateur refuse de créer le fichier.
    URL.createObjectURL = vi.fn(() => {
      throw new Error('Blob refusé')
    })
    URL.revokeObjectURL = vi.fn()
    fireEvent.click(screen.getByRole('button', { name: 'Exporter (.md)' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Export impossible : Blob refusé')
  })
})
