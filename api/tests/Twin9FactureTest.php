<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\FactureService;

/**
 * Monthly recap invoices + spend tracking (owner request 2026-07-13):
 * deterministic aggregation over the prepaid ledger, stable invoice number,
 * net-of-reconciliation consumption split per model, own-account gating and
 * the admin oversight route. Counters and amounts only — never content.
 */
final class Twin9FactureTest extends CartographeTestCase
{
    private CreditService $credits;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->credits = new CreditService(Db::get());
        $this->user = $this->registerAs('ada@example.org', 'Ada Lovelace', ['apprenant']);
    }

    /** Rejoue le schéma réel du /appel : réserve, puis réconciliation signée. */
    private function simulateCall(int $reserve, int $real, string $etape, string $model, int $in, int $out): void
    {
        $this->credits->debit($this->user['id'], $reserve, $etape . ' (réserve)', $model);
        if ($reserve !== $real) {
            $this->credits->adjust($this->user['id'], $reserve - $real, $etape . ' (réconciliation)', $model, $in, $out);
        }
    }

    public function testFactureAggregatesNetConsumptionPerModel(): void
    {
        $userId = $this->user['id'];
        $this->credits->topup($userId, 10_000_000, 'ORDER-F1', 'Pack découverte — 10 $');
        // Two platform calls on sonnet (reserve then partial refund), one on haiku.
        $this->simulateCall(50_000, 6_602, 'lourd/20-greffier', 'claude-sonnet-5', 1000, 200);
        $this->simulateCall(40_000, 5_000, 'lourd/20b-juge-leger', 'claude-sonnet-5', 800, 150);
        $this->simulateCall(10_000, 1_200, 'tagger/P1', 'claude-haiku-4-5-20251001', 900, 80);
        // An admin correction, NOT a reconciliation: listed apart.
        $this->credits->adjust($userId, 500_000, 'Geste commercial — incident du 12');

        $now = new \DateTimeImmutable('now');
        $facture = (new FactureService(Db::get()))->facture($userId, (int) $now->format('Y'), (int) $now->format('n'));

        // Stable, deterministic number.
        self::assertSame(
            sprintf('HUM-TW9-%s-%d', $now->format('Ym'), $userId),
            $facture['numero'],
        );
        self::assertSame('Harmonia Éducation', $facture['emetteur']['nom']);
        self::assertSame('Ada Lovelace', $facture['client']['nom']);

        // Net consumption per model (reserve - refund = real cost).
        $parModele = array_column($facture['lignes'], null, 'model');
        self::assertSame(6_602 + 5_000, $parModele['claude-sonnet-5']['consomme_microusd']);
        self::assertSame(2, $parModele['claude-sonnet-5']['appels']);
        self::assertSame(1800, $parModele['claude-sonnet-5']['tokens_in']);
        self::assertSame(350, $parModele['claude-sonnet-5']['tokens_out']);
        self::assertSame(1_200, $parModele['claude-haiku-4-5-20251001']['consomme_microusd']);
        self::assertSame(6_602 + 5_000 + 1_200, $facture['total_consomme_microusd']);

        // Top-ups of the month, and the admin correction listed APART.
        self::assertSame(10_000_000, $facture['total_recharges_microusd']);
        self::assertSame('ORDER-F1', $facture['recharges'][0]['paypal_order_id']);
        self::assertCount(1, $facture['ajustements']);
        self::assertSame(500_000, $facture['ajustements'][0]['montant_microusd']);

        // End-of-period balance = everything signed.
        self::assertSame(
            10_000_000 + 500_000 - (6_602 + 5_000 + 1_200),
            $facture['solde_fin_periode_microusd'],
        );
    }

    public function testFactureRouteIsOwnAccountAndValidatesPeriod(): void
    {
        $now = new \DateTimeImmutable('now');
        $periode = 'annee=' . $now->format('Y') . '&mois=' . $now->format('n');

        $this->cookieSid = null; // requête anonyme (le TestCase garde la session sinon)
        self::assertSame(401, $this->request('GET', '/api/twin9/facture?' . $periode)->getStatusCode());
        self::assertSame(422, $this->as_($this->user, 'GET', '/api/twin9/facture?annee=1999&mois=1')->getStatusCode());
        self::assertSame(422, $this->as_($this->user, 'GET', '/api/twin9/facture?annee=2026&mois=13')->getStatusCode());

        $this->credits->topup($this->user['id'], 10_000_000, 'ORDER-F2');
        $response = $this->as_($this->user, 'GET', '/api/twin9/facture?' . $periode);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);
        self::assertSame('Ada Lovelace', $body['client']['nom']);
        self::assertSame(10_000_000, $body['total_recharges_microusd']);
        self::assertNotEmpty($body['mentions']);
    }

    public function testDepensesTracksMonthsNewestFirst(): void
    {
        $this->credits->topup($this->user['id'], 10_000_000, 'ORDER-F3');
        $this->simulateCall(30_000, 7_000, 'lourd/20-greffier', 'claude-sonnet-5', 1000, 200);

        $response = $this->as_($this->user, 'GET', '/api/twin9/depenses');
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);
        self::assertSame(10_000_000 - 7_000, $body['solde_microusd']);
        self::assertCount(1, $body['mois']);
        self::assertSame(10_000_000, $body['mois'][0]['recharges_microusd']);
        self::assertSame(7_000, $body['mois'][0]['consomme_microusd']);
        self::assertSame(1, $body['mois'][0]['appels']);
    }

    // Exigence utilisateur (credits-paypal, point 4) : « factures
    // récapitulatives mensuelles […] pour particuliers ET établissements ».
    // Un compte de rôle 'etablissement' passe par le MÊME chemin et obtient le
    // même document déterministe (numéro stable, régénération identique).
    public function testFactureEtablissementMemeDocumentDeterministe(): void
    {
        $etab = $this->registerAs('lycee@example.org', 'Lycée Ada Lovelace', ['etablissement']);
        $credits = new CreditService(Db::get());
        $credits->topup($etab['id'], 50_000_000, 'ORDER-ETAB-1', 'Pack intensif — 50 $');
        $credits->debit($etab['id'], 120_000, 'twin6/cartographie', 'claude-sonnet-5', 9000, 1200);

        $now = new \DateTimeImmutable('now');
        $periode = 'annee=' . $now->format('Y') . '&mois=' . $now->format('n');
        $response = $this->as_($etab, 'GET', '/api/twin9/facture?' . $periode);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $facture = self::json($response);

        self::assertSame(
            sprintf('HUM-TW9-%s-%d', $now->format('Ym'), $etab['id']),
            $facture['numero'],
            'numéro stable, propre au compte établissement',
        );
        self::assertSame('Lycée Ada Lovelace', $facture['client']['nom']);
        self::assertSame(50_000_000, $facture['total_recharges_microusd']);
        self::assertSame(120_000, $facture['total_consomme_microusd']);
        self::assertNotEmpty($facture['mentions']);

        // Régénération : document identique (agrégation déterministe).
        $again = self::json($this->as_($etab, 'GET', '/api/twin9/facture?' . $periode));
        self::assertSame($facture, $again);
    }

    // Comportement FIGÉ (phase de vérification credits-paypal) : un événement
    // kind='refund' (remboursement PayPal du solde, point 5) n'apparaît dans
    // AUCUNE des trois listes de la facture — ni consommation (kind debit/
    // adjust-réconciliation), ni recharges (kind topup), ni ajustements — mais
    // il EST répercuté dans le solde de fin de période (somme signée de tout).
    // La facture reste donc honnête : le remboursement ne gonfle jamais la
    // consommation facturée. Si ce choix évolue (ligne « remboursements »
    // dédiée), ce test doit être mis à jour EN MÊME TEMPS que FactureService.
    public function testRemboursementNApparaitQueDansLeSoldeDeFinDePeriode(): void
    {
        $userId = $this->user['id'];
        $this->credits->recordCapture($userId, 'CAP-FA1', 'ORDER-FA1', 10_000_000);
        $this->credits->topup($userId, 10_000_000, 'ORDER-FA1', 'Recharge PayPal');
        $this->simulateCall(30_000, 7_000, 'lourd/20-greffier', 'claude-sonnet-5', 1000, 200);
        $this->credits->appliquerRemboursement($userId, 'CAP-FA1', 4_000_000);

        $now = new \DateTimeImmutable('now');
        $facture = (new FactureService(Db::get()))->facture($userId, (int) $now->format('Y'), (int) $now->format('n'));

        // Consommation nette : le run seulement — PAS le remboursement.
        self::assertSame(7_000, $facture['total_consomme_microusd']);
        self::assertSame(10_000_000, $facture['total_recharges_microusd']);
        self::assertSame([], $facture['ajustements'], 'le refund n’est pas un ajustement admin');
        foreach ($facture['lignes'] as $ligne) {
            self::assertGreaterThan(0, $ligne['consomme_microusd']);
        }

        // Mais le solde de fin de période le reflète : 10 - 0,007 - 4 = 5,993 $.
        self::assertSame(10_000_000 - 7_000 - 4_000_000, $facture['solde_fin_periode_microusd']);
    }

    public function testAdminComptesIsAdminOnlyAndAggregates(): void
    {
        // A promptologue is refused like anyone else (403).
        $promptologue = $this->registerAs('prompto@example.org', 'Promp Tologue', ['apprenant', 'promptologue']);
        self::assertSame(403, $this->as_($promptologue, 'GET', '/api/twin9/admin/comptes')->getStatusCode());
        $this->cookieSid = null; // requête anonyme
        self::assertSame(401, $this->request('GET', '/api/twin9/admin/comptes')->getStatusCode());

        $this->credits->topup($this->user['id'], 10_000_000, 'ORDER-F4');
        $this->simulateCall(20_000, 6_000, 'lourd/20-greffier', 'claude-sonnet-5', 500, 100);

        $admin = $this->registerAs('admin@example.org', 'Root Admin', ['admin']);
        $response = $this->as_($admin, 'GET', '/api/twin9/admin/comptes');
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $comptes = self::json($response)['comptes'];
        self::assertCount(1, $comptes);
        self::assertSame('ada@example.org', $comptes[0]['email']);
        self::assertSame(10_000_000 - 6_000, $comptes[0]['solde_microusd']);
        self::assertSame(10_000_000, $comptes[0]['recharges_microusd']);
        self::assertSame(6_000, $comptes[0]['consomme_microusd']);
    }
}
