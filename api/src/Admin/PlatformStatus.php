<?php

declare(strict_types=1);

namespace Humanome\Admin;

use Humanome\Auth\Audit;
use Humanome\Llm\DemoConfig;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Packages\SettingsRepository;
use PDO;

/**
 * Admin platform-settings section (P12.1, cahier §3.8/§4.10): a read-mostly
 * snapshot for the "Réglages" admin panel, plus the one write it owns — the
 * default prompt-package validation (P10: promptologue proposes, admin
 * validates).
 *
 * What it exposes (all effective values, nothing secret):
 *   - defaultPackage: the stored default + the pending promptologue proposal +
 *     the effective resolution (fallback = latest published, non-private);
 *   - demo: the effective public-demo caps (config/demo.php + DEMO_* env) —
 *     DISPLAYED only; in v1 the demo is tuned by env (documented), so the UI
 *     shows values but does not edit them;
 *   - worker: the mass-cartography queue state derived from mass_jobs (jobs in
 *     queue, per-status counts, last activity as a "dernier tick" proxy —
 *     there is no tick log table, ADR-005 ticks only return counters);
 *   - config: the versionable server config (config/app.php), secrets shown as
 *     "configured" booleans only.
 */
final class PlatformStatus
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Full settings snapshot for GET /api/admin/settings.
     *
     * @return array<string, mixed>
     */
    public function snapshot(): array
    {
        return [
            'defaultPackage' => $this->defaultPackage(),
            'demo' => $this->demo(),
            'worker' => $this->worker(),
            'config' => $this->config(),
        ];
    }

    /**
     * Validate (set) the default prompt-package proposed to learners. The
     * (id, version) MUST be a published, NON-PRIVATE version (isPublished
     * already excludes private packages) — a Golden Prompt can never become
     * the platform default. Consumes a matching pending proposal.
     *
     * @return array{id: string, version: string, status: 'default'}
     */
    public function setDefaultPackage(int $adminId, string $id, string $version): array
    {
        if (!(new PromptPackageRepository($this->pdo))->isPublished($id, $version)) {
            throw new AdminException('Version publiée introuvable', 404);
        }

        $settings = new SettingsRepository($this->pdo);
        $settings->set(SettingsRepository::DEFAULT_PACKAGE, [
            'id' => $id,
            'version' => $version,
            'validatedAt' => date('c'),
        ]);
        $proposal = $settings->get(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL);
        if (\is_array($proposal) && ($proposal['id'] ?? null) === $id && ($proposal['version'] ?? null) === $version) {
            $settings->delete(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL);
        }

        Audit::record($this->pdo, $adminId, 'default_package_set', ['id' => $id, 'version' => $version]);

        return ['id' => $id, 'version' => $version, 'status' => 'default'];
    }

    /** @return array<string, mixed> */
    private function defaultPackage(): array
    {
        $settings = new SettingsRepository($this->pdo);
        $packages = new PromptPackageRepository($this->pdo);

        $stored = $settings->get(SettingsRepository::DEFAULT_PACKAGE);
        $proposal = $settings->get(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL);

        $effective = \is_array($stored) && \is_string($stored['id'] ?? null) && \is_string($stored['version'] ?? null)
            ? ['id' => $stored['id'], 'version' => $stored['version']]
            : $packages->latestPublishedAnyPackage();

        return [
            'stored' => \is_array($stored) ? $stored : null,
            'proposal' => \is_array($proposal) ? $proposal : null,
            'effective' => $effective,
        ];
    }

    /** @return array<string, mixed> effective public-demo caps (display only) */
    private function demo(): array
    {
        $c = DemoConfig::load();

        return [
            'enabled' => $c->enabled,
            'provider' => $c->provider,
            'model' => $c->model,
            'maxTokensPerRequest' => $c->maxTokensPerRequest,
            'maxInputChars' => $c->maxInputChars,
            'perIpPerHour' => $c->perIpPerHour,
            'dailyGlobalTokens' => $c->dailyGlobalTokens,
            'dailyBudgetUsd' => $c->dailyBudgetUsd,
            'powDifficultyBits' => $c->powDifficultyBits,
            // In v1 the demo is configured by env (config/demo.php) — the UI
            // shows these effective values but does not edit them.
            'editableInUi' => false,
        ];
    }

    /**
     * Mass-cartography worker state (ADR-005). "jobs en file" = queued +
     * running; "dernière activité" (a dernier-tick proxy, since ticks keep no
     * log) = the most recent mass_jobs.updated_at.
     *
     * @return array<string, mixed>
     */
    private function worker(): array
    {
        $counts = ['queued' => 0, 'running' => 0, 'done' => 0, 'failed' => 0, 'budget_exceeded' => 0, 'cancelled' => 0];
        $stmt = $this->pdo->query('SELECT status, COUNT(*) AS n FROM mass_jobs GROUP BY status');
        foreach ($stmt->fetchAll() as $row) {
            $counts[(string) $row['status']] = (int) $row['n'];
        }

        $lastActivity = $this->pdo->query('SELECT MAX(updated_at) FROM mass_jobs')->fetchColumn();
        $activeRuns = (int) $this->pdo->query(
            'SELECT COUNT(*) FROM mass_runs WHERE status = "active"'
        )->fetchColumn();

        return [
            'jobsInQueue' => $counts['queued'] + $counts['running'],
            'byStatus' => $counts,
            'activeRuns' => $activeRuns,
            'lastActivity' => \is_string($lastActivity) ? str_replace(' ', 'T', $lastActivity) : null,
        ];
    }

    /**
     * The versionable server config (config/app.php). Secret entries are
     * reduced to a `configured` boolean here too (defence in depth: the file
     * already never carries secret values).
     *
     * @return array<string, mixed>
     */
    private function config(): array
    {
        $path = \dirname(__DIR__, 2) . '/config/app.php';
        if (!is_file($path)) {
            return [];
        }
        /** @var array<string, array<string, array<string, mixed>>> $groups */
        $groups = require $path;

        $out = [];
        foreach ($groups as $group => $entries) {
            foreach ($entries as $key => $entry) {
                if (($entry['secret'] ?? false) === true) {
                    $out[$group][$key] = [
                        'env' => $entry['env'] ?? $key,
                        'description' => $entry['description'] ?? '',
                        'secret' => true,
                        'configured' => (bool) ($entry['configured'] ?? false),
                    ];
                } else {
                    $out[$group][$key] = [
                        'env' => $entry['env'] ?? $key,
                        'description' => $entry['description'] ?? '',
                        'secret' => false,
                        'default' => $entry['default'] ?? '',
                        'value' => $entry['value'] ?? '',
                    ];
                }
            }
        }

        return $out;
    }
}
