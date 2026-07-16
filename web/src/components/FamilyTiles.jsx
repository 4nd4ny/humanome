// Tuiles familles de l'accueil — le plan du site par intention, filtré par la
// session (refonte 2026-07, docs/ergonomie-navigation.md). Trois usages :
//
// 1. Connecté : les tuiles = les familles de SES rôles (landing de profil).
// 2. Visiteur : la famille « Découvrir », plus un bouton qui révèle la barre
//    des profils (persona-bar) pour explorer ce que chaque rôle voit — la
//    complexité du site se découvre sans compte.
// 3. Survol / premier clic d'un lien : l'aide contextuelle de la rubrique
//    (le même contenu que le bouton « ? », help/registry.js) s'affiche dans
//    la div callout ; le SECOND clic ouvre le lien. On lit avant d'entrer.

import { useEffect, useState } from 'react'
import { navGroups } from '../nav.js'
import { helpFor } from '../help/registry.js'
import { navigate, parseHash } from '../router.js'

/**
 * Adresse de contact pour les employeurs intéressés par le moteur de recherche
 * de profils (offre À VENIR, présentation seulement — AD-D6). Question ouverte
 * Q2 : `contact@humanome.xyz` par défaut. Source de vérité du modèle tarifaire :
 * docs/offre-employeur.md.
 */
export const CONTACT_EMPLOYEUR = 'contact@humanome.xyz'

/**
 * Profils explorables par un visiteur. `roles` reflète la réalité des comptes
 * (tout compte porte « apprenant » en plus de son rôle de travail) ; employeur
 * n'a pas de compte — il reçoit un lien de partage — d'où son cas spécial.
 */
export const PERSONAS = [
  { id: 'visiteur', label: 'Visiteur', roles: [] },
  { id: 'apprenant', label: 'Apprenant', roles: ['apprenant'] },
  { id: 'employeur', label: 'Employeur', roles: null },
  { id: 'cartographe', label: 'Cartographe', roles: ['apprenant', 'cartographe'] },
  { id: 'promptologue', label: 'Promptologue', roles: ['apprenant', 'promptologue'] },
  { id: 'epistemiarque', label: 'Épistémiarque', roles: ['apprenant', 'epistemiarque'] },
  { id: 'etablissement', label: 'Établissement', roles: ['apprenant', 'etablissement'] },
  { id: 'admin', label: 'Administrateur', roles: ['apprenant', 'admin'] },
]

/**
 * Clé d'un item de tuile : deux items peuvent partager le même href (alias
 * « Partager ma cartographie » → #/espace), la sélection est donc indexée par
 * (href + libellé), jamais par href seul.
 */
function itemKey(item) {
  return `${item.href} ${item.label}`
}

