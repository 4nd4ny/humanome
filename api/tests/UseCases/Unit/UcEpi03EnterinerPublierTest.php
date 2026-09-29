<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\MigrationRunner;
use Humanome\Referentiel\CompetenceGovernance;
use Humanome\Referentiel\CompetenceRepository;
use Humanome\Referentiel\CompetenceSeeder;
use Humanome\Referentiel\ConflictException;
use Humanome\Referentiel\ContentHash;
use Humanome\Referentiel\FicheGenerator;
use Humanome\Referentiel\InvalidDocumentException;
use Humanome\Referentiel\MajorityMessage;
use Humanome\Referentiel\MajorityTally;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Referentiel\SnapshotAssembler;
use Humanome\Referentiel\StaticExporter;
use Humanome\Tests\TestDb;
use Humanome\Validation;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/**
 * UC-EPI-03 — Entériner et publier (compétence, release du référentiel) :
 * tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-03-enteriner-publier.md
 *
 * Logique appelée directement : publication d'une proposition adoptée
 * (CompetenceRepository::publish + MajorityMessage), dernière version publiée
 * par compétence, assemblage du snapshot (SnapshotAssembler), coupe de release
 * (ReferentielRepository::cutReleaseFromDocument + lockfile), puis la
 * propagation : export statique (StaticExporter, dossier TEMPORAIRE propre au
 * test) et régénération des fiches de scan (FicheGenerator).
 */
