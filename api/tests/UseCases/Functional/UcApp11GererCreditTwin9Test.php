<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Db;
use Humanome\Llm\HttpClient;
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
        $ordre = json_decode((string) $this->http->requests[1]['body'], true);
        self::assertSame('20.00', $ordre['purchase_units'][0]['amount']['value']);
        // URLs de retour envoyées par la ROUTE (domaine codé en dur, sandbox comprise).
        self::assertSame('https://humanome.xyz/#/compte/credit?paypal=retour', $ordre['application_context']['return_url']);
        self::assertSame('https://humanome.xyz/#/compte/credit?paypal=annule', $ordre['application_context']['cancel_url']);

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

    #[TestDox('UC-APP-11-F12 — A2 : retour PayPal rejoué (double clic, lien rechargé) → même solde, UNE seule recharge ; RG2 : le crédit est le montant CAPTURÉ, pas celui du pack')]
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

        // RG2 : pack de 20 $ commandé, mais PayPal a capturé 12,34 $ → c'est ce montant qui est crédité.
        self::assertSame(['solde_microusd' => 22_340_000], self::json($this->recharger(1, 'ORDER-F12B', '12.34', 'CAP-F12B')));
        self::assertSame(12_340_000, (new CreditService(Db::get()))->events($this->apprenant['id'])[0]['amount_microusd']);
        self::assertSame(12_340_000, (int) self::$pdo->query("SELECT montant_microusd FROM twin9_paypal_captures WHERE capture_id = 'CAP-F12B'")->fetchColumn());
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
        // Clé d'idempotence DÉCALÉE du montant déjà remboursé : la 2e portion n'est pas un rejeu de la 1re.
        self::assertSame('rf-' . $this->apprenant['id'] . '-CAP-F13-2500000', $this->http->requests[7]['headers']['paypal-request-id']);

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
        $rembourser = $this->post('/api/twin9/credit/rembourser');
        self::assertSame(503, $rembourser->getStatusCode());
        self::assertSame(['error' => 'Remboursement PayPal non configuré'], self::json($rembourser));

        TestDb::setEnv('PAYPAL_CLIENT_ID', '');
        self::assertFalse(self::json($this->get('/api/twin9/meta'))['paypalConfigured']);
        self::assertSame([], $this->http->requests);
    }

    #[TestDox('UC-APP-11-F16 — E3 : pack inconnu ou identifiant d’ordre invalide → 422 avant tout appel PayPal')]
    public function testF16InvalidPackOrOrderId(): void
    {
        foreach ([['pack_index' => 6], ['pack_index' => -1], ['pack_index' => '1'], []] as $body) {
            $r = $this->post('/api/twin9/credit/paypal/creer', $body);
            self::assertSame(422, $r->getStatusCode());
            self::assertSame(['error' => 'Pack inconnu'], self::json($r));
        }
        foreach ([[], ['order_id' => ''], ['order_id' => 'ORDER 1'], ['order_id' => str_repeat('A', 65)]] as $body) {
            $r = $this->post('/api/twin9/credit/paypal/capturer', $body);
            self::assertSame(422, $r->getStatusCode());
            self::assertSame(['error' => 'Champ requis : order_id'], self::json($r));
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
        $r2 = $this->post('/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-F18']);
        self::assertSame(422, $r2->getStatusCode());
        self::assertSame(['error' => 'Paiement non finalisé côté PayPal, réessayez.'], self::json($r2));

        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalCaptured($this->http, 'ORDER-F18', '0.00', 'CAP-F18');
        $r3 = $this->post('/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-F18']);
        self::assertSame(502, $r3->getStatusCode());
        self::assertSame('Montant PayPal invalide', self::json($r3)['error']);

        self::assertSame(0, (new CreditService(Db::get()))->balance($this->apprenant['id']));
        self::assertSame([], (new CreditService(Db::get()))->events($this->apprenant['id']));
    }

    #[TestDox('UC-APP-11-F19 — E6 : PayPal en erreur à la création d’ordre ou à la capture → 502 générique, aucun ordre lié, aucun crédit')]
    public function testF19PaypalErrorOnCreate(): void
    {
        TwinSupport::queuePaypalToken($this->http);
        $this->http->queueResponse(['status' => 500, 'body' => '{"debug_id":"abc","details":[{"issue":"INTERNAL"}]}']);
        $response = $this->post('/api/twin9/credit/paypal/creer', ['pack_index' => 0]);
        self::assertSame(502, $response->getStatusCode());
        self::assertSame(['error' => 'Le service PayPal a renvoyé une erreur, réessayez plus tard.'], self::json($response));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_paypal_orders')->fetchColumn());

        // Étape 5 : capture d'un ordre bien lié, PayPal en erreur → même 502 générique.
        (new CreditService(Db::get()))->recordPaypalOrder($this->apprenant['id'], 'ORDER-F19');
        TwinSupport::queuePaypalToken($this->http);
        $this->http->queueResponse(['status' => 500, 'body' => '{"debug_id":"def"}']);
        $capture = $this->post('/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-F19']);
        self::assertSame(502, $capture->getStatusCode());
        self::assertSame(['error' => 'Le service PayPal a renvoyé une erreur, réessayez plus tard.'], self::json($capture));
        self::assertSame(0, (new CreditService(Db::get()))->balance($this->apprenant['id']));
        self::assertSame([], (new CreditService(Db::get()))->events($this->apprenant['id']));
    }

    #[TestDox('UC-APP-11-F20 — E7 : rien de remboursable (crédit non PayPal) → 422 ; remboursement refusé par PayPal → 502, solde intact')]
    public function testF20NothingRefundableOrRefundFailure(): void
    {
        (new CreditService(Db::get()))->adjust($this->apprenant['id'], 3_000_000, 'Crédit offert');
        $rien = $this->post('/api/twin9/credit/rembourser');
        self::assertSame(422, $rien->getStatusCode());
        self::assertSame(['error' => 'Aucun solde remboursable pour le moment.'], self::json($rien));
        self::assertSame([], $this->http->requests);

        $this->recharger(0, 'ORDER-F20', '10.00', 'CAP-F20');
        TwinSupport::queuePaypalToken($this->http);
        $this->http->queueResponse(['status' => 500, 'body' => '{}']);
        $echec = $this->post('/api/twin9/credit/rembourser');
        self::assertSame(502, $echec->getStatusCode());
        self::assertSame('Le remboursement PayPal a échoué, réessayez plus tard.', self::json($echec)['error']);
        self::assertSame(13_000_000, (new CreditService(Db::get()))->balance($this->apprenant['id']));
    }

    #[TestDox('UC-APP-11-F21 — E8 : période de facture invalide → 422 ; une période FUTURE est acceptée (document vide, solde de fin = solde courant)')]
    public function testF21InvalidInvoicePeriod(): void
    {
        foreach (['', '?annee=2025&mois=12', '?annee=2026&mois=13', '?annee=2026&mois=0', '?annee=2101&mois=1', '?mois=7'] as $query) {
            $response = $this->get('/api/twin9/facture' . $query);
            self::assertSame(422, $response->getStatusCode(), $query);
            self::assertSame('Période invalide (annee, mois requis)', self::json($response)['error']);
        }

        // Comportement ACTUEL : aucune borne sur le futur (seulement ≤ 2100).
        (new CreditService(Db::get()))->topup($this->apprenant['id'], 4_000_000, 'ORDER-F21', 'Recharge PayPal');
        $futur = $this->get('/api/twin9/facture?annee=2100&mois=12');
        self::assertSame(200, $futur->getStatusCode());
        $facture = self::json($futur);
        self::assertSame('HUM-TW9-210012-' . $this->apprenant['id'], $facture['numero']);
        self::assertSame([], $facture['lignes']);
        self::assertSame([], $facture['recharges']);
        self::assertSame(4_000_000, $facture['solde_fin_periode_microusd']);
    }

    #[TestDox('UC-APP-11-F22 — E9 : trop de tentatives PayPal (EXACTEMENT 20 par minute, par compte et par route : créer, capturer, rembourser) → 429 + Retry-After')]
    public function testF22PaypalRateLimit(): void
    {
        $id = $this->apprenant['id'];
        $routes = [
            ['/api/twin9/credit/paypal/creer', ['pack_index' => 0], 'twin9:paypal:creer:'],
            ['/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-F22'], 'twin9:paypal:capturer:'],
            ['/api/twin9/credit/rembourser', [], 'twin9:rembourser:'],
        ];
        foreach ($routes as [$path, $body, $bucket]) {
            TwinSupport::saturateRateLimit(self::$pdo, $bucket . $id, 20);
            $response = $this->post($path, $body);
            self::assertSame(429, $response->getStatusCode(), $path);
            self::assertSame(['error' => 'Trop de tentatives, réessayez plus tard.'], self::json($response));
            self::assertSame('30', $response->getHeaderLine('Retry-After'), $path);
        }
        self::assertSame([], $this->http->requests);

        // La 20e tentative de la minute passe encore (la limite vaut 20, pas moins).
        self::$pdo->exec('DELETE FROM rate_limits');
        foreach ($routes as [$path, $body, $bucket]) {
            TwinSupport::saturateRateLimit(self::$pdo, $bucket . $id, 19);
        }
        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalOrderCreated($this->http, 'ORDER-F22');
        self::assertSame(200, $this->post($routes[0][0], $routes[0][1])->getStatusCode());
        self::assertSame(403, $this->post('/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-AUTRE'])->getStatusCode(), 'passé la limite : garde de propriété');
        self::assertSame(422, $this->post($routes[2][0], $routes[2][1])->getStatusCode(), 'passé la limite : rien de remboursable');
    }

    #[TestDox('UC-APP-11-F23 — RGPD : aucune donnée bancaire nulle part (même quand PayPal en renvoie) ; le grand-livre et les factures sont ceux de la SESSION seulement')]
    public function testF23NoBankingDataAndOwnAccountOnly(): void
    {
        // La réponse de capture PayPal porte, comme en vrai, des données d'acheteur.
        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalOrderCreated($this->http, 'ORDER-F23');
        self::assertSame(200, $this->post('/api/twin9/credit/paypal/creer', ['pack_index' => 0])->getStatusCode());
        TwinSupport::queuePaypalToken($this->http);
        $this->http->queueResponse(['status' => 201, 'body' => json_encode(TwinSupport::paypalCompletedBody('ORDER-F23', '10.00', 'CAP-F23') + [
            'payer' => [
                'email_address' => 'acheteur@example.org',
                'payer_id' => 'PAYER-F23',
                'name' => ['given_name' => 'Jean', 'surname' => 'Acheteur'],
            ],
            'payment_source' => ['card' => ['last_digits' => '4242', 'brand' => 'VISA']],
        ], JSON_THROW_ON_ERROR)]);
        self::assertSame(200, $this->post('/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-F23'])->getStatusCode());
        $autre = $this->registerAs('noe@example.org', 'Noé', ['apprenant']);

        $dump = json_encode([
            self::$pdo->query('SELECT * FROM twin9_credit_events')->fetchAll(),
            self::$pdo->query('SELECT * FROM twin9_paypal_orders')->fetchAll(),
            self::$pdo->query('SELECT * FROM twin9_paypal_captures')->fetchAll(),
            self::$pdo->query('SELECT * FROM audit_events')->fetchAll(),
        ], JSON_UNESCAPED_UNICODE);
        foreach (['secret-fictif', 'A21.', 'acheteur@example.org', 'PAYER-F23', 'Jean', '4242', 'VISA'] as $interdit) {
            self::assertStringNotContainsString($interdit, (string) $dump);
        }
        // L'autre compte ne voit rien du premier (aucun paramètre d'identifiant).
        self::assertSame(['solde_microusd' => 0, 'evenements' => []], self::json($this->get('/api/twin9/credit', $autre)));
        [, $annee, $m] = self::moisCourant();
        self::assertSame([], self::json($this->get('/api/twin9/facture?annee=' . $annee . '&mois=' . $m . '&user_id=' . $this->apprenant['id'], $autre))['recharges']);
        self::assertSame(403, $this->get('/api/twin9/admin/comptes')->getStatusCode(), 'la supervision est réservée à l’admin (UC-ADM-05)');
    }

    /** Date une capture (ordre « plus récente d'abord » du remboursement). */
    private static function daterCapture(string $captureId, string $date): void
    {
        self::$pdo->prepare('UPDATE twin9_paypal_captures SET created_at = ? WHERE capture_id = ?')->execute([$date, $captureId]);
    }

    /** @return array{url: string, montant: string, cle: string} la n-ième requête PayPal envoyée */
    private function remboursementEnvoye(int $n): array
    {
        $req = $this->http->requests[$n];

        return [
            'url' => $req['url'],
            'montant' => json_decode((string) $req['body'], true)['amount']['value'],
            'cle' => $req['headers']['paypal-request-id'],
        ];
    }

    #[TestDox('UC-APP-11-F24 — A3 : remboursement réparti sur plusieurs captures, la plus RÉCENTE d’abord, en centimes entiers (la fraction de centime reste au solde)')]
    public function testF24RefundSpreadsOverCapturesMostRecentFirst(): void
    {
        $id = $this->apprenant['id'];
        $this->recharger(0, 'ORDER-F24A', '3.00', 'CAP-F24A');
        $this->recharger(0, 'ORDER-F24B', '3.00', 'CAP-F24B');
        // A est la plus récente alors que son identifiant est le plus petit : l'ordre suit la date.
        self::daterCapture('CAP-F24A', '2026-07-02 10:00:00');
        self::daterCapture('CAP-F24B', '2026-07-01 10:00:00');
        self::assertSame(8, \count($this->http->requests));

        // 2 505 000 µUSD demandés → 2,50 $ sur la capture la plus récente ; 5 000 µUSD restent au solde.
        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalRefund($this->http, 'REF-F24-1');
        self::assertSame(['rembourse_microusd' => 2_500_000, 'solde_microusd' => 3_500_000], self::json($this->post('/api/twin9/credit/rembourser', ['montant_microusd' => 2_505_000])));
        self::assertSame([
            'url' => 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAP-F24A/refund',
            'montant' => '2.50',
            'cle' => 'rf-' . $id . '-CAP-F24A-0',
        ], $this->remboursementEnvoye(9));
        self::assertCount(10, $this->http->requests, 'aucune portion à 0 centime envoyée');

        // Le reste : 0,50 $ sur A (clé décalée), puis 3,00 $ sur B.
        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalRefund($this->http, 'REF-F24-2');
        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalRefund($this->http, 'REF-F24-3', 'PENDING');
        self::assertSame(['rembourse_microusd' => 3_500_000, 'solde_microusd' => 0], self::json($this->post('/api/twin9/credit/rembourser')));
        self::assertSame(['url' => 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAP-F24A/refund', 'montant' => '0.50', 'cle' => 'rf-' . $id . '-CAP-F24A-2500000'], $this->remboursementEnvoye(11));
        self::assertSame(['url' => 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAP-F24B/refund', 'montant' => '3.00', 'cle' => 'rf-' . $id . '-CAP-F24B-0'], $this->remboursementEnvoye(13));

        $captures = self::$pdo->query("SELECT capture_id, rembourse_microusd FROM twin9_paypal_captures WHERE capture_id LIKE 'CAP-F24%' ORDER BY capture_id")->fetchAll();
        self::assertSame([['CAP-F24A', 3_000_000], ['CAP-F24B', 3_000_000]], array_map(static fn (array $c): array => [$c['capture_id'], (int) $c['rembourse_microusd']], $captures));
        self::assertSame(['refund', 'refund', 'refund', 'topup', 'topup'], array_column((new CreditService(Db::get()))->events($id), 'kind'));
    }

    #[TestDox('UC-APP-11-F25 — E7 : échec au milieu de plusieurs captures — 2xx non abouti → 502 AVEC le montant déjà remboursé ; erreur HTTP → 502 SANS montant (portions confirmées débitées) ; tout remboursé → 422')]
    public function testF25RefundFailuresMidLoop(): void
    {
        $id = $this->apprenant['id'];
        $this->recharger(0, 'ORDER-F25-1', '2.00', 'CAP-F25-1');
        $this->recharger(0, 'ORDER-F25-2', '2.00', 'CAP-F25-2');
        $this->recharger(0, 'ORDER-F25-3', '2.00', 'CAP-F25-3');
        self::daterCapture('CAP-F25-1', '2026-07-01 10:00:00');
        self::daterCapture('CAP-F25-2', '2026-07-02 10:00:00');
        self::daterCapture('CAP-F25-3', '2026-07-03 10:00:00');
        $credits = new CreditService(Db::get());

        // 1. PayPal répond 2xx mais « FAILED » sur la 2e portion : 502 + montant partiel.
        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalRefund($this->http, 'REF-3');
        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalRefund($this->http, 'REF-2', 'FAILED');
        $partiel = $this->post('/api/twin9/credit/rembourser');
        self::assertSame(502, $partiel->getStatusCode());
        self::assertSame(['error' => 'Le remboursement PayPal n’a pas abouti, réessayez plus tard.', 'rembourse_microusd' => 2_000_000], self::json($partiel));
        self::assertSame(4_000_000, $credits->balance($id));
        $cleEchouee = $this->http->requests[\count($this->http->requests) - 1]['headers']['paypal-request-id'];

        // 2. La portion échouée est REJOUÉE avec la même clé, puis PayPal répond en erreur
        //    HTTP sur la suivante : 502 générique SANS montant, alors que 2 $ ont été débités.
        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalRefund($this->http, 'REF-2-bis');
        $rejeu = \count($this->http->requests) + 1;
        TwinSupport::queuePaypalToken($this->http);
        $this->http->queueResponse(['status' => 500, 'body' => '{"name":"INTERNAL_SERVER_ERROR"}']);
        $generique = $this->post('/api/twin9/credit/rembourser');
        self::assertSame(502, $generique->getStatusCode());
        self::assertSame(['error' => 'Le remboursement PayPal a échoué, réessayez plus tard.'], self::json($generique));
        self::assertSame($cleEchouee, $this->http->requests[$rejeu]['headers']['paypal-request-id']);
        self::assertSame(2_000_000, $credits->balance($id), 'la portion confirmée reste débitée');

        // 3. Dernière portion, puis plus rien à rembourser : 422.
        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalRefund($this->http, 'REF-1');
        self::assertSame(['rembourse_microusd' => 2_000_000, 'solde_microusd' => 0], self::json($this->post('/api/twin9/credit/rembourser')));
        $avant = \count($this->http->requests);
        $deja = $this->post('/api/twin9/credit/rembourser');
        self::assertSame(422, $deja->getStatusCode());
        self::assertSame(['error' => 'Aucun solde remboursable pour le moment.'], self::json($deja));
        self::assertCount($avant, $this->http->requests);
    }

    #[TestDox('UC-APP-11-F26 — E10 : session valide mais jeton CSRF absent ou faux → 403 sur créer, capturer et rembourser ; rien chez PayPal, solde intact')]
    public function testF26CsrfTokenIsRequiredOnMoneyRoutes(): void
    {
        (new CreditService(Db::get()))->recordPaypalOrder($this->apprenant['id'], 'ORDER-F26');
        foreach ([
            ['/api/twin9/credit/paypal/creer', ['pack_index' => 0]],
            ['/api/twin9/credit/paypal/capturer', ['order_id' => 'ORDER-F26']],
            ['/api/twin9/credit/rembourser', []],
        ] as [$path, $body]) {
            foreach ([[], ['X-CSRF-Token' => 'jeton-faux']] as $entetes) {
                $this->cookieSid = $this->apprenant['sid'];
                $response = $this->request('POST', $path, $body, $entetes);
                self::assertSame(403, $response->getStatusCode(), $path);
                self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($response));
            }
        }
        self::assertSame([], $this->http->requests);
        self::assertSame(0, (new CreditService(Db::get()))->balance($this->apprenant['id']));
        self::assertSame([], (new CreditService(Db::get()))->events($this->apprenant['id']));
    }

    #[TestDox('UC-APP-11-F27 — ANOMALIE figée : une dépense concurrente pendant le remboursement → PayPal rembourse, mais le grand-livre n’est PAS débité (402)')]
    public function testF27ConcurrentSpendDuringRefund(): void
    {
        $id = $this->apprenant['id'];
        $this->recharger(0, 'ORDER-F27', '10.00', 'CAP-F27');

        // Faux PayPal qui, au moment où il reçoit le /refund, laisse une analyse
        // d'un autre onglet réserver 9,50 $ sur le même solde (course réelle).
        $inner = $this->http;
        $concurrent = new class ($inner, $id) implements HttpClient {
            public int $remboursements = 0;

            public function __construct(private readonly LlmFakeHttpClient $inner, private readonly int $userId)
            {
            }

            public function request(string $method, string $url, array $headers = [], ?string $body = null, int $timeoutSeconds = 30, int $maxBytes = 0): array
            {
                if (str_ends_with($url, '/refund')) {
                    ++$this->remboursements;
                    (new CreditService(Db::get()))->debit($this->userId, 9_500_000, 'twin6/cartographie (réserve)', 'claude-sonnet-5');
                }

                return $this->inner->request($method, $url, $headers, $body, $timeoutSeconds, $maxBytes);
            }
        };
        LlmRuntime::setHttpClient($concurrent);
        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalRefund($this->http, 'REF-F27');

        $response = $this->post('/api/twin9/credit/rembourser');

        // Comportement ACTUEL : l'argent est parti chez PayPal (COMPLETED)…
        self::assertSame(1, $concurrent->remboursements);
        // …mais appliquerRemboursement échoue (solde déplacé) et la route répond 402.
        self::assertSame(402, $response->getStatusCode());
        self::assertSame(['error' => 'Solde insuffisant', 'solde_microusd' => 500_000, 'requis_estime_microusd' => 10_000_000], self::json($response));
        // Le grand-livre n'est pas débité du remboursement, la capture garde toute sa marge.
        self::assertSame(500_000, (new CreditService(Db::get()))->balance($id));
        self::assertSame(0, (int) self::$pdo->query("SELECT rembourse_microusd FROM twin9_paypal_captures WHERE capture_id = 'CAP-F27'")->fetchColumn());
        self::assertNotContains('refund', array_column((new CreditService(Db::get()))->events($id), 'kind'));
    }

    #[TestDox('UC-APP-11-F28 — A3 : moins d’un centime remboursable, ou montant demandé < 1 centime / négatif → 200 {rembourse_microusd: 0}, aucun appel PayPal')]
    public function testF28SubCentRefundIsANoOp(): void
    {
        $credits = new CreditService(Db::get());
        $credits->topup($this->apprenant['id'], 9_999, 'ORDER-F28', 'Recharge PayPal');
        $credits->recordCapture($this->apprenant['id'], 'CAP-F28', 'ORDER-F28', 9_999);
        self::assertSame(['rembourse_microusd' => 0, 'solde_microusd' => 9_999], self::json($this->post('/api/twin9/credit/rembourser')));

        $credits->topup($this->apprenant['id'], 5_000_000, 'ORDER-F28B', 'Recharge PayPal');
        $credits->recordCapture($this->apprenant['id'], 'CAP-F28B', 'ORDER-F28B', 5_000_000);
        foreach ([5_000, -5, 0] as $montant) {
            $r = $this->post('/api/twin9/credit/rembourser', ['montant_microusd' => $montant]);
            self::assertSame(200, $r->getStatusCode(), (string) $montant);
            self::assertSame(['rembourse_microusd' => 0, 'solde_microusd' => 5_009_999], self::json($r));
        }
        self::assertSame([], $this->http->requests);
    }
}
