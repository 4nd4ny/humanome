// Interface ultime — application de la copie autonome (lecture seule).

import { useEffect, useMemo, useState } from 'react'
import CartoApp from '../ui/CartoApp.jsx'
import { storeFromArchive } from './embedded.js'
import { formatLong } from '../core/dates.js'
import { parseHash, subscribe } from '../../router.js'

const ROUTES = /^#\/cartographie(?:\/(?:gestionnaire|comparaison|tableau-de-bord)|\/jour\/\d{4}-\d{2}-\d{2}.*)?$/

/** @param {{archive: object | null}} props */
export function ViewerApp({ archive }) {
  const [store, setStore] = useState(null)
  const [error, setError] = useState(null)
  const [route, setRoute] = useState(() => parseHash(typeof window !== 'undefined' ? window.location.hash : ''))

  useEffect(() => {
    if (!ROUTES.test(window.location.hash)) window.location.hash = '#/cartographie'
    return subscribe(setRoute)
  }, [])

  useEffect(() => {
    if (!archive) return
    let cancelled = false
    storeFromArchive(archive)
      .then((s) => !cancelled && setStore(s))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [archive])

  const deps = useMemo(() => (store ? { store, fetchFn: () => Promise.reject(new Error('hors ligne')) } : null), [store])

  if (!archive) return <p className="carto-viewer-msg">Cette copie ne contient pas de cartographie lisible.</p>
  if (error) return <p className="carto-viewer-msg">La copie n’a pas pu être ouverte : {error}</p>
  return (
    <div className="carto-viewer">
      <p className="carto-viewer-banner" role="note">
        Copie autonome en lecture{archive.exportedAt ? `, exportée le ${formatLong(String(archive.exportedAt).slice(0, 10))}` : ''}. Elle s’ouvre sans réseau ; vos changements
        (cases, sélections) ne sont pas enregistrés.
        {archive.includesPortfolio === false ? ' Le texte du portfolio n’y est pas : le surlignage des passages est indisponible.' : ''}
      </p>
      {deps && route.name === 'cartographie' ? <CartoApp route={route} deps={deps} mode="viewer" /> : <p className="carto-viewer-msg">Ouverture…</p>}
    </div>
  )
}
