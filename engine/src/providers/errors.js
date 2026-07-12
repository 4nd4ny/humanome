// humanome engine — providers: typed error (docs/plan-portage-moteur.md, cahier §5).
// DOM-free ESM module (ADR-001).

/**
 * Typed error raised by every provider transport.
 *
 * @property {number} status HTTP status of the failed response (0 for network errors)
 * @property {boolean} retryable true for 429 / 5xx / network errors
 * @property {?string} provider provider name ('anthropic', 'openai', …)
 * @property {number} [retryAfterMs] delay requested by a Retry-After header, if any
 */
export class ProviderError extends Error {
  constructor(message, { status = 0, retryable = false, provider = null, cause } = {}) {
    super(message)
    this.name = 'ProviderError'
    this.status = status
    this.retryable = retryable
    this.provider = provider
    if (cause !== undefined) this.cause = cause
  }
}
