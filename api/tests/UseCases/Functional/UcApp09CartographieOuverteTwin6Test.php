<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Db;
use Humanome\Llm\HttpClientException;
use Humanome\Llm\LlmRuntime;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\TwinSupport;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\Twin9Config;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-APP-09 — Lancer une cartographie ouverte (Twin6) : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-09-cartographie-ouverte-twin6.md
 *
 * La voie « crédits » est rejouée à travers l'API HTTP (Slim en processus,
 * vraie base MySQL) exactement comme le moteur navigateur la sollicite :
 * GET /api/twin9/meta (offre), puis 8 × POST /api/twin6/appel (7 scan-pole +
 * 1 kairos). L'amont Anthropic est le faux client HTTP (aucun réseau).
 */
final class UcApp09CartographieOuverteTwin6Test extends CartographeTestCase
{
    private const PORTFOLIO = "### 2026-02-10\n---\nJ’ai recoupé trois sources avant de conclure.";

    private LlmFakeHttpClient $http;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $apprenant;

    protected function setUp(): void
    {
        parent::setUp();
        TestDb::setEnv('ANTHROPIC_API_KEY', TwinSupport::PLATFORM_KEY);
        TestDb::setEnv('PAYPAL_CLIENT_ID', '');
        Db::get()->exec("DELETE FROM settings WHERE name IN ('twin9_config', 'twin9_referentiel')");
        $this->http = new LlmFakeHttpClient();
        LlmRuntime::setHttpClient($this->http);
        $this->apprenant = $this->registerAs('lea@example.org', 'Léa', ['apprenant']);
    }

    protected function tearDown(): void
    {
        LlmRuntime::setHttpClient(null);
        parent::tearDown();
    }

    /** Un appel du moteur (provider « crédits ») : corps tel qu'envoyé par api/twin6.js. */
    private function appel(array $overrides = []): ResponseInterface
    {
        return $this->as_($this->apprenant, 'POST', '/api/twin6/appel', array_merge([
            'model' => 'claude-sonnet-5',
            'prompt' => "Scanne le pôle 1.\n\n# Portfolio à cartographier\n\n" . self::PORTFOLIO,
            'system' => null,
            'max_tokens' => 8192,
        ], $overrides));
    }

    private function crediter(int $microusd, string $order = 'ORDER-UC-APP-09'): void
    {
        (new CreditService(Db::get()))->topup($this->apprenant['id'], $microusd, $order, 'Recharge PayPal');
    }

    private function solde(): int
    {
        return (new CreditService(Db::get()))->balance($this->apprenant['id']);
    }

    #[TestDox('UC-APP-09-F10 — nominal (crédits) : 7 scan-pole + 1 kairos via /api/twin6/appel, débit net = somme des coûts réels à +10 %')]
    public function testF10NominalEightBilledCalls(): void
    {
        $this->crediter(5_000_000);
        for ($i = 0; $i < 8; $i++) {
            TwinSupport::queueAnthropic($this->http, $i < 7 ? '{"poleNum":' . ($i + 1) . '}' : '{"kairos":{}}', 1000, 200);
        }

        $couts = 0;
        for ($pole = 1; $pole <= 8; $pole++) {
            $prompt = $pole <= 7
                ? "Scanne le pôle {$pole}.\n\n# Fiche des compétences du pôle {$pole} (P{$pole}.md)\n\n# Portfolio à cartographier\n\n" . self::PORTFOLIO
                : "Synthèse kairos.\n\n## carto_P1\n\n# Portfolio original\n\n" . self::PORTFOLIO;
            $response = $this->appel(['prompt' => $prompt, 'system' => 'Système public']);
            self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
            $body = self::json($response);
            // Contrat du provider proxy du moteur + contribution de l'appel.
            self::assertSame(['text', 'usage', 'model', 'stopReason', 'cout_microusd'], array_keys($body));
            // Sortie amont relayée INTACTE (RG1 : aucun rendu, aucun filtre) et modèle facturé.
            self::assertSame($pole <= 7 ? '{"poleNum":' . $pole . '}' : '{"kairos":{}}', $body['text']);
            self::assertSame('claude-sonnet-5', $body['model']);
            self::assertSame(['inputTokens' => 1000, 'outputTokens' => 200], $body['usage']);
            self::assertSame('end_turn', $body['stopReason']);
            self::assertSame(6602, $body['cout_microusd'], '(1000×3 + 200×15) × 1,10, arrondi au µUSD supérieur');
            $couts += $body['cout_microusd'];

            // Aucun rendu serveur : le prompt PUBLIC part tel quel, avec le système.
            $upstream = json_decode((string) $this->http->requests[$pole - 1]['body'], true);
            self::assertSame($prompt, $upstream['messages'][0]['content']);
            self::assertSame('Système public', $upstream['system']);
            self::assertSame(TwinSupport::PLATFORM_KEY, $this->http->requests[$pole - 1]['headers']['x-api-key']);
        }

        self::assertSame(5_000_000 - 8 * 6602, $this->solde());
        $events = (new CreditService(Db::get()))->events($this->apprenant['id']);
        $labels = array_count_values(array_column($events, 'label'));
        self::assertSame(8, $labels['twin6/cartographie (réserve)']);
        self::assertSame(8, $labels['twin6/cartographie (réconciliation)']);
    }

