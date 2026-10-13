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
 * — compétences retenues seulement}, state{dayCount, dates, competencies[],
 * poles[]}, heatmap{precision, cells[]} | null, extracts[]}.
 *
 * Le serveur le vérifie par LISTE BLANCHE de champs, à tous les niveaux : un
 * champ inconnu est refusé. C'est la garantie structurelle qu'aucun texte de
 * portfolio, aucune délibération du jury, aucune note privée et aucune date
 * plus fine que la précision choisie ne peut être déposé sous ce type, quoi
 * qu'envoie le client.
 */
final class SharedVersion
{
    public const KIND = 'carto-partage';
    public const MAX_EXTRACTS = 300;
    public const MAX_EXTRACT_CHARS = 2000;
    public const MAX_COMPETENCIES = 500;
    public const MAX_DATES = 1000;

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
        $fail = static fn (string $message): array => ['document' => $message];

        if (($doc['kind'] ?? null) !== self::KIND) {
            return $fail('Version partagée attendue (kind « ' . self::KIND . ' »)');
        }
        if (!\is_string($doc['schemaVersion'] ?? null) || !str_starts_with($doc['schemaVersion'], '1.')) {
            return $fail('Version de format inconnue (1.x attendue)');
        }
        if (($extra = self::unknownKey($doc, self::TOP)) !== null) {
            return $fail('Champ non autorisé dans une version partagée : ' . $extra);
        }
        $precision = $doc['datePrecision'] ?? null;
        if (!\in_array($precision, self::PRECISIONS, true)) {
            return $fail('Précision des dates invalide (day, month ou none)');
        }
        $title = $doc['title'] ?? null;
        if (!\is_string($title) || trim($title) === '' || mb_strlen($title) > 190) {
            return $fail('Titre requis (190 caractères maximum)');
        }
        if (!\is_string($doc['publishedAt'] ?? null) || mb_strlen($doc['publishedAt']) > 40) {
            return $fail('Date de publication requise');
        }
        // Référentiel embarqué (donnée publique) : pôles et compétences
        // retenues, rien d'autre.
        $referential = $doc['referential'] ?? null;
        if (!self::isObject($referential) || self::unknownKey($referential, self::REFERENTIAL) !== null
            || !self::text($referential['id'] ?? null, 100) || !self::text($referential['version'] ?? null, 40)
            || !self::text($referential['label'] ?? null, 300)) {
            return $fail('Référentiel embarqué invalide');
        }
        $refPoles = $referential['poles'] ?? null;
        $refCompetences = $referential['competences'] ?? null;
        if (!\is_array($refPoles) || !array_is_list($refPoles) || $refPoles === [] || \count($refPoles) > 50
            || !\is_array($refCompetences) || !array_is_list($refCompetences) || $refCompetences === [] || \count($refCompetences) > self::MAX_COMPETENCIES) {
            return $fail('Référentiel embarqué invalide');
        }
        $poleNums = [];
        foreach ($refPoles as $p) {
            if (!self::isObject($p) || self::unknownKey($p, self::REF_POLE) !== null || !\is_int($p['num'] ?? null)
                || !self::text($p['nom'] ?? null, 300) || (($p['couleur'] ?? null) !== null && !self::text($p['couleur'], 40, true))) {
                return $fail('Pôle du référentiel invalide');
            }
            $poleNums[$p['num']] = true;
        }
        $refCodes = [];
        foreach ($refCompetences as $c) {
            if (!self::isObject($c) || self::unknownKey($c, self::REF_COMPETENCE) !== null
                || !self::text($c['code'] ?? null, 32) || !self::text($c['nom'] ?? null, 300)
                || !\is_int($c['pole'] ?? null) || !isset($poleNums[$c['pole']])
                || (\array_key_exists('description', $c) && !self::text($c['description'], 4000, true))) {
                return $fail('Compétence du référentiel invalide');
            }
            $refCodes[$c['code']] = true;
        }

        // Période : à la précision choisie (masquée = absente).
        $period = $doc['period'] ?? null;
        if ($period !== null) {
            if (!self::isObject($period) || self::unknownKey($period, ['from', 'to']) !== null
                || !self::dateAt($period['from'] ?? null, $precision) || !self::dateAt($period['to'] ?? null, $precision)
                || $precision === 'none') {
                return $fail('Période invalide pour la précision choisie');
            }
        }

