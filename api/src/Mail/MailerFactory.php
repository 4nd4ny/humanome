<?php

declare(strict_types=1);

namespace Humanome\Mail;

use Humanome\Env;

/**
 * Résout le Mailer courant : `PhpMailMailer` (mail() OVH) en production, ou un
 * override injecté par les tests (`MemoryMailer`). Pas de conteneur DI dans ce
 * projet : une couture statique suffit et reste explicite.
 */
final class MailerFactory
{
    private static ?Mailer $override = null;

    /** Adresse d'expéditeur par défaut (Q1) — surchargeable par env MAIL_FROM. */
    public const DEFAULT_FROM = 'no-reply@humanome.xyz';

    public static function default(): Mailer
    {
        if (self::$override !== null) {
            return self::$override;
        }
        $from = Env::get('MAIL_FROM', self::DEFAULT_FROM);
        if ($from === '') {
            $from = self::DEFAULT_FROM;
        }

        return new PhpMailMailer($from);
    }

    /** Tests uniquement : force le Mailer (ou le réinitialise avec null). */
    public static function setOverride(?Mailer $mailer): void
    {
        self::$override = $mailer;
    }
}
