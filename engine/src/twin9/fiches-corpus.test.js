// SOURCE UNIQUE des fiches (exigence 2026-07-16) : « une solution qui évite
// d'avoir à maintenir plusieurs versions du référentiel » — le corpus committé
// scripts/data/fiches-v7.json est LA matière de competence.content.fiche, et
// les P*.md Twin6 s'en régénèrent BYTE-EXACTEMENT (règle b). Ce test rend
// EXÉCUTABLE EN SUITE la preuve jusqu'ici confinée aux scripts manuels
// (extract-fiches.mjs / generate-fiches.mjs --verify) : round-trip corpus ↔
// P*.md via les VRAIES fonctions de prod (reassembleFiche + parsePole), plus
// les invariants du corpus et le verrou d'ordre partagé JS/PHP.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePole } from "./referentiel.js";
// La règle (b) de PROD, celle que generate-fiches.mjs (prebuild web) applique.
import { reassembleFiche } from "../../../scripts/extract-fiches.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const corpus = JSON.parse(
  readFileSync(`${repoRoot}/scripts/data/fiches-v7.json`, "utf8"),
);
const allCodes = Object.keys(corpus.fiches);

/** Codes d'un pôle, triés lexicographiquement (l'ordre partagé generate-fiches/FicheGenerator). */
function codesForPole(n) {
  return allCodes.filter((c) => c.startsWith(`${n}.`)).sort();
}

describe("fiches-corpus — round-trip corpus committé ↔ P*.md (règle b inversible)", () => {
  for (let n = 1; n <= 7; n += 1) {
    it(`P${n}.md : reassembleFiche(corpus) puis parsePole retrouve header et fiches byte-identiques`, () => {
      const header = corpus.poleHeaders[String(n)];
      expect(header, `en-tête du pôle ${n} présent dans le corpus`).toBeTypeOf("string");

      const codes = codesForPole(n);
      // Régénération EXACTE du prebuild web (generate-fiches.mjs).
      const rebuilt = reassembleFiche(
        header,
        codes.map((code) => ({ fiche_md: corpus.fiches[code] })),
      );

      // Inverse : le vrai parseur du moteur retrouve chaque morceau VERBATIM.
      const pole = parsePole(rebuilt, n);
      expect(pole.header).toBe(header);
      expect(pole.competences.map((c) => c.code)).toEqual(codes);
      for (const c of pole.competences) {
        expect(c.fiche_md, `fiche ${c.code} byte-identique au corpus`).toBe(
          corpus.fiches[c.code],
        );
      }

      // Et le réassemblage des morceaux re-parsés redonne le P*.md à l'octet.
      expect(reassembleFiche(pole.header, pole.competences)).toBe(rebuilt);
    });
  }
});

describe("fiches-corpus — invariants du corpus (source unique)", () => {
  it("7 en-têtes de pôle, chacun ouvrant sur « # Pôle n — » et fermé par le séparateur ---", () => {
    expect(Object.keys(corpus.poleHeaders).sort()).toEqual([
      "1", "2", "3", "4", "5", "6", "7",
    ]);
    for (let n = 1; n <= 7; n += 1) {
      const header = corpus.poleHeaders[String(n)];
      expect(header.startsWith(`# Pôle ${n} — `), `titre du pôle ${n}`).toBe(true);
      // L'en-tête BRUT porte déjà son séparateur final (requis parité octet, règle b).
      expect(header.endsWith("\n\n---\n\n"), `séparateur final du header ${n}`).toBe(true);
    }
  });

  it("61 codes uniques, au format X.YY, chacun rattaché à un pôle 1..7 existant", () => {
    expect(allCodes.length).toBe(61);
    expect(new Set(allCodes).size).toBe(61);
    for (const code of allCodes) {
      expect(code, `format du code ${code}`).toMatch(/^\d\.\d{2}$/);
      const pole = code[0];
      expect(
        corpus.poleHeaders[pole],
        `le code ${code} référence un pôle connu`,
      ).toBeTypeOf("string");
    }
    // Chaque pôle a au moins une fiche (aucun P*.md vide ne se régénère).
    for (let n = 1; n <= 7; n += 1) {
      expect(codesForPole(n).length, `pôle ${n} non vide`).toBeGreaterThan(0);
    }
  });

  it("chaque fiche commence par sa section « ## code — » ; seules les non-dernières portent le --- final", () => {
    for (let n = 1; n <= 7; n += 1) {
      const codes = codesForPole(n);
      codes.forEach((code, i) => {
        const fiche = corpus.fiches[code];
        expect(fiche.startsWith(`## ${code} — `), `section de ${code}`).toBe(true);
        if (i < codes.length - 1) {
          // Séparateur POSITION-DÉPENDANT (règle b) : porté par la fiche elle-même.
          expect(fiche.endsWith("\n\n---"), `séparateur final de ${code}`).toBe(true);
        } else {
          expect(fiche.endsWith("---"), `pas de séparateur sur la dernière fiche ${code}`).toBe(false);
        }
      });
    }
  });
});

describe("fiches-corpus — parité d'ordre JS/PHP (tri des codes zéro-paddés)", () => {
  it("le tri lexicographique JS reproduit l'ordre ksort PHP attendu sur des codes zéro-paddés", () => {
    // Vecteur piégeux : sans zéro-padding, « 1.10 » passerait avant « 1.2 ».
    // Avec le format X.YY imposé, tri lexicographique JS == ksort PHP
    // (comparaison numérique des clés « 1.01 »… : 1.01 < 1.02 < … < 1.10).
    const shuffled = ["1.10", "7.08", "1.02", "1.11", "1.01", "2.09", "1.09"];
    expect([...shuffled].sort()).toEqual([
      "1.01", "1.02", "1.09", "1.10", "1.11", "2.09", "7.08",
    ]);
  });

  it("le corpus committé est DÉJÀ dans l'ordre partagé (byte-stabilité du dump)", () => {
    // dump-fiches.mjs réécrit le fichier dans l'ordre servi par FicheGenerator
    // (poles ksort, codes ksort) : le fichier committé doit déjà être dans cet
    // ordre, sinon dump ≠ extract (divergence d'octets au premier re-dump).
    expect([...allCodes].sort()).toEqual(allCodes);
    expect(Object.keys(corpus.poleHeaders)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });
});
