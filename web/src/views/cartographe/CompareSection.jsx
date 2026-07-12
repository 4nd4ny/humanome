// Comparaison côte à côte de deux cartographies d'un MÊME apprenant (P9.4,
// cahier §3.3 — versions de prompts différentes) : sélecteurs alimentés par la
// file, deux sunbursts, tableau des divergences par compétence (statut /
// niveau / points / confiance) avec surlignage — modèle pur compare-model.js.

import { useEffect, useMemo, useState } from 'react'
import Sunburst from '../../components/Sunburst.jsx'
import { loadPublishedReferentiel } from '../../data/referentiel.js'
import { useSunburstLib } from '../view-helpers.js'
import { fetchCartographie, fetchQueue, frDate, typeLabel } from './cartographe-api.js'
import { COMPARE_FIELDS, compareCartographies } from './compare-model.js'

const FIELD_LABELS = {
  statut: 'Statut',
  niveau: 'Niveau',
  points: 'Points',
  confiance: 'Confiance',
}

/** @param {*} value @returns {string} rendu d'une valeur de cellule */
function cell(value, field) {
  if (value === null || value === undefined) return '—'
  if (field === 'confiance') return `${Math.round(value * 100)} %`
  return String(value)
}

/** Diagramme d'un document (jour ou merge), en lecture seule et sans panneau. */
function MiniSunburst({ doc, referentiel, lib, size, label }) {
  const layout = useMemo(() => {
    if (!lib || !doc) return null
    const tree =
      doc.kind === 'cartographie-merge'
        ? lib.buildMergeTree(doc, referentiel)
        : lib.buildDayTree(doc, referentiel).tree
    return lib.layoutSunburst(tree, { size })
  }, [lib, doc, referentiel, size])
  if (!layout) return <p role="status">Préparation du diagramme…</p>
  return <Sunburst layout={layout} label={label} />
}

/**
 * @param {{
 *   lib?: object,                    // module sunburst (App / tests)
 *   fetchFn?: typeof fetch,          // seam de test
 *   getReferentiel?: typeof loadPublishedReferentiel,
 * }} props
 */
