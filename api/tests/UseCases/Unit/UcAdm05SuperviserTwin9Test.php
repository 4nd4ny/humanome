<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\TestDb;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\FactureService;
use Humanome\Twin9\Twin9Config;
use Humanome\Twin9\Twin9Exception;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-ADM-05 — Superviser Twin9 : tests UNITAIRES (API).
 *
 * Fiche : docs/cas-utilisation/administration/UC-ADM-05-superviser-twin9.md
 *
 * Twin9Config (lecture effective, mise à jour partielle validée, bornes) et
 * FactureService::comptes (table de supervision) sont appelés directement,
 * sur la base de test dédiée.
 */
final class UcAdm05SuperviserTwin9Test extends TestCase
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
        self::$pdo->exec("DELETE FROM settings WHERE name = 'twin9_config'");
    }

    private static function config(): Twin9Config
    {
        return new Twin9Config(new SettingsRepository(self::$pdo));
    }

    private static function stored(): ?array
    {
        return (new SettingsRepository(self::$pdo))->get(Twin9Config::SETTING_KEY);
    }

    #[TestDox('UC-ADM-05-U08 — mise à jour PARTIELLE : fusion avec l’existant, persistance de la configuration COMPLÈTE (défauts figés) dans settings, clés inconnues refusées sans rien écrire')]
    public function testU08PartialUpdateIsMergedAndPersisted(): void
    {
        self::assertNull(self::stored(), 'aucun réglage stocké : défauts');
        $next = self::config()->update(['marge' => 1.5, 'twin9_cle_perso_ouverte' => true]);
        self::assertSame(1.5, $next['marge']);
        self::assertSame(1.1, $next['marge_twin6'], 'clé non fournie conservée');
        self::assertSame(1.5, self::config()->marge());
        self::assertTrue(self::config()->clePersoOuverte());
        self::assertSame(1.5, self::stored()['marge']);
        // La configuration effective COMPLÈTE est persistée, défauts compris : une
        // évolution ultérieure de defaults() ne s'appliquera plus à ces clés.
        self::assertEqualsCanonicalizing(array_keys(Twin9Config::defaults()), array_keys(self::stored()));
        self::assertEquals(Twin9Config::defaults()['packs'], self::stored()['packs']);

        try {
            self::config()->update(['marge' => 2.0, 'surtaxe' => 3]);
            self::fail('clé inconnue acceptée');
        } catch (Twin9Exception $e) {
            self::assertSame([422, 'Clé de configuration inconnue : surtaxe'], [$e->getStatusCode(), $e->getMessage()]);
        }
        self::assertSame(1.5, self::config()->marge(), 'rien écrit');
    }

    #[TestDox('UC-ADM-05-U09 — bornes : contributions 1 à 5, packs 1 à 500 USD avec libellé, prix > 0, étages connus, rythme 1 à 600, booléens')]
    public function testU09Bounds(): void
    {
        foreach ([
            ['marge' => 1],
            ['marge' => 5.0],
            ['marge_twin6' => 1.0],
            ['packs' => [['montant_usd' => 1, 'libelle' => 'min'], ['montant_usd' => 500, 'libelle' => 'max']]],
            ['modeles' => ['m' => ['prix_usd_mtok' => [0.25, 1.25], 'etages' => ['tribunal']]]],
            ['appels_par_minute' => 1],
            ['appels_par_minute' => 600],
            ['enabled' => false],
            ['pipeline' => [1, 2]], // « objet » attendu, mais une liste JSON passe (\is_array)
            ['pipeline' => ['jury' => ['taille_aleatoire' => 4]]],
        ] as $ok) {
            self::config()->update($ok);
        }
        $valide = self::stored();

        $ko = [
            [['marge' => 0.99], 'Marge hors bornes (entre 1 et 5)'],
            [['marge' => 5.01], 'Marge hors bornes (entre 1 et 5)'],
            [['marge' => '1.5'], 'Marge invalide : nombre attendu'],
            [['marge_twin6' => 6], 'Marge Twin6 hors bornes (entre 1 et 5)'],
            [['twin9_cle_perso_ouverte' => 1], 'Champ twin9_cle_perso_ouverte invalide : booléen attendu'],
            [['packs' => []], 'Packs invalides : liste non vide attendue'],
            [['packs' => ['a' => ['montant_usd' => 10, 'libelle' => 'x']]], 'Packs invalides : liste non vide attendue'],
            [['packs' => [['montant_usd' => 10, 'libelle' => '  ']]], 'Pack invalide : libellé requis'],
            [['modeles' => []], 'Modèles invalides : au moins un modèle requis'],
            [['modeles' => ['m' => ['prix_usd_mtok' => [1], 'etages' => ['taggers']]]], 'Prix invalide : [entrée, sortie] attendu'],
            [['modeles' => ['m' => ['prix_usd_mtok' => [1, -2], 'etages' => ['taggers']]]], 'Prix invalide : nombre strictement positif attendu'],
            [['modeles' => ['m' => ['prix_usd_mtok' => [1, 2], 'etages' => []]]], 'Étages invalides (taggers, rapide, tribunal)'],
            [['enabled' => 'oui'], 'Champ enabled invalide : booléen attendu'],
            [['appels_par_minute' => 0], 'Rythme d’appels hors bornes (1 à 600 par minute)'],
            [['appels_par_minute' => 601], 'Rythme d’appels hors bornes (1 à 600 par minute)'],
            [['pipeline' => 'texte'], 'Configuration pipeline invalide : objet attendu'],
        ];
        foreach ($ko as [$partial, $message]) {
            try {
                self::config()->update($partial);
                self::fail('accepté : ' . json_encode($partial));
            } catch (Twin9Exception $e) {
                self::assertSame([422, $message], [$e->getStatusCode(), $e->getMessage()], json_encode($partial));
            }
        }
        self::assertSame(600, self::config()->appelsParMinute(), 'dernier état valide conservé');
        // Configuration ENTIÈRE inchangée par les refus (colonne JSON : assertEquals).
        self::assertEquals($valide, self::stored());
    }

    #[TestDox('UC-ADM-05-U10 — ANOMALIE figée : un pack au-delà de 500 USD est refusé avec un message annonçant « entre 1 et 100 USD »')]
    public function testU10PackBoundMessageIsStale(): void
    {
        try {
            self::config()->update(['packs' => [['montant_usd' => 501, 'libelle' => 'trop']]]);
            self::fail('pack de 501 USD accepté');
        } catch (Twin9Exception $e) {
            self::assertSame('Pack hors bornes : montant entre 1 et 100 USD', $e->getMessage());
        }
        // … alors que 500 USD est accepté (et proposé par défaut).
        self::assertSame(500, self::config()->update(['packs' => [['montant_usd' => 500, 'libelle' => 'ok']]])['packs'][0]['montant_usd']);
        self::assertSame([10, 20, 50, 100, 200, 500], array_column(Twin9Config::defaults()['packs'], 'montant_usd'));
    }

    #[TestDox('UC-ADM-05-U11 — lecture effective : défauts complétés, clés stockées inconnues ignorées ; vue publique sans marge ni prix catalogue')]
    public function testU11EffectiveReadAndPublicView(): void
    {
        (new SettingsRepository(self::$pdo))->set(Twin9Config::SETTING_KEY, ['marge' => 1.3, 'cle_obsolete' => 'x']);
        $read = self::config()->read();
        self::assertSame(1.3, $read['marge']);
        self::assertArrayNotHasKey('cle_obsolete', $read);
        self::assertSame(array_keys(Twin9Config::defaults()), array_keys($read));

        $public = self::config()->publicView();
        self::assertSame([3.9, 19.5], $public['modeles']['claude-sonnet-5']['prix_usd_mtok']);
        foreach (['marge', 'marge_twin6', 'appels_par_minute'] as $cleAdmin) {
            self::assertArrayNotHasKey($cleAdmin, $public);
        }
    }

    #[TestDox('UC-ADM-05-U12 — table des comptes : seuls les comptes ayant une activité, solde, cumuls, dernière activité d’abord (anomalie figée : un remboursement compte en consommé)')]
    public function testU12AccountsOversight(): void
    {
        $ids = [];
        foreach (['ecole@example.org' => 'École fictive', 'lea@example.org' => 'Léa', 'inactif@example.org' => 'Inactif'] as $email => $nom) {
            self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
                ->execute([$email, Users::hashPassword('x-password'), $nom]);
            $ids[$nom] = (int) self::$pdo->lastInsertId();
        }
        $credits = new CreditService(self::$pdo);
        $credits->topup($ids['École fictive'], 200_000_000, 'ORDER-ECOLE', 'Recharge PayPal');
        $credits->debit($ids['École fictive'], 50_000_000, 'tagger/1-tag-pole (réserve)', 'claude-sonnet-5');
        $credits->topup($ids['Léa'], 10_000_000, 'ORDER-LEA', 'Recharge PayPal');
        $credits->recordCapture($ids['Léa'], 'CAP-LEA', 'ORDER-LEA', 10_000_000);
        $credits->appliquerRemboursement($ids['Léa'], 'CAP-LEA', 4_000_000);
        self::$pdo->exec("UPDATE twin9_credit_events SET created_at = '2026-07-01 10:00:00' WHERE user_id = " . $ids['École fictive']);
        self::$pdo->exec("UPDATE twin9_credit_events SET created_at = '2026-07-05 10:00:00' WHERE user_id = " . $ids['Léa']);

        self::assertSame([
            ['user_id' => $ids['Léa'], 'email' => 'lea@example.org', 'nom' => 'Léa', 'solde_microusd' => 6_000_000, 'recharges_microusd' => 10_000_000, 'consomme_microusd' => 4_000_000, 'derniere_activite' => '2026-07-05 10:00:00'],
            ['user_id' => $ids['École fictive'], 'email' => 'ecole@example.org', 'nom' => 'École fictive', 'solde_microusd' => 150_000_000, 'recharges_microusd' => 200_000_000, 'consomme_microusd' => 50_000_000, 'derniere_activite' => '2026-07-01 10:00:00'],
        ], (new FactureService(self::$pdo))->comptes());
    }
}
