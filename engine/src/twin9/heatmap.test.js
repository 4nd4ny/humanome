// Tests de parité bit-à-bit de heatmap.js contre aurora/heatmap.py (CPython).
// Vecteurs générés UNE FOIS via python3 (scratchpad/gen_journee_vectors.py,
// section HEATMAP : ancrer → segments → fusion → marks → sorties → viewer)
// puis FIGÉS ci-dessous — les tests n'exécutent jamais Python.
// Chaque sortie attendue est la chaîne json.dumps(obj, ensure_ascii=False,
// indent=2) + "\n" de CPython (profil write_json) : la comparaison se fait
// sur les OCTETS sérialisés, distinction int/float comprise.

import { describe, expect, it } from "vitest";

import { memArtefacts } from "./artefacts.js";
import {
  ancrer,
  ecrireSorties,
  ecrireViewer,
  fusionSpansModele,
  htmlEscapeMin,
  insererMarks,
  segments,
} from "./heatmap.js";
import { PyFloat, codePointCompare, pyJsonDumpsWriteJson } from "./py/pyJson.js";

const V = {
 "ancrer_segments": {
  "raw": "# Journal du four solaire\n\nL'élève a présenté son « prototype » devant la classe entière du matin, puis il a noté chaque retour dans son carnet de bord.\nAprès la pause, l'équipe a mesuré l'angle des miroirs avec un rapporteur artisanal fabriqué la veille.\nLe soir venu, chacun a rédigé une synthèse honnête des erreurs commises et des corrections prévues.\n\nCe long paragraphe décrit minutieusement la construction du four solaire : étape 1, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 2, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 3, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 4, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 5, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 6, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 7, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 8, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 9, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 10, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 11, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 12, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 13, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 14, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; enfin, la calibration complète a duré toute la matinée.\n",
  "tags": {
   "alpha": [
    {
     "competence": "1.01",
     "extrait": "L'élève a présenté son « prototype » devant la classe entière du matin, puis il a noté chaque retour dans son carnet de bord.",
     "confiance": {
      "__f__": 0.9
     },
     "justification": "Acte daté décrit."
    },
    {
     "competence": "1.03",
     "extrait": "après la pause, l'équipe a mesuré l'angle des miroirs avec un rapporteur artisanal fabriqué la veille.",
     "confiance": {
      "__f__": 0.75
     },
     "justification": "Mesure instrumentée."
    }
   ],
   "beta": [
    {
     "competence": "4.03",
     "extrait": "Le soir, chacun a rédigé une synthèse honnête des erreurs faites et des corrections prévues.",
     "confiance": {
      "__f__": 0.6
     },
     "justification": "Synthèse réflexive."
    },
    {
     "competence": "1.01",
     "extrait": "Phrase totalement absente du texte source pour tester le rejet.",
     "confiance": {
      "__f__": 0.7
     },
     "justification": "Hallucination volontaire."
    }
   ],
   "gamma": [
    {
     "competence": "4.07",
     "extrait": "Ce long paragraphe décrit minutieusement la construction du four solaire : étape 1, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 2, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 3, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 4, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 5, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 6, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 7, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 8, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 9, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 10, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 11, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 12, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 13, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 14, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; enfin, la calibration complète a duré toute la matinée.",
     "confiance": {
      "__f__": 0.5
     },
     "justification": "Paragraphe entier (troncature attendue)."
    },
    {
     "competence": "1.01",
     "extrait": "il a noté chaque retour dans son carnet de bord.",
     "confiance": {
      "__f__": 0.45
     },
     "justification": "Recoupe le span d'alpha."
    }
   ]
  },
  "roster": [
   {
    "name": "alpha",
    "weight": {
     "__f__": 1.0
    }
   },
   {
    "name": "beta",
    "weight": {
     "__f__": 0.5
    }
   },
   {
    "name": "gamma"
   }
  ],
  "poids_total": {
   "__f__": 2.5
  },
  "spans": "[\n  {\n    \"start\": 27,\n    \"end\": 152,\n    \"model\": \"alpha\",\n    \"code\": \"1.01\",\n    \"conf\": 0.9,\n    \"poids\": 1.0,\n    \"justification\": \"Acte daté décrit.\",\n    \"ratio\": 1.0,\n    \"tronque\": false\n  },\n  {\n    \"start\": 153,\n    \"end\": 255,\n    \"model\": \"alpha\",\n    \"code\": \"1.03\",\n    \"conf\": 0.75,\n    \"poids\": 1.0,\n    \"justification\": \"Mesure instrumentée.\",\n    \"ratio\": 0.99,\n    \"tronque\": false\n  },\n  {\n    \"start\": 261,\n    \"end\": 353,\n    \"model\": \"beta\",\n    \"code\": \"4.03\",\n    \"conf\": 0.6,\n    \"poids\": 0.5,\n    \"justification\": \"Synthèse réflexive.\",\n    \"ratio\": 0.891,\n    \"tronque\": false\n  },\n  {\n    \"start\": 357,\n    \"end\": 1557,\n    \"model\": \"gamma\",\n    \"code\": \"4.07\",\n    \"conf\": 0.5,\n    \"poids\": 1.0,\n    \"justification\": \"Paragraphe entier (troncature attendue).\",\n    \"ratio\": 1.0,\n    \"tronque\": true\n  },\n  {\n    \"start\": 104,\n    \"end\": 152,\n    \"model\": \"gamma\",\n    \"code\": \"1.01\",\n    \"conf\": 0.45,\n    \"poids\": 1.0,\n    \"justification\": \"Recoupe le span d'alpha.\",\n    \"ratio\": 1.0,\n    \"tronque\": false\n  }\n]\n",
  "rejets": "[\n  {\n    \"model\": \"beta\",\n    \"competence\": \"1.01\",\n    \"extrait\": \"Phrase totalement absente du texte source pour tester le rejet.\",\n    \"motif\": \"non ancré (citation introuvable)\"\n  }\n]\n",
  "segs": "[\n  {\n    \"start\": 27,\n    \"end\": 104,\n    \"heat\": 0.36,\n    \"models\": [\n      \"alpha\"\n    ],\n    \"comps\": [\n      \"1.01\"\n    ],\n    \"conf_moyenne\": 0.9,\n    \"details\": [\n      {\n        \"model\": \"alpha\",\n        \"code\": \"1.01\",\n        \"conf\": 0.9\n      }\n    ]\n  },\n  {\n    \"start\": 104,\n    \"end\": 152,\n    \"heat\": 0.54,\n    \"models\": [\n      \"alpha\",\n      \"gamma\"\n    ],\n    \"comps\": [\n      \"1.01\"\n    ],\n    \"conf_moyenne\": 0.675,\n    \"details\": [\n      {\n        \"model\": \"alpha\",\n        \"code\": \"1.01\",\n        \"conf\": 0.9\n      },\n      {\n        \"model\": \"gamma\",\n        \"code\": \"1.01\",\n        \"conf\": 0.45\n      }\n    ]\n  },\n  {\n    \"start\": 153,\n    \"end\": 255,\n    \"heat\": 0.3,\n    \"models\": [\n      \"alpha\"\n    ],\n    \"comps\": [\n      \"1.03\"\n    ],\n    \"conf_moyenne\": 0.75,\n    \"details\": [\n      {\n        \"model\": \"alpha\",\n        \"code\": \"1.03\",\n        \"conf\": 0.75\n      }\n    ]\n  },\n  {\n    \"start\": 261,\n    \"end\": 353,\n    \"heat\": 0.12,\n    \"models\": [\n      \"beta\"\n    ],\n    \"comps\": [\n      \"4.03\"\n    ],\n    \"conf_moyenne\": 0.6,\n    \"details\": [\n      {\n        \"model\": \"beta\",\n        \"code\": \"4.03\",\n        \"conf\": 0.6\n      }\n    ]\n  },\n  {\n    \"start\": 357,\n    \"end\": 1557,\n    \"heat\": 0.2,\n    \"models\": [\n      \"gamma\"\n    ],\n    \"comps\": [\n      \"4.07\"\n    ],\n    \"conf_moyenne\": 0.5,\n    \"details\": [\n      {\n        \"model\": \"gamma\",\n        \"code\": \"4.07\",\n        \"conf\": 0.5\n      }\n    ]\n  }\n]\n",
  "fusion": "[\n  [\n    27,\n    152,\n    [\n      \"1.01\"\n    ],\n    0.9\n  ],\n  [\n    153,\n    255,\n    [\n      \"1.03\"\n    ],\n    0.75\n  ],\n  [\n    357,\n    1557,\n    [\n      \"4.07\"\n    ],\n    0.5\n  ]\n]\n"
 },
 "inserer_marks": {
  "raw": "# Journal du four solaire\n\nL'élève a présenté son « prototyp",
  "marks": [
   [
    5,
    20,
    "data-x=\"1\""
   ],
   [
    10,
    15,
    "data-y=\"2\""
   ],
   [
    30,
    40,
    "data-z=\"3\""
   ],
   [
    30,
    40,
    "data-a=\"0\""
   ],
   [
    2,
    8,
    "data-w=\"9\""
   ]
  ],
  "out": "# <mark data-w=\"9\">Journa</mark>l <mark data-y=\"2\">du fo</mark>ur solaire\n\nL'é<mark data-a=\"0\">lève a pré</mark>senté son « prototyp"
 },
 "sorties": {
  "competences_noms": {
   "1.01": "Analyse critique",
   "1.03": "Synthèse écrite",
   "4.03": "Discernement éthique",
   "4.07": "Débat contradictoire"
  },
  "consensus": {
   "1.01": {
    "statut": "corroborée",
    "ratio": {
     "__f__": 0.667
    }
   },
   "4.07": {
    "statut": "minoritaire",
    "ratio": {
     "__f__": 0.333
    }
   }
  },
  "rollup": "{\n  \"1.01\": {\n    \"modeles\": {\n      \"alpha\": 1,\n      \"gamma\": 1\n    },\n    \"n_spans\": 2,\n    \"max_heat\": 0.54\n  },\n  \"1.03\": {\n    \"modeles\": {\n      \"alpha\": 1\n    },\n    \"n_spans\": 1,\n    \"max_heat\": 0.3\n  },\n  \"4.03\": {\n    \"modeles\": {\n      \"beta\": 1\n    },\n    \"n_spans\": 1,\n    \"max_heat\": 0.12\n  },\n  \"4.07\": {\n    \"modeles\": {\n      \"gamma\": 1\n    },\n    \"n_spans\": 1,\n    \"max_heat\": 0.2\n  }\n}\n",
  "files": {
   "tagged/alpha.md": "# Journal du four solaire\n\n<mark data-model=\"alpha\" data-comps=\"1.01\" data-conf=\"0.90\">L'élève a présenté son « prototype » devant la classe entière du matin, puis il a noté chaque retour dans son carnet de bord.</mark>\n<mark data-model=\"alpha\" data-comps=\"1.03\" data-conf=\"0.75\">Après la pause, l'équipe a mesuré l'angle des miroirs avec un rapporteur artisanal fabriqué la veille.</mark>\nLe soir venu, chacun a rédigé une synthèse honnête des erreurs commises et des corrections prévues.\n\nCe long paragraphe décrit minutieusement la construction du four solaire : étape 1, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 2, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 3, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 4, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 5, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 6, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 7, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 8, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 9, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 10, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 11, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 12, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 13, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 14, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; enfin, la calibration complète a duré toute la matinée.\n",
   "tagged/beta.md": "# Journal du four solaire\n\nL'élève a présenté son « prototype » devant la classe entière du matin, puis il a noté chaque retour dans son carnet de bord.\nAprès la pause, l'équipe a mesuré l'angle des miroirs avec un rapporteur artisanal fabriqué la veille.\nLe so<mark data-model=\"beta\" data-comps=\"4.03\" data-conf=\"0.60\">ir venu, chacun a rédigé une synthèse honnête des erreurs commises et des corrections prévue</mark>s.\n\nCe long paragraphe décrit minutieusement la construction du four solaire : étape 1, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 2, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 3, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 4, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 5, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 6, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 7, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 8, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 9, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 10, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 11, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 12, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 13, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 14, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; enfin, la calibration complète a duré toute la matinée.\n",
   "tagged/gamma.md": "# Journal du four solaire\n\nL'élève a présenté son « prototype » devant la classe entière du matin, puis <mark data-model=\"gamma\" data-comps=\"1.01\" data-conf=\"0.45\">il a noté chaque retour dans son carnet de bord.</mark>\nAprès la pause, l'équipe a mesuré l'angle des miroirs avec un rapporteur artisanal fabriqué la veille.\nLe soir venu, chacun a rédigé une synthèse honnête des erreurs commises et des corrections prévues.\n\n<mark data-model=\"gamma\" data-comps=\"4.07\" data-conf=\"0.50\">Ce long paragraphe décrit minutieusement la construction du four solaire : étape 1, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 2, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 3, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 4, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 5, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 6, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 7, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 8, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 9, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 10, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 11, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 12, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 13, mesurer, découper, ajuster et vérifier chaqu</mark>e miroir avant l'assemblage final ; étape 14, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; enfin, la calibration complète a duré toute la matinée.\n",
   "portfolio.heat.md": "# Journal du four solaire\n\n<mark data-heat=\"0.36\" data-models=\"alpha\" data-comps=\"1.01\">L'élève a présenté son « prototype » devant la classe entière du matin, puis </mark><mark data-heat=\"0.54\" data-models=\"alpha,gamma\" data-comps=\"1.01\">il a noté chaque retour dans son carnet de bord.</mark>\n<mark data-heat=\"0.30\" data-models=\"alpha\" data-comps=\"1.03\">Après la pause, l'équipe a mesuré l'angle des miroirs avec un rapporteur artisanal fabriqué la veille.</mark>\nLe so<mark data-heat=\"0.12\" data-models=\"beta\" data-comps=\"4.03\">ir venu, chacun a rédigé une synthèse honnête des erreurs commises et des corrections prévue</mark>s.\n\n<mark data-heat=\"0.20\" data-models=\"gamma\" data-comps=\"4.07\">Ce long paragraphe décrit minutieusement la construction du four solaire : étape 1, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 2, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 3, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 4, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 5, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 6, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 7, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 8, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 9, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 10, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 11, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 12, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 13, mesurer, découper, ajuster et vérifier chaqu</mark>e miroir avant l'assemblage final ; étape 14, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; enfin, la calibration complète a duré toute la matinée.\n",
   "heatmap.json": "{\n  \"journal_id\": \"J01\",\n  \"date\": \"2026-03-10\",\n  \"roster\": [\n    \"alpha\",\n    \"beta\",\n    \"gamma\"\n  ],\n  \"segments\": [\n    {\n      \"start\": 27,\n      \"end\": 104,\n      \"heat\": 0.36,\n      \"models\": [\n        \"alpha\"\n      ],\n      \"comps\": [\n        \"1.01\"\n      ],\n      \"conf_moyenne\": 0.9,\n      \"details\": [\n        {\n          \"model\": \"alpha\",\n          \"code\": \"1.01\",\n          \"conf\": 0.9\n        }\n      ]\n    },\n    {\n      \"start\": 104,\n      \"end\": 152,\n      \"heat\": 0.54,\n      \"models\": [\n        \"alpha\",\n        \"gamma\"\n      ],\n      \"comps\": [\n        \"1.01\"\n      ],\n      \"conf_moyenne\": 0.675,\n      \"details\": [\n        {\n          \"model\": \"alpha\",\n          \"code\": \"1.01\",\n          \"conf\": 0.9\n        },\n        {\n          \"model\": \"gamma\",\n          \"code\": \"1.01\",\n          \"conf\": 0.45\n        }\n      ]\n    },\n    {\n      \"start\": 153,\n      \"end\": 255,\n      \"heat\": 0.3,\n      \"models\": [\n        \"alpha\"\n      ],\n      \"comps\": [\n        \"1.03\"\n      ],\n      \"conf_moyenne\": 0.75,\n      \"details\": [\n        {\n          \"model\": \"alpha\",\n          \"code\": \"1.03\",\n          \"conf\": 0.75\n        }\n      ]\n    },\n    {\n      \"start\": 261,\n      \"end\": 353,\n      \"heat\": 0.12,\n      \"models\": [\n        \"beta\"\n      ],\n      \"comps\": [\n        \"4.03\"\n      ],\n      \"conf_moyenne\": 0.6,\n      \"details\": [\n        {\n          \"model\": \"beta\",\n          \"code\": \"4.03\",\n          \"conf\": 0.6\n        }\n      ]\n    },\n    {\n      \"start\": 357,\n      \"end\": 1557,\n      \"heat\": 0.2,\n      \"models\": [\n        \"gamma\"\n      ],\n      \"comps\": [\n        \"4.07\"\n      ],\n      \"conf_moyenne\": 0.5,\n      \"details\": [\n        {\n          \"model\": \"gamma\",\n          \"code\": \"4.07\",\n          \"conf\": 0.5\n        }\n      ]\n    }\n  ],\n  \"par_competence\": {\n    \"1.01\": {\n      \"modeles\": {\n        \"alpha\": 1,\n        \"gamma\": 1\n      },\n      \"n_spans\": 2,\n      \"max_heat\": 0.54\n    },\n    \"1.03\": {\n      \"modeles\": {\n        \"alpha\": 1\n      },\n      \"n_spans\": 1,\n      \"max_heat\": 0.3\n    },\n    \"4.03\": {\n      \"modeles\": {\n        \"beta\": 1\n      },\n      \"n_spans\": 1,\n      \"max_heat\": 0.12\n    },\n    \"4.07\": {\n      \"modeles\": {\n        \"gamma\": 1\n      },\n      \"n_spans\": 1,\n      \"max_heat\": 0.2\n    }\n  },\n  \"rejets\": [\n    {\n      \"model\": \"beta\",\n      \"competence\": \"1.01\",\n      \"extrait\": \"Phrase totalement absente du texte source pour tester le rejet.\",\n      \"motif\": \"non ancré (citation introuvable)\"\n    }\n  ]\n}\n",
   "viewer/heatmap-data.js": "window.HEATMAP_DATA = {\"journal_id\": \"J01\", \"date\": \"2026-03-10\", \"texte\": \"# Journal du four solaire\\n\\nL'élève a présenté son « prototype » devant la classe entière du matin, puis il a noté chaque retour dans son carnet de bord.\\nAprès la pause, l'équipe a mesuré l'angle des miroirs avec un rapporteur artisanal fabriqué la veille.\\nLe soir venu, chacun a rédigé une synthèse honnête des erreurs commises et des corrections prévues.\\n\\nCe long paragraphe décrit minutieusement la construction du four solaire : étape 1, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 2, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 3, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 4, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 5, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 6, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 7, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 8, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 9, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 10, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 11, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 12, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 13, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; étape 14, mesurer, découper, ajuster et vérifier chaque miroir avant l'assemblage final ; enfin, la calibration complète a duré toute la matinée.\\n\", \"segments\": [{\"start\": 27, \"end\": 104, \"heat\": 0.36, \"models\": [\"alpha\"], \"comps\": [\"1.01\"], \"conf_moyenne\": 0.9, \"details\": [{\"model\": \"alpha\", \"code\": \"1.01\", \"conf\": 0.9}]}, {\"start\": 104, \"end\": 152, \"heat\": 0.54, \"models\": [\"alpha\", \"gamma\"], \"comps\": [\"1.01\"], \"conf_moyenne\": 0.675, \"details\": [{\"model\": \"alpha\", \"code\": \"1.01\", \"conf\": 0.9}, {\"model\": \"gamma\", \"code\": \"1.01\", \"conf\": 0.45}]}, {\"start\": 153, \"end\": 255, \"heat\": 0.3, \"models\": [\"alpha\"], \"comps\": [\"1.03\"], \"conf_moyenne\": 0.75, \"details\": [{\"model\": \"alpha\", \"code\": \"1.03\", \"conf\": 0.75}]}, {\"start\": 261, \"end\": 353, \"heat\": 0.12, \"models\": [\"beta\"], \"comps\": [\"4.03\"], \"conf_moyenne\": 0.6, \"details\": [{\"model\": \"beta\", \"code\": \"4.03\", \"conf\": 0.6}]}, {\"start\": 357, \"end\": 1557, \"heat\": 0.2, \"models\": [\"gamma\"], \"comps\": [\"4.07\"], \"conf_moyenne\": 0.5, \"details\": [{\"model\": \"gamma\", \"code\": \"4.07\", \"conf\": 0.5}]}], \"roster\": [\"alpha\", \"beta\", \"gamma\"], \"competences\": {\"1.01\": \"Analyse critique\", \"1.03\": \"Synthèse écrite\", \"4.03\": \"Discernement éthique\", \"4.07\": \"Débat contradictoire\"}, \"consensus\": {\"1.01\": {\"statut\": \"corroborée\", \"ratio\": 0.667}, \"4.07\": {\"statut\": \"minoritaire\", \"ratio\": 0.333}}};\n"
  }
 }
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

const A = V.ancrer_segments;
const RAW = A.raw;
const TAGS = pyf(A.tags);
const ROSTER = pyf(A.roster);
const POIDS_TOTAL = A.poids_total.__f__;

// ancrer + segments partagés entre les tests (mêmes objets que le flux réel)
const [SPANS, REJETS] = ancrer(RAW, TAGS, ROSTER);
const SEGS = segments(RAW, SPANS, POIDS_TOTAL);

describe("heatmap.ancrer — parité CPython", () => {
  it("spans (exact 1.0, normalisé 0.99, approché ≥0.82, tronqué 1200)", () => {
    expect(dj(SPANS)).toBe(A.spans);
  });

  it("rejets (citation introuvable, extrait[:200])", () => {
    expect(dj(REJETS)).toBe(A.rejets);
  });
});

describe("heatmap.segments — parité CPython", () => {
  it("balayage par événements : segments couverts, heat/conf arrondis Python", () => {
    expect(dj(SEGS)).toBe(A.segs);
  });
});

describe("heatmap.fusionSpansModele — parité CPython", () => {
  it("fusion des spans chevauchants (alpha + gamma concaténés)", () => {
    const fus = fusionSpansModele(
      SPANS.filter((sp) => sp.model === "alpha").concat(SPANS.filter((sp) => sp.model === "gamma")),
    );
    const out = fus.map(([s, e, codes, conf]) => [s, e, Array.from(codes).sort(codePointCompare), conf]);
    expect(dj(out)).toBe(A.fusion);
  });
});

describe("heatmap.insererMarks — parité CPython", () => {
  it("tri lexicographique du triplet complet + saut des chevauchements", () => {
    const M = V.inserer_marks;
    const marks = M.marks.map((m) => [m[0], m[1], m[2]]);
    expect(insererMarks(M.raw, marks)).toBe(M.out);
  });

  it("html_escape_min est l'identité", () => {
    expect(htmlEscapeMin("<mark a>&é</mark>")).toBe("<mark a>&é</mark>");
  });
});

describe("heatmap.ecrireSorties / ecrireViewer — parité fichiers CPython", () => {
  const S = V.sorties;
  const artefacts = memArtefacts();
  const ctx = {
    base_dir: "out",
    journal_id: "J01",
    date: "2026-03-10",
    artefacts,
  };
  const rollup = ecrireSorties(ctx, RAW, SPANS, SEGS, REJETS, ROSTER);
  ecrireViewer(ctx, RAW, SEGS, ROSTER, S.competences_noms, pyf(S.consensus));

  it("rollup par compétence (ordre de première apparition)", () => {
    expect(dj(rollup)).toBe(S.rollup);
  });

  it.each(["tagged/alpha.md", "tagged/beta.md", "tagged/gamma.md", "portfolio.heat.md"])(
    "copie annotée %s (marks %.2f, codes triés)",
    (rel) => {
      expect(artefacts.readText("out/" + rel)).toBe(S.files[rel]);
    },
  );

  it("heatmap.json (write_json : indent 2, int/float préservés)", () => {
    expect(dj(artefacts.readJson("out/heatmap.json"))).toBe(S.files["heatmap.json"]);
  });

  it("viewer/heatmap-data.js (json.dumps compact Python, pas JSON.stringify)", () => {
    expect(artefacts.readText("out/viewer/heatmap-data.js")).toBe(S.files["viewer/heatmap-data.js"]);
  });

  it("viewer/heatmap.html absent quand ctx.viewer_html n'est pas fourni", () => {
    expect(artefacts.exists("out/viewer/heatmap.html")).toBe(false);
  });
});
