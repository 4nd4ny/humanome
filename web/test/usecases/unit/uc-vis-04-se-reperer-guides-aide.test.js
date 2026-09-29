// UC-VIS-04 — Se repérer (accueil, navigation, guides, aide, confidentialité) : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-04-se-reperer-guides-aide.md
//
// Code sollicité appelé directement : routeur (accueil, guides, confidentialité,
// page introuvable), plan du site par familles d'intention (nav.js), registre
// d'aide contextuelle, thème clair/sombre, contenu des guides embarqué au
// build, progression locale d'un visiteur, rendu Markdown assaini de la page
// confidentialité, sonde de session du shell (fetchMe). L'anomalie AN1
// (progression locale écrasée d'un parcours à l'autre) est figée ici.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, ApiUnavailableError, fetchMe } from '../../../src/api/client.js'
import { guidesHash, parseHash } from '../../../src/router.js'
import { FAMILIES, isCurrentItem, navGroups } from '../../../src/nav.js'
import { helpFor } from '../../../src/help/registry.js'
import { applyTheme, resolvedTheme, storedTheme, subscribeSystemTheme } from '../../../src/lib/theme.js'
import {
  FORMATION_META,
  FORMATION_PARCOURS,
  getChapter,
  guidesBaseHash,
  listChapters,
  rewriteChapterLink,
} from '../../../src/views/espace/formation-content.js'
import { createTrainingStore, TRAINING_STORAGE_KEY } from '../../../src/lib/training-store.js'
import { renderMarkdown } from '../../../src/lib/md.js'
import { PERSONAS } from '../../../src/components/FamilyTiles.jsx'
import legal from '../../../../content/legal/confidentialite.md?raw'

function memoryStorage() {
  const data = new Map()
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    dump: () => Object.fromEntries(data),
  }
}

function stubMatchMedia(dark) {
  const listeners = new Set()
  const mq = {
    matches: dark,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  }
  window.matchMedia = vi.fn(() => mq)
  return { fire: (matches) => listeners.forEach((fn) => fn({ matches })), listeners }
}

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  delete window.matchMedia
})

describe('UC-VIS-04 — routes publiques de repérage', () => {
  it('UC-VIS-04-U03 — accueil, guides (hub, parcours, chapitre), confidentialité ; tout le reste est introuvable', () => {
    expect(parseHash('')).toEqual({ name: 'home' })
    expect(parseHash('#/')).toEqual({ name: 'home' })
    expect(parseHash('#/guides')).toEqual({ name: 'guides', parcours: null, chapter: null })
    expect(parseHash('#/guides/visiteur')).toEqual({ name: 'guides', parcours: 'visiteur', chapter: null })
    expect(parseHash('#/guides/visiteur/02-explorer-la-demonstration')).toEqual({
      name: 'guides',
      parcours: 'visiteur',
      chapter: '02-explorer-la-demonstration',
    })
    expect(parseHash('#/confidentialite')).toEqual({ name: 'confidentialite' })
    expect(parseHash('#/nulle-part')).toEqual({ name: 'not-found', hash: '/nulle-part' })
    expect(parseHash('#/guides/Visiteur').name).toBe('not-found') // parcours en minuscules seulement
    expect(guidesHash()).toBe('#/guides')
    expect(guidesHash('employeur', '01-recevoir-une-cartographie')).toBe('#/guides/employeur/01-recevoir-une-cartographie')
  })
})