final class UcEpi03EnterinerPublierTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        foreach ([
            'referentiel_snapshot_competences', 'competence_votes', 'competence_versions',
            'referentiel_votes', 'referentiel_versions', 'referentiel_poles', 'user_roles', 'users',
        ] as $table) {
            self::$pdo->exec('DELETE FROM ' . $table);
        }
    }

    private static function repo(): CompetenceRepository
    {
        return new CompetenceRepository(self::$pdo);
    }

    private static function governance(): CompetenceGovernance
    {
        return new CompetenceGovernance(self::$pdo);
    }

    private static function createMember(): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid('epi', true) . '@example.org', 'x', 'Membre']);
        $id = (int) self::$pdo->lastInsertId();
        self::$pdo->prepare("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = 'epistemiarque'")->execute([$id]);

        return $id;
    }

    /** @return array<string, mixed> */
    private static function content(string $code, string $nom, string $definition, ?string $fiche = null): array
    {
        $content = ['identite' => ['code' => $code, 'nom' => $nom, 'definition' => $definition]];
        if ($fiche !== null) {
            $content['fiche'] = $fiche;
        }

        return $content;
    }

    /**
     * Proposition au vote sur $code, éditée par $edit, avec les bulletins donnés.
     *
     * @param list<array{0:int,1:string}> $ballots [userId, vote]
     */
    private static function proposal(string $code, string $semver, callable $edit, array $ballots): int
    {
        $draft = self::repo()->createDraft($code, $semver);
        self::repo()->updateDraft($draft['id'], $edit($draft['content']), $draft['contentHash']);
        self::governance()->submit($draft['id'], null, null);
        foreach ($ballots as [$userId, $vote]) {
            self::governance()->castVote($draft['id'], $userId, $vote, null);
        }

        return $draft['id'];
    }

    /** Petit référentiel synthétique : 2 pôles (avec en-tête de fiche), 3 compétences 1.0.0. */
    private static function seedSmall(): void
    {
        $poles = self::$pdo->prepare('INSERT INTO referentiel_poles (num, nom, couleur, header) VALUES (?, ?, ?, ?)');
        $poles->execute([1, 'TÊTE — Penser & Comprendre', '#2563eb', "# Pôle 1\n\n---\n\n"]);
        $poles->execute([2, 'CŒUR — Relier & Naviguer', null, "# Pôle 2\n\n---\n\n"]);
        self::repo()->importPublishedCompetence('2.01', 'Écoute', 2, self::content('2.01', 'Écoute', '  Écouter vraiment.  ', "## 2.01\n\nÉcoute."));
        self::repo()->importPublishedCompetence('1.02', 'Curiosité', 1, self::content('1.02', 'Curiosité', '   ', "## 1.02\n\nCuriosité."));
        self::repo()->importPublishedCompetence('1.01', 'Pensée Critique', 1, self::content('1.01', 'Pensée Critique', 'Douter.', "## 1.01\n\nDouter.\n\n---"));
    }

    /** État de production : 7.0.0 publiée, 7 pôles, 61 compétences 1.0.0 (seeder du déploiement). */
    private static function seedFullCorpus(): array
    {
        $root = \dirname(__DIR__, 4);
        $doc = json_decode((string) file_get_contents($root . '/schemas/fixtures/referentiel-respire-v7.json'), true, 512, JSON_THROW_ON_ERROR);
        $imported = (new ReferentielRepository(self::$pdo))->importPublishedDocument($doc, 'Import initial');
        $rich = json_decode((string) file_get_contents($root . '/scripts/data/competences-v7.json'), true, 512, JSON_THROW_ON_ERROR)['competences'];
        $fiches = json_decode((string) file_get_contents($root . '/scripts/data/fiches-v7.json'), true, 512, JSON_THROW_ON_ERROR);
        (new CompetenceSeeder(self::$pdo))->seed($rich, $fiches);

        return $imported;
    }

    #[TestDox('UC-EPI-03-U01 — publish : proposition adoptée → publiée, immuable ; la nouvelle version devient la dernière en vigueur, l’ancienne reste')]
    public function testU01PublishAnAdoptedProposal(): void
    {
        self::seedSmall();
        $old = self::repo()->latestPublished('1.01');
        $member = self::createMember();
        $id = self::proposal('1.01', '1.1.0', static function (array $c): array {
            $c['identite']['definition'] = 'Douter, y compris de soi.';

            return $c;
        }, [[$member, 'pour']]);
        $hashBefore = self::repo()->findById($id)['contentHash'];

        $published = self::repo()->publish($id, 'Définition précisée');

        self::assertSame('published', $published['status']);
        self::assertSame('Définition précisée', $published['releaseNote']);
        self::assertNotNull($published['publishedAt']);
        self::assertSame($hashBefore, $published['contentHash'], 'le contenu voté est exactement celui publié');
        self::assertSame($id, self::repo()->latestPublished('1.01')['id']);
        self::assertSame(['1.1.0', '1.0.0'], array_column(self::repo()->publishedVersions('1.01'), 'semver'));
        self::assertEquals($old, self::repo()->findById($old['id']), 'la version précédente est intacte');
    }

    #[TestDox('UC-EPI-03-U02 — publish refuse : inconnue (null), brouillon jamais soumis, déjà publiée, majorité non atteinte / rejetée / bloquée (409) ; transaction annulée, rien d’écrit')]
    public function testU02PublishRefusals(): void
    {
        self::seedSmall();
        self::assertNull(self::repo()->publish(999999));

        $draft = self::repo()->createDraft('1.01', '1.1.0');
        $published = self::repo()->latestPublished('2.01');
        $refusals = [
            'brouillon' => [$draft['id'], 'must be submitted for a vote before it can be published'],
            'publiée' => [$published['id'], 'already published'],
        ];
        $a = self::createMember();
        $b = self::createMember();
        self::createMember();
        $pending = self::proposal('1.02', '1.1.0', static fn (array $c): array => $c, [[$a, 'pour']]);
        $refusals['en cours'] = [$pending, 'Majorité non atteinte : 1 voix « pour » sur 2 requises (3 membres).'];
        $rejected = self::proposal('2.01', '1.1.0', static fn (array $c): array => $c, [[$a, 'contre'], [$b, 'contre']]);
        $refusals['rejetée'] = [$rejected, 'rejetée par la majorité'];

        foreach ($refusals as $label => [$id, $message]) {
            try {
                self::repo()->publish($id, 'x');
                self::fail('publication acceptée : ' . $label);
            } catch (ConflictException $e) {
                self::assertStringContainsString($message, $e->getMessage(), $label);
            }
            // publish() ouvre une transaction (SELECT … FOR UPDATE) : chaque refus
            // doit l'annuler — sans rollBack, elle resterait ouverte sur la connexion.
            self::assertFalse(self::$pdo->inTransaction(), 'transaction annulée : ' . $label);
        }
        // Les refus précèdent toute écriture : rien n'est publié.
        self::assertSame('review', self::repo()->findById($pending)['status']);
        self::assertNull(self::repo()->findById($pending)['publishedAt']);

        self::$pdo->exec('DELETE FROM user_roles');
        try {
            self::repo()->publish($pending, 'x');
            self::fail('publication sans électorat acceptée');
        } catch (ConflictException $e) {
            self::assertStringContainsString('Aucun membre épistémiarque ne peut valider', $e->getMessage());
        }
        self::assertFalse(self::$pdo->inTransaction(), 'transaction annulée : électorat vide');
    }

    #[TestDox('UC-EPI-03-U03 — publish : semver plus strictement croissante (autre version entérinée entre-temps) → 409, rien n’est publié')]
    public function testU03PublishRechecksSemverAgainstNewerPublications(): void
    {
        self::seedSmall();
        $member = self::createMember();
        $minor = self::proposal('1.01', '1.1.0', static fn (array $c): array => $c, [[$member, 'pour']]);
        $major = self::proposal('1.01', '2.0.0', static fn (array $c): array => $c, [[$member, 'pour']]);
        self::repo()->publish($major);

        try {
            self::repo()->publish($minor);
            self::fail('1.1.0 publiée après 2.0.0');
        } catch (ConflictException $e) {
            self::assertStringContainsString('1.1.0 is not greater than published 2.0.0', $e->getMessage());
        }
        self::assertSame('review', self::repo()->findById($minor)['status']);
        self::assertSame('2.0.0', self::repo()->latestPublished('1.01')['semver']);
    }

    #[TestDox('UC-EPI-03-U04 — MajorityMessage : message lisible pour une majorité non atteinte, rejetée ou bloquée')]
    public function testU04MajorityMessages(): void
    {
        $t = static fn (int $n, int $pour, int $contre): array => MajorityTally::compute($n, ['pour' => $pour, 'contre' => $contre, 'abstention' => 0]);

        self::assertSame('Majorité non atteinte : 2 voix « pour » sur 3 requises (5 membres).', MajorityMessage::forTally($t(5, 2, 1)));
        self::assertSame('Cette proposition a été rejetée par la majorité des membres épistémiarques.', MajorityMessage::forTally($t(3, 0, 2)));
        self::assertSame(
            'Aucun membre épistémiarque ne peut valider cette proposition (aucun compte ne porte le rôle épistémiarque).',
            MajorityMessage::forTally($t(0, 0, 0)),
        );
    }

    #[TestDox('UC-EPI-03-U05 — latestPublishedByCode : la plus récente par précédence semver (1.10.0 > 1.9.0), triée par code, brouillons ignorés')]
    public function testU05LatestPublishedByCode(): void
    {
        self::seedSmall();
        self::repo()->importPublishedCompetence('1.01', 'Pensée Critique', 1, self::content('1.01', 'Pensée Critique', 'v1.9'), '1.9.0');
        self::repo()->importPublishedCompetence('1.01', 'Pensée Critique', 1, self::content('1.01', 'Pensée Critique', 'v1.10'), '1.10.0');
        self::repo()->createDraft('2.01', '9.0.0');

        $latest = self::repo()->latestPublishedByCode();

        self::assertSame(['1.01', '1.02', '2.01'], array_keys($latest));
        self::assertSame('1.10.0', $latest['1.01']['semver']);
        self::assertSame('1.0.0', $latest['2.01']['semver'], 'un brouillon n’est pas en vigueur');
    }

    #[TestDox('UC-EPI-03-U06 — SnapshotAssembler : document canonique, pôles triés, définition embarquée (rognée) HORS hash, hash = ContentHash du corps structurel')]
    public function testU06AssembleDocument(): void
    {
        self::seedSmall();
        $assembler = new SnapshotAssembler(self::$pdo);

        $doc = $assembler->assembleDocument('7.1.0', 'RESPIRE v7.1.0', 'Coupe de test');

        self::assertSame(['schemaVersion', 'kind', 'id', 'version', 'label', 'contentHash', 'source', 'poles', 'competences'], array_keys($doc));
        self::assertSame(['1.0.0', 'referentiel', 'respire', '7.1.0', 'RESPIRE v7.1.0', 'Coupe de test'], [$doc['schemaVersion'], $doc['kind'], $doc['id'], $doc['version'], $doc['label'], $doc['source']]);
        self::assertSame([['num' => 1, 'nom' => 'TÊTE — Penser & Comprendre', 'couleur' => '#2563eb'], ['num' => 2, 'nom' => 'CŒUR — Relier & Naviguer', 'couleur' => null]], $doc['poles']);
        self::assertSame(
            [
                ['code' => '1.01', 'nom' => 'Pensée Critique', 'pole' => 1, 'description' => 'Douter.'],
                ['code' => '1.02', 'nom' => 'Curiosité', 'pole' => 1],
                ['code' => '2.01', 'nom' => 'Écoute', 'pole' => 2, 'description' => 'Écouter vraiment.'],
            ],
            $doc['competences'],
            'définition vide → pas de description ; espaces rognés',
        );
        self::assertSame(ContentHash::compute($assembler->assembleBody()), $doc['contentHash']);
        self::assertSame($assembler->structuralHash(), $doc['contentHash']);
    }

    #[TestDox('UC-EPI-03-U07 — hash structurel : une définition entérinée ne le change pas, un renommage entériné le change')]
    public function testU07StructuralHashTracksRenamesOnly(): void
    {
        self::seedSmall();
        $member = self::createMember();
        $assembler = new SnapshotAssembler(self::$pdo);
        $initial = $assembler->structuralHash();

        self::repo()->publish(self::proposal('1.01', '1.1.0', static function (array $c): array {
            $c['identite']['definition'] = 'Douter, y compris de soi.';

            return $c;
        }, [[$member, 'pour']]));
        self::assertSame($initial, $assembler->structuralHash(), 'définition = annotation hors hash');
        self::assertSame('Douter, y compris de soi.', $assembler->assembleDocument('7.1.0', 'x', 'x')['competences'][0]['description']);

        self::repo()->publish(self::proposal('1.01', '1.2.0', static function (array $c): array {
            $c['identite']['nom'] = 'Pensée Critique & Anti-Hallucination';

            return $c;
        }, [[$member, 'pour']]));
        self::assertNotSame($initial, $assembler->structuralHash());
        self::assertSame('Pensée Critique & Anti-Hallucination', $assembler->assembleBody()['competences'][0]['nom']);
    }

    #[TestDox('UC-EPI-03-U08 — cutReleaseFromDocument : gate de complétude 61/7 (422), release publiée + lockfile, semver existante ou non croissante (409)')]
    public function testU08CutRelease(): void
    {
        self::seedSmall();
        $releases = new ReferentielRepository(self::$pdo);
        try {
            $releases->cutReleaseFromDocument((new SnapshotAssembler(self::$pdo))->assembleDocument('7.1.0', 'x', 'x'));
            self::fail('référentiel incomplet publié');
        } catch (InvalidDocumentException $e) {
            self::assertNotSame([], $e->getErrors());
        }
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM referentiel_versions')->fetchColumn());

        $this->setUp();
        $imported = self::seedFullCorpus();
        $member = self::createMember();
        $newId = self::proposal('1.01', '1.1.0', static function (array $c): array {
            $c['identite']['definition'] = 'Définition entérinée.';

            return $c;
        }, [[$member, 'pour']]);
        self::repo()->publish($newId);

        $result = $releases->cutReleaseFromDocument((new SnapshotAssembler(self::$pdo))->assembleDocument('7.1.0', 'RESPIRE v7.1.0', 'Coupe'));

        self::assertSame('imported', $result['status']);
        self::assertSame('7.1.0', $result['semver']);
        self::assertSame($imported['contentHash'], $result['contentHash'], 'même structure que 7.0.0');
        $release = $releases->findById($result['id']);
        self::assertSame(['published', 'RESPIRE v7.1.0', 'Coupe de release depuis les compétences atomiques publiées'], [$release['status'], $release['label'], $release['releaseNote']]);
        $lock = self::$pdo->query('SELECT competence_code, competence_version_id FROM referentiel_snapshot_competences WHERE snapshot_version_id = ' . $result['id'])->fetchAll(PDO::FETCH_KEY_PAIR);
        self::assertCount(61, $lock);
        self::assertSame($newId, (int) $lock['1.01'], 'provenance : la version entérinée compose la release');

        foreach (['7.1.0' => 'already exists', '7.0.5' => 'not greater than published 7.1.0'] as $semver => $message) {
            try {
                $releases->cutReleaseFromDocument((new SnapshotAssembler(self::$pdo))->assembleDocument($semver, 'x', 'x'));
                self::fail('release ' . $semver . ' acceptée');
            } catch (ConflictException $e) {
                self::assertStringContainsString($message, $e->getMessage());
            }
        }
    }

    #[TestDox('UC-EPI-03-U09 — StaticExporter : la release coupée est exportée (dossier temporaire) avec la définition entérinée ; index du plus récent au plus ancien')]
    public function testU09StaticExportOfTheNewRelease(): void
    {
        self::seedFullCorpus();
        $member = self::createMember();
        self::repo()->publish(self::proposal('1.01', '1.1.0', static function (array $c): array {
            $c['identite']['definition'] = 'Définition entérinée, exportée.';

            return $c;
        }, [[$member, 'pour']]));
        (new ReferentielRepository(self::$pdo))->cutReleaseFromDocument((new SnapshotAssembler(self::$pdo))->assembleDocument('7.1.0', 'RESPIRE v7.1.0', 'Coupe'));

        $outDir = sys_get_temp_dir() . '/humanome-uc-epi-03-' . bin2hex(random_bytes(6));
        try {
            $result = StaticExporter::export(self::$pdo, $outDir);

            self::assertSame(['count' => 2, 'files' => ['respire-v7.1.0.json', 'respire-v7.0.0.json', 'index.json']], $result);
            $index = json_decode((string) file_get_contents($outDir . '/index.json'), true, 512, JSON_THROW_ON_ERROR);
            self::assertSame(['7.1.0', '7.0.0'], array_column($index, 'semver'));
            self::assertSame('respire-v7.1.0.json', $index[0]['fichier']);
            self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $index[0]['publishedAt']);
            $exported = json_decode((string) file_get_contents($outDir . '/respire-v7.1.0.json'), true, 512, JSON_THROW_ON_ERROR);
            self::assertTrue(Validation::validate('referentiel', $exported)['valid']);
            self::assertSame('Définition entérinée, exportée.', array_column($exported['competences'], 'description', 'code')['1.01']);
        } finally {
            foreach (glob($outDir . '/*.json') ?: [] as $file) {
                unlink($file);
            }
            if (is_dir($outDir)) {
                rmdir($outDir);
            }
        }
    }

    #[TestDox('UC-EPI-03-U10 — FicheGenerator : fiches régénérées depuis les versions EN VIGUEUR (en-tête + fiches jointes), une fiche au vote ne fuit pas')]
    public function testU10FichesAreRegeneratedFromPublishedVersionsOnly(): void
    {
        self::seedSmall();
        $member = self::createMember();
        $generator = new FicheGenerator(self::$pdo);
        self::assertSame(
            [1 => "# Pôle 1\n\n---\n\n## 1.01\n\nDouter.\n\n---\n\n## 1.02\n\nCuriosité.\n", 2 => "# Pôle 2\n\n---\n\n## 2.01\n\nÉcoute.\n"],
            $generator->poleFiches(),
        );

        $adopted = self::proposal('1.01', '1.1.0', static function (array $c): array {
            $c['fiche'] = "## 1.01\n\nDouter, y compris de soi.\n\n---";

            return $c;
        }, [[$member, 'pour']]);
        self::proposal('2.01', '1.1.0', static function (array $c): array {
            $c['fiche'] = "## 2.01\n\nFICHE EN DÉBAT";

            return $c;
        }, []);
        self::repo()->publish($adopted);

        $poles = $generator->poleFiches();
        self::assertStringContainsString('Douter, y compris de soi.', $poles[1]);
        self::assertStringNotContainsString('FICHE EN DÉBAT', $poles[2], 'une proposition non entérinée ne se propage pas');
        self::assertSame(['poleHeaders' => ['1' => "# Pôle 1\n\n---\n\n", '2' => "# Pôle 2\n\n---\n\n"], 'fiches' => [
            '1.01' => "## 1.01\n\nDouter, y compris de soi.\n\n---",
            '1.02' => "## 1.02\n\nCuriosité.",
            '2.01' => "## 2.01\n\nÉcoute.",
        ]], $generator->corpus());
        // Structure du setting twin9_fiches (FicheStore::store) : pôles, en-têtes, fiche_md par code.
        self::assertSame(
            [
                ['num' => 1, 'header' => "# Pôle 1\n\n---\n\n", 'competences' => [
                    ['code' => '1.01', 'fiche_md' => "## 1.01\n\nDouter, y compris de soi.\n\n---"],
                    ['code' => '1.02', 'fiche_md' => "## 1.02\n\nCuriosité."],
                ]],
                ['num' => 2, 'header' => "# Pôle 2\n\n---\n\n", 'competences' => [
                    ['code' => '2.01', 'fiche_md' => "## 2.01\n\nÉcoute."],
                ]],
            ],
            $generator->fichesStructure(),
        );
    }

    #[TestDox('UC-EPI-03-U15 — Anomalie AN2 (comportement actuel figé) : après un renommage entériné, le seeder du déploiement échoue au gate de parité (RuntimeException)')]
    public function testU15SeederParityGateFailsAfterAnEnterinedRename(): void
    {
        self::seedFullCorpus();
        $root = \dirname(__DIR__, 4);
        $rich = json_decode((string) file_get_contents($root . '/scripts/data/competences-v7.json'), true, 512, JSON_THROW_ON_ERROR)['competences'];
        $fiches = json_decode((string) file_get_contents($root . '/scripts/data/fiches-v7.json'), true, 512, JSON_THROW_ON_ERROR);
        $member = self::createMember();

        // Re-seed idempotent tant que seule une DÉFINITION a été entérinée.
        self::repo()->publish(self::proposal('2.01', '1.1.0', static function (array $c): array {
            $c['identite']['definition'] = 'Définition entérinée.';

            return $c;
        }, [[$member, 'pour']]));
        self::assertSame(61, (new CompetenceSeeder(self::$pdo))->seed($rich, $fiches)['unchanged']);

        // Scénario A4 : un RENOMMAGE entériné change le hash structurel assemblé…
        self::repo()->publish(self::proposal('1.01', '1.1.0', static function (array $c): array {
            $c['identite']['nom'] = 'Pensée critique et vigilance face aux IA';

            return $c;
        }, [[$member, 'pour']]));

        // … or le gate compare toujours au contentHash de la release 7.0.0 :
        // chaque seed-competences suivant (deploy.mjs) échoue.
        try {
            (new CompetenceSeeder(self::$pdo))->seed($rich, $fiches);
            self::fail('comportement corrigé : inverser ce test et retirer AN2 de la fiche');
        } catch (RuntimeException $e) {
            self::assertStringContainsString('Gate de parité ÉCHOUÉ', $e->getMessage());
        }
    }
}
