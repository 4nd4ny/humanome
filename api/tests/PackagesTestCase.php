<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Bootstrap;
use Humanome\Db;
use Humanome\Packages\PromptPackageRepository;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * Shared plumbing for the P10 promptologue workshop tests: clean prompt
 * package + settings tables, fixture documents (v1 = the schema example,
 * v2 = a realistic evolution), role helpers and a header-capable request
 * (X-Migrate-Token admin routes).
 */
abstract class PackagesTestCase extends ReferentielTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $pdo = Db::get();
        $pdo->exec('DELETE FROM prompt_packages');
        $pdo->exec('DELETE FROM settings');
    }

    protected static function packages(): PromptPackageRepository
    {
        return new PromptPackageRepository(Db::get());
    }

    /** @return array<string, mixed> the fixture document (aurora-demo 1.0.0) */
    protected static function packageDoc(array $overrides = []): array
    {
        $fixture = dirname(__DIR__, 2) . '/schemas/fixtures/prompt-package-exemple.json';
        $doc = json_decode((string) file_get_contents($fixture), true, 512, JSON_THROW_ON_ERROR);

        return array_merge($doc, $overrides);
    }

    /**
     * @return array<string, mixed> a realistic v2 of the fixture: one prompt
     * modified (texte + variables), one removed, one added, code and
     * description changed — the diff test matter.
     */
    protected static function packageDocV2(): array
    {
        $doc = self::packageDoc([
            'version' => '2.0.0',
            'description' => 'Deuxième itération : extraction affinée, prompt kairos remplacé par un prompt merge.',
        ]);

        // Modify "extraction-pole": one line of the texte + one new variable.
        $doc['prompts'][0]['texte'] = str_replace(
            '- Cite les passages verbatim, sans reformuler ni inventer.',
            '- Cite les passages verbatim, sans reformuler ni inventer, avec leur position dans la feuille.',
            $doc['prompts'][0]['texte'],
        );
        $doc['prompts'][0]['variables'][] = [
            'nom' => 'consignes_additionnelles',
            'description' => 'Consignes spécifiques du cartographe, injectées en fin de cadre.',
            'exemple' => 'Attention aux contenus multimédias décrits textuellement.',
        ];

        // Remove "kairos", add a "merge" prompt.
        $doc['prompts'] = [$doc['prompts'][0], [
            'role' => 'merge',
            'nom' => 'Fusion chronologique multi-jours',
            'texte' => "# Cadre\nFusionne les cartographies journalières {{jours_json}}.\n\n# Format\nJSON strict cartographie-merge.",
            'variables' => [
                ['nom' => 'jours_json', 'description' => 'Cartographies journalières sérialisées.', 'exemple' => '[]'],
            ],
        ]];

        $doc['code']['orchestration'] .= "\n// v2 : passe de fusion ajoutée.\n";
        $doc['changelog'][] = [
            'version' => '2.0.0',
            'date' => '2026-02-01',
            'description' => 'Extraction affinée, prompt merge.',
        ];

        return $doc;
    }

    /** Import a document as a PUBLISHED version (script path). */
    protected static function importPackage(?array $doc = null): array
    {
        return self::packages()->importPublishedDocument($doc ?? self::packageDoc());
    }

    /** Create a promptologue and open their session. */
    protected static function loginAsPromptologue(): int
    {
        $id = self::createUser('promptologue');
        self::loginAs($id);

        return $id;
    }

    /**
     * Same as ReferentielTestCase::request() but with headers (admin routes
     * authenticated by X-Migrate-Token).
     *
     * @param array<string, mixed>|null $body
     * @param array<string, string> $headers
     */
    protected function requestWithHeaders(string $method, string $path, ?array $body, array $headers): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, '/api' . $path);
        if ($body !== null) {
            $request->getBody()->write(json_encode($body, JSON_THROW_ON_ERROR));
            $request->getBody()->rewind();
            $request = $request->withHeader('Content-Type', 'application/json');
        }
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        return Bootstrap::createApp()->handle($request);
    }
}