describe('UC-VIS-04 — navigation par familles d’intention', () => {
  it('UC-VIS-04-U04 — visiteur : « Découvrir » + « Compte » ; chaque rôle ajoute SA famille ; page courante par route ET section', () => {
    const visitor = navGroups({ roles: [] })
    expect(visitor.map((f) => f.label)).toEqual(['Découvrir', 'Compte'])
    expect(visitor[0].items.map((i) => i.href)).toEqual(['#/', '#/cartographie', '#/essayer', '#/referentiel', '#/guides'])
    expect(visitor[1].items.map((i) => i.label)).toEqual(['Se connecter', 'Confidentialité'])

    const many = navGroups({ roles: ['apprenant', 'cartographe', 'epistemiarque'] })
    expect(many.map((f) => f.id)).toEqual(['decouvrir', 'cartographie', 'encadrer', 'evoluer', 'compte'])
    expect(many.find((f) => f.id === 'evoluer').items.map((i) => i.label)).toEqual(['Édition du référentiel'])
    expect(many.at(-1).label).toBe('Mon compte')
    // Atelier Twin9 : conjonction admin ∧ promptologue.
    const twin9 = (roles) => navGroups({ roles }).some((f) => f.items.some((i) => i.route === 'twin9atelier'))
    expect(twin9(['promptologue'])).toBe(false)
    expect(twin9(['admin', 'promptologue'])).toBe(true)

    const comparer = FAMILIES.find((f) => f.id === 'encadrer').items[1]
    expect(isCurrentItem(comparer, { name: 'cartographe', section: 'comparer' })).toBe(true)
    expect(isCurrentItem(comparer, { name: 'cartographe', section: null })).toBe(false)
    expect(isCurrentItem({ href: '#/espace', label: 'Partager' }, { name: 'espace', section: null })).toBe(false)
  })

  it('UC-VIS-04-U05 — aide contextuelle : une entrée par rubrique du menu (tous rôles), repli « Aide », astuce ciblée par rôle', () => {
    // Toutes les rubriques atteignables depuis le menu, pour le cumul de tous les rôles.
    const everyRoute = navGroups({
      roles: ['apprenant', 'cartographe', 'promptologue', 'epistemiarque', 'etablissement', 'admin'],
      authenticated: true,
    })
      .flatMap((f) => f.items)
      .filter((i) => i.route)
      .map((i) => i.route)
    expect(everyRoute.length).toBeGreaterThan(10)
    for (const route of new Set([...everyRoute, 'day'])) {
      expect(helpFor(route).titre, route).not.toBe('Aide')
    }
    expect(helpFor('referentiel').titre).toBe('Le référentiel de compétences')
    expect(helpFor('not-found')).toEqual(expect.objectContaining({ titre: 'Aide' }))
    const cartographe = helpFor('home', { roles: ['apprenant', 'cartographe'] })
    expect(cartographe.points.at(-1)).toContain('« Ma file de relecture » est dans le menu')
    expect(helpFor('home', {}).points).not.toContain(cartographe.points.at(-1))
    // Établissement : son astuce ; cartographe ET établissement : seule celle du cartographe.
    const etablissement = helpFor('home', { roles: ['etablissement'] })
    expect(etablissement.points.at(-1)).toContain('« Mes cohortes » est dans le menu')
    const both = helpFor('home', { roles: ['cartographe', 'etablissement'] })
    expect(both.points.at(-1)).toContain('« Ma file de relecture »')
    expect(both.points.join(' ')).not.toContain('« Mes cohortes »')
  })

  it('UC-VIS-04-U06 — profils explorables par un visiteur : 8 personas, l’employeur sans compte', () => {
    expect(PERSONAS.map((p) => p.id)).toEqual([
      'visiteur', 'apprenant', 'employeur', 'cartographe', 'promptologue', 'epistemiarque', 'etablissement', 'admin',
    ])
    expect(PERSONAS.find((p) => p.id === 'employeur').roles).toBeNull()
    expect(PERSONAS.filter((p) => p.roles && p.id !== 'visiteur').every((p) => p.roles.includes('apprenant'))).toBe(true)
  })
})

