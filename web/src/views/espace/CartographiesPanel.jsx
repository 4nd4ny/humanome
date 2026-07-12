// Panneau « Mes cartographies » (P8.4/P8.5/P8.6, chantier C) — consommé par
// EspaceView (chantier B). Les cartographies vivent en LOCAL (IndexedDB,
// lib/carto-store.js) ; la copie serveur est un OPT-IN explicite distinct
// (cahier §3.2, §6.2) matérialisé par `serverId`. Actions par cartographie :
// voir (prop onOpen câblée par B) / télécharger le JSON / confidentialité /
// copier-retirer du serveur / partager par lien + mot de passe (si copie
// serveur) / supprimer. Section « Mes données » : export/import d'archive.
import { useCallback, useEffect, useState } from 'react'
import { ApiError, apiFetch } from '../../api/client.js'
import { downloadJson } from '../../lib/archive.js'
import { createCartoStore } from '../../lib/carto-store.js'
import { createPortfolioStore } from '../../lib/portfolio-store.js'
import ExportSection from './ExportSection.jsx'
import ShareDialog from './ShareDialog.jsx'

const VISIBILITY_LABELS = {
  privee: 'Privée',
  cartographe: 'Partagée avec mon cartographe',
  publique: 'Publique (partageable)',
}

const TYPE_LABELS = { jour: 'Journée', merge: 'Parcours (merge)' }

/** @param {string} iso @returns {string} date française courte */
function frShort(iso) {
  if (typeof iso !== 'string' || iso === '') return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('fr-FR')
}

/** Corps du POST api/cartographies (contrat M6) depuis une entrée locale. */
function toServerPayload(entry) {
  const payload = {
    type: entry.type,
    titre: entry.titre,
    visibility: entry.visibility,
    document: entry.document,
  }
  if (entry.promptPackage?.id) {
    payload.promptPackageId = entry.promptPackage.id
    payload.promptPackageVersion = entry.promptPackage.version
  }
  if (entry.referentiel?.id) {
    payload.referentielId = entry.referentiel.id
    payload.referentielVersion = entry.referentiel.version
  }
  if (entry.runMeta) payload.runMeta = entry.runMeta
  return payload
}

/** @param {Error} error @returns {string} message français (401 = pas de session) */
function serverErrorMessage(error, actionLabel) {
  if (error instanceof ApiError && error.status === 401) {
    return `Connectez-vous (espace compte) pour ${actionLabel}.`
  }
  return error.message
}

/**
 * @param {{
 *   store?: ReturnType<typeof createCartoStore>,       // défaut : IndexedDB réel
 *   portfolioStore?: ReturnType<typeof createPortfolioStore>, // pour l'archive
 *   onOpen?: (document: object, entry: object) => void, // « Voir » — câblé par B
 *   fetchFn?: typeof fetch,                             // test seam API
 *   download?: (filename: string, text: string) => void, // test seam téléchargements
 *   getAccount?: Function, getReferentiel?: Function, getPromptPackages?: Function, // seams export
 * }} props
 */
