<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use PDO;

/**
 * Store of the CONFIDENTIAL Twin_v9 prompt templates (ADR-010).
 *
 * Templates live in the `twin9_protocole` table, keyed by a hierarchical
 * name ('lourd/20-greffier'). Every overwrite archives the previous content
 * into `twin9_protocole_versions` (per-name counter) so the admin editor can
 * roll back.
 *
 * Placeholders use the exact Twin_v9 Python syntax: {$VAR} where VAR matches
 * [A-Z_][A-Z0-9_]* (templates.py). Rendering is NON-STRICT like the Python:
 * unknown placeholders are left verbatim and reported, never an error that
 * could leak template content.
 *
 * list() deliberately returns metadata WITHOUT content: the content is only
 * exposed by get(), which the routes reserve to the admin role.
 */
final class ProtocoleRepository
{
    /** Same extraction regex as Twin_v9 templates.py: {$VAR}. */
    public const VARIABLE_PATTERN = '/\{\$([A-Z_][A-Z0-9_]*)\}/';

    /** Hierarchical name: segments of [a-z0-9_-], '/'-separated. */
    public const NAME_PATTERN = '#^[a-z0-9][a-z0-9_\-]*(?:/[a-z0-9][a-z0-9_\-]*)*$#i';

    public const MAX_CONTENT_BYTES = 262144; // 256 Ko

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Metadata of every template — name, content length, extracted variables,
     * last update — WITHOUT the content itself.
     *
     * @return list<array{name: string, longueur: int, variables: list<string>, updated_at: string}>
     */
    public function list(): array
    {
        $rows = $this->pdo->query(
            'SELECT name, CHAR_LENGTH(content) AS longueur, variables, updated_at
             FROM twin9_protocole ORDER BY name'
        )->fetchAll();

        return array_map(static fn (array $row): array => [
            'name' => (string) $row['name'],
            'longueur' => (int) $row['longueur'],
            'variables' => self::decodeVariables((string) $row['variables']),
            'updated_at' => (string) $row['updated_at'],
        ], $rows);
    }

