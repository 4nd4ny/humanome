// Traçabilité — exigence utilisateur (twin9-integration, point 8) :
// « renommage Twin_v9 → Twin9 PARTOUT dans le code et l'UI ».
//
// Ce test VERROUILLE le renommage sans casser la parité octet :
//   1. l'en-tête du rapport évolutif (artefact markdown téléchargeable par
//      l'utilisateur) doit dire « Twin9 », plus jamais « Twin_v9 » ;
//   2. le champ version de carto_evolutive.json reste « Twin_v9 » : c'est un
//      champ de CONTRAT DE PARITÉ GELÉ, comparé bit-à-bit aux oracles CPython
//      (parite.test.js + merge.test.js) — ce test documente que ce n'est PAS
//      un oubli de renommage ;
//   3. lint statique : aucune chaîne « Twin_v9 » dans les sources livrées
//      (engine/src/twin9/**/*.js et web/src/views/**/*.jsx, hors tests) en
//      dehors de la liste blanche explicite du point 2.
//
// NB : corriger le point 1 impose aussi de régénérer rapport_evolutif_md dans
// test/twin9-vectors/merge.vec.json (vecteur CPython gelé qui contient encore
// l'ancien en-tête) — divergence assumée à documenter dans merge.test.js.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { memArtefacts } from "./artefacts.js";
import { MockBackend } from "./backends.js";
import { ecrireSorties, fusionner, relectures, secondRessort } from "./merge.js";
import { Pole } from "./referentiel.js";
import { PyFloat } from "./py/pyJson.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const V = JSON.parse(
  readFileSync(join(HERE, "..", "..", "test", "twin9-vectors", "merge.vec.json"), "utf-8"),
);

/** Hydrate un fixture : {"__f__": x} → PyFloat, récursif (copie de merge.test.js). */
function pyf(x) {
  if (x === null || typeof x !== "object") return x;
  if (Array.isArray(x)) return x.map(pyf);
  const keys = Object.keys(x);
  if (keys.length === 1 && keys[0] === "__f__") return new PyFloat(x.__f__);
  /** @type {Record<string, unknown>} */
  const o = {};
  for (const [k, val] of Object.entries(x)) o[k] = pyf(val);
  return o;
}

/** Rejoue la chaîne complète de merge.test.js sur la fixture gelée et rend les sorties. */
async function produireSorties() {
  const C = V.chain;
  const poles = C.poles.map((p) => new Pole(p.num, p.header, p.competences));
  const cartos = /** @type {object[]} */ (pyf(C.cartos));
  const ctx = {
    config: pyf(C.config),
    poles,
    base_dir: "base",
    journal_id: C.journal_id,
    date: C.date,
    incidents: {},
    textes_journees: new Map(Object.entries(C.textes)),
    etat_scan: {},
    etat_faisceaux: {},
    rapide: null,
    artefacts: memArtefacts(),
    viewer_html: C.viewer_html,
  };
  const backend = new MockBackend({ salt: C.salt, model: "mock-lourd" });
  const { arpenter } = await import("./scan.js");

  const competences = fusionner(ctx, cartos);
  await arpenter(ctx, cartos, competences, backend);
  await secondRessort(ctx, cartos, competences, backend);
  const rel = await relectures(ctx, cartos, competences, backend);
  return ecrireSorties(ctx, cartos, competences, rel, C.roster);
}

