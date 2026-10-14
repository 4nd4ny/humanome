<?php

declare(strict_types=1);

namespace Humanome\Share;

/**
 * Version partagée d'une cartographie (interface ultime, spécification §12) :
 * un INSTANTANÉ FIGÉ choisi par l'apprenant adulte — compétences retenues et
 * leur état chiffré, dates à la précision choisie (jour / mois / masquées),
 * extraits choisis. Rien d'autre.
 *
 * Forme (schemaVersion 1.x) : {kind, schemaVersion, title, publishedAt,
 * datePrecision, period, referential{id, version, label, poles[], competences[]
 * — EXACTEMENT les compétences retenues}, state{dayCount, dates, competencies[],
 * poles[]}, heatmap{precision, cells[]} | null, extracts[]}.
 *
 * Le serveur le vérifie par LISTE BLANCHE de champs ET de types, à tous les
 * niveaux : un champ inconnu ou manquant, un type inattendu, une date plus
 * fine que la précision choisie, une compétence ou un pôle inconnus sont
 * refusés. C'est la garantie structurelle qu'aucun texte de portfolio, aucune
 * délibération du jury, aucune note privée ne peut être déposé sous ce type,
 * quoi qu'envoie le client — les seuls textes libres sont le titre, les
 * extraits choisis et les libellés du référentiel retenu, tous bornés. La
 * sortie de `buildSharedVersion` (web/src/carto/core/share.js) est tenue
 * pour égale à la fixture schemas/fixtures/partage/carto-partage-exemple.json,
 * que ce validateur accepte (tests des deux côtés).
 */
final class SharedVersion
{
    public const KIND = 'carto-partage';
    public const MAX_EXTRACTS = 300;
    public const MAX_EXTRACT_CHARS = 2000;
    public const MAX_COMPETENCIES = 500;
    public const MAX_POLES = 50;
    public const MAX_DATES = 1000;
    /** 360° et la marge des arrondis (angles à 4 décimales, sommés par pôle). */
    private const MAX_THETA = 360.5;

    private const TOP = ['kind', 'schemaVersion', 'title', 'publishedAt', 'datePrecision', 'period', 'referential', 'state', 'heatmap', 'extracts'];
    private const REFERENTIAL = ['id', 'version', 'label', 'poles', 'competences'];
    private const REF_POLE = ['num', 'nom', 'couleur'];
    private const REF_COMPETENCE = ['code', 'nom', 'pole', 'description'];
    private const STATE = ['dayCount', 'dates', 'competencies', 'poles'];
    private const COMPETENCY = ['code', 'pole', 'theta', 'intensity', 'confidence', 'status', 'days', 'proofs', 'hints'];
    private const POLE = ['num', 'theta', 'intensity', 'confidence', 'codes', 'needsReviewOnly'];
    private const HEATMAP = ['precision', 'cells'];
    private const CELL = ['key', 'level', 'days'];
    private const EXTRACT = ['code', 'date', 'role', 'text'];
    private const PRECISIONS = ['day', 'month', 'none'];

    /**
     * @param array<mixed> $doc
     * @return array<string, string> erreurs (champ => message français), vide si valide
     */
    public static function validate(array $doc): array
    {
        try {
            self::check($doc);
        } catch (InvalidSharedVersion $e) {
            return ['document' => $e->getMessage()];
        }

        return [];
    }

