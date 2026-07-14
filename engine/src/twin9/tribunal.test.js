// Tests de parité bit-à-bit de tribunal.js contre aurora/tribunal9.py (CPython).
// Vecteurs générés UNE FOIS via python3 (scratchpad/gen_tribunal_vectors.py)
// puis FIGÉS ci-dessous — les tests n'exécutent jamais Python. Côté Python le
// non-déterminisme a été neutralisé comme le contrat le prescrit (spec-index
// §4.10) : parallel_jures=False (≡ séquentiel JS), tmpdirs jetables, protocole
// SYNTHÉTIQUE (gabarits vides + 24-president.md = "{$VERDICT_CALCULE}" — aucun
// gabarit confidentiel n'est recopié ; le mock ignore le prompt, et le gabarit
// maison expose la chaîne VERDICT_CALCULE pour verrouiller le %.2f half-even).
// Chaque sortie attendue est la chaîne json.dumps(obj, ensure_ascii=False,
// indent=2) + "\n" de CPython : comparaison sur les OCTETS sérialisés.

import { describe, expect, it } from "vitest";

import { memArtefacts } from "./artefacts.js";
import { MockBackend } from "./backends.js";
import { sentencesDe } from "./journee.js";
import {
  BANQUE_ANGLES,
  JURES_SOCLE,
  PERSONAS_EMPREINTE,
  PERSONAS_VERSION,
  calculerConfiance,
  composerJury,
  infosPersonas,
  juger,
  jugerFaisceau,
  parseGardienRaisonnement,
  parseGardienSupport,
  parsePieces,
  parsePosition,
  resoudre,
  typeRole,
  verdictDossierVide,
} from "./tribunal.js";
import { PyFloat, pyJsonDumpsWriteJson } from "./py/pyJson.js";
import { stableHash } from "./util.js";

