<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\SoldeInsuffisantException;

/**
 * T3a (ADR-010 §3) — prepaid credit ledger: atomic conditional debit,
 * PayPal-order idempotent top-up, admin adjustment. Counters only, never
 * content: the assertions check amounts, tokens and labels exclusively.
 */
final class Twin9CreditTest extends CartographeTestCase
{
    private CreditService $credits;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $user;

    protected function setUp(): void
    {
        parent::setUp(); // wipes users; twin9_credits/_events cascade with them
        $this->credits = new CreditService(Db::get());
        $this->user = $this->registerAs('ada@example.org', 'Ada', ['apprenant']);
    }

    public function testBalanceIsZeroWithoutCreditRow(): void
    {
        self::assertSame(0, $this->credits->balance($this->user['id']));
    }

    public function testTopupIsIdempotentByPaypalOrderId(): void
    {
        $userId = $this->user['id'];

        $first = $this->credits->topup($userId, 5_000_000, 'PAYPAL-ORDER-1', 'Pack découverte — 5 $');
        self::assertSame(['balance' => 5_000_000, 'applied' => true], $first);

        // Replayed capture (same PayPal order id): no-op returning the state.
        $replay = $this->credits->topup($userId, 5_000_000, 'PAYPAL-ORDER-1', 'Pack découverte — 5 $');
        self::assertSame(['balance' => 5_000_000, 'applied' => false], $replay);
        self::assertSame(5_000_000, $this->credits->balance($userId));

        // Exactly ONE ledger event for the order.
        $events = $this->credits->events($userId);
        self::assertCount(1, $events);
        self::assertSame('topup', $events[0]['kind']);
        self::assertSame(5_000_000, $events[0]['amount_microusd']);
        self::assertSame('PAYPAL-ORDER-1', $events[0]['paypal_order_id']);

        // A different order credits on top.
        $second = $this->credits->topup($userId, 10_000_000, 'PAYPAL-ORDER-2');
        self::assertSame(['balance' => 15_000_000, 'applied' => true], $second);
    }

    public function testDebitIsAtomicAndWritesCounters(): void
    {
        $userId = $this->user['id'];
        $this->credits->topup($userId, 1_000_000, 'PAYPAL-ORDER-3');

        $newBalance = $this->credits->debit(
            $userId,
            400_000,
            'fictif/01-essai',
            'claude-sonnet-5',
            1234,
            567,
        );
        self::assertSame(600_000, $newBalance);

        $events = $this->credits->events($userId);
        self::assertSame('debit', $events[0]['kind']);
        self::assertSame(-400_000, $events[0]['amount_microusd'], 'debits are negative in the ledger');
        self::assertSame('fictif/01-essai', $events[0]['label']);
        self::assertSame('claude-sonnet-5', $events[0]['model']);
        self::assertSame(1234, $events[0]['tokens_in']);
        self::assertSame(567, $events[0]['tokens_out']);

        // Insufficient balance: exception, balance untouched, NO event added.
        try {
            $this->credits->debit($userId, 600_001, 'fictif/02-autre', 'claude-sonnet-5', 1, 1);
            self::fail('expected SoldeInsuffisantException');
        } catch (SoldeInsuffisantException $e) {
            self::assertSame('Solde insuffisant', $e->getMessage());
            self::assertSame(600_000, $e->getBalanceMicrousd());
            self::assertSame(600_001, $e->getRequestedMicrousd());
        }
        self::assertSame(600_000, $this->credits->balance($userId));
        self::assertCount(2, $this->credits->events($userId), 'topup + first debit only');

        // Exact remaining balance can be spent down to zero.
        self::assertSame(0, $this->credits->debit($userId, 600_000, 'fictif/01-essai', 'claude-haiku-4-5-20251001', 10, 10));
    }

    public function testDebitWithoutCreditRowIsInsufficient(): void
    {
        $this->expectException(SoldeInsuffisantException::class);
        $this->credits->debit($this->user['id'], 1, 'fictif/01-essai');
    }

    public function testDebitRejectsNonPositiveAmounts(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->credits->debit($this->user['id'], 0, 'fictif/01-essai');
    }

    public function testAdjustAppliesSignedDeltaAndLogsEvent(): void
    {
        $userId = $this->user['id'];

        self::assertSame(2_000_000, $this->credits->adjust($userId, 2_000_000, 'geste commercial'));
        self::assertSame(1_500_000, $this->credits->adjust($userId, -500_000, 'correction'));

        $events = $this->credits->events($userId);
        self::assertSame(['adjust', 'adjust'], array_column($events, 'kind'));
        self::assertSame([-500_000, 2_000_000], array_column($events, 'amount_microusd'));
        self::assertSame('correction', $events[0]['label']);
        self::assertNull($events[0]['paypal_order_id']);
    }

    public function testTopupRejectsBlankPaypalOrderId(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->credits->topup($this->user['id'], 1_000_000, '   ');
    }

    // ==================================================================
    // Remboursement à la demande — côté ledger (exigences credits-paypal,
    // points 5 et 7 : remboursement possible sur demande, système de crédits
    // non hackable : débit conditionnel, jamais de découvert).
    // ==================================================================

