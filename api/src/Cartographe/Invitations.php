<?php

declare(strict_types=1);

namespace Humanome\Cartographe;

use PDO;

/**
 * Learner -> cartographe invitation codes (P9, cahier §3.3).
 *
 * The LEARNER creates a short-lived code (10 chars, alphabet A-Z2-9,
 * 30 days) and hands it to the cartographe of their choice — typically a
 * peer of the RESPIRE micro-class. Accepting the code creates the
 * apprenant<->cartographe link (cartographe_links). Codes are single-use.
 */
final class Invitations
{
    /** Unambiguous alphabet (M7 contract): A-Z and 2-9, no 0/1. */
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';
    private const CODE_LENGTH = 10;
    private const VALIDITY_DAYS = 30;

    /** Anti-flood: pending (non-accepted, non-expired) codes per learner. */
    public const MAX_PENDING = 10;

    public function __construct(private readonly PDO $pdo)
    {
    }

    public static function isWellFormedCode(string $code): bool
    {
        return preg_match('/^[A-Z2-9]{10}$/', $code) === 1;
    }

    /** @return array{code: string, expiresAt: string} */
    public function create(int $apprenantId): array
    {
        // Collision on 34^10 codes is cosmically unlikely; retry regardless.
        for ($attempt = 0; ; $attempt++) {
            $code = self::randomCode();
            try {
                $stmt = $this->pdo->prepare(
                    'INSERT INTO cartographe_invitations (apprenant_id, code, expires_at)
                     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))'
                );
                $stmt->execute([$apprenantId, $code, self::VALIDITY_DAYS]);
                break;
            } catch (\PDOException $e) {
                if ($attempt >= 3 || ($e->errorInfo[1] ?? 0) !== 1062) { // 1062 = duplicate key
                    throw $e;
                }
            }
        }

        $stmt = $this->pdo->prepare(
            'SELECT expires_at FROM cartographe_invitations WHERE code = ?'
        );
        $stmt->execute([$code]);

        return ['code' => $code, 'expiresAt' => self::iso($stmt->fetchColumn())];
    }

    public function countPending(int $apprenantId): int
    {
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(*) FROM cartographe_invitations
              WHERE apprenant_id = ? AND accepted_at IS NULL AND expires_at > NOW()'
        );
        $stmt->execute([$apprenantId]);

        return (int) $stmt->fetchColumn();
    }

    /**
     * The learner's codes with their computed status.
     *
     * @return list<array<string, mixed>>
     */
    public function listForApprenant(int $apprenantId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT i.code, i.created_at, i.expires_at, i.accepted_at,
                    (i.expires_at <= NOW()) AS expired,
                    u.display_name AS accepted_by_name
               FROM cartographe_invitations i
               LEFT JOIN users u ON u.id = i.accepted_by
              WHERE i.apprenant_id = ?
              ORDER BY i.id DESC'
        );
        $stmt->execute([$apprenantId]);

        return array_map(static fn (array $row): array => [
            'code' => (string) $row['code'],
            'statut' => $row['accepted_at'] !== null
                ? 'acceptee'
                : ((bool) $row['expired'] ? 'expiree' : 'en_attente'),
            'createdAt' => self::iso($row['created_at']),
            'expiresAt' => self::iso($row['expires_at']),
            'acceptedAt' => self::iso($row['accepted_at']),
            'acceptedBy' => $row['accepted_by_name'] === null ? null : (string) $row['accepted_by_name'],
        ], $stmt->fetchAll());
    }

    /**
     * Accepts a code as a cartographe: marks the invitation used and creates
     * the apprenant<->cartographe link. Returns the linked learner, or null
     * when the code is unknown, expired or already used (ONE homogeneous
     * failure — no invitation-state oracle), or points at the accepter
     * themselves (no self-link).
     *
     * @return array{id: int, displayName: string}|null
     */
    public function accept(string $code, int $cartographeId): ?array
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                'SELECT i.id, i.apprenant_id, u.display_name
                   FROM cartographe_invitations i
                   JOIN users u ON u.id = i.apprenant_id
                  WHERE i.code = ? AND i.accepted_at IS NULL AND i.expires_at > NOW()
                  FOR UPDATE'
            );
            $stmt->execute([$code]);
            $row = $stmt->fetch();
            if ($row === false || (int) $row['apprenant_id'] === $cartographeId) {
                $this->pdo->rollBack();

                return null;
            }

            $this->pdo->prepare(
                'UPDATE cartographe_invitations SET accepted_at = NOW(), accepted_by = ? WHERE id = ?'
            )->execute([$cartographeId, (int) $row['id']]);

            // Idempotent when the pair is already linked by an earlier code.
            $this->pdo->prepare(
                'INSERT IGNORE INTO cartographe_links (apprenant_id, cartographe_id) VALUES (?, ?)'
            )->execute([(int) $row['apprenant_id'], $cartographeId]);

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return ['id' => (int) $row['apprenant_id'], 'displayName' => (string) $row['display_name']];
    }

    private static function randomCode(): string
    {
        $code = '';
        $max = \strlen(self::ALPHABET) - 1;
        for ($i = 0; $i < self::CODE_LENGTH; $i++) {
            $code .= self::ALPHABET[random_int(0, $max)];
        }

        return $code;
    }

    private static function iso(mixed $datetime): ?string
    {
        return $datetime === null || $datetime === false
            ? null
            : str_replace(' ', 'T', (string) $datetime);
    }
}
