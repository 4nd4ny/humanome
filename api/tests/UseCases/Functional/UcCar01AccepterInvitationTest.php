<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\CartographeTestCase;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-CAR-01 — Accepter l'invitation d'un apprenant : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/cartographe/UC-CAR-01-accepter-invitation.md
 *
 * Chaque test rejoue un scénario de la fiche par l'API HTTP (application Slim
 * en processus, vraie base MySQL) : l'apprenant émet son code avec la route
 * réelle (précondition, UC-APP-07), puis le cartographe — son propre
 * navigateur, sa session, son jeton CSRF — l'accepte.
 */
final class UcCar01AccepterInvitationTest extends CartographeTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $maya;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $carl;

    protected function setUp(): void
    {
        parent::setUp();
        $this->maya = $this->registerAs('maya@example.org', 'Maya');
        $this->carl = $this->registerAs('carl@example.org', 'Carl', ['cartographe']);
    }

    /** Précondition : l'apprenant émet un code (UC-APP-07). */
    private function codeFrom(array $apprenant): string
    {
        $response = $this->as_($apprenant, 'POST', '/api/cartographe/invitations');
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return (string) self::json($response)['code'];
    }

    private function accept(array $cartographe, string $code): ResponseInterface
    {
        return $this->as_($cartographe, 'POST', '/api/cartographe/invitations/' . $code . '/accept');
    }

    private function countAudits(string $type): int
    {
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM audit_events WHERE type = ?');
        $stmt->execute([$type]);

        return (int) $stmt->fetchColumn();
    }

    #[TestDox('UC-CAR-01-F01 — nominal : le code accepté rattache l’apprenant, audit ids seulement, file alimentée')]
    public function testF01NominalAcceptanceLinksTheLearner(): void
    {
        $exposee = $this->createCarto($this->maya, ['titre' => 'Journée à relire']);
        $this->createCarto($this->maya, ['titre' => 'Journal intime', 'visibility' => 'privee']);
        $code = $this->codeFrom($this->maya);

        // Avant : rien dans l'espace du cartographe.
        self::assertSame([], self::json($this->as_($this->carl, 'GET', '/api/cartographe/apprentis')));

        $response = $this->accept($this->carl, $code);

        self::assertSame(201, $response->getStatusCode());
        self::assertSame(['apprenant' => ['id' => $this->maya['id'], 'displayName' => 'Maya']], self::json($response));

        // Audit : l'accepteur, l'id de l'apprenant — ni code, ni nom
        // (principe RGPD 5 de CLAUDE.md, journalisation minimale).
        $audit = self::lastAudit('invitation_accepted');
        self::assertSame($this->carl['id'], $audit['userId']);
        self::assertSame(['apprenantId' => $this->maya['id']], $audit['details']);
        $raw = (string) self::$pdo->query("SELECT details FROM audit_events WHERE type = 'invitation_accepted'")->fetchColumn();
        self::assertStringNotContainsString($code, $raw);
        self::assertStringNotContainsString('Maya', $raw);

        // Post-conditions visibles par les deux parties.
        $apprentis = self::json($this->as_($this->carl, 'GET', '/api/cartographe/apprentis'));
        self::assertCount(1, $apprentis);
        self::assertSame($this->maya['id'], $apprentis[0]['id']);
        self::assertSame('Maya', $apprentis[0]['displayName']);
        self::assertNotNull($apprentis[0]['linkedAt']);

        $invitations = self::json($this->as_($this->maya, 'GET', '/api/cartographe/invitations'));
        self::assertSame('acceptee', $invitations[0]['statut']);
        self::assertSame('Carl', $invitations[0]['acceptedBy']);

        $file = self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies'));
        self::assertSame([$exposee], array_column($file, 'id'), 'seule la cartographie exposée entre dans la file');
    }

    #[TestDox('UC-CAR-01-F02 — A1 : second code du même apprenant → 201, lien inchangé (date d’origine), code consommé')]
    public function testF02SecondCodeIsIdempotent(): void
    {
        self::assertSame(201, $this->accept($this->carl, $this->codeFrom($this->maya))->getStatusCode());
        // Date d'origine reconnaissable : un lien recréé (DELETE + INSERT,
        // REPLACE) dans la même seconde ne pourrait pas passer pour l'original.
        self::$pdo->exec("UPDATE cartographe_links SET created_at = '2026-01-01 08:00:00'");
        $second = $this->accept($this->carl, $this->codeFrom($this->maya));

        self::assertSame(201, $second->getStatusCode());
        self::assertSame('Maya', self::json($second)['apprenant']['displayName']);
        $apprentis = self::json($this->as_($this->carl, 'GET', '/api/cartographe/apprentis'));
        self::assertCount(1, $apprentis);
        self::assertSame('2026-01-01T08:00:00', $apprentis[0]['linkedAt'], 'le lien existant est conservé tel quel');
        self::assertSame(
            ['acceptee', 'acceptee'],
            array_column(self::json($this->as_($this->maya, 'GET', '/api/cartographe/invitations')), 'statut'),
        );
        self::assertSame(2, $this->countAudits('invitation_accepted'), 'chaque acceptation est un fait daté');
    }

    #[TestDox('UC-CAR-01-F03 — E2 : inconnu, malformé, minuscules, expiré, déjà utilisé, auto-lien → même 404, aucun lien')]
    public function testF03UnusableCodesCollapseIntoOne404(): void
    {
        $rita = $this->registerAs('rita@example.org', 'Rita', ['cartographe']);
        $answers = [];

        $answers['inconnu'] = $this->accept($this->carl, 'ZZZZZZZZZZ');
        $answers['malforme'] = $this->accept($this->carl, 'abc');

        $valid = $this->codeFrom($this->maya);
        $answers['minuscules'] = $this->accept($this->carl, strtolower($valid)); // l'API ne normalise pas

        $expired = $this->codeFrom($this->maya);
        self::$pdo->exec("UPDATE cartographe_invitations SET expires_at = NOW() - INTERVAL 1 SECOND WHERE code = '{$expired}'");
        $answers['expire'] = $this->accept($this->carl, $expired);

        self::assertSame(201, $this->accept($rita, $valid)->getStatusCode());
        $answers['deja_utilise'] = $this->accept($this->carl, $valid);

        // Auto-lien : Carl, aussi apprenant, tente de s'accepter lui-même.
        self::setRoles($this->carl['id'], ['apprenant', 'cartographe']);
        $own = $this->codeFrom($this->carl);
        $answers['auto_lien'] = $this->accept($this->carl, $own);

        $bodies = [];
        foreach ($answers as $case => $response) {
            self::assertSame(404, $response->getStatusCode(), $case);
            $bodies[$case] = (string) $response->getBody();
        }
        self::assertCount(1, array_unique($bodies), 'aucun oracle sur l’état du code');
        self::assertSame(['error' => 'Invitation introuvable ou expirée'], self::json($answers['inconnu']));

        self::assertSame([], self::json($this->as_($this->carl, 'GET', '/api/cartographe/apprentis')));
        self::assertSame(1, $this->countAudits('invitation_accepted'), 'seule l’acceptation de Rita est journalisée');
        self::assertSame(
            'en_attente',
            array_column(self::json($this->as_($this->carl, 'GET', '/api/cartographe/invitations')), 'statut', 'code')[$own],
            'le code refusé en auto-lien n’est pas consommé',
        );
    }

    #[TestDox('UC-CAR-01-F04 — E3 : visiteur → 401, apprenant sans rôle cartographe → 403 (acceptation et apprentis)')]
    public function testF04RoleGuards(): void
    {
        $code = $this->codeFrom($this->maya);

        $this->cookieSid = null;
        self::assertSame(401, $this->request('POST', '/api/cartographe/invitations/' . $code . '/accept')->getStatusCode());
        self::assertSame(401, $this->request('GET', '/api/cartographe/apprentis')->getStatusCode());

        $zoe = $this->registerAs('zoe@example.org', 'Zoé');
        $forbidden = $this->accept($zoe, $code);
        self::assertSame(403, $forbidden->getStatusCode());
        self::assertSame(['error' => 'Rôle insuffisant'], self::json($forbidden));
        self::assertSame(403, $this->as_($zoe, 'GET', '/api/cartographe/apprentis')->getStatusCode());

        // Le code n'a pas été consommé par ces tentatives.
        self::assertSame(201, $this->accept($this->carl, $code)->getStatusCode());
    }

    #[TestDox('UC-CAR-01-F05 — E4 : sans jeton CSRF → 403 (avant la garde de rôle), le code reste utilisable')]
    public function testF05MissingCsrfIsRejected(): void
    {
        $code = $this->codeFrom($this->maya);

        $this->cookieSid = $this->carl['sid'];
        $response = $this->request('POST', '/api/cartographe/invitations/' . $code . '/accept');
        self::assertSame(403, $response->getStatusCode());
        self::assertStringContainsString('CSRF', (string) $response->getBody());
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartographe_links')->fetchColumn());

        // Le CSRF (middleware d'application) passe AVANT la garde de rôle (de
        // route) : un compte sans le rôle et sans jeton reçoit le 403 CSRF, pas
        // « Rôle insuffisant » (E3 suppose un jeton valide).
        $zoe = $this->registerAs('zoe@example.org', 'Zoé');
        $this->cookieSid = $zoe['sid'];
        $noRoleNoToken = $this->request('POST', '/api/cartographe/invitations/' . $code . '/accept');
        self::assertSame(403, $noRoleNoToken->getStatusCode());
        self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($noRoleNoToken));

        self::assertSame(201, $this->accept($this->carl, $code)->getStatusCode());
    }

    #[TestDox('UC-CAR-01-F11 — nominal, étape 5 (AN7) : audit en échec → 500 alors que le code est consommé et le lien créé (comportement actuel)')]
    public function testF11AuditFailureAfterCommitLeavesTheLinkInPlace(): void
    {
        $code = $this->codeFrom($this->maya);

        // Panne provoquée du journal : la table d'audit est renommée le temps
        // d'une requête (restaurée quoi qu'il arrive).
        self::$pdo->exec('RENAME TABLE audit_events TO audit_events_uc_car_01_off');
        $previousLog = ini_set('error_log', '/dev/null'); // le $wrap journalise l'exception
        try {
            $response = $this->accept($this->carl, $code);
        } finally {
            ini_set('error_log', $previousLog === false ? '' : $previousLog);
            self::$pdo->exec('RENAME TABLE audit_events_uc_car_01_off TO audit_events');
        }

        // Comportement ACTUEL (anomalie AN7) : l'acceptation a été validée
        // (COMMIT) avant l'écriture de l'audit ; l'échec de l'audit donne 500…
        self::assertSame(500, $response->getStatusCode());
        self::assertSame(['error' => 'Erreur interne'], self::json($response));
        // … alors que le lien existe et que le code est consommé, sans trace.
        self::assertSame(
            [$this->maya['id']],
            array_column(self::json($this->as_($this->carl, 'GET', '/api/cartographe/apprentis')), 'id'),
        );
        self::assertSame('acceptee', self::json($this->as_($this->maya, 'GET', '/api/cartographe/invitations'))[0]['statut']);
        self::assertSame(0, $this->countAudits('invitation_accepted'));
        // Un nouvel essai du cartographe ne peut plus aboutir.
        self::assertSame(404, $this->accept($this->carl, $code)->getStatusCode());
    }
}
