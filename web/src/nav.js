// Navigation par familles d'intention — SOURCE UNIQUE du plan du site.
// La barre (panneau burger), les tuiles de l'accueil et l'aide contextuelle
// lisent tous ce module (refonte 2026-07, docs/ergonomie-navigation.md).
//
// Principe d'ergonomie : le niveau 1 nomme des BUTS, pas des rôles ni des
// objets techniques. Chaque rôle ajoute UNE famille d'intention à la barre ;
// « Découvrir » et « Mon compte » sont visibles par tous. Les trois échelles
// de « cartographier un texte » portent un badge de valeur (gratuit /
// standard / premium) pour rendre l'échelle lisible depuis les libellés.

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

/**
 * Les sept familles d'intention.
 *
 * Item : { href, label, route?, section?, badge?, hint?, roles? }
 * - `route`/`section` servent au marquage `aria-current` (route du routeur +
 *   segment de sous-section) ; un item sans `route` n'est jamais marqué
 *   courant (cas « Partager ma cartographie », alias du tableau de bord).
 * - `badge` : échelle de valeur ('gratuit' | 'standard' | 'premium').
 * - `hint` : précision courte affichée sur les tuiles de l'accueil.
 * - `roles` (item) : restreint l'item à certains rôles DANS une famille
 *   multi-rôles (ex. « Faire évoluer » : promptologue + épistémiarque).
 *
 * Famille : { id, label, intent, audience, roles?, items }
 * - sans `roles`, la famille est visible par tous (Découvrir, Mon compte).
 */
export const FAMILIES = [
  {
    id: 'decouvrir',
    label: 'Découvrir',
    intent: 'Comprendre et essayer',
    audience: 'Tous — visiteur compris',
    items: [
      { href: '#/', label: 'Accueil', route: 'home' },
      { href: '#/merge', label: 'Cartographie (démonstration)', route: 'merge' },
      { href: '#/essayer', label: 'Essayer', route: 'essayer', badge: 'gratuit', hint: 'sans compte' },
      { href: '#/referentiel', label: 'Référentiel', route: 'referentiel', hint: '7 pôles, 61 compétences' },
      { href: '#/guides', label: 'Guides', route: 'guides', hint: 'prise en main par profil' },
    ],
  },
  {
    id: 'cartographie',
    label: 'Ma cartographie',
    intent: 'Construire et partager la mienne',
    audience: 'Apprenant',
    roles: ['apprenant'],
    items: [
      { href: '#/espace', label: 'Tableau de bord', route: 'espace', hint: 'portfolios, cartographies, formation' },
      { href: '#/portfolio', label: 'Mon portfolio', route: 'portfolio', hint: 'local, matière première d’un run' },
      {
        href: '#/espace/nouveau-run',
        label: 'Cartographier mes écrits',
        route: 'espace',
        section: 'nouveau-run',
        badge: 'standard',
      },
      { href: '#/twin6-ouverte', label: 'Cartographie ouverte', route: 'twin6ouverte', badge: 'gratuit', hint: 'Twin6 — open source' },
      { href: '#/twin9', label: 'Analyse approfondie', route: 'twin9', badge: 'premium', hint: 'Twin9' },
      { href: '#/espace', label: 'Partager ma cartographie', hint: 'lien protégé par mot de passe' },
    ],
  },
  {
    id: 'encadrer',
    label: 'Encadrer et garantir',
    intent: 'Relire, corriger, garantir',
    audience: 'Cartographe',
    roles: ['cartographe'],
    items: [
      { href: '#/cartographe', label: 'Ma file de relecture', route: 'cartographe' },
      { href: '#/cartographe/comparer', label: 'Comparer', route: 'cartographe', section: 'comparer' },
      {
        href: '#/cartographe/consistance',
        label: 'Consistance',
        route: 'cartographe',
        section: 'consistance',
        hint: 'multi-run',
      },
    ],
  },
  {
    id: 'piloter',
    label: 'Piloter mon organisation',
    intent: 'Cartographier des classes en masse',
    audience: 'Établissement (B2B)',
    roles: ['etablissement'],
    items: [
      {
        href: '#/etablissement',
        label: 'Mes cohortes',
        route: 'etablissement',
        hint: 'budget, runs de masse, membres',
      },
    ],
  },
  {
    id: 'evoluer',
    label: 'Faire évoluer',
    intent: 'Prompts et référentiel',
    audience: 'Promptologue · Épistémiarque',
    roles: ['promptologue', 'epistemiarque'],
    items: [
      {
        href: '#/promptologue',
        label: 'Atelier de prompts',
        route: 'promptologue',
        roles: ['promptologue'],
        hint: 'éditeur, banc d’essai, rétrospective',
      },
      {
        href: '#/referentiel',
        label: 'Édition du référentiel',
        route: 'referentiel',
        roles: ['epistemiarque'],
        hint: 'débats sur Decidim',
      },
    ],
  },
  {
    id: 'administrer',
    label: 'Administrer',
    intent: 'Gouvernance de la plateforme',
    audience: 'Administrateur',
    roles: ['admin'],
    items: [
      { href: '#/admin/roles', label: 'Rôles et comptes', route: 'admin', section: 'roles' },
      { href: '#/admin/golden', label: 'Golden Prompt', route: 'admin', section: 'golden' },
      { href: '#/admin/reglages', label: 'Réglages', route: 'admin', section: 'reglages' },
      { href: '#/admin/config', label: 'Configuration serveur', route: 'admin', section: 'config' },
      { href: '#/admin/twin9', label: 'Supervision Twin9', route: 'admin', section: 'twin9' },
    ],
  },
  // La famille « compte » est construite par navGroups (items selon session).
]