// --- UC-VIS-04-U13 : catalogue ATTENDU du plan du site, écrit à la main -------
// Chaque item tel que la fiche le décrit (href, libellé, route/section du
// marquage aria-current, badge de l'échelle de valeur, précision « hint » des
// tuiles, restriction de rôle dans une famille multi-rôles). Le test compare
// navGroups à ces attentes, combinaison de rôles par combinaison de rôles :
// toute dérive de nav.js (lien, badge, hint, visibilité) le fait échouer.
const ITEM = {
  accueil: { href: '#/', label: 'Accueil', route: 'home' },
  demo: { href: '#/cartographie', label: 'Cartographie (démonstration)', route: 'cartographie' },
  essayer: { href: '#/essayer', label: 'Essayer', route: 'essayer', badge: 'gratuit', hint: 'sans compte' },
  referentiel: { href: '#/referentiel', label: 'Référentiel', route: 'referentiel', hint: '7 pôles, 61 compétences' },
  guides: { href: '#/guides', label: 'Guides', route: 'guides', hint: 'prise en main par profil' },
  tableau: { href: '#/espace', label: 'Tableau de bord', route: 'espace', hint: 'portfolios, cartographies, formation' },
  portfolio: { href: '#/portfolio', label: 'Mon portfolio', route: 'portfolio', hint: 'local, matière première d’un run' },
  cartographier: {
    href: '#/espace/nouveau-run',
    label: 'Cartographier mes écrits',
    route: 'espace',
    section: 'nouveau-run',
    badge: 'standard',
  },
  ouverte: { href: '#/twin6-ouverte', label: 'Cartographie ouverte', route: 'twin6ouverte', badge: 'gratuit', hint: 'Twin6 — open source' },
  approfondie: { href: '#/twin9', label: 'Analyse approfondie', route: 'twin9', badge: 'premium', hint: 'Twin9' },
  partager: { href: '#/espace', label: 'Partager ma cartographie', hint: 'lien protégé par mot de passe' },
  file: { href: '#/cartographe', label: 'Ma file de relecture', route: 'cartographe' },
  comparer: { href: '#/cartographe/comparer', label: 'Comparer', route: 'cartographe', section: 'comparer' },
  consistance: {
    href: '#/cartographe/consistance',
    label: 'Consistance',
    route: 'cartographe',
    section: 'consistance',
    hint: 'multi-run',
  },
  cohortes: { href: '#/etablissement', label: 'Mes cohortes', route: 'etablissement', hint: 'budget, runs de masse, membres' },
  prompts: {
    href: '#/promptologue',
    label: 'Atelier de prompts',
    route: 'promptologue',
    roles: ['promptologue'],
    hint: 'éditeur, banc d’essai, rétrospective',
  },
  atelierTwin9: {
    href: '#/twin9-atelier',
    label: 'Atelier Twin9',
    route: 'twin9atelier',
    allRoles: ['admin', 'promptologue'],
    hint: 'gabarits du Golden Prompt — admin ∧ promptologue',
  },
  referentielEdit: {
    href: '#/epistemiarque',
    label: 'Édition du référentiel',
    route: 'epistemiarque',
    roles: ['epistemiarque'],
    hint: 'éditer, voter, entériner — débats sur Decidim',
  },
  roles: { href: '#/admin/roles', label: 'Rôles et comptes', route: 'admin', section: 'roles' },
  golden: { href: '#/admin/golden', label: 'Golden Prompt', route: 'admin', section: 'golden' },
  reglages: { href: '#/admin/reglages', label: 'Réglages', route: 'admin', section: 'reglages' },
  config: { href: '#/admin/config', label: 'Configuration serveur', route: 'admin', section: 'config' },
  supervision: { href: '#/admin/twin9', label: 'Supervision Twin9', route: 'admin', section: 'twin9' },
  profil: { href: '#/compte', label: 'Profil et rôles', route: 'account' },
  credit: { href: '#/compte/credit', label: 'Crédit et factures', route: 'account', section: 'credit' },
  connexion: { href: '#/compte', label: 'Se connecter', route: 'account' },
  confidentialite: { href: '#/confidentialite', label: 'Confidentialité', route: 'confidentialite', hint: 'RGPD' },
}

const FAMILY_HEAD = {
  decouvrir: { label: 'Découvrir', intent: 'Comprendre et essayer', audience: 'Tous — visiteur compris' },
  cartographie: { label: 'Ma cartographie', intent: 'Construire et partager la mienne', audience: 'Apprenant' },
  encadrer: { label: 'Encadrer et garantir', intent: 'Relire, corriger, garantir', audience: 'Cartographe' },
  piloter: { label: 'Piloter mon organisation', intent: 'Cartographier des classes en masse', audience: 'Établissement (B2B)' },
  evoluer: { label: 'Faire évoluer', intent: 'Prompts et référentiel', audience: 'Promptologue · Épistémiarque' },
  administrer: { label: 'Administrer', intent: 'Gouvernance de la plateforme', audience: 'Administrateur' },
}

const DECOUVRIR = ['accueil', 'demo', 'essayer', 'referentiel', 'guides']
const CARTOGRAPHIE = ['tableau', 'portfolio', 'cartographier', 'ouverte', 'approfondie', 'partager']
const ENCADRER = ['file', 'comparer', 'consistance']
const ADMINISTRER = ['roles', 'golden', 'reglages', 'config', 'supervision']
const COMPTE_CONNECTE = ['profil', 'credit', 'confidentialite']

