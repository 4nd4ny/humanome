// Accueil de l'atelier promptologue (P10) : paquets publiés (versions, défaut
// marqué), mes brouillons, « nouvelle version » depuis une publiée.

import { useEffect, useState } from 'react'
import { normalizeDraftEntry, suggestNextVersion } from './api.js'

/**
 * @param {object} props
 * @param {object} props.api client createPromptologueApi
 */
export default function AccueilSection({ api }) {
  const [state, setState] = useState({
    status: 'loading',
    published: [],
    drafts: [],
    defaut: null,
    error: null,
  })
  const [creation, setCreation] = useState(null) // {fromId, fromVersion, version}
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      api.listPublished().catch(() => []),
      api.listDrafts().catch(() => []),
      api.getDefault().catch(() => null),
    ]).then(([published, drafts, defaut]) => {
      if (!alive) return
      setState({
        status: 'ready',
        published: (Array.isArray(published) ? published : []).filter(
          (p) => typeof p?.id === 'string' && typeof p?.version === 'string',
        ),
        drafts: (Array.isArray(drafts) ? drafts : [])
          .map(normalizeDraftEntry)
          .filter((d) => d !== null),
        defaut:
          typeof defaut?.id === 'string' && typeof defaut?.version === 'string' ? defaut : null,
        error: null,
      })
    })
    return () => {
      alive = false
    }
  }, [api])

  async function createDraft() {
    setBusy(true)
    setNotice(null)
    try {
      const { fromId, fromVersion, version } = creation
      const data = await api.createDraft({ fromId, fromVersion, version })
      const draftId = data?.draftId
      if (draftId === undefined || draftId === null) {
        throw new Error('Réponse inattendue de l’API (draftId manquant).')
      }
      window.location.hash = `#/promptologue/editeur/${encodeURIComponent(String(draftId))}`
    } catch (err) {
      setNotice({ kind: 'error', text: err?.message ?? 'La création du brouillon a échoué.' })
    } finally {
      setBusy(false)
    }
  }

  async function proposeDefault(pkg) {
    setNotice(null)
    try {
      await api.proposeDefault(pkg.id, pkg.version)
      setNotice({
        kind: 'ok',
        text: `Proposition envoyée : ${pkg.id}@${pkg.version} comme version par défaut (validation admin requise).`,
      })
    } catch (err) {
      setNotice({ kind: 'error', text: err?.message ?? 'La proposition a échoué.' })
    }
  }

  if (state.status === 'loading') {
    return <p role="status">Chargement des paquets…</p>
  }

  const isDefault = (p) =>
    state.defaut !== null && p.id === state.defaut.id && p.version === state.defaut.version

  return (
    <div className="promptologue-accueil">
      {notice ? (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'load-error' : 'account-notice'}>
          {notice.text}
        </p>
      ) : null}

      <section aria-label="Paquets publiés">
        <h2>Paquets publiés</h2>
        {state.published.length === 0 ? (
          <p>Aucune version publiée sur ce serveur.</p>
        ) : (
          <table className="promptologue-table">
            <thead>
              <tr>
                <th scope="col">Paquet</th>
                <th scope="col">Version</th>
                <th scope="col">Description</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.published.map((p) => (
                <tr key={`${p.id}@${p.version}`}>
                  <td>
                    <code>{p.id}</code>
                  </td>
                  <td>
                    {p.version}{' '}
                    {isDefault(p) ? <strong className="promptologue-defaut">par défaut</strong> : null}
                  </td>
                  <td>{p.description ?? ''}</td>
                  <td className="promptologue-actions">
                    <button
                      type="button"
                      onClick={() =>
                        setCreation({
                          fromId: p.id,
                          fromVersion: p.version,
                          version: suggestNextVersion(p.version),
                        })
                      }
                    >
                      Nouvelle version
                    </button>{' '}
                    {!isDefault(p) ? (
                      <button type="button" onClick={() => proposeDefault(p)}>
                        Proposer par défaut
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {creation ? (
          <form
            className="promptologue-creation"
            aria-label="Nouvelle version"
            onSubmit={(event) => {
              event.preventDefault()
              createDraft()
            }}
          >
            <p>
              Nouveau brouillon depuis <code>{creation.fromId}</code>@{creation.fromVersion} :
            </p>
            <label>
              Version (semver, strictement croissante pour ce paquet){' '}
              <input
                value={creation.version}
                onChange={(event) => setCreation({ ...creation, version: event.target.value })}
                aria-label="Version du brouillon"
              />
            </label>{' '}
            <button type="submit" disabled={busy}>
              Créer le brouillon
            </button>{' '}
            <button type="button" onClick={() => setCreation(null)}>
              Annuler
            </button>
          </form>
        ) : null}
      </section>

      <section aria-label="Mes brouillons">
        <h2>Mes brouillons</h2>
        {state.drafts.length === 0 ? (
          <p>
            Aucun brouillon. Créez une « nouvelle version » depuis un paquet publié pour commencer.
          </p>
        ) : (
          <ul className="promptologue-drafts">
            {state.drafts.map((d) => (
              <li key={d.draftId}>
                <a href={`#/promptologue/editeur/${encodeURIComponent(d.draftId)}`}>
                  {d.document ? `${d.document.id}@${d.document.version}` : `brouillon ${d.draftId}`}
                </a>
                {d.updatedAt ? <span className="privacy-note"> — modifié le {d.updatedAt}</span> : null}
              </li>
            ))}
          </ul>
        )}
        <p className="privacy-note">
          Un brouillon ne s’exécute que chez son auteur (banc d’essai) ; seule une version publiée
          est exécutable par autrui — voir docs/securite-prompts.md.
        </p>
      </section>
    </div>
  )
}
