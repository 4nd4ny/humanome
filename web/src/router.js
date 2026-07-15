// Hash-based router (ADR-009). No routing library: the fragment is parsed by
// hand and views subscribe to `hashchange`. Canonical routes:
//
//   #/                      home
//   #/merge                 chronological (merge) view
//   #/jour/<iso>            day view, <iso> = AAAA-MM-JJ
//   #/jour/<iso>?focus=<c>  idem with a competence code highlighted
//   #/referentiel           public referentiel (7 pôles -> 61 compétences)
//   #/referentiel/<code>    idem, permalink to one competence (scroll + highlight)
//   #/essayer               public live demo: paste a text, map it (P6, cahier §3.1)
//   #/portfolio             portfolio module: local-only texts, day segmentation (P7)
//   #/compte                account area (session checked when the route mounts)

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
 *   | {name: 'referentiel', code: string | null}
 *   | {name: 'essayer'}
 *   | {name: 'portfolio'}
 *   | {name: 'account'}
 *   | {name: 'espace', section: string | null}
 *   | {name: 'share', token: string}
 *   | {name: 'not-found', hash: string}}
 */
export function parseHash(hash) {
  const raw = String(hash ?? '').replace(/^#/, '')
  const queryIndex = raw.indexOf('?')
  const path = queryIndex === -1 ? raw : raw.slice(0, queryIndex)
  const query = queryIndex === -1 ? '' : raw.slice(queryIndex + 1)

  if (path === '' || path === '/') return { name: 'home' }
  if (path === '/merge') return { name: 'merge' }
  if (path === '/essayer') return { name: 'essayer' }
  if (path === '/portfolio') return { name: 'portfolio' }
  if (path === '/compte') return { name: 'account', section: null }

  // Espace compte : #/compte/credit = tableau de bord crédit Twin9 + factures.
  const compteMatch = /^\/compte\/(.+)$/.exec(path)
  if (compteMatch) return { name: 'account', section: decodeURIComponent(compteMatch[1]) }

  // Twin9 — analyse approfondie payante (Golden Prompt, ADR-010) : #/twin9.
  if (path === '/twin9') return { name: 'twin9', section: null }
  const twin9Match = /^\/twin9\/(.+)$/.exec(path)
  if (twin9Match) return { name: 'twin9', section: decodeURIComponent(twin9Match[1]) }

  // Twin6 — cartographie ouverte (gratuite/open source) : #/twin6-ouverte.
  if (path === '/twin6-ouverte') return { name: 'twin6ouverte', section: null }

  // Espace apprenant (P8) : #/espace, #/espace/formation, #/espace/formation/<chapitre>…
  if (path === '/espace') return { name: 'espace', section: null }
  const espaceMatch = /^\/espace\/(.+)$/.exec(path)
  if (espaceMatch) return { name: 'espace', section: decodeURIComponent(espaceMatch[1]) }

  // Lien de partage employeur (P8) : #/partage/<token>
  const shareMatch = /^\/partage\/([A-Za-z0-9_-]{10,})$/.exec(path)
  if (shareMatch) return { name: 'share', token: shareMatch[1] }

  // Espace cartographe (P9) : #/cartographe[/<section>]
  if (path === '/cartographe') return { name: 'cartographe', section: null }
  const cartographeMatch = /^\/cartographe\/(.+)$/.exec(path)
  if (cartographeMatch) {
    return { name: 'cartographe', section: decodeURIComponent(cartographeMatch[1]) }
  }

  // Atelier promptologue (P10) : #/promptologue[/<section>]
  if (path === '/promptologue') return { name: 'promptologue', section: null }
  const promptologueMatch = /^\/promptologue\/(.+)$/.exec(path)
  if (promptologueMatch) {
    return { name: 'promptologue', section: decodeURIComponent(promptologueMatch[1]) }
  }

  // Espace établissement (P11) : #/etablissement[/<section>]
  if (path === '/etablissement') return { name: 'etablissement', section: null }
  const etabMatch = /^\/etablissement\/(.+)$/.exec(path)
  if (etabMatch) return { name: 'etablissement', section: decodeURIComponent(etabMatch[1]) }

  // Administration (P12) : #/admin[/<section>]
  if (path === '/admin') return { name: 'admin', section: null }
  const adminMatch = /^\/admin\/(.+)$/.exec(path)
  if (adminMatch) return { name: 'admin', section: decodeURIComponent(adminMatch[1]) }

  // Confidentialité / page RGPD publique (P12)
  if (path === '/confidentialite') return { name: 'confidentialite' }

  // Hub public des guides / manuels de formation : #/guides,
  // #/guides/<parcours>, #/guides/<parcours>/<chapitre> (lisible par tous).
  if (path === '/guides') return { name: 'guides', parcours: null, chapter: null }
  const guidesMatch = /^\/guides\/([a-z]+)(?:\/(.+))?$/.exec(path)
  if (guidesMatch) {
    return {
      name: 'guides',
      parcours: guidesMatch[1],
      chapter: guidesMatch[2] ? decodeURIComponent(guidesMatch[2]) : null,
    }
  }

  if (path === '/referentiel') return { name: 'referentiel', code: null }
  const refMatch = /^\/referentiel\/([^/]+)$/.exec(path)
  if (refMatch) return { name: 'referentiel', code: decodeURIComponent(refMatch[1]) }

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

/**
 * Builds the canonical hash for the public referentiel view.
 * @param {string | null} [code] competence code to permalink (e.g. '1.01')
 * @returns {string} '#/referentiel' or '#/referentiel/<code>'
 */
export function referentielHash(code = null) {
  return code ? `#/referentiel/${encodeURIComponent(code)}` : '#/referentiel'
}

/**
 * Builds the canonical hash for the public guides hub.
 * @param {string | null} [parcours] parcours id (e.g. 'visiteur')
 * @param {string | null} [chapter] chapter slug
 * @returns {string} '#/guides', '#/guides/<parcours>' or '#/guides/<parcours>/<chapter>'
 */
export function guidesHash(parcours = null, chapter = null) {
  if (!parcours) return '#/guides'
  return chapter ? `#/guides/${parcours}/${chapter}` : `#/guides/${parcours}`
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
