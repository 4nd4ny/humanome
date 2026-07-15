<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

/**
 * Hash canonique du CONTENU RICHE d'une compétence atomique (identite +
 * protocole + enrichissements). Sert de jeton de concurrence optimiste
 * (compare-and-swap) et d'empreinte d'immutabilité.
 *
 * ⚠️ STRICTEMENT INTERNE À PHP. Contrairement à ContentHash (hash STRUCTUREL du
 * snapshot, verrouillé en parité octet avec le moteur/Twin9), ce hash ne quitte
 * jamais le serveur : le moteur ne consomme jamais le contenu riche. Aucun
 * oracle cross-langage, aucune parité Node à préserver — d'où une forme
 * canonique PHP simple (tri récursif des clés d'objet, ordre des listes
 * préservé), robuste au réordonnancement des clés par les colonnes JSON MySQL.
 */
final class CompetenceHash
{
    /** @param array<string, mixed> $content contenu riche décodé */
    public static function compute(array $content): string
    {
        return hash('sha256', self::encode(self::canonical($content)));
    }

    /** Forme canonique récursive : clés d'objet triées, ordre des listes intact. */
    public static function canonical(mixed $value): mixed
    {
        if (!\is_array($value)) {
            return $value;
        }
        if (array_is_list($value)) {
            return array_map(self::canonical(...), $value);
        }
        ksort($value);
        $out = [];
        foreach ($value as $key => $val) {
            $out[$key] = self::canonical($val);
        }

        return $out;
    }

    public static function encode(mixed $value): string
    {
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    /** Hash STRUCTUREL d'une compétence {code,nom,pole} : signale un renommage/déplacement. */
    public static function structural(string $code, string $nom, int $pole): string
    {
        return hash('sha256', self::encode(['code' => $code, 'nom' => $nom, 'pole' => $pole]));
    }
}
