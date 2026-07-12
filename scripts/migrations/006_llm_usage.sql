-- 006 — LLM demo proxy (P6): usage counters + one-time anti-bot challenges.
--
-- RGPD (cahier §6.5): COUNTERS ONLY. No prompt, no response, no raw IP is
-- ever stored. Per-IP hourly windows reuse the existing `rate_limits` table
-- (migration 002) with hashed buckets: "llm:<sha256(ip)>" — same pattern as
-- the auth rate limits.

-- Global daily counters (UTC day): tokens in/out + estimated cost, used by
-- the daily circuit breaker (dailyGlobalTokens / dailyBudgetUsd in
-- api/config/demo.php). One row per day, atomic increments via
-- INSERT ... ON DUPLICATE KEY UPDATE.
CREATE TABLE llm_usage_daily (
    usage_date DATE NOT NULL,
    requests INT UNSIGNED NOT NULL DEFAULT 0,
    input_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
    output_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
    estimated_cost_usd DECIMAL(12, 6) NOT NULL DEFAULT 0,
    PRIMARY KEY (usage_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time consumption of proof-of-work challenges. The challenge itself is
-- stateless (ts + HMAC, no server storage at issuance); this table only
-- records CONSUMED challenges so a solved challenge cannot be replayed.
-- Only a sha256 of the challenge is stored (no client data whatsoever).
-- Rows expire with the challenge (2 min TTL) and are pruned opportunistically.
CREATE TABLE llm_pow_challenges (
    challenge_hash CHAR(64) NOT NULL,
    expires_at INT UNSIGNED NOT NULL,
    PRIMARY KEY (challenge_hash),
    KEY idx_llm_pow_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
