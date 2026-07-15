// Crédit & factures Twin9 (chantier T4, ADR-010 §3) — #/compte/credit.
//
// Tableau de bord du crédit prépayé : solde, recharge PayPal (flux redirect),
// suivi des dépenses mensuelles, grand-livre (compteurs uniquement, RGPD
// cahier §6.5) et factures récapitulatives imprimables (particuliers ET
// établissements, même compte, même grand-livre).
//
// Garde de session : GET api/auth/me au montage (pattern EspaceView/AdminView) —
// le reste du site reste statique. Dégradation propre en copie statique
// (ApiUnavailableError). Toute la surface serveur passe par api/twin9.js.
//
// Retour PayPal : PayPal redirige vers #/compte/credit?paypal=retour&token=<id>
// (le serveur pose ?paypal=retour, PayPal ajoute &token=<order_id> ; on lit aussi
// ?order= par sécurité). La capture (idempotente serveur) est déclenchée UNE
// fois — garde par ref — APRÈS résolution de la session (le jeton CSRF n'est
// semé que par auth/me), puis les paramètres sont retirés par history.replaceState
// (pas de hashchange, donc pas de re-capture au re-rendu).

import { useEffect, useRef, useState } from 'react'
import { ApiUnavailableError, fetchMe } from '../api/client.js'
import {
  fetchTwin9Meta,
  fetchCredit,
  fetchDepenses,
  fetchFacture,
  creerRecharge,
  capturerRecharge,
  rembourserSolde,
  formatUsd,
} from '../api/twin9.js'
import FactureTwin9 from './twin9/FactureTwin9.jsx'
import '../styles/twin9-credit.css'

const MOIS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

/** Paramètres de requête portés DANS le fragment (#/compte/credit?…). */
function hashQuery() {
  const h = (typeof window !== 'undefined' && window.location?.hash) || ''
  const i = h.indexOf('?')
  return new URLSearchParams(i === -1 ? '' : h.slice(i + 1))
}

/** Retire les paramètres PayPal sans déclencher de hashchange (pas de re-capture). */
function stripPaypalParams() {
  if (typeof window === 'undefined' || !window.history?.replaceState) return
  const base = window.location.href.split('#')[0]
  window.history.replaceState(null, '', `${base}#/compte/credit`)
}

/** Message affichable d'une erreur (les messages serveur sont déjà en français). */
function messageErreur(error) {
  if (error instanceof ApiUnavailableError) return error.message
  return error?.serverMessage || error?.message || 'Une erreur est survenue. Réessayez.'
}

/** Montant micro-USD signé « +1,23 $ » (crédits) / « -1,23 $ » (débits). */
function formatSigne(microusd) {
  const n = Number(microusd) || 0
  return n > 0 ? `+${formatUsd(n)}` : formatUsd(n)
}

/** Libellé français d'un « AAAA-MM ». */
function libelleMois(aaaaMm) {
  const [a, m] = String(aaaaMm ?? '').split('-')
  const idx = Number(m) - 1
  return idx >= 0 && idx < 12 ? `${MOIS_FR[idx]} ${a}` : String(aaaaMm ?? '')
}

/** Liste {annee, mois} de 2026-01 au mois courant, plus récent d'abord. */
function moisFacturables(now) {
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const liste = []
  for (let annee = 2026; annee <= y; annee += 1) {
    const dernier = annee === y ? m : 12
    for (let mois = 1; mois <= dernier; mois += 1) liste.push({ annee, mois })
  }
  return liste.reverse()
}

/** Traduit un kind du grand-livre en libellé lisible. */
function libelleKind(kind) {
  switch (kind) {
    case 'topup':
      return 'Recharge'
    case 'debit':
      return 'Débit'
    case 'adjust':
      return 'Ajustement'
    default:
      return kind ?? '—'
  }
}

