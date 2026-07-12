// Éditeur de brouillon de prompt-package (P10.2).
//
// - liste des prompts (role/nom) + éditeur de texte par prompt (textarea
//   code-friendly, compteur de caractères) ;
// - variables[] éditables {nom, description, exemple} ;
// - code.orchestration (textarea) + entrypoint ;
// - métadonnées (description, modèle cible) et changelog (lecture) ;
// - « Valider » : engine validateDocument('prompt-package') côté client ;
// - « Enregistrer » : PUT drafts/{draftId} (le serveur re-valide) ;
// - « Publier » : confirmation semver + changelog (version immuable ensuite) ;
// - diff visuel contre la version d'origine (GET diff, rendu tolérant).

import { useEffect, useMemo, useState } from 'react'
import { validateDocument } from '@engine/validation.js'
import { normalizeDraftEntry } from './api.js'

/** Rendu tolérant d'une liste de lignes de diff (chaînes « + … » / « - … »). */
function DiffLines({ lines }) {
  const items = (Array.isArray(lines) ? lines : []).map((line) => {
    if (typeof line === 'string') return line
    if (line && typeof line === 'object') {
      const marker = line.op ?? line.type ?? line.t ?? ' '
      const text = line.ligne ?? line.line ?? line.texte ?? JSON.stringify(line)
      return `${marker} ${text}`
    }
    return String(line)
  })
  return (
    <pre className="promptologue-diff-lines">
      {items.map((line, i) => (
        <span
          key={i}
          className={
            line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-del' : 'diff-ctx'
          }
        >
          {line}
          {'\n'}
        </span>
      ))}
    </pre>
  )
}

/** Section du diff serveur : listes ajoutés/retirés/modifiés, repli JSON brut. */
function DiffSection({ title, value }) {
  if (value === undefined || value === null) return null
  const known =
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ('ajoutes' in value || 'retires' in value || 'modifies' in value)
  return (
    <section className="promptologue-diff-section">
      <h4>{title}</h4>
      {known ? (
        <>
          {(value.ajoutes ?? []).length > 0 ? (
            <p>
              Ajoutés :{' '}
              {(value.ajoutes ?? []).map((e) => (typeof e === 'string' ? e : `${e.role ?? ''} — ${e.nom ?? JSON.stringify(e)}`)).join(' ; ')}
            </p>
          ) : null}
          {(value.retires ?? []).length > 0 ? (
            <p>
              Retirés :{' '}
              {(value.retires ?? []).map((e) => (typeof e === 'string' ? e : `${e.role ?? ''} — ${e.nom ?? JSON.stringify(e)}`)).join(' ; ')}
            </p>
          ) : null}
          {(value.modifies ?? []).map((entry, i) => (
            <div key={i}>
              <p>
                Modifié : {typeof entry === 'string' ? entry : `${entry.role ?? ''} — ${entry.nom ?? ''}`}
              </p>
              {entry && typeof entry === 'object' && entry.diff ? <DiffLines lines={entry.diff} /> : null}
            </div>
          ))}
        </>
      ) : Array.isArray(value) ? (
        <DiffLines lines={value} />
      ) : (
        <pre className="promptologue-diff-lines">{JSON.stringify(value, null, 2)}</pre>
      )}
    </section>
  )
}

/** Diff structurel complet renvoyé par GET /api/prompt-packages/{id}/diff. */
export function DiffView({ diff }) {
  if (!diff || typeof diff !== 'object') return null
  const rest = { ...diff }
  for (const key of ['prompts', 'variables', 'code', 'metadata', 'from', 'to']) delete rest[key]
  return (
    <div className="promptologue-diff" data-testid="promptologue-diff">
      <h3>
        Diff {diff.from ?? ''} → {diff.to ?? ''}
      </h3>
      <DiffSection title="Prompts" value={diff.prompts} />
      <DiffSection title="Variables" value={diff.variables} />
      <DiffSection title="Code d'orchestration" value={diff.code} />
      <DiffSection title="Métadonnées" value={diff.metadata} />
      {Object.keys(rest).length > 0 ? (
        <pre className="promptologue-diff-lines">{JSON.stringify(rest, null, 2)}</pre>
      ) : null}
    </div>
  )
}

/**
 * @param {object} props
 * @param {object} props.api client createPromptologueApi
 * @param {string} props.draftId
 */
