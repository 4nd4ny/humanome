<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * Anthropic Messages API upstream (raw HTTP over the injectable HttpClient —
 * a proxy must not pull an SDK dependency, CLAUDE.md convention). No
 * streaming: OVH mutualisé buffers responses anyway, per-pole calls are
 * small, the front paces its own progress per call (P6 task).
 *
 * The API key travels in the x-api-key request header ONLY: never in a URL,
 * never logged, never echoed in any response or exception message.
 */
final class AnthropicProvider
{
    public const BASE_URL = 'https://api.anthropic.com';
    public const API_VERSION = '2023-06-01';

    public function __construct(
        private readonly HttpClient $http,
        private readonly string $apiKey,
        private readonly int $timeoutSeconds = 60,
        private readonly string $baseUrl = self::BASE_URL,
    ) {
    }

    /**
     * Same result contract as the engine providers (engine/src/providers):
     *
     * @return array{text: string, usage: array{inputTokens: int, outputTokens: int}, model: string}
     *
     * @throws UpstreamException   on non-2xx upstream status
     * @throws HttpClientException on network failure
     */
    public function complete(string $model, ?string $system, string $prompt, int $maxTokens): array
    {
        $payload = [
            'model' => $model,
            'max_tokens' => $maxTokens,
            // Some models reason by default; thinking tokens count against
            // max_tokens while never reaching the text blocks we extract —
            // observed live: 6144 output tokens for 5444 chars of truncated
            // text. The demo needs the whole budget as text.
            'thinking' => ['type' => 'disabled'],
            // Low temperature: strict-JSON extraction, fewer stochastic
            // malformations (observed live: a key emitted without its value).
            'temperature' => 0.2,
            'messages' => [['role' => 'user', 'content' => $prompt]],
        ];
        if ($system !== null && $system !== '') {
            $payload['system'] = $system;
        }

        $response = $this->http->request(
            'POST',
            rtrim($this->baseUrl, '/') . '/v1/messages',
            [
                'x-api-key' => $this->apiKey,
                'anthropic-version' => self::API_VERSION,
                'content-type' => 'application/json',
            ],
            json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            $this->timeoutSeconds,
        );

        if ($response['status'] < 200 || $response['status'] >= 300) {
            throw new UpstreamException(
                $response['status'],
                self::errorDetail($response['body']),
                $response['headers']['retry-after'] ?? null,
            );
        }

        $data = json_decode($response['body'], true);
        if (!\is_array($data)) {
            throw new UpstreamException(502, 'réponse amont non-JSON');
        }

        $text = '';
        foreach ((array) ($data['content'] ?? []) as $block) {
            if (\is_array($block) && ($block['type'] ?? '') === 'text') {
                $text .= (string) ($block['text'] ?? '');
            }
        }

        return [
            'text' => $text,
            'usage' => [
                'inputTokens' => (int) ($data['usage']['input_tokens'] ?? 0),
                'outputTokens' => (int) ($data['usage']['output_tokens'] ?? 0),
            ],
            'model' => (string) ($data['model'] ?? $model),
            // Relayed so clients can distinguish a truncated generation
            // ('max_tokens') from a natural stop — silent truncation produced
            // unparseable or fragmentary JSON downstream.
            'stopReason' => (string) ($data['stop_reason'] ?? ''),
        ];
    }

    /** Provider error message from the body — never any request data. */
    private static function errorDetail(string $body): string
    {
        $data = json_decode($body, true);
        $detail = \is_array($data) ? ($data['error']['message'] ?? '') : '';

        return \is_string($detail) && $detail !== '' ? $detail : 'erreur du fournisseur amont';
    }
}