        // État chiffré du soleil.
        $state = $doc['state'] ?? null;
        if (!self::isObject($state) || ($extra = self::unknownKey($state, self::STATE)) !== null) {
            return $fail('État du soleil invalide' . (isset($extra) && $extra !== null ? ' (champ non autorisé : ' . $extra . ')' : ''));
        }
        $dayCount = $state['dayCount'] ?? null;
        if (!\is_int($dayCount) || $dayCount < 0 || $dayCount > 100000) {
            return $fail('Nombre de journées invalide');
        }
        $dates = $state['dates'] ?? null;
        if (!\is_array($dates) || !array_is_list($dates) || \count($dates) > self::MAX_DATES) {
            return $fail('Liste des journées invalide');
        }
        foreach ($dates as $date) {
            if (!self::dateAt($date, $precision, true)) {
                return $fail('Journée plus précise que la précision choisie');
            }
        }
        $competencies = $state['competencies'] ?? null;
        if (!\is_array($competencies) || !array_is_list($competencies) || $competencies === [] || \count($competencies) > self::MAX_COMPETENCIES) {
            return $fail('Liste des compétences invalide (au moins une compétence retenue)');
        }
        $codes = [];
        foreach ($competencies as $c) {
            if (!self::isObject($c) || ($extra = self::unknownKey($c, self::COMPETENCY)) !== null) {
                return $fail('Compétence invalide' . ($extra !== null ? ' (champ non autorisé : ' . $extra . ')' : ''));
            }
            if (!\is_string($c['code'] ?? null) || !isset($refCodes[$c['code']])
                || !\in_array($c['status'] ?? null, ['established', 'needs_review'], true)
                || !self::numbers($c, ['theta', 'intensity', 'confidence', 'pole', 'days', 'proofs', 'hints'])) {
                return $fail('Compétence invalide');
            }
            $codes[$c['code']] = true;
        }
        $poles = $state['poles'] ?? null;
        if (!\is_array($poles) || !array_is_list($poles) || \count($poles) > 50) {
            return $fail('Liste des pôles invalide');
        }
        foreach ($poles as $p) {
            if (!self::isObject($p) || ($extra = self::unknownKey($p, self::POLE)) !== null
                || !self::numbers($p, ['num', 'theta', 'intensity', 'confidence'])
                || !\is_array($p['codes'] ?? null) || !array_is_list($p['codes'])) {
                return $fail('Pôle invalide');
            }
        }

        // Heatmap : par jour, par mois, ou absente quand les dates sont masquées.
        $heatmap = $doc['heatmap'] ?? null;
        if ($heatmap !== null) {
            if ($precision === 'none' || !self::isObject($heatmap) || self::unknownKey($heatmap, self::HEATMAP) !== null
                || ($heatmap['precision'] ?? null) !== $precision
                || !\is_array($heatmap['cells'] ?? null) || !array_is_list($heatmap['cells']) || \count($heatmap['cells']) > self::MAX_DATES) {
                return $fail('Heatmap invalide pour la précision choisie');
            }
            foreach ($heatmap['cells'] as $cell) {
                if (!self::isObject($cell) || self::unknownKey($cell, self::CELL) !== null
                    || !self::dateAt($cell['key'] ?? null, $precision) || !self::numbers($cell, ['level'])) {
                    return $fail('Case de heatmap invalide');
                }
            }
        }

        // Extraits choisis.
        $extracts = $doc['extracts'] ?? null;
        if (!\is_array($extracts) || !array_is_list($extracts) || \count($extracts) > self::MAX_EXTRACTS) {
            return $fail('Liste des extraits invalide (' . self::MAX_EXTRACTS . ' au plus)');
        }
        foreach ($extracts as $e) {
            if (!self::isObject($e) || ($extra = self::unknownKey($e, self::EXTRACT)) !== null) {
                return $fail('Extrait invalide' . ($extra !== null ? ' (champ non autorisé : ' . $extra . ')' : ''));
            }
            if (!\is_string($e['code'] ?? null) || !isset($codes[$e['code']]) || !\in_array($e['role'] ?? null, ['preuve', 'indice'], true)
                || !\is_string($e['text'] ?? null) || trim($e['text']) === '' || mb_strlen($e['text']) > self::MAX_EXTRACT_CHARS
                || !self::dateAt($e['date'] ?? null, $precision, true)) {
                return $fail('Extrait invalide (compétence retenue, texte de ' . self::MAX_EXTRACT_CHARS . ' caractères au plus, date à la précision choisie)');
            }
        }

        return [];
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

    /** @param array<mixed> $value @param list<string> $allowed */
    private static function unknownKey(array $value, array $allowed): ?string
    {
        foreach (array_keys($value) as $key) {
            if (!\in_array((string) $key, $allowed, true)) {
                return (string) $key;
            }
        }

        return null;
    }

    /** @param array<mixed> $value @param list<string> $keys numériques s'ils sont présents */
    private static function numbers(array $value, array $keys): bool
    {
        foreach ($keys as $key) {
            if (\array_key_exists($key, $value) && $value[$key] !== null && !\is_int($value[$key]) && !\is_float($value[$key])) {
                return false;
            }
        }

        return true;
    }

    /**
     * Une date à la précision choisie : AAAA-MM-JJ (jour), AAAA-MM (mois),
     * null (masquée). `nullable` : null accepté à toute précision.
     */
    private static function dateAt(mixed $value, string $precision, bool $nullable = false): bool
    {
        if ($value === null) {
            return $nullable || $precision === 'none';
        }
        if (!\is_string($value)) {
            return false;
        }

        return match ($precision) {
            'day' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) === 1,
            'month' => preg_match('/^\d{4}-\d{2}$/', $value) === 1,
            default => false,
        };
    }
}
