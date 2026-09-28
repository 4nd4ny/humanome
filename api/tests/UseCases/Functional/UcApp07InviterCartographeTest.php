<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\CartographeTestCase;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-APP-07 — Inviter un cartographe (émission et suivi des codes) : tests
 * FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-07-inviter-cartographe.md
 *
 * L'apprenant (session + CSRF) émet ses codes et en suit le statut à travers
 * l'API HTTP réelle. L'acceptation par le cartographe n'est jouée que pour
 * observer, côté apprenant, le passage au statut « acceptee » : son détail
 * relève de UC-CAR-01. Pas d'IHM apprenant pour ce cas (voir la fiche).
 */
final class UcApp07InviterCartographeTest extends CartographeTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $maya;

    protected function setUp(): void
    {
        parent::setUp();
        $this->maya = $this->registerAs('maya@example.org', 'Maya');
    }

    /** @param array{id: int, csrf: string, sid: string}|null $who */
    private function mint(?array $who = null): \Psr\Http\Message\ResponseInterface
    {
        return $this->as_($who ?? $this->maya, 'POST', '/api/cartographe/invitations');
    }

    /** @return list<array<string, mixed>> */
    private function mine(?array $who = null): array
    {
        $response = $this->as_($who ?? $this->maya, 'GET', '/api/cartographe/invitations');
        self::assertSame(200, $response->getStatusCode());

        return self::json($response);
    }

    private static function countCodes(): int
    {
        return (int) self::$pdo->query('SELECT COUNT(*) FROM cartographe_invitations')->fetchColumn();
    }

    #[TestDox('UC-APP-07-F01 — nominal : code de 10 caractères valable 30 jours, suivi « en_attente » puis « acceptee » par Camille')]
    public function testF01NominalMintFollowAndSeeAcceptance(): void
    {
        // 1-3. Émission.
        $response = $this->mint();
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());
        $created = self::json($response);
        self::assertSame(['code', 'expiresAt'], array_keys($created));
        self::assertMatchesRegularExpression('/^[A-Z2-9]{10}$/', $created['code']);
        self::assertSame(
            0,
            (int) self::$pdo->query("SELECT COUNT(*) FROM audit_events WHERE type LIKE '%invitation%'")->fetchColumn(),
            'l’émission n’est pas journalisée (seule l’acceptation l’est, UC-CAR-01)',
        );

        // 4. Suivi : le code apparaît « en attente », valable 30 jours.
        $list = $this->mine();
        // Lu comme UTC : pas de décalage d'heure d'été dans l'écart.
        self::assertSame(30 * 86400, strtotime($created['expiresAt'] . 'Z') - strtotime($list[0]['createdAt'] . 'Z'));
        self::assertSame([[
            'code' => $created['code'],
            'statut' => 'en_attente',
            'createdAt' => $list[0]['createdAt'],
            'expiresAt' => $created['expiresAt'],
            'acceptedAt' => null,
            'acceptedBy' => null,
        ]], $list);

        // 5-6. L'apprenant transmet le code ; Camille l'accepte (UC-CAR-01).
        $camille = $this->registerAs('camille@example.org', 'Camille', ['cartographe']);
        $accepted = $this->as_($camille, 'POST', '/api/cartographe/invitations/' . $created['code'] . '/accept');
        self::assertSame(201, $accepted->getStatusCode());

        // 7. L'apprenant voit qui a accepté et quand.
        $after = $this->mine()[0];
        self::assertSame('acceptee', $after['statut']);
        self::assertSame('Camille', $after['acceptedBy']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $after['acceptedAt']);
        // Le rattachement ouvre la relecture des cartographies partagées (UC-APP-04 A2).
        $id = $this->createCarto($this->maya, ['visibility' => 'cartographe']);
        self::assertSame([$id], array_column(self::json($this->as_($camille, 'GET', '/api/cartographe/cartographies')), 'id'));
    }

    #[TestDox('UC-APP-07-F02 — A1 : plusieurs codes (un par cartographe pressenti), distincts, listés du plus récent au plus ancien')]
    public function testF02SeveralCodesNewestFirst(): void
    {
        $codes = [];
        for ($i = 0; $i < 3; $i++) {
            $codes[] = self::json($this->mint())['code'];
        }

        self::assertCount(3, array_unique($codes));
        $list = $this->mine();
        self::assertSame(array_reverse($codes), array_column($list, 'code'));
        self::assertSame(['en_attente', 'en_attente', 'en_attente'], array_column($list, 'statut'));
    }

    #[TestDox('UC-APP-07-F03 — A2 : code non utilisé au bout de 30 jours → « expiree », inutilisable, et il libère une place')]
    public function testF03ExpiredCodeIsReportedAndFreesASlot(): void
    {
        for ($i = 0; $i < 10; $i++) {
            self::assertSame(201, $this->mint()->getStatusCode());
        }
        self::assertSame(429, $this->mint()->getStatusCode(), 'plafond atteint');

        $oldest = self::$pdo->query('SELECT code FROM cartographe_invitations ORDER BY id LIMIT 1')->fetchColumn();
        self::$pdo->prepare('UPDATE cartographe_invitations SET expires_at = NOW() - INTERVAL 1 SECOND WHERE code = ?')
            ->execute([$oldest]);

        $list = $this->mine();
        self::assertSame('expiree', end($list)['statut']);
        $camille = $this->registerAs('camille@example.org', 'Camille', ['cartographe']);
        self::assertSame(404, $this->as_($camille, 'POST', '/api/cartographe/invitations/' . $oldest . '/accept')->getStatusCode());

        self::assertSame(201, $this->mint()->getStatusCode(), 'un code expiré ne compte plus dans le plafond');
    }

    #[TestDox('UC-APP-07-F04 — A3 : un code accepté ne compte plus dans le plafond')]
    public function testF04AcceptedCodeFreesASlot(): void
    {
        $camille = $this->registerAs('camille@example.org', 'Camille', ['cartographe']);
        $codes = [];
        for ($i = 0; $i < 10; $i++) {
            $codes[] = self::json($this->mint())['code'];
        }
        self::assertSame(429, $this->mint()->getStatusCode());

        self::assertSame(201, $this->as_($camille, 'POST', '/api/cartographe/invitations/' . $codes[0] . '/accept')->getStatusCode());

        self::assertSame(201, $this->mint()->getStatusCode());
        self::assertSame(11, self::countCodes());
    }

    #[TestDox('UC-APP-07-F05 — E1 : 10 codes en attente → 429 avec un message explicite, aucun code de plus')]
    public function testF05PendingCapAnswers429(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->mint();
        }

        $refused = $this->mint();

        self::assertSame(429, $refused->getStatusCode());
        self::assertSame(
            "Trop d'invitations en attente (10 maximum) — attendez une acceptation ou une expiration",
            self::json($refused)['error'],
        );
        self::assertSame(10, self::countCodes());
        self::assertCount(10, $this->mine(), 'le suivi reste disponible');
    }

    #[TestDox('UC-APP-07-F06 — E2 : sans session → 401 ; sans jeton CSRF → 403 ; sans rôle apprenant → 403')]
    public function testF06AuthenticationCsrfAndRole(): void
    {
        $this->cookieSid = null;
        self::assertSame(401, $this->request('POST', '/api/cartographe/invitations')->getStatusCode());
        self::assertSame(401, $this->request('GET', '/api/cartographe/invitations')->getStatusCode());

        $this->cookieSid = $this->maya['sid'];
        $noCsrf = $this->request('POST', '/api/cartographe/invitations');
        self::assertSame(403, $noCsrf->getStatusCode());
        self::assertSame('Jeton CSRF absent ou invalide', self::json($noCsrf)['error']);

        $camille = $this->registerAs('camille@example.org', 'Camille', ['cartographe']);
        self::assertSame(403, $this->mint($camille)->getStatusCode());
        self::assertSame(403, $this->as_($camille, 'GET', '/api/cartographe/invitations')->getStatusCode());

        self::assertSame(0, self::countCodes());
    }

    #[TestDox('UC-APP-07-F07 — E3 : cloisonnement — chacun ne voit que ses codes, le plafond est propre à chaque apprenant')]
    public function testF07CodesAndCapArePerLearner(): void
    {
        $noe = $this->registerAs('noe@example.org', 'Noé');
        for ($i = 0; $i < 10; $i++) {
            $this->mint();
        }

        self::assertSame([], $this->mine($noe));
        self::assertSame(201, $this->mint($noe)->getStatusCode(), 'le plafond de Maya ne bloque pas Noé');
        self::assertCount(1, $this->mine($noe));
        self::assertCount(10, $this->mine());
    }

    #[TestDox('UC-APP-07-F09 — A4 : le cartographe supprime son compte → code toujours « acceptee », nom effacé, rattachement rompu')]
    public function testF09CartographeAccountDeletionAnonymizesTheAcceptedCode(): void
    {
        $camille = $this->registerAs('camille@example.org', 'Camille', ['cartographe']);
        $code = (string) self::json($this->mint())['code'];
        self::assertSame(201, $this->as_($camille, 'POST', '/api/cartographe/invitations/' . $code . '/accept')->getStatusCode());

        self::assertSame(204, $this->as_($camille, 'DELETE', '/api/auth/account')->getStatusCode());

        $item = $this->mine()[0];
        self::assertSame('acceptee', $item['statut']);
        self::assertNull($item['acceptedBy'], 'accepted_by SET NULL : plus de nom affiché');
        self::assertNotNull($item['acceptedAt']);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartographe_links')->fetchColumn());
    }
}
