<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\CartographeTestCase;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-APP-03 — Consulter ses cartographies : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-03-consulter-ses-cartographies.md
 *
 * Le tableau de bord lit le stockage LOCAL ; les copies serveur (opt-in,
 * UC-APP-04) restent consultables par l'API, par exemple depuis un autre
 * appareil (alternatif A5) : GET /api/cartographies (métadonnées) puis
 * GET /api/cartographies/{id} (document). Rejoué par l'API HTTP réelle.
 */
final class UcApp03ConsulterSesCartographiesTest extends CartographeTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $maya;

    protected function setUp(): void
    {
        parent::setUp();
        $this->maya = $this->registerAs('maya@example.org', 'Maya');
    }

    /** @return array<string, mixed> */
    private static function mergeDocument(): array
    {
        return json_decode((string) file_get_contents(\dirname(__DIR__, 4) . '/schemas/fixtures/cartographie-merge-3-jours.json'), true, 512, JSON_THROW_ON_ERROR);
    }

    #[TestDox('UC-APP-03-F10 — A5 : liste des copies serveur (sans document) puis lecture complète d’une copie')]
    public function testF10ListThenReadServerCopies(): void
    {
        $jour = $this->createCarto($this->maya, ['titre' => 'Journée du 5 janvier', 'visibility' => 'privee', 'document' => self::jourDocument()]);
        $merge = $this->createCarto($this->maya, [
            'type' => 'merge',
            'titre' => 'Cartographie — Journal de Maya',
            'visibility' => 'publique',
            'document' => self::mergeDocument(),
            'runMeta' => ['mode' => 'humanome', 'jours' => 3, 'usage' => ['inputTokens' => 1200, 'outputTokens' => 300, 'mesures' => 24]],
        ]);
        self::assertSame(201, $this->as_($this->maya, 'POST', '/api/cartographies/' . $merge . '/share', ['password' => 'sesame-employeur'])->getStatusCode());
        self::$pdo->exec("UPDATE cartographies SET updated_at = '2026-01-08 10:00:00' WHERE id = {$jour}");
        self::$pdo->exec("UPDATE cartographies SET updated_at = '2026-01-09 10:00:00' WHERE id = {$merge}");

        // Autre appareil : même compte, liste.
        $list = $this->as_($this->maya, 'GET', '/api/cartographies');
        self::assertSame(200, $list->getStatusCode());
        $rows = self::json($list);
        self::assertSame([$merge, $jour], array_column($rows, 'id'));
        self::assertStringNotContainsString('"domains"', (string) $list->getBody(), 'jamais de document dans la liste');
        self::assertSame(['merge', 'publique', true, 1], [$rows[0]['type'], $rows[0]['visibility'], $rows[0]['hasDocument'], $rows[0]['shares']]);

        // Puis ouverture d'une copie.
        $one = $this->as_($this->maya, 'GET', '/api/cartographies/' . $merge);
        self::assertSame(200, $one->getStatusCode());
        $carto = self::json($one);
        self::assertSame('Cartographie — Journal de Maya', $carto['titre']);
        self::assertEquals(self::mergeDocument(), $carto['document']);
        self::assertEquals(['mode' => 'humanome', 'jours' => 3, 'usage' => ['inputTokens' => 1200, 'outputTokens' => 300, 'mesures' => 24]], $carto['runMeta']);
        self::assertNull($carto['promptPackage']);
        self::assertNotNull($carto['optInAt']);
    }

    #[TestDox('UC-APP-03-F11 — A5 : aucune copie serveur → liste vide (tout est resté local)')]
    public function testF11EmptyListWhenNothingWasCopied(): void
    {
        $response = $this->as_($this->maya, 'GET', '/api/cartographies');

        self::assertSame(200, $response->getStatusCode());
        self::assertSame([], self::json($response));
    }

    #[TestDox('UC-APP-03-F12 — E4 : sans session → 401 ; sans rôle apprenant → 403 ; copie d’autrui → même 404 qu’inexistante')]
    public function testF12AccessControl(): void
    {
        $id = $this->createCarto($this->maya, ['visibility' => 'publique', 'document' => self::jourDocument()]);

        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/cartographies')->getStatusCode());
        self::assertSame(401, $this->request('GET', '/api/cartographies/' . $id)->getStatusCode());

        $employeur = $this->registerAs('rh@example.org', 'RH', ['employeur']);
        self::assertSame(403, $this->as_($employeur, 'GET', '/api/cartographies')->getStatusCode());

        $autre = $this->registerAs('autre@example.org', 'Autre');
        $foreign = $this->as_($autre, 'GET', '/api/cartographies/' . $id);
        $missing = $this->as_($autre, 'GET', '/api/cartographies/' . ($id + 1000));
        self::assertSame(404, $foreign->getStatusCode());
        self::assertSame(404, $missing->getStatusCode());
        self::assertSame((string) $missing->getBody(), (string) $foreign->getBody(), 'aucun oracle d’existence');
        self::assertSame([], self::json($this->as_($autre, 'GET', '/api/cartographies')), 'la liste ne montre que les siennes');
    }
}
