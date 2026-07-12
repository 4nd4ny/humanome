<?php

declare(strict_types=1);

namespace Humanome\Cartographe;

use PDO;

/**
 * Per-competence annotations on a cartography (P9, cahier §3.3): the
 * cartographe's review trail — comment, hallucination report, omission
 * report — plus the owner's own remarks. Access (owner or linked
 * cartographe) is resolved upstream by Links::accessLevel().
 */
final class Annotations
{
    public const TYPES = ['commentaire', 'hallucination', 'oubli'];

    public function __construct(private readonly PDO $pdo)
    {
    }

    public function create(int $cartoId, int $authorId, string $competenceCode, string $type, string $texte): int
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO cartography_annotations
                (cartographie_id, author_id, competence_code, type, texte)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$cartoId, $authorId, $competenceCode, $type, $texte]);

        return (int) $this->pdo->lastInsertId();
    }

    /** @return list<array<string, mixed>> */
    public function listForCartography(int $cartoId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT a.id, a.competence_code, a.type, a.texte, a.created_at,
                    a.author_id, u.display_name AS author_name
               FROM cartography_annotations a
               JOIN users u ON u.id = a.author_id
              WHERE a.cartographie_id = ?
              ORDER BY a.id'
        );
        $stmt->execute([$cartoId]);

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'competenceCode' => (string) $row['competence_code'],
            'type' => (string) $row['type'],
            'texte' => (string) $row['texte'],
            'author' => [
                'id' => (int) $row['author_id'],
                'displayName' => (string) $row['author_name'],
            ],
            'createdAt' => self::iso($row['created_at']),
        ], $stmt->fetchAll());
    }

    /**
     * Deletion by its AUTHOR only (M7 contract). Returns false when the
     * annotation is missing or authored by someone else — same 404 upstream.
     */
    public function deleteForAuthor(int $annotationId, int $authorId): bool
    {
        $stmt = $this->pdo->prepare(
            'DELETE FROM cartography_annotations WHERE id = ? AND author_id = ?'
        );
        $stmt->execute([$annotationId, $authorId]);

        return $stmt->rowCount() > 0;
    }

    private static function iso(mixed $datetime): ?string
    {
        return $datetime === null ? null : str_replace(' ', 'T', (string) $datetime);
    }
}
