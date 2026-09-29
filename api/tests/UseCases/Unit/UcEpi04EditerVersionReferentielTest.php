<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\MigrationRunner;
use Humanome\Referentiel\ConflictException;
use Humanome\Referentiel\ContentHash;
use Humanome\Referentiel\InvalidDocumentException;
use Humanome\Referentiel\ReferentielDiff;
use Humanome\Referentiel\ReferentielGovernance;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-EPI-04 — Éditer une version complète du référentiel : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-04-editer-version-referentiel.md
 *
 * Logique appelée directement : ReferentielRepository (fork, édition,
 * validation schéma + intégrité, publication, lectures), ContentHash
 * (normalisation canonique, hash structurel), ReferentielGovernance
 * (soumission, retrait) et ReferentielDiff (diff structurel entre versions).
 */
final class UcEpi04EditerVersionReferentielTest extends TestCase
{
    private const RESPIRE = ReferentielRepository::DEFAULT_REFERENTIEL_ID;

    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        foreach (['referentiel_snapshot_competences', 'referentiel_votes', 'referentiel_versions', 'user_roles', 'users'] as $table) {
            self::$pdo->exec('DELETE FROM ' . $table);
        }
    }

    private static function repo(): ReferentielRepository
    {
        return new ReferentielRepository(self::$pdo);
    }

    private static function governance(): ReferentielGovernance
    {
        return new ReferentielGovernance(self::$pdo);
    }

    /** @return array<string, mixed> RESPIRE v7 (instantané versionné schemas/fixtures) */
    private static function respire(): array
    {
        return json_decode((string) file_get_contents(\dirname(__DIR__, 4) . '/schemas/fixtures/referentiel-respire-v7.json'), true, 512, JSON_THROW_ON_ERROR);
    }

    private static function importRespire(): array
    {
        return self::repo()->importPublishedDocument(self::respire(), 'Import initial');
    }

    private static function createMember(): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid('epi', true) . '@example.org', 'x', 'Membre']);
        $id = (int) self::$pdo->lastInsertId();
        self::$pdo->prepare("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = 'epistemiarque'")->execute([$id]);

        return $id;
    }

    /** @param array<string, mixed> $doc */
    private static function rename(array $doc, string $code, string $nom): array
    {
        foreach ($doc['competences'] as $i => $competence) {
            if ($competence['code'] === $code) {
                $doc['competences'][$i]['nom'] = $nom;
            }
        }

        return $doc;
    }

    /** Brouillon → vote → « pour » du membre donné (majorité s'il est seul membre). */
    private static function adopt(int $id, int $member): void
    {
        self::governance()->submit($id, null, $member);
        self::governance()->castVote($id, $member, 'pour', null);
    }

    #[TestDox('UC-EPI-04-U01 — createDraft : fork d’une version (version et libellé remplacés, contenu normalisé, auteur), y compris depuis un brouillon')]
    public function testU01CreateDraftForksAVersion(): void
    {
        $imported = self::importRespire();
        $author = self::createMember();

        $draft = self::repo()->createDraft(self::RESPIRE, '7.0.0', '7.1.0', 'RESPIRE v7.1', $author);

        self::assertSame(['draft', '7.1.0', 'RESPIRE v7.1'], [$draft['status'], $draft['semver'], $draft['label']]);
        self::assertSame(['7.1.0', 'RESPIRE v7.1'], [$draft['content']['version'], $draft['content']['label']]);
        self::assertSame($imported['contentHash'], $draft['contentHash'], 'même structure, même empreinte');
        self::assertSame($draft['contentHash'], $draft['content']['contentHash']);
        self::assertSame($author, (int) self::$pdo->query('SELECT created_by FROM referentiel_versions WHERE id = ' . $draft['id'])->fetchColumn());

        // A1 : on peut forker un BROUILLON ; libellé vide → libellé de la source.
        $second = self::repo()->createDraft(self::RESPIRE, '7.1.0', '7.2.0', '');
        self::assertSame(['7.2.0', 'RESPIRE v7.1'], [$second['semver'], $second['label']]);
    }

    #[TestDox('UC-EPI-04-U02 — createDraft : semver invalide → 422, source inconnue → null, version existante → 409')]
    public function testU02CreateDraftRefusals(): void
    {
        self::importRespire();

        try {
            self::repo()->createDraft(self::RESPIRE, '7.0.0', '7.1');
            self::fail('semver invalide acceptée');
        } catch (InvalidDocumentException $e) {
            self::assertSame(['/semver' => ['Version semver invalide']], $e->getErrors());
        }
        self::assertNull(self::repo()->createDraft(self::RESPIRE, '9.9.9', '10.0.0'));
        self::assertNull(self::repo()->createDraft('autre-referentiel', '7.0.0', '7.1.0'));

        $this->expectException(ConflictException::class);
        $this->expectExceptionMessage('Version 7.0.0 of referentiel "respire" already exists');
        self::repo()->createDraft(self::RESPIRE, '7.0.0', '7.0.0');
    }

    #[TestDox('UC-EPI-04-U03 — updateDraft : document complet revalidé, hash recalculé, semver suit « version » ; collision, id changé, gel, immuable')]
    public function testU03UpdateDraft(): void
    {
        $imported = self::importRespire();
        $draft = self::repo()->createDraft(self::RESPIRE, '7.0.0', '7.1.0');
        self::repo()->createDraft(self::RESPIRE, '7.0.0', '7.5.0');

        $doc = self::rename($draft['content'], '1.01', 'Pensée critique et vigilance');
        $doc['version'] = '7.2.0';
        $saved = self::repo()->updateDraft($draft['id'], $doc);
        self::assertSame('7.2.0', $saved['semver']);
        self::assertNotSame($imported['contentHash'], $saved['contentHash']);
        self::assertSame(ContentHash::compute($doc), $saved['contentHash']);

        $collision = $doc;
        $collision['version'] = '7.5.0';
        try {
            self::repo()->updateDraft($draft['id'], $collision);
            self::fail('collision de semver acceptée');
        } catch (ConflictException $e) {
            self::assertStringContainsString('7.5.0', $e->getMessage());
        }

        $otherId = $doc;
        $otherId['id'] = 'autre';
        try {
            self::repo()->updateDraft($draft['id'], $otherId);
            self::fail('changement d’identifiant accepté');
        } catch (InvalidDocumentException $e) {
            self::assertSame(['/id' => ['L\'identifiant du référentiel ne peut pas changer']], $e->getErrors());
        }

        self::assertNull(self::repo()->updateDraft(999999, $doc));
        try {
            self::repo()->updateDraft($imported['id'], $doc);
            self::fail('version publiée modifiée');
        } catch (ConflictException $e) {
            self::assertStringContainsString('immutable', $e->getMessage());
        }
        self::governance()->submit($draft['id'], null, null);
        $this->expectException(ConflictException::class);
        $this->expectExceptionMessage('withdraw it before editing');
        self::repo()->updateDraft($draft['id'], $doc);
    }

    #[TestDox('UC-EPI-04-U04 — validateDocument : schéma (7 pôles, 61 compétences) puis intégrité (pôle dupliqué, code dupliqué, pôle inexistant) avec pointeurs')]
    public function testU04ValidateDocumentIntegrity(): void
    {
        $doc = self::respire();

        $duplicates = $doc;
        $duplicates['poles'][6]['num'] = 6;
        $duplicates['competences'][1]['code'] = $duplicates['competences'][0]['code'];
        try {
            self::repo()->validateDocument($duplicates);
            self::fail('incohérences acceptées');
        } catch (InvalidDocumentException $e) {
            self::assertSame('Document fails referentiel integrity checks', $e->getMessage());
            $errors = $e->getErrors();
            self::assertArrayHasKey('/poles/6/num', $errors);
            self::assertArrayHasKey('/competences/1/code', $errors);
            self::assertStringContainsString('référence un pôle inexistant (7)', implode(' ', array_merge(...array_values(array_filter(
                $errors,
                static fn (string $pointer): bool => str_ends_with($pointer, '/pole'),
                ARRAY_FILTER_USE_KEY,
            )))));
        }

        $short = $doc;
        array_pop($short['competences']);
        try {
            self::repo()->validateDocument($short);
            self::fail('60 compétences acceptées');
        } catch (InvalidDocumentException $e) {
            self::assertSame('Document does not conform to the referentiel schema', $e->getMessage());
        }

        $unhashable = $doc;
        $unhashable['poles'] = 'pas une liste';
        try {
            self::repo()->validateDocument($unhashable);
            self::fail('document non hachable accepté');
        } catch (InvalidDocumentException $e) {
            self::assertNotSame([], $e->getErrors());
        }
    }

    #[TestDox('UC-EPI-04-U05 — ContentHash::normalize : ordre canonique, hash recalculé, descriptions conservées HORS hash, clés inconnues écartées')]
    public function testU05NormalizeKeepsTheStructuralHashContract(): void
    {
        $doc = self::respire();
        $expected = $doc['contentHash'];

        $shuffled = $doc;
        $shuffled['contentHash'] = 'périmé';
        $shuffled['competences'] = array_reverse($shuffled['competences']);
        $shuffled['competences'][0]['description'] = 'Une définition éditoriale.';
        $shuffled = ['inconnue' => true] + array_reverse($shuffled, true);

        $normalized = ContentHash::normalize($shuffled);

        self::assertSame(['schemaVersion', 'kind', 'id', 'version', 'label', 'contentHash', 'source', 'poles', 'competences'], array_keys($normalized));
        self::assertSame($expected, $normalized['contentHash'], 'description hors hash, ordre indifférent');
        self::assertSame('1.01', $normalized['competences'][0]['code']);
        self::assertSame(['code', 'nom', 'pole', 'description'], array_keys($normalized['competences'][60]));
        self::assertSame($expected, ContentHash::compute($shuffled));
    }

    #[TestDox('UC-EPI-04-U06 — gouvernance au grain version : submit (semver croissante, Decidim), withdraw (bulletins effacés)')]
    public function testU06SubmitAndWithdrawAtVersionGrain(): void
    {
        self::importRespire();
        $member = self::createMember();
        $lower = self::repo()->createDraft(self::RESPIRE, '7.0.0', '6.9.0');
        try {
            self::governance()->submit($lower['id'], null, $member);
            self::fail('semver non croissante soumise');
        } catch (ConflictException $e) {
            self::assertStringContainsString('6.9.0 is not greater than published 7.0.0', $e->getMessage());
        }

        $draft = self::repo()->createDraft(self::RESPIRE, '7.0.0', '7.1.0');
        $submitted = self::governance()->submit($draft['id'], 'https://participer.harmonia.education/d/9', $member);
        self::assertSame(['review', $member, 'https://participer.harmonia.education/d/9'], [$submitted['status'], $submitted['submittedBy'], $submitted['decidimUrl']]);
        self::governance()->castVote($draft['id'], $member, 'pour', null);

        $withdrawn = self::governance()->withdraw($draft['id']);
        self::assertSame(['draft', null, null], [$withdrawn['status'], $withdrawn['submittedBy'], $withdrawn['decidimUrl']]);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM referentiel_votes WHERE version_id = ' . $draft['id'])->fetchColumn());
        self::assertNull(self::governance()->submit(999999, null, null));
        self::assertNull(self::governance()->withdraw(999999));

        try {
            self::governance()->submit($draft['id'], 'ftp://x', null);
            self::fail('lien Decidim invalide accepté');
        } catch (InvalidDocumentException $e) {
            self::assertSame(['/decidimUrl' => ['URL invalide']], $e->getErrors());
        }
        $this->expectException(ConflictException::class);
        $this->expectExceptionMessage('Only a proposal currently open for a vote can be withdrawn');
        self::governance()->withdraw($draft['id']);
    }

    #[TestDox('UC-EPI-04-U07 — publish : proposition adoptée publiée (normalisée, immuable) ; brouillon, sans majorité, semver dépassée → 409')]
    public function testU07Publish(): void
    {
        self::importRespire();
        $a = self::repo()->createDraft(self::RESPIRE, '7.0.0', '7.1.0');
        self::repo()->updateDraft($a['id'], self::rename($a['content'], '1.01', 'Renommée'));
        $b = self::repo()->createDraft(self::RESPIRE, '7.0.0', '7.2.0');

        try {
            self::repo()->publish($a['id'], 'x');
            self::fail('brouillon publié');
        } catch (ConflictException $e) {
            self::assertStringContainsString('must be submitted for a vote', $e->getMessage());
        }
        self::governance()->submit($a['id'], null, null);
        self::createMember();
        self::createMember();
        try {
            self::repo()->publish($a['id'], 'x');
            self::fail('publié sans majorité');
        } catch (ConflictException $e) {
            self::assertSame('Majorité non atteinte : 0 voix « pour » sur 2 requises (2 membres).', $e->getMessage());
        }
        // Électorat réduit à un seul membre : son « pour » fait la majorité.
        self::$pdo->exec('DELETE FROM user_roles');
        $member = self::createMember();

        self::adopt($b['id'], $member);
        $published = self::repo()->publish($b['id'], 'Version 7.2');
        self::assertSame(['published', 'Version 7.2'], [$published['status'], $published['releaseNote']]);
        self::assertSame('7.2.0', self::repo()->latestPublished(self::RESPIRE)['semver']);

        self::governance()->castVote($a['id'], $member, 'pour', null);
        try {
            self::repo()->publish($a['id'], 'x');
            self::fail('7.1.0 publiée après 7.2.0');
        } catch (ConflictException $e) {
            self::assertStringContainsString('7.1.0 is not greater than published 7.2.0', $e->getMessage());
        }
        self::assertNull(self::repo()->publish(999999));
        $this->expectException(ConflictException::class);
        $this->expectExceptionMessage('already published');
        self::repo()->publish($b['id']);
    }

    #[TestDox('UC-EPI-04-U08 — ReferentielDiff : pôle modifié (couleur), renommé + déplacé, ajout/retrait, description ignorée, documents incomplets tolérés')]
    public function testU08StructuralDiff(): void
    {
        $from = self::respire();
        $to = $from;
        $to['version'] = '8.0.0';
        $to['poles'][0]['couleur'] = '#000000';
        $to['competences'][0]['nom'] = 'Nouveau nom';
        $to['competences'][0]['pole'] = 2;
        $to['competences'][1]['description'] = 'Seulement une définition';
        $removed = array_pop($to['competences']);
        $to['competences'][] = ['code' => '7.99', 'nom' => 'Ajoutée', 'pole' => 7];

        $diff = ReferentielDiff::compute($from, $to);

        self::assertFalse($diff['identical']);
        self::assertSame(['version' => '7.0.0', 'label' => $from['label']], $diff['from']);
        self::assertSame([['num' => 1, 'changes' => ['couleur' => ['from' => $from['poles'][0]['couleur'], 'to' => '#000000']]]], $diff['poles']['modified']);
        self::assertSame('Nouveau nom', $diff['competences']['renamed'][0]['to']);
        self::assertSame(['fromPole' => 1, 'toPole' => 2], array_intersect_key($diff['competences']['moved'][0], ['fromPole' => 0, 'toPole' => 0]));
        self::assertSame([$removed['code']], array_column($diff['competences']['removed'], 'code'));
        self::assertSame(['7.99'], array_column($diff['competences']['added'], 'code'));
        self::assertSame(
            ['polesAdded' => 0, 'polesRemoved' => 0, 'polesModified' => 1, 'competencesAdded' => 1, 'competencesRemoved' => 1, 'competencesRenamed' => 1, 'competencesMoved' => 1],
            $diff['summary'],
            'la description seule ne compte pas',
        );

        $empty = ReferentielDiff::compute(['id' => 'respire'], ['poles' => 'x', 'competences' => [['sans code']]]);
        self::assertTrue($empty['identical']);
        self::assertSame('respire', $empty['referentielId']);
    }

    #[TestDox('UC-EPI-04-U09 — lectures : versions publiées par précédence semver, version par semver, éditables du plus récent au plus ancien, métadonnées sans contenu')]
    public function testU09Reads(): void
    {
        self::importRespire();
        $member = self::createMember();
        foreach (['7.9.0', '7.10.0'] as $semver) {
            $d = self::repo()->createDraft(self::RESPIRE, '7.0.0', $semver);
            self::adopt($d['id'], $member);
            self::repo()->publish($d['id']);
        }
        $d1 = self::repo()->createDraft(self::RESPIRE, '7.0.0', '8.0.0');
        $d2 = self::repo()->createDraft(self::RESPIRE, '7.0.0', '8.1.0');
        self::governance()->submit($d2['id'], null, null);

        self::assertSame(['7.10.0', '7.9.0', '7.0.0'], array_column(self::repo()->publishedVersions(self::RESPIRE), 'semver'));
        self::assertSame('7.10.0', self::repo()->latestPublished(self::RESPIRE)['semver']);
        self::assertSame('7.9.0', self::repo()->findPublished(self::RESPIRE, '7.9.0')['semver']);
        self::assertNull(self::repo()->findPublished(self::RESPIRE, '8.0.0'), 'un brouillon n’est pas une version publiée');
        self::assertSame([$d2['id'], $d1['id']], array_column(self::repo()->editableVersions(self::RESPIRE), 'id'));
        self::assertSame(
            ['id', 'referentielId', 'semver', 'label', 'status', 'contentHash', 'releaseNote', 'publishedAt', 'submittedAt', 'decidimUrl'],
            array_keys(ReferentielRepository::metadata(self::repo()->findById($d2['id']))),
        );
    }
}
