<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Llm\LlmRuntime;
use Humanome\Packages\SettingsRepository;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\Twin9Config;
use Psr\Http\Message\ResponseInterface;

/**
 * « Cartographie ouverte Twin6 » CREDITS path — POST /api/twin6/appel.
 *
 * Twin6 is OPEN SOURCE: the prompt is public, so this proxy does NO server-side
 * render, injects NO confidential fiche, and runs NO LeakFilter. It calls the
 * platform key and bills the prepaid balance at the Twin6 contribution (+10 %),
 * strictly less than Twin9's +20 %. Upstream is the fake HttpClient seam.
 */
final class Twin6AppelTest extends CartographeTestCase
{
    private const PLATFORM_KEY = 'sk-ant-platform-test-key';

    private LlmFakeHttpClient $http;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $user;

    protected function setUp(): void
    {
        parent::setUp();
        TestDb::setEnv('ANTHROPIC_API_KEY', self::PLATFORM_KEY);
        Db::get()->exec("DELETE FROM settings WHERE name = 'twin9_config'");

        $this->http = new LlmFakeHttpClient();
        LlmRuntime::setHttpClient($this->http);

        $this->user = $this->registerAs('lea@example.org', 'Léa', ['apprenant']);
    }

    protected function tearDown(): void
    {
        LlmRuntime::setHttpClient(null);
        parent::tearDown();
    }

    /** @param array<string, mixed> $overrides */
    private function twin6(array $overrides = []): ResponseInterface
    {
        return $this->as_($this->user, 'POST', '/api/twin6/appel', array_merge([
            'model' => 'claude-sonnet-5',
            'prompt' => 'Analyse le pôle 1 du portfolio ci-dessous.',
            'max_tokens' => 4096,
        ], $overrides));
    }

    private function queueAnthropic(string $text, int $tokensIn = 100, int $tokensOut = 50): void
    {
        $this->http->queueResponse(['status' => 200, 'body' => json_encode([
            'id' => 'msg_test',
            'type' => 'message',
            'model' => 'claude-sonnet-5',
            'content' => [['type' => 'text', 'text' => $text]],
            'usage' => ['input_tokens' => $tokensIn, 'output_tokens' => $tokensOut],
            'stop_reason' => 'end_turn',
        ], JSON_THROW_ON_ERROR)]);
    }

    public function testRequiresSession(): void
    {
        $this->cookieSid = null;
        self::assertSame(401, $this->request('POST', '/api/twin6/appel', ['prompt' => 'x', 'model' => 'claude-sonnet-5'])->getStatusCode());
        self::assertSame([], $this->http->requests);
    }

    public function testUnconfiguredKeyAnswers503(): void
    {
        TestDb::setEnv('ANTHROPIC_API_KEY', '');
        self::assertSame(503, $this->twin6()->getStatusCode());
        self::assertSame([], $this->http->requests);
    }

    public function testValidationErrors(): void
    {
        self::assertSame(422, $this->twin6(['model' => 'modele-fantome'])->getStatusCode());
        self::assertSame(422, $this->twin6(['prompt' => '   '])->getStatusCode());
        self::assertSame(422, $this->twin6(['max_tokens' => 'beaucoup'])->getStatusCode());
        self::assertSame([], $this->http->requests, 'no upstream call on a rejected request');
    }

    public function testInsufficientBalanceAnswers402(): void
    {
        $response = $this->twin6();
        self::assertSame(402, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(0, self::json($response)['solde_microusd']);
        self::assertSame([], $this->http->requests, 'no upstream call without funds');
    }

    public function testBillsAtTwin6MarginNotTwin9(): void
    {
        (new CreditService(Db::get()))->topup($this->user['id'], 5_000_000, 'PAYPAL-T6');
        // A public output — quoting a "template-like" phrase is NOT redacted
        // (Twin6 has no secret; no LeakFilter on this path).
        $this->queueAnthropic('Cartographie ouverte : le perroquet bleu compte les nuages violets au-dessus du volcan.', 1000, 200);

        $response = $this->twin6(['prompt' => 'Analyse le pôle 1.']);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);

        // Engine proxy-provider contract {text, usage, model, stopReason}.
        self::assertSame('Cartographie ouverte : le perroquet bleu compte les nuages violets au-dessus du volcan.', $body['text']);
        self::assertSame(['inputTokens' => 1000, 'outputTokens' => 200], $body['usage']);
        self::assertSame('claude-sonnet-5', $body['model']);
        self::assertSame('end_turn', $body['stopReason']);

        // Billed at the TWIN6 contribution (+10 %), strictly less than Twin9 (+20 %).
        $config = new Twin9Config(new SettingsRepository(Db::get()));
        $coutTwin6 = (int) $config->coutMicrousd('claude-sonnet-5', 1000, 200, 'twin6');
        $coutTwin9 = (int) $config->coutMicrousd('claude-sonnet-5', 1000, 200, 'twin9');
        self::assertSame($coutTwin6, $body['cout_microusd']);
        self::assertLessThan($coutTwin9, $coutTwin6, 'Twin6 +10 % must be cheaper than Twin9 +20 %');

        // Net charge = real cost (worst-case reserve reconciled).
        self::assertSame(5_000_000 - $coutTwin6, (new CreditService(Db::get()))->balance($this->user['id']));
    }
}