    /** @param array<mixed> $doc */
    private static function check(array $doc): void
    {
        if (($doc['kind'] ?? null) !== self::KIND) {
            self::fail('Version partagée attendue (kind « ' . self::KIND . ' »)');
        }
        if (!\is_string($doc['schemaVersion'] ?? null) || preg_match('/^1\.\d+\.\d+$/', $doc['schemaVersion']) !== 1) {
            self::fail('Version de format inconnue (1.x attendue)');
        }
        self::exactKeys($doc, self::TOP, 'version partagée');
        $precision = $doc['datePrecision'];
        if (!\in_array($precision, self::PRECISIONS, true)) {
            self::fail('Précision des dates invalide (day, month ou none)');
        }
        if (!self::text($doc['title'], 190)) {
            self::fail('Titre requis (190 caractères maximum)');
        }
        if (!\is_string($doc['publishedAt'])
            || preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/', $doc['publishedAt']) !== 1) {
            self::fail('Date de publication invalide (ISO 8601 attendue)');
        }

        // Référentiel embarqué (donnée publique) : tous les pôles, EXACTEMENT
        // les compétences retenues.
        $referential = $doc['referential'];
        if (!self::isObject($referential)) {
            self::fail('Référentiel embarqué invalide');
        }
        self::exactKeys($referential, self::REFERENTIAL, 'référentiel');
        if (!self::text($referential['id'], 100) || !self::text($referential['version'], 40) || !self::text($referential['label'], 300)) {
            self::fail('Référentiel embarqué invalide (id, version, label)');
        }
        $refPoles = self::listOf($referential['poles'], 1, self::MAX_POLES, 'pôles du référentiel');
        $poleNums = [];
        foreach ($refPoles as $p) {
            if (!self::isObject($p)) {
                self::fail('Pôle du référentiel invalide');
            }
            self::exactKeys($p, self::REF_POLE, 'pôle du référentiel');
            if (!\is_int($p['num']) || isset($poleNums[$p['num']]) || !self::text($p['nom'], 300)
                || ($p['couleur'] !== null && (!\is_string($p['couleur']) || preg_match('/^#[0-9A-Fa-f]{3,8}$/', $p['couleur']) !== 1))) {
                self::fail('Pôle du référentiel invalide (numéro unique, nom, couleur #rrggbb ou null)');
            }
            $poleNums[$p['num']] = true;
        }
        $refCompetences = self::listOf($referential['competences'], 1, self::MAX_COMPETENCIES, 'compétences du référentiel');
        $refPoleOf = [];
        foreach ($refCompetences as $c) {
            if (!self::isObject($c)) {
                self::fail('Compétence du référentiel invalide');
            }
            self::exactKeys($c, self::REF_COMPETENCE, 'compétence du référentiel');
            if (!self::text($c['code'], 32) || isset($refPoleOf[$c['code']]) || !self::text($c['nom'], 300)
                || !\is_int($c['pole']) || !isset($poleNums[$c['pole']]) || !self::text($c['description'], 4000, true)) {
                self::fail('Compétence du référentiel invalide (code unique, nom, pôle connu, description)');
            }
            $refPoleOf[$c['code']] = $c['pole'];
        }

        // Période : à la précision choisie, dans l'ordre (masquée = null).
        $period = $doc['period'];
        if ($precision === 'none') {
            if ($period !== null) {
                self::fail('Période interdite quand les dates sont masquées');
            }
        } else {
            if (!self::isObject($period)) {
                self::fail('Période requise pour la précision choisie');
            }
            self::exactKeys($period, ['from', 'to'], 'période');
            if (!self::dateAt($period['from'], $precision) || !self::dateAt($period['to'], $precision) || $period['from'] > $period['to']) {
                self::fail('Période invalide pour la précision choisie');
            }
        }

        // État chiffré du soleil.
        $state = $doc['state'];
        if (!self::isObject($state)) {
            self::fail('État du soleil invalide');
        }
        self::exactKeys($state, self::STATE, 'état du soleil');
        if (!\is_int($state['dayCount']) || $state['dayCount'] < 0 || $state['dayCount'] > 100000) {
            self::fail('Nombre de journées invalide');
        }
        $dates = self::listOf($state['dates'], 0, self::MAX_DATES, 'journées');
        if ($precision === 'none' && $dates !== []) {
            self::fail('Journées interdites quand les dates sont masquées');
        }
        foreach ($dates as $date) {
            if (!self::dateAt($date, $precision)) {
                self::fail('Journée plus précise que la précision choisie');
            }
        }
        $competencies = self::listOf($state['competencies'], 1, self::MAX_COMPETENCIES, 'compétences (au moins une compétence retenue)');
        $codes = [];
        foreach ($competencies as $c) {
            if (!self::isObject($c)) {
                self::fail('Compétence invalide');
            }
            self::exactKeys($c, self::COMPETENCY, 'compétence');
            $code = $c['code'];
            if (!\is_string($code) || !isset($refPoleOf[$code]) || isset($codes[$code]) || $c['pole'] !== $refPoleOf[$code]
                || !\in_array($c['status'], ['established', 'needs_review'], true)
                || !self::number($c['theta'], 0, self::MAX_THETA) || !self::number($c['intensity'], 0) || !self::number($c['confidence'], 0, 1, true)
                || !self::count($c['days']) || !self::count($c['proofs']) || !self::count($c['hints'])) {
                self::fail('Compétence invalide (code du référentiel, pôle, chiffres)');
            }
            $codes[$code] = $c['pole'];
        }
        if (\count($codes) !== \count($refPoleOf)) {
            self::fail('Le référentiel embarqué ne contient que les compétences retenues');
        }
        $poles = self::listOf($state['poles'], 1, self::MAX_POLES, 'pôles');
        $seenPoles = [];
        foreach ($poles as $p) {
            if (!self::isObject($p)) {
                self::fail('Pôle invalide');
            }
            self::exactKeys($p, self::POLE, 'pôle');
            if (!\is_int($p['num']) || !isset($poleNums[$p['num']]) || isset($seenPoles[$p['num']])
                || !self::number($p['theta'], 0, self::MAX_THETA) || !self::number($p['intensity'], 0) || !self::number($p['confidence'], 0, 1, true)
                || !\is_bool($p['needsReviewOnly'])) {
                self::fail('Pôle invalide (numéro du référentiel, chiffres, needsReviewOnly booléen)');
            }
            $seenPoles[$p['num']] = true;
            foreach (self::listOf($p['codes'], 1, self::MAX_COMPETENCIES, 'compétences du pôle') as $code) {
                if (!\is_string($code) || ($codes[$code] ?? null) !== $p['num']) {
                    self::fail('Pôle invalide (compétence absente de la version ou d\'un autre pôle)');
                }
            }
        }

        // Heatmap : par jour, par mois, ou absente quand les dates sont masquées.
        $heatmap = $doc['heatmap'];
        if ($precision === 'none') {
            if ($heatmap !== null) {
                self::fail('Heatmap interdite quand les dates sont masquées');
            }
        } elseif ($heatmap !== null) {
            if (!self::isObject($heatmap)) {
                self::fail('Heatmap invalide');
            }
            self::exactKeys($heatmap, self::HEATMAP, 'heatmap');
            if ($heatmap['precision'] !== $precision) {
                self::fail('Heatmap invalide pour la précision choisie');
            }
            foreach (self::listOf($heatmap['cells'], 0, self::MAX_DATES, 'cases de heatmap') as $cell) {
                if (!self::isObject($cell)) {
                    self::fail('Case de heatmap invalide');
                }
                self::exactKeys($cell, self::CELL, 'case de heatmap');
                if (!self::dateAt($cell['key'], $precision) || !\is_int($cell['level']) || $cell['level'] < 0 || $cell['level'] > 5 || !self::count($cell['days'])) {
                    self::fail('Case de heatmap invalide');
                }
            }
        }

        // Extraits choisis.
        foreach (self::listOf($doc['extracts'], 0, self::MAX_EXTRACTS, 'extraits (' . self::MAX_EXTRACTS . ' au plus)') as $e) {
            if (!self::isObject($e)) {
                self::fail('Extrait invalide');
            }
            self::exactKeys($e, self::EXTRACT, 'extrait');
            $dateOk = $precision === 'none' ? $e['date'] === null : ($e['date'] === null || self::dateAt($e['date'], $precision));
            if (!\is_string($e['code']) || !isset($codes[$e['code']]) || !\in_array($e['role'], ['preuve', 'indice'], true)
                || !self::text($e['text'], self::MAX_EXTRACT_CHARS) || !$dateOk) {
                self::fail('Extrait invalide (compétence retenue, texte de ' . self::MAX_EXTRACT_CHARS . ' caractères au plus, date à la précision choisie)');
            }
        }
    }

