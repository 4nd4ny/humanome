-- 012 — Binding PayPal order → user (durcissement sécurité, revue adversariale
-- du 2026-07-15). Avant : POST /twin9/credit/paypal/capturer créditait la
-- session COURANTE pour N'IMPORTE quel order_id capturable, sans lien avec le
-- payeur (misattribution / vol de crédit possible si un autre compte connaît
-- un order_id approuvé). Désormais /creer enregistre (order_id → user_id) et
-- /capturer refuse (403) un ordre dont le propriétaire n'est pas la session.
CREATE TABLE twin9_paypal_orders (
    paypal_order_id VARCHAR(64) NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (paypal_order_id),
    KEY idx_twin9_paypal_orders_user (user_id),
    CONSTRAINT fk_twin9_paypal_orders_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
