<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Db;
use Humanome\Keys\KeyVault;
use Humanome\Llm\LlmRuntime;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\TwinSupport;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\ProtocoleRepository;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-ADM-05 — Superviser Twin9 : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/administration/UC-ADM-05-superviser-twin9.md
 *
 * L'administrateur règle Twin9 par GET/PUT /api/twin9/admin/config et suit les
 * comptes par GET /api/twin9/admin/comptes ; chaque réglage est vérifié par
 * son EFFET côté apprenant (offre /meta, facturation /appel, promotion clé
 * privée, packs PayPal, offre par étage, interrupteur). Amonts simulés.
 */
final class UcAdm05SuperviserTwin9Test extends CartographeTestCase
{
    private LlmFakeHttpClient $http;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $admin;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $apprenant;

    protected function setUp(): void
    {
        parent::setUp();
        $pdo = Db::get();
        $pdo->exec('DELETE FROM twin9_protocole_versions');
        $pdo->exec('DELETE FROM twin9_protocole');
        $pdo->exec("DELETE FROM settings WHERE name IN ('twin9_config', 'twin9_fiches', 'twin9_referentiel')");
        TestDb::setEnv('ANTHROPIC_API_KEY', TwinSupport::PLATFORM_KEY);
        TestDb::setEnv('SODIUM_MASTER_KEY', TwinSupport::MASTER_KEY_HEX);
        TestDb::setEnv('PAYPAL_MODE', 'sandbox');
        TestDb::setEnv('PAYPAL_CLIENT_ID', 'client-fictif');
        TestDb::setEnv('PAYPAL_SECRET', 'secret-fictif');
        $this->http = new LlmFakeHttpClient();
        LlmRuntime::setHttpClient($this->http);
        (new ProtocoleRepository($pdo))->put('tagger/1-tag-pole', TwinSupport::GABARIT_TAG, null);

        $this->admin = $this->registerAs('admin@example.org', 'Root Admin', ['admin']);
        $this->apprenant = $this->registerAs('lea@example.org', 'Léa', ['apprenant']);
        $this->config(['enabled' => true]);
    }

    protected function tearDown(): void
    {
        LlmRuntime::setHttpClient(null);
        parent::tearDown();
    }

    private function config(array $partial): ResponseInterface
    {
        return $this->as_($this->admin, 'PUT', '/api/twin9/admin/config', $partial);
    }

    private function appel(array $overrides = []): ResponseInterface
    {
        return $this->as_($this->apprenant, 'POST', '/api/twin9/appel', array_merge([
            'etape' => 'tagger/1-tag-pole',
            'variables' => ['POLE_NUM' => 1, 'TEXTE_JOURNEE' => 'journal'],
            'modele' => 'claude-sonnet-5',
            'etage' => 'taggers',
            'facturation' => 'platform',
        ], $overrides));
    }

    #[TestDox('UC-ADM-05-F09 — nominal : l’admin lit la config (prix catalogue + contributions), change la contribution Twin9 → nouveaux prix pour les apprenants et nouveau coût réel')]
    public function testF09ContributionChangeReachesLearners(): void
    {
        $config = self::json($this->as_($this->admin, 'GET', '/api/twin9/admin/config'));
        self::assertSame(1.2, $config['marge']);
        self::assertSame([3, 15], $config['modeles']['claude-sonnet-5']['prix_usd_mtok'], 'prix catalogue visibles de l’admin seul');

        $maj = self::json($this->config(['marge' => 1.5, 'marge_twin6' => 1.25]));
        self::assertSame([1.5, 1.25], [$maj['marge'], $maj['marge_twin6']]);

        $meta = self::json($this->as_($this->apprenant, 'GET', '/api/twin9/meta'));
        self::assertSame([4.5, 22.5], $meta['modeles']['claude-sonnet-5']['prix_usd_mtok']);
        self::assertSame([3.75, 18.75], $meta['modeles_twin6']['claude-sonnet-5']);
        self::assertArrayNotHasKey('marge', $meta);

        (new CreditService(Db::get()))->topup($this->apprenant['id'], 5_000_000, 'ORDER-ADM-05');
        TwinSupport::queueAnthropic($this->http, 'tags', 1000, 200);
        self::assertSame(9000, self::json($this->appel())['cout_microusd'], '(1000×3 + 200×15) × 1,5');
    }

