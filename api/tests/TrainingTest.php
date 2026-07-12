<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * P8 — training progress (cahier §4.6): per-account chapter completion,
 * grouped by parcours, idempotent PUT both ways, own progression only.
 */
final class TrainingTest extends AuthTestBase
{
    private string $csrf = '';

    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('DELETE FROM users');

        $response = $this->register('maya@example.org', self::PASSWORD, 'Maya');
        $this->csrf = (string) self::json($response)['csrfToken'];
    }

    private function put(array $body): \Psr\Http\Message\ResponseInterface
    {
        return $this->request('PUT', '/api/training/progress', $body, ['X-CSRF-Token' => $this->csrf]);
    }

    public function testRequiresAuthentication(): void
    {
        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/training/progress')->getStatusCode());
        self::assertSame(401, $this->request('PUT', '/api/training/progress', [
            'parcours' => 'apprenant', 'chapitre' => '01-intro', 'completed' => true,
        ])->getStatusCode());
    }

    public function testEmptyProgressionIsAnEmptyObject(): void
    {
        $response = $this->request('GET', '/api/training/progress');
        self::assertSame(200, $response->getStatusCode());
        self::assertSame('{}', trim((string) $response->getBody()));
    }

    public function testPutThenGetGroupsByParcours(): void
    {
        $response = $this->put(['parcours' => 'apprenant', 'chapitre' => '01-bien-rediger', 'completed' => true]);
        self::assertSame(200, $response->getStatusCode());
        $this->put(['parcours' => 'apprenant', 'chapitre' => '02-traces', 'completed' => true]);
        $this->put(['parcours' => 'cartographe', 'chapitre' => '01-verdicts', 'completed' => true]);

        $progress = self::json($this->request('GET', '/api/training/progress'));
        self::assertSame(['01-bien-rediger', '02-traces'], $progress['apprenant']['chapitresTermines']);
        self::assertSame(['01-verdicts'], $progress['cartographe']['chapitresTermines']);
    }

    public function testCompletedFalseRemovesTheChapter(): void
    {
        $this->put(['parcours' => 'apprenant', 'chapitre' => '01-bien-rediger', 'completed' => true]);
        // Idempotent re-completion.
        $again = $this->put(['parcours' => 'apprenant', 'chapitre' => '01-bien-rediger', 'completed' => true]);
        self::assertSame(200, $again->getStatusCode());

        $response = $this->put(['parcours' => 'apprenant', 'chapitre' => '01-bien-rediger', 'completed' => false]);
        self::assertSame(200, $response->getStatusCode());
        self::assertSame('{}', trim((string) $response->getBody()));

        // Un-completing an absent chapter stays a 200 no-op.
        $noop = $this->put(['parcours' => 'apprenant', 'chapitre' => '01-bien-rediger', 'completed' => false]);
        self::assertSame(200, $noop->getStatusCode());
    }

    public function testValidatesIdentifiersAndTypes(): void
    {
        $bad = [
            ['parcours' => 'Apprenant!', 'chapitre' => '01-a', 'completed' => true],
            ['parcours' => '', 'chapitre' => '01-a', 'completed' => true],
            ['parcours' => 'apprenant', 'chapitre' => 'chap/../../etc', 'completed' => true],
            ['parcours' => 'apprenant', 'chapitre' => str_repeat('a', 65), 'completed' => true],
            ['parcours' => 'apprenant', 'chapitre' => '01-a', 'completed' => 'yes'],
        ];
        foreach ($bad as $i => $body) {
            self::assertSame(422, $this->put($body)->getStatusCode(), 'case #' . $i);
        }
    }

    public function testProgressionIsPerAccount(): void
    {
        $this->put(['parcours' => 'apprenant', 'chapitre' => '01-bien-rediger', 'completed' => true]);

        $this->cookieSid = null;
        $this->register('other@example.org', self::PASSWORD, 'Other');
        $other = self::json($this->request('GET', '/api/training/progress'));
        self::assertSame([], (array) $other, 'progression must not leak between accounts');
    }

    public function testPutRequiresCsrf(): void
    {
        $response = $this->request('PUT', '/api/training/progress', [
            'parcours' => 'apprenant', 'chapitre' => '01-a', 'completed' => true,
        ]); // no X-CSRF-Token header
        self::assertSame(403, $response->getStatusCode());
    }
}
