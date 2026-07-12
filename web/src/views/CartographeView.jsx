// Espace cartographe (P9, cahier §3.3, §8) — #/cartographe[/<section>].
//
// Le routing est pré-câblé (router.js) : cette vue DISPATCHE la section.
// Garde de rôle : la session est vérifiée au montage (GET api/auth/me,
// pattern EspaceView) ; sans rôle `cartographe`, l'espace de travail est
// remplacé par « espace réservé aux cartographes » + explication du rôle
// (cahier §2). Choix UX : la FORMATION cartographe reste lisible par tous
// (comme la formation apprenant) — elle explique justement le rôle à ceux qui
// s'y destinent ; seules les sections de travail (file, relecture,
// comparaison, consistance) exigent le rôle.
//
// Sections :
//   null                     -> accueil (invitation, apprentis, file)
//   relecture/<id>           -> relecture/annotation/révision/garantie
//   comparer                 -> deux cartographies d'un même apprenant
//   consistance              -> rapport multi-run (engine compareRuns)
//   formation[/<chapitre>]   -> FormationSection parcours='cartographe'

import { useEffect, useState } from 'react'
import { ApiUnavailableError, fetchMe } from '../api/client.js'
import AccueilSection from './cartographe/AccueilSection.jsx'
import CompareSection from './cartographe/CompareSection.jsx'
import ConsistanceSection from './cartographe/ConsistanceSection.jsx'
import RelectureSection from './cartographe/RelectureSection.jsx'
import FormationSection from './espace/FormationSection.jsx'

/** Explication du rôle (cahier §2) montrée à qui n'a pas le rôle. */
function RoleExplanation() {
  return (
    <div className="cartographe-reserve" data-testid="cartographe-reserve">
      <p role="alert">Cet espace de travail est réservé aux cartographes.</p>
      <p>
        Le <strong>cartographe</strong> relit, commente, corrige, valide et « garantit » la
        cartographie produite pour un apprenant. C’est le rôle humain de contrôle qualité : il
        justifie que le système ne soit jamais 100 % automatisé — aucune cartographie n’est
        présentée comme validée sans une signature humaine (cahier §8).
      </p>
      <p>
        Vous vous destinez à ce rôle ? La{' '}
        <a href="#/cartographe/formation">formation cartographe</a> est ouverte à tous. Le rôle
        s’obtient auprès d’Harmonia Éducation ; un apprenant vous rattache ensuite à lui par un
        code d’invitation.
      </p>
    </div>
  )
}

/**
 * @param {object} props
 * @param {string | null} props.section segment après #/cartographe (pré-câblé) :
 *   null | 'relecture/<id>' | 'comparer' | 'consistance' | 'formation[/<chapitre>]'
 * @param {object} [props.lib] lib sunburst (App / tests)
 * @param {object} [props.deps] coutures de test : {fetchMeFn, fetchFn,
 *   getReferentiel, trainingStore}
 */
export default function CartographeView({ section, lib, deps = {} }) {
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

  const isCartographe = Boolean(session.user?.roles?.includes('cartographe'))

  // Formation : ouverte à tous (voir en-tête de fichier).
  if (section === 'formation' || section?.startsWith('formation/')) {
    const chapter = section === 'formation' ? null : section.slice('formation/'.length)
    return (
      <div className="cartographe">
        <h1>
          <a href="#/cartographe" style={{ textDecoration: 'none', color: 'inherit' }}>
            Espace cartographe
          </a>
        </h1>
        <FormationSection
          chapter={chapter}
          parcours="cartographe"
          connected={session.status === 'authenticated'}
          trainingStore={deps.trainingStore}
        />
      </div>
    )
  }

  let body
  if (session.status === 'loading') {
    body = <p role="status">Vérification de la session…</p>
  } else if (session.status === 'unavailable') {
    body = (
      <p role="status" className="privacy-note">
        Copie statique du site : l’espace cartographe a besoin de l’API (session, file de
        relecture). Rendez-vous sur le site en ligne.
      </p>
    )
  } else if (!isCartographe) {
    // Visiteur, ou connecté sans le rôle : espace réservé + explication du rôle.
    body = (
      <>
        <RoleExplanation />
        {session.status === 'anonymous' ? (
          <p className="privacy-note">
            Vous n’êtes pas connecté. <a href="#/compte">Connectez-vous</a> si votre compte
            porte le rôle cartographe.
          </p>
        ) : null}
      </>
    )
  } else if (section === null) {
    body = <AccueilSection fetchFn={deps.fetchFn} />
  } else if (section.startsWith('relecture/')) {
    const id = section.slice('relecture/'.length)
    body = (
      <RelectureSection
        id={id}
        user={session.user}
        lib={lib}
        fetchFn={deps.fetchFn}
        getReferentiel={deps.getReferentiel}
      />
    )
  } else if (section === 'comparer') {
    body = (
      <CompareSection lib={lib} fetchFn={deps.fetchFn} getReferentiel={deps.getReferentiel} />
    )
  } else if (section === 'consistance') {
    body = <ConsistanceSection fetchFn={deps.fetchFn} getReferentiel={deps.getReferentiel} />
  } else {
    body = (
      <div>
        <p role="alert" className="load-error">
          Section inconnue de l’espace cartographe : « {section} ».
        </p>
        <p>
          <a href="#/cartographe">Retour à l’accueil de l’espace</a>
        </p>
      </div>
    )
  }

  return (
    <div className="cartographe">
      <h1>
        <a href="#/cartographe" style={{ textDecoration: 'none', color: 'inherit' }}>
          Espace cartographe
        </a>
      </h1>
      {session.status === 'authenticated' ? (
        <p role="status" className="espace-session account-notice" data-testid="cartographe-connecte">
          Connecté en tant que {session.user.displayName ?? session.user.email}.
        </p>
      ) : null}
      {isCartographe ? (
        <nav className="cartographe-nav" aria-label="Sections de l’espace cartographe">
          <a href="#/cartographe">File de relecture</a>
          <a href="#/cartographe/comparer">Comparer</a>
          <a href="#/cartographe/consistance">Consistance</a>
          <a href="#/cartographe/formation">Formation</a>
        </nav>
      ) : null}
      {body}
    </div>
  )
}
