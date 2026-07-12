<?php

declare(strict_types=1);

namespace Humanome\Etablissement;

use PDO;

/**
 * Cohortes, memberships (explicit consent) and deposited portfolios
 * (P11, docs/plan-masse.md §6-7).
 *
 * RGPD: joining stamps consent_at (the API layer requires the explicit
 * {"consentement": true} body); depositing a portfolio is the de-facto
 * opt-in to server-side processing; quitting purges membership + deposit
 * and cancels pending jobs — produced documents stay with the learner
 * (mass_jobs.user_id) but leave the establishment's reach (every read is
 * gated on an ACTIVE membership).
 */
final class CohorteRepository
{
    private const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789'; // Cartographe/Invitations pattern

    public function __construct(private readonly PDO $pdo)
    {
    }

    // ------------------------------------------------------------- cohortes

    /** @return array{id: int, codeInvitation: string} */
    public function create(int $etablissementId, string $nom): array
    {
        // Retry on the (unlikely) code collision — UNIQUE key is the referee.
        for ($attempt = 0; ; $attempt++) {
            $code = self::randomCode();
            try {
                $this->pdo->prepare(
                    'INSERT INTO cohortes (etablissement_id, nom, code_invitation) VALUES (?, ?, ?)'
                )->execute([$etablissementId, $nom, $code]);

                return ['id' => (int) $this->pdo->lastInsertId(), 'codeInvitation' => $code];
            } catch (\PDOException $e) {
                if ($attempt >= 4 || ($e->errorInfo[1] ?? 0) !== 1062) {
                    throw $e;
                }
            }
        }
    }

