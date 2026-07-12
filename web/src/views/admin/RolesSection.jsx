// Section « Rôles » de l'administration (P12.1, cahier §3.8) : rechercher des
// comptes, attribuer et retirer les rôles du référentiel §2. La garde de rôle
// est faite par AdminView (ici l'utilisateur EST admin). API SESSION admin.
//
// Anti-verrouillage : un admin ne peut pas retirer SON PROPRE rôle admin — le
// serveur l'impose (409) ; l'UI retire aussi le bouton correspondant.

import { useCallback, useEffect, useState } from 'react'
import { ApiError, ApiUnavailableError } from '../../api/client.js'
import { ASSIGNABLE_ROLES, frDate, grantRole, listUsers, revokeRole } from './admin-api.js'

/** Un compte : rôles courants + attribution/retrait. */
function UserRow({ user, currentUserId, onGrant, onRevoke, busy }) {
  const [roleToAdd, setRoleToAdd] = useState('')
  const missing = ASSIGNABLE_ROLES.filter((r) => !user.roles.includes(r))

  return (
    <tr>
      <td>
        <strong>{user.displayName}</strong>
        <br />
        <span className="admin-email">{user.email}</span>
      </td>
      <td>
        {user.roles.length === 0 ? (
          <em>aucun</em>
        ) : (
          <ul className="admin-role-chips">
            {user.roles.map((role) => {
              const isOwnAdmin = user.id === currentUserId && role === 'admin'
              return (
                <li key={role} className="admin-role-chip">
                  <span>{role}</span>
                  {isOwnAdmin ? (
                    <span
                      className="admin-role-lock"
                      title="Anti-verrouillage : vous ne pouvez pas retirer votre propre rôle admin"
                    >
                      🔒
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="admin-role-remove"
                      disabled={busy}
                      aria-label={`Retirer le rôle ${role} de ${user.email}`}
                      onClick={() => onRevoke(user.id, role)}
                    >
                      ✕
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </td>
      <td>
        <div className="admin-role-add">
          <label className="visually-hidden" htmlFor={`role-add-${user.id}`}>
            Rôle à attribuer à {user.email}
          </label>
          <select
            id={`role-add-${user.id}`}
            value={roleToAdd}
            disabled={busy || missing.length === 0}
            onChange={(event) => setRoleToAdd(event.target.value)}
          >
            <option value="">— rôle —</option>
            {missing.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || roleToAdd === ''}
            onClick={() => {
              onGrant(user.id, roleToAdd)
              setRoleToAdd('')
            }}
          >
            Attribuer
          </button>
        </div>
      </td>
      <td className="admin-created">{frDate(user.createdAt)}</td>
    </tr>
  )
}

/**
 * @param {object} props
 * @param {number|null} props.currentUserId id de l'admin connecté (anti-verrouillage)
 * @param {typeof fetch} [props.fetchFn] couture de test
 */
export default function RolesSection({ currentUserId, fetchFn }) {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const result = await listUsers({ query: submitted, page }, fetchFn)
      setData(result)
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(
        err instanceof ApiUnavailableError
          ? err.message
          : err instanceof ApiError
            ? err.message
            : 'Chargement impossible.',
      )
    }
  }, [submitted, page, fetchFn])

  useEffect(() => {
    load()
  }, [load])

  async function mutate(action, successMessage) {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      await action()
      setMessage(successMessage)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.')
    } finally {
      setBusy(false)
    }
  }

  const onGrant = (userId, role) =>
    mutate(() => grantRole(userId, role, fetchFn), `Rôle « ${role} » attribué.`)
  const onRevoke = (userId, role) =>
    mutate(() => revokeRole(userId, role, fetchFn), `Rôle « ${role} » retiré.`)

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <section className="admin-roles">
      <h2>Comptes et rôles</h2>
      <form
        className="admin-search"
        onSubmit={(event) => {
          event.preventDefault()
          setPage(1)
          setSubmitted(query.trim())
        }}
      >
        <label htmlFor="admin-user-search">Rechercher un compte (e-mail ou nom)</label>
        <input
          id="admin-user-search"
          type="search"
          value={query}
          placeholder="ex. : dupond ou @example.org"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit">Rechercher</button>
      </form>

      {message ? (
        <p role="status" className="admin-message">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="load-error">
          {error}
        </p>
      ) : null}

      {status === 'loading' && !data ? <p role="status">Chargement des comptes…</p> : null}

      {data ? (
        <>
          <p className="admin-count" role="status">
            {data.total} compte{data.total > 1 ? 's' : ''}
            {submitted ? ` pour « ${submitted} »` : ''}.
          </p>
          {data.users.length === 0 ? (
            <p>Aucun compte ne correspond.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Compte</th>
                  <th scope="col">Rôles</th>
                  <th scope="col">Attribuer</th>
                  <th scope="col">Créé le</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    currentUserId={currentUserId}
                    onGrant={onGrant}
                    onRevoke={onRevoke}
                    busy={busy}
                  />
                ))}
              </tbody>
            </table>
          )}
          {totalPages > 1 ? (
            <div className="admin-pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Précédent
              </button>
              <span>
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
