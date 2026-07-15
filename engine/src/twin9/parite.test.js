// PORTE DE PARITÉ de l'orchestrateur Twin9 (index.js) contre les oracles
// mock CPython (engine/test/twin9-oracles/, ADR-010, gitignoré). Chaque oracle
// est un run `twin9.py --mock --sans-etat --salt <sel>` FIGÉ : pour chacun on
// rejoue executerTwin9 en mock avec le MÊME sel et les MÊMES options, puis on
// compare BIT-À-BIT carto_evolutive.json et profil_ipsatif.json, et par comptes
// structurel.json (appels par étape, statuts, tribunaux siégés…).
//
// Lecture des fixtures via node:fs : AUTORISÉE aux tests (les modules livrés,
// eux, n'ont ni fs ni DOM). Les tests n'exécutent JAMAIS python — les oracles
// sont pré-générés (scripts/twin9/gen-oracles.sh) et committés (hors dépôt).
// Si le dossier d'oracles manque, la suite se SAUTE proprement.
//
// CHAMPS VOLATILS documentés (spec-index §4 piège #10), neutralisés avant la
// comparaison profonde :
//   - `date` (RACINE) : date de RUN (datetime.date.today()). NEUTRALISÉE ici,
//     mais aussi INJECTÉE (nowIso = date de l'oracle) → elle coïncide déjà, la
//     neutralisation n'est qu'un filet. Les dates de JOURNÉE imbriquées
//     (attestations) viennent du portfolio : déterministes, JAMAIS neutralisées.
//   - `marque_run` = empreinte(base_dir)[:6] et `horodatage`/`calque_id` (ISO
//     de datetime.now()) : irreproductibles. ABSENTS des sorties en --sans-etat
//     (les calques ne sont pas versés dans la carte fusionnée) — neutralisation
//     purement défensive pour d'éventuels oracles futurs avec état.
//
// La comparaison profonde AFFICHE le premier chemin JSON divergent en cas
// d'échec ; un second garde-fou vérifie l'égalité OCTET À OCTET stricte.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { executerTwin9 } from "./index.js";
import { deepCopyPy } from "./artefacts.js";
import { pyJsonDumpsWriteJson } from "./py/pyJson.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ORA = join(HERE, "..", "..", "test", "twin9-oracles");

// Description de chaque oracle : dossier, nom de journal (→ journal_id via
// split_portfolio), sel de run (cf. gen-oracles.sh) et options CLI équivalentes.
const ORACLES = [
  { dir: "plant01", nom: "PLANT-01.md", salt: "parite-1", options: {} },
  { dir: "plant01-sans-contre-lecture", nom: "PLANT-01.md", salt: "parite-1", options: { sansContreLecture: true } },
  { dir: "plant01-jury-aleatoire", nom: "PLANT-01.md", salt: "parite-1", options: { juryMode: "aleatoire", juryTaille: 3 } },
  { dir: "plant01-scan-global", nom: "PLANT-01.md", salt: "parite-1", options: { scanGlobal: true } },
  { dir: "synth01", nom: "SYNTH-01.md", salt: "parite-2", options: {} },
  { dir: "synth06", nom: "SYNTH-06.md", salt: "parite-3", options: {} },
];

const VOLATILE_KEYS = new Set(["marque_run", "horodatage", "calque_id"]);

/** Neutralise les champs volatils : `date` RACINE + {marque_run, horodatage,
 *  calque_id} à toute profondeur. Les `date` imbriqués restent (déterministes). */
function neutralize(v, top = true) {
  if (Array.isArray(v)) return v.map((x) => neutralize(x, false));
  if (v && typeof v === "object") {
    /** @type {Record<string, unknown>} */
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if (VOLATILE_KEYS.has(k)) o[k] = "⟨volatil⟩";
      else if (top && k === "date") o[k] = "⟨date-run⟩";
      else o[k] = neutralize(x, false);
    }
    return o;
  }
  return v;
}

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/** Premier chemin JSON divergent entre deux valeurs parsées (ordre des clés
 *  d'objet compris — bit-à-bit), ou null. */