const V =
{
 "personas": "{\n  \"version\": \"personas-v1\",\n  \"empreinte\": \"1ec337d3a2ef\"\n}\n",
 "composer": [
  {
   "name": "defaut_pole_0",
   "pole": 0,
   "config": {},
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\"\n]\n"
  },
  {
   "name": "defaut_pole_1",
   "pole": 1,
   "config": {},
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Ingénieur\"\n]\n"
  },
  {
   "name": "defaut_pole_2",
   "pole": 2,
   "config": {},
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Interprète\"\n]\n"
  },
  {
   "name": "defaut_pole_3",
   "pole": 3,
   "config": {},
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Artisan\"\n]\n"
  },
  {
   "name": "defaut_pole_4",
   "pole": 4,
   "config": {},
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Éthicien\"\n]\n"
  },
  {
   "name": "defaut_pole_5",
   "pole": 5,
   "config": {},
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Clinicien du récit\"\n]\n"
  },
  {
   "name": "defaut_pole_6",
   "pole": 6,
   "config": {},
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Politiste\"\n]\n"
  },
  {
   "name": "defaut_pole_7",
   "pole": 7,
   "config": {},
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Compagnon\"\n]\n"
  },
  {
   "name": "defaut_pole_8",
   "pole": 8,
   "config": {},
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\"\n]\n"
  },
  {
   "name": "jury_null",
   "pole": 3,
   "config": {
    "jury": null
   },
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Artisan\"\n]\n"
  },
  {
   "name": "mode_upper",
   "pole": 2,
   "config": {
    "jury": {
     "mode": "SOCLE4+1"
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Interprète\"\n]\n"
  },
  {
   "name": "mode_inconnu",
   "pole": 6,
   "config": {
    "jury": {
     "mode": "fantaisie"
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Politiste\"\n]\n"
  },
  {
   "name": "s22_pole_1",
   "pole": 1,
   "config": {
    "jury": {
     "mode": "socle2+2"
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Pédagogue\",\n  \"Ingénieur\",\n  \"Historien\"\n]\n"
  },
  {
   "name": "s22_pole_2",
   "pole": 2,
   "config": {
    "jury": {
     "mode": "socle2+2"
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Pédagogue\",\n  \"Interprète\",\n  \"Sociologue\"\n]\n"
  },
  {
   "name": "s22_pole_3",
   "pole": 3,
   "config": {
    "jury": {
     "mode": "socle2+2"
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Pédagogue\",\n  \"Artisan\",\n  \"Historien\"\n]\n"
  },
  {
   "name": "s22_pole_4",
   "pole": 4,
   "config": {
    "jury": {
     "mode": "socle2+2"
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Pédagogue\",\n  \"Éthicien\",\n  \"Archiviste\"\n]\n"
  },
  {
   "name": "s22_pole_5",
   "pole": 5,
   "config": {
    "jury": {
     "mode": "socle2+2"
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Pédagogue\",\n  \"Clinicien du récit\",\n  \"Portraitiste\"\n]\n"
  },
  {
   "name": "s22_pole_6",
   "pole": 6,
   "config": {
    "jury": {
     "mode": "socle2+2"
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Pédagogue\",\n  \"Politiste\",\n  \"Sociologue\"\n]\n"
  },
  {
   "name": "s22_pole_7",
   "pole": 7,
   "config": {
    "jury": {
     "mode": "socle2+2"
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Pédagogue\",\n  \"Compagnon\",\n  \"Historien\"\n]\n"
  },
  {
   "name": "s22_pole_9",
   "pole": 9,
   "config": {
    "jury": {
     "mode": "socle2+2"
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Pédagogue\"\n]\n"
  },
  {
   "name": "s22_alias",
   "pole": 3,
   "config": {
    "jury": {
     "mode": "2+2"
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Pédagogue\",\n  \"Artisan\",\n  \"Historien\"\n]\n"
  },
  {
   "name": "surcharge_par_comp",
   "pole": 1,
   "config": {
    "jury": {
     "par_competence": {
      "1.01": "Politiste"
     }
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": "1.01",
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Politiste\"\n]\n"
  },
  {
   "name": "surcharge_par_comp_inconnue",
   "pole": 1,
   "config": {
    "jury": {
     "par_competence": {
      "1.01": "Zorro"
     }
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": "1.01",
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Ingénieur\"\n]\n"
  },
  {
   "name": "surcharge_par_comp_vide",
   "pole": 3,
   "config": {
    "jury": {
     "par_competence": {
      "3.01": ""
     },
     "specialistes": {
      "3": "Archiviste"
     }
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": "3.01",
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Archiviste\"\n]\n"
  },
  {
   "name": "surcharge_specialiste",
   "pole": 3,
   "config": {
    "jury": {
     "specialistes": {
      "3": "Archiviste"
     }
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": "3.01",
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Archiviste\"\n]\n"
  },
  {
   "name": "surcharge_specialiste_autre_pole",
   "pole": 4,
   "config": {
    "jury": {
     "specialistes": {
      "3": "Archiviste"
     }
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": "4.01",
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Éthicien\"\n]\n"
  },
  {
   "name": "s22_surcharge",
   "pole": 3,
   "config": {
    "jury": {
     "mode": "socle2+2",
     "specialistes": {
      "3": "Compagnon"
     }
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": "3.02",
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Pédagogue\",\n  \"Compagnon\",\n  \"Historien\"\n]\n"
  },
  {
   "name": "s22_surcharge_pole_inconnu",
   "pole": 9,
   "config": {
    "jury": {
     "mode": "socle2+2",
     "specialistes": {
      "9": "Ingénieur"
     }
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": "9.01",
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Pédagogue\",\n  \"Ingénieur\"\n]\n"
  },
  {
   "name": "faisceau_defaut",
   "pole": 2,
   "config": {},
   "authenticite": null,
   "faisceau": true,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Interprète\",\n  \"Portraitiste\"\n]\n"
  },
  {
   "name": "faisceau_sans_portraitiste",
   "pole": 2,
   "config": {
    "jury": {
     "portraitiste_au_second_ressort": false
    }
   },
   "authenticite": null,
   "faisceau": true,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Interprète\"\n]\n"
  },
  {
   "name": "faisceau_portraitiste_0",
   "pole": 2,
   "config": {
    "jury": {
     "portraitiste_au_second_ressort": 0
    }
   },
   "authenticite": null,
   "faisceau": true,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Interprète\"\n]\n"
  },
  {
   "name": "produite",
   "pole": 1,
   "config": {},
   "authenticite": "produite",
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Ingénieur\",\n  \"Archiviste\"\n]\n"
  },
  {
   "name": "produite_sans_archiviste",
   "pole": 1,
   "config": {
    "jury": {
     "archiviste_si_produite": false
    }
   },
   "authenticite": "produite",
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Ingénieur\"\n]\n"
  },
  {
   "name": "habitee_pas_archiviste",
   "pole": 1,
   "config": {},
   "authenticite": "habitée",
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Ingénieur\"\n]\n"
  },
  {
   "name": "s22_pole5_faisceau_dedup",
   "pole": 5,
   "config": {
    "jury": {
     "mode": "socle2+2"
    }
   },
   "authenticite": null,
   "faisceau": true,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Pédagogue\",\n  \"Clinicien du récit\",\n  \"Portraitiste\"\n]\n"
  },
  {
   "name": "s22_pole4_produite_dedup",
   "pole": 4,
   "config": {
    "jury": {
     "mode": "socle2+2"
    }
   },
   "authenticite": "produite",
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Pédagogue\",\n  \"Éthicien\",\n  \"Archiviste\"\n]\n"
  },
  {
   "name": "faisceau_et_produite",
   "pole": 6,
   "config": {},
   "authenticite": "produite",
   "faisceau": true,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Historien\",\n  \"Pédagogue\",\n  \"Sociologue\",\n  \"Politiste\",\n  \"Portraitiste\",\n  \"Archiviste\"\n]\n"
  },
  {
   "name": "alea_defaut",
   "pole": 3,
   "config": {
    "jury": {
     "mode": "aleatoire"
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": "3.02",
   "contexte": "J05",
   "out": "[\n  \"Artisan\",\n  \"Interprète\",\n  \"Archiviste\",\n  \"Historien\",\n  \"Clinicien du récit\"\n]\n"
  },
  {
   "name": "alea_graine42_t3",
   "pole": 5,
   "config": {
    "jury": {
     "mode": "aleatoire",
     "graine": 42,
     "taille_aleatoire": 3
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": "5.03",
   "contexte": "J07",
   "out": "[\n  \"Interprète\",\n  \"Clinicien du récit\",\n  \"Politiste\"\n]\n"
  },
  {
   "name": "alea_random_none",
   "pole": 4,
   "config": {
    "jury": {
     "mode": "random",
     "graine": null
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": null,
   "contexte": null,
   "out": "[\n  \"Linguiste\",\n  \"Ingénieur\",\n  \"Artisan\",\n  \"Historien\",\n  \"Interprète\"\n]\n"
  },
  {
   "name": "alea_taille_str",
   "pole": 2,
   "config": {
    "jury": {
     "mode": "aleatoire",
     "taille_aleatoire": " 6 "
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": "2.01",
   "contexte": "J01",
   "out": "[\n  \"Compagnon\",\n  \"Linguiste\",\n  \"Portraitiste\",\n  \"Ingénieur\",\n  \"Politiste\",\n  \"Historien\"\n]\n"
  },
  {
   "name": "alea_taille_100",
   "pole": 1,
   "config": {
    "jury": {
     "mode": "aleatoire",
     "taille_aleatoire": 100
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": "1.01",
   "contexte": "J01",
   "out": "[\n  \"Clinicien du récit\",\n  \"Portraitiste\",\n  \"Sociologue\",\n  \"Interprète\",\n  \"Linguiste\",\n  \"Historien\"\n]\n"
  },
  {
   "name": "alea_taille_1",
   "pole": 7,
   "config": {
    "jury": {
     "mode": "aleatoire",
     "taille_aleatoire": 1
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": "7.01",
   "contexte": "J02",
   "out": "[\n  \"Ingénieur\",\n  \"Éthicien\"\n]\n"
  },
  {
   "name": "alea_taille_float",
   "pole": 6,
   "config": {
    "jury": {
     "mode": "aleatoire",
     "taille_aleatoire": {
      "__f__": 2.9
     }
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": "6.01",
   "contexte": "J03",
   "out": "[\n  \"Historien\",\n  \"Portraitiste\"\n]\n"
  },
  {
   "name": "alea_graine_float",
   "pole": 3,
   "config": {
    "jury": {
     "mode": "aleatoire",
     "graine": {
      "__f__": 3.0
     }
    }
   },
   "authenticite": null,
   "faisceau": false,
   "code": "3.05",
   "contexte": "J09",
   "out": "[\n  \"Portraitiste\",\n  \"Ingénieur\",\n  \"Politiste\",\n  \"Linguiste\",\n  \"Compagnon\"\n]\n"
  },
  {
   "name": "alea_faisceau_sans_regles",
   "pole": 5,
   "config": {
    "jury": {
     "mode": "aleatoire",
     "graine": 9
    }
   },
   "authenticite": "produite",
   "faisceau": true,
   "code": "5.01",
   "contexte": "faisceau",
   "out": "[\n  \"Historien\",\n  \"Sociologue\",\n  \"Clinicien du récit\",\n  \"Artisan\",\n  \"Éthicien\"\n]\n"
  }
 ],
 "parse_position": [
  {
   "texte": "**Position** : détection\n**Pièces** : P1, P2\n**Piège** : —",
   "out": "{\n  \"position\": \"détection\",\n  \"pieces\": [\n    1,\n    2\n  ],\n  \"piege\": null\n}\n"
  },
  {
   "texte": "** position ** : CONTESTATION nette\n**Pièces** : P2, P 7, P10\n**Piège visé** : récit performatif (déclaration sans acte)",
   "out": "{\n  \"position\": \"contestation\",\n  \"pieces\": [\n    2,\n    7,\n    10\n  ],\n  \"piege\": \"récit performatif (déclaration sans acte)\"\n}\n"
  },
  {
   "texte": "**Position maintenue** : abstention\n**Pièces** : —",
   "out": "{\n  \"position\": \"abstention\",\n  \"pieces\": [],\n  \"piege\": null\n}\n"
  },
  {
   "texte": "**Position finale** : sans éclairage depuis mon angle",
   "out": "{\n  \"position\": \"abstention\",\n  \"pieces\": [],\n  \"piege\": null\n}\n"
  },
  {
   "texte": "**Position** : présence non établie\n**Pièces** : P3",
   "out": "{\n  \"position\": \"contestation\",\n  \"pieces\": [\n    3\n  ],\n  \"piege\": null\n}\n"
  },
  {
   "texte": "**Position** : établie\nJe cite P4 et P2 dans le corps. P1 aussi.",
   "out": "{\n  \"position\": \"détection\",\n  \"pieces\": [\n    1,\n    2,\n    4\n  ],\n  \"piege\": null\n}\n"
  },
  {
   "texte": "aucune balise exploitable, mais P5 traîne dans le texte",
   "out": "{\n  \"position\": null,\n  \"pieces\": [\n    5\n  ],\n  \"piege\": null\n}\n"
  },
  {
   "texte": "**Position** : détection\n**Pièges multiples** : aucun",
   "out": "{\n  \"position\": \"détection\",\n  \"pieces\": [],\n  \"piege\": null\n}\n"
  },
  {
   "texte": "**Position** : détection\n**Piège** : -",
   "out": "{\n  \"position\": \"détection\",\n  \"pieces\": [],\n  \"piege\": null\n}\n"
  },
  {
   "texte": "**Position** : détection\n**Piège** :   Aucun  ",
   "out": "{\n  \"position\": \"détection\",\n  \"pieces\": [],\n  \"piege\": null\n}\n"
  },
  {
   "texte": "**Position** : détection\n**Piège** : xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
   "out": "{\n  \"position\": \"détection\",\n  \"pieces\": [],\n  \"piege\": \"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\"\n}\n"
  },
  {
   "texte": "**Position** : hésitation profonde\n**Pièces** : P1",
   "out": "{\n  \"position\": null,\n  \"pieces\": [\n    1\n  ],\n  \"piege\": null\n}\n"
  },
  {
   "texte": "",
   "out": "{\n  \"position\": null,\n  \"pieces\": [],\n  \"piege\": null\n}\n"
  },
  {
   "texte": null,
   "out": "{\n  \"position\": null,\n  \"pieces\": [],\n  \"piege\": null\n}\n"
  }
 ],
 "parse_pieces": [
  {
   "texte": "#### Pièce 1\n- **Extrait** : « premier extrait\nsur deux lignes »\n- **Date** : 2026-01-05\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : ligne simple sans guillemets\n- **Type** : déclaration étayée\n\n#### pièce 3\n- **Extrait** : «  espaces  »\n- **Date** : hier\n\n#### Pièce 4\n- **Date** : sans extrait, pièce ignorée\n",
   "out": "[\n  {\n    \"num\": 1,\n    \"extrait\": \"premier extrait\\nsur deux lignes\",\n    \"date\": \"2026-01-05\",\n    \"type\": \"trace concrète\"\n  },\n  {\n    \"num\": 2,\n    \"extrait\": \"ligne simple sans guillemets\",\n    \"date\": null,\n    \"type\": \"déclaration étayée\"\n  },\n  {\n    \"num\": 3,\n    \"extrait\": \"espaces\",\n    \"date\": \"hier\",\n    \"type\": \"\"\n  }\n]\n"
  },
  {
   "texte": "#### Pièce 12\n- **Extrait** : « éééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééé »\n- **Type** : indice\n",
   "out": "[\n  {\n    \"num\": 12,\n    \"extrait\": \"éééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééééé\",\n    \"date\": null,\n    \"type\": \"indice\"\n  }\n]\n"
  },
  {
   "texte": "pas de pièce ici",
   "out": "[]\n"
  },
  {
   "texte": "",
   "out": "[]\n"
  },
  {
   "texte": null,
   "out": "[]\n"
  }
 ],
 "type_role": [
  {
   "texte": "trace concrète",
   "out": "[\n  \"trace_concrete\",\n  \"preuve décisive\"\n]\n"
  },
  {
   "texte": "Trace concrète datée",
   "out": "[\n  \"trace_concrete\",\n  \"preuve décisive\"\n]\n"
  },
  {
   "texte": "observation tierce",
   "out": "[\n  \"observation_tierce\",\n  \"preuve décisive\"\n]\n"
  },
  {
   "texte": "déclaration étayée",
   "out": "[\n  \"declaration_etayee\",\n  \"indice corroboratif\"\n]\n"
  },
  {
   "texte": "déclaration nue",
   "out": "[\n  null,\n  null\n]\n"
  },
  {
   "texte": "intention",
   "out": "[\n  null,\n  null\n]\n"
  },
  {
   "texte": "Intention future",
   "out": "[\n  null,\n  null\n]\n"
  },
  {
   "texte": "autre chose",
   "out": "[\n  \"indice\",\n  \"indice corroboratif\"\n]\n"
  },
  {
   "texte": "",
   "out": "[\n  \"indice\",\n  \"indice corroboratif\"\n]\n"
  },
  {
   "texte": null,
   "out": "[\n  \"indice\",\n  \"indice corroboratif\"\n]\n"
  }
 ],
 "gardien_support": [
  {
   "texte": "# Gardien\n\n**Constat** : le support gonfle\n\n## Motif\nmock",
   "out": "\"gonfle\"\n"
  },
  {
   "texte": "**Constat** : le support masque",
   "out": "\"masque\"\n"
  },
  {
   "texte": "**Constat** : neutre",
   "out": "\"neutre\"\n"
  },
  {
   "texte": "**CONSTAT** : Le Support GONFLE un peu",
   "out": "\"gonfle\"\n"
  },
  {
   "texte": "pas de ligne constat mais le mot gonfle est là",
   "out": "\"gonfle\"\n"
  },
  {
   "texte": "pas de ligne constat, rien à voir",
   "out": "\"neutre\"\n"
  },
  {
   "texte": "**Constat** : rien\nmasque en dehors de la ligne",
   "out": "\"neutre\"\n"
  },
  {
   "texte": "",
   "out": "\"neutre\"\n"
  },
  {
   "texte": null,
   "out": "\"neutre\"\n"
  }
 ],
 "gardien_raisonnement": [
  {
   "texte": "**Drapeau** : vice de raisonnement\n\n## Motif\nmock",
   "out": "true\n"
  },
  {
   "texte": "**Drapeau** : aucun",
   "out": "false\n"
  },
  {
   "texte": "**DRAPEAU** : VICE",
   "out": "true\n"
  },
  {
   "texte": "pas de drapeau mais un vice caché dans la prose",
   "out": "true\n"
  },
  {
   "texte": "pas de drapeau, texte sain",
   "out": "false\n"
  },
  {
   "texte": "**Drapeau** : rien\nvice ailleurs",
   "out": "false\n"
  },
  {
   "texte": "",
   "out": "false\n"
  },
  {
   "texte": null,
   "out": "false\n"
  }
 ],
 "resoudre": [
  {
   "name": "drapeau_prioritaire",
   "finaux": {
    "Linguiste": {
     "position": "détection"
    },
    "Historien": {
     "position": "contestation"
    }
   },
   "support": "neutre",
   "drapeau": true,
   "out": "[\n  \"renvoi au cartographe\",\n  \"drapeau du gardien du raisonnement\"\n]\n"
  },
  {
   "name": "aucune_detection",
   "finaux": {
    "Linguiste": {
     "position": "abstention"
    },
    "Historien": {
     "position": "abstention"
    },
    "Pédagogue": {
     "position": "abstention"
    },
    "Sociologue": {
     "position": "abstention"
    }
   },
   "support": "neutre",
   "drapeau": false,
   "out": "[\n  \"présence non établie\",\n  \"aucune détection survivante\"\n]\n"
  },
  {
   "name": "d_et_c",
   "finaux": {
    "Linguiste": {
     "position": "détection"
    },
    "Historien": {
     "position": "contestation"
    },
    "Pédagogue": {
     "position": "abstention"
    },
    "Sociologue": {
     "position": "abstention"
    }
   },
   "support": "neutre",
   "drapeau": false,
   "out": "[\n  \"renvoi au cartographe\",\n  \"détection et contestation subsistent après le second tour\"\n]\n"
  },
  {
   "name": "gonfle_isolee",
   "finaux": {
    "Linguiste": {
     "position": "détection"
    },
    "Historien": {
     "position": "abstention"
    },
    "Pédagogue": {
     "position": "abstention"
    },
    "Sociologue": {
     "position": "abstention"
    }
   },
   "support": "gonfle",
   "drapeau": false,
   "out": "[\n  \"renvoi au cartographe\",\n  \"résolution durcie (le support gonfle) : détection isolée\"\n]\n"
  },
  {
   "name": "gonfle_deux_detections",
   "finaux": {
    "Linguiste": {
     "position": "détection"
    },
    "Historien": {
     "position": "détection"
    }
   },
   "support": "gonfle",
   "drapeau": false,
   "out": "[\n  \"présence établie\",\n  \"détection(s) que personne ne conteste\"\n]\n"
  },
  {
   "name": "masque_isolee",
   "finaux": {
    "Linguiste": {
     "position": "détection"
    }
   },
   "support": "masque",
   "drapeau": false,
   "out": "[\n  \"présence établie\",\n  \"détection(s) que personne ne conteste\"\n]\n"
  },
  {
   "name": "etablie",
   "finaux": {
    "Linguiste": {
     "position": "détection"
    },
    "Historien": {
     "position": "détection"
    },
    "Pédagogue": {
     "position": "abstention"
    },
    "Sociologue": {
     "position": "abstention"
    }
   },
   "support": "neutre",
   "drapeau": false,
   "out": "[\n  \"présence établie\",\n  \"détection(s) que personne ne conteste\"\n]\n"
  },
  {
   "name": "finaux_incomplets",
   "finaux": {
    "Linguiste": {
     "position": "détection"
    }
   },
   "support": "neutre",
   "drapeau": false,
   "out": "[\n  \"présence établie\",\n  \"détection(s) que personne ne conteste\"\n]\n"
  },
  {
   "name": "finaux_vides",
   "finaux": {},
   "support": "neutre",
   "drapeau": false,
   "out": "[\n  \"présence non établie\",\n  \"aucune détection survivante\"\n]\n"
  }
 ],
 "confiance": [
  {
   "args": [
    "présence établie",
    0,
    0,
    0,
    0
   ],
   "out": "0.55\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    0,
    1
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    0,
    2
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    0,
    3
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    0,
    4
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    1,
    0
   ],
   "out": "0.5\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    1,
    1
   ],
   "out": "0.55\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    1,
    2
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    1,
    3
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    1,
    4
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    2,
    0
   ],
   "out": "0.45\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    2,
    1
   ],
   "out": "0.5\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    2,
    2
   ],
   "out": "0.55\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    2,
    3
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    2,
    4
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    3,
    0
   ],
   "out": "0.4\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    3,
    1
   ],
   "out": "0.45\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    3,
    2
   ],
   "out": "0.5\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    3,
    3
   ],
   "out": "0.55\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    3,
    4
   ],
   "out": "0.55\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    4,
    0
   ],
   "out": "0.35\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    4,
    1
   ],
   "out": "0.4\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    4,
    2
   ],
   "out": "0.45\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    4,
    3
   ],
   "out": "0.5\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    4,
    4
   ],
   "out": "0.5\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    5,
    0
   ],
   "out": "0.3\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    5,
    1
   ],
   "out": "0.35\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    5,
    2
   ],
   "out": "0.4\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    5,
    3
   ],
   "out": "0.45\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    5,
    4
   ],
   "out": "0.45\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    6,
    0
   ],
   "out": "0.25\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    6,
    1
   ],
   "out": "0.3\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    6,
    2
   ],
   "out": "0.35\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    6,
    3
   ],
   "out": "0.4\n"
  },
  {
   "args": [
    "présence établie",
    0,
    0,
    6,
    4
   ],
   "out": "0.4\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    0,
    0
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    0,
    1
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    0,
    2
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    0,
    3
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    0,
    4
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    1,
    0
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    1,
    1
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    1,
    2
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    1,
    3
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    1,
    4
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    2,
    0
   ],
   "out": "0.55\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    2,
    1
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    2,
    2
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    2,
    3
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    2,
    4
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    3,
    0
   ],
   "out": "0.5\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    3,
    1
   ],
   "out": "0.55\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    3,
    2
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    3,
    3
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    3,
    4
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    4,
    0
   ],
   "out": "0.45\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    4,
    1
   ],
   "out": "0.5\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    4,
    2
   ],
   "out": "0.55\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    4,
    3
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    4,
    4
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    5,
    0
   ],
   "out": "0.4\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    5,
    1
   ],
   "out": "0.45\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    5,
    2
   ],
   "out": "0.5\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    5,
    3
   ],
   "out": "0.55\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    5,
    4
   ],
   "out": "0.55\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    6,
    0
   ],
   "out": "0.35\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    6,
    1
   ],
   "out": "0.4\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    6,
    2
   ],
   "out": "0.45\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    6,
    3
   ],
   "out": "0.5\n"
  },
  {
   "args": [
    "présence établie",
    1,
    0,
    6,
    4
   ],
   "out": "0.5\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    0,
    0
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    0,
    1
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    0,
    2
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    0,
    3
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    0,
    4
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    1,
    0
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    1,
    1
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    1,
    2
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    1,
    3
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    1,
    4
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    2,
    0
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    2,
    1
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    2,
    2
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    2,
    3
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    2,
    4
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    3,
    0
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    3,
    1
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    3,
    2
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    3,
    3
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    3,
    4
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    4,
    0
   ],
   "out": "0.55\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    4,
    1
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    4,
    2
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    4,
    3
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    4,
    4
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    5,
    0
   ],
   "out": "0.5\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    5,
    1
   ],
   "out": "0.55\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    5,
    2
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    5,
    3
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    5,
    4
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    6,
    0
   ],
   "out": "0.45\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    6,
    1
   ],
   "out": "0.5\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    6,
    2
   ],
   "out": "0.55\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    6,
    3
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    2,
    0,
    6,
    4
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    0,
    0
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    0,
    1
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    0,
    2
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    0,
    3
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    0,
    4
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    1,
    0
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    1,
    1
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    1,
    2
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    1,
    3
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    1,
    4
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    2,
    0
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    2,
    1
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    2,
    2
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    2,
    3
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    2,
    4
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    3,
    0
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    3,
    1
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    3,
    2
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    3,
    3
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    3,
    4
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    4,
    0
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    4,
    1
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    4,
    2
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    4,
    3
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    4,
    4
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    5,
    0
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    5,
    1
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    5,
    2
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    5,
    3
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    5,
    4
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    6,
    0
   ],
   "out": "0.55\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    6,
    1
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    6,
    2
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    6,
    3
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    3,
    0,
    6,
    4
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    0,
    0
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    0,
    1
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    0,
    2
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    0,
    3
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    0,
    4
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    1,
    0
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    1,
    1
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    1,
    2
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    1,
    3
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    1,
    4
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    2,
    0
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    2,
    1
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    2,
    2
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    2,
    3
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    2,
    4
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    3,
    0
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    3,
    1
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    3,
    2
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    3,
    3
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    3,
    4
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    4,
    0
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    4,
    1
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    4,
    2
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    4,
    3
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    4,
    4
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    5,
    0
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    5,
    1
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    5,
    2
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    5,
    3
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    5,
    4
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    6,
    0
   ],
   "out": "0.55\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    6,
    1
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    6,
    2
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    6,
    3
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    4,
    0,
    6,
    4
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    0,
    0
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    0,
    1
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    0,
    2
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    0,
    3
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    0,
    4
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    1,
    0
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    1,
    1
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    1,
    2
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    1,
    3
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    1,
    4
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    2,
    0
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    2,
    1
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    2,
    2
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    2,
    3
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    2,
    4
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    3,
    0
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    3,
    1
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    3,
    2
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    3,
    3
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    3,
    4
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    4,
    0
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    4,
    1
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    4,
    2
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    4,
    3
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    4,
    4
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    5,
    0
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    5,
    1
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    5,
    2
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    5,
    3
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    5,
    4
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    6,
    0
   ],
   "out": "0.55\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    6,
    1
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    6,
    2
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    6,
    3
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    5,
    0,
    6,
    4
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    0,
    0
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    0,
    1
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    0,
    2
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    0,
    3
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    0,
    4
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    1,
    0
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    1,
    1
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    1,
    2
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    1,
    3
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    1,
    4
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    2,
    0
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    2,
    1
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    2,
    2
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    2,
    3
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    2,
    4
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    3,
    0
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    3,
    1
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    3,
    2
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    3,
    3
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    3,
    4
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    4,
    0
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    4,
    1
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    4,
    2
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    4,
    3
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    4,
    4
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    5,
    0
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    5,
    1
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    5,
    2
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    5,
    3
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    5,
    4
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    6,
    0
   ],
   "out": "0.55\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    6,
    1
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    6,
    2
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    6,
    3
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence établie",
    6,
    0,
    6,
    4
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    0,
    0,
    0
   ],
   "out": "0.6\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    0,
    1,
    0
   ],
   "out": "0.65\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    0,
    2,
    0
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    0,
    3,
    0
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    0,
    4,
    0
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    0,
    5,
    0
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    0,
    6,
    0
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    1,
    0,
    0
   ],
   "out": "0.7\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    1,
    1,
    0
   ],
   "out": "0.75\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    1,
    2,
    0
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    1,
    3,
    0
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    1,
    4,
    0
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    1,
    5,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    1,
    6,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    2,
    0,
    0
   ],
   "out": "0.8\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    2,
    1,
    0
   ],
   "out": "0.85\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    2,
    2,
    0
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    2,
    3,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    2,
    4,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    2,
    5,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    2,
    6,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    3,
    0,
    0
   ],
   "out": "0.9\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    3,
    1,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    3,
    2,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    3,
    3,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    3,
    4,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    3,
    5,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    3,
    6,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    4,
    0,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    4,
    1,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    4,
    2,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    4,
    3,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    4,
    4,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    4,
    5,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    4,
    6,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    5,
    0,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    5,
    1,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    5,
    2,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    5,
    3,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    5,
    4,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    5,
    5,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    5,
    6,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    6,
    0,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    6,
    1,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    6,
    2,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    6,
    3,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    6,
    4,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    6,
    5,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "présence non établie",
    0,
    6,
    6,
    0
   ],
   "out": "0.95\n"
  },
  {
   "args": [
    "renvoi au cartographe",
    3,
    2,
    1,
    4
   ],
   "out": "0.5\n"
  }
 ],
 "dossier_vide": "{\n  \"code\": \"9.01\",\n  \"nom\": \"Compétence fictive\",\n  \"dossier_vide\": true,\n  \"statut\": \"présence non établie\",\n  \"score_preuves\": 0,\n  \"score_indices\": 0,\n  \"confiance\": 0.9,\n  \"jury\": null,\n  \"traces_probantes\": [],\n  \"prescription\": {\n    \"pour_apprenant\": \"Cette journée ne contient pas encore de pièce pour Compétence fictive.\",\n    \"pour_cartographe\": null\n  },\n  \"gardien\": null,\n  \"etage\": \"tribunal-court-circuit\",\n  \"deliberation\": {\n    \"greffier_md\": \"# Greffier\\n\\nDOSSIER VIDE\"\n  }\n}\n",
 "mock_runs": {
  "m1_h8_produite": {
   "code": "1.01",
   "pole_num": 1,
   "jr": {
    "id": "J07",
    "date": "2026-04-12",
    "texte": "# Journée d'atelier\nCe matin, j'ai démonté entièrement le four solaire pour comprendre pourquoi la température plafonnait depuis mardi.\nJ'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.\nNous avons refait ensemble la mesure devant toute l'équipe réunie, et le résultat a confirmé mon hypothèse initiale.\nL'après-midi, j'ai expliqué à Lina comment régler le miroir secondaire sans forcer sur la charnière fragile.\nEn comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée.\nJ'ai noté dans le carnet de bord chaque essai raté, avec la cause probable et la correction tentée le lendemain.\nLe groupe m'a confié la coordination du planning parce que je tiens les délais depuis le début du trimestre.\nAvant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.\nQuand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier.\nCe soir, j'ai relu la fiche de sécurité et corrigé deux consignes que nous avions mal interprétées la semaine dernière.\n"
   },
   "config": {
    "backend_tribunal": {
     "model": "mock-heavy",
     "model_mini": "mock-mini"
    },
    "parallel_jures": false
   },
   "sentences_texte": null,
   "sentences_vides": false,
   "premiere_impression": "Première impression (test).",
   "calques": "- calque vivant (test)",
   "authenticite": "produite",
   "verdict": "{\n  \"code\": \"1.01\",\n  \"nom\": \"Compétence 1.01\",\n  \"dossier_vide\": false,\n  \"statut\": \"présence établie\",\n  \"score_preuves\": 1,\n  \"score_indices\": 1,\n  \"confiance\": 0.9,\n  \"jury\": {\n    \"mode\": \"socle4+1\",\n    \"personas\": {\n      \"version\": \"personas-v1\",\n      \"empreinte\": \"1ec337d3a2ef\"\n    },\n    \"detections\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\",\n      \"Ingénieur\",\n      \"Archiviste\"\n    ],\n    \"contestations\": [],\n    \"abstentions\": [],\n    \"second_tour\": true,\n    \"relance_par\": \"Historien\",\n    \"composition\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\",\n      \"Ingénieur\",\n      \"Archiviste\"\n    ],\n    \"positions_r1\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"contestation\",\n      \"Pédagogue\": \"détection\",\n      \"Sociologue\": \"détection\",\n      \"Ingénieur\": \"détection\",\n      \"Archiviste\": \"détection\"\n    },\n    \"positions_finales\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"détection\",\n      \"Sociologue\": \"détection\",\n      \"Ingénieur\": \"détection\",\n      \"Archiviste\": \"détection\"\n    },\n    \"pieges_nommes\": [],\n    \"consensus\": true,\n    \"dissidences\": []\n  },\n  \"traces_probantes\": [\n    {\n      \"piece\": 1,\n      \"extrait\": \"Ce matin, j'ai démonté entièrement le four solaire pour comprendre pourquoi la température plafonnait depuis mardi.\",\n      \"date\": \"2026-04-12\",\n      \"type\": \"trace_concrete\",\n      \"role\": \"preuve décisive\"\n    },\n    {\n      \"piece\": 2,\n      \"extrait\": \"Avant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.\",\n      \"date\": \"2026-04-12\",\n      \"type\": \"declaration_etayee\",\n      \"role\": \"indice corroboratif\"\n    }\n  ],\n  \"prescription\": {\n    \"pour_apprenant\": \"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\",\n    \"pour_cartographe\": null\n  },\n  \"gardien\": {\n    \"support\": {\n      \"constat\": \"neutre\"\n    },\n    \"raisonnement\": {\n      \"drapeau\": false\n    }\n  },\n  \"motif_regle\": \"détection(s) que personne ne conteste\",\n  \"dossier_cartographe\": null,\n  \"deliberation\": {\n    \"greffier_md\": \"# Greffier — 1.01 Compétence 1.01\\n\\n### Pièces extraites\\n\\n#### Pièce 1\\n- **Extrait** : « Ce matin, j'ai démonté entièrement le four solaire pour comprendre pourquoi la température plafonnait depuis mardi. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : trace concrète\\n- **Vigilance** : aucune\\n\\n#### Pièce 2\\n- **Extrait** : « Avant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n#### Pièce 3\\n- **Extrait** : « L'après-midi, j'ai expliqué à Lina comment régler le miroir secondaire sans forcer sur la charnière fragile. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n### Bilan\\n- Traces concrètes : 1\\n- Déclarations étayées : 2\\n- Déclarations nues : 0\\n- Intentions : 0\\n- Observations tierces : 0\\n- Alertes authenticité : 0\",\n    \"arene\": {\n      \"accusation_md\": \"# Accusation — 1.01 Compétence 1.01\\n\\n## Thèse\\nLes pièces P1-P3 montrent des actes datés.\\n\\n## Arguments\\n### Argument 1 — Acte documenté\\nPièces : P1. L'acte décrit correspond aux manifestations de la fiche.\\n\\n## Auto-évaluation de la force du dossier\\nmodérée — dossier réel mais étroit.\",\n      \"defense_md\": \"# Défense — 1.01 Compétence 1.01\\n\\n## Position générale\\nLe dossier est étroit.\\n\\n## Attaques\\n### Attaque 1 — Insuffisance probatoire — vise Argument 1 / Pièces P2, P3\\nDeux pièces sont déclaratives, sans dispositif.\\n\\n## Ce que la Défense concède\\nP1 décrit un acte réel.\\n\\n## Conclusion\\nContestation partielle : la présence repose sur P1 seule.\",\n      \"replique_md\": \"# Réplique — 1.01 Compétence 1.01\\n\\n### Réponse à l'Attaque 1\\npartiellement concédée — P2 reste un indice, P3 est abandonnée.\\n\\n## État final du réquisitoire\\nP1 (preuve) + P2 (indice) tiennent.\",\n      \"briefing_md\": \"# Briefing juré — 1.01 Compétence 1.01\\n\\n## Ce que soutient l'Accusation\\nP1 acte daté ; P2 indice.\\n\\n## Ce que soutient la Défense\\nP2-P3 déclaratives.\\n\\n## Issue de la réplique\\nP3 abandonnée.\\n\\n## Points de convergence\\nP1 est un acte réel.\\n\\n## Questions à trancher par le jury\\n1. P1 suffit-elle seule ? (P1)\\n2. P2 est-elle étayée ? (P2)\"\n    },\n    \"jures\": {\n      \"Linguiste\": {\n        \"r1_md\": \"# Juré Linguiste — 1.01 Compétence 1.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Linguiste — 1.01 Compétence 1.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Historien\": {\n        \"r1_md\": \"# Juré Historien — 1.01 Compétence 1.01\\n\\n**Position** : contestation\\n**Pièces** : P2, P3\\n**Piège visé** : récit performatif (déclaration sans acte)\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"contestation\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Pédagogue\": {\n        \"r1_md\": \"# Juré Pédagogue — 1.01 Compétence 1.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Pédagogue — 1.01 Compétence 1.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Sociologue\": {\n        \"r1_md\": \"# Juré Sociologue — 1.01 Compétence 1.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Sociologue — 1.01 Compétence 1.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Ingénieur\": {\n        \"r1_md\": \"# Juré Ingénieur — 1.01 Compétence 1.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Ingénieur — 1.01 Compétence 1.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Archiviste\": {\n        \"r1_md\": \"# Juré Archiviste — 1.01 Compétence 1.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Archiviste — 1.01 Compétence 1.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      }\n    },\n    \"relance_md\": \"# Relance — Historien — 1.01 Compétence 1.01\\n\\n**Position maintenue** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## L'argument qui justifie la réouverture\\nMon angle éclaire P1 autrement (mock).\\n\\n## Questions précises aux autres jurés\\n1. P1 décrit-elle un acte daté ? (P1)\\n2. P2 est-elle étayée ? (P2)\",\n    \"relance_par\": \"Historien\",\n    \"gardiens\": {\n      \"support_md\": \"# Gardien du support — 1.01 Compétence 1.01\\n\\n**Constat** : neutre\\n\\n## Motif\\nConstat sur le canal écrit, pas sur l'élève (mock).\",\n      \"raisonnement_md\": \"# Gardien du raisonnement — 1.01 Compétence 1.01\\n\\n**Drapeau** : aucun\\n\\n## Motif\\nLe raisonnement du collège tient (mock).\"\n    },\n    \"president_md\": \"# Président — 1.01 Compétence 1.01\\n\\n## Délibération\\n### Synthèse des positions\\n(récit mock du porte-parole — le statut calculé est : présence établie)\\n\\n## Prescription\\n\\n```json\\n{\\\"prescription\\\": {\\\"pour_apprenant\\\": \\\"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\\\", \\\"pour_cartographe\\\": null}}\\n```\"\n  },\n  \"etage\": \"tribunal\"\n}\n",
   "incidents": "{}\n",
   "files": "[\n  [\n    \"20-greffier.md\",\n    16020534382440\n  ],\n  [\n    \"21a-accusation.md\",\n    173144262732575\n  ],\n  [\n    \"21b-defense.md\",\n    899952019310\n  ],\n  [\n    \"22a-replique.md\",\n    167002155080517\n  ],\n  [\n    \"22b-briefing.md\",\n    105311868088587\n  ],\n  [\n    \"23-archiviste.md\",\n    252458234283742\n  ],\n  [\n    \"23-historien.md\",\n    128713543762322\n  ],\n  [\n    \"23-ingenieur.md\",\n    20987944788716\n  ],\n  [\n    \"23-linguiste.md\",\n    109773938303899\n  ],\n  [\n    \"23-pedagogue.md\",\n    59341946433665\n  ],\n  [\n    \"23-sociologue.md\",\n    83296614931677\n  ],\n  [\n    \"23b-relance.md\",\n    74122545103092\n  ],\n  [\n    \"23c-archiviste.md\",\n    162977089508994\n  ],\n  [\n    \"23c-ingenieur.md\",\n    181956433581634\n  ],\n  [\n    \"23c-linguiste.md\",\n    73864037194753\n  ],\n  [\n    \"23c-pedagogue.md\",\n    74093989138782\n  ],\n  [\n    \"23c-sociologue.md\",\n    68722107565283\n  ],\n  [\n    \"24-president.md\",\n    102550521466073\n  ],\n  [\n    \"25a-gardien-support.md\",\n    272979338132590\n  ],\n  [\n    \"25b-gardien-raisonnement.md\",\n    243289721983890\n  ]\n]\n"
  },
  "m2_h6_date_extraite": {
   "code": "5.02",
   "pole_num": 5,
   "jr": {
    "id": "2026-05-01",
    "texte": "# Journée d'atelier\nCe matin, j'ai démonté entièrement le four solaire pour comprendre pourquoi la température plafonnait depuis mardi.\nJ'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.\nNous avons refait ensemble la mesure devant toute l'équipe réunie, et le résultat a confirmé mon hypothèse initiale.\nL'après-midi, j'ai expliqué à Lina comment régler le miroir secondaire sans forcer sur la charnière fragile.\nEn comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée.\nJ'ai noté dans le carnet de bord chaque essai raté, avec la cause probable et la correction tentée le lendemain.\nLe groupe m'a confié la coordination du planning parce que je tiens les délais depuis le début du trimestre.\nAvant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.\nQuand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier.\nCe soir, j'ai relu la fiche de sécurité et corrigé deux consignes que nous avions mal interprétées la semaine dernière.\n"
   },
   "config": {
    "backend_tribunal": {
     "model": "mock-heavy",
     "model_mini": "mock-mini"
    },
    "parallel_jures": false
   },
   "sentences_texte": null,
   "sentences_vides": false,
   "premiere_impression": null,
   "calques": null,
   "authenticite": null,
   "verdict": "{\n  \"code\": \"5.02\",\n  \"nom\": \"Compétence 5.02\",\n  \"dossier_vide\": false,\n  \"statut\": \"présence établie\",\n  \"score_preuves\": 1,\n  \"score_indices\": 1,\n  \"confiance\": 0.85,\n  \"jury\": {\n    \"mode\": \"socle4+1\",\n    \"personas\": {\n      \"version\": \"personas-v1\",\n      \"empreinte\": \"1ec337d3a2ef\"\n    },\n    \"detections\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Clinicien du récit\"\n    ],\n    \"contestations\": [],\n    \"abstentions\": [\n      \"Sociologue\"\n    ],\n    \"second_tour\": false,\n    \"relance_par\": null,\n    \"composition\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\",\n      \"Clinicien du récit\"\n    ],\n    \"positions_r1\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"détection\",\n      \"Sociologue\": \"abstention\",\n      \"Clinicien du récit\": \"détection\"\n    },\n    \"positions_finales\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"détection\",\n      \"Sociologue\": \"abstention\",\n      \"Clinicien du récit\": \"détection\"\n    },\n    \"pieges_nommes\": [],\n    \"consensus\": true,\n    \"dissidences\": []\n  },\n  \"traces_probantes\": [\n    {\n      \"piece\": 1,\n      \"extrait\": \"Quand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier.\",\n      \"date\": \"2026-05-01\",\n      \"type\": \"trace_concrete\",\n      \"role\": \"preuve décisive\"\n    },\n    {\n      \"piece\": 2,\n      \"extrait\": \"J'ai noté dans le carnet de bord chaque essai raté, avec la cause probable et la correction tentée le lendemain.\",\n      \"date\": \"2026-05-01\",\n      \"type\": \"declaration_etayee\",\n      \"role\": \"indice corroboratif\"\n    }\n  ],\n  \"prescription\": {\n    \"pour_apprenant\": \"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\",\n    \"pour_cartographe\": null\n  },\n  \"gardien\": {\n    \"support\": {\n      \"constat\": \"neutre\"\n    },\n    \"raisonnement\": {\n      \"drapeau\": false\n    }\n  },\n  \"motif_regle\": \"détection(s) que personne ne conteste\",\n  \"dossier_cartographe\": null,\n  \"deliberation\": {\n    \"greffier_md\": \"# Greffier — 5.02 Compétence 5.02\\n\\n### Pièces extraites\\n\\n#### Pièce 1\\n- **Extrait** : « Quand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier. »\\n- **Date** : 2026-05-01\\n- **Localisation** : feuille 2026-05-01\\n- **Type** : trace concrète\\n- **Vigilance** : aucune\\n\\n#### Pièce 2\\n- **Extrait** : « J'ai noté dans le carnet de bord chaque essai raté, avec la cause probable et la correction tentée le lendemain. »\\n- **Date** : 2026-05-01\\n- **Localisation** : feuille 2026-05-01\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n#### Pièce 3\\n- **Extrait** : « J'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet. »\\n- **Date** : 2026-05-01\\n- **Localisation** : feuille 2026-05-01\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n### Bilan\\n- Traces concrètes : 1\\n- Déclarations étayées : 2\\n- Déclarations nues : 0\\n- Intentions : 0\\n- Observations tierces : 0\\n- Alertes authenticité : 0\",\n    \"arene\": {\n      \"accusation_md\": \"# Accusation — 5.02 Compétence 5.02\\n\\n## Thèse\\nLes pièces P1-P3 montrent des actes datés.\\n\\n## Arguments\\n### Argument 1 — Acte documenté\\nPièces : P1. L'acte décrit correspond aux manifestations de la fiche.\\n\\n## Auto-évaluation de la force du dossier\\nmodérée — dossier réel mais étroit.\",\n      \"defense_md\": \"# Défense — 5.02 Compétence 5.02\\n\\n## Position générale\\nLe dossier est étroit.\\n\\n## Attaques\\n### Attaque 1 — Insuffisance probatoire — vise Argument 1 / Pièces P2, P3\\nDeux pièces sont déclaratives, sans dispositif.\\n\\n## Ce que la Défense concède\\nP1 décrit un acte réel.\\n\\n## Conclusion\\nContestation partielle : la présence repose sur P1 seule.\",\n      \"replique_md\": \"# Réplique — 5.02 Compétence 5.02\\n\\n### Réponse à l'Attaque 1\\npartiellement concédée — P2 reste un indice, P3 est abandonnée.\\n\\n## État final du réquisitoire\\nP1 (preuve) + P2 (indice) tiennent.\",\n      \"briefing_md\": \"# Briefing juré — 5.02 Compétence 5.02\\n\\n## Ce que soutient l'Accusation\\nP1 acte daté ; P2 indice.\\n\\n## Ce que soutient la Défense\\nP2-P3 déclaratives.\\n\\n## Issue de la réplique\\nP3 abandonnée.\\n\\n## Points de convergence\\nP1 est un acte réel.\\n\\n## Questions à trancher par le jury\\n1. P1 suffit-elle seule ? (P1)\\n2. P2 est-elle étayée ? (P2)\"\n    },\n    \"jures\": {\n      \"Linguiste\": {\n        \"r1_md\": \"# Juré Linguiste — 5.02 Compétence 5.02\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Historien\": {\n        \"r1_md\": \"# Juré Historien — 5.02 Compétence 5.02\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Pédagogue\": {\n        \"r1_md\": \"# Juré Pédagogue — 5.02 Compétence 5.02\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Sociologue\": {\n        \"r1_md\": \"# Juré Sociologue — 5.02 Compétence 5.02\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Clinicien du récit\": {\n        \"r1_md\": \"# Juré Clinicien du récit — 5.02 Compétence 5.02\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      }\n    },\n    \"relance_md\": null,\n    \"relance_par\": null,\n    \"gardiens\": {\n      \"support_md\": \"# Gardien du support — 5.02 Compétence 5.02\\n\\n**Constat** : neutre\\n\\n## Motif\\nConstat sur le canal écrit, pas sur l'élève (mock).\",\n      \"raisonnement_md\": \"# Gardien du raisonnement — 5.02 Compétence 5.02\\n\\n**Drapeau** : aucun\\n\\n## Motif\\nLe raisonnement du collège tient (mock).\"\n    },\n    \"president_md\": \"# Président — 5.02 Compétence 5.02\\n\\n## Délibération\\n### Synthèse des positions\\n(récit mock du porte-parole — le statut calculé est : présence établie)\\n\\n## Prescription\\n\\n```json\\n{\\\"prescription\\\": {\\\"pour_apprenant\\\": \\\"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\\\", \\\"pour_cartographe\\\": null}}\\n```\"\n  },\n  \"etage\": \"tribunal\"\n}\n",
   "incidents": "{}\n",
   "files": "[\n  [\n    \"20-greffier.md\",\n    164948973243167\n  ],\n  [\n    \"21a-accusation.md\",\n    4780452865717\n  ],\n  [\n    \"21b-defense.md\",\n    59163585960563\n  ],\n  [\n    \"22a-replique.md\",\n    240611615731652\n  ],\n  [\n    \"22b-briefing.md\",\n    113289870522462\n  ],\n  [\n    \"23-clinicien du recit.md\",\n    181595905258610\n  ],\n  [\n    \"23-historien.md\",\n    10427577412972\n  ],\n  [\n    \"23-linguiste.md\",\n    202269578366310\n  ],\n  [\n    \"23-pedagogue.md\",\n    30193547583597\n  ],\n  [\n    \"23-sociologue.md\",\n    238942218326633\n  ],\n  [\n    \"24-president.md\",\n    2028106592249\n  ],\n  [\n    \"25a-gardien-support.md\",\n    228522951817126\n  ],\n  [\n    \"25b-gardien-raisonnement.md\",\n    82309364936069\n  ]\n]\n"
  },
  "m3_h9_renvoi": {
   "code": "4.01",
   "pole_num": 4,
   "jr": {
    "id": "J07",
    "date": "2026-04-12",
    "texte": "# Journée d'atelier\nCe matin, j'ai démonté entièrement le four solaire pour comprendre pourquoi la température plafonnait depuis mardi.\nJ'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.\nNous avons refait ensemble la mesure devant toute l'équipe réunie, et le résultat a confirmé mon hypothèse initiale.\nL'après-midi, j'ai expliqué à Lina comment régler le miroir secondaire sans forcer sur la charnière fragile.\nEn comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée.\nJ'ai noté dans le carnet de bord chaque essai raté, avec la cause probable et la correction tentée le lendemain.\nLe groupe m'a confié la coordination du planning parce que je tiens les délais depuis le début du trimestre.\nAvant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.\nQuand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier.\nCe soir, j'ai relu la fiche de sécurité et corrigé deux consignes que nous avions mal interprétées la semaine dernière.\n"
   },
   "config": {
    "backend_tribunal": {
     "model": "mock-heavy",
     "model_mini": "mock-mini"
    },
    "parallel_jures": false
   },
   "sentences_texte": null,
   "sentences_vides": false,
   "premiere_impression": null,
   "calques": null,
   "authenticite": null,
   "verdict": "{\n  \"code\": \"4.01\",\n  \"nom\": \"Compétence 4.01\",\n  \"dossier_vide\": false,\n  \"statut\": \"renvoi au cartographe\",\n  \"score_preuves\": \"R\",\n  \"score_indices\": \"R\",\n  \"confiance\": 0.5,\n  \"jury\": {\n    \"mode\": \"socle4+1\",\n    \"personas\": {\n      \"version\": \"personas-v1\",\n      \"empreinte\": \"1ec337d3a2ef\"\n    },\n    \"detections\": [\n      \"Linguiste\"\n    ],\n    \"contestations\": [\n      \"Pédagogue\"\n    ],\n    \"abstentions\": [\n      \"Historien\",\n      \"Sociologue\",\n      \"Éthicien\"\n    ],\n    \"second_tour\": true,\n    \"relance_par\": \"Pédagogue\",\n    \"composition\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\",\n      \"Éthicien\"\n    ],\n    \"positions_r1\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"abstention\",\n      \"Pédagogue\": \"contestation\",\n      \"Sociologue\": \"abstention\",\n      \"Éthicien\": \"abstention\"\n    },\n    \"positions_finales\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"abstention\",\n      \"Pédagogue\": \"contestation\",\n      \"Sociologue\": \"abstention\",\n      \"Éthicien\": \"abstention\"\n    },\n    \"pieges_nommes\": [\n      \"récit performatif (déclaration sans acte)\"\n    ],\n    \"consensus\": false,\n    \"dissidences\": [\n      \"Pédagogue : contestation (récit performatif (déclaration sans acte))\"\n    ]\n  },\n  \"traces_probantes\": [],\n  \"prescription\": {\n    \"pour_apprenant\": \"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\",\n    \"pour_cartographe\": \"Question à explorer en entretien : la pièce P1 relève-t-elle de 4.01 ? (mock)\"\n  },\n  \"gardien\": {\n    \"support\": {\n      \"constat\": \"neutre\"\n    },\n    \"raisonnement\": {\n      \"drapeau\": false\n    }\n  },\n  \"motif_regle\": \"détection et contestation subsistent après le second tour\",\n  \"dossier_cartographe\": {\n    \"motif\": \"détection et contestation subsistent après le second tour\",\n    \"desaccord\": \"détections : Linguiste — contestations : Pédagogue\",\n    \"pieges_envisages\": [\n      \"récit performatif (déclaration sans acte)\"\n    ],\n    \"citations\": [\n      \"En comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée.\",\n      \"J'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.\",\n      \"Avant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.\"\n    ]\n  },\n  \"deliberation\": {\n    \"greffier_md\": \"# Greffier — 4.01 Compétence 4.01\\n\\n### Pièces extraites\\n\\n#### Pièce 1\\n- **Extrait** : « En comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : trace concrète\\n- **Vigilance** : aucune\\n\\n#### Pièce 2\\n- **Extrait** : « J'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n#### Pièce 3\\n- **Extrait** : « Avant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n### Bilan\\n- Traces concrètes : 1\\n- Déclarations étayées : 2\\n- Déclarations nues : 0\\n- Intentions : 0\\n- Observations tierces : 0\\n- Alertes authenticité : 0\",\n    \"arene\": {\n      \"accusation_md\": \"# Accusation — 4.01 Compétence 4.01\\n\\n## Thèse\\nLes pièces P1-P3 montrent des actes datés.\\n\\n## Arguments\\n### Argument 1 — Acte documenté\\nPièces : P1. L'acte décrit correspond aux manifestations de la fiche.\\n\\n## Auto-évaluation de la force du dossier\\nmodérée — dossier réel mais étroit.\",\n      \"defense_md\": \"# Défense — 4.01 Compétence 4.01\\n\\n## Position générale\\nLe dossier est étroit.\\n\\n## Attaques\\n### Attaque 1 — Insuffisance probatoire — vise Argument 1 / Pièces P2, P3\\nDeux pièces sont déclaratives, sans dispositif.\\n\\n## Ce que la Défense concède\\nP1 décrit un acte réel.\\n\\n## Conclusion\\nContestation partielle : la présence repose sur P1 seule.\",\n      \"replique_md\": \"# Réplique — 4.01 Compétence 4.01\\n\\n### Réponse à l'Attaque 1\\npartiellement concédée — P2 reste un indice, P3 est abandonnée.\\n\\n## État final du réquisitoire\\nP1 (preuve) + P2 (indice) tiennent.\",\n      \"briefing_md\": \"# Briefing juré — 4.01 Compétence 4.01\\n\\n## Ce que soutient l'Accusation\\nP1 acte daté ; P2 indice.\\n\\n## Ce que soutient la Défense\\nP2-P3 déclaratives.\\n\\n## Issue de la réplique\\nP3 abandonnée.\\n\\n## Points de convergence\\nP1 est un acte réel.\\n\\n## Questions à trancher par le jury\\n1. P1 suffit-elle seule ? (P1)\\n2. P2 est-elle étayée ? (P2)\"\n    },\n    \"jures\": {\n      \"Linguiste\": {\n        \"r1_md\": \"# Juré Linguiste — 4.01 Compétence 4.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Linguiste — 4.01 Compétence 4.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Historien\": {\n        \"r1_md\": \"# Juré Historien — 4.01 Compétence 4.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Historien — 4.01 Compétence 4.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Pédagogue\": {\n        \"r1_md\": \"# Juré Pédagogue — 4.01 Compétence 4.01\\n\\n**Position** : contestation\\n**Pièces** : P2, P3\\n**Piège visé** : récit performatif (déclaration sans acte)\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"contestation\",\n        \"position_finale\": \"contestation\",\n        \"pieces\": [\n          2,\n          3\n        ],\n        \"piege\": \"récit performatif (déclaration sans acte)\"\n      },\n      \"Sociologue\": {\n        \"r1_md\": \"# Juré Sociologue — 4.01 Compétence 4.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Sociologue — 4.01 Compétence 4.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Éthicien\": {\n        \"r1_md\": \"# Juré Éthicien — 4.01 Compétence 4.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Éthicien — 4.01 Compétence 4.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      }\n    },\n    \"relance_md\": \"# Relance — Pédagogue — 4.01 Compétence 4.01\\n\\n**Position maintenue** : contestation\\n**Pièces** : P2, P3\\n**Piège visé** : récit performatif (déclaration sans acte)\\n\\n## L'argument qui justifie la réouverture\\nMon angle éclaire P1 autrement (mock).\\n\\n## Questions précises aux autres jurés\\n1. P1 décrit-elle un acte daté ? (P1)\\n2. P2 est-elle étayée ? (P2)\",\n    \"relance_par\": \"Pédagogue\",\n    \"gardiens\": {\n      \"support_md\": \"# Gardien du support — 4.01 Compétence 4.01\\n\\n**Constat** : neutre\\n\\n## Motif\\nConstat sur le canal écrit, pas sur l'élève (mock).\",\n      \"raisonnement_md\": \"# Gardien du raisonnement — 4.01 Compétence 4.01\\n\\n**Drapeau** : aucun\\n\\n## Motif\\nLe raisonnement du collège tient (mock).\"\n    },\n    \"president_md\": \"# Président — 4.01 Compétence 4.01\\n\\n## Délibération\\n### Synthèse des positions\\n(récit mock du porte-parole — le statut calculé est : renvoi au cartographe)\\n\\n## Prescription\\n\\n```json\\n{\\\"prescription\\\": {\\\"pour_apprenant\\\": \\\"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\\\", \\\"pour_cartographe\\\": \\\"Question à explorer en entretien : la pièce P1 relève-t-elle de 4.01 ? (mock)\\\"}}\\n```\"\n  },\n  \"etage\": \"tribunal\"\n}\n",
   "incidents": "{}\n",
   "files": "[\n  [\n    \"20-greffier.md\",\n    220092526405183\n  ],\n  [\n    \"21a-accusation.md\",\n    63263296092731\n  ],\n  [\n    \"21b-defense.md\",\n    174660581359160\n  ],\n  [\n    \"22a-replique.md\",\n    164908524405831\n  ],\n  [\n    \"22b-briefing.md\",\n    15655257428632\n  ],\n  [\n    \"23-ethicien.md\",\n    264760819938915\n  ],\n  [\n    \"23-historien.md\",\n    61224754022810\n  ],\n  [\n    \"23-linguiste.md\",\n    130353748993869\n  ],\n  [\n    \"23-pedagogue.md\",\n    194876919991590\n  ],\n  [\n    \"23-sociologue.md\",\n    119774272465503\n  ],\n  [\n    \"23b-relance.md\",\n    142241120095690\n  ],\n  [\n    \"23c-ethicien.md\",\n    115963728154463\n  ],\n  [\n    \"23c-historien.md\",\n    162281922415722\n  ],\n  [\n    \"23c-linguiste.md\",\n    38167850780110\n  ],\n  [\n    \"23c-sociologue.md\",\n    66987898537250\n  ],\n  [\n    \"24-president.md\",\n    239568971366865\n  ],\n  [\n    \"25a-gardien-support.md\",\n    236065373990251\n  ],\n  [\n    \"25b-gardien-raisonnement.md\",\n    40744508397068\n  ]\n]\n"
  },
  "m4_h1_gonfle": {
   "code": "2.01",
   "pole_num": 2,
   "jr": {
    "id": "J07",
    "date": "2026-04-12",
    "texte": "# Journée d'atelier\nCe matin, j'ai démonté entièrement le four solaire pour comprendre pourquoi la température plafonnait depuis mardi.\nJ'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.\nNous avons refait ensemble la mesure devant toute l'équipe réunie, et le résultat a confirmé mon hypothèse initiale.\nL'après-midi, j'ai expliqué à Lina comment régler le miroir secondaire sans forcer sur la charnière fragile.\nEn comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée.\nJ'ai noté dans le carnet de bord chaque essai raté, avec la cause probable et la correction tentée le lendemain.\nLe groupe m'a confié la coordination du planning parce que je tiens les délais depuis le début du trimestre.\nAvant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.\nQuand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier.\nCe soir, j'ai relu la fiche de sécurité et corrigé deux consignes que nous avions mal interprétées la semaine dernière.\n"
   },
   "config": {
    "backend_tribunal": {
     "model": "mock-heavy",
     "model_mini": "mock-mini"
    },
    "parallel_jures": false
   },
   "sentences_texte": null,
   "sentences_vides": false,
   "premiere_impression": null,
   "calques": null,
   "authenticite": null,
   "verdict": "{\n  \"code\": \"2.01\",\n  \"nom\": \"Compétence 2.01\",\n  \"dossier_vide\": false,\n  \"statut\": \"renvoi au cartographe\",\n  \"score_preuves\": \"R\",\n  \"score_indices\": \"R\",\n  \"confiance\": 0.5,\n  \"jury\": {\n    \"mode\": \"socle4+1\",\n    \"personas\": {\n      \"version\": \"personas-v1\",\n      \"empreinte\": \"1ec337d3a2ef\"\n    },\n    \"detections\": [\n      \"Historien\"\n    ],\n    \"contestations\": [],\n    \"abstentions\": [\n      \"Linguiste\",\n      \"Pédagogue\",\n      \"Sociologue\",\n      \"Interprète\"\n    ],\n    \"second_tour\": true,\n    \"relance_par\": \"Historien\",\n    \"composition\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\",\n      \"Interprète\"\n    ],\n    \"positions_r1\": {\n      \"Linguiste\": \"abstention\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"abstention\",\n      \"Sociologue\": \"abstention\",\n      \"Interprète\": \"abstention\"\n    },\n    \"positions_finales\": {\n      \"Linguiste\": \"abstention\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"abstention\",\n      \"Sociologue\": \"abstention\",\n      \"Interprète\": \"abstention\"\n    },\n    \"pieges_nommes\": [],\n    \"consensus\": true,\n    \"dissidences\": []\n  },\n  \"traces_probantes\": [],\n  \"prescription\": {\n    \"pour_apprenant\": \"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\",\n    \"pour_cartographe\": \"Question à explorer en entretien : la pièce P1 relève-t-elle de 2.01 ? (mock)\"\n  },\n  \"gardien\": {\n    \"support\": {\n      \"constat\": \"gonfle\"\n    },\n    \"raisonnement\": {\n      \"drapeau\": false\n    }\n  },\n  \"motif_regle\": \"résolution durcie (le support gonfle) : détection isolée\",\n  \"dossier_cartographe\": {\n    \"motif\": \"résolution durcie (le support gonfle) : détection isolée\",\n    \"desaccord\": \"détections : Historien — contestations : aucune\",\n    \"pieges_envisages\": [],\n    \"citations\": [\n      \"Avant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.\",\n      \"En comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée.\"\n    ]\n  },\n  \"deliberation\": {\n    \"greffier_md\": \"# Greffier — 2.01 Compétence 2.01\\n\\n### Pièces extraites\\n\\n#### Pièce 1\\n- **Extrait** : « Avant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : trace concrète\\n- **Vigilance** : aucune\\n\\n#### Pièce 2\\n- **Extrait** : « En comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n#### Pièce 3\\n- **Extrait** : « Ce matin, j'ai démonté entièrement le four solaire pour comprendre pourquoi la température plafonnait depuis mardi. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n### Bilan\\n- Traces concrètes : 1\\n- Déclarations étayées : 2\\n- Déclarations nues : 0\\n- Intentions : 0\\n- Observations tierces : 0\\n- Alertes authenticité : 0\",\n    \"arene\": {\n      \"accusation_md\": \"# Accusation — 2.01 Compétence 2.01\\n\\n## Thèse\\nLes pièces P1-P3 montrent des actes datés.\\n\\n## Arguments\\n### Argument 1 — Acte documenté\\nPièces : P1. L'acte décrit correspond aux manifestations de la fiche.\\n\\n## Auto-évaluation de la force du dossier\\nmodérée — dossier réel mais étroit.\",\n      \"defense_md\": \"# Défense — 2.01 Compétence 2.01\\n\\n## Position générale\\nLe dossier est étroit.\\n\\n## Attaques\\n### Attaque 1 — Insuffisance probatoire — vise Argument 1 / Pièces P2, P3\\nDeux pièces sont déclaratives, sans dispositif.\\n\\n## Ce que la Défense concède\\nP1 décrit un acte réel.\\n\\n## Conclusion\\nContestation partielle : la présence repose sur P1 seule.\",\n      \"replique_md\": \"# Réplique — 2.01 Compétence 2.01\\n\\n### Réponse à l'Attaque 1\\npartiellement concédée — P2 reste un indice, P3 est abandonnée.\\n\\n## État final du réquisitoire\\nP1 (preuve) + P2 (indice) tiennent.\",\n      \"briefing_md\": \"# Briefing juré — 2.01 Compétence 2.01\\n\\n## Ce que soutient l'Accusation\\nP1 acte daté ; P2 indice.\\n\\n## Ce que soutient la Défense\\nP2-P3 déclaratives.\\n\\n## Issue de la réplique\\nP3 abandonnée.\\n\\n## Points de convergence\\nP1 est un acte réel.\\n\\n## Questions à trancher par le jury\\n1. P1 suffit-elle seule ? (P1)\\n2. P2 est-elle étayée ? (P2)\"\n    },\n    \"jures\": {\n      \"Linguiste\": {\n        \"r1_md\": \"# Juré Linguiste — 2.01 Compétence 2.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Linguiste — 2.01 Compétence 2.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Historien\": {\n        \"r1_md\": \"# Juré Historien — 2.01 Compétence 2.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Pédagogue\": {\n        \"r1_md\": \"# Juré Pédagogue — 2.01 Compétence 2.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Pédagogue — 2.01 Compétence 2.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Sociologue\": {\n        \"r1_md\": \"# Juré Sociologue — 2.01 Compétence 2.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Sociologue — 2.01 Compétence 2.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Interprète\": {\n        \"r1_md\": \"# Juré Interprète — 2.01 Compétence 2.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Interprète — 2.01 Compétence 2.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      }\n    },\n    \"relance_md\": \"# Relance — Historien — 2.01 Compétence 2.01\\n\\n**Position maintenue** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## L'argument qui justifie la réouverture\\nMon angle éclaire P1 autrement (mock).\\n\\n## Questions précises aux autres jurés\\n1. P1 décrit-elle un acte daté ? (P1)\\n2. P2 est-elle étayée ? (P2)\",\n    \"relance_par\": \"Historien\",\n    \"gardiens\": {\n      \"support_md\": \"# Gardien du support — 2.01 Compétence 2.01\\n\\n**Constat** : le support gonfle\\n\\n## Motif\\nConstat sur le canal écrit, pas sur l'élève (mock).\",\n      \"raisonnement_md\": \"# Gardien du raisonnement — 2.01 Compétence 2.01\\n\\n**Drapeau** : aucun\\n\\n## Motif\\nLe raisonnement du collège tient (mock).\"\n    },\n    \"president_md\": \"# Président — 2.01 Compétence 2.01\\n\\n## Délibération\\n### Synthèse des positions\\n(récit mock du porte-parole — le statut calculé est : renvoi au cartographe)\\n\\n## Prescription\\n\\n```json\\n{\\\"prescription\\\": {\\\"pour_apprenant\\\": \\\"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\\\", \\\"pour_cartographe\\\": \\\"Question à explorer en entretien : la pièce P1 relève-t-elle de 2.01 ? (mock)\\\"}}\\n```\"\n  },\n  \"etage\": \"tribunal\"\n}\n",
   "incidents": "{}\n",
   "files": "[\n  [\n    \"20-greffier.md\",\n    209704502409584\n  ],\n  [\n    \"21a-accusation.md\",\n    62065839718856\n  ],\n  [\n    \"21b-defense.md\",\n    260525317430322\n  ],\n  [\n    \"22a-replique.md\",\n    219861303880766\n  ],\n  [\n    \"22b-briefing.md\",\n    15529827847934\n  ],\n  [\n    \"23-historien.md\",\n    188992965885941\n  ],\n  [\n    \"23-interprete.md\",\n    149708926430697\n  ],\n  [\n    \"23-linguiste.md\",\n    49390578638402\n  ],\n  [\n    \"23-pedagogue.md\",\n    172028934167657\n  ],\n  [\n    \"23-sociologue.md\",\n    277265538073605\n  ],\n  [\n    \"23b-relance.md\",\n    264410901293309\n  ],\n  [\n    \"23c-interprete.md\",\n    175134116059453\n  ],\n  [\n    \"23c-linguiste.md\",\n    144639006960199\n  ],\n  [\n    \"23c-pedagogue.md\",\n    123932077576396\n  ],\n  [\n    \"23c-sociologue.md\",\n    11585674432068\n  ],\n  [\n    \"24-president.md\",\n    221264868038266\n  ],\n  [\n    \"25a-gardien-support.md\",\n    70988371265663\n  ],\n  [\n    \"25b-gardien-raisonnement.md\",\n    253652442342413\n  ]\n]\n"
  },
  "m5_h4_drapeau": {
   "code": "3.02",
   "pole_num": 3,
   "jr": {
    "id": "J07",
    "date": "2026-04-12",
    "texte": "# Journée d'atelier\nCe matin, j'ai démonté entièrement le four solaire pour comprendre pourquoi la température plafonnait depuis mardi.\nJ'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.\nNous avons refait ensemble la mesure devant toute l'équipe réunie, et le résultat a confirmé mon hypothèse initiale.\nL'après-midi, j'ai expliqué à Lina comment régler le miroir secondaire sans forcer sur la charnière fragile.\nEn comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée.\nJ'ai noté dans le carnet de bord chaque essai raté, avec la cause probable et la correction tentée le lendemain.\nLe groupe m'a confié la coordination du planning parce que je tiens les délais depuis le début du trimestre.\nAvant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.\nQuand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier.\nCe soir, j'ai relu la fiche de sécurité et corrigé deux consignes que nous avions mal interprétées la semaine dernière.\n"
   },
   "config": {
    "backend_tribunal": {
     "model": "mock-heavy",
     "model_mini": "mock-mini"
    },
    "parallel_jures": false
   },
   "sentences_texte": null,
   "sentences_vides": false,
   "premiere_impression": null,
   "calques": null,
   "authenticite": null,
   "verdict": "{\n  \"code\": \"3.02\",\n  \"nom\": \"Compétence 3.02\",\n  \"dossier_vide\": false,\n  \"statut\": \"renvoi au cartographe\",\n  \"score_preuves\": \"R\",\n  \"score_indices\": \"R\",\n  \"confiance\": 0.5,\n  \"jury\": {\n    \"mode\": \"socle4+1\",\n    \"personas\": {\n      \"version\": \"personas-v1\",\n      \"empreinte\": \"1ec337d3a2ef\"\n    },\n    \"detections\": [\n      \"Historien\"\n    ],\n    \"contestations\": [],\n    \"abstentions\": [\n      \"Linguiste\",\n      \"Pédagogue\",\n      \"Sociologue\",\n      \"Artisan\"\n    ],\n    \"second_tour\": true,\n    \"relance_par\": \"Linguiste\",\n    \"composition\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\",\n      \"Artisan\"\n    ],\n    \"positions_r1\": {\n      \"Linguiste\": \"contestation\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"abstention\",\n      \"Sociologue\": \"abstention\",\n      \"Artisan\": \"abstention\"\n    },\n    \"positions_finales\": {\n      \"Linguiste\": \"abstention\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"abstention\",\n      \"Sociologue\": \"abstention\",\n      \"Artisan\": \"abstention\"\n    },\n    \"pieges_nommes\": [],\n    \"consensus\": true,\n    \"dissidences\": []\n  },\n  \"traces_probantes\": [],\n  \"prescription\": {\n    \"pour_apprenant\": \"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\",\n    \"pour_cartographe\": \"Question à explorer en entretien : la pièce P1 relève-t-elle de 3.02 ? (mock)\"\n  },\n  \"gardien\": {\n    \"support\": {\n      \"constat\": \"neutre\"\n    },\n    \"raisonnement\": {\n      \"drapeau\": true\n    }\n  },\n  \"motif_regle\": \"drapeau du gardien du raisonnement\",\n  \"dossier_cartographe\": {\n    \"motif\": \"drapeau du gardien du raisonnement\",\n    \"desaccord\": \"détections : Historien — contestations : aucune\",\n    \"pieges_envisages\": [],\n    \"citations\": [\n      \"Avant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.\",\n      \"En comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée.\"\n    ]\n  },\n  \"deliberation\": {\n    \"greffier_md\": \"# Greffier — 3.02 Compétence 3.02\\n\\n### Pièces extraites\\n\\n#### Pièce 1\\n- **Extrait** : « Avant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : trace concrète\\n- **Vigilance** : aucune\\n\\n#### Pièce 2\\n- **Extrait** : « En comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n#### Pièce 3\\n- **Extrait** : « Ce matin, j'ai démonté entièrement le four solaire pour comprendre pourquoi la température plafonnait depuis mardi. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n### Bilan\\n- Traces concrètes : 1\\n- Déclarations étayées : 2\\n- Déclarations nues : 0\\n- Intentions : 0\\n- Observations tierces : 0\\n- Alertes authenticité : 0\",\n    \"arene\": {\n      \"accusation_md\": \"# Accusation — 3.02 Compétence 3.02\\n\\n## Thèse\\nLes pièces P1-P3 montrent des actes datés.\\n\\n## Arguments\\n### Argument 1 — Acte documenté\\nPièces : P1. L'acte décrit correspond aux manifestations de la fiche.\\n\\n## Auto-évaluation de la force du dossier\\nmodérée — dossier réel mais étroit.\",\n      \"defense_md\": \"# Défense — 3.02 Compétence 3.02\\n\\n## Position générale\\nLe dossier est étroit.\\n\\n## Attaques\\n### Attaque 1 — Insuffisance probatoire — vise Argument 1 / Pièces P2, P3\\nDeux pièces sont déclaratives, sans dispositif.\\n\\n## Ce que la Défense concède\\nP1 décrit un acte réel.\\n\\n## Conclusion\\nContestation partielle : la présence repose sur P1 seule.\",\n      \"replique_md\": \"# Réplique — 3.02 Compétence 3.02\\n\\n### Réponse à l'Attaque 1\\npartiellement concédée — P2 reste un indice, P3 est abandonnée.\\n\\n## État final du réquisitoire\\nP1 (preuve) + P2 (indice) tiennent.\",\n      \"briefing_md\": \"# Briefing juré — 3.02 Compétence 3.02\\n\\n## Ce que soutient l'Accusation\\nP1 acte daté ; P2 indice.\\n\\n## Ce que soutient la Défense\\nP2-P3 déclaratives.\\n\\n## Issue de la réplique\\nP3 abandonnée.\\n\\n## Points de convergence\\nP1 est un acte réel.\\n\\n## Questions à trancher par le jury\\n1. P1 suffit-elle seule ? (P1)\\n2. P2 est-elle étayée ? (P2)\"\n    },\n    \"jures\": {\n      \"Linguiste\": {\n        \"r1_md\": \"# Juré Linguiste — 3.02 Compétence 3.02\\n\\n**Position** : contestation\\n**Pièces** : P2, P3\\n**Piège visé** : récit performatif (déclaration sans acte)\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"contestation\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Historien\": {\n        \"r1_md\": \"# Juré Historien — 3.02 Compétence 3.02\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Historien — 3.02 Compétence 3.02\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Pédagogue\": {\n        \"r1_md\": \"# Juré Pédagogue — 3.02 Compétence 3.02\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Pédagogue — 3.02 Compétence 3.02\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Sociologue\": {\n        \"r1_md\": \"# Juré Sociologue — 3.02 Compétence 3.02\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Sociologue — 3.02 Compétence 3.02\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Artisan\": {\n        \"r1_md\": \"# Juré Artisan — 3.02 Compétence 3.02\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Artisan — 3.02 Compétence 3.02\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      }\n    },\n    \"relance_md\": \"# Relance — Linguiste — 3.02 Compétence 3.02\\n\\n**Position maintenue** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## L'argument qui justifie la réouverture\\nMon angle éclaire P1 autrement (mock).\\n\\n## Questions précises aux autres jurés\\n1. P1 décrit-elle un acte daté ? (P1)\\n2. P2 est-elle étayée ? (P2)\",\n    \"relance_par\": \"Linguiste\",\n    \"gardiens\": {\n      \"support_md\": \"# Gardien du support — 3.02 Compétence 3.02\\n\\n**Constat** : neutre\\n\\n## Motif\\nConstat sur le canal écrit, pas sur l'élève (mock).\",\n      \"raisonnement_md\": \"# Gardien du raisonnement — 3.02 Compétence 3.02\\n\\n**Drapeau** : vice de raisonnement\\n\\n## Motif\\nUne position croit l'élève sur parole (mock).\"\n    },\n    \"president_md\": \"# Président — 3.02 Compétence 3.02\\n\\n## Délibération\\n### Synthèse des positions\\n(récit mock du porte-parole — le statut calculé est : renvoi au cartographe)\\n\\n## Prescription\\n\\n```json\\n{\\\"prescription\\\": {\\\"pour_apprenant\\\": \\\"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\\\", \\\"pour_cartographe\\\": \\\"Question à explorer en entretien : la pièce P1 relève-t-elle de 3.02 ? (mock)\\\"}}\\n```\"\n  },\n  \"etage\": \"tribunal\"\n}\n",
   "incidents": "{}\n",
   "files": "[\n  [\n    \"20-greffier.md\",\n    52115108373195\n  ],\n  [\n    \"21a-accusation.md\",\n    244131342125273\n  ],\n  [\n    \"21b-defense.md\",\n    251603976613695\n  ],\n  [\n    \"22a-replique.md\",\n    234347729584864\n  ],\n  [\n    \"22b-briefing.md\",\n    167903914214879\n  ],\n  [\n    \"23-artisan.md\",\n    184064635315877\n  ],\n  [\n    \"23-historien.md\",\n    277233286860784\n  ],\n  [\n    \"23-linguiste.md\",\n    61959772084009\n  ],\n  [\n    \"23-pedagogue.md\",\n    15021439544327\n  ],\n  [\n    \"23-sociologue.md\",\n    193096623806753\n  ],\n  [\n    \"23b-relance.md\",\n    168902125330978\n  ],\n  [\n    \"23c-artisan.md\",\n    155371780795899\n  ],\n  [\n    \"23c-historien.md\",\n    262911854885949\n  ],\n  [\n    \"23c-pedagogue.md\",\n    85666232691270\n  ],\n  [\n    \"23c-sociologue.md\",\n    158379367373717\n  ],\n  [\n    \"24-president.md\",\n    26309857328734\n  ],\n  [\n    \"25a-gardien-support.md\",\n    68667303903323\n  ],\n  [\n    \"25b-gardien-raisonnement.md\",\n    205927352680049\n  ]\n]\n"
  },
  "m6_h7_conteste": {
   "code": "5.01",
   "pole_num": 5,
   "jr": {
    "id": "J07",
    "date": "2026-04-12",
    "texte": "# Journée d'atelier\nCe matin, j'ai démonté entièrement le four solaire pour comprendre pourquoi la température plafonnait depuis mardi.\nJ'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.\nNous avons refait ensemble la mesure devant toute l'équipe réunie, et le résultat a confirmé mon hypothèse initiale.\nL'après-midi, j'ai expliqué à Lina comment régler le miroir secondaire sans forcer sur la charnière fragile.\nEn comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée.\nJ'ai noté dans le carnet de bord chaque essai raté, avec la cause probable et la correction tentée le lendemain.\nLe groupe m'a confié la coordination du planning parce que je tiens les délais depuis le début du trimestre.\nAvant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.\nQuand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier.\nCe soir, j'ai relu la fiche de sécurité et corrigé deux consignes que nous avions mal interprétées la semaine dernière.\n"
   },
   "config": {
    "backend_tribunal": {
     "model": "mock-heavy",
     "model_mini": "mock-mini"
    },
    "parallel_jures": false
   },
   "sentences_texte": null,
   "sentences_vides": false,
   "premiere_impression": null,
   "calques": null,
   "authenticite": null,
   "verdict": "{\n  \"code\": \"5.01\",\n  \"nom\": \"Compétence 5.01\",\n  \"dossier_vide\": false,\n  \"statut\": \"renvoi au cartographe\",\n  \"score_preuves\": \"R\",\n  \"score_indices\": \"R\",\n  \"confiance\": 0.5,\n  \"jury\": {\n    \"mode\": \"socle4+1\",\n    \"personas\": {\n      \"version\": \"personas-v1\",\n      \"empreinte\": \"1ec337d3a2ef\"\n    },\n    \"detections\": [\n      \"Clinicien du récit\"\n    ],\n    \"contestations\": [\n      \"Linguiste\"\n    ],\n    \"abstentions\": [\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\"\n    ],\n    \"second_tour\": true,\n    \"relance_par\": \"Linguiste\",\n    \"composition\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\",\n      \"Clinicien du récit\"\n    ],\n    \"positions_r1\": {\n      \"Linguiste\": \"contestation\",\n      \"Historien\": \"abstention\",\n      \"Pédagogue\": \"abstention\",\n      \"Sociologue\": \"abstention\",\n      \"Clinicien du récit\": \"détection\"\n    },\n    \"positions_finales\": {\n      \"Linguiste\": \"contestation\",\n      \"Historien\": \"abstention\",\n      \"Pédagogue\": \"abstention\",\n      \"Sociologue\": \"abstention\",\n      \"Clinicien du récit\": \"détection\"\n    },\n    \"pieges_nommes\": [\n      \"récit performatif (déclaration sans acte)\"\n    ],\n    \"consensus\": false,\n    \"dissidences\": [\n      \"Linguiste : contestation (récit performatif (déclaration sans acte))\"\n    ]\n  },\n  \"traces_probantes\": [],\n  \"prescription\": {\n    \"pour_apprenant\": \"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\",\n    \"pour_cartographe\": \"Question à explorer en entretien : la pièce P1 relève-t-elle de 5.01 ? (mock)\"\n  },\n  \"gardien\": {\n    \"support\": {\n      \"constat\": \"neutre\"\n    },\n    \"raisonnement\": {\n      \"drapeau\": false\n    }\n  },\n  \"motif_regle\": \"détection et contestation subsistent après le second tour\",\n  \"dossier_cartographe\": {\n    \"motif\": \"détection et contestation subsistent après le second tour\",\n    \"desaccord\": \"détections : Clinicien du récit — contestations : Linguiste\",\n    \"pieges_envisages\": [\n      \"récit performatif (déclaration sans acte)\"\n    ],\n    \"citations\": [\n      \"En comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée.\",\n      \"J'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.\",\n      \"Avant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.\"\n    ]\n  },\n  \"deliberation\": {\n    \"greffier_md\": \"# Greffier — 5.01 Compétence 5.01\\n\\n### Pièces extraites\\n\\n#### Pièce 1\\n- **Extrait** : « En comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : trace concrète\\n- **Vigilance** : aucune\\n\\n#### Pièce 2\\n- **Extrait** : « J'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n#### Pièce 3\\n- **Extrait** : « Avant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n### Bilan\\n- Traces concrètes : 1\\n- Déclarations étayées : 2\\n- Déclarations nues : 0\\n- Intentions : 0\\n- Observations tierces : 0\\n- Alertes authenticité : 0\",\n    \"arene\": {\n      \"accusation_md\": \"# Accusation — 5.01 Compétence 5.01\\n\\n## Thèse\\nLes pièces P1-P3 montrent des actes datés.\\n\\n## Arguments\\n### Argument 1 — Acte documenté\\nPièces : P1. L'acte décrit correspond aux manifestations de la fiche.\\n\\n## Auto-évaluation de la force du dossier\\nmodérée — dossier réel mais étroit.\",\n      \"defense_md\": \"# Défense — 5.01 Compétence 5.01\\n\\n## Position générale\\nLe dossier est étroit.\\n\\n## Attaques\\n### Attaque 1 — Insuffisance probatoire — vise Argument 1 / Pièces P2, P3\\nDeux pièces sont déclaratives, sans dispositif.\\n\\n## Ce que la Défense concède\\nP1 décrit un acte réel.\\n\\n## Conclusion\\nContestation partielle : la présence repose sur P1 seule.\",\n      \"replique_md\": \"# Réplique — 5.01 Compétence 5.01\\n\\n### Réponse à l'Attaque 1\\npartiellement concédée — P2 reste un indice, P3 est abandonnée.\\n\\n## État final du réquisitoire\\nP1 (preuve) + P2 (indice) tiennent.\",\n      \"briefing_md\": \"# Briefing juré — 5.01 Compétence 5.01\\n\\n## Ce que soutient l'Accusation\\nP1 acte daté ; P2 indice.\\n\\n## Ce que soutient la Défense\\nP2-P3 déclaratives.\\n\\n## Issue de la réplique\\nP3 abandonnée.\\n\\n## Points de convergence\\nP1 est un acte réel.\\n\\n## Questions à trancher par le jury\\n1. P1 suffit-elle seule ? (P1)\\n2. P2 est-elle étayée ? (P2)\"\n    },\n    \"jures\": {\n      \"Linguiste\": {\n        \"r1_md\": \"# Juré Linguiste — 5.01 Compétence 5.01\\n\\n**Position** : contestation\\n**Pièces** : P2, P3\\n**Piège visé** : récit performatif (déclaration sans acte)\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"contestation\",\n        \"position_finale\": \"contestation\",\n        \"pieces\": [\n          2,\n          3\n        ],\n        \"piege\": \"récit performatif (déclaration sans acte)\"\n      },\n      \"Historien\": {\n        \"r1_md\": \"# Juré Historien — 5.01 Compétence 5.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Historien — 5.01 Compétence 5.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Pédagogue\": {\n        \"r1_md\": \"# Juré Pédagogue — 5.01 Compétence 5.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Pédagogue — 5.01 Compétence 5.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Sociologue\": {\n        \"r1_md\": \"# Juré Sociologue — 5.01 Compétence 5.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Sociologue — 5.01 Compétence 5.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Clinicien du récit\": {\n        \"r1_md\": \"# Juré Clinicien du récit — 5.01 Compétence 5.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Clinicien du récit — 5.01 Compétence 5.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      }\n    },\n    \"relance_md\": \"# Relance — Linguiste — 5.01 Compétence 5.01\\n\\n**Position maintenue** : contestation\\n**Pièces** : P2, P3\\n**Piège visé** : récit performatif (déclaration sans acte)\\n\\n## L'argument qui justifie la réouverture\\nMon angle éclaire P1 autrement (mock).\\n\\n## Questions précises aux autres jurés\\n1. P1 décrit-elle un acte daté ? (P1)\\n2. P2 est-elle étayée ? (P2)\",\n    \"relance_par\": \"Linguiste\",\n    \"gardiens\": {\n      \"support_md\": \"# Gardien du support — 5.01 Compétence 5.01\\n\\n**Constat** : neutre\\n\\n## Motif\\nConstat sur le canal écrit, pas sur l'élève (mock).\",\n      \"raisonnement_md\": \"# Gardien du raisonnement — 5.01 Compétence 5.01\\n\\n**Drapeau** : aucun\\n\\n## Motif\\nLe raisonnement du collège tient (mock).\"\n    },\n    \"president_md\": \"# Président — 5.01 Compétence 5.01\\n\\n## Délibération\\n### Synthèse des positions\\n(récit mock du porte-parole — le statut calculé est : renvoi au cartographe)\\n\\n## Prescription\\n\\n```json\\n{\\\"prescription\\\": {\\\"pour_apprenant\\\": \\\"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\\\", \\\"pour_cartographe\\\": \\\"Question à explorer en entretien : la pièce P1 relève-t-elle de 5.01 ? (mock)\\\"}}\\n```\"\n  },\n  \"etage\": \"tribunal\"\n}\n",
   "incidents": "{}\n",
   "files": "[\n  [\n    \"20-greffier.md\",\n    112033338113355\n  ],\n  [\n    \"21a-accusation.md\",\n    190820102509008\n  ],\n  [\n    \"21b-defense.md\",\n    93479917686998\n  ],\n  [\n    \"22a-replique.md\",\n    281166158755253\n  ],\n  [\n    \"22b-briefing.md\",\n    39411810886864\n  ],\n  [\n    \"23-clinicien du recit.md\",\n    52317310555046\n  ],\n  [\n    \"23-historien.md\",\n    181757308639331\n  ],\n  [\n    \"23-linguiste.md\",\n    193122982758205\n  ],\n  [\n    \"23-pedagogue.md\",\n    157252258079221\n  ],\n  [\n    \"23-sociologue.md\",\n    8426047232474\n  ],\n  [\n    \"23b-relance.md\",\n    169193824296686\n  ],\n  [\n    \"23c-clinicien du recit.md\",\n    50229972547936\n  ],\n  [\n    \"23c-historien.md\",\n    232972991404234\n  ],\n  [\n    \"23c-pedagogue.md\",\n    72988604354890\n  ],\n  [\n    \"23c-sociologue.md\",\n    167494860969823\n  ],\n  [\n    \"24-president.md\",\n    259971601627515\n  ],\n  [\n    \"25a-gardien-support.md\",\n    12567225775870\n  ],\n  [\n    \"25b-gardien-raisonnement.md\",\n    93774172025129\n  ]\n]\n"
  },
  "m7_h0_isolee_etablie": {
   "code": "7.03",
   "pole_num": 7,
   "jr": {
    "id": "J07",
    "date": "2026-04-12",
    "texte": "# Journée d'atelier\nCe matin, j'ai démonté entièrement le four solaire pour comprendre pourquoi la température plafonnait depuis mardi.\nJ'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.\nNous avons refait ensemble la mesure devant toute l'équipe réunie, et le résultat a confirmé mon hypothèse initiale.\nL'après-midi, j'ai expliqué à Lina comment régler le miroir secondaire sans forcer sur la charnière fragile.\nEn comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée.\nJ'ai noté dans le carnet de bord chaque essai raté, avec la cause probable et la correction tentée le lendemain.\nLe groupe m'a confié la coordination du planning parce que je tiens les délais depuis le début du trimestre.\nAvant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.\nQuand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier.\nCe soir, j'ai relu la fiche de sécurité et corrigé deux consignes que nous avions mal interprétées la semaine dernière.\n"
   },
   "config": {
    "backend_tribunal": {
     "model": "mock-heavy",
     "model_mini": "mock-mini"
    },
    "parallel_jures": false
   },
   "sentences_texte": null,
   "sentences_vides": false,
   "premiere_impression": null,
   "calques": null,
   "authenticite": null,
   "verdict": "{\n  \"code\": \"7.03\",\n  \"nom\": \"Compétence 7.03\",\n  \"dossier_vide\": false,\n  \"statut\": \"présence établie\",\n  \"score_preuves\": 1,\n  \"score_indices\": 1,\n  \"confiance\": 0.5,\n  \"jury\": {\n    \"mode\": \"socle4+1\",\n    \"personas\": {\n      \"version\": \"personas-v1\",\n      \"empreinte\": \"1ec337d3a2ef\"\n    },\n    \"detections\": [\n      \"Historien\"\n    ],\n    \"contestations\": [],\n    \"abstentions\": [\n      \"Linguiste\",\n      \"Pédagogue\",\n      \"Sociologue\",\n      \"Compagnon\"\n    ],\n    \"second_tour\": true,\n    \"relance_par\": \"Historien\",\n    \"composition\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\",\n      \"Compagnon\"\n    ],\n    \"positions_r1\": {\n      \"Linguiste\": \"abstention\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"abstention\",\n      \"Sociologue\": \"abstention\",\n      \"Compagnon\": \"abstention\"\n    },\n    \"positions_finales\": {\n      \"Linguiste\": \"abstention\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"abstention\",\n      \"Sociologue\": \"abstention\",\n      \"Compagnon\": \"abstention\"\n    },\n    \"pieges_nommes\": [],\n    \"consensus\": true,\n    \"dissidences\": []\n  },\n  \"traces_probantes\": [\n    {\n      \"piece\": 1,\n      \"extrait\": \"J'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.\",\n      \"date\": \"2026-04-12\",\n      \"type\": \"trace_concrete\",\n      \"role\": \"preuve décisive\"\n    },\n    {\n      \"piece\": 2,\n      \"extrait\": \"Quand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier.\",\n      \"date\": \"2026-04-12\",\n      \"type\": \"declaration_etayee\",\n      \"role\": \"indice corroboratif\"\n    }\n  ],\n  \"prescription\": {\n    \"pour_apprenant\": \"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\",\n    \"pour_cartographe\": null\n  },\n  \"gardien\": {\n    \"support\": {\n      \"constat\": \"neutre\"\n    },\n    \"raisonnement\": {\n      \"drapeau\": false\n    }\n  },\n  \"motif_regle\": \"détection(s) que personne ne conteste\",\n  \"dossier_cartographe\": null,\n  \"deliberation\": {\n    \"greffier_md\": \"# Greffier — 7.03 Compétence 7.03\\n\\n### Pièces extraites\\n\\n#### Pièce 1\\n- **Extrait** : « J'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : trace concrète\\n- **Vigilance** : aucune\\n\\n#### Pièce 2\\n- **Extrait** : « Quand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n#### Pièce 3\\n- **Extrait** : « En comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n### Bilan\\n- Traces concrètes : 1\\n- Déclarations étayées : 2\\n- Déclarations nues : 0\\n- Intentions : 0\\n- Observations tierces : 0\\n- Alertes authenticité : 0\",\n    \"arene\": {\n      \"accusation_md\": \"# Accusation — 7.03 Compétence 7.03\\n\\n## Thèse\\nLes pièces P1-P3 montrent des actes datés.\\n\\n## Arguments\\n### Argument 1 — Acte documenté\\nPièces : P1. L'acte décrit correspond aux manifestations de la fiche.\\n\\n## Auto-évaluation de la force du dossier\\nmodérée — dossier réel mais étroit.\",\n      \"defense_md\": \"# Défense — 7.03 Compétence 7.03\\n\\n## Position générale\\nLe dossier est étroit.\\n\\n## Attaques\\n### Attaque 1 — Insuffisance probatoire — vise Argument 1 / Pièces P2, P3\\nDeux pièces sont déclaratives, sans dispositif.\\n\\n## Ce que la Défense concède\\nP1 décrit un acte réel.\\n\\n## Conclusion\\nContestation partielle : la présence repose sur P1 seule.\",\n      \"replique_md\": \"# Réplique — 7.03 Compétence 7.03\\n\\n### Réponse à l'Attaque 1\\npartiellement concédée — P2 reste un indice, P3 est abandonnée.\\n\\n## État final du réquisitoire\\nP1 (preuve) + P2 (indice) tiennent.\",\n      \"briefing_md\": \"# Briefing juré — 7.03 Compétence 7.03\\n\\n## Ce que soutient l'Accusation\\nP1 acte daté ; P2 indice.\\n\\n## Ce que soutient la Défense\\nP2-P3 déclaratives.\\n\\n## Issue de la réplique\\nP3 abandonnée.\\n\\n## Points de convergence\\nP1 est un acte réel.\\n\\n## Questions à trancher par le jury\\n1. P1 suffit-elle seule ? (P1)\\n2. P2 est-elle étayée ? (P2)\"\n    },\n    \"jures\": {\n      \"Linguiste\": {\n        \"r1_md\": \"# Juré Linguiste — 7.03 Compétence 7.03\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Linguiste — 7.03 Compétence 7.03\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Historien\": {\n        \"r1_md\": \"# Juré Historien — 7.03 Compétence 7.03\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Pédagogue\": {\n        \"r1_md\": \"# Juré Pédagogue — 7.03 Compétence 7.03\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Pédagogue — 7.03 Compétence 7.03\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Sociologue\": {\n        \"r1_md\": \"# Juré Sociologue — 7.03 Compétence 7.03\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Sociologue — 7.03 Compétence 7.03\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Compagnon\": {\n        \"r1_md\": \"# Juré Compagnon — 7.03 Compétence 7.03\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Compagnon — 7.03 Compétence 7.03\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      }\n    },\n    \"relance_md\": \"# Relance — Historien — 7.03 Compétence 7.03\\n\\n**Position maintenue** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## L'argument qui justifie la réouverture\\nMon angle éclaire P1 autrement (mock).\\n\\n## Questions précises aux autres jurés\\n1. P1 décrit-elle un acte daté ? (P1)\\n2. P2 est-elle étayée ? (P2)\",\n    \"relance_par\": \"Historien\",\n    \"gardiens\": {\n      \"support_md\": \"# Gardien du support — 7.03 Compétence 7.03\\n\\n**Constat** : neutre\\n\\n## Motif\\nConstat sur le canal écrit, pas sur l'élève (mock).\",\n      \"raisonnement_md\": \"# Gardien du raisonnement — 7.03 Compétence 7.03\\n\\n**Drapeau** : aucun\\n\\n## Motif\\nLe raisonnement du collège tient (mock).\"\n    },\n    \"president_md\": \"# Président — 7.03 Compétence 7.03\\n\\n## Délibération\\n### Synthèse des positions\\n(récit mock du porte-parole — le statut calculé est : présence établie)\\n\\n## Prescription\\n\\n```json\\n{\\\"prescription\\\": {\\\"pour_apprenant\\\": \\\"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\\\", \\\"pour_cartographe\\\": null}}\\n```\"\n  },\n  \"etage\": \"tribunal\"\n}\n",
   "incidents": "{}\n",
   "files": "[\n  [\n    \"20-greffier.md\",\n    181356762878841\n  ],\n  [\n    \"21a-accusation.md\",\n    246800133732497\n  ],\n  [\n    \"21b-defense.md\",\n    101977902543368\n  ],\n  [\n    \"22a-replique.md\",\n    59093991185739\n  ],\n  [\n    \"22b-briefing.md\",\n    242117683431462\n  ],\n  [\n    \"23-compagnon.md\",\n    272862969926060\n  ],\n  [\n    \"23-historien.md\",\n    270382157928069\n  ],\n  [\n    \"23-linguiste.md\",\n    140957339233247\n  ],\n  [\n    \"23-pedagogue.md\",\n    240683210004458\n  ],\n  [\n    \"23-sociologue.md\",\n    223504845646264\n  ],\n  [\n    \"23b-relance.md\",\n    26940641776834\n  ],\n  [\n    \"23c-compagnon.md\",\n    186543756880771\n  ],\n  [\n    \"23c-linguiste.md\",\n    75562856033286\n  ],\n  [\n    \"23c-pedagogue.md\",\n    51031791898057\n  ],\n  [\n    \"23c-sociologue.md\",\n    231774675638683\n  ],\n  [\n    \"24-president.md\",\n    109681430070616\n  ],\n  [\n    \"25a-gardien-support.md\",\n    175521861815353\n  ],\n  [\n    \"25b-gardien-raisonnement.md\",\n    175820063277146\n  ]\n]\n"
  },
  "m8_non_ancrable": {
   "code": "5.02",
   "pole_num": 5,
   "jr": {
    "id": "J99",
    "date": "2026-06-01",
    "texte": "# Journée d'atelier\nCe matin, j'ai démonté entièrement le four solaire pour comprendre pourquoi la température plafonnait depuis mardi.\nJ'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.\nNous avons refait ensemble la mesure devant toute l'équipe réunie, et le résultat a confirmé mon hypothèse initiale.\nL'après-midi, j'ai expliqué à Lina comment régler le miroir secondaire sans forcer sur la charnière fragile.\nEn comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée.\nJ'ai noté dans le carnet de bord chaque essai raté, avec la cause probable et la correction tentée le lendemain.\nLe groupe m'a confié la coordination du planning parce que je tiens les délais depuis le début du trimestre.\nAvant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.\nQuand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier.\nCe soir, j'ai relu la fiche de sécurité et corrigé deux consignes que nous avions mal interprétées la semaine dernière.\n"
   },
   "config": {
    "backend_tribunal": {
     "model": "mock-heavy",
     "model_mini": "mock-mini"
    },
    "parallel_jures": false
   },
   "sentences_texte": "Hier, nous avons planté les premiers semis dans la serre pédagogique en respectant le calendrier lunaire affiché.\nLa répartition des parcelles a demandé une négociation serrée entre les trois groupes de la classe de quatrième.\nJ'ai photographié chaque étape du repiquage pour construire un tutoriel destiné aux élèves de sixième année.\nLe compost n'était pas assez mûr, alors nous avons tamisé la partie centrale et écarté les bords trop secs.\nUn orage a couché les tuteurs de tomates, et il a fallu improviser un système d'attache avec de la ficelle de lin.\nAvant de partir, j'ai vérifié deux fois la fermeture de la serre parce que le vent devait forcir dans la nuit.\nLe carnet d'arrosage montre que nous avons tenu le rythme prévu malgré les absences de la semaine des conseils.\nPour convaincre le jardinier municipal, j'ai préparé un argumentaire chiffré sur la consommation d'eau du projet.\nLa balance de la cuisine nous a servi à peser les récoltes, et j'ai reporté chaque pesée dans le tableau partagé.\nEn fin de journée, nous avons présenté nos résultats au directeur qui a promis un financement pour le printemps.\n",
   "sentences_vides": false,
   "premiere_impression": null,
   "calques": null,
   "authenticite": null,
   "verdict": "{\n  \"code\": \"5.02\",\n  \"nom\": \"Compétence 5.02\",\n  \"dossier_vide\": false,\n  \"statut\": \"renvoi au cartographe\",\n  \"score_preuves\": \"R\",\n  \"score_indices\": \"R\",\n  \"confiance\": 0.5,\n  \"jury\": {\n    \"mode\": \"socle4+1\",\n    \"personas\": {\n      \"version\": \"personas-v1\",\n      \"empreinte\": \"1ec337d3a2ef\"\n    },\n    \"detections\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Clinicien du récit\"\n    ],\n    \"contestations\": [],\n    \"abstentions\": [\n      \"Sociologue\"\n    ],\n    \"second_tour\": false,\n    \"relance_par\": null,\n    \"composition\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\",\n      \"Clinicien du récit\"\n    ],\n    \"positions_r1\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"détection\",\n      \"Sociologue\": \"abstention\",\n      \"Clinicien du récit\": \"détection\"\n    },\n    \"positions_finales\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"détection\",\n      \"Sociologue\": \"abstention\",\n      \"Clinicien du récit\": \"détection\"\n    },\n    \"pieges_nommes\": [],\n    \"consensus\": true,\n    \"dissidences\": []\n  },\n  \"traces_probantes\": [],\n  \"prescription\": {\n    \"pour_apprenant\": \"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\",\n    \"pour_cartographe\": \"Question à explorer en entretien : la pièce P1 relève-t-elle de 5.02 ? (mock)\"\n  },\n  \"gardien\": {\n    \"support\": {\n      \"constat\": \"neutre\"\n    },\n    \"raisonnement\": {\n      \"drapeau\": false\n    }\n  },\n  \"motif_regle\": \"détection sans pièce ancrable (2 citation(s) introuvable(s))\",\n  \"dossier_cartographe\": {\n    \"motif\": \"détection sans pièce ancrable (2 citation(s) introuvable(s))\",\n    \"desaccord\": \"détections : Linguiste, Historien, Pédagogue, Clinicien du récit — contestations : aucune\",\n    \"pieges_envisages\": [],\n    \"citations\": [\n      \"La balance de la cuisine nous a servi à peser les récoltes, et j'ai reporté chaque pesée dans le tableau partagé.\",\n      \"Avant de partir, j'ai vérifié deux fois la fermeture de la serre parce que le vent devait forcir dans la nuit.\"\n    ]\n  },\n  \"deliberation\": {\n    \"greffier_md\": \"# Greffier — 5.02 Compétence 5.02\\n\\n### Pièces extraites\\n\\n#### Pièce 1\\n- **Extrait** : « La balance de la cuisine nous a servi à peser les récoltes, et j'ai reporté chaque pesée dans le tableau partagé. »\\n- **Date** : J99\\n- **Localisation** : feuille J99\\n- **Type** : trace concrète\\n- **Vigilance** : aucune\\n\\n#### Pièce 2\\n- **Extrait** : « Avant de partir, j'ai vérifié deux fois la fermeture de la serre parce que le vent devait forcir dans la nuit. »\\n- **Date** : J99\\n- **Localisation** : feuille J99\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n#### Pièce 3\\n- **Extrait** : « La répartition des parcelles a demandé une négociation serrée entre les trois groupes de la classe de quatrième. »\\n- **Date** : J99\\n- **Localisation** : feuille J99\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n### Bilan\\n- Traces concrètes : 1\\n- Déclarations étayées : 2\\n- Déclarations nues : 0\\n- Intentions : 0\\n- Observations tierces : 0\\n- Alertes authenticité : 0\",\n    \"arene\": {\n      \"accusation_md\": \"# Accusation — 5.02 Compétence 5.02\\n\\n## Thèse\\nLes pièces P1-P3 montrent des actes datés.\\n\\n## Arguments\\n### Argument 1 — Acte documenté\\nPièces : P1. L'acte décrit correspond aux manifestations de la fiche.\\n\\n## Auto-évaluation de la force du dossier\\nmodérée — dossier réel mais étroit.\",\n      \"defense_md\": \"# Défense — 5.02 Compétence 5.02\\n\\n## Position générale\\nLe dossier est étroit.\\n\\n## Attaques\\n### Attaque 1 — Insuffisance probatoire — vise Argument 1 / Pièces P2, P3\\nDeux pièces sont déclaratives, sans dispositif.\\n\\n## Ce que la Défense concède\\nP1 décrit un acte réel.\\n\\n## Conclusion\\nContestation partielle : la présence repose sur P1 seule.\",\n      \"replique_md\": \"# Réplique — 5.02 Compétence 5.02\\n\\n### Réponse à l'Attaque 1\\npartiellement concédée — P2 reste un indice, P3 est abandonnée.\\n\\n## État final du réquisitoire\\nP1 (preuve) + P2 (indice) tiennent.\",\n      \"briefing_md\": \"# Briefing juré — 5.02 Compétence 5.02\\n\\n## Ce que soutient l'Accusation\\nP1 acte daté ; P2 indice.\\n\\n## Ce que soutient la Défense\\nP2-P3 déclaratives.\\n\\n## Issue de la réplique\\nP3 abandonnée.\\n\\n## Points de convergence\\nP1 est un acte réel.\\n\\n## Questions à trancher par le jury\\n1. P1 suffit-elle seule ? (P1)\\n2. P2 est-elle étayée ? (P2)\"\n    },\n    \"jures\": {\n      \"Linguiste\": {\n        \"r1_md\": \"# Juré Linguiste — 5.02 Compétence 5.02\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Historien\": {\n        \"r1_md\": \"# Juré Historien — 5.02 Compétence 5.02\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Pédagogue\": {\n        \"r1_md\": \"# Juré Pédagogue — 5.02 Compétence 5.02\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Sociologue\": {\n        \"r1_md\": \"# Juré Sociologue — 5.02 Compétence 5.02\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Clinicien du récit\": {\n        \"r1_md\": \"# Juré Clinicien du récit — 5.02 Compétence 5.02\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      }\n    },\n    \"relance_md\": null,\n    \"relance_par\": null,\n    \"gardiens\": {\n      \"support_md\": \"# Gardien du support — 5.02 Compétence 5.02\\n\\n**Constat** : neutre\\n\\n## Motif\\nConstat sur le canal écrit, pas sur l'élève (mock).\",\n      \"raisonnement_md\": \"# Gardien du raisonnement — 5.02 Compétence 5.02\\n\\n**Drapeau** : aucun\\n\\n## Motif\\nLe raisonnement du collège tient (mock).\"\n    },\n    \"president_md\": \"# Président — 5.02 Compétence 5.02\\n\\n## Délibération\\n### Synthèse des positions\\n(récit mock du porte-parole — le statut calculé est : renvoi au cartographe)\\n\\n## Prescription\\n\\n```json\\n{\\\"prescription\\\": {\\\"pour_apprenant\\\": \\\"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\\\", \\\"pour_cartographe\\\": \\\"Question à explorer en entretien : la pièce P1 relève-t-elle de 5.02 ? (mock)\\\"}}\\n```\"\n  },\n  \"etage\": \"tribunal\"\n}\n",
   "incidents": "{\n  \"trace_tribunal_non_ancree\": 2\n}\n",
   "files": "[\n  [\n    \"20-greffier.md\",\n    17504617403703\n  ],\n  [\n    \"21a-accusation.md\",\n    4780452865717\n  ],\n  [\n    \"21b-defense.md\",\n    59163585960563\n  ],\n  [\n    \"22a-replique.md\",\n    240611615731652\n  ],\n  [\n    \"22b-briefing.md\",\n    113289870522462\n  ],\n  [\n    \"23-clinicien du recit.md\",\n    181595905258610\n  ],\n  [\n    \"23-historien.md\",\n    10427577412972\n  ],\n  [\n    \"23-linguiste.md\",\n    202269578366310\n  ],\n  [\n    \"23-pedagogue.md\",\n    30193547583597\n  ],\n  [\n    \"23-sociologue.md\",\n    238942218326633\n  ],\n  [\n    \"24-president.md\",\n    203172179305697\n  ],\n  [\n    \"25a-gardien-support.md\",\n    228522951817126\n  ],\n  [\n    \"25b-gardien-raisonnement.md\",\n    82309364936069\n  ]\n]\n"
  },
  "m9_jury_aleatoire": {
   "code": "1.01",
   "pole_num": 1,
   "jr": {
    "id": "J07",
    "date": "2026-04-12",
    "texte": "# Journée d'atelier\nCe matin, j'ai démonté entièrement le four solaire pour comprendre pourquoi la température plafonnait depuis mardi.\nJ'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.\nNous avons refait ensemble la mesure devant toute l'équipe réunie, et le résultat a confirmé mon hypothèse initiale.\nL'après-midi, j'ai expliqué à Lina comment régler le miroir secondaire sans forcer sur la charnière fragile.\nEn comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée.\nJ'ai noté dans le carnet de bord chaque essai raté, avec la cause probable et la correction tentée le lendemain.\nLe groupe m'a confié la coordination du planning parce que je tiens les délais depuis le début du trimestre.\nAvant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.\nQuand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier.\nCe soir, j'ai relu la fiche de sécurité et corrigé deux consignes que nous avions mal interprétées la semaine dernière.\n"
   },
   "config": {
    "backend_tribunal": {
     "model": "mock-heavy",
     "model_mini": "mock-mini"
    },
    "parallel_jures": false,
    "jury": {
     "mode": "aleatoire",
     "graine": 7,
     "taille_aleatoire": 5
    }
   },
   "sentences_texte": null,
   "sentences_vides": false,
   "premiere_impression": null,
   "calques": null,
   "authenticite": null,
   "verdict": "{\n  \"code\": \"1.01\",\n  \"nom\": \"Compétence 1.01\",\n  \"dossier_vide\": false,\n  \"statut\": \"présence établie\",\n  \"score_preuves\": 1,\n  \"score_indices\": 1,\n  \"confiance\": 0.9,\n  \"jury\": {\n    \"mode\": \"aleatoire\",\n    \"personas\": {\n      \"version\": \"personas-v1\",\n      \"empreinte\": \"1ec337d3a2ef\"\n    },\n    \"detections\": [\n      \"Clinicien du récit\",\n      \"Pédagogue\",\n      \"Politiste\",\n      \"Sociologue\",\n      \"Archiviste\"\n    ],\n    \"contestations\": [],\n    \"abstentions\": [],\n    \"second_tour\": false,\n    \"relance_par\": null,\n    \"composition\": [\n      \"Clinicien du récit\",\n      \"Pédagogue\",\n      \"Politiste\",\n      \"Sociologue\",\n      \"Archiviste\"\n    ],\n    \"positions_r1\": {\n      \"Clinicien du récit\": \"détection\",\n      \"Pédagogue\": \"détection\",\n      \"Politiste\": \"détection\",\n      \"Sociologue\": \"détection\",\n      \"Archiviste\": \"détection\"\n    },\n    \"positions_finales\": {\n      \"Clinicien du récit\": \"détection\",\n      \"Pédagogue\": \"détection\",\n      \"Politiste\": \"détection\",\n      \"Sociologue\": \"détection\",\n      \"Archiviste\": \"détection\"\n    },\n    \"pieges_nommes\": [],\n    \"consensus\": true,\n    \"dissidences\": []\n  },\n  \"traces_probantes\": [\n    {\n      \"piece\": 1,\n      \"extrait\": \"Ce matin, j'ai démonté entièrement le four solaire pour comprendre pourquoi la température plafonnait depuis mardi.\",\n      \"date\": \"2026-04-12\",\n      \"type\": \"trace_concrete\",\n      \"role\": \"preuve décisive\"\n    },\n    {\n      \"piece\": 2,\n      \"extrait\": \"Avant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.\",\n      \"date\": \"2026-04-12\",\n      \"type\": \"declaration_etayee\",\n      \"role\": \"indice corroboratif\"\n    }\n  ],\n  \"prescription\": {\n    \"pour_apprenant\": \"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\",\n    \"pour_cartographe\": null\n  },\n  \"gardien\": {\n    \"support\": {\n      \"constat\": \"neutre\"\n    },\n    \"raisonnement\": {\n      \"drapeau\": false\n    }\n  },\n  \"motif_regle\": \"détection(s) que personne ne conteste\",\n  \"dossier_cartographe\": null,\n  \"deliberation\": {\n    \"greffier_md\": \"# Greffier — 1.01 Compétence 1.01\\n\\n### Pièces extraites\\n\\n#### Pièce 1\\n- **Extrait** : « Ce matin, j'ai démonté entièrement le four solaire pour comprendre pourquoi la température plafonnait depuis mardi. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : trace concrète\\n- **Vigilance** : aucune\\n\\n#### Pièce 2\\n- **Extrait** : « Avant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n#### Pièce 3\\n- **Extrait** : « L'après-midi, j'ai expliqué à Lina comment régler le miroir secondaire sans forcer sur la charnière fragile. »\\n- **Date** : J07\\n- **Localisation** : feuille J07\\n- **Type** : déclaration étayée\\n- **Vigilance** : aucune\\n\\n### Bilan\\n- Traces concrètes : 1\\n- Déclarations étayées : 2\\n- Déclarations nues : 0\\n- Intentions : 0\\n- Observations tierces : 0\\n- Alertes authenticité : 0\",\n    \"arene\": {\n      \"accusation_md\": \"# Accusation — 1.01 Compétence 1.01\\n\\n## Thèse\\nLes pièces P1-P3 montrent des actes datés.\\n\\n## Arguments\\n### Argument 1 — Acte documenté\\nPièces : P1. L'acte décrit correspond aux manifestations de la fiche.\\n\\n## Auto-évaluation de la force du dossier\\nmodérée — dossier réel mais étroit.\",\n      \"defense_md\": \"# Défense — 1.01 Compétence 1.01\\n\\n## Position générale\\nLe dossier est étroit.\\n\\n## Attaques\\n### Attaque 1 — Insuffisance probatoire — vise Argument 1 / Pièces P2, P3\\nDeux pièces sont déclaratives, sans dispositif.\\n\\n## Ce que la Défense concède\\nP1 décrit un acte réel.\\n\\n## Conclusion\\nContestation partielle : la présence repose sur P1 seule.\",\n      \"replique_md\": \"# Réplique — 1.01 Compétence 1.01\\n\\n### Réponse à l'Attaque 1\\npartiellement concédée — P2 reste un indice, P3 est abandonnée.\\n\\n## État final du réquisitoire\\nP1 (preuve) + P2 (indice) tiennent.\",\n      \"briefing_md\": \"# Briefing juré — 1.01 Compétence 1.01\\n\\n## Ce que soutient l'Accusation\\nP1 acte daté ; P2 indice.\\n\\n## Ce que soutient la Défense\\nP2-P3 déclaratives.\\n\\n## Issue de la réplique\\nP3 abandonnée.\\n\\n## Points de convergence\\nP1 est un acte réel.\\n\\n## Questions à trancher par le jury\\n1. P1 suffit-elle seule ? (P1)\\n2. P2 est-elle étayée ? (P2)\"\n    },\n    \"jures\": {\n      \"Clinicien du récit\": {\n        \"r1_md\": \"# Juré Clinicien du récit — 1.01 Compétence 1.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Pédagogue\": {\n        \"r1_md\": \"# Juré Pédagogue — 1.01 Compétence 1.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Politiste\": {\n        \"r1_md\": \"# Juré Politiste — 1.01 Compétence 1.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Sociologue\": {\n        \"r1_md\": \"# Juré Sociologue — 1.01 Compétence 1.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Archiviste\": {\n        \"r1_md\": \"# Juré Archiviste — 1.01 Compétence 1.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      }\n    },\n    \"relance_md\": null,\n    \"relance_par\": null,\n    \"gardiens\": {\n      \"support_md\": \"# Gardien du support — 1.01 Compétence 1.01\\n\\n**Constat** : neutre\\n\\n## Motif\\nConstat sur le canal écrit, pas sur l'élève (mock).\",\n      \"raisonnement_md\": \"# Gardien du raisonnement — 1.01 Compétence 1.01\\n\\n**Drapeau** : aucun\\n\\n## Motif\\nLe raisonnement du collège tient (mock).\"\n    },\n    \"president_md\": \"# Président — 1.01 Compétence 1.01\\n\\n## Délibération\\n### Synthèse des positions\\n(récit mock du porte-parole — le statut calculé est : présence établie)\\n\\n## Prescription\\n\\n```json\\n{\\\"prescription\\\": {\\\"pour_apprenant\\\": \\\"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\\\", \\\"pour_cartographe\\\": null}}\\n```\"\n  },\n  \"etage\": \"tribunal\"\n}\n",
   "incidents": "{}\n",
   "files": "[\n  [\n    \"20-greffier.md\",\n    16020534382440\n  ],\n  [\n    \"21a-accusation.md\",\n    173144262732575\n  ],\n  [\n    \"21b-defense.md\",\n    899952019310\n  ],\n  [\n    \"22a-replique.md\",\n    167002155080517\n  ],\n  [\n    \"22b-briefing.md\",\n    105311868088587\n  ],\n  [\n    \"23-archiviste.md\",\n    252458234283742\n  ],\n  [\n    \"23-clinicien du recit.md\",\n    110643960428470\n  ],\n  [\n    \"23-pedagogue.md\",\n    59341946433665\n  ],\n  [\n    \"23-politiste.md\",\n    270184565119207\n  ],\n  [\n    \"23-sociologue.md\",\n    83296614931677\n  ],\n  [\n    \"24-president.md\",\n    102550521466073\n  ],\n  [\n    \"25a-gardien-support.md\",\n    272979338132590\n  ],\n  [\n    \"25b-gardien-raisonnement.md\",\n    243289721983890\n  ]\n]\n"
  },
  "m10_dossier_vide": {
   "code": "6.01",
   "pole_num": 6,
   "jr": {
    "id": "J07",
    "date": "2026-04-12",
    "texte": "# Journée d'atelier\nCe matin, j'ai démonté entièrement le four solaire pour comprendre pourquoi la température plafonnait depuis mardi.\nJ'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.\nNous avons refait ensemble la mesure devant toute l'équipe réunie, et le résultat a confirmé mon hypothèse initiale.\nL'après-midi, j'ai expliqué à Lina comment régler le miroir secondaire sans forcer sur la charnière fragile.\nEn comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée.\nJ'ai noté dans le carnet de bord chaque essai raté, avec la cause probable et la correction tentée le lendemain.\nLe groupe m'a confié la coordination du planning parce que je tiens les délais depuis le début du trimestre.\nAvant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.\nQuand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier.\nCe soir, j'ai relu la fiche de sécurité et corrigé deux consignes que nous avions mal interprétées la semaine dernière.\n"
   },
   "config": {
    "backend_tribunal": {
     "model": "mock-heavy",
     "model_mini": "mock-mini"
    },
    "parallel_jures": false
   },
   "sentences_texte": null,
   "sentences_vides": true,
   "premiere_impression": null,
   "calques": null,
   "authenticite": null,
   "verdict": "{\n  \"code\": \"6.01\",\n  \"nom\": \"Compétence 6.01\",\n  \"dossier_vide\": true,\n  \"statut\": \"présence non établie\",\n  \"score_preuves\": 0,\n  \"score_indices\": 0,\n  \"confiance\": 0.9,\n  \"jury\": null,\n  \"traces_probantes\": [],\n  \"prescription\": {\n    \"pour_apprenant\": \"Cette journée ne contient pas encore de pièce pour Compétence 6.01.\",\n    \"pour_cartographe\": null\n  },\n  \"gardien\": null,\n  \"etage\": \"tribunal-court-circuit\",\n  \"deliberation\": {\n    \"greffier_md\": \"# Greffier — 6.01 Compétence 6.01\\n\\nDOSSIER VIDE — Aucune pièce identifiée pour 6.01.\"\n  }\n}\n",
   "incidents": "{}\n",
   "files": "[\n  [\n    \"20-greffier.md\",\n    36196808040479\n  ]\n]\n"
  }
 },
 "texte": "# Journée d'atelier\nCe matin, j'ai démonté entièrement le four solaire pour comprendre pourquoi la température plafonnait depuis mardi.\nJ'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.\nNous avons refait ensemble la mesure devant toute l'équipe réunie, et le résultat a confirmé mon hypothèse initiale.\nL'après-midi, j'ai expliqué à Lina comment régler le miroir secondaire sans forcer sur la charnière fragile.\nEn comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée.\nJ'ai noté dans le carnet de bord chaque essai raté, avec la cause probable et la correction tentée le lendemain.\nLe groupe m'a confié la coordination du planning parce que je tiens les délais depuis le début du trimestre.\nAvant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.\nQuand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier.\nCe soir, j'ai relu la fiche de sécurité et corrigé deux consignes que nous avions mal interprétées la semaine dernière.\n",
 "texte_alt": "Hier, nous avons planté les premiers semis dans la serre pédagogique en respectant le calendrier lunaire affiché.\nLa répartition des parcelles a demandé une négociation serrée entre les trois groupes de la classe de quatrième.\nJ'ai photographié chaque étape du repiquage pour construire un tutoriel destiné aux élèves de sixième année.\nLe compost n'était pas assez mûr, alors nous avons tamisé la partie centrale et écarté les bords trop secs.\nUn orage a couché les tuteurs de tomates, et il a fallu improviser un système d'attache avec de la ficelle de lin.\nAvant de partir, j'ai vérifié deux fois la fermeture de la serre parce que le vent devait forcir dans la nuit.\nLe carnet d'arrosage montre que nous avons tenu le rythme prévu malgré les absences de la semaine des conseils.\nPour convaincre le jardinier municipal, j'ai préparé un argumentaire chiffré sur la consommation d'eau du projet.\nLa balance de la cuisine nous a servi à peser les récoltes, et j'ai reporté chaque pesée dans le tableau partagé.\nEn fin de journée, nous avons présenté nos résultats au directeur qui a promis un financement pour le printemps.\n",
 "fiche": "## Compétence (test)\n\nFiche factice pour le tribunal.\n",
 "salt": "trib-salt-01",
 "config_mock": {
  "backend_tribunal": {
   "model": "mock-heavy",
   "model_mini": "mock-mini"
  },
  "parallel_jures": false
 },
 "faisceau_runs": {
  "f1_h6_etabli": {
   "code": "5.02",
   "pole_num": 5,
   "suspicions": [
    {
     "journee": "J02",
     "extrait": "Hier, nous avons planté les premiers semis dans la serre pédagogique en respectant le calendrier lunaire affiché.",
     "date": "2026-03-12",
     "source": "minoritaire",
     "jugee": "tribunal du 2026-03-12 : non retenue"
    },
    {
     "journee": "J01",
     "extrait": "J'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.",
     "date": "2026-03-05",
     "source": "leger-ecarte"
    },
    {
     "journee": "J01",
     "extrait": "Nous avons refait ensemble la mesure devant toute l'équipe réunie, et le résultat a confirmé mon hypothèse initiale.",
     "source": "sous-seuil"
    },
    {
     "journee": "J03",
     "source": "graine"
    },
    {
     "journee": "J02",
     "extrait": "La répartition des parcelles a demandé une négociation serrée entre les trois groupes de la classe de quatrième.",
     "date": "2026-03-12",
     "source": "graine",
     "jugee": true
    },
    {
     "journee": "J01",
     "extrait": "En comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée.",
     "date": "2026-03-05",
     "source": "sous-seuil"
    },
    {
     "journee": "J02",
     "extrait": "Le compost n'était pas assez mûr, alors nous avons tamisé la partie centrale et écarté les bords trop secs.",
     "source": "minoritaire"
    },
    {
     "journee": "J01",
     "extrait": "Le groupe m'a confié la coordination du planning parce que je tiens les délais depuis le début du trimestre.",
     "source": "leger-ecarte"
    },
    {
     "journee": "J02",
     "extrait": "Un orage a couché les tuteurs de tomates, et il a fallu improviser un système d'attache avec de la ficelle de lin.",
     "date": "2026-03-12",
     "source": "graine"
    },
    {
     "journee": "J01",
     "extrait": "Avant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.",
     "source": "sous-seuil"
    },
    {
     "extrait": "Quand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier.",
     "source": "sans-journee"
    }
   ],
   "periode": "2026-03 → 2026-05",
   "config": {
    "backend_tribunal": {
     "model": "mock-heavy",
     "model_mini": "mock-mini"
    },
    "parallel_jures": false
   },
   "textes": [
    "J01",
    "J02"
   ],
   "verdict": "{\n  \"code\": \"5.02\",\n  \"nom\": \"Compétence 5.02\",\n  \"dossier_vide\": false,\n  \"statut\": \"présence établie\",\n  \"score_preuves\": 0,\n  \"score_indices\": 2,\n  \"confiance\": 0.8,\n  \"jury\": {\n    \"mode\": \"socle4+1\",\n    \"personas\": {\n      \"version\": \"personas-v1\",\n      \"empreinte\": \"1ec337d3a2ef\"\n    },\n    \"detections\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Clinicien du récit\",\n      \"Portraitiste\"\n    ],\n    \"contestations\": [],\n    \"abstentions\": [\n      \"Sociologue\"\n    ],\n    \"second_tour\": false,\n    \"relance_par\": null,\n    \"composition\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\",\n      \"Clinicien du récit\",\n      \"Portraitiste\"\n    ],\n    \"positions_r1\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"détection\",\n      \"Sociologue\": \"abstention\",\n      \"Clinicien du récit\": \"détection\",\n      \"Portraitiste\": \"détection\"\n    },\n    \"positions_finales\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"détection\",\n      \"Sociologue\": \"abstention\",\n      \"Clinicien du récit\": \"détection\",\n      \"Portraitiste\": \"détection\"\n    },\n    \"pieges_nommes\": [],\n    \"consensus\": true,\n    \"dissidences\": []\n  },\n  \"traces_probantes\": [\n    {\n      \"piece\": 1,\n      \"extrait\": \"Quand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier.\",\n      \"date\": \"J01\",\n      \"type\": \"indice\",\n      \"role\": \"indice corroboratif\"\n    },\n    {\n      \"piece\": 2,\n      \"extrait\": \"J'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.\",\n      \"date\": \"J01\",\n      \"type\": \"indice\",\n      \"role\": \"indice corroboratif\"\n    }\n  ],\n  \"prescription\": {\n    \"pour_apprenant\": \"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\",\n    \"pour_cartographe\": null\n  },\n  \"gardien\": {\n    \"support\": {\n      \"constat\": \"neutre\"\n    },\n    \"raisonnement\": {\n      \"drapeau\": false\n    }\n  },\n  \"motif_regle\": \"détection(s) que personne ne conteste\",\n  \"dossier_cartographe\": null,\n  \"deliberation\": {\n    \"greffier_md\": \"# Dossier de faisceau — 5.02 Compétence 5.02\\n\\nPièces réunies mécaniquement sur la période 2026-03 → 2026-05 : signaux individuellement trop faibles pour la carte, conservés parce qu'ils reviennent. La question à instruire : forment-ils ENSEMBLE un faisceau probant ?\\n\\n### Pièces extraites\\n\\n#### Pièce 1\\n- **Extrait** : « Quand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier. »\\n- **Date** : -\\n- **Localisation** : journée -\\n- **Type** : signal de faisceau (source : sans-journee)\\n- **Vigilance** : signal faible — à instruire en constellation\\n\\n#### Pièce 2\\n- **Extrait** : « J'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet. »\\n- **Date** : 2026-03-05\\n- **Localisation** : journée J01\\n- **Type** : signal de faisceau (source : leger-ecarte)\\n- **Vigilance** : signal faible — à instruire en constellation\\n\\n#### Pièce 3\\n- **Extrait** : « Nous avons refait ensemble la mesure devant toute l'équipe réunie, et le résultat a confirmé mon hypothèse initiale. »\\n- **Date** : J01\\n- **Localisation** : journée J01\\n- **Type** : signal de faisceau (source : sous-seuil)\\n- **Vigilance** : signal faible — à instruire en constellation\\n\\n#### Pièce 4\\n- **Extrait** : « En comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée. »\\n- **Date** : 2026-03-05\\n- **Localisation** : journée J01\\n- **Type** : signal de faisceau (source : sous-seuil)\\n- **Vigilance** : signal faible — à instruire en constellation\\n\\n#### Pièce 5\\n- **Extrait** : « Le groupe m'a confié la coordination du planning parce que je tiens les délais depuis le début du trimestre. »\\n- **Date** : J01\\n- **Localisation** : journée J01\\n- **Type** : signal de faisceau (source : leger-ecarte)\\n- **Vigilance** : signal faible — à instruire en constellation\\n\\n#### Pièce 6\\n- **Extrait** : « Avant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles. »\\n- **Date** : J01\\n- **Localisation** : journée J01\\n- **Type** : signal de faisceau (source : sous-seuil)\\n- **Vigilance** : signal faible — à instruire en constellation\\n\\n#### Pièce 7\\n- **Extrait** : « Le compost n'était pas assez mûr, alors nous avons tamisé la partie centrale et écarté les bords trop secs. »\\n- **Date** : J02\\n- **Localisation** : journée J02\\n- **Type** : signal de faisceau (source : minoritaire)\\n- **Vigilance** : signal faible — à instruire en constellation\\n\\n#### Pièce 8\\n- **Extrait** : « Un orage a couché les tuteurs de tomates, et il a fallu improviser un système d'attache avec de la ficelle de lin. »\\n- **Date** : 2026-03-12\\n- **Localisation** : journée J02\\n- **Type** : signal de faisceau (source : graine)\\n- **Vigilance** : signal faible — à instruire en constellation\\n\",\n    \"arene\": {\n      \"accusation_md\": \"# Accusation — 5.02 Compétence 5.02\\n\\n## Thèse\\nLes pièces P1-P3 montrent des actes datés.\\n\\n## Arguments\\n### Argument 1 — Acte documenté\\nPièces : P1. L'acte décrit correspond aux manifestations de la fiche.\\n\\n## Auto-évaluation de la force du dossier\\nmodérée — dossier réel mais étroit.\",\n      \"defense_md\": \"# Défense — 5.02 Compétence 5.02\\n\\n## Position générale\\nLe dossier est étroit.\\n\\n## Attaques\\n### Attaque 1 — Insuffisance probatoire — vise Argument 1 / Pièces P2, P3\\nDeux pièces sont déclaratives, sans dispositif.\\n\\n## Ce que la Défense concède\\nP1 décrit un acte réel.\\n\\n## Conclusion\\nContestation partielle : la présence repose sur P1 seule.\",\n      \"replique_md\": \"# Réplique — 5.02 Compétence 5.02\\n\\n### Réponse à l'Attaque 1\\npartiellement concédée — P2 reste un indice, P3 est abandonnée.\\n\\n## État final du réquisitoire\\nP1 (preuve) + P2 (indice) tiennent.\",\n      \"briefing_md\": \"# Briefing juré — 5.02 Compétence 5.02\\n\\n## Ce que soutient l'Accusation\\nP1 acte daté ; P2 indice.\\n\\n## Ce que soutient la Défense\\nP2-P3 déclaratives.\\n\\n## Issue de la réplique\\nP3 abandonnée.\\n\\n## Points de convergence\\nP1 est un acte réel.\\n\\n## Questions à trancher par le jury\\n1. P1 suffit-elle seule ? (P1)\\n2. P2 est-elle étayée ? (P2)\"\n    },\n    \"jures\": {\n      \"Linguiste\": {\n        \"r1_md\": \"# Juré Linguiste — 5.02 Compétence 5.02\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Historien\": {\n        \"r1_md\": \"# Juré Historien — 5.02 Compétence 5.02\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Pédagogue\": {\n        \"r1_md\": \"# Juré Pédagogue — 5.02 Compétence 5.02\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Sociologue\": {\n        \"r1_md\": \"# Juré Sociologue — 5.02 Compétence 5.02\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Clinicien du récit\": {\n        \"r1_md\": \"# Juré Clinicien du récit — 5.02 Compétence 5.02\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Portraitiste\": {\n        \"r1_md\": \"# Juré Portraitiste — 5.02 Compétence 5.02\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      }\n    },\n    \"relance_md\": null,\n    \"relance_par\": null,\n    \"gardiens\": {\n      \"support_md\": \"# Gardien du support — 5.02 Compétence 5.02\\n\\n**Constat** : neutre\\n\\n## Motif\\nConstat sur le canal écrit, pas sur l'élève (mock).\",\n      \"raisonnement_md\": \"# Gardien du raisonnement — 5.02 Compétence 5.02\\n\\n**Drapeau** : aucun\\n\\n## Motif\\nLe raisonnement du collège tient (mock).\"\n    },\n    \"president_md\": \"# Président — 5.02 Compétence 5.02\\n\\n## Délibération\\n### Synthèse des positions\\n(récit mock du porte-parole — le statut calculé est : présence établie)\\n\\n## Prescription\\n\\n```json\\n{\\\"prescription\\\": {\\\"pour_apprenant\\\": \\\"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\\\", \\\"pour_cartographe\\\": null}}\\n```\"\n  },\n  \"etage\": \"faisceau\"\n}\n",
   "incidents": "{}\n",
   "files": "[\n  [\n    \"21a-accusation.md\",\n    4780452865717\n  ],\n  [\n    \"21b-defense.md\",\n    59163585960563\n  ],\n  [\n    \"22a-replique.md\",\n    240611615731652\n  ],\n  [\n    \"22b-briefing.md\",\n    113289870522462\n  ],\n  [\n    \"23-clinicien du recit.md\",\n    181595905258610\n  ],\n  [\n    \"23-historien.md\",\n    10427577412972\n  ],\n  [\n    \"23-linguiste.md\",\n    202269578366310\n  ],\n  [\n    \"23-pedagogue.md\",\n    30193547583597\n  ],\n  [\n    \"23-portraitiste.md\",\n    188753472600971\n  ],\n  [\n    \"23-sociologue.md\",\n    238942218326633\n  ],\n  [\n    \"24-president.md\",\n    2028106592249\n  ],\n  [\n    \"25a-gardien-support.md\",\n    228522951817126\n  ],\n  [\n    \"25b-gardien-raisonnement.md\",\n    82309364936069\n  ]\n]\n"
  },
  "f2_h9_renvoi": {
   "code": "4.01",
   "pole_num": 4,
   "suspicions": [
    {
     "journee": "J02",
     "extrait": "Hier, nous avons planté les premiers semis dans la serre pédagogique en respectant le calendrier lunaire affiché.",
     "date": "2026-03-12",
     "source": "minoritaire",
     "jugee": "tribunal du 2026-03-12 : non retenue"
    },
    {
     "journee": "J01",
     "extrait": "J'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.",
     "date": "2026-03-05",
     "source": "leger-ecarte"
    },
    {
     "journee": "J01",
     "extrait": "Nous avons refait ensemble la mesure devant toute l'équipe réunie, et le résultat a confirmé mon hypothèse initiale.",
     "source": "sous-seuil"
    },
    {
     "journee": "J03",
     "source": "graine"
    },
    {
     "journee": "J02",
     "extrait": "La répartition des parcelles a demandé une négociation serrée entre les trois groupes de la classe de quatrième.",
     "date": "2026-03-12",
     "source": "graine",
     "jugee": true
    },
    {
     "journee": "J01",
     "extrait": "En comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée.",
     "date": "2026-03-05",
     "source": "sous-seuil"
    },
    {
     "journee": "J02",
     "extrait": "Le compost n'était pas assez mûr, alors nous avons tamisé la partie centrale et écarté les bords trop secs.",
     "source": "minoritaire"
    },
    {
     "journee": "J01",
     "extrait": "Le groupe m'a confié la coordination du planning parce que je tiens les délais depuis le début du trimestre.",
     "source": "leger-ecarte"
    },
    {
     "journee": "J02",
     "extrait": "Un orage a couché les tuteurs de tomates, et il a fallu improviser un système d'attache avec de la ficelle de lin.",
     "date": "2026-03-12",
     "source": "graine"
    },
    {
     "journee": "J01",
     "extrait": "Avant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles.",
     "source": "sous-seuil"
    },
    {
     "extrait": "Quand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier.",
     "source": "sans-journee"
    }
   ],
   "periode": "2026-03 → 2026-05",
   "config": {
    "backend_tribunal": {
     "model": "mock-heavy",
     "model_mini": "mock-mini"
    },
    "parallel_jures": false
   },
   "textes": [
    "J01",
    "J02"
   ],
   "verdict": "{\n  \"code\": \"4.01\",\n  \"nom\": \"Compétence 4.01\",\n  \"dossier_vide\": false,\n  \"statut\": \"renvoi au cartographe\",\n  \"score_preuves\": \"R\",\n  \"score_indices\": \"R\",\n  \"confiance\": 0.5,\n  \"jury\": {\n    \"mode\": \"socle4+1\",\n    \"personas\": {\n      \"version\": \"personas-v1\",\n      \"empreinte\": \"1ec337d3a2ef\"\n    },\n    \"detections\": [\n      \"Linguiste\"\n    ],\n    \"contestations\": [\n      \"Pédagogue\"\n    ],\n    \"abstentions\": [\n      \"Historien\",\n      \"Sociologue\",\n      \"Éthicien\",\n      \"Portraitiste\"\n    ],\n    \"second_tour\": true,\n    \"relance_par\": \"Pédagogue\",\n    \"composition\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\",\n      \"Éthicien\",\n      \"Portraitiste\"\n    ],\n    \"positions_r1\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"abstention\",\n      \"Pédagogue\": \"contestation\",\n      \"Sociologue\": \"abstention\",\n      \"Éthicien\": \"abstention\",\n      \"Portraitiste\": \"abstention\"\n    },\n    \"positions_finales\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"abstention\",\n      \"Pédagogue\": \"contestation\",\n      \"Sociologue\": \"abstention\",\n      \"Éthicien\": \"abstention\",\n      \"Portraitiste\": \"abstention\"\n    },\n    \"pieges_nommes\": [\n      \"récit performatif (déclaration sans acte)\"\n    ],\n    \"consensus\": false,\n    \"dissidences\": [\n      \"Pédagogue : contestation (récit performatif (déclaration sans acte))\"\n    ]\n  },\n  \"traces_probantes\": [],\n  \"prescription\": {\n    \"pour_apprenant\": \"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\",\n    \"pour_cartographe\": \"Question à explorer en entretien : la pièce P1 relève-t-elle de 4.01 ? (mock)\"\n  },\n  \"gardien\": {\n    \"support\": {\n      \"constat\": \"neutre\"\n    },\n    \"raisonnement\": {\n      \"drapeau\": false\n    }\n  },\n  \"motif_regle\": \"détection et contestation subsistent après le second tour\",\n  \"dossier_cartographe\": {\n    \"motif\": \"détection et contestation subsistent après le second tour\",\n    \"desaccord\": \"détections : Linguiste — contestations : Pédagogue\",\n    \"pieges_envisages\": [\n      \"récit performatif (déclaration sans acte)\"\n    ],\n    \"citations\": [\n      \"Quand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier.\",\n      \"J'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet.\",\n      \"Nous avons refait ensemble la mesure devant toute l'équipe réunie, et le résultat a confirmé mon hypothèse initiale.\"\n    ]\n  },\n  \"deliberation\": {\n    \"greffier_md\": \"# Dossier de faisceau — 4.01 Compétence 4.01\\n\\nPièces réunies mécaniquement sur la période 2026-03 → 2026-05 : signaux individuellement trop faibles pour la carte, conservés parce qu'ils reviennent. La question à instruire : forment-ils ENSEMBLE un faisceau probant ?\\n\\n### Pièces extraites\\n\\n#### Pièce 1\\n- **Extrait** : « Quand le capteur a rendu l'âme, j'ai proposé une solution de secours avec le matériel disponible dans l'atelier. »\\n- **Date** : -\\n- **Localisation** : journée -\\n- **Type** : signal de faisceau (source : sans-journee)\\n- **Vigilance** : signal faible — à instruire en constellation\\n\\n#### Pièce 2\\n- **Extrait** : « J'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète du projet. »\\n- **Date** : 2026-03-05\\n- **Localisation** : journée J01\\n- **Type** : signal de faisceau (source : leger-ecarte)\\n- **Vigilance** : signal faible — à instruire en constellation\\n\\n#### Pièce 3\\n- **Extrait** : « Nous avons refait ensemble la mesure devant toute l'équipe réunie, et le résultat a confirmé mon hypothèse initiale. »\\n- **Date** : J01\\n- **Localisation** : journée J01\\n- **Type** : signal de faisceau (source : sous-seuil)\\n- **Vigilance** : signal faible — à instruire en constellation\\n\\n#### Pièce 4\\n- **Extrait** : « En comparant les relevés de mercredi et de jeudi, j'ai repéré une dérive régulière que personne n'avait remarquée. »\\n- **Date** : 2026-03-05\\n- **Localisation** : journée J01\\n- **Type** : signal de faisceau (source : sous-seuil)\\n- **Vigilance** : signal faible — à instruire en constellation\\n\\n#### Pièce 5\\n- **Extrait** : « Le groupe m'a confié la coordination du planning parce que je tiens les délais depuis le début du trimestre. »\\n- **Date** : J01\\n- **Localisation** : journée J01\\n- **Type** : signal de faisceau (source : leger-ecarte)\\n- **Vigilance** : signal faible — à instruire en constellation\\n\\n#### Pièce 6\\n- **Extrait** : « Avant de présenter nos résultats, j'ai réécrit la conclusion pour qu'elle reste fidèle aux mesures réelles. »\\n- **Date** : J01\\n- **Localisation** : journée J01\\n- **Type** : signal de faisceau (source : sous-seuil)\\n- **Vigilance** : signal faible — à instruire en constellation\\n\\n#### Pièce 7\\n- **Extrait** : « Le compost n'était pas assez mûr, alors nous avons tamisé la partie centrale et écarté les bords trop secs. »\\n- **Date** : J02\\n- **Localisation** : journée J02\\n- **Type** : signal de faisceau (source : minoritaire)\\n- **Vigilance** : signal faible — à instruire en constellation\\n\\n#### Pièce 8\\n- **Extrait** : « Un orage a couché les tuteurs de tomates, et il a fallu improviser un système d'attache avec de la ficelle de lin. »\\n- **Date** : 2026-03-12\\n- **Localisation** : journée J02\\n- **Type** : signal de faisceau (source : graine)\\n- **Vigilance** : signal faible — à instruire en constellation\\n\",\n    \"arene\": {\n      \"accusation_md\": \"# Accusation — 4.01 Compétence 4.01\\n\\n## Thèse\\nLes pièces P1-P3 montrent des actes datés.\\n\\n## Arguments\\n### Argument 1 — Acte documenté\\nPièces : P1. L'acte décrit correspond aux manifestations de la fiche.\\n\\n## Auto-évaluation de la force du dossier\\nmodérée — dossier réel mais étroit.\",\n      \"defense_md\": \"# Défense — 4.01 Compétence 4.01\\n\\n## Position générale\\nLe dossier est étroit.\\n\\n## Attaques\\n### Attaque 1 — Insuffisance probatoire — vise Argument 1 / Pièces P2, P3\\nDeux pièces sont déclaratives, sans dispositif.\\n\\n## Ce que la Défense concède\\nP1 décrit un acte réel.\\n\\n## Conclusion\\nContestation partielle : la présence repose sur P1 seule.\",\n      \"replique_md\": \"# Réplique — 4.01 Compétence 4.01\\n\\n### Réponse à l'Attaque 1\\npartiellement concédée — P2 reste un indice, P3 est abandonnée.\\n\\n## État final du réquisitoire\\nP1 (preuve) + P2 (indice) tiennent.\",\n      \"briefing_md\": \"# Briefing juré — 4.01 Compétence 4.01\\n\\n## Ce que soutient l'Accusation\\nP1 acte daté ; P2 indice.\\n\\n## Ce que soutient la Défense\\nP2-P3 déclaratives.\\n\\n## Issue de la réplique\\nP3 abandonnée.\\n\\n## Points de convergence\\nP1 est un acte réel.\\n\\n## Questions à trancher par le jury\\n1. P1 suffit-elle seule ? (P1)\\n2. P2 est-elle étayée ? (P2)\"\n    },\n    \"jures\": {\n      \"Linguiste\": {\n        \"r1_md\": \"# Juré Linguiste — 4.01 Compétence 4.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Linguiste — 4.01 Compétence 4.01\\n\\n**Position** : détection\\n**Pièces** : P1, P2\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Historien\": {\n        \"r1_md\": \"# Juré Historien — 4.01 Compétence 4.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Historien — 4.01 Compétence 4.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Pédagogue\": {\n        \"r1_md\": \"# Juré Pédagogue — 4.01 Compétence 4.01\\n\\n**Position** : contestation\\n**Pièces** : P2, P3\\n**Piège visé** : récit performatif (déclaration sans acte)\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": null,\n        \"position_r1\": \"contestation\",\n        \"position_finale\": \"contestation\",\n        \"pieces\": [\n          2,\n          3\n        ],\n        \"piege\": \"récit performatif (déclaration sans acte)\"\n      },\n      \"Sociologue\": {\n        \"r1_md\": \"# Juré Sociologue — 4.01 Compétence 4.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Sociologue — 4.01 Compétence 4.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Éthicien\": {\n        \"r1_md\": \"# Juré Éthicien — 4.01 Compétence 4.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Éthicien — 4.01 Compétence 4.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Portraitiste\": {\n        \"r1_md\": \"# Juré Portraitiste — 4.01 Compétence 4.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"r2_md\": \"# Second tour — Portraitiste — 4.01 Compétence 4.01\\n\\n**Position** : abstention\\n**Pièces** : —\\n**Piège visé** : —\\n\\n## Raisonnement\\nDepuis mon angle (mock), P1 pèse le plus.\\n\\n## Ce que mon angle révèle que les autres pourraient manquer\\nUn détail de formulation (mock).\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      }\n    },\n    \"relance_md\": \"# Relance — Pédagogue — 4.01 Compétence 4.01\\n\\n**Position maintenue** : contestation\\n**Pièces** : P2, P3\\n**Piège visé** : récit performatif (déclaration sans acte)\\n\\n## L'argument qui justifie la réouverture\\nMon angle éclaire P1 autrement (mock).\\n\\n## Questions précises aux autres jurés\\n1. P1 décrit-elle un acte daté ? (P1)\\n2. P2 est-elle étayée ? (P2)\",\n    \"relance_par\": \"Pédagogue\",\n    \"gardiens\": {\n      \"support_md\": \"# Gardien du support — 4.01 Compétence 4.01\\n\\n**Constat** : neutre\\n\\n## Motif\\nConstat sur le canal écrit, pas sur l'élève (mock).\",\n      \"raisonnement_md\": \"# Gardien du raisonnement — 4.01 Compétence 4.01\\n\\n**Drapeau** : aucun\\n\\n## Motif\\nLe raisonnement du collège tient (mock).\"\n    },\n    \"president_md\": \"# Président — 4.01 Compétence 4.01\\n\\n## Délibération\\n### Synthèse des positions\\n(récit mock du porte-parole — le statut calculé est : renvoi au cartographe)\\n\\n## Prescription\\n\\n```json\\n{\\\"prescription\\\": {\\\"pour_apprenant\\\": \\\"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).\\\", \\\"pour_cartographe\\\": \\\"Question à explorer en entretien : la pièce P1 relève-t-elle de 4.01 ? (mock)\\\"}}\\n```\"\n  },\n  \"etage\": \"faisceau\"\n}\n",
   "incidents": "{}\n",
   "files": "[\n  [\n    \"21a-accusation.md\",\n    63263296092731\n  ],\n  [\n    \"21b-defense.md\",\n    174660581359160\n  ],\n  [\n    \"22a-replique.md\",\n    164908524405831\n  ],\n  [\n    \"22b-briefing.md\",\n    15655257428632\n  ],\n  [\n    \"23-ethicien.md\",\n    264760819938915\n  ],\n  [\n    \"23-historien.md\",\n    61224754022810\n  ],\n  [\n    \"23-linguiste.md\",\n    130353748993869\n  ],\n  [\n    \"23-pedagogue.md\",\n    194876919991590\n  ],\n  [\n    \"23-portraitiste.md\",\n    19580963123241\n  ],\n  [\n    \"23-sociologue.md\",\n    119774272465503\n  ],\n  [\n    \"23b-relance.md\",\n    142241120095690\n  ],\n  [\n    \"23c-ethicien.md\",\n    115963728154463\n  ],\n  [\n    \"23c-historien.md\",\n    162281922415722\n  ],\n  [\n    \"23c-linguiste.md\",\n    38167850780110\n  ],\n  [\n    \"23c-portraitiste.md\",\n    80490581080484\n  ],\n  [\n    \"23c-sociologue.md\",\n    66987898537250\n  ],\n  [\n    \"24-president.md\",\n    239568971366865\n  ],\n  [\n    \"25a-gardien-support.md\",\n    236065373990251\n  ],\n  [\n    \"25b-gardien-raisonnement.md\",\n    40744508397068\n  ]\n]\n"
  }
 },
 "canned": {
  "can1_consensus_etabli": {
   "canned": {
    "accusation_J11_9.01": "# Accusation (cannée)\n\nP1 et P2 montrent des actes datés.",
    "defense_J11_9.01": "# Défense (cannée)\n\nLe dossier est étroit.",
    "replique_J11_9.01": "# Réplique (cannée)\n\nP1 tient, P3 tombe.",
    "briefing_J11_9.01": "# Briefing (canné)\n\nQuestion : P1 suffit-elle ?",
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\n- **Date** : hier\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n",
    "jure_J11_9.01#Linguiste": "**Position** : détection\n**Pièces** : P1, P2\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure_J11_9.01#Historien": "**Position** : détection\n**Pièces** : P1, P2\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure_J11_9.01#Pédagogue": "**Position** : détection\n**Pièces** : P1, P2\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure_J11_9.01#Sociologue": "**Position** : détection\n**Pièces** : P1, P2\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "gardien_support_J11_9.01": "**Constat** : neutre",
    "gardien_raisonnement_J11_9.01": "**Drapeau** : aucun",
    "president_J11_9.01": "# Président (canné)\n\n## Prescription\n\n```json\n{\"prescription\": {\"pour_apprenant\": \"Prescription cannée pour l'apprenant.\", \"pour_cartographe\": null}}\n```"
   },
   "config": {
    "backend_tribunal": {
     "model": "fake-heavy",
     "model_mini": "fake-mini"
    },
    "parallel_jures": false
   },
   "verdict": "{\n  \"code\": \"9.01\",\n  \"nom\": \"Compétence fictive\",\n  \"dossier_vide\": false,\n  \"statut\": \"présence établie\",\n  \"score_preuves\": 1,\n  \"score_indices\": 1,\n  \"confiance\": 0.9,\n  \"jury\": {\n    \"mode\": \"socle4+1\",\n    \"personas\": {\n      \"version\": \"personas-v1\",\n      \"empreinte\": \"1ec337d3a2ef\"\n    },\n    \"detections\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\"\n    ],\n    \"contestations\": [],\n    \"abstentions\": [],\n    \"second_tour\": false,\n    \"relance_par\": null,\n    \"composition\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\"\n    ],\n    \"positions_r1\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"détection\",\n      \"Sociologue\": \"détection\"\n    },\n    \"positions_finales\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"détection\",\n      \"Sociologue\": \"détection\"\n    },\n    \"pieges_nommes\": [],\n    \"consensus\": true,\n    \"dissidences\": []\n  },\n  \"traces_probantes\": [\n    {\n      \"piece\": 1,\n      \"extrait\": \"j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète\",\n      \"date\": \"2026-03-10\",\n      \"type\": \"trace_concrete\",\n      \"role\": \"preuve décisive\"\n    },\n    {\n      \"piece\": 2,\n      \"extrait\": \"nous avons refait ensemble la mesure devant toute l'équipe réunie\",\n      \"date\": \"2026-03-10\",\n      \"type\": \"declaration_etayee\",\n      \"role\": \"indice corroboratif\"\n    }\n  ],\n  \"prescription\": {\n    \"pour_apprenant\": \"Prescription cannée pour l'apprenant.\",\n    \"pour_cartographe\": null\n  },\n  \"gardien\": {\n    \"support\": {\n      \"constat\": \"neutre\"\n    },\n    \"raisonnement\": {\n      \"drapeau\": false\n    }\n  },\n  \"motif_regle\": \"détection(s) que personne ne conteste\",\n  \"dossier_cartographe\": null,\n  \"deliberation\": {\n    \"greffier_md\": \"# Greffier — 9.01 Compétence fictive\\n\\n### Pièces extraites\\n\\n#### Pièce 1\\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\\n- **Date** : 2026-03-10\\n- **Type** : trace concrète\\n\\n#### Pièce 2\\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\\n- **Date** : hier\\n- **Type** : déclaration étayée\\n\\n#### Pièce 3\\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\\n- **Type** : déclaration nue\\n\",\n    \"arene\": {\n      \"accusation_md\": \"# Accusation (cannée)\\n\\nP1 et P2 montrent des actes datés.\",\n      \"defense_md\": \"# Défense (cannée)\\n\\nLe dossier est étroit.\",\n      \"replique_md\": \"# Réplique (cannée)\\n\\nP1 tient, P3 tombe.\",\n      \"briefing_md\": \"# Briefing (canné)\\n\\nQuestion : P1 suffit-elle ?\"\n    },\n    \"jures\": {\n      \"Linguiste\": {\n        \"r1_md\": \"**Position** : détection\\n**Pièces** : P1, P2\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Historien\": {\n        \"r1_md\": \"**Position** : détection\\n**Pièces** : P1, P2\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Pédagogue\": {\n        \"r1_md\": \"**Position** : détection\\n**Pièces** : P1, P2\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Sociologue\": {\n        \"r1_md\": \"**Position** : détection\\n**Pièces** : P1, P2\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      }\n    },\n    \"relance_md\": null,\n    \"relance_par\": null,\n    \"gardiens\": {\n      \"support_md\": \"**Constat** : neutre\",\n      \"raisonnement_md\": \"**Drapeau** : aucun\"\n    },\n    \"president_md\": \"# Président (canné)\\n\\n## Prescription\\n\\n```json\\n{\\\"prescription\\\": {\\\"pour_apprenant\\\": \\\"Prescription cannée pour l'apprenant.\\\", \\\"pour_cartographe\\\": null}}\\n```\"\n  },\n  \"etage\": \"tribunal\"\n}\n",
   "incidents": "{}\n",
   "files": "[\n  [\n    \"20-greffier.md\",\n    173326424956045\n  ],\n  [\n    \"21a-accusation.md\",\n    258104906274684\n  ],\n  [\n    \"21b-defense.md\",\n    48453579295968\n  ],\n  [\n    \"22a-replique.md\",\n    159130175615092\n  ],\n  [\n    \"22b-briefing.md\",\n    3628533866676\n  ],\n  [\n    \"23-historien.md\",\n    78955625903734\n  ],\n  [\n    \"23-linguiste.md\",\n    78955625903734\n  ],\n  [\n    \"23-pedagogue.md\",\n    78955625903734\n  ],\n  [\n    \"23-sociologue.md\",\n    78955625903734\n  ],\n  [\n    \"24-president.md\",\n    146108071122070\n  ],\n  [\n    \"25a-gardien-support.md\",\n    144234867068446\n  ],\n  [\n    \"25b-gardien-raisonnement.md\",\n    203558780310487\n  ]\n]\n",
   "president_prompts": [
    "Statut calculé : présence établie (détection(s) que personne ne conteste)\nDétections : Linguiste, Historien, Pédagogue, Sociologue | Contestations : — | Abstentions : —\nSecond tour : non\nGardien du support : neutre — Gardien du raisonnement : aucun drapeau\nTraces ancrées : 2 (preuves 1, indices 1) — confiance 0.90"
   ]
  },
  "can2_illisible_gonfle": {
   "canned": {
    "accusation_J11_9.01": "# Accusation (cannée)\n\nP1 et P2 montrent des actes datés.",
    "defense_J11_9.01": "# Défense (cannée)\n\nLe dossier est étroit.",
    "replique_J11_9.01": "# Réplique (cannée)\n\nP1 tient, P3 tombe.",
    "briefing_J11_9.01": "# Briefing (canné)\n\nQuestion : P1 suffit-elle ?",
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\n- **Date** : hier\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n",
    "jure_J11_9.01#Linguiste": "## Avis sans balise position\n\nJe m'interroge longuement (canné).",
    "jure_J11_9.01#Historien": "**Position** : détection\n**Pièces** : P1, P2\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure_J11_9.01#Pédagogue": "**Position** : abstention\n**Pièces** : —\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure_J11_9.01#Sociologue": "**Position** : abstention\n**Pièces** : —\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "relance_J11_9.01": "**Position maintenue** : détection\n**Pièces** : P1, P2\n**Piège** : —\n\n(relance cannée)",
    "jure2_J11_9.01#Linguiste": "**Position** : abstention\n**Pièces** : —\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure2_J11_9.01#Pédagogue": "**Position** : abstention\n**Pièces** : —\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure2_J11_9.01#Sociologue": "**Position** : abstention\n**Pièces** : —\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "gardien_support_J11_9.01": "**Constat** : le support gonfle",
    "gardien_raisonnement_J11_9.01": "**Drapeau** : aucun"
   },
   "config": {
    "backend_tribunal": {
     "model": "fake-heavy",
     "model_mini": "fake-mini"
    },
    "parallel_jures": false
   },
   "verdict": "{\n  \"code\": \"9.01\",\n  \"nom\": \"Compétence fictive\",\n  \"dossier_vide\": false,\n  \"statut\": \"renvoi au cartographe\",\n  \"score_preuves\": \"R\",\n  \"score_indices\": \"R\",\n  \"confiance\": 0.5,\n  \"jury\": {\n    \"mode\": \"socle4+1\",\n    \"personas\": {\n      \"version\": \"personas-v1\",\n      \"empreinte\": \"1ec337d3a2ef\"\n    },\n    \"detections\": [\n      \"Historien\"\n    ],\n    \"contestations\": [],\n    \"abstentions\": [\n      \"Linguiste\",\n      \"Pédagogue\",\n      \"Sociologue\"\n    ],\n    \"second_tour\": true,\n    \"relance_par\": \"Historien\",\n    \"composition\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\"\n    ],\n    \"positions_r1\": {\n      \"Linguiste\": \"abstention\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"abstention\",\n      \"Sociologue\": \"abstention\"\n    },\n    \"positions_finales\": {\n      \"Linguiste\": \"abstention\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"abstention\",\n      \"Sociologue\": \"abstention\"\n    },\n    \"pieges_nommes\": [],\n    \"consensus\": true,\n    \"dissidences\": []\n  },\n  \"traces_probantes\": [],\n  \"prescription\": {\n    \"pour_apprenant\": \"Ce dossier appelle un échange avec l'enseignant.\",\n    \"pour_cartographe\": \"résolution durcie (le support gonfle) : détection isolée\"\n  },\n  \"gardien\": {\n    \"support\": {\n      \"constat\": \"gonfle\"\n    },\n    \"raisonnement\": {\n      \"drapeau\": false\n    }\n  },\n  \"motif_regle\": \"résolution durcie (le support gonfle) : détection isolée\",\n  \"dossier_cartographe\": {\n    \"motif\": \"résolution durcie (le support gonfle) : détection isolée\",\n    \"desaccord\": \"détections : Historien — contestations : aucune\",\n    \"pieges_envisages\": [],\n    \"citations\": [\n      \"j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète\",\n      \"nous avons refait ensemble la mesure devant toute l'équipe réunie\"\n    ]\n  },\n  \"deliberation\": {\n    \"greffier_md\": \"# Greffier — 9.01 Compétence fictive\\n\\n### Pièces extraites\\n\\n#### Pièce 1\\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\\n- **Date** : 2026-03-10\\n- **Type** : trace concrète\\n\\n#### Pièce 2\\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\\n- **Date** : hier\\n- **Type** : déclaration étayée\\n\\n#### Pièce 3\\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\\n- **Type** : déclaration nue\\n\",\n    \"arene\": {\n      \"accusation_md\": \"# Accusation (cannée)\\n\\nP1 et P2 montrent des actes datés.\",\n      \"defense_md\": \"# Défense (cannée)\\n\\nLe dossier est étroit.\",\n      \"replique_md\": \"# Réplique (cannée)\\n\\nP1 tient, P3 tombe.\",\n      \"briefing_md\": \"# Briefing (canné)\\n\\nQuestion : P1 suffit-elle ?\"\n    },\n    \"jures\": {\n      \"Linguiste\": {\n        \"r1_md\": \"## Avis sans balise position\\n\\nJe m'interroge longuement (canné).\",\n        \"r2_md\": \"**Position** : abstention\\n**Pièces** : —\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Historien\": {\n        \"r1_md\": \"**Position** : détection\\n**Pièces** : P1, P2\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Pédagogue\": {\n        \"r1_md\": \"**Position** : abstention\\n**Pièces** : —\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": \"**Position** : abstention\\n**Pièces** : —\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Sociologue\": {\n        \"r1_md\": \"**Position** : abstention\\n**Pièces** : —\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": \"**Position** : abstention\\n**Pièces** : —\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      }\n    },\n    \"relance_md\": \"**Position maintenue** : détection\\n**Pièces** : P1, P2\\n**Piège** : —\\n\\n(relance cannée)\",\n    \"relance_par\": \"Historien\",\n    \"gardiens\": {\n      \"support_md\": \"**Constat** : le support gonfle\",\n      \"raisonnement_md\": \"**Drapeau** : aucun\"\n    },\n    \"president_md\": null\n  },\n  \"etage\": \"tribunal\"\n}\n",
   "incidents": "{\n  \"jure_position_illisible\": 1,\n  \"president_recit_indisponible\": 1\n}\n",
   "files": "[\n  [\n    \"20-greffier.md\",\n    173326424956045\n  ],\n  [\n    \"21a-accusation.md\",\n    258104906274684\n  ],\n  [\n    \"21b-defense.md\",\n    48453579295968\n  ],\n  [\n    \"22a-replique.md\",\n    159130175615092\n  ],\n  [\n    \"22b-briefing.md\",\n    3628533866676\n  ],\n  [\n    \"23-historien.md\",\n    78955625903734\n  ],\n  [\n    \"23-linguiste.md\",\n    271800757940640\n  ],\n  [\n    \"23-pedagogue.md\",\n    196774338184473\n  ],\n  [\n    \"23-sociologue.md\",\n    196774338184473\n  ],\n  [\n    \"23b-relance.md\",\n    132756518560981\n  ],\n  [\n    \"23c-linguiste.md\",\n    196774338184473\n  ],\n  [\n    \"23c-pedagogue.md\",\n    196774338184473\n  ],\n  [\n    \"23c-sociologue.md\",\n    196774338184473\n  ],\n  [\n    \"25a-gardien-support.md\",\n    276323037787088\n  ],\n  [\n    \"25b-gardien-raisonnement.md\",\n    203558780310487\n  ]\n]\n",
   "president_prompts": [
    "Statut calculé : renvoi au cartographe (résolution durcie (le support gonfle) : détection isolée)\nDétections : Historien | Contestations : — | Abstentions : Linguiste, Pédagogue, Sociologue\nSecond tour : oui, relancé par Historien\nGardien du support : gonfle — Gardien du raisonnement : aucun drapeau\nTraces ancrées : 0 (preuves R, indices R) — confiance 0.50"
   ]
  },
  "can3_drapeau_pieges": {
   "canned": {
    "accusation_J11_9.01": "# Accusation (cannée)\n\nP1 et P2 montrent des actes datés.",
    "defense_J11_9.01": "# Défense (cannée)\n\nLe dossier est étroit.",
    "replique_J11_9.01": "# Réplique (cannée)\n\nP1 tient, P3 tombe.",
    "briefing_J11_9.01": "# Briefing (canné)\n\nQuestion : P1 suffit-elle ?",
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\n- **Date** : hier\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n",
    "jure_J11_9.01#Linguiste": "**Position** : détection\n**Pièces** : P1, P2\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure_J11_9.01#Historien": "**Position** : contestation\n**Pièces** : P2, P3\n**Piège** : fabrication de cohérence (dates incompatibles)\n\n## Raisonnement\n(canné)",
    "jure_J11_9.01#Pédagogue": "**Position** : contestation\n**Pièces** : P3\n**Piège** : récit performatif (déclaration sans acte)\n\n## Raisonnement\n(canné)",
    "jure_J11_9.01#Sociologue": "**Position** : détection\n**Pièces** : P2\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "relance_J11_9.01": "**Position maintenue** : contestation\n**Pièces** : P2, P3\n**Piège** : fabrication de cohérence (dates incompatibles)\n\n(relance cannée)",
    "jure2_J11_9.01#Linguiste": "**Position** : détection\n**Pièces** : P1, P2\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure2_J11_9.01#Pédagogue": "**Position** : contestation\n**Pièces** : P3\n**Piège** : récit performatif (déclaration sans acte)\n\n## Raisonnement\n(canné)",
    "jure2_J11_9.01#Sociologue": "**Position** : abstention\n**Pièces** : —\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "gardien_support_J11_9.01": "**Constat** : le support masque",
    "gardien_raisonnement_J11_9.01": "**Drapeau** : vice de raisonnement",
    "president_J11_9.01": "# Président (canné)\n\n```json\n{\"prescription\": {\"pour_apprenant\": \"Prescription cannée (renvoi).\", \"pour_cartographe\": \"Question cannée pour l'enseignant.\"}}\n```"
   },
   "config": {
    "backend_tribunal": {
     "model": "fake-heavy",
     "model_mini": "fake-mini"
    },
    "parallel_jures": false
   },
   "verdict": "{\n  \"code\": \"9.01\",\n  \"nom\": \"Compétence fictive\",\n  \"dossier_vide\": false,\n  \"statut\": \"renvoi au cartographe\",\n  \"score_preuves\": \"R\",\n  \"score_indices\": \"R\",\n  \"confiance\": 0.5,\n  \"jury\": {\n    \"mode\": \"socle4+1\",\n    \"personas\": {\n      \"version\": \"personas-v1\",\n      \"empreinte\": \"1ec337d3a2ef\"\n    },\n    \"detections\": [\n      \"Linguiste\"\n    ],\n    \"contestations\": [\n      \"Historien\",\n      \"Pédagogue\"\n    ],\n    \"abstentions\": [\n      \"Sociologue\"\n    ],\n    \"second_tour\": true,\n    \"relance_par\": \"Historien\",\n    \"composition\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\"\n    ],\n    \"positions_r1\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"contestation\",\n      \"Pédagogue\": \"contestation\",\n      \"Sociologue\": \"détection\"\n    },\n    \"positions_finales\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"contestation\",\n      \"Pédagogue\": \"contestation\",\n      \"Sociologue\": \"abstention\"\n    },\n    \"pieges_nommes\": [\n      \"fabrication de cohérence (dates incompatibles)\",\n      \"récit performatif (déclaration sans acte)\"\n    ],\n    \"consensus\": false,\n    \"dissidences\": [\n      \"Historien : contestation (fabrication de cohérence (dates incompatibles))\",\n      \"Pédagogue : contestation (récit performatif (déclaration sans acte))\"\n    ]\n  },\n  \"traces_probantes\": [],\n  \"prescription\": {\n    \"pour_apprenant\": \"Prescription cannée (renvoi).\",\n    \"pour_cartographe\": \"Question cannée pour l'enseignant.\"\n  },\n  \"gardien\": {\n    \"support\": {\n      \"constat\": \"masque\"\n    },\n    \"raisonnement\": {\n      \"drapeau\": true\n    }\n  },\n  \"motif_regle\": \"drapeau du gardien du raisonnement\",\n  \"dossier_cartographe\": {\n    \"motif\": \"drapeau du gardien du raisonnement\",\n    \"desaccord\": \"détections : Linguiste — contestations : Historien, Pédagogue\",\n    \"pieges_envisages\": [\n      \"fabrication de cohérence (dates incompatibles)\",\n      \"récit performatif (déclaration sans acte)\"\n    ],\n    \"citations\": [\n      \"j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète\",\n      \"nous avons refait ensemble la mesure devant toute l'équipe réunie\",\n      \"je promets de mieux documenter la prochaine fois\"\n    ]\n  },\n  \"deliberation\": {\n    \"greffier_md\": \"# Greffier — 9.01 Compétence fictive\\n\\n### Pièces extraites\\n\\n#### Pièce 1\\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\\n- **Date** : 2026-03-10\\n- **Type** : trace concrète\\n\\n#### Pièce 2\\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\\n- **Date** : hier\\n- **Type** : déclaration étayée\\n\\n#### Pièce 3\\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\\n- **Type** : déclaration nue\\n\",\n    \"arene\": {\n      \"accusation_md\": \"# Accusation (cannée)\\n\\nP1 et P2 montrent des actes datés.\",\n      \"defense_md\": \"# Défense (cannée)\\n\\nLe dossier est étroit.\",\n      \"replique_md\": \"# Réplique (cannée)\\n\\nP1 tient, P3 tombe.\",\n      \"briefing_md\": \"# Briefing (canné)\\n\\nQuestion : P1 suffit-elle ?\"\n    },\n    \"jures\": {\n      \"Linguiste\": {\n        \"r1_md\": \"**Position** : détection\\n**Pièces** : P1, P2\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": \"**Position** : détection\\n**Pièces** : P1, P2\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Historien\": {\n        \"r1_md\": \"**Position** : contestation\\n**Pièces** : P2, P3\\n**Piège** : fabrication de cohérence (dates incompatibles)\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"contestation\",\n        \"position_finale\": \"contestation\",\n        \"pieces\": [\n          2,\n          3\n        ],\n        \"piege\": \"fabrication de cohérence (dates incompatibles)\"\n      },\n      \"Pédagogue\": {\n        \"r1_md\": \"**Position** : contestation\\n**Pièces** : P3\\n**Piège** : récit performatif (déclaration sans acte)\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": \"**Position** : contestation\\n**Pièces** : P3\\n**Piège** : récit performatif (déclaration sans acte)\\n\\n## Raisonnement\\n(canné)\",\n        \"position_r1\": \"contestation\",\n        \"position_finale\": \"contestation\",\n        \"pieces\": [\n          3\n        ],\n        \"piege\": \"récit performatif (déclaration sans acte)\"\n      },\n      \"Sociologue\": {\n        \"r1_md\": \"**Position** : détection\\n**Pièces** : P2\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": \"**Position** : abstention\\n**Pièces** : —\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      }\n    },\n    \"relance_md\": \"**Position maintenue** : contestation\\n**Pièces** : P2, P3\\n**Piège** : fabrication de cohérence (dates incompatibles)\\n\\n(relance cannée)\",\n    \"relance_par\": \"Historien\",\n    \"gardiens\": {\n      \"support_md\": \"**Constat** : le support masque\",\n      \"raisonnement_md\": \"**Drapeau** : vice de raisonnement\"\n    },\n    \"president_md\": \"# Président (canné)\\n\\n```json\\n{\\\"prescription\\\": {\\\"pour_apprenant\\\": \\\"Prescription cannée (renvoi).\\\", \\\"pour_cartographe\\\": \\\"Question cannée pour l'enseignant.\\\"}}\\n```\"\n  },\n  \"etage\": \"tribunal\"\n}\n",
   "incidents": "{}\n",
   "files": "[\n  [\n    \"20-greffier.md\",\n    173326424956045\n  ],\n  [\n    \"21a-accusation.md\",\n    258104906274684\n  ],\n  [\n    \"21b-defense.md\",\n    48453579295968\n  ],\n  [\n    \"22a-replique.md\",\n    159130175615092\n  ],\n  [\n    \"22b-briefing.md\",\n    3628533866676\n  ],\n  [\n    \"23-historien.md\",\n    89976899346811\n  ],\n  [\n    \"23-linguiste.md\",\n    78955625903734\n  ],\n  [\n    \"23-pedagogue.md\",\n    93725690111068\n  ],\n  [\n    \"23-sociologue.md\",\n    102931994150910\n  ],\n  [\n    \"23b-relance.md\",\n    72569255590961\n  ],\n  [\n    \"23c-linguiste.md\",\n    78955625903734\n  ],\n  [\n    \"23c-pedagogue.md\",\n    93725690111068\n  ],\n  [\n    \"23c-sociologue.md\",\n    196774338184473\n  ],\n  [\n    \"24-president.md\",\n    38502924032428\n  ],\n  [\n    \"25a-gardien-support.md\",\n    248544071782006\n  ],\n  [\n    \"25b-gardien-raisonnement.md\",\n    32300528389642\n  ]\n]\n",
   "president_prompts": [
    "Statut calculé : renvoi au cartographe (drapeau du gardien du raisonnement)\nDétections : Linguiste | Contestations : Historien, Pédagogue | Abstentions : Sociologue\nSecond tour : oui, relancé par Historien\nGardien du support : masque — Gardien du raisonnement : vice signalé\nTraces ancrées : 0 (preuves R, indices R) — confiance 0.50"
   ]
  },
  "can4_non_ancrable": {
   "canned": {
    "accusation_J11_9.01": "# Accusation (cannée)\n\nP1 et P2 montrent des actes datés.",
    "defense_J11_9.01": "# Défense (cannée)\n\nLe dossier est étroit.",
    "replique_J11_9.01": "# Réplique (cannée)\n\nP1 tient, P3 tombe.",
    "briefing_J11_9.01": "# Briefing (canné)\n\nQuestion : P1 suffit-elle ?",
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « un extrait totalement absent du texte de la journée, impossible à ré-ancrer nulle part »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « une deuxième citation fantôme qui ne correspond à aucune phrase réelle du portfolio étudié»\n- **Date** : 2026-03-11\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n",
    "jure_J11_9.01#Linguiste": "**Position** : détection\n**Pièces** : P1, P2 et P3\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure_J11_9.01#Historien": "**Position** : détection\n**Pièces** : P1, P2 et P3\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure_J11_9.01#Pédagogue": "**Position** : détection\n**Pièces** : P1, P2 et P3\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure_J11_9.01#Sociologue": "**Position** : détection\n**Pièces** : P1, P2 et P3\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "gardien_support_J11_9.01": "**Constat** : neutre",
    "gardien_raisonnement_J11_9.01": "**Drapeau** : aucun"
   },
   "config": {
    "backend_tribunal": {
     "model": "fake-heavy",
     "model_mini": "fake-mini"
    },
    "parallel_jures": false
   },
   "verdict": "{\n  \"code\": \"9.01\",\n  \"nom\": \"Compétence fictive\",\n  \"dossier_vide\": false,\n  \"statut\": \"renvoi au cartographe\",\n  \"score_preuves\": \"R\",\n  \"score_indices\": \"R\",\n  \"confiance\": 0.5,\n  \"jury\": {\n    \"mode\": \"socle4+1\",\n    \"personas\": {\n      \"version\": \"personas-v1\",\n      \"empreinte\": \"1ec337d3a2ef\"\n    },\n    \"detections\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\"\n    ],\n    \"contestations\": [],\n    \"abstentions\": [],\n    \"second_tour\": false,\n    \"relance_par\": null,\n    \"composition\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\"\n    ],\n    \"positions_r1\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"détection\",\n      \"Sociologue\": \"détection\"\n    },\n    \"positions_finales\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"détection\",\n      \"Sociologue\": \"détection\"\n    },\n    \"pieges_nommes\": [],\n    \"consensus\": true,\n    \"dissidences\": []\n  },\n  \"traces_probantes\": [],\n  \"prescription\": {\n    \"pour_apprenant\": \"Ce dossier appelle un échange avec l'enseignant.\",\n    \"pour_cartographe\": \"détection sans pièce ancrable (2 citation(s) introuvable(s))\"\n  },\n  \"gardien\": {\n    \"support\": {\n      \"constat\": \"neutre\"\n    },\n    \"raisonnement\": {\n      \"drapeau\": false\n    }\n  },\n  \"motif_regle\": \"détection sans pièce ancrable (2 citation(s) introuvable(s))\",\n  \"dossier_cartographe\": {\n    \"motif\": \"détection sans pièce ancrable (2 citation(s) introuvable(s))\",\n    \"desaccord\": \"détections : Linguiste, Historien, Pédagogue, Sociologue — contestations : aucune\",\n    \"pieges_envisages\": [],\n    \"citations\": [\n      \"un extrait totalement absent du texte de la journée, impossible à ré-ancrer nulle part\",\n      \"une deuxième citation fantôme qui ne correspond à aucune phrase réelle du portfolio étudié\",\n      \"je promets de mieux documenter la prochaine fois\"\n    ]\n  },\n  \"deliberation\": {\n    \"greffier_md\": \"# Greffier — 9.01 Compétence fictive\\n\\n### Pièces extraites\\n\\n#### Pièce 1\\n- **Extrait** : « un extrait totalement absent du texte de la journée, impossible à ré-ancrer nulle part »\\n- **Date** : 2026-03-10\\n- **Type** : trace concrète\\n\\n#### Pièce 2\\n- **Extrait** : « une deuxième citation fantôme qui ne correspond à aucune phrase réelle du portfolio étudié»\\n- **Date** : 2026-03-11\\n- **Type** : déclaration étayée\\n\\n#### Pièce 3\\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\\n- **Type** : déclaration nue\\n\",\n    \"arene\": {\n      \"accusation_md\": \"# Accusation (cannée)\\n\\nP1 et P2 montrent des actes datés.\",\n      \"defense_md\": \"# Défense (cannée)\\n\\nLe dossier est étroit.\",\n      \"replique_md\": \"# Réplique (cannée)\\n\\nP1 tient, P3 tombe.\",\n      \"briefing_md\": \"# Briefing (canné)\\n\\nQuestion : P1 suffit-elle ?\"\n    },\n    \"jures\": {\n      \"Linguiste\": {\n        \"r1_md\": \"**Position** : détection\\n**Pièces** : P1, P2 et P3\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"piege\": null\n      },\n      \"Historien\": {\n        \"r1_md\": \"**Position** : détection\\n**Pièces** : P1, P2 et P3\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"piege\": null\n      },\n      \"Pédagogue\": {\n        \"r1_md\": \"**Position** : détection\\n**Pièces** : P1, P2 et P3\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"piege\": null\n      },\n      \"Sociologue\": {\n        \"r1_md\": \"**Position** : détection\\n**Pièces** : P1, P2 et P3\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"piege\": null\n      }\n    },\n    \"relance_md\": null,\n    \"relance_par\": null,\n    \"gardiens\": {\n      \"support_md\": \"**Constat** : neutre\",\n      \"raisonnement_md\": \"**Drapeau** : aucun\"\n    },\n    \"president_md\": null\n  },\n  \"etage\": \"tribunal\"\n}\n",
   "incidents": "{\n  \"trace_tribunal_non_ancree\": 2,\n  \"president_recit_indisponible\": 1\n}\n",
   "files": "[\n  [\n    \"20-greffier.md\",\n    220897253367901\n  ],\n  [\n    \"21a-accusation.md\",\n    258104906274684\n  ],\n  [\n    \"21b-defense.md\",\n    48453579295968\n  ],\n  [\n    \"22a-replique.md\",\n    159130175615092\n  ],\n  [\n    \"22b-briefing.md\",\n    3628533866676\n  ],\n  [\n    \"23-historien.md\",\n    230712625629902\n  ],\n  [\n    \"23-linguiste.md\",\n    230712625629902\n  ],\n  [\n    \"23-pedagogue.md\",\n    230712625629902\n  ],\n  [\n    \"23-sociologue.md\",\n    230712625629902\n  ],\n  [\n    \"25a-gardien-support.md\",\n    144234867068446\n  ],\n  [\n    \"25b-gardien-raisonnement.md\",\n    203558780310487\n  ]\n]\n",
   "president_prompts": [
    "Statut calculé : renvoi au cartographe (détection sans pièce ancrable (2 citation(s) introuvable(s)))\nDétections : Linguiste, Historien, Pédagogue, Sociologue | Contestations : — | Abstentions : —\nSecond tour : non\nGardien du support : neutre — Gardien du raisonnement : aucun drapeau\nTraces ancrées : 0 (preuves R, indices R) — confiance 0.50"
   ]
  },
  "can5_panne": {
   "canned": {
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\n- **Date** : hier\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n"
   },
   "config": {
    "backend_tribunal": {
     "model": "fake-heavy",
     "model_mini": "fake-mini"
    },
    "parallel_jures": false
   },
   "verdict": "{\n  \"code\": \"9.01\",\n  \"nom\": \"Compétence fictive\",\n  \"dossier_vide\": false,\n  \"statut\": \"renvoi au cartographe\",\n  \"score_preuves\": \"R\",\n  \"score_indices\": \"R\",\n  \"confiance\": 0.0,\n  \"jury\": null,\n  \"traces_probantes\": [],\n  \"prescription\": {\n    \"pour_apprenant\": \"Ce dossier appelle un échange avec l'enseignant.\",\n    \"pour_cartographe\": \"Tribunal interrompu (panne technique) : panne simulée\"\n  },\n  \"gardien\": null,\n  \"dossier_cartographe\": null,\n  \"etage\": \"tribunal\"\n}\n",
   "incidents": "{\n  \"tribunal_echec_technique\": 1\n}\n",
   "files": "[\n  [\n    \"20-greffier.md\",\n    173326424956045\n  ]\n]\n",
   "president_prompts": []
  },
  "can6_non_etablie_defaut": {
   "canned": {
    "accusation_J11_9.01": "# Accusation (cannée)\n\nP1 et P2 montrent des actes datés.",
    "defense_J11_9.01": "# Défense (cannée)\n\nLe dossier est étroit.",
    "replique_J11_9.01": "# Réplique (cannée)\n\nP1 tient, P3 tombe.",
    "briefing_J11_9.01": "# Briefing (canné)\n\nQuestion : P1 suffit-elle ?",
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\n- **Date** : hier\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n",
    "jure_J11_9.01#Linguiste": "**Position** : abstention\n**Pièces** : —\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure_J11_9.01#Historien": "**Position** : abstention\n**Pièces** : —\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure_J11_9.01#Pédagogue": "**Position** : abstention\n**Pièces** : —\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure_J11_9.01#Sociologue": "**Position** : abstention\n**Pièces** : —\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "gardien_support_J11_9.01": "**Constat** : neutre",
    "gardien_raisonnement_J11_9.01": "**Drapeau** : aucun"
   },
   "config": {
    "backend_tribunal": {
     "model": "fake-heavy",
     "model_mini": "fake-mini"
    },
    "parallel_jures": false
   },
   "verdict": "{\n  \"code\": \"9.01\",\n  \"nom\": \"Compétence fictive\",\n  \"dossier_vide\": false,\n  \"statut\": \"présence non établie\",\n  \"score_preuves\": 0,\n  \"score_indices\": 0,\n  \"confiance\": 0.8,\n  \"jury\": {\n    \"mode\": \"socle4+1\",\n    \"personas\": {\n      \"version\": \"personas-v1\",\n      \"empreinte\": \"1ec337d3a2ef\"\n    },\n    \"detections\": [],\n    \"contestations\": [],\n    \"abstentions\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\"\n    ],\n    \"second_tour\": false,\n    \"relance_par\": null,\n    \"composition\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\"\n    ],\n    \"positions_r1\": {\n      \"Linguiste\": \"abstention\",\n      \"Historien\": \"abstention\",\n      \"Pédagogue\": \"abstention\",\n      \"Sociologue\": \"abstention\"\n    },\n    \"positions_finales\": {\n      \"Linguiste\": \"abstention\",\n      \"Historien\": \"abstention\",\n      \"Pédagogue\": \"abstention\",\n      \"Sociologue\": \"abstention\"\n    },\n    \"pieges_nommes\": [],\n    \"consensus\": false,\n    \"dissidences\": []\n  },\n  \"traces_probantes\": [],\n  \"prescription\": {\n    \"pour_apprenant\": \"Ce dossier ne contient pas encore de pièce établie pour Compétence fictive.\",\n    \"pour_cartographe\": null\n  },\n  \"gardien\": {\n    \"support\": {\n      \"constat\": \"neutre\"\n    },\n    \"raisonnement\": {\n      \"drapeau\": false\n    }\n  },\n  \"motif_regle\": \"aucune détection survivante\",\n  \"dossier_cartographe\": null,\n  \"deliberation\": {\n    \"greffier_md\": \"# Greffier — 9.01 Compétence fictive\\n\\n### Pièces extraites\\n\\n#### Pièce 1\\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\\n- **Date** : 2026-03-10\\n- **Type** : trace concrète\\n\\n#### Pièce 2\\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\\n- **Date** : hier\\n- **Type** : déclaration étayée\\n\\n#### Pièce 3\\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\\n- **Type** : déclaration nue\\n\",\n    \"arene\": {\n      \"accusation_md\": \"# Accusation (cannée)\\n\\nP1 et P2 montrent des actes datés.\",\n      \"defense_md\": \"# Défense (cannée)\\n\\nLe dossier est étroit.\",\n      \"replique_md\": \"# Réplique (cannée)\\n\\nP1 tient, P3 tombe.\",\n      \"briefing_md\": \"# Briefing (canné)\\n\\nQuestion : P1 suffit-elle ?\"\n    },\n    \"jures\": {\n      \"Linguiste\": {\n        \"r1_md\": \"**Position** : abstention\\n**Pièces** : —\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Historien\": {\n        \"r1_md\": \"**Position** : abstention\\n**Pièces** : —\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Pédagogue\": {\n        \"r1_md\": \"**Position** : abstention\\n**Pièces** : —\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      },\n      \"Sociologue\": {\n        \"r1_md\": \"**Position** : abstention\\n**Pièces** : —\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"abstention\",\n        \"position_finale\": \"abstention\",\n        \"pieces\": [],\n        \"piege\": null\n      }\n    },\n    \"relance_md\": null,\n    \"relance_par\": null,\n    \"gardiens\": {\n      \"support_md\": \"**Constat** : neutre\",\n      \"raisonnement_md\": \"**Drapeau** : aucun\"\n    },\n    \"president_md\": null\n  },\n  \"etage\": \"tribunal\"\n}\n",
   "incidents": "{\n  \"president_recit_indisponible\": 1\n}\n",
   "files": "[\n  [\n    \"20-greffier.md\",\n    173326424956045\n  ],\n  [\n    \"21a-accusation.md\",\n    258104906274684\n  ],\n  [\n    \"21b-defense.md\",\n    48453579295968\n  ],\n  [\n    \"22a-replique.md\",\n    159130175615092\n  ],\n  [\n    \"22b-briefing.md\",\n    3628533866676\n  ],\n  [\n    \"23-historien.md\",\n    196774338184473\n  ],\n  [\n    \"23-linguiste.md\",\n    196774338184473\n  ],\n  [\n    \"23-pedagogue.md\",\n    196774338184473\n  ],\n  [\n    \"23-sociologue.md\",\n    196774338184473\n  ],\n  [\n    \"25a-gardien-support.md\",\n    144234867068446\n  ],\n  [\n    \"25b-gardien-raisonnement.md\",\n    203558780310487\n  ]\n]\n",
   "president_prompts": [
    "Statut calculé : présence non établie (aucune détection survivante)\nDétections : — | Contestations : — | Abstentions : Linguiste, Historien, Pédagogue, Sociologue\nSecond tour : non\nGardien du support : neutre — Gardien du raisonnement : aucun drapeau\nTraces ancrées : 0 (preuves 0, indices 0) — confiance 0.80"
   ]
  },
  "can7_etablie_president_sans_prescription": {
   "canned": {
    "accusation_J11_9.01": "# Accusation (cannée)\n\nP1 et P2 montrent des actes datés.",
    "defense_J11_9.01": "# Défense (cannée)\n\nLe dossier est étroit.",
    "replique_J11_9.01": "# Réplique (cannée)\n\nP1 tient, P3 tombe.",
    "briefing_J11_9.01": "# Briefing (canné)\n\nQuestion : P1 suffit-elle ?",
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\n- **Date** : hier\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n",
    "jure_J11_9.01#Linguiste": "**Position** : détection\n**Pièces** : P1, P2\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure_J11_9.01#Historien": "**Position** : détection\n**Pièces** : P1, P2\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure_J11_9.01#Pédagogue": "**Position** : détection\n**Pièces** : P1, P2\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "jure_J11_9.01#Sociologue": "**Position** : détection\n**Pièces** : P1, P2\n**Piège** : —\n\n## Raisonnement\n(canné)",
    "gardien_support_J11_9.01": "**Constat** : neutre",
    "gardien_raisonnement_J11_9.01": "**Drapeau** : aucun",
    "president_J11_9.01": "# Président (canné)\n\n```json\n{\"recit\": \"sans prescription\"}\n```"
   },
   "config": {
    "backend_tribunal": {
     "model": "fake-heavy",
     "model_mini": "fake-mini"
    },
    "parallel_jures": false
   },
   "verdict": "{\n  \"code\": \"9.01\",\n  \"nom\": \"Compétence fictive\",\n  \"dossier_vide\": false,\n  \"statut\": \"présence établie\",\n  \"score_preuves\": 1,\n  \"score_indices\": 1,\n  \"confiance\": 0.9,\n  \"jury\": {\n    \"mode\": \"socle4+1\",\n    \"personas\": {\n      \"version\": \"personas-v1\",\n      \"empreinte\": \"1ec337d3a2ef\"\n    },\n    \"detections\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\"\n    ],\n    \"contestations\": [],\n    \"abstentions\": [],\n    \"second_tour\": false,\n    \"relance_par\": null,\n    \"composition\": [\n      \"Linguiste\",\n      \"Historien\",\n      \"Pédagogue\",\n      \"Sociologue\"\n    ],\n    \"positions_r1\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"détection\",\n      \"Sociologue\": \"détection\"\n    },\n    \"positions_finales\": {\n      \"Linguiste\": \"détection\",\n      \"Historien\": \"détection\",\n      \"Pédagogue\": \"détection\",\n      \"Sociologue\": \"détection\"\n    },\n    \"pieges_nommes\": [],\n    \"consensus\": true,\n    \"dissidences\": []\n  },\n  \"traces_probantes\": [\n    {\n      \"piece\": 1,\n      \"extrait\": \"j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète\",\n      \"date\": \"2026-03-10\",\n      \"type\": \"trace_concrete\",\n      \"role\": \"preuve décisive\"\n    },\n    {\n      \"piece\": 2,\n      \"extrait\": \"nous avons refait ensemble la mesure devant toute l'équipe réunie\",\n      \"date\": \"2026-03-10\",\n      \"type\": \"declaration_etayee\",\n      \"role\": \"indice corroboratif\"\n    }\n  ],\n  \"prescription\": {\n    \"pour_apprenant\": \"Cette journée atteste Compétence fictive après contre-examen du tribunal. Pour consolider, une piste serait de documenter une nouvelle situation.\",\n    \"pour_cartographe\": null\n  },\n  \"gardien\": {\n    \"support\": {\n      \"constat\": \"neutre\"\n    },\n    \"raisonnement\": {\n      \"drapeau\": false\n    }\n  },\n  \"motif_regle\": \"détection(s) que personne ne conteste\",\n  \"dossier_cartographe\": null,\n  \"deliberation\": {\n    \"greffier_md\": \"# Greffier — 9.01 Compétence fictive\\n\\n### Pièces extraites\\n\\n#### Pièce 1\\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\\n- **Date** : 2026-03-10\\n- **Type** : trace concrète\\n\\n#### Pièce 2\\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\\n- **Date** : hier\\n- **Type** : déclaration étayée\\n\\n#### Pièce 3\\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\\n- **Type** : déclaration nue\\n\",\n    \"arene\": {\n      \"accusation_md\": \"# Accusation (cannée)\\n\\nP1 et P2 montrent des actes datés.\",\n      \"defense_md\": \"# Défense (cannée)\\n\\nLe dossier est étroit.\",\n      \"replique_md\": \"# Réplique (cannée)\\n\\nP1 tient, P3 tombe.\",\n      \"briefing_md\": \"# Briefing (canné)\\n\\nQuestion : P1 suffit-elle ?\"\n    },\n    \"jures\": {\n      \"Linguiste\": {\n        \"r1_md\": \"**Position** : détection\\n**Pièces** : P1, P2\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Historien\": {\n        \"r1_md\": \"**Position** : détection\\n**Pièces** : P1, P2\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Pédagogue\": {\n        \"r1_md\": \"**Position** : détection\\n**Pièces** : P1, P2\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      },\n      \"Sociologue\": {\n        \"r1_md\": \"**Position** : détection\\n**Pièces** : P1, P2\\n**Piège** : —\\n\\n## Raisonnement\\n(canné)\",\n        \"r2_md\": null,\n        \"position_r1\": \"détection\",\n        \"position_finale\": \"détection\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"piege\": null\n      }\n    },\n    \"relance_md\": null,\n    \"relance_par\": null,\n    \"gardiens\": {\n      \"support_md\": \"**Constat** : neutre\",\n      \"raisonnement_md\": \"**Drapeau** : aucun\"\n    },\n    \"president_md\": \"# Président (canné)\\n\\n```json\\n{\\\"recit\\\": \\\"sans prescription\\\"}\\n```\"\n  },\n  \"etage\": \"tribunal\"\n}\n",
   "incidents": "{\n  \"president_recit_indisponible\": 1\n}\n",
   "files": "[\n  [\n    \"20-greffier.md\",\n    173326424956045\n  ],\n  [\n    \"21a-accusation.md\",\n    258104906274684\n  ],\n  [\n    \"21b-defense.md\",\n    48453579295968\n  ],\n  [\n    \"22a-replique.md\",\n    159130175615092\n  ],\n  [\n    \"22b-briefing.md\",\n    3628533866676\n  ],\n  [\n    \"23-historien.md\",\n    78955625903734\n  ],\n  [\n    \"23-linguiste.md\",\n    78955625903734\n  ],\n  [\n    \"23-pedagogue.md\",\n    78955625903734\n  ],\n  [\n    \"23-sociologue.md\",\n    78955625903734\n  ],\n  [\n    \"24-president.md\",\n    188470947709716\n  ],\n  [\n    \"25a-gardien-support.md\",\n    144234867068446\n  ],\n  [\n    \"25b-gardien-raisonnement.md\",\n    203558780310487\n  ]\n]\n",
   "president_prompts": [
    "Statut calculé : présence établie (détection(s) que personne ne conteste)\nDétections : Linguiste, Historien, Pédagogue, Sociologue | Contestations : — | Abstentions : —\nSecond tour : non\nGardien du support : neutre — Gardien du raisonnement : aucun drapeau\nTraces ancrées : 2 (preuves 1, indices 1) — confiance 0.90"
   ]
  }
 },
 "t_can": "Aujourd'hui, j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète. Puis nous avons refait ensemble la mesure devant toute l'équipe réunie pour valider le protocole.\n",
 "faisceau_panne": {
  "suspicions": [
   {
    "journee": "J01",
    "extrait": "aucun texte correspondant ici, mais assez long",
    "source": "graine"
   }
  ],
  "verdict": "{\n  \"code\": \"9.01\",\n  \"nom\": \"Compétence fictive\",\n  \"dossier_vide\": false,\n  \"statut\": \"renvoi au cartographe\",\n  \"score_preuves\": \"R\",\n  \"score_indices\": \"R\",\n  \"confiance\": 0.0,\n  \"jury\": null,\n  \"traces_probantes\": [],\n  \"prescription\": {\n    \"pour_apprenant\": \"Ce dossier appelle un échange avec l'enseignant.\",\n    \"pour_cartographe\": \"Second ressort interrompu : panne simulée\"\n  },\n  \"gardien\": null,\n  \"dossier_cartographe\": null,\n  \"etage\": \"faisceau\"\n}\n",
  "incidents": "{\n  \"faisceau_echec_technique\": 1\n}\n",
  "files": "[]\n"
 }
}
;

