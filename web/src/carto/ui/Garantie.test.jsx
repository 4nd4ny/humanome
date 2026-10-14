// Interface ultime — version partagée publiée par un cartographe, à la demande
// de l'apprenant, avec sa garantie (décision de Christian du 2026-10-14,
// journal D-42). Le compositeur ne change pas ; seul celui qui publie change,
// et la garantie se lit sur la version. Côté serveur :
// api/tests/CartoGarantieTest.php.
import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import CartoApp from './CartoApp.jsx'
import { SharedView } from './SharedView.jsx'
import { normalizeRequestCode } from './SharePanel.jsx'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { importFiles } from '../core/import.js'
import { createDataset } from '../core/model.js'
import { parseHash, subscribe } from '../../router.js'
import { LOU_PORTFOLIO, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'
import { fakeShareApi } from '../test/fake-share-api.js'
import doc from '../../../../schemas/fixtures/partage/carto-partage-exemple.json'

const NOW = '2026-10-13T12:00:00.000Z'

async function louStore() {
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  const ds = createDataset({ datasetId: 'ds-lou', title: 'Lou', referential: miniReferential(), now: NOW })
  const files = [{ path: 'lou.md', text: LOU_PORTFOLIO }]
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  await store.commit(await importFiles(files, ds, { now: NOW }))
  return store
}

function Harness({ store, roles, api }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => subscribe(setRoute), [])
  return (
    <CartoApp
      route={route}
      session={{ roles }}
      deps={{ store, loadReferential: async () => ({ doc: miniReferential() }), share: { serverEnabled: true, adultOnly: true }, shareApi: api }}
    />
  )
}

async function openShare(api, roles) {
  window.location.hash = '#/cartographie/partage'
  render(<Harness store={await louStore()} roles={roles} api={api} />)
  return screen.findByRole('heading', { name: 'Partager par lien' })
}

const draftKeys = () => Object.keys(localStorage).filter((k) => k.startsWith('humanome-carto-share-draft:'))

beforeEach(() => {
  window.location.hash = '#/cartographie'
  localStorage.clear()
})
afterEach(cleanup)

describe('l’apprenant demande une version garantie', () => {
  it('un code de demande, après l’attestation de cette demande ; il s’annule en deux temps', async () => {
    const { api, requests } = fakeShareApi({ adult: true })
    await openShare(api, ['apprenant'])
    const section = (await screen.findByRole('heading', { name: 'Faire publier une version par votre cartographe' })).closest('section')
    expect(within(section).getByText(/il atteste avoir vérifié ce que vous avez fait, ce que l’analyse par IA a détecté et ce qu’en a vu le groupe classe/)).toBeTruthy()
    const create = within(section).getByRole('button', { name: 'Créer un code de demande' })
    expect(create.disabled).toBe(true)
    fireEvent.click(within(section).getByRole('checkbox', { name: /J’atteste avoir 18 ans ou plus au moment de cette demande/ }))
    fireEvent.click(create)

    await waitFor(() => expect(api.requestGuarantee).toHaveBeenCalledWith({ replacesId: null }))
    const shown = await within(section).findByRole('status')
    expect(shown.textContent).toContain(requests[0].code)
    expect(shown.textContent).toMatch(/Remettez-le à votre cartographe ; il est valable jusqu’au ven\. 13 nov\. 2026\./)
    expect(await within(section).findByRole('heading', { name: 'Demandes en attente' })).toBeTruthy()

    fireEvent.click(within(section).getByRole('button', { name: 'Annuler la demande' }))
    fireEvent.click(within(section).getByRole('button', { name: 'Confirmer l’annulation' }))
    await waitFor(() => expect(requests).toHaveLength(0))
    await waitFor(() => expect(within(section).queryByRole('heading', { name: 'Demandes en attente' })).toBeNull())
    expect(within(section).queryByRole('status')).toBeNull()
  })

  it('une demande peut viser une version existante, à remplacer sous le même lien', async () => {
    const { api } = fakeShareApi({ adult: true })
    await api.publish({ kind: 'carto-partage', title: 'Version de juin' })
    await openShare(api, ['apprenant'])
    const section = (await screen.findByRole('heading', { name: 'Faire publier une version par votre cartographe' })).closest('section')
    fireEvent.click(await within(section).findByRole('radio', { name: /une version pour remplacer « Version de juin »/ }))
    fireEvent.click(within(section).getByRole('checkbox', { name: /au moment de cette demande/ }))
    fireEvent.click(within(section).getByRole('button', { name: 'Créer un code de demande' }))
    await waitFor(() => expect(api.requestGuarantee).toHaveBeenCalledWith({ replacesId: 10 }))
    expect((await within(section).findByRole('status')).textContent).toMatch(/pour remplacer « Version de juin »/)
  })
})

