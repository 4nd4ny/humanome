// CONTRAT DES APPELS (ADR-010) — le test que la parité mock ne PEUT pas faire.
//
// En production, le serveur rend les gabarits ; le moteur ne fait que LUI
// transmettre, à CHAQUE appel, le CHEMIN du gabarit + les VARIABLES d'état de
// run. Ce test pilote executerTwin9 en mock avec un backend ENREGISTREUR,
// capture (gabarit, noms de variables fournies) par appel, et vérifie que
// pour chaque {$VAR} du gabarit réel :
//   - soit le moteur la fournit (variable d'état de run),
//   - soit le serveur l'injecte (fiche confidentielle : COMPETENCE_FICHE,
//     POLE_FICHES) — auquel cas le moteur DOIT fournir la clé de lookup
//     (CODE pour COMPETENCE_FICHE ; POLE_NUM + POLE_FICHES_ORDRE pour POLE_FICHES).
//
// Le contrat des variables (noms seulement, NON secret — ADR-010 §2 résiduel)
// est figé dans protocole-contrat.json. Le référentiel + le portfolio viennent
// des oracles (gitignorés) : le test se SAUTE proprement s'ils sont absents.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { executerTwin9 } from "./index.js";
import { makeBackend as defaultMakeBackend } from "./backends.js";
import contrat from "./protocole-contrat.json" assert { type: "json" };

const HERE = dirname(fileURLToPath(import.meta.url));
const ORA = join(HERE, "..", "..", "test", "twin9-oracles");
const dispo = existsSync(join(ORA, "referentiel.json")) && existsSync(join(ORA, "plant01", "portfolio.md"));
const lire = (p) => readFileSync(join(ORA, p), "utf8");

const INJECTEES = new Set(contrat.injectees_serveur);

describe.skipIf(!dispo)("Twin_v9 — contrat des appels (variables ⊆ fournies ∪ injectées serveur)", () => {
  it("chaque gabarit reçoit toutes ses variables (aucune fiche vide envoyée)", async () => {
    const referentiel = JSON.parse(lire("referentiel.json"));
    const config = JSON.parse(lire("config.json"));
    const roster = JSON.parse(lire("models.json"));
    const portfolio = lire(join("plant01", "portfolio.md"));

    const appels = [];
    function fabriqueEnregistreuse(spec) {
      const inner = defaultMakeBackend(spec); // spec.kind === 'mock' (forcé par le moteur)
      return {
        records: inner.records,
        async call(prompt, opts = {}) {
          appels.push({
            gabarit: opts.gabarit ?? null,
            vars: new Set(Object.keys(opts.variables ?? {})),
          });
          return inner.call(prompt, opts);
        },
      };
    }

    await executerTwin9({
      portfolioTexte: portfolio,
      nomJournal: "contrat.md",
      referentiel,
      roster,
      config,
      backends: fabriqueEnregistreuse,
      mock: true,
      salt: "contrat-1",
      etat: null,
      // exerce tout le pipeline : tagging, greffier, juge léger, tribunal,
      // second ressort, scan global, relectures.
      options: { scanGlobal: true },
      nowIso: "2026-01-01T00:00:00",
    });

    expect(appels.length).toBeGreaterThan(50);

    const gabaritsVus = new Set();
    const manques = [];
    for (const { gabarit, vars } of appels) {
      // 1. le gabarit doit être identifié (le bug : gabarit=null).
      if (!gabarit) {
        manques.push("appel SANS gabarit (le serveur ne saurait pas quoi rendre)");
        continue;
      }
      // Le moteur porte le chemin de fichier (.md) ; en base les gabarits sont
      // nommés sans .md (le front le retire aussi avant l'envoi au serveur).
      const rel = gabarit.replace(/\.md$/, "");
      const attendues = contrat.gabarits[rel];
      if (!attendues) {
        manques.push(`gabarit inconnu du contrat : ${rel}`);
        continue;
      }
      gabaritsVus.add(rel);
      for (const v of attendues) {
        if (vars.has(v)) continue;
        if (INJECTEES.has(v)) {
          // le serveur injectera la fiche — le moteur doit fournir la CLÉ.
          if (v === "COMPETENCE_FICHE" && !vars.has("CODE")) {
            manques.push(`${gabarit} : COMPETENCE_FICHE injectable mais CODE manquant`);
          }
          if (v === "POLE_FICHES" && !(vars.has("POLE_NUM") && vars.has("POLE_FICHES_ORDRE"))) {
            manques.push(`${gabarit} : POLE_FICHES injectable mais POLE_NUM/POLE_FICHES_ORDRE manquant`);
          }
          continue;
        }
        manques.push(`${gabarit} : variable NON fournie et non injectable → « ${v} »`);
      }
    }

    expect(manques, `Manques de contrat :\n  ${[...new Set(manques)].join("\n  ")}`).toEqual([]);
    // Couverture : les étapes clés ont bien été exercées.
    for (const cle of ["tagger/1-tag-pole", "lourd/20-greffier", "lourd/20b-juge-leger"]) {
      expect(gabaritsVus, `étape non exercée : ${cle}`).toContain(cle);
    }
  });
});
