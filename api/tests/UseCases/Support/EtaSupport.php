<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Support;

use Humanome\Auth\Users;
use Humanome\Etablissement\CohorteRepository;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Referentiel\ReferentielRepository;
use PDO;

/**
 * Outils partagés du lot « Établissement et traitement de masse »
 * (UC-ETA-01..04, UC-SYS-01 — docs/cas-utilisation/etablissement/,
 * docs/cas-utilisation/systeme/UC-SYS-01-traiter-file-jobs.md).
 *
 * - Semis SQL directs pour les tests UNITAIRES (comptes, cohortes, membres,
 *   dépôts, runs, jobs) : les classes du domaine sont ensuite appelées sans
 *   couche HTTP.
 * - Surcharge temporaire de variables d'environnement (WORKER_PROVIDER,
 *   MIGRATE_TOKEN, SODIUM_MASTER_KEY…) restaurée quoi qu'il arrive : les
 *   bases de test partagent le processus PHPUnit.
 * - Fixtures : référentiel RESPIRE v7 (instantané versionné
 *   schemas/fixtures/referentiel-respire-v7.json), paquet par défaut construit
 *   depuis les gabarits du moteur (build/, généré — précondition vérifiée),
 *   documents jour du schéma.
 * - Verrou du worker : GET_LOCK('humanome_worker') est global au serveur
 *   MySQL (UC-SYS-01, RG1) ; untilUnlocked() relance un tick tant qu'un AUTRE
 *   processus PHPUnit (autre base de test) le tient.
 */
trait EtaSupport
{
    /** Racine du dépôt (api/tests/UseCases/Support -> ../../../..). */
    protected static function repoRoot(): string
    {
        return \dirname(__DIR__, 4);
    }

    /** @return array<string, mixed> document cartographie-jour réel (schemas/fixtures) */
    protected static function dayDocument(string $date = '2026-01-05'): array
    {
        $path = self::repoRoot() . '/schemas/fixtures/cartographie-jour-' . $date . '.json';

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * @return array<string, mixed> référentiel RESPIRE v7 — instantané VERSIONNÉ
     *   de web/public/data/referentiel/respire-v7.json (fichier généré, absent
     *   d'un checkout neuf) ; seul le champ `source` diffère, même contentHash.
     */
    protected static function respireReferentiel(): array
    {
        $path = self::repoRoot() . '/schemas/fixtures/referentiel-respire-v7.json';

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /** @return array<string, mixed> paquet par défaut construit depuis les gabarits du moteur */
    protected static function defaultPackage(): array
    {
        $path = self::repoRoot() . '/build/prompt-packages/aurora-v3-reconstruit-1.0.0.json';
        self::assertFileExists($path, 'run: node scripts/build-default-prompt-package.mjs');

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * Relance $run (un tick) tant qu'il répond {locked: true} parce qu'un AUTRE
     * processus tient le verrou global du worker (≤ 30 s). À ne pas utiliser
     * quand le test tient lui-même le verrou (A6).
     *
     * @param callable(): array<string, mixed> $run
     * @return array<string, mixed>
     */
    protected static function untilUnlocked(callable $run): array
    {
        for ($try = 1; ; $try++) {
            $counters = $run();
            if (($counters['locked'] ?? false) !== true || $try >= 300) {
                return $counters;
            }
            usleep(100_000);
        }
    }

    /** Référentiel v7 + paquet par défaut publiés en base (préconditions d'un run). */
    protected static function seedPublishedVersions(PDO $pdo): void
    {
        $pdo->exec('DELETE FROM referentiel_versions');
        $pdo->exec('DELETE FROM prompt_packages');
        (new ReferentielRepository($pdo))->importPublishedDocument(self::respireReferentiel(), 'Import UC-ETA');
        (new PromptPackageRepository($pdo))->importPublishedDocument(self::defaultPackage());
    }

    /**
     * Compte créé directement en base, avec ses rôles.
     *
     * @param list<string> $roles
     */
    protected static function seedUser(PDO $pdo, string $displayName, array $roles = ['apprenant']): int
    {
        $pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid('eta', true) . '@example.org', Users::hashPassword('x-password-eta'), $displayName]);
        $userId = (int) $pdo->lastInsertId();
        $bind = $pdo->prepare('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?');
        foreach ($roles as $role) {
            $bind->execute([$userId, $role]);
        }

        return $userId;
    }

    /**
     * Membre consenti ayant déposé un portfolio segmenté (journées données).
     *
     * @param list<string> $dates
     * @return int identifiant du dépôt (cohorte_portfolios.id)
     */
    protected static function seedDepositor(PDO $pdo, int $cohorteId, int $userId, array $dates, string $titre = 'Portfolio'): int
    {
        $repo = new CohorteRepository($pdo);
        $repo->join($cohorteId, $userId);
        $segments = [];
        foreach ($dates as $i => $date) {
            $segments[] = ['date' => $date, 'texte' => "Feuille {$i} : j'ai animé le conseil de classe puis noté ce que j'en retire."];
        }

        return $repo->depositPortfolio($cohorteId, $userId, $titre, null, $segments);
    }

    /** Configuration LLM/budget posée directement (provider, plafond, dépense). */
    protected static function seedConfig(
        PDO $pdo,
        int $etablissementId,
        float $budgetCapUsd,
        string $provider = 'humanome',
        ?string $model = 'claude-sonnet-4-5',
        float $spentUsd = 0.0,
        ?string $endpointUrl = null,
    ): void {
        $pdo->prepare(
            'INSERT INTO etablissement_config (user_id, provider, endpoint_url, model, budget_cap_usd, spent_usd)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE provider = VALUES(provider), endpoint_url = VALUES(endpoint_url),
                 model = VALUES(model), budget_cap_usd = VALUES(budget_cap_usd), spent_usd = VALUES(spent_usd)'
        )->execute([$etablissementId, $provider, $endpointUrl, $model, $budgetCapUsd, $spentUsd]);
    }

    /** Valeur d'une colonne (première ligne) — lecture de contrôle. */
    protected static function scalar(PDO $pdo, string $sql, array $params = []): mixed
    {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchColumn();
    }

    /**
     * Exécute $fn avec des variables d'environnement surchargées ($_ENV,
     * première couche lue par Env::get), puis restaure l'état exact d'avant.
     *
     * @param array<string, string> $vars
     */
    protected static function withEnv(array $vars, callable $fn): mixed
    {
        $saved = [];
        foreach ($vars as $key => $value) {
            $saved[$key] = \array_key_exists($key, $_ENV) ? [$_ENV[$key]] : null;
            $_ENV[$key] = $value;
        }
        try {
            return $fn();
        } finally {
            foreach ($saved as $key => $previous) {
                if ($previous === null) {
                    unset($_ENV[$key]);
                } else {
                    $_ENV[$key] = $previous[0];
                }
            }
        }
    }
}
