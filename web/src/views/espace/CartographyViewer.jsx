// Visionneuse d'une cartographie du tableau de bord (P8, câblage onOpen
// B <-> C) : rend le document sélectionné dans « Mes cartographies » en
// LECTURE SEULE avec les vues existantes (MergeView / DayView, P2) — même
// motif que ShareView, mais local : le document vient du carto-store
// (IndexedDB) ou de la copie serveur déjà chargée, jamais d'un appel réseau.

import { useEffect, useMemo, useState } from 'react'
import { loadPublishedReferentiel } from '../../data/referentiel.js'
import DayView from '../DayView.jsx'
import MergeView from '../MergeView.jsx'

/**
 * @param {object} props
 * @param {object} props.document cartographie (schéma jour ou merge)
 * @param {{type: 'jour'|'merge', titre: string}} props.entry métadonnées carto-store
 * @param {() => void} props.onClose retour au tableau de bord
 * @param {object} [props.lib] module sunburst (App / tests)
 * @param {typeof loadPublishedReferentiel} [props.getReferentiel] couture de test
 */
export default function CartographyViewer({
  document,
  entry,
  onClose,
  lib,
  getReferentiel = loadPublishedReferentiel,
}) {
  const [referentiel, setReferentiel] = useState(null)

  // Les libellés des deux vues viennent du référentiel publié ;
  // loadPublishedReferentiel ne rejette jamais (repli sur la copie embarquée).
  useEffect(() => {
    let active = true
    getReferentiel().then((loaded) => {
      if (active) setReferentiel(loaded?.doc ?? loaded ?? null)
    })
    return () => {
      active = false
    }
  }, [getReferentiel])

  // getDay stable : le document est déjà là, DayView le reçoit tel quel.
  const getDay = useMemo(() => () => Promise.resolve(document), [document])

  let body
  if (referentiel === null) {
    body = <p role="status">Chargement du référentiel…</p>
  } else if (entry.type === 'merge') {
    body = <MergeView mergeDoc={document} referentiel={referentiel} lib={lib} />
  } else {
    body = (
      <DayView
        date={document?.date}
        referentiel={referentiel}
        days={document?.date ? [document.date] : []}
        getDay={getDay}
        lib={lib}
      />
    )
  }

  return (
    <div className="espace-carto-viewer" data-testid="carto-viewer">
      <p>
        <button type="button" className="button" onClick={onClose}>
          ← Retour au tableau de bord
        </button>
      </p>
      <h2>{entry.titre}</h2>
      {body}
    </div>
  )
}
