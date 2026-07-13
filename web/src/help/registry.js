// Aide contextuelle (item 4) — registre de contenu par RUBRIQUE (route), avec
// des variantes selon le RÔLE quand c'est utile. Le bouton « ? » de l'en-tête
// lit la route courante + la session et affiche l'entrée correspondante.
//
// Une entrée = { titre, intro, points: string[] }. Les variantes de rôle
// ajoutent des `points` ciblés à l'entrée de base.

/** @typedef {{titre: string, intro: string, points?: string[]}} HelpEntry */

/** @type {Record<string, HelpEntry>} par route (voir router.js). */
const BASE = {
  home: {
    titre: 'Bienvenue sur humanome.xyz',
    intro:
      'humanome.xyz cartographie les compétences humaines à partir d’un journal de bord réflexif. ' +
      'Vous pouvez explorer une cartographie de démonstration, essayer l’outil sur votre propre texte, ' +
      'ou créer un compte pour construire et partager la vôtre.',
    points: [
      '« Cartographie » : la démonstration sur des données réelles (59 journées).',
      '« Essayer » : collez un texte, obtenez une cartographie en direct, sans compte.',
      '« Référentiel » : les 61 compétences, en 7 pôles, sur lesquelles tout repose.',
    ],
  },
  merge: {
    titre: 'La cartographie évolutive',
    intro:
      'Chaque secteur du soleil est une compétence : sa LARGEUR indique la fréquence (nombre de ' +
      'journées où elle est établie), sa LONGUEUR l’intensité. Touchez un secteur pour lire son ' +
      'histoire d’apprentissage et les journées où elle apparaît.',
    points: [
      'Le calendrier sous le diagramme donne l’intensité jour par jour ; touchez une journée pour l’ouvrir.',
      'La timeline anime la construction de la cartographie au fil du temps.',
      'Vous pouvez charger votre propre cartographie (JSON) : elle ne quitte pas votre navigateur.',
      'Le bouton « Imprimer » produit un document (PDF) de la cartographie.',
    ],
  },
  day: {
    titre: 'La cartographie d’une journée',
    intro:
      'Le détail d’une feuille de portfolio : pour chaque compétence, le verdict (présence établie, ' +
      'renvoi au cartographe, non établie), l’examen adversarial du pédagogue et les traces retenues.',
    points: [
      'Les secteurs hachurés sont des « renvois au cartographe » : un doute qui appelle un arbitrage humain.',
      'Naviguez d’une journée à l’autre avec les flèches, ou revenez à la cartographie d’ensemble.',
    ],
  },
  essayer: {
    titre: 'Essayer sur votre texte',
    intro:
      'Collez une page de journal de bord ou tout texte réflexif : la plateforme le cartographie en ' +
      'direct, pôle par pôle, avec un modèle de langage fourni par la plateforme.',
    points: [
      'Aucune conservation : votre texte et le résultat disparaissent si vous rechargez la page.',
      'La démo est bornée (anti-abus) : si elle est très sollicitée, réessayez un peu plus tard.',
      'Pour conserver, comparer et partager vos cartographies, créez un compte.',
    ],
  },
  referentiel: {
    titre: 'Le référentiel de compétences',
    intro:
      'Les 61 compétences RESPIRE, réparties en 7 pôles (TÊTE, CŒUR, MAIN, ÂME, RACINES, CITÉ, ' +
      'FLAMBEAU). Public en lecture ; il est édité collectivement par les épistémiarques.',
    points: [
      'Recherchez une compétence par code (ex. 1.01) ou par nom.',
      'Chaque compétence a un permalien partageable.',
      'Les débats sur son évolution se tiennent sur l’espace participatif Decidim.',
    ],
  },
  portfolio: {
    titre: 'Votre portfolio',
    intro:
      'Votre journal de bord réflexif, découpé en journées. Il reste dans VOTRE navigateur par ' +
      'défaut ; rien n’est envoyé au serveur sans une action explicite de votre part.',
    points: [
      'Trois sources : collage direct, fichier .txt/.md, ou un Google Docs public.',
      'La segmentation en journées est automatique et ajustable (fusionner/scinder).',
      'Depuis un portfolio, vous lancez une cartographie dans « Mon espace ».',
    ],
  },
  espace: {
    titre: 'Mon espace apprenant',
    intro:
      'Le tableau de bord de vos portfolios, de vos cartographies et de votre formation. Vous y ' +
      'lancez une cartographie, choisissez sa confidentialité, la partagez et exportez vos données.',
    points: [
      'Lancer une cartographie : choisissez la version de prompt, le fournisseur (votre clé ou le service humanome), voyez l’estimation de coût, suivez la progression.',
      'Confidentialité par cartographie : privée, partagée avec votre cartographe, ou partageable par lien.',
      'Partage employeur : un lien protégé par mot de passe, en lecture seule.',
      'RGPD : exportez toutes vos données en un fichier, ou supprimez votre compte (effacement réel).',
    ],
  },
  account: {
    titre: 'Votre compte',
    intro:
      'Gérez votre session et vos données. Un compte permet de conserver vos cartographies, de les ' +
      'faire relire et de les partager.',
    points: [
      'Le rôle « apprenant » est attribué par défaut ; les autres rôles sont attribués par Harmonia Éducation.',
      'La suppression de compte purge réellement toutes vos données serveur (cahier §6).',
    ],
  },
  cartographe: {
    titre: 'Espace cartographe',
    intro:
      'Vous êtes le garde-fou humain : vous relisez, annotez, corrigez et « garantissez » les ' +
      'cartographies de vos apprentis. Aucune cartographie n’est présentée comme validée sans votre signature.',
    points: [
      'Acceptez un apprenti via son code d’invitation, puis relisez sa file de cartographies.',
      'Annotez par compétence (commentaire, hallucination, oubli) et corrigez les verdicts (une révision validée).',
      '« Valider et garantir » fige une révision : le lien de partage affiche « garantie par vous ».',
      'Comparez deux cartographies, lisez un rapport de consistance multi-run.',
    ],
  },
  promptologue: {
    titre: 'Atelier promptologue',
    intro:
      'Vous concevez, versionnez et testez les paquets de prompts qui produisent les cartographies. ' +
      'Le code d’un paquet s’exécute en bac à sable isolé chez les utilisateurs.',
    points: [
      'Créez un brouillon depuis une version publiée, éditez les gabarits, publiez (version immuable).',
      'Le banc d’essai compare deux versions (A/B) et mesure la consistance multi-run.',
      'La rétrospective rejoue une cartographie avec un référentiel plus récent.',
    ],
  },
  etablissement: {
    titre: 'Espace établissement',
    intro:
      'Cartographiez vos classes en masse : des cohortes rejointes par code d’invitation avec ' +
      'consentement explicite, une file de traitement, un budget plafonné.',
    points: [
      'Créez une cohorte, configurez votre fournisseur LLM et votre budget.',
      'Vos apprenants rejoignent avec leur consentement et déposent leur portfolio.',
      'Lancez un run de masse et suivez son avancement en direct ; les cartographies se lisent membre par membre.',
    ],
  },
  admin: {
    titre: 'Administration',
    intro:
      'La gestion de la plateforme : rôles des comptes, Golden Prompt, réglages de la démo publique ' +
      'et configuration serveur.',
    points: [
      '« Rôles » : attribuez cartographe, promptologue, épistémiarque, établissement ou admin à un compte.',
      '« Réglages » : activez/désactivez la démo, choisissez le modèle, réglez tokens et budget — effet immédiat.',
      '« Golden Prompt » : import privé, autorisation d’accès au cas par cas.',
    ],
  },
  guides: {
    titre: 'Guides & prise en main',
    intro:
      'Un manuel par profil d’utilisateur : ce que vous pouvez faire sur humanome.xyz et par où ' +
      'passer pour le faire. Tous les guides sont en accès libre ; choisissez celui qui correspond ' +
      'à votre rôle.',
    points: [
      'Visiteur, apprenant, employeur, établissement, cartographe, épistémiarque, promptologue : chacun a son parcours.',
      'Votre progression est cochée chapitre par chapitre (rattachée à votre compte si vous êtes connecté).',
      'Si vous avez un rôle, votre espace dédié propose la même formation avec votre suivi.',
    ],
  },
  confidentialite: {
    titre: 'Confidentialité',
    intro:
      'Comment vos données sont traitées : local par défaut, stockage serveur en opt-in explicite, ' +
      'export et suppression réels. Cette page détaille vos droits et les sous-traitants.',
  },
  share: {
    titre: 'Cartographie partagée',
    intro:
      'Une cartographie qu’un apprenant vous a partagée. Saisissez le mot de passe transmis pour la ' +
      'consulter en lecture seule. La mention « garantie par » indique qu’un cartographe l’a validée.',
  },
}

