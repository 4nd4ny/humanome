<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Packages\InvalidPackageException;
use Humanome\Packages\PackageConflictException;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Referentiel\Semver;
use Humanome\Tests\UseCases\Support\ProSupport;
use PDO;
use PDOException;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-PRO-02 — Créer et éditer un brouillon de paquet de prompts : tests
 * UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/promptologue/UC-PRO-02-editer-brouillon-paquet.md
 *
 * PromptPackageRepository appelé directement (sans couche HTTP) : dérivation
 * d'un brouillon (createDraft, y compris le fork renommé d'un paquet réservé),
 * lecture à portée de l'auteur (listDrafts, findDraft), réécriture validée au
 * schéma (updateDraft), exceptions typées (InvalidPackageException,
 * PackageConflictException).
 */
final class UcPro02EditerBrouillonPaquetTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = ProSupport::freshPdo();
    }

    protected function setUp(): void
    {
        ProSupport::reset(self::$pdo);
        ProSupport::publish(self::$pdo); // aurora-demo 1.0.0
    }

    private static function repo(): PromptPackageRepository
    {
        return new PromptPackageRepository(self::$pdo);
    }

    /** @return array<string, string[]> erreurs de l'exception attendue */
    private static function invalid(callable $call): array
    {
        try {
            $call();
        } catch (InvalidPackageException $e) {
            return $e->getErrors();
        }
        self::fail('InvalidPackageException attendue');
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

    #[TestDox('UC-PRO-02-U01 — createDraft : copie de la version source, version remplacée, publieLe retiré, modifieLe posé, auteur enregistré')]
    public function testU01CreateDraftCopiesThePublishedSource(): void
    {
        $author = ProSupport::user(self::$pdo);

        $draft = self::repo()->createDraft(ProSupport::PKG, '1.0.0', '1.1.0', $author);

        self::assertNotNull($draft);
        self::assertSame(['draftId', 'id', 'version', 'status', 'createdAt', 'document'], array_keys($draft));
        self::assertSame(['aurora-demo', '1.1.0', 'draft'], [$draft['id'], $draft['version'], $draft['status']]);
        $doc = $draft['document'];
        self::assertSame('1.1.0', $doc['version']);
        self::assertArrayNotHasKey('publieLe', $doc['metadata'], 'un brouillon n’est pas publié');
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/', $doc['metadata']['modifieLe']);
        // Tout le reste est copié tel quel (prompts, code, changelog de la source).
        $expected = ProSupport::packageDoc(['version' => '1.1.0']);
        unset($expected['metadata']['publieLe'], $doc['metadata']['modifieLe']);
        self::assertEquals($expected, $doc);

        $row = self::$pdo->query('SELECT status, created_by FROM prompt_versions WHERE id = ' . (int) $draft['draftId'])->fetch();
        self::assertSame(['status' => 'draft', 'created_by' => $author], ['status' => $row['status'], 'created_by' => (int) $row['created_by']]);
    }

    #[TestDox('UC-PRO-02-U02 — createDraft : semver invalide → InvalidPackageException sur /version')]
    public function testU02CreateDraftRejectsAnInvalidSemver(): void
    {
        $author = ProSupport::user(self::$pdo);

        $errors = self::invalid(static fn () => self::repo()->createDraft(ProSupport::PKG, '1.0.0', 'v2', $author));

        self::assertSame(['/version' => ['Version semver invalide']], $errors);
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM prompt_versions')->fetchColumn());
    }

    #[TestDox('UC-PRO-02-U03 — createDraft : source inconnue, brouillon d’autrui ou paquet privé → null ; son propre brouillon est une source valide')]
    public function testU03CreateDraftSourceLookupIsOwnerScoped(): void
    {
        $pom = ProSupport::user(self::$pdo, 'Pom');
        $zoe = ProSupport::user(self::$pdo, 'Zoé');
        ProSupport::importGolden(self::$pdo, ProSupport::user(self::$pdo, 'Root', ['admin']));
        $own = self::repo()->createDraft(ProSupport::PKG, '1.0.0', '1.1.0', $pom);
        // Le brouillon source est retouché : la dérivation doit copier CE contenu.
        $retouched = $own['document'];
        $retouched['description'] = 'Retouche 1.1.0';
        self::repo()->updateDraft($own['draftId'], $retouched, $pom);

        self::assertNull(self::repo()->createDraft(ProSupport::PKG, '9.9.9', '10.0.0', $pom), 'inconnue');
        self::assertNull(self::repo()->createDraft(ProSupport::PKG, '1.1.0', '1.2.0', $zoe), 'brouillon d’autrui');
        self::assertNull(self::repo()->createDraft(ProSupport::GOLDEN, '1.0.0', '1.1.0', $pom), 'Golden privé');

        $fromOwn = self::repo()->createDraft(ProSupport::PKG, '1.1.0', '1.2.0', $pom);
        self::assertNotNull($fromOwn);
        self::assertSame('1.2.0', $fromOwn['document']['version']);
        self::assertSame('Retouche 1.1.0', $fromOwn['document']['description'], 'contenu copié du brouillon source, pas de la version publiée');
    }

    #[TestDox('UC-PRO-02-U04 — createDraft : version déjà prise dans le paquet (publiée ou brouillon) → PackageConflictException')]
    public function testU04CreateDraftRefusesAnExistingVersion(): void
    {
        $pom = ProSupport::user(self::$pdo, 'Pom');
        $zoe = ProSupport::user(self::$pdo, 'Zoé');
        self::repo()->createDraft(ProSupport::PKG, '1.0.0', '1.1.0', $pom);

        self::assertSame(
            'Version 1.0.0 of prompt package "aurora-demo" already exists',
            self::conflict(static fn () => self::repo()->createDraft(ProSupport::PKG, '1.0.0', '1.0.0', $pom)),
        );
        // Le créneau d'un brouillon (même d'un autre auteur) est occupé.
        self::conflict(static fn () => self::repo()->createDraft(ProSupport::PKG, '1.0.0', '1.1.0', $zoe));
    }

    #[TestDox('UC-PRO-02-U05 — createDraft d’un paquet réservé : renommage obligatoire (toId neuf, kebab-case) ; copie non réservée avec forkedFrom')]
    public function testU05ReservedSourceIsForkedUnderANewName(): void
    {
        $pom = ProSupport::user(self::$pdo);
        ProSupport::publish(self::$pdo, ProSupport::reservedDoc());
        ProSupport::importGolden(self::$pdo, ProSupport::user(self::$pdo, 'Root', ['admin']));
        $fork = static fn (?string $toId) => self::repo()->createDraft(ProSupport::RESERVED, '1.0.0', '1.0.0', $pom, $toId);

        self::assertArrayHasKey('/toId', self::invalid(static fn () => $fork(null)));
        self::assertArrayHasKey('/toId', self::invalid(static fn () => $fork('  ')));
        self::assertArrayHasKey('/toId', self::invalid(static fn () => $fork(ProSupport::RESERVED)));
        self::assertArrayHasKey('/toId', self::invalid(static fn () => $fork('Mon Twin6')));
        self::assertArrayHasKey('/toId', self::invalid(static fn () => $fork(str_repeat('a', 65))));
        self::assertStringContainsString('existe déjà', self::conflict(static fn () => $fork(ProSupport::PKG)));
        self::conflict(static fn () => $fork(ProSupport::GOLDEN)); // même un nom privé est pris

        $draft = $fork('mon-twin6');
        self::assertNotNull($draft);
        self::assertSame('mon-twin6', $draft['id']);
        self::assertSame('mon-twin6', $draft['document']['id']);
        self::assertArrayNotHasKey('reserved', $draft['document']['metadata']);
        // Colonne JSON MySQL : l'ordre des clés n'est pas conservé.
        self::assertEquals(['id' => 'twin6-ouverte', 'version' => '1.0.0'], $draft['document']['metadata']['forkedFrom']);
        self::assertSame(0, (int) self::$pdo->query(
            "SELECT COUNT(*) FROM prompt_versions pv JOIN prompt_packages pp ON pp.id = pv.package_id
              WHERE pp.slug = 'twin6-ouverte' AND pv.status = 'draft'"
        )->fetchColumn(), 'aucun brouillon sous le nom réservé');

        // toId est ignoré pour une source NON réservée : l'id reste invariant.
        $plain = self::repo()->createDraft(ProSupport::PKG, '1.0.0', '1.5.0', $pom, 'autre-nom');
        self::assertSame(ProSupport::PKG, $plain['document']['id']);
    }

    #[TestDox('UC-PRO-02-U06 — listDrafts : les brouillons de l’auteur seulement, métadonnées sans document')]
    public function testU06ListDraftsIsOwnerScopedMetadata(): void
    {
        $pom = ProSupport::user(self::$pdo, 'Pom');
        $zoe = ProSupport::user(self::$pdo, 'Zoé');
        $first = self::repo()->createDraft(ProSupport::PKG, '1.0.0', '1.1.0', $pom);
        self::repo()->createDraft(ProSupport::PKG, '1.0.0', '1.2.0', $zoe);
        $second = self::repo()->createDraft(ProSupport::PKG, '1.0.0', '1.3.0', $pom);

        $list = self::repo()->listDrafts($pom);

        self::assertSame([$first['draftId'], $second['draftId']], array_column($list, 'draftId'));
        self::assertSame(['draftId', 'id', 'version', 'description', 'createdAt'], array_keys($list[0]));
        self::assertSame(ProSupport::packageDoc()['description'], $list[0]['description']);
        self::assertSame([], self::repo()->listDrafts(ProSupport::user(self::$pdo, 'Nouveau')));
    }

    #[TestDox('UC-PRO-02-U07 — findDraft : document pour l’auteur ; null pour autrui, id inconnu ou version publiée')]
    public function testU07FindDraftIsOwnerScoped(): void
    {
        $pom = ProSupport::user(self::$pdo, 'Pom');
        $zoe = ProSupport::user(self::$pdo, 'Zoé');
        $draft = self::repo()->createDraft(ProSupport::PKG, '1.0.0', '1.1.0', $pom);
        $publishedId = (int) self::$pdo->query("SELECT id FROM prompt_versions WHERE status = 'published'")->fetchColumn();

        self::assertSame($draft['draftId'], self::repo()->findDraft($draft['draftId'], $pom)['draftId']);
        self::assertNull(self::repo()->findDraft($draft['draftId'], $zoe));
        self::assertNull(self::repo()->findDraft(999999, $pom));
        self::assertNull(self::repo()->findDraft($publishedId, $pom));
    }

    #[TestDox('UC-PRO-02-U08 — updateDraft : remplace le document, met modifieLe à jour, la version peut changer')]
    public function testU08UpdateDraftReplacesTheDocument(): void
    {
        $pom = ProSupport::user(self::$pdo);
        $draft = self::repo()->createDraft(ProSupport::PKG, '1.0.0', '1.1.0', $pom);
        $doc = $draft['document'];
        $doc['version'] = '1.2.0';
        $doc['prompts'][0]['texte'] .= "\nConsigne ajoutée.";
        $doc['metadata']['modifieLe'] = '2000-01-01T00:00:00+00:00';

        $updated = self::repo()->updateDraft($draft['draftId'], $doc, $pom);

        self::assertSame($draft['draftId'], $updated['draftId']);
        self::assertSame('1.2.0', $updated['version'], 'colonne semver suivie');
        self::assertStringEndsWith('Consigne ajoutée.', $updated['document']['prompts'][0]['texte']);
        self::assertNotSame('2000-01-01T00:00:00+00:00', $updated['document']['metadata']['modifieLe'], 'horodaté par le serveur');
    }

    #[TestDox('UC-PRO-02-U09 — updateDraft : schéma invalide, id changé → InvalidPackageException ; collision ou version publiée → conflit ; autrui → null')]
    public function testU09UpdateDraftGuards(): void
    {
        $pom = ProSupport::user(self::$pdo, 'Pom');
        $zoe = ProSupport::user(self::$pdo, 'Zoé');
        $draft = self::repo()->createDraft(ProSupport::PKG, '1.0.0', '1.1.0', $pom);
        $doc = $draft['document'];

        $noPrompt = $doc;
        $noPrompt['prompts'] = [];
        self::assertArrayHasKey('/prompts', self::invalid(static fn () => self::repo()->updateDraft($draft['draftId'], $noPrompt, $pom)));

        $renamed = $doc;
        $renamed['id'] = 'autre-paquet';
        self::assertSame(
            ['/id' => ['L\'identifiant du paquet ne peut pas changer (attendu « aurora-demo »)']],
            self::invalid(static fn () => self::repo()->updateDraft($draft['draftId'], $renamed, $pom)),
        );

        $collision = $doc;
        $collision['version'] = '1.0.0';
        self::conflict(static fn () => self::repo()->updateDraft($draft['draftId'], $collision, $pom));

        self::assertNull(self::repo()->updateDraft($draft['draftId'], $doc, $zoe));

        self::repo()->publishDraft($draft['draftId'], 'Publication', $pom);
        self::assertSame(
            'Published versions are immutable: create a new draft instead',
            self::conflict(static fn () => self::repo()->updateDraft($draft['draftId'], $doc, $pom)),
        );
    }

    #[TestDox('UC-PRO-02-U10 — limite : pas de concurrence optimiste, le dernier enregistrement l’emporte (comportement figé)')]
    public function testU10LastWriteWins(): void
    {
        $pom = ProSupport::user(self::$pdo);
        $draft = self::repo()->createDraft(ProSupport::PKG, '1.0.0', '1.1.0', $pom);
        $tabA = $draft['document'];
        $tabB = $draft['document'];
        $tabA['description'] = 'Onglet A';
        $tabB['description'] = 'Onglet B';

        self::repo()->updateDraft($draft['draftId'], $tabA, $pom);
        self::repo()->updateDraft($draft['draftId'], $tabB, $pom); // aucune détection du conflit

        self::assertSame('Onglet B', self::repo()->findDraft($draft['draftId'], $pom)['document']['description']);
    }

    #[TestDox('UC-PRO-02-U11 — anomalie : suppression du compte auteur → brouillon orphelin invisible qui réserve encore sa version (comportement figé)')]
    public function testU11OrphanDraftAfterAuthorPurgeKeepsItsVersionSlot(): void
    {
        $pom = ProSupport::user(self::$pdo, 'Pom');
        $zoe = ProSupport::user(self::$pdo, 'Zoé');
        self::repo()->createDraft(ProSupport::PKG, '1.0.0', '1.1.0', $pom);

        self::$pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$pom]); // Users::purge

        $orphan = self::$pdo->query("SELECT status, created_by FROM prompt_versions WHERE semver = '1.1.0'")->fetch();
        self::assertSame('draft', $orphan['status'], 'le brouillon survit (FK SET NULL)');
        self::assertNull($orphan['created_by']);
        self::conflict(static fn () => self::repo()->createDraft(ProSupport::PKG, '1.0.0', '1.1.0', $zoe));
    }

    #[TestDox('UC-PRO-02-U12 — anomalie : toId entouré d’espaces → paquet « mon-twin6 » mais document « ␣mon-twin6␣ » non trimé (comportement figé)')]
    public function testU12UntrimmedToIdDivergesFromThePackageSlug(): void
    {
        $pom = ProSupport::user(self::$pdo);
        ProSupport::publish(self::$pdo, ProSupport::reservedDoc());

        $draft = self::repo()->createDraft(ProSupport::RESERVED, '1.0.0', '1.0.0', $pom, ' mon-twin6 ');

        // Le slug du paquet créé est trimé, l'id du document ne l'est pas.
        self::assertSame('mon-twin6', $draft['id']);
        self::assertSame(' mon-twin6 ', $draft['document']['id']);
        // Réenregistrer le document tel quel échoue (« l'identifiant ne peut pas changer »)…
        self::assertArrayHasKey('/id', self::invalid(static fn () => self::repo()->updateDraft($draft['draftId'], $draft['document'], $pom)));
        // … mais la publication passe et sert un document dont l'id diffère du paquet.
        self::repo()->publishDraft($draft['draftId'], 'Copie', $pom);
        self::assertSame(' mon-twin6 ', self::repo()->findPublished('mon-twin6', '1.0.0')['id']);
    }

    #[TestDox('UC-PRO-02-U21 — anomalie AN-5 (comportement actuel figé) : semver valide de plus de 32 caractères → PDOException ; fork réservé : paquet vide orphelin qui bloque le nom')]
    public function testU21OverlongVersionBreaksCreationAndOrphansTheForkPackage(): void
    {
        $pom = ProSupport::user(self::$pdo);
        ProSupport::publish(self::$pdo, ProSupport::reservedDoc());
        $long = '1.0.0-' . str_repeat('a', 30); // 36 caractères
        self::assertTrue(Semver::isValid($long), 'semver valide, aucune borne de longueur');

        // Brouillon ordinaire : l'INSERT échoue (prompt_versions.semver VARCHAR(32), MySQL strict).
        $error = self::pdoError(static fn () => self::repo()->createDraft(ProSupport::PKG, '1.0.0', $long, $pom));
        self::assertSame('22001', (string) $error->getCode(), 'données trop longues');
        self::assertSame(0, (int) self::$pdo->query("SELECT COUNT(*) FROM prompt_versions WHERE status = 'draft'")->fetchColumn());

        // Fork réservé : le paquet « mon-twin6 » est créé AVANT l'échec (pas de transaction)…
        self::pdoError(static fn () => self::repo()->createDraft(ProSupport::RESERVED, '1.0.0', $long, $pom, 'mon-twin6'));
        $orphan = self::$pdo->query(
            "SELECT COUNT(DISTINCT pp.id) AS packages, COUNT(pv.id) AS versions
               FROM prompt_packages pp LEFT JOIN prompt_versions pv ON pv.package_id = pp.id
              WHERE pp.slug = 'mon-twin6'"
        )->fetch();
        self::assertSame([1, 0], [(int) $orphan['packages'], (int) $orphan['versions']], 'paquet vide orphelin');
        // … et le nom reste pris : un nouvel essai, même avec une version valide, est refusé.
        self::assertSame(
            'Un paquet nommé « mon-twin6 » existe déjà — choisissez un autre nom pour votre copie.',
            self::conflict(static fn () => self::repo()->createDraft(ProSupport::RESERVED, '1.0.0', '1.0.1', $pom, 'mon-twin6')),
        );
    }

    private static function pdoError(callable $call): PDOException
    {
        try {
            $call();
        } catch (PDOException $e) {
            return $e;
        }
        self::fail('PDOException attendue');
    }
}
