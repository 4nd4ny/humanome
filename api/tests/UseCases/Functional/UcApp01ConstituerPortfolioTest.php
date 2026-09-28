<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Llm\HttpClientException;
use Humanome\Tests\LlmTestCase;
use Humanome\Tests\TestDb;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-APP-01 — Constituer son portfolio local : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-01-constituer-portfolio.md
 *
 * Seul l'alternatif A2 (import d'un Google Docs public) touche le serveur :
 * le navigateur appelle GET /api/gdoc-text?docId=…, l'API relaie l'export
 * texte de docs.google.com (client HTTP factice — aucun appel réseau réel)
 * sans rien conserver. Les tests rejouent ce relais par l'API HTTP réelle
 * (Slim en processus, vraie base MySQL), plus la règle RG1 côté serveur :
 * aucune route ne reçoit ni ne stocke un portfolio.
 */
final class UcApp01ConstituerPortfolioTest extends LlmTestCase
{
    private const DOC_ID = '1AbC-dEfGhIjKlMnOpQrStUvWxYz0123456789abcd';
    private const EXPORT = "\u{FEFF}Lundi 5 janvier 2026\r\nAtelier photo à l’Astrolabe.\r\n\r\nMardi 6 janvier 2026\r\nVernissage.";

    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM audit_events');
    }

    private function importGdoc(string $docId = self::DOC_ID): ResponseInterface
    {
        return $this->request('GET', '/api/gdoc-text?docId=' . rawurlencode($docId));
    }

    /** Toutes les tables applicatives où un contenu aurait pu atterrir. */
    private static function contentFootprint(): string
    {
        $dump = '';
        foreach (['audit_events', 'rate_limits', 'llm_usage_daily', 'sessions', 'settings'] as $table) {
            $rows = self::$pdo->query('SELECT * FROM ' . $table)->fetchAll();
            $dump .= json_encode($rows, JSON_UNESCAPED_UNICODE);
        }

        return $dump;
    }

    #[TestDox('UC-APP-01-F18 — A2 nominal : texte brut relayé, no-store, rien de conservé ni journalisé')]
    public function testF18PublicDocumentIsRelayedWithoutAnyTrace(): void
    {
        $this->http->queueResponse(['status' => 200, 'body' => self::EXPORT]);

        $response = $this->importGdoc();

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('text/plain; charset=utf-8', $response->getHeaderLine('Content-Type'));
        self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
        self::assertSame(self::EXPORT, (string) $response->getBody(), 'relayé à l’octet près (BOM, CRLF)');

        self::assertCount(1, $this->http->requests);
        $upstream = $this->http->requests[0];
        self::assertSame('GET', $upstream['method']);
        self::assertSame('https://docs.google.com/document/d/' . self::DOC_ID . '/export?format=txt', $upstream['url']);
        self::assertSame(15, $upstream['timeout']);
        self::assertSame(1048576, $upstream['maxBytes']);

        // RGPD : ni le texte, ni l'identifiant du document, ni l'IP.
        $footprint = self::contentFootprint();
        self::assertStringNotContainsString('Astrolabe', $footprint);
        self::assertStringNotContainsString(self::DOC_ID, $footprint);
        self::assertStringNotContainsString($this->clientIp, $footprint);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM audit_events')->fetchColumn());
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM llm_usage_daily')->fetchColumn());
        self::assertSame(1, (int) self::$pdo->query("SELECT counter FROM rate_limits WHERE bucket LIKE 'llm:%'")->fetchColumn());
    }

    #[TestDox('UC-APP-01-F19 — A2 : apprenant connecté, démo publique désactivée : le relais reste disponible')]
    public function testF19ConnectedLearnerEvenWithDemoDisabled(): void
    {
        self::assertSame(200, $this->register('maya@example.org', self::PASSWORD, 'Maya')->getStatusCode());
        self::assertNotNull($this->cookieSid, 'session apprenant ouverte');
        TestDb::setEnv('DEMO_ENABLED', '0');
        $this->http->queueResponse(['status' => 200, 'body' => self::EXPORT]);

        $response = $this->importGdoc();

        self::assertSame(200, $response->getStatusCode(), 'non soumis à l’interrupteur de la démo');
        self::assertSame(self::EXPORT, (string) $response->getBody());
        self::assertSame(503, $this->request('GET', '/api/llm/challenge')->getStatusCode(), 'la démo, elle, est coupée');
    }

    #[TestDox('UC-APP-01-F20 — A2 : jusqu’à 3 redirections https vers *.googleusercontent.com sont suivies')]
    public function testF20ThreeGoogleRedirectsAreFollowed(): void
    {
        for ($i = 1; $i <= 3; $i++) {
            $this->http->queueResponse([
                'status' => [301, 302, 307][$i - 1],
                'headers' => ['location' => 'https://doc-' . $i . '-export.googleusercontent.com/t/' . $i],
            ]);
        }
        $this->http->queueResponse(['status' => 200, 'body' => self::EXPORT]);

        $response = $this->importGdoc();

        self::assertSame(200, $response->getStatusCode());
        self::assertCount(4, $this->http->requests);
        self::assertSame('https://doc-3-export.googleusercontent.com/t/3', $this->http->requests[3]['url']);
    }

    #[TestDox('UC-APP-01-F21 — E : identifiant invalide → 422 sans aucun appel à Google')]
    public function testF21InvalidDocIdIs422(): void
    {
        foreach (['', 'trop-court', str_repeat('x', 81), 'id/avec/slash_00000000000'] as $docId) {
            $response = $this->importGdoc($docId);
            self::assertSame(422, $response->getStatusCode(), 'docId « ' . $docId . ' »');
            self::assertSame('Identifiant de document Google Docs invalide.', self::json($response)['error']);
        }
        self::assertSame([], $this->http->requests);
    }

    #[TestDox('UC-APP-01-F22 — E3 : document privé (401/403 Google) → 403 ; introuvable → 404 ; autre statut → 502')]
    public function testF22GoogleRefusalsAreMappedToFrenchMessages(): void
    {
        foreach ([401 => 403, 403 => 403, 404 => 404, 500 => 502, 429 => 502] as $google => $expected) {
            $this->http->queueResponse(['status' => $google, 'body' => '<html>…</html>']);
            $response = $this->importGdoc();
            self::assertSame($expected, $response->getStatusCode(), 'Google ' . $google);
            self::assertSame('application/json', $response->getHeaderLine('Content-Type'));
        }
        $this->http->queueResponse(['status' => 401]);
        self::assertStringContainsString('Tous les utilisateurs disposant du lien', self::json($this->importGdoc())['error']);
        $this->http->queueResponse(['status' => 500]);
        self::assertSame('Google Docs a renvoyé une erreur, réessayez plus tard.', self::json($this->importGdoc())['error']);
    }

    #[TestDox('UC-APP-01-F23 — E3 : trop volumineux → 413 ; Google injoignable → 504 ; redirection hors Google → 502')]
    public function testF23TransportFailures(): void
    {
        $this->http->queueResponse(['status' => 200, 'overflow' => true]);
        $tooBig = $this->importGdoc();
        self::assertSame(413, $tooBig->getStatusCode());
        self::assertSame('Document trop volumineux : 1 Mo de texte maximum.', self::json($tooBig)['error']);

        $this->http->queueException(new HttpClientException('timeout', true));
        self::assertSame(504, $this->importGdoc()->getStatusCode());

        $this->http->queueResponse(['status' => 302, 'headers' => ['location' => 'https://169.254.169.254/latest/meta-data']]);
        $refused = $this->importGdoc();
        self::assertSame(502, $refused->getStatusCode());
        self::assertSame('Redirection refusée (hôte non autorisé).', self::json($refused)['error']);
        self::assertCount(3, $this->http->requests, 'l’hôte interdit n’a jamais été contacté');
    }

    #[TestDox('UC-APP-01-F24 — E4 : quota horaire par IP dépassé → 429 + Retry-After ; une autre IP passe')]
    public function testF24HourlyQuotaPerIp(): void
    {
        TestDb::setEnv('DEMO_PER_IP_PER_HOUR', '2');
        $this->clientIp = '198.51.100.20';
        for ($i = 0; $i < 2; $i++) {
            $this->http->queueResponse(['status' => 200, 'body' => 'ok']);
            self::assertSame(200, $this->importGdoc()->getStatusCode());
        }

        $blocked = $this->importGdoc();
        self::assertSame(429, $blocked->getStatusCode());
        self::assertSame('30', $blocked->getHeaderLine('Retry-After'));
        self::assertSame('Quota horaire atteint, réessayez plus tard.', self::json($blocked)['error']);
        self::assertCount(2, $this->http->requests, 'aucun appel à Google une fois le quota atteint');

        $this->clientIp = '198.51.100.21';
        $this->http->queueResponse(['status' => 200, 'body' => 'ok']);
        self::assertSame(200, $this->importGdoc()->getStatusCode());
    }

    #[TestDox('UC-APP-01-F25 — RG1 : aucune route serveur ne reçoit ni ne stocke un portfolio')]
    public function testF25NoServerRouteAcceptsAPortfolio(): void
    {
        $registered = self::json($this->register('maya@example.org', self::PASSWORD, 'Maya'));
        $csrf = ['X-CSRF-Token' => (string) $registered['csrfToken']];
        $portfolio = ['titre' => 'Journal', 'texte' => 'Atelier à l’Astrolabe', 'segments' => []];

        // Slim journalise chaque 404 via error_log : silence local à ce test.
        $previousLog = ini_set('error_log', '/dev/null');
        try {
            foreach (['/api/portfolios', '/api/portfolio', '/api/account/portfolios'] as $path) {
                self::assertSame(404, $this->request('POST', $path, $portfolio, $csrf)->getStatusCode(), 'POST ' . $path);
                self::assertSame(404, $this->request('GET', $path)->getStatusCode(), 'GET ' . $path);
            }
        } finally {
            ini_set('error_log', $previousLog === false ? '' : $previousLog);
        }
        self::assertStringNotContainsString('Astrolabe', self::contentFootprint());
    }
}
