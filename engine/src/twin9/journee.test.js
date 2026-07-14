// Tests de parité bit-à-bit de journee.js contre aurora/journee.py (CPython).
// Vecteurs générés UNE FOIS via python3 (scratchpad/gen_journee_vectors.py)
// puis FIGÉS ci-dessous — les tests n'exécutent jamais Python. Côté Python le
// non-déterminisme a été neutralisé exactement comme le contrat le prescrit
// (spec-journee §7.9) : as_completed → ordre de soumission (≡ séquentiel JS),
// datetime.now() → horodatage fixe, base_dir → "BASE".
// Chaque sortie attendue est la chaîne json.dumps(obj, ensure_ascii=False,
// indent=2) + "\n" de CPython : comparaison sur les OCTETS sérialisés.

import { describe, expect, it } from "vitest";

import { memArtefacts, memCalquesStore } from "./artefacts.js";
import { MockBackend } from "./backends.js";
import { segments } from "./heatmap.js";
import {
  SEUILS_CONSENSUS,
  authenticiteDe,
  blocCalques,
  cartographierJournee,
  consensus,
  empreinteJournee,
  jugerLeger,
  parseLeger,
  sentencesDe,
  suspicion,
  verdictAbsent,
} from "./journee.js";
import { Pole } from "./referentiel.js";
import { PyFloat, pyJsonDumpsWriteJson } from "./py/pyJson.js";

