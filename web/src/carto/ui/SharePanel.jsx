// Interface ultime — espace Partage (spec §12, phase 2, ADULTES UNIQUEMENT).
//
// Par défaut tout reste dans le navigateur. Ici, et seulement ici, un
// apprenant ADULTE peut publier sur le serveur une VERSION PARTAGÉE de sa
// cartographie et en donner un lien. Le parcours :
//   0. attestation de majorité (auto-certification, sans contrôle d'âge) ;
//      sans elle, la fonction n'existe pas — et le serveur la refuse aussi ;
//   1. choisir : titre, précision des dates, compétences (cases à trois
//      états, liste positive), extraits (aucun par défaut) ;
//   2. relire : noms et confidences de tiers, masques, retrait d'extraits ;
//   3. aperçu verrouillé (la vue exacte du destinataire), encart RGPD et
//      demande explicite de copie serveur, publication ;
// puis la gestion : liens (expiration, mot de passe facultatif, révocation),
// journal des accès, export JSON, retrait immédiat. Vocabulaire : on RETIRE
// d'une version partagée, on ne « supprime » jamais rien de la cartographie.
//
// Nouvelle version (décision du 2026-10-14) : par défaut, elle se publie À LA
// PLACE de la plus récente — même lien, les destinataires voient la nouvelle
// version ; « une version distincte » reste possible. « Publier une nouvelle
// version à la place » reprend la composition d'une version (gardée dans ce
// navigateur à chaque publication ; à défaut, son titre, ses dates et ses
// compétences).

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ApiError } from '../../api/client.js'
import { downloadBlob } from '../../lib/download-json.js'
import { PATTERNS, makeReplacer, patternCounts } from '../core/anonymize.js'
import { formatLong, formatShort } from '../core/dates.js'
import {
  DEFAULT_LINK_DAYS,
  DEFAULT_SHARE_PATTERNS,
  LINK_PASSWORD_MIN,
  MAX_EXTRACTS,
  PRECISION_LABELS,
  absoluteShareUrl,
  attestationRequired,
  buildSharedVersion,
  cleanExtractText,
  extractCandidates,
  reviewPoints,
} from '../core/share.js'
import { verdictDetailOf } from './Observations.jsx'
import { TriStateCheckbox, TwoStepButton } from './Manager.jsx'
import { SharedView } from './SharedView.jsx'
import { LINK_STATUS_LABELS, linkStatus } from './shareApi.js'

/** Hébergement et durées affichés (§12.1) — à garder alignés sur docs/rgpd-registre.md. */
export const HOSTING_TEXT = 'Hébergement : OVHcloud, dans l’Union européenne.'
const DEFAULT_TITLE = 'Ma cartographie de compétences'

/**
 * Composition d'une version publiée, gardée dans CE navigateur (jamais sur le
 * serveur) pour la reprendre et publier une nouvelle version à sa place.
 */