    private static function fail(string $message): never
    {
        throw new InvalidSharedVersion($message);
    }

    /**
     * Les clés exactes d'un objet : aucune inconnue, aucune manquante.
     *
     * @param array<mixed> $value
     * @param list<string> $expected
     */
    private static function exactKeys(array $value, array $expected, string $what): void
    {
        foreach (array_keys($value) as $key) {
            if (!\in_array((string) $key, $expected, true)) {
                self::fail('Champ non autorisé dans une version partagée (' . $what . ') : ' . $key);
            }
        }
        foreach ($expected as $key) {
            if (!\array_key_exists($key, $value)) {
                self::fail('Champ manquant dans une version partagée (' . $what . ') : ' . $key);
            }
        }
    }

    /** @return list<mixed> */
    private static function listOf(mixed $value, int $min, int $max, string $what): array
    {
        if (!\is_array($value) || !array_is_list($value) || \count($value) < $min || \count($value) > $max) {
            self::fail('Liste invalide : ' . $what);
        }

        return $value;
    }

    /** Chaîne non vide (ou vide si $allowEmpty) d'au plus $max caractères. */
    private static function text(mixed $value, int $max, bool $allowEmpty = false): bool
    {
        return \is_string($value) && ($allowEmpty || trim($value) !== '') && mb_strlen($value) <= $max;
    }

    private static function isObject(mixed $value): bool
    {
        return \is_array($value) && ($value === [] || !array_is_list($value));
    }

    /** Nombre fini dans [min ; max] (null accepté si $nullable). */
    private static function number(mixed $value, float $min, ?float $max = null, bool $nullable = false): bool
    {
        if ($value === null) {
            return $nullable;
        }
        if (!\is_int($value) && !\is_float($value)) {
            return false;
        }

        return is_finite((float) $value) && $value >= $min && ($max === null || $value <= $max + 1e-9);
    }

    /** Entier positif ou nul. */
    private static function count(mixed $value): bool
    {
        return \is_int($value) && $value >= 0;
    }

    /** Une date réelle à la précision choisie : AAAA-MM-JJ (jour), AAAA-MM (mois). */
    private static function dateAt(mixed $value, string $precision): bool
    {
        if (!\is_string($value)) {
            return false;
        }
        if ($precision === 'day' && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $m) === 1) {
            return checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
        }
        if ($precision === 'month' && preg_match('/^(\d{4})-(\d{2})$/', $value, $m) === 1) {
            return (int) $m[2] >= 1 && (int) $m[2] <= 12;
        }

        return false;
    }
}
