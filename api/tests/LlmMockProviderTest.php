<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Llm\MockProvider;
use PHPUnit\Framework\TestCase;

/**
 * 'mock' provider: canned pole answers from schemas/fixtures/ (engine
 * integration without any key), generic text otherwise. Pure unit test —
 * no database, no HTTP.
 */
final class LlmMockProviderTest extends TestCase
{
    private MockProvider $provider;

    protected function setUp(): void
    {
        $this->provider = new MockProvider();
    }

    public function testPoleMarkerReturnsTheFixturePoleAsJson(): void
    {
        // Shape of the engine extraction prompt (engine/src/pipeline/extract.js).
        $prompt = "# Pôle 2 — Relations\nFeuille du 2026-01-05.\n\"poleNum\": \"2\"";

        $result = $this->provider->complete('claude-haiku-4-5-20251001', null, $prompt, 512);

        $pole = json_decode($result['text'], true);
        self::assertIsArray($pole);
        self::assertSame('2', $pole['poleNum']);
        self::assertArrayHasKey('competences', $pole);
        self::assertSame('mock', $result['model']);
        self::assertGreaterThan(0, $result['usage']['inputTokens']);
        self::assertGreaterThan(0, $result['usage']['outputTokens']);
    }

    public function testFixtureDayIsPickedFromThePrompt(): void
    {
        $day05 = $this->provider->complete('m', null, 'Pôle 3 — journée du 2026-01-05', 512);
        $day07 = $this->provider->complete('m', null, 'Pôle 3 — journée du 2026-01-07', 512);

        self::assertNotSame($day05['text'], $day07['text']);
        self::assertSame('3', json_decode($day07['text'], true)['poleNum']);
    }

    public function testKairosPromptReturnsTheFixtureKairosField(): void
    {
        // Shape of the engine kairos prompt (buildKairosExtractionPrompt):
        // marker « SYNTHÈSE KAIROS », day date present. Day 07 has an object.
        $prompt = "Tu produis maintenant la\nSYNTHÈSE KAIROS transversale de la journée.\n"
            . "# Feuille de portfolio du mercredi 7 janvier 2026 (2026-01-07)";

        $result = $this->provider->complete('m', null, $prompt, 512);

        $kairos = json_decode($result['text'], true);
        self::assertIsArray($kairos);
        self::assertArrayHasKey('kairos', $kairos);
        self::assertArrayHasKey('emergencesCrossPoles', $kairos);
    }

    public function testKairosPromptOnANullKairosDayReturnsJsonNull(): void
    {
        // Day 05's fixture kairos is null — valid per the cartographie-jour
        // schema, parsed as null by the engine's parseExtractionResponse.
        $prompt = "SYNTHÈSE KAIROS transversale — journée du 2026-01-05";

        $result = $this->provider->complete('m', null, $prompt, 512);

        self::assertSame('null', $result['text']);
    }

    public function testPromptWithoutPoleMarkerGetsGenericText(): void
    {
        $result = $this->provider->complete('m', 'Tu es concis.', 'Résume ce texte librement.', 512);

        self::assertStringContainsString('mock', $result['text']);
        self::assertNull(json_decode($result['text'], true));
        self::assertGreaterThan(0, $result['usage']['inputTokens']);
    }

    public function testMissingFixturesDirectoryFallsBackToGenericText(): void
    {
        $provider = new MockProvider('/nonexistent/fixtures');

        $result = $provider->complete('m', null, 'Pôle 1 — "poleNum": "1"', 512);

        self::assertStringContainsString('mock', $result['text']);
    }
}
