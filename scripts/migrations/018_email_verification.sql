-- 018 — Vérification d'email à l'inscription (D5 / AD-D3).
--
-- Un compte n'est ACTIVÉ qu'après confirmation d'un code à 4 chiffres envoyé
-- par email (email_verified_at IS NULL = non activé). Le code est HASHÉ en base
-- (jamais en clair), expire (verification_expires_at), et le nombre d'essais est
-- borné (verification_attempts, max 5 ; remis à 0 à chaque renvoi de code).
--
-- RGPD : la vérification d'email est un nouveau traitement (docs/rgpd-registre.md).
-- La purge de compte reste une cascade sur users (ces colonnes partent avec la ligne).
--
-- COMPATIBILITÉ : les comptes EXISTANTS (dont ceux en prod) sont réputés vérifiés
-- (backfill email_verified_at = created_at) — l'exigence ne s'applique qu'aux
-- nouvelles inscriptions.

ALTER TABLE users
    ADD COLUMN email_verified_at DATETIME NULL DEFAULT NULL AFTER display_name,
    ADD COLUMN verification_code_hash VARCHAR(255) NULL DEFAULT NULL AFTER email_verified_at,
    ADD COLUMN verification_expires_at DATETIME NULL DEFAULT NULL AFTER verification_code_hash,
    ADD COLUMN verification_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER verification_expires_at;

-- Backfill : tous les comptes déjà créés sont réputés vérifiés.
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

-- Index : requêtes admin « comptes non vérifiés » et cohérence de lecture.
CREATE INDEX idx_users_email_verified ON users (email_verified_at);
