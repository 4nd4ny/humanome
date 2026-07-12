<?php

declare(strict_types=1);

namespace Humanome\Cartographe;

use PDO;

/**
 * Apprenant <-> cartographe links and the cartographe's reading queue
 * (P9, cahier §3.3).
 *
 * ACCESS INVARIANT (docs/autorisations.md): a cartographe only ever reaches
 * the cartographies of HIS OWN linked learners, and only those the learner
 * chose to expose (visibility 'cartographe' or 'publique'). Everything else
 * — unlinked learner, 'privee' visibility, unknown id — collapses into the
 * same 404 upstream (no existence oracle).
 */
final class Links
{
    /** Visibilities a linked cartographe may consult. */
    private const CONSULTABLE = "('cartographe','publique')";

    public function __construct(private readonly PDO $pdo)
    {
    }

    public function isLinked(int $apprenantId, int $cartographeId): bool
    {
        $stmt = $this->pdo->prepare(
            'SELECT 1 FROM cartographe_links WHERE apprenant_id = ? AND cartographe_id = ?'
        );
        $stmt->execute([$apprenantId, $cartographeId]);

        return $stmt->fetchColumn() !== false;
    }

    /**
     * The cartographe's linked learners.
     *
     * @return list<array<string, mixed>>
     */
    public function apprentisOf(int $cartographeId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT u.id, u.display_name, l.created_at
               FROM cartographe_links l
               JOIN users u ON u.id = l.apprenant_id
              WHERE l.cartographe_id = ?
              ORDER BY u.display_name, u.id'
        );
        $stmt->execute([$cartographeId]);

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'displayName' => (string) $row['display_name'],
            'linkedAt' => self::iso($row['created_at']),
        ], $stmt->fetchAll());
    }

    /**
     * Reading queue: metadata (NEVER the documents) of the cartographies of
     * the linked learners, in consultable visibility.
     *
     * @return list<array<string, mixed>>
     */
    public function queueFor(int $cartographeId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT c.id, c.type, c.titre, c.visibility, c.created_at, c.updated_at,
                    u.id AS apprenant_id, u.display_name AS apprenant_name,
                    (SELECT COUNT(*) FROM cartography_annotations a
                      WHERE a.cartographie_id = c.id) AS annotations,
                    (SELECT COUNT(*) FROM cartography_revisions r
                      WHERE r.cartographie_id = c.id) AS revisions,
                    g.par AS garantie_par, g.created_at AS garantie_at
               FROM cartographe_links l
               JOIN cartographies c ON c.user_id = l.apprenant_id
               JOIN users u ON u.id = l.apprenant_id
               LEFT JOIN cartography_garanties g ON g.cartographie_id = c.id
              WHERE l.cartographe_id = ?
                AND c.visibility IN ' . self::CONSULTABLE . '
              ORDER BY c.updated_at DESC, c.id DESC'
        );
        $stmt->execute([$cartographeId]);

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'type' => (string) $row['type'],
            'titre' => (string) $row['titre'],
            'visibility' => (string) $row['visibility'],
            'createdAt' => self::iso($row['created_at']),
            'updatedAt' => self::iso($row['updated_at']),
            'apprenant' => [
                'id' => (int) $row['apprenant_id'],
                'displayName' => (string) $row['apprenant_name'],
            ],
            'annotations' => (int) $row['annotations'],
            'revisions' => (int) $row['revisions'],
            'garantie' => $row['garantie_par'] === null
                ? null
                : ['par' => (string) $row['garantie_par'], 'date' => self::iso($row['garantie_at'])],
        ], $stmt->fetchAll());
    }

    /**
     * Full cartography (document included) as seen by a LINKED cartographe.
     * Null when unknown, not linked, or not in a consultable visibility —
     * indistinguishable cases by design.
     *
     * @return array<string, mixed>|null
     */
    public function findForCartographe(int $cartoId, int $cartographeId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT c.id, c.type, c.titre, c.visibility, c.document,
                    c.created_at, c.updated_at,
                    u.id AS apprenant_id, u.display_name AS apprenant_name
               FROM cartographies c
               JOIN cartographe_links l
                 ON l.apprenant_id = c.user_id AND l.cartographe_id = ?
               JOIN users u ON u.id = c.user_id
              WHERE c.id = ?
                AND c.visibility IN ' . self::CONSULTABLE
        );
        $stmt->execute([$cartographeId, $cartoId]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'type' => (string) $row['type'],
            'titre' => (string) $row['titre'],
            'visibility' => (string) $row['visibility'],
            'document' => $row['document'] === null ? null : json_decode((string) $row['document'], true),
            'createdAt' => self::iso($row['created_at']),
            'updatedAt' => self::iso($row['updated_at']),
            'apprenant' => [
                'id' => (int) $row['apprenant_id'],
                'displayName' => (string) $row['apprenant_name'],
            ],
        ];
    }

    /**
     * Access of a user on a cartography for the review routes (annotations /
     * revisions / garantie): level 'owner', or 'cartographe' (linked,
     * consultable visibility, cartographe role), with the cartography type.
     * Null = no access, indistinguishable from a missing id upstream.
     *
     * @param list<string> $roles roles from RequireRole
     * @return array{level: string, type: string}|null
     */
    public function access(int $cartoId, int $userId, array $roles): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT c.user_id, c.visibility, c.type,
                    (l.cartographe_id IS NOT NULL) AS linked
               FROM cartographies c
               LEFT JOIN cartographe_links l
                 ON l.apprenant_id = c.user_id AND l.cartographe_id = ?
              WHERE c.id = ?'
        );
        $stmt->execute([$userId, $cartoId]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }
        if ((int) $row['user_id'] === $userId) {
            return ['level' => 'owner', 'type' => (string) $row['type']];
        }
        if (
            \in_array('cartographe', $roles, true)
            && (bool) $row['linked']
            && \in_array((string) $row['visibility'], ['cartographe', 'publique'], true)
        ) {
            return ['level' => 'cartographe', 'type' => (string) $row['type']];
        }

        return null;
    }

    private static function iso(mixed $datetime): ?string
    {
        return $datetime === null ? null : str_replace(' ', 'T', (string) $datetime);
    }
}
