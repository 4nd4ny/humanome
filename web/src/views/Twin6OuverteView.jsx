// Vue « Cartographie ouverte Twin6 » — #/twin6-ouverte.
//
// Le pendant GRATUIT et OPEN SOURCE de l'analyse approfondie Twin9 : un scan par
// pôle RESPIRE (Greffier / Pédagogue adversarial / Rapporteur) puis une synthèse
// Kairos, sur le portfolio ENTIER (8 appels), rendus dans le MÊME sunburst
// évolutif que toutes les cartographies (le moteur mappe la sortie Twin6 vers
// cartographie-merge).
//
// Deux voies, comme convenu :
//   - CLÉ PERSO : le moteur (executerTwin6) tourne DANS le navigateur, appel
//     direct au fournisseur avec la clé de l'utilisateur → GRATUIT. La clé ne
//     quitte pas le navigateur (appel direct, en-tête browser-access).
//   - CRÉDITS : chaque appel passe par /api/twin6/appel (notre clé), +10 % de
//     contribution débités du solde prépayé.
//
// Le paquet de prompts est PUBLIC et téléchargeable (bandeau open source).

import { useEffect, useRef, useState } from 'react'
import { ApiUnavailableError, fetchMe } from '../api/client.js'
import { listKeys as listKeysApi, revealKey as revealKeyApi } from '../api/keys.js'
import { formatUsd } from '../api/twin9.js'
import {
  TWIN6_PACKAGE_URL,
  loadTwin6Package,
  makeCreditsProvider,
  makeOwnKeyProvider,
  fetchTwin6Offer,
  referentielPourMoteur,
} from '../api/twin6.js'
import { executerTwin6 } from '@engine/twin6/index.js'
import MergeView from './MergeView.jsx'
import { useSunburstLib } from './view-helpers.js'

function messageErreur(error) {
  if (error instanceof ApiUnavailableError) return error.message
  return error?.serverMessage || error?.message || 'Une erreur est survenue. Réessayez.'
}

/** Horodatage ISO sans fuseau (contrat cartographie-merge : ...THH:MM:SS). */
function horodatage(now) {
  return now.toISOString().slice(0, 19)
}

