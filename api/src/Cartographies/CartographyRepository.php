<?php

declare(strict_types=1);

namespace Humanome\Cartographies;

use PDO;

/**
 * Server-side storage of cartographies (P8, cahier §3.2, §6).
 *
 * RGPD invariant (§6.2): a row only exists because the learner explicitly
 * asked for a server copy — POST /api/cartographies IS the opt-in, so every
 * INSERT stamps opt_in_at = NOW(). The list projection NEVER carries the
 * document (metadata only); the document travels solely on the single-item
 * GET, owner-authenticated.
 *
 * Ownership is enforced here: every query is scoped by user_id, and a
 * non-owned id behaves exactly like a missing one (404 upstream — no
 * existence oracle).
 */
final class CartographyRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Opt-in server copy. $document/$runMeta are decoded JSON structures.
     *
     * @param array<string, mixed> $document
     * @param array<string, mixed>|null $runMeta
     */
    public function create(
        int $userId,
        string $type,
        string $titre,
        string $visibility,
        array $document,
        ?int $promptVersionId,
        ?int $referentielVersionId,
        ?array $runMeta,
    ): int {
        $stmt = $this->pdo->prepare(
            'INSERT INTO cartographies
                (user_id, type, titre, visibility, document, opt_in_at,
                 prompt_version_id, referentiel_version_id, run_meta)
             VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?)'
        );
        $stmt->execute([
            $userId,
            $type,
            $titre,
            $visibility,
            json_encode($document, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $promptVersionId,
            $referentielVersionId,
            $runMeta === null
                ? null
                : json_encode($runMeta, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * Metadata list — NEVER the document (contract M6). `shares` counts the
     * ACTIVE share links (not revoked, not expired).
     *
     * @return list<array<string, mixed>>
     */
    public function listForUser(int $userId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT c.id, c.type, c.titre, c.visibility, c.created_at, c.updated_at,
                    (c.document IS NOT NULL) AS has_document,
                    (SELECT COUNT(*) FROM share_links s
                      WHERE s.cartographie_id = c.id
                        AND s.revoked_at IS NULL
                        AND (s.expires_at IS NULL OR s.expires_at > NOW())) AS shares
               FROM cartographies c
              WHERE c.user_id = ?
              ORDER BY c.updated_at DESC, c.id DESC'
        );
        $stmt->execute([$userId]);

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'type' => (string) $row['type'],
            'titre' => (string) $row['titre'],
            'visibility' => (string) $row['visibility'],
            'createdAt' => self::iso($row['created_at']),
            'updatedAt' => self::iso($row['updated_at']),
            'hasDocument' => (bool) $row['has_document'],
            'shares' => (int) $row['shares'],
        ], $stmt->fetchAll());
    }

    /**
     * Versions partagées du compte (interface ultime, §12), sans document,
     * avec leur garantie quand un cartographe les a publiées à la demande de
     * l'apprenant (journal D-42) : {par, date} ou null.
     *
     * @return list<array<string, mixed>>
     */
    public function listSharedVersionsForUser(int $userId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT c.id, c.titre, c.created_at, c.updated_at,
                    (SELECT COUNT(*) FROM share_links s
                      WHERE s.cartographie_id = c.id
                        AND s.revoked_at IS NULL
                        AND (s.expires_at IS NULL OR s.expires_at > NOW())) AS shares,
                    g.par AS garantie_par, g.created_at AS garantie_at
               FROM cartographies c
               LEFT JOIN cartography_garanties g ON g.cartographie_id = c.id
              WHERE c.user_id = ? AND c.type = 'partage'
              ORDER BY c.updated_at DESC, c.id DESC"
        );
        $stmt->execute([$userId]);

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'type' => 'partage',
            'titre' => (string) $row['titre'],
            'createdAt' => self::iso($row['created_at']),
            'updatedAt' => self::iso($row['updated_at']),
            'shares' => (int) $row['shares'],
            'garantie' => $row['garantie_par'] === null
                ? null
                : ['par' => (string) $row['garantie_par'], 'date' => self::iso($row['garantie_at'])],
        ], $stmt->fetchAll());
    }

    /**
     * Full cartography (document included) — owner only.
     *
     * @return array<string, mixed>|null
     */
    public function findForUser(int $id, int $userId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT c.*,
                    pp.slug AS package_slug, pv.semver AS package_semver,
                    rv.referentiel_id AS ref_id, rv.semver AS ref_semver,
                    (SELECT COUNT(*) FROM share_links s
                      WHERE s.cartographie_id = c.id
                        AND s.revoked_at IS NULL
                        AND (s.expires_at IS NULL OR s.expires_at > NOW())) AS shares
               FROM cartographies c
               LEFT JOIN prompt_versions pv ON pv.id = c.prompt_version_id
               LEFT JOIN prompt_packages pp ON pp.id = pv.package_id
               LEFT JOIN referentiel_versions rv ON rv.id = c.referentiel_version_id
              WHERE c.id = ? AND c.user_id = ?'
        );
        $stmt->execute([$id, $userId]);
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
            'promptPackage' => $row['package_slug'] === null
                ? null
                : ['id' => (string) $row['package_slug'], 'version' => (string) $row['package_semver']],
            'referentiel' => $row['ref_id'] === null
                ? null
                : ['id' => (string) $row['ref_id'], 'version' => (string) $row['ref_semver']],
            'runMeta' => $row['run_meta'] === null ? null : json_decode((string) $row['run_meta'], true),
            'optInAt' => self::iso($row['opt_in_at']),
            'createdAt' => self::iso($row['created_at']),
            'updatedAt' => self::iso($row['updated_at']),
            'shares' => (int) $row['shares'],
        ];
    }

    /** PATCH {titre?, visibility?}. Returns false when not owned/missing. */
    public function updateForUser(int $id, int $userId, ?string $titre, ?string $visibility): bool
    {
        $sets = [];
        $params = [];
        if ($titre !== null) {
            $sets[] = 'titre = ?';
            $params[] = $titre;
        }
        if ($visibility !== null) {
            $sets[] = 'visibility = ?';
            $params[] = $visibility;
        }
        if ($sets === []) {
            // Nothing to change: report existence so the route can 200/404.
            return $this->ownedBy($id, $userId);
        }
        $params[] = $id;
        $params[] = $userId;
        $stmt = $this->pdo->prepare(
            'UPDATE cartographies SET ' . implode(', ', $sets) . ' WHERE id = ? AND user_id = ?'
        );
        $stmt->execute($params);

        return $stmt->rowCount() > 0 || $this->ownedBy($id, $userId);
    }

    /**
     * Nouvelle version partagée publiée À LA PLACE d'une autre (décision du
     * 2026-10-14, journal D-33) : le document et son titre sont remplacés, les
     * liens et le journal des accès restent. L'ancien document est effacé.
     * Faux si la version n'existe pas, n'est pas au compte ou n'est pas une
     * version partagée.
     *
     * @param array<string, mixed> $document
     */
    public function replaceSharedDocument(int $id, int $userId, string $titre, array $document): bool
    {
        $stmt = $this->pdo->prepare(
            "UPDATE cartographies SET document = ?, titre = ?, updated_at = NOW()
              WHERE id = ? AND user_id = ? AND type = 'partage'"
        );
        $stmt->execute([
            json_encode($document, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $titre,
            $id,
            $userId,
        ]);

        return $stmt->rowCount() > 0 || $this->typeOwnedBy($id, $userId) === 'partage';
    }

    /** Real purge: the row and its share_links (FK ON DELETE CASCADE, 004). */
    public function deleteForUser(int $id, int $userId): bool
    {
        $stmt = $this->pdo->prepare('DELETE FROM cartographies WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);

        return $stmt->rowCount() > 0;
    }

    /**
     * Efface toutes les versions partagées d'un compte (et leurs liens, par
     * clé étrangère) : retrait de l'attestation de majorité (§12 : « pour les
     * mineurs, ni copie serveur ni partage »). Renvoie le nombre de versions.
     */
    public function deleteSharedVersionsOf(int $userId): int
    {
        $stmt = $this->pdo->prepare("DELETE FROM cartographies WHERE user_id = ? AND type = 'partage'");
        $stmt->execute([$userId]);

        return $stmt->rowCount();
    }

    public function ownedBy(int $id, int $userId): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM cartographies WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);

        return $stmt->fetchColumn() !== false;
    }

    /** Type d'une cartographie possédée (null si absente ou d'un autre compte). */
    public function typeOwnedBy(int $id, int $userId): ?string
    {
        $stmt = $this->pdo->prepare('SELECT type FROM cartographies WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        $type = $stmt->fetchColumn();

        return $type === false ? null : (string) $type;
    }

    /** Published prompt-package version -> FK id (null when unknown). */
    public function resolvePromptVersion(string $packageId, string $semver): ?int
    {
        $stmt = $this->pdo->prepare(
            'SELECT pv.id FROM prompt_versions pv
               JOIN prompt_packages pp ON pp.id = pv.package_id
              WHERE pp.slug = ? AND pv.semver = ? AND pv.status = "published"'
        );
        $stmt->execute([$packageId, $semver]);
        $id = $stmt->fetchColumn();

        return $id === false ? null : (int) $id;
    }

    /** Published referentiel version -> FK id (null when unknown). */
    public function resolveReferentielVersion(string $referentielId, string $semver): ?int
    {
        $stmt = $this->pdo->prepare(
            'SELECT id FROM referentiel_versions
              WHERE referentiel_id = ? AND semver = ? AND status = "published"'
        );
        $stmt->execute([$referentielId, $semver]);
        $id = $stmt->fetchColumn();

        return $id === false ? null : (int) $id;
    }

    /** 'Y-m-d H:i:s' (MySQL DATETIME) -> ISO 8601 without timezone claim. */
    private static function iso(mixed $datetime): ?string
    {
        return $datetime === null ? null : str_replace(' ', 'T', (string) $datetime);
    }
}