export default function CartographiesPanel({
  store,
  portfolioStore,
  onOpen,
  fetchFn,
  download,
  getAccount,
  getReferentiel,
  getPromptPackages,
}) {
  const [effectiveStore] = useState(() => store ?? createCartoStore())
  const [effectivePortfolioStore] = useState(() => portfolioStore ?? createPortfolioStore())
  const [entries, setEntries] = useState(null) // null = chargement
  const [storageError, setStorageError] = useState(null)
  const [notice, setNotice] = useState(null) // {kind: 'info' | 'error', text}
  const [busyId, setBusyId] = useState(null)
  const [optInId, setOptInId] = useState(null) // entrée montrant le texte RGPD
  const [shareEntryId, setShareEntryId] = useState(null)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)

  const apiOptions = fetchFn ? { fetchFn } : {}

  const reload = useCallback(async () => {
    try {
      const records = await effectiveStore.listCartographies()
      setEntries(records)
      setStorageError(null)
    } catch (error) {
      setEntries([])
      setStorageError(
        `Stockage local indisponible (${error.message}) : la liste des cartographies ne peut pas être lue.`,
      )
    }
  }, [effectiveStore])

  useEffect(() => {
    reload()
  }, [reload])

  async function handleVisibilityChange(entry, visibility) {
    setNotice(null)
    setBusyId(entry.id)
    try {
      if (entry.serverId != null) {
        await apiFetch(`cartographies/${entry.serverId}`, {
          method: 'PATCH',
          body: { visibility },
          ...apiOptions,
        })
      }
      await effectiveStore.updateCartography(entry.id, { visibility })
      await reload()
    } catch (error) {
      setNotice({
        kind: 'error',
        text: serverErrorMessage(error, 'changer la confidentialité de la copie serveur'),
      })
    } finally {
      setBusyId(null)
    }
  }

  async function handleCopyToServer(entry) {
    setNotice(null)
    setBusyId(entry.id)
    try {
      const data = await apiFetch('cartographies', {
        method: 'POST',
        body: toServerPayload(entry),
        ...apiOptions,
      })
      await effectiveStore.updateCartography(entry.id, { serverId: data.id })
      setOptInId(null)
      setNotice({
        kind: 'info',
        text: `« ${entry.titre} » est copiée sur le serveur (retrait possible à tout moment).`,
      })
      await reload()
    } catch (error) {
      setNotice({
        kind: 'error',
        text: serverErrorMessage(error, 'copier une cartographie sur le serveur'),
      })
    } finally {
      setBusyId(null)
    }
  }

  async function handleRemoveFromServer(entry) {
    setNotice(null)
    setBusyId(entry.id)
    try {
      try {
        await apiFetch(`cartographies/${entry.serverId}`, { method: 'DELETE', ...apiOptions })
      } catch (error) {
        // 404 : la copie n'existe déjà plus côté serveur — on aligne le local.
        if (!(error instanceof ApiError && error.status === 404)) throw error
      }
      await effectiveStore.updateCartography(entry.id, { serverId: null })
      if (shareEntryId === entry.id) setShareEntryId(null)
      setNotice({
        kind: 'info',
        text: `Copie serveur de « ${entry.titre} » supprimée (les liens de partage sont purgés).`,
      })
      await reload()
    } catch (error) {
      setNotice({
        kind: 'error',
        text: serverErrorMessage(error, 'retirer une cartographie du serveur'),
      })
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(entry) {
    if (pendingDeleteId !== entry.id) {
      setPendingDeleteId(entry.id)
      return
    }
    setNotice(null)
    setBusyId(entry.id)
    try {
      if (entry.serverId != null) {
        try {
          await apiFetch(`cartographies/${entry.serverId}`, { method: 'DELETE', ...apiOptions })
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) throw error
        }
      }
      await effectiveStore.removeCartography(entry.id)
      if (shareEntryId === entry.id) setShareEntryId(null)
      setNotice({ kind: 'info', text: `« ${entry.titre} » supprimée.` })
      await reload()
    } catch (error) {
      setNotice({
        kind: 'error',
        text: serverErrorMessage(error, 'supprimer la copie serveur'),
      })
    } finally {
      setPendingDeleteId(null)
      setBusyId(null)
    }
  }

  function handleDownload(entry) {
    const day = entry.document?.date ?? entry.document?.periode?.derniere ?? null
    const suffix = day ?? String(entry.updatedAt ?? '').slice(0, 10) ?? 'export'
    downloadJson(`cartographie-${entry.type}-${suffix}.json`, entry.document, download)
  }

  const shareEntry = entries?.find((entry) => entry.id === shareEntryId) ?? null

  return (
    <section className="carto-panel" aria-label="Mes cartographies">
      <h2>Mes cartographies</h2>
      <p className="carto-panel-intro">
        Vos cartographies sont conservées dans ce navigateur. La copie serveur est un choix
        explicite, cartographie par cartographie — elle seule permet le partage par lien.
      </p>

      {storageError ? <p role="alert">{storageError}</p> : null}
      {notice ? (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`notice-${notice.kind}`}>
          {notice.text}
        </p>
      ) : null}

      {entries === null ? <p role="status">Chargement des cartographies…</p> : null}
      {entries !== null && entries.length === 0 && !storageError ? (
        <p className="carto-empty">
          Aucune cartographie pour l’instant. Lancez une cartographie depuis votre portfolio pour
          la retrouver ici.
        </p>
      ) : null}

      <ul className="carto-list">
        {(entries ?? []).map((entry) => {
          const busy = busyId === entry.id
          return (
            <li key={entry.id} className="carto-item" data-testid="carto-item">
              <div className="carto-item-head">
                <strong>{entry.titre}</strong>
                <span className="carto-type">{TYPE_LABELS[entry.type] ?? entry.type}</span>
                <span className="carto-date">{frShort(entry.updatedAt)}</span>
                {entry.serverId != null ? (
                  <span className="badge-serveur" title="Cette cartographie a une copie sur le serveur (opt-in)">
                    copie serveur
                  </span>
                ) : null}
              </div>

              <div className="carto-item-controls">
                <label className="carto-visibility">
                  Confidentialité{' '}
                  <select
                    value={entry.visibility}
                    disabled={busy}
                    aria-label={`Confidentialité de ${entry.titre}`}
                    onChange={(event) => handleVisibilityChange(entry, event.target.value)}
                  >
                    {Object.entries(VISIBILITY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="carto-item-actions">
                  {onOpen ? (
                    <button
                      type="button"
                      className="button"
                      disabled={busy || entry.document == null}
                      onClick={() => onOpen(entry.document, entry)}
                    >
                      Voir
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button"
                    disabled={busy || entry.document == null}
                    onClick={() => handleDownload(entry)}
                  >
                    Télécharger le JSON
                  </button>
                  {entry.serverId == null ? (
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => setOptInId(optInId === entry.id ? null : entry.id)}
                    >
                      Copier sur le serveur
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          setShareEntryId(shareEntryId === entry.id ? null : entry.id)
                        }
                      >
                        Partager
                      </button>
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={() => handleRemoveFromServer(entry)}
                      >
                        Retirer du serveur
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="button button-danger"
                    disabled={busy}
                    onClick={() => handleDelete(entry)}
                  >
                    {pendingDeleteId === entry.id ? 'Confirmer la suppression' : 'Supprimer'}
                  </button>
                  {pendingDeleteId === entry.id ? (
                    <button
                      type="button"
                      className="button"
                      onClick={() => setPendingDeleteId(null)}
                    >
                      Annuler
                    </button>
                  ) : null}
                </div>
              </div>

              {optInId === entry.id ? (
                <div className="carto-optin" data-testid="carto-optin">
                  <p>
                    <strong>Copie serveur = choix explicite (RGPD).</strong> Par défaut, cette
                    cartographie ne quitte pas votre navigateur. En confirmant, vous acceptez que
                    le document de la cartographie (jamais votre portfolio) soit stocké sur le
                    serveur humanome.xyz, afin de pouvoir le partager par lien et le retrouver
                    depuis un autre appareil. Vous pouvez retirer cette copie à tout moment
                    (« Retirer du serveur ») ; la suppression de votre compte purge réellement
                    toutes vos données.
                  </p>
                  <div className="carto-optin-actions">
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={busy}
                      onClick={() => handleCopyToServer(entry)}
                    >
                      Je confirme la copie sur le serveur
                    </button>
                    <button type="button" className="button" onClick={() => setOptInId(null)}>
                      Annuler
                    </button>
                  </div>
                </div>
              ) : null}

              {shareEntry?.id === entry.id ? (
                <ShareDialog
                  entry={shareEntry}
                  fetchFn={fetchFn}
                  onClose={() => setShareEntryId(null)}
                />
              ) : null}
            </li>
          )
        })}
      </ul>

      <ExportSection
        cartoStore={effectiveStore}
        portfolioStore={effectivePortfolioStore}
        onImported={reload}
        fetchFn={fetchFn}
        download={download}
        getAccount={getAccount}
        getReferentiel={getReferentiel}
        getPromptPackages={getPromptPackages}
      />
    </section>
  )
}
