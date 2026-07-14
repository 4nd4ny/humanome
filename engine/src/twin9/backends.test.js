// Vecteurs générés par CPython 3.14.3 (aurora/backends.py de Twin_v9 — le
// MockBackend est l'ORACLE de parité) puis figés ici — script :
// engine/test/twin9-vectors/gen_backends_vectors.py (+ inject) ; jamais de
// python à l'exécution. 196 cas : chaque branche du dispatch (tagger,
// leger_scan, premiere_impression, condense, arpenteur, retour_sources,
// merge_*, kairos, greffier, accusation/defense/replique/briefing, jure/jure2,
// relance, gardiens, leger, contre_lecture, president, task inconnue),
// salts/models/meta variés, CallRecord inclus (sans `seconds`).
import { afterEach, describe, expect, it } from "vitest";
import {
  Backend,
  CallRecord,
  KINDS,
  MockBackend,
  RETRIES,
  fetchBackend,
  makeBackend,
} from "./backends.js";
import { PyFloat } from "./py/pyJson.js";
import { setLogger } from "./util.js";

const V = {
 "special_codes": {
  "by_h": {
   "0": [
    "3.04",
    "3.08",
    "3.11"
   ],
   "1": [
    "2.01",
    "2.08",
    "2.10"
   ],
   "2": [
    "1.03",
    "2.03",
    "2.11"
   ],
   "3": [
    "1.06",
    "1.10",
    "2.05"
   ],
   "4": [
    "3.02",
    "3.09",
    "5.03"
   ],
   "5": [
    "1.04",
    "1.12",
    "2.07"
   ],
   "6": [
    "1.07",
    "2.06",
    "3.03"
   ],
   "7": [
    "1.02",
    "1.11",
    "3.07"
   ],
   "8": [
    "1.01",
    "2.04",
    "3.01"
   ],
   "9": [
    "1.05",
    "1.08",
    "1.09"
   ]
  },
  "gsupport0": "g030",
  "gsupport1": "g001",
  "grais0": "r002",
  "l8_pair": "2.04",
  "l8_impair": "1.01"
 },
 "cases": [
  {
   "spec": {
    "salt": ""
   },
   "task": "tagger",
   "meta": {
    "codes": [
     [
      "3.04",
      "Nom 3.04"
     ],
     [
      "3.02",
      "Nom 3.02"
     ],
     [
      "1.04",
      "Nom 1.04"
     ],
     [
      "1.07",
      "Nom 1.07"
     ],
     [
      "2.06",
      "Nom 2.06"
     ],
     [
      "1.02",
      "Nom 1.02"
     ],
     [
      "1.01",
      "Nom 1.01"
     ],
     [
      "1.05",
      "Nom 1.05"
     ]
    ],
    "sentences": [
     [
      "F01",
      "Phrase une avec d\u00e9tail dat\u00e9."
     ],
     [
      "F02",
      "Deuxi\u00e8me phrase, plus r\u00e9flexive."
     ],
     [
      "F03",
      "Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral."
     ],
     [
      "F04",
      "Quatri\u00e8me phrase sur le chantier."
     ],
     [
      "F05",
      "Cinqui\u00e8me phrase, un essai chiffr\u00e9."
     ],
     [
      "F06",
      "Sixi\u00e8me phrase qui doute encore."
     ],
     [
      "F07",
      "Septi\u00e8me phrase concr\u00e8te et dat\u00e9e."
     ],
     [
      "F08",
      "Huiti\u00e8me phrase, retour au calme."
     ]
    ],
    "journee": "J01"
   },
   "model": null,
   "label": "tag_m1_J01_P1",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"tags\": [{\"competence\": \"1.04\", \"extrait\": \"Huiti\u00e8me phrase, retour au calme.\", \"confiance\": 0.23, \"justification\": \"Soup\u00e7on t\u00e9nu, confiance honn\u00eate (mock).\"}, {\"competence\": \"2.06\", \"extrait\": \"Cinqui\u00e8me phrase, un essai chiffr\u00e9.\", \"confiance\": 0.91, \"justification\": \"Acte dat\u00e9 correspondant aux manifestations de 2.06.\"}, {\"competence\": \"2.06\", \"extrait\": \"Quatri\u00e8me phrase sur le chantier.\", \"confiance\": 0.75, \"justification\": \"Indice corroboratif.\"}, {\"competence\": \"2.06\", \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simul\u00e9e).\", \"confiance\": 0.7, \"justification\": \"Citation non ancr\u00e9e (test).\"}, {\"competence\": \"1.05\", \"extrait\": \"Deuxi\u00e8me phrase, plus r\u00e9flexive.\", \"confiance\": 0.6, \"justification\": \"Trace possible, lecture propre \u00e0 ce mod\u00e8le.\"}], \"alertes\": []}\n```",
   "record": {
    "label": "tag_m1_J01_P1",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 811,
    "tokens_estimes": 211,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "sel-A",
    "model": "modele-B"
   },
   "task": "tagger",
   "meta": {
    "codes": [
     [
      "3.04",
      "Nom 3.04"
     ],
     [
      "3.02",
      "Nom 3.02"
     ],
     [
      "1.04",
      "Nom 1.04"
     ],
     [
      "1.07",
      "Nom 1.07"
     ],
     [
      "2.06",
      "Nom 2.06"
     ],
     [
      "1.02",
      "Nom 1.02"
     ],
     [
      "1.01",
      "Nom 1.01"
     ],
     [
      "1.05",
      "Nom 1.05"
     ]
    ],
    "sentences": [
     [
      "F01",
      "Phrase une avec d\u00e9tail dat\u00e9."
     ],
     [
      "F02",
      "Deuxi\u00e8me phrase, plus r\u00e9flexive."
     ],
     [
      "F03",
      "Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral."
     ],
     [
      "F04",
      "Quatri\u00e8me phrase sur le chantier."
     ],
     [
      "F05",
      "Cinqui\u00e8me phrase, un essai chiffr\u00e9."
     ],
     [
      "F06",
      "Sixi\u00e8me phrase qui doute encore."
     ],
     [
      "F07",
      "Septi\u00e8me phrase concr\u00e8te et dat\u00e9e."
     ],
     [
      "F08",
      "Huiti\u00e8me phrase, retour au calme."
     ]
    ],
    "journee": "J01"
   },
   "model": null,
   "label": "tag_m2_J01_P1",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"tags\": [{\"competence\": \"3.02\", \"extrait\": \"Huiti\u00e8me phrase, retour au calme.\", \"confiance\": 0.23, \"justification\": \"Soup\u00e7on t\u00e9nu, confiance honn\u00eate (mock).\"}, {\"competence\": \"1.01\", \"extrait\": \"Cinqui\u00e8me phrase, un essai chiffr\u00e9.\", \"confiance\": 0.7, \"justification\": \"Trace possible, lecture propre \u00e0 ce mod\u00e8le.\"}], \"alertes\": []}\n```",
   "record": {
    "label": "tag_m2_J01_P1",
    "model": "modele-B",
    "prompt_chars": 36,
    "response_chars": 344,
    "tokens_estimes": 95,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": 7
   },
   "task": "tagger",
   "meta": {
    "codes": [
     [
      "1.01",
      "Nom 1.01"
     ],
     [
      "1.02",
      "Nom 1.02"
     ],
     [
      "1.03",
      "Nom 1.03"
     ],
     [
      "1.04",
      "Nom 1.04"
     ],
     [
      "1.05",
      "Nom 1.05"
     ],
     [
      "1.06",
      "Nom 1.06"
     ],
     [
      "1.07",
      "Nom 1.07"
     ],
     [
      "1.08",
      "Nom 1.08"
     ],
     [
      "1.10",
      "Nom 1.10"
     ],
     [
      "1.11",
      "Nom 1.11"
     ],
     [
      "1.12",
      "Nom 1.12"
     ],
     [
      "2.01",
      "Nom 2.01"
     ],
     [
      "2.03",
      "Nom 2.03"
     ],
     [
      "2.04",
      "Nom 2.04"
     ],
     [
      "2.06",
      "Nom 2.06"
     ],
     [
      "2.08",
      "Nom 2.08"
     ],
     [
      "3.02",
      "Nom 3.02"
     ],
     [
      "3.04",
      "Nom 3.04"
     ],
     [
      "3.08",
      "Nom 3.08"
     ],
     [
      "3.09",
      "Nom 3.09"
     ]
    ],
    "sentences": [
     [
      "F01",
      "Phrase une avec d\u00e9tail dat\u00e9."
     ],
     [
      "F02",
      "Deuxi\u00e8me phrase, plus r\u00e9flexive."
     ],
     [
      "F03",
      "Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral."
     ],
     [
      "F04",
      "Quatri\u00e8me phrase sur le chantier."
     ],
     [
      "F05",
      "Cinqui\u00e8me phrase, un essai chiffr\u00e9."
     ],
     [
      "F06",
      "Sixi\u00e8me phrase qui doute encore."
     ],
     [
      "F07",
      "Septi\u00e8me phrase concr\u00e8te et dat\u00e9e."
     ],
     [
      "F08",
      "Huiti\u00e8me phrase, retour au calme."
     ]
    ],
    "journee": "2026-01-05_a"
   },
   "model": "gpt-x",
   "label": "tag_gpt-x_2026-01-05_a_P3",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"tags\": [{\"competence\": \"1.01\", \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simul\u00e9e).\", \"confiance\": 0.7, \"justification\": \"Citation non ancr\u00e9e (test).\"}, {\"competence\": \"1.04\", \"extrait\": \"Huiti\u00e8me phrase, retour au calme.\", \"confiance\": 0.3, \"justification\": \"Soup\u00e7on t\u00e9nu, confiance honn\u00eate (mock).\"}, {\"competence\": \"1.05\", \"extrait\": \"Cinqui\u00e8me phrase, un essai chiffr\u00e9.\", \"confiance\": 0.63, \"justification\": \"Trace possible, lecture propre \u00e0 ce mod\u00e8le.\"}, {\"competence\": \"1.05\", \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simul\u00e9e).\", \"confiance\": 0.7, \"justification\": \"Citation non ancr\u00e9e (test).\"}, {\"competence\": \"1.07\", \"extrait\": \"Sixi\u00e8me phrase qui doute encore.\", \"confiance\": 0.87, \"justification\": \"Acte dat\u00e9 correspondant aux manifestations de 1.07.\"}, {\"competence\": \"1.07\", \"extrait\": \"Cinqui\u00e8me phrase, un essai chiffr\u00e9.\", \"confiance\": 0.69, \"justification\": \"Indice corroboratif.\"}, {\"competence\": \"1.12\", \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simul\u00e9e).\", \"confiance\": 0.7, \"justification\": \"Citation non ancr\u00e9e (test).\"}, {\"competence\": \"2.06\", \"extrait\": \"Cinqui\u00e8me phrase, un essai chiffr\u00e9.\", \"confiance\": 0.88, \"justification\": \"Acte dat\u00e9 correspondant aux manifestations de 2.06.\"}], \"alertes\": []}\n```",
   "record": {
    "label": "tag_gpt-x_2026-01-05_a_P3",
    "model": "gpt-x",
    "prompt_chars": 36,
    "response_chars": 1324,
    "tokens_estimes": 340,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "z"
   },
   "task": "tagger",
   "meta": {
    "codes": [
     [
      "1.01",
      "Nom 1.01"
     ],
     [
      "1.02",
      "Nom 1.02"
     ],
     [
      "1.03",
      "Nom 1.03"
     ],
     [
      "1.04",
      "Nom 1.04"
     ],
     [
      "1.05",
      "Nom 1.05"
     ],
     [
      "1.06",
      "Nom 1.06"
     ],
     [
      "1.07",
      "Nom 1.07"
     ],
     [
      "1.08",
      "Nom 1.08"
     ],
     [
      "1.10",
      "Nom 1.10"
     ],
     [
      "1.11",
      "Nom 1.11"
     ],
     [
      "1.12",
      "Nom 1.12"
     ],
     [
      "2.01",
      "Nom 2.01"
     ],
     [
      "2.03",
      "Nom 2.03"
     ],
     [
      "2.04",
      "Nom 2.04"
     ],
     [
      "2.06",
      "Nom 2.06"
     ],
     [
      "2.08",
      "Nom 2.08"
     ],
     [
      "3.02",
      "Nom 3.02"
     ],
     [
      "3.04",
      "Nom 3.04"
     ],
     [
      "3.08",
      "Nom 3.08"
     ],
     [
      "3.09",
      "Nom 3.09"
     ]
    ],
    "sentences": [
     [
      "J02_s1",
      "Une seule matin\u00e9e au jardin."
     ],
     [
      "J02_s2",
      "L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb."
     ],
     [
      "J02_s3",
      "Le soir, notes rapides."
     ]
    ],
    "journee": ""
   },
   "model": "claude-y",
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"tags\": [{\"competence\": \"1.02\", \"extrait\": \"Le soir, notes rapides.\", \"confiance\": 0.94, \"justification\": \"Acte dat\u00e9 correspondant aux manifestations de 1.02.\"}, {\"competence\": \"1.05\", \"extrait\": \"Une seule matin\u00e9e au jardin.\", \"confiance\": 0.64, \"justification\": \"Trace possible, lecture propre \u00e0 ce mod\u00e8le.\"}, {\"competence\": \"1.07\", \"extrait\": \"L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb.\", \"confiance\": 0.89, \"justification\": \"Acte dat\u00e9 correspondant aux manifestations de 1.07.\"}, {\"competence\": \"1.07\", \"extrait\": \"Le soir, notes rapides.\", \"confiance\": 0.79, \"justification\": \"Indice corroboratif.\"}, {\"competence\": \"1.08\", \"extrait\": \"Le soir, notes rapides.\", \"confiance\": 0.54, \"justification\": \"Trace possible, lecture propre \u00e0 ce mod\u00e8le.\"}, {\"competence\": \"1.11\", \"extrait\": \"Le soir, notes rapides.\", \"confiance\": 0.89, \"justification\": \"Acte dat\u00e9 correspondant aux manifestations de 1.11.\"}, {\"competence\": \"1.11\", \"extrait\": \"Une seule matin\u00e9e au jardin.\", \"confiance\": 0.73, \"justification\": \"Indice corroboratif.\"}, {\"competence\": \"2.04\", \"extrait\": \"Une seule matin\u00e9e au jardin.\", \"confiance\": 0.51, \"justification\": \"Trace possible, lecture propre \u00e0 ce mod\u00e8le.\"}, {\"competence\": \"2.06\", \"extrait\": \"Le soir, notes rapides.\", \"confiance\": 0.81, \"justification\": \"Acte dat\u00e9 correspondant aux manifestations de 2.06.\"}, {\"competence\": \"3.09\", \"extrait\": \"Le soir, notes rapides.\", \"confiance\": 0.3, \"justification\": \"Soup\u00e7on t\u00e9nu, confiance honn\u00eate (mock).\"}], \"alertes\": []}\n```",
   "record": {
    "label": "tagger",
    "model": "claude-y",
    "prompt_chars": 36,
    "response_chars": 1495,
    "tokens_estimes": 382,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "q"
   },
   "task": "tagger",
   "meta": {
    "codes": [
     [
      "3.04",
      "Nom 3.04"
     ],
     [
      "3.02",
      "Nom 3.02"
     ],
     [
      "1.04",
      "Nom 1.04"
     ],
     [
      "1.07",
      "Nom 1.07"
     ],
     [
      "2.06",
      "Nom 2.06"
     ],
     [
      "1.02",
      "Nom 1.02"
     ],
     [
      "1.01",
      "Nom 1.01"
     ],
     [
      "1.05",
      "Nom 1.05"
     ]
    ],
    "sentences": [],
    "journee": "J09"
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"tags\": [], \"alertes\": []}\n```",
   "record": {
    "label": "tagger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 39,
    "tokens_estimes": 18,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": ""
   },
   "task": "tagger",
   "meta": {
    "codes": [],
    "sentences": [
     [
      "F01",
      "Phrase une avec d\u00e9tail dat\u00e9."
     ],
     [
      "F02",
      "Deuxi\u00e8me phrase, plus r\u00e9flexive."
     ],
     [
      "F03",
      "Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral."
     ],
     [
      "F04",
      "Quatri\u00e8me phrase sur le chantier."
     ],
     [
      "F05",
      "Cinqui\u00e8me phrase, un essai chiffr\u00e9."
     ],
     [
      "F06",
      "Sixi\u00e8me phrase qui doute encore."
     ],
     [
      "F07",
      "Septi\u00e8me phrase concr\u00e8te et dat\u00e9e."
     ],
     [
      "F08",
      "Huiti\u00e8me phrase, retour au calme."
     ]
    ],
    "journee": "J01"
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"tags\": [], \"alertes\": []}\n```",
   "record": {
    "label": "tagger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 39,
    "tokens_estimes": 18,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "freq"
   },
   "task": "tagger",
   "meta": {
    "codes": [
     [
      "1.07",
      "Nom 1.07"
     ],
     [
      "2.06",
      "Nom 2.06"
     ],
     [
      "1.02",
      "Nom 1.02"
     ],
     [
      "1.11",
      "Nom 1.11"
     ]
    ],
    "sentences": [
     [
      "J02_s1",
      "Une seule matin\u00e9e au jardin."
     ],
     [
      "J02_s2",
      "L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb."
     ],
     [
      "J02_s3",
      "Le soir, notes rapides."
     ]
    ],
    "journee": "J01"
   },
   "model": "m-freq",
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"tags\": [{\"competence\": \"1.07\", \"extrait\": \"L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb.\", \"confiance\": 0.85, \"justification\": \"Acte dat\u00e9 correspondant aux manifestations de 1.07.\"}, {\"competence\": \"2.06\", \"extrait\": \"Le soir, notes rapides.\", \"confiance\": 0.81, \"justification\": \"Acte dat\u00e9 correspondant aux manifestations de 2.06.\"}, {\"competence\": \"2.06\", \"extrait\": \"Une seule matin\u00e9e au jardin.\", \"confiance\": 0.74, \"justification\": \"Indice corroboratif.\"}], \"alertes\": []}\n```",
   "record": {
    "label": "tagger",
    "model": "m-freq",
    "prompt_chars": 36,
    "response_chars": 482,
    "tokens_estimes": 129,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "freq"
   },
   "task": "tagger",
   "meta": {
    "codes": [
     [
      "1.07",
      "Nom 1.07"
     ],
     [
      "2.06",
      "Nom 2.06"
     ],
     [
      "1.02",
      "Nom 1.02"
     ],
     [
      "1.11",
      "Nom 1.11"
     ]
    ],
    "sentences": [
     [
      "J02_s1",
      "Une seule matin\u00e9e au jardin."
     ],
     [
      "J02_s2",
      "L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb."
     ],
     [
      "J02_s3",
      "Le soir, notes rapides."
     ]
    ],
    "journee": "J02"
   },
   "model": "m-freq",
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"tags\": [{\"competence\": \"2.06\", \"extrait\": \"Le soir, notes rapides.\", \"confiance\": 0.93, \"justification\": \"Acte dat\u00e9 correspondant aux manifestations de 2.06.\"}, {\"competence\": \"2.06\", \"extrait\": \"Une seule matin\u00e9e au jardin.\", \"confiance\": 0.71, \"justification\": \"Indice corroboratif.\"}, {\"competence\": \"1.02\", \"extrait\": \"Le soir, notes rapides.\", \"confiance\": 0.85, \"justification\": \"Acte dat\u00e9 correspondant aux manifestations de 1.02.\"}, {\"competence\": \"1.02\", \"extrait\": \"Une seule matin\u00e9e au jardin.\", \"confiance\": 0.74, \"justification\": \"Indice corroboratif.\"}], \"alertes\": []}\n```",
   "record": {
    "label": "tagger",
    "model": "m-freq",
    "prompt_chars": 36,
    "response_chars": 597,
    "tokens_estimes": 158,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "freq"
   },
   "task": "tagger",
   "meta": {
    "codes": [
     [
      "1.07",
      "Nom 1.07"
     ],
     [
      "2.06",
      "Nom 2.06"
     ],
     [
      "1.02",
      "Nom 1.02"
     ],
     [
      "1.11",
      "Nom 1.11"
     ]
    ],
    "sentences": [
     [
      "J02_s1",
      "Une seule matin\u00e9e au jardin."
     ],
     [
      "J02_s2",
      "L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb."
     ],
     [
      "J02_s3",
      "Le soir, notes rapides."
     ]
    ],
    "journee": "J03"
   },
   "model": "m-freq",
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"tags\": [{\"competence\": \"2.06\", \"extrait\": \"Le soir, notes rapides.\", \"confiance\": 0.89, \"justification\": \"Acte dat\u00e9 correspondant aux manifestations de 2.06.\"}], \"alertes\": []}\n```",
   "record": {
    "label": "tagger",
    "model": "m-freq",
    "prompt_chars": 36,
    "response_chars": 190,
    "tokens_estimes": 56,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "freq"
   },
   "task": "tagger",
   "meta": {
    "codes": [
     [
      "1.07",
      "Nom 1.07"
     ],
     [
      "2.06",
      "Nom 2.06"
     ],
     [
      "1.02",
      "Nom 1.02"
     ],
     [
      "1.11",
      "Nom 1.11"
     ]
    ],
    "sentences": [
     [
      "J02_s1",
      "Une seule matin\u00e9e au jardin."
     ],
     [
      "J02_s2",
      "L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb."
     ],
     [
      "J02_s3",
      "Le soir, notes rapides."
     ]
    ],
    "journee": "J04"
   },
   "model": "m-freq",
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"tags\": [{\"competence\": \"2.06\", \"extrait\": \"Le soir, notes rapides.\", \"confiance\": 0.86, \"justification\": \"Acte dat\u00e9 correspondant aux manifestations de 2.06.\"}, {\"competence\": \"2.06\", \"extrait\": \"Une seule matin\u00e9e au jardin.\", \"confiance\": 0.79, \"justification\": \"Indice corroboratif.\"}], \"alertes\": []}\n```",
   "record": {
    "label": "tagger",
    "model": "m-freq",
    "prompt_chars": 36,
    "response_chars": 317,
    "tokens_estimes": 88,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "freq"
   },
   "task": "tagger",
   "meta": {
    "codes": [
     [
      "1.07",
      "Nom 1.07"
     ],
     [
      "2.06",
      "Nom 2.06"
     ],
     [
      "1.02",
      "Nom 1.02"
     ],
     [
      "1.11",
      "Nom 1.11"
     ]
    ],
    "sentences": [
     [
      "J02_s1",
      "Une seule matin\u00e9e au jardin."
     ],
     [
      "J02_s2",
      "L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb."
     ],
     [
      "J02_s3",
      "Le soir, notes rapides."
     ]
    ],
    "journee": "J05"
   },
   "model": "m-freq",
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"tags\": [{\"competence\": \"1.11\", \"extrait\": \"Le soir, notes rapides.\", \"confiance\": 0.89, \"justification\": \"Acte dat\u00e9 correspondant aux manifestations de 1.11.\"}, {\"competence\": \"1.11\", \"extrait\": \"Cette phrase n'existe pas dans le portfolio (hallucination simul\u00e9e).\", \"confiance\": 0.7, \"justification\": \"Citation non ancr\u00e9e (test).\"}], \"alertes\": []}\n```",
   "record": {
    "label": "tagger",
    "model": "m-freq",
    "prompt_chars": 36,
    "response_chars": 363,
    "tokens_estimes": 99,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": ""
   },
   "task": "leger_scan",
   "meta": {
    "pole": 1,
    "run": 1,
    "codes": [
     [
      "3.04",
      "Nom 3.04"
     ],
     [
      "3.02",
      "Nom 3.02"
     ],
     [
      "1.04",
      "Nom 1.04"
     ],
     [
      "1.07",
      "Nom 1.07"
     ],
     [
      "2.06",
      "Nom 2.06"
     ],
     [
      "1.02",
      "Nom 1.02"
     ],
     [
      "1.01",
      "Nom 1.01"
     ],
     [
      "1.05",
      "Nom 1.05"
     ]
    ],
    "sentences": [
     [
      "F01",
      "Phrase une avec d\u00e9tail dat\u00e9."
     ],
     [
      "F02",
      "Deuxi\u00e8me phrase, plus r\u00e9flexive."
     ],
     [
      "F03",
      "Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral."
     ],
     [
      "F04",
      "Quatri\u00e8me phrase sur le chantier."
     ],
     [
      "F05",
      "Cinqui\u00e8me phrase, un essai chiffr\u00e9."
     ],
     [
      "F06",
      "Sixi\u00e8me phrase qui doute encore."
     ],
     [
      "F07",
      "Septi\u00e8me phrase concr\u00e8te et dat\u00e9e."
     ],
     [
      "F08",
      "Huiti\u00e8me phrase, retour au calme."
     ]
    ]
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"poleNum\": \"1\", \"passagesSaillants\": [{\"pid\": 1, \"feuille\": \"F02\", \"extraitVerbatim\": \"Deuxi\u00e8me phrase, plus r\u00e9flexive.\", \"contexte\": \"Passage relev\u00e9 pour 3.02.\", \"auteur\": \"apprenant\"}, {\"pid\": 2, \"feuille\": \"F01\", \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Second passage relev\u00e9 pour 3.02.\", \"auteur\": \"apprenant\"}, {\"pid\": 3, \"feuille\": \"F05\", \"extraitVerbatim\": \"Cinqui\u00e8me phrase, un essai chiffr\u00e9.\", \"contexte\": \"Passage relev\u00e9 pour 1.04.\", \"auteur\": \"apprenant\"}, {\"pid\": 4, \"feuille\": \"F04\", \"extraitVerbatim\": \"Quatri\u00e8me phrase sur le chantier.\", \"contexte\": \"Second passage relev\u00e9 pour 1.04.\", \"auteur\": \"apprenant\"}, {\"pid\": 5, \"feuille\": \"F06\", \"extraitVerbatim\": \"Sixi\u00e8me phrase qui doute encore.\", \"contexte\": \"Passage relev\u00e9 pour 1.07.\", \"auteur\": \"apprenant\"}, {\"pid\": 6, \"feuille\": \"F05\", \"extraitVerbatim\": \"Cinqui\u00e8me phrase, un essai chiffr\u00e9.\", \"contexte\": \"Second passage relev\u00e9 pour 1.07.\", \"auteur\": \"apprenant\"}, {\"pid\": 7, \"feuille\": \"F05\", \"extraitVerbatim\": \"Cinqui\u00e8me phrase, un essai chiffr\u00e9.\", \"contexte\": \"Passage relev\u00e9 pour 2.06.\", \"auteur\": \"apprenant\"}, {\"pid\": 8, \"feuille\": \"F04\", \"extraitVerbatim\": \"Quatri\u00e8me phrase sur le chantier.\", \"contexte\": \"Second passage relev\u00e9 pour 2.06.\", \"auteur\": \"apprenant\"}, {\"pid\": 9, \"feuille\": \"F02\", \"extraitVerbatim\": \"Deuxi\u00e8me phrase, plus r\u00e9flexive.\", \"contexte\": \"Passage relev\u00e9 pour 1.02.\", \"auteur\": \"apprenant\"}, {\"pid\": 10, \"feuille\": \"F01\", \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Second passage relev\u00e9 pour 1.02.\", \"auteur\": \"apprenant\"}, {\"pid\": 11, \"feuille\": \"F01\", \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Passage relev\u00e9 pour 1.01.\", \"auteur\": \"apprenant\"}, {\"pid\": 12, \"feuille\": \"F08\", \"extraitVerbatim\": \"Huiti\u00e8me phrase, retour au calme.\", \"contexte\": \"Second passage relev\u00e9 pour 1.01.\", \"auteur\": \"apprenant\"}, {\"pid\": 13, \"feuille\": \"F04\", \"extraitVerbatim\": \"Quatri\u00e8me phrase sur le chantier.\", \"contexte\": \"Passage relev\u00e9 pour 1.05.\", \"auteur\": \"apprenant\"}, {\"pid\": 14, \"feuille\": \"F03\", \"extraitVerbatim\": \"Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral.\", \"contexte\": \"Second passage relev\u00e9 pour 1.05.\", \"auteur\": \"apprenant\"}], \"competences\": [{\"code\": \"3.04\", \"courtCircuit\": true, \"pieces\": [], \"pedagogue\": null, \"tracesRetenues\": [], \"verdict\": {\"statut\": \"pr\u00e9sence non \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 1.0, \"raison\": \"aucune pi\u00e8ce extraite par le Greffier\", \"prescriptionMinimale\": \"Documenter une situation concr\u00e8te illustrant Nom 3.04.\"}}, {\"code\": \"3.02\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 1, \"extraitVerbatim\": \"Deuxi\u00e8me phrase, plus r\u00e9flexive.\", \"contexte\": \"Pertinent pour 3.02.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 2, \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Pertinent pour 3.02.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.15}}, \"verdict\": {\"statut\": \"pr\u00e9sence non \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 0.15, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 3.02.\"}, \"tracesRetenues\": []}, {\"code\": \"1.04\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 3, \"extraitVerbatim\": \"Cinqui\u00e8me phrase, un essai chiffr\u00e9.\", \"contexte\": \"Pertinent pour 1.04.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 4, \"extraitVerbatim\": \"Quatri\u00e8me phrase sur le chantier.\", \"contexte\": \"Pertinent pour 1.04.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.157}}, \"verdict\": {\"statut\": \"pr\u00e9sence non \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 0.157, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 1.04.\"}, \"tracesRetenues\": []}, {\"code\": \"1.07\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 5, \"extraitVerbatim\": \"Sixi\u00e8me phrase qui doute encore.\", \"contexte\": \"Pertinent pour 1.07.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 6, \"extraitVerbatim\": \"Cinqui\u00e8me phrase, un essai chiffr\u00e9.\", \"contexte\": \"Pertinent pour 1.07.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.88}}, \"verdict\": {\"statut\": \"pr\u00e9sence \u00e9tablie\", \"nombrePreuves\": 1, \"nombreIndices\": 1, \"confiance\": 0.88, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 1.07.\"}, \"tracesRetenues\": [{\"pieceId\": 1, \"type\": \"trace concr\u00e8te\", \"role\": \"preuve d\u00e9cisive\"}, {\"pieceId\": 2, \"type\": \"d\u00e9claration \u00e9tay\u00e9e\", \"role\": \"indice corroboratif\"}]}, {\"code\": \"2.06\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 7, \"extraitVerbatim\": \"Cinqui\u00e8me phrase, un essai chiffr\u00e9.\", \"contexte\": \"Pertinent pour 2.06.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 8, \"extraitVerbatim\": \"Quatri\u00e8me phrase sur le chantier.\", \"contexte\": \"Pertinent pour 2.06.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.91}}, \"verdict\": {\"statut\": \"pr\u00e9sence \u00e9tablie\", \"nombrePreuves\": 1, \"nombreIndices\": 1, \"confiance\": 0.91, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 2.06.\"}, \"tracesRetenues\": [{\"pieceId\": 1, \"type\": \"trace concr\u00e8te\", \"role\": \"preuve d\u00e9cisive\"}, {\"pieceId\": 2, \"type\": \"d\u00e9claration \u00e9tay\u00e9e\", \"role\": \"indice corroboratif\"}]}, {\"code\": \"1.02\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 9, \"extraitVerbatim\": \"Deuxi\u00e8me phrase, plus r\u00e9flexive.\", \"contexte\": \"Pertinent pour 1.02.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 10, \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Pertinent pour 1.02.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.868}}, \"verdict\": {\"statut\": \"pr\u00e9sence \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 2, \"confiance\": 0.868, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 1.02.\"}, \"tracesRetenues\": [{\"pieceId\": 1, \"type\": \"d\u00e9claration \u00e9tay\u00e9e\", \"role\": \"indice corroboratif\"}, {\"pieceId\": 2, \"type\": \"d\u00e9claration \u00e9tay\u00e9e\", \"role\": \"indice corroboratif\"}]}, {\"code\": \"1.01\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 11, \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Pertinent pour 1.01.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 12, \"extraitVerbatim\": \"Huiti\u00e8me phrase, retour au calme.\", \"contexte\": \"Pertinent pour 1.01.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.253}}, \"verdict\": {\"statut\": \"pr\u00e9sence non \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 0.253, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 1.01.\"}, \"tracesRetenues\": []}, {\"code\": \"1.05\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 13, \"extraitVerbatim\": \"Quatri\u00e8me phrase sur le chantier.\", \"contexte\": \"Pertinent pour 1.05.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 14, \"extraitVerbatim\": \"Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral.\", \"contexte\": \"Pertinent pour 1.05.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.549}}, \"verdict\": {\"statut\": \"renvoi au cartographe\", \"nombrePreuves\": 0, \"nombreIndices\": 1, \"confiance\": 0.549, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 1.05.\"}, \"tracesRetenues\": [{\"pieceId\": 2, \"type\": \"d\u00e9claration \u00e9tay\u00e9e\", \"role\": \"indice corroboratif\"}]}], \"auditPole\": {\"competencesTotales\": 8, \"competencesNonCourtCircuit\": 7, \"presencesEtablies\": 3, \"renvoisCartographe\": 1, \"nonEtablies\": 3, \"courtCircuits\": 1}, \"rapport\": {\"portraitPole\": \"Portrait du p\u00f4le 1 (mock) : le travail montre un ancrage concret.\", \"territoiresDenses\": [], \"territoiresNonVisites\": \"Territoires non visit\u00e9s (mock).\", \"emergencesPole\": \"\u00c9mergences (mock).\", \"pistes\": [\"Pour enrichir ce p\u00f4le, un chemin possible serait de documenter un cas v\u00e9cu.\"], \"rapportCompletMarkdown\": \"## Portrait du p\u00f4le\\n\\nRapport de p\u00f4le 1 g\u00e9n\u00e9r\u00e9 par le backend mock.\\n\"}}\n```",
   "record": {
    "label": "leger_scan",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 11659,
    "tokens_estimes": 2923,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "x"
   },
   "task": "leger_scan",
   "meta": {
    "pole": 2,
    "run": 2,
    "codes": [
     [
      "3.04",
      "Nom 3.04"
     ],
     [
      "3.02",
      "Nom 3.02"
     ],
     [
      "1.04",
      "Nom 1.04"
     ],
     [
      "1.07",
      "Nom 1.07"
     ],
     [
      "2.06",
      "Nom 2.06"
     ],
     [
      "1.02",
      "Nom 1.02"
     ],
     [
      "1.01",
      "Nom 1.01"
     ],
     [
      "1.05",
      "Nom 1.05"
     ]
    ],
    "sentences": [
     [
      "F01",
      "Phrase une avec d\u00e9tail dat\u00e9."
     ],
     [
      "F02",
      "Deuxi\u00e8me phrase, plus r\u00e9flexive."
     ],
     [
      "F03",
      "Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral."
     ],
     [
      "F04",
      "Quatri\u00e8me phrase sur le chantier."
     ],
     [
      "F05",
      "Cinqui\u00e8me phrase, un essai chiffr\u00e9."
     ],
     [
      "F06",
      "Sixi\u00e8me phrase qui doute encore."
     ],
     [
      "F07",
      "Septi\u00e8me phrase concr\u00e8te et dat\u00e9e."
     ],
     [
      "F08",
      "Huiti\u00e8me phrase, retour au calme."
     ]
    ]
   },
   "model": "m-2",
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"poleNum\": \"2\", \"passagesSaillants\": [{\"pid\": 1, \"feuille\": \"F02\", \"extraitVerbatim\": \"Deuxi\u00e8me phrase, plus r\u00e9flexive.\", \"contexte\": \"Passage relev\u00e9 pour 3.02.\", \"auteur\": \"apprenant\"}, {\"pid\": 2, \"feuille\": \"F01\", \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Second passage relev\u00e9 pour 3.02.\", \"auteur\": \"apprenant\"}, {\"pid\": 3, \"feuille\": \"F05\", \"extraitVerbatim\": \"Cinqui\u00e8me phrase, un essai chiffr\u00e9.\", \"contexte\": \"Passage relev\u00e9 pour 1.04.\", \"auteur\": \"apprenant\"}, {\"pid\": 4, \"feuille\": \"F04\", \"extraitVerbatim\": \"Quatri\u00e8me phrase sur le chantier.\", \"contexte\": \"Second passage relev\u00e9 pour 1.04.\", \"auteur\": \"apprenant\"}, {\"pid\": 5, \"feuille\": \"F06\", \"extraitVerbatim\": \"Sixi\u00e8me phrase qui doute encore.\", \"contexte\": \"Passage relev\u00e9 pour 1.07.\", \"auteur\": \"apprenant\"}, {\"pid\": 6, \"feuille\": \"F05\", \"extraitVerbatim\": \"Cinqui\u00e8me phrase, un essai chiffr\u00e9.\", \"contexte\": \"Second passage relev\u00e9 pour 1.07.\", \"auteur\": \"apprenant\"}, {\"pid\": 7, \"feuille\": \"F05\", \"extraitVerbatim\": \"Cinqui\u00e8me phrase, un essai chiffr\u00e9.\", \"contexte\": \"Passage relev\u00e9 pour 2.06.\", \"auteur\": \"apprenant\"}, {\"pid\": 8, \"feuille\": \"F04\", \"extraitVerbatim\": \"Quatri\u00e8me phrase sur le chantier.\", \"contexte\": \"Second passage relev\u00e9 pour 2.06.\", \"auteur\": \"apprenant\"}, {\"pid\": 9, \"feuille\": \"F02\", \"extraitVerbatim\": \"Deuxi\u00e8me phrase, plus r\u00e9flexive.\", \"contexte\": \"Passage relev\u00e9 pour 1.02.\", \"auteur\": \"apprenant\"}, {\"pid\": 10, \"feuille\": \"F01\", \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Second passage relev\u00e9 pour 1.02.\", \"auteur\": \"apprenant\"}, {\"pid\": 11, \"feuille\": \"F01\", \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Passage relev\u00e9 pour 1.01.\", \"auteur\": \"apprenant\"}, {\"pid\": 12, \"feuille\": \"F08\", \"extraitVerbatim\": \"Huiti\u00e8me phrase, retour au calme.\", \"contexte\": \"Second passage relev\u00e9 pour 1.01.\", \"auteur\": \"apprenant\"}, {\"pid\": 13, \"feuille\": \"F04\", \"extraitVerbatim\": \"Quatri\u00e8me phrase sur le chantier.\", \"contexte\": \"Passage relev\u00e9 pour 1.05.\", \"auteur\": \"apprenant\"}, {\"pid\": 14, \"feuille\": \"F03\", \"extraitVerbatim\": \"Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral.\", \"contexte\": \"Second passage relev\u00e9 pour 1.05.\", \"auteur\": \"apprenant\"}], \"competences\": [{\"code\": \"3.04\", \"courtCircuit\": true, \"pieces\": [], \"pedagogue\": null, \"tracesRetenues\": [], \"verdict\": {\"statut\": \"pr\u00e9sence non \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 1.0, \"raison\": \"aucune pi\u00e8ce extraite par le Greffier\", \"prescriptionMinimale\": \"Documenter une situation concr\u00e8te illustrant Nom 3.04.\"}}, {\"code\": \"3.02\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 1, \"extraitVerbatim\": \"Deuxi\u00e8me phrase, plus r\u00e9flexive.\", \"contexte\": \"Pertinent pour 3.02.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 2, \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Pertinent pour 3.02.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.165}}, \"verdict\": {\"statut\": \"pr\u00e9sence non \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 0.165, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 3.02.\"}, \"tracesRetenues\": []}, {\"code\": \"1.04\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 3, \"extraitVerbatim\": \"Cinqui\u00e8me phrase, un essai chiffr\u00e9.\", \"contexte\": \"Pertinent pour 1.04.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 4, \"extraitVerbatim\": \"Quatri\u00e8me phrase sur le chantier.\", \"contexte\": \"Pertinent pour 1.04.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.119}}, \"verdict\": {\"statut\": \"pr\u00e9sence non \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 0.119, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 1.04.\"}, \"tracesRetenues\": []}, {\"code\": \"1.07\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 5, \"extraitVerbatim\": \"Sixi\u00e8me phrase qui doute encore.\", \"contexte\": \"Pertinent pour 1.07.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 6, \"extraitVerbatim\": \"Cinqui\u00e8me phrase, un essai chiffr\u00e9.\", \"contexte\": \"Pertinent pour 1.07.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.858}}, \"verdict\": {\"statut\": \"pr\u00e9sence \u00e9tablie\", \"nombrePreuves\": 1, \"nombreIndices\": 1, \"confiance\": 0.858, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 1.07.\"}, \"tracesRetenues\": [{\"pieceId\": 1, \"type\": \"trace concr\u00e8te\", \"role\": \"preuve d\u00e9cisive\"}, {\"pieceId\": 2, \"type\": \"d\u00e9claration \u00e9tay\u00e9e\", \"role\": \"indice corroboratif\"}]}, {\"code\": \"2.06\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 7, \"extraitVerbatim\": \"Cinqui\u00e8me phrase, un essai chiffr\u00e9.\", \"contexte\": \"Pertinent pour 2.06.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 8, \"extraitVerbatim\": \"Quatri\u00e8me phrase sur le chantier.\", \"contexte\": \"Pertinent pour 2.06.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.878}}, \"verdict\": {\"statut\": \"pr\u00e9sence \u00e9tablie\", \"nombrePreuves\": 1, \"nombreIndices\": 1, \"confiance\": 0.878, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 2.06.\"}, \"tracesRetenues\": [{\"pieceId\": 1, \"type\": \"trace concr\u00e8te\", \"role\": \"preuve d\u00e9cisive\"}, {\"pieceId\": 2, \"type\": \"d\u00e9claration \u00e9tay\u00e9e\", \"role\": \"indice corroboratif\"}]}, {\"code\": \"1.02\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 9, \"extraitVerbatim\": \"Deuxi\u00e8me phrase, plus r\u00e9flexive.\", \"contexte\": \"Pertinent pour 1.02.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 10, \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Pertinent pour 1.02.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.863}}, \"verdict\": {\"statut\": \"pr\u00e9sence \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 2, \"confiance\": 0.863, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 1.02.\"}, \"tracesRetenues\": [{\"pieceId\": 1, \"type\": \"d\u00e9claration \u00e9tay\u00e9e\", \"role\": \"indice corroboratif\"}, {\"pieceId\": 2, \"type\": \"d\u00e9claration \u00e9tay\u00e9e\", \"role\": \"indice corroboratif\"}]}, {\"code\": \"1.01\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 11, \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Pertinent pour 1.01.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 12, \"extraitVerbatim\": \"Huiti\u00e8me phrase, retour au calme.\", \"contexte\": \"Pertinent pour 1.01.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.835}}, \"verdict\": {\"statut\": \"pr\u00e9sence \u00e9tablie\", \"nombrePreuves\": 1, \"nombreIndices\": 0, \"confiance\": 0.835, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 1.01.\"}, \"tracesRetenues\": [{\"pieceId\": 1, \"type\": \"trace concr\u00e8te\", \"role\": \"preuve d\u00e9cisive\"}]}, {\"code\": \"1.05\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 13, \"extraitVerbatim\": \"Quatri\u00e8me phrase sur le chantier.\", \"contexte\": \"Pertinent pour 1.05.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 14, \"extraitVerbatim\": \"Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral.\", \"contexte\": \"Pertinent pour 1.05.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.568}}, \"verdict\": {\"statut\": \"renvoi au cartographe\", \"nombrePreuves\": 0, \"nombreIndices\": 1, \"confiance\": 0.568, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 1.05.\"}, \"tracesRetenues\": [{\"pieceId\": 2, \"type\": \"d\u00e9claration \u00e9tay\u00e9e\", \"role\": \"indice corroboratif\"}]}], \"auditPole\": {\"competencesTotales\": 8, \"competencesNonCourtCircuit\": 7, \"presencesEtablies\": 4, \"renvoisCartographe\": 1, \"nonEtablies\": 2, \"courtCircuits\": 1}, \"rapport\": {\"portraitPole\": \"Portrait du p\u00f4le 2 (mock) : le travail montre un ancrage concret.\", \"territoiresDenses\": [], \"territoiresNonVisites\": \"Territoires non visit\u00e9s (mock).\", \"emergencesPole\": \"\u00c9mergences (mock).\", \"pistes\": [\"Pour enrichir ce p\u00f4le, un chemin possible serait de documenter un cas v\u00e9cu.\"], \"rapportCompletMarkdown\": \"## Portrait du p\u00f4le\\n\\nRapport de p\u00f4le 2 g\u00e9n\u00e9r\u00e9 par le backend mock.\\n\"}}\n```",
   "record": {
    "label": "leger_scan",
    "model": "m-2",
    "prompt_chars": 36,
    "response_chars": 11728,
    "tokens_estimes": 2941,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": 7
   },
   "task": "leger_scan",
   "meta": {
    "pole": 3,
    "run": 3,
    "codes": [
     [
      "3.04",
      "Nom 3.04"
     ],
     [
      "3.02",
      "Nom 3.02"
     ],
     [
      "1.04",
      "Nom 1.04"
     ],
     [
      "1.07",
      "Nom 1.07"
     ],
     [
      "2.06",
      "Nom 2.06"
     ],
     [
      "1.02",
      "Nom 1.02"
     ],
     [
      "1.01",
      "Nom 1.01"
     ],
     [
      "1.05",
      "Nom 1.05"
     ]
    ],
    "sentences": [
     [
      "J02_s1",
      "Une seule matin\u00e9e au jardin."
     ],
     [
      "J02_s2",
      "L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb."
     ],
     [
      "J02_s3",
      "Le soir, notes rapides."
     ]
    ]
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"poleNum\": \"3\", \"passagesSaillants\": [{\"pid\": 1, \"feuille\": \"J02_s3\", \"extraitVerbatim\": \"Le soir, notes rapides.\", \"contexte\": \"Passage relev\u00e9 pour 3.02.\", \"auteur\": \"apprenant\"}, {\"pid\": 2, \"feuille\": \"J02_s1\", \"extraitVerbatim\": \"Une seule matin\u00e9e au jardin.\", \"contexte\": \"Second passage relev\u00e9 pour 3.02.\", \"auteur\": \"apprenant\"}, {\"pid\": 3, \"feuille\": \"J02_s3\", \"extraitVerbatim\": \"Le soir, notes rapides.\", \"contexte\": \"Passage relev\u00e9 pour 1.04.\", \"auteur\": \"apprenant\"}, {\"pid\": 4, \"feuille\": \"J02_s1\", \"extraitVerbatim\": \"Une seule matin\u00e9e au jardin.\", \"contexte\": \"Second passage relev\u00e9 pour 1.04.\", \"auteur\": \"apprenant\"}, {\"pid\": 5, \"feuille\": \"J02_s2\", \"extraitVerbatim\": \"L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb.\", \"contexte\": \"Passage relev\u00e9 pour 1.07.\", \"auteur\": \"apprenant\"}, {\"pid\": 6, \"feuille\": \"J02_s3\", \"extraitVerbatim\": \"Le soir, notes rapides.\", \"contexte\": \"Second passage relev\u00e9 pour 1.07.\", \"auteur\": \"apprenant\"}, {\"pid\": 7, \"feuille\": \"J02_s3\", \"extraitVerbatim\": \"Le soir, notes rapides.\", \"contexte\": \"Passage relev\u00e9 pour 2.06.\", \"auteur\": \"apprenant\"}, {\"pid\": 8, \"feuille\": \"J02_s1\", \"extraitVerbatim\": \"Une seule matin\u00e9e au jardin.\", \"contexte\": \"Second passage relev\u00e9 pour 2.06.\", \"auteur\": \"apprenant\"}, {\"pid\": 9, \"feuille\": \"J02_s3\", \"extraitVerbatim\": \"Le soir, notes rapides.\", \"contexte\": \"Passage relev\u00e9 pour 1.02.\", \"auteur\": \"apprenant\"}, {\"pid\": 10, \"feuille\": \"J02_s1\", \"extraitVerbatim\": \"Une seule matin\u00e9e au jardin.\", \"contexte\": \"Second passage relev\u00e9 pour 1.02.\", \"auteur\": \"apprenant\"}, {\"pid\": 11, \"feuille\": \"J02_s2\", \"extraitVerbatim\": \"L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb.\", \"contexte\": \"Passage relev\u00e9 pour 1.01.\", \"auteur\": \"apprenant\"}, {\"pid\": 12, \"feuille\": \"J02_s3\", \"extraitVerbatim\": \"Le soir, notes rapides.\", \"contexte\": \"Second passage relev\u00e9 pour 1.01.\", \"auteur\": \"apprenant\"}, {\"pid\": 13, \"feuille\": \"J02_s2\", \"extraitVerbatim\": \"L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb.\", \"contexte\": \"Passage relev\u00e9 pour 1.05.\", \"auteur\": \"apprenant\"}, {\"pid\": 14, \"feuille\": \"J02_s3\", \"extraitVerbatim\": \"Le soir, notes rapides.\", \"contexte\": \"Second passage relev\u00e9 pour 1.05.\", \"auteur\": \"apprenant\"}], \"competences\": [{\"code\": \"3.04\", \"courtCircuit\": true, \"pieces\": [], \"pedagogue\": null, \"tracesRetenues\": [], \"verdict\": {\"statut\": \"pr\u00e9sence non \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 1.0, \"raison\": \"aucune pi\u00e8ce extraite par le Greffier\", \"prescriptionMinimale\": \"Documenter une situation concr\u00e8te illustrant Nom 3.04.\"}}, {\"code\": \"3.02\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 1, \"extraitVerbatim\": \"Le soir, notes rapides.\", \"contexte\": \"Pertinent pour 3.02.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 2, \"extraitVerbatim\": \"Une seule matin\u00e9e au jardin.\", \"contexte\": \"Pertinent pour 3.02.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.129}}, \"verdict\": {\"statut\": \"pr\u00e9sence non \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 0.129, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 3.02.\"}, \"tracesRetenues\": []}, {\"code\": \"1.04\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 3, \"extraitVerbatim\": \"Le soir, notes rapides.\", \"contexte\": \"Pertinent pour 1.04.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 4, \"extraitVerbatim\": \"Une seule matin\u00e9e au jardin.\", \"contexte\": \"Pertinent pour 1.04.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.116}}, \"verdict\": {\"statut\": \"pr\u00e9sence non \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 0.116, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 1.04.\"}, \"tracesRetenues\": []}, {\"code\": \"1.07\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 5, \"extraitVerbatim\": \"L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb.\", \"contexte\": \"Pertinent pour 1.07.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 6, \"extraitVerbatim\": \"Le soir, notes rapides.\", \"contexte\": \"Pertinent pour 1.07.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.909}}, \"verdict\": {\"statut\": \"pr\u00e9sence \u00e9tablie\", \"nombrePreuves\": 1, \"nombreIndices\": 1, \"confiance\": 0.909, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 1.07.\"}, \"tracesRetenues\": [{\"pieceId\": 1, \"type\": \"trace concr\u00e8te\", \"role\": \"preuve d\u00e9cisive\"}, {\"pieceId\": 2, \"type\": \"d\u00e9claration \u00e9tay\u00e9e\", \"role\": \"indice corroboratif\"}]}, {\"code\": \"2.06\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 7, \"extraitVerbatim\": \"Le soir, notes rapides.\", \"contexte\": \"Pertinent pour 2.06.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 8, \"extraitVerbatim\": \"Une seule matin\u00e9e au jardin.\", \"contexte\": \"Pertinent pour 2.06.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.855}}, \"verdict\": {\"statut\": \"pr\u00e9sence \u00e9tablie\", \"nombrePreuves\": 1, \"nombreIndices\": 1, \"confiance\": 0.855, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 2.06.\"}, \"tracesRetenues\": [{\"pieceId\": 1, \"type\": \"trace concr\u00e8te\", \"role\": \"preuve d\u00e9cisive\"}, {\"pieceId\": 2, \"type\": \"d\u00e9claration \u00e9tay\u00e9e\", \"role\": \"indice corroboratif\"}]}, {\"code\": \"1.02\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 9, \"extraitVerbatim\": \"Le soir, notes rapides.\", \"contexte\": \"Pertinent pour 1.02.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 10, \"extraitVerbatim\": \"Une seule matin\u00e9e au jardin.\", \"contexte\": \"Pertinent pour 1.02.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.849}}, \"verdict\": {\"statut\": \"pr\u00e9sence \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 2, \"confiance\": 0.849, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 1.02.\"}, \"tracesRetenues\": [{\"pieceId\": 1, \"type\": \"d\u00e9claration \u00e9tay\u00e9e\", \"role\": \"indice corroboratif\"}, {\"pieceId\": 2, \"type\": \"d\u00e9claration \u00e9tay\u00e9e\", \"role\": \"indice corroboratif\"}]}, {\"code\": \"1.01\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 11, \"extraitVerbatim\": \"L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb.\", \"contexte\": \"Pertinent pour 1.01.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 12, \"extraitVerbatim\": \"Le soir, notes rapides.\", \"contexte\": \"Pertinent pour 1.01.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.56}}, \"verdict\": {\"statut\": \"renvoi au cartographe\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 0.56, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 1.01.\"}, \"tracesRetenues\": []}, {\"code\": \"1.05\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 13, \"extraitVerbatim\": \"L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb.\", \"contexte\": \"Pertinent pour 1.05.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 14, \"extraitVerbatim\": \"Le soir, notes rapides.\", \"contexte\": \"Pertinent pour 1.05.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.555}}, \"verdict\": {\"statut\": \"renvoi au cartographe\", \"nombrePreuves\": 0, \"nombreIndices\": 1, \"confiance\": 0.555, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 1.05.\"}, \"tracesRetenues\": [{\"pieceId\": 2, \"type\": \"d\u00e9claration \u00e9tay\u00e9e\", \"role\": \"indice corroboratif\"}]}], \"auditPole\": {\"competencesTotales\": 8, \"competencesNonCourtCircuit\": 7, \"presencesEtablies\": 3, \"renvoisCartographe\": 2, \"nonEtablies\": 2, \"courtCircuits\": 1}, \"rapport\": {\"portraitPole\": \"Portrait du p\u00f4le 3 (mock) : le travail montre un ancrage concret.\", \"territoiresDenses\": [], \"territoiresNonVisites\": \"Territoires non visit\u00e9s (mock).\", \"emergencesPole\": \"\u00c9mergences (mock).\", \"pistes\": [\"Pour enrichir ce p\u00f4le, un chemin possible serait de documenter un cas v\u00e9cu.\"], \"rapportCompletMarkdown\": \"## Portrait du p\u00f4le\\n\\nRapport de p\u00f4le 3 g\u00e9n\u00e9r\u00e9 par le backend mock.\\n\"}}\n```",
   "record": {
    "label": "leger_scan",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 11554,
    "tokens_estimes": 2897,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "v"
   },
   "task": "leger_scan",
   "meta": {
    "pole": "P5",
    "run": 1,
    "codes": [
     [
      "3.04",
      "Nom 3.04"
     ],
     [
      "3.02",
      "Nom 3.02"
     ],
     [
      "1.04",
      "Nom 1.04"
     ],
     [
      "1.07",
      "Nom 1.07"
     ]
    ],
    "sentences": []
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"poleNum\": \"P5\", \"passagesSaillants\": [], \"competences\": [{\"code\": \"3.04\", \"courtCircuit\": true, \"pieces\": [], \"pedagogue\": null, \"tracesRetenues\": [], \"verdict\": {\"statut\": \"pr\u00e9sence non \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 1.0, \"raison\": \"aucune pi\u00e8ce extraite par le Greffier\", \"prescriptionMinimale\": \"Documenter une situation concr\u00e8te illustrant Nom 3.04.\"}}, {\"code\": \"3.02\", \"courtCircuit\": true, \"pieces\": [], \"pedagogue\": null, \"tracesRetenues\": [], \"verdict\": {\"statut\": \"pr\u00e9sence non \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 1.0, \"raison\": \"aucune pi\u00e8ce extraite par le Greffier\", \"prescriptionMinimale\": \"Documenter une situation concr\u00e8te illustrant Nom 3.02.\"}}, {\"code\": \"1.04\", \"courtCircuit\": true, \"pieces\": [], \"pedagogue\": null, \"tracesRetenues\": [], \"verdict\": {\"statut\": \"pr\u00e9sence non \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 1.0, \"raison\": \"aucune pi\u00e8ce extraite par le Greffier\", \"prescriptionMinimale\": \"Documenter une situation concr\u00e8te illustrant Nom 1.04.\"}}, {\"code\": \"1.07\", \"courtCircuit\": true, \"pieces\": [], \"pedagogue\": null, \"tracesRetenues\": [], \"verdict\": {\"statut\": \"pr\u00e9sence non \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 1.0, \"raison\": \"aucune pi\u00e8ce extraite par le Greffier\", \"prescriptionMinimale\": \"Documenter une situation concr\u00e8te illustrant Nom 1.07.\"}}], \"auditPole\": {\"competencesTotales\": 4, \"competencesNonCourtCircuit\": 0, \"presencesEtablies\": 0, \"renvoisCartographe\": 0, \"nonEtablies\": 0, \"courtCircuits\": 4}, \"rapport\": {\"portraitPole\": \"Portrait du p\u00f4le P5 (mock) : le travail montre un ancrage concret.\", \"territoiresDenses\": [], \"territoiresNonVisites\": \"Territoires non visit\u00e9s (mock).\", \"emergencesPole\": \"\u00c9mergences (mock).\", \"pistes\": [\"Pour enrichir ce p\u00f4le, un chemin possible serait de documenter un cas v\u00e9cu.\"], \"rapportCompletMarkdown\": \"## Portrait du p\u00f4le\\n\\nRapport de p\u00f4le P5 g\u00e9n\u00e9r\u00e9 par le backend mock.\\n\"}}\n```",
   "record": {
    "label": "leger_scan",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 1979,
    "tokens_estimes": 503,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "d"
   },
   "task": "leger_scan",
   "meta": {},
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"poleNum\": \"1\", \"passagesSaillants\": [], \"competences\": [], \"auditPole\": {\"competencesTotales\": 0, \"competencesNonCourtCircuit\": 0, \"presencesEtablies\": 0, \"renvoisCartographe\": 0, \"nonEtablies\": 0, \"courtCircuits\": 0}, \"rapport\": {\"portraitPole\": \"Portrait du p\u00f4le 1 (mock) : le travail montre un ancrage concret.\", \"territoiresDenses\": [], \"territoiresNonVisites\": \"Territoires non visit\u00e9s (mock).\", \"emergencesPole\": \"\u00c9mergences (mock).\", \"pistes\": [\"Pour enrichir ce p\u00f4le, un chemin possible serait de documenter un cas v\u00e9cu.\"], \"rapportCompletMarkdown\": \"## Portrait du p\u00f4le\\n\\nRapport de p\u00f4le 1 g\u00e9n\u00e9r\u00e9 par le backend mock.\\n\"}}\n```",
   "record": {
    "label": "leger_scan",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 646,
    "tokens_estimes": 170,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "r4"
   },
   "task": "leger_scan",
   "meta": {
    "pole": 4,
    "run": 4,
    "codes": [
     [
      "1.01",
      "Nom 1.01"
     ],
     [
      "2.04",
      "Nom 2.04"
     ],
     [
      "1.01",
      "Nom 1.01"
     ]
    ],
    "sentences": [
     [
      "F01",
      "Phrase une avec d\u00e9tail dat\u00e9."
     ],
     [
      "F02",
      "Deuxi\u00e8me phrase, plus r\u00e9flexive."
     ],
     [
      "F03",
      "Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral."
     ],
     [
      "F04",
      "Quatri\u00e8me phrase sur le chantier."
     ],
     [
      "F05",
      "Cinqui\u00e8me phrase, un essai chiffr\u00e9."
     ]
    ]
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"poleNum\": \"4\", \"passagesSaillants\": [{\"pid\": 1, \"feuille\": \"F01\", \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Passage relev\u00e9 pour 1.01.\", \"auteur\": \"apprenant\"}, {\"pid\": 2, \"feuille\": \"F03\", \"extraitVerbatim\": \"Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral.\", \"contexte\": \"Second passage relev\u00e9 pour 1.01.\", \"auteur\": \"apprenant\"}, {\"pid\": 3, \"feuille\": \"F01\", \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Passage relev\u00e9 pour 2.04.\", \"auteur\": \"apprenant\"}, {\"pid\": 4, \"feuille\": \"F03\", \"extraitVerbatim\": \"Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral.\", \"contexte\": \"Second passage relev\u00e9 pour 2.04.\", \"auteur\": \"apprenant\"}, {\"pid\": 5, \"feuille\": \"F01\", \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Passage relev\u00e9 pour 1.01.\", \"auteur\": \"apprenant\"}, {\"pid\": 6, \"feuille\": \"F03\", \"extraitVerbatim\": \"Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral.\", \"contexte\": \"Second passage relev\u00e9 pour 1.01.\", \"auteur\": \"apprenant\"}], \"competences\": [{\"code\": \"1.01\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 1, \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Pertinent pour 1.01.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 2, \"extraitVerbatim\": \"Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral.\", \"contexte\": \"Pertinent pour 1.01.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.245}}, \"verdict\": {\"statut\": \"pr\u00e9sence non \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 0.245, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 1.01.\"}, \"tracesRetenues\": []}, {\"code\": \"2.04\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 3, \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Pertinent pour 2.04.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 4, \"extraitVerbatim\": \"Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral.\", \"contexte\": \"Pertinent pour 2.04.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.241}}, \"verdict\": {\"statut\": \"pr\u00e9sence non \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 0.241, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 2.04.\"}, \"tracesRetenues\": []}, {\"code\": \"1.01\", \"courtCircuit\": false, \"pieces\": [{\"numero\": 1, \"pid\": 5, \"extraitVerbatim\": \"Phrase une avec d\u00e9tail dat\u00e9.\", \"contexte\": \"Pertinent pour 1.01.\", \"auteur\": \"apprenant\"}, {\"numero\": 2, \"pid\": 6, \"extraitVerbatim\": \"Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral.\", \"contexte\": \"Pertinent pour 1.01.\", \"auteur\": \"apprenant\"}], \"pedagogue\": {\"presomptionAbsence\": {\"raisonnement\": \"Lecture sceptique (mock) ; certaines pi\u00e8ces r\u00e9sistent.\", \"piecesQuiResistent\": [{\"pieceId\": 1, \"motifResistance\": \"acte dat\u00e9 d\u00e9crit\"}]}, \"presomptionSycophantie\": {\"raisonnement\": \"Relecture critique (mock).\", \"examenPieces\": [{\"pieceId\": 1, \"attaqueDominante\": \"a\", \"verdictAttaque\": \"attaque non recevable, pi\u00e8ce confirm\u00e9e\", \"motifAttaque\": \"dispositif d\u00e9crit et dat\u00e9\"}]}, \"conclusionAdversariale\": {\"raisonnement\": \"Apr\u00e8s les deux retournements (mock), le verdict suit.\", \"confianceFinale\": 0.245}}, \"verdict\": {\"statut\": \"pr\u00e9sence non \u00e9tablie\", \"nombrePreuves\": 0, \"nombreIndices\": 0, \"confiance\": 0.245, \"motif\": \"Conclusion adversariale (mock).\", \"prescription\": \"Pour prolonger, documenter une nouvelle situation li\u00e9e \u00e0 Nom 1.01.\"}, \"tracesRetenues\": []}], \"auditPole\": {\"competencesTotales\": 3, \"competencesNonCourtCircuit\": 3, \"presencesEtablies\": 0, \"renvoisCartographe\": 0, \"nonEtablies\": 3, \"courtCircuits\": 0}, \"rapport\": {\"portraitPole\": \"Portrait du p\u00f4le 4 (mock) : le travail montre un ancrage concret.\", \"territoiresDenses\": [], \"territoiresNonVisites\": \"Territoires non visit\u00e9s (mock).\", \"emergencesPole\": \"\u00c9mergences (mock).\", \"pistes\": [\"Pour enrichir ce p\u00f4le, un chemin possible serait de documenter un cas v\u00e9cu.\"], \"rapportCompletMarkdown\": \"## Portrait du p\u00f4le\\n\\nRapport de p\u00f4le 4 g\u00e9n\u00e9r\u00e9 par le backend mock.\\n\"}}\n```",
   "record": {
    "label": "leger_scan",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 5004,
    "tokens_estimes": 1260,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "s"
   },
   "task": "premiere_impression",
   "meta": {
    "journee": "J01"
   },
   "model": null,
   "label": "lecteur_x_impression",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Lecteur \u2014 Premi\u00e8re impression \u2014 J01\n\n## Voix\nRegistre narratif, doute utilis\u00e9 comme moteur (mock).\n\n## Texture\nD\u00e9tails situ\u00e9s et dat\u00e9s, quelques passages g\u00e9n\u00e9riques (mock).\n\n## Authenticit\u00e9\n**Indicateur** : `produite`\n**Justification** : marqueurs concrets dat\u00e9s observ\u00e9s (mock).\n\n## Question spontan\u00e9e\nQu'est-ce qui t'a surpris ce jour-l\u00e0 ? (mock)",
   "record": {
    "label": "lecteur_x_impression",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 350,
    "tokens_estimes": 96,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "s"
   },
   "task": "premiere_impression",
   "meta": {
    "journee": "2026-01-05_a"
   },
   "model": null,
   "label": "lecteur_x_impression",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Lecteur \u2014 Premi\u00e8re impression \u2014 2026-01-05_a\n\n## Voix\nRegistre narratif, doute utilis\u00e9 comme moteur (mock).\n\n## Texture\nD\u00e9tails situ\u00e9s et dat\u00e9s, quelques passages g\u00e9n\u00e9riques (mock).\n\n## Authenticit\u00e9\n**Indicateur** : `mixte`\n**Justification** : marqueurs concrets dat\u00e9s observ\u00e9s (mock).\n\n## Question spontan\u00e9e\nQu'est-ce qui t'a surpris ce jour-l\u00e0 ? (mock)",
   "record": {
    "label": "lecteur_x_impression",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 356,
    "tokens_estimes": 98,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "s"
   },
   "task": "premiere_impression",
   "meta": {},
   "model": null,
   "label": "lecteur_x_impression",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Lecteur \u2014 Premi\u00e8re impression \u2014 ?\n\n## Voix\nRegistre narratif, doute utilis\u00e9 comme moteur (mock).\n\n## Texture\nD\u00e9tails situ\u00e9s et dat\u00e9s, quelques passages g\u00e9n\u00e9riques (mock).\n\n## Authenticit\u00e9\n**Indicateur** : `mixte`\n**Justification** : marqueurs concrets dat\u00e9s observ\u00e9s (mock).\n\n## Question spontan\u00e9e\nQu'est-ce qui t'a surpris ce jour-l\u00e0 ? (mock)",
   "record": {
    "label": "lecteur_x_impression",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 345,
    "tokens_estimes": 95,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "s"
   },
   "task": "premiere_impression",
   "meta": {
    "journee": 42
   },
   "model": null,
   "label": "lecteur_x_impression",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Lecteur \u2014 Premi\u00e8re impression \u2014 42\n\n## Voix\nRegistre narratif, doute utilis\u00e9 comme moteur (mock).\n\n## Texture\nD\u00e9tails situ\u00e9s et dat\u00e9s, quelques passages g\u00e9n\u00e9riques (mock).\n\n## Authenticit\u00e9\n**Indicateur** : `mixte`\n**Justification** : marqueurs concrets dat\u00e9s observ\u00e9s (mock).\n\n## Question spontan\u00e9e\nQu'est-ce qui t'a surpris ce jour-l\u00e0 ? (mock)",
   "record": {
    "label": "lecteur_x_impression",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 346,
    "tokens_estimes": 95,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "s"
   },
   "task": "premiere_impression",
   "meta": {
    "journee": ""
   },
   "model": null,
   "label": "lecteur_x_impression",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Lecteur \u2014 Premi\u00e8re impression \u2014 \n\n## Voix\nRegistre narratif, doute utilis\u00e9 comme moteur (mock).\n\n## Texture\nD\u00e9tails situ\u00e9s et dat\u00e9s, quelques passages g\u00e9n\u00e9riques (mock).\n\n## Authenticit\u00e9\n**Indicateur** : `mixte`\n**Justification** : marqueurs concrets dat\u00e9s observ\u00e9s (mock).\n\n## Question spontan\u00e9e\nQu'est-ce qui t'a surpris ce jour-l\u00e0 ? (mock)",
   "record": {
    "label": "lecteur_x_impression",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 344,
    "tokens_estimes": 95,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": ""
   },
   "task": "condense",
   "meta": {
    "journee": "J01",
    "sentences": [
     [
      "F01",
      "Phrase une avec d\u00e9tail dat\u00e9."
     ],
     [
      "F02",
      "Deuxi\u00e8me phrase, plus r\u00e9flexive."
     ],
     [
      "F03",
      "Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral."
     ],
     [
      "F04",
      "Quatri\u00e8me phrase sur le chantier."
     ],
     [
      "F05",
      "Cinqui\u00e8me phrase, un essai chiffr\u00e9."
     ],
     [
      "F06",
      "Sixi\u00e8me phrase qui doute encore."
     ],
     [
      "F07",
      "Septi\u00e8me phrase concr\u00e8te et dat\u00e9e."
     ],
     [
      "F08",
      "Huiti\u00e8me phrase, retour au calme."
     ]
    ]
   },
   "model": null,
   "label": "condense_J01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"condense_fidele\": {\"resume\": \"Journ\u00e9e J01 : travail d\u00e9crit et dat\u00e9, avec un passage r\u00e9flexif (mock).\", \"pepites\": [\"Phrase une avec d\u00e9tail dat\u00e9.\", \"Quatri\u00e8me phrase sur le chantier.\"], \"forme\": \"R\u00e9cit dat\u00e9, longueur ordinaire, ton pos\u00e9 (mock).\", \"singularites\": \"Un d\u00e9tail concret revient en fin de journ\u00e9e (mock).\"}}\n```",
   "record": {
    "label": "condense_J01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 331,
    "tokens_estimes": 91,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "c"
   },
   "task": "condense",
   "meta": {
    "journee": "J02",
    "sentences": [
     [
      "F09",
      "L'unique phrase du jour."
     ]
    ]
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"condense_fidele\": {\"resume\": \"Journ\u00e9e J02 : travail d\u00e9crit et dat\u00e9, avec un passage r\u00e9flexif (mock).\", \"pepites\": [\"L'unique phrase du jour.\"], \"forme\": \"R\u00e9cit dat\u00e9, longueur ordinaire, ton pos\u00e9 (mock).\", \"singularites\": \"Un d\u00e9tail concret revient en fin de journ\u00e9e (mock).\"}}\n```",
   "record": {
    "label": "condense",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 290,
    "tokens_estimes": 81,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": 3
   },
   "task": "condense",
   "meta": {
    "journee": "2026-01-07_b",
    "sentences": [
     [
      "J02_s1",
      "Une seule matin\u00e9e au jardin."
     ],
     [
      "J02_s2",
      "L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb."
     ],
     [
      "J02_s3",
      "Le soir, notes rapides."
     ]
    ]
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"condense_fidele\": {\"resume\": \"Journ\u00e9e 2026-01-07_b : travail d\u00e9crit et dat\u00e9, avec un passage r\u00e9flexif (mock).\", \"pepites\": [\"Une seule matin\u00e9e au jardin.\", \"Une seule matin\u00e9e au jardin.\"], \"forme\": \"R\u00e9cit dat\u00e9, longueur ordinaire, ton pos\u00e9 (mock).\", \"singularites\": \"Un d\u00e9tail concret revient en fin de journ\u00e9e (mock).\"}}\n```",
   "record": {
    "label": "condense",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 335,
    "tokens_estimes": 92,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "condense",
   "meta": {
    "journee": "J03",
    "sentences": []
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"condense_fidele\": {\"resume\": \"Journ\u00e9e J03 : travail d\u00e9crit et dat\u00e9, avec un passage r\u00e9flexif (mock).\", \"pepites\": [], \"forme\": \"R\u00e9cit dat\u00e9, longueur ordinaire, ton pos\u00e9 (mock).\", \"singularites\": \"Un d\u00e9tail concret revient en fin de journ\u00e9e (mock).\"}}\n```",
   "record": {
    "label": "condense",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 264,
    "tokens_estimes": 75,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "condense",
   "meta": {
    "sentences": [
     [
      "J02_s1",
      "Une seule matin\u00e9e au jardin."
     ],
     [
      "J02_s2",
      "L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb."
     ],
     [
      "J02_s3",
      "Le soir, notes rapides."
     ]
    ]
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"condense_fidele\": {\"resume\": \"Journ\u00e9e ? : travail d\u00e9crit et dat\u00e9, avec un passage r\u00e9flexif (mock).\", \"pepites\": [\"Une seule matin\u00e9e au jardin.\", \"Une seule matin\u00e9e au jardin.\"], \"forme\": \"R\u00e9cit dat\u00e9, longueur ordinaire, ton pos\u00e9 (mock).\", \"singularites\": \"Un d\u00e9tail concret revient en fin de journ\u00e9e (mock).\"}}\n```",
   "record": {
    "label": "condense",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 324,
    "tokens_estimes": 90,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "condense",
   "meta": {
    "journee": null,
    "sentences": [
     [
      "J02_s1",
      "Une seule matin\u00e9e au jardin."
     ],
     [
      "J02_s2",
      "L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb."
     ],
     [
      "J02_s3",
      "Le soir, notes rapides."
     ]
    ]
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"condense_fidele\": {\"resume\": \"Journ\u00e9e None : travail d\u00e9crit et dat\u00e9, avec un passage r\u00e9flexif (mock).\", \"pepites\": [\"L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb.\", \"L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb.\"], \"forme\": \"R\u00e9cit dat\u00e9, longueur ordinaire, ton pos\u00e9 (mock).\", \"singularites\": \"Un d\u00e9tail concret revient en fin de journ\u00e9e (mock).\"}}\n```",
   "record": {
    "label": "condense",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 341,
    "tokens_estimes": 94,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": ""
   },
   "task": "arpenteur",
   "meta": {
    "jours": [
     [
      "J01",
      "2026-01-02"
     ],
     [
      "J02",
      "2026-01-03"
     ],
     [
      "J03",
      "2026-01-04"
     ]
    ],
    "codes": [
     "1.01",
     "2.02",
     "3.03",
     "4.04"
    ],
    "pepites": {
     "J01": [
      "p\u00e9pite une"
     ],
     "J02": []
    }
   },
   "model": null,
   "label": "arpenteur_global",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"arpentage\": {\"observationsHorsReferentiel\": [{\"titre\": \"Cartographie personnelle du temps (mock)\", \"description\": \"Un syst\u00e8me de rep\u00e9rage temporel propre revient sur toute la p\u00e9riode (mock).\", \"journeesCitees\": [\"J01\", \"J02\"], \"indices\": [\"p\u00e9pite une\"], \"pourquoiHorsReferentiel\": \"Aucune des 61 ne couvre ce geste (mock).\", \"hypotheseFalsifiable\": \"Si les prochaines journ\u00e9es n'en portent aucune trace, l'hypoth\u00e8se tombe (mock).\", \"testEntretien\": \"Peux-tu montrer comment tu organises tes dates ? (mock)\", \"codesLesPlusProches\": [\"1.01\"]}], \"continuites\": [{\"titre\": \"Le fil du projet long (mock)\", \"description\": \"Le m\u00eame chantier traverse les journ\u00e9es, invisible au jour le jour (mock).\", \"journeesCitees\": [\"J01\", \"J02\"], \"indices\": [\"p\u00e9pite une\"], \"codesRelies\": [\"2.02\"]}], \"grainesReferentiel\": [{\"code\": \"3.03\", \"journeesCitees\": [\"J01\", \"J02\"], \"indices\": [\"p\u00e9pite une\"], \"pourquoiInvisibleAuJour\": \"Chaque occurrence est trop t\u00e9nue isol\u00e9ment (mock).\"}]}}\n```",
   "record": {
    "label": "arpenteur_global",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 979,
    "tokens_estimes": 253,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "arpenteur",
   "meta": {
    "jours": [
     [
      "J01",
      "2026-01-02"
     ]
    ],
    "codes": [
     "1.01"
    ],
    "pepites": {}
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"arpentage\": {\"observationsHorsReferentiel\": [{\"titre\": \"Cartographie personnelle du temps (mock)\", \"description\": \"Un syst\u00e8me de rep\u00e9rage temporel propre revient sur toute la p\u00e9riode (mock).\", \"journeesCitees\": [\"J01\"], \"indices\": [\"passage dat\u00e9 r\u00e9current (mock)\"], \"pourquoiHorsReferentiel\": \"Aucune des 61 ne couvre ce geste (mock).\", \"hypotheseFalsifiable\": \"Si les prochaines journ\u00e9es n'en portent aucune trace, l'hypoth\u00e8se tombe (mock).\", \"testEntretien\": \"Peux-tu montrer comment tu organises tes dates ? (mock)\", \"codesLesPlusProches\": [\"1.01\"]}], \"continuites\": [], \"grainesReferentiel\": [{\"code\": \"1.01\", \"journeesCitees\": [\"J01\"], \"indices\": [\"trace r\u00e9p\u00e9t\u00e9e (mock)\"], \"pourquoiInvisibleAuJour\": \"Chaque occurrence est trop t\u00e9nue isol\u00e9ment (mock).\"}]}}\n```",
   "record": {
    "label": "arpenteur",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 775,
    "tokens_estimes": 202,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "arpenteur",
   "meta": {
    "jours": [],
    "codes": [],
    "pepites": {}
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"arpentage\": {\"observationsHorsReferentiel\": [{\"titre\": \"Cartographie personnelle du temps (mock)\", \"description\": \"Un syst\u00e8me de rep\u00e9rage temporel propre revient sur toute la p\u00e9riode (mock).\", \"journeesCitees\": [], \"indices\": [\"passage dat\u00e9 r\u00e9current (mock)\"], \"pourquoiHorsReferentiel\": \"Aucune des 61 ne couvre ce geste (mock).\", \"hypotheseFalsifiable\": \"Si les prochaines journ\u00e9es n'en portent aucune trace, l'hypoth\u00e8se tombe (mock).\", \"testEntretien\": \"Peux-tu montrer comment tu organises tes dates ? (mock)\", \"codesLesPlusProches\": []}], \"continuites\": [], \"grainesReferentiel\": []}}\n```",
   "record": {
    "label": "arpenteur",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 603,
    "tokens_estimes": 159,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "arp"
   },
   "task": "arpenteur",
   "meta": {
    "jours": [
     [
      "Ja",
      "d1"
     ],
     [
      "Jb",
      "d2"
     ]
    ],
    "codes": [
     "5.05",
     "6.06"
    ],
    "pepites": {
     "Ja": [
      "p-a",
      "p-a2"
     ],
     "Jb": [
      "p-b"
     ]
    }
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"arpentage\": {\"observationsHorsReferentiel\": [{\"titre\": \"Cartographie personnelle du temps (mock)\", \"description\": \"Un syst\u00e8me de rep\u00e9rage temporel propre revient sur toute la p\u00e9riode (mock).\", \"journeesCitees\": [\"Ja\", \"Jb\"], \"indices\": [\"p-a\", \"p-b\"], \"pourquoiHorsReferentiel\": \"Aucune des 61 ne couvre ce geste (mock).\", \"hypotheseFalsifiable\": \"Si les prochaines journ\u00e9es n'en portent aucune trace, l'hypoth\u00e8se tombe (mock).\", \"testEntretien\": \"Peux-tu montrer comment tu organises tes dates ? (mock)\", \"codesLesPlusProches\": [\"5.05\"]}], \"continuites\": [{\"titre\": \"Le fil du projet long (mock)\", \"description\": \"Le m\u00eame chantier traverse les journ\u00e9es, invisible au jour le jour (mock).\", \"journeesCitees\": [\"Ja\", \"Jb\"], \"indices\": [\"p-a\", \"p-b\"], \"codesRelies\": [\"6.06\"]}], \"grainesReferentiel\": [{\"code\": \"5.05\", \"journeesCitees\": [\"Ja\", \"Jb\"], \"indices\": [\"p-a\", \"p-b\"], \"pourquoiInvisibleAuJour\": \"Chaque occurrence est trop t\u00e9nue isol\u00e9ment (mock).\"}]}}\n```",
   "record": {
    "label": "arpenteur",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 973,
    "tokens_estimes": 252,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "arpenteur",
   "meta": {},
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"arpentage\": {\"observationsHorsReferentiel\": [{\"titre\": \"Cartographie personnelle du temps (mock)\", \"description\": \"Un syst\u00e8me de rep\u00e9rage temporel propre revient sur toute la p\u00e9riode (mock).\", \"journeesCitees\": [], \"indices\": [\"passage dat\u00e9 r\u00e9current (mock)\"], \"pourquoiHorsReferentiel\": \"Aucune des 61 ne couvre ce geste (mock).\", \"hypotheseFalsifiable\": \"Si les prochaines journ\u00e9es n'en portent aucune trace, l'hypoth\u00e8se tombe (mock).\", \"testEntretien\": \"Peux-tu montrer comment tu organises tes dates ? (mock)\", \"codesLesPlusProches\": []}], \"continuites\": [], \"grainesReferentiel\": []}}\n```",
   "record": {
    "label": "arpenteur",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 603,
    "tokens_estimes": 159,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": ""
   },
   "task": "retour_sources",
   "meta": {
    "sentences": [
     [
      "F01",
      "Phrase une avec d\u00e9tail dat\u00e9."
     ],
     [
      "F02",
      "Deuxi\u00e8me phrase, plus r\u00e9flexive."
     ],
     [
      "F03",
      "Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral."
     ],
     [
      "F04",
      "Quatri\u00e8me phrase sur le chantier."
     ],
     [
      "F05",
      "Cinqui\u00e8me phrase, un essai chiffr\u00e9."
     ],
     [
      "F06",
      "Sixi\u00e8me phrase qui doute encore."
     ],
     [
      "F07",
      "Septi\u00e8me phrase concr\u00e8te et dat\u00e9e."
     ],
     [
      "F08",
      "Huiti\u00e8me phrase, retour au calme."
     ]
    ],
    "jours": [
     "J01",
     "J02"
    ],
    "titre": "Continuit\u00e9 X"
   },
   "model": null,
   "label": "retour_cont01_l1",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"retour_aux_sources\": {\"issue\": \"retrouv\u00e9e\", \"extraits\": [{\"journee\": \"F03\", \"verbatim\": \"Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral.\"}, {\"journee\": \"F08\", \"verbatim\": \"Huiti\u00e8me phrase, retour au calme.\"}, {\"journee\": \"J01\", \"verbatim\": \"Phrase invent\u00e9e absente du journal (mock hallucin\u00e9).\"}], \"commentaire\": \"V\u00e9rification mock sur le texte brut fourni.\"}}\n```",
   "record": {
    "label": "retour_cont01_l1",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 364,
    "tokens_estimes": 100,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "retour_sources",
   "meta": {
    "sentences": [
     [
      "F01",
      "Phrase une avec d\u00e9tail dat\u00e9."
     ],
     [
      "F02",
      "Deuxi\u00e8me phrase, plus r\u00e9flexive."
     ],
     [
      "F03",
      "Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral."
     ],
     [
      "F04",
      "Quatri\u00e8me phrase sur le chantier."
     ],
     [
      "F05",
      "Cinqui\u00e8me phrase, un essai chiffr\u00e9."
     ],
     [
      "F06",
      "Sixi\u00e8me phrase qui doute encore."
     ],
     [
      "F07",
      "Septi\u00e8me phrase concr\u00e8te et dat\u00e9e."
     ],
     [
      "F08",
      "Huiti\u00e8me phrase, retour au calme."
     ]
    ],
    "jours": [
     "J01"
    ]
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"retour_aux_sources\": {\"issue\": \"retrouv\u00e9e\", \"extraits\": [{\"journee\": \"F02\", \"verbatim\": \"Deuxi\u00e8me phrase, plus r\u00e9flexive.\"}, {\"journee\": \"F07\", \"verbatim\": \"Septi\u00e8me phrase concr\u00e8te et dat\u00e9e.\"}, {\"journee\": \"J01\", \"verbatim\": \"Phrase invent\u00e9e absente du journal (mock hallucin\u00e9).\"}], \"commentaire\": \"V\u00e9rification mock sur le texte brut fourni.\"}}\n```",
   "record": {
    "label": "retour_sources",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 360,
    "tokens_estimes": 99,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "u"
   },
   "task": "retour_sources",
   "meta": {
    "sentences": [
     [
      "F01",
      "Phrase une avec d\u00e9tail dat\u00e9."
     ],
     [
      "F02",
      "Deuxi\u00e8me phrase, plus r\u00e9flexive."
     ],
     [
      "F03",
      "Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral."
     ],
     [
      "F04",
      "Quatri\u00e8me phrase sur le chantier."
     ],
     [
      "F05",
      "Cinqui\u00e8me phrase, un essai chiffr\u00e9."
     ]
    ],
    "jours": [
     "J04"
    ],
    "titre": "T"
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"retour_aux_sources\": {\"issue\": \"retrouv\u00e9e\", \"extraits\": [{\"journee\": \"F03\", \"verbatim\": \"Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral.\"}, {\"journee\": \"J04\", \"verbatim\": \"Phrase invent\u00e9e absente du journal (mock hallucin\u00e9).\"}], \"commentaire\": \"V\u00e9rification mock sur le texte brut fourni.\"}}\n```",
   "record": {
    "label": "retour_sources",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 295,
    "tokens_estimes": 82,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "retour_sources",
   "meta": {
    "sentences": [
     [
      "F09",
      "L'unique phrase du jour."
     ]
    ],
    "jours": [],
    "titre": "Hors r\u00e9f"
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"retour_aux_sources\": {\"issue\": \"retrouv\u00e9e\", \"extraits\": [{\"journee\": \"F09\", \"verbatim\": \"L'unique phrase du jour.\"}, {\"journee\": \"?\", \"verbatim\": \"Phrase invent\u00e9e absente du journal (mock hallucin\u00e9).\"}], \"commentaire\": \"V\u00e9rification mock sur le texte brut fourni.\"}}\n```",
   "record": {
    "label": "retour_sources",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 280,
    "tokens_estimes": 79,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "retour_sources",
   "meta": {
    "sentences": [],
    "jours": [
     "J01"
    ],
    "titre": "T2"
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"retour_aux_sources\": {\"issue\": \"non retrouv\u00e9e\", \"extraits\": [], \"commentaire\": \"V\u00e9rification mock sur le texte brut fourni.\"}}\n```",
   "record": {
    "label": "retour_sources",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 140,
    "tokens_estimes": 44,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "mk"
   },
   "task": "merge_kairos",
   "meta": {},
   "model": null,
   "label": "merge_kairos",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"kairos\": {\"apprenant\": {\"portrait\": \"Le travail montre une pratique r\u00e9flexive qui se pr\u00e9cise (mock).\", \"formeProfil\": \"Un massif central, des avant-postes r\u00e9cents (mock).\", \"ceQuiRelieLesPoles\": \"Le geste de v\u00e9rification traverse les p\u00f4les (mock).\", \"ceQuiEmergeEntreLesLignes\": \"Une attention au d\u00e9tail, hors r\u00e9f\u00e9rentiel (mock).\", \"invitationsPourLaSuite\": [\"Pour prolonger cette trajectoire, un chemin possible serait de documenter un projet collectif (mock).\"], \"syntheseCompleteMarkdown\": \"## Portrait\\n\\nAu fil des journ\u00e9es, le travail montre une pratique qui se pr\u00e9cise (mock).\\n\\n## La forme de votre profil\\n\\nUn massif central qui se consolide, des avant-postes r\u00e9cents (mock).\\n\\n## Ce qui relie vos p\u00f4les\\n\\nLe geste de v\u00e9rification revient de journ\u00e9e en journ\u00e9e (mock).\\n\\n## Ce qui \u00e9merge entre les lignes\\n\\nUne attention r\u00e9currente aux d\u00e9tails, hors r\u00e9f\u00e9rentiel (mock).\\n\\n## Invitations pour la suite\\n\\n> Pour prolonger cette trajectoire, un chemin possible serait de documenter un projet collectif (mock).\"}}, \"emergencesCrossPoles\": {\"competencesOrphelines\": [{\"titre\": \"Documentation photographique (mock)\", \"description\": \"Des traces visuelles r\u00e9guli\u00e8res hors des 61 (mock).\", \"extraitsPortfolio\": [\"extrait mock\"], \"pourquoiOrpheline\": \"Aucune des 61 ne couvre ce geste (mock).\", \"hypothese\": \"Si le prochain portfolio n'en contient plus, l'hypoth\u00e8se tombe (mock).\", \"testEntretien\": \"Peux-tu montrer tes photos de travail ? (mock)\", \"enRelationAvecCodes\": [\"3.06\"]}], \"connexionsTransversales\": [{\"titre\": \"V\u00e9rifier avant d'affirmer (mock)\", \"description\": \"Le m\u00eame geste relie critique et \u00e9thique (mock).\", \"codesRelies\": [\"1.01\", \"4.07\"], \"extraitsPartages\": [\"extrait mock\"], \"metaPattern\": \"La preuve avant la parole (mock).\"}], \"noeudsConceptuels\": [], \"patternTemporel\": {\"type\": \"escalier\", \"evidence\": \"Plateaux puis sauts dat\u00e9s (mock).\"}, \"coherenceImpressionsVerdicts\": {\"convergences\": \"Impressions et verdicts align\u00e9s (mock).\", \"divergences\": \"\"}}}\n```",
   "record": {
    "label": "merge_kairos",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 1997,
    "tokens_estimes": 508,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "merge_kairos",
   "meta": {
    "x": 1
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"kairos\": {\"apprenant\": {\"portrait\": \"Le travail montre une pratique r\u00e9flexive qui se pr\u00e9cise (mock).\", \"formeProfil\": \"Un massif central, des avant-postes r\u00e9cents (mock).\", \"ceQuiRelieLesPoles\": \"Le geste de v\u00e9rification traverse les p\u00f4les (mock).\", \"ceQuiEmergeEntreLesLignes\": \"Une attention au d\u00e9tail, hors r\u00e9f\u00e9rentiel (mock).\", \"invitationsPourLaSuite\": [\"Pour prolonger cette trajectoire, un chemin possible serait de documenter un projet collectif (mock).\"], \"syntheseCompleteMarkdown\": \"## Portrait\\n\\nAu fil des journ\u00e9es, le travail montre une pratique qui se pr\u00e9cise (mock).\\n\\n## La forme de votre profil\\n\\nUn massif central qui se consolide, des avant-postes r\u00e9cents (mock).\\n\\n## Ce qui relie vos p\u00f4les\\n\\nLe geste de v\u00e9rification revient de journ\u00e9e en journ\u00e9e (mock).\\n\\n## Ce qui \u00e9merge entre les lignes\\n\\nUne attention r\u00e9currente aux d\u00e9tails, hors r\u00e9f\u00e9rentiel (mock).\\n\\n## Invitations pour la suite\\n\\n> Pour prolonger cette trajectoire, un chemin possible serait de documenter un projet collectif (mock).\"}}, \"emergencesCrossPoles\": {\"competencesOrphelines\": [{\"titre\": \"Documentation photographique (mock)\", \"description\": \"Des traces visuelles r\u00e9guli\u00e8res hors des 61 (mock).\", \"extraitsPortfolio\": [\"extrait mock\"], \"pourquoiOrpheline\": \"Aucune des 61 ne couvre ce geste (mock).\", \"hypothese\": \"Si le prochain portfolio n'en contient plus, l'hypoth\u00e8se tombe (mock).\", \"testEntretien\": \"Peux-tu montrer tes photos de travail ? (mock)\", \"enRelationAvecCodes\": [\"3.06\"]}], \"connexionsTransversales\": [{\"titre\": \"V\u00e9rifier avant d'affirmer (mock)\", \"description\": \"Le m\u00eame geste relie critique et \u00e9thique (mock).\", \"codesRelies\": [\"1.01\", \"4.07\"], \"extraitsPartages\": [\"extrait mock\"], \"metaPattern\": \"La preuve avant la parole (mock).\"}], \"noeudsConceptuels\": [], \"patternTemporel\": {\"type\": \"escalier\", \"evidence\": \"Plateaux puis sauts dat\u00e9s (mock).\"}, \"coherenceImpressionsVerdicts\": {\"convergences\": \"Impressions et verdicts align\u00e9s (mock).\", \"divergences\": \"\"}}}\n```",
   "record": {
    "label": "merge_kairos",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 1997,
    "tokens_estimes": 508,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "mr"
   },
   "task": "merge_rapporteur",
   "meta": {},
   "model": null,
   "label": "merge_rapporteur",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"rapport\": {\"journal_id\": \"mock\", \"date\": \"2026-01-01\", \"portrait\": \"Le travail montre une mani\u00e8re de penser qui v\u00e9rifie avant d'affirmer (mock).\", \"forme_profil\": \"Un relief \u00e0 massif central et vall\u00e9es calmes (mock).\", \"territoires_denses\": [{\"competence_nom\": \"Pens\u00e9e critique (mock)\", \"description\": \"Habit\u00e9e par des actes dat\u00e9s (mock).\", \"extrait_portfolio\": \"extrait mock\"}], \"non_trouve\": \"Le dossier ne contient pas encore de traces de certaines dimensions \u2014 pour rouvrir la question, documenter une situation v\u00e9cue (mock).\", \"emergences\": \"Des fils reviennent entre les lignes ; pistes \u00e0 explorer (mock).\", \"pistes\": [\"Pour que le tribunal puisse statuer, documenter un cas concret (mock).\"], \"pour_cartographe\": {\"renvois\": [{\"competence_code\": \"1.05\", \"question_entretien\": \"La pi\u00e8ce P1 rel\u00e8ve-t-elle de 1.05 ? (mock)\"}], \"alertes_gardien\": [], \"incoherences\": null, \"vigilance_gaming\": null, \"profil_ipsatif_complet\": \"voir profil_ipsatif.json\"}, \"rapport_complet_markdown\": \"## Portrait\\n\\nLe travail montre une pratique qui se pr\u00e9cise (mock).\\n\\n## La forme de votre profil\\n\\nUn massif central (mock).\\n\\n## Vos territoires les plus denses\\n\\n- Pens\u00e9e critique (mock)\\n\\n## Ce que le tribunal n'a pas trouv\u00e9\\n\\nTerritoires non visit\u00e9s (mock).\\n\\n## Ce qui \u00e9merge entre les lignes\\n\\nPistes (mock).\\n\\n## Pistes pour enrichir votre portfolio\\n\\n> Documenter un cas concret (mock).\\n\\n## Pour le Cartographe\\n\\n1.05 : question d'entretien (mock).\"}}\n```",
   "record": {
    "label": "merge_rapporteur",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 1474,
    "tokens_estimes": 377,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "merge_rapporteur",
   "meta": {},
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"rapport\": {\"journal_id\": \"mock\", \"date\": \"2026-01-01\", \"portrait\": \"Le travail montre une mani\u00e8re de penser qui v\u00e9rifie avant d'affirmer (mock).\", \"forme_profil\": \"Un relief \u00e0 massif central et vall\u00e9es calmes (mock).\", \"territoires_denses\": [{\"competence_nom\": \"Pens\u00e9e critique (mock)\", \"description\": \"Habit\u00e9e par des actes dat\u00e9s (mock).\", \"extrait_portfolio\": \"extrait mock\"}], \"non_trouve\": \"Le dossier ne contient pas encore de traces de certaines dimensions \u2014 pour rouvrir la question, documenter une situation v\u00e9cue (mock).\", \"emergences\": \"Des fils reviennent entre les lignes ; pistes \u00e0 explorer (mock).\", \"pistes\": [\"Pour que le tribunal puisse statuer, documenter un cas concret (mock).\"], \"pour_cartographe\": {\"renvois\": [{\"competence_code\": \"1.05\", \"question_entretien\": \"La pi\u00e8ce P1 rel\u00e8ve-t-elle de 1.05 ? (mock)\"}], \"alertes_gardien\": [], \"incoherences\": null, \"vigilance_gaming\": null, \"profil_ipsatif_complet\": \"voir profil_ipsatif.json\"}, \"rapport_complet_markdown\": \"## Portrait\\n\\nLe travail montre une pratique qui se pr\u00e9cise (mock).\\n\\n## La forme de votre profil\\n\\nUn massif central (mock).\\n\\n## Vos territoires les plus denses\\n\\n- Pens\u00e9e critique (mock)\\n\\n## Ce que le tribunal n'a pas trouv\u00e9\\n\\nTerritoires non visit\u00e9s (mock).\\n\\n## Ce qui \u00e9merge entre les lignes\\n\\nPistes (mock).\\n\\n## Pistes pour enrichir votre portfolio\\n\\n> Documenter un cas concret (mock).\\n\\n## Pour le Cartographe\\n\\n1.05 : question d'entretien (mock).\"}}\n```",
   "record": {
    "label": "merge_rapporteur",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 1474,
    "tokens_estimes": 377,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "merge_pole",
   "meta": {
    "pole": 3
   },
   "model": null,
   "label": "merge_pole_P3",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "## \u00c9volution du p\u00f4le 3\n\nSur la p\u00e9riode, ce p\u00f4le montre une progression d'abord exploratoire puis consolid\u00e9e (mock).",
   "record": {
    "label": "merge_pole_P3",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 115,
    "tokens_estimes": 37,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "merge_pole",
   "meta": {
    "pole": "P2"
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "## \u00c9volution du p\u00f4le P2\n\nSur la p\u00e9riode, ce p\u00f4le montre une progression d'abord exploratoire puis consolid\u00e9e (mock).",
   "record": {
    "label": "merge_pole",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 116,
    "tokens_estimes": 38,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "merge_pole",
   "meta": {},
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "## \u00c9volution du p\u00f4le ?\n\nSur la p\u00e9riode, ce p\u00f4le montre une progression d'abord exploratoire puis consolid\u00e9e (mock).",
   "record": {
    "label": "merge_pole",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 115,
    "tokens_estimes": 37,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "merge_competence",
   "meta": {
    "code": "1.01"
   },
   "model": null,
   "label": "merge_comp_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "Attest\u00e9e d'abord de fa\u00e7on isol\u00e9e, cette comp\u00e9tence s'est pr\u00e9cis\u00e9e au fil des journ\u00e9es : les traces passent de la d\u00e9claration \u00e0 l'acte situ\u00e9, et la confiance du coll\u00e8ge s'est consolid\u00e9e (mock).",
   "record": {
    "label": "merge_comp_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 192,
    "tokens_estimes": 57,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "merge_competence",
   "meta": {},
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "Attest\u00e9e d'abord de fa\u00e7on isol\u00e9e, cette comp\u00e9tence s'est pr\u00e9cis\u00e9e au fil des journ\u00e9es : les traces passent de la d\u00e9claration \u00e0 l'acte situ\u00e9, et la confiance du coll\u00e8ge s'est consolid\u00e9e (mock).",
   "record": {
    "label": "merge_competence",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 192,
    "tokens_estimes": 57,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "k"
   },
   "task": "kairos",
   "meta": {},
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"kairos\": {\"apprenant\": {\"portrait\": \"Le portfolio montre un travail r\u00e9gulier, ancr\u00e9 dans des situations v\u00e9cues (mock).\", \"formeProfil\": \"Un massif central et quelques avant-postes (mock).\", \"ceQuiRelieLesPoles\": \"Le geste de v\u00e9rification traverse plusieurs p\u00f4les (mock).\", \"ceQuiEmergeEntreLesLignes\": \"Une attention au d\u00e9tail non couverte par le r\u00e9f\u00e9rentiel (mock).\", \"invitationsPourLaSuite\": [\"Pour prolonger l'exploration, un chemin possible serait de documenter un projet collectif.\"], \"syntheseCompleteMarkdown\": \"## Synth\u00e8se\\n\\nSynth\u00e8se inter-p\u00f4les g\u00e9n\u00e9r\u00e9e par le backend mock.\\n\"}}, \"emergencesCrossPoles\": {\"competencesOrphelines\": [], \"connexionsTransversales\": [], \"noeudsConceptuels\": []}}\n```",
   "record": {
    "label": "kairos",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 715,
    "tokens_estimes": 187,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "kairos",
   "meta": {
    "y": 2
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "```json\n{\"kairos\": {\"apprenant\": {\"portrait\": \"Le portfolio montre un travail r\u00e9gulier, ancr\u00e9 dans des situations v\u00e9cues (mock).\", \"formeProfil\": \"Un massif central et quelques avant-postes (mock).\", \"ceQuiRelieLesPoles\": \"Le geste de v\u00e9rification traverse plusieurs p\u00f4les (mock).\", \"ceQuiEmergeEntreLesLignes\": \"Une attention au d\u00e9tail non couverte par le r\u00e9f\u00e9rentiel (mock).\", \"invitationsPourLaSuite\": [\"Pour prolonger l'exploration, un chemin possible serait de documenter un projet collectif.\"], \"syntheseCompleteMarkdown\": \"## Synth\u00e8se\\n\\nSynth\u00e8se inter-p\u00f4les g\u00e9n\u00e9r\u00e9e par le backend mock.\\n\"}}, \"emergencesCrossPoles\": {\"competencesOrphelines\": [], \"connexionsTransversales\": [], \"noeudsConceptuels\": []}}\n```",
   "record": {
    "label": "kairos",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 715,
    "tokens_estimes": 187,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": ""
   },
   "task": "greffier",
   "meta": {
    "code": "1.01",
    "nom": "Nom un",
    "sentences": [
     [
      "F01",
      "Phrase une avec d\u00e9tail dat\u00e9."
     ],
     [
      "F02",
      "Deuxi\u00e8me phrase, plus r\u00e9flexive."
     ],
     [
      "F03",
      "Troisi\u00e8me phrase \ud83c\udf89 avec emoji astral."
     ],
     [
      "F04",
      "Quatri\u00e8me phrase sur le chantier."
     ],
     [
      "F05",
      "Cinqui\u00e8me phrase, un essai chiffr\u00e9."
     ],
     [
      "F06",
      "Sixi\u00e8me phrase qui doute encore."
     ],
     [
      "F07",
      "Septi\u00e8me phrase concr\u00e8te et dat\u00e9e."
     ],
     [
      "F08",
      "Huiti\u00e8me phrase, retour au calme."
     ]
    ]
   },
   "model": null,
   "label": "greffier_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Greffier \u2014 1.01 Nom un\n\n### Pi\u00e8ces extraites\n\n#### Pi\u00e8ce 1\n- **Extrait** : \u00ab Phrase une avec d\u00e9tail dat\u00e9. \u00bb\n- **Date** : F01\n- **Localisation** : feuille F01\n- **Type** : trace concr\u00e8te\n- **Vigilance** : aucune\n\n#### Pi\u00e8ce 2\n- **Extrait** : \u00ab Huiti\u00e8me phrase, retour au calme. \u00bb\n- **Date** : F08\n- **Localisation** : feuille F08\n- **Type** : d\u00e9claration \u00e9tay\u00e9e\n- **Vigilance** : aucune\n\n#### Pi\u00e8ce 3\n- **Extrait** : \u00ab Quatri\u00e8me phrase sur le chantier. \u00bb\n- **Date** : F04\n- **Localisation** : feuille F04\n- **Type** : d\u00e9claration \u00e9tay\u00e9e\n- **Vigilance** : aucune\n\n### Bilan\n- Traces concr\u00e8tes : 1\n- D\u00e9clarations \u00e9tay\u00e9es : 2\n- D\u00e9clarations nues : 0\n- Intentions : 0\n- Observations tierces : 0\n- Alertes authenticit\u00e9 : 0",
   "record": {
    "label": "greffier_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 718,
    "tokens_estimes": 188,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "greffier",
   "meta": {
    "code": "1.01",
    "nom": "Nom huit",
    "sentences": [
     [
      "J02_s1",
      "Une seule matin\u00e9e au jardin."
     ],
     [
      "J02_s2",
      "L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb."
     ],
     [
      "J02_s3",
      "Le soir, notes rapides."
     ]
    ]
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Greffier \u2014 1.01 Nom huit\n\n### Pi\u00e8ces extraites\n\n#### Pi\u00e8ce 1\n- **Extrait** : \u00ab L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb. \u00bb\n- **Date** : J02_s2\n- **Localisation** : feuille J02_s2\n- **Type** : trace concr\u00e8te\n- **Vigilance** : aucune\n\n#### Pi\u00e8ce 2\n- **Extrait** : \u00ab Le soir, notes rapides. \u00bb\n- **Date** : J02_s3\n- **Localisation** : feuille J02_s3\n- **Type** : d\u00e9claration \u00e9tay\u00e9e\n- **Vigilance** : aucune\n\n#### Pi\u00e8ce 3\n- **Extrait** : \u00ab L'apr\u00e8s-midi, semis \u00ab \u00e0 la vol\u00e9e \u00bb. \u00bb\n- **Date** : J02_s2\n- **Localisation** : feuille J02_s2\n- **Type** : d\u00e9claration \u00e9tay\u00e9e\n- **Vigilance** : aucune\n\n### Bilan\n- Traces concr\u00e8tes : 1\n- D\u00e9clarations \u00e9tay\u00e9es : 2\n- D\u00e9clarations nues : 0\n- Intentions : 0\n- Observations tierces : 0\n- Alertes authenticit\u00e9 : 0",
   "record": {
    "label": "greffier",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 737,
    "tokens_estimes": 193,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "greffier",
   "meta": {
    "code": "2.02",
    "nom": "Vide",
    "sentences": []
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Greffier \u2014 2.02 Vide\n\nDOSSIER VIDE \u2014 Aucune pi\u00e8ce identifi\u00e9e pour 2.02.",
   "record": {
    "label": "greffier",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 73,
    "tokens_estimes": 27,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "greffier",
   "meta": {},
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Greffier \u2014 ? ?\n\nDOSSIER VIDE \u2014 Aucune pi\u00e8ce identifi\u00e9e pour ?.",
   "record": {
    "label": "greffier",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 64,
    "tokens_estimes": 25,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "accusation",
   "meta": {
    "code": "3.03",
    "nom": "Nom trois"
   },
   "model": null,
   "label": "accusation_J01_3.03",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Accusation \u2014 3.03 Nom trois\n\n## Th\u00e8se\nLes pi\u00e8ces P1-P3 montrent des actes dat\u00e9s.\n\n## Arguments\n### Argument 1 \u2014 Acte document\u00e9\nPi\u00e8ces : P1. L'acte d\u00e9crit correspond aux manifestations de la fiche.\n\n## Auto-\u00e9valuation de la force du dossier\nmod\u00e9r\u00e9e \u2014 dossier r\u00e9el mais \u00e9troit.",
   "record": {
    "label": "accusation_J01_3.03",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 277,
    "tokens_estimes": 78,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "t"
   },
   "task": "accusation",
   "meta": {
    "code": "1.05",
    "nom": "Nom neuf"
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Accusation \u2014 1.05 Nom neuf\n\n## Th\u00e8se\nLes pi\u00e8ces P1-P3 montrent des actes dat\u00e9s.\n\n## Arguments\n### Argument 1 \u2014 Acte document\u00e9\nPi\u00e8ces : P1. L'acte d\u00e9crit correspond aux manifestations de la fiche.\n\n## Auto-\u00e9valuation de la force du dossier\nmod\u00e9r\u00e9e \u2014 dossier r\u00e9el mais \u00e9troit.",
   "record": {
    "label": "accusation",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 276,
    "tokens_estimes": 78,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "accusation",
   "meta": {},
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Accusation \u2014 ? ?\n\n## Th\u00e8se\nLes pi\u00e8ces P1-P3 montrent des actes dat\u00e9s.\n\n## Arguments\n### Argument 1 \u2014 Acte document\u00e9\nPi\u00e8ces : P1. L'acte d\u00e9crit correspond aux manifestations de la fiche.\n\n## Auto-\u00e9valuation de la force du dossier\nmod\u00e9r\u00e9e \u2014 dossier r\u00e9el mais \u00e9troit.",
   "record": {
    "label": "accusation",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 266,
    "tokens_estimes": 75,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "defense",
   "meta": {
    "code": "3.03",
    "nom": "Nom trois"
   },
   "model": null,
   "label": "defense_J01_3.03",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# D\u00e9fense \u2014 3.03 Nom trois\n\n## Position g\u00e9n\u00e9rale\nLe dossier est \u00e9troit.\n\n## Attaques\n### Attaque 1 \u2014 Insuffisance probatoire \u2014 vise Argument 1 / Pi\u00e8ces P2, P3\nDeux pi\u00e8ces sont d\u00e9claratives, sans dispositif.\n\n## Ce que la D\u00e9fense conc\u00e8de\nP1 d\u00e9crit un acte r\u00e9el.\n\n## Conclusion\nContestation partielle : la pr\u00e9sence repose sur P1 seule.",
   "record": {
    "label": "defense_J01_3.03",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 333,
    "tokens_estimes": 92,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "t"
   },
   "task": "defense",
   "meta": {
    "code": "1.05",
    "nom": "Nom neuf"
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# D\u00e9fense \u2014 1.05 Nom neuf\n\n## Position g\u00e9n\u00e9rale\nLe dossier est \u00e9troit.\n\n## Attaques\n### Attaque 1 \u2014 Insuffisance probatoire \u2014 vise Argument 1 / Pi\u00e8ces P2, P3\nDeux pi\u00e8ces sont d\u00e9claratives, sans dispositif.\n\n## Ce que la D\u00e9fense conc\u00e8de\nP1 d\u00e9crit un acte r\u00e9el.\n\n## Conclusion\nContestation partielle : la pr\u00e9sence repose sur P1 seule.",
   "record": {
    "label": "defense",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 332,
    "tokens_estimes": 92,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "defense",
   "meta": {},
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# D\u00e9fense \u2014 ? ?\n\n## Position g\u00e9n\u00e9rale\nLe dossier est \u00e9troit.\n\n## Attaques\n### Attaque 1 \u2014 Insuffisance probatoire \u2014 vise Argument 1 / Pi\u00e8ces P2, P3\nDeux pi\u00e8ces sont d\u00e9claratives, sans dispositif.\n\n## Ce que la D\u00e9fense conc\u00e8de\nP1 d\u00e9crit un acte r\u00e9el.\n\n## Conclusion\nContestation partielle : la pr\u00e9sence repose sur P1 seule.",
   "record": {
    "label": "defense",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 322,
    "tokens_estimes": 89,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "replique",
   "meta": {
    "code": "3.03",
    "nom": "Nom trois"
   },
   "model": null,
   "label": "replique_J01_3.03",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# R\u00e9plique \u2014 3.03 Nom trois\n\n### R\u00e9ponse \u00e0 l'Attaque 1\npartiellement conc\u00e9d\u00e9e \u2014 P2 reste un indice, P3 est abandonn\u00e9e.\n\n## \u00c9tat final du r\u00e9quisitoire\nP1 (preuve) + P2 (indice) tiennent.",
   "record": {
    "label": "replique_J01_3.03",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 185,
    "tokens_estimes": 55,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "t"
   },
   "task": "replique",
   "meta": {
    "code": "1.05",
    "nom": "Nom neuf"
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# R\u00e9plique \u2014 1.05 Nom neuf\n\n### R\u00e9ponse \u00e0 l'Attaque 1\npartiellement conc\u00e9d\u00e9e \u2014 P2 reste un indice, P3 est abandonn\u00e9e.\n\n## \u00c9tat final du r\u00e9quisitoire\nP1 (preuve) + P2 (indice) tiennent.",
   "record": {
    "label": "replique",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 184,
    "tokens_estimes": 55,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "replique",
   "meta": {},
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# R\u00e9plique \u2014 ? ?\n\n### R\u00e9ponse \u00e0 l'Attaque 1\npartiellement conc\u00e9d\u00e9e \u2014 P2 reste un indice, P3 est abandonn\u00e9e.\n\n## \u00c9tat final du r\u00e9quisitoire\nP1 (preuve) + P2 (indice) tiennent.",
   "record": {
    "label": "replique",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 174,
    "tokens_estimes": 52,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "briefing",
   "meta": {
    "code": "3.03",
    "nom": "Nom trois"
   },
   "model": null,
   "label": "briefing_J01_3.03",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Briefing jur\u00e9 \u2014 3.03 Nom trois\n\n## Ce que soutient l'Accusation\nP1 acte dat\u00e9 ; P2 indice.\n\n## Ce que soutient la D\u00e9fense\nP2-P3 d\u00e9claratives.\n\n## Issue de la r\u00e9plique\nP3 abandonn\u00e9e.\n\n## Points de convergence\nP1 est un acte r\u00e9el.\n\n## Questions \u00e0 trancher par le jury\n1. P1 suffit-elle seule ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "briefing_J01_3.03",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 326,
    "tokens_estimes": 90,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "t"
   },
   "task": "briefing",
   "meta": {
    "code": "1.05",
    "nom": "Nom neuf"
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Briefing jur\u00e9 \u2014 1.05 Nom neuf\n\n## Ce que soutient l'Accusation\nP1 acte dat\u00e9 ; P2 indice.\n\n## Ce que soutient la D\u00e9fense\nP2-P3 d\u00e9claratives.\n\n## Issue de la r\u00e9plique\nP3 abandonn\u00e9e.\n\n## Points de convergence\nP1 est un acte r\u00e9el.\n\n## Questions \u00e0 trancher par le jury\n1. P1 suffit-elle seule ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "briefing",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 325,
    "tokens_estimes": 90,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "briefing",
   "meta": {},
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Briefing jur\u00e9 \u2014 ? ?\n\n## Ce que soutient l'Accusation\nP1 acte dat\u00e9 ; P2 indice.\n\n## Ce que soutient la D\u00e9fense\nP2-P3 d\u00e9claratives.\n\n## Issue de la r\u00e9plique\nP3 abandonn\u00e9e.\n\n## Points de convergence\nP1 est un acte r\u00e9el.\n\n## Questions \u00e0 trancher par le jury\n1. P1 suffit-elle seule ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "briefing",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 315,
    "tokens_estimes": 87,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "jure_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Linguiste \u2014 1.01 Nom 1.01\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 251,
    "tokens_estimes": 71,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "jure2_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Linguiste \u2014 1.01 Nom 1.01\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 260,
    "tokens_estimes": 74,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "jure": "Historien"
   },
   "model": null,
   "label": "jure_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Historien \u2014 1.01 Nom 1.01\n\n**Position** : contestation\n**Pi\u00e8ces** : P2, P3\n**Pi\u00e8ge vis\u00e9** : r\u00e9cit performatif (d\u00e9claration sans acte)\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 294,
    "tokens_estimes": 82,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "jure": "Historien"
   },
   "model": null,
   "label": "jure2_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Historien \u2014 1.01 Nom 1.01\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 260,
    "tokens_estimes": 74,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "jure_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 P\u00e9dagogue \u2014 1.01 Nom 1.01\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 251,
    "tokens_estimes": 71,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "jure2_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 P\u00e9dagogue \u2014 1.01 Nom 1.01\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 260,
    "tokens_estimes": 74,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "jure_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Sociologue \u2014 1.01 Nom 1.01\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 252,
    "tokens_estimes": 72,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "jure2_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Sociologue \u2014 1.01 Nom 1.01\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 261,
    "tokens_estimes": 74,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "jure": "\u00c9thicien"
   },
   "model": null,
   "label": "jure_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 \u00c9thicien \u2014 1.01 Nom 1.01\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 250,
    "tokens_estimes": 71,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "jure": "\u00c9thicien"
   },
   "model": null,
   "label": "jure2_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 \u00c9thicien \u2014 1.01 Nom 1.01\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 259,
    "tokens_estimes": 73,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.05",
    "nom": "Nom 1.05",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "jure_J01_1.05",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Linguiste \u2014 1.05 Nom 1.05\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.05",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 251,
    "tokens_estimes": 71,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.05",
    "nom": "Nom 1.05",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "jure2_J01_1.05",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Linguiste \u2014 1.05 Nom 1.05\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.05",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 260,
    "tokens_estimes": 74,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.05",
    "nom": "Nom 1.05",
    "jure": "Historien"
   },
   "model": null,
   "label": "jure_J01_1.05",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Historien \u2014 1.05 Nom 1.05\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.05",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 247,
    "tokens_estimes": 70,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.05",
    "nom": "Nom 1.05",
    "jure": "Historien"
   },
   "model": null,
   "label": "jure2_J01_1.05",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Historien \u2014 1.05 Nom 1.05\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.05",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 256,
    "tokens_estimes": 73,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.05",
    "nom": "Nom 1.05",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "jure_J01_1.05",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 P\u00e9dagogue \u2014 1.05 Nom 1.05\n\n**Position** : contestation\n**Pi\u00e8ces** : P2, P3\n**Pi\u00e8ge vis\u00e9** : r\u00e9cit performatif (d\u00e9claration sans acte)\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.05",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 294,
    "tokens_estimes": 82,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.05",
    "nom": "Nom 1.05",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "jure2_J01_1.05",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 P\u00e9dagogue \u2014 1.05 Nom 1.05\n\n**Position** : contestation\n**Pi\u00e8ces** : P2, P3\n**Pi\u00e8ge vis\u00e9** : r\u00e9cit performatif (d\u00e9claration sans acte)\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.05",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 303,
    "tokens_estimes": 84,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.05",
    "nom": "Nom 1.05",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "jure_J01_1.05",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Sociologue \u2014 1.05 Nom 1.05\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.05",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 248,
    "tokens_estimes": 71,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.05",
    "nom": "Nom 1.05",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "jure2_J01_1.05",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Sociologue \u2014 1.05 Nom 1.05\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.05",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 257,
    "tokens_estimes": 73,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.05",
    "nom": "Nom 1.05",
    "jure": "\u00c9thicien"
   },
   "model": null,
   "label": "jure_J01_1.05",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 \u00c9thicien \u2014 1.05 Nom 1.05\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.05",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 246,
    "tokens_estimes": 70,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.05",
    "nom": "Nom 1.05",
    "jure": "\u00c9thicien"
   },
   "model": null,
   "label": "jure2_J01_1.05",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 \u00c9thicien \u2014 1.05 Nom 1.05\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.05",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 255,
    "tokens_estimes": 72,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.07",
    "nom": "Nom 1.07",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "jure_J01_1.07",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Linguiste \u2014 1.07 Nom 1.07\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.07",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 251,
    "tokens_estimes": 71,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.07",
    "nom": "Nom 1.07",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "jure2_J01_1.07",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Linguiste \u2014 1.07 Nom 1.07\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.07",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 260,
    "tokens_estimes": 74,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.07",
    "nom": "Nom 1.07",
    "jure": "Historien"
   },
   "model": null,
   "label": "jure_J01_1.07",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Historien \u2014 1.07 Nom 1.07\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.07",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 251,
    "tokens_estimes": 71,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.07",
    "nom": "Nom 1.07",
    "jure": "Historien"
   },
   "model": null,
   "label": "jure2_J01_1.07",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Historien \u2014 1.07 Nom 1.07\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.07",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 260,
    "tokens_estimes": 74,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.07",
    "nom": "Nom 1.07",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "jure_J01_1.07",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 P\u00e9dagogue \u2014 1.07 Nom 1.07\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.07",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 251,
    "tokens_estimes": 71,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.07",
    "nom": "Nom 1.07",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "jure2_J01_1.07",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 P\u00e9dagogue \u2014 1.07 Nom 1.07\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.07",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 260,
    "tokens_estimes": 74,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.07",
    "nom": "Nom 1.07",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "jure_J01_1.07",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Sociologue \u2014 1.07 Nom 1.07\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.07",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 248,
    "tokens_estimes": 71,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.07",
    "nom": "Nom 1.07",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "jure2_J01_1.07",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Sociologue \u2014 1.07 Nom 1.07\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.07",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 257,
    "tokens_estimes": 73,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.07",
    "nom": "Nom 1.07",
    "jure": "\u00c9thicien"
   },
   "model": null,
   "label": "jure_J01_1.07",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 \u00c9thicien \u2014 1.07 Nom 1.07\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.07",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 250,
    "tokens_estimes": 71,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.07",
    "nom": "Nom 1.07",
    "jure": "\u00c9thicien"
   },
   "model": null,
   "label": "jure2_J01_1.07",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 \u00c9thicien \u2014 1.07 Nom 1.07\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.07",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 259,
    "tokens_estimes": 73,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.02",
    "nom": "Nom 1.02",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "jure_J01_1.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Linguiste \u2014 1.02 Nom 1.02\n\n**Position** : contestation\n**Pi\u00e8ces** : P2, P3\n**Pi\u00e8ge vis\u00e9** : r\u00e9cit performatif (d\u00e9claration sans acte)\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 294,
    "tokens_estimes": 82,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.02",
    "nom": "Nom 1.02",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "jure2_J01_1.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Linguiste \u2014 1.02 Nom 1.02\n\n**Position** : contestation\n**Pi\u00e8ces** : P2, P3\n**Pi\u00e8ge vis\u00e9** : r\u00e9cit performatif (d\u00e9claration sans acte)\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 303,
    "tokens_estimes": 84,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.02",
    "nom": "Nom 1.02",
    "jure": "Historien"
   },
   "model": null,
   "label": "jure_J01_1.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Historien \u2014 1.02 Nom 1.02\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 247,
    "tokens_estimes": 70,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.02",
    "nom": "Nom 1.02",
    "jure": "Historien"
   },
   "model": null,
   "label": "jure2_J01_1.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Historien \u2014 1.02 Nom 1.02\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 256,
    "tokens_estimes": 73,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.02",
    "nom": "Nom 1.02",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "jure_J01_1.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 P\u00e9dagogue \u2014 1.02 Nom 1.02\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 247,
    "tokens_estimes": 70,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.02",
    "nom": "Nom 1.02",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "jure2_J01_1.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 P\u00e9dagogue \u2014 1.02 Nom 1.02\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 256,
    "tokens_estimes": 73,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.02",
    "nom": "Nom 1.02",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "jure_J01_1.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Sociologue \u2014 1.02 Nom 1.02\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 248,
    "tokens_estimes": 71,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.02",
    "nom": "Nom 1.02",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "jure2_J01_1.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Sociologue \u2014 1.02 Nom 1.02\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 257,
    "tokens_estimes": 73,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.02",
    "nom": "Nom 1.02",
    "jure": "\u00c9thicien"
   },
   "model": null,
   "label": "jure_J01_1.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 \u00c9thicien \u2014 1.02 Nom 1.02\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 250,
    "tokens_estimes": 71,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.02",
    "nom": "Nom 1.02",
    "jure": "\u00c9thicien"
   },
   "model": null,
   "label": "jure2_J01_1.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 \u00c9thicien \u2014 1.02 Nom 1.02\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 259,
    "tokens_estimes": 73,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "3.02",
    "nom": "Nom 3.02",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "jure_J01_3.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Linguiste \u2014 3.02 Nom 3.02\n\n**Position** : contestation\n**Pi\u00e8ces** : P2, P3\n**Pi\u00e8ge vis\u00e9** : r\u00e9cit performatif (d\u00e9claration sans acte)\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_3.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 294,
    "tokens_estimes": 82,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "3.02",
    "nom": "Nom 3.02",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "jure2_J01_3.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Linguiste \u2014 3.02 Nom 3.02\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_3.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 256,
    "tokens_estimes": 73,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "3.02",
    "nom": "Nom 3.02",
    "jure": "Historien"
   },
   "model": null,
   "label": "jure_J01_3.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Historien \u2014 3.02 Nom 3.02\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_3.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 251,
    "tokens_estimes": 71,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "3.02",
    "nom": "Nom 3.02",
    "jure": "Historien"
   },
   "model": null,
   "label": "jure2_J01_3.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Historien \u2014 3.02 Nom 3.02\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_3.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 260,
    "tokens_estimes": 74,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "3.02",
    "nom": "Nom 3.02",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "jure_J01_3.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 P\u00e9dagogue \u2014 3.02 Nom 3.02\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_3.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 247,
    "tokens_estimes": 70,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "3.02",
    "nom": "Nom 3.02",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "jure2_J01_3.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 P\u00e9dagogue \u2014 3.02 Nom 3.02\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_3.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 256,
    "tokens_estimes": 73,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "3.02",
    "nom": "Nom 3.02",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "jure_J01_3.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Sociologue \u2014 3.02 Nom 3.02\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_3.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 248,
    "tokens_estimes": 71,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "3.02",
    "nom": "Nom 3.02",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "jure2_J01_3.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Sociologue \u2014 3.02 Nom 3.02\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_3.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 257,
    "tokens_estimes": 73,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "3.02",
    "nom": "Nom 3.02",
    "jure": "\u00c9thicien"
   },
   "model": null,
   "label": "jure_J01_3.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 \u00c9thicien \u2014 3.02 Nom 3.02\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_3.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 246,
    "tokens_estimes": 70,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "3.02",
    "nom": "Nom 3.02",
    "jure": "\u00c9thicien"
   },
   "model": null,
   "label": "jure2_J01_3.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 \u00c9thicien \u2014 3.02 Nom 3.02\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_3.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 255,
    "tokens_estimes": 72,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.04",
    "nom": "Nom 1.04",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "jure_J01_1.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Linguiste \u2014 1.04 Nom 1.04\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 247,
    "tokens_estimes": 70,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.04",
    "nom": "Nom 1.04",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "jure2_J01_1.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Linguiste \u2014 1.04 Nom 1.04\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 256,
    "tokens_estimes": 73,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.04",
    "nom": "Nom 1.04",
    "jure": "Historien"
   },
   "model": null,
   "label": "jure_J01_1.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Historien \u2014 1.04 Nom 1.04\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 247,
    "tokens_estimes": 70,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.04",
    "nom": "Nom 1.04",
    "jure": "Historien"
   },
   "model": null,
   "label": "jure2_J01_1.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Historien \u2014 1.04 Nom 1.04\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 256,
    "tokens_estimes": 73,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.04",
    "nom": "Nom 1.04",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "jure_J01_1.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 P\u00e9dagogue \u2014 1.04 Nom 1.04\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 247,
    "tokens_estimes": 70,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.04",
    "nom": "Nom 1.04",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "jure2_J01_1.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 P\u00e9dagogue \u2014 1.04 Nom 1.04\n\n**Position** : contestation\n**Pi\u00e8ces** : P2, P3\n**Pi\u00e8ge vis\u00e9** : r\u00e9cit performatif (d\u00e9claration sans acte)\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 303,
    "tokens_estimes": 84,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.04",
    "nom": "Nom 1.04",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "jure_J01_1.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Sociologue \u2014 1.04 Nom 1.04\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 252,
    "tokens_estimes": 72,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.04",
    "nom": "Nom 1.04",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "jure2_J01_1.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Sociologue \u2014 1.04 Nom 1.04\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 261,
    "tokens_estimes": 74,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "1.04",
    "nom": "Nom 1.04",
    "jure": "\u00c9thicien"
   },
   "model": null,
   "label": "jure_J01_1.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 \u00c9thicien \u2014 1.04 Nom 1.04\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_1.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 246,
    "tokens_estimes": 70,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "1.04",
    "nom": "Nom 1.04",
    "jure": "\u00c9thicien"
   },
   "model": null,
   "label": "jure2_J01_1.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 \u00c9thicien \u2014 1.04 Nom 1.04\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_1.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 255,
    "tokens_estimes": 72,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "3.04",
    "nom": "Nom 3.04",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "jure_J01_3.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Linguiste \u2014 3.04 Nom 3.04\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_3.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 247,
    "tokens_estimes": 70,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "3.04",
    "nom": "Nom 3.04",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "jure2_J01_3.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Linguiste \u2014 3.04 Nom 3.04\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_3.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 256,
    "tokens_estimes": 73,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "3.04",
    "nom": "Nom 3.04",
    "jure": "Historien"
   },
   "model": null,
   "label": "jure_J01_3.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Historien \u2014 3.04 Nom 3.04\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_3.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 251,
    "tokens_estimes": 71,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "3.04",
    "nom": "Nom 3.04",
    "jure": "Historien"
   },
   "model": null,
   "label": "jure2_J01_3.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Historien \u2014 3.04 Nom 3.04\n\n**Position** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_3.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 260,
    "tokens_estimes": 74,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "3.04",
    "nom": "Nom 3.04",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "jure_J01_3.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 P\u00e9dagogue \u2014 3.04 Nom 3.04\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_3.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 247,
    "tokens_estimes": 70,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "3.04",
    "nom": "Nom 3.04",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "jure2_J01_3.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 P\u00e9dagogue \u2014 3.04 Nom 3.04\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_3.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 256,
    "tokens_estimes": 73,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "3.04",
    "nom": "Nom 3.04",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "jure_J01_3.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 Sociologue \u2014 3.04 Nom 3.04\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_3.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 248,
    "tokens_estimes": 71,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "3.04",
    "nom": "Nom 3.04",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "jure2_J01_3.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 Sociologue \u2014 3.04 Nom 3.04\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_3.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 257,
    "tokens_estimes": 73,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {
    "code": "3.04",
    "nom": "Nom 3.04",
    "jure": "\u00c9thicien"
   },
   "model": null,
   "label": "jure_J01_3.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 \u00c9thicien \u2014 3.04 Nom 3.04\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure_J01_3.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 246,
    "tokens_estimes": 70,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure2",
   "meta": {
    "code": "3.04",
    "nom": "Nom 3.04",
    "jure": "\u00c9thicien"
   },
   "model": null,
   "label": "jure2_J01_3.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Second tour \u2014 \u00c9thicien \u2014 3.04 Nom 3.04\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure2_J01_3.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 255,
    "tokens_estimes": 72,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "relance_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 Linguiste \u2014 1.01 Nom 1.01\n\n**Position maintenue** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 301,
    "tokens_estimes": 84,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "jure": "Historien"
   },
   "model": null,
   "label": "relance_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 Historien \u2014 1.01 Nom 1.01\n\n**Position maintenue** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 301,
    "tokens_estimes": 84,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "relance_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 P\u00e9dagogue \u2014 1.01 Nom 1.01\n\n**Position maintenue** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 301,
    "tokens_estimes": 84,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "relance_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 Sociologue \u2014 1.01 Nom 1.01\n\n**Position maintenue** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 302,
    "tokens_estimes": 84,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "jure": "Portraitiste"
   },
   "model": null,
   "label": "relance_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 Portraitiste \u2014 1.01 Nom 1.01\n\n**Position maintenue** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 304,
    "tokens_estimes": 85,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "1.04",
    "nom": "Nom 1.04",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "relance_J01_1.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 Linguiste \u2014 1.04 Nom 1.04\n\n**Position maintenue** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_1.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 297,
    "tokens_estimes": 83,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "1.04",
    "nom": "Nom 1.04",
    "jure": "Historien"
   },
   "model": null,
   "label": "relance_J01_1.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 Historien \u2014 1.04 Nom 1.04\n\n**Position maintenue** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_1.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 297,
    "tokens_estimes": 83,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "1.04",
    "nom": "Nom 1.04",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "relance_J01_1.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 P\u00e9dagogue \u2014 1.04 Nom 1.04\n\n**Position maintenue** : contestation\n**Pi\u00e8ces** : P2, P3\n**Pi\u00e8ge vis\u00e9** : r\u00e9cit performatif (d\u00e9claration sans acte)\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_1.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 344,
    "tokens_estimes": 95,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "1.04",
    "nom": "Nom 1.04",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "relance_J01_1.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 Sociologue \u2014 1.04 Nom 1.04\n\n**Position maintenue** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_1.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 302,
    "tokens_estimes": 84,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "1.04",
    "nom": "Nom 1.04",
    "jure": "Portraitiste"
   },
   "model": null,
   "label": "relance_J01_1.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 Portraitiste \u2014 1.04 Nom 1.04\n\n**Position maintenue** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_1.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 300,
    "tokens_estimes": 84,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "3.02",
    "nom": "Nom 3.02",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "relance_J01_3.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 Linguiste \u2014 3.02 Nom 3.02\n\n**Position maintenue** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_3.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 297,
    "tokens_estimes": 83,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "3.02",
    "nom": "Nom 3.02",
    "jure": "Historien"
   },
   "model": null,
   "label": "relance_J01_3.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 Historien \u2014 3.02 Nom 3.02\n\n**Position maintenue** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_3.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 301,
    "tokens_estimes": 84,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "3.02",
    "nom": "Nom 3.02",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "relance_J01_3.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 P\u00e9dagogue \u2014 3.02 Nom 3.02\n\n**Position maintenue** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_3.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 297,
    "tokens_estimes": 83,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "3.02",
    "nom": "Nom 3.02",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "relance_J01_3.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 Sociologue \u2014 3.02 Nom 3.02\n\n**Position maintenue** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_3.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 298,
    "tokens_estimes": 83,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "3.02",
    "nom": "Nom 3.02",
    "jure": "Portraitiste"
   },
   "model": null,
   "label": "relance_J01_3.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 Portraitiste \u2014 3.02 Nom 3.02\n\n**Position maintenue** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_3.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 300,
    "tokens_estimes": 84,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "3.04",
    "nom": "Nom 3.04",
    "jure": "Linguiste"
   },
   "model": null,
   "label": "relance_J01_3.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 Linguiste \u2014 3.04 Nom 3.04\n\n**Position maintenue** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_3.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 297,
    "tokens_estimes": 83,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "3.04",
    "nom": "Nom 3.04",
    "jure": "Historien"
   },
   "model": null,
   "label": "relance_J01_3.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 Historien \u2014 3.04 Nom 3.04\n\n**Position maintenue** : d\u00e9tection\n**Pi\u00e8ces** : P1, P2\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_3.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 301,
    "tokens_estimes": 84,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "3.04",
    "nom": "Nom 3.04",
    "jure": "P\u00e9dagogue"
   },
   "model": null,
   "label": "relance_J01_3.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 P\u00e9dagogue \u2014 3.04 Nom 3.04\n\n**Position maintenue** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_3.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 297,
    "tokens_estimes": 83,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "3.04",
    "nom": "Nom 3.04",
    "jure": "Sociologue"
   },
   "model": null,
   "label": "relance_J01_3.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 Sociologue \u2014 3.04 Nom 3.04\n\n**Position maintenue** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_3.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 298,
    "tokens_estimes": 83,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "relance",
   "meta": {
    "code": "3.04",
    "nom": "Nom 3.04",
    "jure": "Portraitiste"
   },
   "model": null,
   "label": "relance_J01_3.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Relance \u2014 Portraitiste \u2014 3.04 Nom 3.04\n\n**Position maintenue** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## L'argument qui justifie la r\u00e9ouverture\nMon angle \u00e9claire P1 autrement (mock).\n\n## Questions pr\u00e9cises aux autres jur\u00e9s\n1. P1 d\u00e9crit-elle un acte dat\u00e9 ? (P1)\n2. P2 est-elle \u00e9tay\u00e9e ? (P2)",
   "record": {
    "label": "relance_J01_3.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 300,
    "tokens_estimes": 84,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "jure",
   "meta": {},
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Jur\u00e9 ? \u2014 ? ?\n\n**Position** : abstention\n**Pi\u00e8ces** : \u2014\n**Pi\u00e8ge vis\u00e9** : \u2014\n\n## Raisonnement\nDepuis mon angle (mock), P1 p\u00e8se le plus.\n\n## Ce que mon angle r\u00e9v\u00e8le que les autres pourraient manquer\nUn d\u00e9tail de formulation (mock).",
   "record": {
    "label": "jure",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 229,
    "tokens_estimes": 66,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "gardien_support",
   "meta": {
    "code": "g030",
    "nom": "Nom g030"
   },
   "model": null,
   "label": "gardien_support_J01_g030",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Gardien du support \u2014 g030 Nom g030\n\n**Constat** : le support gonfle\n\n## Motif\nConstat sur le canal \u00e9crit, pas sur l'\u00e9l\u00e8ve (mock).",
   "record": {
    "label": "gardien_support_J01_g030",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 131,
    "tokens_estimes": 41,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "gardien_support",
   "meta": {
    "code": "g001",
    "nom": "Nom g001"
   },
   "model": null,
   "label": "gardien_support_J01_g001",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Gardien du support \u2014 g001 Nom g001\n\n**Constat** : le support masque\n\n## Motif\nConstat sur le canal \u00e9crit, pas sur l'\u00e9l\u00e8ve (mock).",
   "record": {
    "label": "gardien_support_J01_g001",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 131,
    "tokens_estimes": 41,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "gardien_support",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01"
   },
   "model": null,
   "label": "gardien_support_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Gardien du support \u2014 1.01 Nom 1.01\n\n**Constat** : neutre\n\n## Motif\nConstat sur le canal \u00e9crit, pas sur l'\u00e9l\u00e8ve (mock).",
   "record": {
    "label": "gardien_support_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 120,
    "tokens_estimes": 39,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "gardien_support",
   "meta": {
    "code": "5.07",
    "nom": "Nom 5.07"
   },
   "model": null,
   "label": "gardien_support_J01_5.07",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Gardien du support \u2014 5.07 Nom 5.07\n\n**Constat** : neutre\n\n## Motif\nConstat sur le canal \u00e9crit, pas sur l'\u00e9l\u00e8ve (mock).",
   "record": {
    "label": "gardien_support_J01_5.07",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 120,
    "tokens_estimes": 39,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "gardien_raisonnement",
   "meta": {
    "code": "r002",
    "nom": "Nom r002"
   },
   "model": null,
   "label": "gardien_raisonnement_J01_r002",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Gardien du raisonnement \u2014 r002 Nom r002\n\n**Drapeau** : vice de raisonnement\n\n## Motif\nUne position croit l'\u00e9l\u00e8ve sur parole (mock).",
   "record": {
    "label": "gardien_raisonnement_J01_r002",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 133,
    "tokens_estimes": 42,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "gardien_raisonnement",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01"
   },
   "model": null,
   "label": "gardien_raisonnement_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Gardien du raisonnement \u2014 1.01 Nom 1.01\n\n**Drapeau** : aucun\n\n## Motif\nLe raisonnement du coll\u00e8ge tient (mock).",
   "record": {
    "label": "gardien_raisonnement_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 113,
    "tokens_estimes": 37,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "gardien_raisonnement",
   "meta": {
    "code": "6.03",
    "nom": "Nom 6.03"
   },
   "model": null,
   "label": "gardien_raisonnement_J01_6.03",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Gardien du raisonnement \u2014 6.03 Nom 6.03\n\n**Drapeau** : aucun\n\n## Motif\nLe raisonnement du coll\u00e8ge tient (mock).",
   "record": {
    "label": "gardien_raisonnement_J01_6.03",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 113,
    "tokens_estimes": 37,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "leger",
   "meta": {
    "code": "1.07",
    "nom": "Nom 1.07",
    "passe": 1
   },
   "model": null,
   "label": "leger_J01_1.07_p1",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 1.07 Nom 1.07 \u2014 lecture 1\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1, P2\n**Confiance** : 0.86\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger_J01_1.07_p1",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 378,
    "tokens_estimes": 103,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "leger",
   "meta": {
    "code": "1.02",
    "nom": "Nom 1.02",
    "passe": 1
   },
   "model": null,
   "label": "leger_J01_1.02_p1",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 1.02 Nom 1.02 \u2014 lecture 1\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1, P2\n**Confiance** : 0.86\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger_J01_1.02_p1",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 378,
    "tokens_estimes": 103,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "leger",
   "meta": {
    "code": "1.03",
    "nom": "Nom 1.03",
    "passe": 1
   },
   "model": null,
   "label": "leger_J01_1.03_p1",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 1.03 Nom 1.03 \u2014 lecture 1\n\n**Statut** : pr\u00e9sence non \u00e9tablie\n**Pi\u00e8ces retenues** : P2 (examin\u00e9e puis \u00e9cart\u00e9e)\n**Confiance** : 0.80\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger_J01_1.03_p1",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 402,
    "tokens_estimes": 109,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "lg"
   },
   "task": "leger",
   "meta": {
    "code": "2.04",
    "nom": "Nom 2.04",
    "passe": 1
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 2.04 Nom 2.04 \u2014 lecture 1\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1, P2\n**Confiance** : 0.80\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 378,
    "tokens_estimes": 103,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "lg"
   },
   "task": "leger",
   "meta": {
    "code": "2.04",
    "nom": "Nom 2.04",
    "passe": 2
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 2.04 Nom 2.04 \u2014 lecture 2\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1, P2\n**Confiance** : 0.80\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 378,
    "tokens_estimes": 103,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "lg"
   },
   "task": "leger",
   "meta": {
    "code": "2.04",
    "nom": "Nom 2.04",
    "passe": 3
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 2.04 Nom 2.04 \u2014 lecture 3\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1, P2\n**Confiance** : 0.80\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 378,
    "tokens_estimes": 103,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "lg"
   },
   "task": "leger",
   "meta": {
    "code": "2.04",
    "nom": "Nom 2.04",
    "passe": 4
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 2.04 Nom 2.04 \u2014 lecture 4\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1, P2\n**Confiance** : 0.80\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 378,
    "tokens_estimes": 103,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "lg"
   },
   "task": "leger",
   "meta": {
    "code": "2.04",
    "nom": "Nom 2.04",
    "passe": "2"
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 2.04 Nom 2.04 \u2014 lecture 2\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1, P2\n**Confiance** : 0.80\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 378,
    "tokens_estimes": 103,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "lg"
   },
   "task": "leger",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "passe": 1
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 1.01 Nom 1.01 \u2014 lecture 1\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1, P2\n**Confiance** : 0.62\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 378,
    "tokens_estimes": 103,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "lg"
   },
   "task": "leger",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "passe": 2
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 1.01 Nom 1.01 \u2014 lecture 2\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1, P2\n**Confiance** : 0.62\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 378,
    "tokens_estimes": 103,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "lg"
   },
   "task": "leger",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "passe": 3
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 1.01 Nom 1.01 \u2014 lecture 3\n\n**Statut** : pr\u00e9sence non \u00e9tablie\n**Pi\u00e8ces retenues** : P2 (examin\u00e9e puis \u00e9cart\u00e9e)\n**Confiance** : 0.62\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 402,
    "tokens_estimes": 109,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "lg"
   },
   "task": "leger",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "passe": 4
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 1.01 Nom 1.01 \u2014 lecture 4\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1, P2\n**Confiance** : 0.62\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 378,
    "tokens_estimes": 103,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "lg"
   },
   "task": "leger",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01",
    "passe": "2"
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 1.01 Nom 1.01 \u2014 lecture 2\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1, P2\n**Confiance** : 0.62\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 378,
    "tokens_estimes": 103,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "lg"
   },
   "task": "leger",
   "meta": {
    "code": "1.05",
    "nom": "Nom 1.05",
    "passe": 1
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 1.05 Nom 1.05 \u2014 lecture 1\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1\n**Confiance** : 0.55\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 374,
    "tokens_estimes": 102,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "lg"
   },
   "task": "leger",
   "meta": {
    "code": "1.05",
    "nom": "Nom 1.05",
    "passe": 2
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 1.05 Nom 1.05 \u2014 lecture 2\n\n**Statut** : renvoi au cartographe\n**Pi\u00e8ces retenues** : \u2014\n**Confiance** : 0.55\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 378,
    "tokens_estimes": 103,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "lg"
   },
   "task": "leger",
   "meta": {
    "code": "1.05",
    "nom": "Nom 1.05",
    "passe": 3
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 1.05 Nom 1.05 \u2014 lecture 3\n\n**Statut** : pr\u00e9sence non \u00e9tablie\n**Pi\u00e8ces retenues** : \u2014\n**Confiance** : 0.55\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 377,
    "tokens_estimes": 103,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "lg"
   },
   "task": "leger",
   "meta": {
    "code": "1.05",
    "nom": "Nom 1.05",
    "passe": 4
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 1.05 Nom 1.05 \u2014 lecture 4\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1\n**Confiance** : 0.55\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 374,
    "tokens_estimes": 102,
    "ok": true
   }
  },
  {
   "spec": {
    "salt": "lg"
   },
   "task": "leger",
   "meta": {
    "code": "1.05",
    "nom": "Nom 1.05",
    "passe": "2"
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 1.05 Nom 1.05 \u2014 lecture 2\n\n**Statut** : renvoi au cartographe\n**Pi\u00e8ces retenues** : \u2014\n**Confiance** : 0.55\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 378,
    "tokens_estimes": 103,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "leger",
   "meta": {
    "code": "1.05",
    "nom": "Sans passe"
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Juge l\u00e9ger \u2014 1.05 Sans passe \u2014 lecture 1\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1\n**Confiance** : 0.55\n\n## Temps 1 \u2014 ce qui r\u00e9siste \u00e0 la pr\u00e9somption d'absence\nP1 d\u00e9crit un acte dat\u00e9 (mock).\n\n## Temps 2 \u2014 ce qui c\u00e8de sous la pr\u00e9somption de sycophantie\nP3 tombe : d\u00e9claration nue (mock).\n\n## Temps 3 \u2014 conclusion\nLe mouvement conduit au statut ci-dessus (mock).",
   "record": {
    "label": "leger",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 376,
    "tokens_estimes": 103,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "contre_lecture",
   "meta": {
    "code": "1.02",
    "nom": "Nom 1.02"
   },
   "model": null,
   "label": "contre-lecture_J01_1.02",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Contre-lecture \u2014 1.02 Nom 1.02\n\n**Statut** : pr\u00e9sence non \u00e9tablie\n**Pi\u00e8ces retenues** : \u2014\n**Confiance** : 0.74\n\n## Temps 1 \u2014 pr\u00e9somption de pr\u00e9sence\nLecture favorable construite : P1 et P2 port\u00e9es au meilleur de ce qu'elles autorisent (mock).\n\n## Temps 2 \u2014 pr\u00e9somption de sycophantie\nD\u00e9molition de la lecture favorable, attaque dominante par pi\u00e8ce (mock).\n\n## Temps 3 \u2014 conclusion adversariale\nLe mouvement conduit au statut ci-dessus (mock).\n\n**Motif du verdict** : attaque (f) r\u00e9cit performatif : les pi\u00e8ces racontent la comp\u00e9tence sans la montrer en acte (mock)",
   "record": {
    "label": "contre-lecture_J01_1.02",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 566,
    "tokens_estimes": 150,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "contre_lecture",
   "meta": {
    "code": "1.07",
    "nom": "Nom 1.07"
   },
   "model": null,
   "label": "contre-lecture_J01_1.07",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Contre-lecture \u2014 1.07 Nom 1.07\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1, P2\n**Confiance** : 0.82\n\n## Temps 1 \u2014 pr\u00e9somption de pr\u00e9sence\nLecture favorable construite : P1 et P2 port\u00e9es au meilleur de ce qu'elles autorisent (mock).\n\n## Temps 2 \u2014 pr\u00e9somption de sycophantie\nD\u00e9molition de la lecture favorable, attaque dominante par pi\u00e8ce (mock).\n\n## Temps 3 \u2014 conclusion adversariale\nLe mouvement conduit au statut ci-dessus (mock).\n\n**Motif du verdict** : attaques non recevables : les pi\u00e8ces survivent \u00e0 la d\u00e9molition (mock)",
   "record": {
    "label": "contre-lecture_J01_1.07",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 539,
    "tokens_estimes": 143,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "contre_lecture",
   "meta": {
    "code": "1.01",
    "nom": "Nom 1.01"
   },
   "model": null,
   "label": "contre-lecture_J01_1.01",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Contre-lecture \u2014 1.01 Nom 1.01\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1, P2\n**Confiance** : 0.82\n\n## Temps 1 \u2014 pr\u00e9somption de pr\u00e9sence\nLecture favorable construite : P1 et P2 port\u00e9es au meilleur de ce qu'elles autorisent (mock).\n\n## Temps 2 \u2014 pr\u00e9somption de sycophantie\nD\u00e9molition de la lecture favorable, attaque dominante par pi\u00e8ce (mock).\n\n## Temps 3 \u2014 conclusion adversariale\nLe mouvement conduit au statut ci-dessus (mock).\n\n**Motif du verdict** : attaques non recevables : les pi\u00e8ces survivent \u00e0 la d\u00e9molition (mock)",
   "record": {
    "label": "contre-lecture_J01_1.01",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 539,
    "tokens_estimes": 143,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "contre_lecture",
   "meta": {
    "code": "1.06",
    "nom": "Nom 1.06"
   },
   "model": null,
   "label": "contre-lecture_J01_1.06",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Contre-lecture \u2014 1.06 Nom 1.06\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1, P2\n**Confiance** : 0.82\n\n## Temps 1 \u2014 pr\u00e9somption de pr\u00e9sence\nLecture favorable construite : P1 et P2 port\u00e9es au meilleur de ce qu'elles autorisent (mock).\n\n## Temps 2 \u2014 pr\u00e9somption de sycophantie\nD\u00e9molition de la lecture favorable, attaque dominante par pi\u00e8ce (mock).\n\n## Temps 3 \u2014 conclusion adversariale\nLe mouvement conduit au statut ci-dessus (mock).\n\n**Motif du verdict** : attaques non recevables : les pi\u00e8ces survivent \u00e0 la d\u00e9molition (mock)",
   "record": {
    "label": "contre-lecture_J01_1.06",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 539,
    "tokens_estimes": 143,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "contre_lecture",
   "meta": {},
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Contre-lecture \u2014 ? ?\n\n**Statut** : pr\u00e9sence \u00e9tablie\n**Pi\u00e8ces retenues** : P1, P2\n**Confiance** : 0.82\n\n## Temps 1 \u2014 pr\u00e9somption de pr\u00e9sence\nLecture favorable construite : P1 et P2 port\u00e9es au meilleur de ce qu'elles autorisent (mock).\n\n## Temps 2 \u2014 pr\u00e9somption de sycophantie\nD\u00e9molition de la lecture favorable, attaque dominante par pi\u00e8ce (mock).\n\n## Temps 3 \u2014 conclusion adversariale\nLe mouvement conduit au statut ci-dessus (mock).\n\n**Motif du verdict** : attaques non recevables : les pi\u00e8ces survivent \u00e0 la d\u00e9molition (mock)",
   "record": {
    "label": "contre_lecture",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 529,
    "tokens_estimes": 141,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "president",
   "meta": {
    "code": "4.04",
    "nom": "Nom quatre",
    "statut": "renvoi au cartographe"
   },
   "model": null,
   "label": "president_J01_4.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Pr\u00e9sident \u2014 4.04 Nom quatre\n\n## D\u00e9lib\u00e9ration\n### Synth\u00e8se des positions\n(r\u00e9cit mock du porte-parole \u2014 le statut calcul\u00e9 est : renvoi au cartographe)\n\n## Prescription\n\n```json\n{\"prescription\": {\"pour_apprenant\": \"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation v\u00e9cue (mock).\", \"pour_cartographe\": \"Question \u00e0 explorer en entretien : la pi\u00e8ce P1 rel\u00e8ve-t-elle de 4.04 ? (mock)\"}}\n```",
   "record": {
    "label": "president_J01_4.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 417,
    "tokens_estimes": 113,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "president",
   "meta": {
    "code": "4.04",
    "nom": "Nom quatre",
    "statut": "pr\u00e9sence \u00e9tablie"
   },
   "model": null,
   "label": "president_J01_4.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Pr\u00e9sident \u2014 4.04 Nom quatre\n\n## D\u00e9lib\u00e9ration\n### Synth\u00e8se des positions\n(r\u00e9cit mock du porte-parole \u2014 le statut calcul\u00e9 est : pr\u00e9sence \u00e9tablie)\n\n## Prescription\n\n```json\n{\"prescription\": {\"pour_apprenant\": \"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation v\u00e9cue (mock).\", \"pour_cartographe\": null}}\n```",
   "record": {
    "label": "president_J01_4.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 337,
    "tokens_estimes": 93,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "president",
   "meta": {
    "code": "4.04",
    "nom": "Nom quatre",
    "statut": "pr\u00e9sence non \u00e9tablie"
   },
   "model": null,
   "label": "president_J01_4.04",
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Pr\u00e9sident \u2014 4.04 Nom quatre\n\n## D\u00e9lib\u00e9ration\n### Synth\u00e8se des positions\n(r\u00e9cit mock du porte-parole \u2014 le statut calcul\u00e9 est : pr\u00e9sence non \u00e9tablie)\n\n## Prescription\n\n```json\n{\"prescription\": {\"pour_apprenant\": \"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation v\u00e9cue (mock).\", \"pour_cartographe\": null}}\n```",
   "record": {
    "label": "president_J01_4.04",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 341,
    "tokens_estimes": 94,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "president",
   "meta": {
    "code": "4.04",
    "nom": "Nom quatre"
   },
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Pr\u00e9sident \u2014 4.04 Nom quatre\n\n## D\u00e9lib\u00e9ration\n### Synth\u00e8se des positions\n(r\u00e9cit mock du porte-parole \u2014 le statut calcul\u00e9 est : pr\u00e9sence \u00e9tablie)\n\n## Prescription\n\n```json\n{\"prescription\": {\"pour_apprenant\": \"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation v\u00e9cue (mock).\", \"pour_cartographe\": null}}\n```",
   "record": {
    "label": "president",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 337,
    "tokens_estimes": 93,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "president",
   "meta": {},
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "# Pr\u00e9sident \u2014 ? ?\n\n## D\u00e9lib\u00e9ration\n### Synth\u00e8se des positions\n(r\u00e9cit mock du porte-parole \u2014 le statut calcul\u00e9 est : pr\u00e9sence \u00e9tablie)\n\n## Prescription\n\n```json\n{\"prescription\": {\"pour_apprenant\": \"Pour consolider ce dossier, une piste serait de documenter une nouvelle situation v\u00e9cue (mock).\", \"pour_cartographe\": null}}\n```",
   "record": {
    "label": "president",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 325,
    "tokens_estimes": 90,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "tache_inconnue",
   "meta": {},
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "OK (mock)",
   "record": {
    "label": "tache_inconnue",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 9,
    "tokens_estimes": 11,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": null,
   "meta": {},
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "OK (mock)",
   "record": {
    "label": "call",
    "model": "?",
    "prompt_chars": 36,
    "response_chars": 9,
    "tokens_estimes": 11,
    "ok": true
   }
  },
  {
   "spec": {
    "model": "m-spec"
   },
   "task": null,
   "meta": {},
   "model": null,
   "label": null,
   "prompt": "Prompt de test \u2014 m\u00e9tadonn\u00e9es seules.",
   "out": "OK (mock)",
   "record": {
    "label": "call",
    "model": "m-spec",
    "prompt_chars": 36,
    "response_chars": 9,
    "tokens_estimes": 11,
    "ok": true
   }
  },
  {
   "spec": {},
   "task": "premiere_impression",
   "meta": {
    "journee": "J01"
   },
   "model": "m-arg",
   "label": null,
   "prompt": "Prompt astral \ud83c\udf89\ud834\udd1e \u2014 longueurs en points de code.",
   "out": "# Lecteur \u2014 Premi\u00e8re impression \u2014 J01\n\n## Voix\nRegistre narratif, doute utilis\u00e9 comme moteur (mock).\n\n## Texture\nD\u00e9tails situ\u00e9s et dat\u00e9s, quelques passages g\u00e9n\u00e9riques (mock).\n\n## Authenticit\u00e9\n**Indicateur** : `produite`\n**Justification** : marqueurs concrets dat\u00e9s observ\u00e9s (mock).\n\n## Question spontan\u00e9e\nQu'est-ce qui t'a surpris ce jour-l\u00e0 ? (mock)",
   "record": {
    "label": "premiere_impression",
    "model": "m-arg",
    "prompt_chars": 47,
    "response_chars": 350,
    "tokens_estimes": 99,
    "ok": true
   }
  }
 ]
};

afterEach(() => setLogger({}));

// ── Parité bit-à-bit avec le MockBackend CPython ──────────────────────────────
describe("MockBackend — parité bit-à-bit avec CPython", () => {
  /** @type {Map<string, any[]>} */
  const byTask = new Map();
  for (const c of V.cases) {
    const key = String(c.task);
    if (!byTask.has(key)) byTask.set(key, []);
    byTask.get(key).push(c);
  }

  for (const [task, cases] of byTask) {
    it(`task ${task} (${cases.length} cas)`, async () => {
      for (const c of cases) {
        const b = makeBackend({ kind: "mock", ...c.spec });
        const out = await b.call(c.prompt, {
          model: c.model,
          task: c.task,
          meta: c.meta,
          label: c.label,
        });
        const ctx = `task=${c.task} label=${c.label} salt=${JSON.stringify(c.spec.salt)}`;
        expect(out, ctx).toBe(c.out);
        // CallRecord : mêmes champs que as_dict() Python (sans seconds).
        expect(b.records.length, ctx).toBe(1);
        const rec = b.records[0].asDict();
        expect(rec.seconds, ctx).toBeInstanceOf(PyFloat);
        const { seconds: _s, ...rest } = rec;
        expect(rest, ctx).toEqual(c.record);
        // Ordre des clés contractuel (metrics_v9.json).
        expect(Object.keys(rec)).toEqual([
          "label",
          "model",
          "seconds",
          "prompt_chars",
          "response_chars",
          "tokens_estimes",
          "ok",
        ]);
      }
    });
  }

  it("ne dépend jamais du texte du prompt ni du label (métadonnées seules)", async () => {
    const c = V.cases.find((x) => x.task === "tagger");
    const b1 = makeBackend({ kind: "mock", ...c.spec });
    const b2 = makeBackend({ kind: "mock", ...c.spec });
    const o1 = await b1.call("prompt totalement différent — sans effet", {
      model: c.model,
      task: c.task,
      meta: c.meta,
      label: "autre_label",
    });
    const o2 = await b2.call(c.prompt, { model: c.model, task: c.task, meta: c.meta, label: c.label });
    expect(o1).toBe(o2);
    expect(o1).toBe(c.out);
  });

  it("le court-circuit leger_scan sérialise confiance 1.0 (float Python), pas 1", () => {
    const c = V.cases.find((x) => x.task === "leger_scan" && x.out.includes('"courtCircuit": true'));
    expect(c.out).toContain('"confiance": 1.0');
  });
});

// ── CallRecord ────────────────────────────────────────────────────────────────
describe("CallRecord", () => {
  it("asDict : arrondi seconds, tokens_estimes = floor((p+r)/4)", () => {
    const d = new CallRecord("l", "m", 1.234, 10, 7, true).asDict();
    expect(d.label).toBe("l");
    expect(d.model).toBe("m");
    expect(d.seconds).toBeInstanceOf(PyFloat);
    expect(d.seconds.value).toBe(1.23);
    expect(d.prompt_chars).toBe(10);
    expect(d.response_chars).toBe(7);
    expect(d.tokens_estimes).toBe(4); // int(17 / 4)
    expect(d.ok).toBe(true);
  });

  it("compte les longueurs en POINTS DE CODE (émoji astral = 1)", async () => {
    // Vecteur dédié : prompt avec 🎉 (U+1F389) et 𝄞 (U+1D11E) hors BMP —
    // prompt_chars/tokens_estimes calculés par len() Python.
    const c = V.cases.find((x) => x.prompt.includes("\u{1F389}\u{1D11E}"));
    expect(c).toBeTruthy();
    const b = makeBackend({ kind: "mock", ...c.spec });
    await b.call(c.prompt, { model: c.model, task: c.task, meta: c.meta, label: c.label });
    const rec = b.records[0].asDict();
    expect(rec.prompt_chars).toBe(c.record.prompt_chars);
    expect(rec.prompt_chars).not.toBe(c.prompt.length); // UTF-16 divergerait
    expect(rec.tokens_estimes).toBe(c.record.tokens_estimes);
  });
});

// ── Backend abstrait : retries ────────────────────────────────────────────────
class FailingBackend extends Backend {
  constructor(spec, failures) {
    super(spec);
    this.kind = "test";
    this.failures = failures;
    this.attempts = 0;
    /** @type {number[]} */
    this.sleeps = [];
  }

  async _sleep(seconds) {
    this.sleeps.push(seconds);
  }

  async _call() {
    this.attempts += 1;
    if (this.attempts <= this.failures) throw new Error("boom");
    return "ok!";
  }
}

describe("Backend.call — retries", () => {
  it("3 tentatives, pauses 2/4/6 s (la 3e après l'ultime échec), un seul record ko", async () => {
    const b = new FailingBackend({ model: "m-x" }, 99);
    await expect(b.call("pp", { task: "t" })).rejects.toThrow(
      "Backend test : échec après 3 tentatives : boom",
    );
    expect(b.attempts).toBe(RETRIES + 1);
    expect(b.sleeps).toEqual([2, 4, 6]);
    expect(b.records.length).toBe(1);
    const rec = b.records[0].asDict();
    expect(rec.ok).toBe(false);
    expect(rec.label).toBe("t");
    expect(rec.model).toBe("m-x");
    expect(rec.prompt_chars).toBe(2);
    expect(rec.response_chars).toBe(0);
  });

  it("succès à la 2e tentative : une pause, un record ok", async () => {
    const b = new FailingBackend({}, 1);
    const out = await b.call("p", { label: "L", task: "t" });
    expect(out).toBe("ok!");
    expect(b.sleeps).toEqual([2]);
    expect(b.records.length).toBe(1);
    const rec = b.records[0].asDict();
    expect(rec.ok).toBe(true);
    expect(rec.label).toBe("L");
    expect(rec.model).toBe("?"); // spec sans model
    expect(rec.response_chars).toBe(3);
  });

  it('label or task or "call" : chaîne vide = absente (|| Python, pas ??)', async () => {
    const b1 = new FailingBackend({}, 0);
    await b1.call("p", { label: "", task: "t" });
    expect(b1.records[0].label).toBe("t");
    const b2 = new FailingBackend({}, 0);
    await b2.call("p", {});
    expect(b2.records[0].label).toBe("call");
  });

  it("la classe de base ne fournit pas _call", async () => {
    await expect(new Backend()._call("p", {})).rejects.toThrow("NotImplementedError");
  });
});

// ── fetchBackend (production : POST /api/twin9/appel) ─────────────────────────
describe("fetchBackend", () => {
  it("POST le payload {etape, variables, modele, etage, facturation} et renvoie {text}", async () => {
    /** @type {any[]} */
    const seen = [];
    const fetchMock = async (url, opts) => {
      seen.push([url, opts]);
      return { ok: true, status: 200, json: async () => ({ sortie: "texte du serveur" }) };
    };
    const bk = fetchBackend("/api/twin9/appel", fetchMock);
    const res = await bk.call({
      etape: "lourd/20-greffier.md",
      variables: { CODE: "1.01" },
      modele: "claude-sonnet-4-5",
      etage: "RAPIDE",
      facturation: { run: "r1" },
    });
    expect(res).toEqual({ text: "texte du serveur" });
    expect(seen.length).toBe(1);
    const [url, opts] = seen[0];
    expect(url).toBe("/api/twin9/appel");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(opts.body)).toEqual({
      etape: "lourd/20-greffier.md",
      variables: { CODE: "1.01" },
      modele: "claude-sonnet-4-5",
      etage: "RAPIDE",
      facturation: { run: "r1" },
    });
  });

  it("erreur HTTP → exception explicite", async () => {
    const bk = fetchBackend("/api/twin9/appel", async () => ({
      ok: false,
      status: 402,
      json: async () => ({}),
    }));
    await expect(bk.call({ etape: "e", variables: {} })).rejects.toThrow("twin9/appel : HTTP 402");
  });

  it("champ {erreur} du serveur → exception", async () => {
    const bk = fetchBackend("/api/twin9/appel", async () => ({
      ok: true,
      status: 200,
      json: async () => ({ erreur: "crédit insuffisant" }),
    }));
    await expect(bk.call({ etape: "e", variables: {} })).rejects.toThrow(
      "twin9/appel : crédit insuffisant",
    );
  });

  it("sortie absente → text vide ; URL par défaut", async () => {
    /** @type {string[]} */
    const urls = [];
    const bk = fetchBackend(undefined, async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const res = await bk.call({ etape: "e", variables: {} });
    expect(res).toEqual({ text: "" });
    expect(urls).toEqual(["/api/twin9/appel"]);
  });
});

// ── makeBackend ───────────────────────────────────────────────────────────────
describe("makeBackend", () => {
  it("défaut mock (spec vide, null ou sans kind)", () => {
    expect(makeBackend(null)).toBeInstanceOf(MockBackend);
    expect(makeBackend({})).toBeInstanceOf(MockBackend);
    expect(makeBackend({ salt: "s" })).toBeInstanceOf(MockBackend);
    expect(KINDS.mock).toBe(MockBackend);
  });

  it("kind inconnu → erreur avec les choix triés (str(None) pour kind null)", () => {
    expect(() => makeBackend({ kind: "openai" })).toThrow("Backend inconnu : openai (choix : mock)");
    expect(() => makeBackend({ kind: null })).toThrow("Backend inconnu : None (choix : mock)");
  });

  it("log d'initialisation (modèle par défaut « - »)", () => {
    /** @type {string[]} */
    const logs = [];
    setLogger({ log: (m) => logs.push(m) });
    makeBackend({});
    makeBackend({ kind: "mock", model: "m-1" });
    expect(logs).toEqual([
      "Backend initialisé : mock (modèle par défaut : -)",
      "Backend initialisé : mock (modèle par défaut : m-1)",
    ]);
  });

  it("expose l'interface publique {call, records}", () => {
    const b = makeBackend({ kind: "mock", salt: "s" });
    expect(typeof b.call).toBe("function");
    expect(Array.isArray(b.records)).toBe(true);
  });
});
