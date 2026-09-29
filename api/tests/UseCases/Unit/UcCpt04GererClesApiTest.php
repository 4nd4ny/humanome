<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\Keys\KeyVault;
use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-CPT-04 — Gérer ses clés API personnelles : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-04-gerer-cles-api.md
 *
 * KeyVault (ADR-004, stockage serveur opt-in chiffré) appelé directement :
 * lecture de la clé maîtresse, format du chiffré (nonce || secretbox),
 * remplacement, liste sans matériau de clé, révélation au seul propriétaire,
 * suppression réelle.
 */
final class UcCpt04GererClesApiTest extends TestCase
{
    private const MASTER_HEX = '89b1b60f0a26f73b63f9df20a9c58ab24905b48b2bd45a01b344cee69d7e3a55';
    private const API_KEY = 'sk-ant-api03-EXEMPLE-cle-personnelle';

    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    public static function tearDownAfterClass(): void
    {
        TestDb::restoreEnv();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users');
    }

    private static function vault(string $hex = self::MASTER_HEX): KeyVault
    {
        return new KeyVault(self::$pdo, sodium_hex2bin($hex));
    }

    private static function newUser(string $email): int
    {
        return Users::create(self::$pdo, $email, Users::hashPassword('correct horse battery'), 'U');
    }

    private static function blob(int $userId, string $provider): string
    {
        $stmt = self::$pdo->prepare('SELECT encrypted_key FROM user_api_keys WHERE user_id = ? AND provider = ?');
        $stmt->execute([$userId, $provider]);

        return (string) $stmt->fetchColumn();
    }

    #[TestDox('UC-CPT-04-U01 — masterKeyFromEnv : 64 hexadécimaux (casse indifférente) → 32 octets ; vide, courte, non hexadécimale ou trop longue → null')]
    public function testU01MasterKeyFromEnv(): void
    {
        TestDb::setEnv('SODIUM_MASTER_KEY', self::MASTER_HEX);
        self::assertSame(sodium_hex2bin(self::MASTER_HEX), KeyVault::masterKeyFromEnv());
        self::assertSame(SODIUM_CRYPTO_SECRETBOX_KEYBYTES, \strlen((string) KeyVault::masterKeyFromEnv()));

        foreach (['', substr(self::MASTER_HEX, 1), 'zz' . substr(self::MASTER_HEX, 2), self::MASTER_HEX . '00'] as $bad) {
            TestDb::setEnv('SODIUM_MASTER_KEY', $bad);
            self::assertNull(KeyVault::masterKeyFromEnv(), var_export($bad, true));
        }
        TestDb::setEnv('SODIUM_MASTER_KEY', strtoupper(self::MASTER_HEX));
        self::assertNotNull(KeyVault::masterKeyFromEnv(), 'majuscules acceptées');
    }

    #[TestDox('UC-CPT-04-U02 — store : chiffré = nonce aléatoire de 24 octets || secretbox, déchiffrable avec la clé maîtresse, jamais en clair')]
    public function testU02CiphertextFormat(): void
    {
        $userId = self::newUser('ada@example.org');
        self::vault()->store($userId, 'anthropic', self::API_KEY);

        $blob = self::blob($userId, 'anthropic');
        self::assertStringNotContainsString(self::API_KEY, $blob);
        self::assertSame(
            SODIUM_CRYPTO_SECRETBOX_NONCEBYTES + \strlen(self::API_KEY) + SODIUM_CRYPTO_SECRETBOX_MACBYTES,
            \strlen($blob),
        );
        $clear = sodium_crypto_secretbox_open(
            substr($blob, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),
            substr($blob, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),
            sodium_hex2bin(self::MASTER_HEX),
        );
        self::assertSame(self::API_KEY, $clear);
    }