function firstDivergentPath(a, b, path = "$") {
  if (a === b) return null;
  const ta = typeOf(a);
  const tb = typeOf(b);
  if (ta !== tb) return `${path} (type ${ta} ≠ ${tb})`;
  if (ta === "array") {
    if (a.length !== b.length) return `${path} (longueur ${a.length} ≠ ${b.length})`;
    for (let i = 0; i < a.length; i++) {
      const p = firstDivergentPath(a[i], b[i], `${path}[${i}]`);
      if (p) return p;
    }
    return null;
  }
  if (ta === "object") {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    const n = Math.max(ka.length, kb.length);
    for (let i = 0; i < n; i++) {
      if (ka[i] !== kb[i]) {
        return `${path} (clé #${i} : ${JSON.stringify(ka[i] ?? null)} ≠ ${JSON.stringify(kb[i] ?? null)})`;
      }
      const p = firstDivergentPath(a[ka[i]], b[kb[i]], `${path}.${ka[i]}`);
      if (p) return p;
    }
    return null;
  }
  return `${path} (${JSON.stringify(a)} ≠ ${JSON.stringify(b)})`;
}

/**
 * Compare une sortie JSON (objet du moteur) à un oracle (texte brut du fichier
 * Python write_json). D'abord le premier chemin divergent (diagnostic profond,
 * neutralisé) ; puis l'égalité OCTET À OCTET stricte (bit-à-bit).
 */
function comparerJson(nom, objJs, texteOracle) {
  const jsStr = pyJsonDumpsWriteJson(objJs);
  const pyParsed = JSON.parse(texteOracle);
  const jsParsed = JSON.parse(jsStr);
  const path = firstDivergentPath(neutralize(pyParsed), neutralize(jsParsed));
  expect(path, path ? `${nom} : divergence profonde @ ${path}` : undefined).toBeNull();
  // garde-fou bit-à-bit (la date est injectée, les volatils absents en --sans-etat)
  expect(jsStr === texteOracle, `${nom} : divergence OCTET À OCTET (contenu profond identique)`).toBe(true);
}

const oraclesPresents = existsSync(ORA);

