-- 016 — modèle de compétence ATOMIQUE (correction d'architecture 2026-07-15).
--
-- Chaque compétence devient une ENTITÉ indépendante : éditée, versionnée,
-- gouvernée (vote des membres) et concurrente PAR COMPÉTENCE. Elle porte son
-- IDENTITÉ et son PROTOCOLE de scan (passe_1/2/3) et ses ENRICHISSEMENTS
-- (nourris par les retours humains) — structure des fichiers YAML de référence.
--
-- Migration PUREMENT ADDITIVE : ne modifie ni ne supprime aucune ligne
-- existante. Le document monolithique `referentiel_versions` (003) est
-- CONSERVÉ comme couche de COMPOSITION (snapshot/release assemblé, immuable),
-- ce que les cartographies épinglent pour la reproductibilité et ce que le
-- moteur consomme — INCHANGÉ, aucune parité Twin9 touchée. La gouvernance
-- document (015) reste appelable mais est supersédée par le grain compétence.
--
-- DEUX HASHES QUI NE SE MÉLANGENT JAMAIS :
--  - hash STRUCTUREL du snapshot = ContentHash::compute sur {code,nom,pole}×61
--    + {num,nom,couleur}×7 (INCHANGÉ, parité octet moteur/Twin9) ;
--  - `content_hash` par compétence = hash du contenu RICHE, jeton interne de
--    concurrence optimiste (compare-and-swap) + immutabilité. Le moteur ne
--    consomme jamais ce contenu riche : aucun oracle cross-langage.

-- Versions de compétence (append-only). Les colonnes nom/pole sont
-- STRUCTURELLES (== version publiée, porteuses du hash de snapshot) ; le
-- contenu riche vit dans `content`.
CREATE TABLE competence_versions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    competence_code VARCHAR(8) NOT NULL,
    semver VARCHAR(32) NOT NULL,
    pole TINYINT UNSIGNED NOT NULL,
    nom VARCHAR(190) NOT NULL,
    status ENUM('draft','review','published') NOT NULL DEFAULT 'draft',
    content JSON NOT NULL,
    content_hash CHAR(64) NOT NULL,
    release_note TEXT NULL DEFAULT NULL,
    created_by INT UNSIGNED NULL DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME NULL DEFAULT NULL,
    submitted_at DATETIME NULL DEFAULT NULL,
    submitted_by INT UNSIGNED NULL DEFAULT NULL,
    decidim_url VARCHAR(500) NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_competence_versions (competence_code, semver),
    KEY idx_competence_versions_status (competence_code, status),
    CONSTRAINT fk_competence_versions_created_by FOREIGN KEY (created_by)
        REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_competence_versions_submitted_by FOREIGN KEY (submitted_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Un bulletin par membre et par version de compétence (miroir de
-- referentiel_votes, 015). Le vote/la majorité s'appliquent PAR COMPÉTENCE :
-- une compétence peut être entérinée pendant qu'une autre reste en débat.
CREATE TABLE competence_votes (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    competence_version_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    vote ENUM('pour','contre','abstention') NOT NULL,
    comment TEXT NULL DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_competence_votes (competence_version_id, user_id),
    KEY idx_competence_votes_version (competence_version_id),
    CONSTRAINT fk_competence_votes_version FOREIGN KEY (competence_version_id)
        REFERENCES competence_versions (id) ON DELETE CASCADE,
    CONSTRAINT fk_competence_votes_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lockfile : quelle VERSION de chaque compétence compose un snapshot/release
-- de référentiel (referentiel_versions). La provenance d'une cartographie
-- (carto -> referentiel_version -> lockfile) reste résoluble. RESTRICT : une
-- version de compétence référencée par un snapshot ne peut pas disparaître.
CREATE TABLE referentiel_snapshot_competences (
    snapshot_version_id INT UNSIGNED NOT NULL,
    competence_code VARCHAR(8) NOT NULL,
    competence_version_id INT UNSIGNED NOT NULL,
    content_hash CHAR(64) NOT NULL,
    PRIMARY KEY (snapshot_version_id, competence_code),
    KEY idx_snapshot_competences_cv (competence_version_id),
    CONSTRAINT fk_snapshot_competences_snapshot FOREIGN KEY (snapshot_version_id)
        REFERENCES referentiel_versions (id) ON DELETE CASCADE,
    CONSTRAINT fk_snapshot_competences_cv FOREIGN KEY (competence_version_id)
        REFERENCES competence_versions (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pôles = données de référence légères (7), seedées depuis la version publiée
-- par le script de seed. Sert les contrôles inter-entités au niveau composition
-- (competence.pole doit référencer un pôle existant).
CREATE TABLE referentiel_poles (
    num TINYINT UNSIGNED NOT NULL,
    nom VARCHAR(190) NOT NULL,
    couleur VARCHAR(7) NULL DEFAULT NULL,
    PRIMARY KEY (num)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
