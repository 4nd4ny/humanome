// Section « Configuration serveur » de l'administration (P12.1, cahier §4.10) :
// affiche la configuration versionnable (api/config/app.php) — variables
// d'environnement lues et leurs valeurs effectives. Les secrets (mot de passe
// MySQL, clés API, jetons) ne sont JAMAIS affichés : seul l'état « configuré »
// est montré. Le Golden Prompt et les clés restent hors git.

import { useEffect, useState } from 'react'
import { ApiUnavailableError } from '../../api/client.js'
import { fetchSettings } from './admin-api.js'

const GROUP_LABELS = {
  application: 'Application',
  database: 'Base de données',
  secrets: 'Secrets (hors git)',
  llm: 'LLM / démo',
}

export default function ConfigSection({ fetchFn }) {
  const [config, setConfig] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    fetchSettings(fetchFn)
      .then((s) => {
        if (!alive) return
        setConfig(s?.config ?? {})
        setStatus('ready')
      })
      .catch((err) => {
        if (!alive) return
        setStatus('error')
        setError(err instanceof ApiUnavailableError ? err.message : 'Chargement impossible.')
      })
    return () => {
      alive = false
    }
  }, [fetchFn])

  if (status === 'loading') {
    return <p role="status">Chargement de la configuration…</p>
  }
  if (status === 'error') {
    return (
      <p role="alert" className="load-error">
        {error}
      </p>
    )
  }

  const groups = Object.entries(config ?? {})

  return (
    <section className="admin-config">
      <h2>Configuration serveur</h2>
      <p className="privacy-note">
        Configuration versionnable lue dans <code>api/config/app.php</code> : chaque valeur est
        surchargeable par variable d’environnement (<code>~/app/shared/.env</code> hors webroot).
        Les <strong>secrets</strong> et le Golden Prompt restent hors git — seul leur état
        « configuré » est affiché, jamais leur valeur.
      </p>
      {groups.length === 0 ? <p>Configuration indisponible.</p> : null}
      {groups.map(([group, entries]) => (
        <div key={group} className="admin-config-group">
          <h3>{GROUP_LABELS[group] ?? group}</h3>
          <table className="admin-table admin-config-table">
            <thead>
              <tr>
                <th scope="col">Variable</th>
                <th scope="col">Valeur / état</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(entries).map(([key, entry]) => (
                <tr key={key}>
                  <td>
                    <code>{entry.env ?? key}</code>
                  </td>
                  <td>
                    {entry.secret ? (
                      <span
                        className={entry.configured ? 'admin-badge-ok' : 'admin-badge-off'}
                        data-testid={`secret-${entry.env ?? key}`}
                      >
                        {entry.configured ? 'configuré' : 'absent'}
                      </span>
                    ) : (
                      <code>{entry.value === '' ? `(défaut : ${entry.default || '—'})` : entry.value}</code>
                    )}
                  </td>
                  <td>{entry.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  )
}
