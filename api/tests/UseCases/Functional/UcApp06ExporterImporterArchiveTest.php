<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Bootstrap;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Tests\CartographeTestCase;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-APP-06 — Exporter et importer son archive complète : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-06-exporter-importer-archive.md
 *
 * L'archive ne transite jamais par le serveur (client-first, ADR-001/006) :
 * le navigateur n'y fait que des LECTURES pour la compléter — identité du
 * compte (GET /api/auth/me), paquet de prompts (GET /api/prompt-packages puis
 * /{id}/{version}), documents produits en cohorte (GET /api/mes-documents-masse).
 * Ces lectures sont rejouées ici, telles que archive.js les enchaîne, par
 * l'API HTTP réelle ; plus l'absence de toute route d'export/import serveur.
 */
final class UcApp06ExporterImporterArchiveTest extends CartographeTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('DELETE FROM prompt_packages');
    }

    private static function publish(string $id, string $version, bool $private = false): void
    {
        $path = \dirname(__DIR__, 4) . '/schemas/fixtures/prompt-package-exemple.json';
        $doc = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        (new PromptPackageRepository(self::$pdo))->importPublishedDocument(array_merge($doc, ['id' => $id, 'version' => $version]));
        if ($private) {
            self::$pdo->prepare('UPDATE prompt_packages SET is_private = 1 WHERE slug = ?')->execute([$id]);
        }
    }

    #[TestDox('UC-APP-06-F12 — nominal (export) : les lectures de l’archive — compte sans secret, paquet complet, documents de masse')]
    public function testF12ExportLookupsForAConnectedLearner(): void
    {
        self::publish('aurora-v3-reconstruit', '1.0.0');
        $maya = $this->registerAs('maya@example.org', 'Maya');

        // 1. Identité du compte (bloc « account »).
        $me = $this->as_($maya, 'GET', '/api/auth/me');
        self::assertSame(200, $me->getStatusCode());
        $user = self::json($me)['user'];
        self::assertSame(['maya@example.org', 'Maya', ['apprenant']], [$user['email'], $user['displayName'], $user['roles']]);
        $raw = strtolower((string) $me->getBody());
        foreach (['password', 'argon', 'apikey', 'api_key'] as $secret) {
            self::assertStringNotContainsString($secret, $raw, 'aucun secret exportable');
        }

        // 2. Paquet de prompts : liste publique, puis document complet du premier.
        $list = self::json($this->as_($maya, 'GET', '/api/prompt-packages'));
        self::assertSame('aurora-v3-reconstruit', $list[0]['id']);
        $doc = $this->as_($maya, 'GET', '/api/prompt-packages/' . rawurlencode($list[0]['id']) . '/' . rawurlencode($list[0]['version']));
        self::assertSame(200, $doc->getStatusCode());
        self::assertSame('prompt-package', self::json($doc)['kind']);

        // 3. Documents produits en cohorte : aucun pour un apprenant hors cohorte.
        $mass = $this->as_($maya, 'GET', '/api/mes-documents-masse');
        self::assertSame(200, $mass->getStatusCode());
        self::assertSame(['documents' => []], self::json($mass));
    }

    #[TestDox('UC-APP-06-F13 — A1 : navigateur sans session : compte et masse en 401 (archive anonyme), paquets lisibles')]
    public function testF13AnonymousLookupsDegradeGracefully(): void
    {
        self::publish('aurora-v3-reconstruit', '1.0.0');
        $this->cookieSid = null;

        self::assertSame(401, $this->request('GET', '/api/auth/me')->getStatusCode());
        self::assertSame(401, $this->request('GET', '/api/mes-documents-masse')->getStatusCode());
        self::assertSame(200, $this->request('GET', '/api/prompt-packages')->getStatusCode());
        self::assertSame(200, $this->request('GET', '/api/prompt-packages/aurora-v3-reconstruit/1.0.0')->getStatusCode());
    }

    #[TestDox('UC-APP-06-F14 — RG1, RG7 : aucune route serveur d’export ou d’import d’archive (table de routage) ; Golden Prompt jamais exportable')]
    public function testF14NoServerArchiveRouteAndNoPrivatePackage(): void
    {
        // Table de routage RÉELLE : aucun motif « export » ni « archive » ; les
        // seuls motifs « import » sont les imports d'administration (jeton technique).
        $patterns = array_map(
            static fn ($route): string => $route->getPattern(),
            Bootstrap::createApp()->getRouteCollector()->getRoutes(),
        );
        self::assertSame([], array_values(preg_grep('/export|archive/i', $patterns)));
        $imports = array_values(preg_grep('/import/i', $patterns));
        sort($imports);
        self::assertSame(['/admin/import-prompt-package', '/admin/import-referentiel', '/admin/twin9/import'], $imports);

        self::publish('golden-prompt', '1.0.0', true);
        $maya = $this->registerAs('maya@example.org', 'Maya');

        $previousLog = ini_set('error_log', '/dev/null'); // Slim journalise chaque 404
        try {
            foreach (['/api/account/export', '/api/account/import', '/api/archive', '/api/archive/import'] as $path) {
                self::assertSame(404, $this->as_($maya, 'GET', $path)->getStatusCode(), 'GET ' . $path);
                self::assertSame(404, $this->as_($maya, 'POST', $path, ['kind' => 'archive-export'])->getStatusCode(), 'POST ' . $path);
            }
        } finally {
            ini_set('error_log', $previousLog === false ? '' : $previousLog);
        }

        self::assertSame([], self::json($this->as_($maya, 'GET', '/api/prompt-packages')));
        self::assertSame(404, $this->as_($maya, 'GET', '/api/prompt-packages/golden-prompt/1.0.0')->getStatusCode());
    }
}
