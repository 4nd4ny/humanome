// Interface ultime — le soleil (spec §5.4–§5.6, §6.1).
//
// Deux anneaux FIXES : pôles à l'intérieur, compétences à l'extérieur. Angle =
// part des points (Σ des poids des traces) ; hauteur = confiance cumulée
// (r_ext² = r_int² + k·C) ; la surface est donc proportionnelle à confiance × points. Ordre angulaire du
// référentiel, départ à −90°. Cercles guides pointillés = échelle de confiance
// (0,25 · 0,5 · 0,75 · 1), pas des niveaux. Secteurs de renvoi hachurés sans
// changer leur surface. Disque central = retour à la racine / désélection.

import { useId, useMemo } from 'react'
import { poleFill } from './colors.js'
import { poleShortName } from '../core/referential.js'
import { formatShort } from '../core/dates.js'

const TAU = Math.PI * 2
const fmt = (n, d = 2) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : '—')

/** Point polaire (repère SVG, y vers le bas). */
const pt = (r, a) => `${(r * Math.cos(a)).toFixed(3)} ${(r * Math.sin(a)).toFixed(3)}`

/**
 * Secteur annulaire tracé avec DEUX arcs (jamais un arc unique de 360°, §5.4) ;
 * un tour complet est un anneau exact (règle de remplissage evenodd).
 */
