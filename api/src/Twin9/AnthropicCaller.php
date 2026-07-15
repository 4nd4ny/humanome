<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Llm\HttpClient;
use Humanome\Llm\HttpClientException;

/**
 * Server-side Anthropic Messages API call for Twin9 (T3b, ADR-010 §1/§2).
 *
 * Same upstream conventions as Llm\AnthropicProvider (raw HTTP over the
 * injectable HttpClient, x-api-key header only, thinking disabled so the
 * whole max_tokens budget goes to text), with two deliberate differences:
 *
 *   * The base URL is a LOCKED constant — ADR-010 §2, threat « clé privée
 *     pointée vers un serveur attaquant » : no constructor parameter, no env
 *     override, nothing the user (or an admin setting) can redirect. Tests
 *     inject a fake at the HttpClient seam (LlmRuntime), never a URL.
 *   * No forced tool use: the Twin9 templates specify their own output
 *     formats and the JS engine parses the model text verbatim, like the
 *     Python reference does.
 *
 * No automatic retry: the twin9 client engine owns resumption (IndexedDB
 * checkpoints, ADR-010 §1) — a server-side retry would double-bill.
 *
 * Errors are Twin9Exception with a GENERIC French message: never the prompt,
 * never the rendered template, never upstream error text (which could quote
 * request content back — ADR-010 §2, « fuite par messages d'erreur »).
 */
final class AnthropicCaller
{
    /** LOCKED (ADR-010 §2): the ONLY upstream Twin9 calls may reach. */
    public const BASE_URL = 'https://api.anthropic.com';
    public const API_VERSION = '2023-06-01';

    public function __construct(
        private readonly HttpClient $http,
        private readonly string $apiKey,
        private readonly int $timeoutSeconds = 150,
    ) {
    }

    /**
     * One Messages API completion.
     *
     * @return array{texte: string, tokens_in: int, tokens_out: int, stop_reason: string}
     *               tokens_* are the REAL usage counters returned by the API
     *               (the billing basis, ADR-010 §3), never an estimate.
     *
     * @throws Twin9Exception generic French message + HTTP status for the route
     */
    public function appeler(string $model, ?string $system, string $prompt, int $maxTokens): array
    {
        $payload = [
            'model' => $model,
            'max_tokens' => $maxTokens,
            // Thinking tokens count against max_tokens without reaching the
            // text blocks (observed live on the P6 demo) — the Twin9 steps
            // need the whole budget as parseable text.
            'thinking' => ['type' => 'disabled'],
            'messages' => [['role' => 'user', 'content' => $prompt]],
        ];
        if ($system !== null && $system !== '') {
            $payload['system'] = $system;
        }

        try {
            $response = $this->http->request(
                'POST',
                self::BASE_URL . '/v1/messages',
                [
                    'x-api-key' => $this->apiKey,
                    'anthropic-version' => self::API_VERSION,
                    'content-type' => 'application/json',
                ],
                json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                $this->timeoutSeconds,
            );
        } catch (HttpClientException $e) {
            throw new Twin9Exception(
                $e->timedOut
                    ? 'Le fournisseur LLM ne répond pas, réessayez plus tard.'
                    : 'Le fournisseur LLM est injoignable, réessayez plus tard.',
                $e->timedOut ? 504 : 502,
            );
        }

        $status = $response['status'];
        if ($status === 429) {
            throw new Twin9Exception('Le fournisseur LLM est saturé, réessayez plus tard.', 429);
        }
        if ($status === 401 || $status === 403) {
            // Useful signal in cle_privee mode (revoked/typo'd key) — still
            // generic, nothing from the request is echoed.
            throw new Twin9Exception('Clé API refusée par le fournisseur LLM.', 502);
        }
        if ($status < 200 || $status >= 300) {
            // Upstream error text is NOT relayed: it may quote request
            // content, and the request contains the rendered template.
            throw new Twin9Exception('Erreur du fournisseur LLM, réessayez plus tard.', 502);
        }

        $data = json_decode($response['body'], true);
        if (!\is_array($data)) {
            throw new Twin9Exception('Réponse du fournisseur LLM illisible.', 502);
        }

        $texte = '';
        foreach ((array) ($data['content'] ?? []) as $block) {
            if (\is_array($block) && ($block['type'] ?? '') === 'text') {
                $texte .= (string) ($block['text'] ?? '');
            }
        }

        return [
            'texte' => $texte,
            'tokens_in' => (int) ($data['usage']['input_tokens'] ?? 0),
            'tokens_out' => (int) ($data['usage']['output_tokens'] ?? 0),
            // 'max_tokens' = truncated generation: the client engine fails
            // loudly instead of parsing a fragmentary document (P6 lesson).
            'stop_reason' => (string) ($data['stop_reason'] ?? ''),
        ];
    }
}
