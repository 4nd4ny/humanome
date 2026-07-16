<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Llm\LlmRuntime;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\SoldeInsuffisantException;

/**
 * D8 — audit ADVERSARIAL des paiements/crédits. Un test par angle d'attaque,
 * exprimant le comportement SÉCURISÉ attendu (rouge si la faille existe). Les
 * angles « rejeu de capture » (1), « confusion de comptes » (2, capture) et le
 * gros du remboursement (5) sont déjà couverts par Twin9PayPalTest ; ce fichier
 * complète les variantes non couvertes. Verdicts consignés dans
 * docs/securite-checklist.md (§ paiements).
 */
final class Twin9SecurityAuditTest extends CartographeTestCase
{
    private LlmFakeHttpClient $http;
    /** @var array{id: int, csrf: string, sid: string} */
    private array $user;

    protected function setUp(): void
    {
        parent::setUp();
        TestDb::setEnv('PAYPAL_MODE', 'sandbox');
        TestDb::setEnv('PAYPAL_CLIENT_ID', 'test-client');
        TestDb::setEnv('PAYPAL_SECRET', 'test-secret');
        Db::get()->exec("DELETE FROM settings WHERE name = 'twin9_config'");
        $this->http = new LlmFakeHttpClient();
        LlmRuntime::setHttpClient($this->http);
        $this->user = $this->registerAs('victim@example.org', 'Victim', ['apprenant']);
    }

    protected function tearDown(): void
    {
        LlmRuntime::setHttpClient(null);
        parent::tearDown();
    }

    private function queueToken(): void
    {
        $this->http->queueResponse(['status' => 200, 'body' => json_encode([
            'access_token' => 'A21.tok', 'token_type' => 'Bearer', 'expires_in' => 32400,
        ], JSON_THROW_ON_ERROR)]);
    }

    private function queueCapture(string $orderId, string $amount): void
    {
        $this->http->queueResponse(['status' => 201, 'body' => json_encode([
            'id' => $orderId, 'status' => 'COMPLETED',
            'purchase_units' => [[
                'payments' => ['captures' => [[
                    'id' => 'CAP-' . $orderId, 'status' => 'COMPLETED',
                    'amount' => ['currency_code' => 'USD', 'value' => $amount],
                ]]],
            ]],
        ], JSON_THROW_ON_ERROR)]);
    }

    /**
     * ANGLE 3 — montant : le crédit dérive du montant CONFIRMÉ par PayPal, jamais
     * du pack demandé ni d'un champ client. Ici l'ordre a été créé pour un pack,
     * mais la capture PayPal renvoie un AUTRE montant : le crédit suit PayPal.
     */
    public function testCreditDerivesFromCapturedAmountNotRequestedPack(): void
    {
        (new CreditService(Db::get()))->recordPaypalOrder($this->user['id'], 'ORDER-A3');
        $this->queueToken();
        $this->queueCapture('ORDER-A3', '10.00'); // PayPal confirme 10,00 $

        // Le corps ne porte QUE l'order_id — aucun montant client. On glisse même
        // un faux montant : il doit être ignoré.
        $resp = $this->as_($this->user, 'POST', '/api/twin9/credit/paypal/capturer', [
            'order_id' => 'ORDER-A3',
            'montant_usd' => 999,          // champ pirate ignoré
            'solde_microusd' => 999_000_000, // champ pirate ignoré
        ]);
        self::assertSame(200, $resp->getStatusCode(), (string) $resp->getBody());
        self::assertSame(10_000_000, self::json($resp)['solde_microusd'], 'crédit = montant PayPal, pas le client');
        self::assertSame(10_000_000, (new CreditService(Db::get()))->balance($this->user['id']));
    }

    /**
     * ANGLE 4 — découvert : un débit supérieur au solde échoue (UPDATE
     * conditionnel atomique) et laisse le solde INTACT ; un adjust négatif, lui,
     * est une correction assumée (peut passer sous zéro) mais N'EST PAS exposé à
     * l'utilisateur (aucune route ne l'appelle avec un montant client).
     */
    public function testDebitCannotOverdrawBalance(): void
    {
        $credits = new CreditService(Db::get());
        $credits->topup($this->user['id'], 1_000_000, 'ORDER-A4', 'Recharge');
        try {
            $credits->debit($this->user['id'], 5_000_000, 'twin9/appel', 'claude-sonnet-5');
            self::fail('un débit au-delà du solde aurait dû lever SoldeInsuffisantException');
        } catch (SoldeInsuffisantException) {
            // attendu
        }
        // Solde intact, aucun événement de débit écrit.
        self::assertSame(1_000_000, $credits->balance($this->user['id']));
        self::assertSame(['topup'], array_column($credits->events($this->user['id']), 'kind'));
    }

