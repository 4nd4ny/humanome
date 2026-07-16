<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * D5 — inscription durcie : activation par code à 4 chiffres. Login bloqué avant
 * activation, code faux ×5 verrouillé, expiration, renvoi (régénère + rouvre les
 * essais + rate-limit strict), backfill des comptes existants, anti-énumération.
 */
final class AuthActivationTest extends AuthTestBase
{
    public function testLoginBlockedBeforeActivation(): void
    {
        self::assertSame(201, $this->registerPending('pending@example.org')->getStatusCode());

        // Mot de passe BON mais compte non activé -> 403 explicite, pas de session.
        $login = $this->login('pending@example.org', self::PASSWORD);
        self::assertSame(403, $login->getStatusCode());
        $body = self::json($login);
        self::assertSame('email_not_verified', $body['code']);
        self::assertNull($this->cookieSid);

        // Après activation, le login nominal fonctionne.
        self::assertSame(200, $this->activate('pending@example.org', $this->lastCode())->getStatusCode());
        $this->cookieSid = null;
        self::assertSame(200, $this->login('pending@example.org', self::PASSWORD)->getStatusCode());
    }

    public function testWrongCodeFiveTimesLocksThenResendReopens(): void
    {
        $this->registerPending('brute@example.org');
        $goodCode = $this->lastCode();

        // 5 codes faux -> 5 × 401 ; au 6e essai le BON code est refusé (verrou).
        for ($i = 0; $i < 5; $i++) {
            $wrong = str_pad((string) (($goodCode + 1 + $i) % 10000), 4, '0', STR_PAD_LEFT);
            self::assertSame(401, $this->activate('brute@example.org', $wrong)->getStatusCode(), "essai $i");
        }
        self::assertSame(401, $this->activate('brute@example.org', $goodCode)->getStatusCode(), 'verrou à 5 essais');

        // Un renvoi régénère le code ET remet le compteur à 0 : le nouveau code passe.
        self::assertSame(200, $this->request('POST', '/api/auth/resend', ['email' => 'brute@example.org'])->getStatusCode());
        $newCode = $this->lastCode();
        self::assertNotSame($goodCode, $newCode);
        self::assertSame(200, $this->activate('brute@example.org', $newCode)->getStatusCode());
    }

    public function testExpiredCodeIsRejected(): void
    {
        $this->registerPending('expired@example.org');
        $code = $this->lastCode();

        // Expiration forcée dans le passé.
        self::$pdo->prepare(
            "UPDATE users SET verification_expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE email = ?"
        )->execute(['expired@example.org']);

        self::assertSame(401, $this->activate('expired@example.org', $code)->getStatusCode());
        // Toujours non activé.
        $stmt = self::$pdo->prepare('SELECT email_verified_at FROM users WHERE email = ?');
        $stmt->execute(['expired@example.org']);
        self::assertNull($stmt->fetchColumn());
    }

    public function testResendRegeneratesCodeAndRateLimits(): void
    {
        $this->registerPending('resend@example.org');
        $code1 = $this->lastCode();

        self::assertSame(200, $this->request('POST', '/api/auth/resend', ['email' => 'resend@example.org'])->getStatusCode());
        $code2 = $this->lastCode();
        self::assertNotSame($code1, $code2);
        // L'ancien code ne marche plus (régénéré) ; le nouveau, oui.
        self::assertSame(401, $this->activate('resend@example.org', $code1)->getStatusCode());

        // Rate-limit strict par compte : 3/heure. Le 1er renvoi (ci-dessus) + 2
        // autres = 3 ; le 4e est refusé (429).
        self::assertSame(200, $this->request('POST', '/api/auth/resend', ['email' => 'resend@example.org'])->getStatusCode());
        self::assertSame(200, $this->request('POST', '/api/auth/resend', ['email' => 'resend@example.org'])->getStatusCode());
        self::assertSame(429, $this->request('POST', '/api/auth/resend', ['email' => 'resend@example.org'])->getStatusCode());
    }

    public function testActivationIsAntiEnumeration(): void
    {
        // Compte inconnu -> même 401 générique qu'un code faux.
        $unknown = $this->activate('nobody@example.org', '1234');
        self::assertSame(401, $unknown->getStatusCode());
        self::assertSame('Code invalide ou expiré', self::json($unknown)['error']);

        // Renvoi pour un compte inconnu -> réponse générique « ok » (pas d'oracle).
        $resend = $this->request('POST', '/api/auth/resend', ['email' => 'nobody@example.org']);
        self::assertSame(200, $resend->getStatusCode());
        self::assertSame('ok', self::json($resend)['status']);

        // Un compte DÉJÀ activé : même réponse générique 401 (pas d'oracle « déjà activé »).
        $this->register('already@example.org'); // register + activate
        $again = $this->activate('already@example.org', '1234');
        self::assertSame(401, $again->getStatusCode());
        self::assertSame('Code invalide ou expiré', self::json($again)['error']);
    }

    public function testBackfilledExistingAccountLogsInNormally(): void
    {
        // Simule un compte « pré-D5 » : inséré sans email_verified_at (NULL), donc
        // login bloqué, puis backfill (email_verified_at = created_at) -> login OK.
        self::$pdo->prepare(
            'INSERT INTO users (email, password_hash, display_name, created_at)
             VALUES (?, ?, ?, DATE_SUB(NOW(), INTERVAL 10 DAY))'
        )->execute(['legacy@example.org', \Humanome\Auth\Users::hashPassword(self::PASSWORD), 'Legacy']);
        $id = (int) self::$pdo->lastInsertId();
        \Humanome\Auth\Users::assignRole(self::$pdo, $id, 'apprenant');

        self::assertSame(403, $this->login('legacy@example.org', self::PASSWORD)->getStatusCode());

        // Backfill (l'instruction de la migration 018) — scopé aux anciennes
        // lignes pour ne pas activer les comptes d'autres tests créés « now ».
        self::$pdo->exec(
            'UPDATE users SET email_verified_at = created_at
              WHERE email_verified_at IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL 5 DAY)'
        );
        $this->cookieSid = null;
        self::assertSame(200, $this->login('legacy@example.org', self::PASSWORD)->getStatusCode());
    }
}