/** Structure attendue : [[idFamille, [clés d'items]], …] + famille compte. */
function expected(families, connected) {
  return [
    ...families.map(([id, keys]) => ({ id, ...FAMILY_HEAD[id], items: keys.map((k) => ITEM[k]) })),
    {
      id: 'compte',
      label: connected ? 'Mon compte' : 'Compte',
      intent: 'Qui je suis et ce que je paie',
      audience: 'Tous',
      items: (connected ? COMPTE_CONNECTE : ['connexion', 'confidentialite']).map((k) => ITEM[k]),
    },
  ]
}

/** Retire la clé `roles` de famille (propre à FAMILIES, hors contrat d'affichage). */
const shown = (groups) => groups.map(({ roles: _roles, ...family }) => family)

const COMBINATIONS = [
  ['visiteur', [], expected([['decouvrir', DECOUVRIR]], false)],
  ['apprenant seul', ['apprenant'], expected([['decouvrir', DECOUVRIR], ['cartographie', CARTOGRAPHIE]], true)],
  ['cartographe seul', ['cartographe'], expected([['decouvrir', DECOUVRIR], ['encadrer', ENCADRER]], true)],
  ['promptologue seul', ['promptologue'], expected([['decouvrir', DECOUVRIR], ['evoluer', ['prompts']]], true)],
  ['épistémiarque seul', ['epistemiarque'], expected([['decouvrir', DECOUVRIR], ['evoluer', ['referentielEdit']]], true)],
  ['établissement seul', ['etablissement'], expected([['decouvrir', DECOUVRIR], ['piloter', ['cohortes']]], true)],
  // Rôle attribuable (migration 001) sans famille de travail : compte seulement.
  ['employeur seul', ['employeur'], expected([['decouvrir', DECOUVRIR]], true)],
  // Admin seul : ni « Faire évoluer » ni, donc, l'Atelier Twin9 (famille invisible).
  ['admin seul', ['admin'], expected([['decouvrir', DECOUVRIR], ['administrer', ADMINISTRER]], true)],
  [
    'admin + promptologue',
    ['promptologue', 'admin'],
    expected([['decouvrir', DECOUVRIR], ['evoluer', ['prompts', 'atelierTwin9']], ['administrer', ADMINISTRER]], true),
  ],
  // Famille visible (épistémiarque) mais conjonction incomplète : pas d'Atelier Twin9.
  [
    'admin + épistémiarque',
    ['admin', 'epistemiarque'],
    expected([['decouvrir', DECOUVRIR], ['evoluer', ['referentielEdit']], ['administrer', ADMINISTRER]], true),
  ],
  [
    'cumul de tous les rôles',
    ['admin', 'etablissement', 'employeur', 'epistemiarque', 'promptologue', 'cartographe', 'apprenant'],
    expected(
      [
        ['decouvrir', DECOUVRIR],
        ['cartographie', CARTOGRAPHIE],
        ['encadrer', ENCADRER],
        ['piloter', ['cohortes']],
        ['evoluer', ['prompts', 'atelierTwin9', 'referentielEdit']],
        ['administrer', ADMINISTRER],
      ],
      true,
    ),
  ],
]

