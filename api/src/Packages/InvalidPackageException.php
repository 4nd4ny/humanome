<?php

declare(strict_types=1);

namespace Humanome\Packages;

/** Prompt-package document rejected by schemas/prompt-package.schema.json. */
final class InvalidPackageException extends \RuntimeException
{
    /** @param array<string, string[]> $errors JSON-pointer keyed messages */
    public function __construct(private readonly array $errors)
    {
        parent::__construct('Prompt-package document failed schema validation');
    }

    /** @return array<string, string[]> */
    public function getErrors(): array
    {
        return $this->errors;
    }
}
