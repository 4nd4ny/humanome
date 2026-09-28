<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\CartographeTestCase;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-CPT-05 — Suivre sa progression de formation : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-05-suivre-progression-formation.md
 *
 * Un compte connecté coche et décoche des chapitres par
 * PUT /api/training/progress et relit sa progression par GET. Les
 * identifiants de chapitres utilisés sont ceux du contenu réel
 * (content/formation/<parcours>/*.md).
 */
final class UcCpt05SuivreProgressionFormationTest extends CartographeTestCase
{
    private const CH1 = '01-pourquoi-un-portfolio-reflexif';
    private const CH2 = '02-ecrire-des-traces-exploitables';
    private const CH5 = '05-relire-sa-cartographie';

    /** @var array{id: int, csrf: string, sid: string} */
    private array $ada;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ada = $this->registerAs('ada@example.org', 'Ada');
    }

    private function tick(string $chapitre, bool $completed = true, string $parcours = 'apprenant', ?array $user = null): ResponseInterface
    {
        return $this->as_($user ?? $this->ada, 'PUT', '/api/training/progress', [
            'parcours' => $parcours,
            'chapitre' => $chapitre,
            'completed' => $completed,
        ]);
    }

    private function progress(?array $user = null): string
    {
        return (string) $this->as_($user ?? $this->ada, 'GET', '/api/training/progress')->getBody();
    }

    #[TestDox('UC-CPT-05-F01 — nominal : progression vide {} → chapitre coché (PUT) → progression complète renvoyée, triée, groupée par parcours')]
    public function testF01TickChapters(): void
    {
        self::assertSame('{}', $this->progress(), 'objet vide, pas tableau vide');

        $first = $this->tick(self::CH2);
        self::assertSame(200, $first->getStatusCode(), (string) $first->getBody());
        self::assertSame(['apprenant' => ['chapitresTermines' => [self::CH2]]], self::json($first));

        $this->tick(self::CH1);
        $this->tick('01-le-role-du-cartographe', true, 'cartographe');

        self::assertSame(
            [
                'apprenant' => ['chapitresTermines' => [self::CH1, self::CH2]],
                'cartographe' => ['chapitresTermines' => ['01-le-role-du-cartographe']],
            ],
            json_decode($this->progress(), true),
        );
    }

    #[TestDox('UC-CPT-05-F02 — A3 : décocher supprime la ligne ; cocher ou décocher deux fois est sans effet (idempotent), date conservée')]
    public function testF02UntickAndIdempotence(): void
    {
        $this->tick(self::CH1);
        self::$pdo->exec("UPDATE training_progress SET completed_at = '2026-02-01 08:00:00'");
        self::assertSame(200, $this->tick(self::CH1)->getStatusCode());
        self::assertSame('2026-02-01 08:00:00', self::$pdo->query('SELECT completed_at FROM training_progress')->fetchColumn(), 'première complétion conservée');

        $untick = $this->tick(self::CH1, false);
        self::assertSame(200, $untick->getStatusCode());
        self::assertSame('{}', (string) $untick->getBody());
        self::assertSame(200, $this->tick(self::CH1, false)->getStatusCode(), 'décocher un chapitre absent');
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM training_progress')->fetchColumn());
    }

    #[TestDox('UC-CPT-05-F03 — A2 : migration à la connexion — un PUT par chapitre local, puis la lecture serveur fait foi')]
    public function testF03MigrationOfLocalProgress(): void
    {
        $this->tick(self::CH5); // déjà sur le compte (autre navigateur)

        // Le navigateur rejoue sa progression locale (createTrainingStore.migrateLocalToServer).
        foreach ([self::CH1, self::CH5, self::CH2] as $local) {
            self::assertSame(200, $this->tick($local)->getStatusCode());
        }

        self::assertSame(
            ['apprenant' => ['chapitresTermines' => [self::CH1, self::CH2, self::CH5]]],
            json_decode($this->progress(), true),
            'union sans doublon',
        );
    }

    #[TestDox('UC-CPT-05-F04 — E3 : sans session → 401 ; identifiants invalides ou completed non booléen → 422 ; sans jeton CSRF → 403')]
    public function testF04Guards(): void
    {
        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/training/progress')->getStatusCode());
        self::assertSame(401, $this->request('PUT', '/api/training/progress', ['parcours' => 'apprenant', 'chapitre' => self::CH1, 'completed' => true])->getStatusCode());

        $cases = [
            [['parcours' => 'Apprenant', 'chapitre' => self::CH1, 'completed' => true], ['parcours']],
            [['parcours' => 'apprenant', 'chapitre' => '../01', 'completed' => true], ['chapitre']],
            [['parcours' => 'apprenant', 'chapitre' => str_repeat('a', 65), 'completed' => true], ['chapitre']],
            [['parcours' => 'apprenant', 'chapitre' => self::CH1, 'completed' => 'true'], ['completed']],
            [[], ['parcours', 'chapitre', 'completed']],
        ];
        foreach ($cases as [$body, $fields]) {
            $response = $this->as_($this->ada, 'PUT', '/api/training/progress', $body);
            self::assertSame(422, $response->getStatusCode(), json_encode($body));
            self::assertSame($fields, array_keys(self::json($response)['fields']));
        }
        self::assertSame(200, $this->tick(str_repeat('a', 64))->getStatusCode(), '64 caractères acceptés');

        $this->cookieSid = $this->ada['sid'];
        self::assertSame(403, $this->request('PUT', '/api/training/progress', ['parcours' => 'apprenant', 'chapitre' => self::CH2, 'completed' => true])->getStatusCode());
        self::assertStringNotContainsString(self::CH2, $this->progress());
    }

    #[TestDox('UC-CPT-05-F05 — RG4 : chacun sa progression — celle d’un autre compte n’est ni visible ni modifiable')]
    public function testF05ProgressIsPerAccount(): void
    {
        $bob = $this->registerAs('bob@example.org', 'Bob');
        $this->tick(self::CH1);
        $this->tick(self::CH2, true, 'apprenant', $bob);
        $this->tick(self::CH1, false, 'apprenant', $bob); // Bob décoche « son » chapitre 1 : aucun effet chez Ada

        self::assertSame(['apprenant' => ['chapitresTermines' => [self::CH1]]], json_decode($this->progress(), true));
        self::assertSame(['apprenant' => ['chapitresTermines' => [self::CH2]]], json_decode($this->progress($bob), true));
    }
}