/** Entrée de repli quand aucune rubrique ne correspond. */
const FALLBACK = {
  titre: 'Aide',
  intro:
    'Utilisez la navigation en haut de page pour explorer la cartographie, essayer l’outil, consulter ' +
    'le référentiel ou accéder à votre espace. Le bouton « ? » donne l’aide de la rubrique ouverte.',
}

/**
 * Aide de la rubrique courante, adaptée au rôle si pertinent.
 *
 * @param {string} route nom de route (router.js)
 * @param {{roles?: string[]}} [session]
 * @returns {HelpEntry}
 */
export function helpFor(route, session = {}) {
  const entry = BASE[route] ?? FALLBACK
  const roles = session.roles ?? []
  // Astuce ciblée : sur l'accueil et la cartographie, rappeler à un rôle de
  // travail où se trouve son espace (ergonomie par famille, item 5).
  if ((route === 'home' || route === 'merge') && roles.includes('cartographe')) {
    return withExtra(entry, 'Vous êtes cartographe : votre file de relecture est dans « Espace cartographe ».')
  }
  if ((route === 'home' || route === 'merge') && roles.includes('etablissement')) {
    return withExtra(entry, 'Vous gérez un établissement : vos cohortes sont dans « Établissement ».')
  }
  return entry
}

function withExtra(entry, extra) {
  return { ...entry, points: [...(entry.points ?? []), extra] }
}
