// Thin SVG renderer over the sunburst lib layout (contract:
// layoutSunburst(tree, {size}) -> {size, cx, cy, sectors[]}). All geometry
// lives in the lib; this component only emits DOM, wires interactions
// (click / hover / tap via sector.meta) and applies the selection dimming
// (opacity 0.25, as in the original prototype).

// Radius factors of the original renderCircularDiagram (decorative rings and
// the center disc are not part of the lib contract, so they are redrawn here
// with the same constants).
const INNER_FACTOR = 0.08
const MAX_FACTOR = 0.48
const RING_COUNT = 2 // root -> poles -> competences

function sectorProps(sector) {
  const props = { d: sector.d, fill: sector.fill }
  if (sector.opacity !== undefined) props.opacity = sector.opacity
  if (sector.fillOpacity !== undefined) props.fillOpacity = sector.fillOpacity
  if (sector.stroke !== undefined) props.stroke = sector.stroke
  if (sector.strokeWidth !== undefined) props.strokeWidth = sector.strokeWidth
  if (sector.strokeDasharray !== undefined) props.strokeDasharray = sector.strokeDasharray
  return props
}

/**
 * @param {{
 *   layout: {size: number, cx: number, cy: number, sectors: Array<object>} | null,
 *   selectedId?: string | null,   // meta.id of the selected sector (dims the others)
 *   onSelect?: (meta: object | null) => void,
 *   onHover?: (meta: object | null) => void,
 *   label?: string,               // accessible name of the diagram
 * }} props
 */
export default function Sunburst({ layout, selectedId = null, onSelect, onHover, label }) {
  if (!layout) return null
  const { size, cx, cy, sectors } = layout
  const innerRadius = size * INNER_FACTOR
  const maxRadius = size * MAX_FACTOR
  const ringWidth = (maxRadius - innerRadius) / RING_COUNT

  const rings = []
  for (let i = 0; i <= RING_COUNT; i += 1) {
    rings.push(innerRadius + i * ringWidth)
  }

  // role="group" (et non "img") : les secteurs sont focusables au clavier et
  // doivent rester exposés à l'arbre d'accessibilité.
  return (
    <svg
      className="sunburst"
      viewBox={`0 0 ${size} ${size}`}
      role="group"
      aria-label={label ?? 'Diagramme de compétences'}
      onClick={() => onSelect?.(null)}
    >
      <defs>
        <radialGradient id="centerGradient">
          <stop offset="70%" stopColor="#fdf2f8" />
          <stop offset="100%" stopColor="#fdf2f8" />
        </radialGradient>
        <pattern
          id="hatch"
          patternUnits="userSpaceOnUse"
          width="6"
          height="6"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="6" stroke="#94a3b8" strokeWidth="1.5" opacity="0.5" />
        </pattern>
      </defs>

      {rings.map((radius) => (
        <circle
          key={radius}
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#000"
          strokeWidth="0.5"
          strokeOpacity="0.1"
          strokeDasharray="2,2"
          pointerEvents="none"
        />
      ))}

      {sectors.map((sector, index) => {
        const meta = sector.meta ?? {}
        const interactive = meta.kind === 'pole' || meta.kind === 'competence'
        const dimmed = interactive && selectedId != null && meta.id !== selectedId
        const className = [sector.class, dimmed ? 'dimmed' : null].filter(Boolean).join(' ')
        return (
          <path
            key={index}
            {...sectorProps(sector)}
            // Dimming de la sélection comme l'original (les :hover CSS en
            // !important reprennent la main sur ce style inline).
            style={dimmed ? { opacity: 0.25 } : undefined}
            className={className || undefined}
            data-kind={meta.kind}
            data-id={meta.id}
            pointerEvents={interactive ? undefined : 'none'}
            // Accessibilité : secteur = bouton, focusable au clavier,
            // Entrée / Espace = sélection (tap = sélection au tactile).
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? meta.id : undefined}
            onClick={
              interactive
                ? (event) => {
                    event.stopPropagation()
                    onSelect?.(meta)
                  }
                : undefined
            }
            onKeyDown={
              interactive
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      onSelect?.(meta)
                    }
                  }
                : undefined
            }
            onMouseEnter={interactive ? () => onHover?.(meta) : undefined}
            onMouseLeave={interactive ? () => onHover?.(null) : undefined}
            onFocus={interactive ? () => onHover?.(meta) : undefined}
            onBlur={interactive ? () => onHover?.(null) : undefined}
          >
            {interactive && meta.id ? <title>{meta.id}</title> : null}
          </path>
        )
      })}

      <circle
        className="sunburst-center"
        cx={cx}
        cy={cy}
        r={innerRadius}
        fill="url(#centerGradient)"
        stroke="#ddd"
        role="button"
        tabIndex={0}
        aria-label="Réinitialiser la sélection"
        onClick={(event) => {
          event.stopPropagation()
          onSelect?.(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.stopPropagation()
            onSelect?.(null)
          }
        }}
      />
    </svg>
  )
}
