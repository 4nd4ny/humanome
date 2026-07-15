// Vecteurs générés par CPython 3.14.3 (aurora/util.py de Twin9 : extract_json,
// neutraliser_balises, find_verbatim, stable_hash, empreinte) puis figés ici —
// script : engine/test/twin9-vectors/gen_noyau_vectors.py ; jamais de python à
// l'exécution. Les ratios de find_verbatim sont des doubles IEEE comparés
// EXACTEMENT (toEqual) : c'est l'oracle du rejet d'hallucinations.
import { describe, expect, it } from "vitest";
import {
  extractJson,
  neutraliserBalises,
  findVerbatim,
  stableHash,
  empreinte,
  setLogger,
  logWarn,
} from "./util.js";
import { PyFloat } from "./py/pyStr.js";

const V_EXTRACT = [
 {
  "text": "```json\n{\"a\": 1, \"b\": [1, 2], \"\u00e9\": \"\u00e0\"}\n```",
  "last": true,
  "out": {
   "a": 1,
   "b": [
    1,
    2
   ],
   "\u00e9": "\u00e0"
  }
 },
 {
  "text": "```json\n{\"a\": 1, \"b\": [1, 2], \"\u00e9\": \"\u00e0\"}\n```",
  "last": false,
  "out": {
   "a": 1,
   "b": [
    1,
    2
   ],
   "\u00e9": "\u00e0"
  }
 },
 {
  "text": "avant ```\n{\"a\": 1,}\n``` apr\u00e8s",
  "last": true,
  "out": {
   "a": 1
  }
 },
 {
  "text": "avant ```\n{\"a\": 1,}\n``` apr\u00e8s",
  "last": false,
  "out": {
   "a": 1
  }
 },
 {
  "text": "un ```json\n{\"n\": 1}\n``` deux ```json\n{\"n\": 2}\n``` fin",
  "last": true,
  "out": {
   "n": 2
  }
 },
 {
  "text": "un ```json\n{\"n\": 1}\n``` deux ```json\n{\"n\": 2}\n``` fin",
  "last": false,
  "out": {
   "n": 1
  }
 },
 {
  "text": "```json\n{\"t\": \u201ctypo\u201d}\n```\nrien",
  "last": true,
  "out": {
   "t": "typo"
  }
 },
 {
  "text": "```json\n{\"t\": \u201ctypo\u201d}\n```\nrien",
  "last": false,
  "out": {
   "t": "typo"
  }
 },
 {
  "text": "prose {\"x\": {\"y\": 2, \"z\": [3, {\"w\": 4}]}} suite",
  "last": true,
  "out": {
   "x": {
    "y": 2,
    "z": [
     3,
     {
      "w": 4
     }
    ]
   }
  }
 },
 {
  "text": "prose {\"x\": {\"y\": 2, \"z\": [3, {\"w\": 4}]}} suite",
  "last": false,
  "out": {
   "x": {
    "y": 2,
    "z": [
     3,
     {
      "w": 4
     }
    ]
   }
  }
 },
 {
  "text": "il a dit \"bonjour\" puis {\"a\": 1} et {\"b\": 2}",
  "last": true,
  "out": {
   "b": 2
  }
 },
 {
  "text": "il a dit \"bonjour\" puis {\"a\": 1} et {\"b\": 2}",
  "last": false,
  "out": {
   "a": 1
  }
 },
 {
  "text": "l'\u00e9l\u00e8ve \u00e9crit \" et ensuite {\"a\": 1} sans fermer",
  "last": true,
  "out": null
 },
 {
  "text": "l'\u00e9l\u00e8ve \u00e9crit \" et ensuite {\"a\": 1} sans fermer",
  "last": false,
  "out": null
 },
 {
  "text": "```json {\"inline\": true} ```",
  "last": true,
  "out": {
   "inline": true
  }
 },
 {
  "text": "```json {\"inline\": true} ```",
  "last": false,
  "out": {
   "inline": true
  }
 },
 {
  "text": "[1, 2, 3]",
  "last": true,
  "out": null
 },
 {
  "text": "[1, 2, 3]",
  "last": false,
  "out": null
 },
 {
  "text": "{\"a\": \"x}y\", \"b\": 2}",
  "last": true,
  "out": {
   "a": "x}y",
   "b": 2
  }
 },
 {
  "text": "{\"a\": \"x}y\", \"b\": 2}",
  "last": false,
  "out": {
   "a": "x}y",
   "b": 2
  }
 },
 {
  "text": "```json  \n\n{\"a\": 2}\n```",
  "last": true,
  "out": {
   "a": 2
  }
 },
 {
  "text": "```json  \n\n{\"a\": 2}\n```",
  "last": false,
  "out": {
   "a": 2
  }
 },
 {
  "text": "texte {\"c\": [1, 2,],} fin",
  "last": true,
  "out": {
   "c": [
    1,
    2
   ]
  }
 },
 {
  "text": "texte {\"c\": [1, 2,],} fin",
  "last": false,
  "out": {
   "c": [
    1,
    2
   ]
  }
 },
 {
  "text": "aucun json ici",
  "last": true,
  "out": null
 },
 {
  "text": "aucun json ici",
  "last": false,
  "out": null
 },
 {
  "text": "{cass\u00e9} et {\"ok\": true}",
  "last": true,
  "out": {
   "ok": true
  }
 },
 {
  "text": "{cass\u00e9} et {\"ok\": true}",
  "last": false,
  "out": {
   "ok": true
  }
 },
 {
  "text": "```\npas du json\n``` puis {\"r\": 9}",
  "last": true,
  "out": {
   "r": 9
  }
 },
 {
  "text": "```\npas du json\n``` puis {\"r\": 9}",
  "last": false,
  "out": {
   "r": 9
  }
 },
 {
  "text": "{\"esc\": \"a\\\"b{c\", \"d\": 1}",
  "last": true,
  "out": {
   "esc": "a\"b{c",
   "d": 1
  }
 },
 {
  "text": "{\"esc\": \"a\\\"b{c\", \"d\": 1}",
  "last": false,
  "out": {
   "esc": "a\"b{c",
   "d": 1
  }
 }
];

