<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;

/**
 * D6 — édition de profil : nom affiché (PATCH), avatar (PUT/DELETE/GET). Le
 * serveur VALIDE mime + magic number + taille ; l'avatar part avec le compte
 * (RGPD) et peut être retiré indépendamment.
 */
final class AuthAvatarTest extends AuthTestBase
{
    /** PNG minimal (magic + IHDR partiel) — suffisant pour le validateur. */
    private const PNG = "\x89PNG\r\n\x1a\n" . 'des-octets-png-fictifs';
    private const JPEG = "\xFF\xD8\xFF\xE0" . 'des-octets-jpeg-fictifs';
    // RIFF + 4 octets de taille + WEBP (les octets nuls DOIVENT être en double quote).
    private const WEBP = "RIFF\x10\x00\x00\x00WEBP" . 'des-octets-webp';

    /** @return array{id: int, csrf: string} un compte activé + connecté. */
    private function account(string $email = 'ava@example.org'): array
    {
        $body = self::json($this->register($email, self::PASSWORD, 'Ava'));

        return ['id' => (int) $body['user']['id'], 'csrf' => (string) $body['csrfToken']];
    }

    private function put(string $path, array $body, string $csrf): \Psr\Http\Message\ResponseInterface
    {
        return $this->request('PUT', $path, $body, ['X-CSRF-Token' => $csrf]);
    }

    public function testEditDisplayName(): void
    {
        $me = $this->account('edit@example.org');
        $ok = $this->request('PATCH', '/api/auth/me', ['displayName' => 'Ada Lovelace'], ['X-CSRF-Token' => $me['csrf']]);
        self::assertSame(200, $ok->getStatusCode(), (string) $ok->getBody());
        self::assertSame('Ada Lovelace', self::json($ok)['user']['displayName']);

        // Vide -> 422, inchangé.
        $bad = $this->request('PATCH', '/api/auth/me', ['displayName' => '   '], ['X-CSRF-Token' => $me['csrf']]);
        self::assertSame(422, $bad->getStatusCode());
        $stmt = Db::get()->prepare('SELECT display_name FROM users WHERE id = ?');
        $stmt->execute([$me['id']]);
        self::assertSame('Ada Lovelace', (string) $stmt->fetchColumn());
    }

    public function testUploadValidAvatarAndServeIt(): void
    {
        $me = $this->account('upload@example.org');
        $put = $this->put('/api/auth/me/avatar', ['avatar' => base64_encode(self::PNG), 'mime' => 'image/png'], $me['csrf']);
        self::assertSame(200, $put->getStatusCode(), (string) $put->getBody());

        // /auth/me expose hasAvatar = true.
        $meResp = self::json($this->request('GET', '/api/auth/me'));
        self::assertTrue($meResp['user']['hasAvatar']);

        // GET /users/{id}/avatar sert les octets avec le bon type.
        $img = $this->request('GET', '/api/users/' . $me['id'] . '/avatar');
        self::assertSame(200, $img->getStatusCode());
        self::assertSame('image/png', $img->getHeaderLine('Content-Type'));
        self::assertSame(self::PNG, (string) $img->getBody());

        // Accepte aussi JPEG et WebP.
        self::assertSame(200, $this->put('/api/auth/me/avatar', ['avatar' => base64_encode(self::JPEG), 'mime' => 'image/jpeg'], $me['csrf'])->getStatusCode());
        self::assertSame(200, $this->put('/api/auth/me/avatar', ['avatar' => base64_encode(self::WEBP), 'mime' => 'image/webp'], $me['csrf'])->getStatusCode());
    }

    public function testRejectsBadMimeMagicAndSize(): void
    {
        $me = $this->account('reject@example.org');

        // Mime hors allowlist.
        self::assertSame(422, $this->put('/api/auth/me/avatar', ['avatar' => base64_encode(self::PNG), 'mime' => 'image/gif'], $me['csrf'])->getStatusCode());
        // Magic number qui ne correspond PAS au mime déclaré (octets JPEG, mime png).
        self::assertSame(422, $this->put('/api/auth/me/avatar', ['avatar' => base64_encode(self::JPEG), 'mime' => 'image/png'], $me['csrf'])->getStatusCode());
        // Trop lourd (> 200 Ko) même avec le bon magic.
        $huge = "\x89PNG\r\n\x1a\n" . str_repeat('x', 200 * 1024 + 10);
        self::assertSame(422, $this->put('/api/auth/me/avatar', ['avatar' => base64_encode($huge), 'mime' => 'image/png'], $me['csrf'])->getStatusCode());
        // base64 invalide.
        self::assertSame(422, $this->put('/api/auth/me/avatar', ['avatar' => '@@@not-base64@@@', 'mime' => 'image/png'], $me['csrf'])->getStatusCode());

        // Aucun avatar posé après ces refus.
        self::assertSame(404, $this->request('GET', '/api/users/' . $me['id'] . '/avatar')->getStatusCode());
    }

    public function testDeleteAvatarAndPurgeWithAccount(): void
    {
        $me = $this->account('del@example.org');
        $this->put('/api/auth/me/avatar', ['avatar' => base64_encode(self::PNG), 'mime' => 'image/png'], $me['csrf']);
        self::assertSame(200, $this->request('GET', '/api/users/' . $me['id'] . '/avatar')->getStatusCode());

        // Retrait indépendant.
        $del = $this->request('DELETE', '/api/auth/me/avatar', null, ['X-CSRF-Token' => $me['csrf']]);
        self::assertSame(204, $del->getStatusCode());
        self::assertSame(404, $this->request('GET', '/api/users/' . $me['id'] . '/avatar')->getStatusCode());

        // Purge du compte : l'avatar (colonne de users) part avec.
        $this->put('/api/auth/me/avatar', ['avatar' => base64_encode(self::PNG), 'mime' => 'image/png'], $me['csrf']);
        self::assertSame(204, $this->request('DELETE', '/api/auth/account', null, ['X-CSRF-Token' => $me['csrf']])->getStatusCode());
        self::assertSame(404, $this->request('GET', '/api/users/' . $me['id'] . '/avatar')->getStatusCode());
    }

    public function testProfileRoutesRequireASession(): void
    {
        $this->cookieSid = null;
        self::assertSame(401, $this->request('PATCH', '/api/auth/me', ['displayName' => 'X'])->getStatusCode());
        self::assertSame(401, $this->request('PUT', '/api/auth/me/avatar', ['avatar' => 'x', 'mime' => 'image/png'])->getStatusCode());
        self::assertSame(401, $this->request('DELETE', '/api/auth/me/avatar')->getStatusCode());
    }

    public function testAvatarIsSessionScopedNoIdor(): void
    {
        // Deux comptes ; B ne peut pas modifier l'avatar de A (les routes /me/*
        // n'agissent QUE sur la session courante).
        $a = $this->account('a-owner@example.org');
        $this->put('/api/auth/me/avatar', ['avatar' => base64_encode(self::PNG), 'mime' => 'image/png'], $a['csrf']);

        $b = $this->account('b-other@example.org');
        // B pose SON avatar (WebP) — n'affecte pas celui de A (PNG).
        $this->put('/api/auth/me/avatar', ['avatar' => base64_encode(self::WEBP), 'mime' => 'image/webp'], $b['csrf']);

        self::assertSame('image/png', $this->request('GET', '/api/users/' . $a['id'] . '/avatar')->getHeaderLine('Content-Type'));
        self::assertSame('image/webp', $this->request('GET', '/api/users/' . $b['id'] . '/avatar')->getHeaderLine('Content-Type'));
    }
}
