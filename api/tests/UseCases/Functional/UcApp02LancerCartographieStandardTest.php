<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Packages\PromptPackageRepository;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\LlmTestCase;
use Humanome\Tests\TestDb;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-APP-02 — Lancer une cartographie standard : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-02-lancer-cartographie-standard.md
 *
 * Les étapes serveur de l'assistant sont rejouées par l'API HTTP réelle
 * (Slim en processus, vraie base MySQL), exactement comme le navigateur de
 * l'apprenant les appelle : versions de prompt (GET /api/prompt-packages*),
 * puis, en « Service humanome », une journée complète = 8 appels
 * GET /api/llm/challenge + POST /api/llm avec preuve de travail, sur le
 * fournisseur mock (DEMO_PROVIDER=mock : aucune clé, aucun réseau).
 */
final class UcApp02LancerCartographieStandardTest extends LlmTestCase
{
    private const DAY = '2026-01-05';

    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM prompt_packages');
        self::$pdo->exec('DELETE FROM settings');
        self::$pdo->exec('DELETE FROM audit_events');
    }

    /** L'apprenant connecté (compte créé et activé par l'API). */
    private function connectLearner(): void
    {
        self::assertSame(200, $this->register('maya@example.org', self::PASSWORD, 'Maya')->getStatusCode());
    }

    private static function publish(string $id, string $version): void
    {
        $path = \dirname(__DIR__, 4) . '/schemas/fixtures/prompt-package-exemple.json';
        $doc = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        (new PromptPackageRepository(self::$pdo))->importPublishedDocument(array_merge($doc, ['id' => $id, 'version' => $version]));
    }

    /** Prompt d'extraction tel que le moteur le construit (marqueurs utiles). */
    private static function polePrompt(int $num): string
    {
        return "# Pôle {$num} — Pôle du référentiel\n\nFeuille du journal (" . self::DAY . ") :\nAtelier photo à l’Astrolabe avec les CM2.";
    }

    /** Corps envoyé par le fournisseur « proxy » du moteur + preuve de travail. */
    private function engineCall(string $prompt, ?array $challenge = null): ResponseInterface
    {
        $issued = $challenge ?? $this->fetchChallenge();

        return $this->request('POST', '/api/llm', [
            'provider' => 'anthropic',
            'model' => 'demo',
            'system' => null,
            'prompt' => $prompt,
            'maxTokens' => 8192,
            'challenge' => $issued['challenge'],
            'nonce' => $this->solve($issued['challenge'], $issued['difficultyBits']),
            'website' => '',
        ]);
    }

    #[TestDox('UC-APP-02-F14 — étape 3 : versions publiées, version par défaut (réglage, sinon la plus récente), document complet')]
    public function testF14PromptPackageVersions(): void
    {
        $this->connectLearner();
        $none = $this->request('GET', '/api/prompt-packages/default');
        self::assertSame(404, $none->getStatusCode());
        self::assertSame('Aucun paquet publié', self::json($none)['error']);

        self::publish('aurora-demo', '1.0.0');
        self::publish('aurora-lab', '2.0.0');
        $list = self::json($this->request('GET', '/api/prompt-packages'));
        self::assertSame(['aurora-demo@1.0.0', 'aurora-lab@2.0.0'], array_map(static fn (array $p): string => $p['id'] . '@' . $p['version'], $list));
        self::assertSame(['id' => 'aurora-lab', 'version' => '2.0.0'], self::json($this->request('GET', '/api/prompt-packages/default')));

        (new SettingsRepository(self::$pdo))->set(SettingsRepository::DEFAULT_PACKAGE, ['id' => 'aurora-demo', 'version' => '1.0.0']);
        self::assertSame(['id' => 'aurora-demo', 'version' => '1.0.0'], self::json($this->request('GET', '/api/prompt-packages/default')));

        $doc = $this->request('GET', '/api/prompt-packages/aurora-lab/2.0.0');
        self::assertSame(200, $doc->getStatusCode());
        self::assertSame(['prompt-package', 'aurora-lab', '2.0.0'], [self::json($doc)['kind'], self::json($doc)['id'], self::json($doc)['version']]);
        self::assertSame(404, $this->request('GET', '/api/prompt-packages/aurora-lab/9.9.9')->getStatusCode());

        // Lecture publique : un navigateur sans session voit la même chose.
        $this->cookieSid = null;
        self::assertCount(2, self::json($this->request('GET', '/api/prompt-packages')));
    }

    #[TestDox('UC-APP-02-F15 — nominal (Service humanome) : une journée = 8 appels, un défi chacun, JSON de pôle/kairos, compteurs seuls')]
    public function testF15OneDayThroughThePlatformProxy(): void
    {
        $this->connectLearner();
        $fixture = json_decode((string) file_get_contents(\dirname(__DIR__, 4) . '/schemas/fixtures/cartographie-jour-' . self::DAY . '.json'), true);

        $challenges = [];
        for ($num = 1; $num <= 7; $num++) {
            $issued = $this->fetchChallenge();
            $challenges[] = $issued['challenge'];
            $response = $this->engineCall(self::polePrompt($num), $issued);
            self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
            $body = self::json($response);
            self::assertSame(['text', 'usage', 'model', 'stopReason'], array_keys($body));
            self::assertEquals($fixture['poles'][$num - 1], json_decode($body['text'], true), 'pôle ' . $num);
        }
        $kairos = self::json($this->engineCall("SYNTHÈSE KAIROS — journée (" . self::DAY . ")\nAtelier photo à l’Astrolabe."));
        self::assertEquals($fixture['kairos'], json_decode($kairos['text'], true));

        self::assertCount(7, array_unique($challenges));
        $usage = self::$pdo->query('SELECT requests, input_tokens, output_tokens FROM llm_usage_daily')->fetch();
        self::assertSame(8, (int) $usage['requests']);
        self::assertGreaterThan(0, (int) $usage['input_tokens']);
        self::assertSame(8, (int) self::$pdo->query('SELECT COUNT(*) FROM llm_pow_challenges')->fetchColumn());

        // RGPD §6.5 : ni prompt ni réponse conservés.
        foreach (['llm_usage_daily', 'llm_pow_challenges', 'rate_limits', 'audit_events'] as $table) {
            $dump = json_encode(self::$pdo->query('SELECT * FROM ' . $table)->fetchAll(), JSON_UNESCAPED_UNICODE);
            self::assertStringNotContainsString('Astrolabe', (string) $dump, $table);
        }
        self::assertSame([], $this->http->requests, 'mock : aucun appel sortant');
    }

    #[TestDox('UC-APP-02-F16 — E5 : preuve de travail absente → 400 ; défi réutilisé pour un 2e appel → 429 + Retry-After')]
    public function testF16ProofOfWorkIsMandatoryAndSingleUse(): void
    {
        $missing = $this->request('POST', '/api/llm', ['prompt' => self::polePrompt(1), 'website' => '']);
        self::assertSame(400, $missing->getStatusCode());
        self::assertSame('pow_required', self::json($missing)['code']);

        $issued = $this->fetchChallenge();
        self::assertSame(200, $this->engineCall(self::polePrompt(1), $issued)->getStatusCode());
        $replay = $this->engineCall(self::polePrompt(2), $issued);
        self::assertSame(429, $replay->getStatusCode());
        self::assertSame('pow_reused', self::json($replay)['code']);
        self::assertSame('1', $replay->getHeaderLine('Retry-After'));
    }

    #[TestDox('UC-APP-02-F17 — E5 : quota horaire par IP → 429 + Retry-After ; budget du jour épuisé ou démo coupée → 503')]
    public function testF17QuotaAndDailyBreaker(): void
    {
        TestDb::setEnv('DEMO_PER_IP_PER_HOUR', '3');
        for ($num = 1; $num <= 3; $num++) {
            self::assertSame(200, $this->engineCall(self::polePrompt($num))->getStatusCode());
        }
        $quota = $this->engineCall(self::polePrompt(4));
        self::assertSame(429, $quota->getStatusCode());
        self::assertSame('Quota horaire atteint, réessayez plus tard.', self::json($quota)['error']);
        self::assertGreaterThanOrEqual(30, (int) $quota->getHeaderLine('Retry-After'));

        $this->clientIp = '198.51.100.99';
        TestDb::setEnv('DEMO_DAILY_GLOBAL_TOKENS', '1');
        $exhausted = $this->engineCall(self::polePrompt(5));
        self::assertSame(503, $exhausted->getStatusCode());
        self::assertSame('Démo épuisée pour aujourd’hui, revenez demain.', self::json($exhausted)['error']);

        TestDb::setEnv('DEMO_ENABLED', '0');
        self::assertSame(503, $this->request('GET', '/api/llm/challenge')->getStatusCode());
    }

    #[TestDox('UC-APP-02-F18 — E5 : journée trop longue pour le service (maxInputChars) → 413, aucun défi consommé')]
    public function testF18OversizedDayIsRejected(): void
    {
        TestDb::setEnv('DEMO_MAX_INPUT_CHARS', '500');
        $response = $this->engineCall(self::polePrompt(1) . str_repeat(' Suite du journal.', 40));

        self::assertSame(413, $response->getStatusCode());
        self::assertSame('Texte trop long : 500 caractères maximum pour la démonstration.', self::json($response)['error']);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM llm_pow_challenges')->fetchColumn());
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM llm_usage_daily')->fetchColumn());
    }

    #[TestDox('UC-APP-02-F24 — [comportement ACTUEL, anomalie A-05] quota par défaut (20/h/IP) : un run de 3 journées (24 appels) est bloqué au 21e appel, Retry-After croissant')]
    public function testF24DefaultQuotaCannotCarryAThreeDayRun(): void
    {
        // Configuration PAR DÉFAUT (api/config/demo.php : perIpPerHour = 20) :
        // ni surcharge d'environnement, ni réglage administrateur.
        TestDb::setEnv('DEMO_PER_IP_PER_HOUR', '');
        $kairos = "SYNTHÈSE KAIROS — journée (" . self::DAY . ")\nAtelier photo à l’Astrolabe.";

        $statuses = [];
        $retryAfter = [];
        for ($day = 1; $day <= 3; $day++) {
            for ($call = 1; $call <= 8; $call++) {
                $response = $this->engineCall($call <= 7 ? self::polePrompt($call) : $kairos);
                $statuses[] = $response->getStatusCode();
                if ($response->getStatusCode() === 429) {
                    $retryAfter[] = (int) $response->getHeaderLine('Retry-After');
                }
            }
        }

        // Journées 1 et 2 complètes, 4 premiers appels de la journée 3 : 200 ;
        // à partir du 21e appel (5e pôle de la journée 3) : 429.
        self::assertSame(array_merge(array_fill(0, 20, 200), array_fill(0, 4, 429)), $statuses);
        // Chaque appel refusé compte encore : le délai double (30, 60, 120, 240 s).
        self::assertSame([30, 60, 120, 240], $retryAfter);
    }
}
