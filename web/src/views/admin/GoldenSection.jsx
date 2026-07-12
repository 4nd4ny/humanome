// Section « Golden Prompt » de l'administration (P12.1, cahier §3.8/§4.10/§7).
// Le Golden Prompt est importé HORS GIT (son contenu ne vit qu'en base), PRIVÉ
// par défaut : jamais listé publiquement, jamais exécutable/dérivable sans
// autorisation. L'admin l'importe, le liste, et autorise un promptologue au
// cas par cas. API SESSION admin (garde de rôle : AdminView).

import { useCallback, useEffect, useState } from 'react'
import { ApiError, ApiUnavailableError } from '../../api/client.js'
import { fetchGolden, frDate, grantGolden, importGolden } from './admin-api.js'

/** Formulaire d'import : coller le document prompt-package (JSON). */
function ImportForm({ onImported, fetchFn }) {
  const [raw, setRaw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  async function submit(event) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    let document
    try {
      document = JSON.parse(raw)
    } catch {
      setError('Le document collé n’est pas un JSON valide.')
      return
    }
    setBusy(true)
    try {
      const result = await importGolden(document, fetchFn)
      setMessage(
        result.status === 'imported'
          ? `Golden « ${result.id} » ${result.version} importé (privé).`
          : `Golden « ${result.id} » ${result.version} déjà présent, inchangé.`,
      )
      setRaw('')
      onImported()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="admin-golden-import" onSubmit={submit}>
      <h3>Importer un Golden Prompt (privé)</h3>
      <p className="privacy-note">
        Le contenu ne quitte pas ce formulaire pour Git : il est stocké en base, marqué privé, et
        n’est jamais servi par l’API publique ni exécutable sans autorisation.
      </p>
      <label htmlFor="golden-doc">Document prompt-package (JSON)</label>
      <textarea
        id="golden-doc"
        rows={8}
        value={raw}
        placeholder='{"id": "...", "version": "1.0.0", "prompts": [...], ...}'
        onChange={(event) => setRaw(event.target.value)}
      />
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
      <button type="submit" disabled={busy || raw.trim() === ''}>
        Importer
      </button>
    </form>
  )
}

/** Une ligne Golden : versions + autorisations + attribution à un promptologue. */
function GoldenRow({ pkg, onGrant, busy }) {
  const [userId, setUserId] = useState('')

  return (
    <li className="admin-golden-item">
      <h4>{pkg.id}</h4>
      {pkg.description ? <p>{pkg.description}</p> : null}
      <p>
        Versions : <strong>{pkg.versions.join(', ') || '—'}</strong>
      </p>
      <div>
        Promptologues autorisés :
        {pkg.grants.length === 0 ? (
          <em> aucun</em>
        ) : (
          <ul className="admin-golden-grants">
            {pkg.grants.map((g) => (
              <li key={g.userId}>
                {g.displayName} <span className="admin-email">({g.email})</span> — {frDate(g.createdAt)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="admin-golden-grant-form">
        <label htmlFor={`golden-grant-${pkg.packageId}`}>
          Autoriser un promptologue (identifiant de compte)
        </label>
        <input
          id={`golden-grant-${pkg.packageId}`}
          type="number"
          min="1"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
        />
        <button
          type="button"
          disabled={busy || userId === ''}
          onClick={() => {
            onGrant(pkg.id, Number(userId))
            setUserId('')
          }}
        >
          Autoriser
        </button>
      </div>
    </li>
  )
}

/**
 * @param {object} props
 * @param {typeof fetch} [props.fetchFn] couture de test
 */
export default function GoldenSection({ fetchFn }) {
  const [list, setList] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      setList(await fetchGolden(fetchFn))
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof ApiUnavailableError ? err.message : 'Chargement impossible.')
    }
  }, [fetchFn])

  useEffect(() => {
    load()
  }, [load])

  async function onGrant(id, userId) {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const result = await grantGolden(id, userId, fetchFn)
      setMessage(
        result.status === 'granted'
          ? `Accès accordé au compte ${userId}.`
          : `Le compte ${userId} avait déjà accès.`,
      )
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Autorisation impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-golden">
      <h2>Golden Prompt</h2>
      <ImportForm onImported={load} fetchFn={fetchFn} />

      <h3>Golden Prompts en base</h3>
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
      {status === 'loading' && !list ? <p role="status">Chargement…</p> : null}
      {list && list.length === 0 ? <p>Aucun Golden Prompt importé pour l’instant.</p> : null}
      {list && list.length > 0 ? (
        <ul className="admin-golden-list">
          {list.map((pkg) => (
            <GoldenRow key={pkg.packageId} pkg={pkg} onGrant={onGrant} busy={busy} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}