const DRAFT_PREFIX = 'humanome-carto-share-draft:'
function saveDraft(key, draft) {
  try {
    localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(draft))
  } catch {
    /* stockage indisponible : la reprise partira du document publié */
  }
}
function loadDraft(key) {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function dropDraft(key) {
  try {
    localStorage.removeItem(DRAFT_PREFIX + key)
  } catch {
    /* rien à faire */
  }
}

/** Réglages repris d'un document publié (sans ses extraits, qui sont des textes relus). */
function settingsFromDocument(doc) {
  return {
    title: doc?.title,
    precision: doc?.datePrecision,
    codes: (doc?.state?.competencies ?? []).map((c) => c.code),
    fromDocument: true,
  }
}
const SNIPPET = 260

function apiMessage(err) {
  if (err instanceof ApiError && err.code === 'adult_required') return 'Le partage est réservé aux personnes majeures : votre attestation n’est plus enregistrée.'
  // Refus détaillé du serveur (422) : on montre la raison, pas seulement « Validation échouée ».
  const detail = err?.fields && typeof err.fields === 'object' ? Object.values(err.fields).filter((v) => typeof v === 'string').join(' ; ') : ''
  return detail ? `${err.message} : ${detail}` : (err?.message ?? 'Erreur inattendue.')
}

/** Export JSON complet des versions partagées du compte (document, liens, journal des accès). */
async function exportVersions(api, versions) {
  const full = []
  for (const v of versions) {
    const doc = await api.getVersion(v.id)
    const links = await api.listLinks(v.id)
    full.push({ ...doc, links: await Promise.all(links.map(async (l) => ({ ...l, consultations: await api.consultations(l.shareId).catch(() => null) }))) })
  }
  return new Blob([JSON.stringify({ kind: 'carto-partage-export', exportedAt: new Date().toISOString(), versions: full }, null, 2)], { type: 'application/json' })
}

function Status({ value }) {
  if (!value) return null
  return (
    <p role={value.kind === 'error' ? 'alert' : 'status'} className={value.kind === 'error' ? 'carto-error carto-small' : 'carto-small carto-export-done'}>
      {value.text}
    </p>
  )
}

/** Titre d'étape ; il reçoit le focus quand on change d'étape (pas à l'ouverture de l'espace). */
function StepTitle({ children, id, focus }) {
  const ref = useRef(null)
  useEffect(() => {
    if (focus) ref.current?.focus()
  }, [focus])
  return (
    <h3 id={id} ref={ref} tabIndex={-1} className="carto-share-step-title">
      {children}
    </h3>
  )
}

// ---------------------------------------------------------------------------
// 0. Attestation de majorité

function AdultGate({ busy, onAttest, error }) {
  const uid = useId()
  const [checked, setChecked] = useState(false)
  return (
    <section className="carto-export-card carto-share-gate" aria-labelledby={`${uid}-t`}>
      <h3 id={`${uid}-t`}>Le partage par lien est réservé aux personnes majeures</h3>
      <p className="carto-small">
        Partager, c’est enregistrer sur notre serveur une version de votre cartographie que vous choisissez, et donner un lien à quelqu’un (un employeur, par
        exemple). Aucun contrôle d’âge n’est fait : c’est vous qui l’attestez.
      </p>
      <p className="carto-small">
        Si vous avez moins de 18 ans, ou en cas de doute, gardez votre cartographie dans ce navigateur : rien n’en sort, et l’espace Export reste à votre
        disposition (archive, copie autonome, rapport imprimable).
      </p>
      <label className="carto-small carto-share-check">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> J’atteste avoir 18 ans ou plus.
      </label>
      <button type="button" className="carto-btn" disabled={!checked || busy} onClick={onAttest}>
        Confirmer et continuer
      </button>
      <Status value={error ? { kind: 'error', text: error } : null} />
    </section>
  )
}

// ---------------------------------------------------------------------------
// 1-3. Composer une version partagée

function CompetencyTree({ refl, state, codes, setCodes, shares, chosenByCode, openCode, setOpenCode }) {
  const observed = refl.competencies.filter((c) => state.competencies.get(c.code)?.intensity > 0)
  const toggle = (list, on) =>
    setCodes((prev) => {
      const next = new Set(prev)
      for (const code of list) {
        if (on) next.add(code)
        else next.delete(code)
      }
      return next
    })
  return (
    <ul className="carto-share-tree">
      {refl.poles.map((p) => {
        const members = observed.filter((c) => c.pole === p.num)
        if (members.length === 0) return null
        const kept = members.filter((c) => codes.has(c.code)).length
        const tri = kept === 0 ? 'none' : kept === members.length ? 'all' : 'mixed'
        return (
          <li key={p.num} style={{ '--pole-color': p.color }}>
            <label className="carto-share-pole">
              <TriStateCheckbox state={tri} label={`Pôle ${p.name} : garder toutes ses compétences dans la version partagée`} onChange={(on) => toggle(members.map((c) => c.code), on)} />
              <span aria-hidden="true">{p.symbol}</span> {p.name} <span className="carto-count">({kept}/{members.length})</span>
            </label>
            <ul>
              {members.map((c) => {
                const on = codes.has(c.code)
                const n = chosenByCode.get(c.code) ?? 0
                return (
                  <li key={c.code} className={on ? '' : 'is-off'}>
                    <label>
                      <input type="checkbox" checked={on} onChange={(e) => toggle([c.code], e.target.checked)} aria-label={`Garder ${c.code} ${c.name} dans la version partagée`} />{' '}
                      <span className="carto-code">{c.code}</span> {c.name}
                    </label>
                    <span className="carto-small carto-muted">{on && shares.has(c.code) ? ` ${(shares.get(c.code) / 3.6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : ' retirée'}</span>
                    {on ? (
                      <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" aria-expanded={openCode === c.code} onClick={() => setOpenCode(openCode === c.code ? null : c.code)}>
                        {n > 0 ? `Extraits (${n})` : 'Ajouter des extraits'}
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}

function ExtractPicker({ code, refl, state, data, chosen, onToggle, textOf }) {
  const candidates = useMemo(() => extractCandidates(state, refl, [code]), [state, refl, code])
  const dates = useMemo(() => [...new Set(candidates.map((c) => c.date))], [candidates])
  const { ensureDetails } = data
  useEffect(() => {
    if (dates.length) ensureDetails(dates)
  }, [dates, ensureDetails])
  const meta = refl.compByCode.get(code)
  return (
    <section className="carto-share-picker" aria-label={`Extraits proposés pour ${code} ${meta?.name ?? ''}`}>
      <h4>
        Extraits de <span className="carto-code">{code}</span> {meta?.name}
      </h4>
      <p className="carto-small carto-muted">Aucun extrait n’est partagé si vous n’en cochez pas. Un extrait cité ici reste visible tel quel par le destinataire.</p>
      <ul>
        {candidates.map((c) => {
          const text = textOf(c)
          return (
            <li key={c.key}>
              <label>
                <input type="checkbox" checked={chosen.has(c.key)} disabled={text === undefined || text === ''} onChange={(e) => onToggle(c, e.target.checked)} />{' '}
                <span className="carto-small carto-muted">
                  {formatShort(c.date)}, {c.role === 'preuve' ? 'preuve' : 'indice'}
                </span>
              </label>
              {text === undefined ? (
                <p className="carto-small carto-muted">Chargement…</p>
              ) : text === '' ? (
                <p className="carto-small carto-muted">Trace sans extrait.</p>
              ) : (
                <blockquote className="carto-verbatim">{text.length > SNIPPET ? `${text.slice(0, SNIPPET)}…` : text}</blockquote>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Composer({ refl, state, data, t, api, onPublished, versions = [], target = 'new', onTarget, seed = null, headingRef }) {
  const uid = useId()
  const [step, setStepState] = useState('choose')
  const [moved, setMoved] = useState(false)
  const setStep = (next) => {
    setMoved(true)
    setStepState(next)
  }
  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [precision, setPrecision] = useState('month')
  const [codes, setCodes] = useState(() => new Set(refl.competencies.filter((c) => state.competencies.get(c.code)?.intensity > 0).map((c) => c.code)))
  const [chosen, setChosen] = useState(() => new Map())
  const [edits, setEdits] = useState(() => new Map())
  const [editing, setEditing] = useState(null)
  const [dictionary, setDictionary] = useState([])
  const [newName, setNewName] = useState('')
  const [patterns, setPatterns] = useState(() => ({ ...DEFAULT_SHARE_PATTERNS }))
  const [reviewed, setReviewed] = useState(false)
  const [consent, setConsent] = useState(false)
  const [adultNow, setAdultNow] = useState(false)
  const [openCode, setOpenCode] = useState(null)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  // Reprise d'une version publiée : ses choix remplacent la composition en cours.
  useEffect(() => {
    if (!seed?.settings) return
    const x = seed.settings
    if (typeof x.title === 'string') setTitle(x.title)
    if (x.precision) setPrecision(x.precision)
    if (Array.isArray(x.codes)) setCodes(new Set(x.codes))
    setChosen(new Map((x.chosen ?? []).map((c) => [c.key, c])))
    setEdits(new Map(x.edits ?? []))
    setDictionary(Array.isArray(x.dictionary) ? x.dictionary : [])
    if (x.patterns) setPatterns({ ...DEFAULT_SHARE_PATTERNS, ...x.patterns })
    setStep('choose')
  }, [seed])

  const { getDetail } = data
  const textOf = useCallback(
    (c) => {
      const vd = verdictDetailOf(getDetail, c.date, c.variantId, c.code)
      if (vd === undefined) return undefined
      return cleanExtractText(vd?.traces?.[c.traceId]?.extract ?? '')
    },
    [getDetail],
  )
  // Ordre de lecture : celui du référentiel, puis des journées.
  const chosenList = useMemo(() => {
    const order = (code) => refl.compByCode.get(code)?.order ?? Infinity
    return [...chosen.values()].filter((c) => codes.has(c.code)).sort((a, b) => order(a.code) - order(b.code) || a.date.localeCompare(b.date))
  }, [chosen, codes, refl])
  const chosenByCode = useMemo(() => {
    const m = new Map()
    for (const c of chosenList) m.set(c.code, (m.get(c.code) ?? 0) + 1)
    return m
  }, [chosenList])
  const extractInput = useMemo(
    () => chosenList.map((c) => ({ code: c.code, date: c.date, role: c.role, text: edits.get(c.key) ?? textOf(c) ?? '' })),
    [chosenList, edits, textOf],
  )

  const { built, buildError } = useMemo(() => {
    try {
      return { built: buildSharedVersion({ state, ref: refl, title, codes, precision, extracts: extractInput, dictionary, patterns }), buildError: null }
    } catch (err) {
      return { built: null, buildError: err.message }
    }
  }, [state, refl, title, codes, precision, extractInput, dictionary, patterns])
  const shares = useMemo(() => new Map((built?.state.competencies ?? []).map((c) => [c.code, c.theta])), [built])
  const replacer = useMemo(() => makeReplacer({ dictionary, patterns }), [dictionary, patterns])
  const points = useMemo(() => reviewPoints({ title, extracts: extractInput }, dictionary), [title, extractInput, dictionary])
  const counts = useMemo(() => patternCounts([title, ...extractInput.map((e) => e.text)]), [title, extractInput])
  // Toute modification de ce qui serait publié (titre, dates, compétences,
  // extraits, masques, noms) annule la relecture, l'accord et l'attestation :
  // on confirme toujours la version exacte qui part.
  const contentKey = useMemo(() => (built ? JSON.stringify({ ...built, publishedAt: null }) : ''), [built])
  useEffect(() => {
    setReviewed(false)
    setConsent(false)
    setAdultNow(false)
  }, [contentKey])

  function toggleExtract(c, on) {
    setChosen((prev) => {
      const next = new Map(prev)
      if (on && next.size < MAX_EXTRACTS) next.set(c.key, c)
      else next.delete(c.key)
      return next
    })
    setReviewed(false)
  }

  function addName(word) {
    const from = String(word ?? '').trim()
    if (from.length < 2) return
    setDictionary((d) => (d.some((x) => x.from.toLowerCase() === from.toLowerCase()) ? d : [...d, { from, to: '‹nom›' }]))
    setReviewed(false)
  }

  const replacing = target !== 'new' ? versions.find((v) => v.id === target) ?? null : null

  async function publish() {
    if (!built) return
    setBusy(true)
    setStatus({ kind: 'busy', text: 'Publication…' })
    try {
      const doc = { ...built, publishedAt: new Date().toISOString() }
      let id
      if (replacing) {
        await api.replaceVersion(replacing.id, doc)
        id = replacing.id
      } else {
        id = (await api.publish(doc)).id
      }
      saveDraft(`${data.dataset?.datasetId ?? ''}:${id}`, {
        title,
        precision,
        codes: [...codes],
        chosen: [...chosen.values()],
        edits: [...edits.entries()],
        dictionary,
        patterns,
      })
      setStatus(null)
      setStep('choose')
      setChosen(new Map())
      setEdits(new Map())
      setReviewed(false)
      setConsent(false)
      setAdultNow(false)
      onPublished(id, built.title, Boolean(replacing))
    } catch (err) {
      setStatus({ kind: 'error', text: apiMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const steps = [
    ['choose', 'Choisir'],
    ['review', 'Relire'],
    ['preview', 'Aperçu et publication'],
  ]

  return (
    <section className="carto-share-composer" aria-labelledby={`${uid}-title`}>
      <h3 id={`${uid}-title`} className="carto-share-h" ref={headingRef} tabIndex={-1}>
        Nouvelle version partagée
      </h3>
      <ol className="carto-share-steps" aria-label="Étapes">
        {steps.map(([id, label], i) => (
          <li key={id} aria-current={step === id ? 'step' : undefined}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 'choose' ? (
        <div className="carto-share-step">
          <StepTitle id={`${uid}-choose`} focus={moved}>Choisir ce qui est partagé</StepTitle>
          <p className="carto-small">
            La version part de l’état affiché : les journées cochées dans le gestionnaire{t ? `, jusqu’au ${formatLong(t)}` : ''}. Ce que vous ne cochez pas ici
            n’est pas envoyé. Décocher retire l’élément de cette version partagée : rien n’est supprimé de votre cartographie.
          </p>
          <label className="carto-share-field">
            <span>Titre vu par le destinataire</span>
            <input type="text" value={title} maxLength={190} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <fieldset className="carto-share-field">
            <legend>Dates</legend>
            {['day', 'month', 'none'].map((p) => (
              <label key={p} className="carto-small">
                <input type="radio" name={`${uid}-precision`} checked={precision === p} onChange={() => setPrecision(p)} /> {PRECISION_LABELS[p]}
                {p === 'month' ? ' (recommandé)' : ''}
              </label>
            ))}
            <p className="carto-hint">Masquées : ni période, ni heatmap, ni date d’extrait ne sont partagées.</p>
          </fieldset>
          <fieldset className="carto-share-field">
            <legend>Compétences</legend>
            {state.competencies.size === 0 ? (
              <p className="carto-small carto-muted">Aucune compétence observée dans les journées cochées.</p>
            ) : (
              <CompetencyTree refl={refl} state={state} codes={codes} setCodes={setCodes} shares={shares} chosenByCode={chosenByCode} openCode={openCode} setOpenCode={setOpenCode} />
            )}
          </fieldset>
          {openCode && codes.has(openCode) ? <ExtractPicker code={openCode} refl={refl} state={state} data={data} chosen={chosen} onToggle={toggleExtract} textOf={textOf} /> : null}
          {buildError ? <p className="carto-note carto-small">{buildError}</p> : null}
          <div className="carto-share-actions">
            <button type="button" className="carto-btn" disabled={!built} onClick={() => setStep('review')}>
              Suivant : relire
            </button>
          </div>
        </div>
      ) : null}

      {step === 'review' && built ? (
        <div className="carto-share-step">
          <StepTitle id={`${uid}-review`} focus={moved}>Relire avant de publier</StepTitle>
          <p className="carto-small">
            Un portfolio parle souvent d’autres personnes. Avant toute publication, vérifiez que le titre et les extraits ne révèlent ni le nom ni les confidences
            de quelqu’un sans son accord.
          </p>
          <p className="carto-small">
            Titre publié : <strong>{built.title}</strong>
          </p>
          <fieldset className="carto-share-field">
            <legend>Masquer automatiquement</legend>
            {Object.entries(PATTERNS).map(([k, p]) => (
              <label key={k} className="carto-small">
                <input type="checkbox" checked={Boolean(patterns[k])} onChange={(e) => setPatterns((x) => ({ ...x, [k]: e.target.checked }))} /> {p.label} ({counts[k] ?? 0})
              </label>
            ))}
          </fieldset>
          <fieldset className="carto-share-field">
            <legend>Noms à remplacer</legend>
            {points.names.length ? (
              <p className="carto-small">
                Mots à majuscule repérés :{' '}
                {points.names.map((w) => (
                  <button key={w} type="button" className="carto-chip carto-chip--button" onClick={() => addName(w)} aria-label={`Remplacer « ${w} » par ‹nom›`}>
                    {w}
                  </button>
                ))}
              </p>
            ) : (
              <p className="carto-small carto-muted">Aucun mot à majuscule repéré en dehors des mots courants.</p>
            )}
            <form
              className="carto-share-inline"
              onSubmit={(e) => {
                e.preventDefault()
                addName(newName)
                setNewName('')
              }}
            >
              <label className="carto-small">
                Autre nom <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </label>
              <button type="submit" className="carto-btn carto-btn--quiet carto-btn--small">
                Ajouter
              </button>
            </form>
            {dictionary.length ? (
              <ul className="carto-share-dict">
                {dictionary.map((d, i) => (
                  <li key={d.from}>
                    <span className="carto-small">{d.from} →</span>{' '}
                    <input
                      type="text"
                      aria-label={`Remplacement de ${d.from}`}
                      value={d.to}
                      onChange={(e) => setDictionary((list) => list.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
                    />{' '}
                    <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" onClick={() => setDictionary((list) => list.filter((_, j) => j !== i))}>
                      Ne plus remplacer
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </fieldset>
          <section aria-label="Extraits tels qu’ils seront publiés">
            <h4>Extraits ({chosenList.length})</h4>
            {chosenList.length === 0 ? <p className="carto-small carto-muted">Aucun extrait : seuls le soleil, la heatmap et les chiffres sont partagés.</p> : null}
            <ul className="carto-share-review">
              {chosenList.map((c) => {
                const original = edits.get(c.key) ?? textOf(c) ?? ''
                return (
                  <li key={c.key}>
                    <p className="carto-small carto-muted">
                      <span className="carto-code">{c.code}</span> {refl.compByCode.get(c.code)?.name}, {formatShort(c.date)}
                    </p>
                    {editing === c.key ? (
                      <textarea
                        aria-label={`Modifier l’extrait du ${formatShort(c.date)}`}
                        value={original}
                        rows={4}
                        onChange={(e) => {
                          const value = e.target.value
                          setEdits((m) => new Map(m).set(c.key, value))
                          setReviewed(false)
                        }}
                      />
                    ) : (
                      <blockquote className="carto-verbatim">{cleanExtractText(original, replacer)}</blockquote>
                    )}
                    <div className="carto-share-actions">
                      <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" onClick={() => setEditing(editing === c.key ? null : c.key)}>
                        {editing === c.key ? 'Terminer la modification' : 'Modifier le passage'}
                      </button>
                      <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" onClick={() => toggleExtract(c, false)}>
                        Retirer de cette version partagée
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
          <label className="carto-small carto-share-check">
            <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> J’ai relu le titre et les extraits : ils ne révèlent pas
            d’information sur une autre personne sans son accord.
          </label>
          <div className="carto-share-actions">
            <button type="button" className="carto-btn carto-btn--quiet" onClick={() => setStep('choose')}>
              Retour
            </button>
            <button type="button" className="carto-btn" disabled={!reviewed} onClick={() => setStep('preview')}>
              Suivant : aperçu
            </button>
          </div>
        </div>
      ) : null}

      {step === 'preview' && built ? (
        <div className="carto-share-step">
          <StepTitle id={`${uid}-preview`} focus={moved}>Aperçu : exactement ce que verra le destinataire</StepTitle>
          <div className="carto-share-preview" aria-label="Aperçu verrouillé de la version partagée">
            <SharedView doc={built} preview />
          </div>
          <aside className="carto-note carto-share-rgpd" aria-label="Copie sur le serveur">
            <h4>Copie sur le serveur</h4>
            <ul className="carto-small">
              <li>Seule cette version partagée est envoyée : ni votre portfolio, ni les délibérations du jury, ni vos notes.</li>
              <li>{HOSTING_TEXT}</li>
              <li>Conservation : jusqu’à ce que vous la retiriez (effacement immédiat) ou supprimiez votre compte. Chaque lien expire ({DEFAULT_LINK_DAYS} jours par défaut) et se révoque à tout moment.</li>
              <li>Vous voyez la date de chaque consultation. Le lien n’est pas indexé par les moteurs de recherche ; aucune statistique tierce.</li>
              <li>La version est figée : elle ne change pas tant que vous n’en publiez pas une nouvelle.</li>
            </ul>
            <label className="carto-small carto-share-check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Je demande l’enregistrement de cette version partagée
              sur le serveur de humanome.xyz.
            </label>
            <label className="carto-small carto-share-check">
              <input type="checkbox" checked={adultNow} onChange={(e) => setAdultNow(e.target.checked)} /> J’atteste avoir 18 ans ou plus au moment de cette
              publication.
            </label>
          </aside>
          {versions.length > 0 ? (
            <fieldset className="carto-share-field">
              <legend>Publier</legend>
              {versions.map((v) => (
                <label key={v.id} className="carto-small">
                  <input type="radio" name={`${uid}-target`} checked={target === v.id} onChange={() => onTarget?.(v.id)} /> à la place de « {v.titre} » (publiée le{' '}
                  {formatShort(String(v.createdAt).slice(0, 10))}) : même lien, vos destinataires verront cette nouvelle version et plus l’ancienne
                </label>
              ))}
              <label className="carto-small">
                <input type="radio" name={`${uid}-target`} checked={target === 'new'} onChange={() => onTarget?.('new')} /> comme une version distincte, avec ses
                propres liens
              </label>
            </fieldset>
          ) : null}
          <div className="carto-share-actions">
            <button type="button" className="carto-btn carto-btn--quiet" onClick={() => setStep('review')}>
              Retour
            </button>
            <button type="button" className="carto-btn" disabled={!consent || !adultNow || busy} onClick={publish}>
              {replacing ? `Publier à la place de « ${replacing.titre} »` : 'Publier la version partagée'}
            </button>
          </div>
          <Status value={status} />
        </div>
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Gestion : versions publiées, liens, journal des accès, export, retrait

function LinkForm({ cartoId, api, onCreated }) {
  const uid = useId()
  const [days, setDays] = useState(DEFAULT_LINK_DAYS)
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  async function create(e) {
    e.preventDefault()
    if (password !== '' && password.length < LINK_PASSWORD_MIN) {
      setStatus({ kind: 'error', text: `Le mot de passe compte au moins ${LINK_PASSWORD_MIN} caractères (ou laissez le champ vide).` })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const created = await api.createLink(cartoId, { expiresInDays: Number(days), password: password || undefined })
      setPassword('')
      onCreated({ ...created, absolute: absoluteShareUrl(created.url), withPassword: password !== '' })
    } catch (err) {
      setStatus({ kind: 'error', text: apiMessage(err) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="carto-share-linkform" onSubmit={create} aria-labelledby={`${uid}-t`}>
      <h5 id={`${uid}-t`}>Nouveau lien</h5>
      <label className="carto-small">
        Expire dans <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} /> jours
      </label>
      <label className="carto-small">
        Mot de passe (facultatif) <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <p className="carto-hint">Sans mot de passe, le lien suffit pour ouvrir la version. Avec, transmettez-le par un autre canal.</p>
      <button type="submit" className="carto-btn carto-btn--small" disabled={busy}>
        Créer le lien
      </button>
      <Status value={status} />
    </form>
  )
}

function CreatedLink({ link, onDone }) {
  const [copied, setCopied] = useState(false)
  const inputRef = useRef(null)
  async function copy() {
    try {
      await navigator.clipboard.writeText(link.absolute)
      setCopied(true)
    } catch {
      inputRef.current?.select()
    }
  }
  return (
    <div className="carto-share-created" role="status">
      <p className="carto-small">
        <strong>Lien créé.</strong> Copiez-le maintenant : il ne sera plus affiché (seule son empreinte est conservée).
        {link.withPassword ? ' Transmettez le mot de passe séparément.' : ''}
      </p>
      <div className="carto-share-inline">
        <input ref={inputRef} type="text" readOnly value={link.absolute} aria-label="Lien de partage" onFocus={(e) => e.target.select()} />
        <button type="button" className="carto-btn carto-btn--small" onClick={copy}>
          {copied ? 'Copié' : 'Copier le lien'}
        </button>
        <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" onClick={onDone}>
          Fermer
        </button>
      </div>
    </div>
  )
}

function LinkRow({ link, api, onRevoked }) {
  const [log, setLog] = useState(null)
  const [open, setOpen] = useState(false)
  const status = linkStatus(link)
  useEffect(() => {
    let alive = true
    api
      .consultations(link.shareId)
      .then((l) => alive && setLog(l))
      .catch(() => alive && setLog({ error: true }))
    return () => {
      alive = false
    }
  }, [api, link.shareId])
  return (
    <li className={`carto-share-link is-${status}`}>
      <p className="carto-small">
        Lien du {formatShort(String(link.createdAt).slice(0, 10))}, <strong>{LINK_STATUS_LABELS[status]}</strong>
        {status === 'active' && link.expiresAt ? `, expire le ${formatShort(String(link.expiresAt).slice(0, 10))}` : ''}
        {log && !log.error ? `, ${log.withPassword ? 'avec' : 'sans'} mot de passe` : ''}.
      </p>
      <p className="carto-small carto-muted">
        {log === null
          ? 'Consultations : chargement…'
          : log.error
            ? 'Consultations : journal indisponible.'
            : log.count === 0
              ? 'Pas encore consulté.'
              : `Consulté ${log.count} fois, dernière fois le ${formatShort(String(log.lastAt).slice(0, 10))} à ${String(log.lastAt).slice(11, 16)}.`}
      </p>
      <div className="carto-share-actions">
        {log && !log.error && log.count > 0 ? (
          <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" aria-expanded={open} onClick={() => setOpen(!open)}>
            Journal des accès
          </button>
        ) : null}
        {status === 'active' ? (
          <TwoStepButton
            label="Révoquer"
            confirmLabel="Confirmer la révocation"
            className="carto-btn--small"
            onConfirm={async () => {
              await api.revokeLink(link.shareId)
              onRevoked()
            }}
          />
        ) : null}
      </div>
      {open && log?.items ? (
        <ol className="carto-share-log carto-small" aria-label="Dates des consultations">
          {log.items.map((it, i) => (
            <li key={i}>
              {formatShort(String(it.at).slice(0, 10))} à {String(it.at).slice(11, 16)}
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  )
}

function VersionItem({ version, api, autoOpen, onRemoved, onReplace }) {
  const [open, setOpen] = useState(autoOpen)
  const [links, setLinks] = useState(null)
  const [created, setCreated] = useState(null)
  const [preview, setPreview] = useState(null)
  const [status, setStatus] = useState(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!open) return undefined
    let alive = true
    api
      .listLinks(version.id)
      .then((l) => alive && setLinks(l))
      .catch((err) => alive && setStatus({ kind: 'error', text: apiMessage(err) }))
    return () => {
      alive = false
    }
  }, [api, version.id, open, tick])
  const active = links ? links.filter((l) => linkStatus(l) === 'active').length : version.shares

  async function togglePreview() {
    if (preview) {
      setPreview(null)
      return
    }
    try {
      setPreview((await api.getVersion(version.id)).document)
    } catch (err) {
      setStatus({ kind: 'error', text: apiMessage(err) })
    }
  }

  async function download() {
    try {
      const full = await api.getVersion(version.id)
      const list = await api.listLinks(version.id)
      const withLogs = await Promise.all(list.map(async (l) => ({ ...l, consultations: await api.consultations(l.shareId).catch(() => null) })))
      const blob = new Blob([JSON.stringify({ kind: 'carto-partage-export', exportedAt: new Date().toISOString(), version: { ...full, links: withLogs } }, null, 2)], { type: 'application/json' })
      downloadBlob(blob, `version-partagee-${version.id}.json`)
      setStatus({ kind: 'ok', text: 'Export JSON téléchargé.' })
    } catch (err) {
      setStatus({ kind: 'error', text: apiMessage(err) })
    }
  }

  return (
    <li className="carto-share-version">
      <div className="carto-share-version-head">
        <div>
          <h4>{version.titre}</h4>
          <p className="carto-small carto-muted">
            Publiée le {formatShort(String(version.createdAt).slice(0, 10))}
            {version.updatedAt && String(version.updatedAt).slice(0, 16) !== String(version.createdAt).slice(0, 16)
              ? `, remplacée le ${formatShort(String(version.updatedAt).slice(0, 10))}`
              : ''}
            . {active > 0 ? `Lien partagé : ${active} lien${active > 1 ? 's' : ''} actif${active > 1 ? 's' : ''}.` : 'Privée : aucun lien actif.'}
          </p>
        </div>
        <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Replier' : 'Liens et accès'}
        </button>
      </div>
      {open ? (
        <div className="carto-share-version-body">
          {created ? <CreatedLink link={created} onDone={() => setCreated(null)} /> : null}
          {links === null ? (
            <p className="carto-small carto-muted">Chargement des liens…</p>
          ) : links.length === 0 ? (
            <p className="carto-small carto-muted">Aucun lien pour l’instant.</p>
          ) : (
            <ul className="carto-share-links">
              {links.map((l) => (
                <LinkRow key={l.shareId} link={l} api={api} onRevoked={() => setTick((n) => n + 1)} />
              ))}
            </ul>
          )}
          <LinkForm
            cartoId={version.id}
            api={api}
            onCreated={(link) => {
              setCreated(link)
              setTick((n) => n + 1)
            }}
          />
          <div className="carto-share-actions">
            <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" onClick={() => onReplace?.(version)}>
              Publier une nouvelle version à la place
            </button>
            <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" aria-expanded={Boolean(preview)} onClick={togglePreview}>
              {preview ? 'Fermer l’aperçu' : 'Aperçu'}
            </button>
            <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" onClick={download}>
              Télécharger (JSON)
            </button>
            <TwoStepButton
              label="Retirer cette version du serveur"
              confirmLabel="Confirmer : effacer la version et ses liens"
              className="carto-btn--small"
              onConfirm={async () => {
                try {
                  await api.deleteVersion(version.id)
                  onRemoved(version.id)
                } catch (err) {
                  setStatus({ kind: 'error', text: apiMessage(err) })
                }
              }}
            />
          </div>
          <Status value={status} />
          {preview ? (
            <div className="carto-share-preview">
              <SharedView doc={preview} preview />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function Versions({ api, state, justPublished, onChanged, onReplace }) {
  const uid = useId()
  return (
    <section className="carto-share-versions" aria-labelledby={`${uid}-t`}>
      <h3 id={`${uid}-t`} className="carto-share-h">
        Mes versions partagées
      </h3>
      {state.status === 'loading' ? <p className="carto-small carto-muted">Chargement…</p> : null}
      {state.status === 'error' ? <p className="carto-error carto-small">{state.error}</p> : null}
      {state.status === 'ready' && state.list.length === 0 ? <p className="carto-small carto-muted">Aucune version partagée sur le serveur.</p> : null}
      <ul className="carto-share-version-list">
        {state.list.map((v) => (
          <VersionItem key={v.id} version={v} api={api} autoOpen={v.id === justPublished} onRemoved={() => onChanged(v.id)} onReplace={onReplace} />
        ))}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------------------

/**
 * @param {{dataset: object, refl: object, state: object, data: object, t: string | null,
 *   api: ReturnType<import('./shareApi.js').createShareApi>, config: {serverEnabled: boolean, adultOnly: boolean}}} props
 */
export function SharePanel({ refl, state, data, t, api, config }) {
  const uid = useId()
  const [adult, setAdult] = useState({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const [gateError, setGateError] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const [justPublished, setJustPublished] = useState(null)
  const [notice, setNotice] = useState(null)
  const [versions, setVersions] = useState({ status: 'loading', list: [] })
  const [chosenTarget, setChosenTarget] = useState(null)
  const [seed, setSeed] = useState(null)
  const composerHeading = useRef(null)
  const datasetId = data.dataset?.datasetId ?? ''
  // Par défaut, une nouvelle version remplace la plus récente (même lien).
  const target = chosenTarget !== null && (chosenTarget === 'new' || versions.list.some((v) => v.id === chosenTarget)) ? chosenTarget : versions.list[0]?.id ?? 'new'

  useEffect(() => {
    let alive = true
    api
      .getAdult()
      .then((a) => alive && setAdult({ status: 'ready', ...a }))
      .catch((err) => {
        if (!alive) return
        if (err?.unavailable) setAdult({ status: 'unavailable' })
        else if (err instanceof ApiError && err.status === 401) setAdult({ status: 'login' })
        else if (err instanceof ApiError && err.status === 403) setAdult({ status: 'forbidden' })
        else setAdult({ status: 'error', error: apiMessage(err) })
      })
    return () => {
      alive = false
    }
  }, [api])

  const adultReady = adult.status === 'ready' && (adult.adult || !attestationRequired(config, adult))
  useEffect(() => {
    if (!adultReady) return undefined
    let alive = true
    api
      .listVersions()
      .then((list) => alive && setVersions({ status: 'ready', list }))
      .catch((err) => alive && setVersions({ status: 'error', list: [], error: apiMessage(err) }))
    return () => {
      alive = false
    }
  }, [api, refresh, adultReady])

  async function replaceFrom(version) {
    let settings = loadDraft(`${datasetId}:${version.id}`)
    if (!settings) {
      try {
        settings = settingsFromDocument((await api.getVersion(version.id)).document)
      } catch {
        settings = null
      }
    }
    setChosenTarget(version.id)
    setSeed({ id: `${version.id}-${Date.now()}`, settings })
    setNotice({
      kind: 'ok',
      text: settings?.fromDocument
        ? `Composition de « ${version.titre} » reprise (titre, dates, compétences ; les extraits sont à choisir de nouveau) : modifiez-la, puis publiez à sa place.`
        : `Composition de « ${version.titre} » reprise : modifiez-la, puis publiez à sa place.`,
    })
    requestAnimationFrame(() => composerHeading.current?.focus())
  }

  async function attest(on) {
    setBusy(true)
    setGateError(null)
    setNotice(null)
    try {
      const a = await api.setAdult(on)
      setAdult({ status: 'ready', ...a })
      if (!on) {
        for (const v of versions.list) dropDraft(`${datasetId}:${v.id}`)
        const n = Number(a?.deletedVersions ?? 0)
        setNotice({
          kind: 'ok',
          text:
            n > 0
              ? `Attestation retirée : ${n} version${n > 1 ? 's' : ''} partagée${n > 1 ? 's' : ''} et ${n > 1 ? 'leurs' : 'ses'} liens ont été effacés du serveur.`
              : 'Attestation retirée : aucune version partagée ne reste sur le serveur.',
        })
      }
    } catch (err) {
      setGateError(apiMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function downloadAll() {
    setNotice(null)
    try {
      const versions = await api.listVersions()
      downloadBlob(await exportVersions(api, versions), 'versions-partagees.json')
      setNotice({ kind: 'ok', text: `Export JSON téléchargé (${versions.length} version${versions.length > 1 ? 's' : ''}).` })
    } catch (err) {
      setNotice({ kind: 'error', text: apiMessage(err) })
    }
  }

  let body
  if (adult.status === 'loading') body = <p className="carto-small carto-muted">Vérification de votre compte…</p>
  else if (adult.status === 'unavailable') body = <p className="carto-note carto-small">Le partage demande le site en ligne : il n’est pas disponible sur cette copie.</p>
  else if (adult.status === 'login')
    body = (
      <p className="carto-note carto-small">
        Le partage par lien demande un compte. <a href="#/compte">Se connecter</a> — tout le reste fonctionne sans compte, dans ce navigateur.
      </p>
    )
  else if (adult.status === 'forbidden') body = <p className="carto-note carto-small">Le partage par lien est réservé aux comptes apprenants.</p>
  else if (adult.status === 'error') body = <p className="carto-error carto-small">{adult.error}</p>
  else if (attestationRequired(config, adult) && !adult.adult) body = <AdultGate busy={busy} onAttest={() => attest(true)} error={gateError} />
  else
    body = (
      <>
        <Composer
          refl={refl}
          state={state}
          data={data}
          t={t}
          api={api}
          versions={versions.list}
          target={target}
          onTarget={setChosenTarget}
          seed={seed}
          headingRef={composerHeading}
          onPublished={(id, title, replaced) => {
            setJustPublished(id)
            setRefresh((n) => n + 1)
            setNotice({
              kind: 'ok',
              text: replaced
                ? `« ${title} » remplace la version précédente : ses liens montrent désormais cette version.`
                : `« ${title} » est publiée. Créez maintenant un lien pour la montrer.`,
            })
          }}
        />
        <Versions
          api={api}
          state={versions}
          justPublished={justPublished}
          onReplace={replaceFrom}
          onChanged={(removedId) => {
            dropDraft(`${datasetId}:${removedId}`)
            setRefresh((n) => n + 1)
            setNotice({ kind: 'ok', text: 'Version retirée du serveur, avec ses liens.' })
          }}
        />
        <section className="carto-share-rights carto-small" aria-label="Vos droits">
          <h3 className="carto-share-h">Vos droits</h3>
          <p>
            Export complet en JSON et effacement immédiat de chaque version ; journal des accès de chaque lien. {HOSTING_TEXT} Les liens expirés ou révoqués
            sont effacés au plus tard 30 jours après. Supprimer votre compte efface aussi vos versions partagées et leurs liens.
          </p>
          <p>
            <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" onClick={downloadAll}>
              Télécharger toutes mes versions (JSON)
            </button>
          </p>
          {adult.adult ? (
            <p>
              Vous avez attesté avoir 18 ans ou plus le {formatShort(String(adult.attestedAt).slice(0, 10))}. Retirer cette attestation efface aussitôt vos
              versions partagées du serveur, et leurs liens : téléchargez-les d’abord si vous voulez les garder.{' '}
              <TwoStepButton label="Retirer mon attestation" confirmLabel="Confirmer : effacer mes versions partagées" className="carto-btn--small" onConfirm={() => attest(false)} />
            </p>
          ) : null}
        </section>
      </>
    )

  return (
    <section className="carto-export carto-share" aria-labelledby={`${uid}-title`}>
      <header className="carto-export-head">
        <h2 id={`${uid}-title`}>Partager par lien</h2>
        <p className="carto-small carto-muted">Réservé aux adultes. Rien ne quitte ce navigateur tant que vous ne publiez pas une version partagée.</p>
      </header>
      <Status value={notice} />
      {body}
    </section>
  )
}
