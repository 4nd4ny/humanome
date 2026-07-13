<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use RuntimeException;

/**
 * Domain error carrying the HTTP status the twin9 route should answer with
 * (routes/twin9.php maps getStatusCode() -> response), same pattern as
 * Admin\AdminException. The message is a French, user-facing string and MUST
 * stay generic: never a fragment of a template, never internal detail
 * (ADR-010 §2, "fuite par messages d'erreur").
 */
final class Twin9Exception extends RuntimeException
{
    public function __construct(string $message, private readonly int $statusCode)
    {
        parent::__construct($message);
    }

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }
}
