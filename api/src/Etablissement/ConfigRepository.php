<?php

declare(strict_types=1);

namespace Humanome\Etablissement;

use PDO;

/**
 * Per-establishment LLM + budget configuration (P11, cahier §3.7/§4.9/§7,
 * docs/plan-masse.md §4-5). One row per establishment account.
 *
 * - provider 'humanome': platform key (ANTHROPIC_API_KEY env), usage billed
 *   through spent_usd (§7). 'endpoint': the establishment's own
 *   OpenAI-compatible URL + optional API key.
 * - The endpoint API key is encrypted at rest with the exact KeyVault layout
 *   (AD-4, api/src/Keys/KeyVault.php): nonce (24 bytes) || secretbox(key,
 *   nonce, masterKey), master key from SODIUM_MASTER_KEY (outside webroot in
 *   production). Never returned by any read endpoint, never logged.
 * - worker_token: bearer token of the machine runner (ADR-005 alternative),
 *   stored as sha256 hex — the clear value is answered exactly ONCE at
 *   generation (share_links pattern).
 */
final class ConfigRepository
{
    public function __construct(private readonly PDO $pdo, private readonly ?string $masterKey = null)
    {
    }

    /** @return array<string, mixed>|null raw row (encrypted_key included) */
    public function find(int $etablissementId): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM etablissement_config WHERE user_id = ?');
        $stmt->execute([$etablissementId]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /**
     * Public projection — NEVER any key material (M8 contract).
     *
     * @return array<string, mixed>
     */
    public function projection(int $etablissementId): array
    {
        $row = $this->find($etablissementId);
        if ($row === null) {
            return [
                'provider' => 'humanome',
                'endpointUrl' => null,
                'model' => null,
                'budgetCapUsd' => 0.0,
                'spentUsd' => 0.0,
                'hasApiKey' => false,
                'hasWorkerToken' => false,
            ];
        }

        return [
            'provider' => (string) $row['provider'],
            'endpointUrl' => $row['endpoint_url'] === null ? null : (string) $row['endpoint_url'],
            'model' => $row['model'] === null ? null : (string) $row['model'],
            'budgetCapUsd' => (float) $row['budget_cap_usd'],
            'spentUsd' => (float) $row['spent_usd'],
            'hasApiKey' => $row['encrypted_key'] !== null,
            'hasWorkerToken' => $row['worker_token_hash'] !== null,
        ];
    }

    /**
     * Upsert of the configurable fields. $apiKey semantics: null = keep the
     * stored key, '' = erase it, anything else = encrypt and replace.
     * Raising the cap re-queues budget_exceeded work (plan-masse §4).
     */
    public function save(
        int $etablissementId,
        string $provider,
        ?string $endpointUrl,
        ?string $apiKey,
        ?string $model,
        float $budgetCapUsd,
    ): void {
        $this->pdo->prepare(
            'INSERT INTO etablissement_config (user_id, provider, endpoint_url, model, budget_cap_usd)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE provider = VALUES(provider),
                 endpoint_url = VALUES(endpoint_url), model = VALUES(model),
                 budget_cap_usd = VALUES(budget_cap_usd)'
        )->execute([$etablissementId, $provider, $endpointUrl, $model, number_format($budgetCapUsd, 2, '.', '')]);

        if ($apiKey !== null) {
            $blob = null;
            if ($apiKey !== '') {
                if ($this->masterKey === null) {
                    throw new \RuntimeException('SODIUM_MASTER_KEY not configured');
                }
                $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
                $blob = $nonce . sodium_crypto_secretbox($apiKey, $nonce, $this->masterKey);
                sodium_memzero($apiKey);
            }
            $stmt = $this->pdo->prepare('UPDATE etablissement_config SET encrypted_key = ? WHERE user_id = ?');
            $stmt->bindValue(1, $blob, $blob === null ? PDO::PARAM_NULL : PDO::PARAM_LOB);
            $stmt->bindValue(2, $etablissementId, PDO::PARAM_INT);
            $stmt->execute();
        }
    }

    /** Decrypted endpoint API key (worker use only). Null when absent/invalid. */
    public function revealApiKey(int $etablissementId): ?string
    {
        $row = $this->find($etablissementId);
        $blob = $row['encrypted_key'] ?? null;
        if (\is_resource($blob)) {
            $blob = stream_get_contents($blob);
        }
        if (!\is_string($blob) || \strlen($blob) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES || $this->masterKey === null) {
            return null;
        }

        $nonce = substr($blob, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $cipher = substr($blob, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $clear = sodium_crypto_secretbox_open($cipher, $nonce, $this->masterKey);

        return $clear === false ? null : $clear;
    }

    /**
     * (Re)generate the machine-runner bearer token: 128 bits, answered in
     * clear exactly once, stored as sha256 hex (share_links pattern).
     */
    public function generateWorkerToken(int $etablissementId): string
    {
        $token = 'hwk_' . bin2hex(random_bytes(16));
        $this->pdo->prepare(
            'INSERT INTO etablissement_config (user_id, worker_token_hash) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE worker_token_hash = VALUES(worker_token_hash)'
        )->execute([$etablissementId, hash('sha256', $token)]);

        return $token;
    }

    /** Establishment id owning the given clear worker token, or null. */
    public function etablissementIdForWorkerToken(string $token): ?int
    {
        if ($token === '') {
            return null;
        }
        $stmt = $this->pdo->prepare(
            'SELECT user_id FROM etablissement_config WHERE worker_token_hash = ?'
        );
        $stmt->execute([hash('sha256', $token)]);
        $id = $stmt->fetchColumn();

        return $id === false ? null : (int) $id;
    }

    /** Atomic usage increment (each LLM result, plan-masse §4). */
    public function addSpentUsd(int $etablissementId, float $usd): void
    {
        $this->pdo->prepare(
            'UPDATE etablissement_config SET spent_usd = spent_usd + ? WHERE user_id = ?'
        )->execute([number_format(max(0.0, $usd), 6, '.', ''), $etablissementId]);
    }

    /**
     * Budget circuit breaker: may the establishment spend $estimatedUsd more?
     * Checked BEFORE every LLM call (plan-masse §4).
     */
    public function allowsSpending(int $etablissementId, float $estimatedUsd): bool
    {
        $row = $this->find($etablissementId);
        if ($row === null) {
            return false; // no configuration -> no platform spending
        }

        return (float) $row['spent_usd'] + $estimatedUsd <= (float) $row['budget_cap_usd'];
    }
}
