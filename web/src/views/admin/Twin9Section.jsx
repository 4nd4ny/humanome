// Section « Twin_v9 » de l'administration (ADR-010 §2/§6) — le SEUL endroit du
// front où le CONTENU d'un gabarit du Golden Prompt est visible, et seulement
// pour le rôle admin (la garde vit dans AdminView ; les promptologues n'y
// accèdent PAS). Quatre blocs :
//   1. Gabarits  : liste (métadonnées) -> édition du contenu -> enregistrement
//                  versionné -> historique des versions.
//   2. Banc d'essai : rendre un gabarit avec des variables d'exemple (aucun
//                  appel LLM) -> {rendu, non_resolues}.
//   3. Réglages  : marge, packs PayPal, offre de modèles -> PUT partiel (diff).
//   4. Comptes   : supervision des comptes ayant une activité (soldes/cumuls).
//
// Le contenu rendu (gabarit édité, rendu du banc d'essai) reste du TEXTE BRUT :
// jamais de renderMarkdown/HTML — ce n'est pas du narratif, c'est un secret
// industriel. React échappe le texte, on l'affiche tel quel dans <textarea>/<pre>.

import { useCallback, useEffect, useState } from 'react'
import { ApiError, ApiUnavailableError } from '../../api/client.js'
import {
  fetchComptes,
  fetchProtocole,
  fetchProtocoleList,
  fetchProtocoleVersions,
  fetchTwin9Config,
  formatUsd,
  saveProtocole,
  saveTwin9Config,
  testerProtocole,
} from '../../api/twin9.js'

/** Étages connus (contrat serveur Twin9Config::ETAGES) — ordre canonique. */
const ETAGES = ['taggers', 'rapide', 'tribunal']

/** @param {string} iso @returns {string} date/heure française courte ('—' si vide) */
function frDate(iso) {
  if (typeof iso !== 'string' || iso === '') return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('fr-FR')
}

// ---- 1. Gabarits -----------------------------------------------------------

/**
 * Liste des gabarits (métadonnées seules) + éditeur du contenu. Cliquer un
 * gabarit charge son contenu (fetchProtocole) dans le <textarea> ; Enregistrer
 * versionne côté serveur (saveProtocole) ; « versions » liste l'historique.
 */