    #[TestDox('UC-ADM-05-F10 — A1 : promotion « Twin9 gratuit avec sa clé » ouverte puis refermée → la voie clé privée suit immédiatement')]
    public function testF10PromoWindow(): void
    {
        (new KeyVault(Db::get(), (string) KeyVault::masterKeyFromEnv()))->store($this->apprenant['id'], 'anthropic', 'sk-ant-perso-fictive');
        self::assertSame(403, $this->appel(['facturation' => 'cle_privee'])->getStatusCode());

        self::assertTrue(self::json($this->config(['twin9_cle_perso_ouverte' => true]))['twin9_cle_perso_ouverte']);
        self::assertTrue(self::json($this->as_($this->apprenant, 'GET', '/api/twin9/meta'))['twin9_cle_perso_ouverte']);
        TwinSupport::queueAnthropic($this->http, 'tags');
        self::assertSame(0, self::json($this->appel(['facturation' => 'cle_privee']))['cout_microusd']);

        $this->config(['twin9_cle_perso_ouverte' => false]);
        self::assertSame(403, $this->appel(['facturation' => 'cle_privee'])->getStatusCode());
        self::assertCount(1, $this->http->requests);
    }

    #[TestDox('UC-ADM-05-F11 — A2 : grille de packs remplacée → offre /meta et montant de l’ordre PayPal suivent')]
    public function testF11PacksDriveTheOffer(): void
    {
        $this->config(['packs' => [['montant_usd' => 15, 'libelle' => 'Pack essai — 15 $'], ['montant_usd' => 500, 'libelle' => 'Pack établissement — 500 $']]]);
        self::assertSame([15, 500], array_column(self::json($this->as_($this->apprenant, 'GET', '/api/twin9/meta'))['packs'], 'montant_usd'));

        TwinSupport::queuePaypalToken($this->http);
        TwinSupport::queuePaypalOrderCreated($this->http, 'ORDER-500');
        self::assertSame(200, $this->as_($this->apprenant, 'POST', '/api/twin9/credit/paypal/creer', ['pack_index' => 1])->getStatusCode());
        self::assertSame('500.00', json_decode((string) $this->http->requests[1]['body'], true)['purchase_units'][0]['amount']['value']);
        self::assertSame(422, $this->as_($this->apprenant, 'POST', '/api/twin9/credit/paypal/creer', ['pack_index' => 2])->getStatusCode());
    }

    #[TestDox('UC-ADM-05-F12 — A3 / A4 : offre de modèles par étage et interrupteur de service → /appel suit (422 hors offre, 503 désactivé), rythme réglable')]
    public function testF12ModelOfferSwitchAndRate(): void
    {
        (new CreditService(Db::get()))->topup($this->apprenant['id'], 5_000_000, 'ORDER-ADM-05-B');
        $this->config(['modeles' => ['claude-haiku-4-5-20251001' => ['prix_usd_mtok' => [1, 5], 'etages' => ['taggers']]]]);
        self::assertSame(['error' => 'Modèle non proposé pour cet étage'], self::json($this->appel()));
        self::assertSame(['claude-haiku-4-5-20251001'], array_keys(self::json($this->as_($this->apprenant, 'GET', '/api/twin9/meta'))['modeles']));

        $this->config(['enabled' => false]);
        self::assertSame(['error' => 'Twin9 non disponible'], self::json($this->appel(['modele' => 'claude-haiku-4-5-20251001'])));

        $this->config(['enabled' => true, 'appels_par_minute' => 5]);
        TwinSupport::saturateRateLimit(Db::get(), 'twin9:appel:' . $this->apprenant['id'], 5);
        self::assertSame(429, $this->appel(['modele' => 'claude-haiku-4-5-20251001'])->getStatusCode());
        self::assertSame([], $this->http->requests);
    }

    #[TestDox('UC-ADM-05-F13 — nominal (comptes) : soldes et cumuls des seuls comptes ayant une activité, dernière activité d’abord')]
    public function testF13AccountsTable(): void
    {
        $ecole = $this->registerAs('ecole@example.org', 'École fictive', ['etablissement']);
        $credits = new CreditService(Db::get());
        $credits->topup($ecole['id'], 200_000_000, 'ORDER-ECOLE', 'Recharge PayPal');
        $credits->debit($ecole['id'], 1_000_000, 'tagger/1-tag-pole (réserve)', 'claude-sonnet-5');
        $credits->topup($this->apprenant['id'], 10_000_000, 'ORDER-LEA', 'Recharge PayPal');
        self::$pdo->exec("UPDATE twin9_credit_events SET created_at = '2026-07-01 09:00:00' WHERE user_id = " . $ecole['id']);

        $comptes = self::json($this->as_($this->admin, 'GET', '/api/twin9/admin/comptes'))['comptes'];
        self::assertSame(['lea@example.org', 'ecole@example.org'], array_column($comptes, 'email'));
        self::assertSame([199_000_000, 200_000_000, 1_000_000], [$comptes[1]['solde_microusd'], $comptes[1]['recharges_microusd'], $comptes[1]['consomme_microusd']]);
        self::assertNotContains('admin@example.org', array_column($comptes, 'email'), 'sans activité : absent');
    }

