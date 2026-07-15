-- 013 — Remboursement du solde prépayé à la demande (ADR-010 §3, 2026-07-15).
-- Le solde reste par défaut (les gens reviennent) ; un utilisateur PEUT demander
-- le remboursement de son solde inutilisé. Un remboursement PayPal se fait contre
-- une CAPTURE (pas un ordre), partiellement, dans la limite du montant capturé —
-- il faut donc mémoriser chaque capture et ce qui en a déjà été remboursé.

-- Nouveau type d'événement au grand-livre : remboursement (montant négatif).
ALTER TABLE twin9_credit_events
    MODIFY kind ENUM('topup', 'debit', 'adjust', 'refund') NOT NULL;

CREATE TABLE twin9_paypal_captures (
    capture_id VARCHAR(64) NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    paypal_order_id VARCHAR(64) NOT NULL,
    montant_microusd BIGINT NOT NULL,
    rembourse_microusd BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (capture_id),
    KEY idx_twin9_paypal_captures_user (user_id),
    CONSTRAINT fk_twin9_paypal_captures_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
