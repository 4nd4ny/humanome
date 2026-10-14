// Interface ultime — le soleil (spec §5.4–§5.6, §6.1).
//
// Deux anneaux FIXES : pôles à l'intérieur, compétences à l'extérieur. Angle =
// part des points (Σ des poids des traces) ; hauteur = confiance moyenne du jury
// (r_ext² = r_int² + k·C) ; la surface est donc proportionnelle à confiance × points. Ordre angulaire du
// référentiel, départ à −90°. Cercles guides pointillés = échelle de confiance
// (0,25 · 0,5 · 0,75 · 1), pas des niveaux. Secteurs de renvoi hachurés sans
// changer leur surface. Disque central = retour à la racine / désélection.
//
// Pôle ouvert sur 360° (journal D-45) : un double-clic sur un arc de pôle (ou
// « o », Maj+Entrée) l'ouvre — ses seules compétences occupent tout le cercle,
// selon leur part des points du pôle (`layoutPole`) ; le centre (ou Échap, ou
// un nouveau double-clic sur l'anneau du pôle) revient à tous les pôles. L'arc
// s'ouvre et se referme en une demi-seconde, sans animation si le mouvement est
// réduit.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { inkOn, poleFill } from './colors.js'
import { poleShortName } from '../core/referential.js'
import { formatShort } from '../core/dates.js'
import { easeInOutCubic, interpolateSunLayout, poleLabelAngle } from './sunTransition.js'

/** Durée de l'ouverture (et de la fermeture) d'un pôle, en millisecondes. */
export const ZOOM_MS = 480

/** Longueur d'arc minimale (unités du dessin) pour écrire le code d'une compétence. */
const CODE_LABEL_PX = 22

/**
 * Ce que le soleil montre quand le pôle ouvert change : les trames qui mènent
 * de ce qui était à l'écran à la nouvelle disposition, puis celle-ci. Rien
 * d'animé si le mouvement est réduit, ni quand seule la disposition change
 * (date t, cases cochées). Le départ est noté pendant le rendu, pour qu'un
 * double appel des effets (mode strict de React) ne fasse pas sauter l'animation.
 */
function useZoomTransition(layout, zoom, reducedMotion) {
  const shown = useRef(layout)
  // L'arrivée suit la disposition courante (la date t peut bouger pendant le passage).
  const target = useRef(layout)
  const [run, setRun] = useState({ zoom, from: null })
  const [frame, setFrame] = useState(null)
  if (run.zoom !== zoom) {
    setRun({ zoom, from: reducedMotion ? null : shown.current })
    setFrame(null)
  }
  useEffect(() => {
    if (!run.from) return undefined
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f) => setTimeout(() => f(Date.now()), 16)
    const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout
    let start = null
    let id = null
    const step = (now) => {
      if (start === null) start = now
      const x = (now - start) / ZOOM_MS
      if (x >= 1) {
        setFrame(null)
        setRun((r) => (r === run ? { ...r, from: null } : r))
        return
      }
      setFrame(interpolateSunLayout(run.from, target.current, easeInOutCubic(x)))
      id = raf(step)
    }
    id = raf(step)
    return () => cancel(id)
  }, [run])
  const display = run.from ? (frame ?? interpolateSunLayout(run.from, layout, 0)) : layout
  useLayoutEffect(() => {
    shown.current = display
    target.current = layout
  })
  return { display, moving: Boolean(run.from) }
}

/**
 * Le retour d'un pôle ouvert, dit au nombre de pôles du soleil complet (ceux
 * qui ont des points à la date t) : « revenir aux 7 pôles ».
 */
export function returnToPoles(state) {
  const n = state?.poles?.size ?? 0
  return n > 1 ? { phrase: `revenir aux ${n} pôles`, short: `${n} pôles` } : { phrase: 'revenir au soleil entier', short: 'soleil' }
}

const TAU = Math.PI * 2
const fmt = (n, d = 2) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : '—')

/** Point polaire (repère SVG, y vers le bas). */
const pt = (r, a) => `${(r * Math.cos(a)).toFixed(3)} ${(r * Math.sin(a)).toFixed(3)}`

/**
 * Secteur annulaire tracé avec DEUX arcs (jamais un arc unique de 360°, §5.4) ;
 * un tour complet est un anneau exact (règle de remplissage evenodd).
 */
