<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\Media\AvatarValidator;
use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-CPT-03 — Gérer son profil (nom affiché, avatar) : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-03-gerer-profil.md
 *
 * Code sollicité appelé directement : AvatarValidator (allowlist de types,
 * plafond de 200 Ko, magic number réel des octets) et les requêtes de profil
 * de Users (nom affiché, avatar binaire en base).
 */
final class UcCpt03GererProfilTest extends TestCase
{
    /** PNG 1×1 réel. */
    private const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users');
    }

    private static function png(): string
    {
        return (string) base64_decode(self::PNG_B64, true);
    }

    private static function jpeg(int $length = 64): string
    {
        return "\xFF\xD8\xFF\xE0" . str_repeat("\x00", $length - 4);
    }

    private static function webp(): string
    {
        return 'RIFF' . pack('V', 20) . 'WEBP' . 'VP8 ' . str_repeat("\x00", 12);
    }

    private static function newUser(string $email = 'ada@example.org'): int
    {
        return Users::create(self::$pdo, $email, Users::hashPassword('correct horse battery'), 'Ada');
    }

    #[TestDox('UC-CPT-03-U01 — AvatarValidator accepte un vrai JPEG, PNG ou WebP déclaré avec le bon type')]
    public function testU01AcceptsTheThreeAllowedFormats(): void
    {
        self::assertNull(AvatarValidator::validate(self::png(), 'image/png'));
        self::assertNull(AvatarValidator::validate(self::jpeg(), 'image/jpeg'));
        self::assertNull(AvatarValidator::validate(self::webp(), 'image/webp'));
        self::assertSame(['image/jpeg', 'image/png', 'image/webp'], array_keys(AvatarValidator::ALLOWED));
    }

    #[TestDox('UC-CPT-03-U02 — type non autorisé (GIF, SVG, vide) refusé avant tout examen des octets')]
    public function testU02RejectsTypesOutsideTheAllowlist(): void
    {
        $message = 'Format non supporté : seuls JPEG, PNG et WebP sont acceptés.';
        self::assertSame($message, AvatarValidator::validate("GIF89a\x01\x00\x01\x00", 'image/gif'));
        self::assertSame($message, AvatarValidator::validate('<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml'));
        self::assertSame($message, AvatarValidator::validate(self::png(), ''));
        self::assertSame($message, AvatarValidator::validate(self::png(), 'IMAGE/PNG'), 'type attendu déjà normalisé en minuscules par la route');
    }

    #[TestDox('UC-CPT-03-U03 — taille : vide refusé, 200 Ko pile acceptés, 1 octet de plus refusé')]
    public function testU03SizeBoundaries(): void
    {
        self::assertSame(204800, AvatarValidator::MAX_BYTES);
        self::assertSame('Image vide.', AvatarValidator::validate('', 'image/jpeg'));
        self::assertNull(AvatarValidator::validate(self::jpeg(AvatarValidator::MAX_BYTES), 'image/jpeg'));
        self::assertSame(
            'Image trop lourde (200 Ko, maximum 200 Ko).',
            AvatarValidator::validate(self::jpeg(AvatarValidator::MAX_BYTES + 1), 'image/jpeg'),
        );
        self::assertSame(
            'Image trop lourde (300 Ko, maximum 200 Ko).',
            AvatarValidator::validate(self::jpeg(300 * 1024), 'image/jpeg'),
        );
    }

    #[TestDox('UC-CPT-03-U04 — magic number : des octets qui ne correspondent pas au type déclaré sont refusés')]
    public function testU04MagicNumberMustMatchTheDeclaredType(): void
    {
        self::assertSame(
            'Le contenu du fichier ne correspond pas à une image JPEG.',
            AvatarValidator::validate(self::png(), 'image/jpeg'),
        );
        self::assertSame(
            'Le contenu du fichier ne correspond pas à une image PNG.',
            AvatarValidator::validate('<?php echo 1; ?>', 'image/png'),
        );
        $wave = 'RIFF' . pack('V', 20) . 'WAVE' . str_repeat("\x00", 12);
        self::assertSame('Le contenu du fichier ne correspond pas à une image WebP.', AvatarValidator::validate($wave, 'image/webp'));
        self::assertNotNull(AvatarValidator::validate('RIFF', 'image/webp'), 'en-tête WebP tronqué');
    }

    #[TestDox('UC-CPT-03-U05 — Users::updateDisplayName change le nom ; une ligne supprimée n’est pas touchée')]
    public function testU05UpdateDisplayName(): void
    {
        $id = self::newUser();
        Users::updateDisplayName(self::$pdo, $id, 'Ada Lovelace');
        self::assertSame('Ada Lovelace', Users::findById(self::$pdo, $id)['display_name']);

        self::$pdo->exec('UPDATE users SET deleted_at = NOW() WHERE id = ' . $id);
        Users::updateDisplayName(self::$pdo, $id, 'Fantôme');
        self::assertSame('Ada Lovelace', self::$pdo->query('SELECT display_name FROM users WHERE id = ' . $id)->fetchColumn());
    }

    #[TestDox('UC-CPT-03-U06 — avatar en base : aller-retour binaire exact (octets nuls compris), puis retrait')]
    public function testU06AvatarBinaryRoundTripAndDeletion(): void
    {
        $id = self::newUser();
        self::assertNull(Users::getAvatar(self::$pdo, $id));

        $bytes = self::png() . "\x00\xFF\x00";
        Users::setAvatar(self::$pdo, $id, $bytes, 'image/png');

        self::assertSame(['bytes' => $bytes, 'mime' => 'image/png'], Users::getAvatar(self::$pdo, $id));
        self::assertSame('image/png', Users::findById(self::$pdo, $id)['avatar_mime'], '/me expose hasAvatar via avatar_mime');

        Users::deleteAvatar(self::$pdo, $id);
        self::assertNull(Users::getAvatar(self::$pdo, $id));
        self::assertNull(Users::findById(self::$pdo, $id)['avatar_mime']);
    }

    #[TestDox('UC-CPT-03-U07 — getAvatar : compte inconnu ou supprimé → null ; l’avatar d’un compte n’écrase pas celui d’un autre')]
    public function testU07GetAvatarScope(): void
    {
        $ada = self::newUser('ada@example.org');
        $bob = self::newUser('bob@example.org');
        Users::setAvatar(self::$pdo, $ada, self::png(), 'image/png');
        Users::setAvatar(self::$pdo, $bob, self::jpeg(), 'image/jpeg');

        self::assertSame('image/png', Users::getAvatar(self::$pdo, $ada)['mime']);
        self::assertSame('image/jpeg', Users::getAvatar(self::$pdo, $bob)['mime']);
        self::assertNull(Users::getAvatar(self::$pdo, 999_999));

        self::$pdo->exec('UPDATE users SET deleted_at = NOW() WHERE id = ' . $bob);
        self::assertNull(Users::getAvatar(self::$pdo, $bob));
    }
}
