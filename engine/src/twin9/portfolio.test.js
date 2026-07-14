// Vecteurs générés par CPython 3.14.3 (aurora/portfolio.py de Twin_v9 :
// split_portfolio, feuilles_block, sentences_of) puis figés ici — script :
// engine/test/twin9-vectors/gen_noyau_vectors.py ; jamais de python à
// l'exécution. Deux familles :
//   - synthétiques : structures INTÉGRALEMENT figées (dédup _b, tri (date, id),
//     CRLF, années 2-3 chiffres, fallback feuille unique, filtres de phrases) ;
//   - portfolios réels (confidentiels, hors dépôt) : lus dans ../Twin_v9 à
//     l'exécution, comparés à des DIGESTS md5 figés — sautés si absents.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { splitPortfolio, feuillesBlock, sentencesOf } from "./portfolio.js";
import { md5Hex } from "./py/md5.js";

const V_SYNTH = [
 {
  "content": "Pr\u00e9ambule ignor\u00e9 avant le premier titre.\n\n### 12.3.24 \u2014 matin\nPremi\u00e8re journ\u00e9e, texte assez court.\n\n## 12.03.2024 (soir)\nM\u00eame jour : l'id re\u00e7oit le suffixe _b.\n\n### 2024-03-11\nJourn\u00e9e ISO ant\u00e9rieure, elle doit remonter au tri.\r\nAvec une ligne CRLF pour tester les fins de ligne.\r\n\n#### Pas un s\u00e9parateur (h4)\n\n### 5.3.124\nAnn\u00e9e \u00e0 trois chiffres : 2000 + 124.\n",
  "filename": "Mon Portfolio (\u00e9l\u00e8ve) v2.final.md",
  "journal_id": "Mon_Portfolio_l_ve_v2_final",
  "raw_md5": "070300155ade99dc09da8ff6c707027b",
  "feuilles": [
   {
    "id": "2024-03-11",
    "date": "2024-03-11",
    "titre": "2024-03-11",
    "start": 161,
    "end": 308,
    "texte": "### 2024-03-11\nJourn\u00e9e ISO ant\u00e9rieure, elle doit remonter au tri.\nAvec une ligne CRLF pour tester les fins de ligne.\n\n#### Pas un s\u00e9parateur (h4)"
   },
   {
    "id": "2024-03-12",
    "date": "2024-03-12",
    "titre": "12.3.24",
    "start": 42,
    "end": 100,
    "texte": "### 12.3.24 \u2014 matin\nPremi\u00e8re journ\u00e9e, texte assez court."
   },
   {
    "id": "2024-03-12_b",
    "date": "2024-03-12",
    "titre": "12.03.2024",
    "start": 100,
    "end": 161,
    "texte": "## 12.03.2024 (soir)\nM\u00eame jour : l'id re\u00e7oit le suffixe _b."
   },
   {
    "id": "2124-03-05",
    "date": "2124-03-05",
    "titre": "5.3.124",
    "start": 308,
    "end": 357,
    "texte": "### 5.3.124\nAnn\u00e9e \u00e0 trois chiffres : 2000 + 124."
   }
  ],
  "sentences": [],
  "feuilles_block": "\u2550\u2550\u2550 Feuille : 2024-03-11 \u2550\u2550\u2550\n### 2024-03-11\nJourn\u00e9e ISO ant\u00e9rieure, elle doit remonter au tri.\nAvec une ligne CRLF pour tester les fins de ligne.\n\n#### Pas un s\u00e9parateur (h4)\n\n\u2550\u2550\u2550 Feuille : 2024-03-12 \u2550\u2550\u2550\n### 12.3.24 \u2014 matin\nPremi\u00e8re journ\u00e9e, texte assez court.\n\n\u2550\u2550\u2550 Feuille : 2024-03-12_b \u2550\u2550\u2550\n## 12.03.2024 (soir)\nM\u00eame jour : l'id re\u00e7oit le suffixe _b.\n\n\u2550\u2550\u2550 Feuille : 2124-03-05 \u2550\u2550\u2550\n### 5.3.124\nAnn\u00e9e \u00e0 trois chiffres : 2000 + 124.\n"
 },
 {
  "content": "# Journal (h1 ignor\u00e9)\n\n## Semaine 1\nContenu de la premi\u00e8re semaine.\n\n### D\u00e9tail important\nSous-partie compt\u00e9e comme feuille.\n\n## Semaine 2\nContenu de la deuxi\u00e8me semaine.\n",
  "filename": "SYNTH-hebdo.md",
  "journal_id": "SYNTH-hebdo",
  "raw_md5": "642cf5b5cd54517c9ea49059c1186635",
  "feuilles": [
   {
    "id": "F01",
    "date": null,
    "titre": "Semaine 1",
    "start": 23,
    "end": 69,
    "texte": "## Semaine 1\nContenu de la premi\u00e8re semaine."
   },
   {
    "id": "F02",
    "date": null,
    "titre": "D\u00e9tail important",
    "start": 69,
    "end": 126,
    "texte": "### D\u00e9tail important\nSous-partie compt\u00e9e comme feuille."
   },
   {
    "id": "F03",
    "date": null,
    "titre": "Semaine 2",
    "start": 126,
    "end": 171,
    "texte": "## Semaine 2\nContenu de la deuxi\u00e8me semaine."
   }
  ],
  "sentences": [],
  "feuilles_block": "\u2550\u2550\u2550 Feuille : F01 \u2550\u2550\u2550\n## Semaine 1\nContenu de la premi\u00e8re semaine.\n\n\u2550\u2550\u2550 Feuille : F02 \u2550\u2550\u2550\n### D\u00e9tail important\nSous-partie compt\u00e9e comme feuille.\n\n\u2550\u2550\u2550 Feuille : F03 \u2550\u2550\u2550\n## Semaine 2\nContenu de la deuxi\u00e8me semaine.\n"
 },
 {
  "content": "## Unique titre\nUn seul marqueur : fallback feuille unique.\n",
  "filename": "unique.md",
  "journal_id": "unique",
  "raw_md5": "ce2b90bfaadd93f4eefe4a367f00174a",
  "feuilles": [
   {
    "id": "F01",
    "date": null,
    "titre": "unique",
    "start": 0,
    "end": 60,
    "texte": "## Unique titre\nUn seul marqueur : fallback feuille unique."
   }
  ],
  "sentences": [],
  "feuilles_block": "\u2550\u2550\u2550 Feuille : F01 \u2550\u2550\u2550\n## Unique titre\nUn seul marqueur : fallback feuille unique.\n"
 },
 {
  "content": "# Grand titre h1\nTexte sans s\u00e9parateur reconnu.\n#### h4\nSuite.\n",
  "filename": "sans_titres.md",
  "journal_id": "sans_titres",
  "raw_md5": "a79aabdb791930d78891682c0a0a940d",
  "feuilles": [
   {
    "id": "F01",
    "date": null,
    "titre": "sans_titres",
    "start": 0,
    "end": 63,
    "texte": "# Grand titre h1\nTexte sans s\u00e9parateur reconnu.\n#### h4\nSuite."
   }
  ],
  "sentences": [],
  "feuilles_block": "\u2550\u2550\u2550 Feuille : F01 \u2550\u2550\u2550\n# Grand titre h1\nTexte sans s\u00e9parateur reconnu.\n#### h4\nSuite.\n"
 },
 {
  "content": "### 1.1.24\n# Ligne titre ignor\u00e9e pourtant longue xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\nLigne trop courte pour compter.\nCette premi\u00e8re phrase d\u00e9passe largement les soixante caract\u00e8res requis, c'est certain ! Courte suite. Et voici une seconde phrase valide, elle aussi assez longue pour \u00eatre retenue au final ? Une interminable phrase tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s longue qui d\u00e9passe le plafond des quatre cents caract\u00e8res et sera donc exclue du d\u00e9compte.\n### 2.1.24\nUne autre journ\u00e9e \ud83c\udf1f avec une unique phrase suffisamment d\u00e9velopp\u00e9e pour figurer ici.\n",
  "filename": "phrases.md",
  "journal_id": "phrases",
  "raw_md5": "72bf9af2fd92b211078ba2d4c0be8708",
  "feuilles": [
   {
    "id": "2024-01-01",
    "date": "2024-01-01",
    "titre": "1.1.24",
    "start": 0,
    "end": 848,
    "texte": "### 1.1.24\n# Ligne titre ignor\u00e9e pourtant longue xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\nLigne trop courte pour compter.\nCette premi\u00e8re phrase d\u00e9passe largement les soixante caract\u00e8res requis, c'est certain ! Courte suite. Et voici une seconde phrase valide, elle aussi assez longue pour \u00eatre retenue au final ? Une interminable phrase tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s longue qui d\u00e9passe le plafond des quatre cents caract\u00e8res et sera donc exclue du d\u00e9compte."
   },
   {
    "id": "2024-01-02",
    "date": "2024-01-02",
    "titre": "2.1.24",
    "start": 848,
    "end": 944,
    "texte": "### 2.1.24\nUne autre journ\u00e9e \ud83c\udf1f avec une unique phrase suffisamment d\u00e9velopp\u00e9e pour figurer ici."
   }
  ],
  "sentences": [
   [
    "2024-01-01",
    "Cette premi\u00e8re phrase d\u00e9passe largement les soixante caract\u00e8res requis, c'est certain !"
   ],
   [
    "2024-01-01",
    "Et voici une seconde phrase valide, elle aussi assez longue pour \u00eatre retenue au final ?"
   ],
   [
    "2024-01-02",
    "Une autre journ\u00e9e \ud83c\udf1f avec une unique phrase suffisamment d\u00e9velopp\u00e9e pour figurer ici."
   ]
  ],
  "feuilles_block": "\u2550\u2550\u2550 Feuille : 2024-01-01 \u2550\u2550\u2550\n### 1.1.24\n# Ligne titre ignor\u00e9e pourtant longue xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\nLigne trop courte pour compter.\nCette premi\u00e8re phrase d\u00e9passe largement les soixante caract\u00e8res requis, c'est certain ! Courte suite. Et voici une seconde phrase valide, elle aussi assez longue pour \u00eatre retenue au final ? Une interminable phrase tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s tr\u00e8s longue qui d\u00e9passe le plafond des quatre cents caract\u00e8res et sera donc exclue du d\u00e9compte.\n\n\u2550\u2550\u2550 Feuille : 2024-01-02 \u2550\u2550\u2550\n### 2.1.24\nUne autre journ\u00e9e \ud83c\udf1f avec une unique phrase suffisamment d\u00e9velopp\u00e9e pour figurer ici.\n"
 }
];