    #[TestDox('UC-APP-09-F11 — étape 2 : l’offre lue par la vue (/api/twin9/meta) porte prix Twin6, référentiel et solde — même Twin9 désactivé')]
    public function testF11OfferIsReadFromMetaAndTwin6IgnoresTheTwin9Switch(): void
    {
        $config = new Twin9Config(new SettingsRepository(Db::get()));
        $config->setReferentiel(TwinSupport::referentielFictif());
        $this->crediter(2_500_000);

        $meta = self::json($this->as_($this->apprenant, 'GET', '/api/twin9/meta'));
        self::assertFalse($meta['enabled'], 'Twin9 non importé');
        self::assertSame([3.3, 16.5], $meta['modeles_twin6']['claude-sonnet-5']);
        self::assertSame('TÊTE — Penser & Comprendre', $meta['referentiel'][0]['nom']);
        self::assertSame(2_500_000, $meta['solde_microusd']);

        // Twin6 est un protocole OUVERT : l'interrupteur Twin9 ne le bloque pas.
        TwinSupport::queueAnthropic($this->http, '{"poleNum":1}');
        self::assertSame(200, $this->appel()->getStatusCode());
    }

    #[TestDox('UC-APP-09-F12 — E7 : sans session → 401, aucun appel amont, aucun débit')]
    public function testF12RequiresSession(): void
    {
        $this->cookieSid = null;
        $response = $this->request('POST', '/api/twin6/appel', ['model' => 'claude-sonnet-5', 'prompt' => 'x']);
        self::assertSame(401, $response->getStatusCode());
        self::assertSame(['error' => 'Authentification requise'], self::json($response));
        self::assertSame([], $this->http->requests);
    }

    #[TestDox('UC-APP-09-F13 — E8 : clé plateforme non configurée → 503 « Service indisponible »')]
    public function testF13PlatformKeyMissing(): void
    {
        TestDb::setEnv('ANTHROPIC_API_KEY', '');
        $this->crediter(5_000_000);
        $response = $this->appel();
        self::assertSame(503, $response->getStatusCode());
        self::assertSame('Service indisponible', self::json($response)['error']);
        self::assertSame(5_000_000, $this->solde());
    }

