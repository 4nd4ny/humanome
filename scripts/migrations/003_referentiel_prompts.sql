-- 003 — versioned referential (cahier §4.1) and versioned prompt system (§3.4).
-- A published version is IMMUTABLE (application-level invariant, P4/P10):
-- cartographies reference the exact versions used at run time.

CREATE TABLE referentiel_versions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    referentiel_id VARCHAR(64) NOT NULL,
    semver VARCHAR(32) NOT NULL,
    label VARCHAR(190) NOT NULL,
    status ENUM('draft','review','published') NOT NULL DEFAULT 'draft',
    content JSON NOT NULL,
    content_hash CHAR(64) NOT NULL,
    release_note TEXT NULL,
    created_by INT UNSIGNED NULL DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_referentiel_versions (referentiel_id, semver),
    KEY idx_referentiel_versions_status (referentiel_id, status),
    CONSTRAINT fk_referentiel_versions_created_by FOREIGN KEY (created_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE prompt_packages (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    slug VARCHAR(120) NOT NULL,
    description TEXT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_prompt_packages_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE prompt_versions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    package_id INT UNSIGNED NOT NULL,
    semver VARCHAR(32) NOT NULL,
    status ENUM('draft','published') NOT NULL DEFAULT 'draft',
    content JSON NOT NULL,
    changelog TEXT NULL,
    created_by INT UNSIGNED NULL DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_prompt_versions (package_id, semver),
    CONSTRAINT fk_prompt_versions_package FOREIGN KEY (package_id)
        REFERENCES prompt_packages (id) ON DELETE CASCADE,
    CONSTRAINT fk_prompt_versions_created_by FOREIGN KEY (created_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