const V_REELS = [
 {
  "filename": "PLANT-01.md",
  "journal_id": "PLANT-01",
  "raw_md5": "2019e0dc7b121924668ff48907f015dc",
  "n_feuilles": 10,
  "feuilles_meta": [
   {
    "id": "2026-03-02",
    "date": "2026-03-02",
    "titre": "02.03.26",
    "start": 60,
    "end": 699,
    "texte_len": 637,
    "texte_md5": "652f51e52cc460f954552ef6acd6a5fe"
   },
   {
    "id": "2026-03-04",
    "date": "2026-03-04",
    "titre": "04.03.26",
    "start": 699,
    "end": 1380,
    "texte_len": 679,
    "texte_md5": "9312835aad0083fdbf576b2657104bd8"
   },
   {
    "id": "2026-03-06",
    "date": "2026-03-06",
    "titre": "06.03.26",
    "start": 1380,
    "end": 1905,
    "texte_len": 523,
    "texte_md5": "188ebf35c607d2d0979d4cdf6ddb8b19"
   },
   {
    "id": "2026-03-09",
    "date": "2026-03-09",
    "titre": "09.03.26",
    "start": 1905,
    "end": 2598,
    "texte_len": 691,
    "texte_md5": "604aaa01cd0885d1bfe3ddb51e7c443d"
   },
   {
    "id": "2026-03-11",
    "date": "2026-03-11",
    "titre": "11.03.26",
    "start": 2598,
    "end": 3178,
    "texte_len": 578,
    "texte_md5": "2307c3dec53de30abe18104978e1b5e2"
   },
   {
    "id": "2026-03-13",
    "date": "2026-03-13",
    "titre": "13.03.26",
    "start": 3178,
    "end": 3812,
    "texte_len": 632,
    "texte_md5": "88e339fc34a3252d80315c969fa3f9ef"
   },
   {
    "id": "2026-03-16",
    "date": "2026-03-16",
    "titre": "16.03.26",
    "start": 3812,
    "end": 4619,
    "texte_len": 805,
    "texte_md5": "da229d653cea60ee6140cb6285b3123e"
   },
   {
    "id": "2026-03-19",
    "date": "2026-03-19",
    "titre": "19.03.26",
    "start": 4619,
    "end": 5263,
    "texte_len": 642,
    "texte_md5": "e79fe0243c3adf4255e7c8cd126076e8"
   },
   {
    "id": "2026-03-23",
    "date": "2026-03-23",
    "titre": "23.03.26",
    "start": 5263,
    "end": 5799,
    "texte_len": 534,
    "texte_md5": "0b037dce742b4bb6999b9e41f591e127"
   },
   {
    "id": "2026-03-27",
    "date": "2026-03-27",
    "titre": "27.03.26",
    "start": 5799,
    "end": 6592,
    "texte_len": 792,
    "texte_md5": "86a6764684450b400f6513d7720d2b39"
   }
  ],
  "n_sentences": 40,
  "sentences_md5": "0fbbbc7eff1a80de78e16c258a9e3707",
  "first_sentence": [
   "2026-03-02",
   "On doit construire une station de mesure de la qualit\u00e9 de l'air pour le hall de l'\u00e9cole, avec un affichage compr\u00e9hensible par tout le monde."
  ],
  "last_sentence": [
   "2026-03-27",
   "En relisant l'ensemble, je vois que le moi du 2 mars \u00e9tait s\u00fbr de lui pour de mauvaises raisons ; celui d'aujourd'hui est plus lent, mais il sait pourquoi il croit ce qu'il croit."
  ],
  "feuilles_block_md5": "85e5c5d3e3bdf7197bf28fd56fdfc27e"
 },
 {
  "filename": "SYNTH-01.md",
  "journal_id": "SYNTH-01",
  "raw_md5": "5bfc66be7b022001f939e0bad9a2fd70",
  "n_feuilles": 7,
  "feuilles_meta": [
   {
    "id": "F01",
    "date": null,
    "titre": "Semaine 1 : Introduction au cours",
    "start": 59,
    "end": 431,
    "texte_len": 370,
    "texte_md5": "7bdab009dd482d39e5fcae4fc901b520"
   },
   {
    "id": "F02",
    "date": null,
    "titre": "Semaine 2 : Premiers travaux pratiques",
    "start": 431,
    "end": 816,
    "texte_len": 383,
    "texte_md5": "5e6f71cfb9bd5d1a45185c4b2abac9a7"
   },
   {
    "id": "F03",
    "date": null,
    "titre": "Semaine 3 : Cours th\u00e9orique",
    "start": 816,
    "end": 1069,
    "texte_len": 251,
    "texte_md5": "36ce5c22001d283da22a8e66c6f6c7a9"
   },
   {
    "id": "F04",
    "date": null,
    "titre": "Semaine 4 : Travail de groupe",
    "start": 1069,
    "end": 1290,
    "texte_len": 219,
    "texte_md5": "8c66753812f33fa1bc6bc98787c62068"
   },
   {
    "id": "F05",
    "date": null,
    "titre": "Semaine 5 : Rendu interm\u00e9diaire",
    "start": 1290,
    "end": 1518,
    "texte_len": 226,
    "texte_md5": "bf124cef3f99438b00e7b49e7fcd9a95"
   },
   {
    "id": "F06",
    "date": null,
    "titre": "Semaine 6 : Suite des cours",
    "start": 1518,
    "end": 1832,
    "texte_len": 312,
    "texte_md5": "9ba118c6dc2cda1f1cbbb3a59beefe61"
   },
   {
    "id": "F07",
    "date": null,
    "titre": "Semaine 7 : Bilan interm\u00e9diaire",
    "start": 1832,
    "end": 2130,
    "texte_len": 297,
    "texte_md5": "3aa3696279b5121856bfdc516e0ac50e"
   }
  ],
  "n_sentences": 14,
  "sentences_md5": "28869b2979c56e6233db26f09153b4d1",
  "first_sentence": [
   "F01",
   "Le professeur a pr\u00e9sent\u00e9 le programme du semestre et les objectifs g\u00e9n\u00e9raux."
  ],
  "last_sentence": [
   "F07",
   "J'esp\u00e8re que les prochaines semaines permettront de consolider tout \u00e7a."
  ],
  "feuilles_block_md5": "b1033e6504d718a5ed602474807fc4ca"
 },
 {
  "filename": "SYNTH-02.md",
  "journal_id": "SYNTH-02",
  "raw_md5": "21f5ee27bee1408200c29cafa6d5f4fe",
  "n_feuilles": 7,
  "feuilles_meta": [
   {
    "id": "F01",
    "date": null,
    "titre": "Semaine 1 : D\u00e9couverte du cours",
    "start": 61,
    "end": 410,
    "texte_len": 347,
    "texte_md5": "c24b0f47f25a3c57b3e8b7ab50b2fc2c"
   },
   {
    "id": "F02",
    "date": null,
    "titre": "Semaine 2 : Exploration des outils",
    "start": 410,
    "end": 708,
    "texte_len": 296,
    "texte_md5": "c6ab49c18ae16df5b3640585346206cd"
   },
   {
    "id": "F03",
    "date": null,
    "titre": "Semaine 3 : Lecture critique",
    "start": 708,
    "end": 1705,
    "texte_len": 995,
    "texte_md5": "93ba37bdee14f0d02e07fa4c6ca39994"
   },
   {
    "id": "F04",
    "date": null,
    "titre": "Semaine 4 : Avancement du projet",
    "start": 1705,
    "end": 2003,
    "texte_len": 296,
    "texte_md5": "c864c14e72ea0a5c15e6ba83584a6c5e"
   },
   {
    "id": "F05",
    "date": null,
    "titre": "Semaine 5 : Pr\u00e9sentation interm\u00e9diaire",
    "start": 2003,
    "end": 2245,
    "texte_len": 240,
    "texte_md5": "a2edc97b764d2810837887bb831351eb"
   },
   {
    "id": "F06",
    "date": null,
    "titre": "Semaine 6 : Ajustements",
    "start": 2245,
    "end": 2723,
    "texte_len": 476,
    "texte_md5": "6135167ae835bbda480e8b87055547d8"
   },
   {
    "id": "F07",
    "date": null,
    "titre": "Semaine 7 : Finalisation",
    "start": 2723,
    "end": 2927,
    "texte_len": 203,
    "texte_md5": "cb92ec743027abf21887cb90126e478d"
   }
  ],
  "n_sentences": 22,
  "sentences_md5": "0b56c69f7763b82eb2b9fac27152801d",
  "first_sentence": [
   "F01",
   "Le cours porte sur les technologies \u00e9ducatives et leur int\u00e9gration dans les pratiques p\u00e9dagogiques."
  ],
  "last_sentence": [
   "F07",
   "Je me sens plut\u00f4t satisfait du r\u00e9sultat, m\u00eame s'il reste toujours des am\u00e9liorations possibles."
  ],
  "feuilles_block_md5": "f04a734b5c875ce69950317b1708cd92"
 },
 {
  "filename": "SYNTH-06.md",
  "journal_id": "SYNTH-06",
  "raw_md5": "26df1f72f3409ae25461da73bd084bad",
  "n_feuilles": 10,
  "feuilles_meta": [
   {
    "id": "F01",
    "date": null,
    "titre": "Introduction",
    "start": 77,
    "end": 341,
    "texte_len": 262,
    "texte_md5": "ae2e04d2a75a55a288d5c0850e8c0fd8"
   },
   {
    "id": "F02",
    "date": null,
    "titre": "Semaine 1 : \u00c9veil de la pens\u00e9e critique",
    "start": 341,
    "end": 903,
    "texte_len": 560,
    "texte_md5": "5fd4b0f5d6076b380194dfd3c92fbc6e"
   },
   {
    "id": "F03",
    "date": null,
    "titre": "Semaine 2 : Ma\u00eetrise de la m\u00e9tacognition",
    "start": 903,
    "end": 1446,
    "texte_len": 541,
    "texte_md5": "0627519616f0c64d83f12fb3b61a84fe"
   },
   {
    "id": "F04",
    "date": null,
    "titre": "Semaine 3 : Excellence en communication",
    "start": 1446,
    "end": 1986,
    "texte_len": 538,
    "texte_md5": "65a3477bb79dc2c5984f08f8254fa6f6"
   },
   {
    "id": "F05",
    "date": null,
    "titre": "Semaine 4 : Cr\u00e9ativit\u00e9 sans limites",
    "start": 1986,
    "end": 2502,
    "texte_len": 514,
    "texte_md5": "b6552bb17c8a01ec02a66a46702c1e6a"
   },
   {
    "id": "F06",
    "date": null,
    "titre": "Semaine 5 : Leadership et vision strat\u00e9gique",
    "start": 2502,
    "end": 3008,
    "texte_len": 504,
    "texte_md5": "9db24611000e3b8c61786f202708a443"
   },
   {
    "id": "F07",
    "date": null,
    "titre": "Semaine 6 : \u00c9thique et responsabilit\u00e9",
    "start": 3008,
    "end": 3475,
    "texte_len": 465,
    "texte_md5": "4f8a605e72ba67be3c59cbf0915a48d5"
   },
   {
    "id": "F08",
    "date": null,
    "titre": "Semaine 7 : R\u00e9silience \u00e0 toute \u00e9preuve",
    "start": 3475,
    "end": 3976,
    "texte_len": 499,
    "texte_md5": "f9e9aa75e0e3a2d17fb8f9dd9f79632f"
   },
   {
    "id": "F09",
    "date": null,
    "titre": "Semaine 8 : Pens\u00e9e syst\u00e9mique et vision holistique",
    "start": 3976,
    "end": 4454,
    "texte_len": 476,
    "texte_md5": "18c5366d0ff54ce854d230bce5698ad6"
   },
   {
    "id": "F10",
    "date": null,
    "titre": "Conclusion : Un semestre transformateur",
    "start": 4454,
    "end": 4902,
    "texte_len": 447,
    "texte_md5": "7343f6663e7bdc927d5326eba7a209b7"
   }
  ],
  "n_sentences": 40,
  "sentences_md5": "a1d0e4bb9fc4e7ffe0d136b90fbcb475",
  "first_sentence": [
   "F01",
   "Ce journal retrace le parcours extraordinaire que j'ai v\u00e9cu ce semestre."
  ],
  "last_sentence": [
   "F10",
   "Je suis fier du chemin parcouru et confiant dans ma capacit\u00e9 \u00e0 affronter les d\u00e9fis futurs avec l'ensemble de ces comp\u00e9tences."
  ],
  "feuilles_block_md5": "e330d317795f1c32055a0ed1902efa13"
 },
 {
  "filename": "SYNTH-08.md",
  "journal_id": "SYNTH-08",
  "raw_md5": "25a813f5ae13cbb79602df9d8c422f4c",
  "n_feuilles": 15,
  "feuilles_meta": [
   {
    "id": "F01",
    "date": null,
    "titre": "TP1 : D\u00e9couverte du pair-programming avec ChatGPT",
    "start": 86,
    "end": 140,
    "texte_len": 52,
    "texte_md5": "dbf585e2c32dfc4577550d423e509c12"
   },
   {
    "id": "F02",
    "date": null,
    "titre": "Contexte",
    "start": 140,
    "end": 379,
    "texte_len": 237,
    "texte_md5": "a94e10ec798e184277ae6082fbef8487"
   },
   {
    "id": "F03",
    "date": null,
    "titre": "Ce que j'ai fait",
    "start": 379,
    "end": 1242,
    "texte_len": 861,
    "texte_md5": "a2643d7ff79f9043d5f2d9abdf68602d"
   },
   {
    "id": "F04",
    "date": null,
    "titre": "Ce que j'ai appris",
    "start": 1242,
    "end": 2035,
    "texte_len": 791,
    "texte_md5": "18b4c0f6adfa64440dd99e6e45c3efc6"
   },
   {
    "id": "F05",
    "date": null,
    "titre": "TP2 : Cr\u00e9ation d'un jeu interactif",
    "start": 2035,
    "end": 2074,
    "texte_len": 37,
    "texte_md5": "f18633fce31ab7d7183f8773e0bb4216"
   },
   {
    "id": "F06",
    "date": null,
    "titre": "Contexte",
    "start": 2074,
    "end": 2208,
    "texte_len": 132,
    "texte_md5": "3aa12d89ae6f6514bbab24acfcb4c2c2"
   },
   {
    "id": "F07",
    "date": null,
    "titre": "Ce que j'ai fait",
    "start": 2208,
    "end": 3316,
    "texte_len": 1106,
    "texte_md5": "6feb47c2c7e515914b4773b57045a687"
   },
   {
    "id": "F08",
    "date": null,
    "titre": "Ce que j'ai appris",
    "start": 3316,
    "end": 3698,
    "texte_len": 380,
    "texte_md5": "98e13d4add5caf825915849c71b8d24a"
   },
   {
    "id": "F09",
    "date": null,
    "titre": "TP3 : Analyse de donn\u00e9es avec pandas",
    "start": 3698,
    "end": 3739,
    "texte_len": 39,
    "texte_md5": "6b996a98b2035a9e3717ef8ad8c5388b"
   },
   {
    "id": "F10",
    "date": null,
    "titre": "Contexte",
    "start": 3739,
    "end": 3903,
    "texte_len": 162,
    "texte_md5": "251613e50b8510c7ddbfbbeee1273cfb"
   },
   {
    "id": "F11",
    "date": null,
    "titre": "Ce que j'ai fait",
    "start": 3903,
    "end": 4548,
    "texte_len": 643,
    "texte_md5": "3e248195d3e47d1b47e24e86137c26d0"
   },
   {
    "id": "F12",
    "date": null,
    "titre": "Ce que j'ai appris",
    "start": 4548,
    "end": 4972,
    "texte_len": 422,
    "texte_md5": "9f9b58bc54f9a3da81078f1eb23964a4"
   },
   {
    "id": "F13",
    "date": null,
    "titre": "Bilan du semestre",
    "start": 4972,
    "end": 4994,
    "texte_len": 20,
    "texte_md5": "68701f72d2da7b256c1cb059dd513aeb"
   },
   {
    "id": "F14",
    "date": null,
    "titre": "Ce que ce cours m'a apport\u00e9",
    "start": 4994,
    "end": 5771,
    "texte_len": 775,
    "texte_md5": "8628c190cbd75211c8cc9ecf40ecb928"
   },
   {
    "id": "F15",
    "date": null,
    "titre": "Ce qui reste difficile",
    "start": 5771,
    "end": 6157,
    "texte_len": 385,
    "texte_md5": "5447e1d138e273ef4af41ac05f5c5383"
   }
  ],
  "n_sentences": 43,
  "sentences_md5": "927924d8df1b51c52c25d846ae534970",
  "first_sentence": [
   "F02",
   "L'objectif \u00e9tait de cr\u00e9er un programme Python qui analyse un fichier CSV de donn\u00e9es m\u00e9t\u00e9o et g\u00e9n\u00e8re un graphique des temp\u00e9ratures moyennes par mois."
  ],
  "last_sentence": [
   "F15",
   "C'est un sch\u00e9ma que je connais depuis longtemps et que je n'arrive pas \u00e0 changer."
  ],
  "feuilles_block_md5": "80946db1fb10782866d711be89d82d25"
 }
];

