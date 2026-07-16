<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Llm\Pricing;
use Psr\Http\Message\ResponseInterface;

/**
 * D9 — assistant tuteur (proxy Haiku dédié). Garde-fous réutilisés (PoW, quota
 * IP, budget propre), prompt système CÔTÉ SERVEUR jamais renvoyé, clé jamais
 * exposée, aucune conversation stockée (compteurs séparés du budget démo).
 */
final class TuteurTest extends LlmTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('DELETE FROM tuteur_usage_daily');
        TestDb::setEnv('TUTEUR_BUDGET', '1');
        TestDb::setEnv('TUTEUR_MODEL', 'claude-haiku-4-5-20251001');
    }

    /** @param array<string, mixed> $extra */
    private function ask(string $question, array $extra = []): ResponseInterface
    {
        $c = $this->fetchChallenge();
        return $this->request('POST', '/api/tuteur', array_merge([
            'question' => $question,
            'challenge' => $c['challenge'],
            'nonce' => $this->solve($c['challenge'], $c['difficultyBits']),
        ], $extra));
    }

    public function testAnswersAndNeverLeaksSystemPromptOrKey(): void
    {
        $response = $this->ask('Comment cartographier mon texte ?', ['rubrique' => 'Accueil']);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);
        self::assertArrayHasKey('text', $body);
        self::assertArrayHasKey('usage', $body);
        self::assertArrayHasKey('model', $body);
        // La réponse ne porte NI le prompt système (digest), NI la clé API.
        $raw = (string) $response->getBody();
        self::assertStringNotContainsString('DIGEST DE LA DOCUMENTATION', $raw);
        self::assertStringNotContainsString('assistant tuteur de humanome.xyz', $raw);
        self::assertStringNotContainsString(self::API_KEY, $raw);
        self::assertArrayNotHasKey('system', $body);
    }

    public function testRequiresProofOfWork(): void
    {
        $response = $this->request('POST', '/api/tuteur', ['question' => 'Bonjour']);
        self::assertSame(400, $response->getStatusCode());
        self::assertSame('pow_required', self::json($response)['code']);
    }

    public function testValidatesQuestionAndHoneypot(): void
    {
        // Question vide -> 422 (le PoW n'est même pas nécessaire pour la validation ? il l'est APRÈS).
        $empty = $this->ask('   ');
        self::assertSame(422, $empty->getStatusCode());
        // Honeypot rempli -> 400 banalisé.
        $c = $this->fetchChallenge();
        $trap = $this->request('POST', '/api/tuteur', [
            'question' => 'Bonjour', 'website' => 'http://spam',
            'challenge' => $c['challenge'], 'nonce' => $this->solve($c['challenge'], $c['difficultyBits']),
        ]);
        self::assertSame(400, $trap->getStatusCode());
    }

    public function testDedicatedDailyBudgetDistinctFromDemo(): void
    {
        // Budget tuteur épuisé -> 503, SANS toucher au budget démo (table séparée).
        self::$pdo->prepare(
            'INSERT INTO tuteur_usage_daily (usage_date, requests, input_tokens, output_tokens, estimated_cost_usd)
             VALUES (?, 1, 100, 100, 2.0)'
        )->execute([gmdate('Y-m-d')]);

        $response = $this->ask('Une question ?');
        self::assertSame(503, $response->getStatusCode());
        self::assertStringContainsString('budget du jour', self::json($response)['error']);

        // Le compteur de la démo publique n'a pas bougé.
        self::assertSame(0, (int) self::$pdo->query('SELECT COALESCE(SUM(requests),0) FROM llm_usage_daily')->fetchColumn());
    }

    public function testCountsOnItsOwnBudgetNotTheDemo(): void
    {
        $ok = $this->ask('Par où commencer ?');
        self::assertSame(200, $ok->getStatusCode(), (string) $ok->getBody());
        // Un appel réussi incrémente le compteur TUTEUR, pas celui de la démo.
        self::assertSame(1, (int) self::$pdo->query('SELECT requests FROM tuteur_usage_daily')->fetchColumn());
        self::assertSame(0, (int) self::$pdo->query('SELECT COALESCE(SUM(requests),0) FROM llm_usage_daily')->fetchColumn());
    }

    public function testConfiguredHaikuModelHasNonZeroPriceSoTheDollarCapCanTrip(): void
    {
        // Le plafond dollar (TUTEUR_BUDGET) ne peut freiner que si le modèle
        // configuré est réellement tarifé. Avec MockProvider (model='mock',
        // coût 0), les autres tests n'exercent JAMAIS la branche dollar : ce
        // garde-fou verrouille la tarification du vrai modèle Haiku, pour qu'un
        // renommage futur du modèle ou du préfixe de prix ne neutralise pas le
        // plafond de 1 $/jour en silence.
        $model = getenv('TUTEUR_MODEL') ?: 'claude-haiku-4-5-20251001';
        self::assertGreaterThan(0.0, Pricing::estimateUsd($model, 1000, 1000));
    }

    public function testWorksForBothVisitorAndLoggedInSession(): void
    {
        // Visiteur (aucune session) : OK.
        self::assertSame(200, $this->ask('Que puis-je faire sans compte ?')->getStatusCode());

        // Connecté (register() = inscription + activation, session ouverte) : le
        // rôle vient de la SESSION (un champ role client n'a aucun pouvoir).
        self::assertSame(200, $this->register('appr@example.org', self::PASSWORD, 'Appr')->getStatusCode());
        $loggedIn = $this->ask('Et avec mon compte ?', ['role' => 'admin']); // champ pirate ignoré
        self::assertSame(200, $loggedIn->getStatusCode(), (string) $loggedIn->getBody());
    }
}
