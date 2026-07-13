<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Keys\KeyVault;
use Humanome\Llm\LlmRuntime;
use Humanome\Packages\SettingsRepository;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\ProtocoleRepository;
use Humanome\Twin9\Twin9Config;
use Psr\Http\Message\ResponseInterface;

/**
 * T3b (ADR-010 §1/§2/§3/§4) — POST /api/twin9/appel: the proxied LLM call
 * (server-side rendering of the confidential templates, locked upstream,
 * leak filter, real-cost debit or private key) and GET /api/twin9/meta.
 *
 * SECRECY IMPERATIVE (ADR-010): every template here is a MADE-UP fixture —
 * no real Twin_v9 content in tests, ever. The upstream is the fake
 * HttpClient (LlmRuntime seam): no network call happens in the suite.
 */
final class Twin9AppelTest extends CartographeTestCase
{
    private const PLATFORM_KEY = 'sk-ant-platform-test-key';
    private const MASTER_KEY_HEX = 'aa11bb22cc33dd44ee55ff6600112233445566778899aabbccddeeff00112233';

    /** Entirely fictional template with a distinctive >= 12-word phrase. */
    private const FAKE_GABARIT = "Consigne FICTIVE : le perroquet bleu compte les nuages violets au-dessus du volcan endormi chaque matin.\nAnalyse {\$TEXTE_JOURNEE} pour {\$PRENOM}.";

    /** 13-word user payload — legitimate to quote, must NOT be redacted. */
    private const PAYLOAD_13_MOTS = 'hier j’ai réparé la grande horloge du village avec mes deux mains nues';

    private LlmFakeHttpClient $http;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $user;

    protected function setUp(): void
    {
        parent::setUp(); // wipes users (credits cascade) and rate_limits
        $pdo = Db::get();
        $pdo->exec('DELETE FROM twin9_protocole_versions');
        $pdo->exec('DELETE FROM twin9_protocole');
        $pdo->exec("DELETE FROM settings WHERE name = 'twin9_config'");

        TestDb::setEnv('ANTHROPIC_API_KEY', self::PLATFORM_KEY);
        TestDb::setEnv('SODIUM_MASTER_KEY', self::MASTER_KEY_HEX);
        TestDb::setEnv('PAYPAL_CLIENT_ID', '');

        $this->http = new LlmFakeHttpClient();
        LlmRuntime::setHttpClient($this->http);

        (new ProtocoleRepository($pdo))->put('fictif/01-essai', self::FAKE_GABARIT, null);
        (new Twin9Config(new SettingsRepository($pdo)))->update(['enabled' => true]);

        $this->user = $this->registerAs('ada@example.org', 'Ada', ['apprenant']);
    }

    protected function tearDown(): void
    {
        LlmRuntime::setHttpClient(null);
        parent::tearDown();
    }

