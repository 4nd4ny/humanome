<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Env;
use Humanome\Llm\HttpClient;
use Humanome\Llm\HttpClientException;

/**
 * PayPal Orders v2, redirect flow (ADR-010 §3) — server-to-server only.
 *
 * No JS SDK (no CSP relaxation), no webhook at the MVP: the front redirects
 * the buyer to PayPal's approve URL, PayPal redirects back to
 * #/compte/credit, and the front then calls POST /api/twin9/credit/paypal/
 * capturer — a capture that is idempotent at BOTH layers (PayPal rejects a
 * second capture, and CreditService::topup() is keyed on the order id), so a
 * lost redirect or a double click just replays into a no-op.
 *
 * We see and store NO banking data whatsoever — only the PayPal order id,
 * the captured amount and the status (ADR-010 §3, docs/rgpd-registre.md §11).
 * Credentials live in env PAYPAL_* (outside the webroot in production,
 * ADR-008); errors carry generic French messages, never credentials, never
 * upstream bodies.
 */
final class PayPalClient
{
    public const SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';
    public const LIVE_BASE_URL = 'https://api-m.paypal.com';

    public function __construct(
        private readonly HttpClient $http,
        private readonly string $clientId,
        private readonly string $secret,
        private readonly string $baseUrl,
        private readonly int $timeoutSeconds = 30,
    ) {
    }

    /**
     * Client from PAYPAL_MODE / PAYPAL_CLIENT_ID / PAYPAL_SECRET; null while
     * the credentials are not configured (routes answer 503 — the UI shows
     * « recharge indisponible » cleanly, ADR-010 §3).
     */
    public static function fromEnv(HttpClient $http): ?self
    {
        $clientId = Env::get('PAYPAL_CLIENT_ID');
        $secret = Env::get('PAYPAL_SECRET');
        if ($clientId === '' || $secret === '') {
            return null;
        }

        return new self(
            $http,
            $clientId,
            $secret,
            Env::get('PAYPAL_MODE', 'sandbox') === 'live' ? self::LIVE_BASE_URL : self::SANDBOX_BASE_URL,
        );
    }

    /**
     * Create an order for one top-up pack.
     *
     * @return array{order_id: string, approve_url: string} the buyer must be
     *               redirected to approve_url to approve the payment
     *
     * @throws Twin9Exception generic French message
     */
    public function createOrder(float $montantUsd, string $returnUrl, string $cancelUrl): array
    {
        $body = $this->call('POST', '/v2/checkout/orders', [
            'intent' => 'CAPTURE',
            'purchase_units' => [[
                'amount' => [
                    'currency_code' => 'USD',
                    'value' => number_format($montantUsd, 2, '.', ''),
                ],
            ]],
            'application_context' => [
                'return_url' => $returnUrl,
                'cancel_url' => $cancelUrl,
                'user_action' => 'PAY_NOW',
                'shipping_preference' => 'NO_SHIPPING',
            ],
        ]);

        $orderId = (string) ($body['id'] ?? '');
        $approveUrl = '';
        foreach ((array) ($body['links'] ?? []) as $link) {
            if (\is_array($link) && ($link['rel'] ?? '') === 'approve') {
                $approveUrl = (string) ($link['href'] ?? '');
                break;
            }
        }
        if ($orderId === '' || $approveUrl === '') {
            throw new Twin9Exception('Réponse PayPal inattendue, réessayez plus tard.', 502);
        }

        return ['order_id' => $orderId, 'approve_url' => $approveUrl];
    }

    /**
     * Capture an approved order (server-to-server, after the redirect back).
     *
     * @return array{status: string, montant_usd: string} status 'COMPLETED'
     *               and the CAPTURED amount (PayPal's figure — never a
     *               client-provided one) on success. An order PayPal reports
     *               as already captured resolves through getOrder() so a
     *               replayed capture converges on the same answer.
     *
     * @throws Twin9Exception 422 when the buyer has not approved the order
     */
    public function captureOrder(string $orderId): array
    {
        $response = $this->rawCall(
            'POST',
            '/v2/checkout/orders/' . rawurlencode($orderId) . '/capture',
            '{}',
        );

        if ($response['status'] >= 200 && $response['status'] < 300) {
            $body = self::decode($response['body']);

            return [
                'status' => (string) ($body['status'] ?? ''),
                'montant_usd' => self::capturedAmount($body),
            ];
        }

        $issue = self::firstIssue(self::decode($response['body']));
        if ($issue === 'ORDER_ALREADY_CAPTURED') {
            // Double click / replayed redirect: converge on the stored order.
            return $this->getOrder($orderId);
        }
        if ($issue === 'ORDER_NOT_APPROVED') {
            throw new Twin9Exception(
                'Paiement non approuvé : validez d’abord le paiement sur PayPal, puis réessayez.',
                422,
            );
        }
        if ($response['status'] === 404) {
            throw new Twin9Exception('Ordre PayPal introuvable.', 422);
        }

        throw new Twin9Exception('Le service PayPal a renvoyé une erreur, réessayez plus tard.', 502);
    }

