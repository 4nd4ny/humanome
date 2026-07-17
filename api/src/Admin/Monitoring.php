<?php

declare(strict_types=1);

namespace Humanome\Admin;

use Humanome\Auth\LoginJournal;
use Humanome\Referentiel\Electorate;
use Humanome\Referentiel\MajorityTally;
use PDO;

/**
 * Tableau de bord de monitoring (section admin « Monitoring ») : agrégats en
 * LECTURE SEULE sur les journaux et compteurs déjà en base — jamais de
 * contenu (portfolio, cartographie, gabarit), conformément au cahier §6.5.
 *
 * Tout est calculé à la demande sur une fenêtre de `days` jours (1..365) :
 *  - utilisateurs : total, actifs à l'instant (sessions < 15 min), inscriptions ;
 *  - cartographies : volumes, partages actifs, consultations (audit_events) ;
 *  - finances : soldes crédits, mouvements par nature, captures PayPal
 *    (micro-USD signés : topup positif, debit/refund négatifs) ;
 *  - tokens : demo (llm_usage_daily) + tuteur (tuteur_usage_daily) + Twin9
 *    (twin9_credit_events kind='debit'), par jour et par modèle — la série
 *    quotidienne sert de détecteur d'anomalies (pic = clé compromise) ;
 *  - connexions : journal LoginJournal (pays + réseau tronqué, jamais d'IP) ;
 *  - votes : propositions en cours (status 'review') des deux grains de
 *    gouvernance, décompte MajorityTally et retardataires à relancer.
 */
final class Monitoring
{
    /** Une session est « active » si elle a parlé dans cette fenêtre. */
    public const ACTIVE_WINDOW_SECONDS = 900;

    public const RECENT_LOGINS = 50;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array<string, mixed> */
    public function overview(int $days): array
    {
        $days = max(1, min(365, $days));

        return [
            'periode' => ['jours' => $days],
            'utilisateurs' => $this->utilisateurs($days),
            'cartographies' => $this->cartographies($days),
            'finances' => $this->finances($days),
            'tokens' => $this->tokens($days),
            'connexions' => $this->connexions($days),
            'votes' => $this->votes(),
        ];
    }

    // ------------------------------------------------------------------
    // Utilisateurs
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    private function utilisateurs(int $days): array
    {
        $total = (int) $this->pdo->query(
            'SELECT COUNT(*) FROM users WHERE deleted_at IS NULL'
        )->fetchColumn();
        $nonActives = (int) $this->pdo->query(
            'SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND email_verified_at IS NULL'
        )->fetchColumn();

        $cutoff = time() - self::ACTIVE_WINDOW_SECONDS;
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(DISTINCT user_id) AS connectes,
                    COALESCE(SUM(user_id IS NULL), 0) AS anonymes
               FROM sessions WHERE last_activity >= ?'
        );
        $stmt->execute([$cutoff]);
        $actifs = $stmt->fetch();

        $nouveaux = $this->pdo->prepare(
            'SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND created_at >= ' . $this->since($days)
        );
        $nouveaux->execute();

        $parJour = $this->pdo->prepare(
            'SELECT DATE(created_at) AS date, COUNT(*) AS n
               FROM users
              WHERE deleted_at IS NULL AND created_at >= ' . $this->since($days) . '
              GROUP BY DATE(created_at) ORDER BY date'
        );
        $parJour->execute();

        $parRole = $this->pdo->query(
            "SELECT r.name AS role, COUNT(*) AS n
               FROM user_roles ur
               JOIN roles r ON r.id = ur.role_id
               JOIN users u ON u.id = ur.user_id AND u.deleted_at IS NULL
              GROUP BY r.name ORDER BY n DESC, r.name"
        );

