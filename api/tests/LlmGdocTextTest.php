<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Llm\HttpClientException;

/**
 * GET /api/gdoc-text — public Google Docs text proxy (P7): docId validation,
 * anti-SSRF redirect policy, size cap, French error mapping, shared quota.
 */
final class LlmGdocTextTest extends LlmTestCase
{
    private const DOC_ID = '1aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abc';

    public function testInvalidDocIdIsRejectedWithoutAnyUpstreamCall(): void
    {
        foreach (['', 'short', 'has spaces in the identifier aaaaaaaa', '../../../etc/passwd0000000000', str_repeat('a', 81)] as $docId) {
            $response = $this->request('GET', '/api/gdoc-text?docId=' . rawurlencode($docId));
            self::assertSame(422, $response->getStatusCode(), 'docId: ' . $docId);
        }
        self::assertSame([], $this->http->requests);
    }

    public function testPublicDocumentIsReturnedAsPlainText(): void
    {
        $this->http->queueResponse(['status' => 200, 'body' => "Lundi 5 janvier.\nJournée au musée."]);

        $response = $this->request('GET', '/api/gdoc-text?docId=' . self::DOC_ID);

        self::assertSame(200, $response->getStatusCode());
        self::assertStringStartsWith('text/plain', $response->getHeaderLine('Content-Type'));
        self::assertSame("Lundi 5 janvier.\nJournée au musée.", (string) $response->getBody());
        self::assertSame(
            'https://docs.google.com/document/d/' . self::DOC_ID . '/export?format=txt',
            $this->http->requests[0]['url'],
        );
        // 1 MB response cap requested from the transport.
        self::assertSame(1048576, $this->http->requests[0]['maxBytes']);
    }

    public function testGoogleRedirectToGoogleusercontentIsFollowed(): void
    {
        $target = 'https://doc-0k-cs.googleusercontent.com/export/abc?format=txt';
        $this->http->queueResponse(['status' => 302, 'headers' => ['location' => $target]]);
        $this->http->queueResponse(['status' => 200, 'body' => 'Contenu du document.']);

        $response = $this->request('GET', '/api/gdoc-text?docId=' . self::DOC_ID);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('Contenu du document.', (string) $response->getBody());
        self::assertCount(2, $this->http->requests);
        self::assertSame($target, $this->http->requests[1]['url']);
    }

    public function testRedirectToNonGoogleHostIsRefused(): void
    {
        $this->http->queueResponse(['status' => 302, 'headers' => ['location' => 'https://evil.example/steal']]);

        $response = $this->request('GET', '/api/gdoc-text?docId=' . self::DOC_ID);

        self::assertSame(502, $response->getStatusCode());
        // The forbidden host was never contacted.
        self::assertCount(1, $this->http->requests);
    }

    public function testRedirectTricksAreRefused(): void
    {
        $forbidden = [
            'http://doc.googleusercontent.com/x',            // not https
            'https://10.0.0.1/x',                            // IP literal
            'https://googleusercontent.com.evil.example/x',  // suffix spoof
            'https://xgoogleusercontent.com/x',              // missing dot boundary
            'https://doc.googleusercontent.com:8443/x',      // non-default port
        ];
        foreach ($forbidden as $location) {
            $this->http->queueResponse(['status' => 302, 'headers' => ['location' => $location]]);
            $response = $this->request('GET', '/api/gdoc-text?docId=' . self::DOC_ID);
            self::assertSame(502, $response->getStatusCode(), 'location: ' . $location);
        }
    }

    public function testTooManyRedirectsAreRefused(): void
    {
        for ($i = 0; $i < 4; $i++) {
            $this->http->queueResponse([
                'status' => 302,
                'headers' => ['location' => 'https://doc-' . $i . '.googleusercontent.com/x'],
            ]);
        }

        $response = $this->request('GET', '/api/gdoc-text?docId=' . self::DOC_ID);

        self::assertSame(502, $response->getStatusCode());
        self::assertCount(4, $this->http->requests);
    }

    public function testGoogle403MapsToFrenchAccessMessage(): void
    {
        $this->http->queueResponse(['status' => 403, 'body' => '<html>Forbidden</html>']);

        $response = $this->request('GET', '/api/gdoc-text?docId=' . self::DOC_ID);

        self::assertSame(403, $response->getStatusCode());
        self::assertStringContainsString('partagé en lecture', (string) self::json($response)['error']);
    }

    public function testGoogle404MapsToFrenchNotFoundMessage(): void
    {
        $this->http->queueResponse(['status' => 404]);

        $response = $this->request('GET', '/api/gdoc-text?docId=' . self::DOC_ID);

        self::assertSame(404, $response->getStatusCode());
        self::assertStringContainsString('introuvable', (string) self::json($response)['error']);
    }

    public function testOversizedDocumentAnswers413(): void
    {
        $this->http->queueResponse(['status' => 200, 'overflow' => true]);

        $response = $this->request('GET', '/api/gdoc-text?docId=' . self::DOC_ID);

        self::assertSame(413, $response->getStatusCode());
    }

    public function testNetworkFailureAnswers504(): void
    {
        $this->http->queueException(new HttpClientException('network error (curl 6)'));

        $response = $this->request('GET', '/api/gdoc-text?docId=' . self::DOC_ID);

        self::assertSame(504, $response->getStatusCode());
    }

    public function testQuotaIsSharedWithTheLlmProxy(): void
    {
        TestDb::setEnv('DEMO_PER_IP_PER_HOUR', '2');

        // One LLM call + one gdoc call fill the shared per-IP bucket.
        self::assertSame(200, $this->postLlm()->getStatusCode());
        $this->http->queueResponse(['status' => 200, 'body' => 'ok']);
        self::assertSame(200, $this->request('GET', '/api/gdoc-text?docId=' . self::DOC_ID)->getStatusCode());

        $third = $this->request('GET', '/api/gdoc-text?docId=' . self::DOC_ID);
        self::assertSame(429, $third->getStatusCode());
        self::assertGreaterThan(0, (int) $third->getHeaderLine('Retry-After'));
    }

    public function testGdocQuotaIsNotBypassedByRotatingWithinAnIpv6_64(): void
    {
        // gdoc-text has NO daily circuit breaker and NO proof of work — the
        // per-IP quota is its ONLY ceiling, so the /64 bucketing is what stops
        // it from becoming an unbounded 1 MB-per-hit open proxy.
        TestDb::setEnv('DEMO_PER_IP_PER_HOUR', '2');

        $this->clientIp = '2001:db8:0:7::1';
        foreach ([200, 200, 429] as $expected) {
            $this->http->queueResponse(['status' => 200, 'body' => 'ok']);
            self::assertSame($expected, $this->request('GET', '/api/gdoc-text?docId=' . self::DOC_ID)->getStatusCode());
        }

        // Sibling address in the same /64: still blocked (shared bucket).
        $this->clientIp = '2001:db8:0:7:abcd::9';
        $this->http->queueResponse(['status' => 200, 'body' => 'ok']);
        self::assertSame(429, $this->request('GET', '/api/gdoc-text?docId=' . self::DOC_ID)->getStatusCode());
    }
}