function GabaritsBloc({ protocoles, fetchFn, onSaved }) {
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [versions, setVersions] = useState(null)

  async function openGabarit(name) {
    setSelected(name)
    setLoading(true)
    setContent('')
    setMessage(null)
    setError(null)
    setVersions(null)
    try {
      const tpl = await fetchProtocole(name, { fetchFn })
      setContent(tpl?.content ?? '')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement du gabarit impossible.')
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const res = await saveProtocole(selected, content, { fetchFn })
      setMessage(
        res?.status === 'unchanged'
          ? 'Contenu inchangé — aucune nouvelle version.'
          : `Gabarit « ${selected} » enregistré (nouvelle version archivée).`,
      )
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible.')
    } finally {
      setBusy(false)
    }
  }

  async function loadVersions() {
    setError(null)
    try {
      const res = await fetchProtocoleVersions(selected, { fetchFn })
      setVersions(Array.isArray(res?.versions) ? res.versions : [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Historique indisponible.')
    }
  }

  return (
    <div className="twin9-admin-bloc">
      <h3>Gabarits du Golden Prompt</h3>
      <p className="twin9-admin-warning" role="note">
        <strong>Contenu confidentiel — ne pas divulguer.</strong> Ces gabarits sont le secret
        industriel de la plateforme (ADR-010) : ils ne sont visibles qu’ici, pour l’administration.
      </p>

      {protocoles.length === 0 ? (
        <p>Aucun gabarit importé pour l’instant.</p>
      ) : (
        <ul className="twin9-admin-gabarits">
          {protocoles.map((p) => (
            <li key={p.name}>
              <button
                type="button"
                className="twin9-admin-gabarit"
                aria-pressed={selected === p.name}
                onClick={() => openGabarit(p.name)}
              >
                <strong>{p.name}</strong>
                <span>
                  {p.longueur} caractères · {p.variables.length} variable
                  {p.variables.length === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <div className="twin9-admin-editeur">
          <h4>Édition : {selected}</h4>
          {loading ? (
            <p role="status">Chargement du contenu…</p>
          ) : (
            <>
              <label htmlFor="twin9-gabarit-content">Contenu du gabarit (texte brut)</label>
              <textarea
                id="twin9-gabarit-content"
                className="twin9-admin-textarea"
                rows={16}
                spellCheck={false}
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
              <div className="twin9-admin-actions">
                <button type="button" disabled={busy || content.trim() === ''} onClick={save}>
                  Enregistrer
                </button>
                <button
                  type="button"
                  className="admin-button-secondary"
                  disabled={busy}
                  onClick={loadVersions}
                >
                  Voir les versions
                </button>
              </div>
            </>
          )}

          {message ? (
            <p role="status" className="admin-message">
              {message}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="load-error">
              {error}
            </p>
          ) : null}

          {versions ? (
            versions.length === 0 ? (
              <p>Aucune version antérieure archivée.</p>
            ) : (
              <table className="admin-table twin9-admin-versions">
                <thead>
                  <tr>
                    <th scope="col">Version</th>
                    <th scope="col">Longueur</th>
                    <th scope="col">Variables</th>
                    <th scope="col">Archivée le</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.version}>
                      <td>{v.version}</td>
                      <td>{v.longueur}</td>
                      <td>{v.variables.length}</td>
                      <td>{frDate(v.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ---- 2. Banc d'essai -------------------------------------------------------

/**
 * Rendre un gabarit avec des variables d'exemple (aucun appel LLM) : les champs
 * sont générés depuis les .variables du gabarit choisi ; testerProtocole renvoie
 * {rendu, non_resolues}. Le rendu est du texte brut réservé à l'admin.
 */
function BancEssaiBloc({ protocoles, fetchFn }) {
  const [name, setName] = useState('')
  const [vars, setVars] = useState({})
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const selected = protocoles.find((p) => p.name === name) ?? null

  function choose(next) {
    setName(next)
    setResult(null)
    setError(null)
    const found = protocoles.find((p) => p.name === next)
    const init = {}
    for (const v of found?.variables ?? []) init[v] = ''
    setVars(init)
  }

  async function run() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(await testerProtocole(name, vars, { fetchFn }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Test impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="twin9-admin-bloc">
      <h3>Banc d’essai</h3>
      <p className="privacy-note">
        Remplit un gabarit avec des variables d’exemple et affiche le rendu — <strong>aucun appel
        LLM</strong>, aucun débit. Réservé à l’administration (le rendu contient le gabarit).
      </p>

      <div className="admin-field">
        <label htmlFor="twin9-banc-gabarit">Gabarit</label>
        <div className="admin-field-input">
          <select
            id="twin9-banc-gabarit"
            value={name}
            onChange={(event) => choose(event.target.value)}
          >
            <option value="">— choisir un gabarit —</option>
            {protocoles.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selected ? (
        <form
          className="twin9-admin-banc"
          onSubmit={(event) => {
            event.preventDefault()
            run()
          }}
        >
          {selected.variables.length === 0 ? (
            <p>Ce gabarit n’a aucune variable.</p>
          ) : (
            selected.variables.map((v) => (
              <div className="admin-field" key={v}>
                <label htmlFor={`twin9-var-${v}`}>{v}</label>
                <div className="admin-field-input">
                  <input
                    id={`twin9-var-${v}`}
                    type="text"
                    value={vars[v] ?? ''}
                    onChange={(event) =>
                      setVars((prev) => ({ ...prev, [v]: event.target.value }))
                    }
                  />
                </div>
              </div>
            ))
          )}
          <button type="submit" disabled={busy}>
            Rendre le gabarit
          </button>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="load-error">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="twin9-admin-rendu">
          <h4>Rendu</h4>
          <pre data-testid="twin9-rendu">{result.rendu}</pre>
          {Array.isArray(result.non_resolues) && result.non_resolues.length > 0 ? (
            <p role="status" className="admin-message">
              Variables non résolues : {result.non_resolues.join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ---- 3. Réglages -----------------------------------------------------------

/** Brouillon (chaînes) depuis la config effective (admin shape). */
function draftFromConfig(config) {
  return {
    marge: config?.marge === undefined ? '' : String(config.marge),
    packs: (config?.packs ?? []).map((p) => ({
      montant_usd: String(p.montant_usd),
      libelle: p.libelle,
    })),
    modeles: Object.entries(config?.modeles ?? {}).map(([id, m]) => ({
      id,
      prixIn: String(m.prix_usd_mtok?.[0] ?? ''),
      prixOut: String(m.prix_usd_mtok?.[1] ?? ''),
      etages: Array.isArray(m.etages) ? [...m.etages] : [],
    })),
  }
}

/**
 * Réglages Twin_v9 : marge (1..5), packs (montant + libellé, ajout/suppression),
 * offre de modèles (id, prix [in, out], étages). Enregistrer envoie un DIFF de
 * clés de haut niveau (le serveur fusionne puis valide la config complète ;
 * 422 hors bornes affiché tel quel).
 */
function ReglagesBloc({ config, fetchFn, onSaved }) {
  const [draft, setDraft] = useState(() => draftFromConfig(config))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  // Resync sur la config sauvegardée (onSaved met à jour le parent -> config).
  useEffect(() => {
    setDraft(draftFromConfig(config))
  }, [config])

  function setPack(i, field, value) {
    setDraft((prev) => ({
      ...prev,
      packs: prev.packs.map((p, j) => (j === i ? { ...p, [field]: value } : p)),
    }))
  }
  function addPack() {
    setDraft((prev) => ({ ...prev, packs: [...prev.packs, { montant_usd: '', libelle: '' }] }))
  }
  function removePack(i) {
    setDraft((prev) => ({ ...prev, packs: prev.packs.filter((_, j) => j !== i) }))
  }

  function setModele(i, field, value) {
    setDraft((prev) => ({
      ...prev,
      modeles: prev.modeles.map((m, j) => (j === i ? { ...m, [field]: value } : m)),
    }))
  }
  function toggleEtage(i, etage) {
    setDraft((prev) => ({
      ...prev,
      modeles: prev.modeles.map((m, j) =>
        j === i
          ? {
              ...m,
              // Ordre canonique conservé (comparaison de diff stable).
              etages: m.etages.includes(etage)
                ? m.etages.filter((e) => e !== etage)
                : ETAGES.filter((e) => m.etages.includes(e) || e === etage),
            }
          : m,
      ),
    }))
  }
  function addModele() {
    setDraft((prev) => ({
      ...prev,
      modeles: [...prev.modeles, { id: '', prixIn: '', prixOut: '', etages: [] }],
    }))
  }
  function removeModele(i) {
    setDraft((prev) => ({ ...prev, modeles: prev.modeles.filter((_, j) => j !== i) }))
  }

  /** DIFF brouillon -> config effective, ou {error} (validation cliente minimale). */
  function buildPatch() {
    const patch = {}

    const marge = Number.parseFloat(String(draft.marge).replace(',', '.'))
    if (!Number.isFinite(marge)) return { error: 'Marge invalide : nombre attendu.' }
    if (marge !== config.marge) patch.marge = marge

    const nextPacks = draft.packs.map((p) => ({
      montant_usd: Number.parseFloat(String(p.montant_usd).replace(',', '.')),
      libelle: p.libelle.trim(),
    }))
    for (const p of nextPacks) {
      if (!Number.isFinite(p.montant_usd)) return { error: 'Montant de pack invalide.' }
    }
    if (JSON.stringify(nextPacks) !== JSON.stringify(config.packs)) patch.packs = nextPacks

    const nextModeles = {}
    for (const m of draft.modeles) {
      const id = m.id.trim()
      if (id === '') return { error: 'Identifiant de modèle vide.' }
      const prixIn = Number.parseFloat(String(m.prixIn).replace(',', '.'))
      const prixOut = Number.parseFloat(String(m.prixOut).replace(',', '.'))
      if (!Number.isFinite(prixIn) || !Number.isFinite(prixOut)) {
        return { error: `Prix invalide pour « ${id} ».` }
      }
      nextModeles[id] = { prix_usd_mtok: [prixIn, prixOut], etages: m.etages }
    }
    if (JSON.stringify(nextModeles) !== JSON.stringify(config.modeles)) patch.modeles = nextModeles

    return { patch }
  }

  async function save() {
    const { patch, error: clientError } = buildPatch()
    if (clientError) {
      setMessage(null)
      setError(clientError)
      return
    }
    if (!patch || Object.keys(patch).length === 0) {
      setError(null)
      setMessage('Aucune modification à enregistrer.')
      return
    }
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const next = await saveTwin9Config(patch, { fetchFn })
      onSaved(next)
      setMessage('Réglages Twin_v9 enregistrés.')
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof ApiUnavailableError
          ? err.message
          : 'Enregistrement impossible.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="twin9-admin-bloc">
      <h3>Réglages</h3>

      <div className="admin-field">
        <label htmlFor="twin9-marge">Marge (multiplicateur sur les prix Anthropic)</label>
        <div className="admin-field-input">
          <input
            id="twin9-marge"
            type="number"
            inputMode="decimal"
            min="1"
            max="5"
            step="0.01"
            value={draft.marge}
            disabled={busy}
            onChange={(event) => setDraft((prev) => ({ ...prev, marge: event.target.value }))}
          />
          <span className="admin-field-bounds">1 – 5</span>
        </div>
      </div>
      <p className="privacy-note">
        Par défaut <strong>×1,10</strong> (+10 %) : couvre les frais PayPal et participe à
        l’hébergement OVH, au nom de domaine et au budget Haiku de la démo gratuite.
      </p>

      <h4>Packs de recharge (PayPal)</h4>
      <ul className="twin9-admin-packs">
        {draft.packs.map((p, i) => (
          <li key={i} className="twin9-admin-pack">
            <div className="admin-field">
              <label htmlFor={`twin9-pack-montant-${i}`}>Montant (USD)</label>
              <div className="admin-field-input">
                <input
                  id={`twin9-pack-montant-${i}`}
                  type="number"
                  inputMode="decimal"
                  min="1"
                  max="100"
                  step="1"
                  value={p.montant_usd}
                  disabled={busy}
                  onChange={(event) => setPack(i, 'montant_usd', event.target.value)}
                />
                <span className="admin-field-bounds">1 – 100</span>
              </div>
            </div>
            <div className="admin-field">
              <label htmlFor={`twin9-pack-libelle-${i}`}>Libellé</label>
              <div className="admin-field-input">
                <input
                  id={`twin9-pack-libelle-${i}`}
                  type="text"
                  value={p.libelle}
                  disabled={busy}
                  onChange={(event) => setPack(i, 'libelle', event.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              className="admin-button-secondary"
              disabled={busy}
              onClick={() => removePack(i)}
              aria-label={`Supprimer le pack ${i + 1}`}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="admin-button-secondary" disabled={busy} onClick={addPack}>
        Ajouter un pack
      </button>

      <h4>Offre de modèles</h4>
      <ul className="twin9-admin-modeles">
        {draft.modeles.map((m, i) => (
          <li key={i} className="twin9-admin-modele">
            <div className="admin-field">
              <label htmlFor={`twin9-modele-id-${i}`}>Identifiant du modèle</label>
              <div className="admin-field-input">
                <input
                  id={`twin9-modele-id-${i}`}
                  type="text"
                  value={m.id}
                  disabled={busy}
                  onChange={(event) => setModele(i, 'id', event.target.value)}
                />
              </div>
            </div>
            <div className="admin-field">
              <label htmlFor={`twin9-modele-prixin-${i}`}>Prix entrée (USD / Mtok)</label>
              <div className="admin-field-input">
                <input
                  id={`twin9-modele-prixin-${i}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={m.prixIn}
                  disabled={busy}
                  onChange={(event) => setModele(i, 'prixIn', event.target.value)}
                />
              </div>
            </div>
            <div className="admin-field">
              <label htmlFor={`twin9-modele-prixout-${i}`}>Prix sortie (USD / Mtok)</label>
              <div className="admin-field-input">
                <input
                  id={`twin9-modele-prixout-${i}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={m.prixOut}
                  disabled={busy}
                  onChange={(event) => setModele(i, 'prixOut', event.target.value)}
                />
              </div>
            </div>
            <fieldset className="twin9-admin-etages">
              <legend>Étages</legend>
              {ETAGES.map((etage) => (
                <label key={etage}>
                  <input
                    type="checkbox"
                    checked={m.etages.includes(etage)}
                    disabled={busy}
                    onChange={() => toggleEtage(i, etage)}
                  />
                  {etage}
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              className="admin-button-secondary"
              disabled={busy}
              onClick={() => removeModele(i)}
              aria-label={`Supprimer le modèle ${i + 1}`}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="admin-button-secondary" disabled={busy} onClick={addModele}>
        Ajouter un modèle
      </button>

      <div className="twin9-admin-actions">
        <button type="button" disabled={busy} onClick={save}>
          Enregistrer les réglages
        </button>
      </div>

      {message ? (
        <p role="status" className="admin-message">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="load-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

// ---- 4. Comptes ------------------------------------------------------------

/** Supervision : tous les comptes ayant une activité, triés par le serveur. */
function ComptesBloc({ comptes }) {
  return (
    <div className="twin9-admin-bloc">
      <h3>Comptes (supervision)</h3>
      <p className="privacy-note">
        Suivi des établissements et particuliers : soldes et cumuls (compteurs seulement, jamais
        de contenu), triés par dernière activité.
      </p>
      {comptes.length === 0 ? (
        <p>Aucun compte avec activité pour l’instant.</p>
      ) : (
        <table className="admin-table twin9-admin-comptes">
          <thead>
            <tr>
              <th scope="col">Compte</th>
              <th scope="col">Solde</th>
              <th scope="col">Recharges cumulées</th>
              <th scope="col">Consommé cumulé</th>
              <th scope="col">Dernière activité</th>
            </tr>
          </thead>
          <tbody>
            {comptes.map((c) => (
              <tr key={c.user_id}>
                <td>
                  {c.nom} <span className="admin-email">({c.email})</span>
                </td>
                <td>{formatUsd(c.solde_microusd)}</td>
                <td>{formatUsd(c.recharges_microusd)}</td>
                <td>{formatUsd(c.consomme_microusd)}</td>
                <td>{frDate(c.derniere_activite)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ---- Vue ------------------------------------------------------------------

/**
 * @param {object} props
 * @param {typeof fetch} [props.fetchFn] couture de test (injectée par AdminView)
 */
export default function Twin9Section({ fetchFn }) {
  const [protocoles, setProtocoles] = useState(null)
  const [config, setConfig] = useState(null)
  const [comptes, setComptes] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const [pl, cfg, cp] = await Promise.all([
        fetchProtocoleList({ fetchFn }),
        fetchTwin9Config({ fetchFn }),
        fetchComptes({ fetchFn }),
      ])
      setProtocoles(Array.isArray(pl?.protocole) ? pl.protocole : [])
      setConfig(cfg ?? null)
      setComptes(Array.isArray(cp?.comptes) ? cp.comptes : [])
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof ApiUnavailableError ? err.message : 'Chargement impossible.')
    }
  }, [fetchFn])

  useEffect(() => {
    load()
  }, [load])

  // Rafraîchit la seule liste des gabarits (après enregistrement) sans toucher
  // au brouillon des réglages en cours d'édition.
  const reloadProtocoles = useCallback(async () => {
    try {
      const pl = await fetchProtocoleList({ fetchFn })
      setProtocoles(Array.isArray(pl?.protocole) ? pl.protocole : [])
    } catch {
      // On garde la liste précédente : l'échec est déjà signalé par le bloc.
    }
  }, [fetchFn])

  if (status === 'loading') {
    return <p role="status">Chargement de Twin_v9…</p>
  }
  if (status === 'error') {
    return (
      <p role="alert" className="load-error">
        {error}
      </p>
    )
  }

  return (
    <section className="admin-twin9 twin9-admin">
      <h2>Twin_v9 — Golden Prompt</h2>
      <GabaritsBloc protocoles={protocoles} fetchFn={fetchFn} onSaved={reloadProtocoles} />
      <BancEssaiBloc protocoles={protocoles} fetchFn={fetchFn} />
      {config ? <ReglagesBloc config={config} fetchFn={fetchFn} onSaved={setConfig} /> : null}
      <ComptesBloc comptes={comptes} />
    </section>
  )
}
