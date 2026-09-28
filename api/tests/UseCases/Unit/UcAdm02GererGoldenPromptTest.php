<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Admin\AdminException;
use Humanome\Admin\GoldenRepository;
use Humanome\Auth\Users;
use Humanome\MigrationRunner;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\BancSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-ADM-02 — Gérer le Golden Prompt et ses accès : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/administration/UC-ADM-02-gerer-golden-prompt.md
 *
 * GoldenRepository (import privé, liste, autorisation, contrôle d'accès) et
 * les chemins de lecture publics de PromptPackageRepository sont appelés
 * directement, sur une vraie base MySQL, sans couche HTTP.
 */
final class UcAdm02GererGoldenPromptTest extends TestCase
{
    use BancSupport;

    private const GOLDEN = 'golden-reference';

    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM prompt_packages');
        self::$pdo->exec('DELETE FROM audit_events');
        self::$pdo->exec('DELETE FROM settings');
    }

    /** @param list<string> $roles */
    private static function user(string $name, array $roles = []): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([strtolower($name) . '@example.org', Users::hashPassword('x-password'), $name]);
        $id = (int) self::$pdo->lastInsertId();
        $bind = self::$pdo->prepare('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?');
        foreach ($roles as $role) {
            $bind->execute([$id, $role]);
        }

        return $id;
    }

    /** @return array<string, mixed> Golden = paquet fixture re-slugué, privé. */
    private static function golden(array $overrides = []): array
    {
        return self::bancPackage(array_merge(['id' => self::GOLDEN, 'description' => 'Golden de référence (privé).'], $overrides));
    }

    private static function packageId(): int
    {
        return (int) self::$pdo->query("SELECT id FROM prompt_packages WHERE slug = '" . self::GOLDEN . "'")->fetchColumn();
    }

    private static function repo(): GoldenRepository
    {
        return new GoldenRepository(self::$pdo);
    }

    /** @return list<array{type: string, userId: int|null, details: mixed}> */
    private static function audits(string $type): array
    {
        $stmt = self::$pdo->prepare('SELECT user_id, details FROM audit_events WHERE type = ? ORDER BY id');
        $stmt->execute([$type]);

        return array_map(static fn (array $r): array => [
            'type' => $type,
            'userId' => $r['user_id'] === null ? null : (int) $r['user_id'],
            'details' => json_decode((string) $r['details'], true),
        ], $stmt->fetchAll());
    }

    #[TestDox('UC-ADM-02-U01 — import : paquet PRIVÉ publié, idempotent par empreinte, audit par identifiants seulement')]
    public function testU01ImportIsPrivatePublishedIdempotentAndAudited(): void
    {
        $admin = self::user('Root', ['admin']);

        $first = self::repo()->import($admin, self::golden());
        self::assertSame('imported', $first['status']);
        self::assertSame([self::GOLDEN, '1.0.0'], [$first['id'], $first['version']]);
        self::assertSame(PromptPackageRepository::contentHash(self::golden()), $first['contentHash']);

        $row = self::$pdo->query("SELECT pp.is_private, pv.status FROM prompt_packages pp JOIN prompt_versions pv ON pv.package_id = pp.id WHERE pp.slug = '" . self::GOLDEN . "'")->fetch();
        self::assertSame([1, 'published'], [(int) $row['is_private'], $row['status']]);

        self::assertSame('unchanged', self::repo()->import($admin, self::golden())['status']);
        $audits = self::audits('golden_imported');
        self::assertCount(1, $audits, 'un ré-import identique n’est pas un nouvel import');
        self::assertSame($admin, $audits[0]['userId']);
        // Colonne JSON MySQL : ordre des clés non conservé -> comparaison par égalité.
        self::assertEquals(['packageId' => self::packageId(), 'version' => '1.0.0'], $audits[0]['details']);
    }

    #[TestDox('UC-ADM-02-U02 — import refusé : document invalide (422), version existante au contenu différent (409), slug public (409)')]
    public function testU02ImportRefusals(): void
    {
        $admin = self::user('Root', ['admin']);
        $cases = [];
        try {
            self::repo()->import($admin, self::golden(['prompts' => []]));
        } catch (AdminException $e) {
            $cases['invalide'] = [$e->getStatusCode(), $e->getMessage()];
        }

        self::repo()->import($admin, self::golden());
        try {
            self::repo()->import($admin, self::golden(['description' => 'Contenu modifié']));
        } catch (AdminException $e) {
            $cases['immuable'] = [$e->getStatusCode(), $e->getMessage()];
        }

        (new PromptPackageRepository(self::$pdo))->importPublishedDocument(self::bancPackage());
        try {
            self::repo()->import($admin, self::golden(['id' => 'aurora-demo']));
        } catch (AdminException $e) {
            $cases['slug-public'] = [$e->getStatusCode(), $e->getMessage()];
        }

        self::assertSame([422, 'Document prompt-package invalide'], $cases['invalide']);
        self::assertSame(409, $cases['immuable'][0]);
        self::assertStringContainsString('versions immuables', $cases['immuable'][1]);
        self::assertSame(409, $cases['slug-public'][0]);
        self::assertStringContainsString('identifiant distinct', $cases['slug-public'][1]);
    }

    #[TestDox('UC-ADM-02-U03 — list : métadonnées seulement (jamais les gabarits), versions dans l’ordre, autorisations nommées')]
    public function testU03ListExposesMetadataAndGrantsOnly(): void
    {
        $admin = self::user('Root', ['admin']);
        $pom = self::user('Pom', ['promptologue']);
        self::repo()->import($admin, self::golden());
        self::repo()->import($admin, self::golden(['version' => '1.1.0']));
        self::repo()->grant($admin, self::GOLDEN, $pom);

        $list = self::repo()->list();

        self::assertCount(1, $list);
        self::assertSame(['id', 'packageId', 'description', 'versions', 'grants'], array_keys($list[0]));
        self::assertSame(['1.0.0', '1.1.0'], $list[0]['versions']);
        self::assertSame($pom, $list[0]['grants'][0]['userId']);
        self::assertSame(['Pom', 'pom@example.org'], [$list[0]['grants'][0]['displayName'], $list[0]['grants'][0]['email']]);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $list[0]['grants'][0]['createdAt']);
        $texte = self::golden()['prompts'][0]['texte'];
        self::assertStringNotContainsString(mb_substr($texte, 0, 40), json_encode($list, JSON_UNESCAPED_UNICODE));
    }

    #[TestDox('UC-ADM-02-U04 — grant : accordé puis inchangé (un seul audit), réservé aux promptologues, 404 si Golden ou compte inconnu')]
    public function testU04GrantRules(): void
    {
        $admin = self::user('Root', ['admin']);
        $pom = self::user('Pom', ['promptologue']);
        $etab = self::user('Lycee', ['etablissement']);
        $parti = self::user('Parti', ['promptologue']);
        self::$pdo->exec('UPDATE users SET deleted_at = NOW() WHERE id = ' . $parti);
        self::repo()->import($admin, self::golden());

        self::assertSame(['status' => 'granted', 'id' => self::GOLDEN, 'userId' => $pom], self::repo()->grant($admin, self::GOLDEN, $pom));
        self::assertSame('unchanged', self::repo()->grant($admin, self::GOLDEN, $pom)['status']);
        self::assertCount(1, self::audits('golden_access_granted'));
        $details = self::audits('golden_access_granted')[0]['details'];
        self::assertEquals(['packageId' => self::packageId(), 'targetUserId' => $pom], $details);
        self::assertTrue(self::repo()->hasAccess($pom, self::GOLDEN));

        $statuses = [];
        foreach ([[self::GOLDEN, $etab], ['inconnu', $pom], [self::GOLDEN, 999999], [self::GOLDEN, $parti]] as [$slug, $target]) {
            try {
                self::repo()->grant($admin, $slug, $target);
                $statuses[] = 200;
            } catch (AdminException $e) {
                $statuses[] = $e->getStatusCode();
            }
        }
        self::assertSame([422, 404, 404, 404], $statuses);
        self::assertFalse(self::repo()->hasAccess($etab, self::GOLDEN));
    }

    #[TestDox('UC-ADM-02-U05 — invisibilité : aucun chemin de lecture public ne voit le Golden (liste, document, défaut, publication, fork)')]
    public function testU05PublicReadPathsNeverSeeThePrivatePackage(): void
    {
        $admin = self::user('Root', ['admin']);
        $pom = self::user('Pom', ['promptologue']);
        self::repo()->import($admin, self::golden());
        self::repo()->grant($admin, self::GOLDEN, $pom); // même AUTORISÉ
        $packages = new PromptPackageRepository(self::$pdo);

        self::assertSame([], $packages->listPublished());
        self::assertNull($packages->findPublished(self::GOLDEN, '1.0.0'));
        self::assertNull($packages->latestPublishedAnyPackage());
        self::assertFalse($packages->isPublished(self::GOLDEN, '1.0.0'));
        self::assertNull($packages->createDraft(self::GOLDEN, '1.0.0', '9.9.9', $pom));
    }

    #[TestDox('UC-ADM-02-U06 — purge RGPD : l’autorisation disparaît avec le promptologue ou le paquet ; survit, anonymisée, à l’admin')]
    public function testU06GrantsFollowAccountAndPackagePurges(): void
    {
        $admin = self::user('Root', ['admin']);
        $pom = self::user('Pom', ['promptologue']);
        $noe = self::user('Noe', ['promptologue']);
        self::repo()->import($admin, self::golden());
        self::repo()->grant($admin, self::GOLDEN, $pom);
        self::repo()->grant($admin, self::GOLDEN, $noe);

        Users::purge(self::$pdo, $admin);
        self::assertSame([null, null], self::$pdo->query('SELECT granted_by FROM golden_grants')->fetchAll(PDO::FETCH_COLUMN));
        self::assertCount(2, self::repo()->list()[0]['grants']);

        Users::purge(self::$pdo, $pom);
        self::assertSame([$noe], array_column(self::repo()->list()[0]['grants'], 'userId'));

        self::$pdo->exec("DELETE FROM prompt_packages WHERE slug = '" . self::GOLDEN . "'");
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM golden_grants')->fetchColumn());
    }
}
