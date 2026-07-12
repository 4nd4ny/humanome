<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * Network-level HTTP failure (DNS, connect, timeout). Messages must stay
 * generic: they can end up in API responses and MUST never carry secrets
 * (no headers, no request body).
 */
final class HttpClientException extends \RuntimeException
{
    public function __construct(string $message, public readonly bool $timedOut = false)
    {
        parent::__construct($message);
    }
}
