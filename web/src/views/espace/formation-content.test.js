// Traçabilité — exigence utilisateur « documentation en ligne complète par
// rôle » (canal a) : des manuels de prise en main pour visiteur, apprenant,
// employeur, établissement, cartographe, épistémiarque, promptologue + une
// documentation admin (reprenant docs/), plus le portail noésiologie,
// accessibles sur le site (#/guides) ET en Markdown dans le repo git
// (content/formation/<parcours>/). Le volet noésiologie doit conserver le
// passage exigé sur le portfolio réflexif (habitus, origine des blocages,
// « atteindre au plus vite son potentiel intellectuel maximal », « nous ne
// prétendons pas rendre les élèves plus intelligents… »).
//
// Le Markdown réel est embarqué au build (import.meta.glob eager, ADR-003) :
// la complétude des 8+1 parcours se prouve donc ici, hors DOM.

import { describe, expect, it } from 'vitest'
import { parseFrontMatter } from '../../lib/md.js'
import {
  FORMATION_META,
  FORMATION_PARCOURS,
  getChapter,
  guidesBaseHash,
  listChapters,
  rewriteChapterLink,
} from './formation-content.js'

// Les 8 rôles demandés + le portail noésiologie (« 8+1 »).
const EXPECTED_PARCOURS = [
  'visiteur',
  'apprenant',
  'employeur',
  'etablissement',
  'cartographe',
  'epistemiarque',
  'promptologue',
  'admin',
  'noesiologie',
]

// Familles affichées par l'accueil du hub (FAMILY_ORDER de GuidesView.jsx).
const GUIDES_FAMILIES = [
  'Découvrir',
  'Votre cartographie',
  'Encadrer',
  'Faire évoluer',
  'Administrer',
  'Écosystème RESPIRE',
]

