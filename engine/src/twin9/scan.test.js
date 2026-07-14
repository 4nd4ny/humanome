// Tests de parité bit-à-bit de scan.js contre aurora/scan9.py (CPython).
// Vecteurs générés UNE FOIS via python3 (test/twin9-vectors/gen_merge_scan_vectors.py)
// puis GELÉS dans test/twin9-vectors/scan.vec.json — les tests n'exécutent
// JAMAIS python (lecture du blob figé via node:fs, autorisée aux tests).
// Sorties attendues : chaîne json.dumps(..., indent=2) + "\n" (profil write_json,
// comparée à pyJsonDumpsWriteJson). Floats d'entrée marqués {"__f__": x}.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { memArtefacts } from "./artefacts.js";
import { MockBackend } from "./backends.js";
import { fusionner, secondRessort } from "./merge.js";
import { arpenter, cleObs, resoudreJournees, retourAuxSources } from "./scan.js";
import { Pole } from "./referentiel.js";
import { PyFloat, pyJsonDumpsWriteJson } from "./py/pyJson.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const V = JSON.parse(
  readFileSync(join(HERE, "..", "..", "test", "twin9-vectors", "scan.vec.json"), "utf-8"),
);

/** Hydrate un fixture : {"__f__": x} → PyFloat, récursif. */
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

const dj = pyJsonDumpsWriteJson;

function buildPoles(spec) {
  return spec.map((p) => new Pole(p.num, p.header, p.competences));
}

// ── _resoudre_journees : date partagée → PREMIER jour gagne (≠ merge idx_jour) ──
describe("scan.resoudreJournees — parité CPython (date partagée : premier gagne)", () => {
  it("résolution ordre des réfs + dédup + date partagée", () => {
    const r = V.resoudre_journees;
    const out = resoudreJournees(r.refs, /** @type {object[]} */ (pyf(r.jours)));
    expect(dj(out.map((j) => j.id))).toBe(r.out);
  });
});

// ── _cle_obs ─────────────────────────────────────────────────────────────────
describe("scan.cleObs — parité CPython", () => {
  for (let i = 0; i < V.cle_obs.length; i++) {
    it(`cas ${i}`, () => {
      const c = V.cle_obs[i];
      expect(dj(cleObs(pyf(c.o)))).toBe(c.out);
    });
  }
});

// ── _retour_aux_sources : découpage en lots par POINTS DE CODE + ancrage ────
describe("scan.retourAuxSources — parité CPython (lots, ancrage, rejets)", () => {
  it("3 lots, 1 ancre, hallucination rejetée", async () => {
    const r = V.retour_lots;
    const ctx = {
      config: pyf(r.config),
      poles: buildPoles(r.poles),
      incidents: {},
    };
    const backend = new MockBackend({ salt: r.salt, model: "mock-lourd" });
    const [ancres, issues] = await retourAuxSources(
      ctx,
      /** @type {object} */ (pyf(r.obs)),
      "hors-referentiel",
      /** @type {object[]} */ (pyf(r.jours)),
      backend,
      "hors01",
    );
    expect(dj(ancres)).toBe(r.ancres);
    expect(dj(issues)).toBe(r.issues);
    expect(dj(ctx.incidents)).toBe(r.incidents);
    expect(dj(ctx.ancrage_stats)).toBe(r.ancrage_stats);
  });
});

// ── Reprise : chose vue (scan) + chose jugée (second ressort) au 2e run ──────
describe("scan — reprise 2e run : chose vue + chose jugée (parité CPython)", () => {
  it("run1 puis run2 (état persistant partagé) : condensés repris, passe non rejouée", async () => {
    const R = V.reprise;
    const etatScan = {};
    const etatFaisceaux = {};
    const backend = new MockBackend({ salt: R.salt, model: "mock-lourd" });

    const mkCtx = () => ({
      config: pyf(R.config),
      poles: buildPoles(R.poles),
      base_dir: "base",
      journal_id: R.journal_id,
      date: R.date,
      incidents: {},
      textes_journees: new Map(Object.entries(R.textes)),
      etat_scan: etatScan,
      etat_faisceaux: etatFaisceaux,
      rapide: null,
      artefacts: memArtefacts(),
    });

    // run 1 : amorce l'état persistant (condensés, arpentage, chose jugée)
    const ctx1 = mkCtx();
    const comps1 = fusionner(ctx1, /** @type {object[]} */ (pyf(R.cartos)));
    await arpenter(ctx1, /** @type {object[]} */ (pyf(R.cartos)), comps1, backend);
    await secondRessort(ctx1, /** @type {object[]} */ (pyf(R.cartos)), comps1, backend);

    // run 2 : MÊME état, dossier inchangé → chose vue / chose jugée
    const ctx2 = mkCtx();
    const cartos2 = /** @type {object[]} */ (pyf(R.cartos));
    const comps2 = fusionner(ctx2, cartos2);
    const resume2 = await arpenter(ctx2, cartos2, comps2, backend);
    const sr2 = await secondRessort(ctx2, cartos2, comps2, backend);

    expect(dj(resume2)).toBe(R.run2_scan_resume);
    expect(dj(ctx2.artefacts.readJson("base/scan_global.json"))).toBe(R.run2_scan_global_json);
    expect(dj(ctx2.incidents)).toBe(R.run2_incidents);
    expect(dj(comps2)).toBe(R.run2_comps);
    expect(dj(sr2)).toBe(R.run2_sr_out);
    expect(dj(etatFaisceaux)).toBe(R.run2_etat_faisceaux);
  });
});
