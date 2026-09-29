// UC-VIS-04 — Se repérer (accueil, navigation, guides, aide, confidentialité) : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-04-se-reperer-guides-aide.md
//
// Le visiteur (ou un compte) parcourt l'application ENTIÈRE (<App/>) : accueil
// et tuiles du plan du site, menu par familles, aide « ? », guides publics
// avec progression locale, thème, page confidentialité, page introuvable.
// La session du SHELL est le plus souvent injectée (fetchMeFn) ; F16 et F17
// exercent la vraie sonde (fetchMe → GET api/auth/me). Réseau simulé : GET
// api/auth/me répond 401 (visiteur) — c'est ce que reçoivent les vues qui
// sondent elles-mêmes la session (Guides, espace cartographe) ; aucune autre
// requête n'est attendue de ces pages.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { calledUrls, jsonResponse } from '../support/vis.js'

const visitor = async () => ({ user: null })

function stubNetwork({ offline = false } = {}) {
  const mock = vi.fn(async (url) => {
    if (offline) throw new TypeError('Failed to fetch')
    return String(url) === 'api/auth/me' ? jsonResponse(401, { error: 'Authentification requise' }) : jsonResponse(404, {})
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

function openApp(hash, fetchMeFn = visitor) {
  window.location.hash = hash
  return render(<App lib={fakeLib} fetchMeFn={fetchMeFn} />)
}

function goTo(hash) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

const mainNav = () => within(screen.getByRole('navigation', { name: 'Navigation principale' }))

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.location.hash = ''
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  delete window.matchMedia
})

describe('UC-VIS-04 — accueil et navigation', () => {
  it('UC-VIS-04-F05 — nominal : accueil du visiteur — présentation, actions, plan du site, menu « Découvrir » + « Compte », pied de page', async () => {
    const network = stubNetwork()
    openApp('#/')

    expect(screen.getByRole('heading', { name: 'humanome.xyz' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Explorer la cartographie de démonstration' }).getAttribute('href')).toBe('#/merge')
    expect(screen.getByRole('link', { name: 'Essayer avec votre propre texte' }).getAttribute('href')).toBe('#/essayer')
    expect(screen.getByRole('button', { name: 'Charger ma cartographie (JSON)' })).toBeDefined()
    const plan = within(screen.getByRole('region', { name: 'Plan du site' }))
    expect(plan.getByRole('heading', { name: 'Explorer le site' })).toBeDefined()
    expect([...document.querySelectorAll('.family')].map((f) => f.dataset.family)).toEqual(['decouvrir', 'compte'])

    // Menu « burger » : ouverture au clic, familles du visiteur.
    const burger = screen.getByRole('button', { name: 'Menu de navigation' })
    fireEvent.click(burger)
    expect(burger.getAttribute('aria-expanded')).toBe('true')
    expect(mainNav().getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Découvrir', 'Compte'])
    expect(mainNav().getByRole('link', { name: 'Accueil' }).getAttribute('aria-current')).toBe('page')
    expect(mainNav().getByRole('link', { name: /^Essayer/ }).textContent).toContain('gratuit')
    // Un clic (souris, detail 1) sur un lien referme le tiroir non épinglé
    // (lien de la page courante : aucune navigation résiduelle entre tests).
    fireEvent.click(mainNav().getByRole('link', { name: 'Accueil' }), { detail: 1 })
    expect(burger.getAttribute('aria-expanded')).toBe('false')

    const footer = document.querySelector('.app-footer')
    expect(within(footer).getByRole('link', { name: 'Confidentialité' }).getAttribute('href')).toBe('#/confidentialite')
    expect(network).not.toHaveBeenCalled() // accueil : aucune requête hors session (session du shell injectée)
  })

  it('UC-VIS-04-F06 — A1 : compte apprenant + cartographe → « Vos espaces », familles de ses rôles, astuce ciblée dans l’aide', async () => {
    stubNetwork()
    openApp('#/', async () => ({ user: { id: 7, displayName: 'Ada', roles: ['apprenant', 'cartographe'], hasAvatar: false } }))

    expect(await screen.findByRole('heading', { name: 'Vos espaces' })).toBeDefined()
    expect([...document.querySelectorAll('.family')].map((f) => f.dataset.family)).toEqual([
      'decouvrir', 'cartographie', 'encadrer', 'compte',
    ])
    expect(screen.queryByRole('button', { name: 'Voir les profils d’utilisateurs' })).toBeNull()
    expect(mainNav().getByRole('link', { name: 'Ma file de relecture' }).getAttribute('href')).toBe('#/cartographe')
    expect(mainNav().getByRole('button', { name: 'Se déconnecter' })).toBeDefined()
    // Identité : lien « Mon profil » avec les initiales (pas d'avatar).
    const profile = mainNav().getByRole('link', { name: 'Mon profil' })
    expect(profile.getAttribute('href')).toBe('#/compte')
    expect(within(profile).getByTestId('avatar-initials').textContent).toBe('AD')

    fireEvent.click(screen.getByRole('button', { name: 'Aide sur cette rubrique' }))
    expect(within(await screen.findByRole('dialog')).getByText(/Vous êtes cartographe/)).toBeDefined()
  })

  it('UC-VIS-04-F07 — A2 + [comportement actuel, anomalie AN3] le visiteur explore les profils ; survol = aide de la rubrique ; 1er clic sélectionne, 2e clic ouvre ; note d’aperçu de l’employeur', async () => {
    stubNetwork()
    openApp('#/')

    fireEvent.click(screen.getByRole('button', { name: 'Voir les profils d’utilisateurs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Établissement' }))
    expect(screen.getByText(/Aperçu du profil/).textContent).toContain('Établissement')
    const link = screen.getByRole('link', { name: /Mes cohortes/ })

    fireEvent.mouseEnter(link)
    expect(document.getElementById('families-callout').textContent).toContain('Espace établissement')
    fireEvent.mouseLeave(link)
    fireEvent.click(link, { button: 0 })
    expect(document.getElementById('families-callout').textContent).toContain('Cliquez à nouveau')
    expect(window.location.hash).toBe('#/')
    fireEvent.click(link, { button: 0 })
    await waitFor(() => expect(window.location.hash).toBe('#/etablissement'))

    // Profil « Employeur » : pas de tuiles, l'explication du lien de partage
    // et l'offre de recherche de profils « à venir ».
    goTo('#/')
    fireEvent.click(screen.getByRole('button', { name: 'Voir les profils d’utilisateurs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Employeur' }))
    expect(document.querySelector('[data-persona="employeur"]').textContent).toContain('pas de page à chercher ici')
    expect(document.querySelector('[data-family="recherche-profils"]').textContent).toContain('à venir')
    // ANOMALIE AN3 — comportement ACTUEL figé : la note d'aperçu, commune à
    // tous les profils, annonce des espaces « une fois connecté » alors que la
    // carte dit « Sans compte — sur invitation ». Attendu : une note propre à l'employeur.
    expect(document.querySelector('[data-family="partage"]').textContent).toContain('Sans compte — sur invitation')
    expect(document.querySelector('.families-note').textContent).toBe(
      'Aperçu du profil Employeur : voici les espaces que ce rôle voit une fois connecté. Les rôles sont attribués par Harmonia Éducation.',
    )
  })

  it('UC-VIS-04-F08 — A3 : aide « ? » de la rubrique ouverte, lien vers les guides, fermée par Échap et au changement de rubrique', async () => {
    stubNetwork()
    openApp('#/essayer')

    fireEvent.click(screen.getByRole('button', { name: 'Aide sur cette rubrique' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Essayer sur votre texte' })).toBeDefined()
    expect(within(dialog).getByRole('link', { name: 'guides de prise en main' }).getAttribute('href')).toBe('#/guides')
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Fermer l’aide' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Aide sur cette rubrique' }))
    await screen.findByRole('dialog')
    goTo('#/referentiel')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Aide sur cette rubrique' }))
    expect(within(await screen.findByRole('dialog')).getByRole('heading', { name: 'Le référentiel de compétences' })).toBeDefined()
  })
})

describe('UC-VIS-04 — guides publics', () => {
  it('UC-VIS-04-F09 — A4 : hub des guides → parcours « Découvrir » → chapitre, progression cochée dans CE navigateur', async () => {
    const network = stubNetwork()
    openApp('#/')
    goTo('#/guides')

    expect(screen.getByRole('heading', { name: 'Guides & prise en main' })).toBeDefined()
    expect(screen.getByRole('region', { name: 'Découvrir' })).toBeDefined()
    const card = screen.getByRole('link', { name: /Découvrir humanome\.xyz/ })
    expect(card.getAttribute('href')).toBe('#/guides/visiteur')
    goTo('#/guides/visiteur')

    const chapterLink = await screen.findByRole('link', { name: /Explorer la démonstration/ })
    expect(chapterLink.getAttribute('href')).toBe('#/guides/visiteur/02-explorer-la-demonstration')
    goTo('#/guides/visiteur/02-explorer-la-demonstration')

    const article = await screen.findByTestId('formation-chapitre')
    expect(article.querySelector('h1').textContent).toBe('Explorer la démonstration')
    expect(screen.getByText(/Progression enregistrée dans ce navigateur uniquement/)).toBeDefined()
    const nav = within(screen.getByRole('navigation', { name: 'Navigation entre chapitres' }))
    expect(nav.getByRole('link', { name: /← Qu'est-ce qu'une cartographie/ }).getAttribute('href')).toBe(
      '#/guides/visiteur/01-qu-est-ce-qu-une-cartographie',
    )
    const done = screen.getByLabelText('Chapitre terminé')
    // Laisse se résoudre le chargement asynchrone de la progression (store.load),
    // qui remplacerait sinon la coche.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    fireEvent.click(done)
    await waitFor(() => expect(done.checked).toBe(true))
    expect(JSON.parse(localStorage.getItem('humanome-training'))).toEqual({
      visiteur: { chapitresTermines: ['02-explorer-la-demonstration'] },
    })
    // Le contenu est embarqué : la seule requête est la sonde de session que
    // GuidesView fait ELLE-MÊME (en plus de celle du shell) pour choisir entre
    // progression locale et progression du compte.
    expect(new Set(calledUrls(network))).toEqual(new Set(['api/auth/me']))
  })

  it('UC-VIS-04-F10 — E2 : guide ou chapitre inconnu → message et lien de retour', async () => {
    stubNetwork()
    openApp('#/guides/inconnu')
    expect(screen.getByRole('alert').textContent).toBe('Guide inconnu : « inconnu ».')
    expect(screen.getByRole('link', { name: 'Retour à tous les guides' }).getAttribute('href')).toBe('#/guides')

    goTo('#/guides/visiteur/99-absent')
    expect((await screen.findByRole('alert')).textContent).toBe('Chapitre introuvable : « 99-absent ».')
    expect(screen.getByRole('link', { name: 'Retour à la liste des chapitres' }).getAttribute('href')).toBe('#/guides/visiteur')
  })

  // ANOMALIE AN1 — comportement ACTUEL figé, vu par le visiteur : cocher un
  // chapitre du guide « employeur » efface la case cochée du guide « visiteur ».
  it('UC-VIS-04-F11 — [comportement actuel, anomalie AN1] la progression locale d’un guide est perdue en cochant un autre guide', async () => {
    stubNetwork()
    openApp('#/guides/visiteur/01-qu-est-ce-qu-une-cartographie')
    const first = await screen.findByLabelText('Chapitre terminé')
    fireEvent.click(first)
    await waitFor(() => expect(first.checked).toBe(true))

    goTo('#/guides/employeur/01-recevoir-une-cartographie')
    await screen.findByTestId('formation-chapitre')
    fireEvent.click(screen.getByLabelText('Chapitre terminé'))
    await waitFor(() => expect(screen.getByLabelText('Chapitre terminé').checked).toBe(true))

    goTo('#/guides/visiteur/01-qu-est-ce-qu-une-cartographie')
    await screen.findByTestId('formation-chapitre')
    await waitFor(() => expect(screen.getByLabelText('Chapitre terminé').checked).toBe(false)) // attendu : true
  })
})

describe('UC-VIS-04 — thème, confidentialité, page introuvable', () => {
  it('UC-VIS-04-F12 — A5 : sans choix, le thème suit le système ; la bascule pose un choix explicite qui prime ensuite', async () => {
    stubNetwork()
    const listeners = new Set()
    const mq = { matches: true, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }
    window.matchMedia = vi.fn(() => mq)
    openApp('#/')

    expect(screen.getByRole('button', { name: 'Passer au thème clair' })).toBeDefined() // système sombre
    act(() => listeners.forEach((fn) => fn({ matches: false })))
    const toggle = screen.getByRole('button', { name: 'Passer au thème sombre' })
    fireEvent.click(toggle)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('humanome-theme')).toBe('dark')
    act(() => listeners.forEach((fn) => fn({ matches: false })))
    expect(screen.getByRole('button', { name: 'Passer au thème clair' })).toBeDefined() // le choix prime
  })

  it('UC-VIS-04-F13 — A6 : pied de page → page confidentialité, contenu embarqué rendu sans aucune requête', async () => {
    const network = stubNetwork()
    openApp('#/')
    const link = within(document.querySelector('.app-footer')).getByRole('link', { name: 'Confidentialité' })
    goTo(link.getAttribute('href'))

    const legal = screen.getByTestId('confidentialite-contenu')
    expect(within(legal).getByRole('heading', { level: 1, name: 'Confidentialité et protection des données' })).toBeDefined()
    expect(within(legal).getByRole('heading', { level: 2, name: 'Vos droits' })).toBeDefined()
    // Liens internes de l'application conservés par le rendu assaini.
    expect(legal.querySelector('a[href^="#/compte"], a[href^="#/espace"]')).not.toBeNull()
    expect(mainNav().getByRole('link', { name: 'Confidentialité' }).getAttribute('aria-current')).toBe('page')
    expect(network).not.toHaveBeenCalled()
  })

  it('UC-VIS-04-F14 — E1 : adresse inconnue → « Page introuvable » avec le fragment demandé et retour à l’accueil ; aide de repli', async () => {
    stubNetwork()
    openApp('#/nulle-part?x=1')

    expect(screen.getByRole('alert').textContent).toBe('Page introuvable : #/nulle-part?x=1')
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' }).getAttribute('href')).toBe('#/')
    fireEvent.click(screen.getByRole('button', { name: 'Aide sur cette rubrique' }))
    expect(within(await screen.findByRole('dialog')).getByRole('heading', { name: 'Aide' })).toBeDefined()
  })
})

describe('UC-VIS-04 — session réelle du shell', () => {
  const groups = () => mainNav().getAllByRole('group').map((g) => g.getAttribute('aria-label'))

  it('UC-VIS-04-F16 — nominal (1) et E3 : sans session injectée, GET api/auth/me → 401 → navigation de visiteur ; API injoignable → idem', async () => {
    const network = stubNetwork()
    window.location.hash = '#/'
    render(<App lib={fakeLib} />)
    await waitFor(() => expect(calledUrls(network)).toContain('api/auth/me'))
    expect(groups()).toEqual(['Découvrir', 'Compte'])
    expect(mainNav().getByRole('link', { name: 'Se connecter' })).toBeDefined()
    expect(mainNav().queryByRole('button', { name: 'Se déconnecter' })).toBeNull()
    cleanup()

    // E3 : l'API ne répond pas (copie statique, réseau coupé) → branche catch du shell.
    const offline = stubNetwork({ offline: true })
    render(<App lib={fakeLib} />)
    await waitFor(() => expect(calledUrls(offline)).toEqual(['api/auth/me']))
    expect(groups()).toEqual(['Découvrir', 'Compte'])
    expect(mainNav().queryByRole('button', { name: 'Se déconnecter' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Explorer le site' })).toBeDefined()
  })

  it('UC-VIS-04-F17 — A1 : un rôle attribué apparaît au rafraîchissement de session (événement humanome:auth), sans recharger', async () => {
    stubNetwork()
    const fetchMeFn = vi
      .fn()
      .mockResolvedValueOnce({ user: { id: 7, displayName: 'Ada', roles: ['apprenant'] } })
      .mockResolvedValue({ user: { id: 7, displayName: 'Ada', roles: ['apprenant', 'promptologue'] } })
    openApp('#/', fetchMeFn)
    await waitFor(() => expect(groups()).toContain('Ma cartographie'))
    expect(groups()).not.toContain('Faire évoluer')

    await act(async () => {
      window.dispatchEvent(new Event('humanome:auth'))
    })
    await waitFor(() => expect(groups()).toContain('Faire évoluer'))
    expect(fetchMeFn).toHaveBeenCalledTimes(2)
  })

  it('UC-VIS-04-F18 — RG3 : un visiteur qui ouvre une route de rôle (#/cartographe) est arrêté par la vue elle-même', async () => {
    const network = stubNetwork()
    openApp('#/cartographe')

    expect((await screen.findByRole('alert')).textContent).toBe('Cet espace de travail est réservé aux cartographes.')
    expect(screen.getByText(/Vous n’êtes pas connecté/)).toBeDefined()
    expect(screen.queryByRole('heading', { name: /Ma file de relecture/ })).toBeNull()
    // La vue n'a fait que sonder la session : aucune donnée de relecture demandée.
    expect(new Set(calledUrls(network))).toEqual(new Set(['api/auth/me']))
  })

  // ANOMALIE AN2 — comportement ACTUEL figé : le shell dérive « connecté » de
  // roles.length > 0. Un compte SANS rôle (dernier rôle retiré par l'admin)
  // voit la navigation d'un visiteur : « Se connecter », pas de « Se
  // déconnecter » ni d'identité. Attendu : navigation de compte.
  it('UC-VIS-04-F19 — [comportement actuel, anomalie AN2] session d’un compte sans aucun rôle → navigation de visiteur, pas de déconnexion depuis le menu', async () => {
    stubNetwork()
    openApp('#/', async () => ({ user: { id: 3, displayName: 'Zoé', roles: [], hasAvatar: false } }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Explorer le site' })).toBeDefined())
    expect(groups()).toEqual(['Découvrir', 'Compte'])
    expect(mainNav().getByRole('link', { name: 'Se connecter' })).toBeDefined()
    expect(mainNav().queryByRole('button', { name: 'Se déconnecter' })).toBeNull()
    expect(mainNav().queryByRole('link', { name: 'Mon profil' })).toBeNull()
  })
})
