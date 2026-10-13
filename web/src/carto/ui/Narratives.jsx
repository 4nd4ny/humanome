// Interface ultime — textes de synthèse (spec §6.4) : synthèses évolutives
// (affichées seulement quand leur ensemble source est exactement l'état
// affiché) et portrait kairos d'une journée.

import { narrativesFor } from '../core/narratives.js'
import { formatLong, formatShort } from '../core/dates.js'
import { renderNarrativeHtml } from '../../lib/narrative.js'
import { Markdown } from './Jury.jsx'

/**
 * HTML narratif assaini (DOMPurify) ; les anciens liens de journée
 * (`#/jour/<date>`, réécrits par renderNarrativeHtml) ouvrent ici la modale
 * du jour de l'interface ultime.
 */
export function cartoNarrativeHtml(html) {
  const safe = renderNarrativeHtml(html)
  const tpl = document.createElement('template')
  tpl.innerHTML = safe
  for (const a of tpl.content.querySelectorAll('a[href^="#/jour/"]')) {
    a.setAttribute('href', `#/cartographie${a.getAttribute('href').slice(1)}`)
  }
  const box = document.createElement('div')
  box.appendChild(tpl.content)
  return box.innerHTML
}

/**
 * @param {{dataset: object, kind: string, scope: object, shownDates: string[], title: string,
 *   onShowSourceSet?: (dates: string[]) => void}} props
 */
export function EvolutiveNarratives({ dataset, kind, scope, shownDates, title, onShowSourceSet }) {
  const items = narrativesFor(dataset, kind, scope, shownDates)
  if (items.length === 0) return null
  return (
    <>
      {items.map(({ narrative, visible, sourceCount, shownCount, from, to }) =>
        visible ? (
          <section key={narrative.id} className="carto-narrative" aria-label={title}>
            <h3>{title}</h3>
            <p className="carto-small carto-muted">
              Écrite pour ces {sourceCount} journées ({formatShort(from)} → {formatShort(to)}).
            </p>
            <div className="carto-prose" dangerouslySetInnerHTML={{ __html: cartoNarrativeHtml(narrative.html) }} />
          </section>
        ) : (
          <div key={narrative.id} className="carto-note carto-narrative-hidden">
            <p>
              {title} masquée : elle a été écrite pour {sourceCount} journée{sourceCount > 1 ? 's' : ''} ({from ? formatLong(from) : '—'} → {to ? formatLong(to) : '—'}),
              alors que l’état affiché en compte {shownCount}. Elle reste enregistrée dans ce navigateur.
            </p>
            {onShowSourceSet ? (
              <button type="button" className="carto-link-btn" onClick={() => onShowSourceSet(narrative.sourceDates ?? [])}>
                Cocher exactement ces journées et afficher l’état complet
              </button>
            ) : null}
          </div>
        ),
      )}
    </>
  )
}

/** Portrait kairos d'une journée (analyse de ce seul jour). */
export function DayKairos({ kairos, date }) {
  if (!kairos) return null
  return (
    <section className="carto-kairos" aria-label="Portrait kairos">
      <h3>Portrait du {formatLong(date)}</h3>
      <p className="carto-small carto-muted">Kairos de cette journée seule : il ne résume pas les autres journées.</p>
      {kairos.portrait ? <p>{String(kairos.portrait)}</p> : null}
      {kairos.profileShape ? (
        <>
          <h4>Forme du profil</h4>
          <p>{String(kairos.profileShape)}</p>
        </>
      ) : null}
      {kairos.linksAcrossPoles || kairos.betweenTheLines || kairos.invitations?.length || kairos.markdown ? (
        <details>
          <summary>Suite du portrait</summary>
          {kairos.linksAcrossPoles ? (
            <>
              <h4>Ce qui relie les pôles</h4>
              <p>{String(kairos.linksAcrossPoles)}</p>
            </>
          ) : null}
          {kairos.betweenTheLines ? (
            <>
              <h4>Ce qui émerge entre les lignes</h4>
              <p>{String(kairos.betweenTheLines)}</p>
            </>
          ) : null}
          {kairos.invitations?.length ? (
            <>
              <h4>Invitations pour la suite</h4>
              <ul>
                {[...new Set(kairos.invitations.map(String))].map((inv) => (
                  <li key={inv}>{inv}</li>
                ))}
              </ul>
            </>
          ) : null}
          {kairos.markdown ? (
            <details>
              <summary>Synthèse complète</summary>
              <Markdown text={kairos.markdown} />
            </details>
          ) : null}
        </details>
      ) : null}
    </section>
  )
}