    /** @param array<string, mixed> $overrides */
    private function appel(array $overrides = []): ResponseInterface
    {
        return $this->as_($this->user, 'POST', '/api/twin9/appel', array_merge([
            'etape' => 'fictif/01-essai',
            'variables' => ['TEXTE_JOURNEE' => 'Journal du jour.', 'PRENOM' => 'Ada'],
            'modele' => 'claude-sonnet-5',
            'etage' => 'rapide',
            'facturation' => 'platform',
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

    // ==================================================================
    // Guards: session, enabled switch, validation
    // ==================================================================

    public function testRequiresSession(): void
    {
        $this->cookieSid = null;
        $response = $this->request('POST', '/api/twin9/appel', ['etape' => 'fictif/01-essai']);
        self::assertSame(401, $response->getStatusCode());
        self::assertSame(401, $this->request('GET', '/api/twin9/meta')->getStatusCode());
    }

    public function testDisabledAnswers503(): void
    {
        (new Twin9Config(new SettingsRepository(Db::get())))->setEnabled(false);
        $response = $this->appel();
        self::assertSame(503, $response->getStatusCode());
        self::assertSame('Twin_v9 non disponible', self::json($response)['error']);
        self::assertSame([], $this->http->requests, 'no upstream call');
    }

    public function testUnknownTemplateIs404Generic(): void
    {
        $response = $this->appel(['etape' => 'fictif/inconnu']);
        self::assertSame(404, $response->getStatusCode());
        self::assertStringNotContainsString('perroquet', (string) $response->getBody());
    }

    public function testUnresolvedVariablesAnswer422WithNamesOnly(): void
    {
        $response = $this->appel(['variables' => ['PRENOM' => 'Ada']]);
        self::assertSame(422, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame(['TEXTE_JOURNEE'], $body['variables'], 'names only');
        // No fragment of the confidential template in the refusal.
        self::assertStringNotContainsString('perroquet', (string) $response->getBody());
        self::assertSame([], $this->http->requests, 'refused before any upstream call');
    }

    public function testValidationErrors(): void
    {
        self::assertSame(422, $this->appel(['etage' => 'penthouse'])->getStatusCode());
        // claude-opus-4-8 is offered for 'tribunal' only (defaults).
        self::assertSame(422, $this->appel(['modele' => 'claude-opus-4-8', 'etage' => 'rapide'])->getStatusCode());
        self::assertSame(422, $this->appel(['modele' => 'modele-fantome'])->getStatusCode());
        self::assertSame(422, $this->appel(['facturation' => 'gratuit'])->getStatusCode());
        self::assertSame(422, $this->appel(['max_tokens' => 'beaucoup'])->getStatusCode());
        self::assertSame(422, $this->appel(['variables' => ['PRENOM' => 'Ada', 'TEXTE_JOURNEE' => 42]])->getStatusCode());
        self::assertSame([], $this->http->requests);
    }

    public function testPayloadTooLargeAnswers413(): void
    {
        $response = $this->appel(['variables' => [
            'PRENOM' => 'Ada',
            'TEXTE_JOURNEE' => str_repeat('a', 310 * 1024),
        ]]);
        self::assertSame(413, $response->getStatusCode());
        self::assertSame([], $this->http->requests);
    }

    // ==================================================================
    // Platform billing: 402 pre-check, real-cost debit
    // ==================================================================

    public function testInsufficientBalanceAnswers402BeforeAnyCall(): void
    {
        $response = $this->appel(); // no top-up: balance 0
        self::assertSame(402, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame(0, $body['solde_microusd']);
        self::assertGreaterThan(0, $body['requis_estime_microusd']);
        self::assertSame([], $this->http->requests, 'the upstream is NEVER called unfunded');
    }

    public function testWorstCaseReserveGatesEvenWhenRealCostWouldFit(): void
    {
        // Fund LESS than the worst-case reservation (max_tokens output) but MORE
        // than a call's likely real cost. The atomic reserve must still refuse
        // (security finding A: no read-then-compare gap, no overdraft) — the
        // upstream is never called, the tiny balance is untouched.
        (new CreditService(Db::get()))->topup($this->user['id'], 12_000, 'PAYPAL-RESERVE-GATE');
        $response = $this->appel(); // default max_tokens 4096 → reserve ≫ 12_000
        self::assertSame(402, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame(12_000, $body['solde_microusd']);
        self::assertGreaterThan(12_000, $body['requis_estime_microusd']);
        self::assertSame([], $this->http->requests);
        self::assertSame(12_000, (new CreditService(Db::get()))->balance($this->user['id']), 'balance untouched');
    }

    public function testPlatformCallDebitsRealTokenCost(): void
    {
        (new CreditService(Db::get()))->topup($this->user['id'], 5_000_000, 'PAYPAL-TEST-1');
        $this->queueAnthropic('Réponse fictive du modèle.', 1000, 200);

        $response = $this->appel(['max_tokens' => 50]); // below floor: clamped to 256
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);

        // Real cost: ceil(1000×3×1.1) + ceil(200×15×1.1) micro-USD (defaults:
        // claude-sonnet-5 list [3, 15] USD/Mtok, margin 1.1 — owner decision:
        // +10 % covers PayPal fees + hosting/domain/free-demo Haiku). Float
        // math makes each side 3300.0000000000005 → ceil 3301. No `fuites`
        // field is ever returned to the client (finding B — tuning oracle).
        self::assertSame('Réponse fictive du modèle.', $body['sortie']);
        self::assertSame(1000, $body['tokens_in']);
        self::assertSame(200, $body['tokens_out']);
        self::assertSame(6602, $body['cout_microusd']);
        self::assertArrayNotHasKey('fuites', $body, 'the leak count is never exposed');
        self::assertSame('end_turn', $body['stop_reason']);

        // Billing flow (security finding A): a WORST-CASE reserve is debited
        // atomically BEFORE the call, then reconciled to the real cost after.
        // Whatever the reserve, the NET charge is exactly the real cost.
        $credits = new CreditService(Db::get());
        self::assertSame(4_993_398, $credits->balance($this->user['id']));
        $events = $credits->events($this->user['id']); // most recent first
        // The reserve debit is present, tagged, and never lost.
        $reserve = array_values(array_filter(
            $events,
            static fn (array $e): bool => str_contains($e['label'], 'réserve'),
        ));
        self::assertCount(1, $reserve);
        self::assertSame('debit', $reserve[0]['kind']);
        self::assertLessThan(0, $reserve[0]['amount_microusd']);
        // The reconciliation carries the REAL token counts and model.
        $recon = array_values(array_filter(
            $events,
            static fn (array $e): bool => str_contains($e['label'], 'réconciliation'),
        ));
        self::assertCount(1, $recon);
        self::assertSame('claude-sonnet-5', $recon[0]['model']);
        self::assertSame([1000, 200], [$recon[0]['tokens_in'], $recon[0]['tokens_out']]);

        // Upstream request: LOCKED base URL, platform key, rendered template.
        self::assertCount(1, $this->http->requests);
        $upstream = $this->http->requests[0];
        self::assertSame('https://api.anthropic.com/v1/messages', $upstream['url']);
        self::assertSame(self::PLATFORM_KEY, $upstream['headers']['x-api-key']);
        $payload = json_decode((string) $upstream['body'], true);
        self::assertSame('claude-sonnet-5', $payload['model']);
        self::assertSame(256, $payload['max_tokens'], 'bounded 256..16000');
        self::assertStringContainsString('Journal du jour.', $payload['messages'][0]['content']);
        self::assertStringContainsString('perroquet bleu', $payload['messages'][0]['content'], 'template rendered SERVER-side');
    }

    public function testUpstreamErrorIsGenericAndNotDebited(): void
    {
        (new CreditService(Db::get()))->topup($this->user['id'], 1_000_000, 'PAYPAL-TEST-2');

        $this->http->queueResponse(['status' => 500, 'body' => '{"error":{"message":"boom interne amont"}}']);
        $response = $this->appel();
        self::assertSame(502, $response->getStatusCode());
        self::assertStringNotContainsString('boom', (string) $response->getBody(), 'generic message only');
        self::assertSame(1_000_000, (new CreditService(Db::get()))->balance($this->user['id']), 'failed call is not debited');

        $this->http->queueResponse(['status' => 429, 'body' => '{}']);
        self::assertSame(429, $this->appel()->getStatusCode());
    }

    // ==================================================================
    // Private key (ADR-010 §4): same path, zero debit
    // ==================================================================

    public function testClePriveeUsesUserKeyAndNeverDebits(): void
    {
        // No stored key: explicit 409, no upstream call.
        $response = $this->appel(['facturation' => 'cle_privee']);
        self::assertSame(409, $response->getStatusCode());
        self::assertSame([], $this->http->requests);

        $masterKey = KeyVault::masterKeyFromEnv();
        self::assertNotNull($masterKey);
        (new KeyVault(Db::get(), $masterKey))->store($this->user['id'], 'anthropic', 'sk-ant-user-private-key');

        $this->queueAnthropic('Réponse via clé privée.', 500, 100);
        $response = $this->appel(['facturation' => 'cle_privee']);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);
        self::assertSame(0, $body['cout_microusd'], 'no debit on a private key');
        self::assertSame('Réponse via clé privée.', $body['sortie']);

        $credits = new CreditService(Db::get());
        self::assertSame(0, $credits->balance($this->user['id']));
        self::assertSame([], $credits->events($this->user['id']), 'no ledger event either');

        // SAME locked path, the USER's key in the header.
        self::assertSame('https://api.anthropic.com/v1/messages', $this->http->requests[0]['url']);
        self::assertSame('sk-ant-user-private-key', $this->http->requests[0]['headers']['x-api-key']);
    }

    // ==================================================================
    // Leak filter (ADR-010 §2)
    // ==================================================================

    public function testLeakFilterRedactsTemplateButNotUserPayload(): void
    {
        (new CreditService(Db::get()))->topup($this->user['id'], 5_000_000, 'PAYPAL-TEST-3');

        // The model recites the template's distinctive phrase AND legitimately
        // quotes the user's own 13-word payload.
        $this->queueAnthropic(
            'Voici la consigne : le perroquet bleu compte les nuages violets '
            . "au-dessus du volcan endormi chaque matin.\nCitation du journal : "
            . self::PAYLOAD_13_MOTS . ' — fin.',
            800,
            120,
        );

        $response = $this->appel(['variables' => [
            'PRENOM' => 'Ada',
            'TEXTE_JOURNEE' => self::PAYLOAD_13_MOTS,
        ]]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);

        // The client gets the already-redacted output and NOTHING about what
        // was redacted (security finding B — no `fuites` oracle).
        self::assertArrayNotHasKey('fuites', $body);
        self::assertStringContainsString('[expurgé]', $body['sortie']);
        self::assertStringNotContainsString('perroquet', $body['sortie'], 'template prose is gone');
        self::assertStringContainsString(self::PAYLOAD_13_MOTS, $body['sortie'], 'the USER payload quote survives');

        // The leak IS recorded — server-side audit, counters only, never the text.
        $audit = self::lastAudit('twin9_fuite_expurgee');
        self::assertNotNull($audit);
        self::assertSame($this->user['id'], $audit['userId']);
        self::assertSame(['etape' => 'fictif/01-essai', 'fuites' => 1], $audit['details']);
    }

    // ==================================================================
    // Rate limit
    // ==================================================================

    public function testRateLimitAnswers429(): void
    {
        (new Twin9Config(new SettingsRepository(Db::get())))->update(['appels_par_minute' => 1]);
        (new CreditService(Db::get()))->topup($this->user['id'], 5_000_000, 'PAYPAL-TEST-4');

        $this->queueAnthropic('Première réponse.');
        self::assertSame(200, $this->appel()->getStatusCode());

        $response = $this->appel();
        self::assertSame(429, $response->getStatusCode());
        self::assertNotSame('', $response->getHeaderLine('Retry-After'));
        self::assertCount(1, $this->http->requests, 'second call never reached upstream');
    }

    // ==================================================================
    // GET /api/twin9/meta — the WHOLE client-visible surface
    // ==================================================================

    public function testMetaExposesOfferAndBalanceButNeverContent(): void
    {
        (new CreditService(Db::get()))->topup($this->user['id'], 2_500_000, 'PAYPAL-TEST-5');

        $response = $this->as_($this->user, 'GET', '/api/twin9/meta');
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);

        self::assertTrue($body['enabled']);
        self::assertSame([[
            'name' => 'fictif/01-essai',
            'longueur_gabarit' => mb_strlen(self::FAKE_GABARIT),
            'variables' => ['TEXTE_JOURNEE', 'PRENOM'],
        ]], $body['etapes']);
        // Margined prices only (list [3, 15] × 1.1), margin itself absent.
        self::assertSame([3.3, 16.5], $body['modeles']['claude-sonnet-5']['prix_usd_mtok']);
        self::assertArrayNotHasKey('marge', $body);
        self::assertSame([10, 20, 50], array_column($body['packs'], 'montant_usd'));
        self::assertFalse($body['paypalConfigured']);
        self::assertSame(2_500_000, $body['solde_microusd']);
        self::assertFalse($body['cle_privee_disponible']);

        // THE secrecy assertion: nothing of the template content leaves.
        self::assertStringNotContainsString('perroquet', (string) $response->getBody());

        $masterKey = KeyVault::masterKeyFromEnv();
        self::assertNotNull($masterKey);
        (new KeyVault(Db::get(), $masterKey))->store($this->user['id'], 'anthropic', 'sk-ant-user-private-key');
        self::assertTrue(self::json($this->as_($this->user, 'GET', '/api/twin9/meta'))['cle_privee_disponible']);
    }
}
