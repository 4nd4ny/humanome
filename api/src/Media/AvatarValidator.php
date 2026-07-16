<?php

declare(strict_types=1);

namespace Humanome\Media;

/**
 * Validation stricte d'un avatar (D6 / AD-D4) : le client redimensionne à ~256 px
 * et ≤ 200 Ko, mais le SERVEUR ne fait jamais confiance au client — il VALIDE la
 * taille, le mime déclaré (allowlist) ET le magic number réel des octets.
 */
final class AvatarValidator
{
    /** 200 Ko après redimensionnement client (AD-D4). */
    public const MAX_BYTES = 200 * 1024;

    /** @var array<string, string> mime -> nom lisible */
    public const ALLOWED = [
        'image/jpeg' => 'JPEG',
        'image/png' => 'PNG',
        'image/webp' => 'WebP',
    ];

    /**
     * @return string|null message d'erreur (français) ou null si valide.
     */
    public static function validate(string $bytes, string $mime): ?string
    {
        if (!isset(self::ALLOWED[$mime])) {
            return 'Format non supporté : seuls JPEG, PNG et WebP sont acceptés.';
        }
        $len = \strlen($bytes);
        if ($len === 0) {
            return 'Image vide.';
        }
        if ($len > self::MAX_BYTES) {
            return sprintf('Image trop lourde (%d Ko, maximum %d Ko).', intdiv($len, 1024), intdiv(self::MAX_BYTES, 1024));
        }
        if (!self::magicMatches($bytes, $mime)) {
            return 'Le contenu du fichier ne correspond pas à une image ' . self::ALLOWED[$mime] . '.';
        }

        return null;
    }

    /** Le magic number RÉEL des octets correspond-il au mime déclaré ? */
    private static function magicMatches(string $bytes, string $mime): bool
    {
        return match ($mime) {
            'image/jpeg' => str_starts_with($bytes, "\xFF\xD8\xFF"),
            'image/png' => str_starts_with($bytes, "\x89PNG\r\n\x1a\n"),
            // RIFF <taille 4o> WEBP
            'image/webp' => \strlen($bytes) >= 12
                && str_starts_with($bytes, 'RIFF')
                && substr($bytes, 8, 4) === 'WEBP',
            default => false,
        };
    }
}
