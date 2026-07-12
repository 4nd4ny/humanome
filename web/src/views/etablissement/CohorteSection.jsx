// Détail d'une cohorte (P11) : membres (consentement, dépôt de portfolio),
// lancement d'un run de MASSE (paquet publié + confirmation du coût estimé)
// et suivi d'avancement EN DIRECT (polling 5 s : jobs par statut, coût cumulé,
// erreurs par membre, annulation).
//
// Rappel du contrat M8 : un job = (membre, journée) ; seuls les membres ayant
// CONSENTI et DÉPOSÉ leur portfolio dans la cohorte sont enfilés — les
// portfolios des apprenants sont locaux par défaut (client-first, ADR-001),
// le dépôt est leur opt-in explicite pour la masse B2B.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cancelRun,
  DEFAULT_DAY_CHARS,
  estimateMassRun,
  fetchCohorte,
  fetchConfig,
  fetchPublishedPackages,
  fetchRun,
  frDate,
  JOB_STATUS_LABELS,
  launchRun,
  money,
  SERVICE_MODEL,
} from './etablissement-api.js'

export const POLL_INTERVAL_MS = 5000

/** Tableau d'avancement d'un run (jobs par statut, coût, erreurs, annuler). */
function RunProgress({ run, onCancel, cancelBusy }) {
  const total = Object.values(run.jobs).reduce((sum, n) => sum + n, 0)
  // mass_runs.status: active | done | failed | cancelled | budget_exceeded.
  const active = run.statut === 'active' || run.jobs.queued > 0 || run.jobs.running > 0
  return (
    <div className="etab-run-progress" data-testid="etab-run-progress">
      <p role="status">
        Run <code>{run.runId}</code> — statut : <strong>{run.statut}</strong> ({run.jobs.done}/
        {total} jobs terminés), coût cumulé : <strong>{money(run.coutUsd)}</strong>.
      </p>
      <div className="table-scroll">
        <table data-testid="etab-run-jobs">
          <thead>
            <tr>
              {Object.entries(JOB_STATUS_LABELS).map(([status, label]) => (
                <th scope="col" key={status}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {Object.keys(JOB_STATUS_LABELS).map((status) => (
                <td key={status} data-testid={`jobs-${status}`}>
                  {run.jobs[status]}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {run.jobs.budget_exceeded > 0 ? (
        <p role="alert" className="load-error">
          Plafond de budget atteint : {run.jobs.budget_exceeded} job(s) en attente de budget.
          Montez le plafond dans la configuration puis relancez pour les réactiver.
        </p>
      ) : null}
      {run.erreurs.length > 0 ? (
        <div className="etab-run-erreurs">
          <h4>Erreurs par membre</h4>
          <ul data-testid="etab-run-erreurs">
            {run.erreurs.map((erreur, index) => (
              <li key={index}>
                <strong>{erreur.membre}</strong> — {erreur.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {active ? (
        <button type="button" className="button" onClick={onCancel} disabled={cancelBusy}>
          {cancelBusy ? 'Annulation…' : 'Annuler le run'}
        </button>
      ) : null}
    </div>
  )
}

/**
 * @param {object} props
 * @param {string} props.id identifiant de la cohorte (segment d'URL)
 * @param {typeof fetch} [props.fetchFn] seam de test
 */
export default function CohorteSection({ id, fetchFn }) {
  const [cohorte, setCohorte] = useState(null)
  const [membres, setMembres] = useState(null)
  const [config, setConfig] = useState(null)
  const [packages, setPackages] = useState([])
  const [loadError, setLoadError] = useState(null)

  // Assistant de lancement : paquet + membres cochés -> estimation -> POST.
  const [selectedPackage, setSelectedPackage] = useState('')
  const [selectedMembers, setSelectedMembers] = useState(null) // Set d'userIds, null = pas encore initialisé
  const [estimate, setEstimate] = useState(null) // {membres, journees, costUsd, ...}
  const [launchBusy, setLaunchBusy] = useState(false)
  const [launchError, setLaunchError] = useState(null)

  // Run en cours : {runId} après POST, puis état poll-é toutes les 5 s.
  const [run, setRun] = useState(null)
  const [runId, setRunId] = useState(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  const pollRef = useRef(null)

  const reload = useCallback(async () => {
    setLoadError(null)
    try {
      const [detail, nextConfig, nextPackages] = await Promise.all([
        fetchCohorte(id, fetchFn),
        fetchConfig(fetchFn),
        fetchPublishedPackages(fetchFn),
      ])
      setCohorte(detail.cohorte)
      setMembres(detail.membres)
      setConfig(nextConfig)
      setPackages(nextPackages)
      setSelectedMembers(
        (current) =>
          current ??
          new Set(detail.membres.filter((m) => m.portfolio).map((m) => String(m.userId))),
      )
      if (nextPackages.length > 0) {
        setSelectedPackage((current) => current || `${nextPackages[0].id}@${nextPackages[0].version}`)
      }
    } catch (error) {
      setMembres((current) => current ?? [])
      setLoadError(error.message)
    }
  }, [id, fetchFn])

  useEffect(() => {
    reload()
  }, [reload])

  // Polling 5 s de l'avancement tant qu'un run est suivi.
  useEffect(() => {
    if (!runId) return undefined
    let alive = true
    async function poll() {
      try {
        const next = await fetchRun(runId, fetchFn)
        if (alive) setRun(next)
      } catch {
        /* un raté de polling n'efface pas l'état affiché */
      }
    }
    poll()
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      alive = false
      clearInterval(pollRef.current)
    }
  }, [runId, fetchFn])

  const deposited = (membres ?? []).filter((m) => m.portfolio)
  const chosen = deposited.filter((m) => selectedMembers?.has(String(m.userId)))

  function toggleMember(userId) {
    setSelectedMembers((current) => {
      const next = new Set(current ?? [])
      const key = String(userId)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setEstimate(null) // l'estimation affichée ne correspond plus à la sélection
  }

  function computeEstimate() {
    setLaunchError(null)
    if (!selectedPackage) {
      setLaunchError('Choisissez un paquet de prompts publié.')
      return
    }
    if (chosen.length === 0) {
      setLaunchError(
        'Aucun membre sélectionné n’a déposé son portfolio : le run n’aurait aucun job.',
      )
      return
    }
    const totalJournees = chosen.reduce((sum, m) => sum + (m.portfolio?.journees ?? 0), 0)
    const sizes = chosen.map((m) => m.portfolio?.taille).filter((t) => Number.isFinite(t) && t > 0)
    const avgDayChars =
      sizes.length > 0 && totalJournees > 0
        ? Math.round(sizes.reduce((a, b) => a + b, 0) / totalJournees)
        : DEFAULT_DAY_CHARS
    // Le modèle configuré de l'établissement prime (c'est lui que le worker
    // facture) ; sans configuration, le modèle de référence du service.
    const model = config?.model || SERVICE_MODEL
    setEstimate({
      membres: chosen.length,
      journees: totalJournees,
      model,
      ...estimateMassRun({ totalJournees, avgDayChars, model }),
    })
  }

  async function confirmLaunch() {
    setLaunchBusy(true)
    setLaunchError(null)
    try {
      const [packageId, packageVersion] = selectedPackage.split('@')
      const body = {
        promptPackageId: packageId,
        promptPackageVersion: packageVersion,
      }
      // membres? est optionnel : omis quand tous les déposants sont cochés.
      if (chosen.length !== deposited.length) {
        body.membres = chosen.map((m) => m.userId)
      }
      const result = await launchRun(id, body, fetchFn)
      setEstimate(null)
      setRun(null)
      setRunId(result?.runId ?? null)
    } catch (error) {
      setLaunchError(error.message)
    } finally {
      setLaunchBusy(false)
    }
  }

  async function onCancel() {
    if (!runId) return
    setCancelBusy(true)
    try {
      await cancelRun(runId, fetchFn)
      const next = await fetchRun(runId, fetchFn)
      setRun(next)
    } catch (error) {
      setLaunchError(error.message)
    } finally {
      setCancelBusy(false)
    }
  }

  const budgetRestant =
    config && config.budgetCapUsd != null ? config.budgetCapUsd - config.spentUsd : null

  return (
    <div className="etab-cohorte">
      <p>
        <a href="#/etablissement">← Toutes mes cohortes</a>
      </p>
      <h2>{cohorte ? `Cohorte « ${cohorte.nom} »` : 'Cohorte'}</h2>
      {cohorte?.codeInvitation ? (
        <p>
          Code d’invitation : <code>{cohorte.codeInvitation}</code> — l’apprenant le saisit dans
          son espace (« Mes cohortes ») et donne son consentement explicite, puis dépose son
          portfolio dans la cohorte.
        </p>
      ) : null}
      {loadError ? (
        <p role="alert" className="load-error">
          {loadError}
        </p>
      ) : null}

      <section className="espace-bloc" aria-label="Membres de la cohorte">
        <h3>Membres</h3>
        {membres === null ? (
          <p role="status">Chargement…</p>
        ) : membres.length === 0 ? (
          <p className="privacy-note">
            Aucun membre : transmettez le code d’invitation à vos apprenants.
          </p>
        ) : (
          <div className="table-scroll">
            <table data-testid="etab-membres">
              <thead>
                <tr>
                  <th scope="col">Run</th>
                  <th scope="col">Membre</th>
                  <th scope="col">Consentement</th>
                  <th scope="col">Portfolio déposé</th>
                  <th scope="col">Avancement</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {membres.map((membre) => (
                  <tr key={membre.userId}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Inclure ${membre.displayName} dans le run`}
                        disabled={!membre.portfolio}
                        checked={Boolean(membre.portfolio && selectedMembers?.has(String(membre.userId)))}
                        onChange={() => toggleMember(membre.userId)}
                      />
                    </td>
                    <td>{membre.displayName}</td>
                    <td>
                      {membre.consentAt ? (
                        <span className="verdict-badge etablie">
                          Consenti le {frDate(membre.consentAt)}
                        </span>
                      ) : (
                        <span className="verdict-badge renvoi">Sans consentement</span>
                      )}
                    </td>
                    <td>
                      {membre.portfolio ? (
                        <>
                          « {membre.portfolio.titre} » — {membre.portfolio.journees} journée(s)
                          {membre.portfolio.deposeLe
                            ? `, déposé le ${frDate(membre.portfolio.deposeLe)}`
                            : ''}
                        </>
                      ) : (
                        'Non déposé'
                      )}
                    </td>
                    <td>
                      {membre.avancement && membre.avancement.jobsTotal > 0
                        ? `${membre.avancement.jobsDone}/${membre.avancement.jobsTotal} journées`
                        : '—'}
                    </td>
                    <td>
                      <a className="button" href={`#/etablissement/membre/${membre.userId}`}>
                        Documents
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="espace-bloc" aria-label="Lancer un run de masse">
        <h3>Lancer un run de masse</h3>
        <p>
          Un job par (membre, journée) : seuls les membres consentis <strong>ayant déposé</strong>{' '}
          leur portfolio sont traités. L’extraction tourne côté serveur (ticks courts, reprise
          incrémentale) ; la fusion est calculée dans votre navigateur à l’affichage.
        </p>
        {packages.length === 0 ? (
          <p className="privacy-note">
            Aucun paquet de prompts publié n’est disponible : le run de masse exige un paquet
            stocké en base (espace promptologue).
          </p>
        ) : (
          <>
            <label htmlFor="etab-package">Paquet de prompts</label>{' '}
            <select
              id="etab-package"
              value={selectedPackage}
              onChange={(event) => {
                setSelectedPackage(event.target.value)
                setEstimate(null)
              }}
            >
              {packages.map((pkg) => (
                <option key={`${pkg.id}@${pkg.version}`} value={`${pkg.id}@${pkg.version}`}>
                  {pkg.id} @ {pkg.version}
                  {pkg.defaut ? ' (défaut)' : ''}
                </option>
              ))}
            </select>{' '}
            <button type="button" className="button" onClick={computeEstimate}>
              Estimer le coût
            </button>
          </>
        )}
        {launchError ? (
          <p role="alert" className="load-error">
            {launchError}
          </p>
        ) : null}
        {estimate ? (
          <div className="etab-run-estimate" data-testid="etab-run-estimate">
            <p>
              <strong>{estimate.membres}</strong> membre(s) sélectionné(s),{' '}
              <strong>{estimate.journees}</strong> journée(s) au total, soit{' '}
              <strong>{estimate.totalCalls}</strong> appels LLM (modèle{' '}
              <code>{estimate.model}</code>). Coût estimé :{' '}
              <strong data-testid="etab-cout-estime">
                {estimate.costUsd == null ? 'inconnu (modèle hors table de prix)' : money(estimate.costUsd)}
              </strong>
              .
            </p>
            {budgetRestant != null && estimate.costUsd != null && estimate.costUsd > budgetRestant ? (
              <p role="alert" className="load-error">
                Attention : l’estimation dépasse le budget restant ({money(budgetRestant)}) —
                les jobs excédentaires passeront en « budget dépassé ».
              </p>
            ) : null}
            <p className="privacy-note">{estimate.disclaimer}</p>
            <button
              type="button"
              className="button button-primary"
              onClick={confirmLaunch}
              disabled={launchBusy}
            >
              {launchBusy ? 'Lancement…' : 'Confirmer et lancer le run'}
            </button>
          </div>
        ) : null}
      </section>

      {runId ? (
        <section className="espace-bloc" aria-label="Avancement du run">
          <h3>Avancement</h3>
          {run ? (
            <RunProgress run={run} onCancel={onCancel} cancelBusy={cancelBusy} />
          ) : (
            <p role="status">Run lancé — chargement de l’avancement…</p>
          )}
          <p className="privacy-note">Actualisation automatique toutes les 5 secondes.</p>
        </section>
      ) : null}
    </div>
  )
}