export default function EditeurSection({ api, draftId }) {
  const [state, setState] = useState({ status: 'loading', doc: null, origin: null, error: null })
  const [selected, setSelected] = useState(0)
  const [validation, setValidation] = useState(null)
  const [notice, setNotice] = useState(null)
  const [publishing, setPublishing] = useState(null) // {changelog}
  const [diff, setDiff] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .getDraft(draftId)
      .then((raw) => {
        if (!alive) return
        const entry = normalizeDraftEntry(raw)
        if (!entry || !entry.document) {
          setState({
            status: 'error',
            doc: null,
            origin: null,
            error: `Brouillon introuvable : « ${draftId} » (seuls vos propres brouillons sont éditables).`,
          })
          return
        }
        setState({
          status: 'ready',
          doc: entry.document,
          origin: { fromId: entry.fromId ?? entry.document.id, fromVersion: entry.fromVersion },
          error: null,
        })
      })
      .catch((err) => {
        if (!alive) return
        setState({ status: 'error', doc: null, origin: null, error: err?.message ?? 'Chargement impossible.' })
      })
    return () => {
      alive = false
    }
  }, [api, draftId])

  const doc = state.doc
  const originVersion = useMemo(() => {
    if (!doc) return null
    if (state.origin?.fromVersion) return state.origin.fromVersion
    const log = doc.changelog ?? []
    // Dernière entrée ≠ version du brouillon = version d'origine probable.
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i]?.version && log[i].version !== doc.version) return log[i].version
    }
    return null
  }, [doc, state.origin])

  function update(mutator) {
    setState((current) => {
      const next = structuredClone(current.doc)
      mutator(next)
      return { ...current, doc: next }
    })
    setValidation(null)
    setNotice(null)
  }

  function validate() {
    const result = validateDocument('prompt-package', doc)
    setValidation(result)
    return result.valid
  }

  async function save() {
    if (!validate()) return
    setBusy(true)
    setNotice(null)
    try {
      await api.saveDraft(draftId, doc)
      setNotice({ kind: 'ok', text: 'Brouillon enregistré.' })
    } catch (err) {
      setNotice({ kind: 'error', text: err?.message ?? 'L’enregistrement a échoué.' })
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    setBusy(true)
    setNotice(null)
    try {
      await api.publishDraft(draftId, publishing.changelog)
      setPublishing(null)
      setNotice({
        kind: 'ok',
        text: `Version ${doc.id}@${doc.version} publiée — elle est désormais immuable.`,
      })
    } catch (err) {
      setNotice({ kind: 'error', text: err?.message ?? 'La publication a échoué.' })
    } finally {
      setBusy(false)
    }
  }

  async function loadDiff() {
    setNotice(null)
    try {
      const data = await api.diff(state.origin?.fromId ?? doc.id, originVersion, doc.version)
      setDiff(data)
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err?.message ?? 'Le diff serveur est indisponible pour ce brouillon.',
      })
    }
  }

  if (state.status === 'loading') return <p role="status">Chargement du brouillon…</p>
  if (state.status === 'error') {
    return (
      <div>
        <p role="alert" className="load-error">
          {state.error}
        </p>
        <p>
          <a href="#/promptologue">Retour à l’atelier</a>
        </p>
      </div>
    )
  }

  const prompts = doc.prompts ?? []
  const prompt = prompts[selected] ?? null

  return (
    <div className="promptologue-editeur">
      <h2>
        Brouillon <code>{doc.id}</code>@{doc.version}
      </h2>
      <p className="privacy-note">
        La version est fixée à la création du brouillon ; la publication la rend immuable
        (semver strictement croissant par paquet).
      </p>

      {notice ? (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={notice.kind === 'error' ? 'load-error' : 'account-notice'}
        >
          {notice.text}
        </p>
      ) : null}

      <section aria-label="Métadonnées">
        <h3>Métadonnées</h3>
        <label className="promptologue-field">
          Description du paquet
          <textarea
            rows={3}
            value={doc.description ?? ''}
            onChange={(event) => update((d) => (d.description = event.target.value))}
          />
        </label>
        <label className="promptologue-field">
          Modèle cible (vide = agnostique)
          <input
            value={doc.modeleCible ?? ''}
            onChange={(event) => update((d) => (d.modeleCible = event.target.value || null))}
          />
        </label>
        {(doc.changelog ?? []).length > 0 ? (
          <details>
            <summary>Changelog ({doc.changelog.length} entrées)</summary>
            <ul>
              {doc.changelog.map((entry, i) => (
                <li key={i}>
                  <strong>{entry.version}</strong>
                  {entry.date ? ` (${entry.date})` : ''} — {entry.description}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section aria-label="Prompts du paquet">
        <h3>Prompts ({prompts.length})</h3>
        <div className="promptologue-prompt-list" role="tablist" aria-label="Gabarits">
          {prompts.map((p, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === selected}
              className={i === selected ? 'is-active' : ''}
              onClick={() => setSelected(i)}
            >
              {p.role} — {p.nom}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              update((d) => {
                d.prompts.push({ role: 'nouveau-role', nom: 'Nouveau gabarit', texte: '…', variables: [] })
              })
            }
          >
            + Ajouter un prompt
          </button>
        </div>

        {prompt ? (
          <div className="promptologue-prompt">
            <label className="promptologue-field">
              Rôle (kebab-case)
              <input
                value={prompt.role}
                onChange={(event) => update((d) => (d.prompts[selected].role = event.target.value))}
              />
            </label>
            <label className="promptologue-field">
              Nom
              <input
                value={prompt.nom}
                onChange={(event) => update((d) => (d.prompts[selected].nom = event.target.value))}
              />
            </label>
            <label className="promptologue-field">
              Texte du gabarit
              <textarea
                className="code-editor"
                rows={14}
                spellCheck={false}
                value={prompt.texte}
                onChange={(event) => update((d) => (d.prompts[selected].texte = event.target.value))}
              />
            </label>
            <p className="promptologue-counter" data-testid="prompt-counter">
              {prompt.texte.length} caractères
            </p>

            <h4>Variables ({(prompt.variables ?? []).length})</h4>
            {(prompt.variables ?? []).map((variable, vi) => (
              <fieldset key={vi} className="promptologue-variable">
                <legend>
                  <code>{variable.nom || '(sans nom)'}</code>
                </legend>
                <label>
                  Nom{' '}
                  <input
                    value={variable.nom}
                    onChange={(event) =>
                      update((d) => (d.prompts[selected].variables[vi].nom = event.target.value))
                    }
                  />
                </label>
                <label>
                  Description{' '}
                  <input
                    value={variable.description}
                    onChange={(event) =>
                      update(
                        (d) => (d.prompts[selected].variables[vi].description = event.target.value),
                      )
                    }
                  />
                </label>
                <label>
                  Exemple{' '}
                  <input
                    value={variable.exemple ?? ''}
                    onChange={(event) =>
                      update((d) => (d.prompts[selected].variables[vi].exemple = event.target.value))
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() => update((d) => d.prompts[selected].variables.splice(vi, 1))}
                >
                  Retirer la variable
                </button>
              </fieldset>
            ))}
            <p>
              <button
                type="button"
                onClick={() =>
                  update((d) =>
                    d.prompts[selected].variables.push({ nom: '', description: '', exemple: '' }),
                  )
                }
              >
                + Ajouter une variable
              </button>{' '}
              {prompts.length > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    update((d) => d.prompts.splice(selected, 1))
                    setSelected(0)
                  }}
                >
                  Supprimer ce prompt
                </button>
              ) : null}
            </p>
          </div>
        ) : null}
      </section>

      <section aria-label="Code d'orchestration">
        <h3>Code d’orchestration (JS, exécuté en sandbox)</h3>
        <label className="promptologue-field">
          Module ESM
          <textarea
            className="code-editor"
            rows={16}
            spellCheck={false}
            value={doc.code?.orchestration ?? ''}
            onChange={(event) => update((d) => (d.code.orchestration = event.target.value))}
          />
        </label>
        <p className="promptologue-counter">{(doc.code?.orchestration ?? '').length} caractères</p>
        <label className="promptologue-field">
          Entrypoint (fonction exportée)
          <input
            value={doc.code?.entrypoint ?? ''}
            onChange={(event) => update((d) => (d.code.entrypoint = event.target.value))}
          />
        </label>
        <p className="privacy-note">
          Ce code s’exécutera dans un Web Worker isolé (iframe sandbox, CSP default-src 'none') :
          pas de DOM, pas de réseau hors abstraction providers — docs/securite-prompts.md.
        </p>
      </section>

      <section aria-label="Actions" className="promptologue-editeur-actions">
        <button type="button" onClick={validate}>
          Valider
        </button>{' '}
        <button type="button" onClick={save} disabled={busy}>
          Enregistrer
        </button>{' '}
        <button type="button" onClick={() => setPublishing({ changelog: '' })} disabled={busy}>
          Publier…
        </button>{' '}
        {originVersion ? (
          <button type="button" onClick={loadDiff}>
            Diff contre {originVersion}
          </button>
        ) : null}
      </section>

      {validation ? (
        validation.valid ? (
          <p role="status" className="account-notice" data-testid="validation-ok">
            Document valide au schéma prompt-package.
          </p>
        ) : (
          <div role="alert" className="load-error" data-testid="validation-errors">
            <p>{validation.errors.length} erreur(s) de schéma :</p>
            <ul>
              {validation.errors.slice(0, 10).map((err, i) => (
                <li key={i}>
                  <code>{err.path}</code> {err.message}
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}

      {publishing ? (
        <form
          className="promptologue-publish"
          aria-label="Publication"
          onSubmit={(event) => {
            event.preventDefault()
            publish()
          }}
        >
          <p>
            Publier <strong>
              {doc.id}@{doc.version}
            </strong>{' '}
            ? Une version publiée est <strong>immuable</strong> et exécutable par les autres
            utilisateurs. Le semver doit être strictement croissant pour ce paquet.
          </p>
          <label className="promptologue-field">
            Changelog de la version (obligatoire)
            <textarea
              rows={3}
              value={publishing.changelog}
              onChange={(event) => setPublishing({ changelog: event.target.value })}
            />
          </label>
          <button type="submit" disabled={busy || publishing.changelog.trim() === ''}>
            Confirmer la publication
          </button>{' '}
          <button type="button" onClick={() => setPublishing(null)}>
            Annuler
          </button>
        </form>
      ) : null}

      {diff ? <DiffView diff={diff} /> : null}
    </div>
  )
}