const V_NEUTRALISER = [
 {
  "t": "<PORTFOLIO>x</PORTFOLIO>",
  "out": "\u2039PORTFOLIO\u203ax\u2039/PORTFOLIO\u203a"
 },
 {
  "t": "a </ fiches_pole > b < FICHE\t> c",
  "out": "a \u2039/ fiches_pole \u203a b \u2039 FICHE\t\u203a c"
 },
 {
  "t": "<PoRtFoLiO> et <AUTRE> et <fiche >",
  "out": "\u2039PoRtFoLiO\u203a et <AUTRE> et \u2039fiche \u203a"
 },
 {
  "t": "<FICHES_POLE><VERDICT_CALCULE>",
  "out": "\u2039FICHES_POLE\u203a\u2039VERDICT_CALCULE\u203a"
 },
 {
  "t": "<  PORTFOLIO >",
  "out": "\u2039  PORTFOLIO \u203a"
 },
 {
  "t": "sans balise <div> ni rien",
  "out": "sans balise <div> ni rien"
 },
 {
  "t": "",
  "out": ""
 }
];

const V_VERBATIM = [
 {
  "src": "## 12.03.24 \u2014 matin\u00e9e d'atelier\n\nAujourd'hui, j'ai repris la maquette du pont avec L\u00e9a\u00a0: nous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois, et le tablier tient enfin sans fl\u00e9chir au centre.\nEnsuite \u2014 pendant la pause \u2014 j'ai not\u00e9 ce que \u00ab rater \u00bb m'avait appris\u202f: v\u00e9rifier l'\u00e9querrage avant de coller, c'est gagner une heure.\nLe soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de questions qu'avant, surtout quand une consigne me para\u00eet floue ou incompl\u00e8te.\n",
  "q": "nous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois",
  "out": [
   89,
   135,
   1.0
  ]
 },
 {
  "src": "## 12.03.24 \u2014 matin\u00e9e d'atelier\n\nAujourd'hui, j'ai repris la maquette du pont avec L\u00e9a\u00a0: nous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois, et le tablier tient enfin sans fl\u00e9chir au centre.\nEnsuite \u2014 pendant la pause \u2014 j'ai not\u00e9 ce que \u00ab rater \u00bb m'avait appris\u202f: v\u00e9rifier l'\u00e9querrage avant de coller, c'est gagner une heure.\nLe soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de questions qu'avant, surtout quand une consigne me para\u00eet floue ou incompl\u00e8te.\n",
  "q": "\u00ab rater \u00bb",
  "out": [
   235,
   240,
   1.0
  ]
 },
 {
  "src": "## 12.03.24 \u2014 matin\u00e9e d'atelier\n\nAujourd'hui, j'ai repris la maquette du pont avec L\u00e9a\u00a0: nous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois, et le tablier tient enfin sans fl\u00e9chir au centre.\nEnsuite \u2014 pendant la pause \u2014 j'ai not\u00e9 ce que \u00ab rater \u00bb m'avait appris\u202f: v\u00e9rifier l'\u00e9querrage avant de coller, c'est gagner une heure.\nLe soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de questions qu'avant, surtout quand une consigne me para\u00eet floue ou incompl\u00e8te.\n",
  "q": "j'ai not\u00e9 ce que \u00ab rater \u00bb m'avait appris",
  "out": [
   216,
   257,
   1.0
  ]
 },
 {
  "src": "## 12.03.24 \u2014 matin\u00e9e d'atelier\n\nAujourd'hui, j'ai repris la maquette du pont avec L\u00e9a\u00a0: nous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois, et le tablier tient enfin sans fl\u00e9chir au centre.\nEnsuite \u2014 pendant la pause \u2014 j'ai not\u00e9 ce que \u00ab rater \u00bb m'avait appris\u202f: v\u00e9rifier l'\u00e9querrage avant de coller, c'est gagner une heure.\nLe soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de questions qu'avant, surtout quand une consigne me para\u00eet floue ou incompl\u00e8te.\n",
  "q": "Ensuite - pendant la pause - j'ai not\u00e9 ce que \"rater\" m'avait appris",
  "out": [
   187,
   255,
   0.9705882352941176
  ]
 },
 {
  "src": "## 12.03.24 \u2014 matin\u00e9e d'atelier\n\nAujourd'hui, j'ai repris la maquette du pont avec L\u00e9a\u00a0: nous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois, et le tablier tient enfin sans fl\u00e9chir au centre.\nEnsuite \u2014 pendant la pause \u2014 j'ai not\u00e9 ce que \u00ab rater \u00bb m'avait appris\u202f: v\u00e9rifier l'\u00e9querrage avant de coller, c'est gagner une heure.\nLe soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de questions qu'avant, surtout quand une consigne me para\u00eet floue ou incompl\u00e8te.\n",
  "q": "ensuite \u2014 pendant la pause \u2014 j'ai not\u00e9 ce que \u00ab rater \u00bb m'avait appris : v\u00e9rifier l'\u00e9querrage",
  "out": [
   187,
   280,
   0.99
  ]
 },
 {
  "src": "## 12.03.24 \u2014 matin\u00e9e d'atelier\n\nAujourd'hui, j'ai repris la maquette du pont avec L\u00e9a\u00a0: nous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois, et le tablier tient enfin sans fl\u00e9chir au centre.\nEnsuite \u2014 pendant la pause \u2014 j'ai not\u00e9 ce que \u00ab rater \u00bb m'avait appris\u202f: v\u00e9rifier l'\u00e9querrage avant de coller, c'est gagner une heure.\nLe soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de questions qu'avant, surtout quand une consigne me para\u00eet floue ou incompl\u00e8te.\n",
  "q": "  \u00abnous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois\u00bb  ",
  "out": [
   89,
   135,
   1.0
  ]
 },
 {
  "src": "## 12.03.24 \u2014 matin\u00e9e d'atelier\n\nAujourd'hui, j'ai repris la maquette du pont avec L\u00e9a\u00a0: nous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois, et le tablier tient enfin sans fl\u00e9chir au centre.\nEnsuite \u2014 pendant la pause \u2014 j'ai not\u00e9 ce que \u00ab rater \u00bb m'avait appris\u202f: v\u00e9rifier l'\u00e9querrage avant de coller, c'est gagner une heure.\nLe soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de questions qu'avant, surtout quand une consigne me para\u00eet floue ou incompl\u00e8te.\n",
  "q": "nous avons mesur\u00e9 [...] recommenc\u00e9 deux fois",
  "out": null
 },
 {
  "src": "## 12.03.24 \u2014 matin\u00e9e d'atelier\n\nAujourd'hui, j'ai repris la maquette du pont avec L\u00e9a\u00a0: nous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois, et le tablier tient enfin sans fl\u00e9chir au centre.\nEnsuite \u2014 pendant la pause \u2014 j'ai not\u00e9 ce que \u00ab rater \u00bb m'avait appris\u202f: v\u00e9rifier l'\u00e9querrage avant de coller, c'est gagner une heure.\nLe soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de questions qu'avant, surtout quand une consigne me para\u00eet floue ou incompl\u00e8te.\n",
  "q": "je pose plus de questions qu'avant, surtout quand une consigne me parait floue ou incomplette.",
  "out": [
   380,
   474,
   0.9680851063829787
  ]
 },
 {
  "src": "## 12.03.24 \u2014 matin\u00e9e d'atelier\n\nAujourd'hui, j'ai repris la maquette du pont avec L\u00e9a\u00a0: nous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois, et le tablier tient enfin sans fl\u00e9chir au centre.\nEnsuite \u2014 pendant la pause \u2014 j'ai not\u00e9 ce que \u00ab rater \u00bb m'avait appris\u202f: v\u00e9rifier l'\u00e9querrage avant de coller, c'est gagner une heure.\nLe soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de questions qu'avant, surtout quand une consigne me para\u00eet floue ou incompl\u00e8te.\n",
  "q": "Le soir j'ai relu mes notes de la semaine et j'ai vu que je pose bien plus de questions qu'avant",
  "out": [
   323,
   419,
   0.9375
  ]
 },
 {
  "src": "## 12.03.24 \u2014 matin\u00e9e d'atelier\n\nAujourd'hui, j'ai repris la maquette du pont avec L\u00e9a\u00a0: nous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois, et le tablier tient enfin sans fl\u00e9chir au centre.\nEnsuite \u2014 pendant la pause \u2014 j'ai not\u00e9 ce que \u00ab rater \u00bb m'avait appris\u202f: v\u00e9rifier l'\u00e9querrage avant de coller, c'est gagner une heure.\nLe soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de questions qu'avant, surtout quand une consigne me para\u00eet floue ou incompl\u00e8te.\n",
  "q": "totalement absent du texte source ici pourtant assez long pour l'\u00e9tage difflib",
  "out": null
 },
 {
  "src": "## 12.03.24 \u2014 matin\u00e9e d'atelier\n\nAujourd'hui, j'ai repris la maquette du pont avec L\u00e9a\u00a0: nous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois, et le tablier tient enfin sans fl\u00e9chir au centre.\nEnsuite \u2014 pendant la pause \u2014 j'ai not\u00e9 ce que \u00ab rater \u00bb m'avait appris\u202f: v\u00e9rifier l'\u00e9querrage avant de coller, c'est gagner une heure.\nLe soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de questions qu'avant, surtout quand une consigne me para\u00eet floue ou incompl\u00e8te.\n",
  "q": "mot",
  "out": null
 },
 {
  "src": "## 12.03.24 \u2014 matin\u00e9e d'atelier\n\nAujourd'hui, j'ai repris la maquette du pont avec L\u00e9a\u00a0: nous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois, et le tablier tient enfin sans fl\u00e9chir au centre.\nEnsuite \u2014 pendant la pause \u2014 j'ai not\u00e9 ce que \u00ab rater \u00bb m'avait appris\u202f: v\u00e9rifier l'\u00e9querrage avant de coller, c'est gagner une heure.\nLe soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de questions qu'avant, surtout quand une consigne me para\u00eet floue ou incompl\u00e8te.\n",
  "q": "",
  "out": null
 },
 {
  "src": "## 12.03.24 \u2014 matin\u00e9e d'atelier\n\nAujourd'hui, j'ai repris la maquette du pont avec L\u00e9a\u00a0: nous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois, et le tablier tient enfin sans fl\u00e9chir au centre.\nEnsuite \u2014 pendant la pause \u2014 j'ai not\u00e9 ce que \u00ab rater \u00bb m'avait appris\u202f: v\u00e9rifier l'\u00e9querrage avant de coller, c'est gagner une heure.\nLe soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de questions qu'avant, surtout quand une consigne me para\u00eet floue ou incompl\u00e8te.\n",
  "q": "LE SOIR, J'AI RELU MES NOTES DE LA SEMAINE",
  "out": [
   322,
   364,
   0.99
  ]
 },
 {
  "src": "Intro \ud83c\udf1f \u00e9toil\u00e9e.\n## 12.03.24 \u2014 matin\u00e9e d'atelier\n\nAujourd'hui, j'ai repris la maquette du pont avec L\u00e9a\u00a0: nous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois, et le tablier tient enfin sans fl\u00e9chir au centre.\nEnsuite \u2014 pendant la pause \u2014 j'ai not\u00e9 ce que \u00ab rater \u00bb m'avait appris\u202f: v\u00e9rifier l'\u00e9querrage avant de coller, c'est gagner une heure.\nLe soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de questions qu'avant, surtout quand une consigne me para\u00eet floue ou incompl\u00e8te.\n",
  "q": "nous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois",
  "out": [
   106,
   152,
   1.0
  ]
 },
 {
  "src": "Intro \ud83c\udf1f \u00e9toil\u00e9e.\n## 12.03.24 \u2014 matin\u00e9e d'atelier\n\nAujourd'hui, j'ai repris la maquette du pont avec L\u00e9a\u00a0: nous avons mesur\u00e9, coup\u00e9, recommenc\u00e9 deux fois, et le tablier tient enfin sans fl\u00e9chir au centre.\nEnsuite \u2014 pendant la pause \u2014 j'ai not\u00e9 ce que \u00ab rater \u00bb m'avait appris\u202f: v\u00e9rifier l'\u00e9querrage avant de coller, c'est gagner une heure.\nLe soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de questions qu'avant, surtout quand une consigne me para\u00eet floue ou incompl\u00e8te.\n",
  "q": "le soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de question",
  "out": [
   339,
   421,
   0.99
  ]
 },
 {
  "src": "petit",
  "q": "un texte bien plus long que la source elle-m\u00eame, oui vraiment certain",
  "out": null
 }
];

