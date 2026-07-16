<?php

declare(strict_types=1);

namespace Humanome\Mail;

/**
 * Envoi d'email (D5 / AD-D3). Interface minimale, testable : l'implémentation
 * de production utilise le `mail()` natif d'OVH mutualisé (pas de dépendance
 * SMTP externe en v1.1) ; les tests injectent un `MemoryMailer` (no-op qui
 * capture) via `MailerFactory::setOverride()`.
 */
interface Mailer
{
    /**
     * @param string $to      destinataire (adresse email validée en amont)
     * @param string $subject sujet (français)
     * @param string $body    corps texte brut (français)
     * @return bool true si l'envoi a été accepté par le transport
     */
    public function send(string $to, string $subject, string $body): bool;
}
