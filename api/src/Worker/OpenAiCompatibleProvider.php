<?php

declare(strict_types=1);

namespace Humanome\Worker;

use Humanome\Llm\HttpClient;
use Humanome\Llm\UpstreamException;

/**
 * OpenAI-compatible chat-completions upstream (cahier §4.9: « infrastructure
 * LLM propre à l'établissement » — local server, Ollama, vLLM, LM Studio…).
 * Same result contract as Llm\AnthropicProvider so the worker treats both
 * uniformly: {text, usage{inputTokens, outputTokens}, model, stopReason}.
 *
 * The API key (optional — many local servers need none) travels in the
 * Authorization header ONLY: never in a URL, never logged, never echoed.
 * No streaming (OVH buffers anyway); finish_reason 'length' is mapped to
 * 'max_tokens' so the truncation guard learned in M5 applies identically.
 */
final class OpenAiCompatibleProvider
{
    public function __construct(
        private readonly HttpClient $http,
        private readonly string $baseUrl,
        private readonly ?string $apiKey = null,
        private readonly int $timeoutSeconds = 60,
    ) {
    }

    /**
     * @return array{text: string, usage: array{inputTokens: int, outputTokens: int}, model: string, stopReason: string}
     *
     * @throws UpstreamException on non-2xx upstream status or non-JSON body
     */
    public function complete(string $model, ?string $system, string $prompt, int $maxTokens): array
    {
        $messages = [];
        if ($system !== null && $system !== '') {
            $messages[] = ['role' => 'system', 'content' => $system];
        }
        $messages[] = ['role' => 'user', 'content' => $prompt];

        $headers = ['content-type' => 'application/json'];
        if ($this->apiKey !== null && $this->apiKey !== '') {
            $headers['authorization'] = 'Bearer ' . $this->apiKey;
        }

        $response = $this->http->request(
            'POST',
            rtrim($this->baseUrl, '/') . '/v1/chat/completions',
            $headers,
            json_encode([
                'model' => $model,
                'max_tokens' => $maxTokens,
                'temperature' => 0,
                'messages' => $messages,
            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            $this->timeoutSeconds,
        );

        if ($response['status'] < 200 || $response['status'] >= 300) {
            throw new UpstreamException($response['status'], self::errorDetail($response['body']));
        }

        $data = json_decode($response['body'], true);
        if (!\is_array($data)) {
            throw new UpstreamException(502, 'réponse amont non-JSON');
        }

        $choice = $data['choices'][0] ?? [];
        $finish = (string) ($choice['finish_reason'] ?? '');

        return [
            'text' => (string) ($choice['message']['content'] ?? ''),
            'usage' => [
                'inputTokens' => (int) ($data['usage']['prompt_tokens'] ?? 0),
                'outputTokens' => (int) ($data['usage']['completion_tokens'] ?? 0),
            ],
            'model' => (string) ($data['model'] ?? $model),
            'stopReason' => $finish === 'length' ? 'max_tokens' : $finish,
        ];
    }

    /** Provider error message from the body — never any request data. */
    private static function errorDetail(string $body): string
    {
        $data = json_decode($body, true);
        $detail = \is_array($data) ? ($data['error']['message'] ?? ($data['error'] ?? '')) : '';

        return \is_string($detail) && $detail !== '' ? $detail : 'erreur du fournisseur amont';
    }
}
