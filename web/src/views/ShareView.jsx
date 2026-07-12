// Lien de partage employeur (P8.5, chantier C) — #/partage/<token>, PUBLIC :
// aucune session, aucun compte (cahier §3.6). Le destinataire saisit le mot
// de passe transmis par l'auteur ; POST api/share/<token> renvoie
// {titre, type, document, garantie} et la cartographie est rendue en LECTURE
// SEULE par les vues existantes (DayView / MergeView, P2). La réponse d'erreur
// de l'API est volontairement homogène (anti-énumération) : seuls 403 (mot de
// passe) et 404 (lien inconnu/expiré/révoqué) sont distingués.
import { useEffect, useMemo, useState } from 'react'
import { ApiError, apiFetch } from '../api/client.js'
import { loadPublishedReferentiel } from '../data/referentiel.js'
import DayView from './DayView.jsx'
import MergeView from './MergeView.jsx'

export const SHARE_PASSWORD_MIN_LENGTH = 8

/** @param {ApiError | Error} error @returns {string} message français affichable */
function shareErrorMessage(error) {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'Ce lien de partage n’existe pas, a expiré ou a été révoqué par son auteur.'
    }
    if (error.status === 403) {
      return 'Mot de passe incorrect.'
    }
    if (error.status === 429) {
      return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.'
    }
  }
  return error.message
}

/** Mention « garantie par » (P9) — le champ arrive null tant que P9 n'est pas livré. */
function GarantieNotice({ garantie }) {
  if (garantie == null) return null
  const par = typeof garantie.par === 'string' && garantie.par !== '' ? garantie.par : null
  return (
    <p className="share-garantie" data-testid="share-garantie">
      Cartographie relue et garantie par {par ?? 'son cartographe'}
      {typeof garantie.date === 'string' && garantie.date !== ''
        ? ` le ${garantie.date.slice(0, 10)}`
        : ''}
      .
    </p>
  )
}

/**
 * @param {{
 *   token: string,
 *   lib?: object,                       // module sunburst (App / tests)
 *   fetchFn?: typeof fetch,             // test seam (client API réel sinon)
 *   getReferentiel?: typeof loadPublishedReferentiel, // test seam
 * }} props
 */
export default function ShareView({ token, lib, fetchFn, getReferentiel = loadPublishedReferentiel }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [shared, setShared] = useState(null) // {titre, type, document, garantie}
  const [referentiel, setReferentiel] = useState(null)

  // Le référentiel sert aux libellés des deux vues ; loadPublishedReferentiel
  // ne rejette jamais (repli sur la copie embarquée).
  useEffect(() => {
    if (!shared) return undefined
    let active = true
    getReferentiel().then((loaded) => {
      if (active) setReferentiel(loaded?.doc ?? loaded ?? null)
    })
    return () => {
      active = false
    }
  }, [shared, getReferentiel])

  async function handleSubmit(event) {
    event.preventDefault()
    if (password.length < SHARE_PASSWORD_MIN_LENGTH) {
      setError(
        `Le mot de passe d’un lien de partage compte au moins ${SHARE_PASSWORD_MIN_LENGTH} caractères.`,
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      const data = await apiFetch(`share/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: { password },
        ...(fetchFn ? { fetchFn } : {}),
      })
      setShared(data)
      setPassword('')
    } catch (requestError) {
      setError(shareErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  // getDay stable : le document est déjà là, DayView le reçoit tel quel.
  const sharedDocument = shared?.document ?? null
  const getDay = useMemo(() => () => Promise.resolve(sharedDocument), [sharedDocument])

  if (!shared) {
    return (
      <div className="share-view">
        <p className="share-banner" role="note">
          Cartographie partagée par son auteur — humanome.xyz
        </p>
        <form className="share-unlock" onSubmit={handleSubmit}>
          <h1>Cartographie partagée</h1>
          <p>
            L’auteur de cette cartographie de compétences vous a transmis un lien et un mot de
            passe. Saisissez ce mot de passe pour la consulter en lecture seule.
          </p>
          <label htmlFor="share-password">Mot de passe du lien</label>
          <input
            id="share-password"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? 'Vérification…' : 'Consulter la cartographie'}
          </button>
          {error ? <p role="alert">{error}</p> : null}
        </form>
      </div>
    )
  }

  let body
  if (referentiel === null) {
    body = <p role="status">Chargement du référentiel…</p>
  } else if (shared.type === 'merge') {
    body = <MergeView mergeDoc={shared.document} referentiel={referentiel} lib={lib} />
  } else {
    body = (
      <DayView
        date={shared.document?.date}
        referentiel={referentiel}
        days={shared.document?.date ? [shared.document.date] : []}
        getDay={getDay}
        lib={lib}
      />
    )
  }

  return (
    <div className="share-view">
      <p className="share-banner" role="note">
        Cartographie partagée par son auteur — humanome.xyz
      </p>
      <h1>{shared.titre}</h1>
      <GarantieNotice garantie={shared.garantie} />
      {body}
    </div>
  )
}