/** Décode les entrées : {"__f__": x} → PyFloat (floats Python des entrées). */
function pyf(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(pyf);
  const keys = Object.keys(v);
  if (keys.length === 1 && keys[0] === "__f__") return new PyFloat(v.__f__);
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = pyf(x);
  return out;
}

/** Sérialisation write_json (l'oracle compare des octets). */
const dj = (obj) => pyJsonDumpsWriteJson(obj);

/** ctx minimal : artefacts mémoire + protocole synthétique (cf. générateur). */
function mkCtx(artefacts) {
  return {
    artefacts,
    protocole: (rel) => (rel === "lourd/24-president.md" ? "{$VERDICT_CALCULE}" : ""),
  };
}

/**
 * Backend canné du générateur Python : clé = label, ou label#jure pour les
 * tasks jure/jure2 ; enregistre les prompts du président ; toute clé absente
 * → « panne simulée » (RuntimeError côté Python, Error côté JS : même str(e)).
 */
function cannedBackend(canned, presPrompts) {
  return {
    call: async (prompt, { task = null, meta = null, label = null } = {}) => {
      if (task === "president") presPrompts.push(prompt);
      let key = label;
      if (task === "jure" || task === "jure2") {
        key = label + "#" + (meta && Object.prototype.hasOwnProperty.call(meta, "jure") ? meta.jure : "?");
      }
      if (Object.prototype.hasOwnProperty.call(canned, key)) return canned[key];
      throw new Error("panne simulée");
    },
  };
}

