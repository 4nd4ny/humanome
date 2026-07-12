// Formation apprenant « mode expert » (P8.2, cahier §4.6).
//
// #/espace/formation            -> liste des chapitres + progression
// #/espace/formation/<chapitre> -> chapitre rendu (md.js + DOMPurify) + case
//                                  « chapitre terminé »
//
// Progression : connectée -> PUT api/training/progress ; anonyme ->
// localStorage 'humanome-training', migré vers le serveur à la connexion
// (createTrainingStore.load).

import { useEffect, useMemo, useState } from 'react'
import { renderMarkdown } from '../../lib/md.js'
import { createTrainingStore } from '../../lib/training-store.js'
import { getChapter, listChapters, rewriteChapterLink } from './formation-content.js'

/**
 * @param {object} props
 * @param {string | null} props.chapter slug du chapitre ouvert (null = liste)
 * @param {boolean} props.connected session authentifiée ?
 * @param {object} [props.trainingStore] store injectable (tests)
 */
export default function FormationSection({ chapter, connected, trainingStore }) {
  const store = useMemo(() => trainingStore ?? createTrainingStore(), [trainingStore])
  const chapters = useMemo(() => listChapters(), [])
  const [done, setDone] = useState(() => new Set())
  const [source, setSource] = useState(null) // 'serveur' | 'local' | null
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    store
      .load({ connected })
      .then(({ chapitres, source: from }) => {
        if (!alive) return
        setDone(new Set(chapitres))
        setSource(from)
      })
      .catch(() => alive && setSource('local'))
    return () => {
      alive = false
    }
  }, [store, connected])

  async function toggle(slug, completed) {
    setError(null)
    const previous = done
    const next = new Set(previous)
    if (completed) next.add(slug)
    else next.delete(slug)
    setDone(next) // optimiste : l'écriture suit
    try {
      await store.setChapter(slug, completed, { connected })
    } catch (err) {
      setDone(previous)
      setError(err?.message ?? 'La progression n’a pas pu être enregistrée. Réessayez.')
    }
  }

  const current = chapter ? getChapter(chapter) : null

  if (chapter && !current) {
    return (
      <section className="espace-formation" aria-label="Formation">
        <h2>Formation apprenant</h2>
        <p role="alert" className="load-error">
          Chapitre introuvable : « {chapter} ».
        </p>
        <p>
          <a href="#/espace/formation">Retour à la liste des chapitres</a>
        </p>
      </section>
    )
  }

  if (current) {
    const index = chapters.findIndex((c) => c.slug === current.slug)
    const previous = index > 0 ? chapters[index - 1] : null
    const next = index < chapters.length - 1 ? chapters[index + 1] : null
    const html = renderMarkdown(current.raw, { rewriteLink: rewriteChapterLink })
    const checkboxId = `formation-done-${current.slug}`
    return (
      <section className="espace-formation" aria-label="Formation">
        <p>
          <a href="#/espace/formation">← Tous les chapitres</a>
        </p>
        {/* Markdown embarqué au build, rendu par md.js puis DOMPurify (ADR-007). */}
        <article
          className="formation-chapitre"
          data-testid="formation-chapitre"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {error ? (
          <p role="alert" className="load-error">
            {error}
          </p>
        ) : null}
        <p className="formation-done">
          <label htmlFor={checkboxId}>
            <input
              id={checkboxId}
              type="checkbox"
              checked={done.has(current.slug)}
              onChange={(event) => toggle(current.slug, event.target.checked)}
            />{' '}
            Chapitre terminé
          </label>
        </p>
        {!connected ? (
          <p className="privacy-note">
            Progression enregistrée dans ce navigateur uniquement.{' '}
            <a href="#/compte">Connectez-vous</a> pour la rattacher à votre compte (elle sera
            migrée automatiquement).
          </p>
        ) : null}
        <nav className="formation-nav" aria-label="Navigation entre chapitres">
          {previous ? (
            <a href={`#/espace/formation/${previous.slug}`}>← {previous.titre}</a>
          ) : (
            <span />
          )}{' '}
          {next ? <a href={`#/espace/formation/${next.slug}`}>{next.titre} →</a> : null}
        </nav>
      </section>
    )
  }

  const doneCount = chapters.filter((c) => done.has(c.slug)).length
  const percent = chapters.length > 0 ? Math.round((doneCount / chapters.length) * 100) : 0

  return (
    <section className="espace-formation" aria-label="Formation">
      <h2>Formation apprenant — mode expert</h2>
      <p>
        Comment bien rédiger son portfolio réflexif pour obtenir une bonne cartographie :
        le moteur ne voit que ce que vous avez écrit, et le protocole adversarial qui l’anime
        est volontairement exigeant.
      </p>
      <p data-testid="formation-progress" role="status">
        Progression : {doneCount} / {chapters.length} chapitres terminés ({percent} %)
        {source === 'serveur' ? ' — synchronisée avec votre compte' : ''}
      </p>
      {error ? (
        <p role="alert" className="load-error">
          {error}
        </p>
      ) : null}
      <ol className="formation-chapitres">
        {chapters.map((c) => {
          const checkboxId = `formation-list-${c.slug}`
          return (
            <li key={c.slug}>
              <input
                id={checkboxId}
                type="checkbox"
                aria-label={`Chapitre terminé : ${c.titre}`}
                checked={done.has(c.slug)}
                onChange={(event) => toggle(c.slug, event.target.checked)}
              />{' '}
              <a href={`#/espace/formation/${c.slug}`}>{c.titre}</a>
            </li>
          )
        })}
      </ol>
      {!connected ? (
        <p className="privacy-note">
          Sans compte, la progression reste dans ce navigateur (localStorage). À la connexion,
          elle est migrée automatiquement vers votre compte.
        </p>
      ) : null}
    </section>
  )
}
