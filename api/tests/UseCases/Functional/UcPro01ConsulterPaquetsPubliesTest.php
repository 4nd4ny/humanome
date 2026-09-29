<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Packages\PromptPackageRepository;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\AdminTestCase;
use Humanome\Tests\UseCases\Support\ProSupport;
use Humanome\Validation;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-PRO-01 — Consulter les paquets de prompts publiés et leurs différences :
 * tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/promptologue/UC-PRO-01-consulter-paquets-publies.md
 *
 * Chaque test rejoue un scénario de la fiche à travers l'API HTTP (application
 * Slim en processus, vraie base MySQL). Les lectures sont PUBLIQUES : le
 * consultant est un navigateur sans session (visiteur, lanceur de runs), sauf
 * A3 où un promptologue connecté vérifie qu'il ne voit rien de plus.
 * Préconditions (versions publiées, brouillon, Golden privé) posées par les
 * chemins réels d'import et de création de brouillon.
 */
final class UcPro01ConsulterPaquetsPubliesTest extends AdminTestCase
{
    /** Navigateur sans cookie (ou avec la session du compte donné). */
    private function consult(string $path, ?array $user = null): ResponseInterface
    {
        $this->cookieSid = $user['sid'] ?? null;

        return $this->request('GET', $path, null, [], ProSupport::webApp());
    }

    /** Précondition : aurora-demo 1.0.0 et 2.0.0 publiées, un brouillon 2.1.0, un Golden privé. */
    private function arrangeCatalogue(): void
    {
        ProSupport::publish(self::$pdo);
        ProSupport::publish(self::$pdo, ProSupport::packageDocV2());
        $promptologue = ProSupport::user(self::$pdo, 'Pom');
        self::packages()->createDraft(ProSupport::PKG, '2.0.0', '2.1.0', $promptologue);
        ProSupport::importGolden(self::$pdo, ProSupport::user(self::$pdo, 'Root', ['admin']));
    }

    private static function packages(): PromptPackageRepository
    {
        return new PromptPackageRepository(self::$pdo);
    }

    /** @return array<string, int> nombre de lignes des tables que la consultation ne doit pas toucher */
    private static function tableCounts(): array
    {
        $counts = [];
        foreach (['prompt_packages', 'prompt_versions', 'settings', 'audit_events'] as $table) {
            $counts[$table] = (int) self::$pdo->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn();
        }

        return $counts;
    }

    #[TestDox('UC-PRO-01-F01 — nominal : la liste publique ne montre que les versions publiées non privées ; les lectures n’écrivent ni ne journalisent rien')]
    public function testF01PublicListShowsPublishedVersionsOnly(): void
    {
        $this->arrangeCatalogue();
        $before = self::tableCounts();

        $response = $this->consult('/api/prompt-packages');

        self::assertSame(200, $response->getStatusCode());
        $list = self::json($response);
        self::assertSame(['1.0.0', '2.0.0'], array_column($list, 'version'));
        self::assertSame(['aurora-demo', 'aurora-demo'], array_column($list, 'id'));
        self::assertSame(['id', 'version', 'description', 'publishedAt', 'reserved'], array_keys($list[0]));
        $raw = (string) $response->getBody();
        self::assertStringNotContainsString('2.1.0', $raw, 'brouillon invisible');
        self::assertStringNotContainsString(ProSupport::GOLDEN, $raw, 'Golden privé invisible');
        self::assertStringNotContainsString('"prompts"', $raw, 'métadonnées seulement, pas le document');

        // Garantie « aucune écriture » : les quatre lectures publiques ne
        // modifient aucune table et n'écrivent aucun événement d'audit.
        foreach (['/api/prompt-packages/aurora-demo/1.0.0', '/api/prompt-packages/default', '/api/prompt-packages/aurora-demo/diff/1.0.0/2.0.0'] as $path) {
            self::assertSame(200, $this->consult($path)->getStatusCode(), $path);
        }
        self::assertSame($before, self::tableCounts(), 'ni écriture ni événement d’audit (le seul audit est l’import du Golden en précondition)');
    }

