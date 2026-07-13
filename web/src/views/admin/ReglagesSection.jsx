// Section « Réglages » de l'administration (P12.1, cahier §3.8/§4.10 ;
// chantier A) :
// - démo publique ÉDITABLE : grand interrupteur activé/désactivé (le geste
//   smartphone — allumer avant une présentation, éteindre en partant), puis
//   modèle et plafonds, chaque champ avec sa valeur effective, son origine
//   (base/env/fichier/défaut) et ses bornes. Enregistrer = PUT partiel sur
//   api/admin/demo-config (effet immédiat, sans redéploiement) ;
//   Réinitialiser = DELETE (retour env/fichier). La clé API n'est jamais
//   affichée (seulement « configurée » / « absente ») et le fournisseur
//   n'est pas éditable (clé plateforme Anthropic).
// - version de prompt par défaut (settings default_prompt_package, P10) ;
// - état du worker de masse : jobs en file, par statut, dernière activité.

import { useCallback, useEffect, useState } from 'react'
import { ApiError, ApiUnavailableError } from '../../api/client.js'
import {
  fetchDemoConfig,
  fetchSettings,
  frDate,
  listPublishedPackages,
  resetDemoConfig,
  saveDemoConfig,
  setDefaultPackage,
  toggleDemo,
} from './admin-api.js'

function money(usd) {
  return typeof usd === 'number' && Number.isFinite(usd) ? `${usd.toFixed(2)} $` : '—'
}

/** Champs numériques éditables de la démo, dans l'ordre d'affichage. */
const DEMO_NUMERIC_FIELDS = [
  { name: 'maxTokensPerRequest', label: 'Tokens max par requête', min: 256, max: 16000 },
  { name: 'dailyBudgetUsd', label: 'Budget quotidien (USD)', min: 0, max: 1000, float: true },
  { name: 'perIpPerHour', label: 'Requêtes / IP / heure', min: 1, max: 1000 },
  { name: 'powDifficultyBits', label: 'Preuve de travail (bits)', min: 8, max: 24 },
  { name: 'maxInputChars', label: 'Entrée max (caractères)', min: 1000, max: 200000 },
  { name: 'upstreamTimeoutSeconds', label: 'Délai amont (secondes)', min: 10, max: 300 },
  { name: 'dailyGlobalTokens', label: 'Tokens globaux / jour', min: 10000, max: 50000000 },
]

const SOURCE_LABELS = {
  base: 'réglage base',
  env: 'env',
  fichier: 'fichier',
  defaut: 'défaut',
}

const OTHER_MODEL = '__autre__'

/** Brouillon de formulaire (chaînes) depuis les valeurs effectives. */
function draftFrom(config) {
  const effective = config?.effective ?? {}
  const allowed = Array.isArray(config?.allowedModels) ? config.allowedModels : []
  const draft = {
    modelChoice: allowed.includes(effective.model) ? effective.model : OTHER_MODEL,
    model: effective.model ?? '',
  }
  for (const field of DEMO_NUMERIC_FIELDS) {
    draft[field.name] = effective[field.name] === undefined ? '' : String(effective[field.name])
  }
  return draft
}

/** Badge d'origine d'une valeur effective (base/env/fichier/défaut). */
function SourceBadge({ sources, field }) {
  const source = sources?.[field] ?? 'defaut'
  return (
    <span className={`admin-source admin-source-${source}`} title="Origine de la valeur effective">
      {SOURCE_LABELS[source] ?? source}
    </span>
  )
}

