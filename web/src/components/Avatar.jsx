// Avatar de profil (D6) : affiche l'image servie par GET /api/users/{id}/avatar
// quand le compte en a une (hasAvatar), sinon un cercle avec les INITIALES en
// repli. `version` (horodatage) casse le cache après une mise à jour.
import { useState } from 'react'
import { avatarUrl } from '../api/client.js'

/** Initiales lisibles d'un nom : 1 ou 2 lettres majuscules. */
export function initials(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * @param {{userId?: number|string, displayName?: string, hasAvatar?: boolean,
 *   version?: string|number, size?: number}} props
 */
export default function Avatar({ userId, displayName, hasAvatar = false, version, size = 40 }) {
  const [failed, setFailed] = useState(false)
  const showImg = hasAvatar && userId != null && userId !== '' && !failed

  if (showImg) {
    return (
      <img
        className="avatar avatar-img"
        src={avatarUrl(userId, version)}
        alt={`Avatar de ${displayName ?? 'l’utilisateur'}`}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
        data-testid="avatar-img"
      />
    )
  }
  return (
    <span
      className="avatar avatar-initials"
      style={{ width: size, height: size }}
      aria-hidden="true"
      data-testid="avatar-initials"
    >
      {initials(displayName)}
    </span>
  )
}
