// Administration (P12.1, cahier §3.8/§4.10/§6/§7) — #/admin[/<section>].
//
// Le routing est pré-câblé (router.js) : cette vue DISPATCHE la section.
// Garde de rôle : la session est vérifiée au montage (GET api/auth/me,
// pattern EtablissementView) ; sans rôle `admin`, l'espace est remplacé par
// « espace réservé à l'administration » + explication.
//
// Sections :
//   null       -> accueil (liens vers les sections + rappel du rôle)
//   roles      -> comptes et rôles : attribuer / retirer (anti-verrouillage)
//   golden     -> Golden Prompt : import privé, liste, autorisation promptologue
//   reglages   -> réglages plateforme : paquet par défaut, plafonds démo, worker
//   config     -> configuration serveur versionnable (config/app.php)

import { useEffect, useState } from 'react'
import { ApiUnavailableError, fetchMe } from '../api/client.js'
import RolesSection from './admin/RolesSection.jsx'
import GoldenSection from './admin/GoldenSection.jsx'
import ReglagesSection from './admin/ReglagesSection.jsx'
import ConfigSection from './admin/ConfigSection.jsx'
import Twin9Section from './admin/Twin9Section.jsx'

const SECTIONS = [
  { id: 'roles', label: 'Rôles', hint: 'Comptes et attribution des rôles' },
  { id: 'golden', label: 'Golden Prompt', hint: 'Import privé et autorisations' },
  { id: 'reglages', label: 'Réglages', hint: 'Démo publique, paquet par défaut, worker' },
  { id: 'config', label: 'Configuration serveur', hint: 'Variables versionnables' },
  { id: 'twin9', label: 'Twin9', hint: 'Supervision : contribution, promo, comptes' },
]

/** Explication du rôle montrée à qui n'est pas administrateur. */
function RoleExplanation() {
  return (
    <div className="admin-reserve" data-testid="admin-reserve">
      <p role="alert">Cet espace est réservé à l’administration de la plateforme.</p>
      <p>
        Le compte <strong>administrateur</strong> gère le Golden Prompt (privé par défaut,
        cahier §7), l’attribution des rôles, la version de prompt par défaut et les réglages
        serveur (cahier §3.8, §4.10). L’accès s’obtient auprès d’Harmonia Éducation.
      </p>
    </div>
  )
}

/**
 * Accueil : cartes cliquables vers les sections, grandes cibles tactiles
 * (>= 44px, utilisables au pouce) — le routing hash pré-câblé fait le reste.
 */
function AdminHome() {
  return (
    <nav className="admin-home" aria-label="Sections d’administration">
      <ul>
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a className="admin-card" href={`#/admin/${s.id}`}>
              <strong>{s.label}</strong>
              <span>{s.hint}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * @param {object} props
 * @param {string | null} props.section segment après #/admin (pré-câblé)
 * @param {object} [props.deps] coutures de test : {fetchMeFn, fetchFn}
 */
export default function AdminView({ section, deps = {} }) {
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

  const isAdmin = Boolean(session.user?.roles?.includes('admin'))
  const currentUserId = session.user?.id ?? null

  let body
  if (session.status === 'loading') {
    body = <p role="status">Vérification de la session…</p>
  } else if (session.status === 'unavailable') {
    body = (
      <p role="status" className="privacy-note">
        Copie statique du site : l’administration a besoin de l’API (session, comptes, réglages).
        Rendez-vous sur le site en ligne.
      </p>
    )
  } else if (!isAdmin) {
    body = (
      <>
        <RoleExplanation />
        {session.status === 'anonymous' ? (
          <p className="privacy-note">
            Vous n’êtes pas connecté. <a href="#/compte">Connectez-vous</a> si votre compte porte
            le rôle administrateur.
          </p>
        ) : null}
      </>
    )
  } else if (section === null) {
    body = <AdminHome />
  } else if (section === 'roles') {
    body = <RolesSection currentUserId={currentUserId} fetchFn={deps.fetchFn} />
  } else if (section === 'golden') {
    body = <GoldenSection fetchFn={deps.fetchFn} />
  } else if (section === 'reglages') {
    body = <ReglagesSection fetchFn={deps.fetchFn} />
  } else if (section === 'config') {
    body = <ConfigSection fetchFn={deps.fetchFn} />
  } else if (section === 'twin9') {
    body = <Twin9Section fetchFn={deps.fetchFn} />
  } else {
    body = (
      <div>
        <p role="alert" className="load-error">
          Section inconnue de l’administration : « {section} ».
        </p>
        <p>
          <a href="#/admin">Retour à l’accueil de l’administration</a>
        </p>
      </div>
    )
  }

  return (
    <div className="admin">
      <h1>
        <a href="#/admin" style={{ textDecoration: 'none', color: 'inherit' }}>
          Administration
        </a>
      </h1>
      {isAdmin && section !== null ? (
        // Onglets mobile-friendly : cibles >= 44px, section active marquée
        // (aria-current stylé), défilement horizontal si l'écran est étroit.
        <nav className="admin-tabs" aria-label="Sections d’administration">
          <a href="#/admin" className="admin-tabs-home" aria-label="Accueil de l’administration">
            Accueil
          </a>
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#/admin/${s.id}`} aria-current={section === s.id ? 'page' : undefined}>
              {s.label}
            </a>
          ))}
        </nav>
      ) : null}
      {session.status === 'authenticated' ? (
        <p role="status" className="espace-session account-notice" data-testid="admin-connecte">
          Connecté en tant que {session.user.displayName ?? session.user.email}.
        </p>
      ) : null}
      {body}
    </div>
  )
}
