// Navigation adaptée au rôle (items 3 & 5) — SOURCE UNIQUE des sections
// visibles selon le profil, regroupées par « famille » d'usage. La barre de
// navigation, le plan du site et l'aide contextuelle lisent tous ce module.
//
// Principe d'ergonomie : un visiteur ne voit que « Découvrir » ; dès qu'un rôle
// est présent dans la session, sa famille « Mon travail » apparaît. On ne noie
// personne sous des liens qui ne le concernent pas (cahier §2 : huit rôles).

/** Libellés lisibles des rôles (cahier §2). */
export const ROLE_LABELS = {
  apprenant: 'apprenant',
  cartographe: 'cartographe',
  promptologue: 'promptologue',
  epistemiarque: 'épistémiarque',
  employeur: 'employeur',
  etablissement: 'établissement',
  admin: 'administrateur',
}

/** Sections de découverte — visibles par TOUS, y compris le visiteur anonyme. */
export const DISCOVER_ITEMS = [
  { href: '#/', label: 'Accueil', route: 'home' },
  { href: '#/merge', label: 'Cartographie', route: 'merge' },
  { href: '#/essayer', label: 'Essayer', route: 'essayer' },
  { href: '#/referentiel', label: 'Référentiel', route: 'referentiel' },
  { href: '#/guides', label: 'Guides', route: 'guides' },
]

/**
 * Rôle → sections de travail. Un compte peut cumuler plusieurs rôles ; les
 * doublons de href sont dédupliqués. Le rôle « epistemiarque » édite le
 * référentiel sur #/referentiel (déjà dans Découvrir) : pas d'entrée en plus.
 * L'« employeur » consulte une cartographie via un lien de partage : pas
 * d'espace dédié en v1.
 */
export const ROLE_SECTIONS = {
  apprenant: [
    { href: '#/espace', label: 'Mon espace', route: 'espace' },
    { href: '#/portfolio', label: 'Mon portfolio', route: 'portfolio' },
    { href: '#/twin9', label: 'Analyse Twin_v9', route: 'twin9' },
  ],
  cartographe: [{ href: '#/cartographe', label: 'Espace cartographe', route: 'cartographe' }],
  promptologue: [{ href: '#/promptologue', label: 'Atelier promptologue', route: 'promptologue' }],
  etablissement: [{ href: '#/etablissement', label: 'Établissement', route: 'etablissement' }],
  admin: [{ href: '#/admin', label: 'Administration', route: 'admin' }],
}

/**
 * Groupes de navigation pour une session donnée.
 *
 * @param {{roles?: string[], authenticated?: boolean}} [session]
 * @returns {Array<{family: string, items: Array<{href: string, label: string, route: string}>}>}
 */
export function navGroups({ roles = [] } = {}) {
  const groups = [{ family: 'Découvrir', items: DISCOVER_ITEMS }]
  const work = []
  for (const role of roles) {
    for (const item of ROLE_SECTIONS[role] ?? []) {
      if (!work.some((existing) => existing.href === item.href)) work.push(item)
    }
  }
  if (work.length > 0) groups.push({ family: 'Mon travail', items: work })
  return groups
}

/**
 * Rôles « de travail » que le compte porte et qui ouvrent un espace dédié —
 * pour un message d'accueil orienté (ergonomie par famille, item 5).
 * @param {string[]} roles
 * @returns {string[]} rôles reconnus, sans « apprenant » (tout le monde l'a)
 */
export function workRoles(roles = []) {
  return roles.filter((r) => r !== 'apprenant' && r in ROLE_SECTIONS)
}
