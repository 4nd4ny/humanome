<?php

declare(strict_types=1);

namespace Humanome\Mail;

/**
 * Implémentation no-op de test : capture les messages en mémoire au lieu de les
 * envoyer. Les tests d'inscription lisent `lastBody()` et en extraient le code
 * à 4 chiffres (ce qui vérifie AUSSI que le mail contient bien le lien + le code
 * en clair, exigence D5).
 */
final class MemoryMailer implements Mailer
{
    /** @var list<array{to: string, subject: string, body: string}> */
    public array $sent = [];

    public function send(string $to, string $subject, string $body): bool
    {
        $this->sent[] = ['to' => $to, 'subject' => $subject, 'body' => $body];

        return true;
    }

    /** @return array{to: string, subject: string, body: string}|null */
    public function last(): ?array
    {
        return $this->sent === [] ? null : $this->sent[array_key_last($this->sent)];
    }

    public function lastBody(): string
    {
        return $this->last()['body'] ?? '';
    }

    /** Le code à 4 chiffres du dernier corps (paramètre code=XXXX du lien), ou '' . */
    public function lastCode(): string
    {
        return preg_match('/[?&]code=(\d{4})\b/', $this->lastBody(), $m) === 1 ? $m[1] : '';
    }

    public function clear(): void
    {
        $this->sent = [];
    }
}