/** Relevé [nom, stable_hash(contenu)] des fichiers d'un tdir (tri points de code). */
function snapFiles(artefacts, tdir) {
  return artefacts.list(tdir).map((fn) => [fn, stableHash(artefacts.readText(tdir + "/" + fn))]);
}

describe("tribunal.infosPersonas — empreinte de la banque des 13 personas", () => {
  it("recalcule l'empreinte CPython vérifiée depuis les textes d'angle portés", () => {
    expect(dj(infosPersonas())).toBe(V.personas);
    expect(infosPersonas().empreinte).toBe(PERSONAS_EMPREINTE);
    expect(infosPersonas().version).toBe(PERSONAS_VERSION);
    expect(BANQUE_ANGLES.size).toBe(13);
    expect(JURES_SOCLE.map(([n]) => n)).toEqual(["Linguiste", "Historien", "Pédagogue", "Sociologue"]);
  });
});

describe("tribunal.composerJury — parité CPython (3 modes, surcharges, transversaux)", () => {
  it.each(V.composer.map((c) => [c.name, c]))("%s", (_name, c) => {
    const jury = composerJury(c.pole, pyf(c.config), {
      authenticite: c.authenticite,
      faisceau: c.faisceau,
      code: c.code,
      contexte: c.contexte,
    });
    expect(dj(jury.map(([n]) => n))).toBe(c.out);
    for (const [n, angle] of jury) expect(angle).toBe(BANQUE_ANGLES.get(n));
  });
});