describe('formation-content — complétude des 8+1 parcours (canal a)', () => {
  it('expose exactement les 8 rôles demandés + le portail noésiologie', () => {
    expect([...FORMATION_PARCOURS]).toEqual(EXPECTED_PARCOURS)
  })

  it.each(EXPECTED_PARCOURS)(
    'parcours « %s » : au moins un chapitre, tous complets, ordres croissants',
    (parcours) => {
      const chapters = listChapters(parcours)
      expect(chapters.length).toBeGreaterThanOrEqual(1)

      let previousOrdre = 0
      for (const chapter of chapters) {
        // Titre éditorial non vide dans le front-matter (pas le repli slug).
        const { meta } = parseFrontMatter(chapter.raw)
        expect(typeof meta.titre, `${parcours}/${chapter.slug} : titre`).toBe('string')
        expect(meta.titre, `${parcours}/${chapter.slug} : titre vide`).not.toBe('')
        expect(chapter.titre).toBe(meta.titre)

        // Aucun squelette : chaque chapitre publié est déclaré complet et
        // rattaché à son parcours.
        expect(meta.statut, `${parcours}/${chapter.slug} : statut`).toBe('complet')
        expect(meta.parcours, `${parcours}/${chapter.slug} : parcours`).toBe(parcours)

        // Ordres uniques et strictement croissants (listChapters trie).
        expect(chapter.ordre, `${parcours}/${chapter.slug} : ordre`).toBeGreaterThan(previousOrdre)
        previousOrdre = chapter.ordre
      }
    },
  )

  it('FORMATION_META : une carte par parcours, famille connue du hub, ordre unique', () => {
    const ordres = new Set()
    for (const parcours of EXPECTED_PARCOURS) {
      const meta = FORMATION_META[parcours]
      expect(meta, `FORMATION_META.${parcours} manquant`).toBeDefined()
      expect(meta.titre).not.toBe('')
      expect(meta.audience).not.toBe('')
      expect(meta.pitch).not.toBe('')
      // La famille doit être une des sections affichées par GuidesView, sans
      // quoi la carte disparaît silencieusement de l'accueil du hub.
      expect(GUIDES_FAMILIES, `famille de ${parcours}`).toContain(meta.famille)
      expect(ordres.has(meta.ordre), `ordre dupliqué pour ${parcours}`).toBe(false)
      ordres.add(meta.ordre)
      // espace = lien de hash vers l'espace de rôle, ou null (pas d'espace).
      if (meta.espace !== null) expect(meta.espace).toMatch(/^#\//)
    }
  })
})

describe('formation-content — liens internes des chapitres (anti-liens-morts)', () => {
  it.each(EXPECTED_PARCOURS)(
    'parcours « %s » : tout lien NN-slug.md cible un chapitre existant et se réécrit vers #/guides',
    (parcours) => {
      const base = guidesBaseHash(parcours)
      for (const chapter of listChapters(parcours)) {
        const hrefs = [...chapter.raw.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1])
        for (const href of hrefs) {
          if (!href.endsWith('.md')) continue
          // Tout lien .md doit être de la forme réécrivable « NN-slug.md » :
          // toute autre forme resterait un lien mort dans le hub rendu.
          const match = /^(?:\.\/)?([0-9][0-9a-z-]*)\.md$/.exec(href)
          expect(match, `${parcours}/${chapter.slug} : lien .md non réécrivable « ${href} »`)
            .not.toBeNull()
          const slug = match[1]
          expect(
            getChapter(slug, parcours),
            `${parcours}/${chapter.slug} : lien mort vers « ${href} »`,
          ).not.toBeNull()
          expect(rewriteChapterLink(href, parcours, base)).toBe(`${base}/${slug}`)
        }
      }
    },
  )

  it('rewriteChapterLink laisse intacts les liens externes, les hash et les slugs inconnus', () => {
    const base = guidesBaseHash('noesiologie')
    expect(rewriteChapterLink('https://noesiology.education', 'noesiologie', base)).toBe(
      'https://noesiology.education',
    )
    expect(rewriteChapterLink('#/guides', 'noesiologie', base)).toBe('#/guides')
    expect(rewriteChapterLink('99-chapitre-inexistant.md', 'noesiologie', base)).toBe(
      '99-chapitre-inexistant.md',
    )
  })

  it('guidesBaseHash construit la base de hash du hub public', () => {
    expect(guidesBaseHash('visiteur')).toBe('#/guides/visiteur')
    expect(guidesBaseHash('admin')).toBe('#/guides/admin')
  })
})

describe('formation-content — passage noésiologie exigé par l’utilisateur', () => {
  // L'utilisateur a corrigé une première version erronée de ce guide : ce test
  // protège le passage validé (rôle de la noésiologie dans la rédaction d'un
  // portfolio réflexif) contre toute réécriture qui le ferait disparaître.
  it('le chapitre 01 contient le passage validé sur le portfolio réflexif', () => {
    const chapter = getChapter('01-quest-ce-que-la-noesiologie', 'noesiologie')
    expect(chapter).not.toBeNull()
    for (const passage of [
      'introspection',
      'analyse métacognitive',
      'habitus',
      'atteindre au plus vite son potentiel intellectuel maximal',
      'ne prétendons pas rendre les élèves plus intelligents',
      'se développer plus vite, au maximum de leurs capacités',
    ]) {
      expect(chapter.raw, `passage manquant : « ${passage} »`).toContain(passage)
    }
    // Comprendre l'ORIGINE de ce qui bloque pour le dépasser.
    expect(chapter.raw).toMatch(/origine/)
    // Le portail renvoie au site source (De Humani Cerebri Fabrica).
    expect(chapter.raw).toContain('noesiology.education')
  })
})

describe('formation-content — parcours inconnu', () => {
  it('listChapters et getChapter lèvent une erreur explicite', () => {
    expect(() => listChapters('inconnu')).toThrow(/Parcours de formation inconnu/)
    expect(() => getChapter('01-x', 'inconnu')).toThrow(/Parcours de formation inconnu/)
  })

  it('getChapter retourne null pour un slug inconnu d’un parcours connu', () => {
    expect(getChapter('99-chapitre-inexistant', 'visiteur')).toBeNull()
  })
})
