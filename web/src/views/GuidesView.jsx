// Hub public des guides / manuels de prise en main (#/guides).
//
//   #/guides                         -> accueil : cartes de parcours par famille
//   #/guides/<parcours>              -> liste des chapitres du parcours
//   #/guides/<parcours>/<chapitre>   -> chapitre rendu
//
// Réutilise le mécanisme de formation existant (content/formation/<parcours>/
// + FormationSection) : le MÊME markdown sert les espaces de rôle connectés et
// ce hub public. Lisible par TOUS (pas de garde de rôle) — les manuels sont
// pédagogiques. La progression se synchronise au compte si l'on est connecté,
// sinon reste locale (createTrainingStore, comme les espaces).

import { useEffect, useState } from 'react'
import { fetchMe } from '../api/client.js'
import { guidesHash } from '../router.js'
import {
  FORMATION_META,
  FORMATION_PARCOURS,
  guidesBaseHash,
} from './espace/formation-content.js'
import FormationSection from './espace/FormationSection.jsx'

/** Ordre d'affichage des familles de cartes sur l'accueil. */
const FAMILY_ORDER = ['Découvrir', 'Votre cartographie', 'Encadrer', 'Faire évoluer', 'Administrer']

/** Accueil du hub : cartes de parcours groupées par famille d'usage. */
function GuidesHome() {
  const parcoursList = FORMATION_PARCOURS.map((id) => ({ id, ...FORMATION_META[id] })).sort(
    (a, b) => a.ordre - b.ordre,
  )
  const families = FAMILY_ORDER.filter((f) => parcoursList.some((p) => p.famille === f))

  return (
    <div className="guides-home">
      <p className="guides-lede">
        Des manuels de prise en main, un par profil d’utilisateur : ce que vous pouvez faire sur
        humanome.xyz et par où passer pour le faire. Tous les guides sont en accès libre.
      </p>
      {families.map((family) => (
        <section key={family} className="guides-family" aria-label={family}>
          <h2>{family}</h2>
          <ul className="guides-cards">
            {parcoursList
              .filter((p) => p.famille === family)
              .map((p) => (
                <li key={p.id} className="guides-card">
                  <a href={p.id === 'admin' ? guidesHash('admin') : guidesHash(p.id)}>
                    <span className="guides-card-audience">{p.audience}</span>
                    <strong className="guides-card-titre">{p.titre}</strong>
                    <span className="guides-card-pitch">{p.pitch}</span>
                    <span className="guides-card-cta" aria-hidden="true">
                      Commencer →
                    </span>
                  </a>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * @param {object} props
 * @param {string | null} props.parcours id du parcours (null = accueil du hub)
 * @param {string | null} props.chapter slug de chapitre (null = liste)
 * @param {object} [props.deps] coutures de test : {fetchMeFn}
 */
export default function GuidesView({ parcours, chapter, deps = {} }) {
  const fetchMeFn = deps.fetchMeFn ?? fetchMe
  const [connected, setConnected] = useState(false)

  // La progression se rattache au compte si l'on est connecté (sinon locale).
  // Aucune GARDE : un visiteur anonyme lit tout le hub.
  useEffect(() => {
    let alive = true
    fetchMeFn()
      .then(({ user }) => alive && setConnected(Boolean(user)))
      .catch(() => alive && setConnected(false))
    return () => {
      alive = false
    }
  }, [fetchMeFn])

  const known = parcours && FORMATION_PARCOURS.includes(parcours)

  return (
    <div className="guides">
      <h1>
        <a href="#/guides" style={{ textDecoration: 'none', color: 'inherit' }}>
          Guides &amp; prise en main
        </a>
      </h1>
      {parcours && !known ? (
        <div>
          <p role="alert" className="load-error">
            Guide inconnu : « {parcours} ».
          </p>
          <p>
            <a href="#/guides">Retour à tous les guides</a>
          </p>
        </div>
      ) : parcours ? (
        <>
          <p className="guides-breadcrumb">
            <a href="#/guides">← Tous les guides</a>
            {FORMATION_META[parcours] ? ` · ${FORMATION_META[parcours].audience}` : ''}
          </p>
          <FormationSection
            parcours={parcours}
            baseHash={guidesBaseHash(parcours)}
            chapter={chapter}
            connected={connected}
            trainingStore={deps.trainingStore}
          />
          {FORMATION_META[parcours]?.espace ? (
            <p className="privacy-note guides-espace-link">
              Vous avez le rôle {FORMATION_META[parcours].audience.toLowerCase()} ? Votre espace dédié
              est <a href={FORMATION_META[parcours].espace}>ici</a>.
            </p>
          ) : null}
        </>
      ) : (
        <GuidesHome />
      )}
    </div>
  )
}
