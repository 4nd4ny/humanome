<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Llm\MockProvider;

/**
 * Counting wrapper around the fixture MockProvider — the referee of the P11
 * DoD: after interruption/resume, `calls` must equal EXACTLY 8 × jobs (7
 * poles + 1 kairos), proving that no checkpointed pole is ever re-called.
 * Failure injection covers the attempts/retry paths.
 */
final class MasseCountingProvider
{
    public int $calls = 0;

    /** Next N calls throw (network-style failure). */
    public int $failNextCalls = 0;

    /** Next N calls answer unparseable garbage (stochastic malformation). */
    public int $garbageNextCalls = 0;

    private readonly MockProvider $inner;

    public function __construct()
    {
        $this->inner = new MockProvider();
    }

    /** @return array{text: string, usage: array{inputTokens: int, outputTokens: int}, model: string} */
    public function complete(string $model, ?string $system, string $prompt, int $maxTokens): array
    {
        $this->calls++;
        if ($this->failNextCalls > 0) {
            $this->failNextCalls--;
            throw new \RuntimeException('panne simulée du fournisseur');
        }
        if ($this->garbageNextCalls > 0) {
            $this->garbageNextCalls--;

            return [
                'text' => 'Voici le résultat : {"fragment": ',
                'usage' => ['inputTokens' => 10, 'outputTokens' => 5],
                'model' => 'mock',
            ];
        }

        return $this->inner->complete($model, $system, $prompt, $maxTokens);
    }
}
