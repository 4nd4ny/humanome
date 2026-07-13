<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Llm\LlmRuntime;
use Humanome\Twin9\CreditService;

/**
 * T3b (ADR-010 §3) — PayPal Orders v2 redirect flow: order creation,
 * server-to-server capture, idempotence by order id, and the credit ledger
 * route. HTTP is fully mocked (LlmRuntime seam): no network in the suite,
 * no real PayPal credential anywhere.
 */
final class Twin9PayPalTest extends CartographeTestCase
{
    private const CLIENT_ID = 'test-paypal-client-id';
    private const SECRET = 'test-paypal-secret';

    private LlmFakeHttpClient $http;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $user;

    protected function setUp(): void
    {
        parent::setUp(); // wipes users; credits/events cascade with them
        TestDb::setEnv('PAYPAL_MODE', 'sandbox');
        TestDb::setEnv('PAYPAL_CLIENT_ID', self::CLIENT_ID);
        TestDb::setEnv('PAYPAL_SECRET', self::SECRET);
        TestDb::setEnv('MIGRATE_TOKEN', 'unused');
        Db::get()->exec("DELETE FROM settings WHERE name = 'twin9_config'");

        $this->http = new LlmFakeHttpClient();
        LlmRuntime::setHttpClient($this->http);

        $this->user = $this->registerAs('ada@example.org', 'Ada', ['apprenant']);
    }

    protected function tearDown(): void
    {
        LlmRuntime::setHttpClient(null);
        parent::tearDown();
    }

    private function queueToken(): void
    {
        $this->http->queueResponse(['status' => 200, 'body' => json_encode([
            'access_token' => 'A21.test-access-token',
            'token_type' => 'Bearer',
            'expires_in' => 32400,
        ], JSON_THROW_ON_ERROR)]);
    }

    private function queueOrderCreated(string $orderId): void
    {
        $this->http->queueResponse(['status' => 201, 'body' => json_encode([
            'id' => $orderId,
            'status' => 'CREATED',
            'links' => [
                ['href' => 'https://api-m.sandbox.paypal.com/v2/checkout/orders/' . $orderId, 'rel' => 'self', 'method' => 'GET'],
                ['href' => 'https://www.sandbox.paypal.com/checkoutnow?token=' . $orderId, 'rel' => 'approve', 'method' => 'GET'],
            ],
        ], JSON_THROW_ON_ERROR)]);
    }

    /** @return array<string, mixed> */
    private static function completedBody(string $orderId, string $amount): array
    {
        return [
            'id' => $orderId,
            'status' => 'COMPLETED',
            'purchase_units' => [[
                'payments' => ['captures' => [[
                    'id' => 'CAP-1',
                    'status' => 'COMPLETED',
                    'amount' => ['currency_code' => 'USD', 'value' => $amount],
                ]]],
            ]],
        ];
    }

    private function queueCaptureCompleted(string $orderId, string $amount): void
    {
        $this->http->queueResponse([
            'status' => 201,
            'body' => json_encode(self::completedBody($orderId, $amount), JSON_THROW_ON_ERROR),
        ]);
    }

    // ==================================================================
    // Availability and guards
    // ==================================================================