export function sectorPath(r0, r1, a0, a1) {
  // Presque un tour (fin de l'ouverture d'un pôle) : un anneau. Sinon, les deux
  // extrémités de l'arc, arrondies au millième, se confondraient et le
  // navigateur ne tracerait rien.
  if (a1 - a0 >= TAU - 1e-4) {
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
 *   zoom?: number | null,            // pôle ouvert sur 360° (layout = layoutPole), ou null
 *   onZoom?: (num: number | null) => void, // absent : pas d'ouverture de pôle
 *   reducedMotion?: boolean,
 * }} props
 */
export function Sun({ refl, state, layout, geometry, selection = null, hover = null, highlightCodes = null, reinforced = false, label, caption, compact = false, onSelect = () => {}, onHover = () => {}, zoom = null, onZoom, reducedMotion = false }) {
  const uid = useId().replace(/:/g, '')
  const R = geometry.competencies.rOut
  const pad = 6
  const box = R + pad
  const { display, moving } = useZoomTransition(layout, zoom, reducedMotion)
  const zoomable = typeof onZoom === 'function' && !compact
  const zoomed = zoom != null
  const back = returnToPoles(state)
  const zoomPole = zoomed ? refl.poleByNum.get(zoom) : null
  const openPole = (num) => {
    onZoom(num)
    onSelect({ type: 'pole', num })
  }

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

  // Part d'une compétence dans le pôle ouvert (null hors de ce pôle).
  const inPole = (code) => layout.competencies.find((s) => s.code === code)?.thetaInPole ?? null

  const empty = layout.competencies.length === 0
  const count = `${layout.competencies.length} compétence${layout.competencies.length > 1 ? 's' : ''}`
  const backHint = `clic au centre : ${back.phrase}`

  const hoverName = (() => {
    const t = hover ?? selection
    if (!t) return null
    if (t.type === 'pole') {
      const p = refl.poleByNum.get(t.num)
      const s = state.poles.get(t.num)
      // Ouvrir un pôle le sélectionne : la légende garde alors le chemin du retour.
      const open = zoomed && t.num === zoom
      return {
        title: `${p?.name ?? `Pôle ${t.num}`}${open ? ' — ouvert sur 360°' : ''}`,
        sub: [open ? count : null, s ? `${fmt((s.theta / 360) * 100, 1)} % du soleil · confiance ${fmt(s.confidence)}` : null, open ? backHint : null].filter(Boolean).join(' · '),
      }
    }
    const c = refl.compByCode.get(t.code)
    const s = state.competencies.get(t.code)
    const share = zoomed ? inPole(t.code) : null
    return {
      title: c ? `${c.code} ${c.name}` : t.code,
      sub: s ? `${share != null ? `${fmt((share / 360) * 100, 1)} % du pôle · ` : ''}${fmt((s.theta / 360) * 100, 1)} %${share != null ? ' du soleil' : ''} · confiance ${fmt(s.confidence)} · ${s.days.length} j.` : '',
    }
  })()

  const summary = zoomed
    ? `Pôle ${zoomPole?.name ?? zoom} ouvert sur 360° : ${count}. Centre : ${back.phrase}.`
    : label ?? `Soleil : ${count} observée${layout.competencies.length > 1 ? 's' : ''}, ${state.dates.length} journée${state.dates.length > 1 ? 's' : ''}`

  // Ouvrir ou refermer le pôle : double-clic, « o », Maj+Entrée.
  const togglePole = (num) => (zoomed && zoom === num ? onZoom(null) : openPole(num))
  const sectorProps = (target, name, transient) =>
    transient
      ? { 'aria-hidden': true, pointerEvents: 'none' }
      : {
          tabIndex: compact ? -1 : 0,
          role: 'button',
          'aria-pressed': Boolean(isSelected(target)),
          'aria-label': name,
          onClick: (e) => {
            e.stopPropagation()
            onSelect(isSelected(target) ? null : target)
          },
          onDoubleClick:
            zoomable && target.type === 'pole'
              ? (e) => {
                  e.stopPropagation()
                  togglePole(target.num)
                }
              : undefined,
          onKeyDown: (e) => {
            if (zoomable && target.type === 'pole' && !e.ctrlKey && !e.metaKey && !e.altKey && ((e.key === 'Enter' && e.shiftKey) || e.key === 'o' || e.key === 'O')) {
              e.preventDefault()
              togglePole(target.num)
            } else if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelect(isSelected(target) ? null : target)
            }
          },
          onMouseEnter: () => onHover(target),
          onMouseLeave: () => onHover(null),
          onFocus: () => onHover(target),
          onBlur: () => onHover(null),
        }
  // Fondu d'un secteur qui apparaît ou disparaît, multiplié en CSS par
  // l'atténuation d'un secteur hors sélection (sans éclat à la fin du passage).
  const fade = (s) => (s.opacity != null && s.opacity < 1 ? { '--carto-fade': s.opacity } : undefined)

  return (
    <figure className={`carto-sun${compact ? ' carto-sun--compact' : ''}${selection ? ' carto-sun--selecting' : ''}${zoomed ? ' carto-sun--zoomed' : ''}`}>
      <svg
        viewBox={`${-box} ${-box} ${2 * box} ${2 * box}`}
        role="group"
        aria-label={summary}
        onKeyDown={(e) => {
          // Échap désélectionne ; sans sélection, referme le pôle ouvert. Une
          // seule de ces deux choses par appui : l'événement est marqué traité
          // (preventDefault), pour que les raccourcis de la page ne refassent
          // pas le pas suivant avec l'état déjà mis à jour.
          if (e.key === 'Escape') {
            e.preventDefault()
            if (!selection && zoomed && zoomable) onZoom(null)
            else onSelect(null)
          }
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

        {display.poles.map((s) => {
          const p = refl.poleByNum.get(s.num)
          const target = { type: 'pole', num: s.num }
          const how = zoomable ? (zoomed ? ` ; double-clic ou o : ${back.phrase}` : ' ; double-clic ou o : ouvrir ce pôle sur 360°') : ''
          const name = `Pôle ${p.name}${zoomed ? ' ouvert sur 360°' : ''} : ${fmt((s.theta / 360) * 100, 1)} % du soleil, confiance ${fmt(s.confidence)}${s.needsReviewOnly ? ', en renvoi' : ''}. Entrée : sélectionner${how}.`
          // Un anneau entier (pôle ouvert) porte son nom en haut ; pendant
          // l'ouverture, le nom y glisse depuis le milieu de l'arc.
          const labelAngle = poleLabelAngle(s)
          return (
            <g key={`p${s.num}`} className={`carto-sun-sector${related(target) ? '' : ' is-dimmed'}${isSelected(target) ? ' is-selected' : ''}`} style={fade(s)}>
              <path d={sectorPath(s.rIn, s.rOut, s.a0, s.a1)} fill={poleFill(p.color)} fillRule="evenodd" {...sectorProps(target, name, s.transient)} />
              {reinforced ? <path d={sectorPath(s.rIn, s.rOut, s.a0, s.a1)} fill={`url(#${uid}-p${s.num})`} fillRule="evenodd" pointerEvents="none" /> : null}
              {s.needsReviewOnly ? <path d={sectorPath(s.rIn, s.rOut, s.a0, s.a1)} fill={`url(#${uid}-hatch)`} fillRule="evenodd" pointerEvents="none" /> : null}
              {!compact && s.a1 - s.a0 > 0.42 ? (
                <text
                  className="carto-sun-pole-label"
                  x={((s.rIn + s.rOut) / 2) * Math.cos(labelAngle)}
                  y={((s.rIn + s.rOut) / 2) * Math.sin(labelAngle)}
                  aria-hidden="true"
                >
                  {poleShortName(p)}
                </text>
              ) : null}
            </g>
          )
        })}

        {display.competencies.map((s) => {
          const p = refl.poleByNum.get(s.pole)
          const c = refl.compByCode.get(s.code)
          const target = { type: 'competency', code: s.code }
          const st = state.competencies.get(s.code)
          const share = zoomed && s.thetaInPole != null ? `${fmt((s.thetaInPole / 360) * 100, 1)} % du pôle (${fmt((s.theta / 360) * 100, 1)} % du soleil)` : `${fmt((s.theta / 360) * 100, 1)} % du soleil`
          const name = `${s.code} ${c.name} : ${share}, confiance ${fmt(s.confidence)}, ${st?.days.length ?? 0} journée${(st?.days.length ?? 0) > 1 ? 's' : ''}${s.status === 'needs_review' ? ', en renvoi au cartographe' : ''}. Entrée : sélectionner.`
          const lit = highlightCodes?.has(s.code)
          // Pôle ouvert, une fois arrêté : le code de chaque compétence dont l'arc
          // a la place de l'écrire — dans le secteur s'il est assez épais (encre
          // contrastée sur sa couleur), juste au-dessus sinon (encre du fond).
          const thick = s.rOut - s.rIn >= 18
          const rCode = thick ? (s.rIn + s.rOut) / 2 : s.rOut + 8
          const showCode = zoomed && !moving && !compact && (s.a1 - s.a0) * rCode >= CODE_LABEL_PX
          const aMid = (s.a0 + s.a1) / 2
          return (
            <g key={s.code} className={`carto-sun-sector${related({ ...target, pole: s.pole }) ? '' : ' is-dimmed'}${isSelected(target) ? ' is-selected' : ''}${lit ? ' is-lit' : ''}`} style={fade(s)}>
              <path d={sectorPath(s.rIn, s.rOut, s.a0, s.a1)} fill={p.color} fillRule="evenodd" {...sectorProps(target, name, s.transient)} />
              {reinforced ? <path d={sectorPath(s.rIn, s.rOut, s.a0, s.a1)} fill={`url(#${uid}-p${s.pole})`} fillRule="evenodd" pointerEvents="none" /> : null}
              {s.status === 'needs_review' ? <path d={sectorPath(s.rIn, s.rOut, s.a0, s.a1)} fill={`url(#${uid}-hatch)`} fillRule="evenodd" pointerEvents="none" /> : null}
              {showCode ? (
                <text className="carto-sun-code-label" x={rCode * Math.cos(aMid)} y={rCode * Math.sin(aMid)} style={thick ? { fill: inkOn(p.color) } : undefined} aria-hidden="true">
                  {s.code}
                </text>
              ) : null}
            </g>
          )
        })}

        <g
          className="carto-sun-center"
          role="button"
          tabIndex={compact ? -1 : 0}
          aria-label={zoomed ? `Centre : ${back.phrase}` : 'Centre : tout désélectionner'}
          onClick={() => (zoomed ? onZoom(null) : onSelect(null))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              if (zoomed) onZoom(null)
              else onSelect(null)
            }
          }}
        >
          <circle r={geometry.center} />
          {zoomed ? (
            <>
              <text className="carto-sun-center-text carto-sun-center-back" y="-3" aria-hidden="true">
                ↩
              </text>
              <text className="carto-sun-center-text carto-sun-center-small" y="11" aria-hidden="true">
                {back.short}
              </text>
            </>
          ) : empty ? (
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
          <span>{zoomed ? `Aucune compétence de ce pôle n’est observée dans cette sélection de journées. Centre : ${back.phrase}.` : 'Aucune compétence observée pour cette sélection de journées.'}</span>
        ) : zoomed ? (
          <>
            <strong>
              {zoomPole?.name ?? `Pôle ${zoom}`} — ouvert sur 360°
            </strong>
            <span>{[count, caption, backHint].filter(Boolean).join(' · ')}</span>
          </>
        ) : (
          <span>{caption ?? summary}</span>
        )}
      </figcaption>
    </figure>
  )
}

/**
 * Équivalent textuel du soleil (§6.1) : compétence × journées, pour les
 * lecteurs d'écran et l'impression. Replié par défaut ; dans une tuile de la
 * cartographie (`bare`, D-53), déplié, la tuile portant le titre.
 */
export function SunTable({ refl, state, open = false, bare = false }) {
  const rows = refl.competencies.filter((c) => state.competencies.has(c.code))
  const count = `${rows.length} compétence${rows.length > 1 ? 's' : ''}`
  const Box = bare ? 'div' : 'details'
  return (
    <Box className="carto-sun-table" open={bare ? undefined : open || undefined}>
      {bare ? <p className="carto-small carto-muted">{count} observée{rows.length > 1 ? 's' : ''}</p> : <summary>Tableau équivalent ({count})</summary>}
      <table>
        <caption>Part du soleil, confiance moyenne du jury et journées observées, dans l’ordre du référentiel</caption>
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
    </Box>
  )
}