    /**
     * One template WITH its content (admin-only exposure — routes/twin9.php).
     *
     * @return array{name: string, content: string, variables: list<string>, updated_at: string}|null
     */
    public function get(string $name): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT name, content, variables, updated_at FROM twin9_protocole WHERE name = ?'
        );
        $stmt->execute([$name]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }

        return [
            'name' => (string) $row['name'],
            'content' => (string) $row['content'],
            'variables' => self::decodeVariables((string) $row['variables']),
            'updated_at' => (string) $row['updated_at'],
        ];
    }

    /**
     * Create or overwrite a template. The previous content (if different) is
     * archived into twin9_protocole_versions first, attributed to its own
     * author. Unchanged content is a no-op (idempotent re-imports do not
     * pollute the history).
     *
     * @return array{name: string, variables: list<string>, status: 'created'|'updated'|'unchanged'}
     */
    public function put(string $name, string $content, ?int $userId): array
    {
        self::assertValidName($name);
        self::assertValidContent($content);
        $variables = self::extractVariables($content);
        $variablesJson = json_encode($variables, JSON_THROW_ON_ERROR);

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                'SELECT content, variables, updated_by FROM twin9_protocole WHERE name = ? FOR UPDATE'
            );
            $stmt->execute([$name]);
            $existing = $stmt->fetch();

            if ($existing === false) {
                $this->pdo->prepare(
                    'INSERT INTO twin9_protocole (name, content, variables, updated_by)
                     VALUES (?, ?, ?, ?)'
                )->execute([$name, $content, $variablesJson, $userId]);
                $status = 'created';
            } elseif ((string) $existing['content'] === $content) {
                $status = 'unchanged';
            } else {
                $this->archiveVersion(
                    $name,
                    (string) $existing['content'],
                    (string) $existing['variables'],
                    $existing['updated_by'] === null ? null : (int) $existing['updated_by'],
                );
                $this->pdo->prepare(
                    'UPDATE twin9_protocole SET content = ?, variables = ?, updated_by = ? WHERE name = ?'
                )->execute([$content, $variablesJson, $userId, $name]);
                $status = 'updated';
            }
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return ['name' => $name, 'variables' => $variables, 'status' => $status];
    }

    /**
     * Edit history of a template, most recent first — metadata only.
     *
     * @return list<array{version: int, longueur: int, variables: list<string>, created_at: string}>
     */
    public function versions(string $name): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT version, CHAR_LENGTH(content) AS longueur, variables, created_at
             FROM twin9_protocole_versions WHERE name = ? ORDER BY version DESC'
        );
        $stmt->execute([$name]);

        return array_map(static fn (array $row): array => [
            'version' => (int) $row['version'],
            'longueur' => (int) $row['longueur'],
            'variables' => self::decodeVariables((string) $row['variables']),
            'created_at' => (string) $row['created_at'],
        ], $stmt->fetchAll());
    }

    /**
     * Render a template: every {$VAR} present in $vars is substituted, the
     * absent ones are LEFT VERBATIM (non-strict, like Twin_v9 templates.py)
     * and reported in 'non_resolues'. Single-pass substitution (strtr):
     * placeholder-looking text inside a VALUE is never re-substituted.
     *
     * @param array<string, mixed> $vars
     * @return array{rendu: string, non_resolues: list<string>}
     */
    public function render(string $name, array $vars): array
    {
        $template = $this->get($name);
        if ($template === null) {
            throw new Twin9Exception('Gabarit introuvable', 404);
        }

        $replacements = [];
        foreach ($vars as $var => $value) {
            if (!\is_string($var) || preg_match('/^[A-Z_][A-Z0-9_]*$/', $var) !== 1) {
                continue; // silently ignore non-placeholder keys, non-strict
            }
            $replacements['{$' . $var . '}'] = self::stringify($value);
        }
        $rendu = strtr($template['content'], $replacements);

        preg_match_all(self::VARIABLE_PATTERN, $rendu, $matches);
        $nonResolues = array_values(array_unique($matches[1]));

        return ['rendu' => $rendu, 'non_resolues' => $nonResolues];
    }

    /**
     * The {$VAR} placeholders of a template, in order of first appearance.
     *
     * @return list<string>
     */
    public static function extractVariables(string $content): array
    {
        preg_match_all(self::VARIABLE_PATTERN, $content, $matches);

        return array_values(array_unique($matches[1]));
    }

    public static function assertValidName(string $name): void
    {
        if ($name === '' || \strlen($name) > 190 || preg_match(self::NAME_PATTERN, $name) !== 1) {
            throw new Twin9Exception('Nom de gabarit invalide', 422);
        }
    }

    public static function assertValidContent(string $content): void
    {
        if (trim($content) === '') {
            throw new Twin9Exception('Contenu de gabarit requis', 422);
        }
        if (\strlen($content) >= self::MAX_CONTENT_BYTES) {
            throw new Twin9Exception('Gabarit trop volumineux (maximum 256 Ko)', 422);
        }
    }

    private function archiveVersion(string $name, string $content, string $variablesJson, ?int $authorId): void
    {
        $this->pdo->prepare(
            'INSERT INTO twin9_protocole_versions (name, version, content, variables, created_by)
             SELECT ?, COALESCE(MAX(version), 0) + 1, ?, ?, ?
             FROM twin9_protocole_versions WHERE name = ?'
        )->execute([$name, $content, $variablesJson, $authorId, $name]);
    }

    /** @return list<string> */
    private static function decodeVariables(string $json): array
    {
        $decoded = json_decode($json, true);

        return \is_array($decoded) ? array_values(array_map('strval', $decoded)) : [];
    }

    private static function stringify(mixed $value): string
    {
        if (\is_string($value)) {
            return $value;
        }
        if (\is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (\is_int($value) || \is_float($value)) {
            return (string) $value;
        }
        if ($value === null) {
            return '';
        }

        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '';
    }
}