/** @param {{roles?: string[]}} props rôles de la session (App) */
export default function FamilyTiles({ roles = [] }) {
  const authenticated = roles.length > 0
  // Visiteur : profil exploré via la persona-bar (null tant que non révélée).
  const [reveal, setReveal] = useState(false)
  const [persona, setPersona] = useState('visiteur')
  // Callout : `preview` suit le survol/focus (transitoire), `armed` le premier
  // clic (persistant) — le second clic sur le lien armé navigue. Chaque entrée
  // est {key, href} (clé unique d'item, cf. itemKey).
  const [preview, setPreview] = useState(null)
  const [armed, setArmed] = useState(null)

  // Échap désarme la sélection en cours.
  useEffect(() => {
    if (!armed) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setArmed(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [armed])

  const selected = PERSONAS.find((p) => p.id === persona) ?? PERSONAS[0]
  const previewing = !authenticated && reveal && persona !== 'visiteur'
  const effectiveRoles = authenticated ? roles : previewing && selected.roles ? selected.roles : []
  const families = navGroups({
    roles: effectiveRoles,
    authenticated: authenticated || previewing,
  })

  // Le survol/focus PRIME sur la sélection : on peut lire l'aide d'un autre
  // lien sans perdre son lien armé (l'invite ne s'affiche alors pas).
  const active = preview ?? armed
  const help = active ? helpFor(parseHash(active.href).name, { roles: effectiveRoles }) : null
  const showArmedHint = Boolean(armed && active && active.key === armed.key)

  /** Oubli de toute lecture en cours (changement de profil / de grille). */
  function resetCallout() {
    setArmed(null)
    setPreview(null)
  }

  function handleClick(event, item) {
    // Clic modifié (cmd/ctrl/shift/alt, clic molette) : comportement natif du
    // navigateur (nouvel onglet…), le pattern deux-clics ne s'applique pas.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return
    }
    event.preventDefault()
    const key = itemKey(item)
    if (armed?.key === key) {
      setArmed(null)
      navigate(item.href)
    } else {
      setArmed({ key, href: item.href })
    }
  }

  return (
    <section className="families-section" aria-label="Plan du site">
      <h2 className="families-title">{authenticated ? 'Vos espaces' : 'Explorer le site'}</h2>

      {!authenticated ? (
        <div className="families-reveal">
          <button
            type="button"
            className="button"
            aria-expanded={reveal}
            onClick={() => {
              setReveal((v) => !v)
              setPersona('visiteur')
              resetCallout()
            }}
          >
            {reveal ? 'Masquer les profils d’utilisateurs' : 'Voir les profils d’utilisateurs'}
          </button>
          {reveal ? (
            <div className="persona-bar" role="group" aria-label="Choisir un profil à explorer">
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="chip"
                  aria-pressed={persona === p.id}
                  onClick={() => {
                    setPersona(p.id)
                    resetCallout()
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          ) : null}
          {reveal ? (
            // Monté dès la révélation (vide pour « Visiteur ») : une région
            // live insérée déjà remplie n'est pas annoncée de façon fiable.
            <p className="families-note" role="status">
              {previewing ? (
                <>
                  Aperçu du profil <strong>{selected.label}</strong> : voici les espaces que ce
                  rôle voit une fois connecté. Les rôles sont attribués par Harmonia Éducation.
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}

      {!authenticated && reveal && persona === 'employeur' ? (
        <div className="families" data-persona="employeur">
          <div className="family family-note-card" data-family="partage">
            <div className="family-head">
              <span className="family-intent">Lire une cartographie partagée</span>
              <span className="family-name">Employeur / recruteur</span>
              <span className="family-audience">Sans compte — sur invitation</span>
            </div>
            <p className="family-note-text">
              {helpFor('share', {}).intro} L’apprenant vous transmet ce lien (et son mot de passe)
              depuis son espace : il n’y a pas de page à chercher ici.
            </p>
          </div>

          <div className="family family-note-card" data-family="recherche-profils">
            <div className="family-head">
              <span className="family-intent">Rechercher des profils</span>
              <span className="family-name">
                Moteur de compétences <span className="value-badge value-badge-avenir">à venir</span>
              </span>
              <span className="family-audience">Sur abonnement — en préparation</span>
            </div>
            <p className="family-note-text">
              Une offre <strong>à venir</strong> (pas encore disponible) : moyennant un abonnement
              payant — qui <strong>finance l’accès gratuit à l’API pour les pays émergents</strong> —
              vous pourrez rechercher des compétences dans les <strong>profils publiés</strong> par
              les utilisateurs consentants.
            </p>
            <ul className="family-note-list">
              <li>
                <strong>1 USD</strong> par cartographie remontée, dégressif à partir de 10, 100 et
                1000.
              </li>
              <li>
                Facturation forfaitaire <strong>avant</strong> les recherches, ajustée le mois suivant
                sur la consommation réelle (les crédits restants sont reportés).
              </li>
            </ul>
            <p className="family-note-text">
              Intéressé ? Écrivez-nous à{' '}
              <a href={`mailto:${CONTACT_EMPLOYEUR}?subject=${encodeURIComponent('Intérêt — moteur de recherche de profils')}`}>
                {CONTACT_EMPLOYEUR}
              </a>{' '}
              pour manifester votre intérêt.
            </p>
          </div>
        </div>
      ) : (
        <div className="families">
          {families.map((family) => (
            <article className="family" key={family.id} data-family={family.id}>
              <div className="family-head">
                <span className="family-intent">{family.intent}</span>
                <span className="family-name">{family.label}</span>
                <span className="family-audience">{family.audience}</span>
              </div>
              <ul className="routes">
                {family.items.map((item) => {
                  const key = itemKey(item)
                  const isArmed = armed?.key === key
                  return (
                    <li key={key}>
                      <a
                        href={item.href}
                        className={isArmed ? 'route-armed' : undefined}
                        aria-describedby={isArmed ? 'families-callout' : undefined}
                        onClick={(event) => handleClick(event, item)}
                        onMouseEnter={() => setPreview({ key, href: item.href })}
                        onMouseLeave={() => setPreview(null)}
                        onFocus={() => setPreview({ key, href: item.href })}
                        onBlur={() => setPreview(null)}
                      >
                        <span className="route-label">{item.label}</span>
                        {item.badge ? (
                          <span className={`value-badge value-badge-${item.badge}`}>
                            {item.badge}
                          </span>
                        ) : null}
                        {item.hint ? (
                          <span className="route-hint" aria-hidden="true">
                            {item.hint}
                          </span>
                        ) : null}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </article>
          ))}
        </div>
      )}

      <div className="callout" id="families-callout" role="note" aria-live="polite">
        {help ? (
          <>
            <p className="callout-title">{help.titre}</p>
            <p className="callout-intro">{help.intro}</p>
            {help.points ? (
              <ul className="callout-points">
                {help.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            ) : null}
            {showArmedHint ? (
              <p className="callout-hint">
                Cliquez à nouveau (ou appuyez sur Entrée) pour ouvrir cette rubrique →
              </p>
            ) : null}
          </>
        ) : (
          <p className="callout-intro">
            Survolez une entrée — ou parcourez-les au clavier — pour lire à quoi elle sert : le
            même contenu que le bouton d’aide « ? ». Un premier clic (ou Entrée) la sélectionne,
            un second l’ouvre.
          </p>
        )}
      </div>
    </section>
  )
}
