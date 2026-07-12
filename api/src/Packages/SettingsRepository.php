<?php

declare(strict_types=1);

namespace Humanome\Packages;

use PDO;

/**
 * Key/value settings store (migration 008/008b, table `settings`).
 *
 * P10 use: designation of the default prompt-package proposed to learners —
 * a promptologue PROPOSES (default_prompt_package_proposal), the operator
 * VALIDATES via POST /api/admin/default-package (default_prompt_package).
 * Values are JSON documents.
 */
final class SettingsRepository
{
    public const DEFAULT_PACKAGE = 'default_prompt_package';
    public const DEFAULT_PACKAGE_PROPOSAL = 'default_prompt_package_proposal';

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array<string, mixed>|null decoded JSON value */
    public function get(string $name): ?array
    {
        $stmt = $this->pdo->prepare('SELECT value FROM settings WHERE name = ?');
        $stmt->execute([$name]);
        $value = $stmt->fetchColumn();
        if (!\is_string($value)) {
            return null;
        }
        $decoded = json_decode($value, true);

        return \is_array($decoded) ? $decoded : null;
    }

    /** @param array<string, mixed> $value */
    public function set(string $name, array $value): void
    {
        $this->pdo->prepare(
            'INSERT INTO settings (name, value) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)'
        )->execute([
            $name,
            json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
    }

    public function delete(string $name): void
    {
        $this->pdo->prepare('DELETE FROM settings WHERE name = ?')->execute([$name]);
    }
}
