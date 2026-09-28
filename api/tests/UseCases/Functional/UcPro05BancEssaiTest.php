<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Packages\PromptPackageRepository;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\UseCases\Support\BancSupport;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-PRO-05 — Évaluer un paquet au banc d'essai : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/promptologue/UC-PRO-05-banc-essai.md
 *
 * Le run du banc est 100 % navigateur (tests IHM : web/test/usecases/…) ; ici
 * sont rejouées, à travers l'API HTTP réelle (Slim en processus, MySQL), les
 * étapes où le banc interroge le serveur : ouverture de session et garde de
 * rôle (étape 1), chargement des sources — versions publiées, MES brouillons,
 * versions du référentiel (étape 2) —, résolution du document d'une version
 * publiée (étape 4). Les mêmes appels que BancEssaiSection, dans le même ordre.
 */
final class UcPro05BancEssaiTest extends CartographeTestCase
{
    use BancSupport;

    protected function setUp(): void
    {
        parent::setUp(); // comptes (+ cascades) et audit vidés
        self::$pdo->exec('DELETE FROM prompt_packages');
        self::$pdo->exec('DELETE FROM settings');
        self::wipeReferentiel(self::$pdo);
        (new PromptPackageRepository(self::$pdo))->importPublishedDocument(self::enginePackage('aurora-lab', '2.0.0'));
        self::publishReferentiel(self::$pdo, '7.0.0');
    }

    /** Précondition : un brouillon créé par l'atelier (UC-PRO-02). */
    private function draftOf(array $promptologue, string $version): int
    {
        $created = $this->as_($promptologue, 'POST', '/api/prompt-packages/drafts', [
            'fromId' => 'aurora-lab',
            'fromVersion' => '2.0.0',
            'version' => $version,
        ]);
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());

        return (int) self::json($created)['draftId'];
    }

    #[TestDox('UC-PRO-05-F01 — étapes 1-2 : session promptologue, puis sources du banc (publiées, MES brouillons avec document)')]
    public function testF01BenchLoadsItsSourcesForThePromptologue(): void
    {
        $pom = $this->registerAs('pom@example.org', 'Pom', ['apprenant', 'promptologue']);
        $draftId = $this->draftOf($pom, '2.1.0');

        // 1. Garde de rôle côté front : GET auth/me porte le rôle.
        $me = self::json($this->as_($pom, 'GET', '/api/auth/me'));
        self::assertContains('promptologue', $me['user']['roles']);

        // 2. Versions publiées (métadonnées), puis MES brouillons, puis chaque document.
        $published = self::json($this->as_($pom, 'GET', '/api/prompt-packages'));
        self::assertSame([['aurora-lab', '2.0.0', false]], array_map(
            static fn (array $p): array => [$p['id'], $p['version'], $p['reserved']],
            $published,
        ));
        $drafts = self::json($this->as_($pom, 'GET', '/api/prompt-packages/drafts'));
        self::assertSame([$draftId], array_column($drafts, 'draftId'));
        $draft = $this->as_($pom, 'GET', '/api/prompt-packages/drafts/' . $draftId);
        self::assertSame(200, $draft->getStatusCode());
        $document = self::json($draft)['document'];
        self::assertSame(['aurora-lab', '2.1.0'], [$document['id'], $document['version']]);
        self::assertStringContainsString('engine://', $document['code']['orchestration']);
    }

    #[TestDox('UC-PRO-05-F02 — étape 4 : le document d’une version publiée est servi complet (prompts + code), sans session')]
    public function testF02PublishedVersionDocumentIsServedForExecution(): void
    {
        $this->cookieSid = null;
        $response = $this->request('GET', '/api/prompt-packages/aurora-lab/2.0.0');

        self::assertSame(200, $response->getStatusCode());
        $doc = self::json($response);
        self::assertSame('prompt-package', $doc['kind']);
        self::assertSame('run', $doc['code']['entrypoint']);
        self::assertNotEmpty($doc['prompts']);
        self::assertSame(404, $this->request('GET', '/api/prompt-packages/aurora-lab/9.9.9')->getStatusCode());
    }

    #[TestDox('UC-PRO-05-F03 — RG « un brouillon ne tourne que chez son auteur » : le brouillon d’autrui n’est ni listé ni lisible')]
    public function testF03ForeignDraftIsNeitherListedNorReadable(): void
    {
        $auteur = $this->registerAs('auteur@example.org', 'Auteur', ['promptologue']);
        $draftId = $this->draftOf($auteur, '2.1.0');
        $victime = $this->registerAs('victime@example.org', 'Victime', ['promptologue']);

        self::assertSame([], self::json($this->as_($victime, 'GET', '/api/prompt-packages/drafts')));
        $foreign = $this->as_($victime, 'GET', '/api/prompt-packages/drafts/' . $draftId);
        $unknown = $this->as_($victime, 'GET', '/api/prompt-packages/drafts/999999');
        self::assertSame(404, $foreign->getStatusCode());
        self::assertSame((string) $unknown->getBody(), (string) $foreign->getBody(), 'aucun oracle d’existence');
    }

    #[TestDox('UC-PRO-05-F04 — E1 : sans session 401, sans rôle promptologue 403 sur les brouillons')]
    public function testF04DraftSourcesRequireThePromptologueRole(): void
    {
        // Navigateur neuf : aucun cookie, aucune session PHP résiduelle.
        $this->cookieSid = null;
        $_SESSION = [];
        self::assertSame(401, $this->request('GET', '/api/prompt-packages/drafts')->getStatusCode());

        $apprenant = $this->registerAs('maya@example.org', 'Maya', ['apprenant']);
        self::assertSame(403, $this->as_($apprenant, 'GET', '/api/prompt-packages/drafts')->getStatusCode());
        // Les versions publiées restent publiques (artefacts partageables).
        self::assertSame(200, $this->as_($apprenant, 'GET', '/api/prompt-packages')->getStatusCode());
    }

    #[TestDox('UC-PRO-05-F05 — A5 (référentiel par branche) : versions publiées du référentiel et document d’une version')]
    public function testF05ReferentielVersionsForABranch(): void
    {
        self::publishReferentiel(self::$pdo, '7.1.0', ['1.01' => 'Pensée critique (définition révisée)']);
        $pom = $this->registerAs('pom@example.org', 'Pom', ['promptologue']);

        $list = self::json($this->as_($pom, 'GET', '/api/referentiel/versions'));
        self::assertSame(['7.1.0', '7.0.0'], array_column($list, 'semver'));
        // Anomalie AN-1 (fiche) : le front filtre les entrées sur une clé « version »
        // que l'API ne fournit pas — la liste du banc reste vide en production.
        self::assertArrayNotHasKey('version', $list[0]);

        $doc = self::json($this->as_($pom, 'GET', '/api/referentiel/versions/7.1.0'));
        self::assertSame('7.1.0', $doc['version']);
        self::assertCount(61, $doc['competences']);
        self::assertSame('Pensée critique (définition révisée)', $doc['competences'][0]['nom']);
    }
}