/** Démo publique éditable : interrupteur + modèle + plafonds. */
function DemoSettings({ config, busy, onToggle, onSave, onReset }) {
  const [draft, setDraft] = useState(() => draftFrom(config))

  useEffect(() => {
    setDraft(draftFrom(config))
  }, [config])

  const effective = config?.effective ?? {}
  const sources = config?.sources ?? {}
  const allowed = Array.isArray(config?.allowedModels) ? config.allowedModels : []
  const enabled = Boolean(effective.enabled)

  function set(name, value) {
    setDraft((prev) => ({ ...prev, [name]: value }))
  }

  /** Différences brouillon -> valeurs effectives (PUT partiel), ou {error}. */
  function buildPatch() {
    const patch = {}
    const model = (draft.modelChoice === OTHER_MODEL ? draft.model : draft.modelChoice).trim()
    if (model === '') return { error: 'Le modèle ne peut pas être vide.' }
    if (model !== effective.model) patch.model = model

    for (const field of DEMO_NUMERIC_FIELDS) {
      const raw = String(draft[field.name] ?? '')
        .trim()
        .replace(',', '.')
      if (raw === '') return { error: `Champ vide : ${field.label}.` }
      const value = field.float ? Number.parseFloat(raw) : Number.parseInt(raw, 10)
      if (!Number.isFinite(value)) return { error: `Valeur invalide pour « ${field.label} ».` }
      if (value !== effective[field.name]) patch[field.name] = value
    }
    return { patch }
  }

  return (
    <div className="admin-demo">
      <h3>Démo publique</h3>

      <button
        type="button"
        className={`admin-demo-toggle ${enabled ? 'is-on' : 'is-off'}`}
        role="switch"
        aria-checked={enabled}
        disabled={busy}
        onClick={() => onToggle(!enabled)}
      >
        <span className="admin-demo-toggle-track" aria-hidden="true">
          <span className="admin-demo-toggle-thumb" />
        </span>
        <span className="admin-demo-toggle-label">
          Démo publique : <strong>{enabled ? 'activée' : 'désactivée'}</strong>
        </span>
      </button>
      <p className="privacy-note">
        Un clic suffit : effet immédiat sur <code>POST /api/llm</code>, sans redéploiement
        (allumer avant une présentation, éteindre en partant).{' '}
        <SourceBadge sources={sources} field="enabled" />
      </p>

      <p className="privacy-note">
        Fournisseur : <strong>{effective.provider ?? 'anthropic'}</strong> (non modifiable — la démo
        utilise la clé plateforme Anthropic). Clé API :{' '}
        <strong>{config?.apiKeyConfigured ? 'configurée' : 'absente'}</strong> (environnement
        serveur uniquement, jamais affichée).
      </p>

      <form
        className="admin-demo-form"
        // noValidate : les bornes min/max restent affichées comme repères,
        // mais c'est le serveur qui valide (422 -> message français précis).
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          const { patch, error } = buildPatch()
          onSave(patch ?? null, error ?? null)
        }}
      >
        <div className="admin-field">
          <label htmlFor="demo-model">Modèle</label>
          <div className="admin-field-input">
            <select
              id="demo-model"
              value={draft.modelChoice}
              disabled={busy}
              onChange={(event) => {
                const choice = event.target.value
                setDraft((prev) => ({
                  ...prev,
                  modelChoice: choice,
                  model: choice === OTHER_MODEL ? prev.model : choice,
                }))
              }}
            >
              {allowed.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={OTHER_MODEL}>autre…</option>
            </select>
            {draft.modelChoice === OTHER_MODEL ? (
              <input
                type="text"
                aria-label="Identifiant de modèle libre"
                placeholder="ex. claude-fable-5"
                value={draft.model}
                disabled={busy}
                onChange={(event) => set('model', event.target.value)}
              />
            ) : null}
            <SourceBadge sources={sources} field="model" />
          </div>
        </div>

        {DEMO_NUMERIC_FIELDS.map((field) => (
          <div className="admin-field" key={field.name}>
            <label htmlFor={`demo-${field.name}`}>{field.label}</label>
            <div className="admin-field-input">
              <input
                id={`demo-${field.name}`}
                type="number"
                inputMode={field.float ? 'decimal' : 'numeric'}
                min={field.min}
                max={field.max}
                step={field.float ? '0.01' : '1'}
                value={draft[field.name] ?? ''}
                disabled={busy}
                onChange={(event) => set(field.name, event.target.value)}
              />
              <span className="admin-field-bounds">
                {field.min} – {field.max}
              </span>
              <SourceBadge sources={sources} field={field.name} />
            </div>
          </div>
        ))}

        <div className="admin-demo-actions">
          <button type="submit" disabled={busy}>
            Enregistrer
          </button>
          <button type="button" className="admin-button-secondary" disabled={busy} onClick={onReset}>
            Réinitialiser (revenir aux valeurs env/fichier)
          </button>
        </div>
      </form>
    </div>
  )
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
  const [demo, setDemo] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const [s, pkgs, demoConfig] = await Promise.all([
        fetchSettings(fetchFn),
        listPublishedPackages(fetchFn),
        fetchDemoConfig(fetchFn),
      ])
      setSettings(s)
      setPackages(pkgs)
      setDemo(demoConfig)
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof ApiUnavailableError ? err.message : 'Chargement impossible.')
    }
  }, [fetchFn])

  useEffect(() => {
    load()
  }, [load])

  /** Enveloppe une mutation démo : busy + messages FR + gestion 422. */
  async function runDemoAction(action, successMessage) {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const next = await action()
      setDemo(next)
      setMessage(successMessage(next))
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof ApiUnavailableError
          ? err.message
          : 'Enregistrement impossible.',
      )
    } finally {
      setBusy(false)
    }
  }

  function onToggle(enabled) {
    runDemoAction(
      () => toggleDemo(enabled, fetchFn),
      (next) => (next.effective?.enabled ? 'Démo publique activée.' : 'Démo publique désactivée.'),
    )
  }

  function onSaveDemo(patch, clientError) {
    if (clientError) {
      setMessage(null)
      setError(clientError)
      return
    }
    if (!patch || Object.keys(patch).length === 0) {
      setError(null)
      setMessage('Aucune modification à enregistrer.')
      return
    }
    runDemoAction(
      () => saveDemoConfig(patch, fetchFn),
      () => 'Réglages de la démo enregistrés (effet immédiat).',
    )
  }

  function onResetDemo() {
    runDemoAction(
      () => resetDemoConfig(fetchFn),
      () => 'Réglages de la démo réinitialisés (valeurs env/fichier).',
    )
  }

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

      <DemoSettings
        config={demo}
        busy={busy}
        onToggle={onToggle}
        onSave={onSaveDemo}
        onReset={onResetDemo}
      />

      <DefaultPackage
        defaultPackage={settings?.defaultPackage}
        packages={packages}
        onValidate={onValidate}
        busy={busy}
      />

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
          <tr>
            <th scope="row">Budget quotidien démo (rappel)</th>
            <td>{money(demo?.effective?.dailyBudgetUsd)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}