    #[TestDox('UC-APP-09-F14 — E9 : requête invalide (400 JSON scalaire ou illisible, 413 > 2 Mo, 422 modèle/prompt/max_tokens, liste JSON ou corps vide) refusée avant tout débit')]
    public function testF14InvalidRequestsAreRefusedBeforeBilling(): void
    {
        $this->crediter(5_000_000);
        self::assertSame(422, $this->appel(['model' => 'gpt-fantome'])->getStatusCode());
        self::assertSame('Modèle non proposé', self::json($this->appel(['model' => 'gpt-fantome']))['error']);
        self::assertSame(422, $this->appel(['prompt' => "  \n "])->getStatusCode());
        self::assertSame(422, $this->appel(['max_tokens' => '8192'])->getStatusCode());
        self::assertSame(413, $this->appel(['prompt' => str_repeat('é', 1_000_001)])->getStatusCode());

        // Corps JSON scalaire (chaîne) ou illisible : 400.
        $raw = TwinSupport::rawRequest('POST', '/api/twin6/appel', '"juste une chaine"', $this->apprenant['sid'], $this->apprenant['csrf']);
        self::assertSame(400, $raw->getStatusCode());
        self::assertSame('Corps JSON invalide : objet attendu', self::json($raw)['error']);
        $illisible = TwinSupport::rawRequest('POST', '/api/twin6/appel', '{"model":', $this->apprenant['sid'], $this->apprenant['csrf']);
        self::assertSame(400, $illisible->getStatusCode());
        // Liste JSON ou corps vide : traités comme un objet sans champ → 422 (modèle absent), pas 400.
        foreach (['[1,2]', ''] as $corps) {
            $liste = TwinSupport::rawRequest('POST', '/api/twin6/appel', $corps, $this->apprenant['sid'], $this->apprenant['csrf']);
            self::assertSame(422, $liste->getStatusCode(), 'corps ' . var_export($corps, true));
            self::assertSame(['error' => 'Modèle non proposé'], self::json($liste));
        }

        self::assertSame([], $this->http->requests);
        self::assertSame(5_000_000, $this->solde());
        self::assertCount(1, (new CreditService(Db::get()))->events($this->apprenant['id']), 'seule la recharge');
    }