    public function testUnconfiguredPaypalAnswers503(): void
    {
        TestDb::setEnv('PAYPAL_CLIENT_ID', '');
        $creer = $this->as_($this->user, 'POST', '/api/twin9/credit/paypal/creer', ['pack_index' => 0]);
        self::assertSame(503, $creer->getStatusCode());
        $capturer = $this->as_($this->user, 'POST', '/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-1']);
        self::assertSame(503, $capturer->getStatusCode());
        self::assertSame([], $this->http->requests);
    }

    public function testRoutesRequireSession(): void
    {
        $this->cookieSid = null;
        self::assertSame(401, $this->request('POST', '/api/twin9/credit/paypal/creer', ['pack_index' => 0])->getStatusCode());
        self::assertSame(401, $this->request('POST', '/api/twin9/credit/paypal/capturer', ['order_id' => 'X'])->getStatusCode());
        self::assertSame(401, $this->request('GET', '/api/twin9/credit')->getStatusCode());
    }

    public function testCreerValidatesPackIndex(): void
    {
        foreach ([['pack_index' => 99], ['pack_index' => -1], ['pack_index' => 'zero'], []] as $body) {
            $response = $this->as_($this->user, 'POST', '/api/twin9/credit/paypal/creer', $body);
            self::assertSame(422, $response->getStatusCode(), json_encode($body));
        }
        self::assertSame([], $this->http->requests, 'nothing reaches PayPal');
    }

    // ==================================================================
    // Order creation
    // ==================================================================

    public function testCreerCreatesOrderAndReturnsApproveUrl(): void
    {
        $this->queueToken();
        $this->queueOrderCreated('ORDER-42');

        $response = $this->as_($this->user, 'POST', '/api/twin9/credit/paypal/creer', ['pack_index' => 0]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame([
            'order_id' => 'ORDER-42',
            'approve_url' => 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-42',
        ], self::json($response));

        // OAuth: sandbox base URL (PAYPAL_MODE), Basic client_id:secret.
        $oauth = $this->http->requests[0];
        self::assertSame('https://api-m.sandbox.paypal.com/v1/oauth2/token', $oauth['url']);
        self::assertSame('Basic ' . base64_encode(self::CLIENT_ID . ':' . self::SECRET), $oauth['headers']['authorization']);
        self::assertSame('grant_type=client_credentials', $oauth['body']);

        // Order: pack 0 = 5 USD (defaults), redirect URLs on #/compte/credit.
        $create = $this->http->requests[1];
        self::assertSame('https://api-m.sandbox.paypal.com/v2/checkout/orders', $create['url']);
        self::assertSame('Bearer A21.test-access-token', $create['headers']['authorization']);
        $payload = json_decode((string) $create['body'], true);
        self::assertSame('CAPTURE', $payload['intent']);
        self::assertSame(['currency_code' => 'USD', 'value' => '5.00'], $payload['purchase_units'][0]['amount']);
        self::assertSame('https://humanome.xyz/#/compte/credit?paypal=retour', $payload['application_context']['return_url']);
        self::assertSame('https://humanome.xyz/#/compte/credit?paypal=annule', $payload['application_context']['cancel_url']);
    }

    // ==================================================================
    // Capture: credit, idempotence, refusal cases
    // ==================================================================

    public function testCapturerCreditsCapturedAmountIdempotently(): void
    {
        $this->queueToken();
        $this->queueCaptureCompleted('ORDER-7', '10.00');

        $response = $this->as_($this->user, 'POST', '/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-7']);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(['solde_microusd' => 10_000_000], self::json($response));
        self::assertSame(
            'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-7/capture',
            $this->http->requests[1]['url'],
        );

        // Double click replay #1: PayPal answers ORDER_ALREADY_CAPTURED, we
        // converge through GET order — same balance, still ONE ledger event.
        $this->queueToken();
        $this->http->queueResponse(['status' => 422, 'body' => json_encode([
            'name' => 'UNPROCESSABLE_ENTITY',
            'details' => [['issue' => 'ORDER_ALREADY_CAPTURED']],
        ], JSON_THROW_ON_ERROR)]);
        $this->queueToken();
        $this->http->queueResponse(['status' => 200, 'body' => json_encode(self::completedBody('ORDER-7', '10.00'), JSON_THROW_ON_ERROR)]);

        $replay = $this->as_($this->user, 'POST', '/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-7']);
        self::assertSame(200, $replay->getStatusCode(), (string) $replay->getBody());
        self::assertSame(['solde_microusd' => 10_000_000], self::json($replay));

        // Replay #2: even a duplicated COMPLETED capture body cannot credit
        // twice — the ledger is keyed on paypal_order_id.
        $this->queueToken();
        $this->queueCaptureCompleted('ORDER-7', '10.00');
        $replay2 = $this->as_($this->user, 'POST', '/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-7']);
        self::assertSame(['solde_microusd' => 10_000_000], self::json($replay2));

        $events = (new CreditService(Db::get()))->events($this->user['id']);
        self::assertCount(1, $events, 'one topup event for three captures');
        self::assertSame('topup', $events[0]['kind']);
        self::assertSame(10_000_000, $events[0]['amount_microusd']);
        self::assertSame('ORDER-7', $events[0]['paypal_order_id']);
    }

    public function testCapturerNotApprovedAnswers422(): void
    {
        $this->queueToken();
        $this->http->queueResponse(['status' => 422, 'body' => json_encode([
            'name' => 'UNPROCESSABLE_ENTITY',
            'details' => [['issue' => 'ORDER_NOT_APPROVED']],
        ], JSON_THROW_ON_ERROR)]);

        $response = $this->as_($this->user, 'POST', '/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-9']);
        self::assertSame(422, $response->getStatusCode());
        self::assertStringContainsString('approuvé', self::json($response)['error']);
        self::assertSame(0, (new CreditService(Db::get()))->balance($this->user['id']));
    }

    public function testCapturerValidatesOrderId(): void
    {
        foreach ([[], ['order_id' => ''], ['order_id' => 'pas valide !'], ['order_id' => str_repeat('A', 65)]] as $body) {
            $response = $this->as_($this->user, 'POST', '/api/twin9/credit/paypal/capturer', $body);
            self::assertSame(422, $response->getStatusCode(), json_encode($body));
        }
        self::assertSame([], $this->http->requests);
    }

    // ==================================================================
    // GET /api/twin9/credit — ledger page
    // ==================================================================

    public function testCreditRouteReturnsBalanceAndEvents(): void
    {
        $credits = new CreditService(Db::get());
        $credits->topup($this->user['id'], 5_000_000, 'ORDER-LEDGER-1', 'Recharge PayPal');
        $credits->debit($this->user['id'], 9_000, 'fictif/01-essai', 'claude-sonnet-5', 1000, 200);

        $response = $this->as_($this->user, 'GET', '/api/twin9/credit');
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);

        self::assertSame(4_991_000, $body['solde_microusd']);
        self::assertSame([
            [
                'kind' => 'debit',
                'montant_microusd' => -9_000,
                'label' => 'fictif/01-essai',
                'model' => 'claude-sonnet-5',
                'tokens_in' => 1000,
                'tokens_out' => 200,
            ],
            [
                'kind' => 'topup',
                'montant_microusd' => 5_000_000,
                'label' => 'Recharge PayPal',
                'model' => null,
                'tokens_in' => null,
                'tokens_out' => null,
            ],
        ], array_map(static function (array $event): array {
            self::assertArrayHasKey('date', $event);
            unset($event['date']);

            return $event;
        }, $body['evenements']));
    }
}
