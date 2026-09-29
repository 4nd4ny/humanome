<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Env;
use Humanome\MigrationRunner;
use Humanome\Referentiel\CompetenceGovernance;
use Humanome\Referentiel\CompetenceHash;
use Humanome\Referentiel\CompetenceRepository;
use Humanome\Referentiel\ConflictException;
use Humanome\Referentiel\DecidimLink;
use Humanome\Referentiel\InvalidDocumentException;
use Humanome\Referentiel\RoleGuard;
use Humanome\Referentiel\Semver;
use Humanome\Tests\TestDb;
use PDO;
use PDOException;
use PDOStatement;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * UC-EPI-01 — Proposer une modification de compétence : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-01-proposer-modification-competence.md
 *
 * Les classes du domaine sollicitées par l'atelier sont appelées directement
 * (sans couche HTTP) : CompetenceRepository (fork, édition CAS, liste des
 * versions éditables), CompetenceHash (jeton de concurrence optimiste),
 * CompetenceGovernance (soumission au vote, retrait), DecidimLink, Semver et
 * le garde de rôle RoleGuard.
 */
final class UcEpi01ProposerModificationCompetenceTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    public static function tearDownAfterClass(): void
    {
        TestDb::restoreEnv();
    }

    protected function setUp(): void
    {
        // RoleGuard lit la base par le singleton Db : on le pointe sur la base de test.
        TestDb::overrideEnv();
        foreach (['referentiel_snapshot_competences', 'competence_votes', 'competence_versions', 'user_roles', 'users'] as $table) {
            self::$pdo->exec('DELETE FROM ' . $table);
        }
        $_SESSION = [];
    }

    protected function tearDown(): void
    {
        $_SESSION = [];
    }

    private static function repo(): CompetenceRepository
    {
        return new CompetenceRepository(self::$pdo);
    }

    private static function governance(): CompetenceGovernance
    {
        return new CompetenceGovernance(self::$pdo);
    }

    private static function createUser(string ...$roles): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid('epi', true) . '@example.org', 'x', 'Membre']);
        $userId = (int) self::$pdo->lastInsertId();
        $bind = self::$pdo->prepare('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?');
        foreach ($roles as $role) {
            $bind->execute([$userId, $role]);
        }

        return $userId;
    }

    /** @return array<string, mixed> */
    private static function content(string $code, string $nom, string $definition = 'Définition initiale.'): array
    {
        return [
            'identite' => [
                'code' => $code,
                'nom' => $nom,
                'definition' => $definition,
                'marqueurs_fondamentaux' => ['marqueur A', 'marqueur B'],
            ],
            'protocole' => ['passe_1' => ['signaux_declencheurs' => ['j\'ai vérifié'], 'token_budget' => 40]],
        ];
    }

    private static function publish(string $code, string $nom, int $pole, string $semver, ?string $definition = null): int
    {
        return self::repo()->importPublishedCompetence(
            $code,
            $nom,
            $pole,
            self::content($code, $nom, $definition ?? 'Définition ' . $semver),
            $semver,
        )['id'];
    }

    private static function ballot(int $versionId, int $userId, string $vote): void
    {
        self::$pdo->prepare('INSERT INTO competence_votes (competence_version_id, user_id, vote) VALUES (?, ?, ?)')
            ->execute([$versionId, $userId, $vote]);
    }

    private static function ballots(int $versionId): int
    {
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM competence_votes WHERE competence_version_id = ?');
        $stmt->execute([$versionId]);

        return (int) $stmt->fetchColumn();
    }

    #[TestDox('UC-EPI-01-U01 — createDraft forke la DERNIÈRE version publiée (précédence semver, pas ordre alphabétique)')]
    public function testU01CreateDraftForksTheLatestPublishedVersion(): void
    {
        // Insertion dans un ordre NON monotone : 1.10.0 n'est ni la première
        // insérée (ORDER BY id ASC), ni la dernière (ORDER BY id DESC / end()),
        // ni la plus grande par ordre alphabétique (« 1.9.0 ») : seule la
        // précédence semver la désigne.
        self::publish('1.01', 'Pensée Critique', 1, '1.9.0');
        $latest = self::publish('1.01', 'Pensée Critique & Anti-Hallucination', 1, '1.10.0', 'Définition la plus récente.');
        self::publish('1.01', 'Pensée Critique', 1, '1.0.0');
        $author = self::createUser('epistemiarque');

        $draft = self::repo()->createDraft('1.01', '1.11.0', $author);

        self::assertNotNull($draft);
        self::assertSame('draft', $draft['status']);
        self::assertSame('1.11.0', $draft['semver']);
        self::assertSame(1, $draft['pole']);
        self::assertSame('Pensée Critique & Anti-Hallucination', $draft['nom'], 'nom/pôle copiés de 1.10.0, pas de 1.9.0');
        self::assertSame('Définition la plus récente.', $draft['content']['identite']['definition']);
        self::assertSame(self::repo()->findById($latest)['contentHash'], $draft['contentHash'], 'même contenu, même empreinte');
        self::assertNull($draft['publishedAt']);
        $createdBy = self::$pdo->query('SELECT created_by FROM competence_versions WHERE id = ' . (int) $draft['id'])->fetchColumn();
        self::assertSame($author, (int) $createdBy, 'auteur = compte de la session');
    }

    #[TestDox('UC-EPI-01-U02 — createDraft : semver invalide → 422, doublon → 409, compétence inconnue → null ; la croissance n’est pas vérifiée à la création')]
    public function testU02CreateDraftRefusals(): void
    {
        self::publish('1.01', 'Pensée Critique', 1, '1.0.0');

        foreach (['v1.1.0', '1.1', '01.1.0', ''] as $bad) {
            self::assertFalse(Semver::isValid($bad), $bad);
            try {
                self::repo()->createDraft('1.01', $bad);
                self::fail('semver invalide acceptée : ' . $bad);
            } catch (InvalidDocumentException $e) {
                self::assertArrayHasKey('/semver', $e->getErrors());
            }
        }
        self::assertTrue(Semver::isValid('1.1.0-rc.1'));

        self::assertNotNull(self::repo()->createDraft('1.01', '1.1.0'));
        try {
            self::repo()->createDraft('1.01', '1.1.0');
            self::fail('doublon (code, semver) accepté');
        } catch (ConflictException $e) {
            self::assertStringContainsString('1.01@1.1.0 already exists', $e->getMessage());
        }
        // Aucune version publiée pour ce code : rien à forker.
        self::assertNull(self::repo()->createDraft('9.99', '1.1.0'));

        // RG2 : une semver INFÉRIEURE est acceptée à la création ; c'est la
        // soumission au vote qui l'arrêtera (U07).
        self::assertSame('draft', self::repo()->createDraft('1.01', '0.9.0')['status']);
    }

    #[TestDox('UC-EPI-01-U03 — updateDraft : compare-and-swap sur content_hash (hash périmé → 409, absent → 409, réécriture identique = no-op)')]
    public function testU03UpdateDraftIsACompareAndSwapOnContentHash(): void
    {
        self::publish('1.01', 'Pensée Critique', 1, '1.0.0');
        $draft = self::repo()->createDraft('1.01', '1.1.0');
        $base = $draft['contentHash'];

        $edited = $draft['content'];
        $edited['identite']['nom'] = 'Pensée Critique renommée';
        $edited['identite']['definition'] = 'Douter, et se douter de soi.';
        $saved = self::repo()->updateDraft($draft['id'], $edited, $base);

        self::assertSame(CompetenceHash::compute($edited), $saved['contentHash']);
        self::assertNotSame($base, $saved['contentHash']);
        self::assertSame('Pensée Critique renommée', $saved['nom'], 'le nom structurel suit identite.nom');
        self::assertSame('Douter, et se douter de soi.', $saved['content']['identite']['definition']);

        // Un second éditeur qui a chargé l'ancienne version ne peut pas écraser.
        $stale = $draft['content'];
        $stale['identite']['definition'] = 'Écrasement tardif';
        try {
            self::repo()->updateDraft($draft['id'], $stale, $base);
            self::fail('lost update accepté');
        } catch (ConflictException $e) {
            self::assertStringContainsString('modifiée par un autre épistémiarque', $e->getMessage());
        }
        self::assertSame('Douter, et se douter de soi.', self::repo()->findById($draft['id'])['content']['identite']['definition']);

        foreach ([null, ''] as $missing) {
            try {
                self::repo()->updateDraft($draft['id'], $edited, $missing);
                self::fail('précondition absente acceptée');
            } catch (ConflictException $e) {
                self::assertStringContainsString('Précondition requise', $e->getMessage());
            }
        }

        // Réenregistrer le même contenu avec le hash courant : 0 ligne changée, pas un conflit.
        $again = self::repo()->updateDraft($draft['id'], $edited, $saved['contentHash']);
        self::assertSame($saved['contentHash'], $again['contentHash']);
    }

    #[TestDox('UC-EPI-01-U04 — updateDraft refuse une proposition au vote, une version publiée, un contenu hors schéma ou un code modifié')]
    public function testU04UpdateDraftRefusals(): void
    {
        $publishedId = self::publish('1.01', 'Pensée Critique', 1, '1.0.0');
        $published = self::repo()->findById($publishedId);
        $draft = self::repo()->createDraft('1.01', '1.1.0');

        try {
            self::repo()->updateDraft($publishedId, $published['content'], $published['contentHash']);
            self::fail('version publiée modifiée');
        } catch (ConflictException $e) {
            self::assertStringContainsString('immutable', $e->getMessage());
        }

        try {
            self::repo()->updateDraft($draft['id'], ['protocole' => []], $draft['contentHash']);
            self::fail('contenu sans identite accepté');
        } catch (InvalidDocumentException $e) {
            self::assertNotSame([], $e->getErrors());
        }

        $moved = $draft['content'];
        $moved['identite']['code'] = '1.02';
        try {
            self::repo()->updateDraft($draft['id'], $moved, $draft['contentHash']);
            self::fail('changement de code accepté');
        } catch (InvalidDocumentException $e) {
            self::assertArrayHasKey('/identite/code', $e->getErrors());
        }

        self::governance()->submit($draft['id'], null, null);
        try {
            self::repo()->updateDraft($draft['id'], $draft['content'], $draft['contentHash']);
            self::fail('proposition au vote modifiée');
        } catch (ConflictException $e) {
            self::assertStringContainsString('withdraw it before editing', $e->getMessage());
        }

        self::assertNull(self::repo()->updateDraft(999999, $draft['content'], 'x'));
    }

    #[TestDox('UC-EPI-01-U05 — CompetenceHash : insensible à l’ordre des clés (colonne JSON MySQL), sensible à l’ordre des listes et au contenu')]
    public function testU05CompetenceHashCanonicalForm(): void
    {
        $a = ['identite' => ['code' => '1.01', 'nom' => 'É/À', 'marqueurs_fondamentaux' => ['x', 'y']], 'protocole' => ['b' => 1, 'a' => ['z' => 1, 'y' => 2]]];
        $reordered = ['protocole' => ['a' => ['y' => 2, 'z' => 1], 'b' => 1], 'identite' => ['marqueurs_fondamentaux' => ['x', 'y'], 'nom' => 'É/À', 'code' => '1.01']];
        $swappedList = $a;
        $swappedList['identite']['marqueurs_fondamentaux'] = ['y', 'x'];
        $edited = $a;
        $edited['identite']['nom'] = 'É/À bis';

        self::assertSame(CompetenceHash::compute($a), CompetenceHash::compute($reordered));
        self::assertNotSame(CompetenceHash::compute($a), CompetenceHash::compute($swappedList), 'l’ordre des marqueurs a un sens');
        self::assertNotSame(CompetenceHash::compute($a), CompetenceHash::compute($edited));
        self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', CompetenceHash::compute($a));
        self::assertStringContainsString('"É/À"', CompetenceHash::encode(CompetenceHash::canonical($a)), 'unicode et / non échappés');
        self::assertSame(
            ['identite', 'protocole'],
            array_keys(CompetenceHash::canonical($reordered)),
        );
        self::assertNotSame(
            CompetenceHash::compute($a),
            CompetenceHash::structural('1.01', 'É/À', 1),
            'le hash STRUCTUREL ({code,nom,pole}) est une autre empreinte',
        );
    }

    #[TestDox('UC-EPI-01-U06 — submit : brouillon → au vote, auteur et lien Decidim (normalisé) enregistrés, bulletins d’un tour précédent effacés')]
    public function testU06SubmitOpensTheVote(): void
    {
        self::publish('1.01', 'Pensée Critique', 1, '1.0.0');
        $author = self::createUser('epistemiarque');
        $draft = self::repo()->createDraft('1.01', '1.1.0', $author);
        // Reliquat d'un tour antérieur (le retrait efface normalement, défense en profondeur).
        self::ballot($draft['id'], $author, 'contre');

        $submitted = self::governance()->submit($draft['id'], '  https://participer.harmonia.education/processes/referentiel/f/12/debates/3  ', $author);

        self::assertSame('review', $submitted['status']);
        self::assertSame($author, $submitted['submittedBy']);
        self::assertNotNull($submitted['submittedAt']);
        self::assertSame('https://participer.harmonia.education/processes/referentiel/f/12/debates/3', $submitted['decidimUrl']);
        self::assertSame(0, self::ballots($draft['id']), 'chaque soumission ouvre un tour de vote vierge');

        $other = self::repo()->createDraft('1.01', '1.2.0');
        self::assertNull(self::governance()->submit($other['id'], null, null)['decidimUrl'], 'lien facultatif');
    }

    #[TestDox('UC-EPI-01-U07 — submit refuse : inconnue (null), déjà au vote, publiée, semver non strictement croissante, lien Decidim invalide, contenu revalidé hors schéma (422)')]
    public function testU07SubmitRefusals(): void
    {
        $publishedId = self::publish('1.01', 'Pensée Critique', 1, '1.0.0');
        self::assertNull(self::governance()->submit(999999, null, null));

        $cases = [
            'publiée' => [$publishedId, null, ConflictException::class, 'déjà publiée'],
        ];
        $lower = self::repo()->createDraft('1.01', '0.9.0');
        $cases['semver inférieure'] = [$lower['id'], null, ConflictException::class, 'strictly increasing'];
        $junk = self::repo()->createDraft('1.01', '1.1.0');
        $cases['lien Decidim'] = [$junk['id'], 'javascript:alert(1)', InvalidDocumentException::class, 'URL http(s) valide'];

        foreach ($cases as $label => [$id, $url, $exception, $message]) {
            try {
                self::governance()->submit($id, $url, null);
                self::fail('soumission acceptée : ' . $label);
            } catch (ConflictException | InvalidDocumentException $e) {
                self::assertInstanceOf($exception, $e, $label);
                self::assertStringContainsString($message, $e->getMessage(), $label);
            }
        }
        self::assertSame('draft', self::repo()->findById($junk['id'])['status'], 'aucune écriture partielle');

        // Étape 9 : la soumission REVALIDE le contenu (défensif : le PUT valide
        // déjà, mais un brouillon écrit avant un durcissement du schéma peut
        // être devenu invalide). Contenu posé en base sans « nom » obligatoire.
        $stale = self::repo()->createDraft('1.01', '1.2.0');
        self::$pdo->prepare('UPDATE competence_versions SET content = ? WHERE id = ?')
            ->execute(['{"identite":{"code":"1.01"}}', $stale['id']]);
        try {
            self::governance()->submit($stale['id'], null, null);
            self::fail('contenu hors schéma soumis au vote');
        } catch (InvalidDocumentException $e) {
            self::assertStringContainsString('ne se conforme pas au schéma competence', $e->getMessage());
            self::assertNotSame([], $e->getErrors(), 'erreurs par pointeur JSON');
        }
        $row = self::$pdo->query('SELECT status, submitted_at FROM competence_versions WHERE id = ' . (int) $stale['id'])->fetch();
        self::assertSame(['draft', null], [$row['status'], $row['submitted_at']], 'rien n’est écrit');

        self::governance()->submit($junk['id'], null, null);
        $this->expectException(ConflictException::class);
        $this->expectExceptionMessage('déjà ouverte au vote');
        self::governance()->submit($junk['id'], null, null);
    }

    #[TestDox('UC-EPI-01-U08 — withdraw : au vote → brouillon, bulletins et méta de soumission effacés ; un brouillon ne se retire pas')]
    public function testU08WithdrawReopensEditing(): void
    {
        self::publish('1.01', 'Pensée Critique', 1, '1.0.0');
        $member = self::createUser('epistemiarque');
        $draft = self::repo()->createDraft('1.01', '1.1.0');
        self::governance()->submit($draft['id'], 'https://participer.harmonia.education/d/1', $member);
        self::governance()->castVote($draft['id'], $member, 'pour', 'ok');

        $withdrawn = self::governance()->withdraw($draft['id']);

        self::assertSame('draft', $withdrawn['status']);
        self::assertNull($withdrawn['submittedAt']);
        self::assertNull($withdrawn['submittedBy']);
        self::assertNull($withdrawn['decidimUrl']);
        self::assertSame(0, self::ballots($draft['id']));
        self::assertNull(self::governance()->withdraw(999999));

        $this->expectException(ConflictException::class);
        $this->expectExceptionMessage('Seule une proposition ouverte au vote peut être retirée');
        self::governance()->withdraw($draft['id']);
    }

    #[TestDox('UC-EPI-01-U09 — DecidimLink::normalize : vide → null, http(s) rogné accepté, autre schéma ou > 500 caractères → 422')]
    public function testU09DecidimLinkNormalization(): void
    {
        self::assertNull(DecidimLink::normalize(null));
        self::assertNull(DecidimLink::normalize('   '));
        self::assertSame('https://participer.harmonia.education/x', DecidimLink::normalize(' https://participer.harmonia.education/x '));
        self::assertSame('HTTP://example.org/debat', DecidimLink::normalize('HTTP://example.org/debat'));

        foreach (['ftp://example.org/x', 'javascript:alert(1)', '/processes/12', 'participer.harmonia.education', 'https://'] as $bad) {
            try {
                DecidimLink::normalize($bad);
                self::fail('lien accepté : ' . $bad);
            } catch (InvalidDocumentException $e) {
                self::assertSame(['/decidimUrl' => ['URL invalide']], $e->getErrors(), $bad);
            }
        }

        $long = 'https://participer.harmonia.education/' . str_repeat('a', 470);
        try {
            DecidimLink::normalize($long);
            self::fail('lien de ' . mb_strlen($long) . ' caractères accepté');
        } catch (InvalidDocumentException $e) {
            self::assertSame(['/decidimUrl' => ['URL trop longue']], $e->getErrors());
        }
    }

    #[TestDox('UC-EPI-01-U10 — editableVersions liste brouillons et propositions (plus récents d’abord) ; metadata() n’expose pas le contenu')]
    public function testU10EditableVersionsAndMetadata(): void
    {
        self::publish('1.01', 'Pensée Critique', 1, '1.0.0');
        self::publish('2.01', 'Écoute', 2, '1.0.0');
        $d1 = self::repo()->createDraft('1.01', '1.1.0');
        $d2 = self::repo()->createDraft('2.01', '1.1.0');
        self::governance()->submit($d2['id'], null, null);

        $editable = self::repo()->editableVersions();

        self::assertSame([$d2['id'], $d1['id']], array_column($editable, 'id'));
        self::assertSame(['review', 'draft'], array_column($editable, 'status'));
        $meta = CompetenceRepository::metadata($editable[0]);
        self::assertSame(
            ['id', 'code', 'semver', 'pole', 'nom', 'status', 'contentHash', 'releaseNote', 'publishedAt', 'submittedAt', 'decidimUrl'],
            array_keys($meta),
        );
    }

    #[TestDox('UC-EPI-01-U11 — RoleGuard : 401 sans session, 403 sans rôle ou rôle retiré (relu à chaque requête), passage pour épistémiarque ou admin')]
    public function testU11RoleGuard(): void
    {
        $guard = RoleGuard::any('epistemiarque', 'admin');
        $handler = new class implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                return (new ResponseFactory())->createResponse(204);
            }
        };
        $request = (new ServerRequestFactory())->createServerRequest('POST', '/api/competences/1.01/drafts');
        $status = static function () use ($guard, $handler, $request): int {
            return $guard->process($request, $handler)->getStatusCode();
        };

        self::assertSame(401, $status());
        $_SESSION['user_id'] = 0;
        self::assertSame(401, $status(), 'identifiant nul = pas de session');

        $_SESSION['user_id'] = self::createUser('apprenant', 'cartographe', 'promptologue');
        self::assertSame(403, $status());
        $denied = $guard->process($request, $handler);
        self::assertSame('{"error":"Forbidden"}', (string) $denied->getBody());

        $member = self::createUser('epistemiarque');
        $_SESSION['user_id'] = $member;
        self::assertSame(204, $status());
        // Même session, rôle retiré par l'administration (UC-ADM-01) : les rôles
        // sont relus en base à CHAQUE requête, le retrait prend effet aussitôt.
        self::$pdo->prepare('DELETE FROM user_roles WHERE user_id = ?')->execute([$member]);
        self::assertSame(403, $status(), 'rôle retiré : refusé dès la requête suivante');

        $_SESSION['user_id'] = (string) self::createUser('admin');
        self::assertSame(204, $status(), 'identifiant de session en chaîne numérique accepté');

        // Branche DÉFENSIVE : la production ne pose jamais users.deleted_at (la
        // purge de compte est un DELETE réel qui emporte les sessions → 401).
        $deleted = self::createUser('epistemiarque');
        self::$pdo->exec('UPDATE users SET deleted_at = NOW() WHERE id = ' . $deleted);
        $_SESSION['user_id'] = $deleted;
        self::assertSame(403, $status(), 'branche défensive : compte marqué deleted_at refusé (état jamais produit par la purge)');
    }

    /**
     * Seconde connexion à la base de test dont prepare() exécute une fois un
     * « crochet » juste avant la requête visée : simule, de façon
     * déterministe, une requête concurrente intercalée entre la vérification et
     * l'écriture d'une transition (fenêtre de course).
     */
    private static function racingConnection(string $sqlPrefix, callable $concurrent): PDO
    {
        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
            Env::get('DB_HOST', 'mysql'),
            Env::get('DB_PORT', '3306'),
            TestDb::name(),
        );

        return new class ($dsn, $sqlPrefix, $concurrent) extends PDO {
            /** @var callable|null */
            private $concurrent;

            public function __construct(string $dsn, private readonly string $sqlPrefix, callable $concurrent)
            {
                parent::__construct($dsn, 'root', Env::get('DB_ROOT_PASSWORD', 'root_dev'), [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]);
                $this->concurrent = $concurrent;
            }

            public function prepare(string $query, array $options = []): PDOStatement|false
            {
                if ($this->concurrent !== null && str_starts_with(ltrim($query), $this->sqlPrefix)) {
                    $concurrent = $this->concurrent;
                    $this->concurrent = null;
                    $concurrent();
                }

                return parent::prepare($query, $options);
            }
        };
    }

    #[TestDox('UC-EPI-01-U22 — Anomalie AN1 (comportement actuel figé) : fork et soumission ne sont pas atomiques — fork concurrent → PDOException (500, pas 409) ; double soumission acceptée, bulletins effacés')]
    public function testU22ForkAndSubmitAreNotAtomic(): void
    {
        self::publish('1.01', 'Pensée Critique', 1, '1.0.0');

        // (1) createDraft : SELECT de doublon PUIS INSERT. Un fork concurrent du
        // même (code, semver) passé entre les deux fait lever la contrainte
        // UNIQUE : PDOException, que routes/competences.php ($wrap) rend en
        // 500 « Internal error » au lieu du 409 attendu (E5).
        $racing = self::racingConnection('INSERT INTO competence_versions', static function (): void {
            self::repo()->createDraft('1.01', '1.1.0');
        });
        try {
            (new CompetenceRepository($racing))->createDraft('1.01', '1.1.0');
            self::fail('le doublon concurrent aurait dû échouer');
        } catch (ConflictException $e) {
            self::fail('comportement corrigé (409) : inverser ce test et mettre à jour AN1 — ' . $e->getMessage());
        } catch (PDOException $e) {
            self::assertSame(1062, $e->errorInfo[1] ?? null, 'violation de la clé unique (code, semver)');
        }
        self::assertSame(1, (int) self::$pdo->query("SELECT COUNT(*) FROM competence_versions WHERE semver = '1.1.0'")->fetchColumn());

        // (2) submit : statut vérifié sur une lecture ANTÉRIEURE, puis
        // UPDATE … WHERE id = ? sans « AND status = 'draft' ». Une soumission
        // concurrente (Bao) et un premier bulletin passés dans la fenêtre ne
        // bloquent pas la seconde soumission : elle réussit (pas de 409) et
        // efface le bulletin, écrasant submitted_by et decidim_url.
        $alix = self::createUser('epistemiarque');
        $bao = self::createUser('epistemiarque');
        $draft = self::repo()->createDraft('1.01', '1.2.0', $alix);
        $racing = self::racingConnection('DELETE FROM competence_votes', static function () use ($draft, $bao): void {
            self::governance()->submit($draft['id'], 'https://participer.harmonia.education/d/bao', $bao);
            self::governance()->castVote($draft['id'], $bao, 'pour', 'Premier bulletin');
        });

        $second = (new CompetenceGovernance($racing))->submit($draft['id'], null, $alix);

        self::assertSame('review', $second['status'], 'seconde soumission acceptée (aucun 409 « déjà ouverte au vote »)');
        self::assertSame(0, self::ballots($draft['id']), 'le bulletin déposé entre-temps est effacé');
        self::assertSame([$alix, null], [$second['submittedBy'], $second['decidimUrl']], 'soumissionnaire et lien de la première soumission écrasés');
    }
}