const V_EMPREINTE = {
 "stable_hash": [
  {
   "s": "",
   "out": 233223382208256
  },
  {
   "s": "a",
   "out": 14025043329265
  },
  {
   "s": "fiche|mockA#1|P3",
   "out": 164517962093606
  },
  {
   "s": "scn|3.07",
   "out": 102076923614657
  },
  {
   "s": "\u00e9\ud83c\udf1f",
   "out": 107336169628000
  },
  {
   "s": "salt|x|1",
   "out": 118264860788642
  }
 ],
 "empreinte": [
  {
   "parts": [
    "texte"
   ],
   "out": "9b60f4577c9f"
  },
  {
   "parts": [
    "a",
    [
     "x",
     1
    ],
    {
     "b": 2,
     "a": 1
    }
   ],
   "out": "95e31bd7395d"
  },
  {
   "parts": [
    "\u00e9\ud83c\udf1f",
    null,
    true,
    false
   ],
   "out": "726c6b8dc35c"
  },
  {
   "parts": [
    {
     "\u00e9": "\u00e0",
     "Z": 1,
     "a": [
      1,
      {
       "y": null
      }
     ]
    }
   ],
   "out": "d70959fc96de"
  },
  {
   "parts": [
    [
     "ctrl\n\t\"\\",
     "fin"
    ]
   ],
   "out": "cf61f49c7a16"
  }
 ],
 "empreinte_journee_like": "bbae391c72f3"
};