describe("portfolio — parité split_portfolio (synthétiques figés)", () => {
  for (const c of V_SYNTH) {
    it(`découpe ${c.filename}`, () => {
      const pf = splitPortfolio(c.content, c.filename);
      expect(pf.journal_id).toBe(c.journal_id);
      expect(md5Hex(pf.raw)).toBe(c.raw_md5);
      expect(pf.feuilles).toEqual(c.feuilles);
      expect(sentencesOf(pf)).toEqual(c.sentences);
      expect(feuillesBlock(pf.feuilles)).toBe(c.feuilles_block);
    });
  }
});

// Portfolios réels : dossier source confidentiel (hors dépôt).
const TWIN =
  process.env.TWIN_V9_DIR ||
  fileURLToPath(new URL("../../../../Twin_v9", import.meta.url));
const HAS_TWIN = existsSync(TWIN + "/tests/portfolios");

describe.skipIf(!HAS_TWIN)("portfolio — parité sur les portfolios réels (digests)", () => {
  for (const r of V_REELS) {
    it(`digests ${r.filename}`, () => {
      const content = readFileSync(`${TWIN}/tests/portfolios/${r.filename}`, "utf8");
      const pf = splitPortfolio(content, r.filename);
      expect(pf.journal_id).toBe(r.journal_id);
      expect(md5Hex(pf.raw)).toBe(r.raw_md5);
      expect(pf.feuilles.length).toBe(r.n_feuilles);
      expect(
        pf.feuilles.map((f) => ({
          id: f.id,
          date: f.date,
          titre: f.titre,
          start: f.start,
          end: f.end,
          texte_len: Array.from(f.texte).length,
          texte_md5: md5Hex(f.texte),
        })),
      ).toEqual(r.feuilles_meta);
      const sents = sentencesOf(pf);
      expect(sents.length).toBe(r.n_sentences);
      expect(md5Hex(sents.map(([fid, s]) => `${fid}|${s}`).join("\n"))).toBe(r.sentences_md5);
      expect(sents[0] ?? null).toEqual(r.first_sentence);
      expect(sents[sents.length - 1] ?? null).toEqual(r.last_sentence);
      expect(md5Hex(feuillesBlock(pf.feuilles))).toBe(r.feuilles_block_md5);
    });
  }
});

