// Atelier promptologue (P10, cahier §3.4) — #/promptologue[/<section>].
//
// Garde de RÔLE : l'atelier exige une session authentifiée portant le rôle
// « promptologue » (matrice docs/autorisations.md — l'API refuse de toute
// façon, la garde front évite les allers-retours et explique). Le routing est
// pré-câblé (router.js) : cette vue DISPATCHE la section.
//
// Sections : accueil (paquets publiés + mes brouillons), editeur/<draftId>,
// banc-essai (P10.4), retro (P10.6), formation (parcours promptologue —
// FormationSection du chantier C, API annoncée : prop `parcours`).

import { useEffect, useMemo, useState } from 'react'
import { ApiUnavailableError, fetchMe } from '../api/client.js'
import FormationSection from './espace/FormationSection.jsx'
import { createPromptologueApi } from './promptologue/api.js'
import AccueilSection from './promptologue/AccueilSection.jsx'
import EditeurSection from './promptologue/EditeurSection.jsx'
import BancEssaiSection from './promptologue/BancEssaiSection.jsx'
import RetroSection from './promptologue/RetroSection.jsx'

/**
 * @param {object} props
 * @param {string | null} props.section segment après #/promptologue :
 *   null | 'editeur/<draftId>' | 'banc-essai' | 'retro' | 'formation[/<chapitre>]'
 * @param {object} [props.lib] lib sunburst (App) — réservé aux évolutions
 * @param {object} [props.deps] coutures de test : {fetchMeFn, api,
 *   formationSection, benchDeps, retroDeps, trainingStore}
 */
export default function PromptologueView({ section, deps = {} }) {
  const fetchMeFn = deps.fetchMeFn ?? fetchMe
  const api = useMemo(() => deps.api ?? createPromptologueApi(), [deps.api])
  const Formation = deps.formationSection ?? FormationSection
  const [session, setSession] = useState({ status: 'loading', user: null })

  useEffect(() => {
    let alive = true
    fetchMeFn()
      .then(({ user }) => {
        if (!alive) return
        setSession({ status: user ? 'authenticated' : 'anonymous', user })
      })
      .catch((error) => {
        if (!alive) return
        setSession({
          status: error instanceof ApiUnavailableError ? 'unavailable' : 'anonymous',
          user: null,
        })
      })
    return () => {
      alive = false
    }
  }, [fetchMeFn])

  const hasRole = session.user?.roles?.includes?.('promptologue') === true

  let body = null
  if (session.status === 'loading') {
    body = <p role="status">Vérification de la session…</p>
  } else if (session.status === 'unavailable') {
    body = (
      <p role="alert" className="load-error" data-testid="promptologue-indisponible">
        Copie statique du site : l’atelier promptologue nécessite l’API serveur. Rendez-vous sur{' '}
        <a href="https://humanome.xyz/#/promptologue">humanome.xyz</a>.
      </p>
    )
  } else if (session.status === 'anonymous') {
    body = (
      <p role="alert" className="load-error" data-testid="promptologue-anonyme">
        L’atelier promptologue nécessite une session. <a href="#/compte">Connectez-vous</a> avec un
        compte portant le rôle promptologue.
      </p>
    )
  } else if (!hasRole) {
    body = (
      <p role="alert" className="load-error" data-testid="promptologue-sans-role">
        Cet atelier est réservé au rôle <strong>promptologue</strong> (cahier §3.4). Votre compte ne
        porte pas ce rôle — rapprochez-vous de l’administration Harmonia.
      </p>
    )
  } else {
    const editorMatch = /^editeur\/(.+)$/.exec(section ?? '')
    if (section === null) {
      body = <AccueilSection api={api} />
    } else if (editorMatch) {
      body = <EditeurSection api={api} draftId={decodeURIComponent(editorMatch[1])} />
    } else if (section === 'banc-essai') {
      body = <BancEssaiSection api={api} user={session.user} deps={deps.benchDeps ?? {}} />
    } else if (section === 'retro') {
      body = <RetroSection api={api} deps={deps.retroDeps ?? {}} />
    } else if (section === 'formation' || section.startsWith('formation/')) {
      const chapter = section === 'formation' ? null : section.slice('formation/'.length)
      // API annoncée par le chantier C : FormationSection accepte `parcours`
      // (contenu content/formation/promptologue/) — voir plan M7.
      body = (
        <Formation
          parcours="promptologue"
          chapter={chapter}
          connected
          trainingStore={deps.trainingStore}
        />
      )
    } else {
      body = (
        <div>
          <p role="alert" className="load-error">
            Section inconnue de l’atelier promptologue : « {section} ».
          </p>
          <p>
            <a href="#/promptologue">Retour à l’atelier</a>
          </p>
        </div>
      )
    }
  }

  return (
    <div className="promptologue">
      <h1>
        <a href="#/promptologue" style={{ textDecoration: 'none', color: 'inherit' }}>
          Atelier promptologue
        </a>
      </h1>
      {session.status === 'authenticated' && hasRole ? (
        <>
          <p role="status" className="espace-session account-notice" data-testid="promptologue-connecte">
            Connecté en tant que {session.user.displayName ?? session.user.email} (promptologue).
          </p>
          <nav aria-label="Sections de l’atelier" className="promptologue-nav">
            <a href="#/promptologue">Paquets</a>
            <a href="#/promptologue/banc-essai">Banc d’essai</a>
            <a href="#/promptologue/retro">Rétrospective</a>
            <a href="#/promptologue/formation">Formation</a>
          </nav>
        </>
      ) : null}
      {body}
    </div>
  )
}
