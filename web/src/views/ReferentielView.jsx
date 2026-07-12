import { useEffect, useMemo, useState } from 'react'
import { loadPublishedReferentiel } from '../data/referentiel.js'
import { getReferentiel } from '../data/load.js'
import { referentielHash } from '../router.js'

/**
 * Référentiel public (P4.4, cahier §4.1/§3.5) : arbre 7 pôles -> 61
 * compétences aux couleurs des pôles, recherche plein-texte client (code +
 * nom, insensible aux accents), permalien par compétence
 * (#/referentiel/<code> : défilement + surbrillance), et bandeau sobre vers
 * l'espace participatif Decidim — qui nourrit et critique le référentiel,
 * sans le remplacer.
 *
 * @param {{focusCode?: string | null,
 *   load?: typeof loadPublishedReferentiel}} props `load` est une couture de test.
 */
export default function ReferentielView({ focusCode = null, load = loadPublishedReferentiel }) {
  const [data, setData] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let alive = true
    load()
      .then((result) => {
        if (alive) setData(result)
      })
      .catch(() => {
        // loadPublishedReferentiel ne rejette jamais ; ceinture et bretelles
        // pour un chargeur injecté : on retombe sur le référentiel embarqué.
        if (alive) setData({ doc: getReferentiel(), origin: 'bundled' })
      })
    return () => {
      alive = false
    }
  }, [load])

  const doc = data?.doc ?? null

  // Défilement vers la compétence permaliée une fois l'arbre rendu.
  useEffect(() => {
    if (!doc || !focusCode) return
    const element = document.getElementById(competenceDomId(focusCode))
    element?.scrollIntoView?.({ block: 'center' })
  }, [doc, focusCode])

  const trimmedQuery = query.trim()
  const poles = useMemo(() => {
    if (!doc) return []
    const folded = fold(trimmedQuery)
    return (doc.poles ?? []).map((pole) => ({
      ...pole,
      competences: (doc.competences ?? []).filter(
        (competence) =>
          competence.pole === pole.num &&
          (folded === '' || fold(`${competence.code} ${competence.nom}`).includes(folded)),
      ),
    }))
  }, [doc, trimmedQuery])

  if (!doc) {
    return (
      <div className="referentiel">
        <p className="ref-loading">Chargement du référentiel…</p>
      </div>
    )
  }

  const shown = poles.reduce((sum, pole) => sum + pole.competences.length, 0)
  const total = (doc.competences ?? []).length
  const focusKnown =
    focusCode === null || (doc.competences ?? []).some((c) => c.code === focusCode)

  return (
    <div className="referentiel">
      <header className="ref-header">
        <h1>Référentiel de compétences</h1>
        <p className="ref-version">
          {doc.label ?? doc.id} — version {doc.version} · {(doc.poles ?? []).length} pôles,{' '}
          {total} compétences. Public en lecture, édité par les épistémiarques, versionné :
          aucune version publiée n’est modifiée en place.
        </p>
      </header>

      <aside className="ref-decidim">
        <p>
          Le référentiel s’édite collectivement : l’espace participatif Decidim d’Harmonia
          Éducation nourrit et critique le référentiel, il ne le remplace pas.
        </p>
        <a className="button" href="https://participer.harmonia.education" rel="noreferrer">
          Participer sur participer.harmonia.education
        </a>
      </aside>

      {!focusKnown ? (
        <p className="load-error" role="alert">
          Compétence «&nbsp;{focusCode}&nbsp;» introuvable dans cette version du référentiel.
        </p>
      ) : null}

      <p className="ref-search">
        <label htmlFor="ref-search-input">Rechercher une compétence</label>
        <input
          id="ref-search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Code ou nom — ex. 1.01, pensée critique"
          autoComplete="off"
        />
      </p>
      <p className="ref-count" role="status">
        {trimmedQuery === ''
          ? `${total} compétences.`
          : `${shown} compétence${shown > 1 ? 's' : ''} sur ${total} pour « ${trimmedQuery} ».`}
      </p>

      {poles.map((pole) =>
        trimmedQuery !== '' && pole.competences.length === 0 ? null : (
          <section
            key={pole.num}
            className="ref-pole"
            style={{ '--pole-color': pole.couleur }}
            aria-label={pole.nom}
          >
            <h2 className="ref-pole-title">
              {pole.nom}{' '}
              <span className="ref-pole-count">
                {pole.competences.length} compétence{pole.competences.length > 1 ? 's' : ''}
              </span>
            </h2>
            <ul className="ref-competences">
              {pole.competences.map((competence) => {
                const focused = competence.code === focusCode
                return (
                  <li
                    key={competence.code}
                    id={competenceDomId(competence.code)}
                    className={`ref-competence${focused ? ' ref-competence-focus' : ''}`}
                  >
                    <a
                      className="ref-competence-code"
                      href={referentielHash(competence.code)}
                      aria-current={focused ? 'true' : undefined}
                      title={`Lien direct vers la compétence ${competence.code}`}
                    >
                      {competence.code}
                    </a>
                    <span className="ref-competence-name">{competence.nom}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        ),
      )}
    </div>
  )
}

/** @param {string} code @returns {string} stable DOM id for a competence row */
function competenceDomId(code) {
  return `competence-${code}`
}

/** Accent- and case-insensitive folding for the client-side search. */
function fold(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}
