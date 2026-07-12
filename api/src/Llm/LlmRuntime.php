<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * Runtime seam for the LLM routes: production uses CurlHttpClient, tests
 * inject a fake (no real network call ever happens in the test suite).
 */
final class LlmRuntime
{
    private static ?HttpClient $httpClient = null;

    public static function httpClient(): HttpClient
    {
        return self::$httpClient ??= new CurlHttpClient();
    }

    /** Tests: inject a fake; pass null to restore the default. */
    public static function setHttpClient(?HttpClient $client): void
    {
        self::$httpClient = $client;
    }
}