describe('UC-VIS-04 — plan du site exhaustif par combinaison de rôles', () => {
  it('UC-VIS-04-U13 — navGroups : href, badges, hints et visibilité de CHAQUE lien, du visiteur au cumul de tous les rôles ; chaque href mène à sa route', () => {
    for (const [name, roles, want] of COMBINATIONS) {
      expect(shown(navGroups({ roles })), name).toEqual(want)
    }
    // Couverture : le cumul expose chaque item de FAMILIES exactement une fois.
    const all = navGroups({ roles: COMBINATIONS.at(-1)[1] })
    const fromFamilies = FAMILIES.flatMap((f) => f.items)
    expect(all.slice(0, -1).flatMap((f) => f.items)).toEqual(fromFamilies)
    expect(fromFamilies).toHaveLength(Object.keys(ITEM).length - 4) // hors les 4 items de la famille compte

    // Échelle de valeur : un badge par échelle de « cartographier un texte » (gratuit / standard /
    // premium), plus « Essayer » (gratuit) ; aucun autre lien n'en porte.
    const badged = Object.fromEntries(all.flatMap((f) => f.items).filter((i) => i.badge).map((i) => [i.label, i.badge]))
    expect(badged).toEqual({
      Essayer: 'gratuit',
      'Cartographier mes écrits': 'standard',
      'Cartographie ouverte': 'gratuit',
      'Analyse approfondie': 'premium',
    })

    // Session explicite sans rôle (paramètre `authenticated`) : famille de compte connecté.
    expect(navGroups({ roles: [], authenticated: true }).at(-1).items.map((i) => i.label)).toEqual([
      'Profil et rôles',
      'Crédit et factures',
      'Confidentialité',
    ])
    // Sens inverse : des rôles avec une session explicitement NON authentifiée
    // → famille « Compte » d'un visiteur (la famille du compte ne suit que `authenticated`).
    expect(navGroups({ roles: ['admin'], authenticated: false }).at(-1)).toEqual(expected([], false).at(-1))
    // Un appel sans argument vaut visiteur.
    expect(shown(navGroups())).toEqual(COMBINATIONS[0][2])

    // Cohérence href ↔ route : le routeur réel conduit chaque lien à la route
    // (et sous-section) qui le marque « page courante » ; l'alias sans route
    // (« Partager ma cartographie ») mène au tableau de bord sans jamais être marqué.
    for (const item of [...fromFamilies, ...Object.values(ITEM).slice(-4)]) {
      const reached = parseHash(item.href)
      if (item.route) {
        expect(isCurrentItem(item, reached), item.label).toBe(true)
      } else {
        expect(reached).toEqual({ name: 'espace', section: null })
        expect(isCurrentItem(item, reached)).toBe(false)
        expect(isCurrentItem(ITEM.tableau, reached)).toBe(true)
      }
    }
  })
})

describe('UC-VIS-04 — thème clair / sombre', () => {
  it('UC-VIS-04-U07 — sans choix : suit le système (et ses changements) ; un choix explicite est persisté et prime', () => {
    const system = stubMatchMedia(true)
    expect(storedTheme()).toBeNull()
    expect(resolvedTheme()).toBe('dark')
    const seen = []
    const unsubscribe = subscribeSystemTheme((t) => seen.push(t))
    system.fire(false)
    expect(seen).toEqual(['light'])

    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem('humanome-theme')).toBe('light')
    system.fire(true)
    expect(seen).toEqual(['light']) // le choix explicite prime : plus de relais
    expect(resolvedTheme()).toBe('light')
    unsubscribe()
    expect(system.listeners.size).toBe(0)
  })
})

