// Interface ultime — « Préparer une démo » (spec §11.1) : anonymiser une
// copie du jeu, DANS CE NAVIGATEUR, avant de la déposer sur le serveur.
//
// Étapes : noms propres (propositions + dictionnaire), coordonnées (motifs),
// personnes tierces (phrases signalées, retrait au choix), puis aperçu :
// rapport des remplacements, vérification du surlignage trace par trace (avec
// la recherche du lecteur, dans le texte affiché), mots à majuscule restants,
// relecture du texte. Les téléchargements n'ouvrent qu'après une relecture
// confirmée d'un aperçu à jour. La table de correspondance n'est jamais
// écrite dans l'export ; elle peut être enregistrée À PART, pour soi.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PATTERNS,
  REMOVED,
  anonymizeArchive,
  archiveTexts,
  cleanDictionary,
  patternCounts,
  remainingNames,
  suggestNames,
  thirdPartySentences,
} from '../core/anonymize.js'
import { archiveFileName, buildArchive } from '../core/archive.js'
import { injectArchive } from '../core/standalone.js'
import { canonicalJson } from '../core/model.js'
import { formatShort } from '../core/dates.js'
import { renderPortfolio } from './highlight-dom.js'
import { downloadBlob } from '../../lib/download-json.js'
import { loadViewerTemplate } from './viewerTemplate.js'
import { formatBytes } from './format.js'

const DICTIONARY_KIND = 'carto-anonymization-dictionary'
const SHOWN = 30
const REMAINING_SHOWN = 300

function letters(i) {
  let s = ''
  let n = i
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}
/** « Personne A », « Personne B »… « Personne AA ». */
export const pseudonymFor = (i) => `Personne ${letters(i)}`

function nextPseudonym(entries) {
  const used = new Set(entries.map((e) => e.to))
  let i = 0
  while (used.has(pseudonymFor(i))) i++
  return pseudonymFor(i)
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Texte avec les mots donnés mis en évidence (<mark>). */
function Marked({ text, words, className }) {
  const list = [...new Set(words.filter((w) => w && w.length > 0))].sort((a, b) => b.length - a.length)
  if (list.length === 0) return <span className={className}>{text}</span>
  const re = new RegExp(`(${list.map(escapeRe).join('|')})`, 'gu')
  const parts = text.split(re)
  return (
    <span className={className}>
      {parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : p))}
    </span>
  )
}

const removalKey = (r) => `${r.date}\u0000${r.sentence}`
/** Texte affiché d'une journée : le lecteur cherche les passages dans le Markdown rendu. */
const displayText = (portfolio) => renderPortfolio(portfolio).text

/**
 * @param {{dataset: object, data: object, fetchFn?: typeof fetch, onClose: () => void, onOpened?: () => void}} props
 */
