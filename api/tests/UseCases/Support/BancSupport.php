<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Support;

use Humanome\Referentiel\ContentHash;
use Humanome\Referentiel\ReferentielRepository;
use PDO;

/**
 * Support partagé du lot « banc » (UC-PRO-05, UC-PRO-06, UC-ADM-02) —
 * fixtures VERSIONNÉES uniquement (schemas/fixtures/), jamais les données
 * dérivées de web/public/data.
 *
 * Fiches : docs/cas-utilisation/promptologue/UC-PRO-0{5,6}-*.md,
 *          docs/cas-utilisation/administration/UC-ADM-02-gerer-golden-prompt.md
 */
trait BancSupport
{
    /** @return array<string, mixed> document JSON décodé de schemas/fixtures/ */
    protected static function fixture(string $name): array
    {
        $path = \dirname(__DIR__, 4) . '/schemas/fixtures/' . $name;

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * Paquet fixture (aurora-demo 1.0.0, orchestration « sandbox »), avec
     * surcharges.
     *
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    protected static function bancPackage(array $overrides = []): array
    {
        return array_merge(self::fixture('prompt-package-exemple.json'), $overrides);
    }

    /**
     * Paquet dont l'orchestration est DÉLÉGUÉE au moteur embarqué (marqueur
     * engine://) : le banc l'exécute par extractDay, sans sandbox.
     *
     * @return array<string, mixed>
     */
    protected static function enginePackage(string $id, string $version): array
    {
        $doc = self::bancPackage(['id' => $id, 'version' => $version]);
        $doc['code']['orchestration'] = "// engine://humanome-engine@0.1.0\nexport const engineRef = 1";

        return $doc;
    }

    /**
     * Référentiel fixture RESPIRE v7 (61 compétences, 7 pôles), éventuellement
     * re-versionné et retouché, contentHash recalculé (import idempotent).
     *
     * @param array<string, string> $renames code => nouveau nom de compétence
     * @return array<string, mixed>
     */
    protected static function referentielDoc(string $version = '7.0.0', array $renames = []): array
    {
        $doc = self::fixture('referentiel-respire-v7.json');
        $doc['version'] = $version;
        $doc['label'] = 'RESPIRE v' . $version;
        foreach ($doc['competences'] as $i => $competence) {
            if (isset($renames[$competence['code']])) {
                $doc['competences'][$i]['nom'] = $renames[$competence['code']];
            }
        }
        $doc['contentHash'] = ContentHash::compute($doc);

        return $doc;
    }

    /** Publie une version du référentiel (chemin d'import initial). */
    protected static function publishReferentiel(PDO $pdo, string $version = '7.0.0', array $renames = []): void
    {
        (new ReferentielRepository($pdo))->importPublishedDocument(
            self::referentielDoc($version, $renames),
            'Version ' . $version . ' (tests du lot banc)',
        );
    }

    /** Vide les tables du référentiel (votes d'abord : clés étrangères). */
    protected static function wipeReferentiel(PDO $pdo): void
    {
        $pdo->exec('DELETE FROM referentiel_votes');
        $pdo->exec('DELETE FROM referentiel_versions');
    }
}