    public function testAppliquerRemboursementDebiteConditionnellementEtDecompteLaCapture(): void
    {
        $userId = $this->user['id'];
        $this->credits->recordCapture($userId, 'CAP-L1', 'ORDER-L1', 10_000_000);
        $this->credits->topup($userId, 10_000_000, 'ORDER-L1', 'Recharge PayPal');

        // Succès : solde débité, événement 'refund' négatif, capture décomptée.
        self::assertSame(6_000_000, $this->credits->appliquerRemboursement($userId, 'CAP-L1', 4_000_000));
        $events = $this->credits->events($userId);
        self::assertSame('refund', $events[0]['kind']);
        self::assertSame(-4_000_000, $events[0]['amount_microusd']);
        self::assertSame('Remboursement PayPal', $events[0]['label']);
        $captures = $this->credits->refundableCaptures($userId);
        self::assertSame(6_000_000, $captures[0]['room_microusd']);
        self::assertSame(4_000_000, $captures[0]['rembourse_microusd']);
        self::assertSame(6_000_000, $this->credits->soldeRemboursable($userId));

        // Montants non positifs rejetés avant toute écriture.
        try {
            $this->credits->appliquerRemboursement($userId, 'CAP-L1', 0);
            self::fail('expected InvalidArgumentException');
        } catch (\InvalidArgumentException) {
        }

        // FENÊTRE RÉSIDUELLE DOCUMENTÉE (gap sécurité mineur, phase de
        // vérification credits-paypal) : la route /rembourser exécute le
        // remboursement CHEZ PAYPAL avant ce débit local. Si une dépense
        // concurrente a réduit le solde entre soldeRemboursable() et ici, le
        // débit conditionnel refuse (aucun découvert, aucun événement, le
        // compteur rembourse_microusd n'avance pas) — mais l'argent a déjà
        // quitté PayPal : incohérence ledger/PayPal à corriger côté produit
        // (réserver le solde AVANT l'appel PayPal, schéma réserve→réconciliation).
        $this->credits->debit($userId, 5_500_000, 'twin9/depense-concurrente', 'claude-sonnet-5');
        self::assertSame(500_000, $this->credits->balance($userId));
        $avant = \count($this->credits->events($userId));
        try {
            $this->credits->appliquerRemboursement($userId, 'CAP-L1', 600_000);
            self::fail('expected SoldeInsuffisantException');
        } catch (SoldeInsuffisantException $e) {
            self::assertSame(500_000, $e->getBalanceMicrousd());
        }
        self::assertSame(500_000, $this->credits->balance($userId), 'solde intact');
        self::assertCount($avant, $this->credits->events($userId), 'aucun événement fantôme');
        self::assertSame(
            4_000_000,
            $this->credits->refundableCaptures($userId)[0]['rembourse_microusd'],
            'le compteur remboursé n’avance pas : un retry rejouera la même PayPal-Request-Id',
        );
    }

    public function testRecordCaptureEstIdempotentEtIgnoreLesEntreesInvalides(): void
    {
        $userId = $this->user['id'];

        // Rejeu de la même capture : une seule room, jamais doublée.
        $this->credits->recordCapture($userId, 'CAP-I1', 'ORDER-I1', 10_000_000);
        $this->credits->recordCapture($userId, 'CAP-I1', 'ORDER-I1', 10_000_000);
        $captures = $this->credits->refundableCaptures($userId);
        self::assertCount(1, $captures);
        self::assertSame(10_000_000, $captures[0]['room_microusd']);

        // capture_id vide / montant non positif : simplement non remboursable.
        $this->credits->recordCapture($userId, '   ', 'ORDER-I2', 5_000_000);
        $this->credits->recordCapture($userId, 'CAP-I3', 'ORDER-I3', 0);
        $this->credits->recordCapture($userId, 'CAP-I4', 'ORDER-I4', -1_000_000);
        self::assertCount(1, $this->credits->refundableCaptures($userId));
    }

    public function testSoldeRemboursableEstBorneParLeSoldeEtParLesCaptures(): void
    {
        $userId = $this->user['id'];
        $this->credits->recordCapture($userId, 'CAP-B1', 'ORDER-B1', 5_000_000);
        $this->credits->topup($userId, 5_000_000, 'ORDER-B1', 'Recharge PayPal');

        // Crédit admin AU-DESSUS des captures : non remboursable (pas de room PayPal).
        $this->credits->adjust($userId, 3_000_000, 'geste commercial');
        self::assertSame(8_000_000, $this->credits->balance($userId));
        self::assertSame(5_000_000, $this->credits->soldeRemboursable($userId), 'borné par les captures');

        // Solde dépensé SOUS les rooms : borné par le solde.
        $this->credits->debit($userId, 6_000_000, 'twin9/gros-run', 'claude-sonnet-5');
        self::assertSame(2_000_000, $this->credits->soldeRemboursable($userId), 'borné par le solde');
    }

    public function testLedgerIsCountersOnly(): void
    {
        // Guard for the RGPD/secrecy imperative: the events table schema has
        // no content-bearing column beyond the short label.
        $columns = Db::get()->query('SHOW COLUMNS FROM twin9_credit_events')->fetchAll();
        $names = array_column($columns, 'Field');
        self::assertSame(
            ['id', 'user_id', 'kind', 'amount_microusd', 'label', 'model', 'tokens_in', 'tokens_out', 'paypal_order_id', 'created_at'],
            $names,
        );
    }
}
