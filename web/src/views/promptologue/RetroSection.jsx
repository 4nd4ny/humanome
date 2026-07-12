// Régénération rétrospective à l'unité (P10.6, cahier §3.4 et §8).
//
// Sélectionner une cartographie serveur de type JOUR + une version du
// référentiel PLUS RÉCENTE -> relancer extractDay (service humanome mock en
// dev, ou clé perso) -> tableau des compétences nouvellement détectées /
// disparues vs l'original.
//
// RGPD : le texte de la journée n'est PAS sur le serveur (client-first §6.1) —
// il est retrouvé dans les portfolios locaux, ou collé manuellement.

import { useEffect, useMemo, useState } from 'react'
import { extractDay } from '@engine/pipeline/extract.js'
import { PROVIDERS, createProviderBundle } from '../../lib/run-launcher.js'
import { createPortfolioStore } from '../../lib/portfolio-store.js'
import { compareRetroDocs, findLocalDayText, newerReferentielVersions } from './retro.js'

/**
 * @param {object} props
 * @param {object} props.api client createPromptologueApi
 * @param {object} [props.deps] coutures de test : {portfolioStore,
 *   extractDayFn, createBundleFn}
 */
export default function RetroSection({ api, deps = {} }) {
  const extractDayFn = deps.extractDayFn ?? extractDay
  const createBundleFn = deps.createBundleFn ?? createProviderBundle
  const portfolioStore = useMemo(
    () => deps.portfolioStore ?? createPortfolioStore(),
    [deps.portfolioStore],
  )

  const [cartos, setCartos] = useState({ status: 'loading', list: [], error: null })
  const [refVersions, setRefVersions] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [original, setOriginal] = useState(null) // {id, document}
  const [dayText, setDayText] = useState('')
  const [dayTextSource, setDayTextSource] = useState(null)
  const [refChoice, setRefChoice] = useState('')
  const [providerMode, setProviderMode] = useState('humanome')
  const [providerId, setProviderId] = useState(PROVIDERS[0].id)
  const [apiKey, setApiKey] = useState('')
  const [running, setRunning] = useState(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // {comparison, refVersion}

  useEffect(() => {
    let alive = true
    api
      .listCartographies()
      .then((list) => alive && setCartos({ status: 'ready', list: Array.isArray(list) ? list : [], error: null }))
      .catch((err) => {
        if (!alive) return
        setCartos({
          status: 'error',
          list: [],
          error:
            err?.status === 401 || err?.status === 403
              ? 'Les cartographies serveur nécessitent une session avec des cartographies stockées (opt-in apprenant).'
              : (err?.message ?? 'Cartographies serveur indisponibles.'),
        })
      })
    api
      .listReferentielVersions()
      .then((versions) => alive && setRefVersions(Array.isArray(versions) ? versions : []))
      .catch(() => alive && setRefVersions([]))
    return () => {
      alive = false
    }
  }, [api])

  async function selectCarto(id) {
    setSelectedId(id)
    setOriginal(null)
    setResult(null)
    setError(null)
    setDayText('')
    setDayTextSource(null)
    if (id === '') return
    try {
      const data = await api.getCartography(id)
      const document = data?.document ?? data
      if (document?.kind !== 'cartographie-jour') {
        setError(
          'Cette cartographie n’est pas une cartographie de journée : la régénération rétrospective (v1) opère à l’unité, jour par jour.',
        )
        return
      }
      setOriginal({ id, document })
      const local = findLocalDayText(await portfolioStore.list().catch(() => []), document.date)
      if (local) {
        setDayText(local.texte)
        setDayTextSource(`retrouvé dans « ${local.portfolioTitre} » (local)`)
      } else {
        setDayTextSource(null)
      }
    } catch (err) {
      setError(err?.message ?? 'Chargement de la cartographie impossible.')
    }
  }

  const newerVersions = newerReferentielVersions(refVersions, null)

  async function execute() {
    setError(null)
    setResult(null)
    if (!original) return
    if (refChoice === '') {
      setError('Choisissez une version du référentiel (plus récente que celle du run d’origine).')
      return
    }
    if (dayText.trim() === '') {
      setError(
        'Texte de la journée introuvable en local : collez-le ci-dessus (il n’est jamais stocké sur le serveur, RGPD §6.1).',
      )
      return
    }
    setRunning('Régénération en cours…')
    try {
      const referentiel = await api.getReferentielVersion(refChoice)
      const bundle = createBundleFn(
        providerMode === 'humanome'
          ? { mode: 'humanome' }
          : { mode: 'cle', provider: providerId, apiKey },
      )
      if (bundle.prime) await bundle.prime()
      const regenerated = await extractDayFn({
        dayText,
        date: original.document.date,
        referentiel: referentiel?.document ?? referentiel,
        provider: bundle.provider,
        model: bundle.model,
        maxTokens: bundle.maxTokens,
        kairosOptional: true,
      })
      setResult({ comparison: compareRetroDocs(original.document, regenerated), refVersion: refChoice })
    } catch (err) {
      setError(err?.message ?? String(err))
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="promptologue-retro">
      <h2>Régénération rétrospective</h2>
      <p>
        Relancer la cartographie d’une journée existante avec un référentiel plus récent, pour
        retrouver les compétences nouvellement ajoutées (cahier §8) — à l’unité en v1.
      </p>

      {cartos.status === 'loading' ? <p role="status">Chargement des cartographies…</p> : null}
      {cartos.status === 'error' ? (
        <p role="alert" className="load-error">
          {cartos.error}
        </p>
      ) : null}

      {cartos.status === 'ready' ? (
        <label className="promptologue-field">
          Cartographie serveur (jour) d’origine
          <select
            value={selectedId}
            onChange={(event) => selectCarto(event.target.value)}
            aria-label="Cartographie d’origine"
          >
            <option value="">— choisir —</option>
            {cartos.list.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.titre ?? c.title ?? `Cartographie ${c.id}`}
                {c.kind ? ` (${c.kind})` : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {original ? (
        <>
          <p role="status" data-testid="retro-original">
            Journée du <strong>{original.document.date}</strong>
            {dayTextSource ? ` — texte ${dayTextSource}.` : ' — texte local introuvable, collez-le :'}
          </p>
          <label className="promptologue-field">
            Texte de la journée (jamais envoyé au stockage serveur)
            <textarea
              className="code-editor"
              rows={6}
              value={dayText}
              onChange={(event) => setDayText(event.target.value)}
            />
          </label>

          <label className="promptologue-field">
            Référentiel plus récent
            <select
              value={refChoice}
              onChange={(event) => setRefChoice(event.target.value)}
              aria-label="Version du référentiel"
            >
              <option value="">— choisir —</option>
              {newerVersions.map((v) => (
                <option key={v.version} value={v.version}>
                  {v.version}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend>Fournisseur LLM</legend>
            <label>
              <input
                type="radio"
                checked={providerMode === 'humanome'}
                onChange={() => setProviderMode('humanome')}
              />{' '}
              Service humanome (mock en développement)
            </label>{' '}
            <label>
              <input
                type="radio"
                checked={providerMode === 'cle'}
                onChange={() => setProviderMode('cle')}
              />{' '}
              Clé personnelle
            </label>
            {providerMode === 'cle' ? (
              <span className="promptologue-cle">
                <label>
                  Fournisseur{' '}
                  <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>{' '}
                <label>
                  Clé API{' '}
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    autoComplete="off"
                  />
                </label>
              </span>
            ) : null}
          </fieldset>

          <p>
            <button type="button" onClick={execute} disabled={running !== null}>
              Régénérer et comparer
            </button>
          </p>
        </>
      ) : null}

      {running ? <p role="status">{running}</p> : null}
      {error ? (
        <p role="alert" className="load-error">
          {error}
        </p>
      ) : null}

      {result ? (
        <section aria-label="Comparaison rétrospective" data-testid="retro-result">
          <h3>Original vs référentiel {result.refVersion}</h3>
          <table className="promptologue-table">
            <thead>
              <tr>
                <th scope="col">Compétence</th>
                <th scope="col">Évolution</th>
              </tr>
            </thead>
            <tbody>
              {result.comparison.nouvelles.map(({ code }) => (
                <tr key={`n-${code}`} className="retro-nouvelle">
                  <td>{code}</td>
                  <td>nouvellement détectée</td>
                </tr>
              ))}
              {result.comparison.disparues.map(({ code, statutApres }) => (
                <tr key={`d-${code}`} className="retro-disparue">
                  <td>{code}</td>
                  <td>disparue{statutApres ? ` (désormais : ${statutApres})` : ''}</td>
                </tr>
              ))}
              {result.comparison.nouvelles.length === 0 && result.comparison.disparues.length === 0 ? (
                <tr>
                  <td colSpan={2}>Aucun changement : mêmes compétences établies.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <p>
            {result.comparison.stables.length} compétence(s) stable(s) :{' '}
            {result.comparison.stables.join(', ') || '—'}
          </p>
        </section>
      ) : null}
    </div>
  )
}
