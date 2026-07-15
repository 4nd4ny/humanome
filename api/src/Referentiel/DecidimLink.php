<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

/**
 * Lien Decidim optionnel joint à une proposition (débats participer.harmonia.education).
 * On ne laisse passer qu'une URL http(s) valide (rendue en lien dans l'éditeur).
 */
final class DecidimLink
{
    public static function normalize(?string $url): ?string
    {
        if ($url === null) {
            return null;
        }
        $url = trim($url);
        if ($url === '') {
            return null;
        }
        if (!preg_match('#^https?://#i', $url) || filter_var($url, \FILTER_VALIDATE_URL) === false) {
            throw new InvalidDocumentException(
                'Le lien Decidim doit être une URL http(s) valide.',
                ['/decidimUrl' => ['URL invalide']],
            );
        }
        if (mb_strlen($url) > 500) {
            throw new InvalidDocumentException(
                'Le lien Decidim est trop long (500 caractères max).',
                ['/decidimUrl' => ['URL trop longue']],
            );
        }

        return $url;
    }
}