const V = {
 "sentences": [
  {
   "texte": "# Titre ignoré même long : cette ligne commence par un croisillon et doit être sautée.\nLigne courte.\nCette première phrase dépasse soixante caractères pour être retenue par le découpage. Celle-ci aussi dépasse le seuil des soixante caractères, avec une exclamation ! Trop courte après découpe.\nUne ligne assez longue pour passer le seuil mais dont la seconde phrase est minuscule. Oui.\n",
   "jid": "J01",
   "out": "[\n  [\n    \"J01\",\n    \"Cette première phrase dépasse soixante caractères pour être retenue par le découpage.\"\n  ],\n  [\n    \"J01\",\n    \"Celle-ci aussi dépasse le seuil des soixante caractères, avec une exclamation !\"\n  ],\n  [\n    \"J01\",\n    \"Une ligne assez longue pour passer le seuil mais dont la seconde phrase est minuscule.\"\n  ]\n]\n"
  },
  {
   "texte": "Phrase unique de plus de soixante caractères, terminée par un point d'interrogation ?\nxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx. Cette phrase suit la phrase trop longue et dépasse elle aussi les soixante caractères.\n",
   "jid": "J02",
   "out": "[\n  [\n    \"J02\",\n    \"Phrase unique de plus de soixante caractères, terminée par un point d'interrogation ?\"\n  ],\n  [\n    \"J02\",\n    \"Cette phrase suit la phrase trop longue et dépasse elle aussi les soixante caractères.\"\n  ]\n]\n"
  },
  {
   "texte": "",
   "jid": "J03",
   "out": "[]\n"
  }
 ],
 "parse_leger": [
  {
   "texte": "**Statut** : Présence établie\n**Pièces retenues** : P1, P2\n**Confiance** : 0.8",
   "out": "{\n  \"statut\": \"présence établie\",\n  \"pieces\": [\n    1,\n    2\n  ],\n  \"conf\": 0.8\n}\n"
  },
  {
   "texte": "** statut ** : présence NON établie\n**Pièces examinées puis écartées** : P2, P 7, P10\n**Confiance** : 0,35",
   "out": "{\n  \"statut\": \"présence non établie\",\n  \"pieces\": [\n    2,\n    7,\n    10\n  ],\n  \"conf\": 0.35\n}\n"
  },
  {
   "texte": "**Statut** : renvoi au cartographe (doute)\n**Confiance** : 1",
   "out": "{\n  \"statut\": \"renvoi au cartographe\",\n  \"pieces\": [],\n  \"conf\": 1.0\n}\n"
  },
  {
   "texte": "**Statut**: presence etablie\n**Pieces** : rien\n**Confiance** : 0.99",
   "out": "{\n  \"statut\": \"présence établie\",\n  \"pieces\": [],\n  \"conf\": 0.99\n}\n"
  },
  {
   "texte": "**Statut** : non etablie, faute de pièces",
   "out": "{\n  \"statut\": \"présence non établie\",\n  \"pieces\": [],\n  \"conf\": 0.5\n}\n"
  },
  {
   "texte": "aucune balise exploitable",
   "out": "{\n  \"statut\": null,\n  \"pieces\": [],\n  \"conf\": 0.5\n}\n"
  },
  {
   "texte": "**Statut** : établie\n**Pièces** : P3\n**Confiance** : 2.5",
   "out": "{\n  \"statut\": \"présence établie\",\n  \"pieces\": [\n    3\n  ],\n  \"conf\": 0.5\n}\n"
  },
  {
   "texte": "",
   "out": "{\n  \"statut\": null,\n  \"pieces\": [],\n  \"conf\": 0.5\n}\n"
  }
 ],
 "authenticite": [
  {
   "texte": "## Authenticité\n**Indicateur** : `habitée`\n",
   "out": "\"habitée\"\n"
  },
  {
   "texte": "**INDICATEUR** : Mixte —",
   "out": "\"mixte\"\n"
  },
  {
   "texte": "** Indicateur ** :   produite",
   "out": "\"produite\"\n"
  },
  {
   "texte": "**Indicateur** : inconnue",
   "out": "null\n"
  },
  {
   "texte": "",
   "out": "null\n"
  },
  {
   "texte": null,
   "out": "null\n"
  }
 ],
 "suspicion": [
  {
   "args": [
    "1.01",
    "Analyse critique",
    "sous-seuil",
    "extrait bref",
    "alpha @0.25"
   ],
   "out": "{\n  \"code\": \"1.01\",\n  \"nom\": \"Analyse critique\",\n  \"journee\": \"J01\",\n  \"date\": \"2026-03-10\",\n  \"source\": \"sous-seuil\",\n  \"detail\": \"alpha @0.25\",\n  \"extrait\": \"extrait bref\",\n  \"question\": \"Un lecteur a cru voir Analyse critique ici, sans certitude — as-tu remarqué ce passage ?\"\n}\n"
  },
  {
   "args": [
    "1.01",
    "Analyse critique",
    "minoritaire",
    "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "beta"
   ],
   "out": "{\n  \"code\": \"1.01\",\n  \"nom\": \"Analyse critique\",\n  \"journee\": \"J01\",\n  \"date\": \"2026-03-10\",\n  \"source\": \"minoritaire\",\n  \"detail\": \"beta\",\n  \"extrait\": \"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\",\n  \"question\": \"As-tu remarqué que cette journée revient sur ceci ?\"\n}\n"
  },
  {
   "args": [
    "1.03",
    "Synthèse écrite",
    "leger-ecarte",
    "",
    null
   ],
   "out": "{\n  \"code\": \"1.03\",\n  \"nom\": \"Synthèse écrite\",\n  \"journee\": \"J01\",\n  \"date\": \"2026-03-10\",\n  \"source\": \"leger-ecarte\",\n  \"detail\": null,\n  \"extrait\": null,\n  \"question\": \"Trois lectures rapides ont examiné ceci sans le retenir — le fil reste ouvert.\"\n}\n"
  },
  {
   "args": [
    "1.03",
    "Synthèse écrite",
    "contre-lecture",
    null,
    "motif du contre-examen"
   ],
   "out": "{\n  \"code\": \"1.03\",\n  \"nom\": \"Synthèse écrite\",\n  \"journee\": \"J01\",\n  \"date\": \"2026-03-10\",\n  \"source\": \"contre-lecture\",\n  \"detail\": \"motif du contre-examen\",\n  \"extrait\": null,\n  \"question\": \"La convergence n'a pas résisté au contre-examen — qu'en dis-tu ?\"\n}\n"
  },
  {
   "args": [
    "4.03",
    "Discernement éthique",
    "contestation-jury",
    null,
    "Linguiste — piège : récit performatif"
   ],
   "out": "{\n  \"code\": \"4.03\",\n  \"nom\": \"Discernement éthique\",\n  \"journee\": \"J01\",\n  \"date\": \"2026-03-10\",\n  \"source\": \"contestation-jury\",\n  \"detail\": \"Linguiste — piège : récit performatif\",\n  \"extrait\": null,\n  \"question\": \"Un juré y a vu un piège — la trace mérite un échange.\"\n}\n"
  },
  {
   "args": [
    "4.03",
    "Discernement éthique",
    "detection-jury",
    "citation",
    "Historien"
   ],
   "out": "{\n  \"code\": \"4.03\",\n  \"nom\": \"Discernement éthique\",\n  \"journee\": \"J01\",\n  \"date\": \"2026-03-10\",\n  \"source\": \"detection-jury\",\n  \"detail\": \"Historien\",\n  \"extrait\": \"citation\",\n  \"question\": \"Un juré y a vu quelque chose que les autres n'ont pas confirmé.\"\n}\n"
  },
  {
   "args": [
    "4.04",
    "Jugement suspendu",
    "renvoi",
    "citation renvoi",
    "motif renvoi"
   ],
   "out": "{\n  \"code\": \"4.04\",\n  \"nom\": \"Jugement suspendu\",\n  \"journee\": \"J01\",\n  \"date\": \"2026-03-10\",\n  \"source\": \"renvoi\",\n  \"detail\": \"motif renvoi\",\n  \"extrait\": \"citation renvoi\",\n  \"question\": \"Le tribunal n'a pas tranché — dossier préparé pour l'enseignant.\"\n}\n"
  },
  {
   "args": [
    "4.04",
    "Jugement suspendu",
    "support-masque",
    null,
    null
   ],
   "out": "{\n  \"code\": \"4.04\",\n  \"nom\": \"Jugement suspendu\",\n  \"journee\": \"J01\",\n  \"date\": \"2026-03-10\",\n  \"source\": \"support-masque\",\n  \"detail\": null,\n  \"extrait\": null,\n  \"question\": \"Le format écrit masque peut-être cette compétence — à chercher autrement.\"\n}\n"
  },
  {
   "args": [
    "4.07",
    "Débat contradictoire",
    "scan-global",
    "extrait scan",
    null
   ],
   "out": "{\n  \"code\": \"4.07\",\n  \"nom\": \"Débat contradictoire\",\n  \"journee\": \"J01\",\n  \"date\": \"2026-03-10\",\n  \"source\": \"scan-global\",\n  \"detail\": null,\n  \"extrait\": \"extrait scan\",\n  \"question\": \"La lecture du portfolio entier a relié ceci que le découpage en journées avait dispersé — qu'en dis-tu ?\"\n}\n"
  },
  {
   "args": [
    "4.07",
    "Débat contradictoire",
    "source-inconnue",
    "extrait",
    "detail"
   ],
   "out": "{\n  \"code\": \"4.07\",\n  \"nom\": \"Débat contradictoire\",\n  \"journee\": \"J01\",\n  \"date\": \"2026-03-10\",\n  \"source\": \"source-inconnue\",\n  \"detail\": \"detail\",\n  \"extrait\": \"extrait\",\n  \"question\": \"Signal conservé pour le temps long.\"\n}\n"
  }
 ],
 "verdict_absent": [
  {
   "code": "1.06",
   "nom": "Mémoire de travail",
   "cons": {
    "statut": "non détectée",
    "ratio": {
     "__f__": 0.0
    },
    "modeles": [],
    "spans": []
   },
   "out": "{\n  \"code\": \"1.06\",\n  \"nom\": \"Mémoire de travail\",\n  \"dossier_vide\": true,\n  \"statut\": \"présence non établie\",\n  \"score_preuves\": 0,\n  \"score_indices\": 0,\n  \"confiance\": 1.0,\n  \"jury\": null,\n  \"traces_probantes\": [],\n  \"prescription\": {\n    \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Mémoire de travail.\",\n    \"pour_cartographe\": null\n  },\n  \"gardien\": null,\n  \"etage\": \"non-détectée\"\n}\n"
  },
  {
   "code": "1.07",
   "nom": "Vérification des sources",
   "cons": {
    "statut": "minoritaire",
    "ratio": {
     "__f__": 0.333
    },
    "modeles": [
     "gamma#2"
    ],
    "spans": [
     {
      "start": 3,
      "end": 9,
      "model": "gamma#2",
      "conf": {
       "__f__": 0.55
      }
     }
    ]
   },
   "out": "{\n  \"code\": \"1.07\",\n  \"nom\": \"Vérification des sources\",\n  \"dossier_vide\": false,\n  \"statut\": \"présence non établie\",\n  \"score_preuves\": 0,\n  \"score_indices\": 0,\n  \"confiance\": 0.667,\n  \"jury\": null,\n  \"traces_probantes\": [],\n  \"prescription\": {\n    \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Vérification des sources.\",\n    \"pour_cartographe\": \"Détection minoritaire (gamma#2) — versée au registre des graines.\"\n  },\n  \"gardien\": null,\n  \"etage\": \"minoritaire\"\n}\n"
  }
 ],
 "bloc_calques": {
  "texte": "<PORTFOLIO># Journal du four solaire\n\nL'élève a présenté son « prototype » devant la classe entière du matin, puis il a noté chaque retour dans son carnet de bord.\nAprès la pause, l'équipe a mesuré l'angle des miroirs avec un rapporteur artisanal fabriqué la veille.\nLe soir venu, chacun a rédigé une synthèse honnête des erreurs commises et des corrections prévues.\n\nCe long paragraphe décrit minutieusement la construction du four solaire : étape 1, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 2, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 3, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 4, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 5, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 6, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 7, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 8, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 9, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 10, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 11, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 12, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 13, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 14, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; enfin, la calibration complète a duré toute la matinée.\n</PORTFOLIO>yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
  "c": {
   "spans": [
    {
     "start": 0,
     "end": 300,
     "model": "alpha",
     "conf": {
      "__f__": 0.9
     }
    },
    {
     "start": 0,
     "end": 300,
     "model": "alpha",
     "conf": {
      "__f__": 0.9
     }
    },
    {
     "start": 5,
     "end": 60,
     "model": "beta",
     "conf": {
      "__f__": 0.4
     }
    }
   ],
   "sous_seuil": [
    {
     "start": 0,
     "end": 30,
     "model": "m0",
     "conf": {
      "__f__": 0.2
     }
    },
    {
     "start": 10,
     "end": 40,
     "model": "m1",
     "conf": {
      "__f__": 0.2
     }
    },
    {
     "start": 20,
     "end": 50,
     "model": "m2",
     "conf": {
      "__f__": 0.2
     }
    },
    {
     "start": 30,
     "end": 60,
     "model": "m3",
     "conf": {
      "__f__": 0.2
     }
    },
    {
     "start": 40,
     "end": 70,
     "model": "m4",
     "conf": {
      "__f__": 0.2
     }
    },
    {
     "start": 50,
     "end": 80,
     "model": "m5",
     "conf": {
      "__f__": 0.2
     }
    },
    {
     "start": 60,
     "end": 90,
     "model": "m6",
     "conf": {
      "__f__": 0.2
     }
    },
    {
     "start": 70,
     "end": 100,
     "model": "m7",
     "conf": {
      "__f__": 0.2
     }
    },
    {
     "start": 80,
     "end": 110,
     "model": "m8",
     "conf": {
      "__f__": 0.2
     }
    },
    {
     "start": 90,
     "end": 120,
     "model": "m9",
     "conf": {
      "__f__": 0.2
     }
    },
    {
     "start": 100,
     "end": 130,
     "model": "m10",
     "conf": {
      "__f__": 0.2
     }
    },
    {
     "start": 110,
     "end": 140,
     "model": "m11",
     "conf": {
      "__f__": 0.2
     }
    }
   ]
  },
  "out": "- « ‹PORTFOLIO›# Journal du four solaire\n\nL'élève a présenté son « prototype » devant la classe entière du matin, puis il a noté chaque retour dans son carnet de bord.\nAprès la pause, l'équipe a mesuré l'angle des miroirs avec un rapporteur art » — calque alpha, confiance 0.90\n- « FOLIO># Journal du four solaire\n\nL'élève a présenté son » — calque beta, confiance 0.40\n- « ‹PORTFOLIO›# Journal du four s » — calque m0, confiance 0.20\n- « ># Journal du four solaire\n\nL' » — calque m1, confiance 0.20\n- «  du four solaire\n\nL'élève a pr » — calque m2, confiance 0.20\n- « olaire\n\nL'élève a présenté son » — calque m3, confiance 0.20\n- « élève a présenté son « prototy » — calque m4, confiance 0.20\n- « ésenté son « prototype » devan » — calque m5, confiance 0.20\n- «  « prototype » devant la class » — calque m6, confiance 0.20\n- « pe » devant la classe entière  » — calque m7, confiance 0.20"
 },
 "consensus": {
  "spans": [
   {
    "start": 0,
    "end": 50,
    "model": "alpha",
    "code": "1.01",
    "conf": {
     "__f__": 0.9
    },
    "poids": {
     "__f__": 1.0
    }
   },
   {
    "start": 10,
    "end": 40,
    "model": "beta",
    "code": "1.01",
    "conf": {
     "__f__": 0.7
    },
    "poids": {
     "__f__": 1.0
    }
   },
   {
    "start": 100,
    "end": 140,
    "model": "alpha",
    "code": "1.03",
    "conf": {
     "__f__": 0.5
    },
    "poids": {
     "__f__": 1.0
    }
   },
   {
    "start": 200,
    "end": 240,
    "model": "gamma",
    "code": "1.03",
    "conf": {
     "__f__": 0.45
    },
    "poids": {
     "__f__": 2.0
    }
   },
   {
    "start": 300,
    "end": 320,
    "model": "beta",
    "code": "1.04",
    "conf": {
     "__f__": 0.3
    },
    "poids": {
     "__f__": 1.0
    }
   },
   {
    "start": 400,
    "end": 450,
    "model": "gamma",
    "code": "1.07",
    "conf": {
     "__f__": 0.8
    },
    "poids": {
     "__f__": 2.0
    }
   },
   {
    "start": 460,
    "end": 470,
    "model": "alpha",
    "code": "1.07",
    "conf": {
     "__f__": 0.1
    },
    "poids": {
     "__f__": 1.0
    }
   }
  ],
  "poids_total": {
   "__f__": 4.0
  },
  "roster1": [
   {
    "name": "alpha",
    "family": "A",
    "weight": {
     "__f__": 1.0
    }
   },
   {
    "name": "beta",
    "family": "B"
   },
   {
    "name": "gamma",
    "family": "A",
    "weight": {
     "__f__": 2.0
    }
   }
  ],
  "roster2": [
   {
    "name": "alpha",
    "family": "X"
   },
   {
    "name": "beta",
    "family": "X"
   },
   {
    "name": "gamma",
    "family": "X"
   }
  ],
  "segs": "[\n  {\n    \"start\": 0,\n    \"end\": 10,\n    \"heat\": 0.225,\n    \"models\": [\n      \"alpha\"\n    ],\n    \"comps\": [\n      \"1.01\"\n    ],\n    \"conf_moyenne\": 0.9,\n    \"details\": [\n      {\n        \"model\": \"alpha\",\n        \"code\": \"1.01\",\n        \"conf\": 0.9\n      }\n    ]\n  },\n  {\n    \"start\": 10,\n    \"end\": 40,\n    \"heat\": 0.4,\n    \"models\": [\n      \"alpha\",\n      \"beta\"\n    ],\n    \"comps\": [\n      \"1.01\"\n    ],\n    \"conf_moyenne\": 0.8,\n    \"details\": [\n      {\n        \"model\": \"alpha\",\n        \"code\": \"1.01\",\n        \"conf\": 0.9\n      },\n      {\n        \"model\": \"beta\",\n        \"code\": \"1.01\",\n        \"conf\": 0.7\n      }\n    ]\n  },\n  {\n    \"start\": 40,\n    \"end\": 50,\n    \"heat\": 0.225,\n    \"models\": [\n      \"alpha\"\n    ],\n    \"comps\": [\n      \"1.01\"\n    ],\n    \"conf_moyenne\": 0.9,\n    \"details\": [\n      {\n        \"model\": \"alpha\",\n        \"code\": \"1.01\",\n        \"conf\": 0.9\n      }\n    ]\n  },\n  {\n    \"start\": 100,\n    \"end\": 140,\n    \"heat\": 0.125,\n    \"models\": [\n      \"alpha\"\n    ],\n    \"comps\": [\n      \"1.03\"\n    ],\n    \"conf_moyenne\": 0.5,\n    \"details\": [\n      {\n        \"model\": \"alpha\",\n        \"code\": \"1.03\",\n        \"conf\": 0.5\n      }\n    ]\n  },\n  {\n    \"start\": 200,\n    \"end\": 240,\n    \"heat\": 0.225,\n    \"models\": [\n      \"gamma\"\n    ],\n    \"comps\": [\n      \"1.03\"\n    ],\n    \"conf_moyenne\": 0.45,\n    \"details\": [\n      {\n        \"model\": \"gamma\",\n        \"code\": \"1.03\",\n        \"conf\": 0.45\n      }\n    ]\n  },\n  {\n    \"start\": 300,\n    \"end\": 320,\n    \"heat\": 0.075,\n    \"models\": [\n      \"beta\"\n    ],\n    \"comps\": [\n      \"1.04\"\n    ],\n    \"conf_moyenne\": 0.3,\n    \"details\": [\n      {\n        \"model\": \"beta\",\n        \"code\": \"1.04\",\n        \"conf\": 0.3\n      }\n    ]\n  },\n  {\n    \"start\": 400,\n    \"end\": 450,\n    \"heat\": 0.4,\n    \"models\": [\n      \"gamma\"\n    ],\n    \"comps\": [\n      \"1.07\"\n    ],\n    \"conf_moyenne\": 0.8,\n    \"details\": [\n      {\n        \"model\": \"gamma\",\n        \"code\": \"1.07\",\n        \"conf\": 0.8\n      }\n    ]\n  },\n  {\n    \"start\": 460,\n    \"end\": 470,\n    \"heat\": 0.025,\n    \"models\": [\n      \"alpha\"\n    ],\n    \"comps\": [\n      \"1.07\"\n    ],\n    \"conf_moyenne\": 0.1,\n    \"details\": [\n      {\n        \"model\": \"alpha\",\n        \"code\": \"1.07\",\n        \"conf\": 0.1\n      }\n    ]\n  }\n]\n",
  "out1": "{\n  \"1.01\": {\n    \"statut\": \"corroborée\",\n    \"ratio\": 0.667,\n    \"modeles\": [\n      \"alpha\",\n      \"beta\"\n    ],\n    \"familles\": [\n      \"A\",\n      \"B\"\n    ],\n    \"span_partage\": true,\n    \"spans\": [\n      {\n        \"start\": 0,\n        \"end\": 50,\n        \"model\": \"alpha\",\n        \"code\": \"1.01\",\n        \"conf\": 0.9,\n        \"poids\": 1.0\n      },\n      {\n        \"start\": 10,\n        \"end\": 40,\n        \"model\": \"beta\",\n        \"code\": \"1.01\",\n        \"conf\": 0.7,\n        \"poids\": 1.0\n      }\n    ],\n    \"sous_seuil\": []\n  },\n  \"1.03\": {\n    \"statut\": \"à instruire\",\n    \"ratio\": 0.667,\n    \"modeles\": [\n      \"alpha\",\n      \"gamma\"\n    ],\n    \"familles\": [\n      \"A\"\n    ],\n    \"span_partage\": false,\n    \"spans\": [\n      {\n        \"start\": 100,\n        \"end\": 140,\n        \"model\": \"alpha\",\n        \"code\": \"1.03\",\n        \"conf\": 0.5,\n        \"poids\": 1.0\n      },\n      {\n        \"start\": 200,\n        \"end\": 240,\n        \"model\": \"gamma\",\n        \"code\": \"1.03\",\n        \"conf\": 0.45,\n        \"poids\": 2.0\n      }\n    ],\n    \"sous_seuil\": []\n  },\n  \"1.04\": {\n    \"statut\": \"non détectée\",\n    \"ratio\": 0.0,\n    \"modeles\": [],\n    \"familles\": [],\n    \"span_partage\": false,\n    \"spans\": [],\n    \"sous_seuil\": [\n      {\n        \"start\": 300,\n        \"end\": 320,\n        \"model\": \"beta\",\n        \"code\": \"1.04\",\n        \"conf\": 0.3,\n        \"poids\": 1.0\n      }\n    ]\n  },\n  \"1.07\": {\n    \"statut\": \"minoritaire\",\n    \"ratio\": 0.333,\n    \"modeles\": [\n      \"gamma\"\n    ],\n    \"familles\": [\n      \"A\"\n    ],\n    \"span_partage\": false,\n    \"spans\": [\n      {\n        \"start\": 400,\n        \"end\": 450,\n        \"model\": \"gamma\",\n        \"code\": \"1.07\",\n        \"conf\": 0.8,\n        \"poids\": 2.0\n      }\n    ],\n    \"sous_seuil\": []\n  }\n}\n",
  "out2": "{\n  \"1.01\": {\n    \"statut\": \"corroborée\",\n    \"ratio\": 0.667,\n    \"modeles\": [\n      \"alpha\",\n      \"beta\"\n    ],\n    \"familles\": [\n      \"X\"\n    ],\n    \"span_partage\": true,\n    \"spans\": [\n      {\n        \"start\": 0,\n        \"end\": 50,\n        \"model\": \"alpha\",\n        \"code\": \"1.01\",\n        \"conf\": 0.9,\n        \"poids\": 1.0\n      },\n      {\n        \"start\": 10,\n        \"end\": 40,\n        \"model\": \"beta\",\n        \"code\": \"1.01\",\n        \"conf\": 0.7,\n        \"poids\": 1.0\n      }\n    ],\n    \"sous_seuil\": []\n  },\n  \"1.03\": {\n    \"statut\": \"à instruire\",\n    \"ratio\": 0.667,\n    \"modeles\": [\n      \"alpha\",\n      \"gamma\"\n    ],\n    \"familles\": [\n      \"X\"\n    ],\n    \"span_partage\": false,\n    \"spans\": [\n      {\n        \"start\": 100,\n        \"end\": 140,\n        \"model\": \"alpha\",\n        \"code\": \"1.03\",\n        \"conf\": 0.5,\n        \"poids\": 1.0\n      },\n      {\n        \"start\": 200,\n        \"end\": 240,\n        \"model\": \"gamma\",\n        \"code\": \"1.03\",\n        \"conf\": 0.45,\n        \"poids\": 2.0\n      }\n    ],\n    \"sous_seuil\": []\n  },\n  \"1.04\": {\n    \"statut\": \"non détectée\",\n    \"ratio\": 0.0,\n    \"modeles\": [],\n    \"familles\": [],\n    \"span_partage\": false,\n    \"spans\": [],\n    \"sous_seuil\": [\n      {\n        \"start\": 300,\n        \"end\": 320,\n        \"model\": \"beta\",\n        \"code\": \"1.04\",\n        \"conf\": 0.3,\n        \"poids\": 1.0\n      }\n    ]\n  },\n  \"1.07\": {\n    \"statut\": \"minoritaire\",\n    \"ratio\": 0.333,\n    \"modeles\": [\n      \"gamma\"\n    ],\n    \"familles\": [\n      \"X\"\n    ],\n    \"span_partage\": false,\n    \"spans\": [\n      {\n        \"start\": 400,\n        \"end\": 450,\n        \"model\": \"gamma\",\n        \"code\": \"1.07\",\n        \"conf\": 0.8,\n        \"poids\": 2.0\n      }\n    ],\n    \"sous_seuil\": []\n  }\n}\n"
 },
 "integration": {
  "raw": "# Journée J01 — le four solaire\n\nCe matin, j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète. Ensuite, j'ai comparé les mesures relevées hier avec celles du manuel pour repérer les écarts significatifs. Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\n\nL'après-midi, nous avons débattu de la meilleure orientation des miroirs, et j'ai défendu mon choix avec des chiffres. Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie. Cette vérification contradictoire a montré une erreur de deux degrés que j'ai corrigée immédiatement dans le plan.\n\nLe soir, j'ai rédigé une synthèse honnête de la journée en distinguant les faits établis des simples impressions. J'ai relu deux fois le paragraphe sur la sécurité pour être sûr de ne rien affirmer sans preuve tangible. Avant de fermer le carnet, j'ai listé les questions éthiques que pose l'usage du four pendant la kermesse.\n",
  "jr": {
   "id": "J11",
   "date": "2026-03-10",
   "titre": "Four solaire"
  },
  "roster": [
   {
    "name": "alpha#1",
    "model": "m-alpha",
    "weight": {
     "__f__": 1.0
    },
    "temperature": {
     "__f__": 0.2
    },
    "seed": 11,
    "kind": "mock"
   },
   {
    "name": "beta",
    "model": "m-beta",
    "family": "fam-b",
    "weight": {
     "__f__": 1.0
    },
    "kind": "mock"
   },
   {
    "name": "gamma#2",
    "model": "m-gamma",
    "family": "fam-g",
    "weight": {
     "__f__": 0.8
    },
    "passe": 2,
    "kind": "mock"
   }
  ],
  "config": {
   "max_workers": 1,
   "premiere_impression": true,
   "juge_leger": {
    "passes": 2,
    "contre_lecture": true
   },
   "calques": {
    "accumulation": true,
    "max_archives": 12
   },
   "backend_tribunal": {
    "kind": "mock",
    "model": "mock-heavy",
    "model_mini": "mock-mini"
   },
   "jury": {
    "mode": "socle4+1"
   }
  },
  "config3": {
   "max_workers": 1,
   "premiere_impression": true,
   "juge_leger": {
    "passes": 2,
    "contre_lecture": true
   },
   "calques": {
    "accumulation": true,
    "max_archives": 2
   },
   "backend_tribunal": {
    "kind": "mock",
    "model": "mock-heavy",
    "model_mini": "mock-mini"
   },
   "jury": {
    "mode": "socle4+1"
   }
  },
  "salt": "vec-b",
  "ts1": "2026-01-02T03:04:05",
  "ts2": "2026-01-02T04:00:00",
  "poles": [
   {
    "num": 1,
    "header": "# Pôle 1 — factice\n\nPréambule synthétique du pôle 1 (test).\n",
    "competences": [
     {
      "code": "1.01",
      "nom": "Analyse critique",
      "fiche_md": "## 1.01 — Analyse critique\n\nEssence : examiner avant d'affirmer (factice).\n"
     },
     {
      "code": "1.03",
      "nom": "Synthèse écrite",
      "fiche_md": "## 1.03 — Synthèse écrite\n\nEssence : condenser sans trahir (factice).\n"
     },
     {
      "code": "1.04",
      "nom": "Curiosité méthodique",
      "fiche_md": "## 1.04 — Curiosité méthodique\n\nEssence : questionner méthodiquement (factice).\n"
     },
     {
      "code": "1.06",
      "nom": "Mémoire de travail",
      "fiche_md": "## 1.06 — Mémoire de travail\n\nEssence : retenir l'utile (factice).\n"
     },
     {
      "code": "1.07",
      "nom": "Vérification des sources",
      "fiche_md": "## 1.07 — Vérification des sources\n\nEssence : croiser les sources (factice).\n"
     }
    ]
   },
   {
    "num": 4,
    "header": "# Pôle 4 — factice\n\nPréambule synthétique du pôle 4 (test).\n",
    "competences": [
     {
      "code": "4.03",
      "nom": "Discernement éthique",
      "fiche_md": "## 4.03 — Discernement éthique\n\nEssence : peser les conséquences (factice).\n"
     },
     {
      "code": "4.04",
      "nom": "Jugement suspendu",
      "fiche_md": "## 4.04 — Jugement suspendu\n\nEssence : différer la conclusion (factice).\n"
     },
     {
      "code": "4.07",
      "nom": "Débat contradictoire",
      "fiche_md": "## 4.07 — Débat contradictoire\n\nEssence : soutenir et concéder (factice).\n"
     }
    ]
   }
  ],
  "r1": {
   "carto": "{\n  \"journee\": \"J11\",\n  \"date\": \"2026-03-10\",\n  \"titre\": \"Four solaire\",\n  \"n_caracteres\": 1033,\n  \"empreinte\": \"9094a1f375b3\",\n  \"premiere_impression\": \"# Lecteur — Première impression — J11\\n\\n## Voix\\nRegistre narratif, doute utilisé comme moteur (mock).\\n\\n## Texture\\nDétails situés et datés, quelques passages génériques (mock).\\n\\n## Authenticité\\n**Indicateur** : `habitée`\\n**Justification** : marqueurs concrets datés observés (mock).\\n\\n## Question spontanée\\nQu'est-ce qui t'a surpris ce jour-là ? (mock)\",\n  \"authenticite\": \"habitée\",\n  \"spans_ecartes\": [],\n  \"calques\": [\n    {\n      \"id\": \"alpha#1@2026-01-02T03:04:05.d155f7\",\n      \"lecteur\": \"alpha#1\",\n      \"llm\": \"m-alpha\",\n      \"passe\": null,\n      \"horodatage\": \"2026-01-02T03:04:05\",\n      \"n_tags\": 4,\n      \"n_elagues\": 0,\n      \"source\": \"run\"\n    },\n    {\n      \"id\": \"beta@2026-01-02T03:04:05.d155f7\",\n      \"lecteur\": \"beta\",\n      \"llm\": \"m-beta\",\n      \"passe\": null,\n      \"horodatage\": \"2026-01-02T03:04:05\",\n      \"n_tags\": 3,\n      \"n_elagues\": 0,\n      \"source\": \"run\"\n    },\n    {\n      \"id\": \"gamma#2@2026-01-02T03:04:05.d155f7\",\n      \"lecteur\": \"gamma#2\",\n      \"llm\": \"m-gamma\",\n      \"passe\": 2,\n      \"horodatage\": \"2026-01-02T03:04:05\",\n      \"n_tags\": 6,\n      \"n_elagues\": 0,\n      \"source\": \"run\"\n    }\n  ],\n  \"validations\": {\n    \"1.07\": {\n      \"statut\": \"présence établie\",\n      \"voie\": \"leger-v6x2+cl\",\n      \"jury\": null,\n      \"jury_mode\": null,\n      \"lectures_leger\": 2,\n      \"n_traces\": 2\n    },\n    \"4.07\": {\n      \"statut\": \"présence établie\",\n      \"voie\": \"leger-v6x2+cl\",\n      \"jury\": null,\n      \"jury_mode\": null,\n      \"lectures_leger\": 2,\n      \"n_traces\": 2\n    }\n  },\n  \"jury_mode\": \"socle4+1\",\n  \"personas\": {\n    \"version\": \"personas-v1\",\n    \"empreinte\": \"1ec337d3a2ef\"\n  },\n  \"verdicts\": {\n    \"1.01\": {\n      \"code\": \"1.01\",\n      \"nom\": \"Analyse critique\",\n      \"dossier_vide\": false,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 0.667,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Analyse critique.\",\n        \"pour_cartographe\": \"Détection minoritaire (gamma#2) — versée au registre des graines.\"\n      },\n      \"gardien\": null,\n      \"etage\": \"minoritaire\"\n    },\n    \"1.03\": {\n      \"code\": \"1.03\",\n      \"nom\": \"Synthèse écrite\",\n      \"dossier_vide\": true,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 1.0,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Synthèse écrite.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"non-détectée\"\n    },\n    \"1.04\": {\n      \"code\": \"1.04\",\n      \"nom\": \"Curiosité méthodique\",\n      \"dossier_vide\": true,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 1.0,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Curiosité méthodique.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"non-détectée\"\n    },\n    \"1.06\": {\n      \"code\": \"1.06\",\n      \"nom\": \"Mémoire de travail\",\n      \"dossier_vide\": true,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 1.0,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Mémoire de travail.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"non-détectée\"\n    },\n    \"1.07\": {\n      \"code\": \"1.07\",\n      \"nom\": \"Vérification des sources\",\n      \"dossier_vide\": false,\n      \"statut\": \"présence établie\",\n      \"score_preuves\": 1,\n      \"score_indices\": 1,\n      \"confiance\": 0.786,\n      \"jury\": null,\n      \"traces_probantes\": [\n        {\n          \"piece\": 1,\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"date\": \"2026-03-10\",\n          \"type\": \"trace_concrete\",\n          \"role\": \"preuve décisive\"\n        },\n        {\n          \"piece\": 2,\n          \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n          \"date\": \"2026-03-10\",\n          \"type\": \"declaration_etayee\",\n          \"role\": \"indice corroboratif\"\n        }\n      ],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée atteste la compétence : 2 lectures rapides indépendantes concordent sur les mêmes pièces, et la contre-lecture les confirme. Pour consolider, une piste serait de documenter une nouvelle situation.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"leger-v6x2+cl\",\n      \"leger\": {\n        \"lectures\": [\n          {\n            \"statut\": \"présence établie\",\n            \"pieces\": [\n              1,\n              2\n            ],\n            \"conf\": 0.86\n          },\n          {\n            \"statut\": \"présence établie\",\n            \"pieces\": [\n              1,\n              2\n            ],\n            \"conf\": 0.86\n          }\n        ],\n        \"contre_lecture\": {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2\n          ],\n          \"conf\": 0.82,\n          \"motif\": \"attaques non recevables : les pièces survivent à la démolition (mock)\"\n        },\n        \"resolution\": \"2 lectures concordantes + contre-lecture, 2 pièce(s) commune(s) ancrée(s)\"\n      }\n    },\n    \"4.03\": {\n      \"code\": \"4.03\",\n      \"nom\": \"Discernement éthique\",\n      \"dossier_vide\": true,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 1.0,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Discernement éthique.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"non-détectée\"\n    },\n    \"4.04\": {\n      \"code\": \"4.04\",\n      \"nom\": \"Jugement suspendu\",\n      \"dossier_vide\": true,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 1.0,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Jugement suspendu.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"non-détectée\"\n    },\n    \"4.07\": {\n      \"code\": \"4.07\",\n      \"nom\": \"Débat contradictoire\",\n      \"dossier_vide\": false,\n      \"statut\": \"présence établie\",\n      \"score_preuves\": 1,\n      \"score_indices\": 1,\n      \"confiance\": 0.762,\n      \"jury\": null,\n      \"traces_probantes\": [\n        {\n          \"piece\": 1,\n          \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n          \"date\": \"2026-03-10\",\n          \"type\": \"trace_concrete\",\n          \"role\": \"preuve décisive\"\n        },\n        {\n          \"piece\": 2,\n          \"extrait\": \"Ce matin, j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète.\",\n          \"date\": \"2026-03-10\",\n          \"type\": \"declaration_etayee\",\n          \"role\": \"indice corroboratif\"\n        }\n      ],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée atteste la compétence : 2 lectures rapides indépendantes concordent sur les mêmes pièces, et la contre-lecture les confirme. Pour consolider, une piste serait de documenter une nouvelle situation.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"leger-v6x2+cl\",\n      \"leger\": {\n        \"lectures\": [\n          {\n            \"statut\": \"présence établie\",\n            \"pieces\": [\n              1,\n              2\n            ],\n            \"conf\": 0.62\n          },\n          {\n            \"statut\": \"présence établie\",\n            \"pieces\": [\n              1,\n              2\n            ],\n            \"conf\": 0.62\n          }\n        ],\n        \"contre_lecture\": {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2\n          ],\n          \"conf\": 0.82,\n          \"motif\": \"attaques non recevables : les pièces survivent à la démolition (mock)\"\n        },\n        \"resolution\": \"2 lectures concordantes + contre-lecture, 2 pièce(s) commune(s) ancrée(s)\"\n      }\n    }\n  },\n  \"consensus\": {\n    \"1.01\": {\n      \"statut\": \"minoritaire\",\n      \"ratio\": 0.333,\n      \"modeles\": [\n        \"gamma#2\"\n      ],\n      \"span_partage\": false\n    },\n    \"1.03\": {\n      \"statut\": \"non détectée\",\n      \"ratio\": 0.0,\n      \"modeles\": [],\n      \"span_partage\": false\n    },\n    \"1.04\": {\n      \"statut\": \"non détectée\",\n      \"ratio\": 0.0,\n      \"modeles\": [],\n      \"span_partage\": false\n    },\n    \"1.06\": {\n      \"statut\": \"non détectée\",\n      \"ratio\": 0.0,\n      \"modeles\": [],\n      \"span_partage\": false\n    },\n    \"1.07\": {\n      \"statut\": \"corroborée\",\n      \"ratio\": 1.0,\n      \"modeles\": [\n        \"alpha#1\",\n        \"beta\",\n        \"gamma#2\"\n      ],\n      \"span_partage\": true\n    },\n    \"4.03\": {\n      \"statut\": \"non détectée\",\n      \"ratio\": 0.0,\n      \"modeles\": [],\n      \"span_partage\": false\n    },\n    \"4.04\": {\n      \"statut\": \"non détectée\",\n      \"ratio\": 0.0,\n      \"modeles\": [],\n      \"span_partage\": false\n    },\n    \"4.07\": {\n      \"statut\": \"corroborée\",\n      \"ratio\": 0.667,\n      \"modeles\": [\n        \"alpha#1\",\n        \"gamma#2\"\n      ],\n      \"span_partage\": true\n    }\n  },\n  \"legers\": {\n    \"1.07\": {\n      \"lectures\": [\n        {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2\n          ],\n          \"conf\": 0.86\n        },\n        {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2\n          ],\n          \"conf\": 0.86\n        }\n      ],\n      \"contre_lecture\": {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"conf\": 0.82,\n        \"motif\": \"attaques non recevables : les pièces survivent à la démolition (mock)\"\n      },\n      \"resolution\": \"2 lectures concordantes + contre-lecture, 2 pièce(s) commune(s) ancrée(s)\"\n    },\n    \"4.07\": {\n      \"lectures\": [\n        {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2\n          ],\n          \"conf\": 0.62\n        },\n        {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2\n          ],\n          \"conf\": 0.62\n        }\n      ],\n      \"contre_lecture\": {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"conf\": 0.82,\n        \"motif\": \"attaques non recevables : les pièces survivent à la démolition (mock)\"\n      },\n      \"resolution\": \"2 lectures concordantes + contre-lecture, 2 pièce(s) commune(s) ancrée(s)\"\n    }\n  },\n  \"segments\": [\n    {\n      \"start\": 143,\n      \"end\": 251,\n      \"heat\": 0.0629,\n      \"models\": [\n        \"gamma#2\"\n      ],\n      \"comps\": [\n        \"4.03\"\n      ],\n      \"conf_moyenne\": 0.22,\n      \"details\": [\n        {\n          \"model\": \"gamma#2\",\n          \"code\": \"4.03\",\n          \"conf\": 0.22\n        }\n      ]\n    },\n    {\n      \"start\": 252,\n      \"end\": 359,\n      \"heat\": 0.4479,\n      \"models\": [\n        \"alpha#1\",\n        \"gamma#2\"\n      ],\n      \"comps\": [\n        \"1.07\",\n        \"4.07\"\n      ],\n      \"conf_moyenne\": 0.67,\n      \"details\": [\n        {\n          \"model\": \"alpha#1\",\n          \"code\": \"4.07\",\n          \"conf\": 0.75\n        },\n        {\n          \"model\": \"gamma#2\",\n          \"code\": \"1.07\",\n          \"conf\": 0.63\n        },\n        {\n          \"model\": \"gamma#2\",\n          \"code\": \"4.07\",\n          \"conf\": 0.63\n        }\n      ]\n    },\n    {\n      \"start\": 480,\n      \"end\": 589,\n      \"heat\": 0.8393,\n      \"models\": [\n        \"alpha#1\",\n        \"beta\",\n        \"gamma#2\"\n      ],\n      \"comps\": [\n        \"1.04\",\n        \"1.07\"\n      ],\n      \"conf_moyenne\": 0.703,\n      \"details\": [\n        {\n          \"model\": \"alpha#1\",\n          \"code\": \"1.07\",\n          \"conf\": 0.91\n        },\n        {\n          \"model\": \"beta\",\n          \"code\": \"1.07\",\n          \"conf\": 0.8\n        },\n        {\n          \"model\": \"gamma#2\",\n          \"code\": \"1.04\",\n          \"conf\": 0.3\n        },\n        {\n          \"model\": \"gamma#2\",\n          \"code\": \"1.07\",\n          \"conf\": 0.8\n        }\n      ]\n    },\n    {\n      \"start\": 590,\n      \"end\": 704,\n      \"heat\": 0.0643,\n      \"models\": [\n        \"alpha#1\"\n      ],\n      \"comps\": [\n        \"4.03\"\n      ],\n      \"conf_moyenne\": 0.18,\n      \"details\": [\n        {\n          \"model\": \"alpha#1\",\n          \"code\": \"4.03\",\n          \"conf\": 0.18\n        }\n      ]\n    },\n    {\n      \"start\": 820,\n      \"end\": 925,\n      \"heat\": 0.1971,\n      \"models\": [\n        \"gamma#2\"\n      ],\n      \"comps\": [\n        \"1.01\"\n      ],\n      \"conf_moyenne\": 0.69,\n      \"details\": [\n        {\n          \"model\": \"gamma#2\",\n          \"code\": \"1.01\",\n          \"conf\": 0.69\n        }\n      ]\n    },\n    {\n      \"start\": 926,\n      \"end\": 1032,\n      \"heat\": 0.0929,\n      \"models\": [\n        \"beta\"\n      ],\n      \"comps\": [\n        \"1.04\"\n      ],\n      \"conf_moyenne\": 0.26,\n      \"details\": [\n        {\n          \"model\": \"beta\",\n          \"code\": \"1.04\",\n          \"conf\": 0.26\n        }\n      ]\n    }\n  ],\n  \"rejets\": [\n    {\n      \"model\": \"alpha#1\",\n      \"competence\": \"1.04\",\n      \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n      \"motif\": \"non ancré (citation introuvable)\"\n    },\n    {\n      \"model\": \"beta\",\n      \"competence\": \"1.04\",\n      \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n      \"motif\": \"non ancré (citation introuvable)\"\n    }\n  ],\n  \"graines\": [\n    {\n      \"code\": \"1.01\",\n      \"nom\": \"Analyse critique\",\n      \"journee\": \"J11\",\n      \"date\": \"2026-03-10\",\n      \"source\": \"minoritaire\",\n      \"detail\": \"gamma#2\",\n      \"extrait\": \"J'ai relu deux fois le paragraphe sur la sécurité pour être sûr de ne rien affirmer sans preuve tangible.\",\n      \"question\": \"As-tu remarqué que cette journée revient sur ceci ?\"\n    },\n    {\n      \"code\": \"1.04\",\n      \"nom\": \"Curiosité méthodique\",\n      \"journee\": \"J11\",\n      \"date\": \"2026-03-10\",\n      \"source\": \"sous-seuil\",\n      \"detail\": \"gamma#2 @0.30\",\n      \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n      \"question\": \"Un lecteur a cru voir Curiosité méthodique ici, sans certitude — as-tu remarqué ce passage ?\"\n    },\n    {\n      \"code\": \"1.04\",\n      \"nom\": \"Curiosité méthodique\",\n      \"journee\": \"J11\",\n      \"date\": \"2026-03-10\",\n      \"source\": \"sous-seuil\",\n      \"detail\": \"beta @0.26\",\n      \"extrait\": \"Avant de fermer le carnet, j'ai listé les questions éthiques que pose l'usage du four pendant la kermesse.\",\n      \"question\": \"Un lecteur a cru voir Curiosité méthodique ici, sans certitude — as-tu remarqué ce passage ?\"\n    },\n    {\n      \"code\": \"4.03\",\n      \"nom\": \"Discernement éthique\",\n      \"journee\": \"J11\",\n      \"date\": \"2026-03-10\",\n      \"source\": \"sous-seuil\",\n      \"detail\": \"gamma#2 @0.22\",\n      \"extrait\": \"Ensuite, j'ai comparé les mesures relevées hier avec celles du manuel pour repérer les écarts significatifs.\",\n      \"question\": \"Un lecteur a cru voir Discernement éthique ici, sans certitude — as-tu remarqué ce passage ?\"\n    },\n    {\n      \"code\": \"4.03\",\n      \"nom\": \"Discernement éthique\",\n      \"journee\": \"J11\",\n      \"date\": \"2026-03-10\",\n      \"source\": \"sous-seuil\",\n      \"detail\": \"alpha#1 @0.18\",\n      \"extrait\": \"Cette vérification contradictoire a montré une erreur de deux degrés que j'ai corrigée immédiatement dans le plan.\",\n      \"question\": \"Un lecteur a cru voir Discernement éthique ici, sans certitude — as-tu remarqué ce passage ?\"\n    }\n  ],\n  \"alertes_injection\": [],\n  \"ancrage_stats_jour\": {\n    \"alpha#1\": {\n      \"ancres\": 3,\n      \"rejets\": 1\n    },\n    \"beta\": {\n      \"ancres\": 2,\n      \"rejets\": 1\n    },\n    \"gamma#2\": {\n      \"ancres\": 6,\n      \"rejets\": 0\n    }\n  },\n  \"incidents_jour\": {},\n  \"etablies\": [\n    \"1.07\",\n    \"4.07\"\n  ],\n  \"renvois\": []\n}\n",
   "tags": {
    "tags_alpha#1_P1.json": "{\n  \"calque_id\": \"alpha#1@2026-01-02T03:04:05.d155f7\",\n  \"model\": \"alpha#1\",\n  \"llm\": \"m-alpha\",\n  \"famille\": \"alpha\",\n  \"passe\": null,\n  \"poids\": 1.0,\n  \"journee\": \"J11\",\n  \"pole\": 1,\n  \"horodatage\": \"2026-01-02T03:04:05\",\n  \"tags\": [\n    {\n      \"competence\": \"1.04\",\n      \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n      \"confiance\": 0.7,\n      \"justification\": \"Citation non ancrée (test).\"\n    },\n    {\n      \"competence\": \"1.07\",\n      \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n      \"confiance\": 0.91,\n      \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\"\n    }\n  ],\n  \"alertes\": [],\n  \"elagues\": []\n}\n",
    "tags_alpha#1_P4.json": "{\n  \"calque_id\": \"alpha#1@2026-01-02T03:04:05.d155f7\",\n  \"model\": \"alpha#1\",\n  \"llm\": \"m-alpha\",\n  \"famille\": \"alpha\",\n  \"passe\": null,\n  \"poids\": 1.0,\n  \"journee\": \"J11\",\n  \"pole\": 4,\n  \"horodatage\": \"2026-01-02T03:04:05\",\n  \"tags\": [\n    {\n      \"competence\": \"4.03\",\n      \"extrait\": \"Cette vérification contradictoire a montré une erreur de deux degrés que j'ai corrigée immédiatement dans le plan.\",\n      \"confiance\": 0.18,\n      \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n    },\n    {\n      \"competence\": \"4.07\",\n      \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n      \"confiance\": 0.75,\n      \"justification\": \"Trace possible, lecture propre à ce modèle.\"\n    }\n  ],\n  \"alertes\": [],\n  \"elagues\": []\n}\n",
    "tags_beta_P1.json": "{\n  \"calque_id\": \"beta@2026-01-02T03:04:05.d155f7\",\n  \"model\": \"beta\",\n  \"llm\": \"m-beta\",\n  \"famille\": \"fam-b\",\n  \"passe\": null,\n  \"poids\": 1.0,\n  \"journee\": \"J11\",\n  \"pole\": 1,\n  \"horodatage\": \"2026-01-02T03:04:05\",\n  \"tags\": [\n    {\n      \"competence\": \"1.04\",\n      \"extrait\": \"Avant de fermer le carnet, j'ai listé les questions éthiques que pose l'usage du four pendant la kermesse.\",\n      \"confiance\": 0.26,\n      \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n    },\n    {\n      \"competence\": \"1.04\",\n      \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n      \"confiance\": 0.7,\n      \"justification\": \"Citation non ancrée (test).\"\n    },\n    {\n      \"competence\": \"1.07\",\n      \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n      \"confiance\": 0.8,\n      \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\"\n    }\n  ],\n  \"alertes\": [],\n  \"elagues\": []\n}\n",
    "tags_beta_P4.json": "{\n  \"calque_id\": \"beta@2026-01-02T03:04:05.d155f7\",\n  \"model\": \"beta\",\n  \"llm\": \"m-beta\",\n  \"famille\": \"fam-b\",\n  \"passe\": null,\n  \"poids\": 1.0,\n  \"journee\": \"J11\",\n  \"pole\": 4,\n  \"horodatage\": \"2026-01-02T03:04:05\",\n  \"tags\": [],\n  \"alertes\": [],\n  \"elagues\": []\n}\n",
    "tags_gamma#2_P1.json": "{\n  \"calque_id\": \"gamma#2@2026-01-02T03:04:05.d155f7\",\n  \"model\": \"gamma#2\",\n  \"llm\": \"m-gamma\",\n  \"famille\": \"fam-g\",\n  \"passe\": 2,\n  \"poids\": 0.8,\n  \"journee\": \"J11\",\n  \"pole\": 1,\n  \"horodatage\": \"2026-01-02T03:04:05\",\n  \"tags\": [\n    {\n      \"competence\": \"1.01\",\n      \"extrait\": \"J'ai relu deux fois le paragraphe sur la sécurité pour être sûr de ne rien affirmer sans preuve tangible.\",\n      \"confiance\": 0.69,\n      \"justification\": \"Trace possible, lecture propre à ce modèle.\"\n    },\n    {\n      \"competence\": \"1.04\",\n      \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n      \"confiance\": 0.3,\n      \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n    },\n    {\n      \"competence\": \"1.07\",\n      \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n      \"confiance\": 0.8,\n      \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\"\n    },\n    {\n      \"competence\": \"1.07\",\n      \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n      \"confiance\": 0.63,\n      \"justification\": \"Indice corroboratif.\"\n    }\n  ],\n  \"alertes\": [],\n  \"elagues\": []\n}\n",
    "tags_gamma#2_P4.json": "{\n  \"calque_id\": \"gamma#2@2026-01-02T03:04:05.d155f7\",\n  \"model\": \"gamma#2\",\n  \"llm\": \"m-gamma\",\n  \"famille\": \"fam-g\",\n  \"passe\": 2,\n  \"poids\": 0.8,\n  \"journee\": \"J11\",\n  \"pole\": 4,\n  \"horodatage\": \"2026-01-02T03:04:05\",\n  \"tags\": [\n    {\n      \"competence\": \"4.03\",\n      \"extrait\": \"Ensuite, j'ai comparé les mesures relevées hier avec celles du manuel pour repérer les écarts significatifs.\",\n      \"confiance\": 0.22,\n      \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n    },\n    {\n      \"competence\": \"4.07\",\n      \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n      \"confiance\": 0.63,\n      \"justification\": \"Trace possible, lecture propre à ce modèle.\"\n    }\n  ],\n  \"alertes\": [],\n  \"elagues\": []\n}\n"
   },
   "store": "{\n  \"journee\": \"J11\",\n  \"texte_empreinte\": \"7e9af2d0c2b4\",\n  \"calques\": [\n    {\n      \"id\": \"alpha#1@2026-01-02T03:04:05.d155f7\",\n      \"lecteur\": \"alpha#1\",\n      \"llm\": \"m-alpha\",\n      \"famille\": \"alpha\",\n      \"passe\": null,\n      \"poids\": 1.0,\n      \"journee\": \"J11\",\n      \"horodatage\": \"2026-01-02T03:04:05\",\n      \"tags\": [\n        {\n          \"competence\": \"1.04\",\n          \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n          \"confiance\": 0.7,\n          \"justification\": \"Citation non ancrée (test).\"\n        },\n        {\n          \"competence\": \"1.07\",\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"confiance\": 0.91,\n          \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\"\n        },\n        {\n          \"competence\": \"4.03\",\n          \"extrait\": \"Cette vérification contradictoire a montré une erreur de deux degrés que j'ai corrigée immédiatement dans le plan.\",\n          \"confiance\": 0.18,\n          \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n        },\n        {\n          \"competence\": \"4.07\",\n          \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n          \"confiance\": 0.75,\n          \"justification\": \"Trace possible, lecture propre à ce modèle.\"\n        }\n      ],\n      \"elagues\": []\n    },\n    {\n      \"id\": \"beta@2026-01-02T03:04:05.d155f7\",\n      \"lecteur\": \"beta\",\n      \"llm\": \"m-beta\",\n      \"famille\": \"fam-b\",\n      \"passe\": null,\n      \"poids\": 1.0,\n      \"journee\": \"J11\",\n      \"horodatage\": \"2026-01-02T03:04:05\",\n      \"tags\": [\n        {\n          \"competence\": \"1.04\",\n          \"extrait\": \"Avant de fermer le carnet, j'ai listé les questions éthiques que pose l'usage du four pendant la kermesse.\",\n          \"confiance\": 0.26,\n          \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n        },\n        {\n          \"competence\": \"1.04\",\n          \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n          \"confiance\": 0.7,\n          \"justification\": \"Citation non ancrée (test).\"\n        },\n        {\n          \"competence\": \"1.07\",\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"confiance\": 0.8,\n          \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\"\n        }\n      ],\n      \"elagues\": []\n    },\n    {\n      \"id\": \"gamma#2@2026-01-02T03:04:05.d155f7\",\n      \"lecteur\": \"gamma#2\",\n      \"llm\": \"m-gamma\",\n      \"famille\": \"fam-g\",\n      \"passe\": 2,\n      \"poids\": 0.8,\n      \"journee\": \"J11\",\n      \"horodatage\": \"2026-01-02T03:04:05\",\n      \"tags\": [\n        {\n          \"competence\": \"1.01\",\n          \"extrait\": \"J'ai relu deux fois le paragraphe sur la sécurité pour être sûr de ne rien affirmer sans preuve tangible.\",\n          \"confiance\": 0.69,\n          \"justification\": \"Trace possible, lecture propre à ce modèle.\"\n        },\n        {\n          \"competence\": \"1.04\",\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"confiance\": 0.3,\n          \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n        },\n        {\n          \"competence\": \"1.07\",\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"confiance\": 0.8,\n          \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\"\n        },\n        {\n          \"competence\": \"1.07\",\n          \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n          \"confiance\": 0.63,\n          \"justification\": \"Indice corroboratif.\"\n        },\n        {\n          \"competence\": \"4.03\",\n          \"extrait\": \"Ensuite, j'ai comparé les mesures relevées hier avec celles du manuel pour repérer les écarts significatifs.\",\n          \"confiance\": 0.22,\n          \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n        },\n        {\n          \"competence\": \"4.07\",\n          \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n          \"confiance\": 0.63,\n          \"justification\": \"Trace possible, lecture propre à ce modèle.\"\n        }\n      ],\n      \"elagues\": []\n    }\n  ]\n}\n",
   "incidents": "{}\n",
   "ancrage_stats": "{\n  \"alpha#1\": {\n    \"ancres\": 3,\n    \"rejets\": 1\n  },\n  \"beta\": {\n    \"ancres\": 2,\n    \"rejets\": 1\n  },\n  \"gamma#2\": {\n    \"ancres\": 6,\n    \"rejets\": 0\n  }\n}\n"
  },
  "r2": {
   "incidents": "{}\n",
   "ancrage_stats": "{\n  \"alpha#1\": {\n    \"ancres\": 6,\n    \"rejets\": 2\n  },\n  \"beta\": {\n    \"ancres\": 4,\n    \"rejets\": 2\n  },\n  \"gamma#2\": {\n    \"ancres\": 12,\n    \"rejets\": 0\n  }\n}\n"
  },
  "r3": {
   "carto": "{\n  \"journee\": \"J11\",\n  \"date\": \"2026-03-10\",\n  \"titre\": \"Four solaire\",\n  \"n_caracteres\": 1033,\n  \"empreinte\": \"db81009e11de\",\n  \"premiere_impression\": \"# Lecteur — Première impression — J11\\n\\n## Voix\\nRegistre narratif, doute utilisé comme moteur (mock).\\n\\n## Texture\\nDétails situés et datés, quelques passages génériques (mock).\\n\\n## Authenticité\\n**Indicateur** : `habitée`\\n**Justification** : marqueurs concrets datés observés (mock).\\n\\n## Question spontanée\\nQu'est-ce qui t'a surpris ce jour-là ? (mock)\",\n  \"authenticite\": \"habitée\",\n  \"spans_ecartes\": [],\n  \"calques\": [\n    {\n      \"id\": \"alpha#1@2026-01-02T04:00:00.d155f7\",\n      \"lecteur\": \"alpha#1\",\n      \"llm\": \"m-alpha\",\n      \"passe\": null,\n      \"horodatage\": \"2026-01-02T04:00:00\",\n      \"n_tags\": 4,\n      \"n_elagues\": 0,\n      \"source\": \"run\"\n    },\n    {\n      \"id\": \"beta@2026-01-02T04:00:00.d155f7\",\n      \"lecteur\": \"beta\",\n      \"llm\": \"m-beta\",\n      \"passe\": null,\n      \"horodatage\": \"2026-01-02T04:00:00\",\n      \"n_tags\": 3,\n      \"n_elagues\": 0,\n      \"source\": \"run\"\n    },\n    {\n      \"id\": \"gamma#2@2026-01-02T04:00:00.d155f7\",\n      \"lecteur\": \"gamma#2\",\n      \"llm\": \"m-gamma\",\n      \"passe\": 2,\n      \"horodatage\": \"2026-01-02T04:00:00\",\n      \"n_tags\": 6,\n      \"n_elagues\": 0,\n      \"source\": \"run\"\n    },\n    {\n      \"id\": \"alpha#1@2026-01-02T03:04:05.d155f7\",\n      \"lecteur\": \"alpha#1\",\n      \"llm\": \"m-alpha\",\n      \"passe\": null,\n      \"horodatage\": \"2026-01-02T03:04:05\",\n      \"n_tags\": 4,\n      \"source\": \"archive\"\n    },\n    {\n      \"id\": \"beta@2026-01-02T03:04:05.d155f7\",\n      \"lecteur\": \"beta\",\n      \"llm\": \"m-beta\",\n      \"passe\": null,\n      \"horodatage\": \"2026-01-02T03:04:05\",\n      \"n_tags\": 3,\n      \"source\": \"archive\"\n    }\n  ],\n  \"validations\": {\n    \"1.07\": {\n      \"statut\": \"présence établie\",\n      \"voie\": \"leger-v6x2+cl\",\n      \"jury\": null,\n      \"jury_mode\": null,\n      \"lectures_leger\": 2,\n      \"n_traces\": 2\n    },\n    \"4.07\": {\n      \"statut\": \"présence établie\",\n      \"voie\": \"leger-v6x2+cl\",\n      \"jury\": null,\n      \"jury_mode\": null,\n      \"lectures_leger\": 2,\n      \"n_traces\": 2\n    }\n  },\n  \"jury_mode\": \"socle4+1\",\n  \"personas\": {\n    \"version\": \"personas-v1\",\n    \"empreinte\": \"1ec337d3a2ef\"\n  },\n  \"verdicts\": {\n    \"1.01\": {\n      \"code\": \"1.01\",\n      \"nom\": \"Analyse critique\",\n      \"dossier_vide\": false,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 0.8,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Analyse critique.\",\n        \"pour_cartographe\": \"Détection minoritaire (gamma#2) — versée au registre des graines.\"\n      },\n      \"gardien\": null,\n      \"etage\": \"minoritaire\"\n    },\n    \"1.03\": {\n      \"code\": \"1.03\",\n      \"nom\": \"Synthèse écrite\",\n      \"dossier_vide\": true,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 1.0,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Synthèse écrite.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"non-détectée\"\n    },\n    \"1.04\": {\n      \"code\": \"1.04\",\n      \"nom\": \"Curiosité méthodique\",\n      \"dossier_vide\": true,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 1.0,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Curiosité méthodique.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"non-détectée\"\n    },\n    \"1.06\": {\n      \"code\": \"1.06\",\n      \"nom\": \"Mémoire de travail\",\n      \"dossier_vide\": true,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 1.0,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Mémoire de travail.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"non-détectée\"\n    },\n    \"1.07\": {\n      \"code\": \"1.07\",\n      \"nom\": \"Vérification des sources\",\n      \"dossier_vide\": false,\n      \"statut\": \"présence établie\",\n      \"score_preuves\": 1,\n      \"score_indices\": 1,\n      \"confiance\": 0.786,\n      \"jury\": null,\n      \"traces_probantes\": [\n        {\n          \"piece\": 1,\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"date\": \"2026-03-10\",\n          \"type\": \"trace_concrete\",\n          \"role\": \"preuve décisive\"\n        },\n        {\n          \"piece\": 2,\n          \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n          \"date\": \"2026-03-10\",\n          \"type\": \"declaration_etayee\",\n          \"role\": \"indice corroboratif\"\n        }\n      ],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée atteste la compétence : 2 lectures rapides indépendantes concordent sur les mêmes pièces, et la contre-lecture les confirme. Pour consolider, une piste serait de documenter une nouvelle situation.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"leger-v6x2+cl\",\n      \"leger\": {\n        \"lectures\": [\n          {\n            \"statut\": \"présence établie\",\n            \"pieces\": [\n              1,\n              2\n            ],\n            \"conf\": 0.86\n          },\n          {\n            \"statut\": \"présence établie\",\n            \"pieces\": [\n              1,\n              2\n            ],\n            \"conf\": 0.86\n          }\n        ],\n        \"contre_lecture\": {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2\n          ],\n          \"conf\": 0.82,\n          \"motif\": \"attaques non recevables : les pièces survivent à la démolition (mock)\"\n        },\n        \"resolution\": \"2 lectures concordantes + contre-lecture, 2 pièce(s) commune(s) ancrée(s)\"\n      }\n    },\n    \"4.03\": {\n      \"code\": \"4.03\",\n      \"nom\": \"Discernement éthique\",\n      \"dossier_vide\": true,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 1.0,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Discernement éthique.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"non-détectée\"\n    },\n    \"4.04\": {\n      \"code\": \"4.04\",\n      \"nom\": \"Jugement suspendu\",\n      \"dossier_vide\": true,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 1.0,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Jugement suspendu.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"non-détectée\"\n    },\n    \"4.07\": {\n      \"code\": \"4.07\",\n      \"nom\": \"Débat contradictoire\",\n      \"dossier_vide\": false,\n      \"statut\": \"présence établie\",\n      \"score_preuves\": 1,\n      \"score_indices\": 1,\n      \"confiance\": 0.762,\n      \"jury\": null,\n      \"traces_probantes\": [\n        {\n          \"piece\": 1,\n          \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n          \"date\": \"2026-03-10\",\n          \"type\": \"trace_concrete\",\n          \"role\": \"preuve décisive\"\n        },\n        {\n          \"piece\": 2,\n          \"extrait\": \"Ce matin, j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète.\",\n          \"date\": \"2026-03-10\",\n          \"type\": \"declaration_etayee\",\n          \"role\": \"indice corroboratif\"\n        }\n      ],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée atteste la compétence : 2 lectures rapides indépendantes concordent sur les mêmes pièces, et la contre-lecture les confirme. Pour consolider, une piste serait de documenter une nouvelle situation.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"leger-v6x2+cl\",\n      \"leger\": {\n        \"lectures\": [\n          {\n            \"statut\": \"présence établie\",\n            \"pieces\": [\n              1,\n              2\n            ],\n            \"conf\": 0.62\n          },\n          {\n            \"statut\": \"présence établie\",\n            \"pieces\": [\n              1,\n              2\n            ],\n            \"conf\": 0.62\n          }\n        ],\n        \"contre_lecture\": {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2\n          ],\n          \"conf\": 0.82,\n          \"motif\": \"attaques non recevables : les pièces survivent à la démolition (mock)\"\n        },\n        \"resolution\": \"2 lectures concordantes + contre-lecture, 2 pièce(s) commune(s) ancrée(s)\"\n      }\n    }\n  },\n  \"consensus\": {\n    \"1.01\": {\n      \"statut\": \"minoritaire\",\n      \"ratio\": 0.2,\n      \"modeles\": [\n        \"gamma#2\"\n      ],\n      \"span_partage\": false\n    },\n    \"1.03\": {\n      \"statut\": \"non détectée\",\n      \"ratio\": 0.0,\n      \"modeles\": [],\n      \"span_partage\": false\n    },\n    \"1.04\": {\n      \"statut\": \"non détectée\",\n      \"ratio\": 0.0,\n      \"modeles\": [],\n      \"span_partage\": false\n    },\n    \"1.06\": {\n      \"statut\": \"non détectée\",\n      \"ratio\": 0.0,\n      \"modeles\": [],\n      \"span_partage\": false\n    },\n    \"1.07\": {\n      \"statut\": \"corroborée\",\n      \"ratio\": 1.0,\n      \"modeles\": [\n        \"alpha#1\",\n        \"alpha#1@2026-01-02T03:04:05.d155f7\",\n        \"beta\",\n        \"beta@2026-01-02T03:04:05.d155f7\",\n        \"gamma#2\"\n      ],\n      \"span_partage\": true\n    },\n    \"4.03\": {\n      \"statut\": \"non détectée\",\n      \"ratio\": 0.0,\n      \"modeles\": [],\n      \"span_partage\": false\n    },\n    \"4.04\": {\n      \"statut\": \"non détectée\",\n      \"ratio\": 0.0,\n      \"modeles\": [],\n      \"span_partage\": false\n    },\n    \"4.07\": {\n      \"statut\": \"corroborée\",\n      \"ratio\": 0.6,\n      \"modeles\": [\n        \"alpha#1\",\n        \"alpha#1@2026-01-02T03:04:05.d155f7\",\n        \"gamma#2\"\n      ],\n      \"span_partage\": true\n    }\n  },\n  \"legers\": {\n    \"1.07\": {\n      \"lectures\": [\n        {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2\n          ],\n          \"conf\": 0.86\n        },\n        {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2\n          ],\n          \"conf\": 0.86\n        }\n      ],\n      \"contre_lecture\": {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"conf\": 0.82,\n        \"motif\": \"attaques non recevables : les pièces survivent à la démolition (mock)\"\n      },\n      \"resolution\": \"2 lectures concordantes + contre-lecture, 2 pièce(s) commune(s) ancrée(s)\"\n    },\n    \"4.07\": {\n      \"lectures\": [\n        {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2\n          ],\n          \"conf\": 0.62\n        },\n        {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2\n          ],\n          \"conf\": 0.62\n        }\n      ],\n      \"contre_lecture\": {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"conf\": 0.82,\n        \"motif\": \"attaques non recevables : les pièces survivent à la démolition (mock)\"\n      },\n      \"resolution\": \"2 lectures concordantes + contre-lecture, 2 pièce(s) commune(s) ancrée(s)\"\n    }\n  },\n  \"segments\": [\n    {\n      \"start\": 143,\n      \"end\": 251,\n      \"heat\": 0.0367,\n      \"models\": [\n        \"gamma#2\"\n      ],\n      \"comps\": [\n        \"4.03\"\n      ],\n      \"conf_moyenne\": 0.22,\n      \"details\": [\n        {\n          \"model\": \"gamma#2\",\n          \"code\": \"4.03\",\n          \"conf\": 0.22\n        }\n      ]\n    },\n    {\n      \"start\": 252,\n      \"end\": 359,\n      \"heat\": 0.4175,\n      \"models\": [\n        \"alpha#1\",\n        \"alpha#1@2026-01-02T03:04:05.d155f7\",\n        \"gamma#2\"\n      ],\n      \"comps\": [\n        \"1.07\",\n        \"4.07\"\n      ],\n      \"conf_moyenne\": 0.69,\n      \"details\": [\n        {\n          \"model\": \"alpha#1\",\n          \"code\": \"4.07\",\n          \"conf\": 0.75\n        },\n        {\n          \"model\": \"alpha#1@2026-01-02T03:04:05.d155f7\",\n          \"code\": \"4.07\",\n          \"conf\": 0.75\n        },\n        {\n          \"model\": \"gamma#2\",\n          \"code\": \"1.07\",\n          \"conf\": 0.63\n        },\n        {\n          \"model\": \"gamma#2\",\n          \"code\": \"4.07\",\n          \"conf\": 0.63\n        }\n      ]\n    },\n    {\n      \"start\": 480,\n      \"end\": 589,\n      \"heat\": 0.8458,\n      \"models\": [\n        \"alpha#1\",\n        \"alpha#1@2026-01-02T03:04:05.d155f7\",\n        \"beta\",\n        \"beta@2026-01-02T03:04:05.d155f7\",\n        \"gamma#2\"\n      ],\n      \"comps\": [\n        \"1.04\",\n        \"1.07\"\n      ],\n      \"conf_moyenne\": 0.753,\n      \"details\": [\n        {\n          \"model\": \"alpha#1\",\n          \"code\": \"1.07\",\n          \"conf\": 0.91\n        },\n        {\n          \"model\": \"alpha#1@2026-01-02T03:04:05.d155f7\",\n          \"code\": \"1.07\",\n          \"conf\": 0.91\n        },\n        {\n          \"model\": \"beta\",\n          \"code\": \"1.07\",\n          \"conf\": 0.8\n        },\n        {\n          \"model\": \"beta@2026-01-02T03:04:05.d155f7\",\n          \"code\": \"1.07\",\n          \"conf\": 0.8\n        },\n        {\n          \"model\": \"gamma#2\",\n          \"code\": \"1.04\",\n          \"conf\": 0.3\n        },\n        {\n          \"model\": \"gamma#2\",\n          \"code\": \"1.07\",\n          \"conf\": 0.8\n        }\n      ]\n    },\n    {\n      \"start\": 590,\n      \"end\": 704,\n      \"heat\": 0.075,\n      \"models\": [\n        \"alpha#1\",\n        \"alpha#1@2026-01-02T03:04:05.d155f7\"\n      ],\n      \"comps\": [\n        \"4.03\"\n      ],\n      \"conf_moyenne\": 0.18,\n      \"details\": [\n        {\n          \"model\": \"alpha#1\",\n          \"code\": \"4.03\",\n          \"conf\": 0.18\n        },\n        {\n          \"model\": \"alpha#1@2026-01-02T03:04:05.d155f7\",\n          \"code\": \"4.03\",\n          \"conf\": 0.18\n        }\n      ]\n    },\n    {\n      \"start\": 820,\n      \"end\": 925,\n      \"heat\": 0.115,\n      \"models\": [\n        \"gamma#2\"\n      ],\n      \"comps\": [\n        \"1.01\"\n      ],\n      \"conf_moyenne\": 0.69,\n      \"details\": [\n        {\n          \"model\": \"gamma#2\",\n          \"code\": \"1.01\",\n          \"conf\": 0.69\n        }\n      ]\n    },\n    {\n      \"start\": 926,\n      \"end\": 1032,\n      \"heat\": 0.1083,\n      \"models\": [\n        \"beta\",\n        \"beta@2026-01-02T03:04:05.d155f7\"\n      ],\n      \"comps\": [\n        \"1.04\"\n      ],\n      \"conf_moyenne\": 0.26,\n      \"details\": [\n        {\n          \"model\": \"beta\",\n          \"code\": \"1.04\",\n          \"conf\": 0.26\n        },\n        {\n          \"model\": \"beta@2026-01-02T03:04:05.d155f7\",\n          \"code\": \"1.04\",\n          \"conf\": 0.26\n        }\n      ]\n    }\n  ],\n  \"rejets\": [\n    {\n      \"model\": \"alpha#1\",\n      \"competence\": \"1.04\",\n      \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n      \"motif\": \"non ancré (citation introuvable)\"\n    },\n    {\n      \"model\": \"beta\",\n      \"competence\": \"1.04\",\n      \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n      \"motif\": \"non ancré (citation introuvable)\"\n    },\n    {\n      \"model\": \"alpha#1@2026-01-02T03:04:05.d155f7\",\n      \"competence\": \"1.04\",\n      \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n      \"motif\": \"non ancré (citation introuvable)\"\n    },\n    {\n      \"model\": \"beta@2026-01-02T03:04:05.d155f7\",\n      \"competence\": \"1.04\",\n      \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n      \"motif\": \"non ancré (citation introuvable)\"\n    }\n  ],\n  \"graines\": [\n    {\n      \"code\": \"1.01\",\n      \"nom\": \"Analyse critique\",\n      \"journee\": \"J11\",\n      \"date\": \"2026-03-10\",\n      \"source\": \"minoritaire\",\n      \"detail\": \"gamma#2\",\n      \"extrait\": \"J'ai relu deux fois le paragraphe sur la sécurité pour être sûr de ne rien affirmer sans preuve tangible.\",\n      \"question\": \"As-tu remarqué que cette journée revient sur ceci ?\"\n    },\n    {\n      \"code\": \"1.04\",\n      \"nom\": \"Curiosité méthodique\",\n      \"journee\": \"J11\",\n      \"date\": \"2026-03-10\",\n      \"source\": \"sous-seuil\",\n      \"detail\": \"gamma#2 @0.30\",\n      \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n      \"question\": \"Un lecteur a cru voir Curiosité méthodique ici, sans certitude — as-tu remarqué ce passage ?\"\n    },\n    {\n      \"code\": \"1.04\",\n      \"nom\": \"Curiosité méthodique\",\n      \"journee\": \"J11\",\n      \"date\": \"2026-03-10\",\n      \"source\": \"sous-seuil\",\n      \"detail\": \"beta @0.26\",\n      \"extrait\": \"Avant de fermer le carnet, j'ai listé les questions éthiques que pose l'usage du four pendant la kermesse.\",\n      \"question\": \"Un lecteur a cru voir Curiosité méthodique ici, sans certitude — as-tu remarqué ce passage ?\"\n    },\n    {\n      \"code\": \"4.03\",\n      \"nom\": \"Discernement éthique\",\n      \"journee\": \"J11\",\n      \"date\": \"2026-03-10\",\n      \"source\": \"sous-seuil\",\n      \"detail\": \"gamma#2 @0.22\",\n      \"extrait\": \"Ensuite, j'ai comparé les mesures relevées hier avec celles du manuel pour repérer les écarts significatifs.\",\n      \"question\": \"Un lecteur a cru voir Discernement éthique ici, sans certitude — as-tu remarqué ce passage ?\"\n    },\n    {\n      \"code\": \"4.03\",\n      \"nom\": \"Discernement éthique\",\n      \"journee\": \"J11\",\n      \"date\": \"2026-03-10\",\n      \"source\": \"sous-seuil\",\n      \"detail\": \"alpha#1 @0.18\",\n      \"extrait\": \"Cette vérification contradictoire a montré une erreur de deux degrés que j'ai corrigée immédiatement dans le plan.\",\n      \"question\": \"Un lecteur a cru voir Discernement éthique ici, sans certitude — as-tu remarqué ce passage ?\"\n    }\n  ],\n  \"alertes_injection\": [],\n  \"ancrage_stats_jour\": {\n    \"alpha#1\": {\n      \"ancres\": 3,\n      \"rejets\": 1\n    },\n    \"beta\": {\n      \"ancres\": 2,\n      \"rejets\": 1\n    },\n    \"gamma#2\": {\n      \"ancres\": 6,\n      \"rejets\": 0\n    },\n    \"alpha#1@2026-01-02T03:04:05.d155f7\": {\n      \"ancres\": 3,\n      \"rejets\": 1\n    },\n    \"beta@2026-01-02T03:04:05.d155f7\": {\n      \"ancres\": 2,\n      \"rejets\": 1\n    }\n  },\n  \"incidents_jour\": {},\n  \"etablies\": [\n    \"1.07\",\n    \"4.07\"\n  ],\n  \"renvois\": []\n}\n",
   "store": "{\n  \"journee\": \"J11\",\n  \"texte_empreinte\": \"7e9af2d0c2b4\",\n  \"calques\": [\n    {\n      \"id\": \"alpha#1@2026-01-02T03:04:05.d155f7\",\n      \"lecteur\": \"alpha#1\",\n      \"llm\": \"m-alpha\",\n      \"famille\": \"alpha\",\n      \"passe\": null,\n      \"poids\": 1.0,\n      \"journee\": \"J11\",\n      \"horodatage\": \"2026-01-02T03:04:05\",\n      \"tags\": [\n        {\n          \"competence\": \"1.04\",\n          \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n          \"confiance\": 0.7,\n          \"justification\": \"Citation non ancrée (test).\"\n        },\n        {\n          \"competence\": \"1.07\",\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"confiance\": 0.91,\n          \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\"\n        },\n        {\n          \"competence\": \"4.03\",\n          \"extrait\": \"Cette vérification contradictoire a montré une erreur de deux degrés que j'ai corrigée immédiatement dans le plan.\",\n          \"confiance\": 0.18,\n          \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n        },\n        {\n          \"competence\": \"4.07\",\n          \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n          \"confiance\": 0.75,\n          \"justification\": \"Trace possible, lecture propre à ce modèle.\"\n        }\n      ],\n      \"elagues\": []\n    },\n    {\n      \"id\": \"beta@2026-01-02T03:04:05.d155f7\",\n      \"lecteur\": \"beta\",\n      \"llm\": \"m-beta\",\n      \"famille\": \"fam-b\",\n      \"passe\": null,\n      \"poids\": 1.0,\n      \"journee\": \"J11\",\n      \"horodatage\": \"2026-01-02T03:04:05\",\n      \"tags\": [\n        {\n          \"competence\": \"1.04\",\n          \"extrait\": \"Avant de fermer le carnet, j'ai listé les questions éthiques que pose l'usage du four pendant la kermesse.\",\n          \"confiance\": 0.26,\n          \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n        },\n        {\n          \"competence\": \"1.04\",\n          \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n          \"confiance\": 0.7,\n          \"justification\": \"Citation non ancrée (test).\"\n        },\n        {\n          \"competence\": \"1.07\",\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"confiance\": 0.8,\n          \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\"\n        }\n      ],\n      \"elagues\": []\n    },\n    {\n      \"id\": \"gamma#2@2026-01-02T03:04:05.d155f7\",\n      \"lecteur\": \"gamma#2\",\n      \"llm\": \"m-gamma\",\n      \"famille\": \"fam-g\",\n      \"passe\": 2,\n      \"poids\": 0.8,\n      \"journee\": \"J11\",\n      \"horodatage\": \"2026-01-02T03:04:05\",\n      \"tags\": [\n        {\n          \"competence\": \"1.01\",\n          \"extrait\": \"J'ai relu deux fois le paragraphe sur la sécurité pour être sûr de ne rien affirmer sans preuve tangible.\",\n          \"confiance\": 0.69,\n          \"justification\": \"Trace possible, lecture propre à ce modèle.\"\n        },\n        {\n          \"competence\": \"1.04\",\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"confiance\": 0.3,\n          \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n        },\n        {\n          \"competence\": \"1.07\",\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"confiance\": 0.8,\n          \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\"\n        },\n        {\n          \"competence\": \"1.07\",\n          \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n          \"confiance\": 0.63,\n          \"justification\": \"Indice corroboratif.\"\n        },\n        {\n          \"competence\": \"4.03\",\n          \"extrait\": \"Ensuite, j'ai comparé les mesures relevées hier avec celles du manuel pour repérer les écarts significatifs.\",\n          \"confiance\": 0.22,\n          \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n        },\n        {\n          \"competence\": \"4.07\",\n          \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n          \"confiance\": 0.63,\n          \"justification\": \"Trace possible, lecture propre à ce modèle.\"\n        }\n      ],\n      \"elagues\": []\n    },\n    {\n      \"id\": \"alpha#1@2026-01-02T04:00:00.d155f7\",\n      \"lecteur\": \"alpha#1\",\n      \"llm\": \"m-alpha\",\n      \"famille\": \"alpha\",\n      \"passe\": null,\n      \"poids\": 1.0,\n      \"journee\": \"J11\",\n      \"horodatage\": \"2026-01-02T04:00:00\",\n      \"tags\": [\n        {\n          \"competence\": \"1.04\",\n          \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n          \"confiance\": 0.7,\n          \"justification\": \"Citation non ancrée (test).\"\n        },\n        {\n          \"competence\": \"1.07\",\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"confiance\": 0.91,\n          \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\"\n        },\n        {\n          \"competence\": \"4.03\",\n          \"extrait\": \"Cette vérification contradictoire a montré une erreur de deux degrés que j'ai corrigée immédiatement dans le plan.\",\n          \"confiance\": 0.18,\n          \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n        },\n        {\n          \"competence\": \"4.07\",\n          \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n          \"confiance\": 0.75,\n          \"justification\": \"Trace possible, lecture propre à ce modèle.\"\n        }\n      ],\n      \"elagues\": []\n    },\n    {\n      \"id\": \"beta@2026-01-02T04:00:00.d155f7\",\n      \"lecteur\": \"beta\",\n      \"llm\": \"m-beta\",\n      \"famille\": \"fam-b\",\n      \"passe\": null,\n      \"poids\": 1.0,\n      \"journee\": \"J11\",\n      \"horodatage\": \"2026-01-02T04:00:00\",\n      \"tags\": [\n        {\n          \"competence\": \"1.04\",\n          \"extrait\": \"Avant de fermer le carnet, j'ai listé les questions éthiques que pose l'usage du four pendant la kermesse.\",\n          \"confiance\": 0.26,\n          \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n        },\n        {\n          \"competence\": \"1.04\",\n          \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n          \"confiance\": 0.7,\n          \"justification\": \"Citation non ancrée (test).\"\n        },\n        {\n          \"competence\": \"1.07\",\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"confiance\": 0.8,\n          \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\"\n        }\n      ],\n      \"elagues\": []\n    },\n    {\n      \"id\": \"gamma#2@2026-01-02T04:00:00.d155f7\",\n      \"lecteur\": \"gamma#2\",\n      \"llm\": \"m-gamma\",\n      \"famille\": \"fam-g\",\n      \"passe\": 2,\n      \"poids\": 0.8,\n      \"journee\": \"J11\",\n      \"horodatage\": \"2026-01-02T04:00:00\",\n      \"tags\": [\n        {\n          \"competence\": \"1.01\",\n          \"extrait\": \"J'ai relu deux fois le paragraphe sur la sécurité pour être sûr de ne rien affirmer sans preuve tangible.\",\n          \"confiance\": 0.69,\n          \"justification\": \"Trace possible, lecture propre à ce modèle.\"\n        },\n        {\n          \"competence\": \"1.04\",\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"confiance\": 0.3,\n          \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n        },\n        {\n          \"competence\": \"1.07\",\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"confiance\": 0.8,\n          \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\"\n        },\n        {\n          \"competence\": \"1.07\",\n          \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n          \"confiance\": 0.63,\n          \"justification\": \"Indice corroboratif.\"\n        },\n        {\n          \"competence\": \"4.03\",\n          \"extrait\": \"Ensuite, j'ai comparé les mesures relevées hier avec celles du manuel pour repérer les écarts significatifs.\",\n          \"confiance\": 0.22,\n          \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n        },\n        {\n          \"competence\": \"4.07\",\n          \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n          \"confiance\": 0.63,\n          \"justification\": \"Trace possible, lecture propre à ce modèle.\"\n        }\n      ],\n      \"elagues\": []\n    }\n  ]\n}\n"
  },
  "r4": {
   "carto": "{\n  \"journee\": \"J11\",\n  \"date\": \"2026-03-10\",\n  \"titre\": \"Four solaire\",\n  \"n_caracteres\": 1033,\n  \"empreinte\": \"9094a1f375b3\",\n  \"premiere_impression\": \"# Lecteur — Première impression — J11\\n\\n## Voix\\nRegistre narratif, doute utilisé comme moteur (mock).\\n\\n## Texture\\nDétails situés et datés, quelques passages génériques (mock).\\n\\n## Authenticité\\n**Indicateur** : `habitée`\\n**Justification** : marqueurs concrets datés observés (mock).\\n\\n## Question spontanée\\nQu'est-ce qui t'a surpris ce jour-là ? (mock)\",\n  \"authenticite\": \"habitée\",\n  \"spans_ecartes\": [\n    {\n      \"model\": \"alpha#1\",\n      \"code\": \"1.07\",\n      \"start\": 480,\n      \"end\": 589,\n      \"conf\": 0.91\n    },\n    {\n      \"model\": \"beta\",\n      \"code\": \"1.07\",\n      \"start\": 480,\n      \"end\": 589,\n      \"conf\": 0.8\n    },\n    {\n      \"model\": \"gamma#2\",\n      \"code\": \"1.07\",\n      \"start\": 480,\n      \"end\": 589,\n      \"conf\": 0.8\n    },\n    {\n      \"model\": \"gamma#2\",\n      \"code\": \"1.07\",\n      \"start\": 252,\n      \"end\": 359,\n      \"conf\": 0.63\n    }\n  ],\n  \"calques\": [\n    {\n      \"id\": \"alpha#1@2026-01-02T03:04:05.d155f7\",\n      \"lecteur\": \"alpha#1\",\n      \"llm\": \"m-alpha\",\n      \"passe\": null,\n      \"horodatage\": \"2026-01-02T03:04:05\",\n      \"n_tags\": 3,\n      \"n_elagues\": 1,\n      \"source\": \"run\"\n    },\n    {\n      \"id\": \"beta@2026-01-02T03:04:05.d155f7\",\n      \"lecteur\": \"beta\",\n      \"llm\": \"m-beta\",\n      \"passe\": null,\n      \"horodatage\": \"2026-01-02T03:04:05\",\n      \"n_tags\": 2,\n      \"n_elagues\": 1,\n      \"source\": \"run\"\n    },\n    {\n      \"id\": \"gamma#2@2026-01-02T03:04:05.d155f7\",\n      \"lecteur\": \"gamma#2\",\n      \"llm\": \"m-gamma\",\n      \"passe\": 2,\n      \"horodatage\": \"2026-01-02T03:04:05\",\n      \"n_tags\": 4,\n      \"n_elagues\": 2,\n      \"source\": \"run\"\n    }\n  ],\n  \"validations\": {\n    \"1.07\": {\n      \"statut\": \"présence non établie\",\n      \"voie\": \"tribunal-court-circuit\",\n      \"jury\": null,\n      \"jury_mode\": null,\n      \"lectures_leger\": null,\n      \"n_traces\": 0\n    },\n    \"4.07\": {\n      \"statut\": \"présence établie\",\n      \"voie\": \"leger-v6x2+cl\",\n      \"jury\": null,\n      \"jury_mode\": null,\n      \"lectures_leger\": 2,\n      \"n_traces\": 2\n    }\n  },\n  \"jury_mode\": \"socle4+1\",\n  \"personas\": {\n    \"version\": \"personas-v1\",\n    \"empreinte\": \"1ec337d3a2ef\"\n  },\n  \"verdicts\": {\n    \"1.01\": {\n      \"code\": \"1.01\",\n      \"nom\": \"Analyse critique\",\n      \"dossier_vide\": false,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 0.667,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Analyse critique.\",\n        \"pour_cartographe\": \"Détection minoritaire (gamma#2) — versée au registre des graines.\"\n      },\n      \"gardien\": null,\n      \"etage\": \"minoritaire\"\n    },\n    \"1.03\": {\n      \"code\": \"1.03\",\n      \"nom\": \"Synthèse écrite\",\n      \"dossier_vide\": true,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 1.0,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Synthèse écrite.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"non-détectée\"\n    },\n    \"1.04\": {\n      \"code\": \"1.04\",\n      \"nom\": \"Curiosité méthodique\",\n      \"dossier_vide\": true,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 1.0,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Curiosité méthodique.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"non-détectée\"\n    },\n    \"1.06\": {\n      \"code\": \"1.06\",\n      \"nom\": \"Mémoire de travail\",\n      \"dossier_vide\": true,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 1.0,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Mémoire de travail.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"non-détectée\"\n    },\n    \"1.07\": {\n      \"code\": \"1.07\",\n      \"nom\": \"Vérification des sources\",\n      \"dossier_vide\": true,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 0.9,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de pièce pour Vérification des sources.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"tribunal-court-circuit\",\n      \"deliberation\": {\n        \"greffier_md\": \"DOSSIER VIDE — aucune pièce (test de déclassement).\"\n      }\n    },\n    \"4.03\": {\n      \"code\": \"4.03\",\n      \"nom\": \"Discernement éthique\",\n      \"dossier_vide\": true,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 1.0,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Discernement éthique.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"non-détectée\"\n    },\n    \"4.04\": {\n      \"code\": \"4.04\",\n      \"nom\": \"Jugement suspendu\",\n      \"dossier_vide\": true,\n      \"statut\": \"présence non établie\",\n      \"score_preuves\": 0,\n      \"score_indices\": 0,\n      \"confiance\": 1.0,\n      \"jury\": null,\n      \"traces_probantes\": [],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée ne contient pas encore de trace établie pour Jugement suspendu.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"non-détectée\"\n    },\n    \"4.07\": {\n      \"code\": \"4.07\",\n      \"nom\": \"Débat contradictoire\",\n      \"dossier_vide\": false,\n      \"statut\": \"présence établie\",\n      \"score_preuves\": 1,\n      \"score_indices\": 1,\n      \"confiance\": 0.762,\n      \"jury\": null,\n      \"traces_probantes\": [\n        {\n          \"piece\": 1,\n          \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n          \"date\": \"2026-03-10\",\n          \"type\": \"trace_concrete\",\n          \"role\": \"preuve décisive\"\n        },\n        {\n          \"piece\": 2,\n          \"extrait\": \"Ce matin, j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète.\",\n          \"date\": \"2026-03-10\",\n          \"type\": \"declaration_etayee\",\n          \"role\": \"indice corroboratif\"\n        }\n      ],\n      \"prescription\": {\n        \"pour_apprenant\": \"Cette journée atteste la compétence : 2 lectures rapides indépendantes concordent sur les mêmes pièces, et la contre-lecture les confirme. Pour consolider, une piste serait de documenter une nouvelle situation.\",\n        \"pour_cartographe\": null\n      },\n      \"gardien\": null,\n      \"etage\": \"leger-v6x2+cl\",\n      \"leger\": {\n        \"lectures\": [\n          {\n            \"statut\": \"présence établie\",\n            \"pieces\": [\n              1,\n              2\n            ],\n            \"conf\": 0.62\n          },\n          {\n            \"statut\": \"présence établie\",\n            \"pieces\": [\n              1,\n              2\n            ],\n            \"conf\": 0.62\n          }\n        ],\n        \"contre_lecture\": {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2\n          ],\n          \"conf\": 0.82,\n          \"motif\": \"attaques non recevables : les pièces survivent à la démolition (mock)\"\n        },\n        \"resolution\": \"2 lectures concordantes + contre-lecture, 2 pièce(s) commune(s) ancrée(s)\"\n      }\n    }\n  },\n  \"consensus\": {\n    \"1.01\": {\n      \"statut\": \"minoritaire\",\n      \"ratio\": 0.333,\n      \"modeles\": [\n        \"gamma#2\"\n      ],\n      \"span_partage\": false\n    },\n    \"1.03\": {\n      \"statut\": \"non détectée\",\n      \"ratio\": 0.0,\n      \"modeles\": [],\n      \"span_partage\": false\n    },\n    \"1.04\": {\n      \"statut\": \"non détectée\",\n      \"ratio\": 0.0,\n      \"modeles\": [],\n      \"span_partage\": false\n    },\n    \"1.06\": {\n      \"statut\": \"non détectée\",\n      \"ratio\": 0.0,\n      \"modeles\": [],\n      \"span_partage\": false\n    },\n    \"1.07\": {\n      \"statut\": \"corroborée\",\n      \"ratio\": 1.0,\n      \"modeles\": [\n        \"alpha#1\",\n        \"beta\",\n        \"gamma#2\"\n      ],\n      \"span_partage\": true\n    },\n    \"4.03\": {\n      \"statut\": \"non détectée\",\n      \"ratio\": 0.0,\n      \"modeles\": [],\n      \"span_partage\": false\n    },\n    \"4.04\": {\n      \"statut\": \"non détectée\",\n      \"ratio\": 0.0,\n      \"modeles\": [],\n      \"span_partage\": false\n    },\n    \"4.07\": {\n      \"statut\": \"corroborée\",\n      \"ratio\": 0.667,\n      \"modeles\": [\n        \"alpha#1\",\n        \"gamma#2\"\n      ],\n      \"span_partage\": true\n    }\n  },\n  \"legers\": {\n    \"1.07\": {\n      \"dossier_vide\": true\n    },\n    \"4.07\": {\n      \"lectures\": [\n        {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2\n          ],\n          \"conf\": 0.62\n        },\n        {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2\n          ],\n          \"conf\": 0.62\n        }\n      ],\n      \"contre_lecture\": {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2\n        ],\n        \"conf\": 0.82,\n        \"motif\": \"attaques non recevables : les pièces survivent à la démolition (mock)\"\n      },\n      \"resolution\": \"2 lectures concordantes + contre-lecture, 2 pièce(s) commune(s) ancrée(s)\"\n    }\n  },\n  \"segments\": [\n    {\n      \"start\": 143,\n      \"end\": 251,\n      \"heat\": 0.0629,\n      \"models\": [\n        \"gamma#2\"\n      ],\n      \"comps\": [\n        \"4.03\"\n      ],\n      \"conf_moyenne\": 0.22,\n      \"details\": [\n        {\n          \"model\": \"gamma#2\",\n          \"code\": \"4.03\",\n          \"conf\": 0.22\n        }\n      ]\n    },\n    {\n      \"start\": 252,\n      \"end\": 359,\n      \"heat\": 0.4479,\n      \"models\": [\n        \"alpha#1\",\n        \"gamma#2\"\n      ],\n      \"comps\": [\n        \"4.07\"\n      ],\n      \"conf_moyenne\": 0.69,\n      \"details\": [\n        {\n          \"model\": \"alpha#1\",\n          \"code\": \"4.07\",\n          \"conf\": 0.75\n        },\n        {\n          \"model\": \"gamma#2\",\n          \"code\": \"4.07\",\n          \"conf\": 0.63\n        }\n      ]\n    },\n    {\n      \"start\": 480,\n      \"end\": 589,\n      \"heat\": 0.0857,\n      \"models\": [\n        \"gamma#2\"\n      ],\n      \"comps\": [\n        \"1.04\"\n      ],\n      \"conf_moyenne\": 0.3,\n      \"details\": [\n        {\n          \"model\": \"gamma#2\",\n          \"code\": \"1.04\",\n          \"conf\": 0.3\n        }\n      ]\n    },\n    {\n      \"start\": 590,\n      \"end\": 704,\n      \"heat\": 0.0643,\n      \"models\": [\n        \"alpha#1\"\n      ],\n      \"comps\": [\n        \"4.03\"\n      ],\n      \"conf_moyenne\": 0.18,\n      \"details\": [\n        {\n          \"model\": \"alpha#1\",\n          \"code\": \"4.03\",\n          \"conf\": 0.18\n        }\n      ]\n    },\n    {\n      \"start\": 820,\n      \"end\": 925,\n      \"heat\": 0.1971,\n      \"models\": [\n        \"gamma#2\"\n      ],\n      \"comps\": [\n        \"1.01\"\n      ],\n      \"conf_moyenne\": 0.69,\n      \"details\": [\n        {\n          \"model\": \"gamma#2\",\n          \"code\": \"1.01\",\n          \"conf\": 0.69\n        }\n      ]\n    },\n    {\n      \"start\": 926,\n      \"end\": 1032,\n      \"heat\": 0.0929,\n      \"models\": [\n        \"beta\"\n      ],\n      \"comps\": [\n        \"1.04\"\n      ],\n      \"conf_moyenne\": 0.26,\n      \"details\": [\n        {\n          \"model\": \"beta\",\n          \"code\": \"1.04\",\n          \"conf\": 0.26\n        }\n      ]\n    }\n  ],\n  \"rejets\": [\n    {\n      \"model\": \"alpha#1\",\n      \"competence\": \"1.04\",\n      \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n      \"motif\": \"non ancré (citation introuvable)\"\n    },\n    {\n      \"model\": \"beta\",\n      \"competence\": \"1.04\",\n      \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n      \"motif\": \"non ancré (citation introuvable)\"\n    }\n  ],\n  \"graines\": [\n    {\n      \"code\": \"1.01\",\n      \"nom\": \"Analyse critique\",\n      \"journee\": \"J11\",\n      \"date\": \"2026-03-10\",\n      \"source\": \"minoritaire\",\n      \"detail\": \"gamma#2\",\n      \"extrait\": \"J'ai relu deux fois le paragraphe sur la sécurité pour être sûr de ne rien affirmer sans preuve tangible.\",\n      \"question\": \"As-tu remarqué que cette journée revient sur ceci ?\"\n    },\n    {\n      \"code\": \"1.04\",\n      \"nom\": \"Curiosité méthodique\",\n      \"journee\": \"J11\",\n      \"date\": \"2026-03-10\",\n      \"source\": \"sous-seuil\",\n      \"detail\": \"gamma#2 @0.30\",\n      \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n      \"question\": \"Un lecteur a cru voir Curiosité méthodique ici, sans certitude — as-tu remarqué ce passage ?\"\n    },\n    {\n      \"code\": \"1.04\",\n      \"nom\": \"Curiosité méthodique\",\n      \"journee\": \"J11\",\n      \"date\": \"2026-03-10\",\n      \"source\": \"sous-seuil\",\n      \"detail\": \"beta @0.26\",\n      \"extrait\": \"Avant de fermer le carnet, j'ai listé les questions éthiques que pose l'usage du four pendant la kermesse.\",\n      \"question\": \"Un lecteur a cru voir Curiosité méthodique ici, sans certitude — as-tu remarqué ce passage ?\"\n    },\n    {\n      \"code\": \"4.03\",\n      \"nom\": \"Discernement éthique\",\n      \"journee\": \"J11\",\n      \"date\": \"2026-03-10\",\n      \"source\": \"sous-seuil\",\n      \"detail\": \"gamma#2 @0.22\",\n      \"extrait\": \"Ensuite, j'ai comparé les mesures relevées hier avec celles du manuel pour repérer les écarts significatifs.\",\n      \"question\": \"Un lecteur a cru voir Discernement éthique ici, sans certitude — as-tu remarqué ce passage ?\"\n    },\n    {\n      \"code\": \"4.03\",\n      \"nom\": \"Discernement éthique\",\n      \"journee\": \"J11\",\n      \"date\": \"2026-03-10\",\n      \"source\": \"sous-seuil\",\n      \"detail\": \"alpha#1 @0.18\",\n      \"extrait\": \"Cette vérification contradictoire a montré une erreur de deux degrés que j'ai corrigée immédiatement dans le plan.\",\n      \"question\": \"Un lecteur a cru voir Discernement éthique ici, sans certitude — as-tu remarqué ce passage ?\"\n    }\n  ],\n  \"alertes_injection\": [],\n  \"ancrage_stats_jour\": {\n    \"alpha#1\": {\n      \"ancres\": 3,\n      \"rejets\": 1\n    },\n    \"beta\": {\n      \"ancres\": 2,\n      \"rejets\": 1\n    },\n    \"gamma#2\": {\n      \"ancres\": 6,\n      \"rejets\": 0\n    }\n  },\n  \"incidents_jour\": {\n    \"spans_declasses_apres_jury\": 4,\n    \"tags_elagues_apres_jury\": 4\n  },\n  \"etablies\": [\n    \"4.07\"\n  ],\n  \"renvois\": []\n}\n",
   "elagues": {
    "tags_alpha#1_P1.json": "{\n  \"calque_id\": \"alpha#1@2026-01-02T03:04:05.d155f7\",\n  \"model\": \"alpha#1\",\n  \"llm\": \"m-alpha\",\n  \"famille\": \"alpha\",\n  \"passe\": null,\n  \"poids\": 1.0,\n  \"journee\": \"J11\",\n  \"pole\": 1,\n  \"horodatage\": \"2026-01-02T03:04:05\",\n  \"tags\": [\n    {\n      \"competence\": \"1.04\",\n      \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n      \"confiance\": 0.7,\n      \"justification\": \"Citation non ancrée (test).\"\n    }\n  ],\n  \"alertes\": [],\n  \"elagues\": [\n    {\n      \"competence\": \"1.07\",\n      \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n      \"confiance\": 0.91,\n      \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\",\n      \"juge\": \"tribunal du 2026-03-10 : non retenue\"\n    }\n  ]\n}\n",
    "tags_beta_P1.json": "{\n  \"calque_id\": \"beta@2026-01-02T03:04:05.d155f7\",\n  \"model\": \"beta\",\n  \"llm\": \"m-beta\",\n  \"famille\": \"fam-b\",\n  \"passe\": null,\n  \"poids\": 1.0,\n  \"journee\": \"J11\",\n  \"pole\": 1,\n  \"horodatage\": \"2026-01-02T03:04:05\",\n  \"tags\": [\n    {\n      \"competence\": \"1.04\",\n      \"extrait\": \"Avant de fermer le carnet, j'ai listé les questions éthiques que pose l'usage du four pendant la kermesse.\",\n      \"confiance\": 0.26,\n      \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n    },\n    {\n      \"competence\": \"1.04\",\n      \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n      \"confiance\": 0.7,\n      \"justification\": \"Citation non ancrée (test).\"\n    }\n  ],\n  \"alertes\": [],\n  \"elagues\": [\n    {\n      \"competence\": \"1.07\",\n      \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n      \"confiance\": 0.8,\n      \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\",\n      \"juge\": \"tribunal du 2026-03-10 : non retenue\"\n    }\n  ]\n}\n",
    "tags_gamma#2_P1.json": "{\n  \"calque_id\": \"gamma#2@2026-01-02T03:04:05.d155f7\",\n  \"model\": \"gamma#2\",\n  \"llm\": \"m-gamma\",\n  \"famille\": \"fam-g\",\n  \"passe\": 2,\n  \"poids\": 0.8,\n  \"journee\": \"J11\",\n  \"pole\": 1,\n  \"horodatage\": \"2026-01-02T03:04:05\",\n  \"tags\": [\n    {\n      \"competence\": \"1.01\",\n      \"extrait\": \"J'ai relu deux fois le paragraphe sur la sécurité pour être sûr de ne rien affirmer sans preuve tangible.\",\n      \"confiance\": 0.69,\n      \"justification\": \"Trace possible, lecture propre à ce modèle.\"\n    },\n    {\n      \"competence\": \"1.04\",\n      \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n      \"confiance\": 0.3,\n      \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n    }\n  ],\n  \"alertes\": [],\n  \"elagues\": [\n    {\n      \"competence\": \"1.07\",\n      \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n      \"confiance\": 0.8,\n      \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\",\n      \"juge\": \"tribunal du 2026-03-10 : non retenue\"\n    },\n    {\n      \"competence\": \"1.07\",\n      \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n      \"confiance\": 0.63,\n      \"justification\": \"Indice corroboratif.\",\n      \"juge\": \"tribunal du 2026-03-10 : non retenue\"\n    }\n  ]\n}\n"
   },
   "store": "{\n  \"journee\": \"J11\",\n  \"texte_empreinte\": \"7e9af2d0c2b4\",\n  \"calques\": [\n    {\n      \"id\": \"alpha#1@2026-01-02T03:04:05.d155f7\",\n      \"lecteur\": \"alpha#1\",\n      \"llm\": \"m-alpha\",\n      \"famille\": \"alpha\",\n      \"passe\": null,\n      \"poids\": 1.0,\n      \"journee\": \"J11\",\n      \"horodatage\": \"2026-01-02T03:04:05\",\n      \"tags\": [\n        {\n          \"competence\": \"1.04\",\n          \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n          \"confiance\": 0.7,\n          \"justification\": \"Citation non ancrée (test).\"\n        },\n        {\n          \"competence\": \"4.03\",\n          \"extrait\": \"Cette vérification contradictoire a montré une erreur de deux degrés que j'ai corrigée immédiatement dans le plan.\",\n          \"confiance\": 0.18,\n          \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n        },\n        {\n          \"competence\": \"4.07\",\n          \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n          \"confiance\": 0.75,\n          \"justification\": \"Trace possible, lecture propre à ce modèle.\"\n        }\n      ],\n      \"elagues\": [\n        {\n          \"competence\": \"1.07\",\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"confiance\": 0.91,\n          \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\",\n          \"juge\": \"tribunal du 2026-03-10 : non retenue\"\n        }\n      ]\n    },\n    {\n      \"id\": \"beta@2026-01-02T03:04:05.d155f7\",\n      \"lecteur\": \"beta\",\n      \"llm\": \"m-beta\",\n      \"famille\": \"fam-b\",\n      \"passe\": null,\n      \"poids\": 1.0,\n      \"journee\": \"J11\",\n      \"horodatage\": \"2026-01-02T03:04:05\",\n      \"tags\": [\n        {\n          \"competence\": \"1.04\",\n          \"extrait\": \"Avant de fermer le carnet, j'ai listé les questions éthiques que pose l'usage du four pendant la kermesse.\",\n          \"confiance\": 0.26,\n          \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n        },\n        {\n          \"competence\": \"1.04\",\n          \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simulée).\",\n          \"confiance\": 0.7,\n          \"justification\": \"Citation non ancrée (test).\"\n        }\n      ],\n      \"elagues\": [\n        {\n          \"competence\": \"1.07\",\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"confiance\": 0.8,\n          \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\",\n          \"juge\": \"tribunal du 2026-03-10 : non retenue\"\n        }\n      ]\n    },\n    {\n      \"id\": \"gamma#2@2026-01-02T03:04:05.d155f7\",\n      \"lecteur\": \"gamma#2\",\n      \"llm\": \"m-gamma\",\n      \"famille\": \"fam-g\",\n      \"passe\": 2,\n      \"poids\": 0.8,\n      \"journee\": \"J11\",\n      \"horodatage\": \"2026-01-02T03:04:05\",\n      \"tags\": [\n        {\n          \"competence\": \"1.01\",\n          \"extrait\": \"J'ai relu deux fois le paragraphe sur la sécurité pour être sûr de ne rien affirmer sans preuve tangible.\",\n          \"confiance\": 0.69,\n          \"justification\": \"Trace possible, lecture propre à ce modèle.\"\n        },\n        {\n          \"competence\": \"1.04\",\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"confiance\": 0.3,\n          \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n        },\n        {\n          \"competence\": \"4.03\",\n          \"extrait\": \"Ensuite, j'ai comparé les mesures relevées hier avec celles du manuel pour repérer les écarts significatifs.\",\n          \"confiance\": 0.22,\n          \"justification\": \"Soupçon ténu, confiance honnête (mock).\"\n        },\n        {\n          \"competence\": \"4.07\",\n          \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n          \"confiance\": 0.63,\n          \"justification\": \"Trace possible, lecture propre à ce modèle.\"\n        }\n      ],\n      \"elagues\": [\n        {\n          \"competence\": \"1.07\",\n          \"extrait\": \"Marie a contesté mon calcul d'angle, alors nous avons refait ensemble la mesure devant toute l'équipe réunie.\",\n          \"confiance\": 0.8,\n          \"justification\": \"Acte daté correspondant aux manifestations de 1.07.\",\n          \"juge\": \"tribunal du 2026-03-10 : non retenue\"\n        },\n        {\n          \"competence\": \"1.07\",\n          \"extrait\": \"Enfin, j'ai noté dans le carnet les trois hypothèses qui restaient ouvertes après la discussion collective.\",\n          \"confiance\": 0.63,\n          \"justification\": \"Indice corroboratif.\",\n          \"juge\": \"tribunal du 2026-03-10 : non retenue\"\n        }\n      ]\n    }\n  ]\n}\n",
   "vide_code": "1.07",
   "vide_texte": "DOSSIER VIDE — aucune pièce (test de déclassement)."
  }
 },
 "empreinte": [
  {
   "roster": [
    {
     "name": "alpha#1",
     "model": "m-alpha",
     "weight": {
      "__f__": 1.0
     },
     "temperature": {
      "__f__": 0.2
     },
     "seed": 11,
     "kind": "mock"
    },
    {
     "name": "beta",
     "model": "m-beta",
     "family": "fam-b",
     "weight": {
      "__f__": 1.0
     },
     "kind": "mock"
    },
    {
     "name": "gamma#2",
     "model": "m-gamma",
     "family": "fam-g",
     "weight": {
      "__f__": 0.8
     },
     "passe": 2,
     "kind": "mock"
    }
   ],
   "config": {
    "max_workers": 1,
    "premiere_impression": true,
    "juge_leger": {
     "passes": 2,
     "contre_lecture": true
    },
    "calques": {
     "accumulation": true,
     "max_archives": 12
    },
    "backend_tribunal": {
     "kind": "mock",
     "model": "mock-heavy",
     "model_mini": "mock-mini"
    },
    "jury": {
     "mode": "socle4+1"
    }
   },
   "out": "c7be618c72f2"
  },
  {
   "roster": [
    {
     "name": "solo"
    }
   ],
   "config": {},
   "out": "6ceaae8875b0"
  },
  {
   "roster": [
    {
     "name": "a",
     "weight": 1
    },
    {
     "name": "b",
     "model": "mx",
     "family": "F",
     "weight": {
      "__f__": 0.8
     },
     "kind": "mock"
    }
   ],
   "config": {
    "seuils_consensus": {
     "corrobore": {
      "__f__": 0.7
     }
    },
    "juge_leger": {
     "passes": 1,
     "contre_lecture": true
    },
    "jury": {
     "mode": "aleatoire",
     "taille_aleatoire": 5
    },
    "premiere_impression": false,
    "backend_rapide": {
     "kind": "mock",
     "model": "r"
    },
    "backend_tribunal": {
     "kind": "mock",
     "model": "h"
    }
   },
   "out": "e4affa006f5"
  }
 ],
 "juger_leger": [
  {
   "name": "ok_cl",
   "canned": {
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\n- **Date** : hier\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n",
    "leger_J11_9.01_p1": "**Statut** : Présence établie\n**Pièces retenues** : P1, P2, P3\n**Confiance** : 0.8",
    "leger_J11_9.01_p2": "**Statut** : Présence établie\n**Pièces retenues** : P1, P2, P3\n**Confiance** : 0.8",
    "contre-lecture_J11_9.01": "# Contre-lecture — 9.01\n\n**Statut** : présence établie\n**Pièces retenues** : P1\n**Confiance** : 0.82\n\n**Motif du verdict** : attaques non recevables (test)"
   },
   "juge_leger": {
    "passes": 2,
    "contre_lecture": true
   },
   "expected": "[\n  {\n    \"code\": \"9.01\",\n    \"nom\": \"Compétence fictive\",\n    \"dossier_vide\": false,\n    \"statut\": \"présence établie\",\n    \"score_preuves\": 1,\n    \"score_indices\": 1,\n    \"confiance\": 0.78,\n    \"jury\": null,\n    \"traces_probantes\": [\n      {\n        \"piece\": 1,\n        \"extrait\": \"j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète\",\n        \"date\": \"2026-03-10\",\n        \"type\": \"trace_concrete\",\n        \"role\": \"preuve décisive\"\n      },\n      {\n        \"piece\": 2,\n        \"extrait\": \"nous avons refait ensemble la mesure devant toute l'équipe réunie\",\n        \"date\": \"2026-03-10\",\n        \"type\": \"declaration_etayee\",\n        \"role\": \"indice corroboratif\"\n      }\n    ],\n    \"prescription\": {\n      \"pour_apprenant\": \"Cette journée atteste la compétence : 2 lectures rapides indépendantes concordent sur les mêmes pièces, et la contre-lecture les confirme. Pour consolider, une piste serait de documenter une nouvelle situation.\",\n      \"pour_cartographe\": null\n    },\n    \"gardien\": null,\n    \"etage\": \"leger-v6x2+cl\",\n    \"leger\": {\n      \"lectures\": [\n        {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2,\n            3\n          ],\n          \"conf\": 0.8\n        },\n        {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2,\n            3\n          ],\n          \"conf\": 0.8\n        }\n      ],\n      \"contre_lecture\": {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1\n        ],\n        \"conf\": 0.82,\n        \"motif\": \"attaques non recevables (test)\"\n      },\n      \"resolution\": \"2 lectures concordantes + contre-lecture, 2 pièce(s) commune(s) ancrée(s)\"\n    }\n  },\n  {\n    \"lectures\": [\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"conf\": 0.8\n      },\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"conf\": 0.8\n      }\n    ],\n    \"contre_lecture\": {\n      \"statut\": \"présence établie\",\n      \"pieces\": [\n        1\n      ],\n      \"conf\": 0.82,\n      \"motif\": \"attaques non recevables (test)\"\n    },\n    \"resolution\": \"2 lectures concordantes + contre-lecture, 2 pièce(s) commune(s) ancrée(s)\"\n  },\n  {}\n]\n"
  },
  {
   "name": "cl_casse",
   "canned": {
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\n- **Date** : hier\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n",
    "leger_J11_9.01_p1": "**Statut** : Présence établie\n**Pièces retenues** : P1, P2, P3\n**Confiance** : 0.8",
    "leger_J11_9.01_p2": "**Statut** : Présence établie\n**Pièces retenues** : P1, P2, P3\n**Confiance** : 0.8",
    "contre-lecture_J11_9.01": "# Contre-lecture — 9.01\n\n**Statut** : présence non établie\n**Confiance** : 0.74\n\n**Motif du verdict** : récit performatif (test)"
   },
   "juge_leger": {
    "passes": 2,
    "contre_lecture": true
   },
   "expected": "[\n  null,\n  {\n    \"lectures\": [\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"conf\": 0.8\n      },\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"conf\": 0.8\n      }\n    ],\n    \"contre_lecture\": {\n      \"statut\": \"présence non établie\",\n      \"pieces\": [],\n      \"conf\": 0.74,\n      \"motif\": \"récit performatif (test)\"\n    },\n    \"ecarte_cl\": \"j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète\",\n    \"resolution\": \"la convergence (2 lectures) n'a pas résisté à la contre-lecture → tribunal\"\n  },\n  {}\n]\n"
  },
  {
   "name": "cl_illisible",
   "canned": {
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\n- **Date** : hier\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n",
    "leger_J11_9.01_p1": "**Statut** : Présence établie\n**Pièces retenues** : P1, P2, P3\n**Confiance** : 0.8",
    "leger_J11_9.01_p2": "**Statut** : Présence établie\n**Pièces retenues** : P1, P2, P3\n**Confiance** : 0.8",
    "contre-lecture_J11_9.01": "contre-lecture sans balise statut"
   },
   "juge_leger": {
    "passes": 2,
    "contre_lecture": true
   },
   "expected": "[\n  null,\n  {\n    \"lectures\": [\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"conf\": 0.8\n      },\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"conf\": 0.8\n      }\n    ],\n    \"contre_lecture\": {\n      \"statut\": null,\n      \"pieces\": [],\n      \"conf\": 0.5,\n      \"motif\": null\n    },\n    \"resolution\": \"contre-lecture indisponible ou illisible → tribunal\"\n  },\n  {\n    \"contre_lecture_illisible\": 1\n  }\n]\n"
  },
  {
   "name": "cl_panne",
   "canned": {
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\n- **Date** : hier\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n",
    "leger_J11_9.01_p1": "**Statut** : Présence établie\n**Pièces retenues** : P1, P2, P3\n**Confiance** : 0.8",
    "leger_J11_9.01_p2": "**Statut** : Présence établie\n**Pièces retenues** : P1, P2, P3\n**Confiance** : 0.8"
   },
   "juge_leger": {
    "passes": 2,
    "contre_lecture": true
   },
   "expected": "[\n  null,\n  {\n    \"lectures\": [\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"conf\": 0.8\n      },\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"conf\": 0.8\n      }\n    ],\n    \"contre_lecture\": null,\n    \"resolution\": \"contre-lecture indisponible ou illisible → tribunal\"\n  },\n  {\n    \"contre_lecture_echec\": 1\n  }\n]\n"
  },
  {
   "name": "sans_cl",
   "canned": {
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\n- **Date** : hier\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n",
    "leger_J11_9.01_p1": "**Statut** : Présence établie\n**Pièces retenues** : P1, P2, P3\n**Confiance** : 0.8",
    "leger_J11_9.01_p2": "**Statut** : Présence établie\n**Pièces retenues** : P1, P2, P3\n**Confiance** : 0.8"
   },
   "juge_leger": {
    "passes": 2,
    "contre_lecture": false
   },
   "expected": "[\n  {\n    \"code\": \"9.01\",\n    \"nom\": \"Compétence fictive\",\n    \"dossier_vide\": false,\n    \"statut\": \"présence établie\",\n    \"score_preuves\": 1,\n    \"score_indices\": 1,\n    \"confiance\": 0.78,\n    \"jury\": null,\n    \"traces_probantes\": [\n      {\n        \"piece\": 1,\n        \"extrait\": \"j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète\",\n        \"date\": \"2026-03-10\",\n        \"type\": \"trace_concrete\",\n        \"role\": \"preuve décisive\"\n      },\n      {\n        \"piece\": 2,\n        \"extrait\": \"nous avons refait ensemble la mesure devant toute l'équipe réunie\",\n        \"date\": \"2026-03-10\",\n        \"type\": \"declaration_etayee\",\n        \"role\": \"indice corroboratif\"\n      }\n    ],\n    \"prescription\": {\n      \"pour_apprenant\": \"Cette journée atteste la compétence : 2 lectures rapides indépendantes concordent sur les mêmes pièces. Pour consolider, une piste serait de documenter une nouvelle situation.\",\n      \"pour_cartographe\": null\n    },\n    \"gardien\": null,\n    \"etage\": \"leger-v6x2\",\n    \"leger\": {\n      \"lectures\": [\n        {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2,\n            3\n          ],\n          \"conf\": 0.8\n        },\n        {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1,\n            2,\n            3\n          ],\n          \"conf\": 0.8\n        }\n      ],\n      \"resolution\": \"2 lectures concordantes, 2 pièce(s) commune(s) ancrée(s)\"\n    }\n  },\n  {\n    \"lectures\": [\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"conf\": 0.8\n      },\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"conf\": 0.8\n      }\n    ],\n    \"resolution\": \"2 lectures concordantes, 2 pièce(s) commune(s) ancrée(s)\"\n  },\n  {}\n]\n"
  },
  {
   "name": "garde_fou_nue",
   "canned": {
    "greffier_J11_9.01": "# Greffier — 9.01\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Type** : déclaration nue\n",
    "leger_J11_9.01_p1": "**Statut** : présence établie\n**Pièces retenues** : P1\n**Confiance** : 0.7",
    "leger_J11_9.01_p2": "**Statut** : présence établie\n**Pièces retenues** : P1\n**Confiance** : 0.7"
   },
   "juge_leger": {
    "passes": 2,
    "contre_lecture": true
   },
   "expected": "[\n  null,\n  {\n    \"lectures\": [\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1\n        ],\n        \"conf\": 0.7\n      },\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1\n        ],\n        \"conf\": 0.7\n      }\n    ],\n    \"resolution\": \"concordance sans pièces communes ancrables → tribunal\"\n  },\n  {}\n]\n"
  },
  {
   "name": "non_ancree",
   "canned": {
    "greffier_J11_9.01": "# Greffier — 9.01\n\n#### Pièce 1\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Type** : intention\n",
    "leger_J11_9.01_p1": "**Statut** : Présence établie\n**Pièces retenues** : P1, P2, P3\n**Confiance** : 0.8",
    "leger_J11_9.01_p2": "**Statut** : Présence établie\n**Pièces retenues** : P1, P2, P3\n**Confiance** : 0.8"
   },
   "juge_leger": {
    "passes": 2,
    "contre_lecture": true
   },
   "expected": "[\n  null,\n  {\n    \"lectures\": [\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"conf\": 0.8\n      },\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"conf\": 0.8\n      }\n    ],\n    \"resolution\": \"concordance sans pièces communes ancrables → tribunal\"\n  },\n  {\n    \"trace_leger_non_ancree\": 1\n  }\n]\n"
  },
  {
   "name": "cas_b",
   "canned": {
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\n- **Date** : hier\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n",
    "leger_J11_9.01_p1": "**Statut** : présence non établie\n**Pièces** : P2 (examinée puis écartée)\n**Confiance** : 0,7",
    "leger_J11_9.01_p2": "**Statut** : présence non établie\n**Pièces** : P2 (examinée puis écartée)\n**Confiance** : 0,7"
   },
   "juge_leger": {
    "passes": 2,
    "contre_lecture": true
   },
   "expected": "[\n  {\n    \"code\": \"9.01\",\n    \"nom\": \"Compétence fictive\",\n    \"dossier_vide\": false,\n    \"statut\": \"présence non établie\",\n    \"score_preuves\": 0,\n    \"score_indices\": 0,\n    \"confiance\": 0.705,\n    \"jury\": null,\n    \"traces_probantes\": [],\n    \"prescription\": {\n      \"pour_apprenant\": \"Ce dossier ne contient pas encore de pièce établie pour Compétence fictive (examiné par 2 lectures indépendantes).\",\n      \"pour_cartographe\": null\n    },\n    \"gardien\": null,\n    \"etage\": \"leger-v6x2\",\n    \"leger\": {\n      \"lectures\": [\n        {\n          \"statut\": \"présence non établie\",\n          \"pieces\": [\n            2\n          ],\n          \"conf\": 0.7\n        },\n        {\n          \"statut\": \"présence non établie\",\n          \"pieces\": [\n            2\n          ],\n          \"conf\": 0.7\n        }\n      ],\n      \"ecartes\": [\n        \"nous avons refait ensemble la mesure devant toute l'équipe réunie\"\n      ],\n      \"resolution\": \"2 lectures concordantes : non établie\"\n    }\n  },\n  {\n    \"lectures\": [\n      {\n        \"statut\": \"présence non établie\",\n        \"pieces\": [\n          2\n        ],\n        \"conf\": 0.7\n      },\n      {\n        \"statut\": \"présence non établie\",\n        \"pieces\": [\n          2\n        ],\n        \"conf\": 0.7\n      }\n    ],\n    \"ecartes\": [\n      \"nous avons refait ensemble la mesure devant toute l'équipe réunie\"\n    ],\n    \"resolution\": \"2 lectures concordantes : non établie\"\n  },\n  {}\n]\n"
  },
  {
   "name": "cas_c",
   "canned": {
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\n- **Date** : hier\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n",
    "leger_J11_9.01_p1": "**Statut** : Présence établie\n**Pièces retenues** : P1, P2, P3\n**Confiance** : 0.8",
    "leger_J11_9.01_p2": "**Statut** : renvoi au cartographe\n**Pièces** : —\n**Confiance** : 0.5"
   },
   "juge_leger": {
    "passes": 2,
    "contre_lecture": true
   },
   "expected": "[\n  null,\n  {\n    \"lectures\": [\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"conf\": 0.8\n      },\n      {\n        \"statut\": \"renvoi au cartographe\",\n        \"pieces\": [],\n        \"conf\": 0.5\n      }\n    ],\n    \"resolution\": \"désaccord entre lectures (présence établie / renvoi au cartographe) → tribunal\"\n  },\n  {}\n]\n"
  },
  {
   "name": "illisible_p2",
   "canned": {
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\n- **Date** : hier\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n",
    "leger_J11_9.01_p1": "**Statut** : Présence établie\n**Pièces retenues** : P1, P2, P3\n**Confiance** : 0.8",
    "leger_J11_9.01_p2": "réponse totalement illisible, sans balise"
   },
   "juge_leger": {
    "passes": 2,
    "contre_lecture": true
   },
   "expected": "[\n  null,\n  {\n    \"lectures\": [\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1,\n          2,\n          3\n        ],\n        \"conf\": 0.8\n      }\n    ],\n    \"resolution\": \"lecture 2 illisible → tribunal\"\n  },\n  {\n    \"leger_illisible\": 1\n  }\n]\n"
  },
  {
   "name": "dossier_vide",
   "canned": {
    "greffier_J11_9.01": "DOSSIER VIDE — rien à examiner (test)."
   },
   "juge_leger": {
    "passes": 2,
    "contre_lecture": true
   },
   "expected": "[\n  {\n    \"code\": \"9.01\",\n    \"nom\": \"Compétence fictive\",\n    \"dossier_vide\": true,\n    \"statut\": \"présence non établie\",\n    \"score_preuves\": 0,\n    \"score_indices\": 0,\n    \"confiance\": 0.9,\n    \"jury\": null,\n    \"traces_probantes\": [],\n    \"prescription\": {\n      \"pour_apprenant\": \"Cette journée ne contient pas encore de pièce pour Compétence fictive.\",\n      \"pour_cartographe\": null\n    },\n    \"gardien\": null,\n    \"etage\": \"tribunal-court-circuit\",\n    \"deliberation\": {\n      \"greffier_md\": \"DOSSIER VIDE — rien à examiner (test).\"\n    }\n  },\n  {\n    \"dossier_vide\": true\n  },\n  {}\n]\n"
  },
  {
   "name": "greffier_panne",
   "canned": {},
   "juge_leger": {
    "passes": 2,
    "contre_lecture": true
   },
   "expected": "[\n  null,\n  {\n    \"erreur\": \"greffier : panne simulée\"\n  },\n  {\n    \"greffier_echec\": 1\n  }\n]\n"
  },
  {
   "name": "leger_panne_p2",
   "canned": {
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\n- **Date** : hier\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n",
    "leger_J11_9.01_p1": "**Statut** : Présence établie\n**Pièces retenues** : P1, P2, P3\n**Confiance** : 0.8"
   },
   "juge_leger": {
    "passes": 2,
    "contre_lecture": true
   },
   "expected": "[\n  null,\n  {\n    \"erreur\": \"léger p2 : panne simulée\"\n  },\n  {\n    \"leger_echec\": 1\n  }\n]\n"
  },
  {
   "name": "passes1",
   "canned": {
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\n- **Date** : hier\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n",
    "leger_J11_9.01_p1": "**Statut** : présence établie\n**Pièces retenues** : P1\n**Confiance** : 0.7"
   },
   "juge_leger": {
    "passes": 1,
    "contre_lecture": false
   },
   "expected": "[\n  {\n    \"code\": \"9.01\",\n    \"nom\": \"Compétence fictive\",\n    \"dossier_vide\": false,\n    \"statut\": \"présence établie\",\n    \"score_preuves\": 1,\n    \"score_indices\": 0,\n    \"confiance\": 0.67,\n    \"jury\": null,\n    \"traces_probantes\": [\n      {\n        \"piece\": 1,\n        \"extrait\": \"j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète\",\n        \"date\": \"2026-03-10\",\n        \"type\": \"trace_concrete\",\n        \"role\": \"preuve décisive\"\n      }\n    ],\n    \"prescription\": {\n      \"pour_apprenant\": \"Cette journée atteste la compétence : 1 lectures rapides indépendantes concordent sur les mêmes pièces. Pour consolider, une piste serait de documenter une nouvelle situation.\",\n      \"pour_cartographe\": null\n    },\n    \"gardien\": null,\n    \"etage\": \"leger-v6x1\",\n    \"leger\": {\n      \"lectures\": [\n        {\n          \"statut\": \"présence établie\",\n          \"pieces\": [\n            1\n          ],\n          \"conf\": 0.7\n        }\n      ],\n      \"resolution\": \"1 lectures concordantes, 1 pièce(s) commune(s) ancrée(s)\"\n    }\n  },\n  {\n    \"lectures\": [\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1\n        ],\n        \"conf\": 0.7\n      }\n    ],\n    \"resolution\": \"1 lectures concordantes, 1 pièce(s) commune(s) ancrée(s)\"\n  },\n  {}\n]\n"
  },
  {
   "name": "disjoint",
   "canned": {
    "greffier_J11_9.01": "# Greffier — 9.01 Compétence fictive\n\n### Pièces extraites\n\n#### Pièce 1\n- **Extrait** : « j'ai vérifié chaque source citée dans notre dossier avant de rédiger la première synthèse complète »\n- **Date** : 2026-03-10\n- **Type** : trace concrète\n\n#### Pièce 2\n- **Extrait** : « nous avons refait ensemble la mesure devant toute l'équipe réunie »\n- **Date** : hier\n- **Type** : déclaration étayée\n\n#### Pièce 3\n- **Extrait** : « je promets de mieux documenter la prochaine fois »\n- **Type** : déclaration nue\n",
    "leger_J11_9.01_p1": "**Statut** : présence établie\n**Pièces retenues** : P1\n**Confiance** : 0.7",
    "leger_J11_9.01_p2": "**Statut** : présence établie\n**Pièces retenues** : P2\n**Confiance** : 0.6"
   },
   "juge_leger": {
    "passes": 2,
    "contre_lecture": true
   },
   "expected": "[\n  null,\n  {\n    \"lectures\": [\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          1\n        ],\n        \"conf\": 0.7\n      },\n      {\n        \"statut\": \"présence établie\",\n        \"pieces\": [\n          2\n        ],\n        \"conf\": 0.6\n      }\n    ],\n    \"resolution\": \"concordance sans pièces communes ancrables → tribunal\"\n  },\n  {}\n]\n"
  }
 ]
};

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

