<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Support;

use Humanome\Auth\Session;
use Humanome\Bootstrap;
use Humanome\DbSessionHandler;
use Humanome\Referentiel\CompetenceRepository;
use Humanome\Referentiel\CompetenceSeeder;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\CartographeTestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * Plomberie partagée des tests FONCTIONNELS du lot Épistémiarque
 * (UC-EPI-01 à UC-EPI-04, docs/cas-utilisation/epistemiarque/).
 *
 * Contrairement aux suites historiques (ReferentielTestCase, qui pose
 * $_SESSION['user_id'] à la main), les scénarios passent ici par la VRAIE
 * chaîne navigateur : inscription + activation, cookie de session, jeton CSRF
 * sur chaque mutation (simulation multi-comptes héritée de CartographeTestCase).
 *
 * Un seul ajustement, documenté : RoleGuard démarre lui-même la session DB
 * hors CLI (serveur web) mais lit $_SESSION tel quel sous PHPUnit (CLI). Sur
 * une requête GET, rien d'autre ne démarre la session (le middleware CSRF ne
 * s'occupe que des mutations) : $_SESSION garderait les données de la requête
 * PRÉCÉDENTE, éventuellement d'un autre compte. request() rejoue donc, en
 * middleware le plus externe, ce que fait le serveur web : session du cookie
 * démarrée s'il y en a un, session vide sinon. Rien d'autre n'est simulé.
 */
abstract class EpiSupport extends CartographeTestCase
{
    protected const RESPIRE = ReferentielRepository::DEFAULT_REFERENTIEL_ID;

    protected function setUp(): void
    {
        parent::setUp();
        // Ordre des clés étrangères : le lockfile (RESTRICT) avant les versions.
        foreach ([
            'referentiel_snapshot_competences',
            'competence_votes',
            'competence_versions',
            'referentiel_votes',
            'referentiel_versions',
            'referentiel_poles',
        ] as $table) {
            self::$pdo->exec('DELETE FROM ' . $table);
        }
        $_SESSION = [];
    }

    protected function tearDown(): void
    {
        parent::tearDown();
        $_SESSION = [];
    }

    /**
     * Même contrat que AuthTestBase::request, avec la session démarrée comme
     * sur le serveur web (voir le docblock de la classe).
     *
     * @param array<string, mixed>|null $body
     * @param array<string, string> $headers
     */
    protected function request(
        string $method,
        string $path,
        ?array $body = null,
        array $headers = [],
        ?App $app = null,
    ): ResponseInterface {
        if ($app === null) {
            $app = Bootstrap::createApp();
            $app->add(new class implements MiddlewareInterface {
                public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
                {
                    if (Session::exists()) {
                        Session::start();
                    } else {
                        $_SESSION = [];
                    }

                    return $handler->handle($request);
                }
            });
        }

        return parent::request($method, $path, $body, $headers, $app);
    }

    // ------------------------------------------------------------ acteurs

    /**
     * Compte inscrit + activé par l'API, rôles arrangés en SQL (l'attribution
     * des rôles relève de UC-ADM-01).
     *
     * @param list<string> $roles
     * @return array{id: int, csrf: string, sid: string}
     */
    protected function member(string $email, string $name, array $roles = ['epistemiarque']): array
    {
        return $this->registerAs($email, $name, $roles);
    }

    /**
     * Requête AU NOM d'un compte avec en-têtes additionnels (If-Match…).
     *
     * @param array{id: int, csrf: string, sid: string} $user
     * @param array<string, mixed>|null $body
     * @param array<string, string> $headers
     */
    protected function asWith(array $user, string $method, string $path, ?array $body, array $headers): ResponseInterface
    {
        $this->cookieSid = $user['sid'];
        if (\in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            $headers['X-CSRF-Token'] = $user['csrf'];
        }

        return $this->request($method, $path, $body, $headers);
    }

    /**
     * Requête d'un compte connecté qui OMET le jeton CSRF (cookie présent).
     *
     * @param array{id: int, csrf: string, sid: string} $user
     * @param array<string, mixed>|null $body
     */
    protected function withoutCsrf(array $user, string $method, string $path, ?array $body = null): ResponseInterface
    {
        $this->cookieSid = $user['sid'];

        return $this->request($method, $path, $body);
    }

    /**
     * Requête AU NOM d'un compte avec un corps BRUT (JSON malformé…), mêmes
     * cookie, jeton CSRF et adresse IP que request().
     *
     * @param array{id: int, csrf: string, sid: string} $user
     */
    protected function rawAs(array $user, string $method, string $path, string $rawBody): ResponseInterface
    {
        $this->cookieSid = $user['sid'];
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
        $_COOKIE[DbSessionHandler::SESSION_NAME] = $user['sid'];
        session_id($user['sid']);
        $_SERVER['REMOTE_ADDR'] = $this->clientIp;

        $request = (new ServerRequestFactory())
            ->createServerRequest($method, $path, ['REMOTE_ADDR' => $this->clientIp])
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('X-CSRF-Token', $user['csrf']);
        $request->getBody()->write($rawBody);
        $request->getBody()->rewind();

        $response = Bootstrap::createApp()->handle($request);
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        return $response;
    }

