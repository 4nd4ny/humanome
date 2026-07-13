// Contenu de formation (P8.2 puis M7, cahier §4.6) — EMBARQUÉ AU BUILD,
// MULTI-PARCOURS ('apprenant' | 'cartographe' | 'promptologue').
//
// Les Markdown de content/formation/<parcours>/ sont importés statiquement
// (import.meta.glob eager + ?raw) : ils voyagent dans le bundle IIFE et la
// formation fonctionne donc aussi sur une copie statique/file:// (ADR-003).
// import.meta.glob exige des motifs LITTÉRAUX : un glob par parcours.
// index.md est exclu de la liste des chapitres : l'accueil de la formation est
// reconstruit depuis les front-matter (le mini-parseur md.js ne rend pas les
// tableaux Markdown de l'index, volontairement).
//
// Compatibilité : tous les points d'entrée gardent 'apprenant' par défaut —
// les appels existants de l'espace apprenant sont inchangés.

import { parseFrontMatter } from '../../lib/md.js'

// Chemins relatifs depuis web/src/views/espace/ vers la racine du monorepo.
// import.meta.glob exige des motifs LITTÉRAUX : un glob par parcours.
const FILES_BY_PARCOURS = {
  visiteur: import.meta.glob('../../../../content/formation/visiteur/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  apprenant: import.meta.glob('../../../../content/formation/apprenant/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  employeur: import.meta.glob('../../../../content/formation/employeur/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  etablissement: import.meta.glob('../../../../content/formation/etablissement/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  cartographe: import.meta.glob('../../../../content/formation/cartographe/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  epistemiarque: import.meta.glob('../../../../content/formation/epistemiarque/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  promptologue: import.meta.glob('../../../../content/formation/promptologue/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  admin: import.meta.glob('../../../../content/formation/admin/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
}

/** Parcours de formation disponibles (cahier §4.6 + hub Guides). */
export const FORMATION_PARCOURS = Object.freeze(Object.keys(FILES_BY_PARCOURS))

/**
 * Base du hash de route de chaque parcours dans les ESPACES de rôle (routing
 * pré-câblé, ADR-009). Le hub public #/guides passe, lui, `baseHash` en prop
 * (voir guidesBaseHash) ; ces bases-ci ne concernent que les espaces connectés.
 */
export const FORMATION_BASE_HASH = Object.freeze({
  apprenant: '#/espace/formation',
  cartographe: '#/cartographe/formation',
  promptologue: '#/promptologue/formation',
})

/** Base de hash d'un parcours dans le hub public des guides. */
export function guidesBaseHash(parcours) {
  return `#/guides/${parcours}`
}

/**
 * Métadonnées d'affichage des parcours dans le hub public (item : manuels de
 * prise en main par rôle). `famille` regroupe les cartes ; `ordre` les trie.
 * `espace` = lien vers l'espace de rôle connecté quand il existe (sinon null).
 * @type {Record<string, {titre: string, audience: string, pitch: string, famille: string, ordre: number, espace: string | null}>}
 */
export const FORMATION_META = Object.freeze({
  visiteur: {
    titre: 'Découvrir humanome.xyz',
    audience: 'Visiteur — aucun compte requis',
    pitch:
      'Comprendre ce qu’est une cartographie de compétences humaines, explorer la démonstration ' +
      'et essayer l’outil sur votre propre texte.',
    famille: 'Découvrir',
    ordre: 10,
    espace: null,
  },
  apprenant: {
    titre: 'Construire sa cartographie',
    audience: 'Apprenant',
    pitch:
      'Rédiger un portfolio réflexif exploitable, lancer sa cartographie, la relire, la partager, ' +
      'maîtriser sa confidentialité.',
    famille: 'Votre cartographie',
    ordre: 20,
    espace: '#/espace/formation',
  },
  employeur: {
    titre: 'Lire une cartographie partagée',
    audience: 'Employeur / recruteur',
    pitch:
      'Ouvrir une cartographie qu’un candidat vous a partagée, la lire correctement, comprendre ce ' +
      'que « garantie par un cartographe » signifie — et ses limites.',
    famille: 'Votre cartographie',
    ordre: 30,
    espace: null,
  },
  cartographe: {
    titre: 'Relire et garantir',
    audience: 'Cartographe',
    pitch:
      'Le garde-fou humain : accepter des apprentis, relire, annoter, corriger et garantir des ' +
      'cartographies, animer des micro-classes RESPIRE.',
    famille: 'Encadrer',
    ordre: 40,
    espace: '#/cartographe/formation',
  },
  etablissement: {
    titre: 'Cartographier une cohorte',
    audience: 'Établissement de formation (B2B)',
    pitch:
      'Créer des cohortes avec consentement, configurer le budget LLM, lancer une cartographie de ' +
      'masse et lire les résultats dans le respect du RGPD.',
    famille: 'Encadrer',
    ordre: 50,
    espace: null,
  },
  epistemiarque: {
    titre: 'Faire évoluer le référentiel',
    audience: 'Épistémiarque',
    pitch:
      'La gouvernance collective des 61 compétences RESPIRE : proposer, débattre et versionner le ' +
      'référentiel qui fonde toutes les cartographies.',
    famille: 'Faire évoluer',
    ordre: 60,
    espace: null,
  },
  promptologue: {
    titre: 'Concevoir les prompts',
    audience: 'Promptologue',
    pitch:
      'Concevoir, tester et versionner les paquets de prompts (et leur code) qui produisent les ' +
      'cartographies : prompt engineering appliqué, bancs d’essai, Golden Prompt.',
    famille: 'Faire évoluer',
    ordre: 70,
    espace: '#/promptologue/formation',
  },
  admin: {
    titre: 'Administrer la plateforme',
    audience: 'Administrateur',
    pitch:
      'Rôles des comptes, Golden Prompt, réglages de la démo publique et exploitation serveur ' +
      '(déploiement, sauvegarde, RGPD).',
    famille: 'Administrer',
    ordre: 80,
    espace: '#/admin',
  },
})

/** @param {string} path @returns {string} slug = nom de fichier sans .md */
function slugOf(path) {
  return path.split('/').pop().replace(/\.md$/, '')
}

/** @param {string} parcours @returns {Record<string, string>} fichiers du parcours */
function filesOf(parcours) {
  const files = FILES_BY_PARCOURS[parcours]
  if (!files) {
    throw new Error(
      `Parcours de formation inconnu « ${parcours} » (attendus : ${FORMATION_PARCOURS.join(', ')})`,
    )
  }
  return files
}

const caches = new Map()

/**
 * Chapitres d'un parcours de formation, triés par numéro d'ordre.
 * @param {'apprenant'|'cartographe'|'promptologue'} [parcours='apprenant']
 * @returns {Array<{slug: string, ordre: number, titre: string, raw: string}>}
 */
export function listChapters(parcours = 'apprenant') {
  if (caches.has(parcours)) return caches.get(parcours)
  const chapters = Object.entries(filesOf(parcours))
    .map(([path, raw]) => ({ slug: slugOf(path), raw: String(raw) }))
    .filter(({ slug }) => slug !== 'index')
    .map(({ slug, raw }) => {
      const { meta } = parseFrontMatter(raw)
      const prefix = /^(\d+)/.exec(slug)
      return {
        slug,
        ordre: typeof meta.chapitre === 'number' ? meta.chapitre : Number(prefix?.[1] ?? 0),
        titre: typeof meta.titre === 'string' && meta.titre !== '' ? meta.titre : slug,
        raw,
      }
    })
    .sort((a, b) => a.ordre - b.ordre || a.slug.localeCompare(b.slug))
  caches.set(parcours, chapters)
  return chapters
}

/**
 * @param {string} slug
 * @param {'apprenant'|'cartographe'|'promptologue'} [parcours='apprenant']
 * @returns {{slug: string, ordre: number, titre: string, raw: string} | null}
 */
export function getChapter(slug, parcours = 'apprenant') {
  return listChapters(parcours).find((c) => c.slug === slug) ?? null
}

/**
 * Réécrit les liens internes des chapitres (« 02-….md » ->
 * « <base>/02-… ») ; les autres href sont laissés intacts. `base` par défaut =
 * l'espace de rôle du parcours ; le hub public passe `#/guides/<parcours>`.
 * @param {string} href
 * @param {string} [parcours='apprenant']
 * @param {string} [base] base de hash cible (défaut : FORMATION_BASE_HASH[parcours])
 * @returns {string}
 */
export function rewriteChapterLink(href, parcours = 'apprenant', base) {
  const target = base ?? FORMATION_BASE_HASH[parcours]
  const match = /^(?:\.\/)?([0-9][0-9a-z-]*)\.md$/.exec(String(href ?? ''))
  if (target && match && getChapter(match[1], parcours)) {
    return `${target}/${match[1]}`
  }
  return href
}
