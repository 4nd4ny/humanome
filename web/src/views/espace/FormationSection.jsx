// Formation multi-parcours (P8.2 puis M7, cahier §4.6).
//
// #/<espace>/formation            -> liste des chapitres + progression
// #/<espace>/formation/<chapitre> -> chapitre rendu (md.js + DOMPurify) + case
//                                    « chapitre terminé »
// où <espace> dépend du parcours : espace (apprenant), cartographe,
// promptologue — FORMATION_BASE_HASH (formation-content.js).
//
// Progression : connectée -> PUT api/training/progress (avec `parcours`) ;
// anonyme -> localStorage 'humanome-training', migrée vers le serveur à la
// connexion (createTrainingStore.load).

import { useEffect, useMemo, useState } from 'react'
import { renderMarkdown } from '../../lib/md.js'
import { createTrainingStore } from '../../lib/training-store.js'
import {
  FORMATION_BASE_HASH,
  getChapter,
  listChapters,
  rewriteChapterLink,
} from './formation-content.js'

// Titre + chapeau de la page « liste des chapitres » de chaque parcours.
const PARCOURS_INTROS = {
  visiteur: {
    titre: 'Découvrir humanome.xyz',
    chapeau:
      'Aucun compte requis. Comprendre ce qu’est une cartographie de compétences humaines, ' +
      'explorer la démonstration sur données réelles, puis essayer l’outil sur votre propre texte.',
  },
  apprenant: {
    titre: 'Formation apprenant — mode expert',
    chapeau:
      'Comment bien rédiger son portfolio réflexif pour obtenir une bonne cartographie : ' +
      'le moteur ne voit que ce que vous avez écrit, et le protocole adversarial qui l’anime ' +
      'est volontairement exigeant.',
  },
  employeur: {
    titre: 'Lire une cartographie partagée',
    chapeau:
      'Un candidat vous a partagé sa cartographie. Comment l’ouvrir, la lire correctement, ' +
      'comprendre la garantie d’un cartographe — et les limites d’un tel document.',
  },
  cartographe: {
    titre: 'Formation cartographe',
    chapeau:
      'Le cartographe est le garde-fou humain : jamais de cartographie 100 % automatisée ' +
      'présentée comme validée. Rôle, méthode de relecture, micro-classes RESPIRE ' +
      '(5-6 élèves en cartographie mutuelle), annotation, correction et garantie.',
  },
  etablissement: {
    titre: 'Formation établissement',
    chapeau:
      'Cartographier ses classes en masse : cohortes rejointes par consentement explicite, ' +
      'configuration du budget LLM, lancement et suivi d’un run, lecture des résultats, RGPD.',
  },
  epistemiarque: {
    titre: 'Formation épistémiarque',
    chapeau:
      'La gouvernance collective du référentiel RESPIRE (61 compétences, 7 pôles) : proposer, ' +
      'débattre et versionner le socle qui fonde toutes les cartographies.',
  },
  promptologue: {
    titre: 'Formation promptologue',
    chapeau:
      'Concevoir, tester et versionner les prompts (et leur code) qui produisent les ' +
      'cartographies : prompt engineering appliqué, genèse du prompt de base, bancs d’essai.',
  },
  admin: {
    titre: 'Administrer la plateforme',
    chapeau:
      'Panorama de l’administration humanome.xyz et renvoi vers la documentation d’exploitation ' +
      '(rôles, Golden Prompt, réglages démo, déploiement, sauvegarde, RGPD).',
  },
}

/**
 * @param {object} props
 * @param {string | null} props.chapter slug du chapitre ouvert (null = liste)
 * @param {boolean} props.connected session authentifiée ?
 * @param {string} [props.parcours='apprenant']
 * @param {string} [props.baseHash] base de hash de route (défaut : espace de rôle) ;
 *   le hub public #/guides passe `#/guides/<parcours>`
 * @param {object} [props.trainingStore] store injectable (tests)
 */
export default function FormationSection({
  chapter,
  connected,
  parcours = 'apprenant',
  baseHash,
  trainingStore,
}) {
  const store = useMemo(
    () => trainingStore ?? createTrainingStore({ parcours }),
    [trainingStore, parcours],
  )
  const chapters = useMemo(() => listChapters(parcours), [parcours])
  const base = baseHash ?? FORMATION_BASE_HASH[parcours] ?? FORMATION_BASE_HASH.apprenant
  const intro = PARCOURS_INTROS[parcours] ?? PARCOURS_INTROS.apprenant
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

  const current = chapter ? getChapter(chapter, parcours) : null

  if (chapter && !current) {
    return (
      <section className="espace-formation" aria-label="Formation">
        <h2>{intro.titre}</h2>
        <p role="alert" className="load-error">
          Chapitre introuvable : « {chapter} ».
        </p>
        <p>
          <a href={base}>Retour à la liste des chapitres</a>
        </p>
      </section>
    )
  }

  if (current) {
    const index = chapters.findIndex((c) => c.slug === current.slug)
    const previous = index > 0 ? chapters[index - 1] : null
    const next = index < chapters.length - 1 ? chapters[index + 1] : null
    const html = renderMarkdown(current.raw, {
      rewriteLink: (href) => rewriteChapterLink(href, parcours, base),
    })
    const checkboxId = `formation-done-${current.slug}`
    return (
      <section className="espace-formation" aria-label="Formation">
        <p>
          <a href={base}>← Tous les chapitres</a>
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
          {previous ? <a href={`${base}/${previous.slug}`}>← {previous.titre}</a> : <span />}{' '}
          {next ? <a href={`${base}/${next.slug}`}>{next.titre} →</a> : null}
        </nav>
      </section>
    )
  }

  const doneCount = chapters.filter((c) => done.has(c.slug)).length
  const percent = chapters.length > 0 ? Math.round((doneCount / chapters.length) * 100) : 0

  return (
    <section className="espace-formation" aria-label="Formation">
      <h2>{intro.titre}</h2>
      <p>{intro.chapeau}</p>
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
              <a href={`${base}/${c.slug}`}>{c.titre}</a>
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