describe("util.extractJson — parité extract_json", () => {
  it("reproduit json.loads sur blocs cerclés, réparation et fallback équilibré", () => {
    for (const c of V_EXTRACT) {
      expect(extractJson(c.text, c.last), JSON.stringify([c.text, c.last])).toEqual(c.out);
    }
  });

  it("entrées vides : null", () => {
    expect(extractJson("")).toBe(null);
    expect(extractJson(null)).toBe(null);
    expect(extractJson(undefined)).toBe(null);
  });
});

describe("util.neutraliserBalises — parité neutraliser_balises", () => {
  it("désamorce les balises de prompt (insensible à la casse, \\s Python)", () => {
    for (const c of V_NEUTRALISER) {
      expect(neutraliserBalises(c.t)).toBe(c.out);
    }
  });

  it("null/undefined → chaîne vide (texte or '')", () => {
    expect(neutraliserBalises(null)).toBe("");
    expect(neutraliserBalises(undefined)).toBe("");
  });
});

describe("util.findVerbatim — parité find_verbatim (3 étages)", () => {
  it("offsets en points de code et ratios difflib bit-à-bit", () => {
    for (const c of V_VERBATIM) {
      expect(findVerbatim(c.src, c.q), JSON.stringify(c.q)).toEqual(c.out);
    }
  });
});

