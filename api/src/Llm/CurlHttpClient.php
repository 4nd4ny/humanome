<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * Production HttpClient over ext-curl (available on OVH mutualisé and in the
 * php:8.2 Docker image). No redirect following, response size cap enforced
 * during the transfer (anti-abuse for gdoc-text).
 */
final class CurlHttpClient implements HttpClient
{
    public function request(
        string $method,
        string $url,
        array $headers = [],
        ?string $body = null,
        int $timeoutSeconds = 30,
        int $maxBytes = 0,
    ): array {
        $ch = curl_init();
        if ($ch === false) {
            throw new HttpClientException('curl init failed');
        }

        $responseBody = '';
        $overflow = false;
        /** @var array<string, string> $responseHeaders */
        $responseHeaders = [];

        $headerLines = [];
        foreach ($headers as $name => $value) {
            $headerLines[] = $name . ': ' . $value;
        }

        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_HTTPHEADER => $headerLines,
            CURLOPT_FOLLOWLOCATION => false, // callers validate redirects themselves
            CURLOPT_CONNECTTIMEOUT => min(10, $timeoutSeconds),
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, // https only, defense in depth
            CURLOPT_HEADERFUNCTION => function ($ch, string $line) use (&$responseHeaders): int {
                $parts = explode(':', $line, 2);
                if (\count($parts) === 2) {
                    $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
                }

                return \strlen($line);
            },
            CURLOPT_WRITEFUNCTION => function ($ch, string $chunk) use (&$responseBody, &$overflow, $maxBytes): int {
                $responseBody .= $chunk;
                if ($maxBytes > 0 && \strlen($responseBody) > $maxBytes) {
                    $overflow = true;

                    return 0; // abort the transfer
                }

                return \strlen($chunk);
            },
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $ok = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $errno = curl_errno($ch);
        curl_close($ch);

        if ($ok === false && !$overflow) {
            // Generic message only: never echo the URL (it may carry a docId)
            // nor any header (§6, key never logged).
            throw new HttpClientException(
                'network error (curl ' . $errno . ')',
                timedOut: $errno === CURLE_OPERATION_TIMEDOUT,
            );
        }

        return [
            'status' => $status,
            'headers' => $responseHeaders,
            'body' => $overflow ? '' : $responseBody,
            'overflow' => $overflow,
        ];
    }
}
