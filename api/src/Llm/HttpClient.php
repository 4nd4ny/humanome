<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * Minimal injectable HTTP client (curl in production, fake in tests — no new
 * composer dependency, CLAUDE.md convention).
 *
 * Deliberately NEVER follows redirects: callers that need them (gdoc-text)
 * implement their own bounded, host-validated loop (anti-SSRF).
 */
interface HttpClient
{
    /**
     * @param array<string, string> $headers request headers (name => value)
     * @param string|null $body raw request body (JSON already encoded)
     * @param int $timeoutSeconds total request timeout
     * @param int $maxBytes response body cap; 0 = uncapped. When the cap is
     *                      exceeded the transfer is aborted and 'overflow'
     *                      is true (body content is then unspecified).
     *
     * @return array{status: int, headers: array<string, string>, body: string, overflow: bool}
     *               response headers use lowercase names
     *
     * @throws HttpClientException on network-level failure (DNS, connect,
     *                             timeout) — never on HTTP error statuses
     */
    public function request(
        string $method,
        string $url,
        array $headers = [],
        ?string $body = null,
        int $timeoutSeconds = 30,
        int $maxBytes = 0,
    ): array;
}
