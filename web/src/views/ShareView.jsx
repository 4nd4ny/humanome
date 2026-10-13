// Lien de partage employeur (P8.5, chantier C) — #/partage/<token>, PUBLIC :
// aucune session, aucun compte (cahier §3.6). Le destinataire saisit le mot
// de passe transmis par l'auteur ; POST api/share/<token> renvoie
// {titre, type, document, garantie} et la cartographie est rendue en LECTURE
// SEULE par les vues existantes (DayView / MergeView, P2). La réponse d'erreur
// de l'API est volontairement homogène (anti-énumération) : seuls 403 (mot de
// passe) et 404 (lien inconnu/expiré/révoqué) sont distingués.
//
// Version partagée de l'interface ultime (spec §12) : type « partage », rendue
// par SharedView (soleil, heatmap, extraits choisis — tout est dans le
// document). Un lien SANS mot de passe arrive en #/partage/<token>/ouvert
// (`open`) : la version est demandée dès l'ouverture (GET api/share/<token>) ;
// sinon RIEN ne part avant que le destinataire ait saisi le mot de passe.
// Tant que la page est montée, elle demande aux moteurs de ne pas l'indexer.
import { useEffect, useMemo, useState } from 'react'
import { ApiError, apiFetch } from '../api/client.js'
import { loadPublishedReferentiel } from '../data/referentiel.js'
import { SharedView } from '../carto/ui/SharedView.jsx'
import { isSharedVersion } from '../carto/core/share.js'
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
 * Lecture d'un lien ouvert, partagée entre les montages successifs d'une même
 * ouverture (le double montage du mode strict de React en développement, par
 * exemple) : une ouverture = une requête = une consultation dans le journal
 * des accès de l'auteur.
 */
const openRequests = new Map()
function readOpenShare(token, fetchFn) {
  if (!openRequests.has(token)) {
    const request = apiFetch(`share/${encodeURIComponent(token)}`, fetchFn ? { fetchFn } : {})
    openRequests.set(token, request)
    const forget = () => setTimeout(() => openRequests.delete(token), 0)
    request.then(forget, forget)
  }
  return openRequests.get(token)
}

/** Balise robots « noindex » tant que la vue est montée (§12.1 : jamais indexé). */
function useNoIndex() {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow, noarchive'
    meta.setAttribute('data-share-noindex', '')
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])
}

/**
 * @param {{
 *   token: string,
 *   open?: boolean,                     // lien sans mot de passe (#/partage/<token>/ouvert)
 *   lib?: object,                       // module sunburst (App / tests)
 *   fetchFn?: typeof fetch,             // test seam (client API réel sinon)
 *   getReferentiel?: typeof loadPublishedReferentiel, // test seam
 * }} props
 */
export default function ShareView({ token, open = false, lib, fetchFn, getReferentiel = loadPublishedReferentiel }) {
  useNoIndex()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // 'opening' : lien ouvert en cours de lecture ; 'failed' : lien ouvert
  // introuvable ; 'password' : formulaire du mot de passe.
  const [mode, setMode] = useState(open ? 'opening' : 'password')
  const [shared, setShared] = useState(null) // {titre, type, document, garantie}
  const [referentiel, setReferentiel] = useState(null)

  // Lien ouvert : la version est demandée dès l'ouverture. Un lien qui exige
  // finalement un mot de passe (401) retombe sur le formulaire.
  useEffect(() => {
    if (!open) return undefined
    let active = true
    setMode('opening')
    readOpenShare(token, fetchFn)
      .then((data) => {
        if (active) setShared(data)
      })
      .catch((requestError) => {
        if (!active) return
        if (requestError instanceof ApiError && requestError.status === 401) {
          setMode('password')
        } else {
          setError(shareErrorMessage(requestError))
          setMode('failed')
        }
      })
    return () => {
      active = false
    }
  }, [open, token, fetchFn])

  // Le référentiel sert aux libellés des deux vues ; loadPublishedReferentiel
  // ne rejette jamais (repli sur la copie embarquée). Une version partagée
  // embarque le sien.
  useEffect(() => {
    if (!shared || shared.type === 'partage') return undefined
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

  if (!shared && mode === 'opening') {
    return (
      <div className="share-view">
        <p role="status">Ouverture de la version partagée…</p>
      </div>
    )
  }

  if (!shared && mode === 'failed') {
    return (
      <div className="share-view">
        <p className="share-banner" role="note">
          Cartographie partagée par son auteur — humanome.xyz
        </p>
        <h1>Cartographie partagée</h1>
        <p role="alert">{error}</p>
      </div>
    )
  }

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

  if (shared.type === 'partage') {
    return (
      <div className="share-view share-view--carto">
        {isSharedVersion(shared.document) ? (
          <SharedView doc={shared.document} titre={shared.titre} garantie={shared.garantie} />
        ) : (
          <p role="alert">Cette version partagée n’est pas lisible par cette version du site.</p>
        )}
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
