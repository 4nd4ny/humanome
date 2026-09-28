// UC-VIS-04 — Se repérer (accueil, navigation, guides, aide, confidentialité) : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-04-se-reperer-guides-aide.md
//
// Code sollicité appelé directement : routeur (accueil, guides, confidentialité,
// page introuvable), plan du site par familles d'intention (nav.js), registre
// d'aide contextuelle, thème clair/sombre, contenu des guides embarqué au
// build, progression locale d'un visiteur, rendu Markdown assaini de la page
// confidentialité. L'anomalie A1 (progression locale écrasée d'un parcours à
// l'autre) est figée ici.
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('UC-VIS-04-U05 — aide contextuelle : une entrée par rubrique « Découvrir », repli « Aide », astuce ciblée par rôle', () => {
    for (const route of ['home', 'cartographie', 'essayer', 'referentiel', 'guides', 'confidentialite', 'day']) {
      expect(helpFor(route).titre).not.toBe('Aide')
    }
    expect(helpFor('referentiel').titre).toBe('Le référentiel de compétences')
    expect(helpFor('not-found')).toEqual(expect.objectContaining({ titre: 'Aide' }))
    const cartographe = helpFor('home', { roles: ['apprenant', 'cartographe'] })
    expect(cartographe.points.at(-1)).toContain('« Ma file de relecture » est dans le menu')
    expect(helpFor('home', {}).points).not.toContain(cartographe.points.at(-1))
  })

  it('UC-VIS-04-U06 — profils explorables par un visiteur : 8 personas, l’employeur sans compte', () => {
    expect(PERSONAS.map((p) => p.id)).toEqual([
      'visiteur', 'apprenant', 'employeur', 'cartographe', 'promptologue', 'epistemiarque', 'etablissement', 'admin',
    ])
    expect(PERSONAS.find((p) => p.id === 'employeur').roles).toBeNull()
    expect(PERSONAS.filter((p) => p.roles && p.id !== 'visiteur').every((p) => p.roles.includes('apprenant'))).toBe(true)
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
    store.setLocal('01-qu-est-ce-qu-une-cartographie', true)
    store.setLocal('02-explorer-la-demonstration', true)
    store.setLocal('01-qu-est-ce-qu-une-cartographie', false)

    expect(await store.load({ connected: false })).toEqual({ chapitres: ['02-explorer-la-demonstration'], source: 'local' })
    expect(api.get).not.toHaveBeenCalled()
    expect(api.put).not.toHaveBeenCalled()
    expect(JSON.parse(storage.getItem(TRAINING_STORAGE_KEY))).toEqual({
      visiteur: { chapitresTermines: ['02-explorer-la-demonstration'] },
    })
  })

  // ANOMALIE A1 de la fiche — test qui FIGE le comportement ACTUEL : la clé
  // locale « humanome-training » est RÉÉCRITE avec le seul parcours courant
  // (writeLocal), si bien que cocher un chapitre d'un parcours efface la
  // progression locale des autres parcours. À inverser après correction.
  it('UC-VIS-04-U10 — [comportement actuel, anomalie A1] cocher un chapitre d’un autre parcours efface la progression locale du premier', async () => {
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
