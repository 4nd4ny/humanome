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
use Humanome\Twin9\CreditService;
use Humanome\Twin9\FactureService;
use Humanome\Twin9\PayPalClient;
use Humanome\Twin9\SoldeInsuffisantException;
use Humanome\Twin9\Twin9Config;
use Humanome\Twin9\Twin9Exception;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-APP-11 — Gérer son crédit Twin9 : tests UNITAIRES (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-11-gerer-credit-twin9.md
 *
 * Les classes sollicitées par les routes du crédit sont appelées
 * directement : PayPalClient (Orders v2 en redirection, capture, remboursement
 * — le faux client HTTP joue PayPal), CreditService (recharge idempotente,
 * propriété des ordres, captures remboursables, remboursement conditionnel)
 * et FactureService (facture mensuelle déterministe, suivi des dépenses).
 */
final class UcApp11GererCreditTwin9Test extends TestCase
{
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

    protected function tearDown(): void
    {
        TestDb::restoreEnv();
    }

    private static function user(string $email = 'lea@example.org', string $name = 'Léa'): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([$email, Users::hashPassword('x-password'), $name]);

        return (int) self::$pdo->lastInsertId();
    }

    private static function paypal(LlmFakeHttpClient $http): PayPalClient
    {
        return new PayPalClient($http, 'client-fictif', 'secret-fictif', PayPalClient::SANDBOX_BASE_URL);
    }

    /** Date un événement du grand-livre (facturation par mois). */
    private static function dater(int $userId, string $label, string $date): void
    {
        self::$pdo->prepare('UPDATE twin9_credit_events SET created_at = ? WHERE user_id = ? AND label = ?')
            ->execute([$date, $userId, $label]);
    }

    #[TestDox('UC-APP-11-U06 — PayPal configuré par l’environnement : identifiant OU secret absent → null (recharge indisponible) ; sandbox par défaut, live sur demande')]
    public function testU06PaypalFromEnv(): void
    {
        $http = new LlmFakeHttpClient();
        TestDb::setEnv('PAYPAL_CLIENT_ID', '');
        TestDb::setEnv('PAYPAL_SECRET', 'secret-fictif');
        self::assertNull(PayPalClient::fromEnv($http));
        // Identifiant sans secret : non configuré côté client PayPal (cf. anomalie 2, vue publique).
        TestDb::setEnv('PAYPAL_CLIENT_ID', 'client-fictif');
        TestDb::setEnv('PAYPAL_SECRET', '');
        self::assertNull(PayPalClient::fromEnv($http));
        TestDb::setEnv('PAYPAL_SECRET', 'secret-fictif');

        TestDb::setEnv('PAYPAL_CLIENT_ID', 'client-fictif');
        TestDb::setEnv('PAYPAL_MODE', 'live');
        $live = PayPalClient::fromEnv($http);
        self::assertNotNull($live);
        TwinSupport::queuePaypalToken($http);
        TwinSupport::queuePaypalOrderCreated($http, 'ORDER-LIVE');
        $live->createOrder(10.0, 'https://r', 'https://c');
        self::assertSame('https://api-m.paypal.com/v1/oauth2/token', $http->requests[0]['url']);

        TestDb::setEnv('PAYPAL_MODE', '');
        $sandbox = PayPalClient::fromEnv($http);
        TwinSupport::queuePaypalToken($http);
        TwinSupport::queuePaypalOrderCreated($http, 'ORDER-SBX');
        $sandbox->createOrder(10.0, 'https://r', 'https://c');
        self::assertSame('https://api-m.sandbox.paypal.com/v1/oauth2/token', $http->requests[2]['url']);
    }

    #[TestDox('UC-APP-11-U07 — création d’ordre : jeton OAuth, intention CAPTURE, montant à 2 décimales, URLs de retour ; lien d’approbation absent → 502')]
    public function testU07CreateOrder(): void
    {
        $http = new LlmFakeHttpClient();
        TwinSupport::queuePaypalToken($http);
        TwinSupport::queuePaypalOrderCreated($http, 'ORDER-20');

        $order = self::paypal($http)->createOrder(20, 'https://humanome.xyz/#/compte/credit?paypal=retour', 'https://humanome.xyz/#/compte/credit?paypal=annule');

        self::assertSame(['order_id' => 'ORDER-20', 'approve_url' => 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-20'], $order);
        self::assertSame('Basic ' . base64_encode('client-fictif:secret-fictif'), $http->requests[0]['headers']['authorization']);
        $payload = json_decode((string) $http->requests[1]['body'], true);
        self::assertSame('CAPTURE', $payload['intent']);
        self::assertSame(['currency_code' => 'USD', 'value' => '20.00'], $payload['purchase_units'][0]['amount']);
        self::assertSame('PAY_NOW', $payload['application_context']['user_action']);
        self::assertSame('NO_SHIPPING', $payload['application_context']['shipping_preference']);
        self::assertSame('https://humanome.xyz/#/compte/credit?paypal=retour', $payload['application_context']['return_url']);
        self::assertSame('https://humanome.xyz/#/compte/credit?paypal=annule', $payload['application_context']['cancel_url']);

        TwinSupport::queuePaypalToken($http);
        $http->queueResponse(['status' => 201, 'body' => '{"id":"ORDER-SANS-LIEN","links":[]}']);
        try {
            self::paypal($http)->createOrder(10, 'r', 'c');
            self::fail('réponse sans lien acceptée');
        } catch (Twin9Exception $e) {
            self::assertSame(502, $e->getStatusCode());
            self::assertSame('Réponse PayPal inattendue, réessayez plus tard.', $e->getMessage());
        }
    }

    #[TestDox('UC-APP-11-U08 — capture : montant et identifiant de capture lus chez PayPal ; déjà capturé → relecture ; non approuvé / introuvable → 422 ; panne → 502')]
    public function testU08CaptureOrder(): void
    {
        $http = new LlmFakeHttpClient();
        $client = self::paypal($http);

        TwinSupport::queuePaypalToken($http);
        TwinSupport::queuePaypalCaptured($http, 'ORDER-1', '20.00', 'CAP-1');
        self::assertSame(['status' => 'COMPLETED', 'montant_usd' => '20.00', 'capture_id' => 'CAP-1'], $client->captureOrder('ORDER-1'));
        self::assertSame('https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-1/capture', $http->requests[1]['url']);

        // Double clic : PayPal répond ORDER_ALREADY_CAPTURED → GET de l'ordre.
        TwinSupport::queuePaypalToken($http);
        TwinSupport::queuePaypalIssue($http, 'ORDER_ALREADY_CAPTURED');
        TwinSupport::queuePaypalToken($http);
        $http->queueResponse(['status' => 200, 'body' => json_encode(TwinSupport::paypalCompletedBody('ORDER-1', '20.00', 'CAP-1'), JSON_THROW_ON_ERROR)]);
        self::assertSame('COMPLETED', $client->captureOrder('ORDER-1')['status']);
        self::assertSame('GET', $http->requests[5]['method']);

        $cases = [
            [fn () => TwinSupport::queuePaypalIssue($http, 'ORDER_NOT_APPROVED'), 422, 'Paiement non approuvé'],
            [fn () => $http->queueResponse(['status' => 404, 'body' => '{}']), 422, 'Ordre PayPal introuvable.'],
            [fn () => $http->queueResponse(['status' => 500, 'body' => '{"debug_id":"x"}']), 502, 'erreur'],
            [fn () => $http->queueException(new HttpClientException('dns')), 502, 'injoignable'],
        ];
        foreach ($cases as [$queue, $status, $fragment]) {
            TwinSupport::queuePaypalToken($http);
            $queue();
            try {
                $client->captureOrder('ORDER-2');
                self::fail('capture acceptée : ' . $fragment);
            } catch (Twin9Exception $e) {
                self::assertSame($status, $e->getStatusCode());
                self::assertStringContainsString($fragment, $e->getMessage());
            }
        }

        // Identifiants refusés au jeton OAuth : message générique, jamais les identifiants.
        $http->queueResponse(['status' => 401, 'body' => '{"error":"invalid_client"}']);
        try {
            $client->captureOrder('ORDER-3');
            self::fail('jeton refusé accepté');
        } catch (Twin9Exception $e) {
            self::assertSame('Connexion à PayPal impossible (identifiants ?).', $e->getMessage());
            foreach (['client-fictif', 'secret-fictif', base64_encode('client-fictif:secret-fictif')] as $identifiant) {
                self::assertStringNotContainsString($identifiant, $e->getMessage());
            }
        }
    }

    #[TestDox('UC-APP-11-U09 — remboursement PayPal : contre une CAPTURE, montant décimal, clé d’idempotence PayPal-Request-Id ; refus → 502')]
    public function testU09RefundCapture(): void
    {
        $http = new LlmFakeHttpClient();
        TwinSupport::queuePaypalToken($http);
        TwinSupport::queuePaypalRefund($http, 'REF-1', 'PENDING');

        self::assertSame(['status' => 'PENDING', 'refund_id' => 'REF-1'], self::paypal($http)->refundCapture('CAP-1', '7.30', 'rf-3-CAP-1-0'));
        $request = $http->requests[1];
        self::assertSame('https://api-m.sandbox.paypal.com/v2/payments/captures/CAP-1/refund', $request['url']);
        self::assertSame('rf-3-CAP-1-0', $request['headers']['paypal-request-id']);
        self::assertSame(['amount' => ['value' => '7.30', 'currency_code' => 'USD']], json_decode((string) $request['body'], true));

        TwinSupport::queuePaypalToken($http);
        $http->queueResponse(['status' => 422, 'body' => '{}']);
        $this->expectException(Twin9Exception::class);
        $this->expectExceptionMessage('Le remboursement PayPal a échoué, réessayez plus tard.');
        self::paypal($http)->refundCapture('CAP-1', '1.00', 'rf-3-CAP-1-730000');
    }

    #[TestDox('UC-APP-11-U10 — recharge idempotente par ordre PayPal ; l’ordre reste lié à son créateur (premier propriétaire conservé)')]
    public function testU10IdempotentTopupAndOrderOwnership(): void
    {
        $lea = self::user();
        $mallory = self::user('mallory@example.org', 'Mallory');
        $credits = new CreditService(self::$pdo);

        $credits->recordPaypalOrder($lea, 'ORDER-L');
        $credits->recordPaypalOrder($mallory, 'ORDER-L'); // rejeu d'un autre compte : ignoré
        self::assertSame($lea, $credits->paypalOrderOwner('ORDER-L'));
        self::assertNull($credits->paypalOrderOwner('ORDER-INCONNU'));

        self::assertSame(['balance' => 20_000_000, 'applied' => true], $credits->topup($lea, 20_000_000, 'ORDER-L', 'Recharge PayPal'));
        self::assertSame(['balance' => 20_000_000, 'applied' => false], $credits->topup($lea, 20_000_000, 'ORDER-L', 'Recharge PayPal'));
        self::assertCount(1, $credits->events($lea));

        $this->expectException(\InvalidArgumentException::class);
        $credits->recordPaypalOrder($lea, '  ');
    }

    #[TestDox('UC-APP-11-U11 — remboursable = min(solde, reste des captures) ; captures les plus récentes d’abord ; débit de remboursement conditionnel')]
    public function testU11RefundableBalanceAndConditionalRefund(): void
    {
        $lea = self::user();
        $credits = new CreditService(self::$pdo);
        $credits->recordCapture($lea, '', 'ORDER-X', 5_000_000); // sans identifiant : ignorée
        $credits->recordCapture($lea, 'CAP-0', 'ORDER-X', 0);   // montant nul : ignorée
        $credits->recordCapture($lea, 'CAP-A', 'ORDER-A', 10_000_000);
        $credits->topup($lea, 10_000_000, 'ORDER-A');
        $credits->recordCapture($lea, 'CAP-B', 'ORDER-B', 3_000_000);
        $credits->topup($lea, 3_000_000, 'ORDER-B');
        self::$pdo->exec("UPDATE twin9_paypal_captures SET created_at = '2026-07-01 10:00:00' WHERE capture_id = 'CAP-A'");
        self::$pdo->exec("UPDATE twin9_paypal_captures SET created_at = '2026-07-02 10:00:00' WHERE capture_id = 'CAP-B'");
        $credits->adjust($lea, 4_000_000, 'Geste commercial (non remboursable)');
        $credits->debit($lea, 6_000_000, 'tagger/1-tag-pole (réserve)', 'claude-sonnet-5');

        self::assertSame(['CAP-B', 'CAP-A'], array_column($credits->refundableCaptures($lea), 'capture_id'));
        self::assertSame(11_000_000, $credits->balance($lea));
        self::assertSame(11_000_000, $credits->soldeRemboursable($lea), 'min(11 $ de solde, 13 $ capturés)');

        self::assertSame(8_000_000, $credits->appliquerRemboursement($lea, 'CAP-B', 3_000_000));
        self::assertSame(['CAP-A'], array_column($credits->refundableCaptures($lea), 'capture_id'));
        self::assertSame(-3_000_000, $credits->events($lea)[0]['amount_microusd']);
        self::assertSame('refund', $credits->events($lea)[0]['kind']);

        // Le solde a bougé entre-temps (dépense concurrente) : refus, rien d'appliqué.
        $credits->debit($lea, 7_500_000, 'lourd/24-president (réserve)', 'claude-opus-4-8');
        try {
            $credits->appliquerRemboursement($lea, 'CAP-A', 1_000_000);
            self::fail('remboursement au-delà du solde');
        } catch (SoldeInsuffisantException $e) {
            self::assertSame(500_000, $e->getBalanceMicrousd());
        }
        self::assertSame(10_000_000, $credits->refundableCaptures($lea)[0]['room_microusd']);
    }

    #[TestDox('UC-APP-11-U12 — facture mensuelle : numéro stable, consommation NETTE par modèle, recharges, ajustements à part, solde de fin ; bornes du mois (décembre → janvier)')]
    public function testU12MonthlyInvoice(): void
    {
        $lea = self::user();
        $credits = new CreditService(self::$pdo);
        $credits->topup($lea, 20_000_000, 'ORDER-DEC', 'Recharge PayPal');
        $credits->debit($lea, 100_000, 'tagger/1-tag-pole (réserve)', 'claude-sonnet-5');
        $credits->adjust($lea, 92_800, 'tagger/1-tag-pole (réconciliation)', 'claude-sonnet-5', 1000, 200);
        $credits->adjust($lea, 1_000_000, 'Geste commercial');
        $credits->topup($lea, 10_000_000, 'ORDER-JAN', 'Recharge PayPal');
        foreach (['Recharge PayPal', 'tagger/1-tag-pole (réserve)', 'tagger/1-tag-pole (réconciliation)', 'Geste commercial'] as $label) {
            self::dater($lea, $label, '2026-12-31 23:59:59');
        }
        self::$pdo->prepare("UPDATE twin9_credit_events SET created_at = '2027-01-01 00:00:00' WHERE paypal_order_id = 'ORDER-JAN'")->execute();

        $facture = (new FactureService(self::$pdo))->facture($lea, 2026, 12);

        self::assertSame('HUM-TW9-202612-' . $lea, $facture['numero']);
        self::assertSame('2026-12', $facture['periode']);
        self::assertSame(['nom' => 'Léa', 'email' => 'lea@example.org'], $facture['client']);
        self::assertSame([['model' => 'claude-sonnet-5', 'appels' => 1, 'tokens_in' => 1000, 'tokens_out' => 200, 'consomme_microusd' => 7200]], $facture['lignes']);
        self::assertSame(['ORDER-DEC'], array_column($facture['recharges'], 'paypal_order_id'), 'la recharge de janvier est hors période');
        self::assertSame([['montant_microusd' => 1_000_000, 'libelle' => 'Geste commercial', 'date' => '2026-12-31 23:59:59']], $facture['ajustements']);
        self::assertSame(7200, $facture['total_consomme_microusd']);
        self::assertSame(20_000_000, $facture['total_recharges_microusd']);
        self::assertSame(20_000_000 - 7200 + 1_000_000, $facture['solde_fin_periode_microusd']);
        self::assertSame($facture, (new FactureService(self::$pdo))->facture($lea, 2026, 12), 'document déterministe');
        self::assertSame([], (new FactureService(self::$pdo))->facture($lea, 2027, 1)['lignes']);
    }

    #[TestDox('UC-APP-11-U13 — suivi des dépenses : mois les plus récents d’abord, recharges / consommé net / appels ; anomalie figée : un ajustement administratif y compte en consommation NÉGATIVE')]
    public function testU13SpendTracking(): void
    {
        $lea = self::user();
        $credits = new CreditService(self::$pdo);
        $credits->topup($lea, 10_000_000, 'ORDER-J', 'Recharge PayPal');
        $credits->debit($lea, 50_000, 'r1 (réserve)', 'claude-sonnet-5');
        $credits->adjust($lea, 20_000, 'r1 (réconciliation)', 'claude-sonnet-5', 10, 10);
        $credits->debit($lea, 40_000, 'r2 (réserve)', 'claude-sonnet-5');
        foreach (['Recharge PayPal', 'r1 (réserve)', 'r1 (réconciliation)'] as $label) {
            self::dater($lea, $label, '2026-07-10 12:00:00');
        }
        self::dater($lea, 'r2 (réserve)', '2026-08-02 12:00:00');

        self::assertSame([
            ['mois' => '2026-08', 'recharges_microusd' => 0, 'consomme_microusd' => 40_000, 'appels' => 1],
            ['mois' => '2026-07', 'recharges_microusd' => 10_000_000, 'consomme_microusd' => 30_000, 'appels' => 1],
        ], (new FactureService(self::$pdo))->depensesParMois($lea));
        self::assertCount(1, (new FactureService(self::$pdo))->depensesParMois($lea, 1));

        // ANOMALIE figée (fiche, anomalie 1) : un geste commercial de +4 $ apparaît
        // dans le suivi comme une consommation de −4 $, alors que la facture du
        // même mois le range à part (ajustements) et n'y compte aucune consommation.
        $credits->adjust($lea, 4_000_000, 'Geste commercial');
        self::dater($lea, 'Geste commercial', '2026-09-15 12:00:00');
        self::assertSame(
            ['mois' => '2026-09', 'recharges_microusd' => 0, 'consomme_microusd' => -4_000_000, 'appels' => 0],
            (new FactureService(self::$pdo))->depensesParMois($lea)[0],
        );
        $facture = (new FactureService(self::$pdo))->facture($lea, 2026, 9);
        self::assertSame(0, $facture['total_consomme_microusd']);
        self::assertSame(4_000_000, $facture['ajustements'][0]['montant_microusd']);
    }

    #[TestDox('UC-APP-11-U14 — offre de recharge : packs 10 à 500 USD par défaut ; « PayPal configuré » annoncé selon l’identifiant client')]
    public function testU14PacksAndPaypalAvailability(): void
    {
        self::$pdo->exec("DELETE FROM settings WHERE name = 'twin9_config'");
        $config = new Twin9Config(new SettingsRepository(self::$pdo));
        self::assertSame([10, 20, 50, 100, 200, 500], array_column($config->packs(), 'montant_usd'));
        self::assertSame('Pack découverte — 10 $', $config->packs()[0]['libelle']);

        TestDb::setEnv('PAYPAL_CLIENT_ID', '');
        self::assertFalse($config->publicView()['paypalConfigured']);
        TestDb::setEnv('PAYPAL_CLIENT_ID', 'client-fictif');
        self::assertTrue($config->publicView()['paypalConfigured']);
        self::assertSame($config->packs(), $config->publicView()['packs']);
    }

    #[TestDox('UC-APP-11-U15 — RateLimiter (fenêtre fixe d’une minute, un seau par clé) : au-delà du plafond, bloqué et nouvelle tentative dans 30 s — la limite RÉELLE des routes (20) est vérifiée par F22')]
    public function testU15PaypalRateLimit(): void
    {
        self::$pdo->exec('DELETE FROM rate_limits');
        $limiter = new RateLimiter(self::$pdo, 20, 60);
        $now = 1_800_000_000;
        for ($i = 1; $i <= 20; $i++) {
            $limiter->hit('twin9:paypal:creer:3', $now);
        }
        self::assertSame(21, $limiter->hit('twin9:paypal:creer:3', $now));
        self::assertTrue($limiter->isBlocked('twin9:paypal:creer:3', $now));
        self::assertSame(30, $limiter->retryAfter(20 + 1), 'valeur annoncée par les routes PayPal');
        self::assertFalse($limiter->isBlocked('twin9:paypal:capturer:3', $now), 'chaque route a son seau');
    }
}