describe("portfolio — comportements aux limites", () => {
  it("journal_id : basename, dernière extension, caractères hors [A-Za-z0-9_-] → _", () => {
    const pf = splitPortfolio("## a\nx\n## b\ny\n", "dossier/Mon Été (v2).final.md");
    expect(pf.journal_id).toBe("Mon_t_v2_final"); // vérifié contre CPython
  });

  it("texte avant le premier titre : ignoré (ni feuille, ni rattachement)", () => {
    const pf = splitPortfolio("perdu\n### 1.1.24\na\n### 2.1.24\nb\n", "x.md");
    expect(pf.feuilles.map((f) => f.id)).toEqual(["2024-01-01", "2024-01-02"]);
    expect(pf.feuilles[0].start).toBe(6);
  });

  it("un seul titre : fallback feuille unique F01 (titre = journal_id)", () => {
    const pf = splitPortfolio("## Seul\ncontenu\n", "seul.md");
    expect(pf.feuilles).toEqual([
      { id: "F01", date: null, titre: "seul", start: 0, end: 16, texte: "## Seul\ncontenu" },
    ]);
  });

  it("offsets en points de code avec émojis hors BMP", () => {
    const pf = splitPortfolio("🌟🌟\n### 1.1.24\naa\n### 2.1.24\nbb\n", "e.md");
    // "🌟🌟\n" = 3 points de code (5 unités UTF-16) : start Python = 3.
    expect(pf.feuilles[0].start).toBe(3);
    expect(pf.feuilles[0].end).toBe(17);
  });
});
