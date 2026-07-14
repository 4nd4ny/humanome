// Vecteurs générés par CPython 3.14.3 (aurora/referentiel.py de Twin_v9 :
// parse_pole, fiche_complete, permutation, POLE_NOMS) puis figés ici — script :
// engine/test/twin9-vectors/gen_noyau_vectors.py ; jamais de python à
// l'exécution. La fiche testée est FACTICE (inventée, même format) : les vraies
// fiches P1..P7 sont confidentielles — seule leur STRUCTURE (codes/noms,
// extraite dans test/twin9-oracles/referentiel.json, gitignoré) est vérifiée.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  POLE_NOMS,
  Pole,
  parsePole,
  loadReferentiel,
  polesFromStructure,
  allCompetences,
  permutation,
} from "./referentiel.js";

const V = {
 "fake_fiche": "# P\u00f4le 3 \u2014 MAIN : Cr\u00e9er & Incarner (factice)\n\nPr\u00e9ambule invent\u00e9 du p\u00f4le, deux lignes,\navec des espaces finaux.  \n\n## 3.01 \u2014 Alpha factice\n\n**Essence** : premi\u00e8re comp\u00e9tence invent\u00e9e.\nManifestations : a, b, c.\n\n## 3.02 \u2014 B\u00e9ta factice  \n\nTexte de la deuxi\u00e8me fiche.\n\n### Sous-titre qui ne s\u00e9pare pas\n\n## 3.9 \u2014 pas un code valide\n\n## 3.03 \u2014 Gamma \u2014 avec tiret interne\n\nDerni\u00e8re fiche.\n",
 "pole": {
  "num": 3,
  "nom": "MAIN \u2014 Cr\u00e9er & Incarner",
  "header": "# P\u00f4le 3 \u2014 MAIN : Cr\u00e9er & Incarner (factice)\n\nPr\u00e9ambule invent\u00e9 du p\u00f4le, deux lignes,\navec des espaces finaux.  \n\n",
  "competences": [
   {
    "code": "3.01",
    "nom": "Alpha factice",
    "fiche_md": "## 3.01 \u2014 Alpha factice\n\n**Essence** : premi\u00e8re comp\u00e9tence invent\u00e9e.\nManifestations : a, b, c."
   },
   {
    "code": "3.02",
    "nom": "B\u00e9ta factice",
    "fiche_md": "## 3.02 \u2014 B\u00e9ta factice  \n\nTexte de la deuxi\u00e8me fiche.\n\n### Sous-titre qui ne s\u00e9pare pas\n\n## 3.9 \u2014 pas un code valide"
   },
   {
    "code": "3.03",
    "nom": "Gamma \u2014 avec tiret interne",
    "fiche_md": "## 3.03 \u2014 Gamma \u2014 avec tiret interne\n\nDerni\u00e8re fiche."
   }
  ]
 },
 "fiche_complete": "# P\u00f4le 3 \u2014 MAIN : Cr\u00e9er & Incarner (factice)\n\nPr\u00e9ambule invent\u00e9 du p\u00f4le, deux lignes,\navec des espaces finaux.\n\n## 3.01 \u2014 Alpha factice\n\n**Essence** : premi\u00e8re comp\u00e9tence invent\u00e9e.\nManifestations : a, b, c.\n\n---\n\n## 3.02 \u2014 B\u00e9ta factice  \n\nTexte de la deuxi\u00e8me fiche.\n\n### Sous-titre qui ne s\u00e9pare pas\n\n## 3.9 \u2014 pas un code valide\n\n---\n\n## 3.03 \u2014 Gamma \u2014 avec tiret interne\n\nDerni\u00e8re fiche.\n",
 "ordre": [
  2,
  0,
  1
 ],
 "fiche_complete_ordre": "# P\u00f4le 3 \u2014 MAIN : Cr\u00e9er & Incarner (factice)\n\nPr\u00e9ambule invent\u00e9 du p\u00f4le, deux lignes,\navec des espaces finaux.\n\n## 3.03 \u2014 Gamma \u2014 avec tiret interne\n\nDerni\u00e8re fiche.\n\n---\n\n## 3.01 \u2014 Alpha factice\n\n**Essence** : premi\u00e8re comp\u00e9tence invent\u00e9e.\nManifestations : a, b, c.\n\n---\n\n## 3.02 \u2014 B\u00e9ta factice  \n\nTexte de la deuxi\u00e8me fiche.\n\n### Sous-titre qui ne s\u00e9pare pas\n\n## 3.9 \u2014 pas un code valide\n",
 "competence_302": {
  "code": "3.02",
  "nom": "B\u00e9ta factice",
  "fiche_md": "## 3.02 \u2014 B\u00e9ta factice  \n\nTexte de la deuxi\u00e8me fiche.\n\n### Sous-titre qui ne s\u00e9pare pas\n\n## 3.9 \u2014 pas un code valide"
 },
 "pole_noms": {
  "1": "T\u00caTE \u2014 Penser & Comprendre",
  "2": "C\u0152UR \u2014 Relier & Naviguer",
  "3": "MAIN \u2014 Cr\u00e9er & Incarner",
  "4": "\u00c2ME \u2014 Discerner & Juger",
  "5": "RACINES \u2014 \u00c9voluer & R\u00e9sister",
  "6": "CIT\u00c9 \u2014 Gouverner & S'ouvrir",
  "7": "FLAMBEAU \u2014 Transmettre & Piloter"
 },
 "pole_nom_fallback": "P\u00f4le 9",
 "permutations": [
  {
   "n": 10,
   "seed": "fiche|gpt#1|P1",
   "out": [
    9,
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8
   ]
  },
  {
   "n": 9,
   "seed": "fiche|gpt#1|P2",
   "out": [
    1,
    0,
    8,
    7,
    6,
    5,
    4,
    3,
    2
   ]
  },
  {
   "n": 7,
   "seed": "fiche|mockA#1|P3",
   "out": [
    2,
    3,
    4,
    5,
    6,
    0,
    1
   ]
  },
  {
   "n": 9,
   "seed": "fiche|claude#2|P4",
   "out": [
    4,
    3,
    2,
    1,
    0,
    8,
    7,
    6,
    5
   ]
  },
  {
   "n": 8,
   "seed": "fiche|mockB#2|P5",
   "out": [
    7,
    0,
    1,
    2,
    3,
    4,
    5,
    6
   ]
  },
  {
   "n": 10,
   "seed": "fiche|x|P6",
   "out": [
    9,
    8,
    7,
    6,
    5,
    4,
    3,
    2,
    1,
    0
   ]
  },
  {
   "n": 8,
   "seed": "fiche|x|P7",
   "out": [
    6,
    5,
    4,
    3,
    2,
    1,
    0,
    7
   ]
  },
  {
   "n": 0,
   "seed": "vide",
   "out": []
  },
  {
   "n": 1,
   "seed": "seul",
   "out": [
    0
   ]
  },
  {
   "n": 61,
   "seed": "global|1",
   "out": [
    60,
    59,
    58,
    57,
    56,
    55,
    54,
    53,
    52,
    51,
    50,
    49,
    48,
    47,
    46,
    45,
    44,
    43,
    42,
    41,
    40,
    39,
    38,
    37,
    36,
    35,
    34,
    33,
    32,
    31,
    30,
    29,
    28,
    27,
    26,
    25,
    24,
    23,
    22,
    21,
    20,
    19,
    18,
    17,
    16,
    15,
    14,
    13,
    12,
    11,
    10,
    9,
    8,
    7,
    6,
    5,
    4,
    3,
    2,
    1,
    0
   ]
  },
  {
   "n": 5,
   "seed": 42,
   "out": [
    3,
    2,
    1,
    0,
    4
   ]
  }
 ]
};

