<?php

declare(strict_types=1);

namespace Humanome\Mail;

/**
 * Implémentation de production : `mail()` natif d'OVH mutualisé (AD-D3).
 * Expéditeur configurable par env (MAIL_FROM, défaut no-reply@humanome.xyz).
 * SPF/DKIM à vérifier au panel OVH (action manuelle, Q1).
 */
final class PhpMailMailer implements Mailer
{
    public function __construct(private readonly string $from)
    {
    }

    public function send(string $to, string $subject, string $body): bool
    {
        // Sujet encodé RFC 2047 (UTF-8) pour les accents ; corps texte brut UTF-8.
        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $headers = implode("\r\n", [
            'From: ' . $this->from,
            'Reply-To: ' . $this->from,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            'MIME-Version: 1.0',
            'X-Mailer: humanome.xyz',
        ]);

        // -f fixe l'enveloppe (Return-Path) sur MAIL_FROM : cohérent avec SPF.
        return @mail($to, $encodedSubject, $body, $headers, '-f' . $this->from);
    }
}