describe("journee.sentencesDe — parité CPython", () => {
  it.each(V.sentences.map((c, i) => [i, c]))("cas %d", (_i, c) => {
    expect(dj(sentencesDe(c.texte, c.jid))).toBe(c.out);
  });
});

describe("journee.parseLeger — parité CPython", () => {
  it.each(V.parse_leger.map((c, i) => [i, c]))("cas %d", (_i, c) => {
    expect(dj(parseLeger(c.texte))).toBe(c.out);
  });
});

describe("journee.authenticiteDe — parité CPython", () => {
  it.each(V.authenticite.map((c, i) => [i, c]))("cas %d", (_i, c) => {
    expect(dj(authenticiteDe(c.texte))).toBe(c.out);
  });
});

describe("journee.suspicion — parité CPython (questions mot pour mot)", () => {
  const JR_S = { id: "J01", date: "2026-03-10" };
  it.each(V.suspicion.map((c) => [c.args[2], c]))("source %s", (_s, c) => {
    const [code, nom, source, extrait, detail] = c.args;
    expect(dj(suspicion(code, nom, JR_S, source, extrait, detail))).toBe(c.out);
  });
});

describe("journee.verdictAbsent — parité CPython", () => {
  it.each(V.verdict_absent.map((c) => [c.code, c]))("%s", (_code, c) => {
    expect(dj(verdictAbsent(c.code, c.nom, pyf(c.cons)))).toBe(c.out);
  });
});