const V_REEL = {
 "all_competences": [
  [
   1,
   "1.01",
   "Pens\u00e9e Critique & Anti-Hallucination"
  ],
  [
   1,
   "1.02",
   "Cadrage de l'Intention"
  ],
  [
   1,
   "1.03",
   "Synth\u00e8se Int\u00e9grative"
  ],
  [
   1,
   "1.04",
   "M\u00e9tacognition & Humilit\u00e9 \u00c9pist\u00e9mique"
  ],
  [
   1,
   "1.05",
   "Pens\u00e9e Syst\u00e9mique"
  ],
  [
   1,
   "1.06",
   "Litt\u00e9ratie IA & Data Literacy"
  ],
  [
   1,
   "1.07",
   "Architecture de Syst\u00e8mes IA"
  ],
  [
   1,
   "1.08",
   "Dialogue IA Avanc\u00e9 & Orchestration Multi-Agents"
  ],
  [
   1,
   "1.09",
   "Pens\u00e9e Computationnelle"
  ],
  [
   1,
   "1.10",
   "Synergie & Coordination Hybride"
  ],
  [
   2,
   "2.01",
   "Intelligence \u00c9motionnelle & Sollicitude Active"
  ],
  [
   2,
   "2.02",
   "Communication Authentique"
  ],
  [
   2,
   "2.03",
   "Gestion des Conflits"
  ],
  [
   2,
   "2.04",
   "Influence & Diplomatie"
  ],
  [
   2,
   "2.05",
   "Collaboration Divergente"
  ],
  [
   2,
   "2.06",
   "Intelligence Culturelle & Contextuelle"
  ],
  [
   2,
   "2.07",
   "Sens Politique & Lecture Organisationnelle"
  ],
  [
   2,
   "2.08",
   "Traduction entre Mondes"
  ],
  [
   2,
   "2.09",
   "Construction de Communaut\u00e9s"
  ],
  [
   3,
   "3.01",
   "Cr\u00e9ativit\u00e9 It\u00e9rative & Radicale"
  ],
  [
   3,
   "3.02",
   "Singularit\u00e9 & Signature"
  ],
  [
   3,
   "3.03",
   "Design de Probl\u00e8mes"
  ],
  [
   3,
   "3.04",
   "Jugement Esth\u00e9tique & Curation"
  ],
  [
   3,
   "3.05",
   "Intelligence Manuelle & Artisanale"
  ],
  [
   3,
   "3.06",
   "Ancrage Sensoriel & Pleine Pr\u00e9sence"
  ],
  [
   3,
   "3.07",
   "Pr\u00e9sence & Performance Live"
  ],
  [
   4,
   "4.01",
   "Raisonnement \u00c9thique Appliqu\u00e9"
  ],
  [
   4,
   "4.02",
   "Alignement & Refus \u00c9thique"
  ],
  [
   4,
   "4.03",
   "Conscience \u00c9cologique & Long-terme"
  ],
  [
   4,
   "4.04",
   "Valorisation de la Neurodiversit\u00e9"
  ],
  [
   4,
   "4.05",
   "D\u00e9cision & Tol\u00e9rance \u00e0 l'Incertitude"
  ],
  [
   4,
   "4.06",
   "Responsabilit\u00e9, Courage & Int\u00e9grit\u00e9"
  ],
  [
   4,
   "4.07",
   "Validation Contextuelle"
  ],
  [
   4,
   "4.08",
   "Cr\u00e9ation de Valeur Non-Automatisable"
  ],
  [
   4,
   "4.09",
   "Patience Strat\u00e9gique & Sens du Timing"
  ],
  [
   5,
   "5.01",
   "R\u00e9silience & Antifragilit\u00e9"
  ],
  [
   5,
   "5.02",
   "Plasticit\u00e9 & D\u00e9sapprentissage"
  ],
  [
   5,
   "5.03",
   "Narration R\u00e9flexive"
  ],
  [
   5,
   "5.04",
   "Acceptation de l'Intelligence Sup\u00e9rieure"
  ],
  [
   5,
   "5.05",
   "Sens & Motivation Intrins\u00e8que"
  ],
  [
   5,
   "5.06",
   "Autonomie, Mode D\u00e9grad\u00e9 & D\u00e9brouillardise"
  ],
  [
   5,
   "5.07",
   "Souverainet\u00e9 Attentionnelle"
  ],
  [
   5,
   "5.08",
   "V\u00e9rification Terrain"
  ],
  [
   6,
   "6.01",
   "Red-Teaming & S\u00e9curit\u00e9 IA"
  ],
  [
   6,
   "6.02",
   "Audit, Explicabilit\u00e9 & Hygi\u00e8ne des Donn\u00e9es"
  ],
  [
   6,
   "6.03",
   "Gouvernance Algorithmique des Services Publics"
  ],
  [
   6,
   "6.04",
   "Souverainet\u00e9 Num\u00e9rique & Gouvernance des Communs"
  ],
  [
   6,
   "6.05",
   "Participation Citoyenne & D\u00e9mocratie Technologique"
  ],
  [
   6,
   "6.06",
   "Veille R\u00e9glementaire & Anticipation Normative"
  ],
  [
   6,
   "6.07",
   "Facilitation & Gouvernance Collective"
  ],
  [
   6,
   "6.08",
   "D\u00e9centrement Anthropocentrique"
  ],
  [
   6,
   "6.09",
   "Cohabitation avec les Intelligences Non-Humaines"
  ],
  [
   6,
   "6.10",
   "Conscience Biosyst\u00e9mique & Interd\u00e9pendance"
  ],
  [
   7,
   "7.01",
   "Ma\u00efeutique & Facilitation d'Apprentissage"
  ],
  [
   7,
   "7.02",
   "\u00c9valuation Transformative"
  ],
  [
   7,
   "7.03",
   "Documentation Vivante"
  ],
  [
   7,
   "7.04",
   "Leadership Situationnel & Orchestration"
  ],
  [
   7,
   "7.05",
   "Vision Strat\u00e9gique & Prospective"
  ],
  [
   7,
   "7.06",
   "Efficacit\u00e9 Personnelle"
  ],
  [
   7,
   "7.07",
   "Agilit\u00e9 & Conduite du Changement"
  ],
  [
   7,
   "7.08",
   "Gestion de Crise en Temps R\u00e9el"
  ]
 ],
 "n_codes": 61
};

