// Interface ultime — P6 : copie serveur et lien de partage pour ADULTES (spec
// §12). Critère d'acceptation (§14) : « un mineur n'a jamais accès à la
// fonction ». Côté interface : sans compte apprenant, sans module activé, ou
// sans attestation de majorité, rien ne permet de publier ni de créer un lien,
// et aucun appel de publication n'est jamais fait (le serveur le refuse de son
// côté : api/tests/CartoPartageTest.php).
import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CartoApp from './CartoApp.jsx'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { importFiles } from '../core/import.js'
import { createDataset } from '../core/model.js'
import { parseHash, subscribe } from '../../router.js'
import { LOU_PORTFOLIO, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'

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

/** Faux serveur de partage : même contrat que shareApi.js, en mémoire. */
function fakeApi({ adult = false, required = true } = {}) {
  let attestation = { adult, attestedAt: adult ? '2026-10-01T09:00:00' : null, required }
  const versions = []
  const links = []
  let nextId = 10
  const api = {
    getAdult: vi.fn(async () => attestation),
    setAdult: vi.fn(async (on) => {
      attestation = { adult: on, attestedAt: on ? '2026-10-14T09:00:00' : null, required }
      if (on) return attestation
      // Retrait : le serveur efface les versions partagées et leurs liens.
      const deletedVersions = versions.length
      versions.splice(0)
      links.splice(0)
      return { ...attestation, deletedVersions }
    }),
    listVersions: vi.fn(async () => versions.map(({ document, ...meta }) => ({ ...meta, shares: links.filter((l) => l.cartoId === meta.id && !l.revokedAt).length }))),
    publish: vi.fn(async (document) => {
      const id = nextId++
      versions.push({ id, type: 'partage', titre: document.title, visibility: 'privee', createdAt: '2026-10-14T10:00:00', updatedAt: '2026-10-14T10:00:00', hasDocument: true, document })
      return { id }
    }),
    replaceVersion: vi.fn(async (id, document) => {
      const v = versions.find((x) => x.id === id)
      Object.assign(v, { titre: document.title, document, updatedAt: '2026-10-15T09:00:00' })
      const { document: _d, ...meta } = v
      return meta
    }),
    getVersion: vi.fn(async (id) => ({ ...versions.find((v) => v.id === id) })),
    deleteVersion: vi.fn(async (id) => {
      versions.splice(versions.findIndex((v) => v.id === id), 1)
      return null
    }),
    createLink: vi.fn(async (cartoId, { password }) => {
      const shareId = 100 + links.length
      const token = String(shareId).padStart(32, 'f')
      links.push({ shareId, cartoId, createdAt: '2026-10-14T10:05:00', expiresAt: '2027-01-12T10:05:00', revokedAt: null, password: Boolean(password) })
      return { shareId, token, url: `/#/partage/${token}${password ? '' : '/ouvert'}` }
    }),
    listLinks: vi.fn(async (cartoId) => links.filter((l) => l.cartoId === cartoId).map(({ shareId, createdAt, expiresAt, revokedAt }) => ({ shareId, createdAt, expiresAt, revokedAt }))),
    consultations: vi.fn(async (shareId) => ({
      shareId,
      withPassword: links.find((l) => l.shareId === shareId)?.password ?? false,
      count: 2,
      lastAt: '2026-10-14T11:20:00',
      items: [{ at: '2026-10-14T11:20:00' }, { at: '2026-10-14T10:40:00' }],
    })),
    revokeLink: vi.fn(async (shareId) => {
      links.find((l) => l.shareId === shareId).revokedAt = '2026-10-14T12:00:00'
      return null
    }),
  }
  return { api, versions, links }
}

function Harness({ store, roles = ['apprenant'], share = { serverEnabled: true, adultOnly: true }, api, mode }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => subscribe(setRoute), [])
  return <CartoApp route={route} mode={mode} session={{ roles }} deps={{ store, loadReferential: async () => ({ doc: miniReferential() }), share, shareApi: api }} />
}

