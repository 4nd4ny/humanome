// Atelier épistémiarque (cahier §3.5) — #/epistemiarque[/<section>].
//
// ÉDITEUR COLLABORATIF du référentiel au grain COMPÉTENCE ATOMIQUE (correction
// d'architecture 2026-07-15) : chaque compétence est éditée, versionnée,
// gouvernée (vote des membres) et concurrente INDÉPENDAMMENT. Deux épistémiarques
// sur deux compétences différentes ne se bloquent jamais ; sur une même
// compétence, la concurrence optimiste (If-Match sur le content_hash) empêche le
// lost update. Une compétence est entérinée à la MAJORITÉ des membres, pendant
// qu'une autre peut rester en débat. Les débats Decidim étayent la discussion.
//
// Sections : atelier (61 compétences par pôle + brouillons + votes + coupe de
// release) | editer/<id> (éditeur riche d'une compétence) | proposition/<id> (vote).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, ApiUnavailableError, fetchMe } from '../api/client.js'
import { createCompetenceApi, nextCompetenceVersion } from './epistemiarque/competence-api.js'

const DECIDIM_URL = 'https://participer.harmonia.education'

const POLES = {
  1: 'TÊTE — Penser & Comprendre',
  2: 'CŒUR — Relier & Naviguer',
  3: 'MAIN — Créer & Incarner',
  4: 'ÂME — Discerner & Juger',
  5: 'RACINES — Évoluer & Résister',
  6: 'CITÉ — Gouverner & S’ouvrir',
  7: 'FLAMBEAU — Transmettre & Piloter',
}

function go(hash) {
  if (typeof window !== 'undefined') window.location.hash = hash
}

function errorMessage(error) {
  if (error instanceof ApiUnavailableError) return error.message
  if (error instanceof ApiError) return error.serverMessage ?? error.message
  return 'Une erreur est survenue. Réessayez.'
}

/**
 * @param {{section?: string|null, lib?: object, deps?: object}} props
 *   deps : coutures de test {fetchMeFn, api}
 */
