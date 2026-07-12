// Rapport de consistance multi-run (P9.4, cahier §3.3) : N documents
// « cartographie-jour » du MÊME portfolio (depuis la file OU des fichiers
// locaux, validés au schéma) -> engine compareRuns -> rendu LISIBLE via
// lib/consistency-view.js : accord global, compétences stables / divergentes
// (badges par statut), tableau détaillé.

import { useEffect, useMemo, useState } from 'react'
import { compareRuns } from '@engine/consistency.js'
import { validateDocument } from '@engine/validation.js'
import { loadPublishedReferentiel } from '../../data/referentiel.js'
import { buildConsistencyView } from '../../lib/consistency-view.js'
import { fetchCartographie, fetchQueue, frDate } from './cartographe-api.js'

/**
 * @param {{
 *   fetchFn?: typeof fetch,          // seam de test
 *   getReferentiel?: typeof loadPublishedReferentiel,
 * }} props
 */
export default function ConsistanceSection({
  fetchFn,
  getReferentiel = loadPublishedReferentiel,
}) {
  const [queue, setQueue] = useState(null)
  const [referentiel, setReferentiel] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [checked, setChecked] = useState(() => new Set()) // ids de la file
  const [localDocs, setLocalDocs] = useState([]) // {name, document} fichiers locaux
  const [fileError, setFileError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)
  const [view, setView] = useState(null) // modèle buildConsistencyView

  useEffect(() => {
    let alive = true
    fetchQueue(fetchFn).then(
      (list) => alive && setQueue(list.filter((entry) => entry.type === 'jour')),
      (error) => alive && (setQueue([]), setLoadError(error.message)),
    )
    getReferentiel().then((loaded) => {
      if (alive) setReferentiel(loaded?.doc ?? loaded ?? null)
    })
    return () => {
      alive = false
    }
  }, [fetchFn, getReferentiel])

  const competenceNames = useMemo(() => {
    const names = {}
    for (const c of referentiel?.competences ?? []) names[c.code] = c.nom
    return names
  }, [referentiel])

  function toggle(id, on) {
    setView(null)
    setChecked((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function addFiles(event) {
    setFileError(null)
    setView(null)
    const files = [...(event.target.files ?? [])]
    event.target.value = '' // permet de re-sélectionner le même fichier
    const added = []
    for (const file of files) {
      let document
      try {
        document = JSON.parse(await file.text())
      } catch {
        setFileError(`« ${file.name} » n’est pas un fichier JSON valide.`)
        continue
      }
      const { valid } = validateDocument('cartographie-jour', document)
      if (!valid) {
        setFileError(
          `« ${file.name} » ne respecte pas le schéma cartographie-jour : fichier ignoré.`,
        )
        continue
      }
      added.push({ name: file.name, document })
    }
    if (added.length > 0) setLocalDocs((current) => [...current, ...added])
  }

  function dropLocal(index) {
    setView(null)
    setLocalDocs((current) => current.filter((_, i) => i !== index))
  }

  const nbSelected = checked.size + localDocs.length

  async function analyse() {
    setBusy(true)
    setAnalysisError(null)
    setView(null)
    try {
      const fromQueue = await Promise.all(
        [...checked].map(async (id) => {
          const { cartographie } = await fetchCartographie(id, fetchFn)
          const document = cartographie?.document
          if (document?.kind !== 'cartographie-jour') {
            throw new Error(
              `La cartographie ${id} n’est pas un document de journée : retirez-la de la sélection.`,
            )
          }
          return document
        }),
      )
      const docs = [...fromQueue, ...localDocs.map((d) => d.document)]
      const result = compareRuns(docs)
      setView(buildConsistencyView(result, { competenceNames }))
    } catch (error) {
      setAnalysisError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cartographe-consistance">
      <h2>Consistance multi-run</h2>
      <p>
        Plusieurs runs du même prompt sur le même portfolio ne donnent jamais exactement la même
        cartographie. Ce rapport mesure où les runs s’accordent et où ils divergent — c’est une
        des raisons pour lesquelles la garantie reste humaine (cahier §8).
      </p>
      {loadError ? (
        <p role="alert" className="load-error">
          {loadError}
        </p>
      ) : null}

      <section aria-label="Sélection des documents">
        <h3>1. Sélectionner au moins 2 documents de journée</h3>
        {queue === null ? (
          <p role="status">Chargement de la file…</p>
        ) : queue.length === 0 ? (
          <p className="privacy-note">Aucune cartographie de journée dans votre file.</p>
        ) : (
          <ul className="cartographe-consistance-file" data-testid="consistance-queue">
            {queue.map((entry) => {
              const inputId = `consistance-${entry.id}`
              return (
                <li key={entry.id}>
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={checked.has(entry.id)}
                    onChange={(event) => toggle(entry.id, event.target.checked)}
                  />{' '}
                  <label htmlFor={inputId}>
                    {entry.titre} — {entry.apprenant?.displayName ?? '—'} ·{' '}
                    {frDate(entry.createdAt)}
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        <p>
          <label htmlFor="consistance-fichiers">
            Ajouter des runs depuis des fichiers locaux (JSON cartographie-jour, validés au
            schéma — rien n’est envoyé au serveur) :
          </label>{' '}
          <input
            id="consistance-fichiers"
            type="file"
            accept=".json,application/json"
            multiple
            onChange={addFiles}
          />
        </p>
        {localDocs.length > 0 ? (
          <ul data-testid="consistance-locaux">
            {localDocs.map((doc, i) => (
              <li key={`${doc.name}-${i}`}>
                {doc.name} (journée du {doc.document.date}){' '}
                <button type="button" className="button" onClick={() => dropLocal(i)}>
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {fileError ? (
          <p role="alert" className="load-error">
            {fileError}
          </p>
        ) : null}
        <p>
          <button
            type="button"
            className="button"
            disabled={busy || nbSelected < 2}
            onClick={analyse}
          >
            {busy ? 'Analyse…' : `Analyser la consistance (${nbSelected} document(s))`}
          </button>
        </p>
        {analysisError ? (
          <p role="alert" className="load-error">
            {analysisError}
          </p>
        ) : null}
      </section>

      {view ? (
        <section aria-label="Rapport de consistance" data-testid="consistance-rapport">
          <h3>2. Rapport ({view.nbRuns} runs)</h3>
          <p role="status" data-testid="consistance-accord">
            Accord global : <strong>{view.accordPourcent} %</strong> (distance structurelle{' '}
            {view.distanceStructurelle.toFixed(3)}).
          </p>

          <h4>Compétences stables (établies dans tous les runs) — {view.stables.length}</h4>
          {view.stables.length === 0 ? (
            <p className="privacy-note">Aucune compétence établie dans tous les runs.</p>
          ) : (
            <ul className="cartographe-consistance-stables">
              {view.stables.map((item) => (
                <li key={item.code}>
                  <span className={`verdict-badge ${item.badge}`}>{item.statut}</span>{' '}
                  <strong>{item.code}</strong>
                  {item.nom ? ` — ${item.nom}` : ''}
                </li>
              ))}
            </ul>
          )}

          <h4>Compétences divergentes — {view.divergentes.length}</h4>
          {view.divergentes.length === 0 ? (
            <p className="privacy-note">Aucune divergence de statut entre les runs.</p>
          ) : (
            <ul className="cartographe-consistance-divergentes" data-testid="consistance-divergentes">
              {view.divergentes.map((item) => (
                <li key={item.code}>
                  <strong>{item.code}</strong>
                  {item.nom ? ` — ${item.nom}` : ''} :{' '}
                  {item.statuts.map((s, i) => (
                    <span key={i}>
                      {i > 0 ? ' · ' : ''}
                      <span className={`verdict-badge ${s.badge}`}>{s.label}</span> (run
                      {s.runs.length > 1 ? 's' : ''} {s.runs.join(', ')})
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}

          <h4>Détail par compétence</h4>
          <div className="table-scroll">
            <table className="cartographe-consistance-table" data-testid="consistance-table">
              <thead>
                <tr>
                  <th scope="col">Compétence</th>
                  {Array.from({ length: view.nbRuns }, (_, i) => (
                    <th scope="col" key={i}>
                      Run {i + 1}
                    </th>
                  ))}
                  <th scope="col">Écart-type confiance</th>
                </tr>
              </thead>
              <tbody>
                {view.lignes.map((ligne) => (
                  <tr key={ligne.code} data-stable={ligne.stable ? 'true' : 'false'}>
                    <th scope="row">
                      {ligne.code}
                      {ligne.nom ? ` — ${ligne.nom}` : ''}
                    </th>
                    {ligne.statuts.map((s, i) => (
                      <td key={i}>
                        <span className={`verdict-badge ${s.badge}`}>{s.label}</span>
                        {ligne.confiances[i] != null
                          ? ` ${Math.round(ligne.confiances[i] * 100)} %`
                          : ''}
                      </td>
                    ))}
                    <td>{ligne.ecartType.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
