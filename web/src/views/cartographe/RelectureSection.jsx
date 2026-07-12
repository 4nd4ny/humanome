// Relecture d'une cartographie par le cartographe (P9.2/P9.3, cahier §3.3,
// §8) : en-tête (apprenant, titre, type, garantie), visualisation LECTURE
// SEULE (MergeView/DayView, pattern CartographyViewer), panneau d'annotation
// par compétence (commentaire / hallucination / oubli), éditeur de verdict à
// champs contrôlés construisant une RÉVISION complète validée par l'engine
// AVANT envoi, historique des révisions, garantie (signature au nom du
// cartographe, révision figée) / retrait de garantie.
//
// Choix UX : la compétence annotée/corrigée se choisit dans une liste
// déroulante (codes + noms du référentiel). Le diagramme DayView garde sa
// sélection interne pour la lecture des verdicts — le contrat P9 admet
// « depuis le diagramme OU liste déroulante ».

import { useEffect, useMemo, useState } from 'react'
import { validateDocument } from '@engine/validation.js'
import { loadPublishedReferentiel } from '../../data/referentiel.js'
import DayView from '../DayView.jsx'
import MergeView from '../MergeView.jsx'
import {
  deleteAnnotation,
  deleteGarantie,
  fetchAnnotations,
  fetchCartographie,
  fetchRevisionDocument,
  fetchRevisions,
  frDate,
  postAnnotation,
  postGarantie,
  postRevision,
  typeLabel,
} from './cartographe-api.js'
import { VERDICT_STATUTS, buildRevision, listCompetences, verdictFields } from './revision.js'

const ANNOTATION_TYPES = [
  ['commentaire', 'Commentaire'],
  ['hallucination', 'Hallucination signalée'],
  ['oubli', 'Oubli signalé'],
]
const ANNOTATION_LABELS = Object.fromEntries(ANNOTATION_TYPES)

/** @param {string} iso @returns {string} date + heure françaises */
function frDateTime(iso) {
  if (typeof iso !== 'string' || iso === '') return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString('fr-FR') + ' ' + date.toLocaleTimeString('fr-FR', { timeStyle: 'short' })
}

/**
 * @param {{
 *   id: string,                     // id de la cartographie (route relecture/<id>)
 *   user: object | null,            // utilisateur connecté (signature de garantie)
 *   lib?: object,                   // module sunburst (App / tests)
 *   fetchFn?: typeof fetch,         // seam de test
 *   getReferentiel?: typeof loadPublishedReferentiel, // seam de test
 * }} props
 */
