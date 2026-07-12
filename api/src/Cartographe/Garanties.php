<?php

declare(strict_types=1);

namespace Humanome\Cartographe;

use PDO;

/**
 * The garantie (P9, cahier §3.3, §8): the dated HUMAN signature of the
 * linked cartographe — the mandatory safeguard against a 100%-automated
 * cartography presented as validated.
 *
 * Frozen state: {par: display name at signature time, date, revisionId}.
 * revisionId (nullable = the base document) pins WHICH document is
 * guaranteed; the public share endpoint serves THAT document. One garantie
 * per cartography (UNIQUE key); posting a new revision removes it
 * (Revisions::create).
 */
final class Garanties
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array<string, mixed>|null the standing garantie of a cartography */
    public function findForCartography(int $cartoId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, cartographe_id, revision_id, par, created_at
               FROM cartography_garanties WHERE cartographie_id = ?'
        );
        $stmt->execute([$cartoId]);
        $row = $stmt->fetch();

        return $row === false ? null : self::shape($row);
    }

    /**
     * Poses (or re-poses) the garantie. The caller has already checked that
     * the poser is a LINKED cartographe and that $revisionId (when given)
     * belongs to the cartography. Returns null when a garantie by ANOTHER
     * cartographe already stands (409 upstream: one human signature is not
     * silently replaced by another's); the SAME cartographe re-posing
     * replaces their own signature.
     *
     * @return array<string, mixed>|null the frozen garantie
     */
    public function pose(int $cartoId, int $cartographeId, string $displayName, ?int $revisionId): ?array
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                'SELECT id, cartographe_id FROM cartography_garanties
                  WHERE cartographie_id = ? FOR UPDATE'
            );
            $stmt->execute([$cartoId]);
            $existing = $stmt->fetch();
            if ($existing !== false && (int) $existing['cartographe_id'] !== $cartographeId) {
                $this->pdo->rollBack();

                return null;
            }
            if ($existing !== false) {
                $this->pdo->prepare('DELETE FROM cartography_garanties WHERE id = ?')
                    ->execute([(int) $existing['id']]);
            }

            $insert = $this->pdo->prepare(
                'INSERT INTO cartography_garanties (cartographie_id, cartographe_id, revision_id, par)
                 VALUES (?, ?, ?, ?)'
            );
            $insert->execute([$cartoId, $cartographeId, $revisionId, $displayName]);

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        $garantie = $this->findForCartography($cartoId);
        \assert($garantie !== null);

        return $garantie;
    }

    /**
     * Withdrawal by THE SAME cartographe only (M7 contract). Returns false
     * when no garantie stands or it belongs to another cartographe.
     */
    public function withdraw(int $cartoId, int $cartographeId): bool
    {
        $stmt = $this->pdo->prepare(
            'DELETE FROM cartography_garanties
              WHERE cartographie_id = ? AND cartographe_id = ?'
        );
        $stmt->execute([$cartoId, $cartographeId]);

        return $stmt->rowCount() > 0;
    }

    /**
     * Garantie attached to a share link, with the guaranteed revision's
     * document when one is pinned (public endpoint POST /api/share/{token}).
     *
     * @return array{garantie: array<string, mixed>, revisionDocument: array<string, mixed>|null}|null
     */
    public function forShareLink(int $shareLinkId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT g.id, g.cartographe_id, g.revision_id, g.par, g.created_at,
                    r.document AS revision_document
               FROM share_links s
               JOIN cartography_garanties g ON g.cartographie_id = s.cartographie_id
               LEFT JOIN cartography_revisions r ON r.id = g.revision_id
              WHERE s.id = ?'
        );
        $stmt->execute([$shareLinkId]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }

        return [
            'garantie' => self::shape($row),
            'revisionDocument' => $row['revision_document'] === null
                ? null
                : json_decode((string) $row['revision_document'], true),
        ];
    }

    /**
     * Public shape of the frozen state (M7 contract): {par, date, revisionId}.
     *
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private static function shape(array $row): array
    {
        return [
            'par' => (string) $row['par'],
            'date' => str_replace(' ', 'T', (string) $row['created_at']),
            'revisionId' => $row['revision_id'] === null ? null : (int) $row['revision_id'],
        ];
    }
}
