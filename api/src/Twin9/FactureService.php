<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use PDO;

/**
 * Monthly recap invoices + spend tracking over the prepaid ledger
 * (owner request, 2026-07-13): every account — individual learners AND
 * établissement accounts alike — can produce a monthly « facture
 * récapitulative » of its prepaid-token usage, and follow its spend.
 *
 * Everything is DERIVED from twin9_credit_events (single source of truth):
 * no separate invoice storage, no mutable state — the invoice for a month is
 * a deterministic aggregation, its number is stable
 * (HUM-TW9-{YYYYMM}-{userId}), and re-generating it always yields the same
 * document. Counters and amounts only, never content (cahier §6.5).
 *
 * Note on semantics: a « débit » ledger line for /appel is the WORST-CASE
 * reservation and its « ajustement (réconciliation) » refunds the unused
 * part (see routes/twin9.php). For invoicing, what the account really
 * CONSUMED in a month is therefore: -(sum of debits) - (sum of
 * reconciliation adjustments) … i.e. the NET of everything that is not a
 * top-up. Admin corrections (adjust without the reconciliation label) are
 * listed separately as « ajustements » so the invoice stays honest.
 */
final class FactureService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Aggregated data for one month's recap invoice.
     *
     * @return array<string, mixed>
     */
    public function facture(int $userId, int $annee, int $mois): array
    {
        [$debut, $fin] = self::bornes($annee, $mois);

        // Client identity (établissement accounts are users too — same path).
        $stmt = $this->pdo->prepare('SELECT email, display_name FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $user = $stmt->fetch() ?: ['email' => '', 'display_name' => ''];

        // Usage lines per model: reservations net of their reconciliations,
        // with REAL token counts (carried by the reconciliation events; for
        // fully-consumed reservations the debit row itself has the tokens).
        $stmt = $this->pdo->prepare(
            "SELECT COALESCE(model, '(autre)') AS model,
                    SUM(CASE WHEN kind = 'debit' THEN 1 ELSE 0 END)      AS appels,
                    SUM(COALESCE(tokens_in, 0))                          AS tokens_in,
                    SUM(COALESCE(tokens_out, 0))                         AS tokens_out,
                    -SUM(amount_microusd)                                AS consomme_microusd
             FROM twin9_credit_events
             WHERE user_id = ? AND created_at >= ? AND created_at < ?
               AND (kind = 'debit'
                    OR (kind = 'adjust' AND (label LIKE '%réconciliation%'
                                             OR label LIKE '%remboursement%')))
             GROUP BY COALESCE(model, '(autre)')
             ORDER BY consomme_microusd DESC"
        );
        $stmt->execute([$userId, $debut, $fin]);
        $lignes = array_map(static fn (array $r): array => [
            'model' => (string) $r['model'],
            'appels' => (int) $r['appels'],
            'tokens_in' => (int) $r['tokens_in'],
            'tokens_out' => (int) $r['tokens_out'],
            'consomme_microusd' => (int) $r['consomme_microusd'],
        ], $stmt->fetchAll());

        // Top-ups of the month (each a PayPal capture — the « prepaid » side).
        $stmt = $this->pdo->prepare(
            "SELECT amount_microusd, label, paypal_order_id, created_at
             FROM twin9_credit_events
             WHERE user_id = ? AND kind = 'topup' AND created_at >= ? AND created_at < ?
             ORDER BY created_at"
        );
        $stmt->execute([$userId, $debut, $fin]);
        $recharges = array_map(static fn (array $r): array => [
            'montant_microusd' => (int) $r['amount_microusd'],
            'libelle' => (string) $r['label'],
            'paypal_order_id' => $r['paypal_order_id'] === null ? null : (string) $r['paypal_order_id'],
            'date' => (string) $r['created_at'],
        ], $stmt->fetchAll());

        // Admin corrections (adjust events that are NOT call reconciliations).
        $stmt = $this->pdo->prepare(
            "SELECT amount_microusd, label, created_at
             FROM twin9_credit_events
             WHERE user_id = ? AND kind = 'adjust'
               AND label NOT LIKE '%réconciliation%' AND label NOT LIKE '%remboursement%'
               AND created_at >= ? AND created_at < ?
             ORDER BY created_at"
        );
        $stmt->execute([$userId, $debut, $fin]);
        $ajustements = array_map(static fn (array $r): array => [
            'montant_microusd' => (int) $r['amount_microusd'],
            'libelle' => (string) $r['label'],
            'date' => (string) $r['created_at'],
        ], $stmt->fetchAll());

        // Balance at the end of the period = signed sum of everything ≤ fin.
        $stmt = $this->pdo->prepare(
            'SELECT COALESCE(SUM(amount_microusd), 0) FROM twin9_credit_events
             WHERE user_id = ? AND created_at < ?'
        );
        $stmt->execute([$userId, $fin]);
        $soldeFin = (int) $stmt->fetchColumn();

        $totalConsomme = array_sum(array_column($lignes, 'consomme_microusd'));
        $totalRecharges = array_sum(array_column($recharges, 'montant_microusd'));

        return [
            // Stable, deterministic number: re-issuing the same month yields
            // the same document (the ledger is append-only per closed month).
            'numero' => sprintf('HUM-TW9-%04d%02d-%d', $annee, $mois, $userId),
            'periode' => sprintf('%04d-%02d', $annee, $mois),
            'emetteur' => [
                'nom' => 'Harmonia Éducation',
                'service' => 'humanome.xyz — cartographie de compétences humaines',
                'site' => 'https://humanome.xyz',
            ],
            'client' => [
                'nom' => (string) $user['display_name'],
                'email' => (string) $user['email'],
            ],
            'lignes' => $lignes,
            'recharges' => $recharges,
            'ajustements' => $ajustements,
            'total_consomme_microusd' => $totalConsomme,
            'total_recharges_microusd' => $totalRecharges,
            'solde_fin_periode_microusd' => $soldeFin,
            'mentions' => [
                'Crédit prépayé consommé sur humanome.xyz (système Twin_v9).',
                'Les prix incluent la majoration de service couvrant les frais '
                    . 'de paiement et l’infrastructure de la plateforme.',
                'Paiements traités par PayPal — aucune donnée bancaire n’est '
                    . 'détenue par Harmonia Éducation.',
            ],
        ];
    }

    /**
     * Spend tracking: the last N months aggregated (topups, consumed, calls),
     * newest first — the data behind the « suivi des quotas et dépenses ».
     *
     * @return list<array<string, mixed>>
     */
    public function depensesParMois(int $userId, int $nbMois = 12): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT DATE_FORMAT(created_at, '%Y-%m') AS mois,
                    SUM(CASE WHEN kind = 'topup' THEN amount_microusd ELSE 0 END) AS recharges,
                    -SUM(CASE WHEN kind <> 'topup' THEN amount_microusd ELSE 0 END) AS consomme,
                    SUM(CASE WHEN kind = 'debit' THEN 1 ELSE 0 END) AS appels
             FROM twin9_credit_events
             WHERE user_id = ?
             GROUP BY DATE_FORMAT(created_at, '%Y-%m')
             ORDER BY mois DESC
             LIMIT " . max(1, min(36, $nbMois))
        );
        $stmt->execute([$userId]);

        return array_map(static fn (array $r): array => [
            'mois' => (string) $r['mois'],
            'recharges_microusd' => (int) $r['recharges'],
            'consomme_microusd' => (int) $r['consomme'],
            'appels' => (int) $r['appels'],
        ], $stmt->fetchAll());
    }

    /**
     * Admin oversight: every account that ever had a ledger event, with its
     * balance and lifetime totals (support + establishment follow-up).
     *
     * @return list<array<string, mixed>>
     */
    public function comptes(): array
    {
        $stmt = $this->pdo->query(
            "SELECT e.user_id, u.email, u.display_name,
                    COALESCE(c.balance_microusd, 0) AS balance,
                    SUM(CASE WHEN e.kind = 'topup' THEN e.amount_microusd ELSE 0 END) AS recharges,
                    -SUM(CASE WHEN e.kind <> 'topup' THEN e.amount_microusd ELSE 0 END) AS consomme,
                    MAX(e.created_at) AS derniere_activite
             FROM twin9_credit_events e
             JOIN users u ON u.id = e.user_id
             LEFT JOIN twin9_credits c ON c.user_id = e.user_id
             GROUP BY e.user_id, u.email, u.display_name, c.balance_microusd
             ORDER BY derniere_activite DESC"
        );

        return array_map(static fn (array $r): array => [
            'user_id' => (int) $r['user_id'],
            'email' => (string) $r['email'],
            'nom' => (string) $r['display_name'],
            'solde_microusd' => (int) $r['balance'],
            'recharges_microusd' => (int) $r['recharges'],
            'consomme_microusd' => (int) $r['consomme'],
            'derniere_activite' => (string) $r['derniere_activite'],
        ], $stmt->fetchAll());
    }

    /** @return array{0: string, 1: string} [début inclus, fin exclue) du mois */
    private static function bornes(int $annee, int $mois): array
    {
        $debut = sprintf('%04d-%02d-01 00:00:00', $annee, $mois);
        $finAnnee = $mois === 12 ? $annee + 1 : $annee;
        $finMois = $mois === 12 ? 1 : $mois + 1;

        return [$debut, sprintf('%04d-%02d-01 00:00:00', $finAnnee, $finMois)];
    }
}
