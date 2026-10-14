<?php

declare(strict_types=1);

namespace Humanome\Share;

use PDO;

/**
 * Employer share links (P8, cahier §3.6): explicit individual decision,
 * link + password, expiration, revocation.
 *
 * Storage keeps HASHES ONLY (migration 004): the URL token is stored as
 * sha256(token) — the clear token appears exactly once, in the 201 response
 * of the creation — and the password as password_hash() (Argon2id). Neither
 * is ever recoverable from the database or the logs.
 */
final class ShareLinks
{
    /** Clear token length: 16 random bytes -> 32 hex chars (M6 contract). */
    private const TOKEN_BYTES = 16;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Creates a link on a cartography (ownership checked by the caller).
     * $password null = lien SANS mot de passe (réservé aux versions partagées
     * de l'interface ultime, §12 — la route l'impose) : password_hash NULL.
     *
     * @return array{shareId: int, token: string}
     */
    public function create(int $cartographieId, ?string $password, int $expiresInDays): array
    {
        $token = bin2hex(random_bytes(self::TOKEN_BYTES));
        $stmt = $this->pdo->prepare(
            'INSERT INTO share_links (cartographie_id, token_hash, password_hash, expires_at)
             VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))'
        );
        $stmt->execute([
            $cartographieId,
            hash('sha256', $token),
            $password === null ? null : password_hash($password, PASSWORD_ARGON2ID),
            $expiresInDays,
        ]);

        return ['shareId' => (int) $this->pdo->lastInsertId(), 'token' => $token];
    }

    /**
     * Links of one cartography (ownership checked by the caller).
     *
     * @return list<array<string, mixed>>
     */
    public function listForCartography(int $cartographieId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, created_at, expires_at, revoked_at
               FROM share_links WHERE cartographie_id = ? ORDER BY id'
        );
        $stmt->execute([$cartographieId]);

        return array_map(static fn (array $row): array => [
            'shareId' => (int) $row['id'],
            'createdAt' => self::iso($row['created_at']),
            'expiresAt' => self::iso($row['expires_at']),
            'revokedAt' => self::iso($row['revoked_at']),
        ], $stmt->fetchAll());
    }

    /**
     * Revocation (revoked_at, kept as an auditable dated fact — the row only
     * disappears with its cartography or account). Owner-scoped through the
     * cartography join: a foreign shareId behaves like a missing one.
     *
     * @return array{shareId: int, cartographieId: int}|null null = not found/not owned
     */
    public function revokeForUser(int $shareId, int $userId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT s.id, s.cartographie_id, s.revoked_at
               FROM share_links s
               JOIN cartographies c ON c.id = s.cartographie_id
              WHERE s.id = ? AND c.user_id = ?'
        );
        $stmt->execute([$shareId, $userId]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }

        if ($row['revoked_at'] === null) {
            $this->pdo->prepare('UPDATE share_links SET revoked_at = NOW() WHERE id = ?')
                ->execute([$shareId]);
        }

        return ['shareId' => (int) $row['id'], 'cartographieId' => (int) $row['cartographie_id']];
    }

    /**
     * Journal des accès d'un lien (§12.1), pour son seul auteur : dates des
     * consultations réussies (événements d'audit `share_consulted`, qui ne
     * portent que des ids — ni IP, ni navigateur, ni identité). Null si le
     * lien n'existe pas ou n'est pas à cet utilisateur (404 homogène).
     *
     * @return array{shareId: int, withPassword: bool, count: int, lastAt: ?string, items: list<array{at: string}>}|null
     */
    public function consultationsForUser(int $shareId, int $userId, int $limit = 200): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT s.id, (s.password_hash IS NOT NULL) AS with_password
               FROM share_links s
               JOIN cartographies c ON c.id = s.cartographie_id
              WHERE s.id = ? AND c.user_id = ?'
        );
        $stmt->execute([$shareId, $userId]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }

        $where = "FROM audit_events
              WHERE type = 'share_consulted'
                AND CAST(JSON_UNQUOTE(JSON_EXTRACT(details, '$.shareLinkId')) AS UNSIGNED) = ?";
        $count = $this->pdo->prepare('SELECT COUNT(*), MAX(created_at) ' . $where);
        $count->execute([$shareId]);
        [$total, $last] = $count->fetch(PDO::FETCH_NUM);

        $items = $this->pdo->prepare('SELECT created_at ' . $where . ' ORDER BY created_at DESC, id DESC LIMIT ' . max(1, $limit));
        $items->execute([$shareId]);

        return [
            'shareId' => (int) $row['id'],
            'withPassword' => (bool) $row['with_password'],
            'count' => (int) $total,
            'lastAt' => self::iso($last),
            'items' => array_map(
                static fn (mixed $at): array => ['at' => (string) self::iso($at)],
                $items->fetchAll(PDO::FETCH_COLUMN),
            ),
        ];
    }

    /**
     * Public consultation lookup. Returns the row with its cartography fields
     * REGARDLESS of expiration/revocation: the route collapses every failure
     * mode (unknown, expired, revoked) into one homogeneous 404 and decides
     * with isConsultable() — no state oracle for enumeration.
     *
     * @return array<string, mixed>|null
     */
    public function findByToken(string $token): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT s.id, s.cartographie_id, s.password_hash, s.expires_at, s.revoked_at,
                    (s.expires_at IS NOT NULL AND s.expires_at <= NOW()) AS expired,
                    c.titre, c.type, c.document
               FROM share_links s
               JOIN cartographies c ON c.id = s.cartographie_id
              WHERE s.token_hash = ?'
        );
        $stmt->execute([hash('sha256', $token)]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /** @param array<string, mixed> $row row from findByToken() */
    public static function isConsultable(array $row): bool
    {
        return $row['revoked_at'] === null && !((bool) $row['expired']);
    }

    private static function iso(mixed $datetime): ?string
    {
        return $datetime === null ? null : str_replace(' ', 'T', (string) $datetime);
    }
}