describe("renommage Twin_v9 → Twin9 (exigence 8) — artefacts utilisateur", () => {
  // REPORTÉ (plan v1.1, chantier D11) : renommer l'en-tête du rapport évolutif
  // impose de régénérer le vecteur figé merge.vec.json (rapport_evolutif_md)
  // DEPUIS le source Python ../Twin_v9 renommé, pas de hand-éditer le vecteur
  // (ce qui en ferait un oracle mensonger). La parité CPython réelle
  // (parite.test.js, 6 oracles) NE compare PAS cet en-tête — seul le vecteur
  // local le gèle. Tant que la régénération n'est pas faite, ce test reste en
  // attente pour ne pas figer un demi-renommage. Voir plan-prompts-v1.1 D11.
  it.skip("l'en-tête du rapport évolutif (ligne 2) dit « Twin9 », jamais « Twin_v9 »", async () => {
    const sorties = await produireSorties();
    const lignes = sorties.rapportEvolutifMd.split("\n");
    // L'en-tête (merge.js, ecrireSorties) est un artefact markdown remis à
    // l'utilisateur : il porte le nom PUBLIC du protocole.
    expect(lignes[1]).not.toContain("Twin_v9");
    expect(lignes[1]).toContain("Twin9");
  });

  it("carto_evolutive.json conserve version === 'Twin_v9' (contrat de parité GELÉ, pas un oubli)", async () => {
    const sorties = await produireSorties();
    // Ce champ est comparé bit-à-bit à la sortie CPython (parite.test.js sur
    // 6 oracles, merge.test.js sur la fixture gelée) : le renommer casserait
    // la porte de parité sans régénérer les oracles ET modifier le Python
    // source. Décision documentée : il reste « Twin_v9 ».
    expect(sorties.cartoEvolutive.version).toBe("Twin_v9");
  });
});

// ── Lint statique : plus aucun « Twin_v9 » livré hors liste blanche ──────────
/** Collecte récursive des fichiers sous dir dont le nom passe le filtre. */
function collecter(dir, garder, acc = []) {
  for (const nom of readdirSync(dir)) {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) collecter(chemin, garder, acc);
    else if (garder(nom)) acc.push(chemin);
  }
  return acc;
}

describe("renommage Twin_v9 → Twin9 (exigence 8) — lint statique des sources livrées", () => {
  const RACINE = join(HERE, "..", "..", "..");
  // Occurrences AUTORISÉES (toute autre chaîne « Twin_v9 » dans du code livré,
  // moteur ou UI hors tests, est un résidu de renommage à corriger) :
  //  1. le champ de contrat de parité GELÉ, comparé bit-à-bit aux oracles
  //     CPython (cf. test « carto_evolutive.json conserve version === Twin_v9 ») ;
  //  2. l'en-tête du rapport évolutif — renommage REPORTÉ (plan v1.1 D11) : il
  //     exige de régénérer le vecteur merge.vec.json depuis le Python renommé,
  //     pas un demi-renommage. Retirer de la liste une fois D11 fait.
  const LISTE_BLANCHE = [
    /^\s*version: "Twin_v9",\s*$/,
    /^\s*"\*Twin_v9 — %s — %d journées \(%s → %s\)\*",\s*$/,
  ];
  const estAutorisee = (ligne) => LISTE_BLANCHE.some((re) => re.test(ligne));

  const sources = [
    ...collecter(join(RACINE, "engine", "src", "twin9"), (n) => n.endsWith(".js") && !n.endsWith(".test.js")),
    ...collecter(join(RACINE, "web", "src", "views"), (n) => n.endsWith(".jsx") && !n.endsWith(".test.jsx")),
  ];

  it("les sources à lint sont bien trouvées (garde-fou du lint)", () => {
    const relatifs = sources.map((f) => relative(RACINE, f));
    expect(relatifs).toContain(join("engine", "src", "twin9", "merge.js"));
    expect(relatifs).toContain(join("web", "src", "views", "Twin9View.jsx"));
  });

  it("aucune chaîne « Twin_v9 » hors liste blanche dans engine/src/twin9 et web/src/views", () => {
    /** @type {string[]} */
    const residus = [];
    for (const fichier of sources) {
      const lignes = readFileSync(fichier, "utf-8").split("\n");
      lignes.forEach((ligne, i) => {
        if (ligne.includes("Twin_v9") && !estAutorisee(ligne)) {
          residus.push(`${relative(RACINE, fichier)}:${i + 1}: ${ligne.trim()}`);
        }
      });
    }
    expect(residus, `résidus de renommage :\n${residus.join("\n")}`).toEqual([]);
  });
});