export function DemoTool({ dataset, data, fetchFn, onClose, onOpened }) {
  const [archive, setArchive] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [entries, setEntries] = useState([])
  const [patterns, setPatterns] = useState({ emails: true, urls: true, phones: true, addresses: true })
  const [removed, setRemoved] = useState(() => new Set())
  const [pseudonym, setPseudonym] = useState('Démonstration')
  const [newFrom, setNewFrom] = useState('')
  const [newTo, setNewTo] = useState('')
  const [showAllThird, setShowAllThird] = useState(false)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [previewDate, setPreviewDate] = useState(null)
  const [message, setMessage] = useState(null)
  const fileRef = useRef(null)
  const headingRef = useRef(null)

  // Une copie complète du jeu (portfolio compris), lue une fois.
  const { flush, store } = data
  const datasetId = dataset.datasetId
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await flush()
        const exported = await store.exportAll(datasetId)
        if (!cancelled) setArchive(buildArchive(exported, { includePortfolio: true }))
      } catch (err) {
        if (!cancelled) setLoadError(err.message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [flush, store, datasetId])
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const texts = useMemo(() => (archive ? archiveTexts(archive) : []), [archive])
  const suggestions = useMemo(() => suggestNames(texts, { min: 2 }), [texts])
  const found = useMemo(() => patternCounts(texts), [texts])
  const names = useMemo(() => cleanDictionary(entries).map((e) => e.from), [entries])
  const third = useMemo(() => (archive ? thirdPartySentences(archive, names) : []), [archive, names])
  const removals = useMemo(() => third.filter((r) => removed.has(removalKey(r))), [third, removed])
  const settingsKey = canonicalJson({ entries: cleanDictionary(entries), patterns, removed: removals.map(removalKey).sort(), pseudonym: pseudonym.trim() })
  const fresh = Boolean(result && result.key === settingsKey)

  const has = (word) => entries.some((e) => e.from === word)
  const toggleSuggestion = (word) => setEntries((list) => (list.some((e) => e.from === word) ? list.filter((e) => e.from !== word) : [...list, { from: word, to: nextPseudonym(list) }]))
  const setReplacement = (from, to) => setEntries((list) => list.map((e) => (e.from === from ? { ...e, to } : e)))
  const removeEntry = (from) => setEntries((list) => list.filter((e) => e.from !== from))
  const addEntry = (from, to) => {
    const f = from.trim()
    if (f.length < 2) return
    setEntries((list) => (list.some((e) => e.from === f) ? list : [...list, { from: f, to: to.trim() || nextPseudonym(list) }]))
  }

  function prepare() {
    setBusy('Anonymisation et vérification du surlignage…')
    setMessage(null)
    // Laisser le message s'afficher avant le calcul (synchrone).
    setTimeout(() => {
      try {
        const r = anonymizeArchive(archive, { dictionary: entries, patterns, pseudonym, remove: removals, displayText })
        setResult({ ...r, key: settingsKey, dictionary: cleanDictionary(entries) })
        setConfirmed(false)
        const first = Object.entries(r.archive.details ?? {})
          .filter(([, d]) => typeof d?.portfolio?.text === 'string')
          .map(([d]) => d)
          .sort()[0]
        setPreviewDate((cur) => (cur && r.archive.details?.[cur]?.portfolio ? cur : first ?? null))
      } catch (err) {
        setMessage({ kind: 'error', text: `L’anonymisation a échoué : ${err.message}` })
      } finally {
        setBusy(null)
      }
    }, 0)
  }

  const now = () => new Date().toISOString()
  function downloadJson() {
    const text = JSON.stringify(result.archive)
    const name = archiveFileName('demo', now())
    downloadBlob(new Blob([text], { type: 'application/json' }), name)
    setMessage({ kind: 'ok', text: `${name} (${formatBytes(new Blob([text]).size)}) téléchargé.` })
  }
  async function downloadHtml() {
    setBusy('Préparation de la copie autonome…')
    try {
      const html = injectArchive(await loadViewerTemplate(fetchFn), result.archive)
      const name = archiveFileName('demo', now(), 'html')
      downloadBlob(new Blob([html], { type: 'text/html' }), name)
      setMessage({ kind: 'ok', text: `${name} (${formatBytes(new Blob([html]).size)}) téléchargé.` })
    } catch (err) {
      setMessage({ kind: 'error', text: `La copie autonome n’a pas pu être produite : ${err.message}` })
    } finally {
      setBusy(null)
    }
  }
  async function openHere() {
    setBusy('Ouverture de la démo…')
    try {
      await data.importInto([{ path: archiveFileName('demo', now()), text: JSON.stringify(result.archive) }], { newDataset: true })
      onOpened?.()
    } catch (err) {
      setMessage({ kind: 'error', text: `La démo n’a pas pu être ouverte : ${err.message}` })
    } finally {
      setBusy(null)
    }
  }

  function saveDictionary() {
    const doc = { kind: DICTIONARY_KIND, version: 1, savedAt: now(), entries: cleanDictionary(entries), patterns, pseudonym }
    downloadBlob(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), archiveFileName('dictionnaire', now()))
  }
  async function loadDictionary(file) {
    try {
      const doc = JSON.parse(await file.text())
      if (doc?.kind !== DICTIONARY_KIND || !Array.isArray(doc.entries)) throw new Error('ce fichier n’est pas un dictionnaire d’anonymisation')
      setEntries((list) => {
        const out = [...list]
        for (const e of cleanDictionary(doc.entries)) if (!out.some((x) => x.from === e.from)) out.push(e)
        return out
      })
      if (doc.patterns && typeof doc.patterns === 'object') setPatterns((p) => ({ ...p, ...Object.fromEntries(Object.keys(PATTERNS).filter((k) => k in doc.patterns).map((k) => [k, Boolean(doc.patterns[k])])) }))
      if (typeof doc.pseudonym === 'string' && doc.pseudonym.trim()) setPseudonym(doc.pseudonym)
      setMessage({ kind: 'ok', text: `Dictionnaire chargé : ${cleanDictionary(doc.entries).length} nom(s).` })
    } catch (err) {
      setMessage({ kind: 'error', text: `Dictionnaire illisible : ${err.message}` })
    }
  }

  const remaining = useMemo(() => (result ? remainingNames(result.archive, result.dictionary) : []), [result])
  const previewDates = useMemo(
    () =>
      result
        ? Object.entries(result.archive.details ?? {})
            .filter(([, d]) => typeof d?.portfolio?.text === 'string')
            .map(([d]) => d)
            .sort()
        : [],
    [result],
  )
  const markWords = useMemo(() => [...(result?.dictionary ?? []).map((e) => e.to), ...Object.values(PATTERNS).map((p) => p.placeholder), REMOVED], [result])

  if (loadError) {
    return (
      <section className="carto-demo" aria-labelledby="carto-demo-title">
        <h3 id="carto-demo-title" ref={headingRef} tabIndex={-1}>
          Préparer une démo anonymisée
        </h3>
        <p role="alert" className="carto-error">
          Le jeu n’a pas pu être lu : {loadError}
        </p>
      </section>
    )
  }

  const h = result?.report.highlight
  const substitutionBreaks = h ? h.broken.filter((b) => b.reason === 'substitution') : []
  const thirdShown = showAllThird ? third : third.slice(0, SHOWN)

  return (
    <section className="carto-demo" aria-labelledby="carto-demo-title" aria-busy={Boolean(busy) || !archive}>
      <header className="carto-demo-head">
        <h3 id="carto-demo-title" ref={headingRef} tabIndex={-1}>
          Préparer une démo anonymisée
        </h3>
        <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" onClick={onClose}>
          Fermer l’outil
        </button>
      </header>
      <p className="carto-small">
        Une copie de ce jeu, anonymisée ici, dans ce navigateur. Les mêmes remplacements s’appliquent au portfolio, aux extraits et à leurs ancres, aux textes du
        jury : les passages restent surlignés. Votre jeu n’est pas modifié, et la table des remplacements n’est jamais écrite dans la démo.
      </p>
      {!archive ? (
        <p role="status" className="carto-muted">
          Lecture du jeu…
        </p>
      ) : (
        <ol className="carto-demo-steps">
          <li>
            <h4>Noms propres</h4>
            <p className="carto-small carto-muted">
              Propositions : mots à majuscule rencontrés au moins deux fois ailleurs qu’en début de phrase. Cochez ceux à remplacer ; le remplacement se modifie dans le
              dictionnaire.
            </p>
            <div className="carto-demo-two">
              <fieldset className="carto-demo-box">
                <legend>Propositions ({suggestions.length})</legend>
                {suggestions.length === 0 ? (
                  <p className="carto-muted carto-small">Aucun mot à majuscule fréquent.</p>
                ) : (
                  <ul className="carto-demo-suggestions">
                    {suggestions.map((s) => (
                      <li key={s.word}>
                        <label>
                          <input type="checkbox" checked={has(s.word)} onChange={() => toggleSuggestion(s.word)} /> {s.word} <span className="carto-muted">({s.count})</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
              <div className="carto-demo-box">
                <table className="carto-demo-dict">
                  <caption>Dictionnaire ({cleanDictionary(entries).length})</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nom</th>
                      <th scope="col">Remplacé par</th>
                      <th scope="col">
                        <span className="carto-visually-hidden">Retirer</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.from}>
                        <th scope="row">{e.from}</th>
                        <td>
                          <input type="text" value={e.to} aria-label={`Remplacement de ${e.from}`} onChange={(ev) => setReplacement(e.from, ev.target.value)} />
                        </td>
                        <td>
                          <button type="button" className="carto-link-btn" onClick={() => removeEntry(e.from)} aria-label={`Retirer ${e.from} du dictionnaire`}>
                            retirer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <form
                  className="carto-demo-add"
                  onSubmit={(ev) => {
                    ev.preventDefault()
                    addEntry(newFrom, newTo)
                    setNewFrom('')
                    setNewTo('')
                  }}
                >
                  <label>
                    <span>Nom</span>
                    <input type="text" value={newFrom} onChange={(e) => setNewFrom(e.target.value)} />
                  </label>
                  <label>
                    <span>Remplacé par</span>
                    <input type="text" value={newTo} placeholder={nextPseudonym(entries)} onChange={(e) => setNewTo(e.target.value)} />
                  </label>
                  <button type="submit" className="carto-btn carto-btn--quiet carto-btn--small" disabled={newFrom.trim().length < 2}>
                    Ajouter au dictionnaire
                  </button>
                </form>
                <div className="carto-demo-dict-tools">
                  <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" onClick={saveDictionary} disabled={entries.length === 0}>
                    Enregistrer le dictionnaire
                  </button>
                  <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" onClick={() => fileRef.current?.click()}>
                    Charger un dictionnaire
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".json,application/json"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (f) loadDictionary(f)
                    }}
                  />
                  <p className="carto-small carto-muted">Le dictionnaire contient les vrais noms : gardez-le pour vous, ne le déposez jamais avec la démo.</p>
                </div>
              </div>
            </div>
          </li>

          <li>
            <h4>Coordonnées</h4>
            <fieldset className="carto-demo-patterns">
              <legend className="carto-visually-hidden">Coordonnées à remplacer</legend>
              {Object.entries(PATTERNS).map(([key, p]) => (
                <label key={key}>
                  <input type="checkbox" checked={Boolean(patterns[key])} onChange={(e) => setPatterns((cur) => ({ ...cur, [key]: e.target.checked }))} /> {p.label}{' '}
                  <span className="carto-muted">
                    ({found[key]} trouvé{found[key] > 1 ? 's' : ''}) → {p.placeholder}
                  </span>
                </label>
              ))}
            </fieldset>
          </li>

          <li>
            <h4>Personnes tierces</h4>
            {names.length === 0 ? (
              <p className="carto-small carto-muted">Les phrases qui citent un nom du dictionnaire apparaîtront ici, pour relecture.</p>
            ) : third.length === 0 ? (
              <p className="carto-small carto-muted">Aucune phrase du portfolio ne cite un nom du dictionnaire.</p>
            ) : (
              <>
                <p className="carto-small">
                  {third.length} phrase{third.length > 1 ? 's' : ''} du portfolio cite{third.length > 1 ? 'nt' : ''} une personne du dictionnaire. Relisez-les : un
                  passage intime sur quelqu’un d’autre peut être retiré de la démo (il devient « {REMOVED} » partout, extraits du jury compris).
                </p>
                <ul className="carto-demo-third">
                  {thirdShown.map((r) => {
                    const k = removalKey(r)
                    return (
                      <li key={k}>
                        <span className="carto-demo-date">{formatShort(r.date)}</span>
                        <Marked text={r.sentence} words={r.names} className="carto-demo-sentence" />
                        <label className="carto-small">
                          <input
                            type="checkbox"
                            checked={removed.has(k)}
                            onChange={(e) =>
                              setRemoved((cur) => {
                                const next = new Set(cur)
                                if (e.target.checked) next.add(k)
                                else next.delete(k)
                                return next
                              })
                            }
                          />{' '}
                          retirer ce passage
                        </label>
                      </li>
                    )
                  })}
                </ul>
                {third.length > SHOWN ? (
                  <button type="button" className="carto-link-btn" onClick={() => setShowAllThird(!showAllThird)}>
                    {showAllThird ? 'N’afficher que les premières' : `Afficher les ${third.length - SHOWN} autres`}
                  </button>
                ) : null}
              </>
            )}
          </li>

          <li>
            <h4>Aperçu</h4>
            <div className="carto-demo-row">
              <label className="carto-field">
                <span>Titre de la démo (pseudonyme)</span>
                <input type="text" value={pseudonym} onChange={(e) => setPseudonym(e.target.value)} />
              </label>
              <button type="button" className="carto-btn" onClick={prepare} disabled={Boolean(busy)}>
                {result && !fresh ? 'Mettre à jour l’aperçu' : 'Préparer l’aperçu'}
              </button>
            </div>
            {busy ? (
              <p role="status" className="carto-muted">
                {busy}
              </p>
            ) : null}
            {result && !fresh && !busy ? (
              <p role="status" className="carto-note">
                Les réglages ont changé depuis l’aperçu : mettez-le à jour avant de télécharger.
              </p>
            ) : null}
          </li>

          {result ? (
            <li>
              <h4>Revue avant export</h4>
              <div className="carto-demo-report" role="status">
                <p className={substitutionBreaks.length > 0 ? 'carto-note carto-note--warn' : 'carto-note'}>
                  Surlignage : {h.before} passage{h.before > 1 ? 's' : ''} retrouvé{h.before > 1 ? 's' : ''} avant l’anonymisation, {h.after} après ; {h.kept} au même
                  endroit, avec le même statut.
                  {h.broken.length === 0 ? ' Tous les surlignages tiennent.' : ` ${h.broken.length} surlignage${h.broken.length > 1 ? 's' : ''} perdu${h.broken.length > 1 ? 's' : ''}.`}
                  {h.aligned > 0
                    ? ` ${h.aligned} extrait${h.aligned > 1 ? 's' : ''} coupé${h.aligned > 1 ? 's' : ''} au milieu d’un mot ${h.aligned > 1 ? 'ont' : 'a'} été complété${h.aligned > 1 ? 's' : ''} par le mot entier, pour que les remplacements s’y appliquent.`
                    : ''}
                </p>
                {h.broken.length > 0 ? (
                  <ul className="carto-demo-broken">
                    {h.broken.map((b) => (
                      <li key={b.id}>
                        {formatShort(b.date)} · {b.code} : {b.reason === 'retrait' ? 'passage retiré à votre demande' : 'le remplacement a cassé le passage — vérifiez ce nom'}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="carto-demo-two">
                <div>
                  <table className="carto-mini-table">
                    <caption>Remplacements</caption>
                    <tbody>
                      {result.report.replacements.length === 0 ? (
                        <tr>
                          <td>Aucun remplacement.</td>
                        </tr>
                      ) : (
                        result.report.replacements.map((r) => (
                          <tr key={r.label}>
                            <th scope="row">{r.label}</th>
                            <td className="carto-num">{r.count}</td>
                          </tr>
                        ))
                      )}
                      <tr>
                        <th scope="row">passages retirés</th>
                        <td className="carto-num">{result.report.removed}</td>
                      </tr>
                      {result.report.reflectionsRemoved ? (
                        <tr>
                          <th scope="row">dialogues du carnet retirés</th>
                          <td className="carto-num">{result.report.reflectionsRemoved}</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div>
                  <p className="carto-small">
                    <strong>Mots à majuscule restants ({remaining.length})</strong> (portfolio, jury, noms de fichiers), les plus fréquents d’abord : vérifiez
                    qu’aucun ne désigne une personne.
                  </p>
                  {remaining.length === 0 ? (
                    <p className="carto-small carto-muted">Aucun.</p>
                  ) : (
                    <ul className="carto-demo-remaining" tabIndex={0} aria-label="Mots à majuscule restants">
                      {remaining.slice(0, REMAINING_SHOWN).map((w) => (
                        <li key={w.word}>
                          {w.word} <span className="carto-muted">({w.count})</span>{' '}
                          <button type="button" className="carto-link-btn" onClick={() => addEntry(w.word, '')} aria-label={`Ajouter ${w.word} au dictionnaire`}>
                            ajouter
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              {previewDates.length > 0 ? (
                <div className="carto-demo-preview">
                  <label className="carto-field carto-field--inline">
                    <span>Relire la journée</span>
                    <select value={previewDate ?? ''} onChange={(e) => setPreviewDate(e.target.value)}>
                      {previewDates.map((d) => (
                        <option key={d} value={d}>
                          {formatShort(d)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {previewDate && result.archive.details?.[previewDate]?.portfolio ? (
                    <div className="carto-demo-text" tabIndex={0} aria-label={`Texte anonymisé du ${formatShort(previewDate)}`}>
                      <Marked text={result.archive.details[previewDate].portfolio.text} words={markWords} />
                    </div>
                  ) : null}
                </div>
              ) : null}
              <label className="carto-demo-confirm">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={!fresh} /> J’ai relu l’aperçu : il ne permet
                d’identifier personne.
              </label>
              <div className="carto-demo-actions">
                <button type="button" className="carto-btn" onClick={downloadJson} disabled={!fresh || !confirmed || Boolean(busy)}>
                  Télécharger la démo (.json)
                </button>
                <button type="button" className="carto-btn carto-btn--quiet" onClick={downloadHtml} disabled={!fresh || !confirmed || Boolean(busy)}>
                  Télécharger sa copie autonome (.html)
                </button>
                <button type="button" className="carto-btn carto-btn--quiet" onClick={openHere} disabled={!fresh || !confirmed || Boolean(busy)}>
                  Ouvrir la démo dans ce navigateur
                </button>
              </div>
              <p className="carto-small carto-muted">
                Pour la démonstration du site, le fichier .json se dépose sous le nom <code>data/demo/carto/archive.json</code> : le bouton « Explorer la démonstration »
                l’ouvre alors à la place des journées publiques.
              </p>
            </li>
          ) : null}
        </ol>
      )}
      {message ? (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'carto-error' : 'carto-note'}>
          {message.text}
        </p>
      ) : null}
    </section>
  )
}
