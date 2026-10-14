<?php

declare(strict_types=1);

namespace Humanome\Share;

use PDO;

/**
 * Demandes de publication garantie (interface ultime de cartographie,
 * décision du 2026-10-14, journal D-42 ; migration 023).
 *
 * L'apprenant ADULTE crée un code à usage unique (10 caractères A-Z2-9,
 * 30 jours) et le remet au cartographe de son choix — le modèle des
 * invitations (Cartographe\Invitations). Avec ce code, un compte cartographe
 * publie DANS LE COMPTE DE L'APPRENANT une version partagée qu'il a vérifiée,
 * avec sa garantie ; la demande est alors consommée (effacée). Une demande
 * peut viser une version existante (« à la place de ») : elle disparaît avec
 * elle (clé étrangère).
 *
 * Aucun oracle : un code inconnu, expiré, consommé ou qui désigne le
 * cartographe lui-même donne la même absence (404 en amont).
 */
final class PublicationRequests
{
    /** Alphabet sans ambiguïté (contrat des invitations) : A-Z et 2-9, ni 0 ni 1. */
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';
    private const CODE_LENGTH = 10;
    public const VALIDITY_DAYS = 30;

    /** Anti-abus : demandes en attente (non expirées) par apprenant. */
    public const MAX_PENDING = 5;

    public function __construct(private readonly PDO $pdo)
    {
    }

    public static function isWellFormedCode(string $code): bool
    {
        return preg_match('/^[A-Z2-9]{10}$/', $code) === 1;
    }

    /**
     * Nouvelle demande. L'appelant a vérifié l'attestation de l'apprenant et,
     * pour $replacesId, qu'il s'agit d'une de ses versions partagées.
     *
     * @return array{code: string, createdAt: string, expiresAt: string, replaces: array{id: int, titre: string}|null}
     */
    public function create(int $apprenantId, ?int $replacesId): array
    {
        for ($attempt = 0; ; $attempt++) {
            $code = self::randomCode();
            try {
                $this->pdo->prepare(
                    'INSERT INTO carto_publication_requests (apprenant_id, code, replaces_id, expires_at)
                     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))'
                )->execute([$apprenantId, $code, $replacesId, self::VALIDITY_DAYS]);
                break;
            } catch (\PDOException $e) {
                if ($attempt >= 3 || ($e->errorInfo[1] ?? 0) !== 1062) { // 1062 = clé en double
                    throw $e;
                }
            }
        }

        $created = $this->listForApprenant($apprenantId, $code);
        \assert($created !== []);

        return $created[0];
    }

    public function countPending(int $apprenantId): int
    {
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(*) FROM carto_publication_requests WHERE apprenant_id = ? AND expires_at > NOW()'
        );
        $stmt->execute([$apprenantId]);

        return (int) $stmt->fetchColumn();
    }

    /**
     * Demandes en attente de l'apprenant (les expirées sont effacées au
     * passage), la plus récente d'abord.
     *
     * @return list<array{code: string, createdAt: string, expiresAt: string, replaces: array{id: int, titre: string}|null}>
     */
    public function listForApprenant(int $apprenantId, ?string $onlyCode = null): array
    {
        $this->pdo->prepare('DELETE FROM carto_publication_requests WHERE apprenant_id = ? AND expires_at <= NOW()')
            ->execute([$apprenantId]);
        $stmt = $this->pdo->prepare(
            'SELECT r.code, r.created_at, r.expires_at, r.replaces_id, c.titre AS replaces_titre
               FROM carto_publication_requests r
               LEFT JOIN cartographies c ON c.id = r.replaces_id
              WHERE r.apprenant_id = ?' . ($onlyCode === null ? '' : ' AND r.code = ?') . '
              ORDER BY r.id DESC'
        );
        $stmt->execute($onlyCode === null ? [$apprenantId] : [$apprenantId, $onlyCode]);

        return array_map(static fn (array $row): array => [
            'code' => (string) $row['code'],
            'createdAt' => self::iso($row['created_at']),
            'expiresAt' => self::iso($row['expires_at']),
            'replaces' => $row['replaces_id'] === null
                ? null
                : ['id' => (int) $row['replaces_id'], 'titre' => (string) $row['replaces_titre']],
        ], $stmt->fetchAll());
    }

    /** Annulation par l'apprenant. Faux si le code n'est pas une de ses demandes. */
    public function cancel(int $apprenantId, string $code): bool
    {
        $stmt = $this->pdo->prepare('DELETE FROM carto_publication_requests WHERE apprenant_id = ? AND code = ?');
        $stmt->execute([$apprenantId, $code]);

        return $stmt->rowCount() > 0;
    }

    /** Toutes les demandes d'un apprenant (retrait de son attestation). */
    public function deleteForApprenant(int $apprenantId): int
    {
        $stmt = $this->pdo->prepare('DELETE FROM carto_publication_requests WHERE apprenant_id = ?');
        $stmt->execute([$apprenantId]);

        return $stmt->rowCount();
    }

    /**
     * La demande ouverte d'un code, vue par un cartographe : null si le code
     * est inconnu, expiré, consommé, ou s'il désigne le cartographe lui-même
     * (on ne garantit jamais sa propre cartographie). `$lock` : verrou de la
     * ligne (dans la transaction de la publication).
     *
     * @return array{id: int, code: string, apprenantId: int, apprenant: array{displayName: string},
     *   createdAt: string, expiresAt: string, replaces: array{id: int, titre: string}|null}|null
     */
    public function findOpen(string $code, int $cartographeId, bool $lock = false): ?array
    {
        if (!self::isWellFormedCode($code)) {
            return null;
        }
        $stmt = $this->pdo->prepare(
            'SELECT r.id, r.code, r.apprenant_id, r.created_at, r.expires_at, r.replaces_id,
                    u.display_name, c.titre AS replaces_titre
               FROM carto_publication_requests r
               JOIN users u ON u.id = r.apprenant_id
               LEFT JOIN cartographies c ON c.id = r.replaces_id
              WHERE r.code = ? AND r.expires_at > NOW()' . ($lock ? ' FOR UPDATE' : '')
        );
        $stmt->execute([$code]);
        $row = $stmt->fetch();
        if ($row === false || (int) $row['apprenant_id'] === $cartographeId) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'code' => (string) $row['code'],
            'apprenantId' => (int) $row['apprenant_id'],
            'apprenant' => ['displayName' => (string) $row['display_name']],
            'createdAt' => self::iso($row['created_at']),
            'expiresAt' => self::iso($row['expires_at']),
            'replaces' => $row['replaces_id'] === null
                ? null
                : ['id' => (int) $row['replaces_id'], 'titre' => (string) $row['replaces_titre']],
        ];
    }

    /** Demande honorée : effacée (usage unique). */
    public function consume(int $requestId): void
    {
        $this->pdo->prepare('DELETE FROM carto_publication_requests WHERE id = ?')->execute([$requestId]);
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

    private static function iso(mixed $datetime): string
    {
        return str_replace(' ', 'T', (string) $datetime);
    }
}