export default function Twin6OuverteView({ lib: injectedLib, deps = {} }) {
  const fetchMeFn = deps.fetchMeFn ?? fetchMe
  const runEngine = deps.runEngine ?? executerTwin6
  const loadPkg = deps.loadPackage ?? loadTwin6Package
  const fetchOffer = deps.fetchOffer ?? fetchTwin6Offer
  const creditsFactory = deps.makeCreditsProvider ?? makeCreditsProvider
  const ownKeyFactory = deps.makeOwnKeyProvider ?? makeOwnKeyProvider
  const listKeys = deps.listKeys ?? listKeysApi
  const revealKey = deps.revealKey ?? revealKeyApi
  const now = deps.now ?? (() => new Date())
  const callOpts = deps.fetchFn ? { fetchFn: deps.fetchFn } : {}

  const OWN_KEY_PROVIDER = 'anthropic'
  const [session, setSession] = useState({ status: 'loading', user: null })
  const [res, setRes] = useState({ status: 'loading', pkg: null, offer: null, message: '' })
  const [portfolio, setPortfolio] = useState('')
  const [model, setModel] = useState('')
  const [voie, setVoie] = useState('credits') // 'credits' | 'cle_perso'
  const [apiKey, setApiKey] = useState('')
  const [savedProviders, setSavedProviders] = useState([]) // clés perso enregistrées au profil
  const [useSavedKey, setUseSavedKey] = useState(false)
  const [run, setRun] = useState({ status: 'idle', done: 0, total: 8, phase: '', doc: null, cout: 0, error: '' })
  const { lib } = useSunburstLib(deps.lib ?? injectedLib)
  const running = useRef(false)

  useEffect(() => {
    let alive = true
    fetchMeFn()
      .then((r) => alive && setSession({ status: r.user ? 'authenticated' : 'anonymous', user: r.user }))
      .catch((e) =>
        alive &&
        setSession({ status: e instanceof ApiUnavailableError ? 'unavailable' : 'anonymous', user: null }),
      )
    return () => {
      alive = false
    }
  }, [fetchMeFn])

  useEffect(() => {
    if (session.status !== 'authenticated') return undefined
    let alive = true
    Promise.all([loadPkg(callOpts), fetchOffer(callOpts)])
      .then(([pkg, offer]) => {
        if (!alive) return
        setRes({ status: 'ready', pkg, offer, message: '' })
        setModel((m) => m || pkg.modeleCibleDefaut)
      })
      .catch((e) => alive && setRes({ status: 'error', pkg: null, offer: null, message: messageErreur(e) }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status])

  // Clés perso enregistrées au profil : si l'utilisateur en a une pour le
  // fournisseur, on lui propose de lancer dessus sans la ressaisir.
  useEffect(() => {
    if (session.status !== 'authenticated') return undefined
    let alive = true
    listKeys(callOpts)
      .then((list) => {
        if (!alive) return
        const providers = Array.isArray(list) ? list.map((k) => k.provider) : []
        setSavedProviders(providers)
        if (providers.includes(OWN_KEY_PROVIDER)) setUseSavedKey(true)
      })
      .catch(() => alive && setSavedProviders([]))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status])

  const hasSavedKey = savedProviders.includes(OWN_KEY_PROVIDER)
  const modeles = res.offer?.modeles ?? {}
  const portfolioPret = portfolio.trim().length > 40
  const clePersoPrete = (useSavedKey && hasSavedKey) || apiKey.trim() !== ''
  const peutLancer =
    res.status === 'ready' &&
    !!model &&
    portfolioPret &&
    (voie === 'credits' || clePersoPrete) &&
    run.status !== 'running'

  async function lancer() {
    if (!peutLancer || running.current) return
    running.current = true
    setRun({ status: 'running', done: 0, total: 8, phase: 'scan-pole', doc: null, cout: 0, error: '' })
    try {
      let provider
      if (voie === 'cle_perso') {
        // Clé enregistrée au profil (révélée à la demande, no-store) OU saisie.
        const key =
          useSavedKey && hasSavedKey
            ? (await revealKey(OWN_KEY_PROVIDER, callOpts)).apiKey
            : apiKey.trim()
        provider = ownKeyFactory({ provider: OWN_KEY_PROVIDER, apiKey: key, ...callOpts })
      } else {
        provider = creditsFactory({
          onCout: (c) => setRun((r) => ({ ...r, cout: r.cout + (Number(c) || 0) })),
          ...callOpts,
        })
      }

      const out = await runEngine({
        portfolio,
        templates: res.pkg.templates,
        referentiel: referentielPourMoteur(res.offer.referentiel),
        provider,
        model,
        options: {
          onProgress: (p) =>
            setRun((r) => ({ ...r, done: p.done ?? r.done, total: p.total ?? r.total, phase: p.phase ?? r.phase })),
          meta: {
            journalId: 'twin6-ouverte',
            sourceProtocole: `${res.pkg.id}@${res.pkg.version}`,
            generatedAt: horodatage(now()),
          },
        },
      })
      setRun((r) => ({ ...r, status: 'done', doc: out.document, done: out.calls.length, total: out.calls.length }))
    } catch (e) {
      setRun((r) => ({ ...r, status: 'error', error: messageErreur(e) }))
    } finally {
      running.current = false
    }
  }

  // ---- Rendu ---------------------------------------------------------------
  if (session.status === 'loading') {
    return <section className="twin6-ouverte"><p role="status">Chargement…</p></section>
  }
  if (session.status === 'unavailable') {
    return (
      <section className="twin6-ouverte">
        <h1>Cartographie ouverte Twin6</h1>
        <p role="status">Cette fonctionnalité nécessite le serveur (indisponible sur cette copie statique).</p>
      </section>
    )
  }
  if (session.status === 'anonymous') {
    return (
      <section className="twin6-ouverte">
        <h1>Cartographie ouverte Twin6</h1>
        <p>
          La cartographie ouverte nécessite un compte. <a href="#/compte">Connectez-vous</a> pour l’utiliser
          (gratuit avec votre propre clé API, ou avec nos crédits).
        </p>
      </section>
    )
  }

  const resultatPret = run.status === 'done' && run.doc

  return (
    <section className="twin6-ouverte">
      <h1>Cartographie ouverte Twin6</h1>
      <p className="twin6-intro">
        Une cartographie de vos compétences <strong>open source</strong> : un scan par pôle RESPIRE puis une
        synthèse Kairos, sur votre portfolio entier. Gratuite avec votre propre clé API, ou avec nos crédits
        (+10 % de contribution au fonctionnement du site).{' '}
        <a href={TWIN6_PACKAGE_URL} download>
          Télécharger les prompts
        </a>{' '}
        (AGPL, réutilisables partout).
      </p>

      {res.status === 'loading' ? <p role="status">Chargement du protocole…</p> : null}
      {res.status === 'error' ? <p role="alert" className="twin6-erreur">{res.message}</p> : null}

      {res.status === 'ready' && !resultatPret ? (
        <div className="twin6-formulaire">
          <label htmlFor="twin6-portfolio">Votre portfolio (structuré en feuilles <code>### AAAA-MM-JJ</code>)</label>
          <textarea
            id="twin6-portfolio"
            rows={10}
            value={portfolio}
            disabled={run.status === 'running'}
            onChange={(e) => setPortfolio(e.target.value)}
            placeholder={'### 2026-01-05\n---\nCe que j’ai fait, réfléchi, appris…'}
          />

          <div className="twin6-options">
            <label htmlFor="twin6-modele">Modèle</label>
            <select
              id="twin6-modele"
              value={model}
              disabled={run.status === 'running'}
              onChange={(e) => setModel(e.target.value)}
            >
              {Object.keys(modeles).map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>

          <fieldset className="twin6-voie" disabled={run.status === 'running'}>
            <legend>Comment payer l’usage du modèle ?</legend>
            <label>
              <input type="radio" name="voie" value="credits" checked={voie === 'credits'} onChange={() => setVoie('credits')} />{' '}
              Avec nos crédits (+10 % de contribution)
            </label>
            <label>
              <input type="radio" name="voie" value="cle_perso" checked={voie === 'cle_perso'} onChange={() => setVoie('cle_perso')} />{' '}
              Avec ma propre clé API (gratuit — la clé reste dans mon navigateur)
            </label>
            {voie === 'cle_perso' ? (
              <div className="twin6-cleperso">
                {hasSavedKey ? (
                  <>
                    <label>
                      <input
                        type="radio"
                        name="cleperso"
                        checked={useSavedKey}
                        onChange={() => setUseSavedKey(true)}
                      />{' '}
                      Utiliser ma clé Anthropic enregistrée dans mon profil
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="cleperso"
                        checked={!useSavedKey}
                        onChange={() => setUseSavedKey(false)}
                      />{' '}
                      Saisir une autre clé
                    </label>
                  </>
                ) : (
                  <p className="twin6-hint">
                    Astuce : <a href="#/compte">enregistrez votre clé dans votre profil</a> pour ne
                    plus la ressaisir.
                  </p>
                )}
                {!(hasSavedKey && useSavedKey) ? (
                  <input
                    type="password"
                    aria-label="Clé API Anthropic"
                    placeholder="sk-ant-…"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoComplete="off"
                  />
                ) : null}
              </div>
            ) : null}
          </fieldset>

          <p className="twin6-note">
            8 appels au modèle (7 pôles + synthèse). Le coût réel dépend de la taille de votre portfolio et du
            modèle. En crédits, seul le coût réel (+10 %) est débité.
          </p>

          <button type="button" className="twin6-lancer" disabled={!peutLancer} onClick={lancer}>
            {run.status === 'running' ? 'Analyse en cours…' : 'Lancer la cartographie ouverte'}
          </button>
          {!portfolioPret ? <p className="twin6-hint">Collez d’abord un portfolio (au moins quelques phrases).</p> : null}
          {run.status === 'error' ? <p role="alert" className="twin6-erreur">{run.error}</p> : null}
        </div>
      ) : null}

      {run.status === 'running' ? (
        <div className="twin6-progress" role="status">
          <p>
            Analyse en cours — étape {run.done}/{run.total} ({run.phase})
            {run.cout > 0 ? ` — ${formatUsd(run.cout)} débités jusqu’ici` : ''}
          </p>
          <progress value={run.done} max={run.total} />
        </div>
      ) : null}

      {resultatPret ? (
        <div className="twin6-resultat">
          <p className="twin6-succes" role="status">
            Cartographie ouverte terminée{run.cout > 0 ? ` — ${formatUsd(run.cout)} de contribution` : ' (avec votre clé)'}.
          </p>
          <MergeView mergeDoc={run.doc} referentiel={res.offer.referentiel} lib={lib} />
        </div>
      ) : null}
    </section>
  )
}
