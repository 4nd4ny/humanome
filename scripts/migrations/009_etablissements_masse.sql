-- 009 — M8 (P11): B2B establishments and mass cartography (ADR-005,
-- docs/plan-masse.md). Job granularity: one job = (member, day), per-pole
-- checkpoint inside the job row, 5-minute leases, budget circuit breaker.
--
-- RGPD purge coherence (cahier §6.3, plan-masse §6) — who owns what:
--   * cohorte: belongs to the establishment account (CASCADE).
--   * membre: the learner's consent record — purged with the learner AND
--     with the cohorte (CASCADE both ways).
--   * portfolio déposé: learner content transiting server-side (explicit
--     opt-in) — purged with the learner, the cohorte, or when the learner
--     quits (application-level delete).
--   * etablissement_config: purged with the establishment account.
--   * mass_runs: operational record of the establishment (CASCADE on both
--     the establishment and the cohorte).
--   * mass_jobs: the produced day-documents belong to the LEARNER
--     (user_id CASCADE — account purge removes them); portfolio_id is SET
--     NULL on portfolio deletion so already-produced documents survive a
--     cohort quit while unprocessed jobs lose their source (the worker
--     cancels them).

CREATE TABLE cohortes (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    etablissement_id INT UNSIGNED NOT NULL,
    nom VARCHAR(190) NOT NULL,
    code_invitation CHAR(10) NOT NULL, -- alphabet A-Z2-9, generated server-side
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cohortes_code (code_invitation),
    KEY idx_cohortes_etablissement (etablissement_id),
    CONSTRAINT fk_cohortes_etablissement FOREIGN KEY (etablissement_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- consent_at NOT NULL: the row IS the explicit consent (plan-masse §6) —
-- joining without {"consentement": true} is rejected at the API layer.
CREATE TABLE cohorte_membres (
    cohorte_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    consent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (cohorte_id, user_id),
    KEY idx_cohorte_membres_user (user_id),
    CONSTRAINT fk_cohorte_membres_cohorte FOREIGN KEY (cohorte_id)
        REFERENCES cohortes (id) ON DELETE CASCADE,
    CONSTRAINT fk_cohorte_membres_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The deposit is the de-facto opt-in to server-side processing: only members
-- who deposited are enqueued by a run. One deposit per (cohorte, member);
-- re-deposit replaces. segments = [{date: 'AAAA-MM-JJ', texte: '…'}, …]
-- (client-side P7 segmentation), texte = optional full portfolio text.
CREATE TABLE cohorte_portfolios (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    cohorte_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    titre VARCHAR(190) NOT NULL,
    texte MEDIUMTEXT NULL,
    segments JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cohorte_portfolios (cohorte_id, user_id),
    KEY idx_cohorte_portfolios_user (user_id),
    CONSTRAINT fk_cohorte_portfolios_cohorte FOREIGN KEY (cohorte_id)
        REFERENCES cohortes (id) ON DELETE CASCADE,
    CONSTRAINT fk_cohorte_portfolios_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-establishment LLM + budget configuration (cahier §3.7, §4.9, §7).
-- encrypted_key: sodium nonce||secretbox (KeyVault AD-4 pattern), only for
-- provider 'endpoint'; the 'humanome' provider uses the platform key
-- (ANTHROPIC_API_KEY env, billed through spent_usd). worker_token_hash:
-- sha256 of the machine-runner bearer token (clear value shown once).
CREATE TABLE etablissement_config (
    user_id INT UNSIGNED NOT NULL,
    provider ENUM('humanome','endpoint') NOT NULL DEFAULT 'humanome',
    endpoint_url VARCHAR(255) NULL DEFAULT NULL,
    encrypted_key VARBINARY(512) NULL DEFAULT NULL,
    model VARCHAR(120) NULL DEFAULT NULL,
    budget_cap_usd DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    spent_usd DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
    worker_token_hash CHAR(64) NULL DEFAULT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_etablissement_config_worker_token (worker_token_hash),
    CONSTRAINT fk_etablissement_config_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One launch of a cohorte. Package and referentiel versions are FROZEN at
-- launch (published-only, reproducibility invariant of the whole platform).
CREATE TABLE mass_runs (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    etablissement_id INT UNSIGNED NOT NULL,
    cohorte_id INT UNSIGNED NOT NULL,
    prompt_package_slug VARCHAR(120) NOT NULL,
    prompt_package_semver VARCHAR(32) NOT NULL,
    referentiel_id VARCHAR(64) NOT NULL,
    referentiel_semver VARCHAR(32) NOT NULL,
    status ENUM('active','done','failed','cancelled','budget_exceeded')
        NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_mass_runs_etablissement (etablissement_id),
    KEY idx_mass_runs_cohorte (cohorte_id),
    CONSTRAINT fk_mass_runs_etablissement FOREIGN KEY (etablissement_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_mass_runs_cohorte FOREIGN KEY (cohorte_id)
        REFERENCES cohortes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One job = (member, day). checkpoint: {"poles": {"1": {…}, …}} — validated
-- pole documents written after EACH successful LLM call (plan-masse §3).
-- All worker writes are conditional on status='running' so a concurrent
-- cancellation wins. document: the final validated cartographie-jour.
CREATE TABLE mass_jobs (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    run_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    portfolio_id INT UNSIGNED NULL DEFAULT NULL,
    day_date CHAR(10) NOT NULL, -- ISO AAAA-MM-JJ
    status ENUM('queued','running','done','failed','budget_exceeded','cancelled')
        NOT NULL DEFAULT 'queued',
    priority TINYINT NOT NULL DEFAULT 0,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    lease_until DATETIME NULL DEFAULT NULL,
    checkpoint JSON NULL DEFAULT NULL,
    document JSON NULL DEFAULT NULL,
    erreur TEXT NULL DEFAULT NULL,
    tokens_input INT UNSIGNED NOT NULL DEFAULT 0,
    tokens_output INT UNSIGNED NOT NULL DEFAULT 0,
    cost_usd DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    finished_at DATETIME NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_mass_jobs_unit (run_id, user_id, day_date),
    KEY idx_mass_jobs_reservation (status, priority, id),
    KEY idx_mass_jobs_user (user_id),
    KEY idx_mass_jobs_portfolio (portfolio_id),
    CONSTRAINT fk_mass_jobs_run FOREIGN KEY (run_id)
        REFERENCES mass_runs (id) ON DELETE CASCADE,
    CONSTRAINT fk_mass_jobs_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_mass_jobs_portfolio FOREIGN KEY (portfolio_id)
        REFERENCES cohorte_portfolios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
