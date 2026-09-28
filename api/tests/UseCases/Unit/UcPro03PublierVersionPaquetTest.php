<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Packages\PackageConflictException;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Referentiel\Semver;
use Humanome\Tests\UseCases\Support\ProSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-PRO-03 — Publier une version de paquet (immuable) : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/promptologue/UC-PRO-03-publier-version-paquet.md
 *
 * PromptPackageRepository::publishDraft appelé directement (transaction,
 * semver strictement croissant par paquet, entrée de changelog, horodatage,
 * défense en profondeur sur les paquets réservés) et Semver (précédence
 * semver 2.0.0 utilisée par la règle de croissance).
 */
final class UcPro03PublierVersionPaquetTest extends TestCase
{
    private static PDO $pdo;

    private int $pom = 0;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = ProSupport::freshPdo();
    }

    protected function setUp(): void
    {
        ProSupport::reset(self::$pdo);
        ProSupport::publish(self::$pdo); // aurora-demo 1.0.0
        $this->pom = ProSupport::user(self::$pdo);
    }

    private static function repo(): PromptPackageRepository
    {
        return new PromptPackageRepository(self::$pdo);
    }

    private function draft(string $version, string $from = '1.0.0'): int
    {
        return (int) self::repo()->createDraft(ProSupport::PKG, $from, $version, $this->pom)['draftId'];
    }

    private static function conflict(callable $call): string
    {
        try {
            $call();
        } catch (PackageConflictException $e) {
            return $e->getMessage();
        }
        self::fail('PackageConflictException attendue');
    }

    /** @return array{status: string, published_at: ?string, changelog: ?string, content: array<string, mixed>} */
    private static function row(int $id): array
    {
        $row = self::$pdo->query('SELECT status, published_at, changelog, content FROM prompt_versions WHERE id = ' . $id)->fetch();
        $row['content'] = json_decode((string) $row['content'], true);

        return $row;
    }

    #[TestDox('UC-PRO-03-U01 — publishDraft : statut publié, date, entrée de changelog, publieLe, description du paquet mise à jour')]
    public function testU01PublishDraftFreezesTheVersion(): void
    {
        $draftId = $this->draft('1.1.0');
        $doc = self::repo()->findDraft($draftId, $this->pom)['document'];
        $doc['description'] = 'Extraction resserrée.';
        self::repo()->updateDraft($draftId, $doc, $this->pom);

        $result = self::repo()->publishDraft($draftId, 'Consigne de citation renforcée.', $this->pom);

        self::assertSame(['id' => 'aurora-demo', 'version' => '1.1.0', 'status' => 'published'], $result);
        $row = self::row($draftId);
        self::assertSame('published', $row['status']);
        self::assertNotNull($row['published_at']);
        self::assertSame('Consigne de citation renforcée.', $row['changelog']);
        // Colonne JSON MySQL : l'ordre des clés n'est pas conservé.
        self::assertEquals(
            ['version' => '1.1.0', 'date' => date('Y-m-d'), 'description' => 'Consigne de citation renforcée.'],
            end($row['content']['changelog']),
        );
        self::assertCount(2, $row['content']['changelog'], 'l’historique de la source est conservé');
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T/', $row['content']['metadata']['publieLe']);
        self::assertSame('Extraction resserrée.', self::$pdo->query("SELECT description FROM prompt_packages WHERE slug = 'aurora-demo'")->fetchColumn());
        self::assertTrue(self::repo()->isPublished(ProSupport::PKG, '1.1.0'));
        self::assertNull(self::repo()->findDraft($draftId, $this->pom), 'ce n’est plus un brouillon');
    }

    #[TestDox('UC-PRO-03-U02 — changelog déterministe : une entrée préexistante pour la même version est remplacée, pas dupliquée')]
    public function testU02ChangelogEntryForTheSameVersionIsReplaced(): void
    {
        $draftId = $this->draft('1.1.0');
        $doc = self::repo()->findDraft($draftId, $this->pom)['document'];
        $doc['changelog'][] = ['version' => '1.1.0', 'description' => 'Brouillon de note, à remplacer'];
        self::repo()->updateDraft($draftId, $doc, $this->pom);

        self::repo()->publishDraft($draftId, 'Note définitive', $this->pom);

        $entries = array_values(array_filter(self::row($draftId)['content']['changelog'], static fn (array $e): bool => $e['version'] === '1.1.0'));
        self::assertEquals([['version' => '1.1.0', 'date' => date('Y-m-d'), 'description' => 'Note définitive']], $entries);
    }

    #[TestDox('UC-PRO-03-U03 — semver strictement croissant par paquet : inférieur, égal ou « égal + métadonnées de build » refusés ; pré-version acceptée')]
    public function testU03SemverMustBeStrictlyGreaterThanEveryPublishedVersion(): void
    {
        $lower = $this->draft('0.9.0');
        self::assertSame(
            'Semver must be strictly increasing: 0.9.0 is not greater than published 1.0.0',
            self::conflict(fn () => self::repo()->publishDraft($lower, 'Retour arrière', $this->pom)),
        );
        $build = $this->draft('1.0.0+build.2'); // créneau distinct, même précédence
        self::conflict(fn () => self::repo()->publishDraft($build, 'Build', $this->pom));

        $rc = $this->draft('1.1.0-rc.1');
        self::assertSame('published', self::repo()->publishDraft($rc, 'Pré-version', $this->pom)['status']);
        $final = $this->draft('1.1.0', '1.1.0-rc.1');
        self::assertSame('published', self::repo()->publishDraft($final, 'Version finale', $this->pom)['status']);
        // 1.0.5 < 1.1.0 désormais publiée.
        $late = $this->draft('1.0.5');
        self::conflict(fn () => self::repo()->publishDraft($late, 'Trop tard', $this->pom));
    }

    #[TestDox('UC-PRO-03-U04 — Semver : précédence semver 2.0.0 (pré-versions, identifiants numériques, build ignoré)')]
    public function testU04SemverPrecedence(): void
    {
        self::assertTrue(Semver::isValid('1.2.3-rc.1+build.5'));
        self::assertFalse(Semver::isValid('01.2.3'));
        self::assertFalse(Semver::isValid('1.2'));
        self::assertTrue(Semver::greaterThan('1.0.0', '1.0.0-rc.9'));
        self::assertTrue(Semver::greaterThan('1.0.0-rc.10', '1.0.0-rc.9'), 'identifiants numériques comparés en nombres');
        self::assertTrue(Semver::greaterThan('1.0.0-beta', '1.0.0-2'), 'numérique < alphanumérique');
        self::assertTrue(Semver::greaterThan('1.0.0-alpha.1', '1.0.0-alpha'));
        self::assertSame(0, Semver::compare('1.0.0+a', '1.0.0+b'));
        self::assertTrue(Semver::greaterThan('10.0.0', '9.9.9'));
    }

    #[TestDox('UC-PRO-03-U05 — brouillon inconnu ou d’autrui → null ; version déjà publiée → conflit')]
    public function testU05UnknownForeignOrAlreadyPublished(): void
    {
        $draftId = $this->draft('1.1.0');
        $zoe = ProSupport::user(self::$pdo, 'Zoé');

        self::assertNull(self::repo()->publishDraft(999999, 'x', $this->pom));
        self::assertNull(self::repo()->publishDraft($draftId, 'x', $zoe));
        self::assertSame('draft', self::row($draftId)['status']);

        self::repo()->publishDraft($draftId, 'Première', $this->pom);
        self::assertSame(
            'This version is already published (published versions are immutable)',
            self::conflict(fn () => self::repo()->publishDraft($draftId, 'Seconde', $this->pom)),
        );
        self::assertSame('Première', self::row($draftId)['changelog']);
    }

    #[TestDox('UC-PRO-03-U06 — défense en profondeur : un brouillon marqué reserved n’est jamais publié (et reste intact)')]
    public function testU06ReservedDraftIsNeverPublished(): void
    {
        $draftId = $this->draft('1.1.0');
        $doc = self::repo()->findDraft($draftId, $this->pom)['document'];
        $doc['metadata']['reserved'] = true;
        self::repo()->updateDraft($draftId, $doc, $this->pom);

        self::assertSame(
            'Ce paquet est réservé au pipeline source-unique : forkez-le sous un nouveau nom.',
            self::conflict(fn () => self::repo()->publishDraft($draftId, 'Tentative', $this->pom)),
        );
        $row = self::row($draftId);
        self::assertSame('draft', $row['status']);
        self::assertNull($row['published_at']);
        self::assertFalse(self::$pdo->inTransaction(), 'transaction annulée');
    }

    #[TestDox('UC-PRO-03-U07 — première publication d’un fork renommé : aucune version antérieure dans SON paquet, la copie reste non réservée')]
    public function testU07FirstPublicationOfARenamedFork(): void
    {
        ProSupport::publish(self::$pdo, ProSupport::reservedDoc());
        $fork = self::repo()->createDraft(ProSupport::RESERVED, '1.0.0', '1.0.0', $this->pom, 'mon-twin6');

        self::assertSame(
            ['id' => 'mon-twin6', 'version' => '1.0.0', 'status' => 'published'],
            self::repo()->publishDraft((int) $fork['draftId'], 'Ma copie', $this->pom),
        );
        $reserved = array_column(self::repo()->listPublished(), 'reserved', 'id');
        self::assertSame(['aurora-demo' => false, 'mon-twin6' => false, 'twin6-ouverte' => true], $reserved);
    }
}
