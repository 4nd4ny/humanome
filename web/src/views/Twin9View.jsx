// Analyse approfondie Twin_v9 (Golden Prompt, ADR-010) — #/twin9.
//
// Vue à états : garde de session → consentement RGPD → saisie (portfolio,
// modèle, facturation) → DEVIS (moteur en mode mock, 0 LLM) → LANCEMENT (réel,
// ~3000 appels séquencés par le moteur via /api/twin9/appel) → RÉSULTATS
// (carto_evolutive.json). Tout le parcours est aussi dérulable SANS serveur ni
// LLM en mode DÉMONSTRATION (données fictives) : le moteur mock produit un vrai
// carto_evolutive rendable.
//
// IMPÉRATIF SECRET (ADR-010) : le front n'envoie que {étape, variables} au
// serveur et ne voit JAMAIS un gabarit. Le mock, lui, ignore les gabarits.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, ApiUnavailableError, fetchMe } from '../api/client.js'
import { fetchTwin9Meta, makeServerBackend, formatUsd } from '../api/twin9.js'
import { executerTwin9 } from '@engine/twin9/index.js'
import { pyJsonDumpsWriteJson } from '@engine/twin9/py/pyJson.js'
import ResultatsTwin9 from './twin9/ResultatsTwin9.jsx'
import { calculerDevis, etapeToEtage, rosterFromModele, SALT_DEVIS } from './twin9/run-helpers.js'
import { createTwin9Store } from './twin9/twin9-store.js'
import { DEMO_META, DEMO_PORTFOLIO } from './twin9/demo-fixture.js'
import '../styles/twin9-run.css'

// ── Backend serveur adapté au contrat du moteur ────────────────────────────
// SEAM D'INTÉGRATION (T5, non vérifiable sans serveur+LLM) : le moteur appelle
// backend.call(prompt, {task, meta, label}) et attend une CHAÎNE ; le client
// partagé makeServerBackend attend {etape, variables, etage} et renvoie {text}.
// On adapte ici SANS toucher au client partagé (ADR-010 : ne pas le réécrire).
// L'étiquette (opts.label) sert d'identifiant d'étape et de source de l'étage —
// le nom exact de gabarit côté serveur reste un détail serveur (secret).
function etageDeLabel(label) {
  const p = String(label || '').split('_')[0]
  if (p === 'tag') return etapeToEtage('tagging')
  if (p === 'lecteur') return etapeToEtage('premiere-impression')
  if (p === 'greffier' || p === 'leger' || p === 'contre-lecture') return etapeToEtage('instruction-rapide')
  if (p === 'condense' || p === 'arpenteur' || p === 'retour') return etapeToEtage('scan-global')
  if (p === 'merge') return etapeToEtage('relectures')
  return etapeToEtage('tribunal')
}

function makeServerFactory({ modele, facturation, onDebit, makeBackend }) {
  const server = makeBackend({ modele, facturation, onDebit })
  return () => ({
    records: [],
    async call(prompt, opts = {}) {
      // Le moteur porte le CHEMIN du gabarit (opts.gabarit, avec .md) et les
      // VARIABLES d'état de run (opts.variables, SANS les fiches secrètes) —
      // c'est ce que le serveur rend (ADR-010). En base les gabarits sont
      // nommés sans .md. On n'envoie JAMAIS opts.meta (métadonnées internes du
      // moteur) ni le prompt (vide en prod puisque les gabarits sont serveur).
      const { text } = await server.call(prompt, {
        etape: String(opts.gabarit ?? '').replace(/\.md$/, ''),
        variables: opts.variables ?? {},
        etage: etageDeLabel(opts.label),
        ...(opts.maxTokens ? { maxTokens: opts.maxTokens } : {}),
      })
      return text
    },
  })
}

const ETAT_INITIAL_RUN = { status: 'idle', frac: 0, phase: null, appels: 0, carto: null, cartoStr: null, message: null }

/**
 * @param {object} props
 * @param {string|null} [props.section] segment après #/twin9 (pré-câblé) — `demo`
 *   ouvre directement la démonstration hors-ligne.
 * @param {object} [props.deps] coutures de test : {fetchMeFn, fetchMetaFn,
 *   runEngine, serialiser, makeBackend, store}
 */
