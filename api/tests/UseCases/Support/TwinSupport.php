<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Support;

use Humanome\Bootstrap;
use Humanome\DbSessionHandler;
use Humanome\Tests\LlmFakeHttpClient;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * Utilitaires partagés du lot « Twin6 / Twin9 » (UC-APP-09, UC-APP-10,
 * UC-APP-11, UC-PRO-08, UC-ADM-05) — fiches sous docs/cas-utilisation/
 * apprenant/, promptologue/ et administration/.
 *
 * CONFIDENTIALITÉ (ADR-010) : les gabarits ci-dessous sont des FICTIONS
 * inventées pour les tests. Aucun gabarit Twin9 réel n'entre jamais dans le
 * dépôt (scripts/check-publiable.mjs). Tout l'amont (Anthropic, PayPal) passe
 * par le faux client HTTP (LlmRuntime::setHttpClient) : aucun appel réseau.
 */
final class TwinSupport
{
    /** Clé plateforme factice (jamais une vraie clé). */
    public const PLATFORM_KEY = 'sk-ant-fictive-plateforme';

    /** Clé maître libsodium factice (64 hex) pour KeyVault. */
    public const MASTER_KEY_HEX = 'bb11cc22dd33ee44ff5500661122334455667788990011aabbccddeeff001122';

    /**
     * Gabarit FICTIF porteur d'une phrase distinctive (>= 48 caractères
     * normalisés) : sa récitation par le modèle doit être expurgée.
     */
    public const GABARIT_TAG = "Consigne FICTIVE du lot twin : la loutre argentée range les galets turquoise au bord du lac gelé chaque soir.\nPôle {\$POLE_NUM} — journée : {\$TEXTE_JOURNEE}";

    /** Gabarit FICTIF qui consomme les fiches confidentielles injectées serveur. */
    public const GABARIT_GREFFIER = "Greffier FICTIF.\nFiche : {\$COMPETENCE_FICHE}\nPôle : {\$POLE_FICHES}\nCode {\$CODE} — extrait : {\$EXTRAIT}";

    /** Gabarit FICTIF de l'étage tribunal. */
    public const GABARIT_TRIBUNAL = "Arène FICTIVE : le héron cendré compte les roseaux penchés sous la pluie fine d'automne.\nPièces : {\$PIECES}";

    /** Fiche FICTIVE longue (sa récitation doit être expurgée elle aussi). */
    public const FICHE_SECRETE = 'FICHE FICTIVE 1.01 : le cartographe observe la manière dont la personne confronte deux sources contradictoires avant de conclure.';

    /** Poles/fiches FICTIFS pour FicheStore::store. */
    public static function fichesFictives(): array
    {
        return [
            ['num' => 1, 'header' => 'PRÉAMBULE FICTIF DU PÔLE 1', 'competences' => [
                ['code' => '1.01', 'fiche_md' => self::FICHE_SECRETE],
                ['code' => '1.02', 'fiche_md' => 'FICHE FICTIVE 1.02 : cadrage de l’intention.'],
            ]],
            ['num' => 2, 'header' => 'PRÉAMBULE FICTIF DU PÔLE 2', 'competences' => [
                ['code' => '2.01', 'fiche_md' => 'FICHE FICTIVE 2.01 : écoute.'],
            ]],
        ];
    }

    /** Référentiel FICTIF (structure non secrète servie par /meta). */
    public static function referentielFictif(): array
    {
        return [
            ['num' => 1, 'nom' => 'TÊTE — Penser & Comprendre', 'competences' => [
                ['code' => '1.01', 'nom' => 'Pensée critique'],
                ['code' => '1.02', 'nom' => 'Cadrage de l’intention'],
            ]],
            ['num' => 2, 'nom' => 'CŒUR — Relier & Naviguer', 'competences' => [
                ['code' => '2.01', 'nom' => 'Écoute active'],
            ]],
        ];
    }

    /** Réponse Messages API Anthropic factice (200). */
    public static function queueAnthropic(
        LlmFakeHttpClient $http,
        string $text,
        int $tokensIn = 100,
        int $tokensOut = 50,
        string $stopReason = 'end_turn',
        string $model = 'claude-sonnet-5',
    ): void {
        $http->queueResponse(['status' => 200, 'body' => json_encode([
            'id' => 'msg_twin_lot',
            'type' => 'message',
            'model' => $model,
            'content' => [['type' => 'text', 'text' => $text]],
            'usage' => ['input_tokens' => $tokensIn, 'output_tokens' => $tokensOut],
            'stop_reason' => $stopReason,
        ], JSON_THROW_ON_ERROR)]);
    }

