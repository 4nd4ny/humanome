// Espace établissement (P11, cahier §3.7, §4.9, §7) — #/etablissement[/<section>].
//
// Le routing est pré-câblé (router.js) : cette vue DISPATCHE la section.
// Garde de rôle : la session est vérifiée au montage (GET api/auth/me,
// pattern CartographeView) ; sans rôle `etablissement`, l'espace est remplacé
// par « espace réservé aux établissements » + explication du rôle B2B.
//
// Sections :
//   null                -> accueil (cohortes + création, config LLM/budget)
//   cohorte/<id>        -> membres, lancement d'un run de masse, avancement
//   membre/<userId>     -> documents jour -> MERGE CÔTÉ CLIENT -> lecture seule

import { useEffect, useState } from 'react'
import { ApiUnavailableError, fetchMe } from '../api/client.js'
import AccueilSection from './etablissement/AccueilSection.jsx'
import CohorteSection from './etablissement/CohorteSection.jsx'
import MembreSection from './etablissement/MembreSection.jsx'

/** Explication du rôle (cahier §3.7) montrée à qui n'a pas le rôle. */
function RoleExplanation() {
  return (
    <div className="etab-reserve" data-testid="etab-reserve">
      <p role="alert">Cet espace est réservé aux établissements de formation.</p>
      <p>
        Le compte <strong>établissement</strong> (accès B2B) cartographie ses classes en masse :
        cohortes d’apprenants rejointes par code d’invitation avec consentement explicite,
        exécution serveur par file de jobs, budget plafonné, et lecture des cartographies
        produites dans ce cadre (cahier §3.7). L’accès s’obtient auprès d’Harmonia Éducation.
      </p>
    </div>
  )
}

/**
 * @param {object} props
 * @param {string | null} props.section segment après #/etablissement (pré-câblé) :
 *   null | 'cohorte/<id>' | 'membre/<userId>'
 * @param {object} [props.lib] lib sunburst (App / tests) — vue membre
 * @param {object} [props.deps] coutures de test : {fetchMeFn, fetchFn, getReferentiel}
 */
export default function EtablissementView({ section, lib, deps = {} }) {
  const fetchMeFn = deps.fetchMeFn ?? fetchMe
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

  const isEtablissement = Boolean(session.user?.roles?.includes('etablissement'))

  let body
  if (session.status === 'loading') {
    body = <p role="status">Vérification de la session…</p>
  } else if (session.status === 'unavailable') {
    body = (
      <p role="status" className="privacy-note">
        Copie statique du site : l’espace établissement a besoin de l’API (session, cohortes,
        runs de masse). Rendez-vous sur le site en ligne.
      </p>
    )
  } else if (!isEtablissement) {
    body = (
      <>
        <RoleExplanation />
        {session.status === 'anonymous' ? (
          <p className="privacy-note">
            Vous n’êtes pas connecté. <a href="#/compte">Connectez-vous</a> si votre compte
            porte le rôle établissement.
          </p>
        ) : null}
      </>
    )
  } else if (section === null) {
    body = <AccueilSection fetchFn={deps.fetchFn} />
  } else if (section.startsWith('cohorte/')) {
    body = <CohorteSection id={section.slice('cohorte/'.length)} fetchFn={deps.fetchFn} />
  } else if (section.startsWith('membre/')) {
    body = (
      <MembreSection
        userId={section.slice('membre/'.length)}
        lib={lib}
        fetchFn={deps.fetchFn}
        {...(deps.getReferentiel ? { getReferentiel: deps.getReferentiel } : {})}
      />
    )
  } else {
    body = (
      <div>
        <p role="alert" className="load-error">
          Section inconnue de l’espace établissement : « {section} ».
        </p>
        <p>
          <a href="#/etablissement">Retour à l’accueil de l’espace</a>
        </p>
      </div>
    )
  }

  return (
    <div className="etablissement">
      <h1>
        <a href="#/etablissement" style={{ textDecoration: 'none', color: 'inherit' }}>
          Espace établissement
        </a>
      </h1>
      {session.status === 'authenticated' ? (
        <p role="status" className="espace-session account-notice" data-testid="etab-connecte">
          Connecté en tant que {session.user.displayName ?? session.user.email}.
        </p>
      ) : null}
      {body}
    </div>
  )
}