describe("journee.blocCalques — parité CPython", () => {
  it("dédup (start, end, model), troncature 240, neutralisation, max 10 lignes", () => {
    const B = V.bloc_calques;
    expect(blocCalques({ texte: B.texte }, pyf(B.c))).toBe(B.out);
  });
});

describe("journee.consensus — parité CPython", () => {
  const C = V.consensus;
  // même mini-pôle que le générateur Python (l'ordre du référentiel fixe
  // l'ordre des clés de la sortie)
  const POLE_CONS = new Pole(1, "# Pôle 1 — factice\n", [
    { code: "1.01", nom: "Analyse critique", fiche_md: "## 1.01 — Analyse critique\nFiche." },
    { code: "1.03", nom: "Synthèse écrite", fiche_md: "## 1.03 — Synthèse écrite\nFiche." },
    { code: "1.04", nom: "Curiosité méthodique", fiche_md: "## 1.04 — Curiosité méthodique\nFiche." },
    { code: "1.07", nom: "Vérification des sources", fiche_md: "## 1.07 — Vérification\nFiche." },
  ]);
  const spans = pyf(C.spans);
  const segs = segments("", spans, C.poids_total.__f__);

  it("segments intermédiaires identiques", () => {
    expect(dj(segs)).toBe(C.segs);
  });

  it("collège multi-familles : corroborée / à instruire / non détectée / minoritaire", () => {
    expect(dj(consensus(spans, segs, pyf(C.roster1), [POLE_CONS], SEUILS_CONSENSUS))).toBe(C.out1);
  });

  it("collège mono-famille : la corroboration mesure la stabilité (≥ 2 lectures)", () => {
    expect(dj(consensus(spans, segs, pyf(C.roster2), [POLE_CONS], SEUILS_CONSENSUS))).toBe(C.out2);
  });
});