describe('UC-VIS-04 — guides publics', () => {
  it('UC-VIS-04-U08 — contenu embarqué : 9 parcours, chapitres du visiteur ordonnés et titrés, liens internes vers #/guides', () => {
    expect(FORMATION_PARCOURS).toHaveLength(9)
    expect(FORMATION_PARCOURS).toContain('visiteur')
    expect(FORMATION_META.visiteur.espace).toBeNull()
    const chapters = listChapters('visiteur')
    expect(chapters.map((c) => c.slug)).toEqual([
      '01-qu-est-ce-qu-une-cartographie',
      '02-explorer-la-demonstration',
      '03-le-referentiel-respire',
      '04-essayer-et-aller-plus-loin',
    ])
    expect(chapters[1].titre).toBe('Explorer la démonstration')
    expect(getChapter('99-absent', 'visiteur')).toBeNull()
    expect(rewriteChapterLink('02-explorer-la-demonstration.md', 'visiteur', guidesBaseHash('visiteur'))).toBe(
      '#/guides/visiteur/02-explorer-la-demonstration',
    )
    expect(rewriteChapterLink('https://exemple.org', 'visiteur', guidesBaseHash('visiteur'))).toBe('https://exemple.org')
    expect(() => listChapters('inconnu')).toThrow('Parcours de formation inconnu')
  })

  it('UC-VIS-04-U09 — progression d’un visiteur : cochée et relue LOCALEMENT, jamais d’appel serveur sans session', async () => {
    const storage = memoryStorage()
    const api = { get: vi.fn(), put: vi.fn() }
    const store = createTrainingStore({ storage, api, parcours: 'visiteur' })
    // Aiguillage de setChapter selon la session (comme FormationSection).
    await store.setChapter('01-qu-est-ce-qu-une-cartographie', true, { connected: false })
    await store.setChapter('02-explorer-la-demonstration', true, { connected: false })
    await store.setChapter('01-qu-est-ce-qu-une-cartographie', false, { connected: false })

    expect(await store.load({ connected: false })).toEqual({ chapitres: ['02-explorer-la-demonstration'], source: 'local' })
    expect(api.get).not.toHaveBeenCalled()
    expect(api.put).not.toHaveBeenCalled()
    expect(JSON.parse(storage.getItem(TRAINING_STORAGE_KEY))).toEqual({
      visiteur: { chapitresTermines: ['02-explorer-la-demonstration'] },
    })
    // Contre-exemple : connecté, la coche part au serveur (et pas en local).
    await store.setChapter('03-le-referentiel-respire', true, { connected: true })
    expect(api.put).toHaveBeenCalledWith({ parcours: 'visiteur', chapitre: '03-le-referentiel-respire', completed: true })
    expect(store.listLocal()).toEqual(['02-explorer-la-demonstration'])
  })

  // ANOMALIE AN1 de la fiche — test qui FIGE le comportement ACTUEL : la clé
  // locale « humanome-training » est RÉÉCRITE avec le seul parcours courant
  // (writeLocal), si bien que cocher un chapitre d'un parcours efface la
  // progression locale des autres parcours. À inverser après correction.
  it('UC-VIS-04-U10 — [comportement actuel, anomalie AN1] cocher un chapitre d’un autre parcours efface la progression locale du premier', async () => {
    const storage = memoryStorage()
    const api = { get: vi.fn(), put: vi.fn() }
    createTrainingStore({ storage, api, parcours: 'visiteur' }).setLocal('01-qu-est-ce-qu-une-cartographie', true)
    createTrainingStore({ storage, api, parcours: 'employeur' }).setLocal('01-recevoir-une-cartographie', true)

    const visiteur = await createTrainingStore({ storage, api, parcours: 'visiteur' }).load({ connected: false })
    expect(visiteur.chapitres).toEqual([]) // attendu : ['01-qu-est-ce-qu-une-cartographie']
    expect(Object.keys(JSON.parse(storage.getItem(TRAINING_STORAGE_KEY)))).toEqual(['employeur'])
  })
})

describe('UC-VIS-04 — page confidentialité', () => {
  it('UC-VIS-04-U11 — renderMarkdown du contenu légal embarqué : titres, liens de l’app conservés, aucun script ni image', () => {
    const html = renderMarkdown(legal)
    expect(html).toContain('<h1>Confidentialité et protection des données</h1>')
    for (const section of ['En bref', 'Vos droits', 'Cookies', 'Contact et réclamation']) {
      expect(html).toContain(`<h2>${section}</h2>`)
    }
    expect(html).toMatch(/href="#\/(compte|espace)/)
    expect(renderMarkdown('# T\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))')).not.toMatch(/<script|javascript:/)
  })
})

describe('UC-VIS-04 — sonde de session du shell', () => {
  it('UC-VIS-04-U12 — fetchMe : 401 → visiteur ({user: null}) ; autre erreur → ApiError ; réseau → ApiUnavailableError', async () => {
    const json = (status, data) => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => 'application/json' },
      json: async () => data,
    })
    const unauthorized = vi.fn().mockResolvedValue(json(401, { error: 'Authentification requise' }))
    expect(await fetchMe({ fetchFn: unauthorized, protocol: 'https:' })).toEqual({ user: null })
    expect(unauthorized).toHaveBeenCalledWith('api/auth/me', expect.objectContaining({ method: 'GET', body: undefined }))

    const user = { id: 7, displayName: 'Ada', roles: ['apprenant'] }
    expect(await fetchMe({ fetchFn: vi.fn().mockResolvedValue(json(200, { user, csrfToken: 'x' })), protocol: 'https:' })).toEqual({ user })

    const serverError = fetchMe({ fetchFn: vi.fn().mockResolvedValue(json(500, { error: 'Internal error' })), protocol: 'https:' })
    await expect(serverError).rejects.toBeInstanceOf(ApiError)
    const offline = fetchMe({ fetchFn: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')), protocol: 'https:' })
    await expect(offline).rejects.toBeInstanceOf(ApiUnavailableError)
    // Copie statique (file://) : l'API n'est même pas appelée.
    const never = vi.fn()
    await expect(fetchMe({ fetchFn: never, protocol: 'file:' })).rejects.toBeInstanceOf(ApiUnavailableError)
    expect(never).not.toHaveBeenCalled()
  })
})