    #[TestDox('UC-ADM-05-F14 — E1 : supervision réservée à l’admin — visiteur 401 ; apprenant, promptologue, établissement 403 ; la promo n’est pas ouverte')]
    public function testF14AdminOnly(): void
    {
        $promptologue = $this->registerAs('prompto@example.org', 'Prompto', ['promptologue']);
        $ecole = $this->registerAs('ecole@example.org', 'École', ['etablissement']);
        $routes = [['GET', '/api/twin9/admin/config', null], ['PUT', '/api/twin9/admin/config', ['twin9_cle_perso_ouverte' => true]], ['GET', '/api/twin9/admin/comptes', null]];
        foreach ($routes as [$method, $path, $body]) {
            $this->cookieSid = null;
            self::assertSame(401, $this->request($method, $path, $body)->getStatusCode(), $path);
            foreach ([$this->apprenant, $promptologue, $ecole] as $user) {
                self::assertSame(403, $this->as_($user, $method, $path, $body)->getStatusCode(), $path);
            }
        }
        self::assertFalse(self::json($this->as_($this->apprenant, 'GET', '/api/twin9/meta'))['twin9_cle_perso_ouverte']);
    }

    #[TestDox('UC-ADM-05-F15 — E2 : corps non-objet → 400 ; clé inconnue ou valeur hors bornes → 422 avec message, rien n’est modifié')]
    public function testF15InvalidUpdates(): void
    {
        $raw = TwinSupport::rawRequest('PUT', '/api/twin9/admin/config', '"marge=2"', $this->admin['sid'], $this->admin['csrf']);
        self::assertSame(['error' => 'Corps JSON invalide : objet attendu'], self::json($raw));
        self::assertSame(400, $raw->getStatusCode());

        foreach ([
            [['surtaxe' => 1.3], 'Clé de configuration inconnue : surtaxe'],
            [['marge' => 0.8], 'Marge hors bornes (entre 1 et 5)'],
            [['marge_twin6' => 'dix'], 'Marge Twin6 invalide : nombre attendu'],
            [['packs' => [['montant_usd' => 0, 'libelle' => 'gratuit']]], 'Pack hors bornes : montant entre 1 et 100 USD'],
            [['modeles' => ['m' => ['prix_usd_mtok' => [1, 5], 'etages' => ['grenier']]]], 'Étages invalides (taggers, rapide, tribunal)'],
            [['appels_par_minute' => 1000], 'Rythme d’appels hors bornes (1 à 600 par minute)'],
        ] as [$partial, $message]) {
            $response = $this->config($partial);
            self::assertSame(422, $response->getStatusCode(), $message);
            self::assertSame($message, self::json($response)['error']);
        }
        $apres = self::json($this->as_($this->admin, 'GET', '/api/twin9/admin/config'));
        self::assertSame([1.2, 1.1, 30], [$apres['marge'], $apres['marge_twin6'], $apres['appels_par_minute']]);
    }

    #[TestDox('UC-ADM-05-F16 — cause de l’anomalie du formulaire : une config relue après enregistrement a ses clés réordonnées par MySQL')]
    public function testF16StoredConfigComesBackWithReorderedKeys(): void
    {
        $this->config(['marge' => 1.25]);
        $relue = self::json($this->as_($this->admin, 'GET', '/api/twin9/admin/config'));
        self::assertSame(['libelle', 'montant_usd'], array_keys($relue['packs'][0]));
        self::assertSame(['etages', 'prix_usd_mtok'], array_keys($relue['modeles']['claude-sonnet-5']));
        self::assertSame(['montant_usd', 'libelle'], array_keys(\Humanome\Twin9\Twin9Config::defaults()['packs'][0]), 'ordre des défauts, avant tout enregistrement');
    }
}