export function sectorPath(r0, r1, a0, a1) {
  if (a1 - a0 >= TAU - 1e-9) {
    const outer = `M ${pt(r1, a0)} A ${r1} ${r1} 0 1 1 ${pt(r1, a0 + Math.PI)} A ${r1} ${r1} 0 1 1 ${pt(r1, a0)} Z`
    if (r0 <= 0) return outer
    return `${outer} M ${pt(r0, a0)} A ${r0} ${r0} 0 1 0 ${pt(r0, a0 + Math.PI)} A ${r0} ${r0} 0 1 0 ${pt(r0, a0)} Z`
  }
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M ${pt(r0, a0)} A ${r0} ${r0} 0 ${large} 1 ${pt(r0, a1)} L ${pt(r1, a1)} A ${r1} ${r1} 0 ${large} 0 ${pt(r1, a0)} Z`
}

const PATTERN_SHAPES = {
  solid: null,
  diagonal: <path d="M0 6 L6 0" />,
  'diagonal-reverse': <path d="M0 0 L6 6" />,
  dots: <circle cx="3" cy="3" r="1.1" />,
  cross: <path d="M0 0 L6 6 M6 0 L0 6" />,
  horizontal: <path d="M0 3 L6 3" />,
  vertical: <path d="M3 0 L3 6" />,
  grid: <path d="M0 3 L6 3 M3 0 L3 6" />,
}

/**
 * @param {{
 *   refl: object, state: object, layout: object, geometry: object,
 *   selection?: {type: 'competency', code: string} | {type: 'pole', num: number} | null,
 *   hover?: {type: string, code?: string, num?: number} | null,
 *   highlightCodes?: Set<string> | null,
 *   reinforced?: boolean, label?: string, caption?: string, compact?: boolean,
 *   onSelect?: (target: object | null) => void, onHover?: (target: object | null) => void,
 * }} props
 */
export function Sun({ refl, state, layout, geometry, selection = null, hover = null, highlightCodes = null, reinforced = false, label, caption, compact = false, onSelect = () => {}, onHover = () => {} }) {
  const uid = useId().replace(/:/g, '')
  const R = geometry.competencies.rOut
  const pad = 6
  const box = R + pad

  const guides = useMemo(() => {
    const out = []
    for (const ring of [geometry.poles, geometry.competencies]) {
      for (const c of [0.25, 0.5, 0.75, 1]) out.push(Math.sqrt(ring.rIn ** 2 + geometry.k * c))
      out.push(ring.rIn)
    }
    return out
  }, [geometry])

  const isSelected = (t) =>
    selection && ((selection.type === 'competency' && t.type === 'competency' && selection.code === t.code) || (selection.type === 'pole' && t.type === 'pole' && selection.num === t.num))
  const related = (t) => {
    if (!selection) return true
    if (selection.type === 'pole') return t.type === 'pole' ? t.num === selection.num : t.pole === selection.num
    if (selection.type === 'competency') return t.type === 'competency' ? t.code === selection.code : t.num === refl.compByCode.get(selection.code)?.pole
    return true
  }

  const hoverName = (() => {
    const t = hover ?? selection
    if (!t) return null
    if (t.type === 'pole') {
      const p = refl.poleByNum.get(t.num)
      const s = state.poles.get(t.num)
      return { title: p?.name ?? `Pôle ${t.num}`, sub: s ? `${fmt((s.theta / 360) * 100, 1)} % du soleil · confiance ${fmt(s.confidence)}` : '' }
    }
    const c = refl.compByCode.get(t.code)
    const s = state.competencies.get(t.code)
    return { title: c ? `${c.code} ${c.name}` : t.code, sub: s ? `${fmt((s.theta / 360) * 100, 1)} % · confiance ${fmt(s.confidence)} · ${s.days.length} j.` : '' }
  })()

  const empty = layout.competencies.length === 0
  const summary = label ?? `Soleil : ${layout.competencies.length} compétence${layout.competencies.length > 1 ? 's' : ''} observée${layout.competencies.length > 1 ? 's' : ''}, ${state.dates.length} journée${state.dates.length > 1 ? 's' : ''}`

  const sectorProps = (target, name, extra) => ({
    tabIndex: compact ? -1 : 0,
    role: 'button',
    'aria-pressed': Boolean(isSelected(target)),
    'aria-label': name,
    onClick: (e) => {
      e.stopPropagation()
      onSelect(isSelected(target) ? null : target)
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelect(isSelected(target) ? null : target)
      }
    },
    onMouseEnter: () => onHover(target),
    onMouseLeave: () => onHover(null),
    onFocus: () => onHover(target),
    onBlur: () => onHover(null),
    ...extra,
  })

  return (
    <figure className={`carto-sun${compact ? ' carto-sun--compact' : ''}${selection ? ' carto-sun--selecting' : ''}`}>
      <svg
        viewBox={`${-box} ${-box} ${2 * box} ${2 * box}`}
        role="group"
        aria-label={summary}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onSelect(null)
        }}
      >
        <defs>
          <pattern id={`${uid}-hatch`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
            <rect width="5" height="5" fill="transparent" />
            <line x1="0" y1="0" x2="0" y2="5" className="carto-sun-hatch" />
          </pattern>
          {reinforced
            ? refl.poles.map((p) => (
                <pattern key={p.num} id={`${uid}-p${p.num}`} patternUnits="userSpaceOnUse" width="6" height="6">
                  <g className="carto-sun-motif">{PATTERN_SHAPES[p.pattern]}</g>
                </pattern>
              ))
            : null}
        </defs>

        {guides.map((r, i) => (
          <circle key={i} r={r} className={`carto-sun-guide${i % 5 === 4 ? ' carto-sun-guide--base' : ''}`} />
        ))}

        {layout.poles.map((s) => {
          const p = refl.poleByNum.get(s.num)
          const target = { type: 'pole', num: s.num }
          const name = `Pôle ${p.name} : ${fmt((s.theta / 360) * 100, 1)} % du soleil, confiance ${fmt(s.confidence)}${s.needsReviewOnly ? ', en renvoi' : ''}. Entrée : sélectionner.`
          return (
            <g key={`p${s.num}`} className={`carto-sun-sector${related(target) ? '' : ' is-dimmed'}${isSelected(target) ? ' is-selected' : ''}`}>
              <path d={sectorPath(s.rIn, s.rOut, s.a0, s.a1)} fill={poleFill(p.color)} fillRule="evenodd" {...sectorProps(target, name)} />
              {reinforced ? <path d={sectorPath(s.rIn, s.rOut, s.a0, s.a1)} fill={`url(#${uid}-p${s.num})`} fillRule="evenodd" pointerEvents="none" /> : null}
              {s.needsReviewOnly ? <path d={sectorPath(s.rIn, s.rOut, s.a0, s.a1)} fill={`url(#${uid}-hatch)`} fillRule="evenodd" pointerEvents="none" /> : null}
              {!compact && s.a1 - s.a0 > 0.42 ? (
                <text
                  className="carto-sun-pole-label"
                  x={((s.rIn + s.rOut) / 2) * Math.cos((s.a0 + s.a1) / 2)}
                  y={((s.rIn + s.rOut) / 2) * Math.sin((s.a0 + s.a1) / 2)}
                  aria-hidden="true"
                >
                  {poleShortName(p)}
                </text>
              ) : null}
            </g>
          )
        })}

        {layout.competencies.map((s) => {
          const p = refl.poleByNum.get(s.pole)
          const c = refl.compByCode.get(s.code)
          const target = { type: 'competency', code: s.code }
          const st = state.competencies.get(s.code)
          const name = `${s.code} ${c.name} : ${fmt((s.theta / 360) * 100, 1)} % du soleil, confiance ${fmt(s.confidence)}, ${st?.days.length ?? 0} journée${(st?.days.length ?? 0) > 1 ? 's' : ''}${s.status === 'needs_review' ? ', en renvoi au cartographe' : ''}. Entrée : sélectionner.`
          const lit = highlightCodes?.has(s.code)
          return (
            <g key={s.code} className={`carto-sun-sector${related({ ...target, pole: s.pole }) ? '' : ' is-dimmed'}${isSelected(target) ? ' is-selected' : ''}${lit ? ' is-lit' : ''}`}>
              <path d={sectorPath(s.rIn, s.rOut, s.a0, s.a1)} fill={p.color} fillRule="evenodd" {...sectorProps(target, name)} />
              {reinforced ? <path d={sectorPath(s.rIn, s.rOut, s.a0, s.a1)} fill={`url(#${uid}-p${s.pole})`} fillRule="evenodd" pointerEvents="none" /> : null}
              {s.status === 'needs_review' ? <path d={sectorPath(s.rIn, s.rOut, s.a0, s.a1)} fill={`url(#${uid}-hatch)`} fillRule="evenodd" pointerEvents="none" /> : null}
            </g>
          )
        })}

        <g
          className="carto-sun-center"
          role="button"
          tabIndex={compact ? -1 : 0}
          aria-label="Centre : tout désélectionner"
          onClick={() => onSelect(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelect(null)
            }
          }}
        >
          <circle r={geometry.center} />
          {empty ? (
            <text className="carto-sun-center-text" y="4">∅</text>
          ) : (
            <text className="carto-sun-center-text" y="5">{state.dates.length} j.</text>
          )}
        </g>
      </svg>
      <figcaption className="carto-sun-caption" aria-live="polite">
        {hoverName ? (
          <>
            <strong>{hoverName.title}</strong>
            <span>{hoverName.sub}</span>
          </>
        ) : empty ? (
          <span>Aucune compétence observée pour cette sélection de journées.</span>
        ) : (
          <span>{caption ?? summary}</span>
        )}
      </figcaption>
    </figure>
  )
}

