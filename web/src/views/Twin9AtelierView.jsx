// Atelier Twin9 (#/twin9-atelier, AD-D2) — l'édition des gabarits du Golden
// Prompt vit désormais dans la famille « Faire évoluer », réservée aux
// administrateurs-promptologues (les DEUX rôles). C'est le SEUL endroit du
// front où le CONTENU d'un gabarit est visible, et seulement pour admin ∧
// promptologue ; le serveur applique la même garde (RequireRole::all).
//
// La supervision commerciale (marge, promo Twin9 gratuit, comptes) reste dans
// #/admin/twin9 (admin seul, Twin9Section).
//
// Le contenu rendu (gabarit édité, rendu du banc d'essai) reste du TEXTE BRUT :
// jamais de renderMarkdown/HTML — ce n'est pas du narratif, c'est un secret
// industriel. React échappe le texte, on l'affiche tel quel dans <textarea>/<pre>.

import { useCallback, useEffect, useState } from 'react'
import { ApiError, ApiUnavailableError } from '../api/client.js'
import {
  fetchProtocole,
  fetchProtocoleList,
  fetchProtocoleVersion,
  fetchProtocoleVersions,
  restoreProtocoleVersion,
  saveProtocole,
  testerProtocole,
} from '../api/twin9.js'

/** @param {string} iso @returns {string} date/heure française courte ('—' si vide) */
function frDate(iso) {
  if (typeof iso !== 'string' || iso === '') return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('fr-FR')
}

// ---- 1. Gabarits -----------------------------------------------------------

/**
 * Liste des gabarits (métadonnées seules) + éditeur du contenu. Cliquer un
 * gabarit charge son contenu (fetchProtocole) dans le <textarea> ; Enregistrer
 * versionne côté serveur (saveProtocole) ; « versions » liste l'historique.
 */
