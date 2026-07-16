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

        // Order: pack 0 = 10 USD (defaults — packs start at 10 USD so the
        // PayPal FIXED fee stays well under the 10 % margin), redirect URLs
        // on #/compte/credit.
        $create = $this->http->requests[1];
        self::assertSame('https://api-m.sandbox.paypal.com/v2/checkout/orders', $create['url']);
        self::assertSame('Bearer A21.test-access-token', $create['headers']['authorization']);
        $payload = json_decode((string) $create['body'], true);
        self::assertSame('CAPTURE', $payload['intent']);
        self::assertSame(['currency_code' => 'USD', 'value' => '10.00'], $payload['purchase_units'][0]['amount']);
        self::assertSame('https://humanome.xyz/#/compte/credit?paypal=retour', $payload['application_context']['return_url']);
        self::assertSame('https://humanome.xyz/#/compte/credit?paypal=annule', $payload['application_context']['cancel_url']);
    }

    // ==================================================================
    // Capture: credit, idempotence, refusal cases
    // ==================================================================

    /** The order was created by this user (recorded at /creer, ownership binding). */
    private function seedOrder(string $orderId): void
    {
        (new CreditService(Db::get()))->recordPaypalOrder($this->user['id'], $orderId);
    }

    public function testCapturerCreditsCapturedAmountIdempotently(): void
    {
        $this->seedOrder('ORDER-7');
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
        $this->seedOrder('ORDER-9');
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

    public function testCapturerRejectsOrderNotOwnedByCaller(): void
    {
        // Order created by another account; the current user must NOT be able to
        // capture it and credit themselves (2026-07-15 review, misattribution).
        $mallory = $this->registerAs('mallory@example.org', 'Mallory', ['apprenant']);
        (new CreditService(Db::get()))->recordPaypalOrder($mallory['id'], 'ORDER-FOREIGN');

        $response = $this->as_($this->user, 'POST', '/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-FOREIGN']);
        self::assertSame(403, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame([], $this->http->requests, 'nothing reaches PayPal for a foreign order');
        self::assertSame(0, (new CreditService(Db::get()))->balance($this->user['id']));

        // An entirely unknown order (never created via /creer) is refused too.
        $unknown = $this->as_($this->user, 'POST', '/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-UNKNOWN']);
        self::assertSame(403, $unknown->getStatusCode());
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
    // Refund on request (POST /api/twin9/credit/rembourser)
    // ==================================================================

    public function testRembourserRendLeSoldeContreLaCapture(): void
    {
        // A $10 top-up was captured (CAP-R), then $3 spent → balance $7.
        $credits = new CreditService(Db::get());
        $credits->recordCapture($this->user['id'], 'CAP-R', 'ORDER-R', 10_000_000);
        $credits->topup($this->user['id'], 10_000_000, 'ORDER-R', 'Recharge PayPal');
        $credits->debit($this->user['id'], 3_000_000, 'twin6/cartographie', 'claude-sonnet-5');
        self::assertSame(7_000_000, $credits->balance($this->user['id']));

        // PayPal: OAuth token then a COMPLETED refund.
        $this->queueToken();
        $this->http->queueResponse(['status' => 201, 'body' => json_encode(['id' => 'REF-1', 'status' => 'COMPLETED'], JSON_THROW_ON_ERROR)]);

        $response = $this->as_($this->user, 'POST', '/api/twin9/credit/rembourser', []);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);
        self::assertSame(7_000_000, $body['rembourse_microusd']); // $7.00 refunded
        self::assertSame(0, $body['solde_microusd']);

        // Refund hit the right capture with the right 2-decimal amount + idempotency key.
        $refund = $this->http->requests[1]; // [0] = OAuth token
        self::assertSame('https://api-m.sandbox.paypal.com/v2/payments/captures/CAP-R/refund', $refund['url']);
        self::assertSame('rf-' . $this->user['id'] . '-CAP-R-0', $refund['headers']['paypal-request-id']);
        self::assertSame(['value' => '7.00', 'currency_code' => 'USD'], json_decode((string) $refund['body'], true)['amount']);

        // Ledger: a 'refund' event, capture marked refunded.
        $events = $credits->events($this->user['id']);
        self::assertSame('refund', $events[0]['kind']);
        self::assertSame(-7_000_000, $events[0]['amount_microusd']);
        self::assertSame(0, $credits->soldeRemboursable($this->user['id']));
    }

    public function testRembourserRefuseSansSoldeRemboursable(): void
    {
        // Admin credit is NOT PayPal-funded → not refundable (no capture room).
        (new CreditService(Db::get()))->adjust($this->user['id'], 5_000_000, 'crédit promo admin');
        $response = $this->as_($this->user, 'POST', '/api/twin9/credit/rembourser', []);
        self::assertSame(422, $response->getStatusCode());
        self::assertSame([], $this->http->requests, 'no PayPal call when nothing is refundable');
    }

    private function queueRefund(string $refundId, string $status = 'COMPLETED', int $httpStatus = 201): void
    {
        $this->http->queueResponse([
            'status' => $httpStatus,
            'body' => json_encode(['id' => $refundId, 'status' => $status], JSON_THROW_ON_ERROR),
        ]);
    }

    /** Fige created_at d'une capture (l'ordre « plus récente d'abord » devient déterministe). */
    private static function setCaptureDate(string $captureId, string $date): void
    {
        Db::get()->prepare('UPDATE twin9_paypal_captures SET created_at = ? WHERE capture_id = ?')
            ->execute([$date, $captureId]);
    }

    // Exigence utilisateur (credits-paypal, point 5) : remboursement des crédits
    // non utilisés SUR DEMANDE, y compris PARTIEL. La clé d'idempotence PayPal
    // est décalée par le montant déjà remboursé (rf-{uid}-{capture}-{offset}) :
    // un second remboursement partiel de la même capture ne rejoue jamais la
    // même portion.
    public function testRembourserPartielPuisSecondPartielAvecCleDecalee(): void
    {
        $credits = new CreditService(Db::get());
        $credits->recordCapture($this->user['id'], 'CAP-P', 'ORDER-P', 10_000_000);
        $credits->topup($this->user['id'], 10_000_000, 'ORDER-P', 'Recharge PayPal');

        // Remboursement partiel de 2,50 $ (montant demandé par le client).
        $this->queueToken();
        $this->queueRefund('REF-P1');
        $response = $this->as_($this->user, 'POST', '/api/twin9/credit/rembourser', ['montant_microusd' => 2_500_000]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);
        self::assertSame(2_500_000, $body['rembourse_microusd']);
        self::assertSame(7_500_000, $body['solde_microusd']);

        $refund = $this->http->requests[1]; // [0] = OAuth token
        self::assertSame('https://api-m.sandbox.paypal.com/v2/payments/captures/CAP-P/refund', $refund['url']);
        self::assertSame('rf-' . $this->user['id'] . '-CAP-P-0', $refund['headers']['paypal-request-id']);
        self::assertSame(['value' => '2.50', 'currency_code' => 'USD'], json_decode((string) $refund['body'], true)['amount']);

        // Second remboursement partiel : la clé d'idempotence est DÉCALÉE du
        // montant déjà remboursé — pas de collision avec la première portion.
        $this->queueToken();
        $this->queueRefund('REF-P2');
        $second = $this->as_($this->user, 'POST', '/api/twin9/credit/rembourser', ['montant_microusd' => 1_000_000]);
        self::assertSame(200, $second->getStatusCode(), (string) $second->getBody());
        self::assertSame(1_000_000, self::json($second)['rembourse_microusd']);
        self::assertSame(6_500_000, self::json($second)['solde_microusd']);

        $refund2 = $this->http->requests[3];
        self::assertSame('rf-' . $this->user['id'] . '-CAP-P-2500000', $refund2['headers']['paypal-request-id']);
        self::assertSame('1.00', json_decode((string) $refund2['body'], true)['amount']['value']);

        // Grand-livre : deux événements 'refund' négatifs, capture décomptée.
        $credits = new CreditService(Db::get());
        $kinds = array_column($credits->events($this->user['id']), 'kind');
        self::assertSame(2, \count(array_keys($kinds, 'refund', true)));
        self::assertSame(6_500_000, $credits->soldeRemboursable($this->user['id']));
    }

    // Exigence (point 5) : la répartition d'un remboursement couvre PLUSIEURS
    // captures, la plus récente d'abord, chacune bornée par sa « room ».
    public function testRembourserRepartitSurPlusieursCapturesPlusRecenteDabord(): void
    {
        $credits = new CreditService(Db::get());
        $credits->recordCapture($this->user['id'], 'CAP-OLD', 'ORDER-OLD', 10_000_000);
        $credits->topup($this->user['id'], 10_000_000, 'ORDER-OLD', 'Recharge PayPal');
        $credits->recordCapture($this->user['id'], 'CAP-RECENT', 'ORDER-RECENT', 3_000_000);
        $credits->topup($this->user['id'], 3_000_000, 'ORDER-RECENT', 'Recharge PayPal');
        self::setCaptureDate('CAP-OLD', '2026-07-01 10:00:00');
        self::setCaptureDate('CAP-RECENT', '2026-07-02 10:00:00');

        // 5 $ demandés : 3 $ sur la capture récente (room épuisée), 2 $ sur l'ancienne.
        $this->queueToken();
        $this->queueRefund('REF-M1');
        $this->queueToken();
        $this->queueRefund('REF-M2');
        $response = $this->as_($this->user, 'POST', '/api/twin9/credit/rembourser', ['montant_microusd' => 5_000_000]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(5_000_000, self::json($response)['rembourse_microusd']);
        self::assertSame(8_000_000, self::json($response)['solde_microusd']);

        $premier = $this->http->requests[1];
        self::assertStringContainsString('/captures/CAP-RECENT/refund', $premier['url']);
        self::assertSame('3.00', json_decode((string) $premier['body'], true)['amount']['value']);
        $deuxieme = $this->http->requests[3];
        self::assertStringContainsString('/captures/CAP-OLD/refund', $deuxieme['url']);
        self::assertSame('2.00', json_decode((string) $deuxieme['body'], true)['amount']['value']);
    }

    // Les remboursements PayPal se font en centimes ENTIERS : une « room » de
    // 9 999 µUSD (< 1 centime) ne déclenche AUCUN appel PayPal et laisse le
    // solde intact (la poussière reste du crédit).
    public function testRembourserIgnoreLaPoussiereSousLeCentime(): void
    {
        $credits = new CreditService(Db::get());
        $credits->recordCapture($this->user['id'], 'CAP-DUST', 'ORDER-DUST', 9_999);
        $credits->topup($this->user['id'], 9_999, 'ORDER-DUST', 'Recharge PayPal');

        $response = $this->as_($this->user, 'POST', '/api/twin9/credit/rembourser', []);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(0, self::json($response)['rembourse_microusd']);
        self::assertSame(9_999, self::json($response)['solde_microusd']);
        self::assertSame([], $this->http->requests, 'aucun appel PayPal pour moins d’un centime');
    }

    // Échec PayPal EN COURS de boucle multi-captures : la réponse est 502 avec
    // le montant PARTIEL déjà remboursé, et le grand-livre ne débite QUE les
    // portions confirmées par PayPal (cohérence ledger ↔ argent réellement parti).
    public function testRembourserEchecPayPalEnCoursDeBoucleResteCoherent(): void
    {
        $credits = new CreditService(Db::get());
        $credits->recordCapture($this->user['id'], 'CAP-OLD', 'ORDER-OLD', 10_000_000);
        $credits->topup($this->user['id'], 10_000_000, 'ORDER-OLD', 'Recharge PayPal');
        $credits->recordCapture($this->user['id'], 'CAP-RECENT', 'ORDER-RECENT', 3_000_000);
        $credits->topup($this->user['id'], 3_000_000, 'ORDER-RECENT', 'Recharge PayPal');
        self::setCaptureDate('CAP-OLD', '2026-07-01 10:00:00');
        self::setCaptureDate('CAP-RECENT', '2026-07-02 10:00:00');

        // 1re portion (3 $) confirmée ; la 2e revient en 2xx mais non aboutie.
        $this->queueToken();
        $this->queueRefund('REF-OK');
        $this->queueToken();
        $this->queueRefund('REF-KO', 'FAILED');

        $response = $this->as_($this->user, 'POST', '/api/twin9/credit/rembourser', ['montant_microusd' => 5_000_000]);
        self::assertSame(502, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(3_000_000, self::json($response)['rembourse_microusd'], 'partiel exact');

        // Seule la portion confirmée est débitée : solde 13 - 3 = 10 $, UN seul
        // événement refund, et la room restante = capture ancienne intacte.
        $credits = new CreditService(Db::get());
        self::assertSame(10_000_000, $credits->balance($this->user['id']));
        $kinds = array_column($credits->events($this->user['id']), 'kind');
        self::assertSame(1, \count(array_keys($kinds, 'refund', true)));
        self::assertSame(10_000_000, $credits->soldeRemboursable($this->user['id']));
    }

    // ==================================================================
    // Rate-limit des routes PayPal (2026-07-15 review — chaque appel dépense
    // les identifiants PayPal live : 20/min/utilisateur)
    // ==================================================================

    /** Sature le compteur du bucket pour la fenêtre courante ET la suivante
     * (pas de flaky au changement de minute). Limite = PAYPAL_PAR_MINUTE (20). */
    private function saturateRateLimit(string $bucket): void
    {
        $window = intdiv(time(), 60) * 60;
        $stmt = Db::get()->prepare(
            'INSERT INTO rate_limits (bucket, window_start, counter) VALUES (?, ?, 20)
             ON DUPLICATE KEY UPDATE counter = 20'
        );
        foreach ([$window, $window + 60] as $w) {
            $stmt->execute([$bucket, $w]);
        }
    }

    public function testRoutesPaypalSontRateLimitees(): void
    {
        $uid = $this->user['id'];
        foreach ([
            ['twin9:paypal:creer:' . $uid, '/api/twin9/credit/paypal/creer', ['pack_index' => 0]],
            ['twin9:paypal:capturer:' . $uid, '/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-RL']],
            ['twin9:rembourser:' . $uid, '/api/twin9/credit/rembourser', []],
        ] as [$bucket, $path, $body]) {
            $this->saturateRateLimit($bucket);
            $response = $this->as_($this->user, 'POST', $path, $body);
            self::assertSame(429, $response->getStatusCode(), $path);
            self::assertNotSame('', $response->getHeaderLine('Retry-After'), $path);
        }
        self::assertSame([], $this->http->requests, 'rien n’atteint PayPal au-delà de la limite');
    }

    // ==================================================================
    // Packs de recharge exigés : 10/20/50/100/200/500 USD
    // ==================================================================

    // Exigence utilisateur (credits-paypal, point 1) : « recharges
    // 10/20/50/100/200/500 USD via PayPal ». Les défauts n'offrent que
    // 10/20/50 — ce test exprime l'offre EXIGÉE (rouge tant que
    // Twin9Config::defaults() ne liste pas les six packs).
    public function testPacksParDefautCouvrentLesSixMontantsExiges(): void
    {
        $response = $this->as_($this->user, 'GET', '/api/twin9/meta');
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(
            [10, 20, 50, 100, 200, 500],
            array_column(self::json($response)['packs'], 'montant_usd'),
            'l’offre de recharge doit proposer les packs 10/20/50/100/200/500 USD',
        );
    }

    // Exigence (point 1) : même par configuration admin, un pack de 500 USD
    // doit être possible. Aujourd'hui PACK_MAX_USD = 100.0 (Twin9Config) le
    // refuse en 422 — rouge tant que la borne n'est pas portée à 500.
    public function testAdminPeutConfigurerLesPacks200Et500(): void
    {
        $admin = $this->registerAs('admin@example.org', 'Root Admin', ['admin']);
        $packs = [
            ['montant_usd' => 100, 'libelle' => 'Pack établissement — 100 $'],
            ['montant_usd' => 200, 'libelle' => 'Pack établissement — 200 $'],
            ['montant_usd' => 500, 'libelle' => 'Pack établissement — 500 $'],
        ];
        $response = $this->as_($admin, 'PUT', '/api/twin9/admin/config', ['packs' => $packs]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());

        // Et l'offre publique les sert.
        $meta = $this->as_($this->user, 'GET', '/api/twin9/meta');
        self::assertSame([100, 200, 500], array_column(self::json($meta)['packs'], 'montant_usd'));
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
