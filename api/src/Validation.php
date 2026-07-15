<?php

declare(strict_types=1);

namespace Humanome;

use InvalidArgumentException;
use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\Helper;
use Opis\JsonSchema\Validator;
use RuntimeException;

/**
 * Runtime validation of humanome documents against the JSON Schemas
 * (draft 2020-12) living in schemas/ at the repo root.
 * JS twin: engine/src/validation.js.
 */
final class Validation
{
    /** Base URI of the schema $id values (https://humanome.xyz/schemas/<kind>.schema.json). */
    public const SCHEMA_ID_PREFIX = 'https://humanome.xyz/schemas/';

    /** Document kinds supported (one schemas/<kind>.schema.json file each). */
    public const SUPPORTED_KINDS = [
        'referentiel',
        'competence',
        'prompt-package',
        'cartographie-jour',
        'cartographie-merge',
        'archive-export',
    ];

    private const MAX_ERRORS = 20;

    /** @var array<string, Validator> one validator per resolved schemas directory */
    private static array $validators = [];

    /**
     * Validates a document against the schema of the given kind.
     *
     * @param string $kind one of self::SUPPORTED_KINDS
     * @param mixed $data decoded JSON document (stdClass, array or scalar);
     *                    associative arrays are converted to JSON objects
     * @param string|null $schemasDir schemas directory; defaults to <repo root>/schemas
     *                                (two levels above this file, which also matches the
     *                                OVH releases layout where api/ and schemas/ are siblings)
     * @return array{valid: bool, errors: array<string, string[]>} errors are keyed by
     *                                JSON pointer into the document
     */
    public static function validate(string $kind, mixed $data, ?string $schemasDir = null): array
    {
        if (!in_array($kind, self::SUPPORTED_KINDS, true)) {
            throw new InvalidArgumentException(sprintf(
                'Unsupported document kind "%s" (supported: %s)',
                $kind,
                implode(', ', self::SUPPORTED_KINDS),
            ));
        }

        $validator = self::validatorFor($schemasDir ?? self::defaultSchemasDir());
        $result = $validator->validate(Helper::toJSON($data), self::SCHEMA_ID_PREFIX . $kind . '.schema.json');

        if ($result->isValid()) {
            return ['valid' => true, 'errors' => []];
        }

        return ['valid' => false, 'errors' => (new ErrorFormatter())->format($result->error())];
    }

    private static function defaultSchemasDir(): string
    {
        // Repo layout (api/src -> <repo>/schemas) vs deployed release layout
        // (<release>/src -> <release>/schemas, ADR-008).
        $candidates = [
            dirname(__DIR__) . '/schemas',
            dirname(__DIR__, 2) . '/schemas',
        ];
        foreach ($candidates as $dir) {
            if (is_dir($dir)) {
                return $dir;
            }
        }

        return $candidates[1];
    }

    /**
     * Lazy per-directory singleton: registering the $id prefix on the resolver
     * makes every schemas/<kind>.schema.json addressable by its absolute $id,
     * so cross-schema $ref (archive-export -> the four others) resolve.
     */
    private static function validatorFor(string $schemasDir): Validator
    {
        $dir = realpath($schemasDir);
        if ($dir === false) {
            throw new RuntimeException(sprintf('Schemas directory not found: %s', $schemasDir));
        }

        if (!isset(self::$validators[$dir])) {
            $validator = new Validator();
            $validator->setMaxErrors(self::MAX_ERRORS);
            $validator->resolver()->registerPrefix(self::SCHEMA_ID_PREFIX, $dir);
            self::$validators[$dir] = $validator;
        }

        return self::$validators[$dir];
    }
}