    /**
     * Read an order (already-captured replay path).
     *
     * @return array{status: string, montant_usd: string}
     */
    public function getOrder(string $orderId): array
    {
        $body = $this->call('GET', '/v2/checkout/orders/' . rawurlencode($orderId), null);

        return [
            'status' => (string) ($body['status'] ?? ''),
            'montant_usd' => self::capturedAmount($body),
        ];
    }

    // ------------------------------------------------------------------
    // Plumbing
    // ------------------------------------------------------------------

    /** OAuth2 client_credentials token (fresh per request — no cache on
     * shared hosting, and each user action makes at most 2 PayPal calls). */
    private function accessToken(): string
    {
        try {
            $response = $this->http->request(
                'POST',
                $this->baseUrl . '/v1/oauth2/token',
                [
                    'authorization' => 'Basic ' . base64_encode($this->clientId . ':' . $this->secret),
                    'content-type' => 'application/x-www-form-urlencoded',
                ],
                'grant_type=client_credentials',
                $this->timeoutSeconds,
            );
        } catch (HttpClientException) {
            throw new Twin9Exception('Le service PayPal est injoignable, réessayez plus tard.', 502);
        }

        $token = self::decode($response['body'])['access_token'] ?? null;
        if ($response['status'] !== 200 || !\is_string($token) || $token === '') {
            throw new Twin9Exception('Connexion à PayPal impossible (identifiants ?).', 502);
        }

        return $token;
    }

    /** Authenticated JSON call that only accepts a 2xx answer. */
    private function call(string $method, string $path, ?array $payload): array
    {
        $response = $this->rawCall(
            $method,
            $path,
            $payload === null ? null : json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
        );
        if ($response['status'] < 200 || $response['status'] >= 300) {
            throw new Twin9Exception('Le service PayPal a renvoyé une erreur, réessayez plus tard.', 502);
        }

        return self::decode($response['body']);
    }

    /** @return array{status: int, headers: array<string, string>, body: string, overflow: bool} */
    private function rawCall(string $method, string $path, ?string $body): array
    {
        $token = $this->accessToken();
        try {
            return $this->http->request(
                $method,
                $this->baseUrl . $path,
                [
                    'authorization' => 'Bearer ' . $token,
                    'content-type' => 'application/json',
                ],
                $body,
                $this->timeoutSeconds,
            );
        } catch (HttpClientException) {
            throw new Twin9Exception('Le service PayPal est injoignable, réessayez plus tard.', 502);
        }
    }

    /** @return array<string, mixed> */
    private static function decode(string $body): array
    {
        $decoded = json_decode($body, true);

        return \is_array($decoded) ? $decoded : [];
    }

    /** First issue code of a PayPal error body ('' when absent). */
    private static function firstIssue(array $body): string
    {
        foreach ((array) ($body['details'] ?? []) as $detail) {
            if (\is_array($detail) && \is_string($detail['issue'] ?? null)) {
                return $detail['issue'];
            }
        }

        return '';
    }

    /**
     * Captured amount of an order/capture body, as PayPal's decimal string
     * ('5.00'); falls back to the purchase-unit amount, then '0'.
     */
    private static function capturedAmount(array $body): string
    {
        $unit = (array) (((array) ($body['purchase_units'] ?? []))[0] ?? []);
        $capture = (array) ((((array) (((array) ($unit['payments'] ?? []))['captures'] ?? []))[0]) ?? []);

        $value = ((array) ($capture['amount'] ?? []))['value']
            ?? ((array) ($unit['amount'] ?? []))['value']
            ?? '0';

        return \is_string($value) ? $value : '0';
    }
}