    #[TestDox('UC-APP-09-F15 — E4 : réserve pire-cas non couverte → 402 avec montants, amont jamais appelé, solde intact')]
    public function testF15InsufficientBalanceForTheReserve(): void
    {
        // 12 000 µUSD couvriraient le coût RÉEL probable, pas la réserve pire-cas.
        $this->crediter(12_000);
        $response = $this->appel();
        self::assertSame(402, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame('Solde insuffisant', $body['error']);
        self::assertSame(12_000, $body['solde_microusd']);
        $config = new Twin9Config(new SettingsRepository(Db::get()));
        $expected = $config->reserveMicrousd('claude-sonnet-5', \strlen("Scanne le pôle 1.\n\n# Portfolio à cartographier\n\n" . self::PORTFOLIO), 8192, 'twin6');
        self::assertSame($expected, $body['requis_estime_microusd']);
        self::assertSame([], $this->http->requests);
        self::assertSame(12_000, $this->solde());
    }

    #[TestDox('UC-APP-09-F16 — E10 : rythme dépassé (appels_par_minute) → 429 + Retry-After, amont non appelé')]
    public function testF16RateLimit(): void
    {
        (new Twin9Config(new SettingsRepository(Db::get())))->update(['appels_par_minute' => 2]);
        $this->crediter(5_000_000);
        TwinSupport::queueAnthropic($this->http, '{}');
        self::assertSame(200, $this->appel()->getStatusCode(), 'sous la limite');

        // Les 2 appels de la minute sont consommés (fenêtre courante ET suivante).
        TwinSupport::saturateRateLimit(Db::get(), 'twin6:appel:' . $this->apprenant['id'], 2);
        $bloque = $this->appel();
        self::assertSame(429, $bloque->getStatusCode());
        self::assertSame('Rythme d’appels trop élevé, ralentissez.', self::json($bloque)['error']);
        self::assertSame('30', $bloque->getHeaderLine('Retry-After'));
        self::assertCount(1, $this->http->requests);
    }

    #[TestDox('UC-APP-09-F17 — E11 : échec amont (500 → 502, délai → 504) : message générique et réserve intégralement rendue')]
    public function testF17UpstreamFailureRefundsTheReserve(): void
    {
        $this->crediter(1_000_000);
        $this->http->queueResponse(['status' => 500, 'body' => '{"error":{"message":"détail amont confidentiel"}}']);
        $response = $this->appel();
        self::assertSame(502, $response->getStatusCode());
        self::assertStringNotContainsString('confidentiel', (string) $response->getBody());

        $this->http->queueException(new HttpClientException('timeout', true));
        self::assertSame(504, $this->appel()->getStatusCode());

        self::assertSame(1_000_000, $this->solde(), 'aucun appel échoué n’est facturé');
        $labels = array_column((new CreditService(Db::get()))->events($this->apprenant['id']), 'label');
        self::assertSame(2, \count(array_keys($labels, 'twin6/cartographie (remboursement échec)', true)));
    }

    #[TestDox('UC-APP-09-F18 — A3, E5 : max_tokens borné à [256, 16000] (alias maxTokens, 8 192 par défaut) ; stop « max_tokens » relayé ET facturé au coût réel')]
    public function testF18MaxTokensBoundsAndTruncationSignal(): void
    {
        $this->crediter(50_000_000);
        TwinSupport::queueAnthropic($this->http, '{}');
        TwinSupport::queueAnthropic($this->http, '{}');
        TwinSupport::queueAnthropic($this->http, '{}');
        TwinSupport::queueAnthropic($this->http, '{"tronq', 10, 256, 'max_tokens');

        $couts = [];
        $couts[] = self::json($this->appel(['max_tokens' => 10]))['cout_microusd'];
        $couts[] = self::json($this->appel(['max_tokens' => null, 'maxTokens' => 99_999]))['cout_microusd'];
        // Ni max_tokens ni maxTokens : défaut serveur 8 192.
        $couts[] = self::json($this->as_($this->apprenant, 'POST', '/api/twin6/appel', [
            'model' => 'claude-sonnet-5',
            'prompt' => 'Scanne le pôle 2.',
        ]))['cout_microusd'];
        $tronque = self::json($this->appel(['max_tokens' => 256]));
        $couts[] = $tronque['cout_microusd'];

        self::assertSame(256, json_decode((string) $this->http->requests[0]['body'], true)['max_tokens']);
        self::assertSame(16000, json_decode((string) $this->http->requests[1]['body'], true)['max_tokens']);
        self::assertSame(8192, json_decode((string) $this->http->requests[2]['body'], true)['max_tokens']);
        self::assertSame('max_tokens', $tronque['stopReason'], 'le moteur échoue explicitement sur ce signal');
        self::assertSame('{"tronq', $tronque['text']);
        // E5 : l'appel tronqué est un 200 côté serveur — facturé au coût réel
        // ((10×3 + 256×15) × 1,10 = 4 257 µUSD), comme les appels aboutis avant lui.
        self::assertSame(4257, $tronque['cout_microusd']);
        self::assertSame(50_000_000 - array_sum($couts), $this->solde());
    }

    #[TestDox('UC-APP-09-F19 — RGPD : ni le grand-livre ni l’audit ne conservent le prompt ou la sortie (compteurs seulement)')]
    public function testF19NothingOfThePortfolioIsStored(): void
    {
        $this->crediter(5_000_000);
        TwinSupport::queueAnthropic($this->http, 'Sortie contenant « recoupé trois sources ».', 700, 90);
        $response = $this->appel();
        self::assertSame(200, $response->getStatusCode());
        // La sortie est relayée NON filtrée à l'apprenant (RG1)…
        self::assertSame('Sortie contenant « recoupé trois sources ».', self::json($response)['text']);

        $ledger = json_encode(self::$pdo->query('SELECT * FROM twin9_credit_events')->fetchAll(), JSON_UNESCAPED_UNICODE);
        $audit = json_encode(self::$pdo->query('SELECT * FROM audit_events')->fetchAll(), JSON_UNESCAPED_UNICODE);
        foreach ([$ledger, $audit] as $stored) {
            self::assertStringNotContainsString('recoupé', (string) $stored);
            self::assertStringNotContainsString('Scanne le pôle', (string) $stored);
        }
        self::assertStringContainsString('"tokens_in":700', (string) $ledger);
    }

    #[TestDox('UC-APP-09-F20 — E12 : session valide mais jeton CSRF absent ou faux → 403, amont jamais appelé, rien débité')]
    public function testF20CsrfTokenIsRequired(): void
    {
        $this->crediter(5_000_000);
        $corps = ['model' => 'claude-sonnet-5', 'prompt' => 'Scanne le pôle 1.', 'max_tokens' => 8192];
        foreach ([[], ['X-CSRF-Token' => 'jeton-faux']] as $entetes) {
            $this->cookieSid = $this->apprenant['sid'];
            $response = $this->request('POST', '/api/twin6/appel', $corps, $entetes);
            self::assertSame(403, $response->getStatusCode());
            self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($response));
        }
        self::assertSame([], $this->http->requests);
        self::assertSame(5_000_000, $this->solde());
        self::assertCount(1, (new CreditService(Db::get()))->events($this->apprenant['id']), 'seule la recharge');
    }
}
