// Mes cohortes (P11, côté APPRENANT) — #/espace/cohortes.
//
// Trois gestes, tous à CONSENTEMENT explicite (cahier §6, ADR-005) :
//  1. REJOINDRE une cohorte par code d'invitation : le texte RGPD est affiché
//     AVANT le bouton et le consentement part dans le corps de la requête
//     ({consentement: true}) — re-jointure idempotente côté serveur ;
//  2. DÉPOSER un portfolio local dans la cohorte : les portfolios sont
//     client-first (ADR-001, jamais envoyés par défaut) — le dépôt est
//     l'opt-in de fait pour le traitement de masse B2B (table dédiée
//     cohorte_portfolios, purgée avec le compte) ;
//  3. QUITTER la cohorte : retire le consentement pour la suite ; les
//     cartographies déjà produites dans ce cadre restent à l'apprenant.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../api/client.js'
import { createPortfolioStore } from '../../lib/portfolio-store.js'

/** Texte RGPD du consentement — affiché tel quel AVANT le bouton (contrat M8). */
export const CONSENT_TEXT =
  'En rejoignant cette cohorte, l’établissement verra les cartographies produites dans ce cadre ' +
  '(et uniquement celles-là). Vos portfolios restent dans votre navigateur tant que vous ne les ' +
  'déposez pas explicitement dans la cohorte. Vous pouvez quitter la cohorte à tout moment : ' +
  'cela retire votre consentement pour la suite ; les cartographies déjà produites restent à vous.'

/** @param {string} iso @returns {string} date française courte ('—' si vide) */
function frDate(iso) {
  if (typeof iso !== 'string' || iso === '') return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('fr-FR')
}

/** GET api/cohortes — cohortes rejointes par l'apprenant connecté. */
async function fetchMesCohortes(fetchFn) {
  const data = await apiFetch('cohortes', { fetchFn })
  const list = Array.isArray(data) ? data : (data?.cohortes ?? [])
  return list.map((c) => ({
    id: c?.id,
    nom: c?.nom ?? '—',
    etablissement: c?.etablissement ?? null,
    joinedAt: c?.joinedAt ?? c?.joined_at ?? null,
    portfolioDepose: Boolean(c?.portfolioDepose ?? c?.portfolio_depose ?? c?.portfolio),
  }))
}

/** Dépôt d'un portfolio LOCAL dans une cohorte (opt-in explicite). */
function DepotForm({ cohorte, portfolios, onDeposit, busy }) {
  const [portfolioId, setPortfolioId] = useState('')
  if (portfolios.length === 0) {
    return (
      <p className="privacy-note">
        Aucun portfolio local à déposer : <a href="#/portfolio">créez d’abord un portfolio</a>.
      </p>
    )
  }
  return (
    <div className="cohorte-depot">
      <label htmlFor={`depot-${cohorte.id}`}>Portfolio à déposer</label>{' '}
      <select
        id={`depot-${cohorte.id}`}
        value={portfolioId}
        onChange={(event) => setPortfolioId(event.target.value)}
      >
        <option value="">— choisir —</option>
        {portfolios.map((p) => (
          <option key={p.id} value={p.id}>
            {p.titre} ({p.segments?.length ?? 0} journée(s))
          </option>
        ))}
      </select>{' '}
      <button
        type="button"
        className="button"
        disabled={busy || portfolioId === ''}
        onClick={() => onDeposit(cohorte, portfolioId)}
      >
        {busy ? 'Dépôt…' : 'Déposer dans la cohorte'}
      </button>
      <p className="privacy-note">
        Le dépôt <strong>envoie ce portfolio au serveur</strong> pour le traitement de masse de
        cette cohorte — c’est l’exception explicite au principe « le portfolio ne quitte jamais
        votre navigateur ». Il est supprimé avec votre compte (RGPD).
      </p>
    </div>
  )
}

/**
 * @param {object} props
 * @param {{status: string, user: object | null}} props.session (EspaceView)
 * @param {object} [props.portfolioStore] injectable (tests)
 * @param {typeof fetch} [props.fetchFn] seam de test
 */