describe("tribunal.parsePosition — parité CPython", () => {
  it("positions, pièces triées, pièges (troncature 200)", () => {
    for (const c of V.parse_position) expect(dj(parsePosition(c.texte))).toBe(c.out);
  });
});

describe("tribunal.parsePieces — parité CPython", () => {
  it("blocs #### Pièce, extraits « » ou ligne, troncature 600 après strip", () => {
    for (const c of V.parse_pieces) expect(dj(parsePieces(c.texte))).toBe(c.out);
  });
});

describe("tribunal.typeRole / gardiens — parité CPython", () => {
  it("_type_role (slug + mots-clés)", () => {
    for (const c of V.type_role) expect(dj(typeRole(c.texte))).toBe(c.out);
  });
  it("_parse_gardien_support (gonfle/masque/neutre)", () => {
    for (const c of V.gardien_support) expect(dj(parseGardienSupport(c.texte))).toBe(c.out);
  });
  it("_parse_gardien_raisonnement (vice booléen)", () => {
    for (const c of V.gardien_raisonnement) expect(dj(parseGardienRaisonnement(c.texte))).toBe(c.out);
  });
});

describe("tribunal.resoudre — les 5 règles, dans l'ordre", () => {
  it.each(V.resoudre.map((c) => [c.name, c]))("%s", (_name, c) => {
    expect(dj(resoudre(JURES_SOCLE, c.finaux, c.support, c.drapeau))).toBe(c.out);
  });
});

