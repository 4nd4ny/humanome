-- 004 — cartographies (metadata; document JSON only on explicit opt-in) + share links.
-- STRUCTURAL RGPD RULE (cahier §6): no portfolio text column exists anywhere.
-- `document` holds the cartography JSON and stays NULL unless the learner
-- explicitly opted in to server storage (opt_in_at records that decision).

CREATE TABLE cartographies (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    type ENUM('jour','merge') NOT NULL,
    titre VARCHAR(190) NOT NULL,
    visibility ENUM('privee','cartographe','publique') NOT NULL DEFAULT 'privee',
    document JSON NULL DEFAULT NULL,
    opt_in_at DATETIME NULL DEFAULT NULL,
    prompt_version_id INT UNSIGNED NULL DEFAULT NULL,
    referentiel_version_id INT UNSIGNED NULL DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_cartographies_user (user_id),
    KEY idx_cartographies_visibility (visibility),
    CONSTRAINT fk_cartographies_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_cartographies_prompt_version FOREIGN KEY (prompt_version_id)
        REFERENCES prompt_versions (id) ON DELETE SET NULL,
    CONSTRAINT fk_cartographies_referentiel_version FOREIGN KEY (referentiel_version_id)
        REFERENCES referentiel_versions (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Employer sharing (cahier §3.6): explicit individual decision, link + password.
-- Only hashes are stored: the share URL token and its password are never
-- recoverable from the database.
CREATE TABLE share_links (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    cartographie_id INT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NULL DEFAULT NULL,
    revoked_at DATETIME NULL DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_share_links_token_hash (token_hash),
    CONSTRAINT fk_share_links_cartographie FOREIGN KEY (cartographie_id)
        REFERENCES cartographies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
