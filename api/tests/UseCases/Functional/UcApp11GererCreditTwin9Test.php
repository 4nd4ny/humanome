<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Db;
use Humanome\Llm\LlmRuntime;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\TwinSupport;
use Humanome\Twin9\CreditService;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-APP-11 — Gérer son crédit Twin9 : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-11-gerer-credit-twin9.md
 *
 * Le parcours de l'apprenant est rejoué à travers l'API HTTP (Slim en
 * processus, vraie base MySQL) : consultation, création d'ordre PayPal,
 * capture au retour, dépense réelle (un appel Twin6 facturé), suivi des
 * dépenses, facture du mois, remboursement à la demande. PayPal et Anthropic
 * sont joués par le faux client HTTP (LlmRuntime) : aucun appel réseau.
 */
final class UcApp11GererCreditTwin9Test extends CartographeTestCase
{
    private LlmFakeHttpClient $http;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $apprenant;

    protected function setUp(): void
    {
        parent::setUp();
        TestDb::setEnv('PAYPAL_MODE', 'sandbox');
        TestDb::setEnv('PAYPAL_CLIENT_ID', 'client-fictif');
        TestDb::setEnv('PAYPAL_SECRET', 'secret-fictif');
        TestDb::setEnv('ANTHROPIC_API_KEY', TwinSupport::PLATFORM_KEY);
        Db::get()->exec("DELETE FROM settings WHERE name = 'twin9_config'");
        $this->http = new LlmFakeHttpClient();
        LlmRuntime::setHttpClient($this->http);
        $this->apprenant = $this->registerAs('lea@example.org', 'Léa', ['apprenant']);
    }

    protected function tearDown(): void
    {
        LlmRuntime::setHttpClient(null);
        parent::tearDown();
    }

    private function post(string $path, array $body = [], ?array $user = null): ResponseInterface
    {
        return $this->as_($user ?? $this->apprenant, 'POST', $path, $body);
    }

    private function get(string $path, ?array $user = null): ResponseInterface
    {
        return $this->as_($user ?? $this->apprenant, 'GET', $path);
    }

    /** Mois courant SELON MySQL (horodateur du grand-livre) : [AAAA-MM, annee, mois]. */
    private static function moisCourant(): array
    {
        $mois = (string) self::$pdo->query("SELECT DATE_FORMAT(NOW(), '%Y-%m')")->fetchColumn();

        return [$mois, (int) substr($mois, 0, 4), (int) substr($mois, 5, 2)];
    }

    /** Recharge complète (créer → approuver chez PayPal → capturer). */
    private function recharger(int $packIndex, string $orderId, string $amount, string $captureId): ResponseInterface
    {
        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalOrderCreated($this->http, $orderId);
        self::assertSame(200, $this->post('/api/twin9/credit/paypal/creer', ['pack_index' => $packIndex])->getStatusCode());
        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalCaptured($this->http, $orderId, $amount, $captureId);

        return $this->post('/api/twin9/credit/paypal/capturer', ['order_id' => $orderId]);
    }

    #[TestDox('UC-APP-11-F11 — nominal : consulter → recharger 20 $ via PayPal → dépenser → suivre ses dépenses → facture du mois')]
    public function testF11NominalCreditLifecycle(): void
    {
        // 1. Consultation d'un compte neuf.
        self::assertSame(['solde_microusd' => 0, 'evenements' => []], self::json($this->get('/api/twin9/credit')));
        $meta = self::json($this->get('/api/twin9/meta'));
        self::assertTrue($meta['paypalConfigured']);
        self::assertSame(20, $meta['packs'][1]['montant_usd']);

        // 2-3. Création de l'ordre (pack 20 $), approbation chez PayPal, capture au retour.
        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalOrderCreated($this->http, 'ORDER-F11');
        $creer = self::json($this->post('/api/twin9/credit/paypal/creer', ['pack_index' => 1]));
        self::assertSame('https://www.sandbox.paypal.com/checkoutnow?token=ORDER-F11', $creer['approve_url']);
        self::assertSame('20.00', json_decode((string) $this->http->requests[1]['body'], true)['purchase_units'][0]['amount']['value']);

        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalCaptured($this->http, 'ORDER-F11', '20.00', 'CAP-F11');
        self::assertSame(['solde_microusd' => 20_000_000], self::json($this->post('/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-F11'])));