    #[TestDox('UC-CPT-04-U03 — store une seconde fois (même fournisseur) : une seule entrée, nouveau nonce, nouvelle clé')]
    public function testU03StoreIsAnUpsert(): void
    {
        $userId = self::newUser('ada@example.org');
        $vault = self::vault();
        $vault->store($userId, 'openai', 'sk-premiere-cle');
        $first = self::blob($userId, 'openai');

        $vault->store($userId, 'openai', 'sk-seconde-cle');

        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM user_api_keys WHERE user_id = ' . $userId)->fetchColumn());
        self::assertNotSame(substr($first, 0, 24), substr(self::blob($userId, 'openai'), 0, 24), 'nonce renouvelé');
        self::assertSame('sk-seconde-cle', $vault->reveal($userId, 'openai'));
    }

    #[TestDox('UC-CPT-04-U04 — listForUser : fournisseurs du seul propriétaire, triés, date ISO, aucun matériau de clé')]
    public function testU04ListNeverCarriesKeys(): void
    {
        $ada = self::newUser('ada@example.org');
        $bob = self::newUser('bob@example.org');
        $vault = self::vault();
        $vault->store($ada, 'openai', 'sk-openai-ada');
        $vault->store($ada, 'anthropic', self::API_KEY);
        $vault->store($bob, 'google', 'AIza-bob-google');

        $list = $vault->listForUser($ada);

        self::assertSame(['anthropic', 'openai'], array_column($list, 'provider'));
        foreach ($list as $entry) {
            self::assertSame(['provider', 'createdAt'], array_keys($entry));
            self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $entry['createdAt']);
        }
        self::assertStringNotContainsString('sk-', json_encode($list, JSON_THROW_ON_ERROR));
        self::assertSame([], $vault->listForUser(999_999));
    }

    #[TestDox('UC-CPT-04-U05 — reveal : propriétaire seul ; fournisseur absent, clé maîtresse changée ou chiffré tronqué → null')]
    public function testU05RevealFailsClosed(): void
    {
        $ada = self::newUser('ada@example.org');
        $bob = self::newUser('bob@example.org');
        self::vault()->store($ada, 'anthropic', self::API_KEY);

        self::assertSame(self::API_KEY, self::vault()->reveal($ada, 'anthropic'));
        self::assertNull(self::vault()->reveal($bob, 'anthropic'), 'pas la clé d’un autre compte');
        self::assertNull(self::vault()->reveal($ada, 'openai'));
        self::assertNull(self::vault(strrev(self::MASTER_HEX))->reveal($ada, 'anthropic'), 'rotation : échec fermé');

        self::$pdo->prepare('UPDATE user_api_keys SET encrypted_key = ? WHERE user_id = ?')
            ->execute([substr(self::blob($ada, 'anthropic'), 0, 20), $ada]);
        self::assertNull(self::vault()->reveal($ada, 'anthropic'), 'chiffré tronqué');
    }

    #[TestDox('UC-CPT-04-U06 — delete : suppression réelle (true), puis false ; l’entrée d’un autre compte est intacte')]
    public function testU06DeleteIsRealAndScoped(): void
    {
        $ada = self::newUser('ada@example.org');
        $bob = self::newUser('bob@example.org');
        $vault = self::vault();
        $vault->store($ada, 'xai', 'xai-cle-ada-123');
        $vault->store($bob, 'xai', 'xai-cle-bob-123');

        self::assertFalse($vault->delete($bob, 'openai'));
        self::assertTrue($vault->delete($ada, 'xai'));
        self::assertFalse($vault->delete($ada, 'xai'));
        self::assertSame('', self::blob($ada, 'xai'));
        self::assertSame('xai-cle-bob-123', $vault->reveal($bob, 'xai'));
    }

    #[TestDox('UC-CPT-04-U07 — fournisseurs acceptés par le coffre : les six de l’interface + « mock » (tests)')]
    public function testU07Providers(): void
    {
        self::assertSame(['anthropic', 'openai', 'google', 'openrouter', 'xai', 'ollama', 'mock'], KeyVault::PROVIDERS);
    }
}
