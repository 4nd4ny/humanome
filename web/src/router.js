// Hash-based router (ADR-009). No routing library: the fragment is parsed by
// hand and views subscribe to `hashchange`. Canonical routes:
//
//   #/                      home
//   #/merge                 chronological (merge) view
//   #/jour/<iso>            day view, <iso> = AAAA-MM-JJ
//   #/jour/<iso>?focus=<c>  idem with a competence code highlighted

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Strict ISO calendar date check (rejects 2026-13-45, 2026-02-30, …).
 * @param {string} value candidate AAAA-MM-JJ string
 * @returns {boolean}
 */
export function isValidIsoDate(value) {
  const match = ISO_DATE_RE.exec(value)
  if (!match) return false
  const [, y, m, d] = match
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  )
}

/**
 * Parses a location hash into a route object.
 * @param {string} hash e.g. '#/jour/2026-03-15?focus=1.01' (leading '#' optional)
 * @returns {{name: 'home'}
 *   | {name: 'merge'}
 *   | {name: 'day', date: string, focus: string | null}
 *   | {name: 'not-found', hash: string}}
 */
export function parseHash(hash) {
  const raw = String(hash ?? '').replace(/^#/, '')
  const queryIndex = raw.indexOf('?')
  const path = queryIndex === -1 ? raw : raw.slice(0, queryIndex)
  const query = queryIndex === -1 ? '' : raw.slice(queryIndex + 1)

  if (path === '' || path === '/') return { name: 'home' }
  if (path === '/merge') return { name: 'merge' }

  const dayMatch = /^\/jour\/([^/]+)$/.exec(path)
  if (dayMatch) {
    const date = decodeURIComponent(dayMatch[1])
    if (isValidIsoDate(date)) {
      const focus = new URLSearchParams(query).get('focus')
      return { name: 'day', date, focus: focus === null || focus === '' ? null : focus }
    }
  }

  return { name: 'not-found', hash: raw }
}

/**
 * Builds the canonical hash for the day view.
 * @param {string} date AAAA-MM-JJ
 * @param {string | null} [focus] competence code to highlight
 * @returns {string} '#/jour/<date>' or '#/jour/<date>?focus=<code>'
 */
export function dayHash(date, focus = null) {
  return `#/jour/${date}${focus ? `?focus=${encodeURIComponent(focus)}` : ''}`
}

/** @returns {ReturnType<typeof parseHash>} route for the current location hash */
export function currentRoute() {
  return parseHash(window.location.hash)
}

/**
 * Subscribes to route changes.
 * @param {(route: ReturnType<typeof parseHash>) => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribe(listener) {
  const handler = () => listener(currentRoute())
  window.addEventListener('hashchange', handler)
  return () => window.removeEventListener('hashchange', handler)
}

/**
 * Navigates by rewriting the fragment (pushes a history entry).
 * @param {string} hash e.g. '#/merge'
 */
export function navigate(hash) {
  window.location.hash = hash
}
