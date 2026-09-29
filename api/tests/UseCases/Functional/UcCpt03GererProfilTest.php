<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\UseCases\Support\CptSupport;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-CPT-03 — Gérer son profil (nom affiché, avatar) : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-03-gerer-profil.md
 *
 * Un compte connecté (inscription + activation réelles) modifie son profil
 * par PATCH /api/auth/me, PUT/DELETE /api/auth/me/avatar ; un tiers lit
 * l'avatar par GET /api/users/{id}/avatar. Session simulée + jeton CSRF.
 */
final class UcCpt03GererProfilTest extends CartographeTestCase
{
    /** PNG 1×1 réel. */
    private const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    /** @var array{id: int, csrf: string, sid: string} */
    private array $ada;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ada = $this->registerAs('ada@example.org', 'Ada');
    }

    private function me(): array
    {
        return self::json($this->as_($this->ada, 'GET', '/api/auth/me'))['user'];
    }

    private function putAvatar(array $body): ResponseInterface
    {
        return $this->as_($this->ada, 'PUT', '/api/auth/me/avatar', $body);
    }

    /** Lecture publique de l'avatar : navigateur sans cookie. */
    private function fetchAvatar(int $userId): ResponseInterface
    {
        $this->cookieSid = null;

        return $this->request('GET', '/api/users/' . $userId . '/avatar');
    }

    #[TestDox('UC-CPT-03-F01 — nominal : PATCH du nom affiché (espaces retirés) → 200 {user}, /me et la base à jour')]
    public function testF01RenameDisplayName(): void
    {
        $response = $this->as_($this->ada, 'PATCH', '/api/auth/me', ['displayName' => '  Ada Lovelace  ']);

        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame([
            'id' => $this->ada['id'],
            'email' => 'ada@example.org',
            'displayName' => 'Ada Lovelace',
            'roles' => ['apprenant'],
            'hasAvatar' => false,
        ], self::json($response)['user']);
        self::assertSame('Ada Lovelace', $this->me()['displayName']);
        self::assertSame('Ada Lovelace', self::$pdo->query('SELECT display_name FROM users WHERE id = ' . $this->ada['id'])->fetchColumn());
    }

    #[TestDox('UC-CPT-03-F02 — A1 : ajout puis remplacement de la photo → 200, hasAvatar, image servie telle quelle (cache privé)')]
    public function testF02UploadThenReplaceAvatar(): void
    {
        $png = (string) base64_decode(self::PNG_B64, true);
        $response = $this->putAvatar(['avatar' => self::PNG_B64, 'mime' => 'image/png']);

        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(['status' => 'ok', 'mime' => 'image/png', 'size' => \strlen($png)], self::json($response));
        self::assertTrue($this->me()['hasAvatar']);

        $served = $this->fetchAvatar($this->ada['id']);
        self::assertSame(200, $served->getStatusCode());
        self::assertSame($png, (string) $served->getBody(), 'octets restitués à l’identique');
        self::assertSame('image/png', $served->getHeaderLine('Content-Type'));
        self::assertSame('private, max-age=300', $served->getHeaderLine('Cache-Control'));

        // Remplacement par un JPEG (le client choisit un autre fichier).
        $jpeg = "\xFF\xD8\xFF\xE0" . str_repeat("\x10", 60);
        self::assertSame(200, $this->putAvatar(['avatar' => base64_encode($jpeg), 'mime' => 'image/jpeg'])->getStatusCode());
        $again = $this->fetchAvatar($this->ada['id']);
        self::assertSame('image/jpeg', $again->getHeaderLine('Content-Type'));
        self::assertSame($jpeg, (string) $again->getBody());
    }

    #[TestDox('UC-CPT-03-F03 — A1 (variantes) : data-URL sans mime (type de l’en-tête), base64 coupé de retours à la ligne ; mime normalisé ; mime explicite prioritaire sur la data-URL')]
    public function testF03DataUrlUpload(): void
    {
        $webp = 'RIFF' . pack('V', 20) . 'WEBP' . 'VP8 ' . str_repeat("\x00", 12);
        $wrapped = chunk_split(base64_encode($webp), 8, "\n");

        $response = $this->putAvatar(['avatar' => 'data:image/webp;base64,' . $wrapped]);

        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame('image/webp', self::json($response)['mime']);
        self::assertSame($webp, (string) $this->fetchAvatar($this->ada['id'])->getBody());

        // Le type déclaré est normalisé (minuscules, blancs retirés) avant validation.
        $normalized = $this->putAvatar(['avatar' => self::PNG_B64, 'mime' => ' IMAGE/PNG ']);
        self::assertSame(200, $normalized->getStatusCode(), (string) $normalized->getBody());
        self::assertSame('image/png', self::json($normalized)['mime']);

        // Un mime explicite l'emporte sur le type annoncé par la data-URL.
        $jpeg = "\xFF\xD8\xFF\xE0" . str_repeat("\x10", 60);
        $explicit = $this->putAvatar(['avatar' => 'data:image/png;base64,' . base64_encode($jpeg), 'mime' => 'image/jpeg']);
        self::assertSame(200, $explicit->getStatusCode(), (string) $explicit->getBody());
        self::assertSame('image/jpeg', self::json($explicit)['mime']);
        self::assertSame('image/jpeg', $this->fetchAvatar($this->ada['id'])->getHeaderLine('Content-Type'));
    }

    #[TestDox('UC-CPT-03-F04 — A2 : retrait de la photo → 204, image 404, hasAvatar faux ; retrait répété sans effet')]
    public function testF04RemoveAvatar(): void
    {
        $this->putAvatar(['avatar' => self::PNG_B64, 'mime' => 'image/png']);

        self::assertSame(204, $this->as_($this->ada, 'DELETE', '/api/auth/me/avatar')->getStatusCode());
        self::assertFalse($this->me()['hasAvatar']);
        $gone = $this->fetchAvatar($this->ada['id']);
        self::assertSame(404, $gone->getStatusCode());
        self::assertSame(['error' => 'Avatar introuvable'], self::json($gone));
        self::assertSame(204, $this->as_($this->ada, 'DELETE', '/api/auth/me/avatar')->getStatusCode(), 'idempotent');
    }

    #[TestDox('UC-CPT-03-F05 — A4 : un tiers anonyme lit l’avatar d’un compte ; compte sans photo ou inconnu → 404')]
    public function testF05PublicReadOfAvatars(): void
    {
        $bob = $this->registerAs('bob@example.org', 'Bob');
        $this->putAvatar(['avatar' => self::PNG_B64, 'mime' => 'image/png']);

        self::assertSame(200, $this->fetchAvatar($this->ada['id'])->getStatusCode());
        self::assertSame(404, $this->fetchAvatar($bob['id'])->getStatusCode(), 'Bob n’a pas de photo');
        self::assertSame(404, $this->fetchAvatar(999999)->getStatusCode());

        // Base non configurée : 503 explicite, jamais un 404 trompeur.
        $unavailable = CptSupport::withoutDatabase(fn () => $this->fetchAvatar($this->ada['id']));
        self::assertSame(503, $unavailable->getStatusCode());
        self::assertSame(['error' => 'Service indisponible'], self::json($unavailable));
    }

    #[TestDox('UC-CPT-03-F06 — E1 : nom vide, blanc, absent ou de 191 caractères → 422 ; 190 caractères acceptés')]
    public function testF06DisplayNameValidation(): void
    {
        foreach (['', '    ', str_repeat('é', 191), null] as $value) {
            $response = $this->as_($this->ada, 'PATCH', '/api/auth/me', $value === null ? [] : ['displayName' => $value]);
            self::assertSame(422, $response->getStatusCode(), var_export($value, true));
            self::assertSame(
                ['error' => 'Validation échouée', 'fields' => ['displayName' => 'Le nom affiché est requis (190 caractères maximum)']],
                self::json($response),
            );
        }
        self::assertSame('Ada', $this->me()['displayName'], 'inchangé après les refus');

        $max = str_repeat('é', 190); // borne comptée en caractères, pas en octets
        self::assertSame(200, $this->as_($this->ada, 'PATCH', '/api/auth/me', ['displayName' => $max])->getStatusCode());
        self::assertSame($max, $this->me()['displayName']);

        // Comportement ACTUEL figé (« Anomalies constatées », AN3) : trim() de PHP ne
        // retire que les blancs ASCII ; un nom fait d'espaces Unicode (insécable,
        // idéographique) est accepté par l'API — seule l'IHM le refuse.
        $invisible = "\u{00A0}\u{3000}";
        self::assertSame(200, $this->as_($this->ada, 'PATCH', '/api/auth/me', ['displayName' => $invisible])->getStatusCode());
        self::assertSame($invisible, $this->me()['displayName'], 'nom invisible enregistré');
    }

    #[TestDox('UC-CPT-03-F07 — E2/E3 : sans session → 401 « Authentification requise » ; jeton CSRF absent ou faux → 403 ; nom et photo existants intacts')]
    public function testF07SessionAndCsrfAreRequired(): void
    {
        // Une photo existe déjà : un DELETE ou un PUT forgé qui passerait se verrait.
        self::assertSame(200, $this->putAvatar(['avatar' => self::PNG_B64, 'mime' => 'image/png'])->getStatusCode());
        $jpeg = base64_encode("\xFF\xD8\xFF\xE0" . str_repeat("\x10", 60));
        foreach ([
            ['PATCH', '/api/auth/me', ['displayName' => 'Pirate']],
            ['PUT', '/api/auth/me/avatar', ['avatar' => $jpeg, 'mime' => 'image/jpeg']],
            ['DELETE', '/api/auth/me/avatar', null],
        ] as [$method, $path, $body]) {
            $this->cookieSid = null;
            $anonymous = $this->request($method, $path, $body);
            self::assertSame(401, $anonymous->getStatusCode(), $method . ' ' . $path);
            self::assertSame(['error' => 'Authentification requise'], self::json($anonymous));

            foreach ([[], ['X-CSRF-Token' => str_repeat('0', 64)]] as $headers) {
                $this->cookieSid = $this->ada['sid'];
                $forged = $this->request($method, $path, $body, $headers); // tir cross-site : cookie sans (bon) en-tête
                self::assertSame(403, $forged->getStatusCode(), $method . ' ' . $path);
                self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($forged));
            }
        }
        $me = $this->me();
        self::assertSame('Ada', $me['displayName']);
        self::assertTrue($me['hasAvatar']);
        $served = $this->fetchAvatar($this->ada['id']);
        self::assertSame('image/png', $served->getHeaderLine('Content-Type'));
        self::assertSame((string) base64_decode(self::PNG_B64, true), (string) $served->getBody(), 'photo d’origine intacte');
    }

    #[TestDox('UC-CPT-03-F08 — E4 : base64 invalide ou vide, type interdit, image trop lourde, contenu déguisé → 422 (quatre messages) ; la photo existante n’est pas touchée')]
    public function testF08InvalidImagesAreRejected(): void
    {
        self::assertSame(200, $this->putAvatar(['avatar' => self::PNG_B64, 'mime' => 'image/png'])->getStatusCode());
        $bigJpeg = "\xFF\xD8\xFF\xE0" . str_repeat("\x00", 205 * 1024);
        $cases = [
            [['avatar' => '*** pas du base64 ***', 'mime' => 'image/png'], 'Données d’image invalides (base64 attendu)'],
            [['avatar' => '', 'mime' => 'image/png'], 'Données d’image invalides (base64 attendu)'],
            [['avatar' => base64_encode("GIF89a\x01\x00"), 'mime' => 'image/gif'], 'Format non supporté : seuls JPEG, PNG et WebP sont acceptés.'],
            [['avatar' => base64_encode($bigJpeg), 'mime' => 'image/jpeg'], 'Image trop lourde (205 Ko, maximum 200 Ko).'],
            [['avatar' => base64_encode('<script>alert(1)</script>'), 'mime' => 'image/png'], 'Le contenu du fichier ne correspond pas à une image PNG.'],
        ];
        foreach ($cases as [$body, $message]) {
            $response = $this->putAvatar($body);
            self::assertSame(422, $response->getStatusCode(), $message);
            self::assertSame(['error' => $message], self::json($response));
        }
        // « Image vide. » (AvatarValidator) n'est jamais atteint par HTTP : un avatar
        // vide est refusé avant, avec le message base64 (cas 2). Quatre messages distincts.
        self::assertCount(4, array_unique(array_column($cases, 1)));
        self::assertTrue($this->me()['hasAvatar']);
        $served = $this->fetchAvatar($this->ada['id']);
        self::assertSame(200, $served->getStatusCode());
        self::assertSame((string) base64_decode(self::PNG_B64, true), (string) $served->getBody(), 'photo d’origine intacte');
    }

    #[TestDox('UC-CPT-03-F17 — RG4 : les mutations d’un autre compte (nom, photo, retrait) n’atteignent jamais le profil d’Ada')]
    public function testF17MutationsOnlyTouchTheSessionAccount(): void
    {
        self::assertSame(200, $this->putAvatar(['avatar' => self::PNG_B64, 'mime' => 'image/png'])->getStatusCode());
        $bob = $this->registerAs('bob@example.org', 'Bob');

        self::assertSame(200, $this->as_($bob, 'PATCH', '/api/auth/me', ['displayName' => 'Bob2'])->getStatusCode());
        $jpeg = "\xFF\xD8\xFF\xE0" . str_repeat("\x10", 60);
        self::assertSame(200, $this->as_($bob, 'PUT', '/api/auth/me/avatar', ['avatar' => base64_encode($jpeg), 'mime' => 'image/jpeg'])->getStatusCode());
        self::assertSame(204, $this->as_($bob, 'DELETE', '/api/auth/me/avatar')->getStatusCode());

        $ada = $this->me();
        self::assertSame('Ada', $ada['displayName']);
        self::assertTrue($ada['hasAvatar']);
        self::assertSame((string) base64_decode(self::PNG_B64, true), (string) $this->fetchAvatar($this->ada['id'])->getBody());
        self::assertSame('Bob2', self::json($this->as_($bob, 'GET', '/api/auth/me'))['user']['displayName']);
        self::assertSame(404, $this->fetchAvatar($bob['id'])->getStatusCode(), 'Bob a retiré SA photo');
    }
}