describe("journee.empreinteJournee — parité CPython (clé de reprise)", () => {
  const JR = { texte: V.integration.raw };
  it.each(V.empreinte.map((c, i) => [i, c]))("cas %d", (_i, c) => {
    expect(empreinteJournee(JR, pyf(c.roster), pyf(c.config))).toBe(c.out);
  });
});

// ── juge léger : greffier + N passes + résolution mécanique (backend scripté) ─
// Le faux backend est dupliqué à l'identique côté Python (duck-typing sur
// .call) : sortie = canned[label], label inconnu → « panne simulée ».
function fakeBackend(canned) {
  return {
    call: async (_prompt, opts) => {
      const lbl = opts.label;
      if (Object.prototype.hasOwnProperty.call(canned, lbl)) return canned[lbl];
      throw new Error("panne simulée");
    },
  };
}

describe("journee.jugerLeger — table de vérité du routage (parité CPython)", () => {
  const RAWJ = V.integration.raw;
  const COMP_U = {
    code: "9.01",
    nom: "Compétence fictive",
    fiche_md: "## 9.01 — Compétence fictive\n\nFiche factice pour le juge léger.\n",
  };
  const POLE_U = new Pole(1, "# Pôle 1 — test juge léger\n", [COMP_U]);
  const JR_U = {
    id: "J11",
    date: "2026-03-10",
    titre: "Four solaire",
    texte: RAWJ,
    sentences: sentencesDe(RAWJ, "J11"),
  };

  it.each(V.juger_leger.map((c) => [c.name, c]))("%s", async (_name, c) => {
    const ctx = {
      config: {
        juge_leger: pyf(c.juge_leger),
        backend_tribunal: { kind: "fake", model: "fake-heavy", model_mini: "fake-mini" },
      },
      journees_dir: "journees",
      artefacts: memArtefacts(),
      backend_tribunal: fakeBackend(c.canned),
      rapide: null,
    };
    const CONS_U = {
      spans: [{ start: 33, end: 120, model: "alpha", conf: new PyFloat(0.9) }],
      sous_seuil: [],
    };
    /** @type {Record<string, number>} */
    const day = {};
    const inc = (k, n = 1) => {
      day[k] = (day[k] || 0) + n;
    };
    const [v, d] = await jugerLeger(ctx, JR_U, POLE_U, COMP_U, CONS_U, inc);
    expect(dj([v, d, day])).toBe(c.expected);
  });
});

