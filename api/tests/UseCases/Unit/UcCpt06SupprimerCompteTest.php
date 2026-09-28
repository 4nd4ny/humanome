<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Audit;
use Humanome\Auth\Session;
use Humanome\Auth\Users;
use Humanome\DbSessionHandler;
use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-CPT-06 — Supprimer son compte (droit à l'effacement) : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-06-supprimer-compte.md
 *
 * Briques de DELETE /api/auth/account appelées directement : Users::purge
 * (vrai DELETE, cascades et anonymisations portées par les clés étrangères),
 * Audit::record(account_deleted) et Session::destroy (qui empêche la
 * réécriture d'une session orpheline en fin de requête).
 */
final class UcCpt06SupprimerCompteTest extends TestCase
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
        TestDb::overrideEnv();
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM audit_events');
        self::$pdo->exec('DELETE FROM sessions');
    }

    protected function tearDown(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_abort();
        }
        session_id('');
        $_SESSION = [];
        unset($_COOKIE[DbSessionHandler::SESSION_NAME], $_SERVER['REMOTE_ADDR']);
    }

    private static function newUser(string $email, string $role = 'apprenant'): int
    {
        $id = Users::create(self::$pdo, $email, Users::hashPassword('correct horse battery'), ucfirst(strtok($email, '@')));
        Users::assignRole(self::$pdo, $id, $role);

        return $id;
    }

    private static function rows(string $sql): int
    {
        return (int) self::$pdo->query($sql)->fetchColumn();
    }

    /** Cartographie opt-in de l'apprenant ; renvoie son id. */
    private static function cartography(int $userId): int
    {
        self::$pdo->prepare(
            "INSERT INTO cartographies (user_id, type, titre, visibility, document, opt_in_at)
             VALUES (?, 'jour', 'Journée', 'cartographe', ?, NOW())"
        )->execute([$userId, json_encode(['kind' => 'cartographie-jour'])]);

        return (int) self::$pdo->lastInsertId();
    }

    #[TestDox('UC-CPT-06-U01 — Users::purge : vrai DELETE ; rôles, session, cartographies (+ liens de partage), progression, clés, avatar effacés')]
    public function testU01PurgeCascadesEveryUserOwnedTable(): void
    {
        $ada = self::newUser('ada@example.org');
        $bob = self::newUser('bob@example.org');
        Users::setAvatar(self::$pdo, $ada, "\x89PNG\r\n\x1a\n", 'image/png');
        self::$pdo->prepare('INSERT INTO sessions (id, user_id, data, last_activity) VALUES (?, ?, ?, ?)')->execute(['sid-ada', $ada, '', time()]);
        $carto = self::cartography($ada);
        self::$pdo->prepare('INSERT INTO share_links (cartographie_id, token_hash, password_hash) VALUES (?, ?, ?)')
            ->execute([$carto, hash('sha256', 'jeton'), Users::hashPassword('sesame-employeur')]);
        foreach ([$ada, $bob] as $id) {
            self::$pdo->prepare("INSERT INTO training_progress (user_id, parcours, chapitre) VALUES (?, 'apprenant', '01-a')")->execute([$id]);
            self::$pdo->prepare("INSERT INTO user_api_keys (user_id, provider, encrypted_key) VALUES (?, 'anthropic', 'chiffre')")->execute([$id]);
        }

        Users::purge(self::$pdo, $ada);

        foreach ([
            'users' => "SELECT COUNT(*) FROM users WHERE id = $ada OR email = 'ada@example.org'",
            'user_roles' => "SELECT COUNT(*) FROM user_roles WHERE user_id = $ada",
            'sessions' => "SELECT COUNT(*) FROM sessions WHERE id = 'sid-ada'",
            'cartographies' => "SELECT COUNT(*) FROM cartographies WHERE user_id = $ada",
            'share_links' => "SELECT COUNT(*) FROM share_links WHERE cartographie_id = $carto",
            'training_progress' => "SELECT COUNT(*) FROM training_progress WHERE user_id = $ada",
            'user_api_keys' => "SELECT COUNT(*) FROM user_api_keys WHERE user_id = $ada",
        ] as $table => $sql) {
            self::assertSame(0, self::rows($sql), $table);
        }
        // Les données de Bob ne bougent pas.
        self::assertSame(1, self::rows("SELECT COUNT(*) FROM training_progress WHERE user_id = $bob"));
        self::assertSame(1, self::rows("SELECT COUNT(*) FROM user_api_keys WHERE user_id = $bob"));
        self::assertSame(['apprenant'], Users::rolesOf(self::$pdo, $bob));
    }

    #[TestDox('UC-CPT-06-U02 — audit : account_deleted écrit AVANT la purge survit, anonymisé (user_id NULL), comme les autres traces')]
    public function testU02AuditTrailIsKeptButAnonymized(): void
    {
        $ada = self::newUser('ada@example.org');
        Audit::record(self::$pdo, $ada, Audit::ACCOUNT_CREATED);
        Audit::record(self::$pdo, $ada, 'login', ['pays' => 'FR', 'reseau' => '203.0.113.0/24']);

        self::$pdo->beginTransaction();
        Audit::record(self::$pdo, $ada, Audit::ACCOUNT_DELETED);
        Users::purge(self::$pdo, $ada);
        self::$pdo->commit();

        $events = self::$pdo->query('SELECT type, user_id, details, created_at FROM audit_events ORDER BY id')->fetchAll();
        self::assertSame(['account_created', 'login', 'account_deleted'], array_column($events, 'type'));
        foreach ($events as $event) {
            self::assertNull($event['user_id'], $event['type'] . ' anonymisé');
            self::assertNotEmpty($event['created_at'], 'trace datée');
            self::assertStringNotContainsString('ada@example.org', (string) $event['details']);
        }
        self::assertNull($events[2]['details']);
    }

    #[TestDox('UC-CPT-06-U03 — purge d’un cartographe : liens, annotations et garantie effacés ; révisions de l’apprenant conservées, auteur anonymisé')]
    public function testU03CartographePurgeKeepsTheLearnersHistory(): void
    {
        $maya = self::newUser('maya@example.org');
        $carl = self::newUser('carl@example.org', 'cartographe');
        $carto = self::cartography($maya);
        self::$pdo->prepare('INSERT INTO cartographe_links (apprenant_id, cartographe_id) VALUES (?, ?)')->execute([$maya, $carl]);
        self::$pdo->prepare("INSERT INTO cartography_annotations (cartographie_id, author_id, competence_code, type, texte) VALUES (?, ?, '1.01', 'commentaire', 'À préciser')")
            ->execute([$carto, $carl]);
        self::$pdo->prepare('INSERT INTO cartography_revisions (cartographie_id, author_id, document) VALUES (?, ?, ?)')
            ->execute([$carto, $carl, json_encode(['kind' => 'cartographie-jour', 'v' => 'revisee'])]);
        $revision = (int) self::$pdo->lastInsertId();
        self::$pdo->prepare('INSERT INTO cartography_garanties (cartographie_id, cartographe_id, revision_id, par) VALUES (?, ?, ?, ?)')
            ->execute([$carto, $carl, $revision, 'Carl']);

        Users::purge(self::$pdo, $carl);

        self::assertSame(0, self::rows('SELECT COUNT(*) FROM cartographe_links'));
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM cartography_annotations'));
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM cartography_garanties'));
        self::assertSame(1, self::rows("SELECT COUNT(*) FROM cartographies WHERE id = $carto"), 'la cartographie reste à Maya');
        self::assertNull(self::$pdo->query("SELECT author_id FROM cartography_revisions WHERE id = $revision")->fetchColumn());
    }

    #[TestDox('UC-CPT-06-U04 — Session::destroy après la purge : sans lui, l’écriture de fin de requête recréerait une session orpheline')]
    public function testU04DestroyPreventsAnOrphanSession(): void
    {
        $ada = self::newUser('ada@example.org');
        $_SERVER['REMOTE_ADDR'] = '203.0.113.10';

        // Contre-exemple : purge puis fin de requête « normale » (écriture de session).
        Session::start();
        Session::openForUser($ada);
        $sid = session_id();
        Users::purge(self::$pdo, $ada);
        self::assertSame(0, self::rows("SELECT COUNT(*) FROM sessions WHERE id = '$sid'"), 'cascade');
        session_write_close();
        self::assertSame(1, self::rows("SELECT COUNT(*) FROM sessions WHERE id = '$sid' AND user_id IS NULL"), 'ligne orpheline ressuscitée');
        self::$pdo->exec('DELETE FROM sessions');

        // Ce que fait la route : purge puis Session::destroy().
        $bob = self::newUser('bob@example.org');
        session_id('');
        Session::start();
        Session::openForUser($bob);
        $sid = session_id();
        Users::purge(self::$pdo, $bob);
        Session::destroy();

        self::assertNotSame(PHP_SESSION_ACTIVE, session_status());
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM sessions'), 'aucune session orpheline');
    }
}