describe("util.stableHash / util.empreinte — parité", () => {
  it("stable_hash : vecteurs CPython", () => {
    for (const c of V_EMPREINTE.stable_hash) {
      expect(stableHash(c.s)).toBe(c.out);
    }
  });

  it("empreinte : json.dumps compact trié, hex minuscule sans padding", () => {
    for (const c of V_EMPREINTE.empreinte) {
      expect(empreinte(...c.parts), JSON.stringify(c.parts)).toBe(c.out);
    }
  });

  it("empreinte de forme empreinte_journee (tuples, floats, PyFloat 1.0)", () => {
    // Reconstruit à la main la structure Python : le poids 1.0 est un float
    // Python entier → PyFloat côté JS (json.dumps écrit "1.0", pas "1").
    const out = empreinte(
      "texte de journée",
      [
        ["mockA", "m1", "fam", new PyFloat(1), "mock"],
        ["mockB", null, null, 0.5, "mock"],
      ],
      ["mock", null, null],
      {
        conf_min: 0.4,
        corrobore: 0.6,
        instruire: 0.25,
        instruire_min_modeles: 2,
        suspicion_min: 0.15,
      },
      [2, true],
      {},
      "personas-v1",
      true,
      "v9.8-contre-lecture",
    );
    expect(out).toBe(V_EMPREINTE.empreinte_journee_like);
  });
});

describe("util — logger injectable", () => {
  it("no-op par défaut, capture après setLogger", () => {
    expect(() => logWarn("silencieux")).not.toThrow();
    const seen = [];
    setLogger({ warn: (m) => seen.push(m) });
    logWarn("capturé");
    expect(seen).toEqual(["capturé"]);
    setLogger({});
  });
});
