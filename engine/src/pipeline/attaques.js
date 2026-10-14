// Moteur — typologie des attaques du pédagogue (protocole Aurora v3), sans
// dépendance : importable par l'interface sans tirer la validation.

// Noms retrouvés dans les raisonnements du corpus réel (« l'attaque (a)
// insuffisance probatoire… ») ; définitions déduites des 2895 motifAttaque.
export const ATTAQUES = Object.freeze({
  a: Object.freeze({
    nom: 'insuffisance probatoire',
    description:
      "la pièce dit moins que ce qu'on lui fait dire : trace brève ou terminale, "
      + 'cadre posé sans le travail concret montré, portée plus limitée que la compétence visée.',
  }),
  b: Object.freeze({
    nom: 'confusion de compétence',
    description:
      "la pièce active en réalité une AUTRE compétence du référentiel que celle du dossier "
      + '(citer le code de la compétence mieux servie).',
  }),
  c: Object.freeze({
    nom: 'biais de medium',
    description:
      "l'acte s'exerce dans un cadre au rabais — face à une IA, dans le journal lui-même, "
      + 'hors situation réelle — qui réduit sa portée transférable.',
  }),
  d: Object.freeze({
    nom: 'glissement lexical',
    description:
      'le vocabulaire de la compétence apparaît sans sa charge sémantique : mot plaqué, '
      + 'formule sans la mécanique qui la justifierait.',
  }),
  e: Object.freeze({
    nom: 'surinterprétation pédagogique',
    description:
      "le sens est projeté par l'analyste : lecture ajoutée que le texte de l'apprenant "
      + "n'autorise pas explicitement.",
  }),
  f: Object.freeze({
    nom: 'récit performatif',
    description:
      "l'apprenant raconte, nomme ou conceptualise l'acte au lieu de le montrer en acte : "
      + 'déclaration sans démonstration.',
  }),
  g: Object.freeze({
    nom: 'mouvement-vers',
    description:
      "intention, annonce ou projet différé : le geste est à venir, pas accompli sur cette feuille.",
  }),
  h: Object.freeze({
    nom: 'faux positif de fiche',
    description:
      'le marqueur de la compétence est activé à tort : production co-écrite par une IA ou '
      + 'coïncidence de surface avec le critère.',
  }),
})
