-- 020 — Compteurs quotidiens de l'assistant tuteur (D9).
--
-- Budget quotidien PROPRE au tuteur (TUTEUR_BUDGET), DISTINCT de la démo
-- publique (llm_usage_daily) : même forme, table séparée -> le circuit breaker
-- du tuteur n'affecte pas celui de la démo et réciproquement. COMPTEURS SEULS,
-- jamais de contenu ni de donnée par utilisateur (cahier §6.5, RGPD).

CREATE TABLE tuteur_usage_daily (
    usage_date DATE NOT NULL,
    requests INT UNSIGNED NOT NULL DEFAULT 0,
    input_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
    output_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
    estimated_cost_usd DECIMAL(12, 6) NOT NULL DEFAULT 0,
    PRIMARY KEY (usage_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