    /** @return list<array<string, mixed>> */
    public function listForEtablissement(int $etablissementId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT c.id, c.nom, c.code_invitation, c.created_at,
                    (SELECT COUNT(*) FROM cohorte_membres m WHERE m.cohorte_id = c.id) AS membres
               FROM cohortes c
              WHERE c.etablissement_id = ?
              ORDER BY c.id'
        );
        $stmt->execute([$etablissementId]);

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'nom' => (string) $row['nom'],
            'codeInvitation' => (string) $row['code_invitation'],
            'createdAt' => str_replace(' ', 'T', (string) $row['created_at']),
            'membres' => (int) $row['membres'],
        ], $stmt->fetchAll());
    }

    /**
     * Cohortes the learner has joined (espace apprenant « Mes cohortes ») :
     * consent date, establishment display name, deposit state — never the
     * invitation code (the learner has no reason to re-share it).
     *
     * @return list<array<string, mixed>>
     */
    public function listForLearner(int $userId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT c.id, c.nom, m.consent_at, u.display_name AS etablissement,
                    p.titre AS portfolio_titre, JSON_LENGTH(p.segments) AS portfolio_journees,
                    p.created_at AS portfolio_depose_le
               FROM cohorte_membres m
               JOIN cohortes c ON c.id = m.cohorte_id
               JOIN users u ON u.id = c.etablissement_id
               LEFT JOIN cohorte_portfolios p
                 ON p.cohorte_id = c.id AND p.user_id = m.user_id
              WHERE m.user_id = ?
              ORDER BY c.id'
        );
        $stmt->execute([$userId]);

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'nom' => (string) $row['nom'],
            'etablissement' => (string) $row['etablissement'],
            'joinedAt' => str_replace(' ', 'T', (string) $row['consent_at']),
            'portfolioDepose' => $row['portfolio_titre'] !== null,
            'portfolio' => $row['portfolio_titre'] === null ? null : [
                'titre' => (string) $row['portfolio_titre'],
                'journees' => (int) $row['portfolio_journees'],
                'deposeLe' => str_replace(' ', 'T', (string) $row['portfolio_depose_le']),
            ],
        ], $stmt->fetchAll());
    }

    /** Owned cohorte or null (foreign id answers null exactly like a missing one). */
    public function findForEtablissement(int $cohorteId, int $etablissementId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, nom, code_invitation, created_at FROM cohortes
              WHERE id = ? AND etablissement_id = ?'
        );
        $stmt->execute([$cohorteId, $etablissementId]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /**
     * Members with consent timestamp, deposit flag and job progress
     * (aggregated over every run of the cohorte).
     *
     * @return list<array<string, mixed>>
     */
    public function membersOf(int $cohorteId): array
    {
        // portfolio: the deposit DETAIL the establishment front needs to
        // select members and estimate a run (titre, day count, deposit size
        // in characters, deposit date) — never the deposited text itself.
        $stmt = $this->pdo->prepare(
            'SELECT m.user_id, u.display_name, m.consent_at,
                    p.titre AS portfolio_titre,
                    p.created_at AS portfolio_depose_le,
                    JSON_LENGTH(p.segments) AS portfolio_journees,
                    (CHAR_LENGTH(p.segments) + COALESCE(CHAR_LENGTH(p.texte), 0)) AS portfolio_taille,
                    (SELECT COUNT(*) FROM mass_jobs j JOIN mass_runs r ON r.id = j.run_id
                      WHERE r.cohorte_id = m.cohorte_id AND j.user_id = m.user_id) AS jobs_total,
                    (SELECT COUNT(*) FROM mass_jobs j JOIN mass_runs r ON r.id = j.run_id
                      WHERE r.cohorte_id = m.cohorte_id AND j.user_id = m.user_id
                        AND j.status = "done") AS jobs_done
               FROM cohorte_membres m
               JOIN users u ON u.id = m.user_id
               LEFT JOIN cohorte_portfolios p
                 ON p.cohorte_id = m.cohorte_id AND p.user_id = m.user_id
              WHERE m.cohorte_id = ?
              ORDER BY m.consent_at, m.user_id'
        );
        $stmt->execute([$cohorteId]);

        return array_map(static fn (array $row): array => [
            'userId' => (int) $row['user_id'],
            'displayName' => (string) $row['display_name'],
            'consentAt' => str_replace(' ', 'T', (string) $row['consent_at']),
            'portfolioDepose' => $row['portfolio_titre'] !== null,
            'portfolio' => $row['portfolio_titre'] === null ? null : [
                'titre' => (string) $row['portfolio_titre'],
                'journees' => (int) $row['portfolio_journees'],
                'taille' => (int) $row['portfolio_taille'],
                'deposeLe' => str_replace(' ', 'T', (string) $row['portfolio_depose_le']),
            ],
            'avancement' => [
                'jobsTotal' => (int) $row['jobs_total'],
                'jobsDone' => (int) $row['jobs_done'],
            ],
        ], $stmt->fetchAll());
    }

    /** Real purge (memberships, deposits, runs and jobs die by FK). */
    public function deleteForEtablissement(int $cohorteId, int $etablissementId): bool
    {
        $stmt = $this->pdo->prepare('DELETE FROM cohortes WHERE id = ? AND etablissement_id = ?');
        $stmt->execute([$cohorteId, $etablissementId]);

        return $stmt->rowCount() > 0;
    }

    // ------------------------------------------------------ learner side

    /** @return array{id: int, nom: string}|null cohorte for an invitation code */
    public function findByCode(string $code): ?array
    {
        $stmt = $this->pdo->prepare('SELECT id, nom FROM cohortes WHERE code_invitation = ?');
        $stmt->execute([strtoupper(trim($code))]);
        $row = $stmt->fetch();

        return $row === false ? null : ['id' => (int) $row['id'], 'nom' => (string) $row['nom']];
    }

    /**
     * Consented membership — idempotent: re-joining keeps the ORIGINAL
     * consent_at (the original consent stands, plan-masse §6).
     *
     * @return bool true when the membership was created, false when it existed
     */
    public function join(int $cohorteId, int $userId): bool
    {
        $stmt = $this->pdo->prepare(
            'INSERT IGNORE INTO cohorte_membres (cohorte_id, user_id) VALUES (?, ?)'
        );
        $stmt->execute([$cohorteId, $userId]);

        return $stmt->rowCount() > 0;
    }

    public function isMember(int $cohorteId, int $userId): bool
    {
        $stmt = $this->pdo->prepare(
            'SELECT 1 FROM cohorte_membres WHERE cohorte_id = ? AND user_id = ?'
        );
        $stmt->execute([$cohorteId, $userId]);

        return $stmt->fetchColumn() !== false;
    }

    /**
     * Consent withdrawal (plan-masse §6): cancels the member's pending jobs
     * in this cohorte, purges the deposited portfolio (mass_jobs.portfolio_id
     * goes NULL by FK — produced documents survive, they belong to the
     * learner) and removes the membership. False when not a member.
     */
    public function quit(int $cohorteId, int $userId): bool
    {
        if (!$this->isMember($cohorteId, $userId)) {
            return false;
        }

        $this->pdo->prepare(
            'UPDATE mass_jobs j JOIN mass_runs r ON r.id = j.run_id
                SET j.status = "cancelled", j.lease_until = NULL, j.finished_at = NOW()
              WHERE r.cohorte_id = ? AND j.user_id = ?
                AND j.status IN ("queued", "running", "budget_exceeded")'
        )->execute([$cohorteId, $userId]);
        $this->pdo->prepare(
            'DELETE FROM cohorte_portfolios WHERE cohorte_id = ? AND user_id = ?'
        )->execute([$cohorteId, $userId]);
        $this->pdo->prepare(
            'DELETE FROM cohorte_membres WHERE cohorte_id = ? AND user_id = ?'
        )->execute([$cohorteId, $userId]);

        return true;
    }

    /**
     * Deposit (or replace) the member's portfolio: the de-facto opt-in to
     * server-side processing (plan-masse §6).
     *
     * @param list<array{date: string, texte: string}> $segments
     */
    public function depositPortfolio(int $cohorteId, int $userId, string $titre, ?string $texte, array $segments): int
    {
        $json = json_encode($segments, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        $this->pdo->prepare(
            'INSERT INTO cohorte_portfolios (cohorte_id, user_id, titre, texte, segments)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE titre = VALUES(titre), texte = VALUES(texte),
                 segments = VALUES(segments), created_at = NOW()'
        )->execute([$cohorteId, $userId, $titre, $texte, $json]);

        $stmt = $this->pdo->prepare(
            'SELECT id FROM cohorte_portfolios WHERE cohorte_id = ? AND user_id = ?'
        );
        $stmt->execute([$cohorteId, $userId]);

        return (int) $stmt->fetchColumn();
    }

    /**
     * Deposited portfolios of the given members (or all members when null),
     * for run enqueueing.
     *
     * @param list<int>|null $userIds
     * @return list<array{id: int, userId: int, dates: list<string>}>
     */
    public function depositsForRun(int $cohorteId, ?array $userIds): array
    {
        $sql = 'SELECT p.id, p.user_id, p.segments
                  FROM cohorte_portfolios p
                  JOIN cohorte_membres m ON m.cohorte_id = p.cohorte_id AND m.user_id = p.user_id
                 WHERE p.cohorte_id = ?';
        $params = [$cohorteId];
        if ($userIds !== null && $userIds !== []) {
            $sql .= ' AND p.user_id IN (' . implode(',', array_fill(0, \count($userIds), '?')) . ')';
            $params = array_merge($params, $userIds);
        }
        $stmt = $this->pdo->prepare($sql . ' ORDER BY p.user_id');
        $stmt->execute($params);

        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $segments = json_decode((string) $row['segments'], true);
            $dates = [];
            foreach (\is_array($segments) ? $segments : [] as $segment) {
                if (\is_array($segment) && \is_string($segment['date'] ?? null)) {
                    $dates[] = $segment['date'];
                }
            }
            $out[] = ['id' => (int) $row['id'], 'userId' => (int) $row['user_id'], 'dates' => $dates];
        }

        return $out;
    }

    /** Day text of a deposited portfolio (worker side). Null when gone. */
    public function segmentText(int $portfolioId, string $date): ?string
    {
        $stmt = $this->pdo->prepare('SELECT segments FROM cohorte_portfolios WHERE id = ?');
        $stmt->execute([$portfolioId]);
        $json = $stmt->fetchColumn();
        if (!\is_string($json)) {
            return null;
        }
        foreach ((array) json_decode($json, true) as $segment) {
            if (\is_array($segment) && ($segment['date'] ?? null) === $date && \is_string($segment['texte'] ?? null)) {
                return $segment['texte'];
            }
        }

        return null;
    }

    private static function randomCode(): string
    {
        $code = '';
        $max = \strlen(self::CODE_ALPHABET) - 1;
        for ($i = 0; $i < 10; $i++) {
            $code .= self::CODE_ALPHABET[random_int(0, $max)];
        }

        return $code;
    }
}
