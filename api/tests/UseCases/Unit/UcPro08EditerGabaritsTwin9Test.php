<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\DbSessionHandler;
use Humanome\Middleware\RequireRole;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\TwinSupport;
use Humanome\Twin9\FicheStore;
use Humanome\Twin9\ProtocoleRepository;
use Humanome\Twin9\Twin9Config;
use Humanome\Twin9\Twin9Exception;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Response;

/**
 * UC-PRO-08 — Éditer les gabarits du Golden Prompt Twin9 : tests UNITAIRES (API).
 *
 * Fiche : docs/cas-utilisation/promptologue/UC-PRO-08-editer-gabarits-twin9.md
 *
 * Le dépôt des gabarits CONFIDENTIELS (ProtocoleRepository) est appelé
 * directement : écriture versionnée et attribuée, historique, lecture d'une
 * version, restauration non destructive, validations (nom hiérarchique,
 * taille), extraction des variables, liste sans contenu. Plus la garde de
 * rôle conjonctive (RequireRole::all) sans session. Gabarits FICTIFS.
 */
final class UcPro08EditerGabaritsTwin9Test extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM twin9_protocole_versions');
        self::$pdo->exec('DELETE FROM twin9_protocole');
        self::$pdo->exec('DELETE FROM users');
    }

    private static function user(string $email): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([$email, Users::hashPassword('x-password'), 'Atelier']);

        return (int) self::$pdo->lastInsertId();
    }

    #[TestDox('UC-PRO-08-U05 — écriture : created / updated / unchanged ; l’ancien contenu est archivé au nom de SON auteur')]
    public function testU05VersionedWritesKeepAuthorship(): void
    {
        $camille = self::user('camille@example.org');
        $noe = self::user('noe@example.org');
        $repo = new ProtocoleRepository(self::$pdo);

        self::assertSame(['name' => 'lourd/20-greffier', 'variables' => ['A'], 'status' => 'created'], $repo->put('lourd/20-greffier', 'V1 FICTIVE {$A}', null));
        self::assertSame('updated', $repo->put('lourd/20-greffier', 'V2 FICTIVE {$A} {$B}', $camille)['status']);
        self::assertSame('updated', $repo->put('lourd/20-greffier', 'V3 FICTIVE {$C}', $noe)['status']);
        self::assertSame('unchanged', $repo->put('lourd/20-greffier', 'V3 FICTIVE {$C}', $camille)['status']);

        $rows = self::$pdo->query("SELECT version, content, created_by FROM twin9_protocole_versions ORDER BY version")->fetchAll();
        self::assertSame(
            [[1, 'V1 FICTIVE {$A}', null], [2, 'V2 FICTIVE {$A} {$B}', $camille]],
            array_map(static fn (array $r): array => [(int) $r['version'], $r['content'], $r['created_by'] === null ? null : (int) $r['created_by']], $rows),
            'import (auteur null), puis édition de Camille',
        );
        self::assertSame($noe, (int) self::$pdo->query("SELECT updated_by FROM twin9_protocole WHERE name = 'lourd/20-greffier'")->fetchColumn());
        self::assertSame([2, 1], array_column($repo->versions('lourd/20-greffier'), 'version'));
        self::assertArrayNotHasKey('content', $repo->versions('lourd/20-greffier')[0]);
        self::assertSame('V1 FICTIVE {$A}', $repo->version('lourd/20-greffier', 1)['content']);
        self::assertNull($repo->version('lourd/20-greffier', 9));
    }

    #[TestDox('UC-PRO-08-U06 — restauration : l’état vivant est archivé d’abord, rien n’est réécrit ; identique → unchanged ; inconnu → 404')]
    public function testU06RestoreNeverRewritesHistory(): void
    {
        $repo = new ProtocoleRepository(self::$pdo);
        $repo->put('merge/04-rapporteur', 'R1 FICTIF', null);
        $repo->put('merge/04-rapporteur', 'R2 FICTIF', null);

        self::assertSame(
            ['name' => 'merge/04-rapporteur', 'variables' => [], 'status' => 'updated', 'restored_from' => 1],
            $repo->restore('merge/04-rapporteur', 1, null),
        );
        self::assertSame('R1 FICTIF', $repo->get('merge/04-rapporteur')['content']);
        self::assertSame(['R2 FICTIF', 'R1 FICTIF'], array_map(
            static fn (array $v): string => $repo->version('merge/04-rapporteur', $v['version'])['content'],
            $repo->versions('merge/04-rapporteur'),
        ));
        self::assertSame('unchanged', $repo->restore('merge/04-rapporteur', 1, null)['status']);

        foreach ([['merge/inconnu', 1, 'Gabarit introuvable'], ['merge/04-rapporteur', 7, 'Version introuvable']] as [$name, $version, $message]) {
            try {
                $repo->restore($name, $version, null);
                self::fail('restauration impossible acceptée');
            } catch (Twin9Exception $e) {
                self::assertSame([404, $message], [$e->getStatusCode(), $e->getMessage()]);
            }
        }
    }

    #[TestDox('UC-PRO-08-U07 — validations : nom hiérarchique [a-z0-9_-] par segments, 190 car. max ; contenu non vide, strictement sous 256 Ko')]
    public function testU07NameAndContentValidation(): void
    {
        foreach (['lourd/20-greffier', 'tagger/1-tag-pole', 'Scan/00_Condense', 'a'] as $ok) {
            ProtocoleRepository::assertValidName($ok);
        }
        foreach (['', '/lourd', 'lourd/', 'lourd//x', '-lourd', 'lourd/../x', 'lourd x', 'lourd/é', str_repeat('a', 191)] as $ko) {
            try {
                ProtocoleRepository::assertValidName($ko);
                self::fail('nom accepté : ' . $ko);
            } catch (Twin9Exception $e) {
                self::assertSame([422, 'Nom de gabarit invalide'], [$e->getStatusCode(), $e->getMessage()]);
            }
        }

        ProtocoleRepository::assertValidContent(str_repeat('a', ProtocoleRepository::MAX_CONTENT_BYTES - 1));
        foreach ([["  \n\t", 'Contenu de gabarit requis'], [str_repeat('a', 262144), 'Gabarit trop volumineux (maximum 256 Ko)']] as [$content, $message]) {
            try {
                ProtocoleRepository::assertValidContent($content);
                self::fail('contenu accepté');
            } catch (Twin9Exception $e) {
                self::assertSame([422, $message], [$e->getStatusCode(), $e->getMessage()]);
            }
        }
        // Rien n'est écrit quand la validation échoue.
        try {
            (new ProtocoleRepository(self::$pdo))->put('lourd//x', 'contenu', null);
        } catch (Twin9Exception) {
        }
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM twin9_protocole')->fetchColumn());
    }

    #[TestDox('UC-PRO-08-U08 — variables {$VAR} extraites dans l’ordre d’apparition, sans doublon ; liste = métadonnées (longueur en caractères), jamais le contenu')]
    public function testU08VariablesAndMetadataList(): void
    {
        self::assertSame(['CODE', 'POLE_FICHES', '_X2'], ProtocoleRepository::extractVariables('{$CODE} {$POLE_FICHES} {$CODE} {$_X2} {$minuscule} {$9X} {CODE} ${CODE}'));

        $repo = new ProtocoleRepository(self::$pdo);
        $contenu = "Élève : {\$PRENOM} — pôle « {\$POLE_NUM} » ✓";
        $repo->put('tagger/1-tag-pole', $contenu, null);
        $repo->put('lourd/20-greffier', 'Greffier FICTIF {$CODE}', null);

        $list = $repo->list();
        self::assertSame(['lourd/20-greffier', 'tagger/1-tag-pole'], array_column($list, 'name'), 'ordre alphabétique');
        self::assertSame(mb_strlen($contenu), $list[1]['longueur']);
        self::assertLessThan(\strlen($contenu), $list[1]['longueur'], 'des caractères, pas des octets');
        self::assertSame(['PRENOM', 'POLE_NUM'], $list[1]['variables']);
        self::assertSame(['name', 'longueur', 'variables', 'updated_at'], array_keys($list[0]));
    }

    #[TestDox('UC-PRO-08-U09 — garde RequireRole::all (admin ∧ promptologue) : sans session → 401 avant tout traitement ; au moins un rôle exigé')]
    public function testU09ConjunctiveGuardWithoutSession(): void
    {
        $handler = new class () implements RequestHandlerInterface {
            public bool $called = false;

            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                $this->called = true;

                return new Response(200);
            }
        };
        unset($_COOKIE[DbSessionHandler::SESSION_NAME]);
        $response = RequireRole::all('admin', 'promptologue')->process(
            (new ServerRequestFactory())->createServerRequest('GET', '/api/twin9/admin/protocole'),
            $handler,
        );
        self::assertSame(401, $response->getStatusCode());
        self::assertSame('{"error":"Authentification requise"}', (string) $response->getBody());
        self::assertFalse($handler->called);

        $this->expectException(\InvalidArgumentException::class);
        RequireRole::all();
    }

    #[TestDox('UC-PRO-08-U10 — banc d’essai : rendu avec les seules variables saisies (fiches NON injectées), absentes laissées en place et listées')]
    public function testU10BenchRendering(): void
    {
        $repo = new ProtocoleRepository(self::$pdo);
        $repo->put('lourd/20-greffier', TwinSupport::GABARIT_GREFFIER, null);
        FicheStore::store(new SettingsRepository(self::$pdo), TwinSupport::fichesFictives());

        $out = $repo->render('lourd/20-greffier', ['CODE' => '1.01', 'EXTRAIT' => '', 'PRENOM' => 'hors gabarit']);
        self::assertStringContainsString('Code 1.01 — extrait : ', $out['rendu']);
        self::assertStringContainsString('{$COMPETENCE_FICHE}', $out['rendu']);
        self::assertStringNotContainsString('FICHE FICTIVE', $out['rendu'], 'le banc n’injecte pas les fiches');
        self::assertSame(['COMPETENCE_FICHE', 'POLE_FICHES'], $out['non_resolues']);
    }

    #[TestDox('UC-PRO-08-U11 — import (briques) : structure du référentiel et fiches nettoyées, réglages du pipeline stockés, Twin9 activé')]
    public function testU11ImportBuildingBlocks(): void
    {
        $settings = new SettingsRepository(self::$pdo);
        self::$pdo->exec("DELETE FROM settings WHERE name IN ('twin9_config', 'twin9_fiches', 'twin9_referentiel')");
        FicheStore::store($settings, [
            ['num' => '1', 'header' => 'EN-TÊTE FICTIF', 'autre' => 'jeté', 'competences' => [
                ['code' => '1.01', 'fiche_md' => 'FICHE FICTIVE', 'nom' => 'jeté'],
                ['fiche_md' => 'sans code : jetée'],
            ]],
            'pas un pôle',
        ]);
        self::assertEquals(
            ['poles' => [['num' => 1, 'header' => 'EN-TÊTE FICTIF', 'competences' => [['code' => '1.01', 'fiche_md' => 'FICHE FICTIVE']]]]],
            $settings->get(FicheStore::SETTING_KEY),
        );

        $config = new Twin9Config($settings);
        $config->update(['enabled' => true, 'pipeline' => ['seuils_consensus' => ['conf_min' => 0.4]]]);
        $config->setReferentiel(TwinSupport::referentielFictif());
        self::assertTrue($config->isEnabled());
        self::assertEquals(['seuils_consensus' => ['conf_min' => 0.4]], $config->pipeline());
        self::assertSame(['1.01', '1.02'], array_column($config->referentiel()[0]['competences'], 'code'));
    }
}