/** Items du compte selon l'état de session (identité + facturation, cahier §6). */
function compteFamily(authenticated) {
  return {
    id: 'compte',
    label: authenticated ? 'Mon compte' : 'Compte',
    intent: 'Qui je suis et ce que je paie',
    audience: 'Tous',
    items: authenticated
      ? [
          { href: '#/compte', label: 'Profil et rôles', route: 'account' },
          { href: '#/compte/credit', label: 'Crédit et factures', route: 'account', section: 'credit' },
          { href: '#/confidentialite', label: 'Confidentialité', route: 'confidentialite', hint: 'RGPD' },
        ]
      : [
          { href: '#/compte', label: 'Se connecter', route: 'account' },
          { href: '#/confidentialite', label: 'Confidentialité', route: 'confidentialite', hint: 'RGPD' },
        ],
  }
}

/**
 * Familles visibles pour une session donnée (navigation additive par rôle).
 *
 * @param {{roles?: string[], authenticated?: boolean}} [session]
 * @returns {Array<{id: string, label: string, intent: string, audience: string,
 *   items: Array<{href: string, label: string, route?: string, section?: string,
 *   badge?: string, hint?: string}>}>}
 */
export function navGroups({ roles = [], authenticated = roles.length > 0 } = {}) {
  const groups = []
  for (const family of FAMILIES) {
    if (family.roles && !family.roles.some((role) => roles.includes(role))) continue
    const items = family.items.filter(
      (item) => !item.roles || item.roles.some((role) => roles.includes(role)),
    )
    if (items.length > 0) groups.push({ ...family, items })
  }
  groups.push(compteFamily(authenticated))
  return groups
}

/**
 * Marquage « page courante » d'un item de navigation : même route ET même
 * sous-section (un item sans `section` ne matche que la racine de sa route,
 * pour que « Tableau de bord » ne s'allume pas sur #/espace/nouveau-run).
 *
 * @param {{route?: string, section?: string}} item
 * @param {{name: string, section?: string | null}} route route courante (router.js)
 * @returns {boolean}
 */
export function isCurrentItem(item, route) {
  if (!item.route || item.route !== route.name) return false
  return (item.section ?? null) === (route.section ?? null)
}