/**
 * Équivalent textuel du soleil (§6.1) : compétence × journées, pour les
 * lecteurs d'écran et l'impression. Replié par défaut.
 */
export function SunTable({ refl, state, open = false }) {
  const rows = refl.competencies.filter((c) => state.competencies.has(c.code))
  return (
    <details className="carto-sun-table" open={open || undefined}>
      <summary>Tableau équivalent ({rows.length} compétence{rows.length > 1 ? 's' : ''})</summary>
      <table>
        <caption>Part du soleil, confiance cumulée et journées observées, dans l’ordre du référentiel</caption>
        <thead>
          <tr>
            <th scope="col">Compétence</th>
            <th scope="col">Pôle</th>
            <th scope="col">Part</th>
            <th scope="col">Confiance</th>
            <th scope="col">Statut</th>
            <th scope="col">Journées</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const s = state.competencies.get(c.code)
            return (
              <tr key={c.code}>
                <th scope="row">
                  {c.code} {c.name}
                </th>
                <td>{poleShortName(refl.poleByNum.get(c.pole))}</td>
                <td>{fmt((s.theta / 360) * 100, 1)} %</td>
                <td>{fmt(s.confidence)}</td>
                <td>{s.status === 'established' ? 'établie' : 'renvoi'}</td>
                <td>{s.days.map(formatShort).join(', ')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </details>
  )
}