describe("tribunal.calculerConfiance — round(x, 3) half-even CPython", () => {
  it("grille complète (établie / non établie / renvoi)", () => {
    for (const c of V.confiance) {
      expect(dj(calculerConfiance(c.args[0], c.args[1], c.args[2], c.args[3], c.args[4]))).toBe(c.out);
    }
  });
});

describe("tribunal.verdictDossierVide — parité CPython", () => {
  it("objet exact (ordre des clés, confiance 0.9 float)", () => {
    expect(dj(verdictDossierVide("9.01", "Compétence fictive", "# Greffier\n\nDOSSIER VIDE"))).toBe(V.dossier_vide);
  });
});

// ── juger : procès complets en mock (dossiers extraits de l'oracle CPython) ──
describe("tribunal.juger — procès complets MockBackend (parité CPython)", () => {
  /** Exécute un run mock figé et vérifie verdict + incidents + caches. */
  async function runMock(r, artefacts, backend) {
    const ctx = mkCtx(artefacts);
    const pole = { num: r.pole_num, nom: "Pôle " + r.pole_num + " (test)" };
    const comp = { code: r.code, nom: "Compétence " + r.code, fiche_md: V.fiche };
    const sentences = r.sentences_vides
      ? []
      : sentencesDe(r.sentences_texte !== null && r.sentences_texte !== undefined ? r.sentences_texte : r.jr.texte, r.jr.id);
    /** @type {Record<string, number>} */
    const incidents = {};
    const tdir = "trib/" + r.code;
    const verdict = await juger(backend, ctx, tdir, pole, comp, r.jr, pyf(r.config), sentences, incidents, {
      premiereImpression: r.premiere_impression,
      rapide: null,
      calques: r.calques,
      authenticite: r.authenticite,
    });
    return { verdict, incidents, tdir };
  }

  it.each(Object.entries(V.mock_runs))("%s", async (_name, r) => {
    const artefacts = memArtefacts();
    const backend = new MockBackend({ salt: V.salt, model: "mock-heavy" });
    const { verdict, incidents, tdir } = await runMock(r, artefacts, backend);
    expect(dj(verdict)).toBe(r.verdict);
    expect(dj(incidents)).toBe(r.incidents);
    expect(dj(snapFiles(artefacts, tdir))).toBe(r.files);
  });

  it("reprise : caches relus, ZÉRO appel backend, verdict bit-identique", async () => {
    const r = V.mock_runs.m1_h8_produite;
    const artefacts = memArtefacts();
    await runMock(r, artefacts, new MockBackend({ salt: V.salt, model: "mock-heavy" }));
    // second passage : un backend qui explose au moindre appel — la reprise
    // doit tout relire du cache (sinon verdict de panne ≠ attendu)
    const enPanne = {
      call: async () => {
        throw new Error("ne doit pas être appelé (reprise)");
      },
    };
    const { verdict, incidents } = await runMock(r, artefacts, enPanne);
    expect(dj(verdict)).toBe(r.verdict);
    expect(dj(incidents)).toBe(r.incidents);
  });
});

