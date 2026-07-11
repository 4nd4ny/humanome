// humanome engine — runtime validation of humanome documents against the
// JSON Schemas (draft 2020-12) living in schemas/ at the repo root.
// DOM-free ESM module (ADR-001); PHP twin: api/src/Validation.php.
//
// JSON imports are plain (Vite-compatible) rather than `with { type: 'json' }`
// import attributes, which are not supported by every toolchain yet.
import Ajv2020Import from 'ajv/dist/2020.js'
import addFormatsImport from 'ajv-formats'

import archiveExportSchema from '../../schemas/archive-export.schema.json'
import cartographieJourSchema from '../../schemas/cartographie-jour.schema.json'
import cartographieMergeSchema from '../../schemas/cartographie-merge.schema.json'
import promptPackageSchema from '../../schemas/prompt-package.schema.json'
import referentielSchema from '../../schemas/referentiel.schema.json'

// ajv ships CommonJS: depending on the bundler the class sits on `.default`.
const Ajv2020 = Ajv2020Import.default ?? Ajv2020Import
const addFormats = addFormatsImport.default ?? addFormatsImport

// kind -> schema, where kind is the document discriminant (`kind` const in
// each schema) and the schema file is schemas/<kind>.schema.json.
const SCHEMAS_BY_KIND = {
  'referentiel': referentielSchema,
  'prompt-package': promptPackageSchema,
  'cartographie-jour': cartographieJourSchema,
  'cartographie-merge': cartographieMergeSchema,
  'archive-export': archiveExportSchema,
}

/** Document kinds supported by validateDocument(). */
export const SUPPORTED_KINDS = Object.freeze(Object.keys(SCHEMAS_BY_KIND))

let ajv = null

// Lazy singleton: all five schemas are registered up-front so that
// cross-schema $ref by absolute $id (archive-export -> the four others) resolve.
function getAjv() {
  if (ajv === null) {
    ajv = new Ajv2020({ allErrors: true, strict: false })
    addFormats(ajv)
    for (const schema of Object.values(SCHEMAS_BY_KIND)) {
      ajv.addSchema(schema)
    }
  }
  return ajv
}

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
  if (!SUPPORTED_KINDS.includes(kind)) {
    throw new Error(
      `Unsupported document kind "${kind}" (supported: ${SUPPORTED_KINDS.join(', ')})`,
    )
  }
  const validate = getAjv().getSchema(SCHEMAS_BY_KIND[kind].$id)
  const valid = validate(data) === true
  const errors = (validate.errors ?? []).map((error) => ({
    path: error.instancePath === '' ? '/' : error.instancePath,
    keyword: error.keyword,
    message: error.message ?? '',
  }))
  return { valid, errors }
}