export default function RelectureSection({
  id,
  user,
  lib,
  fetchFn,
  getReferentiel = loadPublishedReferentiel,
}) {
  const [data, setData] = useState(null) // {cartographie, annotations, revisions, garantie}
  const [loadError, setLoadError] = useState(null)
  const [referentiel, setReferentiel] = useState(null)
  // Document affiché : celui de la cartographie, ou celui d'une révision.
  const [viewing, setViewing] = useState({ kind: 'base' })
  const [selectedCode, setSelectedCode] = useState('')
  // Annotation.
  const [annotationType, setAnnotationType] = useState('commentaire')
  const [annotationText, setAnnotationText] = useState('')
  const [annotationBusy, setAnnotationBusy] = useState(false)
  const [annotationError, setAnnotationError] = useState(null)
  // Correction -> révision.
  const [fields, setFields] = useState(null) // {statut, confiance, motif, prescription}
  const [corrections, setCorrections] = useState({}) // code -> patch
  const [note, setNote] = useState('')
  const [revisionBusy, setRevisionBusy] = useState(false)
  const [revisionError, setRevisionError] = useState(null)
  const [revisionErrors, setRevisionErrors] = useState([]) // erreurs de schéma
  const [revisionInfo, setRevisionInfo] = useState(null)
  // Garantie.
  const [garantieConfirm, setGarantieConfirm] = useState(false)
  const [garantieBusy, setGarantieBusy] = useState(false)
  const [garantieError, setGarantieError] = useState(null)
  const [historyError, setHistoryError] = useState(null)

  useEffect(() => {
    let alive = true
    setData(null)
    setLoadError(null)
    setViewing({ kind: 'base' })
    setCorrections({})
    fetchCartographie(id, fetchFn).then(
      (loaded) => alive && setData(loaded),
      (error) => alive && setLoadError(error.message),
    )
    getReferentiel().then((loaded) => {
      if (alive) setReferentiel(loaded?.doc ?? loaded ?? null)
    })
    return () => {
      alive = false
    }
  }, [id, fetchFn, getReferentiel])

  const cartographie = data?.cartographie ?? null
  const baseDocument = cartographie?.document ?? null
  const displayedDocument = viewing.kind === 'revision' ? viewing.document : baseDocument
  const isJour = displayedDocument?.kind === 'cartographie-jour'

  const competenceName = useMemo(() => {
    const map = new Map()
    for (const c of referentiel?.competences ?? []) map.set(c.code, c.nom)
    return map
  }, [referentiel])

  const competences = useMemo(
    () => (displayedDocument ? listCompetences(displayedDocument) : []),
    [displayedDocument],
  )

  // getDay stable (pattern CartographyViewer) : sans useMemo, DayView
  // rechargerait le document à chaque rendu.
  const getDay = useMemo(() => () => Promise.resolve(displayedDocument), [displayedDocument])

  // Pré-remplit l'éditeur de verdict quand la compétence sélectionnée change
  // (une correction en attente prime sur le verdict du document).
  useEffect(() => {
    if (!selectedCode || !isJour) {
      setFields(null)
      return
    }
    setFields(
      corrections[selectedCode] ??
        verdictFields(displayedDocument, selectedCode) ?? {
          statut: 'renvoi au cartographe',
          confiance: 0.5,
          motif: '',
          prescription: '',
        },
    )
    // corrections volontairement hors dépendances : on ne réécrase pas la
    // saisie en cours à chaque « Enregistrer la correction ».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCode, displayedDocument, isJour])

  async function reloadAnnotations() {
    const annotations = await fetchAnnotations(id, fetchFn)
    setData((current) => (current === null ? current : { ...current, annotations }))
  }

  async function submitAnnotation(event) {
    event.preventDefault()
    setAnnotationError(null)
    if (!selectedCode) {
      setAnnotationError('Choisissez d’abord une compétence.')
      return
    }
    if (annotationText.trim() === '') {
      setAnnotationError('Le texte de l’annotation est vide.')
      return
    }
    setAnnotationBusy(true)
    try {
      await postAnnotation(
        id,
        { competenceCode: selectedCode, type: annotationType, texte: annotationText.trim() },
        fetchFn,
      )
      setAnnotationText('')
      await reloadAnnotations()
    } catch (error) {
      setAnnotationError(error.message)
    } finally {
      setAnnotationBusy(false)
    }
  }

  async function removeAnnotation(annotationId) {
    setAnnotationError(null)
    try {
      await deleteAnnotation(annotationId, fetchFn)
      await reloadAnnotations()
    } catch (error) {
      setAnnotationError(error.message)
    }
  }

  function saveCorrection() {
    if (!selectedCode || !fields) return
    setRevisionInfo(null)
    setCorrections((current) => ({ ...current, [selectedCode]: { ...fields } }))
  }

  function dropCorrection(code) {
    setCorrections((current) => {
      const next = { ...current }
      delete next[code]
      return next
    })
  }

  async function submitRevision(event) {
    event.preventDefault()
    setRevisionError(null)
    setRevisionErrors([])
    setRevisionInfo(null)
    if (Object.keys(corrections).length === 0) {
      setRevisionError('Aucune correction en attente : corrigez au moins un verdict.')
      return
    }
    let revised
    try {
      revised = buildRevision(displayedDocument, corrections)
    } catch (error) {
      setRevisionError(error.message)
      return
    }
    // Validation engine AVANT envoi (contrat P9) : le POST ne part pas si le
    // document révisé ne passe pas le schéma cartographie-jour.
    const { valid, errors } = validateDocument('cartographie-jour', revised)
    if (!valid) {
      setRevisionError('Le document révisé ne respecte pas le schéma : révision non envoyée.')
      setRevisionErrors(errors.slice(0, 5))
      return
    }
    setRevisionBusy(true)
    try {
      const response = await postRevision(id, { document: revised, note: note.trim() }, fetchFn)
      const revisionId = response?.revisionId ?? response?.id ?? null
      const revisions = await fetchRevisions(id, fetchFn)
      setData((current) => (current === null ? current : { ...current, revisions }))
      setCorrections({})
      setNote('')
      if (revisionId != null) {
        setViewing({ kind: 'revision', id: revisionId, document: revised })
      }
      setRevisionInfo('Révision enregistrée : elle apparaît dans l’historique ci-dessous.')
    } catch (error) {
      setRevisionError(error.message)
    } finally {
      setRevisionBusy(false)
    }
  }

  async function viewRevision(revision) {
    setHistoryError(null)
    try {
      const document = await fetchRevisionDocument(revision.id, fetchFn)
      if (!document) throw new Error('La révision ne contient pas de document.')
      setViewing({ kind: 'revision', id: revision.id, document })
      setCorrections({})
    } catch (error) {
      setHistoryError(error.message)
    }
  }

  // Révision figée par la garantie : celle affichée, sinon la plus récente,
  // sinon le document d'origine (pas de revisionId).
  const sortedRevisions = useMemo(
    () =>
      [...(data?.revisions ?? [])].sort((a, b) =>
        String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
      ),
    [data],
  )
  const garantieTargetId =
    viewing.kind === 'revision' ? viewing.id : (sortedRevisions[0]?.id ?? null)

  async function confirmGarantie() {
    setGarantieBusy(true)
    setGarantieError(null)
    try {
      const garantie = await postGarantie(id, garantieTargetId, fetchFn)
      setData((current) => (current === null ? current : { ...current, garantie }))
      setGarantieConfirm(false)
    } catch (error) {
      setGarantieError(error.message)
    } finally {
      setGarantieBusy(false)
    }
  }

  async function retirerGarantie() {
    setGarantieBusy(true)
    setGarantieError(null)
    try {
      await deleteGarantie(id, fetchFn)
      setData((current) => (current === null ? current : { ...current, garantie: null }))
    } catch (error) {
      setGarantieError(error.message)
    } finally {
      setGarantieBusy(false)
    }
  }

  if (loadError) {
    return (
      <div className="cartographe-relecture">
        <p role="alert" className="load-error">
          {loadError}
        </p>
        <p>
          <a href="#/cartographe">← Retour à la file</a>
        </p>
      </div>
    )
  }
  if (data === null || cartographie === null) {
    return <p role="status">Chargement de la cartographie…</p>
  }

  const garantie = data.garantie
  const annotations = data.annotations ?? []
  const annotationsForCode = selectedCode
    ? annotations.filter((a) => a.competenceCode === selectedCode)
    : []

  let viewer
  if (!displayedDocument) {
    viewer = (
      <p role="alert" className="load-error">
        La cartographie ne contient pas de document.
      </p>
    )
  } else if (referentiel === null) {
    viewer = <p role="status">Chargement du référentiel…</p>
  } else if (displayedDocument.kind === 'cartographie-merge') {
    viewer = <MergeView mergeDoc={displayedDocument} referentiel={referentiel} lib={lib} />
  } else {
    viewer = (
      <DayView
        date={displayedDocument.date}
        referentiel={referentiel}
        days={displayedDocument.date ? [displayedDocument.date] : []}
        getDay={getDay}
        lib={lib}
      />
    )
  }

  return (
    <div className="cartographe-relecture">
      <header className="cartographe-relecture-header">
        <p>
          <a href="#/cartographe">← Retour à la file</a>
        </p>
        <h2>{cartographie.titre}</h2>
        <p className="cartographe-relecture-meta" data-testid="relecture-meta">
          Apprenant : <strong>{cartographie.apprenant?.displayName ?? '—'}</strong> · Type :{' '}
          {typeLabel(cartographie.type)} · Déposée le {frDate(cartographie.createdAt)}
        </p>
        {garantie ? (
          <p className="share-garantie" data-testid="garantie-badge">
            Cartographie garantie par {garantie.par ?? '—'} le {frDate(garantie.date)}
            {garantie.revisionId != null ? ` (révision ${garantie.revisionId} figée)` : ''}.
          </p>
        ) : (
          <p className="privacy-note" data-testid="garantie-absente">
            Cartographie non garantie : relisez, annotez, corrigez si nécessaire, puis validez.
          </p>
        )}
        {viewing.kind === 'revision' ? (
          <p role="status" className="account-notice" data-testid="viewing-revision">
            Vous consultez la révision {viewing.id}.{' '}
            <button type="button" className="button" onClick={() => setViewing({ kind: 'base' })}>
              Revenir au document d’origine
            </button>
          </p>
        ) : null}
      </header>

      <section aria-label="Visualisation de la cartographie" className="cartographe-viewer">
        {viewer}
      </section>

      <section aria-label="Annotation et correction par compétence" className="cartographe-annoter">
        <h3>Annoter et corriger par compétence</h3>
        <p>
          <label htmlFor="relecture-competence">Compétence </label>
          <select
            id="relecture-competence"
            value={selectedCode}
            onChange={(event) => setSelectedCode(event.target.value)}
          >
            <option value="">— choisir une compétence —</option>
            {competences.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
                {competenceName.has(c.code) ? ` — ${competenceName.get(c.code)}` : ''}
              </option>
            ))}
          </select>
        </p>

        {selectedCode ? (
          <div className="cartographe-annotation-panel" data-testid="annotation-panel">
            <h4>
              Annotations — {selectedCode}
              {competenceName.has(selectedCode) ? ` (${competenceName.get(selectedCode)})` : ''}
            </h4>
            {annotationsForCode.length === 0 ? (
              <p className="privacy-note">Aucune annotation sur cette compétence.</p>
            ) : (
              <ul className="cartographe-annotations" data-testid="annotations-list">
                {annotationsForCode.map((a) => (
                  <li key={a.id}>
                    <span className={`annotation-type annotation-type-${a.type}`}>
                      {ANNOTATION_LABELS[a.type] ?? a.type}
                    </span>{' '}
                    {a.texte}
                    <span className="annotation-meta">
                      {' '}
                      — {a.author?.displayName ?? '—'}, {frDateTime(a.createdAt)}
                    </span>
                    {user?.id != null && a.author?.id === user.id ? (
                      <button
                        type="button"
                        className="button button-danger"
                        onClick={() => removeAnnotation(a.id)}
                      >
                        Supprimer
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={submitAnnotation} className="cartographe-annotation-form">
              <label htmlFor="annotation-type">Type</label>
              <select
                id="annotation-type"
                value={annotationType}
                onChange={(event) => setAnnotationType(event.target.value)}
              >
                {ANNOTATION_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <label htmlFor="annotation-texte">Annotation</label>
              <textarea
                id="annotation-texte"
                rows={3}
                value={annotationText}
                onChange={(event) => setAnnotationText(event.target.value)}
                placeholder="Votre relecture : commentaire, hallucination détectée, oubli…"
              />
              <button type="submit" className="button" disabled={annotationBusy}>
                {annotationBusy ? 'Envoi…' : 'Annoter'}
              </button>
            </form>
            {annotationError ? (
              <p role="alert" className="load-error">
                {annotationError}
              </p>
            ) : null}

            {isJour && fields ? (
              <div className="cartographe-correction" data-testid="correction-editor">
                <h4>Corriger le verdict</h4>
                <div className="cartographe-correction-fields">
                  <label htmlFor="verdict-statut">Statut</label>
                  <select
                    id="verdict-statut"
                    value={fields.statut}
                    onChange={(event) => setFields({ ...fields, statut: event.target.value })}
                  >
                    {VERDICT_STATUTS.map((statut) => (
                      <option key={statut} value={statut}>
                        {statut}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="verdict-confiance">Confiance (0 à 1)</label>
                  <input
                    id="verdict-confiance"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={fields.confiance}
                    onChange={(event) =>
                      setFields({ ...fields, confiance: Number(event.target.value) })
                    }
                  />
                  <label htmlFor="verdict-motif">Motif</label>
                  <textarea
                    id="verdict-motif"
                    rows={2}
                    value={fields.motif}
                    onChange={(event) => setFields({ ...fields, motif: event.target.value })}
                  />
                  <label htmlFor="verdict-prescription">Prescription</label>
                  <textarea
                    id="verdict-prescription"
                    rows={2}
                    value={fields.prescription}
                    onChange={(event) =>
                      setFields({ ...fields, prescription: event.target.value })
                    }
                  />
                </div>
                <button type="button" className="button" onClick={saveCorrection}>
                  Enregistrer la correction pour {selectedCode}
                </button>
              </div>
            ) : null}
            {!isJour ? (
              <p className="privacy-note">
                La correction par verdict s’applique aux cartographies de journée ; pour un
                parcours (merge), annotez ici puis corrigez les journées sources.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="privacy-note">
            Choisissez une compétence pour voir ses annotations, en ajouter, ou corriger son
            verdict.
          </p>
        )}
      </section>

      {isJour ? (
        <section aria-label="Proposer une révision" className="cartographe-revision">
          <h3>Proposer une révision</h3>
          {Object.keys(corrections).length === 0 ? (
            <p className="privacy-note">
              Aucune correction en attente. Les corrections enregistrées ci-dessus composent une
              révision complète du document, validée au schéma avant envoi.
            </p>
          ) : (
            <ul data-testid="pending-corrections">
              {Object.entries(corrections).map(([code, patch]) => (
                <li key={code}>
                  <strong>{code}</strong> → {patch.statut} (confiance{' '}
                  {Math.round(patch.confiance * 100)} %){' '}
                  <button type="button" className="button" onClick={() => dropCorrection(code)}>
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={submitRevision} className="cartographe-revision-form">
            <label htmlFor="revision-note">Note de révision</label>
            <textarea
              id="revision-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ce que corrige cette révision, et pourquoi."
            />
            <button
              type="submit"
              className="button"
              disabled={revisionBusy || Object.keys(corrections).length === 0}
            >
              {revisionBusy ? 'Envoi…' : 'Proposer la révision'}
            </button>
          </form>
          {revisionError ? (
            <p role="alert" className="load-error">
              {revisionError}
            </p>
          ) : null}
          {revisionErrors.length > 0 ? (
            <ul className="load-error" data-testid="revision-schema-errors">
              {revisionErrors.map((error, i) => (
                <li key={i}>
                  <code>{error.path}</code> — {error.message}
                </li>
              ))}
            </ul>
          ) : null}
          {revisionInfo ? (
            <p role="status" className="account-notice">
              {revisionInfo}
            </p>
          ) : null}
        </section>
      ) : null}

      <section aria-label="Historique des révisions" className="cartographe-historique">
        <h3>Historique des révisions</h3>
        {sortedRevisions.length === 0 ? (
          <p className="privacy-note">Aucune révision pour l’instant.</p>
        ) : (
          <ul data-testid="revisions-list">
            {sortedRevisions.map((revision) => (
              <li key={revision.id}>
                <strong>{frDateTime(revision.createdAt)}</strong>
                {revision.author ? ` — ${revision.author.displayName}` : ''}
                {revision.note ? ` — « ${revision.note} »` : ''}{' '}
                <button type="button" className="button" onClick={() => viewRevision(revision)}>
                  Voir
                </button>
              </li>
            ))}
          </ul>
        )}
        {historyError ? (
          <p role="alert" className="load-error">
            {historyError}
          </p>
        ) : null}
      </section>

      <section aria-label="Garantie" className="cartographe-garantie">
        <h3>Garantie</h3>
        {garantie ? (
          <p>
            <button
              type="button"
              className="button button-danger"
              disabled={garantieBusy}
              onClick={retirerGarantie}
            >
              Retirer ma garantie
            </button>
          </p>
        ) : garantieConfirm ? (
          <div className="cartographe-garantie-confirm" data-testid="garantie-confirm">
            <p>
              Vous allez garantir cette cartographie <strong>en votre nom</strong> (
              {user?.displayName ?? user?.email ?? 'cartographe'}), avec signature horodatée.{' '}
              {garantieTargetId != null
                ? `La révision ${garantieTargetId} sera figée : c'est elle que verra l'employeur via le lien de partage.`
                : 'Le document d’origine sera présenté comme garanti via le lien de partage.'}
            </p>
            <p>
              <button
                type="button"
                className="button"
                disabled={garantieBusy}
                onClick={confirmGarantie}
              >
                {garantieBusy ? 'Signature…' : 'Confirmer et garantir'}
              </button>{' '}
              <button type="button" className="button" onClick={() => setGarantieConfirm(false)}>
                Annuler
              </button>
            </p>
          </div>
        ) : (
          <p>
            <button type="button" className="button" onClick={() => setGarantieConfirm(true)}>
              Valider et garantir
            </button>
          </p>
        )}
        {garantieError ? (
          <p role="alert" className="load-error">
            {garantieError}
          </p>
        ) : null}
      </section>
    </div>
  )
}
