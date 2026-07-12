<?php

declare(strict_types=1);

namespace Humanome\Keys;

use PDO;

/**
 * Per-user LLM API keys, encrypted at rest (AD-4, cahier §6.2).
 *
 * Cipher: sodium crypto_secretbox (XSalsa20-Poly1305). The master key comes
 * from the environment (SODIUM_MASTER_KEY, 64 hex chars = 32 bytes, stored in
 * ~/app/shared/.env outside the webroot in production). Each entry gets its
 * own random 24-byte nonce, stored as the prefix of the encrypted_key BLOB:
 *
 *     encrypted_key = nonce (24 bytes) || secretbox(apiKey, nonce, masterKey)
 *
 * The clear key is returned by GET /api/keys/{provider} to the authenticated
 * OWNER ONLY: that is the AD-4 synchronization — the cartography run executes
 * in the learner's browser (ADR-001) and needs the key client-side. The list
 * endpoint never carries key material, and nothing here is ever logged.
 */
final class KeyVault
{
    /** Providers accepted for storage — mirror of the engine abstraction. */
    public const PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter', 'xai', 'ollama', 'mock'];

    public function __construct(private readonly PDO $pdo, private readonly string $masterKey)
    {
    }

    /**
     * Master key from SODIUM_MASTER_KEY (64 hex chars), null when absent or
     * malformed — routes answer an explicit 503 in that case.
     */
    public static function masterKeyFromEnv(): ?string
    {
        $hex = \Humanome\Env::get('SODIUM_MASTER_KEY');
        if (!\is_string($hex) || preg_match('/^[0-9a-fA-F]{64}$/', $hex) !== 1) {
            return null;
        }
        $binary = sodium_hex2bin($hex);

        return \strlen($binary) === SODIUM_CRYPTO_SECRETBOX_KEYBYTES ? $binary : null;
    }

    /** Encrypt + upsert. created_at reflects the LAST write of the entry. */
    public function store(int $userId, string $provider, string $apiKey): void
    {
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $blob = $nonce . sodium_crypto_secretbox($apiKey, $nonce, $this->masterKey);
        sodium_memzero($apiKey);

        $stmt = $this->pdo->prepare(
            'INSERT INTO user_api_keys (user_id, provider, encrypted_key, created_at)
             VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE encrypted_key = VALUES(encrypted_key), created_at = NOW()'
        );
        $stmt->execute([$userId, $provider, $blob]);
    }

    /**
     * Providers stored for the user — NEVER any key material (M6 contract).
     *
     * @return list<array{provider: string, createdAt: string}>
     */
    public function listForUser(int $userId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT provider, created_at FROM user_api_keys WHERE user_id = ? ORDER BY provider'
        );
        $stmt->execute([$userId]);

        return array_map(static fn (array $row): array => [
            'provider' => (string) $row['provider'],
            'createdAt' => str_replace(' ', 'T', (string) $row['created_at']),
        ], $stmt->fetchAll());
    }

    /**
     * Decrypted key of the authenticated owner (AD-4 synchronization).
     * Null: no entry, or ciphertext that no longer authenticates (rotated
     * master key, truncated blob) — callers answer 404 either way.
     */
    public function reveal(int $userId, string $provider): ?string
    {
        $stmt = $this->pdo->prepare(
            'SELECT encrypted_key FROM user_api_keys WHERE user_id = ? AND provider = ?'
        );
        $stmt->execute([$userId, $provider]);
        $blob = $stmt->fetchColumn();
        if (!\is_string($blob) || \strlen($blob) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
            return null;
        }

        $nonce = substr($blob, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $cipher = substr($blob, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $clear = sodium_crypto_secretbox_open($cipher, $nonce, $this->masterKey);

        return $clear === false ? null : $clear;
    }

    /** Real deletion of the entry. False when nothing was stored. */
    public function delete(int $userId, string $provider): bool
    {
        $stmt = $this->pdo->prepare(
            'DELETE FROM user_api_keys WHERE user_id = ? AND provider = ?'
        );
        $stmt->execute([$userId, $provider]);

        return $stmt->rowCount() > 0;
    }
}