describe.skipIf(!oraclesPresents)("Twin9 — porte de parité orchestrateur (mock CPython)", () => {
  // Entrées communes (contrat d'entrée committé à la racine des oracles).
  const config = oraclesPresents ? JSON.parse(readFileSync(join(ORA, "config.json"), "utf-8")) : null;
  const models = oraclesPresents ? JSON.parse(readFileSync(join(ORA, "models.json"), "utf-8")) : null;
  const referentiel = oraclesPresents ? JSON.parse(readFileSync(join(ORA, "referentiel.json"), "utf-8")) : null;

  for (const ora of ORACLES) {
    const dir = join(ORA, ora.dir);
    const present = oraclesPresents && existsSync(join(dir, "carto_evolutive.json"));
    it.skipIf(!present)(`${ora.dir} — carto_evolutive + profil_ipsatif (bit-à-bit) + structurel`, async () => {
      const portfolioTexte = readFileSync(join(dir, "portfolio.md"), "utf-8");
      const cartoOracleTxt = readFileSync(join(dir, "carto_evolutive.json"), "utf-8");
      const profilOracleTxt = readFileSync(join(dir, "profil_ipsatif.json"), "utf-8");
      const structurel = JSON.parse(readFileSync(join(dir, "structurel.json"), "utf-8"));
      // date de RUN de l'oracle → injectée (neutralise datetime.date.today())
      const dateRun = JSON.parse(cartoOracleTxt).date;

      const result = await executerTwin9({
        portfolioTexte,
        nomJournal: ora.nom,
        referentiel,
        // fixtures re-parsées à chaque run : aucune contamination inter-oracles
        roster: JSON.parse(JSON.stringify(models)),
        config: JSON.parse(JSON.stringify(config)),
        mock: true,
        etat: null, // --sans-etat
        salt: ora.salt,
        options: ora.options,
        nowIso: `${dateRun}T00:00:00`,
      });

      // 1. carto_evolutive.json — bit-à-bit
      comparerJson("carto_evolutive", result.cartoEvolutive, cartoOracleTxt);
      // 2. profil_ipsatif.json — bit-à-bit (arrondi ipsatif intermédiaire compris)
      comparerJson("profil_ipsatif", result.profilIpsatif, profilOracleTxt);

      // 3. structurel.json — comptes d'appels par étape, statuts, jury…
      //    (toEqual : insensible à l'ordre des clés d'objet, comme sort_keys)
      const structJs = {
        appels_llm: result.metrics.appels_llm,
        jury_mode: result.metrics.jury_mode,
        n_journees: result.metrics.n_journees,
        par_etape_appels: Object.fromEntries(
          Object.entries(result.metrics.par_etape).map(([k, v]) => [k, v.appels]),
        ),
        roster: result.metrics.roster,
        statuts_finaux: Object.fromEntries(result.statuts),
        tribunaux_sieges: result.metrics.tribunaux_sieges,
      };
      expect(structJs).toEqual(structurel);
    }, 120000);
  }

  // État persistant (contrat §9.2 §10) : les oracles sont tous --sans-etat, mais
  // le contrat nomme « reprises par empreinte » et « carte additive ». On le
  // couvre par un invariant d'auto-cohérence (pas besoin d'oracle) : un 2e run
  // sur un portfolio INCHANGÉ reprend TOUTES les journées par empreinte et
  // reproduit la sortie à l'octet. La frontière de persistance (l'hôte sérialise
  // l'état puis le recharge) est simulée par deepCopyPy entre les deux runs.
  const p01 = join(ORA, "plant01");
  it.skipIf(!(oraclesPresents && existsSync(join(p01, "carto_evolutive.json"))))(
    "état persistant : 2e run inchangé → toutes journées reprises, sortie bit-à-bit stable",
    async () => {
      const cartoOracleTxt = readFileSync(join(p01, "carto_evolutive.json"), "utf-8");
      const commun = () => ({
        portfolioTexte: readFileSync(join(p01, "portfolio.md"), "utf-8"),
        nomJournal: "PLANT-01.md",
        referentiel,
        roster: JSON.parse(JSON.stringify(models)),
        config: JSON.parse(JSON.stringify(config)),
        mock: true,
        salt: "parite-1",
        options: {},
        nowIso: `${JSON.parse(cartoOracleTxt).date}T00:00:00`,
      });

      const runA = await executerTwin9({ ...commun(), etat: {} });
      const aStr = pyJsonDumpsWriteJson(runA.cartoEvolutive);
      expect(runA.metrics.n_journees_reprises_etat).toBe(0); // 1er run : rien à reprendre
      // un run AVEC état ({}) reste bit-à-bit avec l'oracle --sans-etat
      expect(aStr === cartoOracleTxt).toBe(true);

      const runB = await executerTwin9({ ...commun(), etat: deepCopyPy(runA.etat) });
      // toutes les journées sont reprises (chose vue / chose jugée)
      expect(runB.metrics.n_journees_reprises_etat).toBe(runB.metrics.n_journees);
      // et la carte fusionnée est identique à l'octet
      expect(pyJsonDumpsWriteJson(runB.cartoEvolutive) === aStr).toBe(true);
    },
    120000,
  );
});

// Garde-fou méta : si le dossier d'oracles existe mais qu'AUCUN oracle attendu
// n'y figure, c'est probablement une régression de génération — on le signale.
describe.skipIf(!oraclesPresents)("Twin9 — oracles présents", () => {
  it("au moins un oracle de parité est disponible", () => {
    const dirs = readdirSync(ORA, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    expect(dirs.some((d) => ORACLES.some((o) => o.dir === d))).toBe(true);
  });
});
