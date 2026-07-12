-- 008 — M7 (P9+P10): cartographe workspace + platform settings.
--
-- P9 (cahier §3.3, §8): the cartographe is the MANDATORY human safeguard —
-- a cartography is never presented as validated without a human signature.
-- Tables: invitation codes (learner invites a cartographe), learner<->
-- cartographe links, per-competence annotations, schema-validated revisions,
-- and the garantie (dated signature, frozen revision).
-- P10: `settings` (key/value) hosts the default prompt-package pointer.
--
-- RGPD purge coherence (cahier §6.3) — who owns what:
--   * invitation: belongs to the learner (CASCADE); the accepting
--     cartographe is anonymized on their own purge (SET NULL).
--   * link: exists only while BOTH accounts exist (CASCADE both ways).
--   * annotation: the author's own expression -> purged with the author,
--     and with the annotated cartography (CASCADE both).
--   * revision: a corrected version of the LEARNER's cartography — it is
--     learner data, so it survives the author's purge anonymized
--     (author_id SET NULL) and dies with the cartography (CASCADE).
--   * garantie: the cartographe's personal signature (frozen display name)
--     -> purged with the cartographe, the cartography, or the revision it
--     freezes (CASCADE all three). No content beyond ids and the name.

CREATE TABLE cartographe_invitations (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    apprenant_id INT UNSIGNED NOT NULL,
    code CHAR(10) NOT NULL, -- alphabet A-Z2-9, generated server-side
    expires_at DATETIME NOT NULL, -- creation + 30 days (M7 contract)
    accepted_at DATETIME NULL DEFAULT NULL,
    accepted_by INT UNSIGNED NULL DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cartographe_invitations_code (code),
    KEY idx_cartographe_invitations_apprenant (apprenant_id),
    CONSTRAINT fk_cartographe_invitations_apprenant FOREIGN KEY (apprenant_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_cartographe_invitations_accepted_by FOREIGN KEY (accepted_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cartographe_links (
    apprenant_id INT UNSIGNED NOT NULL,
    cartographe_id INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (apprenant_id, cartographe_id),
    KEY idx_cartographe_links_cartographe (cartographe_id),
    CONSTRAINT fk_cartographe_links_apprenant FOREIGN KEY (apprenant_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_cartographe_links_cartographe FOREIGN KEY (cartographe_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cartography_annotations (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    cartographie_id INT UNSIGNED NOT NULL,
    author_id INT UNSIGNED NOT NULL,
    competence_code VARCHAR(8) NOT NULL, -- referentiel code, e.g. "1.01"
    type ENUM('commentaire','hallucination','oubli') NOT NULL,
    texte TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_cartography_annotations_cartographie (cartographie_id),
    KEY idx_cartography_annotations_author (author_id),
    CONSTRAINT fk_cartography_annotations_cartographie FOREIGN KEY (cartographie_id)
        REFERENCES cartographies (id) ON DELETE CASCADE,
    CONSTRAINT fk_cartography_annotations_author FOREIGN KEY (author_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cartography_revisions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    cartographie_id INT UNSIGNED NOT NULL,
    author_id INT UNSIGNED NULL DEFAULT NULL, -- SET NULL: anonymized on author purge
    document JSON NOT NULL, -- validated against schemas/<kind> at POST time
    note VARCHAR(500) NULL DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_cartography_revisions_cartographie (cartographie_id),
    KEY idx_cartography_revisions_author (author_id),
    CONSTRAINT fk_cartography_revisions_cartographie FOREIGN KEY (cartographie_id)
        REFERENCES cartographies (id) ON DELETE CASCADE,
    CONSTRAINT fk_cartography_revisions_author FOREIGN KEY (author_id)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One garantie per cartography (UNIQUE): the dated human signature of the
-- LINKED cartographe. `par` freezes the display name at signature time;
-- `revision_id` freezes WHICH document is guaranteed (cahier §8: a modified
-- cartography is never presented as guaranteed — posting a new revision
-- removes the garantie, application-level rule).
CREATE TABLE cartography_garanties (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    cartographie_id INT UNSIGNED NOT NULL,
    cartographe_id INT UNSIGNED NOT NULL,
    revision_id INT UNSIGNED NULL DEFAULT NULL, -- NULL = the base document
    par VARCHAR(190) NOT NULL, -- display name frozen at signature time
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cartography_garanties_cartographie (cartographie_id),
    KEY idx_cartography_garanties_cartographe (cartographe_id),
    CONSTRAINT fk_cartography_garanties_cartographie FOREIGN KEY (cartographie_id)
        REFERENCES cartographies (id) ON DELETE CASCADE,
    CONSTRAINT fk_cartography_garanties_cartographe FOREIGN KEY (cartographe_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_cartography_garanties_revision FOREIGN KEY (revision_id)
        REFERENCES cartography_revisions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- P10: small key/value platform settings (e.g. default_prompt_package).
-- Values are tiny structured facts (ids, versions) — never user content.
CREATE TABLE settings (
    name VARCHAR(64) NOT NULL,
    value JSON NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
