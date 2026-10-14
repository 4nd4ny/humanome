// Interface ultime — espace Dialogue (spec §14, P7 ; prototype
// proto_chatbot_socratique) : un dialogue d'accompagnement SCRIPTÉ, tiré des
// traces de la personne (core/dialogue.js), et son carnet local.
//
// Sans modèle de langage par défaut : aucune requête réseau. En option, et
// seulement si l'application en fournit le moyen (`llm`, absent de la copie
// autonome), un modèle peut proposer une relance après une réponse : il faut
// le choisir, donner son accord explicite (jamais enregistré, décoché par
// défaut), puis le demander réponse par réponse. La requête n'emporte que la
// question, la réponse et le passage cité.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { formatShort } from '../core/dates.js'
import { hasPortfolio } from '../core/model.js'
import { addReflection, removeReflection } from '../core/ops.js'
import {
  CLOSING,
  NO_THREAD,
  OPENING,
  SOURCE_LABELS,
  buildRelaunchRequest,
  cleanRelaunch,
  dialogueThreads,
  quoteCandidates,
  reflectionDay,
  reflectionMarkdown,
} from '../core/dialogue.js'
import { downloadBlob } from '../../lib/download-json.js'
import { TwoStepButton } from './Manager.jsx'

const RELAUNCH_MAX_TOKENS = 300

function SourceChips({ sources, dates }) {
  return (
    <p className="carto-dialogue-sources">
      {sources.map((s) => (
        <span key={s} className="carto-chip">
          {SOURCE_LABELS[s] ?? s}
        </span>
      ))}
      {dates.length ? <span className="carto-small carto-muted">{[...new Set(dates)].map(formatShort).join(' → ')}</span> : null}
    </p>
  )
}

/** Option : relances par un modèle de langage, sur accord explicite. */
function RelaunchSettings({ llm, value, onChange }) {
  const uid = useId()
  const provider = llm.providers.find((p) => p.id === value.provider) ?? llm.providers[0]
  const storedKey = provider.requiresKey ? llm.getLocalKey(provider.id) : ''
  const usable = !provider.requiresKey || Boolean(value.key || storedKey)
  const where = provider.id === 'ollama' ? `${provider.label}, sur votre ordinateur` : provider.label
  return (
    <details className="carto-dialogue-llm">
      <summary>Relances par un modèle de langage (facultatif)</summary>
      <p className="carto-small">
        Par défaut, aucun modèle de langage n’intervient et rien ne quitte ce navigateur. Si vous le souhaitez, un modèle peut proposer une question de
        relance après une de vos réponses, quand vous le demandez.
      </p>
      <label className="carto-small">
        Modèle de langage{' '}
        <select
          value={provider.id}
          onChange={(e) => {
            const next = llm.providers.find((p) => p.id === e.target.value)
            onChange({ provider: next.id, model: next.defaultModel, key: '', consent: false })
          }}
        >
          {llm.providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="carto-small">
        Version <input type="text" value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value, consent: false })} />
      </label>
      {provider.requiresKey ? (
        <label className="carto-small">
          Clé d’API {storedKey ? '(celle enregistrée dans ce navigateur est utilisée si vous laissez vide)' : '(gardée pour cette page seulement)'}{' '}
          <input type="password" autoComplete="off" value={value.key} onChange={(e) => onChange({ ...value, key: e.target.value, consent: false })} />
        </label>
      ) : (
        <p className="carto-hint">Ollama doit tourner sur cet ordinateur et accepter ce site (variable OLLAMA_ORIGINS).</p>
      )}
      <label className="carto-small carto-dialogue-consent">
        <input id={`${uid}-consent`} type="checkbox" checked={value.consent} disabled={!usable} onChange={(e) => onChange({ ...value, consent: e.target.checked })} /> J’accepte que,
        pour chaque relance que je demande, la question, ma réponse et le passage cité soient envoyés à {where}. Rien d’autre ne part : ni mon journal, ni ma
        cartographie.
      </label>
      <p className="carto-hint">Cet accord vaut pour cette page ; il n’est pas enregistré.</p>
    </details>
  )
}

