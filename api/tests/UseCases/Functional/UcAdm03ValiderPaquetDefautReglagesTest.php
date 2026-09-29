<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Env;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\AdminTestCase;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\ProSupport;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-ADM-03 — Valider le paquet par défaut et les réglages : tests
 * FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/administration/UC-ADM-03-valider-paquet-defaut-reglages.md
 *
 * L'administrateur est un vrai navigateur simulé (session + CSRF, API de
 * SESSION admin — routes/admin.php). La proposition du promptologue est
 * posée par la route réelle (UC-PRO-04) ; l'effet de la validation est
 * observé par l'API publique GET /api/prompt-packages/default (la désignation
 * servie à tout client ; l'assistant apprenant ne l'exploite pas encore,
 * UC-APP-02 A-01). La route technique à jeton POST /api/admin/default-package
 * relève d'UC-SYS-02 (UC-SYS-02-F04) et n'est pas rejouée ici.
 */
final class UcAdm03ValiderPaquetDefautReglagesTest extends AdminTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $admin;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $pom;

    protected function setUp(): void
    {
        parent::setUp();
        ProSupport::publish(self::$pdo);                              // aurora-demo 1.0.0
        ProSupport::publish(self::$pdo, ProSupport::packageDocV2());  // aurora-demo 2.0.0 (dernière)
        $this->admin = $this->registerAdmin();
        $this->pom = $this->registerAs('pom@example.org', 'Pom', ['promptologue']);
    }

    private function act(?array $user, string $method, string $path, ?array $body = null, bool $csrf = true, array $headers = []): ResponseInterface
    {
        $this->cookieSid = $user['sid'] ?? null;
        if ($user !== null && $csrf && $method !== 'GET') {
            $headers['X-CSRF-Token'] = $user['csrf'];
        }

        return $this->request($method, '/api' . $path, $body, $headers, ProSupport::webApp());
    }

    private function validate(array $body, ?array $user = null, bool $csrf = true): ResponseInterface
    {
        return $this->act($user ?? $this->admin, 'POST', '/admin/settings/default-package', $body, $csrf);
    }

    private function servedDefault(): array
    {
        return self::json($this->act(null, 'GET', '/prompt-packages/default'));
    }

    #[TestDox('UC-ADM-03-F01 — nominal : l’admin voit la proposition en attente, la valide ; le défaut servi aux apprenants change, audit écrit')]
    public function testF01AdminValidatesThePendingProposal(): void
    {
        self::assertSame(200, $this->act($this->pom, 'POST', '/prompt-packages/aurora-demo/1.0.0/propose-default')->getStatusCode());

        $before = self::json($this->act($this->admin, 'GET', '/admin/settings'))['defaultPackage'];
        self::assertNull($before['stored']);
        self::assertSame(['aurora-demo', '1.0.0', $this->pom['id']], [$before['proposal']['id'], $before['proposal']['version'], $before['proposal']['proposedBy']]);
        self::assertSame(['id' => 'aurora-demo', 'version' => '2.0.0'], $before['effective']);

        $response = $this->validate(['id' => ' aurora-demo ', 'version' => '1.0.0']);

        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(['id' => 'aurora-demo', 'version' => '1.0.0', 'status' => 'default'], self::json($response));
        $after = self::json($this->act($this->admin, 'GET', '/admin/settings'))['defaultPackage'];
        self::assertSame(['aurora-demo', '1.0.0'], [$after['stored']['id'], $after['stored']['version']]);
        self::assertArrayHasKey('validatedAt', $after['stored']);
        self::assertNull($after['proposal'], 'proposition consommée');
        self::assertSame(['id' => 'aurora-demo', 'version' => '1.0.0'], $after['effective']);
        self::assertSame(['id' => 'aurora-demo', 'version' => '1.0.0'], $this->servedDefault());

        $audit = self::lastAudit('default_package_set');
        self::assertSame($this->admin['id'], $audit['userId']);
        // Colonne JSON MySQL (audit_events.details) : l'ordre des clés n'est pas conservé.
        self::assertEquals(['id' => 'aurora-demo', 'version' => '1.0.0'], $audit['details']);
    }

    #[TestDox('UC-ADM-03-F02 — A1 : valider une autre version que la proposition laisse la proposition en attente')]
    public function testF02ValidatingAnotherVersionKeepsTheProposal(): void
    {
        self::assertSame(200, $this->act($this->pom, 'POST', '/prompt-packages/aurora-demo/1.0.0/propose-default')->getStatusCode());

        self::assertSame(200, $this->validate(['id' => 'aurora-demo', 'version' => '2.0.0'])->getStatusCode());

        $snapshot = self::json($this->act($this->admin, 'GET', '/admin/settings'))['defaultPackage'];
        self::assertSame('2.0.0', $snapshot['stored']['version']);
        self::assertSame('1.0.0', $snapshot['proposal']['version']);
    }

    #[TestDox('UC-ADM-03-F03 — A2 : un défaut validé sans proposition est figé : une publication ultérieure ne le déplace pas')]
    public function testF03ValidatedDefaultIsPinned(): void
    {
        self::assertSame(200, $this->validate(['id' => 'aurora-demo', 'version' => '1.0.0'])->getStatusCode());

        // Le promptologue publie 2.1.0 (UC-PRO-03).
        $created = $this->act($this->pom, 'POST', '/prompt-packages/drafts', ['fromId' => 'aurora-demo', 'fromVersion' => '2.0.0', 'version' => '2.1.0']);
        self::assertSame(200, $this->act($this->pom, 'POST', '/prompt-packages/drafts/' . self::json($created)['draftId'] . '/publish', ['changelog' => 'Nouvelle version'])->getStatusCode());

        self::assertSame(['id' => 'aurora-demo', 'version' => '1.0.0'], $this->servedDefault());
    }

    #[TestDox('UC-ADM-03-F04 — A3 : consulter l’état du worker et la configuration serveur, sans aucune valeur secrète')]
    public function testF04WorkerAndConfigSnapshotWithoutSecrets(): void
    {
        TestDb::setEnv('MIGRATE_TOKEN', 'jeton-deploiement-tres-secret');
        // Précondition : un run de masse actif et un terminé, cinq jobs de statuts variés (ADR-005).
        $etab = ProSupport::user(self::$pdo, 'Lycée', ['etablissement']);
        $eleve = ProSupport::user(self::$pdo, 'Élève', ['apprenant']);
        self::$pdo->prepare('INSERT INTO cohortes (etablissement_id, nom, code_invitation) VALUES (?, ?, ?)')->execute([$etab, 'Terminale', 'ABCDEFGH23']);
        $cohorte = (int) self::$pdo->lastInsertId();
        $insertRun = self::$pdo->prepare(
            'INSERT INTO mass_runs (etablissement_id, cohorte_id, prompt_package_slug, prompt_package_semver, referentiel_id, referentiel_semver, status)
             VALUES (?, ?, "aurora-demo", "1.0.0", "respire", "7.0.0", ?)'
        );
        $insertRun->execute([$etab, $cohorte, 'active']);
        $run = (int) self::$pdo->lastInsertId();
        $insertRun->execute([$etab, $cohorte, 'done']);
        $insertJob = self::$pdo->prepare('INSERT INTO mass_jobs (run_id, user_id, day_date, status, updated_at) VALUES (?, ?, ?, ?, ?)');
        foreach ([['2026-01-05', 'queued'], ['2026-01-06', 'running'], ['2026-01-07', 'done'], ['2026-01-08', 'failed'], ['2026-01-09', 'queued']] as $i => [$day, $status]) {
            $insertJob->execute([$run, $eleve, $day, $status, '2026-07-0' . ($i + 1) . ' 10:00:00']);
        }

        $response = $this->act($this->admin, 'GET', '/admin/settings');

        self::assertSame(200, $response->getStatusCode());
        $snapshot = self::json($response);
        self::assertSame(['defaultPackage', 'demo', 'worker', 'config'], array_keys($snapshot));
        // A3 : en file = en attente + en cours ; runs actifs ; MAX(updated_at).
        self::assertSame(3, $snapshot['worker']['jobsInQueue']);
        self::assertSame(['queued' => 2, 'running' => 1, 'done' => 1, 'failed' => 1, 'budget_exceeded' => 0, 'cancelled' => 0], $snapshot['worker']['byStatus']);
        self::assertSame(1, $snapshot['worker']['activeRuns']);
        self::assertSame('2026-07-05T10:00:00', $snapshot['worker']['lastActivity']);
        self::assertTrue($snapshot['config']['secrets']['MIGRATE_TOKEN']['configured']);
        self::assertTrue($snapshot['config']['database']['DB_PASSWORD']['configured']);
        self::assertFalse($snapshot['demo']['editableInUi']);
        $raw = (string) $response->getBody();
        self::assertStringNotContainsString('jeton-deploiement-tres-secret', $raw);
        $dbPassword = Env::get('DB_PASSWORD');
        self::assertNotSame('', $dbPassword);
        self::assertStringNotContainsString($dbPassword, $raw, 'mot de passe MySQL jamais exposé');
    }

    #[TestDox('UC-ADM-03-F05 — E1, E2 : visiteur 401, promptologue 403 (lecture et validation, RequireRole), jeton CSRF absent ou faux 403')]
    public function testF05AdminSessionAndCsrfAreRequired(): void
    {
        $body = ['id' => 'aurora-demo', 'version' => '1.0.0'];
        $visitor = $this->act(null, 'GET', '/admin/settings');
        self::assertSame(401, $visitor->getStatusCode());
        self::assertSame(['error' => 'Authentification requise'], self::json($visitor));
        $visitorPost = $this->act(null, 'POST', '/admin/settings/default-package', $body);
        self::assertSame(401, $visitorPost->getStatusCode());
        self::assertSame(['error' => 'Authentification requise'], self::json($visitorPost));

        $forbidden = $this->act($this->pom, 'GET', '/admin/settings');
        self::assertSame(403, $forbidden->getStatusCode());
        self::assertSame(['error' => 'Rôle insuffisant'], self::json($forbidden));
        $forbiddenPost = $this->validate($body, $this->pom);
        self::assertSame(403, $forbiddenPost->getStatusCode());
        self::assertSame(['error' => 'Rôle insuffisant'], self::json($forbiddenPost), 'refus de rôle, pas du CSRF');

        $noCsrf = $this->validate($body, $this->admin, false);
        self::assertSame(403, $noCsrf->getStatusCode());
        self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($noCsrf));
        $forged = $this->act($this->admin, 'POST', '/admin/settings/default-package', $body, false, ['X-CSRF-Token' => 'faux']);
        self::assertSame(403, $forged->getStatusCode());
        self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($forged), 'jeton présent mais faux');

        self::assertNull((new SettingsRepository(self::$pdo))->get(SettingsRepository::DEFAULT_PACKAGE));
    }

    #[TestDox('UC-ADM-03-F06 — E3 : id ou version manquant, vide ou non textuel, corps absent ou non JSON → 422')]
    public function testF06IdAndVersionAreRequired(): void
    {
        foreach ([['id' => 'aurora-demo'], ['version' => '1.0.0'], ['id' => '  ', 'version' => '1.0.0'], ['id' => 'aurora-demo', 'version' => 100], []] as $body) {
            $response = $this->validate($body);
            self::assertSame(422, $response->getStatusCode(), json_encode($body));
            self::assertSame(['error' => 'Champs requis : id et version'], self::json($response));
        }
        // Corps non JSON, scalaire ou vide : même 422 (pas de 400 sur cette route).
        foreach (['pas du json', '"aurora-demo"', ''] as $raw) {
            $response = ProSupport::rawRequest($this->admin['sid'], $this->admin['csrf'], $this->clientIp, 'POST', '/api/admin/settings/default-package', $raw);
            self::assertSame(422, $response->getStatusCode(), '« ' . $raw . ' »');
            self::assertSame(['error' => 'Champs requis : id et version'], self::json($response));
        }
        self::assertNull((new SettingsRepository(self::$pdo))->get(SettingsRepository::DEFAULT_PACKAGE));
    }

    #[TestDox('UC-ADM-03-F07 — E4 : version inconnue, brouillon ou Golden privé → 404, défaut, proposition et journal inchangés')]
    public function testF07OnlyPublishedPublicVersions(): void
    {
        self::assertSame(201, $this->act($this->pom, 'POST', '/prompt-packages/drafts', ['fromId' => 'aurora-demo', 'fromVersion' => '2.0.0', 'version' => '2.1.0'])->getStatusCode());
        self::assertSame(201, $this->act($this->admin, 'POST', '/admin/golden', ProSupport::packageDoc(['id' => ProSupport::GOLDEN]))->getStatusCode());
        self::assertSame(200, $this->act($this->pom, 'POST', '/prompt-packages/aurora-demo/1.0.0/propose-default')->getStatusCode());

        foreach ([['aurora-demo', '9.9.9'], ['aurora-demo', '2.1.0'], [ProSupport::GOLDEN, '1.0.0']] as [$id, $version]) {
            $response = $this->validate(['id' => $id, 'version' => $version]);
            self::assertSame(404, $response->getStatusCode(), $id . '@' . $version);
            self::assertSame(['error' => 'Version publiée introuvable'], self::json($response));
        }
        self::assertSame(['id' => 'aurora-demo', 'version' => '2.0.0'], $this->servedDefault());
        self::assertNull(self::lastAudit('default_package_set'));
        $proposal = self::json($this->act($this->admin, 'GET', '/admin/settings'))['defaultPackage']['proposal'];
        self::assertSame(['aurora-demo', '1.0.0', $this->pom['id']], [$proposal['id'], $proposal['version'], $proposal['proposedBy']], 'proposition inchangée');
    }
}
