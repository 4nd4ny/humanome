// Vecteurs générés par CPython 3.14.3 (difflib.SequenceMatcher) puis figés ici
// — script : engine/test/twin9-vectors/gen_vectors.py. Chaque paire est testée avec
// autojunk=false (1er matcher de find_verbatim) ET autojunk=true (2e matcher,
// élimination des éléments « populaires » si len(b) ≥ 200), plus les seuils
// len(b) = 199/200/201. Les ratios sont comparés par égalité stricte de double.
import { describe, expect, it } from "vitest";
import { SequenceMatcher } from "./difflib.js";

const VECTORS = [
 {
  "a": "abcd",
  "b": "bcde",
  "autojunk": false,
  "flm": [
   1,
   0,
   3
  ],
  "blocks": [
   [
    1,
    0,
    3
   ],
   [
    4,
    4,
    0
   ]
  ],
  "ratio": 0.75
 },
 {
  "a": "abcd",
  "b": "bcde",
  "autojunk": true,
  "flm": [
   1,
   0,
   3
  ],
  "blocks": [
   [
    1,
    0,
    3
   ],
   [
    4,
    4,
    0
   ]
  ],
  "ratio": 0.75
 },
 {
  "a": " abcd",
  "b": "abcd abcd",
  "autojunk": false,
  "flm": [
   0,
   4,
   5
  ],
  "blocks": [
   [
    0,
    4,
    5
   ],
   [
    5,
    9,
    0
   ]
  ],
  "ratio": 0.7142857142857143
 },
 {
  "a": " abcd",
  "b": "abcd abcd",
  "autojunk": true,
  "flm": [
   0,
   4,
   5
  ],
  "blocks": [
   [
    0,
    4,
    5
   ],
   [
    5,
    9,
    0
   ]
  ],
  "ratio": 0.7142857142857143
 },
 {
  "a": "abxcd",
  "b": "abcd",
  "autojunk": false,
  "flm": [
   0,
   0,
   2
  ],
  "blocks": [
   [
    0,
    0,
    2
   ],
   [
    3,
    2,
    2
   ],
   [
    5,
    4,
    0
   ]
  ],
  "ratio": 0.8888888888888888
 },
 {
  "a": "abxcd",
  "b": "abcd",
  "autojunk": true,
  "flm": [
   0,
   0,
   2
  ],
  "blocks": [
   [
    0,
    0,
    2
   ],
   [
    3,
    2,
    2
   ],
   [
    5,
    4,
    0
   ]
  ],
  "ratio": 0.8888888888888888
 },
 {
  "a": "",
  "b": "abc",
  "autojunk": false,
  "flm": [
   0,
   0,
   0
  ],
  "blocks": [
   [
    0,
    3,
    0
   ]
  ],
  "ratio": 0.0
 },
 {
  "a": "",
  "b": "abc",
  "autojunk": true,
  "flm": [
   0,
   0,
   0
  ],
  "blocks": [
   [
    0,
    3,
    0
   ]
  ],
  "ratio": 0.0
 },
 {
  "a": "abc",
  "b": "",
  "autojunk": false,
  "flm": [
   0,
   0,
   0
  ],
  "blocks": [
   [
    3,
    0,
    0
   ]
  ],
  "ratio": 0.0
 },
 {
  "a": "abc",
  "b": "",
  "autojunk": true,
  "flm": [
   0,
   0,
   0
  ],
  "blocks": [
   [
    3,
    0,
    0
   ]
  ],
  "ratio": 0.0
 },
 {
  "a": "identique",
  "b": "identique",
  "autojunk": false,
  "flm": [
   0,
   0,
   9
  ],
  "blocks": [
   [
    0,
    0,
    9
   ],
   [
    9,
    9,
    0
   ]
  ],
  "ratio": 1.0
 },
 {
  "a": "identique",
  "b": "identique",
  "autojunk": true,
  "flm": [
   0,
   0,
   9
  ],
  "blocks": [
   [
    0,
    0,
    9
   ],
   [
    9,
    9,
    0
   ]
  ],
  "ratio": 1.0
 },
 {
  "a": "\ud83c\udf0dab\ud83c\udf0dcd",
  "b": "ab\ud83c\udf0dcdef",
  "autojunk": false,
  "flm": [
   1,
   0,
   5
  ],
  "blocks": [
   [
    1,
    0,
    5
   ],
   [
    6,
    7,
    0
   ]
  ],
  "ratio": 0.7692307692307693
 },
 {
  "a": "\ud83c\udf0dab\ud83c\udf0dcd",
  "b": "ab\ud83c\udf0dcdef",
  "autojunk": true,
  "flm": [
   1,
   0,
   5
  ],
  "blocks": [
   [
    1,
    0,
    5
   ],
   [
    6,
    7,
    0
   ]
  ],
  "ratio": 0.7692307692307693
 },
 {
  "a": "aaaa",
  "b": "aaa",
  "autojunk": false,
  "flm": [
   0,
   0,
   3
  ],
  "blocks": [
   [
    0,
    0,
    3
   ],
   [
    4,
    3,
    0
   ]
  ],
  "ratio": 0.8571428571428571
 },
 {
  "a": "aaaa",
  "b": "aaa",
  "autojunk": true,
  "flm": [
   0,
   0,
   3
  ],
  "blocks": [
   [
    0,
    0,
    3
   ],
   [
    4,
    3,
    0
   ]
  ],
  "ratio": 0.8571428571428571
 },
 {
  "a": "xaxbx",
  "b": "bxax",
  "autojunk": false,
  "flm": [
   0,
   1,
   3
  ],
  "blocks": [
   [
    0,
    1,
    3
   ],
   [
    5,
    4,
    0
   ]
  ],
  "ratio": 0.6666666666666666
 },
 {
  "a": "xaxbx",
  "b": "bxax",
  "autojunk": true,
  "flm": [
   0,
   1,
   3
  ],
  "blocks": [
   [
    0,
    1,
    3
   ],
   [
    5,
    4,
    0
   ]
  ],
  "ratio": 0.6666666666666666
 },
 {
  "a": "j'ai anim\u00e9 l'atelier de m\u00e9diation scientifique avec les cm2",
  "b": "aujourd'hui, j'ai anim\u00e9 l'atelier de m\u00e9diation scientifique avec les cm2 de l'\u00e9cole jean-jaur\u00e8s ; nous avons construit un sismographe en carton et chacun a not\u00e9 ses observations dans le carnet de bord. ensuite nous avons compar\u00e9 les trac\u00e9s obtenus et discut\u00e9 des sources d'erreur possibles, avant de ranger le mat\u00e9riel ensemble.",
  "autojunk": false,
  "flm": [
   0,
   13,
   59
  ],
  "blocks": [
   [
    0,
    13,
    59
   ],
   [
    59,
    328,
    0
   ]
  ],
  "ratio": 0.3049095607235142
 },
 {
  "a": "j'ai anim\u00e9 l'atelier de m\u00e9diation scientifique avec les cm2",
  "b": "aujourd'hui, j'ai anim\u00e9 l'atelier de m\u00e9diation scientifique avec les cm2 de l'\u00e9cole jean-jaur\u00e8s ; nous avons construit un sismographe en carton et chacun a not\u00e9 ses observations dans le carnet de bord. ensuite nous avons compar\u00e9 les trac\u00e9s obtenus et discut\u00e9 des sources d'erreur possibles, avant de ranger le mat\u00e9riel ensemble.",
  "autojunk": true,
  "flm": [
   0,
   2,
   1
  ],
  "blocks": [
   [
    0,
    2,
    1
   ],
   [
    1,
    14,
    58
   ],
   [
    59,
    328,
    0
   ]
  ],
  "ratio": 0.3049095607235142
 },
 {
  "a": "jai anim\u00e9 latelier de mediation scientifique avec les cm2",
  "b": "aujourd'hui, j'ai anim\u00e9 l'atelier de m\u00e9diation scientifique avec les cm2 de l'\u00e9cole jean-jaur\u00e8s ; nous avons construit un sismographe en carton et chacun a not\u00e9 ses observations dans le carnet de bord. ensuite nous avons compar\u00e9 les trac\u00e9s obtenus et discut\u00e9 des sources d'erreur possibles, avant de ranger le mat\u00e9riel ensemble.",
  "autojunk": false,
  "flm": [
   24,
   39,
   33
  ],
  "blocks": [
   [
    0,
    2,
    1
   ],
   [
    1,
    15,
    10
   ],
   [
    11,
    26,
    12
   ],
   [
    24,
    39,
    33
   ],
   [
    57,
    328,
    0
   ]
  ],
  "ratio": 0.2909090909090909
 },
 {
  "a": "jai anim\u00e9 latelier de mediation scientifique avec les cm2",
  "b": "aujourd'hui, j'ai anim\u00e9 l'atelier de m\u00e9diation scientifique avec les cm2 de l'\u00e9cole jean-jaur\u00e8s ; nous avons construit un sismographe en carton et chacun a not\u00e9 ses observations dans le carnet de bord. ensuite nous avons compar\u00e9 les trac\u00e9s obtenus et discut\u00e9 des sources d'erreur possibles, avant de ranger le mat\u00e9riel ensemble.",
  "autojunk": true,
  "flm": [
   0,
   2,
   1
  ],
  "blocks": [
   [
    0,
    2,
    1
   ],
   [
    24,
    39,
    33
   ],
   [
    57,
    328,
    0
   ]
  ],
  "ratio": 0.17662337662337663
 },
 {
  "a": "jai anim\u00e9 latelier de mediation scientifique avec les cm2",
  "b": "l'atelier de m\u00e9diation scientifique avec les cm2 de l'\u00e9co",
  "autojunk": false,
  "flm": [
   24,
   15,
   33
  ],
  "blocks": [
   [
    10,
    0,
    1
   ],
   [
    11,
    2,
    12
   ],
   [
    24,
    15,
    33
   ],
   [
    57,
    57,
    0
   ]
  ],
  "ratio": 0.8070175438596491
 },
 {
  "a": "jai anim\u00e9 latelier de mediation scientifique avec les cm2",
  "b": "l'atelier de m\u00e9diation scientifique avec les cm2 de l'\u00e9co",
  "autojunk": true,
  "flm": [
   24,
   15,
   33
  ],
  "blocks": [
   [
    10,
    0,
    1
   ],
   [
    11,
    2,
    12
   ],
   [
    24,
    15,
    33
   ],
   [
    57,
    57,
    0
   ]
  ],
  "ratio": 0.8070175438596491
 },
 {
  "a": "eeeeeeeeeexyz",
  "b": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeabceeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeabceeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeabceeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeabc",
  "autojunk": false,
  "flm": [
   0,
   0,
   10
  ],
  "blocks": [
   [
    0,
    0,
    10
   ],
   [
    13,
    212,
    0
   ]
  ],
  "ratio": 0.08888888888888889
 },
 {
  "a": "eeeeeeeeeexyz",
  "b": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeabceeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeabceeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeabceeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeabc",
  "autojunk": true,
  "flm": [
   0,
   0,
   10
  ],
  "blocks": [
   [
    0,
    0,
    10
   ],
   [
    13,
    212,
    0
   ]
  ],
  "ratio": 0.08888888888888889
 },
 {
  "a": "ab e cd",
  "b": "mot0emot1emot2emot3emot4emot5emot6emot7emot8emot9emot10emot11emot12emot13emot14emot15emot16emot17emot18emot19emot20emot21emot22emot23emot24emot25emot26emot27emot28emot29emot30emot31emot32emot33emot34emot35emot36emot37emot38emot39",
  "autojunk": false,
  "flm": [
   3,
   4,
   1
  ],
  "blocks": [
   [
    3,
    4,
    1
   ],
   [
    7,
    229,
    0
   ]
  ],
  "ratio": 0.00847457627118644
 },
 {
  "a": "ab e cd",
  "b": "mot0emot1emot2emot3emot4emot5emot6emot7emot8emot9emot10emot11emot12emot13emot14emot15emot16emot17emot18emot19emot20emot21emot22emot23emot24emot25emot26emot27emot28emot29emot30emot31emot32emot33emot34emot35emot36emot37emot38emot39",
  "autojunk": true,
  "flm": [
   0,
   0,
   0
  ],
  "blocks": [
   [
    7,
    229,
    0
   ]
  ],
  "ratio": 0.0
 },
 {
  "a": "qqqqq suffixe commun",
  "b": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx suffixe commun",
  "autojunk": false,
  "flm": [
   5,
   190,
   15
  ],
  "blocks": [
   [
    5,
    190,
    15
   ],
   [
    20,
    205,
    0
   ]
  ],
  "ratio": 0.13333333333333333
 },
 {
  "a": "qqqqq suffixe commun",
  "b": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx suffixe commun",
  "autojunk": true,
  "flm": [
   5,
   190,
   15
  ],
  "blocks": [
   [
    5,
    190,
    15
   ],
   [
    20,
    205,
    0
   ]
  ],
  "ratio": 0.13333333333333333
 },
 {
  "a": "phrase avec \u00ab guillemets \u00bb et \u2014 tirets",
  "b": "texte avec \"guillemets\" et - tirets",
  "autojunk": false,
  "flm": [
   14,
   12,
   10
  ],
  "blocks": [
   [
    5,
    4,
    7
   ],
   [
    14,
    12,
    10
   ],
   [
    26,
    23,
    4
   ],
   [
    31,
    28,
    7
   ],
   [
    38,
    35,
    0
   ]
  ],
  "ratio": 0.7671232876712328
 },
 {
  "a": "phrase avec \u00ab guillemets \u00bb et \u2014 tirets",
  "b": "texte avec \"guillemets\" et - tirets",
  "autojunk": true,
  "flm": [
   14,
   12,
   10
  ],
  "blocks": [
   [
    5,
    4,
    7
   ],
   [
    14,
    12,
    10
   ],
   [
    26,
    23,
    4
   ],
   [
    31,
    28,
    7
   ],
   [
    38,
    35,
    0
   ]
  ],
  "ratio": 0.7671232876712328
 },
 {
  "a": "abababababababababababab",
  "b": "abababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababa",
  "autojunk": true,
  "flm": [
   0,
   0,
   24
  ],
  "blocks": [
   [
    0,
    0,
    24
   ],
   [
    24,
    199,
    0
   ]
  ],
  "ratio": 0.21524663677130046
 },
 {
  "a": "abababababababababababab",
  "b": "abababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababab",
  "autojunk": true,
  "flm": [
   0,
   0,
   24
  ],
  "blocks": [
   [
    0,
    0,
    24
   ],
   [
    24,
    200,
    0
   ]
  ],
  "ratio": 0.21428571428571427
 },
 {
  "a": "abababababababababababab",
  "b": "ababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababa",
  "autojunk": true,
  "flm": [
   0,
   0,
   24
  ],
  "blocks": [
   [
    0,
    0,
    24
   ],
   [
    24,
    201,
    0
   ]
  ],
  "ratio": 0.21333333333333335
 },
 {
  "a": "abababababababababababab",
  "b": "abababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababab",
  "autojunk": true,
  "flm": [
   0,
   0,
   24
  ],
  "blocks": [
   [
    0,
    0,
    24
   ],
   [
    24,
    300,
    0
   ]
  ],
  "ratio": 0.14814814814814814
 }
];

