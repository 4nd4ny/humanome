-- 022 — Interface ultime de cartographie, P6 (spécification §12) : version
-- partagée d'une cartographie, RÉSERVÉE AUX ADULTES.
--
-- 1. cartographies.type gagne 'partage' : un INSTANTANÉ FIGÉ choisi par
--    l'apprenant (compétences retenues, dates à la précision choisie, extraits
--    choisis), validé côté serveur par liste blanche de champs — jamais le
--    portfolio, jamais le master complet. Même contrat d'opt-in daté que les
--    autres types (le POST est l'opt-in, opt_in_at), retrait à tout moment.
-- 2. share_links.password_hash devient facultatif : le mot de passe d'un lien
--    vers une version partagée est optionnel (§12.1) ; les autres types
--    gardent un mot de passe obligatoire (contrôle dans share.php).
-- 3. users.adult_attested_at : auto-attestation de majorité (§12.1, « pas de
--    contrôle d'âge, mais une auto-certification ») ; NULL = pas d'attestation
--    = local uniquement. Retirer l'attestation révoque les liens actifs des
--    versions partagées.

ALTER TABLE cartographies
    MODIFY type ENUM('jour','merge','twin9','partage') NOT NULL;

ALTER TABLE share_links
    MODIFY password_hash VARCHAR(255) NULL DEFAULT NULL;

ALTER TABLE users
    ADD COLUMN adult_attested_at DATETIME NULL DEFAULT NULL;
