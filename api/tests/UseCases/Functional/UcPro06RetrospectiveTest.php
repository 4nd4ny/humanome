<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\UseCases\Support\BancSupport;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-PRO-06 — Régénérer rétrospectivement des cartographies : tests
 * FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/promptologue/UC-PRO-06-retrospective.md
 *
 * La régénération elle-même est navigateur (tests IHM) ; ici sont rejouées par
 * l'API HTTP réelle les étapes serveur de la section Rétrospective : liste de
 * MES cartographies (étape 2), document d'origine et version de référentiel
 * qui l'a produite (étape 3), versions publiées et document du référentiel
 * plus récent (étapes 2 et 5), et les refus (rôle, cartographie d'autrui).
 */
final class UcPro06RetrospectiveTest extends CartographeTestCase
{
    use BancSupport;

    protected function setUp(): void
    {
        parent::setUp();
        self::wipeReferentiel(self::$pdo);
        self::publishReferentiel(self::$pdo, '7.0.0');
        // Forme réelle de la version plus récente (7.1.0 en production) : mêmes
        // noms, définitions (`description`) ajoutées — voir l'anomalie AN-3.
        self::publishReferentiel(self::$pdo, '7.1.0', [], ['1.03' => self::DEFINITION_103]);
    }

    private const DEFINITION_103 = 'Capacité à relier des savoirs épars en une vue d’ensemble argumentée.';

    /**
     * Paragraphes du texte de la journée du 5 janvier (portfolio fixture), titre exclu.
     *
     * @return list<string>
     */
    private static function paragraphesDuJour(): array
    {
        $portfolio = (string) file_get_contents(\dirname(__DIR__, 4) . '/schemas/fixtures/portfolio-3-jours.md');
        $jour = explode('## ', $portfolio)[1];
        $blocs = array_map('trim', \array_slice(explode("\n\n", $jour), 1));

        return array_values(array_filter($blocs, static fn (string $b): bool => $b !== ''));
    }

    /**
     * Feuilles texte d'un document qui reprennent la journée ENTIÈRE ou deux
     * paragraphes CONSÉCUTIFS (espaces normalisés). Un extrait verbatim d'un
     * seul paragraphe est légitime (pièces du greffier) ; au-delà, c'est le
     * texte de la journée qui fuit.
     *
     * @param array<string, mixed> $document
     * @return list<string>
     */
    private static function fuitesDuJour(array $document): array
    {
        $norm = static fn (string $t): string => trim((string) preg_replace('/\s+/u', ' ', $t));
        $paras = self::paragraphesDuJour();
        $aiguilles = [$norm(implode("\n\n", $paras))];
        for ($i = 0; $i + 1 < \count($paras); $i++) {
            $aiguilles[] = $norm($paras[$i] . "\n\n" . $paras[$i + 1]);
        }
        $feuilles = [];
        array_walk_recursive($document, static function (mixed $v) use (&$feuilles): void {
            if (\is_string($v)) {
                $feuilles[] = $v;
            }
        });

        return array_values(array_filter($feuilles, static function (string $f) use ($aiguilles, $norm): bool {
            foreach ($aiguilles as $a) {
                if (str_contains($norm($f), $a)) {
                    return true;
                }
            }

            return false;
        }));
    }

    /** Précondition : cartographie jour stockée (opt-in, UC-APP-04) avec sa base 7.0.0. */
    private function storeJour(array $owner): int
    {
        $response = $this->as_($owner, 'POST', '/api/cartographies', [
            'type' => 'jour',
            'titre' => 'Journée du 5 janvier',
            'visibility' => 'privee',
            'document' => self::fixture('cartographie-jour-2026-01-05.json'),
            'referentielId' => 'respire',
            'referentielVersion' => '7.0.0',
        ]);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return (int) self::json($response)['id'];
    }

    #[TestDox('UC-PRO-06-F01 — étapes 2-3-5 : mes cartographies, l’original avec sa base 7.0.0, le référentiel 7.1.0')]
    public function testF01ServerStepsOfTheRetrospective(): void
    {
        $pom = $this->registerAs('pom@example.org', 'Pom', ['apprenant', 'promptologue']);
        $id = $this->storeJour($pom);

        // 2. Liste (métadonnées) et versions publiées du référentiel.
        $list = self::json($this->as_($pom, 'GET', '/api/cartographies'));
        self::assertSame([[$id, 'jour', 'Journée du 5 janvier']], array_map(
            static fn (array $c): array => [$c['id'], $c['type'], $c['titre']],
            $list,
        ));
        self::assertArrayNotHasKey('document', $list[0]);
        $versions = self::json($this->as_($pom, 'GET', '/api/referentiel/versions'));
        self::assertSame(['7.1.0', '7.0.0'], array_column($versions, 'semver'));
        self::assertArrayNotHasKey('version', $versions[0], 'anomalie AN-1 : clé attendue par le front absente');

        // 3. L'original : document jour + version du référentiel qui l'a produit.
        $original = self::json($this->as_($pom, 'GET', '/api/cartographies/' . $id));
        self::assertSame('cartographie-jour', $original['document']['kind']);
        self::assertSame('2026-01-05', $original['document']['date']);
        self::assertSame(['id' => 'respire', 'version' => '7.0.0'], $original['referentiel']);

        // 5. Le référentiel plus récent, document complet : la redéfinition
        // est servie dans `description` (le nom est inchangé — AN-3).
        $newer = self::json($this->as_($pom, 'GET', '/api/referentiel/versions/7.1.0'));
        self::assertSame('7.1.0', $newer['version']);
        $competences = array_column($newer['competences'], null, 'code');
        self::assertSame(self::DEFINITION_103, $competences['1.03']['description']);
        self::assertSame(
            array_column(self::fixture('referentiel-respire-v7.json')['competences'], 'nom', 'code')['1.03'],
            $competences['1.03']['nom'],
        );
    }

    #[TestDox('UC-PRO-06-F02 — E2 : sans session 401 ; promptologue SANS rôle apprenant 403 sur ses cartographies')]
    public function testF02CartographiesRequireTheApprenantRole(): void
    {
        $this->cookieSid = null;
        $_SESSION = [];
        self::assertSame(401, $this->request('GET', '/api/cartographies')->getStatusCode());

        $pur = $this->registerAs('pur@example.org', 'Pur promptologue', ['promptologue']);
        self::assertSame(403, $this->as_($pur, 'GET', '/api/cartographies')->getStatusCode());
        // Le référentiel reste une lecture publique.
        self::assertSame(200, $this->as_($pur, 'GET', '/api/referentiel/versions/7.1.0')->getStatusCode());
    }

    #[TestDox('UC-PRO-06-F03 — E7 : la cartographie d’un autre compte répond le même 404 qu’un identifiant inconnu')]
    public function testF03ForeignCartographyIsNotFound(): void
    {
        $maya = $this->registerAs('maya@example.org', 'Maya', ['apprenant']);
        $id = $this->storeJour($maya);
        $pom = $this->registerAs('pom@example.org', 'Pom', ['apprenant', 'promptologue']);

        self::assertSame([], self::json($this->as_($pom, 'GET', '/api/cartographies')));
        $foreign = $this->as_($pom, 'GET', '/api/cartographies/' . $id);
        $unknown = $this->as_($pom, 'GET', '/api/cartographies/999999');
        self::assertSame(404, $foreign->getStatusCode());
        self::assertSame((string) $unknown->getBody(), (string) $foreign->getBody());
    }

    #[TestDox('UC-PRO-06-F04 — RG1 (côté serveur) : ce que la rétrospective relit ne porte que les clés du schéma et jamais le texte de la journée (contrôle discriminant, témoin)')]
    public function testF04ServerNeverHoldsTheDayText(): void
    {
        $pom = $this->registerAs('pom@example.org', 'Pom', ['apprenant', 'promptologue']);
        $id = $this->storeJour($pom);

        $original = self::json($this->as_($pom, 'GET', '/api/cartographies/' . $id));
        // Le document cartographie-jour ne porte que des extraits (pièces) et
        // des verdicts : aucun champ de texte intégral de la feuille.
        $keys = array_keys($original['document']);
        sort($keys); // colonne JSON MySQL : ordre des clés non conservé
        self::assertSame(['date', 'kairos', 'kind', 'poles', 'schemaVersion'], $keys);
        // Aucune feuille texte ne reprend la journée, ni même deux paragraphes
        // consécutifs (comparaison sur les chaînes DÉCODÉES, pas sur un
        // json_encode qui échappe les sauts de ligne).
        self::assertSame([], self::fuitesDuJour($original));

        // Témoins : le contrôle détecte bien un document qui embarquerait la
        // journée entière, ou deux paragraphes. (Le serveur, lui, ne filtre
        // rien : POST /api/cartographies stocke le document tel quel — RG1 tient
        // parce que le client n'y met jamais le texte, voir F05 côté IHM.)
        $paras = self::paragraphesDuJour();
        $temoin = $original;
        $temoin['document']['poles'][0]['competences'][0]['pieces'][0]['contexte'] = implode("\n\n", $paras);
        self::assertCount(1, self::fuitesDuJour($temoin));
        $temoin = $original;
        $temoin['document']['kairos']['syntheseCompleteMarkdown'] = "Rappel :\n" . $paras[0] . "\n\n" . $paras[1];
        self::assertCount(1, self::fuitesDuJour($temoin));
    }
}
