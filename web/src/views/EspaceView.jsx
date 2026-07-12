// Espace apprenant (P8, cahier §3.2) — #/espace[/<section>].
//
// Le routing est pré-câblé (router.js) : cette vue ne fait que DISPATCHER la
// section. L'espace fonctionne AUSSI en anonyme (tout est local : portfolios,
// cartographies, formation) ; les fonctions serveur (synchronisation, partage,
// progression rattachée au compte) affichent une invite à se connecter.
// La session n'est vérifiée qu'au montage de CETTE vue (GET api/auth/me,
// pattern AccountView) : le reste du site reste 100 % statique.

import { useEffect, useState } from 'react'
import { ApiUnavailableError, fetchMe } from '../api/client.js'
import DashboardSection from './espace/DashboardSection.jsx'
import FormationSection from './espace/FormationSection.jsx'
import RunWizard from '../components/RunWizard.jsx'

/**
 * @param {object} props
 * @param {string | null} props.section segment après #/espace (pré-câblé) :
 *   null | 'formation' | 'formation/<chapitre>' | 'nouveau-run'
 * @param {object} [props.lib] lib sunburst (App) — visionneuse « Voir » du tableau de bord
 * @param {object} [props.deps] coutures de test : {fetchMeFn, portfolioStore,
 *   trainingStore, cartographiesPanel, getReferentiel, runWizardDeps}
 */
export default function EspaceView({ section, lib, deps = {} }) {
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
        // API absente (copie statique) : l'espace reste utilisable en local.
        setSession({
          status: error instanceof ApiUnavailableError ? 'unavailable' : 'anonymous',
          user: null,
        })
      })
    return () => {
      alive = false
    }
  }, [fetchMeFn])

  let body
  if (section === null) {
    body = (
      <DashboardSection
        session={session}
        portfolioStore={deps.portfolioStore}
        trainingStore={deps.trainingStore}
        cartographiesPanel={deps.cartographiesPanel}
        lib={lib}
        getReferentiel={deps.getReferentiel}
      />
    )
  } else if (section === 'formation' || section.startsWith('formation/')) {
    const chapter = section === 'formation' ? null : section.slice('formation/'.length)
    body = (
      <FormationSection
        chapter={chapter}
        connected={session.status === 'authenticated'}
        trainingStore={deps.trainingStore}
      />
    )
  } else if (section === 'nouveau-run') {
    body = <RunWizard session={session} deps={deps.runWizardDeps ?? {}} />
  } else {
    body = (
      <div>
        <p role="alert" className="load-error">
          Section inconnue de l’espace apprenant : « {section} ».
        </p>
        <p>
          <a href="#/espace">Retour à l’accueil de l’espace</a>
        </p>
      </div>
    )
  }

  return (
    <div className="espace">
      <h1>
        <a href="#/espace" style={{ textDecoration: 'none', color: 'inherit' }}>
          Espace apprenant
        </a>
      </h1>

      {session.status === 'loading' ? (
        <p role="status" className="espace-session">
          Vérification de la session…
        </p>
      ) : null}
      {session.status === 'authenticated' ? (
        <p role="status" className="espace-session account-notice" data-testid="espace-connecte">
          Connecté en tant que {session.user.displayName ?? session.user.email}.
        </p>
      ) : null}
      {session.status === 'anonymous' ? (
        <p role="status" className="espace-session privacy-note" data-testid="espace-anonyme">
          Vous n’êtes pas connecté : tout fonctionne en local dans ce navigateur (portfolios,
          cartographies, formation). <a href="#/compte">Connectez-vous</a> pour synchroniser,
          partager et rattacher votre progression à un compte.
        </p>
      ) : null}
      {session.status === 'unavailable' ? (
        <p role="status" className="espace-session privacy-note" data-testid="espace-anonyme">
          Copie statique du site : les fonctions serveur (compte, synchronisation, partage) sont
          indisponibles — tout le reste fonctionne en local.
        </p>
      ) : null}

      {body}
    </div>
  )
}
