<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Bootstrap;
use Humanome\Db;
use Humanome\Referentiel\CompetenceGovernance;
use Humanome\Referentiel\CompetenceRepository;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * Plomberie partagée des tests du modèle de compétence ATOMIQUE (migration 016) :
 * nettoyage des tables au grain compétence + helpers de seed/contenu riche.
 */
abstract class CompetenceTestCase extends ReferentielTestCase
{
    protected function setUp(): void
    {
        // parent::setUp() pose l'env vers humanome_test AVANT tout Db::get() et
        // supprime referentiel_versions (ce qui purge le lockfile en cascade).
        parent::setUp();
        $pdo = Db::get();
        // Ordre FK : referentiel_snapshot_competences référence competence_versions
        // en RESTRICT — on l'a déjà vidé via la cascade parent, puis on nettoie.
        $pdo->exec('DELETE FROM referentiel_snapshot_competences');
        $pdo->exec('DELETE FROM competence_votes');
        $pdo->exec('DELETE FROM competence_versions');
        $pdo->exec('DELETE FROM referentiel_poles');
    }

    protected static function compRepo(): CompetenceRepository
    {
        return new CompetenceRepository(Db::get());
    }

    protected static function compGovernance(): CompetenceGovernance
    {
        return new CompetenceGovernance(Db::get());
    }

    /** @return array<string, mixed> contenu riche minimal conforme à competence.schema.json */
    protected static function content(string $code, string $nom, string $definition = 'Définition de test.'): array
    {
        return [
            'identite' => [
                'code' => $code,
                'nom' => $nom,
                'definition' => $definition,
                'marqueurs_fondamentaux' => ['marqueur A', 'marqueur B'],
            ],
            'protocole' => [
                'passe_1' => ['signaux_declencheurs' => ['j\'ai vérifié'], 'token_budget' => 40],
            ],
        ];
    }

    /** Seed une compétence publiée (1.0.0) et renvoie son id. */
    protected static function seedCompetence(string $code, string $nom, int $pole): int
    {
        $res = self::compRepo()->importPublishedCompetence($code, $nom, $pole, self::content($code, $nom));

        return $res['id'];
    }

    /**
     * Requête HTTP avec en-têtes personnalisés (ex. If-Match pour la concurrence
     * optimiste), sinon identique à ReferentielTestCase::request.
     *
     * @param array<string, mixed>|null $body
     * @param array<string, string> $headers
     */
    protected function requestWithHeaders(string $method, string $path, ?array $body, array $headers): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, '/api' . $path);
        if ($body !== null) {
            $request->getBody()->write(json_encode($body, JSON_THROW_ON_ERROR));
            $request->getBody()->rewind();
            $request = $request->withHeader('Content-Type', 'application/json');
        }
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        return Bootstrap::createApp()->handle($request);
    }

    /**
     * Seed complet : importe le vrai référentiel publié (7.0.0), seed les 7 pôles
     * et les 61 compétences atomiques depuis le corpus (nom/pôle STRUCTURELS =
     * publié). Renvoie le contentHash structurel publié (pour le gate de parité).
     */
    protected static function seedFullCorpus(): string
    {
        $imported = self::importRespire();
        $publishedHash = self::repo()->findById($imported['id'])['contentHash'];

        $richPath = \dirname(__DIR__, 2) . '/scripts/data/competences-v7.json';
        self::assertFileExists($richPath);
        $rich = json_decode((string) file_get_contents($richPath), true, 512, JSON_THROW_ON_ERROR)['competences'];
        $doc = self::respireDocument();
        $pdo = Db::get();
        $poleStmt = $pdo->prepare('INSERT INTO referentiel_poles (num, nom, couleur) VALUES (?, ?, ?)');
        foreach ($doc['poles'] as $p) {
            $poleStmt->execute([$p['num'], $p['nom'], $p['couleur'] ?? null]);
        }
        foreach ($doc['competences'] as $c) {
            self::compRepo()->importPublishedCompetence($c['code'], $c['nom'], (int) $c['pole'], $rich[$c['code']]);
        }

        return $publishedHash;
    }

    /** Ouvre un vote sur un brouillon, l'approuve à la majorité (membre unique) et le publie. */
    protected static function adoptAndPublishCompetence(int $draftId, ?int $memberId = null): array
    {
        $memberId ??= self::createUser('epistemiarque');
        self::compGovernance()->submit($draftId, null, $memberId);
        self::compGovernance()->castVote($draftId, $memberId, 'pour', null);

        return self::compRepo()->publish($draftId, 'Entérinée par le vote des membres');
    }
}
