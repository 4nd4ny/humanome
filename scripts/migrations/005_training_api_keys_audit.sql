-- 005 — training progress, per-user LLM API keys (encrypted), minimal audit trail.

CREATE TABLE training_progress (
    user_id INT UNSIGNED NOT NULL,
    parcours VARCHAR(64) NOT NULL,
    chapitre VARCHAR(64) NOT NULL,
    completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, parcours, chapitre),
    CONSTRAINT fk_training_progress_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Structure only in P3; libsodium encryption (master key outside webroot,
-- ADR-004) is wired in P12. encrypted_key is an opaque ciphertext blob.
CREATE TABLE user_api_keys (
    user_id INT UNSIGNED NOT NULL,
    provider VARCHAR(32) NOT NULL,
    encrypted_key BLOB NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, provider),
    CONSTRAINT fk_user_api_keys_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Minimal RGPD audit (cahier §6.5: counters and events, NEVER content).
-- user_id is SET NULL on purge so the trace of the deletion itself survives
-- without identifying anyone. details holds tiny structured facts (ids,
-- counts), never portfolio or cartography text.
CREATE TABLE audit_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NULL DEFAULT NULL,
    type VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    details JSON NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_audit_events_type (type, created_at),
    KEY idx_audit_events_user (user_id),
    CONSTRAINT fk_audit_events_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