describe("referentiel.parsePole — parité parse_pole (fiche factice)", () => {
  const pole = parsePole(V.fake_fiche, 3);

  it("header non strippé, compétences {code, nom, fiche_md}", () => {
    expect(pole.num).toBe(V.pole.num);
    expect(pole.nom).toBe(V.pole.nom);
    expect(pole.header).toBe(V.pole.header);
    expect(pole.competences).toEqual(V.pole.competences);
  });

  it("ficheComplete : ordre naturel puis permuté (sortie exacte)", () => {
    expect(pole.ficheComplete()).toBe(V.fiche_complete);
    expect(permutation(pole.competences.length, "fiche|mockA#1|P3")).toEqual(V.ordre);
    expect(pole.ficheComplete(V.ordre)).toBe(V.fiche_complete_ordre);
  });

  it("competence : première par code exact, sinon null", () => {
    expect(pole.competence("3.02")).toEqual(V.competence_302);
    expect(pole.competence("9.99")).toBe(null);
  });

  it("aucune section → erreur", () => {
    expect(() => parsePole("# Titre\nrien\n", 1)).toThrowError(
      "Aucune section '## X.YY — Nom' dans P1.md",
    );
  });
});

describe("referentiel — constantes et permutation", () => {
  it("POLE_NOMS : octets identiques au Python (U+2014, apostrophe droite)", () => {
    for (const [k, nom] of Object.entries(V.pole_noms)) {
      expect(POLE_NOMS[k]).toBe(nom);
    }
    expect(Object.keys(POLE_NOMS).length).toBe(7);
    expect(new Pole(9, "", []).nom).toBe(V.pole_nom_fallback);
  });

  it("permutation : rotation + inversion, h 48 bits sans opérateur binaire", () => {
    for (const c of V.permutations) {
      expect(permutation(c.n, c.seed), JSON.stringify(c.seed)).toEqual(c.out);
    }
  });
});

