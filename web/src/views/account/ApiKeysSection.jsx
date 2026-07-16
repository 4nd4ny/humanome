// Clés API personnelles dans le profil (cahier §4.5, ADR-004).
//
// Stockage serveur OPT-IN et chiffré (libsodium). L'utilisateur enregistre ici
// sa clé API privée pour lancer les cartographies « clé perso » (Twin6) sans la
// ressaisir à chaque fois. La clé n'est jamais réaffichée après enregistrement.

import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../api/client.js'
import {
  KEY_PROVIDERS,
  deleteKey as deleteKeyApi,
  listKeys as listKeysApi,
  providerLabel,
  storeKey as storeKeyApi,
} from '../../api/keys.js'

/** @param {unknown} error @returns {string} message affichable */
function message(error) {
  if (error instanceof ApiError) return error.serverMessage ?? error.message
  return 'Une erreur est survenue. Réessayez.'
}

/**
 * @param {{deps?: {listKeys?: typeof listKeysApi, storeKey?: typeof storeKeyApi,
 *   deleteKey?: typeof deleteKeyApi}}} props coutures de test
 */
export default function ApiKeysSection({ deps = {} }) {
  const listKeys = deps.listKeys ?? listKeysApi
  const storeKey = deps.storeKey ?? storeKeyApi
  const deleteKey = deps.deleteKey ?? deleteKeyApi

  const [keys, setKeys] = useState(null) // null = chargement, [] = aucune
  const [loadError, setLoadError] = useState(null)
  const [provider, setProvider] = useState(KEY_PROVIDERS[0].id)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    listKeys()
      .then((list) => {
        if (alive) setKeys(Array.isArray(list) ? list : [])
      })
      .catch((error) => {
        if (alive) {
          setKeys([])
          setLoadError(message(error))
        }
      })
    return () => {
      alive = false
    }
  }, [listKeys, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setFeedback(null)
    try {
      await storeKey({ provider, apiKey: apiKey.trim() })
      setApiKey('')
      setFeedback({ kind: 'ok', message: `Clé ${providerLabel(provider)} enregistrée (chiffrée).` })
      reload()
    } catch (error) {
      setFeedback({ kind: 'error', message: message(error) })
    } finally {
      setBusy(false)
    }
  }

  async function remove(prov) {
    setBusy(true)
    setFeedback(null)
    try {
      await deleteKey(prov)
      setFeedback({ kind: 'ok', message: `Clé ${providerLabel(prov)} supprimée.` })
      reload()
    } catch (error) {
      setFeedback({ kind: 'error', message: message(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="account-keys" aria-label="Clés API personnelles">
      <h2>Clés API personnelles</h2>
      <p className="account-keys-intro">
        Enregistrez votre propre clé API pour lancer une cartographie sur votre clé (gratuit pour
        vous, hors coût de votre fournisseur). Elle est <strong>chiffrée sur le serveur</strong>{' '}
        (opt-in, RGPD) et n’est <strong>jamais réaffichée</strong> ensuite ; vous pouvez la supprimer
        à tout moment.
      </p>

      {keys === null ? (
        <p role="status">Chargement des clés…</p>
      ) : (
        <>
          {keys.length > 0 ? (
            <ul className="account-keys-list">
              {keys.map((k) => (
                <li key={k.provider} className="account-keys-item">
                  <span className="account-keys-provider">{providerLabel(k.provider)}</span>
                  <span className="account-keys-date">enregistrée le {String(k.createdAt).slice(0, 10)}</span>
                  <button
                    type="button"
                    className="account-keys-delete"
                    onClick={() => remove(k.provider)}
                    disabled={busy}
                  >
                    Supprimer
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="account-keys-empty">Aucune clé enregistrée.</p>
          )}

          <form className="account-keys-form" onSubmit={save}>
            <label>
              Fournisseur
              <select value={provider} onChange={(e) => setProvider(e.target.value)} disabled={busy}>
                {KEY_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Clé API
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="ex. sk-ant-…"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
            </label>
            <button type="submit" className="button" disabled={busy || apiKey.trim().length < 8}>
              {busy ? '…' : 'Enregistrer la clé'}
            </button>
          </form>
        </>
      )}

      {loadError ? (
        <p role="alert" className="load-error">
          {loadError}
        </p>
      ) : null}
      {feedback ? (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={feedback.kind === 'error' ? 'load-error' : 'account-keys-ok'}
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  )
}