// ── jugerFaisceau : second ressort (dossier mécanique, Portraitiste) ─────────
describe("tribunal.jugerFaisceau — parité CPython", () => {
  it.each(Object.entries(V.faisceau_runs))("%s", async (_name, r) => {
    const artefacts = memArtefacts();
    const ctx = mkCtx(artefacts);
    const backend = new MockBackend({ salt: V.salt, model: "mock-heavy" });
    const pole = { num: r.pole_num, nom: "Pôle " + r.pole_num + " (test)" };
    const comp = { code: r.code, nom: "Compétence " + r.code, fiche_md: V.fiche };
    // Map OBLIGATOIRE : l'ordre d'insertion de textes_par_journee est contractuel
    const textes = new Map([
      ["J01", V.texte],
      ["J02", V.texte_alt],
    ]);
    /** @type {Record<string, number>} */
    const incidents = {};
    const tdir = "sr/" + r.code;
    const verdict = await jugerFaisceau(backend, ctx, tdir, pole, comp, pyf(r.suspicions), r.periode, pyf(r.config), incidents, textes, { rapide: null });
    expect(dj(verdict)).toBe(r.verdict);
    expect(dj(incidents)).toBe(r.incidents);
    expect(dj(snapFiles(artefacts, tdir))).toBe(r.files);
  });

  it("panne à l'accusation → verdict de panne (etage faisceau)", async () => {
    const r = V.faisceau_panne;
    const artefacts = memArtefacts();
    const ctx = mkCtx(artefacts);
    /** @type {string[]} */
    const presPrompts = [];
    const backend = cannedBackend({}, presPrompts);
    /** @type {Record<string, number>} */
    const incidents = {};
    const verdict = await jugerFaisceau(
      backend,
      ctx,
      "sr/9.01",
      { num: 9, nom: "Pôle 9 (test)" },
      { code: "9.01", nom: "Compétence fictive", fiche_md: V.fiche },
      pyf(r.suspicions),
      "2026-03 → 2026-05",
      { backend_tribunal: { model: "fake-heavy" }, parallel_jures: false },
      incidents,
      new Map([["J01", V.t_can]]),
      { rapide: null },
    );
    expect(dj(verdict)).toBe(r.verdict);
    expect(dj(incidents)).toBe(r.incidents);
    expect(dj(snapFiles(artefacts, "sr/9.01"))).toBe(r.files);
  });
});

