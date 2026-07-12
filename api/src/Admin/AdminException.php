<?php

declare(strict_types=1);

namespace Humanome\Admin;

use RuntimeException;

/**
 * Domain error carrying the HTTP status the admin route should answer with
 * (routes/admin.php maps getStatusCode() -> response). The message is a
 * French, user-facing string (no internal detail).
 */
final class AdminException extends RuntimeException
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
