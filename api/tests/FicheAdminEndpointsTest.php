<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Packages\SettingsRepository;
use Humanome\Referentiel\CompetenceSeeder;
use Humanome\Twin9\FicheStore;
use Psr\Http\Message\ResponseInterface;

/**
 * SOURCE UNIQUE des fiches (exigence 2026-07-16) : les deux endpoints admin de
 * la boucle base → Twin9 / base → corpus, jusqu'ici couverts par AUCUN test.
 *
 *  - POST /api/admin/generate-fiches (MIGRATE_TOKEN) régénère le setting
 *    twin9_fiches DEPUIS LA BASE avec le GARDE-FOU central de l'exigence :
 *    409, refus d'écrasement silencieux, tant que {"force":true} n'est pas
 *    envoyé explicitement — y compris au bootstrap (fail-closed).
 *  - GET /api/admin/dump-fiches resert la base en forme CORPUS {poleHeaders,
 *    fiches} (l'inverse du seed), pour re-synchroniser scripts/data/
 *    fiches-v7.json après une édition gouvernée dans l'atelier (chemin Twin6).
 *
 * Même modèle de confiance que /admin/migrate : 404 sans MIGRATE_TOKEN
 * configuré, 403 sur mauvais jeton, 503 sans base.
 */
final class FicheAdminEndpointsTest extends CompetenceTestCase
{
    private const TOKEN = 'test_migrate_token_fiches_0123456789';

    /** @var array{poleHeaders: array<int|string,string>, fiches: array<string,string>} */
    private static array $corpus;

    public static function setUpBeforeClass(): void
    {
        parent::setUpBeforeClass();
        self::$corpus = json_decode(
            (string) file_get_contents(\dirname(__DIR__, 2) . '/scripts/data/fiches-v7.json'),
            true, 512, JSON_THROW_ON_ERROR,
        );
    }

    protected function setUp(): void
    {
        parent::setUp();
        // Le setting twin9_fiches survit d'un test à l'autre (la base n'est
        // recréée qu'une fois par classe) : chaque test repart d'un état vide.
        Db::get()->prepare('DELETE FROM settings WHERE name = ?')->execute([FicheStore::SETTING_KEY]);
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
    }

    /** Seed complet base ← corpus committé (le même chemin que le déploiement). */
    private function seedFromCorpus(): void
    {
        self::importRespire();
        $rich = json_decode(
            (string) file_get_contents(\dirname(__DIR__, 2) . '/scripts/data/competences-v7.json'),
            true, 512, JSON_THROW_ON_ERROR,
        )['competences'];
        (new CompetenceSeeder(Db::get()))->seed($rich, self::$corpus);
    }

    /** Édition GOUVERNÉE de content.fiche : fork 1.1.0 → édition CAS → vote → publication. */
    private function publishGovernedFicheEdit(string $code, string $newFiche): void
    {
        $draft = self::compRepo()->createDraft($code, '1.1.0');
        self::assertNotNull($draft);
        $content = $draft['content'];
        $content['fiche'] = $newFiche;
        self::compRepo()->updateDraft($draft['id'], $content, $draft['contentHash']);
        self::adoptAndPublishCompetence($draft['id']);
    }

    /** @param array<string, mixed>|null $body */
    private function postGenerate(?array $body = null, ?string $token = self::TOKEN): ResponseInterface
    {
        return $this->requestWithHeaders(
            'POST',
            '/admin/generate-fiches',
            $body,
            $token === null ? [] : ['X-Migrate-Token' => $token],
        );
    }

    private function getDump(?string $token = self::TOKEN): ResponseInterface
    {
        return $this->requestWithHeaders(
            'GET',
            '/admin/dump-fiches',
            null,
            $token === null ? [] : ['X-Migrate-Token' => $token],
        );
    }

    private static function ficheStore(): FicheStore
    {
        return FicheStore::fromSettings(new SettingsRepository(Db::get()));
    }

    // ------------------------------------------------------------- gates

    public function testGenerateFichesGates(): void
    {
        // Sans MIGRATE_TOKEN configuré, l'endpoint « n'existe pas ».
        TestDb::setEnv('MIGRATE_TOKEN', '');
        self::assertSame(404, $this->postGenerate()->getStatusCode());

        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
        self::assertSame(403, $this->postGenerate(null, null)->getStatusCode(), 'en-tête absent');
        self::assertSame(403, $this->postGenerate(null, 'wrong_token')->getStatusCode(), 'mauvais jeton');

        // Sans base configurée : 503 (jamais un écrasement à l'aveugle).
        TestDb::setEnv('DB_HOST', '');
        Db::reset();
        self::assertSame(503, $this->postGenerate()->getStatusCode());
    }

    public function testDumpFichesGates(): void
    {
        TestDb::setEnv('MIGRATE_TOKEN', '');
        self::assertSame(404, $this->getDump()->getStatusCode());

        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
        self::assertSame(403, $this->getDump(null)->getStatusCode(), 'en-tête absent');
        self::assertSame(403, $this->getDump('wrong_token')->getStatusCode(), 'mauvais jeton');

        TestDb::setEnv('DB_HOST', '');
        Db::reset();
        self::assertSame(503, $this->getDump()->getStatusCode());
    }

    // -------------------------------------------- generate-fiches (garde-fou)

