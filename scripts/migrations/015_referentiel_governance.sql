-- 015 — collaborative governance of the referentiel (cahier §3.5/§4.1).
-- An épistémiarque edit is a DRAFT; submitting it opens a vote (status
-- 'review', already in the 003 enum); it becomes published (entériné) ONLY
-- once a majority of the current épistémiarque members has approved it.
-- Decidim threads (participer.harmonia.education) can back the discussion.

-- Proposal metadata carried on the version row while it is under vote.
--  submitted_at / submitted_by : when a draft entered the vote (status review).
--  decidim_url                 : optional link to the backing Decidim debate.
ALTER TABLE referentiel_versions
    ADD COLUMN submitted_at DATETIME NULL DEFAULT NULL AFTER published_at,
    ADD COLUMN submitted_by INT UNSIGNED NULL DEFAULT NULL AFTER submitted_at,
    ADD COLUMN decidim_url VARCHAR(500) NULL DEFAULT NULL AFTER submitted_by,
    ADD CONSTRAINT fk_referentiel_versions_submitted_by FOREIGN KEY (submitted_by)
        REFERENCES users (id) ON DELETE SET NULL;

-- One ballot per member per proposal (version). A member may change their
-- vote (upsert). Votes are wiped when a proposal is withdrawn or resubmitted
-- so every vote round starts clean. A purged account takes its ballots with it.
CREATE TABLE referentiel_votes (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    version_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    vote ENUM('pour','contre','abstention') NOT NULL,
    comment TEXT NULL DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_referentiel_votes (version_id, user_id),
    KEY idx_referentiel_votes_version (version_id),
    CONSTRAINT fk_referentiel_votes_version FOREIGN KEY (version_id)
        REFERENCES referentiel_versions (id) ON DELETE CASCADE,
    CONSTRAINT fk_referentiel_votes_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