describe("SequenceMatcher — parité difflib CPython", () => {
  VECTORS.forEach((v, idx) => {
    const la = Array.from(v.a).length;
    const lb = Array.from(v.b).length;
    const label = `#${idx} a[${la}] b[${lb}] autojunk=${v.autojunk}`;

    it(`${label} : find_longest_match(0, la, 0, lb)`, () => {
      const sm = new SequenceMatcher(v.a, v.b, { autojunk: v.autojunk });
      const m = sm.findLongestMatch(0, la, 0, lb);
      expect([m.a, m.b, m.size]).toEqual(v.flm);
    });

    it(`${label} : get_matching_blocks (fusion + sentinelle)`, () => {
      const sm = new SequenceMatcher(v.a, v.b, { autojunk: v.autojunk });
      const blocks = sm.getMatchingBlocks().map((x) => [x.a, x.b, x.size]);
      expect(blocks).toEqual(v.blocks);
    });

    it(`${label} : ratio() == 2M/T exact`, () => {
      const sm = new SequenceMatcher(v.a, v.b, { autojunk: v.autojunk });
      expect(sm.ratio()).toBe(v.ratio);
    });
  });

  it("départage : premier k > bestsize gagne (plus petit i puis j)", () => {
    // Exemple documenté de CPython : le match glisse au plus tôt.
    const sm = new SequenceMatcher(" abcd", "abcd abcd", { autojunk: false });
    const m = sm.findLongestMatch(0, 5, 0, 9);
    expect([m.a, m.b, m.size]).toEqual([0, 4, 5]);
  });

  it("bornes partielles (alo/ahi/blo/bhi) — utilisées par get_matching_blocks", () => {
    const sm = new SequenceMatcher("abxcd", "abcd", { autojunk: false });
    const m = sm.findLongestMatch(3, 5, 2, 4);
    expect([m.a, m.b, m.size]).toEqual([3, 2, 2]);
  });

  it("sémantique points de code : les émojis comptent 1 (pas 2 unités UTF-16)", () => {
    const sm = new SequenceMatcher("🌍ab", "ab", { autojunk: false });
    const m = sm.findLongestMatch(0, 3, 0, 2);
    expect([m.a, m.b, m.size]).toEqual([1, 0, 2]);
    expect(sm.ratio()).toBe(0.8); // 2*2/(3+2)
  });
});
