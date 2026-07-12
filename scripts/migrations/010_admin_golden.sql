-- 010 — M9 (P12.1): administration UI + Golden Prompt (cahier §3.8, §4.10, §7).
--
-- The Golden Prompt (cahier §7) is a "haut de gamme" reference prompt-package
-- kept PRIVATE by default: never listed by the public GET /api/prompt-packages,
-- never runnable/forkable by others, until the administrator authorises a
-- specific promptologue case by case.
--
-- Modelling choice (see docs/administration.md): a Golden Prompt is a normal
-- prompt_packages row flagged is_private = 1. The privacy is a PACKAGE
-- property (all its versions share it), so the flag lives on prompt_packages,
-- not prompt_versions. Every public read path in PromptPackageRepository is
-- filtered by `is_private = 0`, so a private package is structurally invisible
-- to the run launcher, the default-package resolver, the diff, the document
-- fetch AND the promptologue draft-fork source. Access is granted explicitly
-- through golden_grants.
--
-- Forward-only, expand pattern (ADR-008): adding a column with a default and a
-- new table is compatible with the previously pointed release (which simply
-- ignores both).

-- is_private defaults to 0: every existing package (all public) keeps its
-- current visibility; only the admin Golden import inserts is_private = 1.
ALTER TABLE prompt_packages
    ADD COLUMN is_private TINYINT(1) NOT NULL DEFAULT 0 AFTER description;

-- Per-package authorisation to access a private (Golden) package, granted
-- case by case by an administrator to a promptologue (cahier §3.4/§7).
--
-- RGPD purge coherence (cahier §6.3) — who owns what:
--   * package_id CASCADE: the grant disappears with the package.
--   * user_id CASCADE: purging the granted promptologue removes their access.
--   * granted_by SET NULL: the acting admin can be purged; the dated grant
--     survives without identifying the actor (like audit_events).
CREATE TABLE golden_grants (
    package_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    granted_by INT UNSIGNED NULL DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (package_id, user_id),
    KEY idx_golden_grants_user (user_id),
    KEY idx_golden_grants_granted_by (granted_by),
    CONSTRAINT fk_golden_grants_package FOREIGN KEY (package_id)
        REFERENCES prompt_packages (id) ON DELETE CASCADE,
    CONSTRAINT fk_golden_grants_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_golden_grants_granted_by FOREIGN KEY (granted_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
