<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use PDO;
use PDOException;

/**
 * Prepaid credit ledger (ADR-010 §3). All amounts are integer MICRO-USD.
 *
 * Invariants:
 *   * debit() is ATOMIC: a single conditional UPDATE guards the balance
 *     (`balance >= amount`), so concurrent calls can never overdraw — the
 *     loser of the race gets SoldeInsuffisantException, no lost updates.
 *   * topup() is IDEMPOTENT by paypal_order_id: the UNIQUE key on
 *     twin9_credit_events.paypal_order_id makes a replayed PayPal capture a
 *     no-op that just returns the current state.
 *   * every balance mutation writes exactly one ledger event, in the same
 *     transaction. Counters only, never content (cahier §6.5).
 */
final class CreditService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** Balance in micro-USD; 0 for an account without a credit row. */
    public function balance(int $userId): int
    {
        $stmt = $this->pdo->prepare('SELECT balance_microusd FROM twin9_credits WHERE user_id = ?');
        $stmt->execute([$userId]);
        $balance = $stmt->fetchColumn();

        return $balance === false ? 0 : (int) $balance;
    }

    /**
     * Debit one LLM call: atomic conditional UPDATE + ledger event with the
     * real token counts. Throws SoldeInsuffisantException (balance untouched,
     * no event) when the balance cannot cover the amount.
     *
     * $allowOverdraft = true switches to an UNCONDITIONAL debit
     * (balance = balance - X, row created if absent) that may leave a small
     * negative balance. NOTE: /api/twin9/appel no longer uses this — it debits
     * a WORST-CASE reservation conditionally BEFORE the call (allowOverdraft
     * = false) and reconciles down after (security review finding A). The
     * overdraft mode remains available for callers that must record a debit
     * whose funding is guaranteed by other means.
     *
     * @param int $microusd amount to debit, > 0
     * @param string $label step label, e.g. 'lourd/20-greffier' — never content
     * @return int the new balance in micro-USD
     */
    public function debit(
        int $userId,
        int $microusd,
        string $label,
        ?string $model = null,
        ?int $tokensIn = null,
        ?int $tokensOut = null,
        bool $allowOverdraft = false,
    ): int {
        if ($microusd <= 0) {
            throw new \InvalidArgumentException('debit() amount must be > 0 micro-USD');
        }

        $this->pdo->beginTransaction();
        try {
            if ($allowOverdraft) {
                $this->upsertBalance($userId, -$microusd);
            } else {
                $stmt = $this->pdo->prepare(
                    'UPDATE twin9_credits
                     SET balance_microusd = balance_microusd - ?
                     WHERE user_id = ? AND balance_microusd >= ?'
                );
                $stmt->execute([$microusd, $userId, $microusd]);
                if ($stmt->rowCount() === 0) {
                    $this->pdo->rollBack();

                    throw new SoldeInsuffisantException($this->balance($userId), $microusd);
                }
            }

            $this->insertEvent($userId, 'debit', -$microusd, $label, $model, $tokensIn, $tokensOut, null);
            $newBalance = $this->lockedBalance($userId);
            $this->pdo->commit();
        } catch (SoldeInsuffisantException $e) {
            throw $e; // already rolled back
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return $newBalance;
    }

    /**
     * Credit a PayPal top-up, idempotent by order id: the first call credits
     * the balance and writes the ledger event; a replay (same
     * paypal_order_id) changes nothing and reports applied=false.
     *
     * @param int $microusd amount to credit, > 0
     * @return array{balance: int, applied: bool}
     */
    public function topup(int $userId, int $microusd, string $paypalOrderId, string $label = ''): array
    {
        if ($microusd <= 0) {
            throw new \InvalidArgumentException('topup() amount must be > 0 micro-USD');
        }
        if (trim($paypalOrderId) === '') {
            throw new \InvalidArgumentException('topup() requires a PayPal order id');
        }

        $this->pdo->beginTransaction();
        try {
            try {
                $this->insertEvent(
                    $userId,
                    'topup',
                    $microusd,
                    $label !== '' ? $label : $paypalOrderId,
                    null,
                    null,
                    null,
                    $paypalOrderId,
                );
            } catch (PDOException $e) {
                if ($e->getCode() === '23000') { // duplicate paypal_order_id => replay
                    $this->pdo->rollBack();

                    return ['balance' => $this->balance($userId), 'applied' => false];
                }
                throw $e;
            }

            $this->upsertBalance($userId, $microusd);
            $newBalance = $this->lockedBalance($userId);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        return ['balance' => $newBalance, 'applied' => true];
    }

    /**
     * Signed adjustment, positive or negative (may drive the balance below
     * zero — deliberate: a correction is a statement of fact, the conditional
     * guard only protects real-time debits). Two callers: admin corrections,
     * and the /appel reservation reconciliation (which passes the real token
     * counts so the ledger event carries them).
     *
     * @param int $microusd signed amount, != 0
     * @return int the new balance in micro-USD
     */
    public function adjust(
        int $userId,
        int $microusd,
        string $label,
        ?string $model = null,
        ?int $tokensIn = null,
        ?int $tokensOut = null,
    ): int {
        if ($microusd === 0) {
            throw new \InvalidArgumentException('adjust() amount must be non-zero');
        }

        $this->pdo->beginTransaction();
        try {
            $this->upsertBalance($userId, $microusd);
            $this->insertEvent($userId, 'adjust', $microusd, $label, $model, $tokensIn, $tokensOut, null);
            $newBalance = $this->lockedBalance($userId);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return $newBalance;
    }

    /**
     * Ledger page for one user, most recent first.
     *
     * @return list<array<string, mixed>>
     */
    public function events(int $userId, int $limit = 50): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT kind, amount_microusd, label, model, tokens_in, tokens_out, paypal_order_id, created_at
             FROM twin9_credit_events WHERE user_id = ?
             ORDER BY id DESC LIMIT ' . max(1, min(200, $limit))
        );
        $stmt->execute([$userId]);

        return array_map(static fn (array $row): array => [
            'kind' => (string) $row['kind'],
            'amount_microusd' => (int) $row['amount_microusd'],
            'label' => (string) $row['label'],
            'model' => $row['model'] === null ? null : (string) $row['model'],
            'tokens_in' => $row['tokens_in'] === null ? null : (int) $row['tokens_in'],
            'tokens_out' => $row['tokens_out'] === null ? null : (int) $row['tokens_out'],
            'paypal_order_id' => $row['paypal_order_id'] === null ? null : (string) $row['paypal_order_id'],
            'created_at' => (string) $row['created_at'],
        ], $stmt->fetchAll());
    }

    private function upsertBalance(int $userId, int $delta): void
    {
        $this->pdo->prepare(
            'INSERT INTO twin9_credits (user_id, balance_microusd) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE balance_microusd = balance_microusd + ?'
        )->execute([$userId, $delta, $delta]);
    }

    private function insertEvent(
        int $userId,
        string $kind,
        int $amount,
        string $label,
        ?string $model,
        ?int $tokensIn,
        ?int $tokensOut,
        ?string $paypalOrderId,
    ): void {
        $this->pdo->prepare(
            'INSERT INTO twin9_credit_events
             (user_id, kind, amount_microusd, label, model, tokens_in, tokens_out, paypal_order_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $userId,
            $kind,
            $amount,
            mb_substr($label, 0, 190),
            $model,
            $tokensIn,
            $tokensOut,
            $paypalOrderId,
        ]);
    }

    /** Balance inside the current transaction (row already locked by the write). */
    private function lockedBalance(int $userId): int
    {
        $stmt = $this->pdo->prepare('SELECT balance_microusd FROM twin9_credits WHERE user_id = ?');
        $stmt->execute([$userId]);
        $balance = $stmt->fetchColumn();

        return $balance === false ? 0 : (int) $balance;
    }
}
