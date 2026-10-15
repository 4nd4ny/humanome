// Interface ultime — panneau de détail (spec §6.4) selon la sélection :
// compétence, pôle, ou aucune (résumé du profil et légende de l'encodage).

import { formatLong, formatShort } from '../core/dates.js'
import { DEFAULT_PARAMS, GUIDE_LEVELS } from '../core/formulas.js'
import { poleShortName } from '../core/referential.js'
import { returnToPoles } from './Sun.jsx'
import { poleVars } from './colors.js'
import { usePalette } from './palette.js'

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const fmt = (n, d = 2) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—')
const pct = (theta) => `${fmt((theta / 360) * 100, 1)} %`

/** Nombres écrits à la française, en liste : « 0,5, 0,75 et 1 ». */
const frList = (values) => {
  const words = values.map((v) => v.toLocaleString('fr-FR'))
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} et ${words.at(-1)}` : (words[0] ?? '')
}

/**
 * Légende de l'encodage du soleil (§5, §6.1).
 * @param {{poleRing?: boolean, origin?: number}} props poleRing : l'anneau des pôles est dessiné (D-58) ;
 *   origin : départ de la hauteur, la confiance du bord intérieur (D-65)
 */
export function SunLegend({ poleRing = true, origin = DEFAULT_PARAMS.heightOrigin } = {}) {
  const from = origin.toLocaleString('fr-FR')
  return (
    <dl className="carto-legend">
      <dt>Angle</dt>
      <dd>part des points de la compétence dans le total : un point par preuve, α (½ par défaut) par indice. Plus il y a de traces, plus le secteur est large. La confiance du jury n’y entre pas.</dd>
      <dt>Hauteur</dt>
      <dd>
        confiance moyenne du jury dans ses verdicts, de {from} au pied du secteur à 1 au bord extérieur. Les cercles pointillés marquent{' '}
        {frList(GUIDE_LEVELS.filter((c) => c > origin + 1e-9))}. Ce n’est ni un niveau de maîtrise ni une force.
      </dd>
      <dt>Surface</dt>
      <dd>{origin > 0 ? `points × hauteur (la confiance comptée à partir de ${from}).` : 'confiance × points.'}</dd>
      {poleRing ? (
        <>
          <dt>Anneau intérieur</dt>
          <dd>les pôles, chacun sur la largeur de ses compétences : il les range, il ne mesure rien.</dd>
        </>
      ) : null}
      <dt>Hachures</dt>
      <dd>compétence en renvoi au cartographe (le jury n’a pas tranché).</dd>
      <dt>Absence de secteur</dt>
      <dd>aucune trace dans cette sélection. L’absence d’une trace ne signifie pas l’absence de la compétence.</dd>
    </dl>
  )
}

/**
 * @param {{
 *   refl: object, dataset: object, state: object, selection: object | null, t: string | null,
 *   onSelect: (t: object | null) => void, onOpenDay: (d: string, code?: string) => void, onWhy: () => void,
 *   zoom?: number | null, onZoom?: (num: number | null) => void, // pôle ouvert sur 360° (journal D-45)
 *   legend?: boolean, // légende de l'encodage sous le résumé (dans la cartographie, elle a sa tuile : D-53)
 *   children?: React.ReactNode,
 * }} props children : sections supplémentaires (traces, jury… en P2)
 */
export function DetailPanel({ refl, dataset, state, selection, t, onSelect, onOpenDay, onWhy, zoom = null, onZoom, legend = true, children }) {
  const palette = usePalette()
  if (selection?.type === 'competency') {
    const meta = refl.compByCode.get(selection.code)
    const c = state.competencies.get(selection.code)
    const pole = refl.poleByNum.get(meta?.pole)
    if (!meta) return <p className="carto-muted">Compétence inconnue du référentiel.</p>
    return (
      <article className="carto-detail carto-pole" aria-label={`Détail : ${meta.code} ${meta.name}`} style={poleVars(pole?.color, palette)}>
        <header className="carto-detail-head">
          <p className="carto-detail-kicker">
            <span aria-hidden="true">{pole?.symbol}</span> {pole?.name}
          </p>
          <h2>
            <span className="carto-code">{meta.code}</span> {meta.name}
          </h2>
          {meta.description ? <p className="carto-detail-desc">{meta.description}</p> : null}
          <a className="carto-link" href={`#/referentiel/${encodeURIComponent(meta.code)}`}>
            Voir dans le référentiel
          </a>
        </header>
        {c ? (
          <>
            <dl className="carto-stats">
              <div>
                <dt>Part du soleil</dt>
                <dd>{pct(c.theta)}</dd>
              </div>
              <div>
                <dt>Confiance moyenne</dt>
                <dd>{fmt(c.confidence)}</dd>
              </div>
              <div>
                <dt>Preuves · indices</dt>
                <dd>
                  {c.proofs} · {c.hints}
                </dd>
              </div>
              <div>
                <dt>Journées</dt>
                <dd>{c.days.length}</dd>
              </div>
            </dl>
            {c.status === 'needs_review' ? <p className="carto-note">Toutes les observations retenues sont des renvois au cartographe.</p> : null}
            <button type="button" className="carto-btn carto-btn--quiet" onClick={onWhy}>
              Pourquoi cette surface ? <kbd>w</kbd>
            </button>
            <section className="carto-detail-days" aria-label="Journées où la compétence est observée">
              <h3>Journées observées</h3>
              <ul className="carto-chips">
                {c.days.map((d) => (
                  <li key={d}>
                    <button type="button" className="carto-chip-btn" onClick={() => onOpenDay(d, meta.code)} title={formatLong(d)}>
                      {formatShort(d)}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <p className="carto-muted">Pas de trace de cette compétence dans la sélection actuelle{t ? ` jusqu’au ${formatLong(t)}` : ''}.</p>
        )}
        {children}
      </article>
    )
  }

  if (selection?.type === 'pole') {
    const pole = refl.poleByNum.get(selection.num)
    const p = state.poles.get(selection.num)
    return (
      <article className="carto-detail carto-pole" aria-label={`Détail : pôle ${pole?.name}`} style={poleVars(pole?.color, palette)}>
        <header className="carto-detail-head">
          <p className="carto-detail-kicker">Pôle</p>
          <h2>
            <span aria-hidden="true">{pole?.symbol}</span> {pole?.name}
          </h2>
        </header>
        {p ? (
          <>
            <dl className="carto-stats">
              <div>
                <dt>Part du soleil</dt>
                <dd>{pct(p.theta)}</dd>
              </div>
              <div>
                <dt>Confiance (pondérée)</dt>
                <dd>{fmt(p.confidence)}</dd>
              </div>
              <div>
                <dt>Compétences observées</dt>
                <dd>{p.codes.length}</dd>
              </div>
              <div>
                <dt>En renvoi seulement</dt>
                <dd>{p.codes.filter((code) => state.competencies.get(code).status === 'needs_review').length}</dd>
              </div>
            </dl>
            <p className="carto-detail-actions">
              <button type="button" className="carto-btn carto-btn--quiet" onClick={onWhy}>
                Pourquoi cette part ? <kbd>w</kbd>
              </button>
              {onZoom ? (
                // Ouvrir le pôle sur 360° dans le soleil (D-45) — comme un double-clic sur son arc.
                zoom === selection.num ? (
                  <button type="button" className="carto-btn carto-btn--quiet" onClick={() => onZoom(null)}>
                    {capitalize(returnToPoles(state).phrase)}
                  </button>
                ) : (
                  <button type="button" className="carto-btn carto-btn--quiet" onClick={() => onZoom(selection.num)}>
                    Ouvrir ce pôle sur 360°
                  </button>
                )
              ) : null}
            </p>
            <ul className="carto-member-list">
              {p.codes.map((code) => {
                const c = state.competencies.get(code)
                return (
                  <li key={code}>
                    <button type="button" className="carto-list-label" onClick={() => onSelect({ type: 'competency', code })}>
                      <span className="carto-code">{code}</span> {refl.compByCode.get(code).name}
                    </button>
                    <span className="carto-count">
                      {pct(c.theta)} · C {fmt(c.confidence)} · {c.days.length} j.
                    </span>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <p className="carto-muted">Aucune compétence de ce pôle n’est observée dans la sélection actuelle.</p>
        )}
        {children}
      </article>
    )
  }

  // Aucune sélection : résumé de profil.
  const active = dataset.days.filter((d) => d.active)
  const first = state.dates[0]
  const last = state.dates.at(-1)
  return (
    <article className="carto-detail" aria-label="Résumé du profil">
      <header className="carto-detail-head">
        <p className="carto-detail-kicker">Profil</p>
        <h2>{dataset.title}</h2>
      </header>
      <dl className="carto-stats">
        <div>
          <dt>Période</dt>
          <dd>{first ? `${formatShort(first)} → ${formatShort(last)}` : '—'}</dd>
        </div>
        <div>
          <dt>Journées retenues</dt>
          <dd>
            {state.dates.length} / {active.length} cochées
          </dd>
        </div>
        <div>
          <dt>Compétences observées</dt>
          <dd>{state.competencies.size}</dd>
        </div>
      </dl>
      {/* Ni total des points ni compétences non instruites (court-circuit) : des mots de
          l'analyse, pas de la personne (journal D-62). */}
      {state.outOfReferential.length > 0 ? (
        <p className="carto-note">
          Hors référentiel ({refl.label}) : {state.outOfReferential.join(', ')} — conservées, sans secteur.
        </p>
      ) : null}
      {children}
      {legend ? (
        <>
          <SunLegend />
          <p className="carto-small carto-muted">
            Pôles : {refl.poles.map((p) => `${p.symbol} ${poleShortName(p)}`).join('  ')}
          </p>
        </>
      ) : null}
    </article>
  )
}
