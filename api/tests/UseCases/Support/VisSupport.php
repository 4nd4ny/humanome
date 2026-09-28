<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Support;

use Humanome\Referentiel\ContentHash;
use Humanome\Referentiel\ReferentielRepository;
use PDO;

/**
 * Outillage partagé du lot « Visiteur » (UC-VIS-01 à UC-VIS-05,
 * docs/cas-utilisation/visiteur/).
 *
 * Données : uniquement des fixtures VERSIONNÉES (schemas/fixtures/…), jamais
 * les fichiers générés de web/public/data/ (absents d'un checkout neuf).
 */
final class VisSupport
{
    /** @return array<string, mixed> RESPIRE v7 (fixture versionnée, identique au référentiel publié) */
    public static function respireV7(): array
    {
        $path = \dirname(__DIR__, 4) . '/schemas/fixtures/referentiel-respire-v7.json';

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * Variante publiable du référentiel : nouvelle version, mutation libre,
     * empreinte de contenu recalculée (forme canonique).
     *
     * @param callable(array<string, mixed>): array<string, mixed>|null $mutate
     * @return array<string, mixed>
     */
    public static function respireVersion(string $semver, ?callable $mutate = null, ?string $label = null): array
    {
        $doc = self::respireV7();
        $doc['version'] = $semver;
        $doc['label'] = $label ?? 'RESPIRE v' . $semver;
        if ($mutate !== null) {
            $doc = $mutate($doc);
        }

        return ContentHash::normalize($doc);
    }

    /**
     * Précondition « référentiel publié » : v7.0.0 importée telle quelle, puis
     * une release 7.1.0 (définition ajoutée, une compétence renommée) coupée
     * comme le fait l'épistémiarque (UC-EPI-03), et un BROUILLON 7.2.0 non
     * publié (qui ne doit jamais être visible du public).
     *
     * @return array{v700: int, v710: int, draft: int}
     */
    public static function publishTwoVersionsAndADraft(PDO $pdo): array
    {
        $repo = new ReferentielRepository($pdo);
        $v700 = $repo->importPublishedDocument(self::respireV7(), 'Import initial RESPIRE v7');
        $v710 = $repo->cutReleaseFromDocument(self::respireVersion('7.1.0', static function (array $doc): array {
            foreach ($doc['competences'] as &$competence) {
                if ($competence['code'] === '1.01') {
                    $competence['description'] = 'Douter des réponses trop lisses, vérifier les sources.';
                }
                if ($competence['code'] === '7.03') {
                    $competence['nom'] = 'Mentorat renommé';
                }
            }
            unset($competence);

            return $doc;
        }));
        $draft = $repo->createDraft(ReferentielRepository::DEFAULT_REFERENTIEL_ID, '7.1.0', '7.2.0', 'Brouillon interne');

        return ['v700' => $v700['id'], 'v710' => $v710['id'], 'draft' => (int) $draft['id']];
    }
}
