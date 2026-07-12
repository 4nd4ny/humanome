<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Llm\HttpClient;
use Humanome\Llm\HttpClientException;

/**
 * Fake HttpClient for the LLM/gdoc tests: records every request, replays
 * queued responses. No network access ever happens in the test suite.
 */
final class LlmFakeHttpClient implements HttpClient
{
    /** @var list<array{method: string, url: string, headers: array<string, string>, body: ?string, timeout: int, maxBytes: int}> */
    public array $requests = [];

    /** @var list<array{status: int, headers: array<string, string>, body: string, overflow: bool}|HttpClientException> */
    private array $queue = [];

    /** @param array{status?: int, headers?: array<string, string>, body?: string, overflow?: bool} $response */
    public function queueResponse(array $response): void
    {
        $this->queue[] = [
            'status' => $response['status'] ?? 200,
            'headers' => $response['headers'] ?? [],
            'body' => $response['body'] ?? '',
            'overflow' => $response['overflow'] ?? false,
        ];
    }

    public function queueException(HttpClientException $exception): void
    {
        $this->queue[] = $exception;
    }

    public function request(
        string $method,
        string $url,
        array $headers = [],
        ?string $body = null,
        int $timeoutSeconds = 30,
        int $maxBytes = 0,
    ): array {
        $this->requests[] = [
            'method' => $method,
            'url' => $url,
            'headers' => $headers,
            'body' => $body,
            'timeout' => $timeoutSeconds,
            'maxBytes' => $maxBytes,
        ];

        $next = array_shift($this->queue);
        if ($next === null) {
            throw new \LogicException('LlmFakeHttpClient: no queued response for ' . $method . ' ' . $url);
        }
        if ($next instanceof HttpClientException) {
            throw $next;
        }

        return $next;
    }
}
