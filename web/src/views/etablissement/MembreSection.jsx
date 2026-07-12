// Documents d'un membre (P11) : les documents JOUR produits par les runs de
// masse pour les cohortes de CET établissement (consentement explicite du
// membre), puis MERGE CALCULÉ CÔTÉ CLIENT via le moteur (membre-merge.js,
// pattern run-launcher) et visualisation LECTURE SEULE MergeView / DayView
// (même motif que CartographyViewer, P8).

import { useEffect, useMemo, useState } from 'react'
import { loadPublishedReferentiel } from '../../data/referentiel.js'
import DayView from '../DayView.jsx'
import MergeView from '../MergeView.jsx'
import { fetchMembreDocuments, frDate } from './etablissement-api.js'
import { buildMemberMerge, uniqueDayDocuments } from './membre-merge.js'

/**
 * @param {object} props
 * @param {string} props.userId identifiant du membre (segment d'URL)
 * @param {object} [props.lib] module sunburst (App / tests)
 * @param {typeof fetch} [props.fetchFn] seam de test
 * @param {typeof loadPublishedReferentiel} [props.getReferentiel] seam de test
 */
export default function MembreSection({
  userId,
  lib,
  fetchFn,
  getReferentiel = loadPublishedReferentiel,
}) {
  const [membre, setMembre] = useState(null)
  const [documents, setDocuments] = useState(null) // null = chargement
  const [referentiel, setReferentiel] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null) // iso -> DayView, null -> merge

  useEffect(() => {
    let alive = true
    fetchMembreDocuments(userId, fetchFn)
      .then((data) => {
        if (!alive) return
        setMembre(data.membre)
        setDocuments(data.documents)
      })
      .catch((error) => {
        if (!alive) return
        setDocuments([])
        setLoadError(error.message)
      })
    return () => {
      alive = false
    }
  }, [userId, fetchFn])

  // loadPublishedReferentiel ne rejette jamais (repli sur la copie embarquée).
  useEffect(() => {
    let alive = true
    getReferentiel().then((loaded) => {
      if (alive) setReferentiel(loaded?.doc ?? loaded ?? null)
    })
    return () => {
      alive = false
    }
  }, [getReferentiel])

  // Merge déterministe côté client (décision M8) — recalculé si les documents
  // ou le référentiel changent, jamais envoyé au serveur.
  const dayDocs = useMemo(() => uniqueDayDocuments(documents ?? []), [documents])
  const merge = useMemo(() => {
    if (!referentiel || dayDocs.length === 0) return null
    return buildMemberMerge(dayDocs, referentiel, { journalId: `membre-${userId}` })
  }, [dayDocs, referentiel, userId])

  const selectedDoc = selectedDay ? dayDocs.find((d) => d.date === selectedDay) : null
  const getDay = useMemo(
    () => () => Promise.resolve(selectedDoc),
    [selectedDoc],
  )

  let body
  if (documents === null || referentiel === null) {
    body = <p role="status">Chargement…</p>
  } else if (dayDocs.length === 0) {
    body = (
      <p className="privacy-note">
        Aucun document produit pour ce membre dans vos cohortes pour l’instant : lancez un run
        de masse depuis la page de la cohorte.
      </p>
    )
  } else if (selectedDoc) {
    body = (
      <DayView
        date={selectedDoc.date}
        referentiel={referentiel}
        days={[selectedDoc.date]}
        getDay={getDay}
        lib={lib}
      />
    )
  } else if (merge?.document) {
    body = <MergeView mergeDoc={merge.document} referentiel={referentiel} lib={lib} />
  } else {
    body = (
      <p role="alert" className="load-error" data-testid="etab-merge-erreur">
        {merge?.error ?? 'Fusion indisponible.'}
      </p>
    )
  }

  return (
    <div className="etab-membre">
      <p>
        <a href="#/etablissement">← Toutes mes cohortes</a>
      </p>
      <h2>{membre ? `Documents de ${membre.displayName}` : 'Documents du membre'}</h2>
      <p className="privacy-note" data-testid="etab-membre-consentement">
        Ces cartographies sont visibles par votre établissement parce que ce membre a rejoint
        une de vos cohortes avec son <strong>consentement explicite</strong>
        {membre?.consentAt ? ` (donné le ${frDate(membre.consentAt)})` : ''} — seuls les
        documents produits dans ce cadre apparaissent ici. La fusion chronologique est calculée
        dans votre navigateur par le moteur (lecture seule).
      </p>
      {loadError ? (
        <p role="alert" className="load-error">
          {loadError}
        </p>
      ) : null}

      {dayDocs.length > 0 ? (
        <nav className="etab-membre-nav" aria-label="Vues du membre">
          <button
            type="button"
            className="button"
            disabled={!selectedDay}
            onClick={() => setSelectedDay(null)}
          >
            Vue fusionnée ({dayDocs.length} journée(s))
          </button>
          {dayDocs.map((doc) => (
            <button
              key={doc.date}
              type="button"
              className="button"
              disabled={selectedDay === doc.date}
              onClick={() => setSelectedDay(doc.date)}
            >
              Journée {frDate(doc.date)}
            </button>
          ))}
        </nav>
      ) : null}

      {body}
    </div>
  )
}
