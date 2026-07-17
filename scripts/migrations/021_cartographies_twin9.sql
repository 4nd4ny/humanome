-- 021 — cartographies.type gains 'twin9' (D12).
-- A Twin9 deep-analysis result (carto_evolutive.json, the NATIVE engine output)
-- becomes storable server-side under the SAME RGPD opt-in contract as the
-- other cartographies: the POST itself is the dated opt-in (opt_in_at), the
-- learner can withdraw the copy at any time, and nothing is ever stored
-- without that explicit call (the Twin9 run itself remains stateless).
-- The viewer re-derives the sunburst from the stored native document.

ALTER TABLE cartographies
    MODIFY type ENUM('jour','merge','twin9') NOT NULL;