export default function Twin9View({ section = null, deps = {} }) {
  const fetchMeFn = deps.fetchMeFn ?? fetchMe
  const fetchMetaFn = deps.fetchMetaFn ?? fetchTwin9Meta
  const runEngine = deps.runEngine ?? executerTwin9
  const serialiser = deps.serialiser ?? pyJsonDumpsWriteJson
  const makeBackend = deps.makeBackend ?? makeServerBackend
  const storeRef = useRef(deps.store ?? null)
  if (storeRef.current === null) storeRef.current = createTwin9Store()
  const store = storeRef.current

  const [session, setSession] = useState({ status: 'loading', user: null })
  const [meta, setMeta] = useState({ status: 'loading', data: null, message: null })
  const [mode, setMode] = useState('serveur') // 'serveur' | 'demo'
  const [consentement, setConsentement] = useState(false)
  const [portfolioTexte, setPortfolioTexte] = useState('')
  const [modele, setModele] = useState('')
  const [facturation, setFacturation] = useState('platform')
  const [devis, setDevis] = useState({ status: 'idle', data: null, message: null })
  const [run, setRun] = useState(ETAT_INITIAL_RUN)
  const [reprise, setReprise] = useState(null)

  // État persistant VIVANT (fidèle) pour la reprise pause→recharge→suite, et
  // drapeau d'annulation. Refs : jamais re-sérialisés (cf. twin9-store.js).
  const etatRef = useRef(null)
  const annuleRef = useRef(false)
  const appelsRef = useRef(0)

  // Montage : session + méta + détection d'un run interrompu.
  useEffect(() => {
    let vivant = true
    if (section === 'demo') setMode('demo')
    fetchMeFn()
      .then(({ user }) => vivant && setSession({ status: user ? 'authenticated' : 'anonymous', user }))
      .catch((e) =>
        vivant && setSession({ status: e instanceof ApiUnavailableError ? 'unavailable' : 'anonymous', user: null }),
      )
    fetchMetaFn()
      .then((data) => {
        if (!vivant) return
        if (!data?.enabled) setMeta({ status: 'disabled', data, message: null })
        else setMeta({ status: 'ready', data, message: null })
      })
      .catch((e) => {
        if (!vivant) return
        if (e instanceof ApiUnavailableError) setMeta({ status: 'unavailable', data: null, message: null })
        else setMeta({ status: 'error', data: null, message: e?.message ?? 'Erreur de chargement.' })
      })
    store
      .charger()
      .then((r) => vivant && r && r.portfolioTexte && setReprise(r))
      .catch(() => {})
    return () => {
      vivant = false
    }
  }, [fetchMeFn, fetchMetaFn, store, section])

  // Méta effective + valeurs dérivées selon le mode.
  const demonstration = mode === 'demo' || meta.data?.demonstration === true
  const metaData = demonstration ? DEMO_META : meta.data
  const modeles = metaData?.modeles ?? {}
  const referentiel = metaData?.referentiel ?? []
  const pipeline = metaData?.pipeline ?? {}
  const solde = metaData?.solde_microusd ?? 0
  const portfolioEffectif = demonstration ? DEMO_PORTFOLIO : portfolioTexte

  // Sélectionne le premier modèle disponible par défaut.
  useEffect(() => {
    const ids = Object.keys(modeles)
    if (ids.length && !ids.includes(modele)) setModele(ids[0])
  }, [modeles, modele])

  const modeleInfo = modeles[modele] ?? null

  // ── DEVIS (mock, 0 LLM) ─────────────────────────────────────────────────
  const estimer = useCallback(async () => {
    if (!modeleInfo || !referentiel.length) return
    setDevis({ status: 'pending', data: null, message: null })
    try {
      const res = await runEngine({
        portfolioTexte: portfolioEffectif,
        nomJournal: 'twin9.md',
        referentiel,
        roster: rosterFromModele(modele),
        config: JSON.parse(JSON.stringify(pipeline)),
        mock: true,
        etat: null,
        salt: SALT_DEVIS,
        options: {},
        nowIso: '2026-01-01T00:00:00',
      })
      const data = calculerDevis(res.metrics?.par_etape ?? {}, modeleInfo.prix_usd_mtok)
      setDevis({ status: 'ready', data, message: null })
    } catch (e) {
      setDevis({ status: 'error', data: null, message: e?.message ?? 'Estimation impossible.' })
    }
  }, [modeleInfo, referentiel, portfolioEffectif, modele, pipeline, runEngine])

  // ── LANCEMENT (réel, ou mock en démonstration) ──────────────────────────
  const lancer = useCallback(
    async ({ reprendre = false } = {}) => {
      if (!referentiel.length) return
      annuleRef.current = false
      if (!reprendre) {
        etatRef.current = {}
        appelsRef.current = 0
      }
      setRun((r) => ({ ...ETAT_INITIAL_RUN, status: 'running', appels: appelsRef.current, carto: null }))

      const onProgress = (phase, faits, total) => {
        if (annuleRef.current) throw new Error('__annule__')
        const frac = phase === 'journees' ? (total ? 0.8 * (faits / total) : 0) : 0.8 + 0.2 * ((faits || 0) / (total || 4))
        setRun((r) => ({ ...r, frac, phase }))
        store.save({ portfolioTexte: portfolioEffectif, modele, facturation, phase: 'running', faits, total }).catch(() => {})
      }
      const onDebit = () => {
        appelsRef.current += 1
        setRun((r) => ({ ...r, appels: appelsRef.current }))
      }

      const backends = demonstration
        ? null
        : makeServerFactory({ modele, facturation, onDebit, makeBackend })

      try {
        const res = await runEngine({
          portfolioTexte: portfolioEffectif,
          nomJournal: 'twin9.md',
          referentiel,
          roster: rosterFromModele(modele),
          config: JSON.parse(JSON.stringify(pipeline)),
          mock: demonstration,
          etat: etatRef.current,
          // En démonstration : MÊME sel que le devis → le nombre d'appels
          // annoncé correspond au run. En réel : pas de sel (backend serveur).
          salt: demonstration ? SALT_DEVIS : null,
          options: {},
          onProgress,
          nowIso: demonstration ? '2026-01-01T00:00:00' : null,
        })
        etatRef.current = res.etat
        const cartoStr = serialiser(res.cartoEvolutive)
        const carto = JSON.parse(cartoStr)
        await store.effacer().catch(() => {})
        setReprise(null)
        setRun({ ...ETAT_INITIAL_RUN, status: 'done', frac: 1, carto, cartoStr })
      } catch (e) {
        if (e?.message === '__annule__') {
          setRun((r) => ({ ...ETAT_INITIAL_RUN, status: 'paused', appels: appelsRef.current, message: 'Analyse annulée. Vous pouvez reprendre.' }))
          return
        }
        if (e instanceof ApiError && e.status === 402) {
          setRun((r) => ({
            ...ETAT_INITIAL_RUN,
            status: 'paused',
            appels: appelsRef.current,
            message: 'Solde épuisé en cours d’analyse. Rechargez votre crédit, puis reprenez : les journées déjà analysées ne seront pas refacturées.',
          }))
          return
        }
        setRun({ ...ETAT_INITIAL_RUN, status: 'error', appels: appelsRef.current, message: e?.message ?? 'L’analyse a échoué.' })
      }
    },
    [referentiel, portfolioEffectif, modele, facturation, pipeline, demonstration, makeBackend, runEngine, serialiser, store],
  )

  const annuler = useCallback(() => {
    annuleRef.current = true
  }, [])

  // ── Rendu ────────────────────────────────────────────────────────────────
  const enChargement = session.status === 'loading' || meta.status === 'loading'

  // Garde : session requise hors démonstration.
  const connecte = session.status === 'authenticated'
  const peutServeur = connecte && meta.status === 'ready'

  const soldeInsuffisant =
    !demonstration &&
    facturation === 'platform' &&
    devis.status === 'ready' &&
    solde < (devis.data?.basMicrousd ?? 0)
  const soldeJuste =
    !demonstration &&
    facturation === 'platform' &&
    devis.status === 'ready' &&
    !soldeInsuffisant &&
    solde < (devis.data?.hautMicrousd ?? 0)

  const portfolioPret = demonstration || portfolioTexte.trim().length > 20
  const peutEstimer = (demonstration || peutServeur) && consentement && portfolioPret && !!modeleInfo
  const peutLancer = peutEstimer && devis.status === 'ready' && (demonstration || !soldeInsuffisant) && run.status !== 'running'

  return (
    <div className="twin9 twin9-run">
      <h1>Analyse approfondie Twin_v9</h1>
      <p className="twin9-intro">
        Twin_v9 est le « Golden Prompt » de la plateforme : un système multi-agents (collège de
        lecteurs, instruction rapide, tribunal adversarial) qui instruit chaque compétence sur
        preuves ancrées. Un run enchaîne plusieurs milliers d’appels au modèle.
      </p>

      {enChargement ? <p role="status">Chargement…</p> : null}

      {/* Garde de session / disponibilité (hors démonstration). */}
      {!enChargement && !demonstration ? (
        <>
          {session.status !== 'authenticated' ? (
            <div className="twin9-garde" role="status" data-testid="twin9-garde-session">
              <p>
                L’analyse Twin_v9 nécessite un compte. <a href="#/compte">Connectez-vous</a> pour
                l’utiliser.
              </p>
              <button type="button" className="twin9-lien-demo" onClick={() => setMode('demo')}>
                Voir une démonstration (données fictives)
              </button>
            </div>
          ) : meta.status === 'disabled' ? (
            <p role="status" className="twin9-garde" data-testid="twin9-indisponible">
              L’analyse Twin_v9 est momentanément indisponible.
            </p>
          ) : meta.status === 'unavailable' ? (
            <div className="twin9-garde" role="status" data-testid="twin9-indisponible">
              <p>Les fonctions serveur sont indisponibles sur cette copie du site.</p>
              <button type="button" className="twin9-lien-demo" onClick={() => setMode('demo')}>
                Voir une démonstration (données fictives)
              </button>
            </div>
          ) : meta.status === 'error' ? (
            <p role="alert" className="load-error">
              {meta.message}
            </p>
          ) : null}
        </>
      ) : null}

      {/* Reprise d'un run interrompu (paramètres restaurables). */}
      {!enChargement && reprise && run.status === 'idle' && !demonstration ? (
        <div className="twin9-reprise" role="status">
          <p>Une analyse a été interrompue. Restaurer vos saisies pour la relancer ?</p>
          <button
            type="button"
            onClick={() => {
              setPortfolioTexte(reprise.portfolioTexte)
              if (reprise.modele) setModele(reprise.modele)
              if (reprise.facturation) setFacturation(reprise.facturation)
              setConsentement(true)
              setReprise(null)
            }}
          >
            Restaurer les saisies
          </button>
          <button type="button" className="twin9-lien-demo" onClick={() => store.effacer().then(() => setReprise(null))}>
            Ignorer
          </button>
        </div>
      ) : null}

      {/* Parcours principal (serveur connecté OU démonstration). */}
      {!enChargement && (demonstration || peutServeur) ? (
        <div className="twin9-parcours">
          {demonstration ? (
            <p role="note" className="twin9-demo-banner" data-testid="twin9-mode-demo">
              Mode <strong>démonstration</strong> — portfolio et référentiel fictifs, analyse en
              local (aucun appel réseau, aucun débit).
              {mode === 'demo' && meta.status === 'ready' ? (
                <>
                  {' '}
                  <button type="button" className="twin9-lien-demo" onClick={() => setMode('serveur')}>
                    Quitter la démonstration
                  </button>
                </>
              ) : null}
            </p>
          ) : null}

          {/* 1. Consentement RGPD explicite. */}
          <fieldset className="twin9-consentement">
            <legend>Consentement</legend>
            <label>
              <input
                type="checkbox"
                checked={consentement}
                onChange={(e) => setConsentement(e.target.checked)}
                data-testid="twin9-consentement"
              />{' '}
              Je comprends que, contrairement aux analyses classiques (qui restent dans mon
              navigateur), l’analyse Twin_v9 fait <strong>transiter le texte de mon portfolio</strong>{' '}
              par le serveur humanome.xyz et par le fournisseur du modèle, le temps de l’analyse.
              Rien n’est conservé côté serveur. Voir la{' '}
              <a href="#/confidentialite">politique de confidentialité</a>.
            </label>
          </fieldset>

          {/* 2. Portfolio. */}
          <section className="twin9-saisie">
            <h2>Portfolio</h2>
            {demonstration ? (
              <pre className="twin9-portfolio-demo" aria-label="Portfolio de démonstration">
                {DEMO_PORTFOLIO}
              </pre>
            ) : (
              <textarea
                className="twin9-portfolio"
                value={portfolioTexte}
                onChange={(e) => setPortfolioTexte(e.target.value)}
                placeholder="Collez ici votre portfolio en markdown, à journées datées (### 2026-03-02 …)."
                rows={10}
                data-testid="twin9-portfolio"
              />
            )}
          </section>

          {/* 3. Modèle + facturation. */}
          <section className="twin9-saisie">
            <h2>Modèle et facturation</h2>
            <label className="twin9-champ">
              Modèle
              <select value={modele} onChange={(e) => setModele(e.target.value)} data-testid="twin9-modele">
                {Object.entries(modeles).map(([id, info]) => (
                  <option key={id} value={id}>
                    {id} — {info.prix_usd_mtok?.[0]} / {info.prix_usd_mtok?.[1]} $ le Mtok (entrée/sortie)
                  </option>
                ))}
              </select>
            </label>
            {modeleInfo ? (
              <p className="twin9-etages">
                Étages couverts : {(modeleInfo.etages ?? []).join(', ') || '—'}
              </p>
            ) : null}
            {!demonstration ? (
              <fieldset className="twin9-facturation">
                <legend>Facturation</legend>
                <label>
                  <input
                    type="radio"
                    name="facturation"
                    checked={facturation === 'platform'}
                    onChange={() => setFacturation('platform')}
                  />{' '}
                  Crédit plateforme — solde : <strong>{formatUsd(solde)}</strong>
                </label>
                {metaData?.cle_privee_disponible ? (
                  <label>
                    <input
                      type="radio"
                      name="facturation"
                      checked={facturation === 'cle_privee'}
                      onChange={() => setFacturation('cle_privee')}
                    />{' '}
                    Ma clé privée Anthropic (aucun débit plateforme)
                  </label>
                ) : null}
              </fieldset>
            ) : null}
          </section>

          {/* 4. Devis. */}
          <section className="twin9-saisie">
            <h2>Estimation avant paiement</h2>
            <button type="button" onClick={estimer} disabled={!peutEstimer || devis.status === 'pending'} data-testid="twin9-estimer">
              {devis.status === 'pending' ? 'Estimation…' : 'Estimer le coût'}
            </button>
            {devis.status === 'error' ? (
              <p role="alert" className="load-error">
                {devis.message}
              </p>
            ) : null}
            {devis.status === 'ready' && devis.data ? (
              <div className="twin9-devis" data-testid="twin9-devis">
                <p>
                  <strong>{devis.data.appels.toLocaleString('fr-FR')}</strong> appels au modèle.
                  {facturation === 'cle_privee' ? (
                    ' Facturé sur votre clé privée (aucun débit plateforme).'
                  ) : (
                    <>
                      {' '}Coût estimé : entre <strong>{formatUsd(devis.data.basMicrousd)}</strong> et{' '}
                      <strong>{formatUsd(devis.data.hautMicrousd)}</strong>.
                    </>
                  )}
                </p>
                <ul className="twin9-devis-etages">
                  {devis.data.etages.map((e) => (
                    <li key={e.etage}>
                      {e.etage} : {e.appels.toLocaleString('fr-FR')} appels
                      {facturation === 'platform'
                        ? ` — ${formatUsd(e.basMicrousd)} à ${formatUsd(e.hautMicrousd)}`
                        : null}
                    </li>
                  ))}
                </ul>
                <p className="twin9-devis-avert">
                  Estimation indicative : le serveur réserve le pire-cas de chaque appel avant de
                  débiter, puis réconcilie aux tokens réellement consommés.
                </p>
                {soldeInsuffisant ? (
                  <p role="alert" className="twin9-solde-insuffisant" data-testid="twin9-solde-insuffisant">
                    Solde insuffisant pour lancer l’analyse.{' '}
                    <a href="#/compte/credit">Recharger mon crédit</a>.
                  </p>
                ) : soldeJuste ? (
                  <p role="status" className="twin9-solde-juste">
                    Votre solde couvre l’estimation basse mais pas la haute :{' '}
                    <a href="#/compte/credit">rechargez</a> pour éviter une interruption.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* 5. Lancement + progression. */}
          <section className="twin9-saisie">
            <h2>Analyse</h2>
            {run.status === 'running' ? (
              <div className="twin9-progression" data-testid="twin9-progression">
                <div className="twin9-barre" aria-hidden="true">
                  <span style={{ width: `${Math.round(run.frac * 100)}%` }} />
                </div>
                <p role="status">
                  {run.phase === 'merge' ? 'Fusion et relectures…' : 'Analyse des journées…'}
                  {run.appels ? ` — ${run.appels.toLocaleString('fr-FR')} appels effectués` : null}
                </p>
                <button type="button" onClick={annuler}>
                  Annuler
                </button>
              </div>
            ) : run.status === 'paused' ? (
              <div className="twin9-pause" role="status" data-testid="twin9-pause">
                <p>{run.message}</p>
                <button type="button" onClick={() => lancer({ reprendre: true })}>
                  Reprendre l’analyse
                </button>
              </div>
            ) : run.status === 'error' ? (
              <div>
                <p role="alert" className="load-error">
                  {run.message}
                </p>
                <button type="button" onClick={() => lancer({ reprendre: true })}>
                  Réessayer
                </button>
              </div>
            ) : run.status !== 'done' ? (
              <button type="button" onClick={() => lancer({})} disabled={!peutLancer} data-testid="twin9-lancer">
                {demonstration ? 'Lancer la démonstration' : 'Lancer l’analyse'}
              </button>
            ) : null}
          </section>

          {/* 6. Résultats. */}
          {run.status === 'done' && run.carto ? (
            <ResultatsTwin9 carto={run.carto} cartoStr={run.cartoStr} demonstration={demonstration} />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export { makeServerFactory, etageDeLabel }