// ── juger : chemins fins sur backend canné (illisible, gonfle, drapeau,
// non-ancrable, panne, prescriptions par défaut, prompt VERDICT_CALCULE) ─────
describe("tribunal.juger — table de vérité sur backend canné (parité CPython)", () => {
  it.each(Object.entries(V.canned))("%s", async (_name, r) => {
    const artefacts = memArtefacts();
    const ctx = mkCtx(artefacts);
    /** @type {string[]} */
    const presPrompts = [];
    const backend = cannedBackend(r.canned, presPrompts);
    const pole = { num: 9, nom: "Pôle 9 (test)" };
    const comp = { code: "9.01", nom: "Compétence fictive", fiche_md: V.fiche };
    const jr = { id: "J11", date: "2026-03-10", texte: V.t_can };
    const sentences = sentencesDe(V.t_can, "J11");
    /** @type {Record<string, number>} */
    const incidents = {};
    const tdir = "trib/9.01";
    const verdict = await juger(backend, ctx, tdir, pole, comp, jr, pyf(r.config), sentences, incidents, {});
    expect(dj(verdict)).toBe(r.verdict);
    expect(dj(incidents)).toBe(r.incidents);
    expect(dj(snapFiles(artefacts, tdir))).toBe(r.files);
    // le prompt du président == VERDICT_CALCULE (gabarit synthétique) — la
    // chaîne %.2f half-even est verrouillée à l'octet contre CPython
    expect(presPrompts).toEqual(r.president_prompts);
  });
});
