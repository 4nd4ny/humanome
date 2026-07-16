-- 019 — Avatar de profil (D6 / AD-D4).
--
-- L'avatar est stocké EN BASE (MEDIUMBLOB + mime), pas en FTP : pas
-- d'arborescence de fichiers à gérer, purge RGPD gratuite par la ligne `users`
-- (cascade). Redimensionné côté client (~256 px, ≤ 200 Ko) ; le serveur VALIDE
-- le magic number et la taille avant stockage.
--
-- RGPD : la photo est une donnée personnelle — mention au registre
-- (docs/rgpd-registre.md) ; suppression avec le compte (colonnes de `users`,
-- purge en cascade) ET suppression indépendante depuis le profil (DELETE avatar).

ALTER TABLE users
    ADD COLUMN avatar MEDIUMBLOB NULL DEFAULT NULL,
    ADD COLUMN avatar_mime VARCHAR(32) NULL DEFAULT NULL;
