-- 007 — P8: run metadata on cartographies.
--
-- The M6 API contract stores, alongside the opted-in document, the metadata
-- of the run that produced it (provider label, model, dates, costs estimate…)
-- so an exported/reimported cartography stays reproducible. Counters and
-- identifiers only — NEVER portfolio or cartography text (cahier §6.5);
-- the document itself already lives in `document` under the same opt-in.
--
-- The exact prompt package / referentiel versions keep using the FK columns
-- of migration 004 (prompt_version_id, referentiel_version_id).

ALTER TABLE cartographies
    ADD COLUMN run_meta JSON NULL DEFAULT NULL AFTER referentiel_version_id;
