<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Etablissement\ConfigRepository;
use Humanome\Keys\KeyVault;
use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\EtaSupport;
use Humanome\Worker\JobQueue;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-ETA-02 — Configurer le moteur LLM, le budget et le jeton worker :
 * tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/etablissement/UC-ETA-02-configurer-llm-budget.md
 *
 * ConfigRepository (projection sans secret, sémantique de la clé endpoint
 * chiffrée sodium, jeton worker haché, compteur de dépense et coupe-circuit),
 * JobQueue::reactivateBudget (hausse du plafond) et
 * KeyVault::masterKeyFromEnv sont appelés directement, sans couche HTTP.
 */
final class UcEta02ConfigurerLlmBudgetTest extends TestCase
{
    use EtaSupport;

    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users');
    }

    private static function masterKey(): string
    {
        return random_bytes(SODIUM_CRYPTO_SECRETBOX_KEYBYTES);
    }

    #[TestDox('UC-ETA-02-U01 — projection : défauts sans configuration, jamais de matériel de clé, plafond au centime')]
    public function testU01ProjectionDefaultsAndNoKeyMaterial(): void
    {
        $etab = self::seedUser(self::$pdo, 'Lycée Astrolabe', ['etablissement']);
        $repo = new ConfigRepository(self::$pdo, self::masterKey());

        self::assertSame([
            'provider' => 'humanome',
            'endpointUrl' => null,
            'model' => null,
            'budgetCapUsd' => 0.0,
            'spentUsd' => 0.0,
            'hasApiKey' => false,
            'hasWorkerToken' => false,
        ], $repo->projection($etab));

        $repo->save($etab, 'endpoint', 'http://10.0.0.12:11434', 'sk-secret-etab', 'llama3:70b', 25.555);
        $projection = $repo->projection($etab);

        self::assertSame(['provider', 'endpointUrl', 'model', 'budgetCapUsd', 'spentUsd', 'hasApiKey', 'hasWorkerToken'], array_keys($projection));
        self::assertSame('endpoint', $projection['provider']);
        self::assertSame('http://10.0.0.12:11434', $projection['endpointUrl']);
        self::assertSame('llama3:70b', $projection['model']);
        self::assertSame(25.56, $projection['budgetCapUsd'], 'DECIMAL(10,2) : arrondi au centime');
        self::assertTrue($projection['hasApiKey']);
        self::assertStringNotContainsString('sk-secret-etab', json_encode($projection));
    }

    #[TestDox('UC-ETA-02-U02 — save : clé chiffrée nonce‖secretbox ; null = conservée, "" = effacée, valeur = remplacée')]
    public function testU02SaveApiKeySemantics(): void
    {
        $etab = self::seedUser(self::$pdo, 'Lycée Astrolabe', ['etablissement']);
        $key = self::masterKey();
        $repo = new ConfigRepository(self::$pdo, $key);

        $repo->save($etab, 'endpoint', 'http://10.0.0.12:11434', 'sk-premiere', null, 10);
        $blob = (string) self::scalar(self::$pdo, 'SELECT encrypted_key FROM etablissement_config WHERE user_id = ?', [$etab]);
        self::assertSame(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES + \strlen('sk-premiere') + SODIUM_CRYPTO_SECRETBOX_MACBYTES, \strlen($blob));
        self::assertStringNotContainsString('sk-premiere', $blob);
        $nonce = substr($blob, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        self::assertSame('sk-premiere', sodium_crypto_secretbox_open(substr($blob, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), $nonce, $key));
        self::assertSame('sk-premiere', $repo->revealApiKey($etab));

        $repo->save($etab, 'endpoint', 'http://10.0.0.12:11434', null, null, 12); // clé absente : conservée
        self::assertSame('sk-premiere', $repo->revealApiKey($etab));
        self::assertSame(12.0, $repo->projection($etab)['budgetCapUsd'], 'les autres champs sont mis à jour');

        $repo->save($etab, 'endpoint', 'http://10.0.0.12:11434', 'sk-seconde', null, 12); // remplacée
        self::assertSame('sk-seconde', $repo->revealApiKey($etab));
        self::assertNotSame($blob, self::scalar(self::$pdo, 'SELECT encrypted_key FROM etablissement_config WHERE user_id = ?', [$etab]));

        $repo->save($etab, 'humanome', null, '', null, 12); // effacée
        self::assertNull($repo->revealApiKey($etab));
        self::assertNull(self::scalar(self::$pdo, 'SELECT encrypted_key FROM etablissement_config WHERE user_id = ?', [$etab]));
        self::assertFalse($repo->projection($etab)['hasApiKey']);
    }

    #[TestDox('UC-ETA-02-U03 — save : une clé fournie sans clé maîtresse lève une exception (jamais de stockage en clair)')]
    public function testU03SaveWithoutMasterKeyRefusesToStoreAKey(): void
    {
        $etab = self::seedUser(self::$pdo, 'Lycée Astrolabe', ['etablissement']);
        $repo = new ConfigRepository(self::$pdo, null);

        $repo->save($etab, 'humanome', null, null, null, 5); // sans clé : aucune exigence
        self::assertSame(5.0, $repo->projection($etab)['budgetCapUsd']);

        try {
            $repo->save($etab, 'endpoint', 'http://10.0.0.12:11434', 'sk-en-clair', null, 5);
            self::fail('SODIUM_MASTER_KEY absente : exception attendue');
        } catch (\RuntimeException $e) {
            self::assertStringContainsString('SODIUM_MASTER_KEY', $e->getMessage());
        }
        self::assertNull(self::scalar(self::$pdo, 'SELECT encrypted_key FROM etablissement_config WHERE user_id = ?', [$etab]));
    }

    #[TestDox('UC-ETA-02-U04 — revealApiKey : sans ligne, sans clé ou avec une autre clé maîtresse → null')]
    public function testU04RevealApiKeyFailsClosed(): void
    {
        $etab = self::seedUser(self::$pdo, 'Lycée Astrolabe', ['etablissement']);
        $key = self::masterKey();
        self::assertNull((new ConfigRepository(self::$pdo, $key))->revealApiKey($etab), 'aucune configuration');

        (new ConfigRepository(self::$pdo, $key))->save($etab, 'endpoint', 'http://h:1', null, null, 1);
        self::assertNull((new ConfigRepository(self::$pdo, $key))->revealApiKey($etab), 'aucune clé');

        (new ConfigRepository(self::$pdo, $key))->save($etab, 'endpoint', 'http://h:1', 'sk-x', null, 1);
        self::assertNull((new ConfigRepository(self::$pdo, self::masterKey()))->revealApiKey($etab), 'MAC invalide');
        self::assertNull((new ConfigRepository(self::$pdo, null))->revealApiKey($etab), 'pas de clé maîtresse');
    }

    #[TestDox('UC-ETA-02-U05 — jeton worker : hwk_ + 128 bits, stocké en sha256, rotation, jeton vide ou inconnu → null')]
    public function testU05WorkerTokenIsHashedAndRotates(): void
    {
        $etab = self::seedUser(self::$pdo, 'Lycée Astrolabe', ['etablissement']);
        $repo = new ConfigRepository(self::$pdo);

        $token = $repo->generateWorkerToken($etab); // crée la ligne si besoin
        self::assertMatchesRegularExpression('/^hwk_[0-9a-f]{32}$/', $token);
        self::assertSame(hash('sha256', $token), self::scalar(self::$pdo, 'SELECT worker_token_hash FROM etablissement_config WHERE user_id = ?', [$etab]));
        self::assertTrue($repo->projection($etab)['hasWorkerToken']);
        self::assertSame(0.0, $repo->projection($etab)['budgetCapUsd'], 'ligne créée avec les défauts');
        self::assertSame($etab, $repo->etablissementIdForWorkerToken($token));

        $rotated = $repo->generateWorkerToken($etab);
        self::assertNotSame($token, $rotated);
        self::assertNull($repo->etablissementIdForWorkerToken($token), 'l’ancien jeton meurt');
        self::assertSame($etab, $repo->etablissementIdForWorkerToken($rotated));
        self::assertNull($repo->etablissementIdForWorkerToken(''));
        self::assertNull($repo->etablissementIdForWorkerToken(hash('sha256', $rotated)), 'l’empreinte n’est pas un jeton');
    }

    #[TestDox('UC-ETA-02-U06 — dépense : addSpentUsd cumule (négatif ignoré), allowsSpending borne à spent + estimation ≤ plafond')]
    public function testU06SpendingCounterAndCircuitBreaker(): void
    {
        $etab = self::seedUser(self::$pdo, 'Lycée Astrolabe', ['etablissement']);
        $repo = new ConfigRepository(self::$pdo);
        self::assertFalse($repo->allowsSpending($etab, 0.0), 'sans configuration : aucune dépense plateforme');

        self::seedConfig(self::$pdo, $etab, 1.0);
        $repo->addSpentUsd($etab, 0.4);
        $repo->addSpentUsd($etab, 0.35);
        $repo->addSpentUsd($etab, -5.0);
        self::assertEqualsWithDelta(0.75, $repo->projection($etab)['spentUsd'], 1e-9);

        self::assertTrue($repo->allowsSpending($etab, 0.25), 'égalité au plafond autorisée');
        self::assertFalse($repo->allowsSpending($etab, 0.250001));
        $repo->addSpentUsd($etab, 0.25);
        self::assertTrue($repo->allowsSpending($etab, 0.0));
        $repo->addSpentUsd($etab, 0.000001);
        self::assertFalse($repo->allowsSpending($etab, 0.0), 'plafond consommé');
    }

    #[TestDox('UC-ETA-02-U07 — reactivateBudget : jobs budget_exceeded → queued, runs → active, autres établissements intacts')]
    public function testU07ReactivateBudgetRequeuesOnlyThisEtablissement(): void
    {
        $etab = self::seedUser(self::$pdo, 'Lycée Astrolabe', ['etablissement']);
        $autre = self::seedUser(self::$pdo, 'Collège Voisin', ['etablissement']);
        $learner = self::seedUser(self::$pdo, 'Maya');
        $runs = [];
        foreach ([$etab, $autre] as $owner) {
            self::$pdo->prepare('INSERT INTO cohortes (etablissement_id, nom, code_invitation) VALUES (?, "C", ?)')
                ->execute([$owner, substr(strtoupper(bin2hex(random_bytes(5))), 0, 10)]);
            self::$pdo->prepare(
                'INSERT INTO mass_runs (etablissement_id, cohorte_id, prompt_package_slug, prompt_package_semver,
                    referentiel_id, referentiel_semver, status, finished_at)
                 VALUES (?, ?, "p", "1.0.0", "respire", "7.0.0", "budget_exceeded", NOW())'
            )->execute([$owner, (int) self::$pdo->lastInsertId()]);
            $runs[$owner] = (int) self::$pdo->lastInsertId();
            foreach (['2026-01-05' => 'budget_exceeded', '2026-01-06' => 'done', '2026-01-07' => 'cancelled'] as $date => $status) {
                self::$pdo->prepare('INSERT INTO mass_jobs (run_id, user_id, day_date, status, checkpoint) VALUES (?, ?, ?, ?, ?)')
                    ->execute([$runs[$owner], $learner, $date, $status, '{"poles": {"1": {"stub": true}}}']);
            }
        }

        (new JobQueue(self::$pdo))->reactivateBudget($etab);

        $statuses = static fn (int $runId): array => self::$pdo
            ->query("SELECT day_date, status FROM mass_jobs WHERE run_id = {$runId} ORDER BY day_date")
            ->fetchAll(PDO::FETCH_KEY_PAIR);
        self::assertSame(['2026-01-05' => 'queued', '2026-01-06' => 'done', '2026-01-07' => 'cancelled'], $statuses($runs[$etab]));
        self::assertSame('active', self::scalar(self::$pdo, 'SELECT status FROM mass_runs WHERE id = ?', [$runs[$etab]]));
        self::assertNull(self::scalar(self::$pdo, 'SELECT finished_at FROM mass_runs WHERE id = ?', [$runs[$etab]]));
        self::assertNotNull(self::scalar(self::$pdo, 'SELECT checkpoint FROM mass_jobs WHERE run_id = ? AND day_date = "2026-01-05"', [$runs[$etab]]), 'checkpoint conservé');

        self::assertSame('budget_exceeded', $statuses($runs[$autre])['2026-01-05']);
        self::assertSame('budget_exceeded', self::scalar(self::$pdo, 'SELECT status FROM mass_runs WHERE id = ?', [$runs[$autre]]));
    }

    #[TestDox('UC-ETA-02-U08 — KeyVault::masterKeyFromEnv : 64 hexadécimaux → 32 octets, sinon null (route en 503)')]
    public function testU08MasterKeyFromEnv(): void
    {
        $hex = bin2hex(random_bytes(32));
        self::assertSame(hex2bin($hex), self::withEnv(['SODIUM_MASTER_KEY' => $hex], KeyVault::masterKeyFromEnv(...)));
        self::assertNull(self::withEnv(['SODIUM_MASTER_KEY' => ''], KeyVault::masterKeyFromEnv(...)));
        self::assertNull(self::withEnv(['SODIUM_MASTER_KEY' => substr($hex, 2)], KeyVault::masterKeyFromEnv(...)));
        self::assertNull(self::withEnv(['SODIUM_MASTER_KEY' => str_repeat('z', 64)], KeyVault::masterKeyFromEnv(...)));
    }
}
