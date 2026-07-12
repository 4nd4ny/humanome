// Section « Réglages » de l'administration (P12.1, cahier §3.8/§4.10) :
// - version de prompt par défaut (réutilise settings default_prompt_package —
//   proposition promptologue + validation admin, P10) ;
// - plafonds de la démo publique : AFFICHÉS (valeurs effectives) ; en v1 la
//   démo se règle par variables d'environnement (config/demo.php), l'UI ne les
//   édite pas ;
// - état du worker de masse : jobs en file, par statut, dernière activité.

import { useCallback, useEffect, useState } from 'react'
import { ApiError, ApiUnavailableError } from '../../api/client.js'
import { fetchSettings, frDate, listPublishedPackages, setDefaultPackage } from './admin-api.js'

function money(usd) {
  return typeof usd === 'number' && Number.isFinite(usd) ? `${usd.toFixed(2)} $` : '—'
}

/** Validation du paquet par défaut : liste publiée + proposition en attente. */
function DefaultPackage({ defaultPackage, packages, onValidate, busy }) {
  const [choice, setChoice] = useState('')
  const proposal = defaultPackage?.proposal ?? null
  const effective = defaultPackage?.effective ?? null
  const stored = defaultPackage?.stored ?? null

  return (
    <div className="admin-default-package">
      <h3>Version de prompt par défaut</h3>
      <p>
        Effectif : <strong>{effective ? `${effective.id} ${effective.version}` : 'aucun paquet publié'}</strong>
        {stored ? ' (validé)' : effective ? ' (dernier publié, par défaut)' : ''}.
      </p>
      {proposal ? (
        <p role="status" className="admin-message" data-testid="default-proposal">
          Proposition promptologue en attente : {proposal.id} {proposal.version}.
        </p>
      ) : null}
      <div className="admin-default-form">
        <label htmlFor="default-package-choice">Valider un paquet publié comme défaut</label>
        <select
          id="default-package-choice"
          value={choice}
          disabled={busy || packages.length === 0}
          onChange={(event) => setChoice(event.target.value)}
        >
          <option value="">— choisir —</option>
          {packages.map((p) => (
            <option key={`${p.id}@${p.version}`} value={`${p.id}@${p.version}`}>
              {p.id} {p.version}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || choice === ''}
          onClick={() => {
            const [id, version] = choice.split('@')
            onValidate(id, version)
          }}
        >
          Valider comme défaut
        </button>
      </div>
    </div>
  )
}

/** @param {object} props @param {typeof fetch} [props.fetchFn] couture de test */
export default function ReglagesSection({ fetchFn }) {
  const [settings, setSettings] = useState(null)
  const [packages, setPackages] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const [s, pkgs] = await Promise.all([fetchSettings(fetchFn), listPublishedPackages(fetchFn)])
      setSettings(s)
      setPackages(pkgs)
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof ApiUnavailableError ? err.message : 'Chargement impossible.')
    }
  }, [fetchFn])

  useEffect(() => {
    load()
  }, [load])

  async function onValidate(id, version) {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      await setDefaultPackage(id, version, fetchFn)
      setMessage(`Paquet par défaut : ${id} ${version}.`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Validation impossible.')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading' && !settings) {
    return <p role="status">Chargement des réglages…</p>
  }
  if (status === 'error') {
    return (
      <p role="alert" className="load-error">
        {error}
      </p>
    )
  }

  const demo = settings?.demo ?? {}
  const worker = settings?.worker ?? {}

  return (
    <section className="admin-reglages">
      <h2>Réglages plateforme</h2>

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

      <DefaultPackage
        defaultPackage={settings?.defaultPackage}
        packages={packages}
        onValidate={onValidate}
        busy={busy}
      />

      <h3>Plafonds de la démo publique</h3>
      <p className="privacy-note">
        Valeurs effectives. En v1 la démo se règle par variables d’environnement
        (<code>DEMO_*</code>, voir <code>api/config/demo.php</code>) — cette page les affiche
        seulement.
      </p>
      <table className="admin-table admin-demo">
        <tbody>
          <tr>
            <th scope="row">Démo activée</th>
            <td>{demo.enabled ? 'oui' : 'non'}</td>
          </tr>
          <tr>
            <th scope="row">Fournisseur / modèle</th>
            <td>
              {demo.provider} / {demo.model}
            </td>
          </tr>
          <tr>
            <th scope="row">Tokens max par requête</th>
            <td>{demo.maxTokensPerRequest}</td>
          </tr>
          <tr>
            <th scope="row">Requêtes / IP / heure</th>
            <td>{demo.perIpPerHour}</td>
          </tr>
          <tr>
            <th scope="row">Budget quotidien</th>
            <td>{money(demo.dailyBudgetUsd)}</td>
          </tr>
          <tr>
            <th scope="row">Tokens globaux / jour</th>
            <td>{demo.dailyGlobalTokens}</td>
          </tr>
        </tbody>
      </table>

      <h3>Worker de cartographie de masse</h3>
      <table className="admin-table admin-worker">
        <tbody>
          <tr>
            <th scope="row">Jobs en file (en attente + en cours)</th>
            <td data-testid="worker-queue">{worker.jobsInQueue ?? 0}</td>
          </tr>
          <tr>
            <th scope="row">Runs actifs</th>
            <td>{worker.activeRuns ?? 0}</td>
          </tr>
          <tr>
            <th scope="row">Dernière activité</th>
            <td>{worker.lastActivity ? frDate(worker.lastActivity) : 'jamais'}</td>
          </tr>
          <tr>
            <th scope="row">Terminés / échoués</th>
            <td>
              {worker.byStatus?.done ?? 0} / {worker.byStatus?.failed ?? 0}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}