    public function testGenerateFichesBootstrapIsFailClosedThenIdempotent(): void
    {
        $this->seedFromCorpus();

        // Bootstrap (setting vide) : TOUTE divergence — ici les 61 fiches —
        // est refusée sans {"force":true} (fail-closed, jamais d'écriture
        // silencieuse). Le déploiement échoue plutôt que d'écraser à l'aveugle.
        $refused = $this->postGenerate();
        self::assertSame(409, $refused->getStatusCode());
        $refusedBody = self::body($refused);
        self::assertSame('diff', $refusedBody['status']);
        self::assertCount(61, $refusedBody['changed']);
        self::assertTrue(self::ficheStore()->isEmpty(), 'refus = AUCUNE écriture du setting');

        // {"force":true} explicite : les 7 pôles / 61 fiches sont appliqués.
        $applied = $this->postGenerate(['force' => true]);
        self::assertSame(200, $applied->getStatusCode());
        $appliedBody = self::body($applied);
        self::assertSame('applied', $appliedBody['status']);
        self::assertSame(7, $appliedBody['poles']);
        self::assertSame(61, $appliedBody['competences']);
        self::assertCount(61, $appliedBody['changed']);

        $store = self::ficheStore();
        foreach (self::$corpus['fiches'] as $code => $fiche) {
            self::assertSame($fiche, $store->competenceFiche((string) $code), "fiche {$code} servie par FicheStore");
        }
        for ($n = 1; $n <= 7; $n++) {
            self::assertNotNull($store->poleFiches($n), "POLE_FICHES du pôle {$n} disponible");
        }

        // Re-POST sans force : la base et le setting coïncident → unchanged.
        $unchanged = $this->postGenerate();
        self::assertSame(200, $unchanged->getStatusCode());
        $unchangedBody = self::body($unchanged);
        self::assertSame('unchanged', $unchangedBody['status']);
        self::assertSame([], $unchangedBody['changed']);
    }

    public function testGuardRefusesSilentOverwriteAfterGovernedEdit(): void
    {
        $this->seedFromCorpus();
        self::assertSame(200, $this->postGenerate(['force' => true])->getStatusCode());
        self::assertSame('unchanged', self::body($this->postGenerate())['status'], 'état initial aligné');

        // Édition gouvernée de la fiche d'UNE compétence, publiée en 1.1.0.
        $code = '1.01';
        $original = self::$corpus['fiches'][$code];
        self::assertStringEndsWith("\n\n---", $original, 'précondition : 1.01 n\'est pas la dernière de son pôle');
        $newFiche = substr($original, 0, -\strlen("\n\n---"))
            . "\n\n*Enrichissement entériné par le vote (test garde-fou).*\n\n---";
        $this->publishGovernedFicheEdit($code, $newFiche);

        // GARDE-FOU : sans force → 409 « diff », changed = exactement ce code,
        // et le setting reste INTACT (l'ancienne fiche est toujours servie).
        $refused = $this->postGenerate();
        self::assertSame(409, $refused->getStatusCode());
        $refusedBody = self::body($refused);
        self::assertSame('diff', $refusedBody['status']);
        self::assertSame([$code], $refusedBody['changed']);
        self::assertSame($original, self::ficheStore()->competenceFiche($code), 'écrasement refusé = setting intact');

        // {"force":true} après vérification humaine : la fiche éditée passe.
        $applied = $this->postGenerate(['force' => true]);
        self::assertSame(200, $applied->getStatusCode());
        $appliedBody = self::body($applied);
        self::assertSame('applied', $appliedBody['status']);
        self::assertSame([$code], $appliedBody['changed']);
        self::assertSame($newFiche, self::ficheStore()->competenceFiche($code));

        // Et l'endpoint redevient idempotent.
        self::assertSame('unchanged', self::body($this->postGenerate())['status']);
    }

    // ------------------------------------------------------------ dump-fiches

    public function testDumpFichesReturnsSeededCorpusThenTracksGovernedEdit(): void
    {
        $this->seedFromCorpus();

        // Le dump === le corpus seedé, clés et octets compris (c'est LA
        // condition de la byte-stabilité de scripts/dump-fiches.mjs).
        $response = $this->getDump();
        self::assertSame(200, $response->getStatusCode());
        $body = self::body($response);
        self::assertCount(7, $body['poleHeaders']);
        self::assertCount(61, $body['fiches']);
        self::assertSame(self::$corpus['poleHeaders'], $body['poleHeaders']);
        self::assertSame(self::$corpus['fiches'], $body['fiches']);

        // Après une édition gouvernée publiée (1.1.0), le dump suit LA BASE :
        // la fiche dumpée est la 1.1.0, les 60 autres restent byte-identiques.
        $code = '1.01';
        $newFiche = substr(self::$corpus['fiches'][$code], 0, -\strlen("\n\n---"))
            . "\n\n*Enrichissement entériné par le vote (test dump).*\n\n---";
        $this->publishGovernedFicheEdit($code, $newFiche);

        $afterEdit = self::body($this->getDump());
        self::assertSame($newFiche, $afterEdit['fiches'][$code], 'le dump reflète la version publiée 1.1.0');
        foreach (self::$corpus['fiches'] as $other => $fiche) {
            if ($other !== $code) {
                self::assertSame($fiche, $afterEdit['fiches'][$other], "fiche {$other} intacte");
            }
        }
        self::assertSame(self::$corpus['poleHeaders'], $afterEdit['poleHeaders']);
    }
}
