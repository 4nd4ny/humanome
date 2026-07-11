// Parses the top-level `const NAME = <literal>;` declarations of a carto-data.js
// file WITHOUT evaluating it (no eval / no vm): the literals are JSON emitted by
// the upstream Python pipeline, so JSON.parse is enough. The only non-JSON
// declarations in the known corpus are handled explicitly below.
import { readFileSync } from 'node:fs'

const CONST_RE = /^const ([A-Za-z_$][\w$]*) = /

/**
 * @param {string} filePath path to a carto-data.js file
 * @returns {Record<string, unknown>} map of const name -> parsed value
 */
export function parseCartoDataFile(filePath) {
  const text = readFileSync(filePath, 'utf8')
  const lines = text.split('\n')

  // Locate every top-level declaration start (column 0 only: strings in the
  // JSON literals are single-line escaped, so no false positives).
  const starts = []
  for (let i = 0; i < lines.length; i++) {
    const m = CONST_RE.exec(lines[i])
    if (m) starts.push({ name: m[1], line: i, col: m[0].length })
  }
  if (starts.length === 0) {
    throw new Error(`No top-level const declaration found in ${filePath}`)
  }

  const values = {}
  for (let s = 0; s < starts.length; s++) {
    const { name, line, col } = starts[s]
    const endLine = s + 1 < starts.length ? starts[s + 1].line : lines.length
    let literal = [lines[line].slice(col), ...lines.slice(line + 1, endLine)]
      .join('\n')
      .trim()
    if (literal.endsWith(';')) literal = literal.slice(0, -1).trimEnd()
    values[name] = parseLiteral(name, literal, values)
  }

  return values
}

function parseLiteral(name, literal, values) {
  // Alias to a previously declared const (e.g. `const rapportHtml = kairosHtml;`)
  if (/^[A-Za-z_$][\w$]*$/.test(literal)) {
    if (!(literal in values)) {
      throw new Error(`const ${name} references unknown identifier ${literal}`)
    }
    return values[literal]
  }
  try {
    return JSON.parse(literal)
  } catch {
    // JS-not-JSON literals (known corpus: `{ pattern: '', description: '' }`).
    const jsonified = literal
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
    try {
      return JSON.parse(jsonified)
    } catch {
      throw new Error(`const ${name}: literal is neither JSON nor a simple JS object`)
    }
  }
}
