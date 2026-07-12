<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

use RuntimeException;

/** Document rejected by schema or integrity checks — HTTP 422. */
final class InvalidDocumentException extends RuntimeException
{
    /** @param array<string, string[]> $errors keyed by JSON pointer */
    public function __construct(
        string $message,
        private readonly array $errors = [],
    ) {
        parent::__construct($message);
    }

    /** @return array<string, string[]> */
    public function getErrors(): array
    {
        return $this->errors;
    }
}