    #[TestDox('UC-PRO-01-F02 — nominal : le document complet d’une version publiée est servi, conforme au schéma')]
    public function testF02PublishedDocumentIsServedWhole(): void
    {
        $this->arrangeCatalogue();

        $response = $this->consult('/api/prompt-packages/aurora-demo/2.0.0');

        self::assertSame(200, $response->getStatusCode());
        $doc = self::json($response);
        // MySQL JSON normalise l'ordre des clés : égalité de contenu.
        self::assertEquals(ProSupport::packageDocV2(), $doc);
        self::assertTrue(Validation::validate('prompt-package', $doc)['valid']);
    }

    #[TestDox('UC-PRO-01-F03 — nominal : sans défaut validé, le paquet par défaut est la dernière version publiée')]
    public function testF03DefaultFallsBackToTheLatestPublication(): void
    {
        $this->arrangeCatalogue();

        $response = $this->consult('/api/prompt-packages/default');

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['id' => 'aurora-demo', 'version' => '2.0.0'], self::json($response));
    }

    #[TestDox('UC-PRO-01-F04 — nominal : diff structurel entre deux versions publiées')]
    public function testF04StructuralDiffBetweenTwoPublishedVersions(): void
    {
        $this->arrangeCatalogue();

        $response = $this->consult('/api/prompt-packages/aurora-demo/diff/1.0.0/2.0.0');

        self::assertSame(200, $response->getStatusCode());
        $diff = self::json($response);
        self::assertSame('aurora-demo', $diff['packageId']);
        self::assertSame(['version' => '1.0.0'], $diff['from']);
        self::assertSame(['version' => '2.0.0'], $diff['to']);
        self::assertFalse($diff['identical']);
        self::assertSame([['role' => 'merge', 'nom' => 'Fusion chronologique multi-jours']], $diff['prompts']['added']);
        self::assertSame([['role' => 'kairos', 'nom' => 'Synthèse transversale de la journée']], $diff['prompts']['removed']);
        self::assertSame(['consignes_additionnelles'], $diff['prompts']['modified'][0]['variables']['added']);
        self::assertSame(
            ['fieldsChanged' => 1, 'promptsAdded' => 1, 'promptsRemoved' => 1, 'promptsModified' => 1, 'codeChanged' => true, 'metadataChanged' => false],
            $diff['summary'],
        );

        // Sens inverse : les rôles s'échangent.
        $reverse = self::json($this->consult('/api/prompt-packages/aurora-demo/diff/2.0.0/1.0.0'));
        self::assertSame($diff['prompts']['added'], $reverse['prompts']['removed']);
    }

    #[TestDox('UC-PRO-01-F05 — A1 : un défaut validé par l’admin l’emporte sur la dernière publication')]
    public function testF05ValidatedDefaultWinsOverLatestPublication(): void
    {
        $this->arrangeCatalogue();
        (new SettingsRepository(self::$pdo))->set(SettingsRepository::DEFAULT_PACKAGE, [
            'id' => 'aurora-demo',
            'version' => '1.0.0',
            'validatedAt' => date('c'),
        ]);

        self::assertSame(['id' => 'aurora-demo', 'version' => '1.0.0'], self::json($this->consult('/api/prompt-packages/default')));
    }

    #[TestDox('UC-PRO-01-F06 — A2 : un paquet réservé (twin6-ouverte) est listé avec reserved = true')]
    public function testF06ReservedPackageIsFlagged(): void
    {
        // Paquet réservé publié EN PREMIER : l'ordre de la liste (par paquet)
        // ne doit rien à l'ordre de publication.
        ProSupport::publish(self::$pdo, ProSupport::reservedDoc());
        ProSupport::publish(self::$pdo);

        $reserved = array_column(self::json($this->consult('/api/prompt-packages')), 'reserved', 'id');

        self::assertSame(['aurora-demo' => false, 'twin6-ouverte' => true], $reserved);
    }

    #[TestDox('UC-PRO-01-F07 — A3 : un promptologue connecté lit exactement la même chose qu’un visiteur (pas ses brouillons)')]
    public function testF07LoggedInPromptologueReadsTheSamePublicView(): void
    {
        ProSupport::publish(self::$pdo);
        $pom = $this->registerAs('pom@example.org', 'Pom', ['promptologue']);
        $created = $this->as_($pom, 'POST', '/api/prompt-packages/drafts', ['fromId' => 'aurora-demo', 'fromVersion' => '1.0.0', 'version' => '1.1.0']);
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());

        $anonymous = (string) $this->consult('/api/prompt-packages')->getBody();
        $connected = (string) $this->consult('/api/prompt-packages', $pom)->getBody();

        self::assertSame($anonymous, $connected);
        self::assertSame(404, $this->consult('/api/prompt-packages/aurora-demo/1.1.0', $pom)->getStatusCode(), 'son propre brouillon n’est pas « publié »');
    }

    #[TestDox('UC-PRO-01-F08 — E1 : version inconnue, brouillon ou Golden privé → même 404')]
    public function testF08UnknownDraftOrPrivateVersionIs404(): void
    {
        $this->arrangeCatalogue();

        $bodies = [];
        foreach ([
            'inconnue' => '/api/prompt-packages/aurora-demo/9.9.9',
            'brouillon' => '/api/prompt-packages/aurora-demo/2.1.0',
            'golden' => '/api/prompt-packages/' . ProSupport::GOLDEN . '/1.0.0',
            'paquet inconnu' => '/api/prompt-packages/inconnu/1.0.0',
        ] as $case => $path) {
            $response = $this->consult($path);
            self::assertSame(404, $response->getStatusCode(), $case);
            $bodies[$case] = (string) $response->getBody();
        }
        self::assertCount(1, array_unique($bodies), 'corps identiques : pas d’oracle d’existence');
        self::assertSame(['error' => 'Version publiée introuvable'], json_decode($bodies['golden'], true));
    }

    #[TestDox('UC-PRO-01-F09 — E2 : diff avec une version non publiée (brouillon, inconnue, autre paquet) → 404')]
    public function testF09DiffRequiresTwoPublishedVersionsOfThePackage(): void
    {
        $this->arrangeCatalogue();
        ProSupport::publish(self::$pdo, ProSupport::reservedDoc());

        foreach ([
            '/api/prompt-packages/aurora-demo/diff/2.0.0/2.1.0', // brouillon (cf. anomalie AN-1 de la fiche)
            '/api/prompt-packages/aurora-demo/diff/1.0.0/9.9.9',
            '/api/prompt-packages/twin6-ouverte/diff/1.0.0/2.0.0', // 2.0.0 n'existe que sous aurora-demo
            '/api/prompt-packages/' . ProSupport::GOLDEN . '/diff/1.0.0/1.0.0',
        ] as $path) {
            $response = $this->consult($path);
            self::assertSame(404, $response->getStatusCode(), $path);
            self::assertSame(['error' => 'Version publiée introuvable'], self::json($response));
        }
    }

    #[TestDox('UC-PRO-01-F10 — E3 : aucune version publiée → liste vide et défaut 404')]
    public function testF10NothingPublishedYet(): void
    {
        // Seul un Golden privé existe : il ne compte pas.
        ProSupport::importGolden(self::$pdo, ProSupport::user(self::$pdo, 'Root', ['admin']));

        self::assertSame([], self::json($this->consult('/api/prompt-packages')));
        $default = $this->consult('/api/prompt-packages/default');
        self::assertSame(404, $default->getStatusCode());
        self::assertSame(['error' => 'Aucun paquet publié'], self::json($default));
    }

    #[TestDox('UC-PRO-01-F19 — anomalie AN-2 (comportement actuel figé) : sans défaut validé, le repli désigne le paquet RÉSERVÉ twin6-ouverte importé après aurora au déploiement')]
    public function testF19FallbackDefaultCanBeAReservedPackage(): void
    {
        // Ordre de deploy.mjs (build/prompt-packages/*.json, tri alphabétique) :
        // le paquet « par défaut » aurora d'abord, puis le paquet réservé Twin6.
        ProSupport::publish(self::$pdo);
        ProSupport::publish(self::$pdo, ProSupport::reservedDoc());

        $default = $this->consult('/api/prompt-packages/default');

        self::assertSame(200, $default->getStatusCode());
        // Comportement ACTUEL figé (AN-2) : latestPublishedAnyPackage ne filtre
        // pas metadata.reserved, le paquet réservé devient le défaut servi.
        self::assertSame(['id' => 'twin6-ouverte', 'version' => '1.0.0'], self::json($default));
        self::assertTrue(array_column(self::json($this->consult('/api/prompt-packages')), 'reserved', 'id')['twin6-ouverte']);
    }

    #[TestDox('UC-PRO-01-F20 — RG6 : « default » et « drafts » ne sont pas des identifiants réservés — un paquet ainsi nommé reste lisible et comparable')]
    public function testF20DefaultAndDraftsAreOrdinaryPackageIds(): void
    {
        foreach (['default', 'drafts'] as $slug) {
            ProSupport::publish(self::$pdo, ProSupport::packageDoc(['id' => $slug]));
            ProSupport::publish(self::$pdo, ProSupport::packageDoc(['id' => $slug, 'version' => '2.0.0']));

            $detail = $this->consult('/api/prompt-packages/' . $slug . '/1.0.0');
            self::assertSame(200, $detail->getStatusCode(), $slug);
            self::assertSame($slug, self::json($detail)['id']);
            $diff = $this->consult('/api/prompt-packages/' . $slug . '/diff/1.0.0/2.0.0');
            self::assertSame(200, $diff->getStatusCode(), $slug);
            self::assertSame($slug, self::json($diff)['packageId']);
        }
        // La route statique /default garde son sens : la DÉSIGNATION {id, version}.
        self::assertSame(['id' => 'drafts', 'version' => '2.0.0'], self::json($this->consult('/api/prompt-packages/default')));
    }

    #[TestDox('UC-PRO-01-F21 — RG3 : un réglage de défaut sans {id, version} textuels est ignoré → repli sur la dernière publication')]
    public function testF21MalformedSettingFallsBackToTheLatestPublication(): void
    {
        $this->arrangeCatalogue();
        $settings = new SettingsRepository(self::$pdo);

        foreach ([['id' => 'aurora-demo'], ['id' => 'aurora-demo', 'version' => 100], ['version' => '1.0.0']] as $partial) {
            $settings->set(SettingsRepository::DEFAULT_PACKAGE, $partial);
            self::assertSame(['id' => 'aurora-demo', 'version' => '2.0.0'], self::json($this->consult('/api/prompt-packages/default')), json_encode($partial));
        }
    }

    #[TestDox('UC-PRO-01-F22 — limite L2 (comportement figé) : le réglage validé est servi TEL QUEL, sans filtre à la lecture — la conformité ne tient qu’au contrôle d’écriture')]
    public function testF22ValidatedSettingIsServedWithoutReadFilter(): void
    {
        $this->arrangeCatalogue();
        // Écriture directe en base (hors routes, qui passent toutes par isPublished) :
        // un réglage désignant le Golden privé.
        (new SettingsRepository(self::$pdo))->set(SettingsRepository::DEFAULT_PACKAGE, ['id' => ProSupport::GOLDEN, 'version' => '1.0.0']);

        self::assertSame(['id' => ProSupport::GOLDEN, 'version' => '1.0.0'], self::json($this->consult('/api/prompt-packages/default')));
        // Le document, lui, reste introuvable publiquement.
        self::assertSame(404, $this->consult('/api/prompt-packages/' . ProSupport::GOLDEN . '/1.0.0')->getStatusCode());
    }
}
