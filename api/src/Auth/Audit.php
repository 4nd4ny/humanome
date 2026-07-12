<?php

declare(strict_types=1);

namespace Humanome\Auth;

use PDO;

/**
 * Minimal RGPD audit trail (cahier §6.5): events and counters, never content.
 * `details` may hold tiny structured facts (ids, counts) — never portfolio or
 * cartography text. On account purge, user_id is set to NULL by the FK: the
 * trace stays dated but anonymous.
 */
final class Audit
{
    public const ACCOUNT_CREATED = 'account_created';
    public const ACCOUNT_DELETED = 'account_deleted';

    /** @param array<string, mixed>|null $details */
    public static function record(PDO $pdo, ?int $userId, string $type, ?array $details = null): void
    {
        $stmt = $pdo->prepare(
            'INSERT INTO audit_events (user_id, type, details) VALUES (?, ?, ?)'
        );
        $stmt->execute([
            $userId,
            $type,
            $details === null ? null : json_encode($details, JSON_THROW_ON_ERROR),
        ]);
    }
}