        return [
            'total' => $total,
            'nonActives' => $nonActives,
            'actifsMaintenant' => (int) ($actifs['connectes'] ?? 0),
            'sessionsAnonymes' => (int) ($actifs['anonymes'] ?? 0),
            'nouveauxPeriode' => (int) $nouveaux->fetchColumn(),
            'parJour' => array_map(static fn (array $r): array => [
                'date' => (string) $r['date'],
                'n' => (int) $r['n'],
            ], $parJour->fetchAll()),
            'parRole' => array_map(static fn (array $r): array => [
                'role' => (string) $r['role'],
                'n' => (int) $r['n'],
            ], $parRole->fetchAll()),
        ];
    }

    // ------------------------------------------------------------------
    // Cartographies et partages
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    private function cartographies(int $days): array
    {
        $parType = ['jour' => 0, 'merge' => 0];
        foreach ($this->pdo->query('SELECT type, COUNT(*) AS n FROM cartographies GROUP BY type') as $row) {
            $parType[(string) $row['type']] = (int) $row['n'];
        }

        $avecDocument = (int) $this->pdo->query(
            'SELECT COUNT(*) FROM cartographies WHERE document IS NOT NULL'
        )->fetchColumn();

        $nouvelles = $this->pdo->prepare(
            'SELECT COUNT(*) FROM cartographies WHERE created_at >= ' . $this->since($days)
        );
        $nouvelles->execute();

        $parJour = $this->pdo->prepare(
            'SELECT DATE(created_at) AS date, COUNT(*) AS n
               FROM cartographies WHERE created_at >= ' . $this->since($days) . '
              GROUP BY DATE(created_at) ORDER BY date'
        );
        $parJour->execute();

        $partagesActifs = (int) $this->pdo->query(
            'SELECT COUNT(*) FROM share_links
              WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())'
        )->fetchColumn();

        return [
            'total' => $parType['jour'] + $parType['merge'],
            'parType' => $parType,
            'avecDocument' => $avecDocument,
            'nouvellesPeriode' => (int) $nouvelles->fetchColumn(),
            'parJour' => array_map(static fn (array $r): array => [
                'date' => (string) $r['date'],
                'n' => (int) $r['n'],
            ], $parJour->fetchAll()),
            'partages' => [
                'actifs' => $partagesActifs,
                'creesPeriode' => $this->countAudit('share_created', $days),
                'consultationsPeriode' => $this->countAudit('share_consulted', $days),
                'consultationsTotal' => $this->countAudit('share_consulted', null),
                'consultationsParJour' => $this->auditParJour('share_consulted', $days),
            ],
        ];
    }

    // ------------------------------------------------------------------
    // Finances (micro-USD signés)
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    private function finances(int $days): array
    {
        $soldes = $this->pdo->query(
            'SELECT COALESCE(SUM(balance_microusd), 0) AS total,
                    COALESCE(SUM(balance_microusd > 0), 0) AS comptes
               FROM twin9_credits'
        )->fetch();

        $parNature = function (?int $days): array {
            $where = $days === null ? '' : ' WHERE created_at >= ' . $this->since($days);
            $out = [];
            foreach ($this->pdo->query(
                'SELECT kind, COUNT(*) AS n, COALESCE(SUM(amount_microusd), 0) AS microusd
                   FROM twin9_credit_events' . $where . ' GROUP BY kind'
            ) as $row) {
                $out[(string) $row['kind']] = ['n' => (int) $row['n'], 'microusd' => (int) $row['microusd']];
            }

            return $out;
        };

        $parJour = $this->pdo->prepare(
            'SELECT DATE(created_at) AS date, kind, COALESCE(SUM(amount_microusd), 0) AS microusd
               FROM twin9_credit_events WHERE created_at >= ' . $this->since($days) . '
              GROUP BY DATE(created_at), kind ORDER BY date'
        );
        $parJour->execute();
        $jours = [];
        foreach ($parJour->fetchAll() as $row) {
            $d = (string) $row['date'];
            $jours[$d] ??= ['date' => $d, 'topup' => 0, 'debit' => 0, 'refund' => 0, 'adjust' => 0];
            $jours[$d][(string) $row['kind']] = (int) $row['microusd'];
        }

        $paypal = function (?int $days): array {
            $where = $days === null ? '' : ' WHERE created_at >= ' . $this->since($days);
            $row = $this->pdo->query(
                'SELECT COUNT(*) AS n,
                        COALESCE(SUM(montant_microusd), 0) AS brut,
                        COALESCE(SUM(rembourse_microusd), 0) AS rembourse
                   FROM twin9_paypal_captures' . $where
            )->fetch();

            return [
                'captures' => (int) $row['n'],
                'brutMicrousd' => (int) $row['brut'],
                'rembourseMicrousd' => (int) $row['rembourse'],
            ];
        };

        return [
            'soldes' => [
                'totalMicrousd' => (int) $soldes['total'],
                'comptesCredites' => (int) $soldes['comptes'],
            ],
            'periode' => $parNature($days),
            'toutTemps' => $parNature(null),
            'parJour' => array_values($jours),
            'paypal' => ['periode' => $paypal($days), 'toutTemps' => $paypal(null)],
        ];
    }

    // ------------------------------------------------------------------
    // Tokens (demo + tuteur + Twin9)
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    private function tokens(int $days): array
    {
        $jours = [];
        $touch = static function (string $d) use (&$jours): void {
            $jours[$d] ??= ['date' => $d, 'demo' => null, 'tuteur' => null, 'twin9' => null];
        };

        foreach (['demo' => 'llm_usage_daily', 'tuteur' => 'tuteur_usage_daily'] as $cle => $table) {
            $stmt = $this->pdo->prepare(
                "SELECT usage_date AS date, requests, input_tokens, output_tokens, estimated_cost_usd
                   FROM {$table} WHERE usage_date >= " . $this->sinceDate($days) . ' ORDER BY usage_date'
            );
            $stmt->execute();
            foreach ($stmt->fetchAll() as $row) {
                $d = (string) $row['date'];
                $touch($d);
                $jours[$d][$cle] = [
                    'requetes' => (int) $row['requests'],
                    'entree' => (int) $row['input_tokens'],
                    'sortie' => (int) $row['output_tokens'],
                    'coutUsd' => (float) $row['estimated_cost_usd'],
                ];
            }
        }

        $twin9 = $this->pdo->prepare(
            "SELECT DATE(created_at) AS date, COUNT(*) AS n,
                    COALESCE(SUM(tokens_in), 0) AS tin,
                    COALESCE(SUM(tokens_out), 0) AS tout,
                    COALESCE(SUM(-amount_microusd), 0) AS depense
               FROM twin9_credit_events
              WHERE kind = 'debit' AND created_at >= " . $this->since($days) . '
              GROUP BY DATE(created_at) ORDER BY date'
        );
        $twin9->execute();
        foreach ($twin9->fetchAll() as $row) {
            $d = (string) $row['date'];
            $touch($d);
            $jours[$d]['twin9'] = [
                'appels' => (int) $row['n'],
                'entree' => (int) $row['tin'],
                'sortie' => (int) $row['tout'],
                'depenseMicrousd' => (int) $row['depense'],
            ];
        }
        ksort($jours);

        $totaux = function (?int $days): array {
            $out = [];
            foreach (['demo' => 'llm_usage_daily', 'tuteur' => 'tuteur_usage_daily'] as $cle => $table) {
                $where = $days === null ? '' : ' WHERE usage_date >= ' . $this->sinceDate($days);
                $row = $this->pdo->query(
                    "SELECT COALESCE(SUM(requests), 0) AS n,
                            COALESCE(SUM(input_tokens), 0) AS tin,
                            COALESCE(SUM(output_tokens), 0) AS tout,
                            COALESCE(SUM(estimated_cost_usd), 0) AS cout
                       FROM {$table}" . $where
                )->fetch();
                $out[$cle] = [
                    'requetes' => (int) $row['n'],
                    'entree' => (int) $row['tin'],
                    'sortie' => (int) $row['tout'],
                    'coutUsd' => (float) $row['cout'],
                ];
            }
            $where = $days === null ? '' : ' AND created_at >= ' . $this->since($days);
            $row = $this->pdo->query(
                "SELECT COUNT(*) AS n,
                        COALESCE(SUM(tokens_in), 0) AS tin,
                        COALESCE(SUM(tokens_out), 0) AS tout,
                        COALESCE(SUM(-amount_microusd), 0) AS depense
                   FROM twin9_credit_events WHERE kind = 'debit'" . $where
            )->fetch();
            $out['twin9'] = [
                'appels' => (int) $row['n'],
                'entree' => (int) $row['tin'],
                'sortie' => (int) $row['tout'],
                'depenseMicrousd' => (int) $row['depense'],
            ];

            return $out;
        };

        $parModele = $this->pdo->prepare(
            "SELECT COALESCE(model, '?') AS modele, COUNT(*) AS n,
                    COALESCE(SUM(tokens_in), 0) AS tin,
                    COALESCE(SUM(tokens_out), 0) AS tout,
                    COALESCE(SUM(-amount_microusd), 0) AS depense
               FROM twin9_credit_events
              WHERE kind = 'debit' AND created_at >= " . $this->since($days) . '
              GROUP BY model ORDER BY depense DESC'
        );
        $parModele->execute();

        return [
            'parJour' => array_values($jours),
            'periode' => $totaux($days),
            'toutTemps' => $totaux(null),
            'twin9ParModele' => array_map(static fn (array $r): array => [
                'modele' => (string) $r['modele'],
                'appels' => (int) $r['n'],
                'entree' => (int) $r['tin'],
                'sortie' => (int) $r['tout'],
                'depenseMicrousd' => (int) $r['depense'],
            ], $parModele->fetchAll()),
        ];
    }

    // ------------------------------------------------------------------
    // Connexions (journal LoginJournal — pays + réseau tronqué, jamais d'IP)
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    private function connexions(int $days): array
    {
        $parJour = $this->pdo->prepare(
            "SELECT DATE(created_at) AS date, type, COUNT(*) AS n
               FROM audit_events
              WHERE type IN (?, ?) AND created_at >= " . $this->since($days) . '
              GROUP BY DATE(created_at), type ORDER BY date'
        );
        $parJour->execute([LoginJournal::LOGIN, LoginJournal::LOGIN_FAILED]);
        $jours = [];
        $reussies = 0;
        $echouees = 0;
        foreach ($parJour->fetchAll() as $row) {
            $d = (string) $row['date'];
            $jours[$d] ??= ['date' => $d, 'reussies' => 0, 'echouees' => 0];
            if ((string) $row['type'] === LoginJournal::LOGIN) {
                $jours[$d]['reussies'] = (int) $row['n'];
                $reussies += (int) $row['n'];
            } else {
                $jours[$d]['echouees'] = (int) $row['n'];
                $echouees += (int) $row['n'];
            }
        }

        $pays = $this->pdo->prepare(
            "SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(details, '$.pays')), '') AS pays, COUNT(*) AS n
               FROM audit_events
              WHERE type = ? AND created_at >= " . $this->since($days) . '
              GROUP BY pays ORDER BY n DESC'
        );
        $pays->execute([LoginJournal::LOGIN]);

        $dernieres = $this->pdo->prepare(
            "SELECT a.created_at, a.type, a.user_id, u.email, u.display_name,
                    JSON_UNQUOTE(JSON_EXTRACT(a.details, '$.pays')) AS pays,
                    JSON_UNQUOTE(JSON_EXTRACT(a.details, '$.reseau')) AS reseau
               FROM audit_events a
               LEFT JOIN users u ON u.id = a.user_id
              WHERE a.type IN (?, ?)
              ORDER BY a.id DESC
              LIMIT " . self::RECENT_LOGINS
        );
        $dernieres->execute([LoginJournal::LOGIN, LoginJournal::LOGIN_FAILED]);

        return [
            'periode' => ['reussies' => $reussies, 'echouees' => $echouees],
            'parJour' => array_values($jours),
            'parPays' => array_map(static fn (array $r): array => [
                'pays' => (string) $r['pays'] === '' || $r['pays'] === 'null' ? null : (string) $r['pays'],
                'n' => (int) $r['n'],
            ], $pays->fetchAll()),
            'dernieres' => array_map(static fn (array $r): array => [
                'date' => str_replace(' ', 'T', (string) $r['created_at']),
                'reussie' => (string) $r['type'] === LoginJournal::LOGIN,
                'userId' => $r['user_id'] === null ? null : (int) $r['user_id'],
                'email' => $r['email'] === null ? null : (string) $r['email'],
                'displayName' => $r['display_name'] === null ? null : (string) $r['display_name'],
                'pays' => $r['pays'] === null || $r['pays'] === 'null' ? null : (string) $r['pays'],
                'reseau' => $r['reseau'] === null || $r['reseau'] === 'null' ? null : (string) $r['reseau'],
            ], $dernieres->fetchAll()),
        ];
    }

    // ------------------------------------------------------------------
    // Votes (gouvernance : compétences atomiques + document référentiel)
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    private function votes(): array
    {
        $electorateIds = Electorate::ids($this->pdo);
        $membres = $this->membres($electorateIds);

        return [
            'electorat' => array_values($membres),
            'competences' => $this->propositions(
                'competence_versions',
                'competence_votes',
                'competence_version_id',
                "CONCAT(competence_code, ' — ', nom)",
                $electorateIds,
                $membres,
            ),
            'referentiel' => $this->propositions(
                'referentiel_versions',
                'referentiel_votes',
                'version_id',
                "CONCAT(referentiel_id, ' — ', label)",
                $electorateIds,
                $membres,
            ),
        ];
    }

    /**
     * Propositions au vote (status 'review') d'une table de versions, avec
     * décompte contre l'électorat courant et liste des membres n'ayant pas
     * encore voté (à relancer). Même logique que CompetenceGovernance::tally /
     * ReferentielGovernance::tally (seuls les votes des membres COURANTS
     * comptent), généralisée aux deux grains.
     *
     * @param list<int> $electorateIds
     * @param array<int, array{id:int, email:string, displayName:string}> $membres
     * @return list<array<string, mixed>>
     */
    private function propositions(
        string $versionsTable,
        string $votesTable,
        string $fkColumn,
        string $labelExpr,
        array $electorateIds,
        array $membres,
    ): array {
        $versions = $this->pdo->query(
            "SELECT id, semver, {$labelExpr} AS label, submitted_at
               FROM {$versionsTable} WHERE status = 'review' ORDER BY label, id"
        )->fetchAll();
        if ($versions === []) {
            return [];
        }

        $ids = array_map(static fn (array $v): int => (int) $v['id'], $versions);
        $in = implode(',', array_fill(0, \count($ids), '?'));
        $stmt = $this->pdo->prepare(
            "SELECT {$fkColumn} AS version_id, user_id, vote
               FROM {$votesTable} WHERE {$fkColumn} IN ({$in})"
        );
        $stmt->execute($ids);

        $isMember = array_fill_keys($electorateIds, true);
        $votesParVersion = [];
        foreach ($stmt->fetchAll() as $row) {
            if (isset($isMember[(int) $row['user_id']])) {
                $votesParVersion[(int) $row['version_id']][(int) $row['user_id']] = (string) $row['vote'];
            }
        }

        $out = [];
        foreach ($versions as $v) {
            $votes = $votesParVersion[(int) $v['id']] ?? [];
            $counts = ['pour' => 0, 'contre' => 0, 'abstention' => 0];
            foreach ($votes as $vote) {
                if (isset($counts[$vote])) {
                    $counts[$vote]++;
                }
            }
            $manquants = [];
            foreach ($electorateIds as $uid) {
                if (!isset($votes[$uid]) && isset($membres[$uid])) {
                    $manquants[] = $membres[$uid];
                }
            }
            $out[] = [
                'id' => (int) $v['id'],
                'label' => (string) $v['label'],
                'semver' => (string) $v['semver'],
                'soumiseLe' => $v['submitted_at'] === null
                    ? null
                    : str_replace(' ', 'T', (string) $v['submitted_at']),
                'decompte' => MajorityTally::compute(\count($electorateIds), $counts),
                'manquants' => $manquants,
            ];
        }

        return $out;
    }

    /**
     * @param list<int> $ids
     * @return array<int, array{id:int, email:string, displayName:string}>
     */
    private function membres(array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $in = implode(',', array_fill(0, \count($ids), '?'));
        $stmt = $this->pdo->prepare(
            "SELECT id, email, display_name FROM users WHERE id IN ({$in}) ORDER BY display_name, id"
        );
        $stmt->execute($ids);

        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[(int) $row['id']] = [
                'id' => (int) $row['id'],
                'email' => (string) $row['email'],
                'displayName' => (string) $row['display_name'],
            ];
        }

        return $out;
    }

    // ------------------------------------------------------------------
    // Aides
    // ------------------------------------------------------------------

    private function countAudit(string $type, ?int $days): int
    {
        $where = $days === null ? '' : ' AND created_at >= ' . $this->since($days);
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(*) FROM audit_events WHERE type = ?' . $where
        );
        $stmt->execute([$type]);

        return (int) $stmt->fetchColumn();
    }

    /** @return list<array{date: string, n: int}> */
    private function auditParJour(string $type, int $days): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT DATE(created_at) AS date, COUNT(*) AS n
               FROM audit_events
              WHERE type = ? AND created_at >= ' . $this->since($days) . '
              GROUP BY DATE(created_at) ORDER BY date'
        );
        $stmt->execute([$type]);

        return array_map(static fn (array $r): array => [
            'date' => (string) $r['date'],
            'n' => (int) $r['n'],
        ], $stmt->fetchAll());
    }

    /**
     * Borne basse DATETIME de la fenêtre : minuit il y a (days-1) jours, la
     * fenêtre inclut donc aujourd'hui. L'entier est clampé par overview(),
     * jamais une chaîne utilisateur (même convention que LIMIT inliné).
     */
    private function since(int $days): string
    {
        return 'DATE_SUB(CURDATE(), INTERVAL ' . ($days - 1) . ' DAY)';
    }

    /** Même borne pour les colonnes DATE (llm_usage_daily.usage_date). */
    private function sinceDate(int $days): string
    {
        return $this->since($days);
    }
}
