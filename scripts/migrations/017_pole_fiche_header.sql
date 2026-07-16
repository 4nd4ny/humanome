-- 017 — en-tête (préambule markdown) du pôle, pour la SOURCE UNIQUE des fiches
-- de scan (2026-07-16). Le référentiel en base devient la source unique dont
-- Twin6 (P*.md) et Twin9 (setting twin9_fiches) dérivent ; un P*.md se
-- reconstruit BYTE-EXACT par : header + Σ competence.fiche joints par "\n\n" + "\n".
-- L'en-tête de pôle (titre + note « Lecture sémantique » + `---` final) est
-- conservé BRUT (verbatim) — requis pour la parité octet du réassemblage.
ALTER TABLE referentiel_poles
    ADD COLUMN header MEDIUMTEXT NULL DEFAULT NULL AFTER couleur;