        // 4. Dépense réelle : un appel facturé (Twin6, +10 %).
        TwinSupport::queueAnthropic($this->http, '{"poleNum":1}', 1000, 200);
        $appel = $this->post('/api/twin6/appel', ['model' => 'claude-sonnet-5', 'prompt' => 'Scanne le pôle 1.', 'max_tokens' => 1024]);
        self::assertSame(6602, self::json($appel)['cout_microusd']);

        // 5. Grand-livre, suivi mensuel et facture : même source, compteurs seulement.
        $credit = self::json($this->get('/api/twin9/credit'));
        self::assertSame(20_000_000 - 6602, $credit['solde_microusd']);
        self::assertSame(['adjust', 'debit', 'topup'], array_column($credit['evenements'], 'kind'));
        self::assertSame('Recharge PayPal', $credit['evenements'][2]['label']);

        [$mois, $annee, $m] = self::moisCourant();
        $depenses = self::json($this->get('/api/twin9/depenses'));
        self::assertSame([['mois' => $mois, 'recharges_microusd' => 20_000_000, 'consomme_microusd' => 6602, 'appels' => 1]], $depenses['mois']);

        $facture = self::json($this->get('/api/twin9/facture?annee=' . $annee . '&mois=' . $m));
        self::assertSame(sprintf('HUM-TW9-%04d%02d-%d', $annee, $m, $this->apprenant['id']), $facture['numero']);
        self::assertSame(['nom' => 'Léa', 'email' => 'lea@example.org'], $facture['client']);
        self::assertSame([['model' => 'claude-sonnet-5', 'appels' => 1, 'tokens_in' => 1000, 'tokens_out' => 200, 'consomme_microusd' => 6602]], $facture['lignes']);
        self::assertSame('ORDER-F11', $facture['recharges'][0]['paypal_order_id']);
        self::assertSame(20_000_000 - 6602, $facture['solde_fin_periode_microusd']);
    }

    #[TestDox('UC-APP-11-F12 — A2 : retour PayPal rejoué (double clic, lien rechargé) → même solde, UNE seule recharge')]
    public function testF12ReplayedCaptureIsIdempotent(): void
    {
        self::assertSame(['solde_microusd' => 10_000_000], self::json($this->recharger(0, 'ORDER-F12', '10.00', 'CAP-F12')));

        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalIssue($this->http, 'ORDER_ALREADY_CAPTURED');
        TwinSupport::queuePaypalToken($this->http);
        $this->http->queueResponse(['status' => 200, 'body' => json_encode(TwinSupport::paypalCompletedBody('ORDER-F12', '10.00', 'CAP-F12'), JSON_THROW_ON_ERROR)]);
        self::assertSame(['solde_microusd' => 10_000_000], self::json($this->post('/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-F12'])));

        $events = (new CreditService(Db::get()))->events($this->apprenant['id']);
        self::assertCount(1, $events);
        self::assertSame(1, (int) self::$pdo->query("SELECT COUNT(*) FROM twin9_paypal_captures WHERE capture_id = 'CAP-F12'")->fetchColumn());
    }

    #[TestDox('UC-APP-11-F13 — A3 : remboursement partiel puis du reste, contre les captures ; facture : solde de fin seulement (anomalie figée : le suivi mensuel le compte en consommé)')]
    public function testF13PartialThenFullRefund(): void
    {
        $this->recharger(0, 'ORDER-F13', '10.00', 'CAP-F13');

        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalRefund($this->http, 'REF-1');
        $partiel = self::json($this->post('/api/twin9/credit/rembourser', ['montant_microusd' => 2_500_000]));
        self::assertSame(['rembourse_microusd' => 2_500_000, 'solde_microusd' => 7_500_000], $partiel);
        $refund = $this->http->requests[5];
        self::assertSame('rf-' . $this->apprenant['id'] . '-CAP-F13-0', $refund['headers']['paypal-request-id']);

        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalRefund($this->http, 'REF-2');
        $reste = self::json($this->post('/api/twin9/credit/rembourser'));
        self::assertSame(['rembourse_microusd' => 7_500_000, 'solde_microusd' => 0], $reste);
        self::assertSame('7.50', json_decode((string) $this->http->requests[7]['body'], true)['amount']['value']);

        $credit = self::json($this->get('/api/twin9/credit'));
        self::assertSame(['refund', 'refund', 'topup'], array_column($credit['evenements'], 'kind'));
        [, $annee, $m] = self::moisCourant();
        $facture = self::json($this->get('/api/twin9/facture?annee=' . $annee . '&mois=' . $m));
        self::assertSame([], $facture['lignes'], 'un remboursement n’est pas une consommation');
        self::assertSame(0, $facture['solde_fin_periode_microusd']);

        // ANOMALIE figée : le suivi mensuel compte les remboursements comme de la
        // CONSOMMATION (tout ce qui n'est pas une recharge), contrairement à la facture.
        $depenses = self::json($this->get('/api/twin9/depenses'))['mois'][0];
        self::assertSame(['recharges_microusd' => 10_000_000, 'consomme_microusd' => 10_000_000, 'appels' => 0], array_slice($depenses, 1, null, true));
    }

    #[TestDox('UC-APP-11-F14 — E1 : sans session → 401 sur toutes les routes du crédit')]
    public function testF14EveryRouteRequiresSession(): void
    {
        $this->cookieSid = null;
        foreach ([
            ['GET', '/api/twin9/credit', null],
            ['GET', '/api/twin9/depenses', null],
            ['GET', '/api/twin9/facture?annee=2026&mois=7', null],
            ['POST', '/api/twin9/credit/paypal/creer', ['pack_index' => 0]],
            ['POST', '/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-X']],
            ['POST', '/api/twin9/credit/rembourser', []],
        ] as [$method, $path, $body]) {
            self::assertSame(401, $this->request($method, $path, $body)->getStatusCode(), $path);
        }
        self::assertSame([], $this->http->requests);
    }

    #[TestDox('UC-APP-11-F15 — E2 : PayPal non configuré → 503 sur créer/capturer/rembourser ; anomalie figée : identifiant sans secret = offre annoncée')]
    public function testF15PaypalNotConfigured(): void
    {
        TestDb::setEnv('PAYPAL_SECRET', '');
        // ANOMALIE figée : la vue publique ne regarde que PAYPAL_CLIENT_ID — sans
        // secret, l'offre annonce la recharge alors que les routes répondent 503.
        self::assertTrue(self::json($this->get('/api/twin9/meta'))['paypalConfigured']);
        (new CreditService(Db::get()))->recordCapture($this->apprenant['id'], 'CAP-X', 'ORDER-X', 1_000_000);
        self::assertSame(503, $this->post('/api/twin9/credit/paypal/creer', ['pack_index' => 0])->getStatusCode());
        self::assertSame(503, $this->post('/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-X'])->getStatusCode());
        self::assertSame(['error' => 'Remboursement PayPal non configuré'], self::json($this->post('/api/twin9/credit/rembourser')));

        TestDb::setEnv('PAYPAL_CLIENT_ID', '');
        self::assertFalse(self::json($this->get('/api/twin9/meta'))['paypalConfigured']);
        self::assertSame([], $this->http->requests);
    }

    #[TestDox('UC-APP-11-F16 — E3 : pack inconnu ou identifiant d’ordre invalide → 422 avant tout appel PayPal')]
    public function testF16InvalidPackOrOrderId(): void
    {
        foreach ([['pack_index' => 6], ['pack_index' => -1], ['pack_index' => '1'], []] as $body) {
            self::assertSame(['error' => 'Pack inconnu'], self::json($this->post('/api/twin9/credit/paypal/creer', $body)));
        }
        foreach ([[], ['order_id' => ''], ['order_id' => 'ORDER 1'], ['order_id' => str_repeat('A', 65)]] as $body) {
            self::assertSame(['error' => 'Champ requis : order_id'], self::json($this->post('/api/twin9/credit/paypal/capturer', $body)));
        }
        self::assertSame([], $this->http->requests);
    }

    #[TestDox('UC-APP-11-F17 — E4 : capturer l’ordre d’un AUTRE compte (ou un ordre jamais créé) → 403, rien ne part chez PayPal')]
    public function testF17ForeignOrderIsRefused(): void
    {
        $mallory = $this->registerAs('mallory@example.org', 'Mallory', ['apprenant']);
        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalOrderCreated($this->http, 'ORDER-LEA');
        $this->post('/api/twin9/credit/paypal/creer', ['pack_index' => 0]);
        $avant = \count($this->http->requests);

        $vol = $this->post('/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-LEA'], $mallory);
        self::assertSame(403, $vol->getStatusCode());
        self::assertSame('Cet ordre de paiement ne vous appartient pas.', self::json($vol)['error']);
        self::assertSame(403, $this->post('/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-JAMAIS-CREE'])->getStatusCode());
        self::assertCount($avant, $this->http->requests);
        self::assertSame(0, (new CreditService(Db::get()))->balance($mallory['id']));
    }

    #[TestDox('UC-APP-11-F18 — E5 : paiement non approuvé (422), capture non finalisée (422), montant nul (502) → aucun crédit')]
    public function testF18CaptureNotCompleted(): void
    {
        (new CreditService(Db::get()))->recordPaypalOrder($this->apprenant['id'], 'ORDER-F18');

        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalIssue($this->http, 'ORDER_NOT_APPROVED');
        $r1 = $this->post('/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-F18']);
        self::assertSame(422, $r1->getStatusCode());
        self::assertStringContainsString('validez d’abord le paiement sur PayPal', self::json($r1)['error']);

        TwinSupport::queuePaypalToken($this->http);
        $this->http->queueResponse(['status' => 201, 'body' => '{"id":"ORDER-F18","status":"PENDING"}']);
        self::assertSame(['error' => 'Paiement non finalisé côté PayPal, réessayez.'], self::json($this->post('/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-F18'])));

        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalCaptured($this->http, 'ORDER-F18', '0.00', 'CAP-F18');
        $r3 = $this->post('/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-F18']);
        self::assertSame(502, $r3->getStatusCode());
        self::assertSame('Montant PayPal invalide', self::json($r3)['error']);

        self::assertSame(0, (new CreditService(Db::get()))->balance($this->apprenant['id']));
        self::assertSame([], (new CreditService(Db::get()))->events($this->apprenant['id']));
    }

    #[TestDox('UC-APP-11-F19 — E6 : PayPal en erreur à la création d’ordre → 502 générique, aucun ordre lié')]
    public function testF19PaypalErrorOnCreate(): void
    {
        TwinSupport::queuePaypalToken($this->http);
        $this->http->queueResponse(['status' => 500, 'body' => '{"debug_id":"abc","details":[{"issue":"INTERNAL"}]}']);
        $response = $this->post('/api/twin9/credit/paypal/creer', ['pack_index' => 0]);
        self::assertSame(502, $response->getStatusCode());
        self::assertSame(['error' => 'Le service PayPal a renvoyé une erreur, réessayez plus tard.'], self::json($response));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_paypal_orders')->fetchColumn());
    }

    #[TestDox('UC-APP-11-F20 — E7 : rien de remboursable (crédit non PayPal) → 422 ; remboursement refusé par PayPal → 502, solde intact')]
    public function testF20NothingRefundableOrRefundFailure(): void
    {
        (new CreditService(Db::get()))->adjust($this->apprenant['id'], 3_000_000, 'Crédit offert');
        self::assertSame(['error' => 'Aucun solde remboursable pour le moment.'], self::json($this->post('/api/twin9/credit/rembourser')));
        self::assertSame([], $this->http->requests);

        $this->recharger(0, 'ORDER-F20', '10.00', 'CAP-F20');
        TwinSupport::queuePaypalToken($this->http);
        $this->http->queueResponse(['status' => 500, 'body' => '{}']);
        $echec = $this->post('/api/twin9/credit/rembourser');
        self::assertSame(502, $echec->getStatusCode());
        self::assertSame('Le remboursement PayPal a échoué, réessayez plus tard.', self::json($echec)['error']);
        self::assertSame(13_000_000, (new CreditService(Db::get()))->balance($this->apprenant['id']));
    }

    #[TestDox('UC-APP-11-F21 — E8 : période de facture invalide → 422')]
    public function testF21InvalidInvoicePeriod(): void
    {
        foreach (['', '?annee=2025&mois=12', '?annee=2026&mois=13', '?annee=2026&mois=0', '?annee=2101&mois=1', '?mois=7'] as $query) {
            $response = $this->get('/api/twin9/facture' . $query);
            self::assertSame(422, $response->getStatusCode(), $query);
            self::assertSame('Période invalide (annee, mois requis)', self::json($response)['error']);
        }
    }

    #[TestDox('UC-APP-11-F22 — E9 : trop de tentatives PayPal (20 par minute et par compte) → 429 + Retry-After')]
    public function testF22PaypalRateLimit(): void
    {
        TwinSupport::saturateRateLimit(self::$pdo, 'twin9:paypal:creer:' . $this->apprenant['id'], 20);
        $response = $this->post('/api/twin9/credit/paypal/creer', ['pack_index' => 0]);
        self::assertSame(429, $response->getStatusCode());
        self::assertSame('30', $response->getHeaderLine('Retry-After'));
        self::assertSame([], $this->http->requests);
    }

    #[TestDox('UC-APP-11-F23 — RGPD : aucune donnée bancaire nulle part ; le grand-livre et les factures sont ceux de la SESSION seulement')]
    public function testF23NoBankingDataAndOwnAccountOnly(): void
    {
        $this->recharger(0, 'ORDER-F23', '10.00', 'CAP-F23');
        $autre = $this->registerAs('noe@example.org', 'Noé', ['apprenant']);

        $dump = json_encode([
            self::$pdo->query('SELECT * FROM twin9_credit_events')->fetchAll(),
            self::$pdo->query('SELECT * FROM twin9_paypal_orders')->fetchAll(),
            self::$pdo->query('SELECT * FROM twin9_paypal_captures')->fetchAll(),
        ], JSON_UNESCAPED_UNICODE);
        foreach (['secret-fictif', 'A21.', 'payer', 'card', 'email_address'] as $interdit) {
            self::assertStringNotContainsString($interdit, (string) $dump);
        }
        // L'autre compte ne voit rien du premier (aucun paramètre d'identifiant).
        self::assertSame(['solde_microusd' => 0, 'evenements' => []], self::json($this->get('/api/twin9/credit', $autre)));
        [, $annee, $m] = self::moisCourant();
        self::assertSame([], self::json($this->get('/api/twin9/facture?annee=' . $annee . '&mois=' . $m . '&user_id=' . $this->apprenant['id'], $autre))['recharges']);
        self::assertSame(403, $this->get('/api/twin9/admin/comptes')->getStatusCode(), 'la supervision est réservée à l’admin (UC-ADM-05)');
    }
}