    /** Jeton OAuth PayPal factice. */
    public static function queuePaypalToken(LlmFakeHttpClient $http): void
    {
        $http->queueResponse(['status' => 200, 'body' => json_encode([
            'access_token' => 'A21.twin-lot-access-token',
            'token_type' => 'Bearer',
            'expires_in' => 32400,
        ], JSON_THROW_ON_ERROR)]);
    }

    /** Ordre PayPal créé (201) avec son lien d'approbation. */
    public static function queuePaypalOrderCreated(LlmFakeHttpClient $http, string $orderId): void
    {
        $http->queueResponse(['status' => 201, 'body' => json_encode([
            'id' => $orderId,
            'status' => 'CREATED',
            'links' => [
                ['href' => 'https://api-m.sandbox.paypal.com/v2/checkout/orders/' . $orderId, 'rel' => 'self'],
                ['href' => 'https://www.sandbox.paypal.com/checkoutnow?token=' . $orderId, 'rel' => 'approve'],
            ],
        ], JSON_THROW_ON_ERROR)]);
    }

    /** Corps d'un ordre capturé (COMPLETED) — montant et identifiant de capture. */
    public static function paypalCompletedBody(string $orderId, string $amount, string $captureId): array
    {
        return [
            'id' => $orderId,
            'status' => 'COMPLETED',
            'purchase_units' => [[
                'payments' => ['captures' => [[
                    'id' => $captureId,
                    'status' => 'COMPLETED',
                    'amount' => ['currency_code' => 'USD', 'value' => $amount],
                ]]],
            ]],
        ];
    }

    /** Capture réussie (201). */
    public static function queuePaypalCaptured(LlmFakeHttpClient $http, string $orderId, string $amount, string $captureId): void
    {
        $http->queueResponse([
            'status' => 201,
            'body' => json_encode(self::paypalCompletedBody($orderId, $amount, $captureId), JSON_THROW_ON_ERROR),
        ]);
    }

    /** Erreur PayPal typée (422 + details[0].issue). */
    public static function queuePaypalIssue(LlmFakeHttpClient $http, string $issue, int $status = 422): void
    {
        $http->queueResponse(['status' => $status, 'body' => json_encode([
            'name' => 'UNPROCESSABLE_ENTITY',
            'details' => [['issue' => $issue]],
        ], JSON_THROW_ON_ERROR)]);
    }

    /** Remboursement PayPal (201 par défaut). */
    public static function queuePaypalRefund(LlmFakeHttpClient $http, string $refundId, string $status = 'COMPLETED'): void
    {
        $http->queueResponse(['status' => 201, 'body' => json_encode([
            'id' => $refundId,
            'status' => $status,
        ], JSON_THROW_ON_ERROR)]);
    }

    /**
     * Sature un seau de limitation pour la fenêtre courante ET la suivante
     * (aucun faux négatif au changement de minute).
     */
    public static function saturateRateLimit(PDO $pdo, string $bucket, int $counter, int $window = 60): void
    {
        $start = intdiv(time(), $window) * $window;
        $stmt = $pdo->prepare(
            'INSERT INTO rate_limits (bucket, window_start, counter) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE counter = VALUES(counter)'
        );
        foreach ([$start, $start + $window] as $w) {
            $stmt->execute([$bucket, $w, $counter]);
        }
    }

    /**
     * Requête au corps BRUT (JSON non-objet, par ex.) jouée comme par
     * AuthTestBase::request() : cookie de session + jeton CSRF. Renvoie la
     * réponse ; la session éventuellement ouverte est refermée proprement.
     */
    public static function rawRequest(string $method, string $path, string $raw, ?string $sid, ?string $csrf, string $ip = '203.0.113.10'): ResponseInterface
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
        if ($sid !== null) {
            $_COOKIE[DbSessionHandler::SESSION_NAME] = $sid;
            session_id($sid);
        } else {
            unset($_COOKIE[DbSessionHandler::SESSION_NAME]);
            session_id('');
        }
        $_SERVER['REMOTE_ADDR'] = $ip;
        $request = (new ServerRequestFactory())
            ->createServerRequest($method, $path, ['REMOTE_ADDR' => $ip])
            ->withHeader('Content-Type', 'application/json');
        if ($csrf !== null) {
            $request = $request->withHeader('X-CSRF-Token', $csrf);
        }
        $request->getBody()->write($raw);
        $response = Bootstrap::createApp()->handle($request);
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        return $response;
    }
}