// ── cartographierJournee : pipeline complet en mock (sans tribunal) ──────────
describe("journee.cartographierJournee — intégration mock (parité CPython)", () => {
  const I = V.integration;
  const JR = { ...I.jr, texte: I.raw };
  const ROSTER = pyf(I.roster);
  const POLES = I.poles.map((p) => new Pole(p.num, p.header, p.competences));
  const JID = I.jr.id;

  function mkBackends() {
    /** @type {Record<string, MockBackend>} */
    const out = {};
    for (const m of ROSTER) out[m.name] = new MockBackend({ salt: I.salt, model: m.name });
    return out;
  }

  function mkCtx(artefacts, calquesStore, { config = pyf(I.config), bt = null, ts = I.ts1 } = {}) {
    return {
      config,
      poles: POLES,
      artefacts,
      calquesStore,
      logs_dir: "journees", // comme twin9.py : logs_dir == journees_dir
      journees_dir: "journees",
      base_dir: "BASE",
      backend_tribunal: bt || new MockBackend({ salt: I.salt, model: "mock-heavy" }),
      rapide: null,
      incidents: {},
      horodatage: () => ts,
    };
  }

  it("R1 run complet + R2 reprise (empreinte identique) + R3 lecteurs fantômes plafonnés", async () => {
    const artefacts = memArtefacts();
    const calques = memCalquesStore();
    const ctx = mkCtx(artefacts, calques);

    // — R1 : carto, calques du run, magasin persistant, stats rehydratées —
    const carto1 = await cartographierJournee(ctx, JR, ROSTER, mkBackends());
    expect(dj(carto1)).toBe(I.r1.carto);
    expect(dj(artefacts.readJson(`journees/${JID}/carto_jour.json`))).toBe(I.r1.carto);
    for (const [fn, bytes] of Object.entries(I.r1.tags)) {
      expect(dj(artefacts.readJson(`journees/${JID}/${fn}`))).toBe(bytes);
    }
    expect(dj(calques.get(JID))).toBe(I.r1.store);
    expect(dj(ctx.incidents)).toBe(I.r1.incidents);
    expect(dj(ctx.ancrage_stats)).toBe(I.r1.ancrage_stats);

    // — R2 : reprise sur empreinte identique (0 appel LLM, rehydratation) —
    const carto2 = await cartographierJournee(ctx, JR, ROSTER, mkBackends());
    expect(dj(carto2)).toBe(I.r1.carto);
    expect(dj(ctx.incidents)).toBe(I.r2.incidents);
    expect(dj(ctx.ancrage_stats)).toBe(I.r2.ancrage_stats);

    // — R3 : nouveau run (artefacts vierges), MÊME magasin de calques →
    // les calques archivés rejoignent la superposition, plafonnés à 2 —
    const artefacts3 = memArtefacts();
    const ctx3 = mkCtx(artefacts3, calques, { config: pyf(I.config3), ts: I.ts2 });
    const carto3 = await cartographierJournee(ctx3, JR, ROSTER, mkBackends());
    expect(dj(carto3)).toBe(I.r3.carto);
    expect(dj(calques.get(JID))).toBe(I.r3.store);
  });

  it("R4 greffier « DOSSIER VIDE » → tribunal-court-circuit + déclassement stigmergique", async () => {
    const artefacts = memArtefacts();
    const calques = memCalquesStore();
    const inner = new MockBackend({ salt: I.salt, model: "mock-heavy" });
    // même wrapper que côté Python : le greffier de vide_code court-circuite
    const bt = {
      call: async (prompt, opts) =>
        opts.task === "greffier" && opts.meta && opts.meta.code === I.r4.vide_code
          ? I.r4.vide_texte
          : inner.call(prompt, opts),
    };
    const ctx = mkCtx(artefacts, calques, { bt });
    const carto = await cartographierJournee(ctx, JR, ROSTER, mkBackends());
    expect(dj(carto)).toBe(I.r4.carto);
    // calques élagués : les tags du code rejeté sont déplacés (juge = marque)
    for (const [fn, bytes] of Object.entries(I.r4.elagues)) {
      expect(dj(artefacts.readJson(`journees/${JID}/${fn}`))).toBe(bytes);
    }
    expect(dj(calques.get(JID))).toBe(I.r4.store);
  });
});
