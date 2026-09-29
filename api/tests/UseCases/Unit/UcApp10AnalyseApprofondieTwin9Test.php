<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Audit;
use Humanome\Auth\Users;
use Humanome\Cartographies\CartographyRepository;
use Humanome\Keys\KeyVault;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\TwinSupport;
use Humanome\Twin9\AnthropicCaller;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\FicheStore;
use Humanome\Twin9\LeakFilter;
use Humanome\Twin9\ProtocoleRepository;
use Humanome\Twin9\Twin9Config;
use Humanome\Twin9\Twin9Exception;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-APP-10 — Lancer une analyse approfondie (Twin9) : tests UNITAIRES (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-10-analyse-approfondie-twin9.md
 *
 * Les classes sollicitées par POST /api/twin9/appel et GET /api/twin9/meta
 * sont appelées directement : rendu serveur des gabarits CONFIDENTIELS
 * (ProtocoleRepository), injection des fiches secrètes (FicheStore), filtre
 * anti-fuite (LeakFilter) sur l'index que la route construit, tarification
 * par étage (Twin9Config), appel amont (AnthropicCaller) et stockage opt-in
 * du résultat natif (CartographyRepository, type « twin9 », migration 021).
 * Tous les gabarits et fiches sont FICTIFS (TwinSupport).
 */
final class UcApp10AnalyseApprofondieTwin9Test extends TestCase
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
        self::$pdo->exec('DELETE FROM twin9_protocole_versions');
        self::$pdo->exec('DELETE FROM twin9_protocole');
        self::$pdo->exec("DELETE FROM settings WHERE name IN ('twin9_config', 'twin9_fiches', 'twin9_referentiel')");
    }

    private static function config(): Twin9Config
    {
        return new Twin9Config(new SettingsRepository(self::$pdo));
    }

    #[TestDox('UC-APP-10-U23 — rendu serveur : substitution en UNE passe, valeurs typées, variables absentes laissées et nommées (anomalie figée : motif {$X} dans une valeur) ; gabarit inconnu → 404')]
    public function testU23ServerSideRendering(): void
    {
        $repo = new ProtocoleRepository(self::$pdo);
        $repo->put('fictif/rendu', "A={\$A} B={\$B} C={\$C} D={\$D} E={\$E} manque={\$MANQUE}", null);

        $out = $repo->render('fictif/rendu', [
            'A' => 'valeur {$B} non re-substituée',
            'B' => true,
            'C' => 3,
            'D' => null,
            'E' => ['1.02', '1.01'],
            'minuscule' => 'ignorée',
        ]);
        self::assertSame(
            'A=valeur {$B} non re-substituée B=true C=3 D= E=["1.02","1.01"] manque={$MANQUE}',
            $out['rendu'],
        );
        // ANOMALIE figée : les variables non résolues sont cherchées dans le RENDU ;
        // un motif {$B} présent dans une VALEUR (texte de l'apprenant) est donc
        // signalé comme non résolu — /api/twin9/appel répondrait 422.
        self::assertSame(['B', 'MANQUE'], $out['non_resolues']);
        self::assertSame(['MANQUE'], $repo->render('fictif/rendu', ['A' => 'a', 'B' => 'b', 'C' => 'c', 'D' => 'd', 'E' => 'e'])['non_resolues']);

        try {
            $repo->render('fictif/inconnu', []);
            self::fail('gabarit inconnu rendu');
        } catch (Twin9Exception $e) {
            self::assertSame(404, $e->getStatusCode());
            self::assertSame('Gabarit introuvable', $e->getMessage());
        }
    }

    #[TestDox('UC-APP-10-U39 — ProtocoleRepository::list : métadonnées seulement (nom, longueur en caractères, variables), triées par nom, JAMAIS le contenu')]
    public function testU39ListReturnsMetadataOnly(): void
    {
        $repo = new ProtocoleRepository(self::$pdo);
        $repo->put('tagger/1-tag-pole', TwinSupport::GABARIT_TAG, null);
        $repo->put('lourd/20-greffier', TwinSupport::GABARIT_GREFFIER, null);

        $liste = $repo->list();
        self::assertSame(['lourd/20-greffier', 'tagger/1-tag-pole'], array_column($liste, 'name'));
        foreach ($liste as $entree) {
            self::assertSame(['name', 'longueur', 'variables', 'updated_at'], array_keys($entree));
        }
        self::assertSame(mb_strlen(TwinSupport::GABARIT_GREFFIER), $liste[0]['longueur'], 'CHAR_LENGTH (caractères, pas octets)');
        self::assertNotSame(\strlen(TwinSupport::GABARIT_GREFFIER), $liste[0]['longueur']);
        self::assertSame(['COMPETENCE_FICHE', 'POLE_FICHES', 'CODE', 'EXTRAIT'], $liste[0]['variables']);
        self::assertSame(['POLE_NUM', 'TEXTE_JOURNEE'], $liste[1]['variables']);
        $brut = json_encode($liste, JSON_UNESCAPED_UNICODE);
        self::assertStringNotContainsString('loutre', (string) $brut);
        self::assertStringNotContainsString('Greffier FICTIF', (string) $brut);
    }

    #[TestDox('UC-APP-10-U24 — fiches confidentielles injectées côté serveur depuis les clés de lookup (CODE ; POLE_NUM + ordre)')]
    public function testU24FicheInjectionFromLookupKeys(): void
    {
        $settings = new SettingsRepository(self::$pdo);
        self::assertTrue(FicheStore::fromSettings($settings)->isEmpty(), 'rien d’importé');

        FicheStore::store($settings, TwinSupport::fichesFictives());
        $fiches = FicheStore::fromSettings($settings);
        self::assertFalse($fiches->isEmpty());

        $injected = $fiches->injecter(['CODE' => '1.01', 'POLE_NUM' => 1, 'POLE_FICHES_ORDRE' => ['1.02', '1.01']]);
        self::assertSame(TwinSupport::FICHE_SECRETE, $injected['COMPETENCE_FICHE']);
        self::assertSame(
            "PRÉAMBULE FICTIF DU PÔLE 1\n\nFICHE FICTIVE 1.02 : cadrage de l’intention.\n\n---\n\n" . TwinSupport::FICHE_SECRETE . "\n",
            $injected['POLE_FICHES'],
            'ordre du client (permutation anti-gaming), assemblage Python',
        );
        // Sans ordre : ordre canonique du pôle.
        self::assertStringStartsWith("PRÉAMBULE FICTIF DU PÔLE 1\n\n" . TwinSupport::FICHE_SECRETE, $fiches->injecter(['POLE_NUM' => '1'])['POLE_FICHES']);
        // Clés inconnues : rien d'injecté (jamais d'erreur bavarde).
        self::assertSame([], $fiches->injecter(['CODE' => '9.99', 'POLE_NUM' => 9]));
        self::assertSame([], $fiches->injecter(['TEXTE_JOURNEE' => 'x']));
    }

    #[TestDox('UC-APP-10-U25 — LeakFilter::redact sur un index de la même forme que celui de la route (variables VIDES + fiches INJECTÉES) : gabarit et fiche expurgés, citation de l’apprenant conservée')]
    public function testU25LeakFilterOnTheRouteIndex(): void
    {
        $repo = new ProtocoleRepository(self::$pdo);
        $repo->put('fictif/greffier', TwinSupport::GABARIT_TAG . "\n" . TwinSupport::GABARIT_GREFFIER, null);
        FicheStore::store(new SettingsRepository(self::$pdo), TwinSupport::fichesFictives());
        $fiches = FicheStore::fromSettings(new SettingsRepository(self::$pdo));
        $variables = ['CODE' => '1.01', 'TEXTE_JOURNEE' => 'hier j’ai réparé la grande horloge du village avec mes deux mains nues ce matin'];

        // Index de la MÊME FORME que celui de routes/twin9.php (reconstruit ici :
        // que la route injecte bien les fiches dans SON index est vérifié par
        // UC-APP-10-F20, à travers l'API).
        $gabaritVide = $repo->render('fictif/greffier', array_merge(
            array_fill_keys($repo->get('fictif/greffier')['variables'], ''),
            $fiches->injecter($variables),
        ))['rendu'];
        self::assertStringNotContainsString('horloge', $gabaritVide, 'la charge utile de l’apprenant n’entre jamais dans l’index');

        $sortie = 'Consigne : la loutre argentée range les galets turquoise au bord du lac gelé chaque soir. '
            . 'Fiche : le cartographe observe la manière dont la personne confronte deux sources contradictoires avant de conclure. '
            . 'Citation : ' . $variables['TEXTE_JOURNEE'] . '.';
        $filtre = LeakFilter::redact($gabaritVide, $sortie);

        self::assertSame(2, $filtre['fuites']);
        self::assertStringNotContainsString('loutre argentée', $filtre['sortie']);
        self::assertStringNotContainsString('confronte deux sources', $filtre['sortie']);
        self::assertSame(2, substr_count($filtre['sortie'], LeakFilter::MARQUEUR));
        self::assertStringContainsString($variables['TEXTE_JOURNEE'], $filtre['sortie']);

        // Sortie propre ou trop courte : inchangée.
        self::assertSame(['sortie' => 'Position : détection.', 'fuites' => 0], LeakFilter::redact($gabaritVide, 'Position : détection.'));
        self::assertSame(['sortie' => 'x', 'fuites' => 0], LeakFilter::redact('', 'x'));
    }

    #[TestDox('UC-APP-10-U26 — offre par étage et coût réel à ×1,20 par modèle ; la réserve pire-cas couvre toujours le coût')]
    public function testU26PerStageOfferAndCosts(): void
    {
        $config = self::config();
        self::assertSame(['taggers', 'rapide', 'tribunal'], Twin9Config::ETAGES);
        $modeles = $config->modeles();
        self::assertSame(['taggers', 'rapide'], $modeles['claude-haiku-4-5-20251001']['etages']);
        self::assertSame(['tribunal'], $modeles['claude-opus-4-8']['etages']);

        self::assertSame(2400, $config->coutMicrousd('claude-haiku-4-5-20251001', 1000, 200));
        self::assertSame(7200, $config->coutMicrousd('claude-sonnet-5', 1000, 200));
        self::assertSame(12000, $config->coutMicrousd('claude-opus-4-8', 1000, 200));
        self::assertSame([6, 30], $config->prixMicrousdParToken('claude-opus-4-8'));

        $reserve = $config->reserveMicrousd('claude-opus-4-8', 5000, 4096);
        self::assertGreaterThanOrEqual($config->coutMicrousd('claude-opus-4-8', 5000, 4096), $reserve);
        self::assertGreaterThan($config->coutMicrousd('claude-opus-4-8', 1000, 200), $reserve);
    }

    #[TestDox('UC-APP-10-U27 — interrupteurs et structure publique : Twin9 désactivé et promo fermée par défaut ; référentiel stocké SANS texte de fiche')]
    public function testU27SwitchesAndPublicReferentiel(): void
    {
        $config = self::config();
        self::assertFalse($config->isEnabled());
        self::assertFalse($config->clePersoOuverte());
        self::assertSame(30, $config->appelsParMinute());
        self::assertSame([], $config->referentiel());

        $config->setEnabled(true);
        self::assertTrue(self::config()->isEnabled());

        $config->setReferentiel([
            ['num' => '1', 'nom' => 'TÊTE', 'competences' => [
                ['code' => '1.01', 'nom' => 'Pensée critique', 'fiche_md' => 'TEXTE SECRET'],
                ['nom' => 'sans code'],
            ]],
            'pas un pôle',
        ]);
        // Colonne JSON MySQL : ordre des clés libre → égalité de contenu.
        self::assertEquals([['num' => 1, 'nom' => 'TÊTE', 'competences' => [['code' => '1.01', 'nom' => 'Pensée critique']]]], $config->referentiel());

        $config->update(['pipeline' => ['jury' => ['taille_aleatoire' => 5]]]);
        $view = self::config()->publicView();
        self::assertSame(['jury' => ['taille_aleatoire' => 5]], $view['pipeline']);
        self::assertSame([3.6, 18.0], $view['modeles']['claude-sonnet-5']['prix_usd_mtok']);
    }

    #[TestDox('UC-APP-10-U28 — AnthropicCaller (Twin9) : pas de prompt système, arrêt « max_tokens » relayé, compteurs absents → 0')]
    public function testU28AnthropicCallerForTwin9(): void
    {
        $http = new LlmFakeHttpClient();
        $http->queueResponse(['status' => 200, 'body' => json_encode([
            'content' => [['type' => 'text', 'text' => 'sortie tronq']],
            'stop_reason' => 'max_tokens',
        ], JSON_THROW_ON_ERROR)]);

        $out = (new AnthropicCaller($http, 'sk-ant-user-fictive'))->appeler('claude-opus-4-8', null, 'gabarit rendu', 4096);

        self::assertSame(['texte' => 'sortie tronq', 'tokens_in' => 0, 'tokens_out' => 0, 'stop_reason' => 'max_tokens'], $out);
        $payload = json_decode((string) $http->requests[0]['body'], true);
        self::assertArrayNotHasKey('system', $payload);
        self::assertSame('sk-ant-user-fictive', $http->requests[0]['headers']['x-api-key']);
        self::assertSame(150, $http->requests[0]['timeout'], 'délai amont par défaut');
    }

    #[TestDox('UC-APP-10-U29 — stockage opt-in : une cartographie de type « twin9 » (migration 021) garde le carto_evolutive NATIF')]
    public function testU29OptInStorageOfTheNativeResult(): void
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute(['lea@example.org', Users::hashPassword('x-password'), 'Léa']);
        $userId = (int) self::$pdo->lastInsertId();
        $natif = ['journal_id' => 'twin9', 'version' => 'Twin_v9', 'competences' => ['1.01' => ['attestations' => [['jour_index' => 0, 'date' => '2026-04-06']]]]];

        $repo = new CartographyRepository(self::$pdo);
        $id = $repo->create($userId, 'twin9', 'Twin9 — twin9', 'privee', $natif, null, null, null);

        $row = $repo->findForUser($id, $userId);
        self::assertSame('twin9', $row['type']);
        self::assertEquals($natif, $row['document'], 'colonne JSON : même contenu, ordre des clés libre');
        self::assertNotNull(self::$pdo->query('SELECT opt_in_at FROM cartographies WHERE id = ' . $id)->fetchColumn());
        self::assertArrayNotHasKey('document', $repo->listForUser($userId)[0]);
    }

    private static function lea(): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute(['lea@example.org', Users::hashPassword('x-password'), 'Léa']);

        return (int) self::$pdo->lastInsertId();
    }

    #[TestDox('UC-APP-10-U32 — clé privée : stockée chiffrée (libsodium), relue en clair côté serveur seulement par son propriétaire ; clé maître absente → null')]
    public function testU32PrivateKeyVault(): void
    {
        $lea = self::lea();
        $vault = new KeyVault(self::$pdo, sodium_hex2bin(TwinSupport::MASTER_KEY_HEX));
        $vault->store($lea, 'anthropic', 'sk-ant-perso-fictive');

        $blob = (string) self::$pdo->query('SELECT encrypted_key FROM user_api_keys WHERE user_id = ' . $lea)->fetchColumn();
        self::assertStringNotContainsString('sk-ant', $blob);
        self::assertSame('sk-ant-perso-fictive', $vault->reveal($lea, 'anthropic'));
        self::assertNull($vault->reveal($lea + 1, 'anthropic'), 'propriétaire seulement');
        self::assertNull((new KeyVault(self::$pdo, str_repeat("\x01", SODIUM_CRYPTO_SECRETBOX_KEYBYTES)))->reveal($lea, 'anthropic'), 'autre clé maître : illisible');
        self::assertSame([['provider' => 'anthropic']], array_map(static fn (array $k): array => ['provider' => $k['provider']], $vault->listForUser($lea)));

        TestDb::setEnv('SODIUM_MASTER_KEY', 'trop-court');
        self::assertNull(KeyVault::masterKeyFromEnv());
        TestDb::restoreEnv();
    }

    #[TestDox('UC-APP-10-U33 — échec amont : la réserve rendue porte le MODÈLE (facture par modèle exacte) ; Audit::record persiste les détails fournis tels quels (la route n’y met que {etape, fuites}, F20)')]
    public function testU33FailureRefundCarriesModelAndAuditIsCountersOnly(): void
    {
        $lea = self::lea();
        $credits = new CreditService(self::$pdo);
        $credits->topup($lea, 1_000_000, 'ORDER-U33');
        $credits->debit($lea, 250_000, 'lourd/24-president (réserve)', 'claude-opus-4-8');
        self::assertSame(1_000_000, $credits->adjust($lea, 250_000, 'lourd/24-president (remboursement échec)', 'claude-opus-4-8'));
        self::assertSame(['claude-opus-4-8', 'claude-opus-4-8', null], array_column($credits->events($lea), 'model'));

        // Audit::record stocke les détails TELS QUELS : le « compteurs seulement »
        // tient à ce que la route lui passe (vérifié par UC-APP-10-F20).
        Audit::record(self::$pdo, $lea, 'twin9_fuite_expurgee', ['etape' => 'lourd/24-president', 'fuites' => 2]);
        $row = self::$pdo->query("SELECT user_id, details FROM audit_events WHERE type = 'twin9_fuite_expurgee'")->fetch();
        self::assertSame($lea, (int) $row['user_id']);
        self::assertEquals(['etape' => 'lourd/24-president', 'fuites' => 2], json_decode((string) $row['details'], true));
    }
}