export default function CompareSection({
  lib: injectedLib,
  fetchFn,
  getReferentiel = loadPublishedReferentiel,
}) {
  const { lib, error: libError } = useSunburstLib(injectedLib)
  const [queue, setQueue] = useState(null)
  const [referentiel, setReferentiel] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [idA, setIdA] = useState('')
  const [idB, setIdB] = useState('')
  const [docs, setDocs] = useState({}) // id -> {document, entry} chargés à la demande

  useEffect(() => {
    let alive = true
    fetchQueue(fetchFn).then(
      (list) => alive && setQueue(list),
      (error) => alive && (setQueue([]), setLoadError(error.message)),
    )
    getReferentiel().then((loaded) => {
      if (alive) setReferentiel(loaded?.doc ?? loaded ?? null)
    })
    return () => {
      alive = false
    }
  }, [fetchFn, getReferentiel])

  // Charge les documents sélectionnés (métadonnées seules dans la file).
  useEffect(() => {
    let alive = true
    for (const id of [idA, idB]) {
      if (id === '' || docs[id]) continue
      fetchCartographie(id, fetchFn).then(
        ({ cartographie }) =>
          alive &&
          setDocs((current) => ({
            ...current,
            [id]: { document: cartographie?.document ?? null, entry: cartographie },
          })),
        (error) => alive && setLoadError(error.message),
      )
    }
    return () => {
      alive = false
    }
    // docs volontairement hors dépendances (cache en écriture seule ici).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idA, idB, fetchFn])

  const entryA = (queue ?? []).find((e) => String(e.id) === idA) ?? null
  // Contrainte métier : deux cartographies du MÊME apprenant.
  const optionsB = (queue ?? []).filter(
    (e) =>
      String(e.id) !== idA &&
      (entryA === null ||
        (e.apprenant?.id ?? e.apprenant?.displayName) ===
          (entryA.apprenant?.id ?? entryA.apprenant?.displayName)),
  )

  const docA = docs[idA]?.document ?? null
  const docB = docs[idB]?.document ?? null
  const comparison = useMemo(
    () => (docA && docB ? compareCartographies(docA, docB) : null),
    [docA, docB],
  )

  const label = (entry) =>
    `${entry.titre} — ${typeLabel(entry.type)} du ${frDate(entry.createdAt)}`

  return (
    <div className="cartographe-comparer">
      <h2>Comparer deux cartographies</h2>
      <p>
        Deux cartographies d’un même apprenant côte à côte — par exemple deux versions de
        prompts sur le même portfolio. Les compétences dont le statut, le niveau, les points ou
        la confiance divergent sont surlignées.
      </p>
      {loadError ? (
        <p role="alert" className="load-error">
          {loadError}
        </p>
      ) : null}
      {queue === null ? (
        <p role="status">Chargement de la file…</p>
      ) : (
        <div className="cartographe-comparer-selecteurs">
          <label htmlFor="compare-a">Cartographie 1</label>
          <select
            id="compare-a"
            value={idA}
            onChange={(event) => {
              setIdA(event.target.value)
              setIdB('')
            }}
          >
            <option value="">— choisir —</option>
            {queue.map((entry) => (
              <option key={entry.id} value={String(entry.id)}>
                {entry.apprenant?.displayName ?? '—'} · {label(entry)}
              </option>
            ))}
          </select>
          <label htmlFor="compare-b">Cartographie 2 (même apprenant)</label>
          <select
            id="compare-b"
            value={idB}
            onChange={(event) => setIdB(event.target.value)}
            disabled={idA === ''}
          >
            <option value="">— choisir —</option>
            {optionsB.map((entry) => (
              <option key={entry.id} value={String(entry.id)}>
                {label(entry)}
              </option>
            ))}
          </select>
        </div>
      )}

      {idA !== '' && idB !== '' ? (
        docA && docB ? (
          <>
            <div className="cartographe-comparer-diagrammes" data-testid="compare-diagrams">
              {[
                [docs[idA], 'Cartographie 1'],
                [docs[idB], 'Cartographie 2'],
              ].map(([loaded, fallback], i) => (
                <figure key={i}>
                  <figcaption>{loaded.entry ? label(loaded.entry) : fallback}</figcaption>
                  {libError ? (
                    <p role="alert" className="load-error">
                      {libError.message}
                    </p>
                  ) : (
                    <MiniSunburst
                      doc={loaded.document}
                      referentiel={referentiel}
                      lib={lib}
                      size={340}
                      label={`Diagramme — ${loaded.entry?.titre ?? fallback}`}
                    />
                  )}
                </figure>
              ))}
            </div>

            {comparison ? (
              <section aria-label="Divergences par compétence">
                <h3>Divergences par compétence</h3>
                <p role="status" data-testid="compare-summary">
                  {comparison.nbDivergences} compétence(s) divergente(s) sur{' '}
                  {comparison.nbCompetences} comparée(s).
                </p>
                <div className="table-scroll">
                  <table className="cartographe-comparer-table" data-testid="compare-table">
                    <thead>
                      <tr>
                        <th scope="col">Compétence</th>
                        {COMPARE_FIELDS.map((field) => (
                          <th scope="col" key={field}>
                            {FIELD_LABELS[field]} (1 / 2)
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.rows.map((row) => (
                        <tr
                          key={row.code}
                          className={row.divergent ? 'compare-divergent' : undefined}
                          data-divergent={row.divergent ? 'true' : 'false'}
                        >
                          <th scope="row">{row.code}</th>
                          {COMPARE_FIELDS.map((field) => (
                            <td
                              key={field}
                             
                              className={
                                row.champs.includes(field) ? 'compare-champ-divergent' : undefined
                              }
                            >
                              {cell(row.a[field], field)} / {cell(row.b[field], field)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <p role="status">Chargement des documents…</p>
        )
      ) : null}
    </div>
  )
}