    /**
     * ANGLE 5a — un utilisateur ne peut PAS rembourser la capture d'un AUTRE
     * compte : refundableCaptures est cadré par user_id, donc B (sans capture)
     * n'a rien de remboursable même si A a une capture bien réelle.
     */
    public function testUserCannotRefundAnotherAccountsCapture(): void
    {
        // A (victim) a une capture de 10 $.
        $credits = new CreditService(Db::get());
        $credits->recordCapture($this->user['id'], 'CAP-A', 'ORDER-A', 10_000_000);
        $credits->topup($this->user['id'], 10_000_000, 'ORDER-A', 'Recharge');

        // B tente un remboursement : rien de remboursable pour B -> 422, aucun appel PayPal.
        $mallory = $this->registerAs('mallory@example.org', 'Mallory', ['apprenant']);
        $resp = $this->as_($mallory, 'POST', '/api/twin9/credit/rembourser', []);
        self::assertSame(422, $resp->getStatusCode(), (string) $resp->getBody());
        self::assertSame([], $this->http->requests, 'aucun appel PayPal pour le remboursement d’autrui');
        // La capture de A est intacte.
        self::assertSame(10_000_000, $credits->soldeRemboursable($this->user['id']));
    }

    /**
     * ANGLE 5b — remboursement borné par la « room » : impossible de rembourser
     * plus que ce qui a été capturé, même en demandant un montant énorme.
     */
    public function testRefundCannotExceedCaptureRoom(): void
    {
        $credits = new CreditService(Db::get());
        $credits->recordCapture($this->user['id'], 'CAP-R', 'ORDER-R', 4_000_000); // 4 $ capturés
        $credits->topup($this->user['id'], 4_000_000, 'ORDER-R', 'Recharge');
        // Crédit admin NON remboursable en plus (ne gonfle pas la room).
        $credits->adjust($this->user['id'], 6_000_000, 'crédit promo admin');
        self::assertSame(10_000_000, $credits->balance($this->user['id']));
        self::assertSame(4_000_000, $credits->soldeRemboursable($this->user['id']), 'room = capture PayPal seule');

        // Demande démesurée : plafonnée à la room (4 $).
        $this->queueToken();
        $this->http->queueResponse(['status' => 201, 'body' => json_encode(['id' => 'REF', 'status' => 'COMPLETED'], JSON_THROW_ON_ERROR)]);
        $resp = $this->as_($this->user, 'POST', '/api/twin9/credit/rembourser', ['montant_microusd' => 999_000_000]);
        self::assertSame(200, $resp->getStatusCode(), (string) $resp->getBody());
        self::assertSame(4_000_000, self::json($resp)['rembourse_microusd'], 'jamais plus que la capture');
        self::assertSame(6_000_000, self::json($resp)['solde_microusd'], 'le crédit admin reste');
    }

    /**
     * ANGLE 5c — appliquerRemboursement ne peut pas driver le solde sous zéro :
     * si le solde a été dépensé entre-temps, le débit conditionnel échoue.
     */
    public function testRefundLedgerDebitCannotGoNegative(): void
    {
        $credits = new CreditService(Db::get());
        $credits->recordCapture($this->user['id'], 'CAP-X', 'ORDER-X', 5_000_000);
        $credits->topup($this->user['id'], 5_000_000, 'ORDER-X', 'Recharge');
        $credits->debit($this->user['id'], 5_000_000, 'twin9/appel', 'claude-sonnet-5'); // tout dépensé
        self::assertSame(0, $credits->balance($this->user['id']));

        // La capture a encore de la « room » mais le solde est à 0 : le débit
        // ledger conditionnel refuse (jamais de solde négatif).
        $this->expectException(SoldeInsuffisantException::class);
        $credits->appliquerRemboursement($this->user['id'], 'CAP-X', 5_000_000);
    }

    /**
     * ANGLE 8 — IDOR : le grand-livre est cadré par la session. Un utilisateur ne
     * lit QUE ses propres crédits/factures ; il ne peut pas énumérer ceux d'autrui.
     */
    public function testLedgerAndInvoicesAreSessionScopedNoIdor(): void
    {
        $credits = new CreditService(Db::get());
        $credits->topup($this->user['id'], 7_000_000, 'ORDER-VICTIM', 'Recharge');

        $mallory = $this->registerAs('mallory2@example.org', 'Mallory', ['apprenant']);
        // Le crédit de Mallory ne voit PAS le solde de la victime.
        $credit = self::json($this->as_($mallory, 'GET', '/api/twin9/credit'));
        self::assertSame(0, $credit['solde_microusd']);
        self::assertSame([], $credit['evenements']);

        // La victime, elle, voit son propre solde.
        $victimCredit = self::json($this->as_($this->user, 'GET', '/api/twin9/credit'));
        self::assertSame(7_000_000, $victimCredit['solde_microusd']);

        // La facture est cadrée par SESSION (userId non contrôlé par le client,
        // FactureService->facture($sessionUserId, …)) : Mallory demandant la
        // période où la victime a rechargé n'obtient QUE ses propres données —
        // aucune donnée ni email de la victime ne fuit.
        $facture = $this->as_($mallory, 'GET', '/api/twin9/facture?annee=2026&mois=7');
        self::assertSame(200, $facture->getStatusCode(), (string) $facture->getBody());
        self::assertStringNotContainsString('victim@example.org', (string) $facture->getBody());
    }
}
