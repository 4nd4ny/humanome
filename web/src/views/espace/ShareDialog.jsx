// Dialogue de partage employeur (P8.5, chantier C) — une cartographie AVEC
// copie serveur peut être partagée par lien public + mot de passe (cahier
// §3.6, §6.4 : décision explicite, individuelle, révocable). Le token est
// stocké haché côté serveur : l'URL complète n'est affichée qu'UNE fois, à la
// création ; la liste des liens actifs ne montre que les dates et l'état.
import { useCallback, useEffect, useState } from 'react'
import { ApiError, apiFetch } from '../../api/client.js'

export const SHARE_PASSWORD_MIN_LENGTH = 8
export const SHARE_DEFAULT_EXPIRES_DAYS = 90

/** URL absolue du lien de partage (routeur hash : origin + pathname + #/partage/). */
export function absoluteShareUrl(token) {
  const loc = globalThis.location
  if (!loc) return `/#/partage/${token}`
  return `${loc.origin}${loc.pathname}#/partage/${token}`
}

/** @param {string} iso @returns {string} date française courte (JJ/MM/AAAA) */
function frShort(iso) {
  if (typeof iso !== 'string' || iso === '') return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('fr-FR')
}

/**
 * @param {{
 *   entry: {id: string, titre: string, serverId: number},
 *   fetchFn?: typeof fetch,   // test seam
 *   onClose: () => void,
 * }} props
 */
export default function ShareDialog({ entry, fetchFn, onClose }) {
  const [links, setLinks] = useState(null) // null = chargement
  const [linksError, setLinksError] = useState(null)
  const [password, setPassword] = useState('')
  const [days, setDays] = useState(String(SHARE_DEFAULT_EXPIRES_DAYS))
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(null)
  const [created, setCreated] = useState(null) // {url}
  const [copied, setCopied] = useState(false)

  const apiOptions = fetchFn ? { fetchFn } : {}

  const reloadLinks = useCallback(async () => {
    try {
      const data = await apiFetch(
        `cartographies/${entry.serverId}/shares`,
        fetchFn ? { fetchFn } : {},
      )
      setLinks(Array.isArray(data) ? data : [])
      setLinksError(null)
    } catch (error) {
      setLinks([])
      setLinksError(error.message)
    }
  }, [entry.serverId, fetchFn])

  useEffect(() => {
    reloadLinks()
  }, [reloadLinks])

  async function handleCreate(event) {
    event.preventDefault()
    const expiresInDays = Number.parseInt(days, 10)
    if (password.length < SHARE_PASSWORD_MIN_LENGTH) {
      setFormError(
        `Le mot de passe du lien doit compter au moins ${SHARE_PASSWORD_MIN_LENGTH} caractères.`,
      )
      return
    }
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) {
      setFormError('L’expiration doit être comprise entre 1 et 365 jours.')
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      const data = await apiFetch(`cartographies/${entry.serverId}/share`, {
        method: 'POST',
        body: { password, expiresInDays },
        ...apiOptions,
      })
      setCreated({ url: absoluteShareUrl(data.token) })
      setCopied(false)
      setPassword('') // jamais réaffiché ni conservé
      await reloadLinks()
    } catch (error) {
      setFormError(
        error instanceof ApiError && error.status === 401
          ? 'Session expirée : reconnectez-vous puis réessayez.'
          : error.message,
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleRevoke(shareId) {
    try {
      await apiFetch(`shares/${shareId}`, { method: 'DELETE', ...apiOptions })
      setLinksError(null)
      await reloadLinks()
    } catch (error) {
      setLinksError(error.message)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(created.url)
      setCopied(true)
    } catch {
      setCopied(false) // l'URL reste sélectionnable à la main
    }
  }

  return (
    <section className="share-dialog" aria-label={`Partage de ${entry.titre}`}>
      <div className="share-dialog-head">
        <h3>Partager « {entry.titre} »</h3>
        <button type="button" className="button" onClick={onClose}>
          Fermer
        </button>
      </div>
      <p className="share-dialog-hint">
        Le lien ouvre la cartographie en lecture seule, protégée par le mot de passe que vous
        choisissez. Transmettez ce mot de passe par un autre canal que le lien.
      </p>

      <form className="share-dialog-form" onSubmit={handleCreate}>
        <label htmlFor={`share-password-${entry.id}`}>Mot de passe du lien (8 caractères min)</label>
        <input
          id={`share-password-${entry.id}`}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
        />
        <label htmlFor={`share-days-${entry.id}`}>Expiration (jours)</label>
        <input
          id={`share-days-${entry.id}`}
          type="number"
          min="1"
          max="365"
          value={days}
          onChange={(event) => setDays(event.target.value)}
          disabled={busy}
        />
        <button type="submit" className="button button-primary" disabled={busy}>
          {busy ? 'Création…' : 'Créer le lien de partage'}
        </button>
        {formError ? <p role="alert">{formError}</p> : null}
      </form>

      {created ? (
        <div className="share-dialog-created" role="status">
          <p>
            Lien créé — copiez-le maintenant, il ne sera plus jamais affiché en entier :
          </p>
          <p>
            <code className="share-url" data-testid="share-url">
              {created.url}
            </code>{' '}
            <button type="button" className="button" onClick={handleCopy}>
              {copied ? 'Lien copié' : 'Copier le lien'}
            </button>
          </p>
        </div>
      ) : null}

      <h4>Liens actifs</h4>
      {links === null ? <p role="status">Chargement des liens…</p> : null}
      {links !== null && links.length === 0 ? (
        <p className="share-dialog-empty">Aucun lien de partage pour cette cartographie.</p>
      ) : null}
      {links !== null && links.length > 0 ? (
        <ul className="share-links">
          {links.map((link) => (
            <li key={link.shareId}>
              <span>
                Créé le {frShort(link.createdAt)} — expire le {frShort(link.expiresAt)}
              </span>
              {link.revokedAt ? (
                <span className="share-link-revoked">révoqué le {frShort(link.revokedAt)}</span>
              ) : (
                <button
                  type="button"
                  className="button button-danger"
                  onClick={() => handleRevoke(link.shareId)}
                >
                  Révoquer
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {linksError ? <p role="alert">{linksError}</p> : null}
    </section>
  )
}
