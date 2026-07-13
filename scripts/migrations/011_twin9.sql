-- 011 — T3a (ADR-010): Twin_v9 server foundations — secret prompt templates
-- stored in DATABASE (never in the repo, never sent to the browser) and the
-- prepaid credit ledger (PayPal top-ups, per-call debits).
--
-- Secrecy (ADR-010 §2): twin9_protocole holds the CONFIDENTIAL templates.
-- They are only readable through admin-role routes; the /api/twin9/appel
-- endpoint (T3b) renders them server-side and returns model output only.
--
-- RGPD (cahier §6.5, ADR-010 §5): counters only, NEVER content —
-- twin9_credit_events records amounts, token counts, model ids and step
-- labels; no portfolio text, no prompt text, no model output.
--
-- Purge coherence (cahier §6.3) — who owns what:
--   * twin9_protocole.updated_by / versions.created_by: SET NULL — the
--     template and its history belong to the platform, the acting admin can
--     be purged without losing them (same choice as golden_grants.granted_by).
--   * twin9_credits / twin9_credit_events: CASCADE — the balance and its
--     ledger belong to the user; account purge removes them.
--
-- Forward-only, expand pattern (ADR-008): new tables only, the previously
-- pointed release simply ignores them.

CREATE TABLE twin9_protocole (
    -- Hierarchical template name, e.g. 'lourd/20-greffier' (dir/file, no .md)
    name VARCHAR(190) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    -- {$VAR} placeholders extracted at write time (JSON array of strings)
    variables JSON NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by INT UNSIGNED NULL DEFAULT NULL,
    PRIMARY KEY (name),
    KEY idx_twin9_protocole_updated_by (updated_by),
    CONSTRAINT fk_twin9_protocole_updated_by FOREIGN KEY (updated_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Edit history: every overwrite of a template archives the PREVIOUS content
-- here first (version = per-name counter starting at 1). Enables the admin
-- editor's "retour arrière" (ADR-010 §6).
CREATE TABLE twin9_protocole_versions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(190) NOT NULL,
    version INT UNSIGNED NOT NULL,
    content MEDIUMTEXT NOT NULL,
    variables JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- author of the ARCHIVED content (the row's updated_by at overwrite time)
    created_by INT UNSIGNED NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_twin9_versions_name_version (name, version),
    KEY idx_twin9_versions_created_by (created_by),
    CONSTRAINT fk_twin9_versions_created_by FOREIGN KEY (created_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Prepaid balance in MICRO-USD (1 USD = 1 000 000), BIGINT: exact integer
-- arithmetic, no floats anywhere near money.
CREATE TABLE twin9_credits (
    user_id INT UNSIGNED NOT NULL,
    balance_microusd BIGINT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_twin9_credits_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ledger: top-ups (PayPal order id, amount > 0), per-call debits (amount < 0,
-- real token counts and model id) and admin adjustments. paypal_order_id is
-- UNIQUE = idempotency key for the PayPal capture flow (a replayed capture is
-- a no-op). Counters only, never content.
CREATE TABLE twin9_credit_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    kind ENUM('topup', 'debit', 'adjust') NOT NULL,
    amount_microusd BIGINT NOT NULL,
    -- step label ('lourd/20-greffier', 'ajustement admin', …) or PayPal order id
    label VARCHAR(190) NOT NULL,
    model VARCHAR(100) NULL DEFAULT NULL,
    tokens_in INT UNSIGNED NULL DEFAULT NULL,
    tokens_out INT UNSIGNED NULL DEFAULT NULL,
    paypal_order_id VARCHAR(64) NULL DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_twin9_credit_events_paypal (paypal_order_id),
    KEY idx_twin9_credit_events_user (user_id, created_at),
    CONSTRAINT fk_twin9_credit_events_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