export default function EpistemiarqueView({ section = null, deps = {} }) {
  const fetchMeFn = deps.fetchMeFn ?? fetchMe
  const api = useMemo(() => deps.api ?? createCompetenceApi(), [deps.api])
  const [sessionState, setSessionState] = useState({ status: 'loading', user: null })

  useEffect(() => {
    let alive = true
    fetchMeFn()
      .then(({ user }) => {
        if (alive) setSessionState({ status: user ? 'authenticated' : 'anonymous', user })
      })
      .catch((error) => {
        if (alive)
          setSessionState({
            status: error instanceof ApiUnavailableError ? 'unavailable' : 'anonymous',
            user: null,
          })
      })
    return () => {
      alive = false
    }
  }, [fetchMeFn])

  const roles = sessionState.user?.roles ?? []
  const isMember = roles.includes('epistemiarque')
  const canAccess = isMember || roles.includes('admin')

  let body = null
  if (sessionState.status === 'loading') {
    body = <p role="status">Vérification de la session…</p>
  } else if (sessionState.status === 'unavailable') {
    body = (
      <p role="alert" className="load-error" data-testid="epi-indisponible">
        Copie statique du site : l’atelier épistémiarque nécessite l’API serveur. Rendez-vous sur{' '}
        <a href="https://humanome.xyz/#/epistemiarque">humanome.xyz</a>.
      </p>
    )
  } else if (sessionState.status === 'anonymous') {
    body = (
      <p role="alert" className="load-error" data-testid="epi-anonyme">
        L’édition du référentiel nécessite une session. <a href="#/compte">Connectez-vous</a> avec un
        compte portant le rôle épistémiarque.
      </p>
    )
  } else if (!canAccess) {
    body = (
      <p role="alert" className="load-error" data-testid="epi-sans-role">
        Cet atelier est réservé au rôle <strong>épistémiarque</strong> (cahier §3.5). Votre compte ne
        porte pas ce rôle — rapprochez-vous de l’administration Harmonia.
      </p>
    )
  } else {
    const editMatch = /^editer\/(.+)$/.exec(section ?? '')
    const propMatch = /^proposition\/(.+)$/.exec(section ?? '')
    if (section === null || section === '') {
      body = <AtelierSection api={api} canVote={isMember} />
    } else if (editMatch) {
      body = <EditeurSection api={api} draftId={decodeURIComponent(editMatch[1])} />
    } else if (propMatch) {
      body = (
        <PropositionSection
          api={api}
          proposalId={decodeURIComponent(propMatch[1])}
          user={sessionState.user}
          canVote={isMember}
        />
      )
    } else {
      body = (
        <div>
          <p role="alert" className="load-error">
            Section inconnue de l’atelier épistémiarque : « {section} ».
          </p>
          <p>
            <a href="#/epistemiarque">Retour à l’atelier</a>
          </p>
        </div>
      )
    }
  }

  return (
    <div className="epi">
      <header className="epi-header">
        <h1>Atelier épistémiarque</h1>
        <p className="epi-intro">
          Le référentiel s’édite <strong>compétence par compétence</strong> : chaque compétence est
          une entité <strong>atomique</strong>, éditée et versionnée indépendamment. Toute évolution
          est soumise au <strong>vote des membres</strong> et entérinée à la <strong>majorité</strong>
          . Les débats de l’espace{' '}
          <a href={DECIDIM_URL} rel="noreferrer">
            Decidim
          </a>{' '}
          peuvent l’étayer en cas de doute.
        </p>
      </header>
      {body}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────── atelier

function AtelierSection({ api, canVote }) {
  const [state, setState] = useState({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([api.list(), api.listDrafts()])
      .then(([competences, drafts]) => {
        if (alive)
          setState({
            status: 'ready',
            competences: Array.isArray(competences) ? competences : [],
            drafts: Array.isArray(drafts) ? drafts : [],
          })
      })
      .catch((error) => {
        if (alive) setState({ status: 'error', message: errorMessage(error) })
      })
    return () => {
      alive = false
    }
  }, [api, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  if (state.status === 'loading') return <p role="status">Chargement de l’atelier…</p>
  if (state.status === 'error')
    return (
      <p role="alert" className="load-error">
        {state.message}
      </p>
    )

  const { competences, drafts } = state
  const proposals = drafts.filter((d) => d.status === 'review')
  const editables = drafts.filter((d) => d.status === 'draft')
  const editingByCode = new Set(drafts.map((d) => d.code))
  const byPole = {}
  for (const c of competences) (byPole[c.pole] ??= []).push(c)

  return (
    <div className="epi-atelier">
      {proposals.length > 0 ? (
        <section className="epi-block" aria-label="Propositions au vote">
          <h2>Compétences au vote</h2>
          <ul className="epi-list">
            {proposals.map((p) => (
              <li key={p.id} className="epi-list-item">
                <div className="epi-list-main">
                  <a href={`#/epistemiarque/proposition/${p.id}`} className="epi-list-title">
                    <span className="epi-comp-code">{p.code}</span> {p.nom} — v{p.semver}
                  </a>
                  <TallyChip tally={p.tally} />
                </div>
                <a href={`#/epistemiarque/proposition/${p.id}`} className="button epi-small">
                  {canVote ? 'Voter / voir' : 'Voir le vote'}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {editables.length > 0 ? (
        <section className="epi-block" aria-label="Brouillons">
          <h2>Brouillons (édition en cours)</h2>
          <ul className="epi-list">
            {editables.map((d) => (
              <li key={d.id} className="epi-list-item">
                <span className="epi-list-title">
                  <span className="epi-comp-code">{d.code}</span> {d.nom} — v{d.semver}
                </span>
                <a href={`#/epistemiarque/editer/${d.id}`} className="button epi-small">
                  Éditer
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="epi-block" aria-label="Les 61 compétences">
        <h2>Le référentiel ({competences.length} compétences)</h2>
        <p className="epi-hint">
          Chaque compétence est atomique : proposez-en l’évolution indépendamment. La proposition
          sera votée par les membres, puis entérinée à la majorité.
        </p>
        {Object.keys(byPole)
          .map(Number)
          .sort((a, b) => a - b)
          .map((pole) => (
            <div key={pole} className="epi-comp-group">
              <h3>{POLES[pole] ?? `Pôle ${pole}`}</h3>
              <ul className="epi-list">
                {byPole[pole]
                  .slice()
                  .sort((a, b) => (a.code < b.code ? -1 : 1))
                  .map((c) => (
                    <li key={c.code} className="epi-list-item">
                      <span className="epi-list-title">
                        <span className="epi-comp-code">{c.code}</span> {c.nom}{' '}
                        <span className="epi-comp-ver">v{c.semver}</span>
                      </span>
                      {editingByCode.has(c.code) ? (
                        <span className="epi-chip epi-chip-pending">déjà en cours d’édition</span>
                      ) : (
                        <ProposeButton api={api} competence={c} onCreated={reload} />
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
      </section>

      <CutReleaseCard api={api} />
    </div>
  )
}

/** Bouton « Proposer une évolution » d'UNE compétence (forke un brouillon). */
function ProposeButton({ api, competence, onCreated }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function propose() {
    setBusy(true)
    setError(null)
    try {
      const draft = await api.createDraft(competence.code, nextCompetenceVersion(competence.semver))
      onCreated?.()
      go(`#/epistemiarque/editer/${draft.id}`)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <span>
      <button type="button" className="button epi-small" onClick={propose} disabled={busy}>
        {busy ? '…' : 'Proposer une évolution'}
      </button>
      {error ? (
        <span role="alert" className="load-error epi-inline-error">
          {error}
        </span>
      ) : null}
    </span>
  )
}

/** Coupe de release : fige les compétences publiées en un snapshot de référentiel. */
function CutReleaseCard({ api }) {
  const [semver, setSemver] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)

  async function cut(event) {
    event.preventDefault()
    setBusy(true)
    setFeedback(null)
    try {
      const res = await api.cutRelease(semver.trim(), `RESPIRE v${semver.trim()}`)
      setFeedback({ kind: 'ok', message: `Release ${res.semver} publiée (snapshot du référentiel).` })
    } catch (err) {
      setFeedback({ kind: 'error', message: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="epi-block epi-submit" aria-label="Coupe de release">
      <h2>Publier une version du référentiel (snapshot)</h2>
      <p className="epi-hint">
        Assemble les compétences <strong>publiées</strong> en une version figée et immuable du
        référentiel, <strong>immédiatement épinglable par les cartographies</strong>
        (reproductibilité). La <strong>page publique</strong> du référentiel, elle, lit des fichiers
        statiques : elle n’affichera ce snapshot qu’au <strong>prochain déploiement/ré-export</strong>.
        À faire après avoir entériné des évolutions de compétences.
      </p>
      <form className="epi-form" onSubmit={cut}>
        <label>
          Version du référentiel (semver)
          <input
            type="text"
            value={semver}
            onChange={(e) => setSemver(e.target.value)}
            placeholder="ex. 7.2.0"
            required
          />
        </label>
        <button type="submit" className="button" disabled={busy || semver.trim() === ''}>
          {busy ? 'Publication…' : 'Publier le snapshot'}
        </button>
      </form>
      {feedback ? (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={feedback.kind === 'error' ? 'load-error' : 'epi-ok'}
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────── éditeur

/** Éditeur RICHE d'une compétence (identité + protocole + enrichissements), CAS. */
function EditeurSection({ api, draftId }) {
  const [state, setState] = useState({ status: 'loading' })
  const [doc, setDoc] = useState(null)
  const [baseHash, setBaseHash] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [decidimUrl, setDecidimUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    let alive = true
    api
      .getDraft(draftId)
      .then((draft) => {
        if (!alive) return
        setState({ status: 'ready', meta: draft })
        setDoc(structuredClone(draft.content))
        setBaseHash(draft.contentHash)
      })
      .catch((error) => {
        if (alive) setState({ status: 'error', message: errorMessage(error) })
      })
    return () => {
      alive = false
    }
  }, [api, draftId])

  if (state.status === 'loading') return <p role="status">Chargement de la compétence…</p>
  if (state.status === 'error')
    return (
      <div>
        <p role="alert" className="load-error">
          {state.message}
        </p>
        <p>
          <a href="#/epistemiarque">Retour à l’atelier</a>
        </p>
      </div>
    )
  if (state.meta.status === 'review') {
    return (
      <div className="epi-frozen">
        <p role="alert" className="epi-notice">
          Cette compétence est <strong>ouverte au vote</strong> : son contenu est gelé. Pour la
          modifier, retirez la proposition depuis la page de vote.
        </p>
        <p>
          <a href={`#/epistemiarque/proposition/${draftId}`} className="button">
            Aller à la page de vote
          </a>
        </p>
      </div>
    )
  }

  const ident = doc.identite ?? {}
  const passe1 = doc.protocole?.passe_1 ?? {}

  function setIdent(field, value) {
    setDoc((d) => ({ ...d, identite: { ...d.identite, [field]: value } }))
    setDirty(true)
  }
  function setSignaux(list) {
    setDoc((d) => ({
      ...d,
      protocole: { ...d.protocole, passe_1: { ...d.protocole?.passe_1, signaux_declencheurs: list } },
    }))
    setDirty(true)
  }
  function setEnrichissements(value) {
    setDoc((d) => ({ ...d, enrichissements: value }))
    setDirty(true)
  }
  // SOURCE UNIQUE (demande 2026-07-16) : la fiche de scan (competence.content.fiche)
  // est la source dont Twin6 (P*.md au build) et Twin9 (twin9_fiches par endpoint)
  // dérivent. L'éditer ici est le point de départ de la chaîne : saveDraft envoie
  // tout `doc`, donc `doc.fiche` est persisté ; l'entérinement puis dump-fiches /
  // generate-fiches propagent aux prompts (FUTURE-ONLY, cf. STATUS.md).
  function setFiche(value) {
    setDoc((d) => ({ ...d, fiche: value }))
    setDirty(true)
  }

  async function save() {
    setBusy(true)
    setFeedback(null)
    try {
      const saved = await api.saveDraft(draftId, doc, baseHash)
      setDoc(structuredClone(saved.content))
      setBaseHash(saved.contentHash)
      setDirty(false)
      setFeedback({ kind: 'ok', message: 'Compétence enregistrée.' })
    } catch (err) {
      // 409 = un autre épistémiarque a modifié cette compétence entre-temps.
      const conflict = err instanceof ApiError && err.status === 409
      setFeedback({
        kind: 'error',
        message: conflict
          ? errorMessage(err) + ' Rechargez pour récupérer la dernière version.'
          : errorMessage(err),
        reload: conflict,
      })
    } finally {
      setBusy(false)
    }
  }

  async function submitForVote() {
    setBusy(true)
    setFeedback(null)
    try {
      if (dirty) {
        const saved = await api.saveDraft(draftId, doc, baseHash)
        setBaseHash(saved.contentHash)
      }
      await api.submitDraft(draftId, decidimUrl.trim() || null)
      go(`#/epistemiarque/proposition/${draftId}`)
    } catch (err) {
      setFeedback({ kind: 'error', message: errorMessage(err) })
      setBusy(false)
    }
  }

  return (
    <div className="epi-editeur">
      <p className="epi-breadcrumb">
        <a href="#/epistemiarque">← Atelier</a>
      </p>
      <section className="epi-block">
        <h2>
          <span className="epi-comp-code">{state.meta.code}</span> Édition — v{state.meta.semver}{' '}
          <span className="epi-status-draft">brouillon</span>
        </h2>
        <label className="epi-field">
          Nom de la compétence
          <input type="text" value={ident.nom ?? ''} onChange={(e) => setIdent('nom', e.target.value)} />
        </label>
        <label className="epi-field">
          Définition
          <textarea
            rows={3}
            value={ident.definition ?? ''}
            onChange={(e) => setIdent('definition', e.target.value)}
          />
        </label>
        <label className="epi-field">
          Argument employeur
          <textarea
            rows={2}
            value={ident.argument_employeur ?? ''}
            onChange={(e) => setIdent('argument_employeur', e.target.value)}
          />
        </label>
      </section>

      <section className="epi-block" aria-label="Marqueurs fondamentaux">
        <h3>Marqueurs fondamentaux</h3>
        <ListEditor
          items={ident.marqueurs_fondamentaux ?? []}
          onChange={(list) => setIdent('marqueurs_fondamentaux', list)}
          placeholder="ex. Validation croisée"
          ariaLabel="marqueur"
        />
      </section>

      <section className="epi-block" aria-label="Protocole de scan (passe 1)">
        <h3>Protocole — signaux déclencheurs (passe 1)</h3>
        <p className="epi-hint">
          Les expressions repérées lors du balayage rapide d’un portfolio. C’est ici que
          l’enrichissement sur retours humains fait évoluer la détection.
        </p>
        <ListEditor
          items={passe1.signaux_declencheurs ?? []}
          onChange={setSignaux}
          placeholder="ex. j’ai vérifié"
          ariaLabel="signal"
        />
      </section>

      <section className="epi-block" aria-label="Enrichissements">
        <h3>Enrichissements (retours humains)</h3>
        <textarea
          className="epi-comp-desc"
          rows={3}
          aria-label="Enrichissements"
          placeholder="Notes, cas limites remontés par les cartographes, exemples…"
          value={typeof doc.enrichissements === 'string' ? doc.enrichissements : ''}
          onChange={(e) => setEnrichissements(e.target.value)}
        />
      </section>

      <section className="epi-block">
        <h3>Fiche de scan (source unique)</h3>
        <p className="epi-hint">
          Le texte de référence de la compétence, injecté dans les prompts de cartographie. C’est LA
          source : Twin6 et Twin9 en dérivent automatiquement (les cartographies futures uniquement ;
          les précédentes gardent leur version épinglée).
        </p>
        <label className="epi-field">
          Fiche de scan
          <textarea
            className="epi-comp-desc"
            rows={12}
            value={typeof doc.fiche === 'string' ? doc.fiche : ''}
            onChange={(e) => setFiche(e.target.value)}
          />
        </label>
      </section>

      <div className="epi-actions">
        <button type="button" className="button" onClick={save} disabled={busy || !dirty}>
          {busy ? '…' : 'Enregistrer'}
        </button>
      </div>

      <section className="epi-block epi-submit" aria-label="Soumettre au vote">
        <h3>Soumettre au vote des membres</h3>
        <p className="epi-hint">
          Une fois soumise, la compétence est gelée et les membres votent. Elle sera entérinée à la
          majorité. Vous pouvez joindre un fil Decidim.
        </p>
        <label className="epi-field">
          Lien Decidim (optionnel)
          <input
            type="url"
            value={decidimUrl}
            onChange={(e) => setDecidimUrl(e.target.value)}
            placeholder="https://participer.harmonia.education/…"
          />
        </label>
        <button type="button" className="button epi-primary" onClick={submitForVote} disabled={busy}>
          {busy ? 'Soumission…' : 'Soumettre au vote'}
        </button>
      </section>

      {feedback ? (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={feedback.kind === 'error' ? 'load-error' : 'epi-ok'}
        >
          {feedback.message}{' '}
          {feedback.reload ? (
            <button type="button" className="epi-link-button" onClick={() => window.location.reload()}>
              Recharger
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}

/** Petit éditeur de liste de chaînes (ajout / suppression / édition). */
function ListEditor({ items, onChange, placeholder, ariaLabel }) {
  return (
    <div className="epi-listeditor">
      <ul className="epi-comps-edit">
        {items.map((item, i) => (
          <li key={i} className="epi-comp-edit-row">
            <input
              type="text"
              aria-label={`${ariaLabel} ${i + 1}`}
              value={item}
              onChange={(e) => onChange(items.map((it, j) => (j === i ? e.target.value : it)))}
            />
            <button
              type="button"
              className="epi-link-button"
              aria-label={`supprimer ${ariaLabel} ${i + 1}`}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="button epi-small" onClick={() => onChange([...items, ''])}>
        + Ajouter ({placeholder})
      </button>
    </div>
  )
}

// ────────────────────────────────────────────────────────── proposition

function PropositionSection({ api, proposalId, user, canVote }) {
  const [state, setState] = useState({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [comment, setComment] = useState('')
  const [releaseNote, setReleaseNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    let alive = true
    api
      .getProposal(proposalId)
      .then((proposal) => {
        if (alive) setState({ status: 'ready', proposal })
      })
      .catch((error) => {
        if (alive) setState({ status: 'error', message: errorMessage(error) })
      })
    return () => {
      alive = false
    }
  }, [api, proposalId, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  if (state.status === 'loading') return <p role="status">Chargement de la proposition…</p>
  if (state.status === 'error')
    return (
      <div>
        <p role="alert" className="load-error">
          {state.message}
        </p>
        <p>
          <a href="#/epistemiarque">Retour à l’atelier</a>
        </p>
      </div>
    )

  const { proposal } = state
  const { tally, votes = [], decidimUrl, baseVersion, baseContent, content } = proposal
  const myVote = user?.id != null ? votes.find((v) => v.userId === user.id) ?? null : null
  const decidimHref = decidimUrl || DECIDIM_URL

  async function castVote(choice) {
    setBusy(true)
    setFeedback(null)
    try {
      await api.vote(proposalId, choice, comment.trim() || null)
      setComment('')
      reload()
    } catch (err) {
      setFeedback({ kind: 'error', message: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }
  async function withdraw() {
    setBusy(true)
    try {
      await api.withdrawDraft(proposalId)
      go(`#/epistemiarque/editer/${proposalId}`)
    } catch (err) {
      setFeedback({ kind: 'error', message: errorMessage(err) })
      setBusy(false)
    }
  }
  async function publish() {
    setBusy(true)
    try {
      await api.publishDraft(proposalId, releaseNote.trim() || 'Entérinée par le vote des membres.')
      go('#/epistemiarque')
    } catch (err) {
      setFeedback({ kind: 'error', message: errorMessage(err) })
      setBusy(false)
    }
  }

  return (
    <div className="epi-proposition">
      <p className="epi-breadcrumb">
        <a href="#/epistemiarque">← Atelier</a>
      </p>
      <section className="epi-block">
        <h2>
          <span className="epi-comp-code">{proposal.code}</span> {proposal.nom} — v{proposal.semver}{' '}
          <span className="epi-status-review">au vote</span>
        </h2>
        <p className="epi-hint">
          Évolution de la compétence (version en vigueur {baseVersion ?? '—'}).{' '}
          <a href={decidimHref} rel="noreferrer">
            Débattre sur Decidim
          </a>
          {decidimUrl ? ' (fil joint)' : ''}.
        </p>
      </section>

      <CompetenceChange base={baseContent} proposed={content} />

      <TallyPanel tally={tally} />

      <section className="epi-block" aria-label="Votes exprimés">
        <h3>Votes exprimés</h3>
        {votes.length === 0 ? (
          <p className="epi-empty">Aucun vote pour l’instant.</p>
        ) : (
          <ul className="epi-votes">
            {votes.map((v) => (
              <li key={v.userId} className={`epi-vote epi-vote-${v.vote}`}>
                <span className="epi-vote-who">{v.displayName}</span>
                <span className="epi-vote-choice">{voteLabel(v.vote)}</span>
                {v.comment ? <span className="epi-vote-comment">« {v.comment} »</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canVote ? (
        <section className="epi-block epi-voter" aria-label="Mon vote">
          <h3>Mon vote {myVote ? `(actuel : ${voteLabel(myVote.vote)})` : ''}</h3>
          <label className="epi-field">
            Commentaire (optionnel)
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="motivation, réserve, renvoi à un fil Decidim…"
            />
          </label>
          <div className="epi-vote-buttons">
            <button type="button" className="button epi-vote-pour" onClick={() => castVote('pour')} disabled={busy}>
              Pour
            </button>
            <button type="button" className="button epi-vote-contre" onClick={() => castVote('contre')} disabled={busy}>
              Contre
            </button>
            <button
              type="button"
              className="button epi-vote-abstention"
              onClick={() => castVote('abstention')}
              disabled={busy}
            >
              Abstention
            </button>
          </div>
        </section>
      ) : (
        <p className="epi-hint">
          Vous pouvez suivre ce vote mais seuls les membres épistémiarques y prennent part.
        </p>
      )}

      <section className="epi-block epi-decision" aria-label="Décision">
        <h3>Décision</h3>
        {tally.outcome === 'adopted' ? (
          <>
            <p className="epi-ok">Majorité atteinte : la compétence peut être entérinée.</p>
            <label className="epi-field">
              Note de publication
              <input
                type="text"
                value={releaseNote}
                onChange={(e) => setReleaseNote(e.target.value)}
                placeholder="ce que cette version change"
              />
            </label>
            <button type="button" className="button epi-primary" onClick={publish} disabled={busy}>
              {busy ? 'Publication…' : 'Entériner cette compétence'}
            </button>
          </>
        ) : (
          <p className="epi-hint">
            {outcomeMessage(tally)} La publication sera possible dès la majorité «&nbsp;pour&nbsp;».
          </p>
        )}
        <p className="epi-withdraw">
          <button type="button" className="epi-link-button" onClick={withdraw} disabled={busy}>
            Retirer la proposition (rouvre l’édition, efface les votes)
          </button>
        </p>
      </section>

      {feedback ? (
        <p role="alert" className="load-error">
          {feedback.message}
        </p>
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────── présentation

function TallyChip({ tally }) {
  if (!tally) return null
  return (
    <span className={`epi-chip epi-chip-${tally.outcome}`}>
      {tally.pour}/{tally.threshold ?? '—'} pour · {outcomeShort(tally.outcome)}
    </span>
  )
}

function TallyPanel({ tally }) {
  const pct =
    tally.threshold && tally.threshold > 0
      ? Math.min(100, Math.round((tally.pour / tally.threshold) * 100))
      : 0
  return (
    <section className="epi-block epi-tally" aria-label="Décompte des voix">
      <h3>Décompte — {outcomeShort(tally.outcome)}</h3>
      <p className="epi-tally-line">
        <strong>{tally.pour}</strong> voix « pour » sur <strong>{tally.threshold ?? '—'}</strong>{' '}
        requises · {tally.electorateSize} membre{tally.electorateSize > 1 ? 's' : ''} épistémiarque
        {tally.electorateSize > 1 ? 's' : ''}.
      </p>
      <div
        className="epi-progress"
        role="progressbar"
        aria-valuenow={tally.pour}
        aria-valuemin={0}
        aria-valuemax={tally.threshold ?? 0}
      >
        <span className="epi-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <ul className="epi-tally-counts">
        <li>Pour : {tally.pour}</li>
        <li>Contre : {tally.contre}</li>
        <li>Abstention : {tally.abstention}</li>
        <li>N’ont pas voté : {tally.notVoted}</li>
      </ul>
    </section>
  )
}

/** Aperçu des changements proposés (nom / définition) face à la version en vigueur. */
function CompetenceChange({ base, proposed }) {
  const rows = [
    ['Nom', base?.identite?.nom, proposed?.identite?.nom],
    ['Définition', base?.identite?.definition, proposed?.identite?.definition],
    ['Argument employeur', base?.identite?.argument_employeur, proposed?.identite?.argument_employeur],
  ].filter(([, b, p]) => (b ?? '') !== (p ?? ''))
  return (
    <section className="epi-block" aria-label="Changements proposés">
      <h3>Changements proposés</h3>
      {!base ? (
        <p className="epi-empty">Première version publiée de cette compétence.</p>
      ) : rows.length === 0 ? (
        <p className="epi-empty">
          Aucun changement textuel majeur (marqueurs / protocole / enrichissements peuvent avoir
          évolué).
        </p>
      ) : (
        <ul className="epi-diff-summary epi-change-list">
          {rows.map(([label, b, p]) => (
            <li key={label}>
              <strong>{label}</strong> : « {b || '—'} » → « {p || '—'} »
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function voteLabel(vote) {
  return { pour: 'Pour', contre: 'Contre', abstention: 'Abstention' }[vote] ?? vote
}
function outcomeShort(outcome) {
  return (
    {
      adopted: 'majorité atteinte',
      rejected: 'rejetée',
      pending: 'en cours',
      blocked: 'aucun électeur',
    }[outcome] ?? outcome
  )
}
function outcomeMessage(tally) {
  if (tally.outcome === 'rejected')
    return 'Cette proposition a été rejetée par la majorité des membres.'
  if (tally.outcome === 'blocked')
    return 'Aucun compte ne porte le rôle épistémiarque : personne ne peut valider.'
  return `Vote en cours : ${tally.pour} voix « pour » sur ${tally.threshold ?? '—'} requises.`
}
