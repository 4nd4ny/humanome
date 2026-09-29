<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Geo\CountryResolver;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\UseCases\Support\CptSupport;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-CPT-01 — Créer un compte et l'activer par code email : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-01-creer-activer-compte.md
 *
 * Chaque test rejoue un scénario de la fiche à travers l'API HTTP (application
 * Slim en processus, vraie base MySQL) : un navigateur neuf (aucun cookie)
 * s'inscrit par POST /api/auth/register, « lit » l'email capturé par le
 * MemoryMailer, puis active son compte par POST /api/auth/activate (ou
 * demande un renvoi par POST /api/auth/resend).
 */
final class UcCpt01CreerActiverCompteTest extends CartographeTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // Base pays déterministe (le vrai résolveur lit une base MMDB locale).
        CountryResolver::setOverride(static fn (string $ip): ?string => 'FR');
    }

    protected function tearDown(): void
    {
        CountryResolver::setOverride(null);
        parent::tearDown();
    }

    /** Étape 4 : le formulaire d'inscription envoie ses quatre champs. */
    private function signUp(array $overrides = []): ResponseInterface
    {
        $this->cookieSid = null;

        return $this->request('POST', '/api/auth/register', array_merge([
            'email' => 'ada@example.org',
            'emailConfirm' => 'ada@example.org',
            'password' => self::PASSWORD,
            'displayName' => 'Ada',
        ], $overrides));
    }

    /** @return array<string, mixed> ligne users (colonnes de vérification incluses) */
    private static function userRow(string $email): array
    {
        $stmt = self::$pdo->prepare('SELECT * FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $row = $stmt->fetch();
        self::assertIsArray($row, 'compte ' . $email);

        return $row;
    }

    private static function countUsers(): int
    {
        return (int) self::$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    }

    /** Un code à 4 chiffres dont on est sûr qu'il est faux. */
    private static function wrongCode(string $good, int $shift = 1): string
    {
        return str_pad((string) (((int) $good + $shift) % 10000), 4, '0', STR_PAD_LEFT);
    }

    #[TestDox('UC-CPT-01-F01 — scénario nominal : inscription (201, sans session) → email avec code → activation (200, session, rôle apprenant)')]
    public function testF01NominalSignUpThenActivate(): void
    {
        // Étapes 4-5 : inscription, compte en attente, AUCUNE session.
        $registered = $this->signUp(['email' => ' Ada@Example.org ', 'emailConfirm' => 'ADA@example.org']);
        self::assertSame(201, $registered->getStatusCode(), (string) $registered->getBody());
        self::assertSame([
            'status' => 'pending_activation',
            'email' => 'ada@example.org',
            'message' => 'Un code de confirmation à 4 chiffres vous a été envoyé par email.',
        ], self::json($registered));
        self::assertNull($this->cookieSid, 'pas de session avant activation');

        $row = self::userRow('ada@example.org');
        $userId = (int) $row['id'];
        self::assertNull($row['email_verified_at']);
        self::assertSame('argon2id', password_get_info((string) $row['password_hash'])['algoName']);
        self::assertSame(['apprenant'], \Humanome\Auth\Users::rolesOf(self::$pdo, $userId));
        $ttl = strtotime((string) $row['verification_expires_at']) - time();
        self::assertGreaterThan(1790, $ttl);
        self::assertLessThanOrEqual(1800, $ttl, 'code valable 30 minutes');
        self::assertSame(['userId' => $userId, 'details' => null], self::lastAudit('account_created'));

        // L'email reçu : code en clair + lien #/activer pré-rempli.
        $mail = $this->mailer->last();
        self::assertNotNull($mail);
        self::assertSame('ada@example.org', $mail['to']);
        self::assertSame('humanome.xyz — activez votre compte', $mail['subject']);
        $code = $this->lastCode();
        self::assertMatchesRegularExpression('/^\d{4}$/', $code);
        self::assertStringContainsString('/#/activer?email=ada%40example.org&code=' . $code, $mail['body']);
        self::assertStringContainsString('expire dans 30 minutes', $mail['body']);
        self::assertFalse(password_verify('x', (string) $row['verification_code_hash']));
        self::assertTrue(password_verify($code, (string) $row['verification_code_hash']), 'code stocké haché');

        // Étapes 8-9 : activation = premier login (session + jeton CSRF).
        $activated = $this->activate('ada@example.org', $code);
        self::assertSame(200, $activated->getStatusCode(), (string) $activated->getBody());
        $body = self::json($activated);
        self::assertSame([
            'id' => $userId,
            'email' => 'ada@example.org',
            'displayName' => 'Ada',
            'roles' => ['apprenant'],
            'hasAvatar' => false,
        ], $body['user']);
        self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $body['csrfToken']);
        self::assertNotNull($this->cookieSid);

        $me = self::json($this->request('GET', '/api/auth/me'));
        self::assertSame($body['csrfToken'], $me['csrfToken']);
        $after = self::userRow('ada@example.org');
        self::assertNotNull($after['email_verified_at']);
        self::assertNull($after['verification_code_hash'], 'code à usage unique');

        // Journal des connexions : pays + réseau tronqué, jamais l'IP. Colonne
        // JSON relue : MySQL ne conserve pas l'ordre des clés (assertEquals).
        self::assertEquals(
            ['userId' => $userId, 'details' => ['pays' => 'FR', 'reseau' => '203.0.113.0/24']],
            self::lastAudit('login'),
        );
    }

    #[TestDox('UC-CPT-01-F02 — A1 : le lien du mail (email encodé + code) active le compte, casse et espaces ignorés')]
    public function testF02ActivationThroughTheMailLink(): void
    {
        self::assertSame(201, $this->signUp()->getStatusCode());
        self::assertSame(1, preg_match('/#\/activer\?(\S+)/', $this->mailer->lastBody(), $m));
        parse_str($m[1], $params); // ce que fait le routeur front (#/activer?email=…&code=…)
        self::assertSame('ada@example.org', $params['email']);

        $response = $this->activate('  ' . strtoupper($params['email']) . ' ', ' ' . $params['code'] . ' ');

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('ada@example.org', self::json($response)['user']['email']);
    }

    #[TestDox('UC-CPT-01-F03 — A2 : renvoi du code → nouveau mail, essais remis à 0 ; réponse générique sans envoi pour un compte inconnu ou déjà activé')]
    public function testF03ResendRegeneratesTheCode(): void
    {
        $this->signUp();
        $first = $this->lastCode();
        $firstHash = self::userRow('ada@example.org')['verification_code_hash'];
        self::assertSame(401, $this->activate('ada@example.org', self::wrongCode($first, 1))->getStatusCode());
        self::assertSame(401, $this->activate('ada@example.org', self::wrongCode($first, 2))->getStatusCode());
        self::assertSame(2, (int) self::userRow('ada@example.org')['verification_attempts']);

        $resend = $this->request('POST', '/api/auth/resend', ['email' => 'ADA@example.org']);
        self::assertSame(200, $resend->getStatusCode());
        $generic = self::json($resend);
        self::assertSame('ok', $generic['status']);
        self::assertCount(2, $this->mailer->sent, 'un second mail est parti');
        $row = self::userRow('ada@example.org');
        self::assertSame(0, (int) $row['verification_attempts'], 'cinq essais rouverts');
        self::assertNotSame($firstHash, $row['verification_code_hash'], 'code régénéré');

        // Anti-énumération : même réponse, aucun mail, pour un inconnu ou un compte déjà actif.
        self::assertSame(200, $this->activate('ada@example.org', $this->lastCode())->getStatusCode());
        foreach (['nobody@example.org', 'ada@example.org', 'pas-un-email'] as $email) {
            $this->cookieSid = null;
            $other = $this->request('POST', '/api/auth/resend', ['email' => $email]);
            self::assertSame(200, $other->getStatusCode(), $email);
            self::assertSame($generic, self::json($other), $email);
        }
        self::assertCount(2, $this->mailer->sent, 'aucun envoi supplémentaire');
    }

    #[TestDox('UC-CPT-01-F04 — A3 : reprise plus tard — connexion refusée (403 email_not_verified) puis activation, puis connexion normale')]
    public function testF04ResumeActivationFromLogin(): void
    {
        $this->signUp();
        $code = $this->lastCode();

        $this->cookieSid = null;
        $login = $this->login('ada@example.org', self::PASSWORD);
        self::assertSame(403, $login->getStatusCode());
        self::assertSame([
            'error' => 'Compte non activé : confirmez votre email avec le code reçu.',
            'code' => 'email_not_verified',
            'email' => 'ada@example.org',
        ], self::json($login));
        self::assertNull($this->cookieSid);

        self::assertSame(200, $this->activate('ada@example.org', $code)->getStatusCode());
        $this->cookieSid = null;
        self::assertSame(200, $this->login('ada@example.org', self::PASSWORD)->getStatusCode());
    }

    #[TestDox('UC-CPT-01-F05 — E2 : validation serveur 422 champ par champ (email, double saisie, mot de passe, nom), rien n’est créé')]
    public function testF05ServerSideValidation(): void
    {
        $cases = [
            'email' => [['email' => 'pas-un-email', 'emailConfirm' => 'pas-un-email'], 'Adresse email invalide'],
            'emailConfirm' => [['emailConfirm' => 'ada@example.com'], 'Les deux adresses email ne correspondent pas'],
            'password' => [['password' => '123456789'], 'Le mot de passe doit contenir au moins 10 caractères'],
            'password ' => [['password' => str_repeat('x', 1025)], 'Mot de passe trop long'],
            'displayName' => [['displayName' => '   '], 'Le nom affiché est requis (190 caractères maximum)'],
            'displayName ' => [['displayName' => str_repeat('n', 191)], 'Le nom affiché est requis (190 caractères maximum)'],
        ];
        foreach ($cases as $field => [$override, $message]) {
            $response = $this->signUp($override);
            self::assertSame(422, $response->getStatusCode(), $field);
            $body = self::json($response);
            self::assertSame('Validation échouée', $body['error']);
            self::assertSame([trim($field) => $message], $body['fields'], $field);
        }
        self::assertSame(0, self::countUsers());
        self::assertSame([], $this->mailer->sent, 'aucun email pour une inscription refusée');

        // La longueur se compte en CARACTÈRES : 10 lettres accentuées suffisent.
        self::assertSame(201, $this->signUp(['password' => 'éééééééééé'])->getStatusCode());
    }

    #[TestDox('UC-CPT-01-F06 — E3 : adresse déjà utilisée (casse comprise) → 409, pas de second compte ni de mail')]
    public function testF06DuplicateEmail(): void
    {
        self::assertSame(201, $this->signUp()->getStatusCode());

        $again = $this->signUp(['email' => 'ADA@example.org', 'emailConfirm' => 'ada@EXAMPLE.org', 'displayName' => 'Autre']);

        self::assertSame(409, $again->getStatusCode());
        self::assertSame(['error' => 'Un compte existe déjà avec cette adresse email'], self::json($again));
        self::assertSame(1, self::countUsers());
        self::assertCount(1, $this->mailer->sent);
    }

    #[TestDox('UC-CPT-01-F07 — E4 : 11e inscription de l’heure depuis une IP (/64 en IPv6) → 429 + Retry-After, même invalide les essais comptent')]
    public function testF07RegisterRateLimitPerIp(): void
    {
        CptSupport::awayFromWindowBoundary(3600); // fenêtre fixe d'une heure
        $this->clientIp = '2001:db8:1:2::1';
        for ($i = 1; $i <= 10; $i++) {
            // Le quota est compté AVANT la validation : même des requêtes invalides l'épuisent.
            self::assertSame(422, $this->signUp(['email' => 'invalide-' . $i])->getStatusCode(), "essai $i");
        }

        $this->clientIp = '2001:db8:1:2::abcd'; // même /64 : même seau
        $blocked = $this->signUp();
        self::assertSame(429, $blocked->getStatusCode());
        self::assertSame(['error' => 'Trop de tentatives, réessayez plus tard'], self::json($blocked));
        self::assertSame('30', $blocked->getHeaderLine('Retry-After'));
        self::assertSame(0, self::countUsers());

        $this->clientIp = '2001:db8:1:3::1'; // autre /64 : non pénalisé
        self::assertSame(201, $this->signUp()->getStatusCode());
    }

    #[TestDox('UC-CPT-01-F08 — E5 : 5 codes faux verrouillent (même le bon est refusé) ; inconnu, expiré, déjà activé → même 401 générique')]
    public function testF08WrongExpiredOrLockedCodes(): void
    {
        $this->signUp();
        $good = $this->lastCode();
        $bodies = [];
        for ($i = 1; $i <= 5; $i++) {
            $response = $this->activate('ada@example.org', self::wrongCode($good, $i));
            self::assertSame(401, $response->getStatusCode(), "code faux $i");
            $bodies['faux'] = (string) $response->getBody();
        }
        self::assertSame(5, (int) self::userRow('ada@example.org')['verification_attempts']);
        $locked = $this->activate('ada@example.org', $good);
        self::assertSame(401, $locked->getStatusCode(), 'verrou : le bon code ne suffit plus');
        $bodies['verrouille'] = (string) $locked->getBody();
        self::assertNull(self::userRow('ada@example.org')['email_verified_at']);

        $bodies['inconnu'] = (string) $this->activate('nobody@example.org', '1234')->getBody();

        $this->signUp(['email' => 'late@example.org', 'emailConfirm' => 'late@example.org']);
        $lateCode = $this->lastCode();
        self::$pdo->exec("UPDATE users SET verification_expires_at = '2000-01-01 00:00:00' WHERE email = 'late@example.org'");
        $bodies['expire'] = (string) $this->activate('late@example.org', $lateCode)->getBody();

        $this->register('done@example.org');
        $this->cookieSid = null;
        $bodies['deja-active'] = (string) $this->activate('done@example.org', '1234')->getBody();

        // Corps octet pour octet identiques : aucun oracle d'état du compte.
        self::assertCount(1, array_unique($bodies), implode(' | ', array_keys($bodies)));
        self::assertSame(['error' => 'Code invalide ou expiré'], json_decode($bodies['inconnu'], true));
    }

    #[TestDox('UC-CPT-01-F09 — E6 : code mal formé ou email absent → 422, ni essai consommé ni quota IP entamé')]
    public function testF09MalformedCode(): void
    {
        $this->signUp();
        foreach ([['ada@example.org', '12a4'], ['ada@example.org', '123'], ['ada@example.org', '12345'], ['', '1234']] as [$email, $code]) {
            $response = $this->activate($email, $code);
            self::assertSame(422, $response->getStatusCode(), $email . '/' . $code);
            self::assertSame(['error' => 'Email et code à 4 chiffres requis'], self::json($response));
        }
        self::assertSame(0, (int) self::userRow('ada@example.org')['verification_attempts']);
        self::assertSame(0, (int) self::$pdo->query("SELECT COUNT(*) FROM rate_limits WHERE bucket LIKE 'activate:%'")->fetchColumn());
    }

    #[TestDox('UC-CPT-01-F10 — E7 : au-delà de 20 activations par 15 min depuis une IP → 429, même avec le bon code')]
    public function testF10ActivationRateLimitPerIp(): void
    {
        CptSupport::awayFromWindowBoundary(900); // fenêtre fixe de 15 min
        $this->signUp();
        $good = $this->lastCode();
        for ($i = 1; $i <= 20; $i++) {
            self::assertSame(401, $this->activate('inconnu-' . $i . '@example.org', '0000')->getStatusCode(), "essai $i");
        }

        $blocked = $this->activate('ada@example.org', $good);
        self::assertSame(429, $blocked->getStatusCode());
        self::assertSame('Trop de tentatives, réessayez plus tard', self::json($blocked)['error']);
        self::assertGreaterThanOrEqual(30, (int) $blocked->getHeaderLine('Retry-After'));
        self::assertNull(self::userRow('ada@example.org')['email_verified_at']);

        $this->clientIp = '198.51.100.20'; // autre réseau : le bon code passe
        self::assertSame(200, $this->activate('ada@example.org', $good)->getStatusCode());
    }

    #[TestDox('UC-CPT-01-F11 — E8 : renvois limités à 3/h par compte et 10/h par IP → 429 sans nouvel email')]
    public function testF11ResendRateLimits(): void
    {
        CptSupport::awayFromWindowBoundary(3600);
        $this->signUp();
        for ($i = 1; $i <= 3; $i++) {
            self::assertSame(200, $this->request('POST', '/api/auth/resend', ['email' => 'ada@example.org'])->getStatusCode());
        }
        $sent = \count($this->mailer->sent);
        $blocked = $this->request('POST', '/api/auth/resend', ['email' => 'ada@example.org']);
        self::assertSame(429, $blocked->getStatusCode());
        self::assertSame(['error' => 'Trop de demandes de code, réessayez plus tard'], self::json($blocked));
        self::assertNotSame('', $blocked->getHeaderLine('Retry-After'));
        self::assertCount($sent, $this->mailer->sent);

        // Quota IP : 10 renvois/heure tous comptes confondus.
        self::$pdo->exec('DELETE FROM rate_limits');
        $this->clientIp = '198.51.100.30';
        $this->signUp(['email' => 'bob@example.org', 'emailConfirm' => 'bob@example.org', 'displayName' => 'Bob']);
        for ($i = 1; $i <= 10; $i++) {
            self::assertSame(200, $this->request('POST', '/api/auth/resend', ['email' => 'x' . $i . '@example.org'])->getStatusCode());
        }
        $sent = \count($this->mailer->sent);
        self::assertSame(429, $this->request('POST', '/api/auth/resend', ['email' => 'bob@example.org'])->getStatusCode());
        self::assertCount($sent, $this->mailer->sent);
    }

    #[TestDox('UC-CPT-01-F21 — ANOMALIE AN1 (pré-détournement) : l’activation par le titulaire de la boîte garde le mot de passe choisi par l’inscrivant, qui se connecte ensuite')]
    public function testF21ActivationKeepsTheRegistrantsPassword(): void
    {
        // Comportement ACTUEL figé (voir « Anomalies constatées », AN1) : un tiers
        // inscrit l'adresse de la victime avec SON mot de passe…
        $this->clientIp = '198.51.100.66';
        self::assertSame(201, $this->signUp(['password' => 'mot-de-passe-du-tiers'])->getStatusCode());

        // … la victime (autre navigateur, autre IP) active le compte avec le code
        // reçu dans SA boîte : l'activation n'exige ni ne redéfinit aucun mot de passe.
        $this->clientIp = '203.0.113.10';
        $this->cookieSid = null;
        self::assertSame(200, $this->activate('ada@example.org', $this->lastCode())->getStatusCode());

        // Le tiers se connecte au compte désormais vérifié avec son propre mot de passe.
        $this->clientIp = '198.51.100.66';
        $this->cookieSid = null;
        $login = $this->login('ada@example.org', 'mot-de-passe-du-tiers');
        self::assertSame(200, $login->getStatusCode(), 'anomalie AN1 : l’inscrivant garde l’accès');
        self::assertSame('ada@example.org', self::json($login)['user']['email']);
    }

    #[TestDox('UC-CPT-01-F22 — ANOMALIE AN3 : un compte jamais activé est conservé ; l’inscrivant ne peut pas le supprimer, seul le titulaire de la boîte le peut')]
    public function testF22UnactivatedAccountIsNeverPurged(): void
    {
        self::assertSame(201, $this->signUp()->getStatusCode());
        // Code expiré depuis longtemps : rien ne purge la ligne (aucune tâche planifiée).
        self::$pdo->exec("UPDATE users SET verification_expires_at = '2000-01-01 00:00:00' WHERE email = 'ada@example.org'");

        // L'inscrivant n'obtient jamais de session (403) : DELETE /api/auth/account → 401.
        $this->cookieSid = null;
        self::assertSame(403, $this->login('ada@example.org', self::PASSWORD)->getStatusCode());
        self::assertNull($this->cookieSid);
        self::assertSame(401, $this->request('DELETE', '/api/auth/account')->getStatusCode());
        $row = self::userRow('ada@example.org');
        self::assertNull($row['email_verified_at']);
        self::assertNotNull($row['verification_code_hash'], 'empreinte de code expirée conservée');
        // L'adresse reste bloquée pour une nouvelle inscription.
        self::assertSame(409, $this->signUp(['displayName' => 'Titulaire'])->getStatusCode());

        // Seule issue : le titulaire de la boîte se fait renvoyer un code, active, puis supprime.
        $this->cookieSid = null;
        self::assertSame(200, $this->request('POST', '/api/auth/resend', ['email' => 'ada@example.org'])->getStatusCode());
        $activated = $this->activate('ada@example.org', $this->lastCode());
        self::assertSame(200, $activated->getStatusCode());
        $token = (string) self::json($activated)['csrfToken'];
        self::assertSame(204, $this->request('DELETE', '/api/auth/account', null, ['X-CSRF-Token' => $token])->getStatusCode());
        self::assertSame(0, self::countUsers());
    }

    #[TestDox('UC-CPT-01-F23 — A2 : un renvoi vers une adresse mal formée répond de façon générique sans entamer aucun quota')]
    public function testF23ResendToAMalformedAddressConsumesNoQuota(): void
    {
        $this->signUp();
        $sent = \count($this->mailer->sent);
        for ($i = 1; $i <= 11; $i++) {
            $response = $this->request('POST', '/api/auth/resend', ['email' => 'pas-un-email']);
            self::assertSame(200, $response->getStatusCode(), "renvoi invalide $i");
            self::assertSame('ok', self::json($response)['status']);
        }
        self::assertSame(0, (int) self::$pdo->query("SELECT COUNT(*) FROM rate_limits WHERE bucket LIKE 'resend:%'")->fetchColumn());
        self::assertCount($sent, $this->mailer->sent);

        // Le quota IP (10/h) est intact : un vrai renvoi passe et envoie un mail.
        self::assertSame(200, $this->request('POST', '/api/auth/resend', ['email' => 'ada@example.org'])->getStatusCode());
        self::assertCount($sent + 1, $this->mailer->sent);
    }

    #[TestDox('UC-CPT-01-F24 — ANOMALIE AN5 : un tiers épuise le quota de renvoi du compte et verrouille le code ; le titulaire ne peut plus activer avant la fenêtre suivante')]
    public function testF24ThirdPartyCanBlockTheActivation(): void
    {
        CptSupport::awayFromWindowBoundary(3600);
        $this->signUp(); // le titulaire s'inscrit depuis 203.0.113.10

        // Un tiers (autre réseau) connaît seulement l'adresse : 3 renvois (quota
        // du COMPTE, clé = email seul) puis 5 codes faux (verrou du code).
        $this->clientIp = '198.51.100.99';
        for ($i = 1; $i <= 3; $i++) {
            $this->cookieSid = null;
            self::assertSame(200, $this->request('POST', '/api/auth/resend', ['email' => 'ada@example.org'])->getStatusCode());
        }
        $latest = $this->lastCode(); // le dernier code, parti dans la boîte du titulaire
        for ($i = 1; $i <= 5; $i++) {
            self::assertSame(401, $this->activate('ada@example.org', self::wrongCode($latest, $i))->getStatusCode());
        }

        // Comportement ACTUEL figé (voir « Anomalies constatées », AN5) : le titulaire,
        // depuis son propre réseau, a le bon code mais il est verrouillé, et le renvoi
        // lui est refusé jusqu'à la fenêtre suivante (1 h).
        $this->clientIp = '203.0.113.10';
        $this->cookieSid = null;
        self::assertSame(401, $this->activate('ada@example.org', $latest)->getStatusCode(), 'code verrouillé');
        self::assertSame(429, $this->request('POST', '/api/auth/resend', ['email' => 'ada@example.org'])->getStatusCode(), 'quota du compte épuisé par le tiers');
        self::assertNull(self::userRow('ada@example.org')['email_verified_at']);
    }

    #[TestDox('UC-CPT-01-F25 — E9 : API sans base configurée → 503 « Service indisponible » sur register, activate et resend, rien n’est créé')]
    public function testF25DatabaseNotConfigured(): void
    {
        CptSupport::withoutDatabase(function (): void {
            foreach ([
                ['/api/auth/register', ['email' => 'ada@example.org', 'emailConfirm' => 'ada@example.org', 'password' => self::PASSWORD, 'displayName' => 'Ada']],
                ['/api/auth/activate', ['email' => 'ada@example.org', 'code' => '1234']],
                ['/api/auth/resend', ['email' => 'ada@example.org']],
            ] as [$path, $body]) {
                $this->cookieSid = null;
                $response = $this->request('POST', $path, $body);
                self::assertSame(503, $response->getStatusCode(), $path);
                self::assertSame(['error' => 'Service indisponible'], self::json($response));
            }
        });
        self::assertSame(0, self::countUsers());
        self::assertSame([], $this->mailer->sent);
    }
}
