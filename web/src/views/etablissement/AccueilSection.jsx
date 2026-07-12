// Accueil de l'espace établissement (P11) : mes cohortes (création, code
// d'invitation, suppression en deux temps) + configuration LLM/budget.
// La garde de rôle est faite par EtablissementView : ici l'utilisateur EST
// établissement.

import { useCallback, useEffect, useState } from 'react'
import {
  createCohorte,
  deleteCohorte,
  fetchCohortes,
  fetchConfig,
  frDate,
  money,
  saveConfig,
} from './etablissement-api.js'

/**
 * Formulaire de configuration LLM + budget (contrat M8) :
 * - 'humanome' : clé plateforme gérée par Harmonia, facturée à l'usage (§7) ;
 * - 'endpoint' : URL compatible OpenAI de l'établissement (serveur local,
 *   Ollama — §3.7/§4.9) + clé chiffrée sodium côté serveur.
 * La clé n'est JAMAIS réaffichée : le champ reste vide, le serveur signale
 * seulement qu'une clé est enregistrée (hasApiKey) ; champ vide = inchangée.
 */
function ConfigForm({ config, onSaved, fetchFn }) {
  const [provider, setProvider] = useState(config.provider)
  const [endpointUrl, setEndpointUrl] = useState(config.endpointUrl)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(config.model)
  const [budget, setBudget] = useState(config.budgetCapUsd == null ? '' : String(config.budgetCapUsd))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  async function submit(event) {
    event.preventDefault()
    setError(null)
    setInfo(null)
    const budgetCapUsd = Number(budget)
    if (!Number.isFinite(budgetCapUsd) || budgetCapUsd < 0) {
      setError('Le plafond de budget doit être un montant en dollars (0 ou plus).')
      return
    }
    if (provider === 'endpoint' && endpointUrl.trim() === '') {
      setError('Indiquez l’URL de votre point d’accès compatible OpenAI.')
      return
    }
    const body = { provider, budgetCapUsd }
    if (provider === 'endpoint') {
      body.endpointUrl = endpointUrl.trim()
      if (model.trim() !== '') body.model = model.trim()
      if (apiKey !== '') body.apiKey = apiKey // jamais renvoyée par le serveur
    }
    setBusy(true)
    try {
      await saveConfig(body, fetchFn)
      setApiKey('') // la clé ne reste pas affichée après enregistrement
      setInfo('Configuration enregistrée.')
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="etab-config-form" onSubmit={submit}>
      <fieldset>
        <legend>Fournisseur LLM</legend>
        <label>
          <input
            type="radio"
            name="etab-provider"
            value="humanome"
            checked={provider === 'humanome'}
            onChange={() => setProvider('humanome')}
          />{' '}
          Service humanome — clé « qualité établissement » gérée par Harmonia, facturée à
          l’usage (cahier §7)
        </label>
        <label>
          <input
            type="radio"
            name="etab-provider"
            value="endpoint"
            checked={provider === 'endpoint'}
            onChange={() => setProvider('endpoint')}
          />{' '}
          Mon infrastructure — URL compatible OpenAI (serveur local, Ollama… — cahier §3.7)
        </label>
      </fieldset>

      {provider === 'endpoint' ? (
        <div className="etab-config-endpoint">
          <label htmlFor="etab-endpoint-url">URL du point d’accès</label>
          <input
            id="etab-endpoint-url"
            type="url"
            placeholder="https://llm.mon-etablissement.fr/v1"
            value={endpointUrl}
            onChange={(event) => setEndpointUrl(event.target.value)}
          />
          <label htmlFor="etab-model">Modèle</label>
          <input
            id="etab-model"
            type="text"
            placeholder="ex. llama3.1:70b"
            value={model}
            onChange={(event) => setModel(event.target.value)}
          />
          <label htmlFor="etab-api-key">Clé API</label>
          <input
            id="etab-api-key"
            type="password"
            autoComplete="off"
            placeholder={
              config.hasApiKey
                ? 'Une clé est enregistrée (jamais réaffichée) — saisir pour remplacer'
                : 'Clé du point d’accès (chiffrée côté serveur)'
            }
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <p className="privacy-note">
            La clé est chiffrée (libsodium) côté serveur et n’est jamais réaffichée ni renvoyée
            par l’API. Laissez le champ vide pour conserver la clé actuelle.
          </p>
        </div>
      ) : null}

      <div className="etab-config-budget">
        <label htmlFor="etab-budget">Plafond de dépense (USD)</label>
        <input
          id="etab-budget"
          type="number"
          min="0"
          step="0.01"
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
        />
        <p data-testid="etab-depense">
          Dépense courante : <strong>{money(config.spentUsd)}</strong>
          {config.budgetCapUsd != null ? <> sur un plafond de {money(config.budgetCapUsd)}</> : null}.
          Au plafond, les traitements s’arrêtent automatiquement (jobs « budget dépassé »,
          réactivables en montant le plafond).
        </p>
      </div>

      <button type="submit" className="button button-primary" disabled={busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer la configuration'}
      </button>
      {error ? (
        <p role="alert" className="load-error">
          {error}
        </p>
      ) : null}
      {info ? (
        <p role="status" className="account-notice">
          {info}
        </p>
      ) : null}
    </form>
  )
}

/**
 * @param {{fetchFn?: typeof fetch}} props seam de test (pattern cartographe)
 */
export default function AccueilSection({ fetchFn }) {
  const [cohortes, setCohortes] = useState(null) // null = chargement
  const [config, setConfig] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [nom, setNom] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [created, setCreated] = useState(null) // {nom, codeInvitation}
  const [armedDelete, setArmedDelete] = useState(null) // id en attente de confirmation

  const reload = useCallback(async () => {
    setLoadError(null)
    try {
      const [nextCohortes, nextConfig] = await Promise.all([
        fetchCohortes(fetchFn),
        fetchConfig(fetchFn),
      ])
      setCohortes(nextCohortes)
      setConfig(nextConfig)
    } catch (error) {
      setCohortes((current) => current ?? [])
      setLoadError(error.message)
    }
  }, [fetchFn])

  useEffect(() => {
    reload()
  }, [reload])

  async function submitCreate(event) {
    event.preventDefault()
    setCreateError(null)
    setCreated(null)
    const cleanNom = nom.trim()
    if (cleanNom === '') {
      setCreateError('Donnez un nom à la cohorte (ex. « BTS SIO 2026 »).')
      return
    }
    setCreateBusy(true)
    try {
      const result = await createCohorte(cleanNom, fetchFn)
      setNom('')
      setCreated({ nom: cleanNom, codeInvitation: result?.codeInvitation ?? null })
      await reload()
    } catch (error) {
      setCreateError(error.message)
    } finally {
      setCreateBusy(false)
    }
  }

  async function onDelete(id) {
    if (armedDelete !== id) {
      setArmedDelete(id) // suppression en DEUX temps : armer puis confirmer
      return
    }
    setArmedDelete(null)
    try {
      await deleteCohorte(id, fetchFn)
      await reload()
    } catch (error) {
      setLoadError(error.message)
    }
  }

  return (
    <div className="etab-accueil">
      {loadError ? (
        <p role="alert" className="load-error">
          {loadError}
        </p>
      ) : null}

      <section className="espace-bloc" aria-label="Mes cohortes">
        <h2>Mes cohortes</h2>
        <form className="etab-create-form" onSubmit={submitCreate}>
          <label htmlFor="etab-cohorte-nom">Nom de la cohorte</label>
          <input
            id="etab-cohorte-nom"
            type="text"
            placeholder="ex. BTS SIO 2026"
            value={nom}
            onChange={(event) => setNom(event.target.value)}
          />
          <button type="submit" className="button" disabled={createBusy}>
            {createBusy ? 'Création…' : 'Créer la cohorte'}
          </button>
        </form>
        {createError ? (
          <p role="alert" className="load-error">
            {createError}
          </p>
        ) : null}
        {created ? (
          <p role="status" className="account-notice" data-testid="etab-cohorte-creee">
            Cohorte « {created.nom} » créée.
            {created.codeInvitation ? (
              <>
                {' '}
                Code d’invitation à transmettre aux apprenants :{' '}
                <code>{created.codeInvitation}</code> (ils le saisissent dans leur espace,
                rubrique « Mes cohortes », avec leur consentement explicite).
              </>
            ) : null}
          </p>
        ) : null}

        {cohortes === null ? (
          <p role="status">Chargement…</p>
        ) : cohortes.length === 0 ? (
          <p className="privacy-note">Aucune cohorte pour l’instant : créez-en une ci-dessus.</p>
        ) : (
          <div className="table-scroll">
            <table data-testid="etab-cohortes">
              <thead>
                <tr>
                  <th scope="col">Cohorte</th>
                  <th scope="col">Code d’invitation</th>
                  <th scope="col">Membres</th>
                  <th scope="col">Créée le</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {cohortes.map((cohorte) => (
                  <tr key={cohorte.id}>
                    <td>
                      <a href={`#/etablissement/cohorte/${cohorte.id}`}>{cohorte.nom}</a>
                    </td>
                    <td>
                      <code>{cohorte.codeInvitation ?? cohorte.code_invitation ?? '—'}</code>
                    </td>
                    <td>{cohorte.membres ?? cohorte.nbMembres ?? '—'}</td>
                    <td>{frDate(cohorte.createdAt ?? cohorte.created_at)}</td>
                    <td>
                      <a className="button" href={`#/etablissement/cohorte/${cohorte.id}`}>
                        Ouvrir
                      </a>{' '}
                      <button type="button" className="button" onClick={() => onDelete(cohorte.id)}>
                        {armedDelete === cohorte.id ? 'Confirmer la suppression' : 'Supprimer'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="espace-bloc" aria-label="Configuration LLM et budget">
        <h2>Configuration LLM et budget</h2>
        {config === null ? (
          <p role="status">Chargement…</p>
        ) : (
          <ConfigForm config={config} onSaved={reload} fetchFn={fetchFn} />
        )}
      </section>
    </div>
  )
}