function GabaritsBloc({ protocoles, fetchFn, onSaved }) {
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [versions, setVersions] = useState(null)
  const [apercu, setApercu] = useState(null) // {version, content} — version archivée en lecture

  async function openGabarit(name) {
    setSelected(name)
    setLoading(true)
    setContent('')
    setMessage(null)
    setError(null)
    setVersions(null)
    setApercu(null)
    try {
      const tpl = await fetchProtocole(name, { fetchFn })
      setContent(tpl?.content ?? '')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement du gabarit impossible.')
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const res = await saveProtocole(selected, content, { fetchFn })
      setMessage(
        res?.status === 'unchanged'
          ? 'Contenu inchangé — aucune nouvelle version.'
          : `Gabarit « ${selected} » enregistré (nouvelle version archivée).`,
      )
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible.')
    } finally {
      setBusy(false)
    }
  }

  async function loadVersions() {
    setError(null)
    try {
      const res = await fetchProtocoleVersions(selected, { fetchFn })
      setVersions(Array.isArray(res?.versions) ? res.versions : [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Historique indisponible.')
    }
  }

  // D13 — lecture d'une version archivée (aperçu texte brut, jamais de HTML).
  async function voirVersion(version) {
    setError(null)
    try {
      const res = await fetchProtocoleVersion(selected, version, { fetchFn })
      setApercu({ version, content: res?.content ?? '' })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Version indisponible.')
    }
  }

  // D13 — restauration : jamais destructive (le vivant est archivé d'abord).
  async function restaurer(version) {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const res = await restoreProtocoleVersion(selected, version, { fetchFn })
      setMessage(
        res?.status === 'unchanged'
          ? `La version ${version} est identique au gabarit vivant — rien à restaurer.`
          : `Version ${version} restaurée comme gabarit vivant (l’état précédent est archivé).`,
      )
      setApercu(null)
      const tpl = await fetchProtocole(selected, { fetchFn })
      setContent(tpl?.content ?? '')
      await loadVersions()
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Restauration impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="twin9-admin-bloc">
      <h3>Gabarits du Golden Prompt</h3>
      <p className="twin9-admin-warning" role="note">
        <strong>Contenu confidentiel — ne pas divulguer.</strong> Ces gabarits sont le secret
        industriel de la plateforme (ADR-010) : ils ne sont visibles qu’ici, pour les
        administrateurs-promptologues.
      </p>

      {protocoles.length === 0 ? (
        <p>Aucun gabarit importé pour l’instant.</p>
      ) : (
        <ul className="twin9-admin-gabarits">
          {protocoles.map((p) => (
            <li key={p.name}>
              <button
                type="button"
                className="twin9-admin-gabarit"
                aria-pressed={selected === p.name}
                onClick={() => openGabarit(p.name)}
              >
                <strong>{p.name}</strong>
                <span>
                  {p.longueur} caractères · {p.variables.length} variable
                  {p.variables.length === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <div className="twin9-admin-editeur">
          <h4>Édition : {selected}</h4>
          {loading ? (
            <p role="status">Chargement du contenu…</p>
          ) : (
            <>
              <label htmlFor="twin9-gabarit-content">Contenu du gabarit (texte brut)</label>
              <textarea
                id="twin9-gabarit-content"
                className="twin9-admin-textarea"
                rows={16}
                spellCheck={false}
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
              <div className="twin9-admin-actions">
                <button type="button" disabled={busy || content.trim() === ''} onClick={save}>
                  Enregistrer
                </button>
                <button
                  type="button"
                  className="admin-button-secondary"
                  disabled={busy}
                  onClick={loadVersions}
                >
                  Voir les versions
                </button>
              </div>
            </>
          )}

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

          {versions ? (
            versions.length === 0 ? (
              <p>Aucune version antérieure archivée.</p>
            ) : (
              <table className="admin-table twin9-admin-versions">
                <thead>
                  <tr>
                    <th scope="col">Version</th>
                    <th scope="col">Longueur</th>
                    <th scope="col">Variables</th>
                    <th scope="col">Archivée le</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.version}>
                      <td>{v.version}</td>
                      <td>{v.longueur}</td>
                      <td>{v.variables.length}</td>
                      <td>{frDate(v.created_at)}</td>
                      <td>
                        <button
                          type="button"
                          className="admin-button-secondary"
                          disabled={busy}
                          onClick={() => voirVersion(v.version)}
                        >
                          Voir
                        </button>{' '}
                        <button
                          type="button"
                          className="admin-button-secondary"
                          disabled={busy}
                          onClick={() => restaurer(v.version)}
                        >
                          Restaurer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : null}

          {apercu ? (
            <div className="twin9-admin-apercu">
              <h5>
                Version {apercu.version} (archivée, lecture seule) —{' '}
                <button
                  type="button"
                  className="admin-button-secondary"
                  disabled={busy}
                  onClick={() => restaurer(apercu.version)}
                >
                  Restaurer cette version
                </button>
              </h5>
              <pre className="twin9-admin-rendu" data-testid="twin9-apercu-version">
                {apercu.content}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ---- 2. Banc d'essai -------------------------------------------------------

/**
 * Rendre un gabarit avec des variables d'exemple (aucun appel LLM) : les champs
 * sont générés depuis les .variables du gabarit choisi ; testerProtocole renvoie
 * {rendu, non_resolues}. Le rendu est du texte brut réservé à l'atelier.
 */
function BancEssaiBloc({ protocoles, fetchFn }) {
  const [name, setName] = useState('')
  const [vars, setVars] = useState({})
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const selected = protocoles.find((p) => p.name === name) ?? null

  function choose(next) {
    setName(next)
    setResult(null)
    setError(null)
    const found = protocoles.find((p) => p.name === next)
    const init = {}
    for (const v of found?.variables ?? []) init[v] = ''
    setVars(init)
  }

  async function run() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(await testerProtocole(name, vars, { fetchFn }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Test impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="twin9-admin-bloc">
      <h3>Banc d’essai</h3>
      <p className="privacy-note">
        Remplit un gabarit avec des variables d’exemple et affiche le rendu — <strong>aucun appel
        LLM</strong>, aucun débit. Réservé à l’atelier (le rendu contient le gabarit).
      </p>

      <div className="admin-field">
        <label htmlFor="twin9-banc-gabarit">Gabarit</label>
        <div className="admin-field-input">
          <select
            id="twin9-banc-gabarit"
            value={name}
            onChange={(event) => choose(event.target.value)}
          >
            <option value="">— choisir un gabarit —</option>
            {protocoles.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selected ? (
        <form
          className="twin9-admin-banc"
          onSubmit={(event) => {
            event.preventDefault()
            run()
          }}
        >
          {selected.variables.length === 0 ? (
            <p>Ce gabarit n’a aucune variable.</p>
          ) : (
            selected.variables.map((v) => (
              <div className="admin-field" key={v}>
                <label htmlFor={`twin9-var-${v}`}>{v}</label>
                <div className="admin-field-input">
                  <input
                    id={`twin9-var-${v}`}
                    type="text"
                    value={vars[v] ?? ''}
                    onChange={(event) =>
                      setVars((prev) => ({ ...prev, [v]: event.target.value }))
                    }
                  />
                </div>
              </div>
            ))
          )}
          <button type="submit" disabled={busy}>
            Rendre le gabarit
          </button>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="load-error">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="twin9-admin-rendu">
          <h4>Rendu</h4>
          <pre data-testid="twin9-rendu">{result.rendu}</pre>
          {Array.isArray(result.non_resolues) && result.non_resolues.length > 0 ? (
            <p role="status" className="admin-message">
              Variables non résolues : {result.non_resolues.join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ---- Explication du rôle (garde front, doublée côté serveur) ---------------

function AtelierReserve() {
  return (
    <div className="admin-reserve" data-testid="twin9-atelier-reserve">
      <p role="alert">Cet atelier est réservé aux administrateurs-promptologues.</p>
      <p>
        L’édition des gabarits du Golden Prompt Twin9 exige <strong>les deux rôles</strong> :{' '}
        <strong>administrateur</strong> et <strong>promptologue</strong> (AD-D2). Le contenu des
        gabarits (secret industriel, ADR-010) ne transite jamais vers un client qui ne porte pas ces
        deux rôles. L’accès s’obtient auprès d’Harmonia Éducation.
      </p>
    </div>
  )
}

// ---- Vue ------------------------------------------------------------------

/**
 * @param {object} props
 * @param {string[]} [props.roles] rôles de la session (App les fournit)
 * @param {object} [props.deps] coutures de test : {fetchFn}
 */
export default function Twin9AtelierView({ roles = [], deps = {} }) {
  const fetchFn = deps.fetchFn
  const isAtelier = roles.includes('admin') && roles.includes('promptologue')

  const [protocoles, setProtocoles] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const pl = await fetchProtocoleList({ fetchFn })
      setProtocoles(Array.isArray(pl?.protocole) ? pl.protocole : [])
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof ApiUnavailableError ? err.message : 'Chargement impossible.')
    }
  }, [fetchFn])

  useEffect(() => {
    if (isAtelier) load()
  }, [isAtelier, load])

  const reloadProtocoles = useCallback(async () => {
    try {
      const pl = await fetchProtocoleList({ fetchFn })
      setProtocoles(Array.isArray(pl?.protocole) ? pl.protocole : [])
    } catch {
      /* on garde la liste précédente : l'échec est déjà signalé par le bloc */
    }
  }, [fetchFn])

  return (
    <div className="admin twin9-admin">
      <h1>Atelier Twin9 — Golden Prompt</h1>
      {!isAtelier ? (
        <AtelierReserve />
      ) : status === 'loading' ? (
        <p role="status">Chargement de l’atelier Twin9…</p>
      ) : status === 'error' ? (
        <p role="alert" className="load-error">
          {error}
        </p>
      ) : (
        <section className="admin-twin9">
          <GabaritsBloc protocoles={protocoles} fetchFn={fetchFn} onSaved={reloadProtocoles} />
          <BancEssaiBloc protocoles={protocoles} fetchFn={fetchFn} />
        </section>
      )}
    </div>
  )
}
