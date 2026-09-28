<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Bootstrap;
use Humanome\Db;
use Humanome\DbSessionHandler;
use Humanome\Env;
use Humanome\Llm\DemoConfig;
use Humanome\Llm\PowChallenge;
use Humanome\Tests\AdminTestCase;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\AdmSupport;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * UC-ADM-04 — Configurer la démo publique : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/administration/UC-ADM-04-configurer-demo.md
 *
 * L'administrateur règle la démo par GET/PUT/DELETE /api/admin/demo-config
 * (session + CSRF) ; l'EFFET IMMÉDIAT est vérifié du côté du visiteur, sur les
 * routes publiques réelles de la démo (GET /api/llm/status,
 * GET /api/llm/challenge, POST /api/llm, GET /api/status). Le fournisseur est
 * forcé à « mock » par l'environnement (DEMO_PROVIDER) : aucun appel réseau ;
 * la preuve de travail est résolue pour de vrai (difficulté abaissée à 8 bits
 * par l'administrateur lui-même).
 */
final class UcAdm04ConfigurerDemoTest extends AdminTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $admin;

    protected function setUp(): void
    {
        parent::setUp(); // comptes, audit, settings (demo_overrides compris)
        foreach ([
            'DEMO_ENABLED', 'DEMO_MODEL', 'DEMO_MAX_TOKENS_PER_REQUEST', 'DEMO_MAX_INPUT_CHARS',
            'DEMO_PER_IP_PER_HOUR', 'DEMO_DAILY_GLOBAL_TOKENS', 'DEMO_DAILY_BUDGET_USD',
            'DEMO_POW_DIFFICULTY_BITS', 'DEMO_UPSTREAM_TIMEOUT',
        ] as $key) {
            TestDb::setEnv($key, '');
        }
        TestDb::setEnv('DEMO_PROVIDER', 'mock');
        TestDb::setEnv('POW_SECRET', 'pow-secret-de-test-uc-adm-04');
        TestDb::setEnv('ANTHROPIC_API_KEY', '');
        self::$pdo->exec('DELETE FROM llm_usage_daily');
        self::$pdo->exec('DELETE FROM llm_pow_challenges');
        $this->admin = $this->registerAdmin('root@example.org');
    }

    private function put(array $patch): ResponseInterface
    {
        return $this->as_($this->admin, 'PUT', '/api/admin/demo-config', $patch);
    }

    /** Le visiteur : navigateur sans cookie, sa propre IP. */
    private function visitor(string $method, string $path, ?array $body = null): ResponseInterface
    {
        $this->cookieSid = null;
        $this->clientIp = '198.51.100.23';

        return $this->request($method, $path, $body);
    }

    /** Défi + preuve de travail résolue par force brute (8 bits ≈ 256 essais). */
    private function solvedPow(): array
    {
        $challenge = self::json($this->visitor('GET', '/api/llm/challenge'));
        $nonce = 0;
        while (PowChallenge::leadingZeroBits(hash('sha256', $challenge['challenge'] . ':' . $nonce)) < $challenge['difficultyBits']) {
            $nonce++;
        }

        return ['challenge' => $challenge['challenge'], 'nonce' => (string) $nonce];
    }

    private function askDemo(string $prompt): ResponseInterface
    {
        return $this->visitor('POST', '/api/llm', ['prompt' => $prompt] + $this->solvedPow());
    }

    /** Requête admin au corps BRUT (JSON invalide) : cookie + CSRF, comme un navigateur. */
    private function rawAsAdmin(string $method, string $path, string $raw): ResponseInterface
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
        $this->cookieSid = $this->admin['sid'];
        $_COOKIE[DbSessionHandler::SESSION_NAME] = $this->cookieSid;
        session_id($this->cookieSid);
        $request = (new ServerRequestFactory())
            ->createServerRequest($method, $path, ['REMOTE_ADDR' => $this->clientIp])
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('X-CSRF-Token', $this->admin['csrf']);
        $request->getBody()->write($raw);
        $response = Bootstrap::createApp()->handle($request);
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        return $response;
    }

    #[TestDox('UC-ADM-04-F01 — nominal : lecture, PUT partiel (modèle + plafond), origine « base », audit des seuls noms de champs')]
    public function testF01NominalReadThenPartialUpdate(): void
    {
        $read = $this->as_($this->admin, 'GET', '/api/admin/demo-config');
        self::assertSame(200, $read->getStatusCode());
        $before = self::json($read);
        self::assertSame('fichier', $before['sources']['model']);
        self::assertSame('env', $before['sources']['provider'], 'DEMO_PROVIDER posé par l’environnement');
        self::assertFalse($before['apiKeyConfigured']);

        $put = $this->put(['model' => 'claude-fable-5', 'maxTokensPerRequest' => 1024]);
        self::assertSame(200, $put->getStatusCode(), (string) $put->getBody());
        $after = self::json($put);
        self::assertSame('claude-fable-5', $after['effective']['model'], 'modèle libre hors liste');
        self::assertSame('base', $after['sources']['model']);
        self::assertSame(1024, $after['effective']['maxTokensPerRequest']);
        self::assertSame('fichier', $after['sources']['perIpPerHour'], 'champs non envoyés inchangés');

        self::assertEquals($after, self::json($this->as_($this->admin, 'GET', '/api/admin/demo-config')));
        $audit = self::lastAudit('demo_config_updated');
        self::assertSame($this->admin['id'], $audit['userId']);
        self::assertEquals(['fields' => ['model', 'maxTokensPerRequest']], $audit['details']);
    }

    #[TestDox('UC-ADM-04-F02 — nominal (interrupteur) : démo éteinte d’un geste → 503 immédiat (démo et tuteur) côté visiteur ; rallumée → défi servi')]
    public function testF02KillSwitchTakesEffectImmediately(): void
    {
        self::assertSame(['enabled' => true, 'remainingToday' => true], self::json($this->visitor('GET', '/api/llm/status')));

        $off = $this->put(['enabled' => false]);
        self::assertFalse(self::json($off)['effective']['enabled']);

        self::assertSame(['enabled' => false, 'remainingToday' => false], self::json($this->visitor('GET', '/api/llm/status')));
        $challenge = $this->visitor('GET', '/api/llm/challenge');
        self::assertSame(503, $challenge->getStatusCode());
        self::assertSame('La démonstration est désactivée pour le moment.', self::json($challenge)['error']);
        self::assertSame(503, $this->visitor('POST', '/api/llm', ['prompt' => 'Bonjour'])->getStatusCode());
        self::assertSame(['enabled' => false, 'remainingToday' => null], self::json($this->visitor('GET', '/api/status'))['demo']);
        // Le même interrupteur coupe l'assistant tuteur (routes/tuteur.php).
        $tuteur = $this->visitor('POST', '/api/tuteur', ['question' => 'À quoi sert humanome ?']);
        self::assertSame(503, $tuteur->getStatusCode());
        self::assertSame('L’assistant est indisponible pour le moment.', self::json($tuteur)['error']);

        $this->put(['enabled' => true]);
        self::assertSame(200, $this->visitor('GET', '/api/llm/challenge')->getStatusCode());
    }

    #[TestDox('UC-ADM-04-F03 — nominal (plafonds) : preuve de travail, taille d’entrée et quota par IP appliqués dès la requête suivante')]
    public function testF03CapsApplyToTheNextDemoRequest(): void
    {
        $this->put(['powDifficultyBits' => 8, 'maxInputChars' => 1000, 'perIpPerHour' => 1]);

        self::assertSame(8, self::json($this->visitor('GET', '/api/llm/challenge'))['difficultyBits']);

        $tooLong = $this->visitor('POST', '/api/llm', ['prompt' => str_repeat('a', 1001)]);
        self::assertSame(413, $tooLong->getStatusCode());
        self::assertSame('Texte trop long : 1000 caractères maximum pour la démonstration.', self::json($tooLong)['error']);

        $first = $this->askDemo('Première question du visiteur.');
        self::assertSame(200, $first->getStatusCode(), (string) $first->getBody());
        self::assertSame('mock', self::json($first)['model']);

        $second = $this->askDemo('Seconde question dans l’heure.');
        self::assertSame(429, $second->getStatusCode());
        self::assertSame('Quota horaire atteint, réessayez plus tard.', self::json($second)['error']);
        self::assertNotSame('', $second->getHeaderLine('Retry-After'));
    }

    #[TestDox('UC-ADM-04-F04 — A1 : budget quotidien à 0 → démo « épuisée » pour aujourd’hui (status, page de santé, 503)')]
    public function testF04ZeroBudgetExhaustsTheDemo(): void
    {
        $this->put(['powDifficultyBits' => 8, 'dailyBudgetUsd' => 0]);

        self::assertSame(['enabled' => true, 'remainingToday' => false], self::json($this->visitor('GET', '/api/llm/status')));
        self::assertFalse(self::json($this->visitor('GET', '/api/status'))['demo']['remainingToday']);
        $response = $this->askDemo('Question un jour de budget nul.');
        self::assertSame(503, $response->getStatusCode());
        self::assertSame('Démo épuisée pour aujourd’hui, revenez demain.', self::json($response)['error']);
    }

    #[TestDox('UC-ADM-04-F05 — A2 : la base gagne sur l’environnement ; « Réinitialiser » rend la main à env/fichier (audit demo_config_reset)')]
    public function testF05BaseWinsThenResetFallsBack(): void
    {
        TestDb::setEnv('DEMO_MODEL', 'claude-sonnet-5');
        self::assertSame('env', self::json($this->as_($this->admin, 'GET', '/api/admin/demo-config'))['sources']['model']);

        $this->put(['model' => 'claude-opus-4-8', 'enabled' => false]);
        self::assertSame('claude-opus-4-8', DemoConfig::load()->model);

        $reset = $this->as_($this->admin, 'DELETE', '/api/admin/demo-config');
        self::assertSame(200, $reset->getStatusCode());
        $data = self::json($reset);
        self::assertSame('claude-sonnet-5', $data['effective']['model']);
        self::assertSame('env', $data['sources']['model']);
        self::assertSame('fichier', $data['sources']['enabled']);
        self::assertTrue(self::json($this->visitor('GET', '/api/llm/status'))['enabled'], 'démo rallumée par le retour au fichier');
        self::assertSame($this->admin['id'], self::lastAudit('demo_config_reset')['userId']);
    }

    #[TestDox('UC-ADM-04-F06 — A3 : base injoignable → la démo publique reste servie sur env/fichier (jamais de 500)')]
    public function testF06DatabaseOutageFallsBackToEnvAndFile(): void
    {
        $this->put(['enabled' => false]);
        $originalHost = Env::get('DB_HOST');

        TestDb::setEnv('DB_HOST', 'mysql-injoignable.invalid');
        Db::reset();
        try {
            $status = $this->visitor('GET', '/api/llm/status');
        } finally {
            TestDb::setEnv('DB_HOST', $originalHost);
            TestDb::overrideEnv();
        }

        self::assertSame(200, $status->getStatusCode());
        self::assertSame(['enabled' => true, 'remainingToday' => false], self::json($status), 'fichier : activée ; compteurs illisibles');
        self::assertFalse(DemoConfig::load()->enabled, 'base revenue : la surcharge n’a pas été perdue');
    }

    #[TestDox('UC-ADM-04-F07 — E1/E2 : visiteur → 401, compte non admin → 403 sur GET/PUT/DELETE, aucune surcharge écrite')]
    public function testF07GuardRefusesVisitorsAndNonAdmins(): void
    {
        $maya = $this->registerAs('maya@example.org', 'Maya', ['apprenant', 'promptologue', 'etablissement']);

        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/admin/demo-config')->getStatusCode());
        self::assertSame(401, $this->request('PUT', '/api/admin/demo-config', ['enabled' => false])->getStatusCode());
        self::assertSame(403, $this->as_($maya, 'GET', '/api/admin/demo-config')->getStatusCode());
        self::assertSame(403, $this->as_($maya, 'PUT', '/api/admin/demo-config', ['enabled' => false])->getStatusCode());
        self::assertSame(403, $this->as_($maya, 'DELETE', '/api/admin/demo-config')->getStatusCode());

        self::assertTrue(DemoConfig::load()->enabled);
        self::assertSame(0, AdmSupport::countAudit(self::$pdo, 'demo_config_updated'));
    }

    #[TestDox('UC-ADM-04-F08 — E3 : valeur hors bornes, mauvais type, champ inconnu ou fournisseur → 422 avec message, rien n’est appliqué')]
    public function testF08InvalidPatchIsRejectedWithAFrenchMessage(): void
    {
        $cases = [
            'maxTokensPerRequest doit être compris entre 256 et 16000.' => ['maxTokensPerRequest' => 99999],
            'dailyBudgetUsd doit être compris entre 0 et 1000.' => ['dailyBudgetUsd' => 5000],
            'enabled doit être un booléen.' => ['enabled' => 'off'],
            'perIpPerHour doit être un entier.' => ['perIpPerHour' => '20'],
            'Champ inconnu : apiKey' => ['apiKey' => 'sk-ant-x'],
            'Le fournisseur n’est pas modifiable : la démo utilise la clé plateforme Anthropic.' => ['provider' => 'anthropic'],
            'Aucun champ à modifier.' => [],
        ];
        foreach ($cases as $message => $patch) {
            $response = $this->put($patch);
            self::assertSame(422, $response->getStatusCode(), $message);
            self::assertSame(['error' => $message], self::json($response));
        }

        self::assertNotContains('base', self::json($this->as_($this->admin, 'GET', '/api/admin/demo-config'))['sources']);
        self::assertSame(0, AdmSupport::countAudit(self::$pdo, 'demo_config_updated'));
    }

    #[TestDox('UC-ADM-04-F09 — E4 : corps qui n’est pas du JSON → 400 ; corps vide → 422')]
    public function testF09MalformedBody(): void
    {
        $garbage = $this->rawAsAdmin('PUT', '/api/admin/demo-config', 'enabled=false');
        self::assertSame(400, $garbage->getStatusCode());
        self::assertSame(['error' => 'Corps JSON invalide : objet attendu'], self::json($garbage));

        self::assertSame(422, $this->rawAsAdmin('PUT', '/api/admin/demo-config', '')->getStatusCode());
        self::assertTrue(DemoConfig::load()->enabled);
    }

    #[TestDox('UC-ADM-04-F10 — E5 : session admin sans jeton CSRF → 403 sur PUT et DELETE, configuration intacte')]
    public function testF10CsrfIsRequired(): void
    {
        $this->put(['model' => 'claude-opus-4-8']);

        $this->cookieSid = $this->admin['sid'];
        self::assertSame(403, $this->request('PUT', '/api/admin/demo-config', ['enabled' => false])->getStatusCode());
        $this->cookieSid = $this->admin['sid'];
        self::assertSame(403, $this->request('DELETE', '/api/admin/demo-config')->getStatusCode());

        self::assertTrue(DemoConfig::load()->enabled);
        self::assertSame('claude-opus-4-8', DemoConfig::load()->model);
    }
}
