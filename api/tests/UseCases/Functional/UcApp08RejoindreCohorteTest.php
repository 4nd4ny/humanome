<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\CartographeTestCase;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-APP-08 — Rejoindre une cohorte, déposer son portfolio, quitter : tests
 * FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-08-rejoindre-cohorte.md
 *
 * L'établissement (rôle etablissement) crée sa cohorte par l'API réelle
 * (précondition, UC-ETA-01) ; l'apprenante Élise (session + CSRF) joue le
 * scénario sur les routes /api/cohortes…. La production des documents de
 * masse (UC-ETA-03, UC-SYS-01) est simulée en SQL à partir de la fixture de
 * schéma versionnée — ce cas n'en regarde que l'effet côté apprenant.
 */
final class UcApp08RejoindreCohorteTest extends CartographeTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $etab;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $elise;

    /** @var array{id: int, code: string} */
    private array $cohorte;

    protected function setUp(): void
    {
        parent::setUp();
        $this->etab = $this->registerAs('lycee@example.org', 'Lycée Astrolabe', ['etablissement']);
        $created = $this->as_($this->etab, 'POST', '/api/etablissement/cohortes', ['nom' => 'BTS SIO 2026']);
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $this->cohorte = ['id' => (int) self::json($created)['id'], 'code' => (string) self::json($created)['codeInvitation']];
        $this->elise = $this->registerAs('elise@example.org', 'Élise');
    }

    /** @param array<string, mixed>|null $body */
    private function join(?array $body = ['consentement' => true], ?string $code = null, ?array $who = null): ResponseInterface
    {
        return $this->as_($who ?? $this->elise, 'POST', '/api/cohortes/' . ($code ?? $this->cohorte['code']) . '/rejoindre', $body);
    }

    /** @param array<string, mixed> $body */
    private function deposit(array $body, ?int $cohorteId = null, ?array $who = null): ResponseInterface
    {
        return $this->as_($who ?? $this->elise, 'POST', '/api/cohortes/' . ($cohorteId ?? $this->cohorte['id']) . '/portfolio', $body);
    }

    /** @return array<string, mixed> portfolio local segmenté (UC-APP-01), tel que l'IHM l'envoie */
    private static function portfolio(string $titre = 'Journal Astrolabe', array $dates = ['2026-01-05', '2026-01-06']): array
    {
        return [
            'titre' => $titre,
            'texte' => implode("\n\n", array_map(static fn (string $d): string => 'Feuille du ' . $d, $dates)),
            'segments' => array_map(
                static fn (string $d): array => ['date' => $d, 'texte' => 'Feuille du ' . $d, 'debut' => 0, 'fin' => 10],
                $dates,
            ),
        ];
    }

    /** Production simulée d'un run (UC-ETA-03 / UC-SYS-01) : un job par jour et par statut. */
    private function produce(array $statusByDay): void
    {
        self::$pdo->prepare(
            "INSERT INTO mass_runs (etablissement_id, cohorte_id, prompt_package_slug, prompt_package_semver,
                referentiel_id, referentiel_semver) VALUES (?, ?, 'aurora-v3-reconstruit', '1.0.0', 'respire', '7.0.0')"
        )->execute([$this->etab['id'], $this->cohorte['id']]);
        $runId = (int) self::$pdo->lastInsertId();
        $portfolioId = self::$pdo->query('SELECT id FROM cohorte_portfolios WHERE user_id = ' . $this->elise['id'])->fetchColumn();
        $insert = self::$pdo->prepare(
            'INSERT INTO mass_jobs (run_id, user_id, portfolio_id, day_date, status, document) VALUES (?, ?, ?, ?, ?, ?)'
        );
        foreach ($statusByDay as $day => $status) {
            $document = self::jourDocument();
            $document['date'] = $day;
            $insert->execute([
                $runId, $this->elise['id'], $portfolioId === false ? null : (int) $portfolioId, $day, $status,
                $status === 'done' ? json_encode($document, JSON_THROW_ON_ERROR) : null,
            ]);
        }
    }

    private static function rows(string $table): int
    {
        return (int) self::$pdo->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn();
    }

    #[TestDox('UC-APP-08-F01 — nominal : rejoindre avec consentement, déposer son portfolio, l’établissement voit l’adhésion sans le texte')]
    public function testF01NominalJoinAndDeposit(): void
    {
        // 1-4. Jointure : consentement explicite dans le corps.
        $joined = $this->join();
        self::assertSame(201, $joined->getStatusCode(), (string) $joined->getBody());
        self::assertSame([
            'cohorteId' => $this->cohorte['id'],
            'nom' => 'BTS SIO 2026',
            'consentement' => "En rejoignant cette cohorte, vous acceptez que l'établissement voie les cartographies produites dans ce cadre.",
        ], self::json($joined));
        self::assertEquals(['cohorteId' => $this->cohorte['id']], self::lastAudit('cohorte_joined')['details']);

        // 5. « Mes cohortes » : consentement daté, établissement, pas encore de dépôt, jamais le code.
        $mes = $this->as_($this->elise, 'GET', '/api/cohortes');
        self::assertSame(200, $mes->getStatusCode());
        $item = self::json($mes)[0];
        self::assertSame(['BTS SIO 2026', 'Lycée Astrolabe', false, null], [$item['nom'], $item['etablissement'], $item['portfolioDepose'], $item['portfolio']]);
        self::assertStringNotContainsString($this->cohorte['code'], (string) $mes->getBody());

        // 6-8. Dépôt : segments journaliers ; seuls {date, texte} sont retenus.
        $deposited = $this->deposit(self::portfolio());
        self::assertSame(201, $deposited->getStatusCode(), (string) $deposited->getBody());
        self::assertSame(2, self::json($deposited)['segments']);
        self::assertIsInt(self::json($deposited)['id']);
        self::assertEquals(
            [['date' => '2026-01-05', 'texte' => 'Feuille du 2026-01-05'], ['date' => '2026-01-06', 'texte' => 'Feuille du 2026-01-06']],
            json_decode((string) self::$pdo->query('SELECT segments FROM cohorte_portfolios')->fetchColumn(), true),
        );
        // Comportement ACTUEL (fiche, « Anomalies constatées ») : le texte
        // intégral est aussi stocké, alors que seuls les segments sont traités.
        self::assertSame(self::portfolio()['texte'], self::$pdo->query('SELECT texte FROM cohorte_portfolios')->fetchColumn());
        $audit = self::lastAudit('cohorte_portfolio_deposited');
        self::assertEquals(['cohorteId' => $this->cohorte['id'], 'segments' => 2], $audit['details'], 'compteurs, jamais de texte (§6.5)');

        $item = self::json($this->as_($this->elise, 'GET', '/api/cohortes'))[0];
        self::assertTrue($item['portfolioDepose']);
        self::assertSame(['Journal Astrolabe', 2], [$item['portfolio']['titre'], $item['portfolio']['journees']]);

        // Effet côté établissement (UC-ETA-01) : adhésion datée, dépôt décrit, texte jamais exposé.
        $detail = $this->as_($this->etab, 'GET', '/api/etablissement/cohortes/' . $this->cohorte['id']);
        $membre = self::json($detail)['membres'][0];
        self::assertSame([$this->elise['id'], 'Élise', true], [$membre['userId'], $membre['displayName'], $membre['portfolioDepose']]);
        self::assertStringNotContainsString('Feuille du', (string) $detail->getBody());
    }

    #[TestDox('UC-APP-08-F02 — A1 : re-jointure → 200, consentement d’origine conservé, pas de second audit')]
    public function testF02RejoinIsIdempotent(): void
    {
        self::assertSame(201, $this->join()->getStatusCode());
        self::$pdo->exec("UPDATE cohorte_membres SET consent_at = '2026-01-01 08:00:00'");

        $again = $this->join();

        self::assertSame(200, $again->getStatusCode());
        self::assertSame($this->cohorte['id'], self::json($again)['cohorteId']);
        self::assertSame('2026-01-01T08:00:00', self::json($this->as_($this->elise, 'GET', '/api/cohortes'))[0]['joinedAt']);
        self::assertSame(1, (int) self::$pdo->query("SELECT COUNT(*) FROM audit_events WHERE type = 'cohorte_joined'")->fetchColumn());
    }

    #[TestDox('UC-APP-08-F03 — A2 : re-dépôt → remplacement complet du portfolio déposé (même dépôt), chaque dépôt journalisé')]
    public function testF03RedepositReplaces(): void
    {
        $this->join();
        $first = self::json($this->deposit(self::portfolio()));

        $second = $this->deposit(self::portfolio('Journal corrigé', ['2026-01-07']));

        self::assertSame(201, $second->getStatusCode());
        self::assertSame($first['id'], self::json($second)['id']);
        self::assertSame(1, self::rows('cohorte_portfolios'));
        $item = self::json($this->as_($this->elise, 'GET', '/api/cohortes'))[0];
        self::assertSame(['Journal corrigé', 1], [$item['portfolio']['titre'], $item['portfolio']['journees']]);
        // Chaque dépôt est journalisé (compteurs seulement).
        self::assertSame(2, (int) self::$pdo->query("SELECT COUNT(*) FROM audit_events WHERE type = 'cohorte_portfolio_deposited'")->fetchColumn());
        self::assertEquals(['cohorteId' => $this->cohorte['id'], 'segments' => 1], self::lastAudit('cohorte_portfolio_deposited')['details']);
    }

    #[TestDox('UC-APP-08-F04 — A3 : code saisi en minuscules → normalisé, adhésion créée')]
    public function testF04LowercaseCodeIsNormalized(): void
    {
        $response = $this->join(['consentement' => true], strtolower($this->cohorte['code']));

        self::assertSame(201, $response->getStatusCode());
        self::assertSame(1, self::rows('cohorte_membres'));
    }

    #[TestDox('UC-APP-08-F05 — A4 : quitter avant toute production → 204, consentement retiré, dépôt purgé, établissement aveugle')]
    public function testF05QuitBeforeProduction(): void
    {
        $this->join();
        $this->deposit(self::portfolio());

        $quit = $this->as_($this->elise, 'DELETE', '/api/cohortes/' . $this->cohorte['id'] . '/quitter');

        self::assertSame(204, $quit->getStatusCode());
        self::assertEquals(['cohorteId' => $this->cohorte['id']], self::lastAudit('cohorte_quit')['details']);
        self::assertSame([], self::json($this->as_($this->elise, 'GET', '/api/cohortes')));
        self::assertSame(0, self::rows('cohorte_portfolios'));
        self::assertSame([], self::json($this->as_($this->etab, 'GET', '/api/etablissement/cohortes/' . $this->cohorte['id']))['membres']);
        self::assertSame(404, $this->deposit(self::portfolio())->getStatusCode(), 'plus membre : plus de dépôt');

        // Revenir reste possible : nouveau consentement, nouvel audit.
        self::assertSame(201, $this->join()->getStatusCode());
        self::assertSame(2, (int) self::$pdo->query("SELECT COUNT(*) FROM audit_events WHERE type = 'cohorte_joined'")->fetchColumn());
    }

    #[TestDox('UC-APP-08-F06 — A4 : quitter après production → jobs en attente annulés, documents produits gardés par l’apprenant seul ; une nouvelle jointure les rouvre à l’établissement (figé)')]
    public function testF06QuitAfterProductionKeepsLearnerDocuments(): void
    {
        $this->join();
        $this->deposit(self::portfolio());
        $this->produce(['2026-01-05' => 'done', '2026-01-06' => 'queued']);
        self::assertSame(200, $this->as_($this->etab, 'GET', '/api/etablissement/membres/' . $this->elise['id'] . '/documents')->getStatusCode());

        self::assertSame(204, $this->as_($this->elise, 'DELETE', '/api/cohortes/' . $this->cohorte['id'] . '/quitter')->getStatusCode());

        self::assertSame(
            ['2026-01-05' => 'done', '2026-01-06' => 'cancelled'],
            self::$pdo->query('SELECT day_date, status FROM mass_jobs ORDER BY day_date')->fetchAll(\PDO::FETCH_KEY_PAIR),
        );
        self::assertSame(404, $this->as_($this->etab, 'GET', '/api/etablissement/membres/' . $this->elise['id'] . '/documents')->getStatusCode());
        $mine = self::json($this->as_($this->elise, 'GET', '/api/mes-documents-masse'))['documents'];
        self::assertSame(['2026-01-05'], array_column($mine, 'date'));

        // Comportement ACTUEL (fiche, A4 et Limites) : une nouvelle jointure rend
        // à l'établissement l'accès aux documents produits AVANT le départ — la
        // route ne contrôle que l'adhésion courante, sans condition de date.
        self::assertSame(201, $this->join()->getStatusCode());
        $again = $this->as_($this->etab, 'GET', '/api/etablissement/membres/' . $this->elise['id'] . '/documents');
        self::assertSame(200, $again->getStatusCode());
        self::assertSame(['2026-01-05'], array_column(self::json($again)['documents'], 'date'));
    }

    #[TestDox('UC-APP-08-F07 — A5 : l’apprenant récupère SES documents de masse terminés, avec cohorte et versions')]
    public function testF07LearnerRetrievesOwnMassDocuments(): void
    {
        $this->join();
        $this->deposit(self::portfolio());
        $this->produce(['2026-01-05' => 'done', '2026-01-06' => 'running']);
        $autre = $this->registerAs('autre@example.org', 'Autre');

        $response = $this->as_($this->elise, 'GET', '/api/mes-documents-masse');

        self::assertSame(200, $response->getStatusCode());
        $documents = self::json($response)['documents'];
        self::assertCount(1, $documents, 'seuls les jobs terminés');
        self::assertSame(
            ['jobId', 'runId', 'cohorteId', 'cohorte', 'date', 'promptPackage', 'referentiel', 'document'],
            array_keys($documents[0]),
        );
        self::assertSame([$this->cohorte['id'], 'BTS SIO 2026', '2026-01-05'], [$documents[0]['cohorteId'], $documents[0]['cohorte'], $documents[0]['date']]);
        self::assertSame(['id' => 'aurora-v3-reconstruit', 'version' => '1.0.0'], $documents[0]['promptPackage']);
        self::assertSame(['id' => 'respire', 'version' => '7.0.0'], $documents[0]['referentiel']);
        self::assertSame('cartographie-jour', $documents[0]['document']['kind']);
        self::assertSame(['documents' => []], self::json($this->as_($autre, 'GET', '/api/mes-documents-masse')));
    }

    #[TestDox('UC-APP-08-F08 — E1 : sans consentement explicite (absent, false, "oui", 1, "true") → 422 avec le texte, aucune adhésion')]
    public function testF08ConsentIsMandatory(): void
    {
        foreach ([[], ['consentement' => false], ['consentement' => 'oui'], ['consentement' => 1], ['consentement' => 'true']] as $i => $body) {
            $refused = $this->join($body);
            self::assertSame(422, $refused->getStatusCode(), 'cas #' . $i);
            self::assertSame('Consentement explicite requis', self::json($refused)['error']);
            self::assertStringContainsString('cartographies produites dans ce cadre', self::json($refused)['consentement']);
        }
        // Le consentement est contrôlé AVANT le code : même un code inconnu répond 422.
        self::assertSame(422, $this->join([], 'ZZZZZZZZZZ')->getStatusCode());
        self::assertSame(0, self::rows('cohorte_membres'));
        self::assertNull(self::lastAudit('cohorte_joined'));
    }

    #[TestDox('UC-APP-08-F09 — E2/E3 : code inconnu → 404 « Cohorte introuvable » ; code mal formé → 404 générique de routage')]
    public function testF09UnknownOrMalformedCode(): void
    {
        $unknown = $this->join(['consentement' => true], 'ZZZZZZZZZZ');
        self::assertSame(404, $unknown->getStatusCode());
        self::assertSame(['error' => 'Cohorte introuvable'], self::json($unknown));

        // Code de 9 caractères : aucune route ne correspond (Slim), réponse JSON
        // générique en anglais — la vue l'affiche telle quelle (fiche, Limites).
        $this->cookieSid = $this->elise['sid'];
        // Le middleware d'erreurs de Slim journalise l'exception de routage :
        // on la dirige hors de la sortie du test.
        $previousLog = ini_set('error_log', '/dev/null');
        try {
            $malformed = $this->request('POST', '/api/cohortes/ABCDEFGHJ/rejoindre', ['consentement' => true], [
                'X-CSRF-Token' => $this->elise['csrf'],
                'Accept' => 'application/json',
            ]);
        } finally {
            ini_set('error_log', $previousLog === false ? '' : $previousLog);
        }
        self::assertSame(404, $malformed->getStatusCode());
        self::assertSame('404 Not Found', self::json($malformed)['message']);
        self::assertSame(0, self::rows('cohorte_membres'));
    }

    #[TestDox('UC-APP-08-F10 — E4 : dépôt sans adhésion, dans une cohorte étrangère ou inconnue → 404, rien n’est stocké')]
    public function testF10DepositRequiresMembership(): void
    {
        self::assertSame(404, $this->deposit(self::portfolio())->getStatusCode(), 'pas encore membre');

        $autreEtab = $this->registerAs('autre-lycee@example.org', 'Autre lycée', ['etablissement']);
        $autre = (int) self::json($this->as_($autreEtab, 'POST', '/api/etablissement/cohortes', ['nom' => 'Autre']))['id'];
        $this->join();
        foreach ([$autre, $this->cohorte['id'] + 1000] as $cohorteId) {
            $response = $this->deposit(self::portfolio(), $cohorteId);
            self::assertSame(404, $response->getStatusCode());
            self::assertSame(['error' => 'Cohorte introuvable'], self::json($response));
        }
        self::assertSame(0, self::rows('cohorte_portfolios'));
    }

    #[TestDox('UC-APP-08-F11 — E5 : portfolio invalide (titre, texte, segments, dates absentes ou mal formées, doublons, 366 jours, 4 Mo — texte intégral compris) → 422')]
    public function testF11InvalidDepositIsRejected(): void
    {
        $this->join();
        $many = [];
        for ($d = 0; $d < 367; $d++) {
            $many[] = ['date' => date('Y-m-d', strtotime('2025-01-01 +' . $d . ' days')), 'texte' => 'x'];
        }
        $seg = [['date' => '2026-01-05', 'texte' => 'x']];
        $cases = [
            'titre' => ['titre' => '', 'segments' => $seg],
            'titre ' => ['titre' => str_repeat('a', 191), 'segments' => $seg],
            'texte' => ['titre' => 'T', 'texte' => ['pas', 'une chaîne'], 'segments' => $seg],
            'segments' => ['titre' => 'T'],
            'segments ' => ['titre' => 'T', 'segments' => []],
            'segments  ' => ['titre' => 'T', 'segments' => ['2026-01-05' => ['date' => '2026-01-05', 'texte' => 'x']]],
            'segments   ' => ['titre' => 'T', 'segments' => $many],
            'segments    ' => ['titre' => 'T', 'segments' => [['date' => '05/01/2026', 'texte' => 'x']]],
            'segments        ' => ['titre' => 'T', 'segments' => [['date' => '2026-01-05', 'texte' => 'x'], ['date' => null, 'texte' => 'feuille non datée']]],
            'segments     ' => ['titre' => 'T', 'segments' => [['date' => '2026-01-05', 'texte' => '   ']]],
            'segments      ' => ['titre' => 'T', 'segments' => [['date' => '2026-01-05', 'texte' => 'a'], ['date' => '2026-01-05', 'texte' => 'b']]],
            'segments       ' => ['titre' => 'T', 'segments' => [['date' => '2026-01-05', 'texte' => str_repeat('x', 4 * 1024 * 1024)]]],
        ];
        foreach ($cases as $field => $body) {
            $response = $this->deposit($body);
            self::assertSame(422, $response->getStatusCode(), 'cas ' . $field);
            self::assertArrayHasKey(trim($field), self::json($response)['fields'], 'cas ' . $field);
        }
        self::assertSame('date en double dans les segments : 2026-01-05', self::json($this->deposit($cases['segments      ']))['fields']['segments']);
        self::assertSame('Portfolio trop volumineux (4 Mo maximum)', self::json($this->deposit($cases['segments       ']))['fields']['segments']);

        // Anomalie 2 (fiche) : le texte intégral compte AUSSI dans le plafond.
        // Comme l'IHM envoie le texte ET ses tranches, ~2,2 Mo de portfolio
        // réel suffisent à dépasser les 4 Mo.
        $half = str_repeat('x', (int) (2.2 * 1024 * 1024));
        $doubled = $this->deposit(['titre' => 'T', 'texte' => $half, 'segments' => [['date' => '2026-01-05', 'texte' => $half]]]);
        self::assertSame(422, $doubled->getStatusCode());
        self::assertSame('Portfolio trop volumineux (4 Mo maximum)', self::json($doubled)['fields']['segments']);
        self::assertSame(0, self::rows('cohorte_portfolios'));
        self::assertNull(self::lastAudit('cohorte_portfolio_deposited'));
        // Les mêmes segments, sans le texte intégral, passent.
        self::assertSame(201, $this->deposit(['titre' => 'T', 'segments' => [['date' => '2026-01-05', 'texte' => $half]]])->getStatusCode());
    }

    #[TestDox('UC-APP-08-F12 — E6 : quitter une cohorte dont on n’est pas membre (ou inconnue) → 404')]
    public function testF12QuitWithoutMembership(): void
    {
        foreach ([$this->cohorte['id'], $this->cohorte['id'] + 1000] as $cohorteId) {
            $response = $this->as_($this->elise, 'DELETE', '/api/cohortes/' . $cohorteId . '/quitter');
            self::assertSame(404, $response->getStatusCode());
            self::assertSame(['error' => 'Cohorte introuvable'], self::json($response));
        }
        self::assertNull(self::lastAudit('cohorte_quit'));
    }

    #[TestDox('UC-APP-08-F13 — E7 : sans session → 401 ; sans jeton CSRF → 403 ; compte établissement → 403 (rôle apprenant requis)')]
    public function testF13AuthenticationCsrfAndRole(): void
    {
        $this->join();
        $routes = [
            ['GET', '/api/cohortes', null],
            ['POST', '/api/cohortes/' . $this->cohorte['code'] . '/rejoindre', ['consentement' => true]],
            ['POST', '/api/cohortes/' . $this->cohorte['id'] . '/portfolio', self::portfolio()],
            ['DELETE', '/api/cohortes/' . $this->cohorte['id'] . '/quitter', null],
            ['GET', '/api/mes-documents-masse', null],
        ];

        $this->cookieSid = null;
        foreach ($routes as [$method, $path, $body]) {
            self::assertSame(401, $this->request($method, $path, $body)->getStatusCode(), $method . ' ' . $path);
        }

        $this->cookieSid = $this->elise['sid'];
        foreach ($routes as [$method, $path, $body]) {
            if ($method === 'GET') {
                continue;
            }
            $response = $this->request($method, $path, $body);
            self::assertSame(403, $response->getStatusCode(), $method . ' ' . $path);
            self::assertSame('Jeton CSRF absent ou invalide', self::json($response)['error']);
        }

        foreach ($routes as [$method, $path, $body]) {
            self::assertSame(403, $this->as_($this->etab, $method, $path, $body)->getStatusCode(), 'établissement : ' . $method . ' ' . $path);
        }

        self::assertSame(1, self::rows('cohorte_membres'), 'Élise est toujours membre');
        self::assertSame(0, self::rows('cohorte_portfolios'));
    }

    #[TestDox('UC-APP-08-F14 — limite figée : une date au bon format mais inexistante (2026-02-30) est acceptée au dépôt')]
    public function testF14CalendarInvalidDateIsAccepted(): void
    {
        // Comportement ACTUEL (fiche, « Limites ») : contrôle par motif
        // AAAA-MM-JJ seulement ; l'éditeur de portfolio, lui, refuse ces dates.
        $this->join();

        $response = $this->deposit(['titre' => 'T', 'segments' => [['date' => '2026-02-30', 'texte' => 'x']]]);

        self::assertSame(201, $response->getStatusCode());
    }

    #[TestDox('UC-APP-08-F23 — anomalie 3 figée : l’établissement supprime la cohorte → les documents déjà produits pour l’apprenant disparaissent aussi')]
    public function testF23CohortDeletionWipesTheLearnerMassDocuments(): void
    {
        // Comportement ACTUEL (fiche, anomalie 3 ; UC-ETA-01) : mass_runs est en
        // CASCADE sur la cohorte, mass_jobs en CASCADE sur mass_runs.
        $this->join();
        $this->deposit(self::portfolio());
        $this->produce(['2026-01-05' => 'done']);
        self::assertCount(1, self::json($this->as_($this->elise, 'GET', '/api/mes-documents-masse'))['documents']);

        self::assertSame(204, $this->as_($this->etab, 'DELETE', '/api/etablissement/cohortes/' . $this->cohorte['id'])->getStatusCode());

        self::assertSame(['documents' => []], self::json($this->as_($this->elise, 'GET', '/api/mes-documents-masse')));
        self::assertSame(0, self::rows('mass_jobs'));
        self::assertSame([], self::json($this->as_($this->elise, 'GET', '/api/cohortes')));
    }
}
