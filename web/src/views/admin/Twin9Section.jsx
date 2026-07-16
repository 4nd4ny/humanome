// Section « Twin9 » de l'administration (ADR-010, AD-D2) — SUPERVISION seule :
//   1. Réglages  : marge Twin9/Twin6, promo « Twin9 gratuit clé perso », packs
//                  PayPal, offre de modèles -> PUT partiel (diff). Décision
//                  COMMERCIALE, admin seul.
//   2. Comptes   : supervision des comptes ayant une activité (soldes/cumuls).
//
// L'ÉDITION DES GABARITS a quitté cette section : elle vit dans #/twin9-atelier
// (Twin9AtelierView), réservée aux administrateurs-promptologues (les deux
// rôles, AD-D2). Le contenu du Golden Prompt n'est plus jamais visible ici.

import { useCallback, useEffect, useState } from 'react'
import { ApiError, ApiUnavailableError } from '../../api/client.js'
import { fetchComptes, fetchTwin9Config, formatUsd, saveTwin9Config } from '../../api/twin9.js'

/** Étages connus (contrat serveur Twin9Config::ETAGES) — ordre canonique. */
const ETAGES = ['taggers', 'rapide', 'tribunal']

/** @param {string} iso @returns {string} date/heure française courte ('—' si vide) */
function frDate(iso) {
  if (typeof iso !== 'string' || iso === '') return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('fr-FR')
}

// ---- 1. Réglages -----------------------------------------------------------

/** Brouillon (chaînes) depuis la config effective (admin shape). */
function draftFromConfig(config) {
  return {
    marge: config?.marge === undefined ? '' : String(config.marge),
    margeTwin6: config?.marge_twin6 === undefined ? '' : String(config.marge_twin6),
    clePersoOuverte: Boolean(config?.twin9_cle_perso_ouverte),
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
 * Réglages Twin9 : marge (1..5), packs (montant + libellé, ajout/suppression),
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

    const margeTwin6 = Number.parseFloat(String(draft.margeTwin6).replace(',', '.'))
    if (!Number.isFinite(margeTwin6)) return { error: 'Marge Twin6 invalide : nombre attendu.' }
    if (margeTwin6 !== config.marge_twin6) patch.marge_twin6 = margeTwin6

    if (Boolean(draft.clePersoOuverte) !== Boolean(config.twin9_cle_perso_ouverte)) {
      patch.twin9_cle_perso_ouverte = Boolean(draft.clePersoOuverte)
    }

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
      setMessage('Réglages Twin9 enregistrés.')
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
        <label htmlFor="twin9-marge">Contribution Twin9 (multiplicateur sur les prix Anthropic)</label>
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
      <div className="admin-field">
        <label htmlFor="twin9-marge-twin6">Contribution Twin6 (cartographie ouverte)</label>
        <div className="admin-field-input">
          <input
            id="twin9-marge-twin6"
            type="number"
            inputMode="decimal"
            min="1"
            max="5"
            step="0.01"
            value={draft.margeTwin6}
            disabled={busy}
            onChange={(event) => setDraft((prev) => ({ ...prev, margeTwin6: event.target.value }))}
          />
          <span className="admin-field-bounds">1 – 5</span>
        </div>
      </div>
      <p className="privacy-note">
        Par défaut <strong>Twin9 ×1,20</strong> (+20 %, R&amp;D du Golden Prompt propriétaire) et{' '}
        <strong>Twin6 ×1,10</strong> (+10 %, couverture des frais : PayPal, hébergement OVH, domaine,
        budget Haiku de la démo). « Contribution », jamais « surtaxe ».
      </p>

      <div className="admin-field admin-field-toggle">
        <label htmlFor="twin9-promo">
          <input
            id="twin9-promo"
            type="checkbox"
            checked={draft.clePersoOuverte}
            disabled={busy}
            onChange={(event) => setDraft((prev) => ({ ...prev, clePersoOuverte: event.target.checked }))}
          />{' '}
          Promo : Twin9 gratuit avec la clé perso de l’utilisateur
        </label>
      </div>
      <p className="privacy-note">
        Fenêtre promotionnelle : quand c’est coché, un utilisateur peut lancer Twin9{' '}
        <strong>gratuitement avec sa propre clé API</strong> — pour goûter la qualité avant d’acheter
        des crédits. Décoché (défaut), Twin9 s’utilise uniquement avec nos crédits (+20 %).
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

// ---- 2. Comptes ------------------------------------------------------------

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
  const [config, setConfig] = useState(null)
  const [comptes, setComptes] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const [cfg, cp] = await Promise.all([
        fetchTwin9Config({ fetchFn }),
        fetchComptes({ fetchFn }),
      ])
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

  if (status === 'loading') {
    return <p role="status">Chargement de Twin9…</p>
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
      <h2>Twin9 — supervision</h2>
      <p className="privacy-note">
        L’édition des gabarits du Golden Prompt a déménagé vers l’
        <a href="#/twin9-atelier">atelier Twin9</a> (réservé aux administrateurs-promptologues).
        Cette section garde la supervision commerciale : contribution, promo, packs, comptes.
      </p>
      {config ? <ReglagesBloc config={config} fetchFn={fetchFn} onSaved={setConfig} /> : null}
      <ComptesBloc comptes={comptes} />
    </section>
  )
}