    /** Navigateur sans cookie. @param array<string, mixed>|null $body */
    protected function anonymous(string $method, string $path, ?array $body = null): ResponseInterface
    {
        $this->cookieSid = null;

        return $this->request($method, $path, $body);
    }

    // ------------------------------------------------------------ données

    /** @return array<string, mixed> contenu riche minimal conforme à competence.schema.json */
    protected static function competenceContent(string $code, string $nom, string $definition = 'Définition initiale.'): array
    {
        return [
            'identite' => [
                'code' => $code,
                'nom' => $nom,
                'definition' => $definition,
                'marqueurs_fondamentaux' => ['marqueur A', 'marqueur B'],
            ],
            'protocole' => [
                'passe_1' => ['signaux_declencheurs' => ['j\'ai vérifié'], 'token_budget' => 40],
            ],
        ];
    }

    /** Compétence déjà publiée (état initial du référentiel). Renvoie l'id de version. */
    protected static function seedCompetence(string $code, string $nom, int $pole, string $semver = '1.0.0', ?array $content = null): int
    {
        return (new CompetenceRepository(self::$pdo))->importPublishedCompetence(
            $code,
            $nom,
            $pole,
            $content ?? self::competenceContent($code, $nom),
            $semver,
        )['id'];
    }

    /**
     * Le document RESPIRE v7 (7 pôles, 61 compétences) : instantané VERSIONNÉ
     * schemas/fixtures/referentiel-respire-v7.json — même contentHash que
     * l'extraction web/public/data/referentiel/respire-v7.json (non versionnée).
     *
     * @return array<string, mixed>
     */
    protected static function respireDocument(): array
    {
        $path = \dirname(__DIR__, 4) . '/schemas/fixtures/referentiel-respire-v7.json';
        self::assertFileExists($path);

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /** Version 7.0.0 publiée (import initial, comme au déploiement). */
    protected static function importRespire(): array
    {
        return (new ReferentielRepository(self::$pdo))->importPublishedDocument(self::respireDocument(), 'Import initial RESPIRE v7');
    }

    /**
     * État de production : 7.0.0 publiée + 7 pôles + 61 compétences atomiques
     * 1.0.0 (contenu riche + fiche de scan), par le seeder du déploiement.
     *
     * @return array{id: int, contentHash: string}
     */
    protected static function seedFullCorpus(): array
    {
        $imported = self::importRespire();
        $root = \dirname(__DIR__, 4) . '/scripts/data/';
        $rich = json_decode((string) file_get_contents($root . 'competences-v7.json'), true, 512, JSON_THROW_ON_ERROR)['competences'];
        $fiches = json_decode((string) file_get_contents($root . 'fiches-v7.json'), true, 512, JSON_THROW_ON_ERROR);
        (new CompetenceSeeder(self::$pdo))->seed($rich, $fiches);

        return ['id' => $imported['id'], 'contentHash' => $imported['contentHash']];
    }

    // ---------------------------------------------------------- parcours

    /**
     * Étapes 3 à 9 de UC-EPI-01 par l'API : fork, édition (CAS If-Match),
     * soumission au vote. Renvoie l'id de la proposition.
     *
     * @param array{id: int, csrf: string, sid: string} $author
     * @param callable(array<string, mixed>): array<string, mixed>|null $edit
     */
    protected function openCompetenceProposal(
        array $author,
        string $code,
        string $semver,
        ?callable $edit = null,
        ?string $decidimUrl = null,
    ): int {
        $created = $this->as_($author, 'POST', '/api/competences/' . $code . '/drafts', ['semver' => $semver]);
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $draft = self::json($created);
        if ($edit !== null) {
            $saved = $this->asWith($author, 'PUT', '/api/competences/drafts/' . $draft['id'], $edit($draft['content']), [
                'If-Match' => $draft['contentHash'],
            ]);
            self::assertSame(200, $saved->getStatusCode(), (string) $saved->getBody());
        }
        $submitted = $this->as_(
            $author,
            'POST',
            '/api/competences/drafts/' . $draft['id'] . '/submit',
            $decidimUrl === null ? [] : ['decidimUrl' => $decidimUrl],
        );
        self::assertSame(200, $submitted->getStatusCode(), (string) $submitted->getBody());

        return (int) $draft['id'];
    }

    /** Nombre de bulletins en base pour une version de compétence. */
    protected static function competenceBallots(int $versionId): int
    {
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM competence_votes WHERE competence_version_id = ?');
        $stmt->execute([$versionId]);

        return (int) $stmt->fetchColumn();
    }

    /** Nombre de bulletins en base pour une version de référentiel. */
    protected static function referentielBallots(int $versionId): int
    {
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM referentiel_votes WHERE version_id = ?');
        $stmt->execute([$versionId]);

        return (int) $stmt->fetchColumn();
    }

    /** @return array<string, mixed>|false ligne brute competence_versions */
    protected static function competenceRow(int $id): array|false
    {
        $stmt = self::$pdo->prepare('SELECT * FROM competence_versions WHERE id = ?');
        $stmt->execute([$id]);

        return $stmt->fetch();
    }
}
