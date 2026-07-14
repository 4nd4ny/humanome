// Tests de parité bit-à-bit de merge.js contre aurora/merge3.py (CPython).
// Vecteurs générés UNE FOIS via python3 (test/twin9-vectors/gen_merge_scan_vectors.py)
// puis GELÉS dans test/twin9-vectors/merge.vec.json — les tests n'exécutent
// JAMAIS python (ils lisent le blob figé et committé via node:fs, lecture
// autorisée aux tests). Le non-déterminisme de merge3 est nul (ni ThreadPool ni
// horloge) ; seuls base_dir/date sont fixés côté oracle.
// Chaque sortie attendue est soit la chaîne json.dumps(obj, ensure_ascii=False,
// indent=2) + "\n" de CPython (profil write_json — comparée à
// pyJsonDumpsWriteJson), soit une chaîne markdown brute. Les floats d'entrée
// sont marqués {"__f__": x} et hydratés en PyFloat par pyf().

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { memArtefacts } from "./artefacts.js";
import { MockBackend } from "./backends.js";
import {
  ecrireSorties,
  fusionner,
  gardienFormulations,
  profilIpsatif,
  registreTenu,
  relectures,
  resumeJour,
  secondRessort,
  statutTemporel,
  trajectoire,
} from "./merge.js";
import { Pole } from "./referentiel.js";
import { PyFloat, pyJsonDumpsWriteJson } from "./py/pyJson.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const V = JSON.parse(
  readFileSync(join(HERE, "..", "..", "test", "twin9-vectors", "merge.vec.json"), "utf-8"),
);

/** Hydrate un fixture : {"__f__": x} → PyFloat, récursif ; laisse le reste. */
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

/** Profil write_json : la comparaison de parité se fait sur ce texte. */
const dj = pyJsonDumpsWriteJson;

/** competences : dict ordonné {code: comp} → Map (ordre d'insertion). */
function compMap(obj) {
  const h = /** @type {Record<string, object>} */ (pyf(obj));
  return new Map(Object.entries(h));
}

/** Reconstruit les Pole depuis la spec émise (num, header, competences). */
function buildPoles(spec) {
  return spec.map((p) => new Pole(p.num, p.header, p.competences));
}

// ── Tables unitaires : fonctions pures ───────────────────────────────────────
describe("merge.statutTemporel — parité CPython", () => {
  for (const c of V.statut_temporel) {
    it(`ne=${c.ne} nr=${c.nr} → ${c.out}`, () => {
      expect(statutTemporel(c.ne, c.nr)).toBe(c.out);
    });
  }
});

describe("merge.trajectoire — parité CPython", () => {
  for (const c of V.trajectoire) {
    it(`je=${JSON.stringify(c.je)} js=${JSON.stringify(c.js)} n=${c.n} → ${c.out}`, () => {
      expect(trajectoire(c.je, c.js, c.n)).toBe(c.out);
    });
  }
});

describe("merge.fusionner — cumuls (bool compte 1, 'R'/float exclus)", () => {
  it("score_preuves True → 1 ; score_indices 'R'/float exclus ; confiance bool", () => {
    const f = V.fusionner_edge;
    const ctx = { poles: buildPoles(f.poles) };
    expect(dj(fusionner(ctx, /** @type {object[]} */ (pyf(f.cartos))))).toBe(f.out);
  });
});

describe("merge.profilIpsatif — parité CPython (arrondi intermédiaire)", () => {
  for (const [name, c] of Object.entries(V.profil_ipsatif)) {
    it(name, () => {
      expect(dj(profilIpsatif(compMap(c.comps)))).toBe(c.out);
    });
  }
});

describe("merge.gardienFormulations — parité CPython (doublons, alertes de pôle)", () => {
  it("signalements + alertes", () => {
    const g = V.gardien_formulations;
    const [sig, al] = gardienFormulations(pyf(g.cartos), compMap(g.comps), pyf(g.rel));
    expect(dj([sig, al])).toBe(g.out);
  });
});

describe("merge.resumeJour / registreTenu — parité CPython", () => {
  it("resumeJour", () => {
    expect(resumeJour(pyf(V.resume_jour.cj))).toBe(V.resume_jour.out);
  });
  it("registreTenu", () => {
    expect(registreTenu(compMap(V.registre_tenu.comps))).toBe(V.registre_tenu.out);
  });
});

// ── Chaîne complète : fusionner → arpenter → secondRessort → relectures →
//    ecrireSorties, sur UNE fixture riche (le verrou principal) ──────────────
describe("merge — chaîne complète en mock (parité CPython octet à octet)", () => {
  it("fusionner → secondRessort → relectures → ecrireSorties", async () => {
    const C = V.chain;
    const poles = buildPoles(C.poles);
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

    // dépendance : scan.js pose ctx.scan_global + verse les graines
    const { arpenter } = await import("./scan.js");

    const competences = fusionner(ctx, cartos);
    expect(dj(competences)).toBe(C.fusionner);

    const resume = await arpenter(ctx, cartos, competences, backend);
    expect(dj(resume)).toBe(C.scan_resume);
    expect(dj(ctx.artefacts.readJson("base/scan_global.json"))).toBe(C.scan_global_json);
    expect(dj(competences)).toBe(C.comps_after_scan);
    expect(dj(ctx.etat_scan)).toBe(C.etat_scan);
    expect(dj(ctx.incidents)).toBe(C.incidents_after_scan);

    const sr = await secondRessort(ctx, cartos, competences, backend);
    expect(dj(sr)).toBe(C.sr_out);
    expect(dj(competences)).toBe(C.comps_after_sr);
    expect(dj(ctx.etat_faisceaux)).toBe(C.etat_faisceaux);

    const rel = await relectures(ctx, cartos, competences, backend);
    expect(dj(rel)).toBe(C.rel);
    expect(dj(ctx.incidents)).toBe(C.incidents_after_rel);

    // ecrireSorties RETOURNE un wrapper {cartoEvolutive, ...} (divergence
    // assumée) au lieu du seul carto_evo Python — on déballe pour la parité.
    const carto = ecrireSorties(ctx, cartos, competences, rel, C.roster);
    expect(dj(carto.cartoEvolutive)).toBe(C.carto_evo_ret);
    expect(dj(carto.profilIpsatif)).toBe(C.profil_ipsatif_json);
    expect(carto.rapportMd).toBe(C.rapport_md);
    expect(carto.rapportEvolutifMd).toBe(C.rapport_evolutif_md);
    expect(carto.viewerDataJs).toBe(C.viewer_data_js);
    // artefacts écrits via ctx.artefacts (mêmes octets que les fichiers Python)
    expect(dj(ctx.artefacts.readJson("base/carto_evolutive.json"))).toBe(C.carto_evolutive_json);
    expect(dj(ctx.artefacts.readJson("base/profil_ipsatif.json"))).toBe(C.profil_ipsatif_json);
    expect(ctx.artefacts.readText("base/rapport.md")).toBe(C.rapport_md);
    expect(ctx.artefacts.readText("base/rapport_evolutif.md")).toBe(C.rapport_evolutif_md);
    expect(ctx.artefacts.readText("base/viewer/carto-evolutive-data.js")).toBe(C.viewer_data_js);
    expect(dj(ctx.incidents)).toBe(C.incidents_final);
  });
});
