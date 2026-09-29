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
// requête n'est attendue de ces pages. F20 rejoue, pour un compte portant
// tous les rôles, un clic sur chaque lien des familles de travail du panneau
// (réseau routé : session + quelques réponses vides ; les autres appels des
// vues atteintes répondent 404 et certaines affichent leur état d'erreur ;
// IndexedDB factice pour les magasins locaux de l'espace apprenant).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { calledUrls, jsonResponse } from '../support/vis.js'
import { FakeIDBKeyRange, createFakeIndexedDb } from '../support/appl-fake-indexeddb.js'
import { routedFetch } from '../support/appl-http.js'

// F20 : magasins locaux réels (portfolios, cartographies, Twin9) sur un
// IndexedDB factice — jsdom n'en fournit pas.
const idb = createFakeIndexedDb()

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

describe('UC-VIS-04 — liens du panneau pour un compte multi-rôles', () => {
  // Compte portant TOUS les rôles attribuables (employeur compris, qui
  // n'ajoute aucune famille — A1) : chaque famille de travail est visible,
  // l'Atelier Twin9 aussi (admin ∧ promptologue). Le shell reçoit la session
  // injectée ; les vues de destination sondent elles-mêmes GET api/auth/me
  // (réseau simulé).
  const EVERYONE = {
    id: 9,
    email: 'tous@example.org',
    displayName: 'Tous Rôles',
    roles: ['admin', 'apprenant', 'cartographe', 'employeur', 'epistemiarque', 'etablissement', 'promptologue'],
    hasAvatar: false,
  }

  afterEach(() => idb.reset())

  /**
   * Réseau minimal : session + quelques réponses vides. Les autres appels des
   * vues atteintes (api/training/progress, api/keys, api/prompt-packages/default
   * et /drafts, api/cartographe/cartographies, data/referentiel/index.json,
   * data/twin6/…) ne sont pas routés : routedFetch répond 404, et certaines
   * vues affichent leur état d'erreur — toléré, F20 ne vérifie que l'arrivée.
   */
  function multiRoleNetwork() {
    const mock = routedFetch([
      ['api/auth/me', () => jsonResponse(200, { user: EVERYONE, csrfToken: 'csrf-test' })],
      ['api/admin/golden', () => jsonResponse(200, [])],
      ['api/admin/settings', () => jsonResponse(200, { defaultPackage: null, worker: {}, config: {} })],
      ['api/admin/demo-config', () => jsonResponse(200, { effective: {}, sources: {}, allowedModels: [], apiKeyConfigured: false })],
      ['api/prompt-packages', () => jsonResponse(200, [])],
      // Twin9 désactivé côté serveur : la vue l'annonce (garde propre à un compte connecté).
      ['api/twin9/meta', () => jsonResponse(200, { enabled: false })],
      ['api/twin9/admin/protocole', () => jsonResponse(200, { protocole: [] })],
    ])
    vi.stubGlobal('fetch', mock)
    return mock
  }

  const h1 = (name) => screen.findByRole('heading', { level: 1, name })
  const h2 = (name) => screen.findByRole('heading', { level: 2, name })
  const adminTab = () =>
    within(screen.getByRole('navigation', { name: 'Sections d’administration' }))
      .getAllByRole('link')
      .find((a) => a.getAttribute('aria-current') === 'page')?.textContent

  // Ordre du parcours : deux liens consécutifs n'ont jamais le même href (un
  // clic sur l'adresse courante ne déclencherait pas de hashchange).
  const LINKS = [
    {
      name: 'Partager ma cartographie',
      href: '#/espace',
      badge: null,
      hint: 'lien protégé par mot de passe',
      reached: async () => {
        await h1('Espace apprenant')
        // Session reconnue par la vue (le tableau de bord s'affiche AUSSI en anonyme).
        expect(await screen.findByTestId('espace-connecte')).toBeDefined()
        expect(screen.queryByTestId('espace-anonyme')).toBeNull()
        // Alias du tableau de bord : le partage se fait depuis « Mes cartographies ».
        expect(await screen.findByRole('region', { name: 'Mes cartographies' })).toBeDefined()
        expect(screen.getByRole('region', { name: 'Mes portfolios' })).toBeDefined()
      },
    },
    {
      name: 'Cartographier mes écrits',
      href: '#/espace/nouveau-run',
      badge: 'standard',
      hint: null,
      reached: async () => {
        await h1('Espace apprenant')
        expect(await screen.findByTestId('espace-connecte')).toBeDefined()
        expect(screen.queryByTestId('espace-anonyme')).toBeNull()
        await h2('Nouveau run de cartographie')
        expect(screen.queryByRole('region', { name: 'Mes cartographies' })).toBeNull()
      },
    },
    {
      name: 'Cartographie ouverte',
      href: '#/twin6-ouverte',
      badge: 'gratuit',
      hint: 'Twin6 — open source',
      reached: async () => {
        await h1('Cartographie ouverte Twin6')
        // Session reconnue : la page de travail (prompts AGPL téléchargeables), pas l'invite à se connecter.
        expect(await screen.findByRole('link', { name: 'Télécharger les prompts' })).toBeDefined()
        expect(screen.queryByText(/La cartographie ouverte nécessite un compte/)).toBeNull()
      },
    },
    {
      name: 'Analyse approfondie',
      href: '#/twin9',
      badge: 'premium',
      hint: 'Twin9',
      reached: async () => {
        await h1('Analyse approfondie Twin9')
        // Compte reconnu : la garde de session laisse place à l'état du service.
        expect((await screen.findByTestId('twin9-indisponible')).textContent).toBe('L’analyse Twin9 est momentanément indisponible.')
        expect(screen.queryByTestId('twin9-garde-session')).toBeNull()
      },
    },
    {
      name: 'Atelier de prompts',
      href: '#/promptologue',
      badge: null,
      hint: 'éditeur, banc d’essai, rétrospective',
      reached: async () => {
        await h1('Atelier promptologue')
        expect(await screen.findByTestId('promptologue-connecte')).toBeDefined()
      },
    },
    {
      name: 'Atelier Twin9',
      href: '#/twin9-atelier',
      badge: null,
      hint: 'gabarits du Golden Prompt — admin ∧ promptologue',
      reached: async () => {
        await h1('Atelier Twin9 — Golden Prompt')
        // Rôles du SHELL admin ∧ promptologue : l'atelier (gabarits), pas l'écran réservé.
        expect(await screen.findByRole('heading', { level: 3, name: 'Gabarits du Golden Prompt' })).toBeDefined()
        expect(screen.queryByTestId('twin9-atelier-reserve')).toBeNull()
      },
    },
    {
      name: 'Golden Prompt',
      href: '#/admin/golden',
      badge: null,
      hint: null,
      reached: async () => {
        await h1('Administration')
        await h2('Golden Prompt')
        expect(adminTab()).toBe('Golden Prompt')
      },
    },
    {
      name: 'Réglages',
      href: '#/admin/reglages',
      badge: null,
      hint: null,
      reached: async () => {
        await h2('Réglages plateforme')
        expect(adminTab()).toBe('Réglages')
      },
    },
    {
      name: 'Configuration serveur',
      href: '#/admin/config',
      badge: null,
      hint: null,
      reached: async () => {
        await h2('Configuration serveur')
        expect(adminTab()).toBe('Configuration serveur')
      },
    },
    {
      name: 'Consistance',
      href: '#/cartographe/consistance',
      badge: null,
      hint: 'multi-run',
      reached: async () => {
        await h1('Espace cartographe')
        await h2('Consistance multi-run')
      },
    },
  ]

  it('UC-VIS-04-F20 — A1 : compte multi-rôles — tuiles (badge, précision), puis chaque lien du panneau (Ma cartographie, Faire évoluer, Administrer, Encadrer) mène à SA route, marquée « page courante », tiroir refermé', async () => {
    vi.stubGlobal('indexedDB', idb.factory)
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange)
    multiRoleNetwork()
    openApp('#/', async () => ({ user: EVERYONE }))
    await waitFor(() => expect(mainNav().getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual([
      'Découvrir', 'Ma cartographie', 'Encadrer et garantir', 'Piloter mon organisation', 'Faire évoluer', 'Administrer', 'Mon compte',
    ]))
    // Tuiles « Vos espaces » de l'accueil : même plan du site, avec la précision (hint).
    const tiles = within(screen.getByRole('region', { name: 'Plan du site' })).getAllByRole('link')
    for (const target of LINKS) {
      const tile = tiles.find((a) => a.querySelector('.route-label')?.textContent === target.name)
      expect(tile?.getAttribute('href'), target.name).toBe(target.href)
      expect(tile.querySelector('.value-badge')?.textContent ?? null, target.name).toBe(target.badge)
      expect(tile.querySelector('.route-hint')?.textContent ?? null, target.name).toBe(target.hint)
    }

    const burger = screen.getByRole('button', { name: 'Menu de navigation' })
    const linkOf = ({ name, badge }) =>
      badge ? mainNav().getByRole('link', { name: new RegExp(`^${name}`) }) : mainNav().getByRole('link', { name })

    for (const target of LINKS) {
      fireEvent.click(burger)
      expect(burger.getAttribute('aria-expanded'), target.name).toBe('true')
      const link = linkOf(target)
      expect(link.getAttribute('href'), target.name).toBe(target.href)
      // Panneau : libellé + badge de valeur, jamais la précision (réservée aux tuiles).
      expect(link.querySelector('.value-badge')?.textContent ?? null, target.name).toBe(target.badge)
      expect(link.textContent, target.name).toBe(target.name + (target.badge ?? ''))

      // Un vrai clic pointeur donne le focus au lien ; fireEvent.click ne le
      // fait pas, d'où le focus() explicite.
      link.focus()
      expect(document.activeElement, target.name).toBe(link)
      fireEvent.click(link, { detail: 1 }) // clic pointeur : navigation native du lien
      await waitFor(() => expect(window.location.hash, target.name).toBe(target.href))
      expect(burger.getAttribute('aria-expanded'), target.name).toBe('false')
      // Focus retiré du lien (handleNavClick → link.blur()) : sans cela,
      // :focus-within garderait le tiroir visuellement ouvert.
      expect(document.activeElement, target.name).not.toBe(link)
      await target.reached()

      // Marquage « page courante » dans le panneau.
      if (target.name === 'Partager ma cartographie') {
        expect(linkOf(target).getAttribute('aria-current')).toBeNull()
        expect(mainNav().getByRole('link', { name: 'Tableau de bord' }).getAttribute('aria-current')).toBe('page')
      } else {
        expect(linkOf(target).getAttribute('aria-current'), target.name).toBe('page')
      }
      expect(mainNav().getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page'), target.name).toHaveLength(1)
    }
  }, 30000)
})
