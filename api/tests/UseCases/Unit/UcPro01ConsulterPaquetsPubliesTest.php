<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Packages\PackageDiff;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\UseCases\Support\ProSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-PRO-01 — Consulter les paquets de prompts publiés et leurs différences :
 * tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/promptologue/UC-PRO-01-consulter-paquets-publies.md
 *
 * Les classes sollicitées par les lectures publiques GET /api/prompt-packages,
 * /{id}/{version}, /default et /{id}/diff/{v1}/{v2} sont appelées directement :
 * PromptPackageRepository (listPublished, findPublished,
 * latestPublishedAnyPackage, isPublished — filtre « publié ET non privé »),
 * SettingsRepository (défaut validé) et PackageDiff (diff structurel).
 */
final class UcPro01ConsulterPaquetsPubliesTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = ProSupport::freshPdo();
    }

    protected function setUp(): void
    {
        ProSupport::reset(self::$pdo);
    }

    private static function repo(): PromptPackageRepository
    {
        return new PromptPackageRepository(self::$pdo);
    }

    /** Un brouillon posé en base (précondition : brouillon d'un promptologue, UC-PRO-02). */
    private static function seedDraft(string $version): void
    {
        $author = ProSupport::user(self::$pdo);
        self::repo()->createDraft(ProSupport::PKG, '1.0.0', $version, $author);
    }

    #[TestDox('UC-PRO-01-U01 — listPublished : versions publiées non privées, triées par paquet puis publication, métadonnées seulement')]
    public function testU01ListPublishedExposesPublicPublishedVersionsOnly(): void
    {
        ProSupport::publish(self::$pdo);
        ProSupport::publish(self::$pdo, ProSupport::packageDocV2());
        ProSupport::publish(self::$pdo, ProSupport::reservedDoc());
        self::seedDraft('1.1.0');
        ProSupport::importGolden(self::$pdo, ProSupport::user(self::$pdo, 'Root', ['admin']));

        $list = self::repo()->listPublished();

        self::assertSame(
            [['aurora-demo', '1.0.0'], ['aurora-demo', '2.0.0'], ['twin6-ouverte', '1.0.0']],
            array_map(static fn (array $row): array => [$row['id'], $row['version']], $list),
            'ni brouillon (1.1.0), ni Golden privé',
        );
        self::assertSame(['id', 'version', 'description', 'publishedAt', 'reserved'], array_keys($list[0]));
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $list[0]['publishedAt']);
        self::assertFalse($list[0]['reserved']);
        self::assertTrue($list[2]['reserved'], 'metadata.reserved du contenu publié');
        // Description du PAQUET (dernier import), identique pour chaque ligne du paquet.
        self::assertSame('Deuxième itération : extraction affinée, prompt merge.', $list[0]['description']);
    }

    #[TestDox('UC-PRO-01-U02 — findPublished : document complet d’une version publiée ; null pour brouillon, inconnu ou privé')]
    public function testU02FindPublishedServesOnlyPublishedPublicDocuments(): void
    {
        ProSupport::publish(self::$pdo);
        self::seedDraft('1.1.0');
        ProSupport::importGolden(self::$pdo, ProSupport::user(self::$pdo, 'Root', ['admin']));

        $doc = self::repo()->findPublished(ProSupport::PKG, '1.0.0');
        self::assertNotNull($doc);
        // Colonne JSON MySQL : l'ordre des clés n'est pas conservé.
        self::assertEquals(ProSupport::packageDoc(), $doc);

        self::assertNull(self::repo()->findPublished(ProSupport::PKG, '1.1.0'), 'brouillon');
        self::assertNull(self::repo()->findPublished(ProSupport::PKG, '9.9.9'), 'inconnue');
        self::assertNull(self::repo()->findPublished('inconnu', '1.0.0'), 'paquet inconnu');
        self::assertNull(self::repo()->findPublished(ProSupport::GOLDEN, '1.0.0'), 'Golden privé');
    }

    #[TestDox('UC-PRO-01-U03 — latestPublishedAnyPackage : null sans publication, sinon la plus récente (hors brouillons et privés)')]
    public function testU03LatestPublishedAnyPackageIsTheDefaultFallback(): void
    {
        self::assertNull(self::repo()->latestPublishedAnyPackage());

        ProSupport::publish(self::$pdo);
        ProSupport::publish(self::$pdo, ProSupport::reservedDoc());
        self::assertSame(['id' => 'twin6-ouverte', 'version' => '1.0.0'], self::repo()->latestPublishedAnyPackage());

        // Un brouillon et un Golden plus récents ne comptent pas.
        self::seedDraft('3.0.0');
        ProSupport::importGolden(self::$pdo, ProSupport::user(self::$pdo, 'Root', ['admin']));
        self::assertSame(['id' => 'twin6-ouverte', 'version' => '1.0.0'], self::repo()->latestPublishedAnyPackage());

        // Même seconde de publication : départage par l'ordre d'insertion.
        ProSupport::publish(self::$pdo, ProSupport::packageDocV2());
        self::assertSame(['id' => 'aurora-demo', 'version' => '2.0.0'], self::repo()->latestPublishedAnyPackage());
    }

    #[TestDox('UC-PRO-01-U04 — isPublished : vrai pour une version publiée publique seulement')]
    public function testU04IsPublishedMatchesThePublicPublishedFilter(): void
    {
        ProSupport::publish(self::$pdo);
        self::seedDraft('1.1.0');
        ProSupport::importGolden(self::$pdo, ProSupport::user(self::$pdo, 'Root', ['admin']));

        self::assertTrue(self::repo()->isPublished(ProSupport::PKG, '1.0.0'));
        self::assertFalse(self::repo()->isPublished(ProSupport::PKG, '1.1.0'));
        self::assertFalse(self::repo()->isPublished(ProSupport::PKG, '9.9.9'));
        self::assertFalse(self::repo()->isPublished(ProSupport::GOLDEN, '1.0.0'));
    }

    #[TestDox('UC-PRO-01-U05 — SettingsRepository : lecture du défaut validé (absent, objet JSON, valeur non-objet ignorée)')]
    public function testU05SettingsRepositoryReadsTheValidatedDefault(): void
    {
        $settings = new SettingsRepository(self::$pdo);
        self::assertNull($settings->get(SettingsRepository::DEFAULT_PACKAGE));

        $settings->set(SettingsRepository::DEFAULT_PACKAGE, ['id' => 'aurora-demo', 'version' => '1.0.0']);
        self::assertEquals(['id' => 'aurora-demo', 'version' => '1.0.0'], $settings->get(SettingsRepository::DEFAULT_PACKAGE));

        // Une valeur qui n'est pas un objet JSON est traitée comme absente.
        self::$pdo->prepare('UPDATE settings SET value = ? WHERE name = ?')
            ->execute(['"aurora-demo@1.0.0"', SettingsRepository::DEFAULT_PACKAGE]);
        self::assertNull($settings->get(SettingsRepository::DEFAULT_PACKAGE));

        $settings->delete(SettingsRepository::DEFAULT_PACKAGE);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM settings')->fetchColumn());
    }

    #[TestDox('UC-PRO-01-U06 — PackageDiff : une version comparée à elle-même est « identique », sections vides')]
    public function testU06DiffOfIdenticalDocuments(): void
    {
        $diff = PackageDiff::compute(ProSupport::packageDoc(), ProSupport::packageDoc());

        self::assertSame('aurora-demo', $diff['packageId']);
        self::assertSame(['version' => '1.0.0'], $diff['from']);
        self::assertSame(['version' => '1.0.0'], $diff['to']);
        self::assertTrue($diff['identical']);
        self::assertSame([], $diff['fields']);
        self::assertSame(['added' => [], 'removed' => [], 'modified' => []], $diff['prompts']);
        self::assertSame(['entrypoint' => null, 'orchestration' => null], $diff['code']);
        self::assertSame([], $diff['metadata']);
        self::assertSame([
            'fieldsChanged' => 0, 'promptsAdded' => 0, 'promptsRemoved' => 0,
            'promptsModified' => 0, 'codeChanged' => false, 'metadataChanged' => false,
        ], $diff['summary']);
    }

    #[TestDox('UC-PRO-01-U07 — PackageDiff : un prompt est identifié par (role, nom) — renommer = retirer + ajouter')]
    public function testU07PromptsAreKeyedByRoleAndNom(): void
    {
        $to = ProSupport::packageDoc(['version' => '1.1.0']);
        $to['prompts'][1]['nom'] = 'Synthèse kairos renommée';

        $diff = PackageDiff::compute(ProSupport::packageDoc(), $to);

        self::assertSame([['role' => 'kairos', 'nom' => 'Synthèse kairos renommée']], $diff['prompts']['added']);
        self::assertSame([['role' => 'kairos', 'nom' => 'Synthèse transversale de la journée']], $diff['prompts']['removed']);
        self::assertSame([], $diff['prompts']['modified'], 'pas de « modifié » à travers un renommage');
        self::assertFalse($diff['identical']);
    }

    #[TestDox('UC-PRO-01-U08 — PackageDiff : prompt modifié = diff de lignes du texte + diff des variables (ajout, retrait, description/exemple)')]
    public function testU08ModifiedPromptCarriesTexteAndVariablesDiff(): void
    {
        $to = ProSupport::packageDoc(['version' => '1.1.0']);
        $to['prompts'][1]['variables'][0]['exemple'] = '2026-02-01'; // date_feuille modifiée
        array_pop($to['prompts'][1]['variables']);                     // verdicts_json retirée
        $to['prompts'][1]['variables'][] = ['nom' => 'ton', 'description' => 'Tonalité attendue.'];
        $to['prompts'][0]['texte'] .= "\nLigne ajoutée.";

        $diff = PackageDiff::compute(ProSupport::packageDoc(), $to);
        $byRole = array_column($diff['prompts']['modified'], null, 'role');

        // extraction-pole : texte seul (variables inchangées -> null).
        self::assertNull($byRole['extraction-pole']['variables']);
        self::assertSame('add', end($byRole['extraction-pole']['texte'])['op']);
        self::assertSame('Ligne ajoutée.', end($byRole['extraction-pole']['texte'])['text']);

        // kairos : variables seules (texte inchangé -> null).
        self::assertNull($byRole['kairos']['texte']);
        self::assertSame(['ton'], $byRole['kairos']['variables']['added']);
        self::assertSame(['verdicts_json'], $byRole['kairos']['variables']['removed']);
        self::assertSame('date_feuille', $byRole['kairos']['variables']['modified'][0]['nom']);
        self::assertSame(['exemple'], array_keys($byRole['kairos']['variables']['modified'][0]['changes']));
        self::assertSame('2026-02-01', $byRole['kairos']['variables']['modified'][0]['changes']['exemple']['to']);
        self::assertSame(2, $diff['summary']['promptsModified']);
    }

    #[TestDox('UC-PRO-01-U09 — PackageDiff : champs de premier niveau, code et métadonnées ; changelog, id et version hors champs')]
    public function testU09FieldsCodeAndMetadata(): void
    {
        $to = ProSupport::packageDoc(['version' => '1.1.0', 'modeleCible' => null, 'auteur' => 'Autre atelier']);
        $to['referentielCompatible']['versionMin'] = '7.1.0';
        $to['code']['entrypoint'] = 'main';
        $to['metadata']['licence'] = 'CC-BY-4.0';
        unset($to['metadata']['publieLe']);
        $to['metadata']['modifieLe'] = '2026-02-01T10:00:00+01:00';
        $to['changelog'][] = ['version' => '1.1.0', 'description' => 'Nouvelle entrée'];

        $diff = PackageDiff::compute(ProSupport::packageDoc(), $to);

        self::assertSame(['auteur', 'modeleCible', 'referentielCompatible'], array_keys($diff['fields']));
        self::assertSame(['from' => 'claude-sonnet-4-5', 'to' => null], $diff['fields']['modeleCible']);
        self::assertSame('7.1.0', $diff['fields']['referentielCompatible']['to']['versionMin']);
        self::assertSame(['from' => 'run', 'to' => 'main'], $diff['code']['entrypoint']);
        self::assertNull($diff['code']['orchestration']);
        self::assertTrue($diff['summary']['codeChanged']);
        // Métadonnées clé par clé : modifiée, retirée (-> null), ajoutée (null ->).
        self::assertSame(['from' => 'CC-BY-SA-4.0', 'to' => 'CC-BY-4.0'], $diff['metadata']['licence']);
        self::assertSame(['from' => '2026-01-07T18:00:00+01:00', 'to' => null], $diff['metadata']['publieLe']);
        self::assertSame(['from' => null, 'to' => '2026-02-01T10:00:00+01:00'], $diff['metadata']['modifieLe']);
        self::assertSame(3, $diff['summary']['fieldsChanged']);
        self::assertArrayNotHasKey('changelog', $diff['fields'], 'le changelog n’est pas comparé');
    }

    #[TestDox('UC-PRO-01-U10 — lineDiff : au-delà du plafond LCS, le bloc central est rendu en suppression + insertion complètes')]
    public function testU10LineDiffDegradesToFullReplacementBeyondTheCap(): void
    {
        // 2 + 600 + 2 lignes contre 2 + 600 + 2 : 360 000 cellules > 250 000.
        $from = implode("\n", ['debut', 'commun', ...array_map(static fn (int $i): string => 'a' . $i, range(1, 600)), 'fin', 'commun']);
        $to = implode("\n", ['debut', 'commun', ...array_map(static fn (int $i): string => 'b' . $i, range(1, 600)), 'fin', 'commun']);

        $ops = PackageDiff::lineDiff($from, $to);

        self::assertCount(1200, $ops);
        self::assertSame(['op' => 'del', 'line' => 3, 'text' => 'a1'], $ops[0]);
        self::assertSame(['op' => 'del', 'line' => 602, 'text' => 'a600'], $ops[599]);
        self::assertSame(['op' => 'add', 'line' => 3, 'text' => 'b1'], $ops[600]);
        self::assertSame(['op' => 'add', 'line' => 602, 'text' => 'b600'], $ops[1199]);
        // Sous le plafond, le même type d'écart reste minimal (LCS).
        self::assertSame(
            [['op' => 'del', 'line' => 2, 'text' => 'x'], ['op' => 'add', 'line' => 2, 'text' => 'y']],
            PackageDiff::lineDiff("a\nx\nb", "a\ny\nb"),
        );
    }

    #[TestDox('UC-PRO-01-U11 — limite : comparaison stricte des objets imbriqués (ordre des clés) — sans effet via l’API, documents relus de MySQL')]
    public function testU11NestedObjectsAreComparedWithKeyOrder(): void
    {
        $to = ProSupport::packageDoc();
        $to['referentielCompatible'] = ['versionMin' => '7.0.0', 'id' => 'respire']; // mêmes valeurs, autre ordre

        $diff = PackageDiff::compute(ProSupport::packageDoc(), $to);
        self::assertArrayHasKey('referentielCompatible', $diff['fields'], 'comportement ACTUEL figé (Limite L1)');

        // Via le dépôt, les deux côtés sont normalisés par MySQL : aucun faux écart.
        ProSupport::publish(self::$pdo);
        $stored = self::repo()->findPublished(ProSupport::PKG, '1.0.0');
        self::assertTrue(PackageDiff::compute($stored, self::repo()->findPublished(ProSupport::PKG, '1.0.0'))['identical']);
    }
}