const shareLink = () => screen.queryByRole('link', { name: 'Partage' })

beforeEach(() => {
  window.location.hash = '#/cartographie'
  // Les brouillons des versions partagées vivent dans localStorage : chaque scénario part d'un navigateur vierge.
  try {
    localStorage.clear()
  } catch {
    /* stockage indisponible */
  }
})
afterEach(cleanup)

describe('P6 — un mineur n’a jamais accès à la fonction', () => {
  it('visiteur sans compte : pas d’espace Partage, aucun appel au serveur', async () => {
    const { api } = fakeApi()
    render(<Harness store={await louStore()} roles={[]} api={api} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    expect(shareLink()).toBeNull()
    window.location.hash = '#/cartographie/partage'
    expect(await screen.findByText(/réservé aux comptes apprenants connectés, et aux adultes/)).toBeTruthy()
    expect(api.getAdult).not.toHaveBeenCalled()
    expect(api.publish).not.toHaveBeenCalled()
  })

  it('module désactivé (serverEnabled faux) ou copie autonome : pas d’espace Partage', async () => {
    const { api } = fakeApi({ adult: true })
    const store = await louStore()
    const { unmount } = render(<Harness store={store} share={{ serverEnabled: false }} api={api} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    expect(shareLink()).toBeNull()
    unmount()
    render(<Harness store={store} api={api} mode="viewer" />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    expect(shareLink()).toBeNull()
    window.location.hash = '#/cartographie/partage'
    expect(await screen.findByText(/pas disponible dans une copie autonome/)).toBeTruthy()
    expect(api.getAdult).not.toHaveBeenCalled()
  })

  it('compte sans attestation : seule l’attestation est proposée — ni choix, ni publication, ni lien', async () => {
    const { api } = fakeApi({ adult: false })
    window.location.hash = '#/cartographie/partage'
    render(<Harness store={await louStore()} api={api} />)
    expect(await screen.findByRole('heading', { name: 'Le partage par lien est réservé aux personnes majeures' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Nouvelle version partagée' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Publier/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Créer le lien/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Mes versions partagées' })).toBeNull()
    const confirm = screen.getByRole('button', { name: 'Confirmer et continuer' })
    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    expect(api.setAdult).not.toHaveBeenCalled()
    expect(api.publish).not.toHaveBeenCalled()
    expect(api.listVersions).not.toHaveBeenCalled()
  })

  it('même si le client ne l’exige pas (adultOnly faux), l’exigence du serveur s’applique', async () => {
    const { api } = fakeApi({ adult: false, required: true })
    window.location.hash = '#/cartographie/partage'
    render(<Harness store={await louStore()} api={api} share={{ serverEnabled: true, adultOnly: false }} />)
    expect(await screen.findByRole('heading', { name: 'Le partage par lien est réservé aux personnes majeures' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Nouvelle version partagée' })).toBeNull()
  })

  it('l’attestation ouvre la fonction ; la retirer efface les versions du serveur et referme la fonction', async () => {
    const { api, versions, links } = fakeApi({ adult: false })
    window.location.hash = '#/cartographie/partage'
    render(<Harness store={await louStore()} api={api} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /J’atteste avoir 18 ans ou plus/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer et continuer' }))
    expect(await screen.findByRole('heading', { name: 'Nouvelle version partagée' })).toBeTruthy()
    expect(api.setAdult).toHaveBeenCalledWith(true)
    await api.publish({ kind: 'carto-partage', title: 'Une version' })
    links.push({ shareId: 1, cartoId: 10, revokedAt: null })

    // On propose de tout télécharger avant ; le retrait dit qu'il efface.
    expect(screen.getByText(/Retirer cette attestation efface aussitôt vos versions partagées du serveur/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retirer mon attestation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer : effacer mes versions partagées' }))
    expect(await screen.findByRole('heading', { name: 'Le partage par lien est réservé aux personnes majeures' })).toBeTruthy()
    expect(api.setAdult).toHaveBeenLastCalledWith(false)
    expect(versions).toHaveLength(0)
    expect(links).toHaveLength(0)
    // L'avis s'affiche aussi après le retrait (hors de l'espace réservé aux adultes).
    expect(screen.getByText('Attestation retirée : 1 version partagée et ses liens ont été effacés du serveur.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Nouvelle version partagée' })).toBeNull()
  })
})

describe('P6 — composer, relire, publier', () => {
  async function openComposer(api) {
    window.location.hash = '#/cartographie/partage'
    render(<Harness store={await louStore()} api={api} />)
    return screen.findByRole('heading', { name: 'Nouvelle version partagée' })
  }

  it('liste positive : retirer une compétence la retire de la version (jamais « Supprimer ») ; aucun extrait par défaut', async () => {
    const { api } = fakeApi({ adult: true })
    await openComposer(api)
    expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull()
    const keep302 = screen.getByRole('checkbox', { name: 'Garder 3.02 Itération dans la version partagée' })
    expect(keep302.checked).toBe(true)
    fireEvent.click(keep302)
    expect(keep302.checked).toBe(false)
    // Le pôle 3 passe à l'état mixte.
    const pole3 = screen.getByRole('checkbox', { name: /Pôle MAIN — Créer/ })
    expect(pole3.getAttribute('aria-checked')).toBe('mixed')

    fireEvent.click(screen.getByRole('button', { name: 'Suivant : relire' }))
    expect(await screen.findByRole('heading', { name: 'Relire avant de publier' })).toBeTruthy()
    expect(screen.getByText(/Aucun extrait : seuls le soleil/)).toBeTruthy()
    const next = screen.getByRole('button', { name: 'Suivant : aperçu' })
    expect(next.disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /J’ai relu le titre et les extraits/ }))
    fireEvent.click(next)

    // Aperçu verrouillé = la vue du destinataire.
    const preview = await screen.findByLabelText('Aperçu verrouillé de la version partagée')
    expect(within(preview).getByRole('heading', { name: 'Ma cartographie de compétences' })).toBeTruthy()
    expect(within(preview).queryByText(/Itération/)).toBeNull()
    const publish = screen.getByRole('button', { name: 'Publier la version partagée' })
    expect(publish.disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /Je demande l’enregistrement de cette version partagée/ }))
    expect(publish.disabled).toBe(true) // l'attestation vaut pour CETTE publication aussi
    fireEvent.click(screen.getByRole('checkbox', { name: /J’atteste avoir 18 ans ou plus au moment de cette publication/ }))
    fireEvent.click(publish)

    await waitFor(() => expect(api.publish).toHaveBeenCalledTimes(1))
    const doc = api.publish.mock.calls[0][0]
    expect(doc.kind).toBe('carto-partage')
    expect(doc.datePrecision).toBe('month')
    expect(doc.state.competencies.map((c) => c.code)).toEqual(['1.01', '2.01', '3.01'])
    expect(doc.extracts).toEqual([])
    const text = JSON.stringify(doc)
    expect(text).not.toContain('maquette') // rien du portfolio
    expect(text).not.toContain('Lou')
    expect(text).not.toMatch(/"20\d\d-\d\d-\d\d"/) // dates au mois
    expect(await screen.findByText(/est publiée\. Créez maintenant un lien/)).toBeTruthy()
  })

  it('extraits choisis : relus, noms de tiers remplacés, « Retirer de cette version partagée »', async () => {
    const { api } = fakeApi({ adult: true })
    await openComposer(api)
    fireEvent.click(screen.getAllByRole('button', { name: 'Ajouter des extraits' })[1]) // 2.01 Écoute
    const picker = await screen.findByRole('region', { name: /Extraits proposés pour 2\.01/ })
    const box = await within(picker).findByRole('checkbox', { name: /23 déc\. 2025, preuve|23\/12\/2025, preuve|preuve/ })
    await waitFor(() => expect(box.disabled).toBe(false))
    fireEvent.click(box)
    fireEvent.click(screen.getAllByRole('button', { name: 'Ajouter des extraits' })[0]) // 1.01, encore sans extrait
    const picker1 = await screen.findByRole('region', { name: /Extraits proposés pour 1\.01/ })
    const box1 = await within(picker1).findByRole('checkbox', { name: /preuve/ })
    await waitFor(() => expect(box1.disabled).toBe(false))
    fireEvent.click(box1)
    fireEvent.click(screen.getByRole('button', { name: 'Suivant : relire' }))

    await screen.findByRole('heading', { name: 'Relire avant de publier' })
    expect(screen.getByRole('heading', { name: 'Extraits (2)' })).toBeTruthy()
    // Le nom d'un tiers est proposé ; le remplacer change le texte publié.
    fireEvent.click(screen.getByRole('button', { name: 'Remplacer « Sam » par ‹nom›' }))
    expect(await screen.findByText(/J’ai écouté ‹nom› expliquer son idée/)).toBeTruthy()
    // Retirer l'extrait de 1.01.
    const items = screen.getAllByRole('button', { name: 'Retirer de cette version partagée' })
    fireEvent.click(items[0])
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Extraits (1)' })).toBeTruthy())

    fireEvent.click(screen.getByRole('checkbox', { name: /J’ai relu le titre et les extraits/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Suivant : aperçu' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /Je demande l’enregistrement/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /J’atteste avoir 18 ans ou plus au moment de cette publication/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Publier la version partagée' }))
    await waitFor(() => expect(api.publish).toHaveBeenCalledTimes(1))
    const doc = api.publish.mock.calls[0][0]
    expect(doc.extracts).toHaveLength(1)
    expect(doc.extracts[0]).toMatchObject({ code: '2.01', date: '2025-12', role: 'preuve' })
    expect(doc.extracts[0].text).toContain('‹nom›')
    expect(JSON.stringify(doc)).not.toContain('Sam')
  })
})

describe('P6 — le titre se relit comme les extraits', () => {
  it('un nom du titre est proposé et remplacé ; changer le titre après relecture annule la relecture', async () => {
    const { api } = fakeApi({ adult: true })
    window.location.hash = '#/cartographie/partage'
    render(<Harness store={await louStore()} api={api} />)
    await screen.findByRole('heading', { name: 'Nouvelle version partagée' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Titre vu par le destinataire' }), { target: { value: 'Mon année avec Camille, camille@exemple.org' } })
    fireEvent.click(screen.getByRole('button', { name: 'Suivant : relire' }))
    await screen.findByRole('heading', { name: 'Relire avant de publier' })
    expect(screen.getByText('Mon année avec Camille, ‹courriel›')).toBeTruthy() // titre publié, masque appliqué
    expect(screen.getByRole('checkbox', { name: /courriels \(1\)/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remplacer « Camille » par ‹nom›' }))
    expect(await screen.findByText('Mon année avec ‹nom›, ‹courriel›')).toBeTruthy()

    fireEvent.click(screen.getByRole('checkbox', { name: /J’ai relu le titre et les extraits/ }))
    expect(screen.getByRole('button', { name: 'Suivant : aperçu' }).disabled).toBe(false)
    // Retour au choix, titre modifié : la relecture est à refaire.
    fireEvent.click(screen.getByRole('button', { name: 'Retour' }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'Titre vu par le destinataire' }), { target: { value: 'Mon année' } })
    fireEvent.click(screen.getByRole('button', { name: 'Suivant : relire' }))
    await screen.findByRole('heading', { name: 'Relire avant de publier' })
    expect(screen.getByRole('checkbox', { name: /J’ai relu le titre et les extraits/ }).checked).toBe(false)
    expect(screen.getByRole('button', { name: 'Suivant : aperçu' }).disabled).toBe(true)
  })
})

describe('P6 — gérer les versions publiées', () => {
  it('une nouvelle version se publie, par défaut, À LA PLACE de la plus récente : même lien, choix d’une version distincte possible', async () => {
    const { api, versions, links } = fakeApi({ adult: true })
    window.location.hash = '#/cartographie/partage'
    render(<Harness store={await louStore()} api={api} />)
    await screen.findByRole('heading', { name: 'Nouvelle version partagée' })
    const publishOnce = async ({ distinct = false } = {}) => {
      fireEvent.click(screen.getByRole('button', { name: 'Suivant : relire' }))
      fireEvent.click(await screen.findByRole('checkbox', { name: /J’ai relu le titre et les extraits/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Suivant : aperçu' }))
      await screen.findByLabelText('Aperçu verrouillé de la version partagée')
      fireEvent.click(screen.getByRole('checkbox', { name: /Je demande l’enregistrement/ }))
      fireEvent.click(screen.getByRole('checkbox', { name: /J’atteste avoir 18 ans ou plus au moment de cette publication/ }))
      if (distinct) fireEvent.click(screen.getByRole('radio', { name: /comme une version distincte/ }))
    }
    // Première publication : rien à remplacer.
    await publishOnce()
    expect(screen.queryByRole('radio', { name: /à la place de/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Publier la version partagée' }))
    await waitFor(() => expect(api.publish).toHaveBeenCalledTimes(1))
    await api.createLink(10, {})

    // Deuxième : on masque une compétence ; par défaut, elle remplace la première.
    fireEvent.change(screen.getByRole('textbox', { name: 'Titre vu par le destinataire' }), { target: { value: 'Version allégée' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Garder 3.02 Itération dans la version partagée' }))
    await publishOnce()
    const radio = screen.getByRole('radio', { name: /à la place de « Ma cartographie de compétences »/ })
    expect(radio.checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Publier à la place de « Ma cartographie de compétences »' }))
    await waitFor(() => expect(api.replaceVersion).toHaveBeenCalledTimes(1))
    expect(api.replaceVersion.mock.calls[0][0]).toBe(10)
    expect(api.replaceVersion.mock.calls[0][1].state.competencies.map((c) => c.code)).not.toContain('3.02')
    expect(api.publish).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/« Version allégée » remplace la version précédente : ses liens montrent désormais cette version\./)).toBeTruthy()
    expect(versions).toHaveLength(1)
    expect(links).toHaveLength(1) // le lien existant montre la nouvelle version
    expect(await screen.findByText(/remplacée le .*15 oct\. 2026/)).toBeTruthy()

    // « Publier une nouvelle version à la place » reprend sa composition (gardée dans ce navigateur).
    fireEvent.change(screen.getByRole('textbox', { name: 'Titre vu par le destinataire' }), { target: { value: 'Brouillon en cours' } })
    const item = screen.getByRole('heading', { name: 'Version allégée' }).closest('li')
    // La version qu'on vient de publier est déjà dépliée.
    const toggle = within(item).queryByRole('button', { name: 'Liens et accès' })
    if (toggle) fireEvent.click(toggle)
    fireEvent.click(await within(item).findByRole('button', { name: 'Publier une nouvelle version à la place' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Titre vu par le destinataire' }).value).toBe('Version allégée'))
    expect(screen.getByRole('checkbox', { name: 'Garder 3.02 Itération dans la version partagée' }).checked).toBe(false)
    expect(await screen.findByText(/Composition de « Version allégée » reprise : modifiez-la, puis publiez à sa place\./)).toBeTruthy()

    // Une version distincte reste possible.
    await publishOnce({ distinct: true })
    fireEvent.click(screen.getByRole('button', { name: 'Publier la version partagée' }))
    await waitFor(() => expect(api.publish).toHaveBeenCalledTimes(2))
    expect(versions).toHaveLength(2)
  })

  it('par défaut, jamais à la place d’une version publiée depuis un autre jeu ; les brouillons des versions disparues sont effacés', async () => {
    const { api } = fakeApi({ adult: true })
    // Une version publiée depuis un AUTRE jeu (son brouillon est rangé sous cet autre jeu)…
    await api.publish({ kind: 'carto-partage', title: 'Journal 2025, pour A' })
    localStorage.setItem('humanome-carto-share-draft:ds-autre:10', JSON.stringify({ title: 'Journal 2025, pour A' }))
    // …et le brouillon d'une version de CE jeu qui n'est plus sur le serveur.
    localStorage.setItem('humanome-carto-share-draft:ds-lou:999', JSON.stringify({ title: 'Retirée ailleurs', chosen: [{ text: 'un extrait' }] }))
    window.location.hash = '#/cartographie/partage'
    render(<Harness store={await louStore()} api={api} />)
    await screen.findByRole('heading', { name: 'Journal 2025, pour A' })
    await waitFor(() => expect(localStorage.getItem('humanome-carto-share-draft:ds-lou:999')).toBeNull())
    expect(localStorage.getItem('humanome-carto-share-draft:ds-autre:10')).not.toBeNull() // un autre jeu : pas touché

    fireEvent.click(screen.getByRole('button', { name: 'Suivant : relire' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /J’ai relu le titre et les extraits/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Suivant : aperçu' }))
    await screen.findByLabelText('Aperçu verrouillé de la version partagée')
    expect(screen.getByRole('radio', { name: /comme une version distincte/ }).checked).toBe(true)
    expect(screen.getByRole('radio', { name: /à la place de « Journal 2025, pour A »/ }).checked).toBe(false)
    expect(screen.getByRole('button', { name: 'Publier la version partagée' })).toBeTruthy()
  })

  it('lien sans mot de passe (copié une seule fois), journal des accès, révocation, retrait', async () => {
    const { api, versions } = fakeApi({ adult: true })
    await api.publish({ kind: 'carto-partage', title: 'Version de juin' })
    window.location.hash = '#/cartographie/partage'
    render(<Harness store={await louStore()} api={api} />)
    const item = (await screen.findByRole('heading', { name: 'Version de juin' })).closest('li')
    expect(within(item).getByText(/Privée : aucun lien actif/)).toBeTruthy()
    fireEvent.click(within(item).getByRole('button', { name: 'Liens et accès' }))
    expect(await within(item).findByText('Aucun lien pour l’instant.')).toBeTruthy()

    fireEvent.click(within(item).getByRole('button', { name: 'Créer le lien' }))
    const url = await within(item).findByRole('textbox', { name: 'Lien de partage' })
    expect(url.value).toMatch(/#\/partage\/f+100\/ouvert$/)
    expect(api.createLink).toHaveBeenCalledWith(10, { expiresInDays: 90, password: undefined })
    expect(within(item).getByText(/il ne sera plus affiché/)).toBeTruthy()

    expect(await within(item).findByText(/Consulté 2 fois/)).toBeTruthy()
    fireEvent.click(within(item).getByRole('button', { name: 'Journal des accès' }))
    expect(within(item).getByRole('list', { name: 'Dates des consultations' }).children).toHaveLength(2)

    fireEvent.click(within(item).getByRole('button', { name: 'Révoquer' }))
    fireEvent.click(within(item).getByRole('button', { name: 'Confirmer la révocation' }))
    await waitFor(() => expect(api.revokeLink).toHaveBeenCalledWith(100))
    expect(await within(item).findByText('révoqué')).toBeTruthy()

    // Mot de passe trop court : refusé avant tout appel.
    fireEvent.change(within(item).getByLabelText(/Mot de passe \(facultatif\)/), { target: { value: 'court' } })
    fireEvent.click(within(item).getByRole('button', { name: 'Créer le lien' }))
    expect(await within(item).findByText(/au moins 8 caractères/)).toBeTruthy()
    expect(api.createLink).toHaveBeenCalledTimes(1)

    fireEvent.click(within(item).getByRole('button', { name: 'Retirer cette version du serveur' }))
    fireEvent.click(within(item).getByRole('button', { name: 'Confirmer : effacer la version et ses liens' }))
    await waitFor(() => expect(api.deleteVersion).toHaveBeenCalledWith(10))
    expect(versions).toHaveLength(0)
    expect(await screen.findByText('Aucune version partagée sur le serveur.')).toBeTruthy()
  })
})
