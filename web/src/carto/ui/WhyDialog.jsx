// Interface ultime — « Pourquoi cette surface ? » (spec §1.7, §6.1 ; touche w).
// Liste, pour la sélection, les traces et journées qui fondent l'angle, la
// confiance qui fonde la hauteur, les formules, et signale l'épaisseur
// minimale quand elle s'écarte du strict proportionnel.

import { useRef } from 'react'
import { explainSurface } from '../core/state.js'
import { formatShort } from '../core/dates.js'
import { useFocusTrap } from './DayModal.jsx'

const fmt = (n, d = 2) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—')

/**
 * @param {{refl: object, state: object, selection: object, layout: object,
 *   zoomLayout?: object | null, // pôle ouvert sur 360° (D-45) : la part dans ce pôle est dite aussi
 *   onClose: () => void, onOpenDay: (d: string, code?: string) => void}} props
 */
export function WhyDialog({ refl, state, selection, layout, zoomLayout = null, onClose, onOpenDay }) {
  const ref = useRef(null)
  useFocusTrap(ref, true, onClose)
  const e = explainSurface(state, selection)
  // Le secteur DESSINÉ : celui du pôle ouvert s'il y figure, sinon celui du soleil principal.
  const drawn = (l) => (selection.type === 'competency' ? l?.competencies.find((s) => s.code === selection.code) : l?.poles.find((s) => s.num === selection.num))
  const opened = selection.type === 'competency' ? drawn(zoomLayout) : null
  const sector = opened ?? drawn(layout)
  const poleOpened = opened ? refl.poleByNum.get(opened.pole) : null
  const title =
    selection.type === 'competency'
      ? `${selection.code} ${refl.compByCode.get(selection.code)?.name ?? ''}`
      : refl.poleByNum.get(selection.num)?.name ?? `Pôle ${selection.num}`

  return (
    <div className="carto-modal-backdrop" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div ref={ref} className="carto-modal carto-modal--narrow" role="dialog" aria-modal="true" aria-labelledby="carto-why-title">
        <header className="carto-modal-head">
          <div>
            <p className="carto-detail-kicker">Pourquoi cette surface ?</p>
            <h2 id="carto-why-title">{title}</h2>
          </div>
          <button type="button" className="carto-btn" onClick={onClose}>
            Fermer
          </button>
        </header>
        {!e ? (
          <p className="carto-muted">Cette sélection n’a pas de secteur dans l’état affiché.</p>
        ) : (
          <div className="carto-why">
            <dl className="carto-stats">
              <div>
                <dt>Angle</dt>
                <dd>
                  {fmt(e.theta, 1)}° ({fmt((e.theta / 360) * 100, 1)} %)
                </dd>
              </div>
              <div>
                <dt>Points</dt>
                <dd>
                  {fmt(e.intensity)} sur {fmt(e.totalIntensity)}
                </dd>
              </div>
              <div>
                {/* Un pôle n'a pas de hauteur à lui : son arc occupe tout l'anneau intérieur (D-58). */}
                <dt>{e.type === 'pole' ? 'Confiance moyenne' : 'Confiance (hauteur)'}</dt>
                <dd>{fmt(e.confidence)}</dd>
              </div>
              {opened ? (
                <div>
                  <dt>Dans le pôle ouvert</dt>
                  <dd>
                    {fmt(opened.thetaInPole, 1)}° ({fmt((opened.thetaInPole / 360) * 100, 1)} %)
                  </dd>
                </div>
              ) : null}
            </dl>
            {opened ? (
              <p className="carto-small carto-muted">
                Le pôle {poleOpened?.name ?? opened.pole} est ouvert sur 360° : ses compétences se partagent tout le cercle, chacune selon sa part des
                points du pôle (θ = 360° × points / points du pôle). La hauteur ne change pas.
              </p>
            ) : null}
            {sector?.floored ? (
              <p className="carto-note">
                Épaisseur minimale d’affichage appliquée :{' '}
                {typeof e.confidence === 'number' ? 'sa confiance est si faible que le secteur serait invisible.' : 'la confiance du jury n’est pas connue, le secteur n’aurait pas de hauteur.'} Sa
                surface dessinée dépasse ici le strict proportionnel.
              </p>
            ) : null}
            {sector?.widened ? (
              <p className="carto-note">
                {e.type === 'pole'
                  ? 'Largeur minimale d’affichage appliquée à au moins une de ses compétences, si peu pourvue en points qu’elle serait invisible : l’angle dessiné du pôle dépasse ici le strict proportionnel (l’angle exact est indiqué ci-dessus).'
                  : 'Largeur minimale d’affichage appliquée : ses points sont si peu nombreux que le secteur serait invisible. Son angle dessiné dépasse ici le strict proportionnel (l’angle exact est indiqué ci-dessus).'}
              </p>
            ) : null}
            <h3>Formules</h3>
            <ul className="carto-formulas">
              {Object.values(e.formulas).map((f) => (
                <li key={f}>
                  <code>{f}</code>
                </li>
              ))}
            </ul>
            {e.type === 'competency' ? (
              <>
                <h3>Traces qui fondent l’angle ({e.traces.length})</h3>
                <table className="carto-why-table">
                  <thead>
                    <tr>
                      <th scope="col">Journée</th>
                      <th scope="col">Rôle</th>
                      <th scope="col">Confiance du verdict</th>
                      <th scope="col">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.traces.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <button type="button" className="carto-link-btn" onClick={() => onOpenDay(t.date, selection.code)}>
                            {formatShort(t.date)}
                          </button>
                        </td>
                        <td>{t.role}</td>
                        <td>{fmt(t.confidence)}</td>
                        <td>{fmt(t.weight, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="carto-small carto-muted">
                  La confiance est celle du verdict du jury sur cette journée : ce n’est ni un niveau de maîtrise ni une force.
                </p>
              </>
            ) : (
              <>
                <h3>Compétences du pôle</h3>
                <table className="carto-why-table">
                  <thead>
                    <tr>
                      <th scope="col">Compétence</th>
                      <th scope="col">Angle</th>
                      <th scope="col">Confiance</th>
                      <th scope="col">Journées</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.members.map((m) => (
                      <tr key={m.code}>
                        <td>
                          {m.code} {refl.compByCode.get(m.code)?.name}
                        </td>
                        <td>{fmt(m.theta, 1)}°</td>
                        <td>{fmt(m.confidence)}</td>
                        <td>{m.days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