function Carnet({ reflections, readOnly, onRemove }) {
  const [open, setOpen] = useState(null)
  const [copied, setCopied] = useState(null)
  if (reflections.length === 0) return <p className="carto-small carto-muted">Votre carnet est vide.</p>
  return (
    <ul className="carto-dialogue-carnet">
      {[...reflections].reverse().map((r) => {
        const md = reflectionMarkdown({ ...r, entries: Array.isArray(r.entries) ? r.entries.filter((e) => e && typeof e.question === 'string') : [] })
        const entries = Array.isArray(r.entries) ? r.entries.filter((e) => e && typeof e.question === 'string') : []
        const answered = entries.filter((e) => e.answer).length
        return (
          <li key={r.id}>
            <button type="button" className="carto-link-btn" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
              Dialogue du {reflectionDay(r.at)}
            </button>{' '}
            <span className="carto-small carto-muted">
              {answered} réponse{answered > 1 ? 's' : ''}
            </span>
            {open === r.id ? (
              <div className="carto-dialogue-entry">
                {entries.map((e, i) => (
                  <div key={i}>
                    <p className="carto-small">
                      <strong>{e.question}</strong>
                    </p>
                    {e.quote ? <blockquote className="carto-verbatim">{e.quote}</blockquote> : null}
                    <p className="carto-small">{e.answer || <span className="carto-muted">(sans réponse)</span>}</p>
                    {e.relaunch ? (
                      <p className="carto-small carto-muted">
                        Relance ({e.relaunch.model}) : {e.relaunch.text}
                      </p>
                    ) : null}
                  </div>
                ))}
                <div className="carto-share-actions">
                  <button
                    type="button"
                    className="carto-btn carto-btn--quiet carto-btn--small"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(md)
                        setCopied(r.id)
                      } catch {
                        setCopied(null)
                      }
                    }}
                  >
                    {copied === r.id ? 'Copié' : 'Copier (Markdown)'}
                  </button>
                  <button
                    type="button"
                    className="carto-btn carto-btn--quiet carto-btn--small"
                    onClick={() => downloadBlob(new Blob([md], { type: 'text/markdown' }), `dialogue-${String(r.at).slice(0, 10)}.md`)}
                  >
                    Télécharger (.md)
                  </button>
                  {readOnly ? null : <TwoStepButton label="Retirer du carnet" confirmLabel="Confirmer le retrait" className="carto-btn--small" onConfirm={() => onRemove(r.id)} />}
                </div>
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * @param {{dataset: object, refl: object, state: object, data: object, params: object, readOnly?: boolean,
 *   llm?: {providers: Array<{id: string, label: string, defaultModel: string, requiresKey: boolean}>,
 *     getLocalKey: (provider: string) => string, createProvider: (config: object) => {complete: Function}} | null,
 *   onOpenDay: (date: string, code?: string) => void,
 *   onOpenPassage: (target: {date: string, extract: string, label: string}) => void}} props
 */
export function DialoguePanel({ dataset, refl, state, data, params, readOnly = false, llm = null, onOpenDay, onOpenPassage }) {
  const uid = useId()
  const { ensureDetails, getDetail } = data

  // Détails utiles : journées des citations candidates et textes du journal (rupture).
  const needed = useMemo(() => {
    const quotes = quoteCandidates(state).slice(0, 12).map((c) => c.date)
    const written = dataset.days.filter(hasPortfolio).map((d) => d.date)
    return [...new Set([...quotes, ...written])].sort()
  }, [state, dataset])
  useEffect(() => {
    if (needed.length) ensureDetails(needed)
  }, [needed, ensureDetails])
  const ready = needed.every((d) => getDetail(d) !== undefined)

  // Le script est figé au début d'un dialogue (il ne change pas sous les doigts).
  const [script, setScript] = useState(null)
  useEffect(() => {
    if (ready && script === null) setScript(dialogueThreads(dataset, state, refl, { getDetail, params }))
  }, [ready, script, dataset, state, refl, getDetail, params])

  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({}) // threadId -> {answer, skipped, relaunch}
  const [draft, setDraft] = useState('')
  const [finished, setFinished] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState(null)
  const [relaunching, setRelaunching] = useState(null)
  // Par défaut, le modèle local (Ollama) : la relance ne quitte alors pas l'ordinateur.
  const [llmSettings, setLlmSettings] = useState(() => {
    const first = llm?.providers?.find((p) => p.id === 'ollama') ?? llm?.providers?.[0]
    return { provider: first?.id ?? '', model: first?.defaultModel ?? '', key: '', consent: false }
  })
  const inputRef = useRef(null)
  // Génération du dialogue : une relance qui revient après « Recommencer »
  // appartient à l'ancien dialogue et n'est jamais rattachée au nouveau.
  const generation = useRef(0)

  const threads = script ?? []
  const current = !finished && index < threads.length ? threads[index] : null

  function next(record) {
    setAnswers((a) => ({ ...a, [current.id]: { ...(a[current.id] ?? {}), ...record } }))
    setDraft('')
    if (index + 1 >= threads.length) setFinished(true)
    setIndex((i) => i + 1)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function restart() {
    generation.current += 1
    setRelaunching(null)
    setScript(dialogueThreads(dataset, state, refl, { getDetail, params }))
    setIndex(0)
    setAnswers({})
    setDraft('')
    setFinished(false)
    setSaved(false)
    setStatus(null)
  }

  function keep() {
    const entries = threads
      .filter((t) => answers[t.id])
      .map((t) => ({
        threadId: t.id,
        kind: t.kind,
        question: t.text,
        quote: t.quote?.text ?? null,
        answer: answers[t.id].skipped ? '' : answers[t.id].answer ?? '',
        refs: t.refs,
        relaunch: answers[t.id].relaunch ?? null,
      }))
    if (!entries.some((e) => e.answer)) {
      setStatus({ kind: 'error', text: 'Aucune réponse à garder.' })
      return
    }
    data.update((ds) => addReflection(ds, { entries }))
    setSaved(true)
    setStatus({ kind: 'ok', text: 'Gardé dans votre carnet, dans ce navigateur.' })
  }

  const llmProvider = llm?.providers.find((p) => p.id === llmSettings.provider) ?? null
  const canRelaunch = Boolean(llm && llmProvider && llmSettings.consent && llmSettings.model.trim())

  async function relaunch(thread) {
    if (!canRelaunch) return
    const answer = answers[thread.id]?.answer ?? ''
    const gen = generation.current
    setRelaunching(thread.id)
    setStatus(null)
    try {
      const apiKey = llmProvider.requiresKey ? llmSettings.key || llm.getLocalKey(llmProvider.id) : undefined
      const provider = llm.createProvider({ provider: llmProvider.id, transport: 'direct', apiKey })
      const request = buildRelaunchRequest({ question: thread.text, answer, quote: thread.quote?.text ?? null })
      const result = await provider.complete({ model: llmSettings.model.trim(), ...request, maxTokens: RELAUNCH_MAX_TOKENS })
      if (gen !== generation.current) return
      const text = cleanRelaunch(result?.text)
      if (!text) throw new Error('le modèle n’a rien répondu')
      setAnswers((a) => ({ ...a, [thread.id]: { ...a[thread.id], relaunch: { text, model: `${llmProvider.label} — ${result?.model ?? llmSettings.model}` } } }))
    } catch (err) {
      if (gen !== generation.current) return
      // Appel qui n'aboutit pas : bloqué par le navigateur (politique de
      // sécurité du site, qui l'arrête AVANT tout envoi) ou fournisseur
      // injoignable. Une coupure en cours de route ne se distingue pas d'un
      // blocage : le message ne promet donc rien de plus que l'absence de
      // relance.
      const blocked = err instanceof TypeError || /fetch|network|réseau/i.test(String(err?.message ?? ''))
      setStatus({
        kind: 'error',
        text: blocked
          ? `Relance impossible : ${llmProvider.label} n’a pas pu être joint depuis cette page (fournisseur injoignable, ou appel bloqué par la politique de sécurité du site). Aucune relance n’a été reçue.`
          : `Relance impossible : ${err?.message ?? 'erreur inconnue'}.`,
      })
    } finally {
      if (gen === generation.current) setRelaunching(null)
    }
  }

  const reflections = dataset.reflections ?? []

  return (
    <section className="carto-dialogue" aria-labelledby={`${uid}-title`}>
      <header className="carto-export-head">
        <h2 id={`${uid}-title`}>Dialogue d’accompagnement</h2>
        <p className="carto-small carto-muted">Des questions tirées de vos traces, pour relire votre parcours. Sans modèle de langage : rien ne quitte ce navigateur.</p>
      </header>
      <div className="carto-dialogue-grid">
        <section className="carto-dialogue-chat" aria-label="Dialogue">
          {script === null ? (
            <p role="status" className="carto-small carto-muted">
              Lecture de vos traces…
            </p>
          ) : (
            <>
              <div role="log" aria-live="polite" aria-label="Échanges">
              <ol className="carto-dialogue-log">
                <li className="carto-dialogue-msg is-bot">
                  <p>{threads.length ? OPENING : NO_THREAD}</p>
                </li>
                {threads.slice(0, Math.min(index + 1, threads.length)).map((t) => {
                  const a = answers[t.id]
                  return (
                    <li key={t.id} className="carto-dialogue-turn">
                      <div className="carto-dialogue-msg is-bot">
                        <p>{t.text}</p>
                        {t.quote ? (
                          <>
                            <blockquote className="carto-verbatim">«{'\u00a0'}{t.quote.text}{'\u00a0'}»</blockquote>
                            <p className="carto-share-actions">
                              <button
                                type="button"
                                className="carto-btn carto-btn--quiet carto-btn--small"
                                onClick={() => onOpenPassage({ date: t.quote.date, extract: t.quote.raw || t.quote.text, label: `Passage du ${formatShort(t.quote.date)}` })}
                              >
                                Lire dans le journal
                              </button>
                              <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" onClick={() => onOpenDay(t.quote.date, t.quote.code)}>
                                Ouvrir la journée
                              </button>
                            </p>
                          </>
                        ) : null}
                        <SourceChips sources={t.sources} dates={t.refs.dates} />
                      </div>
                      {a ? (
                        <div className={`carto-dialogue-msg is-me${a.skipped ? ' is-skipped' : ''}`}>
                          <p>{a.skipped ? 'Question passée.' : a.answer}</p>
                          {!a.skipped && canRelaunch && !a.relaunch ? (
                            <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" disabled={relaunching !== null} onClick={() => relaunch(t)}>
                              {relaunching === t.id ? 'Relance en cours…' : `Demander une relance à ${llmProvider.label}`}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      {a?.relaunch ? (
                        <div className="carto-dialogue-msg is-bot is-ai">
                          <p className="carto-small carto-muted">Relance proposée par un modèle de langage ({a.relaunch.model}) :</p>
                          <p>{a.relaunch.text}</p>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
                {finished && threads.length ? (
                  <li className="carto-dialogue-msg is-bot">
                    <p>{readOnly ? 'C’est tout pour cette fois. Dans une copie autonome, le carnet n’est pas enregistré.' : CLOSING}</p>
                  </li>
                ) : null}
              </ol>
              </div>
              {current ? (
                <form
                  className="carto-dialogue-answer"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (draft.trim()) next({ answer: draft.trim(), skipped: false })
                  }}
                >
                  <label htmlFor={`${uid}-answer`} className="carto-small">
                    Votre réponse
                  </label>
                  <textarea
                    id={`${uid}-answer`}
                    ref={inputRef}
                    rows={3}
                    maxLength={4000}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault()
                        if (draft.trim()) next({ answer: draft.trim(), skipped: false })
                      }
                    }}
                  />
                  <div className="carto-share-actions">
                    <button type="submit" className="carto-btn" disabled={!draft.trim()}>
                      Répondre
                    </button>
                    <button type="button" className="carto-btn carto-btn--quiet" onClick={() => next({ answer: '', skipped: true })}>
                      Passer cette question
                    </button>
                    <button type="button" className="carto-btn carto-btn--quiet" onClick={() => setFinished(true)}>
                      M’arrêter là
                    </button>
                  </div>
                  <p className="carto-hint">Ctrl + Entrée pour répondre.</p>
                </form>
              ) : threads.length ? (
                <div className="carto-share-actions">
                  {readOnly || saved ? null : (
                    <button type="button" className="carto-btn" onClick={keep}>
                      Garder dans mon carnet
                    </button>
                  )}
                  <button type="button" className="carto-btn carto-btn--quiet" onClick={restart}>
                    Recommencer
                  </button>
                </div>
              ) : null}
              {status ? (
                <p role={status.kind === 'error' ? 'alert' : 'status'} className={status.kind === 'error' ? 'carto-error carto-small' : 'carto-small carto-export-done'}>
                  {status.text}
                </p>
              ) : null}
            </>
          )}
        </section>
        <aside className="carto-dialogue-side" aria-label="Carnet et options">
          <section aria-labelledby={`${uid}-carnet`}>
            <h3 id={`${uid}-carnet`} className="carto-share-h">
              Mon carnet
            </h3>
            <p className="carto-small carto-muted">
              Vos réponses gardées, dans ce navigateur. Elles partent dans l’archive JSON si vous y incluez votre portfolio ; jamais dans une copie autonome, une
              version partagée ni une démo.
            </p>
            <Carnet reflections={reflections} readOnly={readOnly} onRemove={(id) => data.update((ds) => removeReflection(ds, id))} />
          </section>
          {llm && !readOnly ? <RelaunchSettings llm={llm} value={llmSettings} onChange={setLlmSettings} /> : null}
        </aside>
      </div>
    </section>
  )
}
