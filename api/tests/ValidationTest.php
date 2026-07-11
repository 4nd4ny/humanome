<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Validation;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class ValidationTest extends TestCase
{
    private const POLES = [
        1 => ['TETE — Penser & Comprendre', '#2563eb'],
        2 => ['COEUR — Relier & Naviguer', '#10b981'],
        3 => ['MAIN — Créer & Incarner', '#ec4899'],
        4 => ['AME — Discerner & Juger', '#8b5cf6'],
        5 => ['RACINES — Évoluer & Résister', '#f59e0b'],
        6 => ["CITE — Gouverner & S'ouvrir", '#06b6d4'],
        7 => ['FLAMBEAU — Transmettre & Piloter', '#f97316'],
    ];

    public function testSupportsTheFiveDocumentKinds(): void
    {
        $kinds = Validation::SUPPORTED_KINDS;
        sort($kinds);

        self::assertSame(
            ['archive-export', 'cartographie-jour', 'cartographie-merge', 'prompt-package', 'referentiel'],
            $kinds,
        );
    }

    public function testCompilesTheFiveSchemasCrossSchemaRefIncluded(): void
    {
        foreach (Validation::SUPPORTED_KINDS as $kind) {
            // an empty object is never a valid document, but validation must run
            // without throwing: that proves the schema loaded and its $ref resolved
            $result = Validation::validate($kind, (object) []);

            self::assertFalse($result['valid'], "kind {$kind}");
            self::assertNotEmpty($result['errors'], "kind {$kind}");
        }
    }

    public function testRejectsAnUnsupportedKind(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Unsupported document kind');

        Validation::validate('inconnu', (object) []);
    }

    public function testAcceptsAMinimalRealCartographieMergeDocument(): void
    {
        $result = Validation::validate('cartographie-merge', $this->makeMergeDocument());

        self::assertSame([], $result['errors']);
        self::assertTrue($result['valid']);
    }

    public function testRejectsAStatutOutsideTheEnumWithAnActionableError(): void
    {
        $doc = $this->makeMergeDocument();
        $doc['domains'][0]['competences'][0]['statut'] = 'présence cosmique';

        $result = Validation::validate('cartographie-merge', $doc);

        self::assertFalse($result['valid']);
        self::assertArrayHasKey('/domains/0/competences/0/statut', $result['errors']);
        self::assertNotEmpty($result['errors']['/domains/0/competences/0/statut']);
    }

    /**
     * Minimal but real-shaped "cartographie-merge" document: same field names
     * and value shapes as web/public/data/demo/merge.json, reduced to 1 sheet
     * and 1 competence per pole. JS twin fixture: engine/src/validation.test.js.
     *
     * @return array<string, mixed>
     */
    private function makeMergeDocument(): array
    {
        $protocole = 'Aurora v3 — pédagogue adversarial · merge évolutif v3';

        return [
            'schemaVersion' => '1.0.0',
            'kind' => 'cartographie-merge',
            'generatedAt' => '2026-01-05T12:00:00',
            'source' => ['protocole' => $protocole, 'journalId' => 'merged'],
            'periode' => ['premiere' => '2025-12-22', 'derniere' => '2025-12-22', 'nbFeuilles' => 1],
            'domains' => array_values(array_map(
                fn (int $poleNum): array => $this->makeDomain($poleNum),
                array_keys(self::POLES),
            )),
            'profilMeta' => [
                'journal_id' => 'merged',
                'nb_feuilles' => 1,
                'premiere_date' => '2025-12-22',
                'derniere_date' => '2025-12-22',
                'date_construction' => '2026-01-05T12:00:00',
                'source_protocole' => $protocole,
                'score_total' => 24.92,
                'indice_herfindahl' => 0.1429,
                'competences_etablies' => 7,
                'competences_renvoyees' => 0,
                'competences_orphelines' => 0,
                'feuilles_chronologiques' => ['2025-12-22'],
                'evolution_globale' => [
                    [
                        'date' => '2025-12-22',
                        'score_total' => 24.92,
                        'etablies' => 7,
                        'renvois' => 0,
                        'non_etablies' => 54,
                        'herfindahl' => 0.1429,
                    ],
                ],
            ],
            'profilIpsatif' => $this->makeProfilIpsatif(),
            'feuilles' => [
                [
                    'date' => '2025-12-22',
                    'iso' => '2025-12-22',
                    'label' => '22/12/2025',
                    'ordre' => 0,
                    'carto_day_url' => 'feuilles/2025-12-22/carto-day.html',
                ],
            ],
            'narratifs' => [
                'kairosHtml' => '<p>Synthèse évolutive.</p>',
                'rapportHtml' => '<p>Synthèse évolutive.</p>',
            ],
            'reserved' => [
                'connexionsData' => [],
                'noeudsConceptuels' => [],
                'patternTemporel' => ['pattern' => '', 'description' => ''],
                // empty JSON object: an empty PHP array would serialize as []
                'piecesData' => (object) [],
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function makeDomain(int $poleNum): array
    {
        [$id, $color] = self::POLES[$poleNum];

        return [
            'id' => $id,
            'color' => $color,
            'competences' => [$this->makeCompetence($poleNum)],
            'parFeuille' => [['date' => '2025-12-22', 'score' => 3.56, 'etablies' => 1, 'renvois' => 0]],
            'rapport_html' => '<p>Rapport évolutif du pôle.</p>',
            'tendance_temporelle' => 'presence_reguliere',
            'tendance_titre' => 'Présence régulière',
            'tendance_description' => 'Pôle mobilisé tout au long de la période',
            'tendance_stats' => [
                't1' => 1,
                't2' => 1,
                't3' => 1,
                'p1' => 33.3,
                'p2' => 33.3,
                'p3' => 33.4,
                'ecart_max_min' => 0.1,
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function makeCompetence(int $poleNum): array
    {
        $code = $poleNum . '.01';

        return [
            'id' => $code . ' — Compétence démo',
            'code' => $code,
            'description' => 'Compétence démo',
            'niveau' => 3,
            'points' => 2,
            'statut' => 'présence établie',
            'archetype' => 'trait_fondateur',
            'archetype_titre' => 'Trait fondateur',
            'archetype_description' => 'Revient souvent et avec densité',
            'feedback' => '<div class="verdict-badge etablie">Présence établie</div>',
            'score_cumule' => 3.56,
            'score_moyen_par_feuille' => 3.56,
            'confiance_moyenne' => 0.78,
            'cumul_preuves' => 2,
            'cumul_indices' => 2,
            'nb_feuilles_etablies' => 1,
            'nb_feuilles_renvois' => 0,
            'parFeuille' => [
                [
                    'date' => '2025-12-22',
                    'statut' => 'présence établie',
                    'confiance' => 0.78,
                    'preuves' => 2,
                    'indices' => 2,
                    'score' => 3.56,
                ],
            ],
        ];
    }

    /** @return array<string, array<string, mixed>> keys "1" to "7" (JSON object once encoded) */
    private function makeProfilIpsatif(): array
    {
        $profil = [];
        foreach (self::POLES as $poleNum => [$poleNom]) {
            $profil[(string) $poleNum] = [
                'pole_num' => $poleNum,
                'pole_nom' => $poleNom,
                'score_cumule' => 3.56,
                'proportion_globale' => 0.1429,
                'competences_etablies' => 1,
                'competences' => [
                    [
                        'code' => $poleNum . '.01',
                        'nom' => 'Compétence démo',
                        'score' => 3.56,
                        'proportion_globale' => 0.1429,
                        'proportion_intra_pole' => 1,
                    ],
                ],
            ];
        }

        return $profil;
    }
}
