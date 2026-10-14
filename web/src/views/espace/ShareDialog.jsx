// Liens de partage DÉJÀ CRÉÉS d'une cartographie du site (P8.5, chantier C).
// L'ancien partage est RETIRÉ (décision du 2026-10-14, journal de la
// cartographie D-43) : on ne crée plus de lien ici — le partage passe par une
// version partagée de l'interface de cartographie (espace Partage). Les liens
// créés avant restent servis jusqu'à leur expiration ; ce dialogue les liste
// (dates et état, jamais le jeton, stocké haché) et permet de les révoquer.
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../api/client.js'
import { linkStatus } from '../../carto/ui/shareApi.js'

const DAY_MS = 24 * 60 * 60 * 1000

/** Identifiant du dialogue d'une cartographie (aria-controls du bouton qui l'ouvre). */
export function shareDialogId(entryId) {
  return `share-dialog-${String(entryId).replace(/[^A-Za-z0-9_-]/g, '-')}`
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
 *   onShareInInterface?: () => void, // ouvre la cartographie dans l'interface, espace Partage
 *   now?: () => Date,         // test seam : un lien échu s'affiche « expiré », sans « Révoquer »
 * }} props
 */
export default function ShareDialog({ entry, fetchFn, onClose, onShareInInterface, now = () => new Date() }) {
  const [links, setLinks] = useState(null) // null = chargement
  const [linksError, setLinksError] = useState(null)

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

  async function handleRevoke(shareId) {
    try {
      await apiFetch(`shares/${shareId}`, { method: 'DELETE', ...apiOptions })
      setLinksError(null)
      await reloadLinks()
    } catch (error) {
      setLinksError(error.message)
    }
  }

  return (
    <section id={shareDialogId(entry.id)} className="share-dialog" aria-label={`Liens de partage de ${entry.titre}`}>
      <div className="share-dialog-head">
        <h3>Liens de partage de « {entry.titre} »</h3>
        <button type="button" className="button" onClick={onClose}>
          Fermer
        </button>
      </div>
      <p className="share-dialog-hint">
        Le partage par lien de cette cartographie est retiré : on n’en crée plus de nouveau. Les
        liens que vous avez déjà donnés restent valables jusqu’à leur expiration ; vous pouvez
        les révoquer ici à tout moment. Pour montrer votre cartographie, partagez-la depuis
        l’interface de cartographie : vous y choisissez ce qui part, et votre cartographe peut
        la publier avec sa garantie.
      </p>
      {onShareInInterface ? (
        <p>
          <button type="button" className="button button-primary" onClick={onShareInInterface}>
            Partager depuis l’interface
          </button>
        </p>
      ) : null}

      <h4>Liens déjà créés</h4>
      {links === null ? <p role="status">Chargement des liens…</p> : null}
      {links !== null && links.length === 0 ? (
        <p className="share-dialog-empty">Aucun lien de partage pour cette cartographie.</p>
      ) : null}
      {links !== null && links.length > 0 ? (
        <ul className="share-links">
          {links.map((link) => {
            // Le serveur ne sert plus un lien échu : on le dit. Son échéance est
            // une heure du serveur, sans fuseau : « Révoquer » ne disparaît
            // qu'un jour après, quand le lien est mort quel que soit le fuseau.
            const at = now()
            const expired = linkStatus(link, at) === 'expired'
            const surelyExpired = linkStatus(link, new Date(at.getTime() - DAY_MS)) === 'expired'
            return (
              <li key={link.shareId}>
                <span>
                  Créé le {frShort(link.createdAt)} — {expired ? 'expiré le' : 'expire le'}{' '}
                  {frShort(link.expiresAt)}
                </span>
                {link.revokedAt ? (
                  <span className="share-link-revoked">révoqué le {frShort(link.revokedAt)}</span>
                ) : surelyExpired ? null : (
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={() => handleRevoke(link.shareId)}
                  >
                    Révoquer
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}
      {linksError ? <p role="alert">{linksError}</p> : null}
    </section>
  )
}
