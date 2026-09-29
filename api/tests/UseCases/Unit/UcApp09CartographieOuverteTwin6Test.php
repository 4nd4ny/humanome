<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\RateLimiter;
use Humanome\Auth\Users;
use Humanome\Llm\HttpClientException;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\TwinSupport;
use Humanome\Twin9\AnthropicCaller;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\SoldeInsuffisantException;
use Humanome\Twin9\Twin9Config;
use Humanome\Twin9\Twin9Exception;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-APP-09 — Lancer une cartographie ouverte (Twin6) : tests UNITAIRES (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-09-cartographie-ouverte-twin6.md
 *
 * Les classes sollicitées par POST /api/twin6/appel (voie « crédits ») sont
 * appelées directement, sans couche HTTP : tarification à la contribution
 * Twin6 (Twin9Config, protocole 'twin6'), réserve pire-cas puis réconciliation
 * (CreditService), refus de découvert (SoldeInsuffisantException) et appel
 * amont verrouillé (AnthropicCaller, via le faux client HTTP).
 */
final class UcApp09CartographieOuverteTwin6Test extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users'); // crédits et grand-livre en cascade
        self::$pdo->exec("DELETE FROM settings WHERE name = 'twin9_config'");
    }

    private static function user(string $email = 'lea@example.org'): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([$email, Users::hashPassword('x-password'), 'Léa']);

        return (int) self::$pdo->lastInsertId();
    }

    private static function config(): Twin9Config
    {
        return new Twin9Config(new SettingsRepository(self::$pdo));
    }

    #[TestDox('UC-APP-09-U21 — coût réel Twin6 = tokens × prix catalogue × 1,10, arrondi au micro-USD supérieur, moins cher que Twin9 (× 1,20)')]
    public function testU21Twin6CostUsesItsOwnContribution(): void
    {
        $config = self::config();
        // Exact : 1000×3×1,1 + 200×15×1,1 = 6 600 µUSD ; le flottant 3 300,000…05
        // est arrondi AU-DESSUS (jamais en faveur de l'apprenant, ≤ 2 µUSD d'écart).
        self::assertSame(6602, $config->coutMicrousd('claude-sonnet-5', 1000, 200, 'twin6'));
        self::assertSame(7200, $config->coutMicrousd('claude-sonnet-5', 1000, 200, 'twin9'));
        self::assertSame(7200, $config->coutMicrousd('claude-sonnet-5', 1000, 200), 'protocole par défaut = twin9');
        self::assertSame(0, $config->coutMicrousd('claude-sonnet-5', 0, 0, 'twin6'));
        self::assertNull($config->coutMicrousd('modele-fantome', 1000, 200, 'twin6'));
        self::assertSame(1.1, $config->marge('twin6'));
        self::assertSame(1.2, $config->marge('twin9'));
    }

    #[TestDox('UC-APP-09-U22 — réserve pire-cas Twin6 (octets du prompt + max_tokens) : toujours ≥ au coût réel')]
    public function testU22WorstCaseReserveCoversAnyRealCost(): void
    {
        $config = self::config();
        $promptBytes = \strlen("Analyse le pôle 1 — portfolio d’Élise : « j’ai recoupé »");
        $reserve = $config->reserveMicrousd('claude-sonnet-5', $promptBytes, 8192, 'twin6');
        self::assertSame($config->coutMicrousd('claude-sonnet-5', $promptBytes, 8192, 'twin6'), $reserve);
        foreach ([[1, 1], [$promptBytes, 8192], [(int) ($promptBytes / 3), 4000]] as [$in, $out]) {
            self::assertGreaterThanOrEqual($config->coutMicrousd('claude-sonnet-5', $in, $out, 'twin6'), $reserve);
        }
        self::assertSame(0, $config->reserveMicrousd('claude-sonnet-5', -5, -1, 'twin6'), 'bornes négatives ramenées à 0');
        self::assertNull($config->reserveMicrousd('modele-fantome', 10, 10, 'twin6'));
    }

    #[TestDox('UC-APP-09-U23 — offre publique : prix Twin6 margés (+10 %) exposés, marges et prix catalogue jamais')]
    public function testU23PublicViewExposesTwin6PricesOnly(): void
    {
        $view = self::config()->publicView();
        self::assertSame([3.3, 16.5], $view['modeles_twin6']['claude-sonnet-5']);
        self::assertSame([1.1, 5.5], $view['modeles_twin6']['claude-haiku-4-5-20251001']);
        self::assertSame([5.5, 27.5], $view['modeles_twin6']['claude-opus-4-8']);
        self::assertArrayNotHasKey('marge', $view);
        self::assertArrayNotHasKey('marge_twin6', $view);

        self::config()->update(['marge_twin6' => 1.5]);
        self::assertSame([4.5, 22.5], self::config()->publicView()['modeles_twin6']['claude-sonnet-5']);
    }

    #[TestDox('UC-APP-09-U24 — réserve puis réconciliation : le débit NET est exactement le coût réel ; en cas d’échec amont la réserve est rendue')]
    public function testU24ReserveThenReconcileNetsToRealCost(): void
    {
        $userId = self::user();
        $credits = new CreditService(self::$pdo);
        $credits->topup($userId, 1_000_000, 'ORDER-UC-APP-09', 'Recharge PayPal');

        $reserve = 155_000;
        $cout = 6602;
        self::assertSame(1_000_000 - $reserve, $credits->debit($userId, $reserve, 'twin6/cartographie (réserve)', 'claude-sonnet-5'));
        self::assertSame(1_000_000 - $cout, $credits->adjust($userId, $reserve - $cout, 'twin6/cartographie (réconciliation)', 'claude-sonnet-5', 1000, 200));

        // Échec amont : la réserve est intégralement rendue (remboursement échec).
        $credits->debit($userId, $reserve, 'twin6/cartographie (réserve)', 'claude-sonnet-5');
        self::assertSame(1_000_000 - $cout, $credits->adjust($userId, $reserve, 'twin6/cartographie (remboursement échec)', 'claude-sonnet-5'));

        $events = $credits->events($userId);
        self::assertSame(
            ['adjust', 'debit', 'adjust', 'debit', 'topup'],
            array_column($events, 'kind'),
        );
        self::assertSame([1000, 200], [$events[2]['tokens_in'], $events[2]['tokens_out']], 'la réconciliation porte les tokens réels');
    }

    #[TestDox('UC-APP-09-U25 — débit conditionnel : solde insuffisant → SoldeInsuffisantException (montants), solde et grand-livre intacts')]
    public function testU25DebitNeverOverdraws(): void
    {
        $userId = self::user();
        $credits = new CreditService(self::$pdo);

        try {
            $credits->debit($userId, 10, 'twin6/cartographie (réserve)', 'claude-sonnet-5');
            self::fail('débit sans ligne de crédit accepté');
        } catch (SoldeInsuffisantException $e) {
            self::assertSame(0, $e->getBalanceMicrousd());
            self::assertSame(10, $e->getRequestedMicrousd());
            self::assertSame('Solde insuffisant', $e->getMessage());
        }

        $credits->topup($userId, 12_000, 'ORDER-UC-APP-09-B');
        try {
            $credits->debit($userId, 12_001, 'twin6/cartographie (réserve)', 'claude-sonnet-5');
            self::fail('découvert accepté');
        } catch (SoldeInsuffisantException $e) {
            self::assertSame(12_000, $e->getBalanceMicrousd());
            self::assertSame(12_001, $e->getRequestedMicrousd());
        }
        self::assertSame(12_000, $credits->balance($userId));
        self::assertCount(1, $credits->events($userId), 'aucun événement pour un débit refusé');
    }

    #[TestDox('UC-APP-09-U26 — AnthropicCaller : URL verrouillée, prompt système transmis, réflexion désactivée, texte et usage RÉELS relus')]
    public function testU26AnthropicCallerSendsSystemPromptOnLockedUrl(): void
    {
        $http = new LlmFakeHttpClient();
        $http->queueResponse(['status' => 200, 'body' => json_encode([
            'content' => [
                ['type' => 'text', 'text' => '{"poleNum":'],
                ['type' => 'thinking', 'thinking' => 'ignoré'],
                ['type' => 'text', 'text' => '1}'],
            ],
            'usage' => ['input_tokens' => 1234, 'output_tokens' => 56],
            'stop_reason' => 'end_turn',
        ], JSON_THROW_ON_ERROR)]);

        $result = (new AnthropicCaller($http, TwinSupport::PLATFORM_KEY))
            ->appeler('claude-sonnet-5', 'Tu es un cartographe.', 'Analyse le pôle 1.', 8192);

        self::assertSame(['texte' => '{"poleNum":1}', 'tokens_in' => 1234, 'tokens_out' => 56, 'stop_reason' => 'end_turn'], $result);
        $request = $http->requests[0];
        self::assertSame('https://api.anthropic.com/v1/messages', $request['url']);
        self::assertSame(AnthropicCaller::BASE_URL . '/v1/messages', $request['url']);
        self::assertSame(TwinSupport::PLATFORM_KEY, $request['headers']['x-api-key']);
        self::assertSame('2023-06-01', $request['headers']['anthropic-version']);
        $payload = json_decode((string) $request['body'], true);
        self::assertSame('Tu es un cartographe.', $payload['system']);
        self::assertSame(['type' => 'disabled'], $payload['thinking']);
        self::assertSame(8192, $payload['max_tokens']);
        self::assertSame([['role' => 'user', 'content' => 'Analyse le pôle 1.']], $payload['messages']);
    }

    #[TestDox('UC-APP-09-U27 — AnthropicCaller : erreurs amont traduites en messages génériques (504/502/429), jamais le texte amont')]
    public function testU27AnthropicCallerMapsUpstreamErrorsGenerically(): void
    {
        $cases = [
            [new HttpClientException('timeout', true), 504, 'ne répond pas'],
            [new HttpClientException('dns'), 502, 'injoignable'],
            [['status' => 429, 'body' => '{}'], 429, 'saturé'],
            [['status' => 401, 'body' => '{"error":{"message":"invalid x-api-key sk-ant-xyz"}}'], 502, 'Clé API refusée'],
            [['status' => 500, 'body' => '{"error":{"message":"prompt: Analyse le pôle 1."}}'], 502, 'Erreur du fournisseur LLM'],
            [['status' => 200, 'body' => '<html>proxy</html>'], 502, 'illisible'],
        ];
        foreach ($cases as [$upstream, $status, $fragment]) {
            $http = new LlmFakeHttpClient();
            $upstream instanceof HttpClientException ? $http->queueException($upstream) : $http->queueResponse($upstream);
            try {
                (new AnthropicCaller($http, 'sk-ant-x'))->appeler('claude-sonnet-5', null, 'Analyse le pôle 1.', 256);
                self::fail('aucune erreur pour ' . $status);
            } catch (Twin9Exception $e) {
                self::assertSame($status, $e->getStatusCode());
                self::assertStringContainsString($fragment, $e->getMessage());
                self::assertStringNotContainsString('Analyse le pôle', $e->getMessage());
                self::assertStringNotContainsString('sk-ant', $e->getMessage());
            }
        }
    }

    #[TestDox('UC-APP-09-U30 — rythme par utilisateur : fenêtre fixe d’une minute à appels_par_minute (30), le 31e appel attend 30 s ; un autre compte n’est pas pénalisé')]
    public function testU30PerUserCallRate(): void
    {
        self::$pdo->exec('DELETE FROM rate_limits');
        $limit = self::config()->appelsParMinute();
        $limiter = new RateLimiter(self::$pdo, $limit, 60);
        $now = 1_800_000_000; // début de fenêtre
        for ($i = 1; $i <= $limit; $i++) {
            self::assertSame($i, $limiter->hit('twin6:appel:7', $now + $i));
        }
        $attempts = $limiter->hit('twin6:appel:7', $now + 59);
        self::assertGreaterThan($limit, $attempts);
        self::assertSame(30, $limiter->retryAfter($attempts));
        self::assertSame(1, $limiter->hit('twin6:appel:8', $now + 59), 'seau propre à chaque compte');
        self::assertSame(1, $limiter->hit('twin6:appel:7', $now + 60), 'nouvelle minute, compteur remis à zéro');
    }
}