describe("referentiel.loadReferentiel — unicité globale et ordre", () => {
  /** Sept fiches factices minimales, codes n.01 / n.02. */
  function fiches(codePole2 = "2.01") {
    /** @type {Record<number, string>} */
    const out = {};
    for (let n = 1; n <= 7; n++) {
      const c1 = n === 2 ? codePole2 : `${n}.01`;
      out[n] =
        `# Pôle ${n} — factice\n\nintro\n\n## ${c1} — Comp ${n}A\n\ntexte\n\n## ${n}.02 — Comp ${n}B\n\ntexte\n`;
    }
    return out;
  }

  it("7 pôles, allCompetences en ordre numérique", () => {
    const poles = loadReferentiel(fiches());
    expect(Array.from(poles.keys())).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(allCompetences(poles).map(([n, code]) => `${n}|${code}`)).toEqual([
      "1|1.01", "1|1.02", "2|2.01", "2|2.02", "3|3.01", "3|3.02", "4|4.01",
      "4|4.02", "5|5.01", "5|5.02", "6|6.01", "6|6.02", "7|7.01", "7|7.02",
    ]);
  });

  it("code dupliqué → erreur (message Python)", () => {
    expect(() => loadReferentiel(fiches("1.01"))).toThrowError(
      "Code dupliqué dans le référentiel : 1.01",
    );
  });

  it("fiche manquante → erreur", () => {
    const f = fiches();
    delete f[4];
    expect(() => loadReferentiel(f)).toThrowError("Fiche de pôle manquante : P4.md");
  });
});

// Structure du référentiel réel (extraite par gen-oracles.sh, gitignorée).
const ORACLE = fileURLToPath(
  new URL("../../test/twin9-oracles/referentiel.json", import.meta.url),
);

describe.skipIf(!existsSync(ORACLE))("referentiel — structure réelle injectée (oracle)", () => {
  const structure = JSON.parse(readFileSync(ORACLE, "utf8"));
  const poles = polesFromStructure(structure);

  it("7 pôles, 61 codes uniques, noms de pôles = POLE_NOMS", () => {
    expect(Array.from(poles.keys())).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const all = allCompetences(poles);
    expect(all.length).toBe(V_REEL.n_codes);
    expect(new Set(all.map(([, code]) => code)).size).toBe(all.length);
    for (const [n, pole] of poles) expect(pole.nom).toBe(POLE_NOMS[n]);
  });

  it("allCompetences identique au Python (num, code, nom)", () => {
    expect(allCompetences(poles)).toEqual(V_REEL.all_competences);
  });

  it("les fiches factices injectées restent utilisables par ficheComplete", () => {
    const p1 = /** @type {Pole} */ (poles.get(1));
    const fiche = p1.ficheComplete(permutation(p1.competences.length, "fiche|x|P1"));
    expect(fiche.endsWith("\n")).toBe(true);
    expect(fiche).toContain("---");
  });
});
