// humanome engine — validation of humanome documents against the JSON
// Schemas (draft 2020-12) living in schemas/ at the repo root.
// DOM-free ESM module (ADR-001); PHP twin: api/src/Validation.php.
//
// The validators are PRECOMPILED (ajv standalone, scripts/build-validators.mjs):
// ajv's runtime compilation relies on new Function(), which the production
// CSP (script-src 'self', no 'unsafe-eval') forbids in the browser — found
// live on the deployed « Essayer » demo. Rebuild validation-compiled.js
// whenever a file in schemas/ changes: node scripts/build-validators.mjs
import {
  validate_archive_export,
  validate_cartographie_jour,
  validate_cartographie_merge,
  validate_prompt_package,
  validate_referentiel,
} from './validation-compiled.js'

// kind -> precompiled validator, where kind is the document discriminant
// (`kind` const in each schema, file schemas/<kind>.schema.json).
const VALIDATORS_BY_KIND = {
  'referentiel': validate_referentiel,
  'prompt-package': validate_prompt_package,
  'cartographie-jour': validate_cartographie_jour,
  'cartographie-merge': validate_cartographie_merge,
  'archive-export': validate_archive_export,
}

/** Document kinds supported by validateDocument(). */
export const SUPPORTED_KINDS = Object.freeze(Object.keys(VALIDATORS_BY_KIND))

/**
 * Validates a document against the schema of the given kind.
 *
 * @param {string} kind one of SUPPORTED_KINDS
 * @param {unknown} data parsed JSON document to validate
 * @returns {{ valid: boolean, errors: Array<{ path: string, keyword: string, message: string }> }}
 *   errors[].path is a JSON pointer into the document ('/' for the root)
 * @throws {Error} when kind is not supported
 */
export function validateDocument(kind, data) {
  const validate = VALIDATORS_BY_KIND[kind]
  if (!validate) {
    throw new Error(
      `Unsupported document kind "${kind}" (supported: ${SUPPORTED_KINDS.join(', ')})`,
    )
  }
  const valid = validate(data) === true
  const errors = (validate.errors ?? []).map((error) => ({
    path: error.instancePath === '' ? '/' : error.instancePath,
    keyword: error.keyword,
    message: error.message ?? '',
  }))
  return { valid, errors }
}
