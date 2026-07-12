<?php

declare(strict_types=1);

namespace Humanome\Cartographe;

use PDO;

/**
 * Schema-validated revisions of a cartography document (P9, cahier §3.3):
 * the correction history. The route validates the document against
 * schemas/cartographie-<type> BEFORE calling create() — nothing lands here
 * unvalidated.
 *
 * SAFEGUARD (cahier §8, M7 contract): posting a new revision on a
 * guaranteed cartography REMOVES the garantie in the same transaction — a
 * modified cartography is never presented as guaranteed. The route records
 * the audit event when `garantieRemoved` comes back true.
 */
final class Revisions
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * @param array<string, mixed> $document already schema-validated
     * @return array{revisionId: int, garantieRemoved: bool}
     */
    public function create(int $cartoId, int $authorId, array $document, ?string $note): array
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                'INSERT INTO cartography_revisions (cartographie_id, author_id, document, note)
                 VALUES (?, ?, ?, ?)'
            );
            $stmt->execute([
                $cartoId,
                $authorId,
                json_encode($document, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                $note,
            ]);
            $revisionId = (int) $this->pdo->lastInsertId();

            // Cahier §8: the guaranteed state references a frozen revision —
            // any NEW revision invalidates the standing garantie.
            $drop = $this->pdo->prepare('DELETE FROM cartography_garanties WHERE cartographie_id = ?');
            $drop->execute([$cartoId]);
            $garantieRemoved = $drop->rowCount() > 0;

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return ['revisionId' => $revisionId, 'garantieRemoved' => $garantieRemoved];
    }

    /**
     * Revision metadata (NEVER the documents) of one cartography.
     *
     * @return list<array<string, mixed>>
     */
    public function listForCartography(int $cartoId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT r.id, r.note, r.created_at, r.author_id, u.display_name AS author_name
               FROM cartography_revisions r
               LEFT JOIN users u ON u.id = r.author_id
              WHERE r.cartographie_id = ?
              ORDER BY r.id DESC'
        );
        $stmt->execute([$cartoId]);

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'note' => $row['note'] === null ? null : (string) $row['note'],
            'author' => $row['author_id'] === null
                ? null // author purged: revision kept for the learner, anonymized
                : ['id' => (int) $row['author_id'], 'displayName' => (string) $row['author_name']],
            'createdAt' => self::iso($row['created_at']),
        ], $stmt->fetchAll());
    }

    /**
     * One revision with its document and its parent cartography id (for the
     * access check upstream).
     *
     * @return array<string, mixed>|null
     */
    public function find(int $revisionId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT r.id, r.cartographie_id, r.document, r.note, r.created_at,
                    r.author_id, u.display_name AS author_name
               FROM cartography_revisions r
               LEFT JOIN users u ON u.id = r.author_id
              WHERE r.id = ?'
        );
        $stmt->execute([$revisionId]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'cartographieId' => (int) $row['cartographie_id'],
            'document' => json_decode((string) $row['document'], true),
            'note' => $row['note'] === null ? null : (string) $row['note'],
            'author' => $row['author_id'] === null
                ? null
                : ['id' => (int) $row['author_id'], 'displayName' => (string) $row['author_name']],
            'createdAt' => self::iso($row['created_at']),
        ];
    }

    /** True when the revision belongs to the cartography (garantie POST). */
    public function belongsTo(int $revisionId, int $cartoId): bool
    {
        $stmt = $this->pdo->prepare(
            'SELECT 1 FROM cartography_revisions WHERE id = ? AND cartographie_id = ?'
        );
        $stmt->execute([$revisionId, $cartoId]);

        return $stmt->fetchColumn() !== false;
    }

    private static function iso(mixed $datetime): ?string
    {
        return $datetime === null ? null : str_replace(' ', 'T', (string) $datetime);
    }
}