describe('le cartographe publie pour la personne, avec sa garantie', () => {
  it('compte cartographe seul : l’espace Partage s’offre à lui, sans attestation de sa part ; un code faux ou inconnu n’ouvre rien', async () => {
    const { api } = fakeShareApi({ adult: true })
    await openShare(api, ['cartographe'])
    expect(screen.getByRole('link', { name: 'Partage' })).toBeTruthy()
    expect(api.getAdult).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Nouvelle version partagée' })).toBeNull()
    const desk = screen.getByRole('heading', { name: 'Publier pour une personne, avec votre garantie' }).closest('section')
    fireEvent.change(within(desk).getByLabelText(/Code de demande/), { target: { value: 'abc' } })
    fireEvent.click(within(desk).getByRole('button', { name: 'Ouvrir la demande' }))
    expect((await within(desk).findByRole('alert')).textContent).toMatch(/10 caractères/)
    expect(api.openRequest).not.toHaveBeenCalled()
    fireEvent.change(within(desk).getByLabelText(/Code de demande/), { target: { value: 'zzzz-zzzz-zz' } })
    fireEvent.click(within(desk).getByRole('button', { name: 'Ouvrir la demande' }))
    expect((await within(desk).findByRole('alert')).textContent).toMatch(/Aucune demande en attente ne correspond à ce code/)
    expect(api.openRequest).toHaveBeenCalledWith('ZZZZZZZZZZ')
  })

  it('il ouvre la demande, compose avec le même compositeur, et publie dans le compte de la personne avec sa garantie', async () => {
    const { api, versions } = fakeShareApi({ adult: true, apprenant: 'Lou', garant: 'Carl' })
    const { code } = await api.requestGuarantee() // remis par Lou
    await openShare(api, ['cartographe'])
    const desk = screen.getByRole('heading', { name: 'Publier pour une personne, avec votre garantie' }).closest('section')
    fireEvent.change(within(desk).getByLabelText(/Code de demande/), { target: { value: code.toLowerCase() } })
    fireEvent.click(within(desk).getByRole('button', { name: 'Ouvrir la demande' }))

    expect(await screen.findByRole('heading', { name: 'Version garantie pour Lou' })).toBeTruthy()
    expect(within(desk).getByText(/Demande de/).textContent).toMatch(/Lou.*pour une nouvelle version.*Jeu de données ouvert : « Lou »/s)
    expect(screen.getByText(/Vous composez la version de Lou depuis le jeu de données ouvert, « Lou »/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Suivant : relire' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /J’ai relu le titre et les extraits/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Suivant : aperçu' }))

    // L'aperçu est exactement ce que verra le destinataire : la garantie y figure.
    const preview = await screen.findByLabelText('Aperçu verrouillé de la version partagée')
    expect(within(preview).getByTestId('share-garantie').textContent).toMatch(/^Relue et garantie par Carl, le .+, qui atteste avoir vérifié ce que la personne a fait/)
    // Ni la demande de copie ni l'attestation de majorité de l'apprenant : sa garantie à lui.
    expect(screen.queryByRole('checkbox', { name: /Je demande l’enregistrement/ })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /au moment de cette publication/ })).toBeNull()
    expect(screen.queryByRole('radio', { name: /à la place de/ })).toBeNull()
    expect(screen.getByText(/c’est Lou qui décide de la montrer \(lien\), et qui peut la\s+retirer à tout moment/)).toBeTruthy()

    const publish = screen.getByRole('button', { name: 'Publier pour Lou, avec ma garantie' })
    expect(publish.disabled).toBe(true)
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /Je garantis cette version : j’atteste avoir vérifié ce que Lou a fait, ce que l’analyse par IA a détecté et ce qu’en a vu le groupe classe qui travaille avec Lou sur un projet commun/,
      }),
    )
    fireEvent.click(publish)

    await waitFor(() => expect(api.publishGuaranteed).toHaveBeenCalledTimes(1))
    const [usedCode, doc] = api.publishGuaranteed.mock.calls[0]
    expect(usedCode).toBe(code)
    expect(doc.kind).toBe('carto-partage')
    expect(doc.state.competencies.map((c) => c.code)).toEqual(['1.01', '2.01', '3.01', '3.02'])
    expect(api.publish).not.toHaveBeenCalled()
    expect(versions).toHaveLength(1)
    expect(versions[0].garantie.par).toBe('Carl')
    expect(await screen.findByText(/est publiée dans le compte de Lou, avec votre garantie\. C’est à Lou de décider de la partager\./)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Version garantie pour Lou' })).toBeNull()
    expect(draftKeys()).toEqual([]) // la version n'est pas à lui : rien n'est gardé ici

    // La copie de la cartographie de Lou, dans ce navigateur : il peut l'effacer aussitôt (D-43).
    const erase = screen.getByTestId('erase-after-publication')
    expect(erase.textContent).toContain('« Lou » est, dans ce navigateur, une copie de la cartographie de Lou.')
    fireEvent.click(within(erase).getByRole('button', { name: 'Effacer « Lou » de ce navigateur' }))
    fireEvent.click(within(erase).getByRole('button', { name: 'Confirmer : effacer ce jeu' }))
    // Plus aucun jeu : l'interface revient à l'accueil (fichiers ou démonstration).
    expect(await screen.findByRole('button', { name: 'Explorer la démonstration' })).toBeTruthy()
  })

  it('compte apprenant et cartographe : ouvrir une demande remplace le temps de la publication son propre compositeur', async () => {
    const { api } = fakeShareApi({ adult: true, apprenant: 'Sam' })
    const { code } = await api.requestGuarantee()
    await openShare(api, ['apprenant', 'cartographe'])
    expect(await screen.findByRole('heading', { name: 'Nouvelle version partagée' })).toBeTruthy()
    const desk = screen.getByRole('heading', { name: 'Publier pour une personne, avec votre garantie' }).closest('section')
    fireEvent.change(within(desk).getByLabelText(/Code de demande/), { target: { value: code } })
    fireEvent.click(within(desk).getByRole('button', { name: 'Ouvrir la demande' }))
    expect(await screen.findByRole('heading', { name: 'Version garantie pour Sam' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Nouvelle version partagée' })).toBeNull()
    fireEvent.click(within(desk).getByRole('button', { name: 'Fermer cette demande sans publier' }))
    expect(await screen.findByRole('heading', { name: 'Nouvelle version partagée' })).toBeTruthy()
    expect(api.publishGuaranteed).not.toHaveBeenCalled()
  })
})

describe('la garantie, côté apprenant et côté destinataire', () => {
  it('l’apprenant voit sa version garantie ; la remplacer lui-même, l’interface le dit, retire la garantie', async () => {
    const { api } = fakeShareApi({ adult: true, garant: 'Carl' })
    await api.publishGuaranteed((await api.requestGuarantee()).code, { kind: 'carto-partage', title: 'Relue avec Carl' })
    await api.publish({ kind: 'carto-partage', title: 'Publiée par moi' })
    await openShare(api, ['apprenant'])
    const list = (await screen.findByRole('heading', { name: 'Mes versions partagées' })).closest('section')
    expect(await within(list).findByText(/Garantie par Carl, le mer\. 14 oct\. 2026 : publiée à votre demande\./)).toBeTruthy()
    expect(within(list).getByText('Publiée par vous, sans garantie de cartographe.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Suivant : relire' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /J’ai relu le titre et les extraits/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Suivant : aperçu' }))
    expect(await screen.findByRole('radio', { name: /à la place de « Relue avec Carl ».*la garantie de Carl sera retirée/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /à la place de « Publiée par moi »/ })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: /à la place de « Publiée par moi ».*garantie/ })).toBeNull()
  })

  it('le destinataire lit qui garantit et ce que couvre la garantie ; sans garantie, la vue le dit', () => {
    render(<SharedView doc={doc} garantie={{ par: 'Carl', date: '2026-10-14T11:00:00' }} />)
    expect(screen.getByTestId('share-garantie').textContent).toBe(
      'Relue et garantie par Carl, le 14 octobre 2026, qui atteste avoir vérifié ce que la personne a fait, ce que l’analyse par IA a détecté et ce qu’en a vu le groupe classe qui travaille avec elle sur un projet commun.',
    )
    expect(screen.queryByTestId('share-sans-garantie')).toBeNull()
    cleanup()
    render(<SharedView doc={doc} />)
    expect(screen.getByTestId('share-sans-garantie').textContent).toBe('Publiée par la personne elle-même : aucun cartographe ne l’a garantie.')
    expect(screen.queryByTestId('share-garantie')).toBeNull()
  })

  it('un code se recopie comme on l’a noté : majuscules, sans espaces ni tirets', () => {
    expect(normalizeRequestCode(' abcd-efgh 23 ')).toBe('ABCDEFGH23')
  })
})