export default function CreditView({ deps = {} }) {
  const fetchMeFn = deps.fetchMeFn ?? fetchMe
  const now = deps.now ?? new Date()
  // Couture d'appel : en test, un fetch qui aiguille par URL ; en prod, le
  // client réel (cookie de session + CSRF semé par auth/me).
  const callOpts = deps.fetchFn ? { fetchFn: deps.fetchFn } : {}
  // Couture de redirection PayPal (jsdom n'implémente pas la navigation).
  const redirect =
    deps.redirect ??
    ((url) => {
      if (typeof window !== 'undefined') window.location.href = url
    })

  const [session, setSession] = useState({ status: 'loading', user: null })
  const [dataStatus, setDataStatus] = useState('idle') // idle|loading|ready|error
  const [dataErreur, setDataErreur] = useState('')
  const [data, setData] = useState({
    solde: 0,
    packs: [],
    paypalConfigured: false,
    clePriveeDisponible: false,
    evenements: [],
    depensesMois: [],
  })

  const [paypal, setPaypal] = useState({ status: 'idle', message: '', solde: null })
  const [rechargeBusy, setRechargeBusy] = useState(null) // index du pack en cours
  const [rechargeErreur, setRechargeErreur] = useState('')

  const [factureSel, setFactureSel] = useState('') // « AAAA-MM » ou ''
  const [facture, setFacture] = useState({ status: 'idle', data: null, erreur: '' })
  // Remboursement du solde À LA DEMANDE (jamais auto). idle|confirm|busy|done|error.
  const [refund, setRefund] = useState({ status: 'idle', message: '', erreur: '' })

  const captureRef = useRef(false)

  useEffect(() => {
    let alive = true

    async function chargerDonnees() {
      setDataStatus('loading')
      try {
        const [meta, credit, dep] = await Promise.all([
          fetchTwin9Meta(callOpts),
          fetchCredit(callOpts),
          fetchDepenses(callOpts),
        ])
        if (!alive) return
        setData({
          solde: credit.solde_microusd ?? meta.solde_microusd ?? 0,
          packs: Array.isArray(meta.packs) ? meta.packs : [],
          paypalConfigured: Boolean(meta.paypalConfigured),
          clePriveeDisponible: Boolean(meta.cle_privee_disponible),
          evenements: Array.isArray(credit.evenements) ? credit.evenements : [],
          depensesMois: Array.isArray(dep.mois) ? dep.mois : [],
        })
        setDataStatus('ready')
      } catch (error) {
        if (!alive) return
        setDataErreur(messageErreur(error))
        setDataStatus('error')
      }
    }

    async function init() {
      let user = null
      try {
        const res = await fetchMeFn()
        user = res.user
      } catch (error) {
        if (!alive) return
        setSession({
          status: error instanceof ApiUnavailableError ? 'unavailable' : 'anonymous',
          user: null,
        })
        return
      }
      if (!alive) return
      if (!user) {
        setSession({ status: 'anonymous', user: null })
        return
      }
      setSession({ status: 'authenticated', user })

      // Retour PayPal — APRÈS session (CSRF semé), UNE seule fois.
      const q = hashQuery()
      const paypalParam = q.get('paypal')
      if (paypalParam === 'retour' && !captureRef.current) {
        captureRef.current = true
        const orderId = q.get('token') || q.get('order')
        if (orderId) {
          setPaypal({ status: 'capturing', message: '', solde: null })
          try {
            const res = await capturerRecharge(orderId, callOpts)
            if (!alive) return
            setPaypal({
              status: 'success',
              message: 'Recharge confirmée.',
              solde: res.solde_microusd ?? null,
            })
          } catch (error) {
            if (!alive) return
            setPaypal({ status: 'error', message: messageErreur(error), solde: null })
          }
          stripPaypalParams()
        } else {
          stripPaypalParams()
        }
      } else if (paypalParam === 'annule' && !captureRef.current) {
        captureRef.current = true
        setPaypal({
          status: 'annule',
          message: 'Recharge annulée. Aucun montant n’a été débité.',
          solde: null,
        })
        stripPaypalParams()
      }

      await chargerDonnees()
    }

    init()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function recharger(packIndex) {
    setRechargeErreur('')
    setRechargeBusy(packIndex)
    try {
      const res = await creerRecharge(packIndex, callOpts)
      if (res?.approve_url) {
        redirect(res.approve_url)
      } else {
        setRechargeErreur('Réponse PayPal inattendue. Réessayez.')
        setRechargeBusy(null)
      }
    } catch (error) {
      setRechargeErreur(messageErreur(error))
      setRechargeBusy(null)
    }
  }

  async function rembourser() {
    setRefund({ status: 'busy', message: '', erreur: '' })
    try {
      const res = await rembourserSolde(callOpts)
      setData((prev) => ({ ...prev, solde: res.solde_microusd ?? 0 }))
      setRefund({
        status: 'done',
        message: `Remboursement de ${formatUsd(res.rembourse_microusd ?? 0)} envoyé vers PayPal.`,
        erreur: '',
      })
    } catch (error) {
      setRefund({ status: 'error', message: '', erreur: messageErreur(error) })
    }
  }

  async function chargerFacture(valeur) {
    setFactureSel(valeur)
    if (!valeur) {
      setFacture({ status: 'idle', data: null, erreur: '' })
      return
    }
    const [annee, mois] = valeur.split('-').map(Number)
    setFacture({ status: 'loading', data: null, erreur: '' })
    try {
      const doc = await fetchFacture(annee, mois, callOpts)
      setFacture({ status: 'ready', data: doc, erreur: '' })
    } catch (error) {
      setFacture({ status: 'error', data: null, erreur: messageErreur(error) })
    }
  }

  // --- États de session non nominaux ---------------------------------------
  if (session.status === 'loading') {
    return (
      <CreditShell>
        <p role="status">Vérification de la session…</p>
      </CreditShell>
    )
  }
  if (session.status === 'unavailable') {
    return (
      <CreditShell>
        <p role="status" className="privacy-note">
          Copie statique du site : le crédit et les factures ont besoin de l’API (session,
          soldes, paiements). Rendez-vous sur le site en ligne
          (https://humanome.xyz).
        </p>
      </CreditShell>
    )
  }
  if (session.status === 'anonymous') {
    return (
      <CreditShell>
        <p role="status" className="privacy-note">
          Le crédit prépayé Twin9 est rattaché à votre compte.{' '}
          <a href="#/compte">Connectez-vous</a> pour consulter votre solde, recharger et
          générer vos factures.
        </p>
      </CreditShell>
    )
  }

  const maxConso =
    data.depensesMois.reduce((m, x) => Math.max(m, x.consomme_microusd ?? 0), 0) || 1

  return (
    <CreditShell>
      <p
        role="status"
        className="espace-session account-notice"
        data-testid="credit-connecte"
      >
        Connecté en tant que {session.user.displayName ?? session.user.email}.
      </p>

      {/* Bandeau retour PayPal */}
      {paypal.status === 'capturing' ? (
        <p role="status" className="credit-paypal credit-paypal--info">
          Confirmation de votre recharge PayPal…
        </p>
      ) : null}
      {paypal.status === 'success' ? (
        <p role="status" className="credit-paypal credit-paypal--ok" data-testid="paypal-succes">
          Recharge confirmée.{' '}
          {paypal.solde !== null ? (
            <>
              Nouveau solde&nbsp;: <strong>{formatUsd(paypal.solde)}</strong>.
            </>
          ) : null}
        </p>
      ) : null}
      {paypal.status === 'annule' ? (
        <p role="status" className="credit-paypal credit-paypal--info" data-testid="paypal-annule">
          {paypal.message}
        </p>
      ) : null}
      {paypal.status === 'error' ? (
        <p role="alert" className="credit-paypal credit-paypal--erreur">
          Recharge non confirmée&nbsp;: {paypal.message}
        </p>
      ) : null}

      {dataStatus === 'loading' ? <p role="status">Chargement du crédit…</p> : null}
      {dataStatus === 'error' ? (
        <p role="alert" className="load-error">
          {dataErreur}
        </p>
      ) : null}

      {dataStatus === 'ready' ? (
        <>
          {/* 1. SOLDE */}
          <section className="credit-solde" aria-labelledby="credit-solde-titre">
            <h2 id="credit-solde-titre">Solde courant</h2>
            <p className="credit-solde-montant" data-testid="credit-solde">
              {formatUsd(data.solde)}
            </p>
            <p className="credit-solde-note privacy-note">
              Crédit prépayé, en micro-dollars. Chaque appel Twin9 le débite au coût réel des
              tokens (majoration de service incluse) ; seuls des compteurs sont conservés, jamais
              votre contenu.
            </p>

            {/* Remboursement À LA DEMANDE (jamais automatique) — la plupart des
                gens gardent leur solde pour la prochaine cartographie. */}
            {(data.solde > 0 && data.paypalConfigured) || refund.status === 'done' ? (
              <div className="credit-refund">
                {refund.status === 'done' ? (
                  <p role="status" className="credit-refund-ok">{refund.message}</p>
                ) : refund.status === 'confirm' ? (
                  <div className="credit-refund-confirm">
                    <p>Rembourser votre solde restant ({formatUsd(data.solde)}) vers PayPal ? Vous pourrez recharger à tout moment.</p>
                    <button type="button" className="btn-primaire" onClick={rembourser}>Confirmer le remboursement</button>{' '}
                    <button type="button" onClick={() => setRefund({ status: 'idle', message: '', erreur: '' })}>Annuler</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="credit-refund-lien"
                    disabled={refund.status === 'busy'}
                    onClick={() => setRefund({ status: 'confirm', message: '', erreur: '' })}
                  >
                    {refund.status === 'busy' ? 'Remboursement en cours…' : 'Se faire rembourser le solde restant'}
                  </button>
                )}
                {refund.status === 'error' ? <p role="alert" className="credit-refund-erreur">{refund.erreur}</p> : null}
              </div>
            ) : null}
          </section>

          {/* 2. RECHARGE PayPal */}
          <section className="credit-recharge" aria-labelledby="credit-recharge-titre">
            <h2 id="credit-recharge-titre">Recharger</h2>
            {!data.paypalConfigured ? (
              <p role="status" className="credit-indispo" data-testid="recharge-indispo">
                La recharge par carte (PayPal) est indisponible pour le moment.{' '}
                {data.clePriveeDisponible
                  ? 'Votre clé Anthropic privée enregistrée reste utilisable : les appels Twin9 ne débitent alors aucun crédit.'
                  : 'Vous pouvez aussi enregistrer votre propre clé Anthropic (aucun débit de crédit) depuis votre compte.'}
              </p>
            ) : data.packs.length === 0 ? (
              <p role="status" className="credit-indispo">
                Aucun pack de recharge n’est proposé pour le moment.
              </p>
            ) : (
              <>
                <ul className="credit-packs">
                  {data.packs.map((pack, index) => (
                    <li key={pack.libelle ?? index}>
                      <div className="credit-pack">
                        <span className="credit-pack-libelle">{pack.libelle}</span>
                        <span className="credit-pack-montant">{pack.montant_usd} $</span>
                        <button
                          type="button"
                          className="btn-primaire"
                          disabled={rechargeBusy !== null}
                          onClick={() => recharger(index)}
                        >
                          {rechargeBusy === index ? 'Redirection…' : 'Recharger'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="privacy-note">
                  Le paiement est traité par PayPal (redirection). Nous ne voyons ni ne stockons
                  aucune donnée bancaire — seulement l’identifiant de l’ordre et son montant.
                </p>
                {rechargeErreur ? (
                  <p role="alert" className="load-error">
                    {rechargeErreur}
                  </p>
                ) : null}
              </>
            )}
          </section>

          {/* 3. SUIVI DES DÉPENSES */}
          <section className="credit-depenses" aria-labelledby="credit-depenses-titre">
            <h2 id="credit-depenses-titre">Suivi des dépenses (12 derniers mois)</h2>
            {data.depensesMois.length === 0 ? (
              <p className="privacy-note">Aucune dépense enregistrée pour l’instant.</p>
            ) : (
              <>
                <div
                  className="credit-barres"
                  role="img"
                  aria-label="Consommation mensuelle (barres)"
                >
                  {[...data.depensesMois].reverse().map((m) => {
                    const hauteur = Math.round(((m.consomme_microusd ?? 0) / maxConso) * 100)
                    return (
                      <div key={m.mois} className="credit-barre" title={libelleMois(m.mois)}>
                        <div className="credit-barre-piste">
                          <div
                            className="credit-barre-valeur"
                            style={{ height: `${Math.max(hauteur, 2)}%` }}
                          />
                        </div>
                        <span className="credit-barre-label">{String(m.mois).slice(5)}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="table-scroll">
                  <table className="credit-table">
                    <thead>
                      <tr>
                        <th scope="col">Mois</th>
                        <th scope="col" className="num">
                          Recharges
                        </th>
                        <th scope="col" className="num">
                          Consommé
                        </th>
                        <th scope="col" className="num">
                          Appels
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.depensesMois.map((m) => (
                        <tr key={m.mois}>
                          <td>{libelleMois(m.mois)}</td>
                          <td className="num">{formatUsd(m.recharges_microusd)}</td>
                          <td className="num">{formatUsd(m.consomme_microusd)}</td>
                          <td className="num">{m.appels}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* 4. GRAND-LIVRE */}
          <section className="credit-livre" aria-labelledby="credit-livre-titre">
            <h2 id="credit-livre-titre">Grand-livre (50 derniers événements)</h2>
            <p className="privacy-note">
              Journalisation minimale (cahier §6.5)&nbsp;: type, montant, modèle et compteurs de
              tokens uniquement — aucun contenu.
            </p>
            {data.evenements.length === 0 ? (
              <p className="privacy-note">Aucun événement pour l’instant.</p>
            ) : (
              <div className="table-scroll">
                <table className="credit-table">
                  <thead>
                    <tr>
                      <th scope="col">Type</th>
                      <th scope="col" className="num">
                        Montant
                      </th>
                      <th scope="col">Libellé</th>
                      <th scope="col">Modèle</th>
                      <th scope="col" className="num">
                        Tokens (E/S)
                      </th>
                      <th scope="col">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.evenements.map((e, i) => (
                      <tr key={i}>
                        <td>
                          <span className={`credit-kind credit-kind--${e.kind}`}>
                            {libelleKind(e.kind)}
                          </span>
                        </td>
                        <td className="num">{formatSigne(e.montant_microusd)}</td>
                        <td>{e.label}</td>
                        <td>{e.model ?? '—'}</td>
                        <td className="num">
                          {e.tokens_in != null || e.tokens_out != null
                            ? `${e.tokens_in ?? 0} / ${e.tokens_out ?? 0}`
                            : '—'}
                        </td>
                        <td>{String(e.date ?? '').slice(0, 16).replace('T', ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 5. FACTURES */}
          <section className="credit-factures" aria-labelledby="credit-factures-titre">
            <h2 id="credit-factures-titre">Factures récapitulatives</h2>
            <p className="privacy-note">
              Facture mensuelle des tokens prépayés (particuliers et établissements). Sélectionnez
              une période pour générer un document imprimable / exportable en PDF.
            </p>
            <div className="credit-facture-choix">
              <label htmlFor="credit-facture-mois">Période</label>
              <select
                id="credit-facture-mois"
                value={factureSel}
                onChange={(ev) => chargerFacture(ev.target.value)}
              >
                <option value="">— choisir un mois —</option>
                {moisFacturables(now).map(({ annee, mois }) => {
                  const val = `${annee}-${String(mois).padStart(2, '0')}`
                  return (
                    <option key={val} value={val}>
                      {libelleMois(val)}
                    </option>
                  )
                })}
              </select>
            </div>

            {facture.status === 'loading' ? <p role="status">Génération de la facture…</p> : null}
            {facture.status === 'error' ? (
              <p role="alert" className="load-error">
                {facture.erreur}
              </p>
            ) : null}
            {facture.status === 'ready' ? <FactureTwin9 facture={facture.data} /> : null}
          </section>
        </>
      ) : null}
    </CreditShell>
  )
}

/** Enveloppe commune : titre cliquable + conteneur. */
function CreditShell({ children }) {
  return (
    <div className="twin9-credit">
      <h1>
        <a href="#/compte/credit" style={{ textDecoration: 'none', color: 'inherit' }}>
          Crédit &amp; factures
        </a>
      </h1>
      {children}
    </div>
  )
}
