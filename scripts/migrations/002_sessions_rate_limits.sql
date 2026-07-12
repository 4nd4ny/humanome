-- 002 — PDO session storage + fixed-window rate limiting.

-- Backing table for DbSessionHandler (SessionHandlerInterface).
-- user_id is bound at login by the auth module; sessions of a purged
-- account disappear with it (ON DELETE CASCADE).
CREATE TABLE sessions (
    id VARCHAR(128) NOT NULL,
    user_id INT UNSIGNED NULL DEFAULT NULL,
    data BLOB NOT NULL,
    last_activity INT UNSIGNED NOT NULL,
    ip_hash CHAR(64) NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_sessions_last_activity (last_activity),
    KEY idx_sessions_user (user_id),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fixed-window counters. Atomic increment pattern:
--   INSERT INTO rate_limits (bucket, window_start, counter) VALUES (?, ?, 1)
--   ON DUPLICATE KEY UPDATE counter = counter + 1;
-- bucket example: "login:<sha256(ip)>" — never a raw IP (journalisation minimale, §6).
CREATE TABLE rate_limits (
    bucket VARCHAR(120) NOT NULL,
    window_start INT UNSIGNED NOT NULL,
    counter INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (bucket, window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