export default function CohorteSection({ session, portfolioStore, fetchFn }) {
  const pStore = useMemo(() => portfolioStore ?? createPortfolioStore(), [portfolioStore])
  const connected = session.status === 'authenticated'

  const [cohortes, setCohortes] = useState(null) // null = chargement
  const [listError, setListError] = useState(null)
  const [portfolios, setPortfolios] = useState([])
  const [code, setCode] = useState('')
  const [consent, setConsent] = useState(false)
  const [joinBusy, setJoinBusy] = useState(false)
  const [joinError, setJoinError] = useState(null)
  const [info, setInfo] = useState(null)
  const [depotBusy, setDepotBusy] = useState(false)
  const [quitArmed, setQuitArmed] = useState(null) // id en attente de confirmation

  const reload = useCallback(async () => {
    if (!connected) return
    setListError(null)
    try {
      setCohortes(await fetchMesCohortes(fetchFn))
    } catch (error) {
      setCohortes((current) => current ?? [])
      setListError(error.message)
    }
  }, [connected, fetchFn])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    let alive = true
    pStore
      .list()
      .then((records) => alive && setPortfolios(records))
      .catch(() => alive && setPortfolios([]))
    return () => {
      alive = false
    }
  }, [pStore])

  async function submitJoin(event) {
    event.preventDefault()
    setJoinError(null)
    setInfo(null)
    const cleanCode = code.trim().toUpperCase()
    if (cleanCode === '') {
      setJoinError('Saisissez le code d’invitation transmis par votre établissement.')
      return
    }
    if (!consent) {
      setJoinError('Le consentement explicite est requis pour rejoindre une cohorte.')
      return
    }
    setJoinBusy(true)
    try {
      // Consentement EXPLICITE dans le corps (contrat M8) ; re-jointure idempotente.
      await apiFetch(`cohortes/${encodeURIComponent(cleanCode)}/rejoindre`, {
        method: 'POST',
        body: { consentement: true },
        fetchFn,
      })
      setCode('')
      setConsent(false)
      setInfo('Cohorte rejointe : votre consentement est enregistré. Déposez maintenant votre portfolio ci-dessous pour être inclus dans les runs de masse.')
      await reload()
    } catch (error) {
      setJoinError(error.message)
    } finally {
      setJoinBusy(false)
    }
  }

  async function onDeposit(cohorte, portfolioId) {
    setInfo(null)
    setListError(null)
    setDepotBusy(true)
    try {
      const record = await pStore.get(portfolioId)
      if (!record) throw new Error('Portfolio local introuvable.')
      await apiFetch(`cohortes/${encodeURIComponent(cohorte.id)}/portfolio`, {
        method: 'POST',
        body: { titre: record.titre, texte: record.texte, segments: record.segments },
        fetchFn,
      })
      setInfo(`Portfolio « ${record.titre} » déposé dans la cohorte « ${cohorte.nom} ».`)
      await reload()
    } catch (error) {
      setListError(error.message)
    } finally {
      setDepotBusy(false)
    }
  }

  async function onQuit(cohorte) {
    if (quitArmed !== cohorte.id) {
      setQuitArmed(cohorte.id) // deux temps : armer puis confirmer
      return
    }
    setQuitArmed(null)
    setInfo(null)
    setListError(null)
    try {
      await apiFetch(`cohortes/${encodeURIComponent(cohorte.id)}/quitter`, {
        method: 'DELETE',
        fetchFn,
      })
      setInfo(
        `Vous avez quitté la cohorte « ${cohorte.nom} » : votre consentement est retiré pour ` +
          'la suite. Les cartographies déjà produites dans ce cadre restent à vous.',
      )
      await reload()
    } catch (error) {
      setListError(error.message)
    }
  }

  if (!connected) {
    return (
      <div className="cohortes" data-testid="cohortes-anonyme">
        <h2>Mes cohortes</h2>
        <p className="privacy-note">
          Rejoindre une cohorte d’établissement nécessite un compte :{' '}
          <a href="#/compte">connectez-vous</a> puis revenez ici avec le code d’invitation
          transmis par votre établissement.
        </p>
      </div>
    )
  }

  return (
    <div className="cohortes">
      <h2>Mes cohortes</h2>

      <section className="espace-bloc" aria-label="Rejoindre une cohorte">
        <h3>Rejoindre une cohorte</h3>
        <form onSubmit={submitJoin} className="cohorte-join-form">
          <label htmlFor="cohorte-code">Code d’invitation</label>{' '}
          <input
            id="cohorte-code"
            type="text"
            autoComplete="off"
            placeholder="code transmis par l’établissement"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
          {/* Le texte RGPD est affiché AVANT le bouton (contrat M8). */}
          <div className="cohorte-consent" data-testid="cohorte-consent-texte">
            <p>{CONSENT_TEXT}</p>
            <label>
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />{' '}
              Je donne mon consentement explicite : l’établissement verra les cartographies
              produites dans ce cadre.
            </label>
          </div>
          <button type="submit" className="button button-primary" disabled={joinBusy || !consent}>
            {joinBusy ? 'Envoi…' : 'Rejoindre la cohorte'}
          </button>
        </form>
        {joinError ? (
          <p role="alert" className="load-error">
            {joinError}
          </p>
        ) : null}
      </section>

      {info ? (
        <p role="status" className="account-notice" data-testid="cohorte-info">
          {info}
        </p>
      ) : null}
      {listError ? (
        <p role="alert" className="load-error">
          {listError}
        </p>
      ) : null}

      <section className="espace-bloc" aria-label="Cohortes rejointes">
        <h3>Cohortes rejointes</h3>
        {cohortes === null ? (
          <p role="status">Chargement…</p>
        ) : cohortes.length === 0 ? (
          <p className="privacy-note">Vous n’avez rejoint aucune cohorte pour l’instant.</p>
        ) : (
          <ul className="cohorte-liste" data-testid="cohorte-liste">
            {cohortes.map((cohorte) => (
              <li key={cohorte.id}>
                <p>
                  <strong>{cohorte.nom}</strong>
                  {cohorte.etablissement ? <> — {cohorte.etablissement}</> : null}
                  {cohorte.joinedAt ? <> (rejointe le {frDate(cohorte.joinedAt)})</> : null}
                  {' · '}
                  {cohorte.portfolioDepose ? (
                    <span className="verdict-badge etablie">Portfolio déposé</span>
                  ) : (
                    <span className="verdict-badge renvoi">Portfolio non déposé</span>
                  )}
                </p>
                {!cohorte.portfolioDepose ? (
                  <DepotForm
                    cohorte={cohorte}
                    portfolios={portfolios}
                    onDeposit={onDeposit}
                    busy={depotBusy}
                  />
                ) : null}
                <p>
                  <button type="button" className="button" onClick={() => onQuit(cohorte)}>
                    {quitArmed === cohorte.id ? 'Confirmer le départ' : 'Quitter la cohorte'}
                  </button>{' '}
                  <span className="privacy-note">
                    Quitter retire votre consentement pour la suite ; les cartographies déjà
                    produites restent à vous.
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
