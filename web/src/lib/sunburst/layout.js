// humanome sunburst lib — pure layout (no DOM).
//
// Port of renderCircularDiagram() + renderSectors() from
// assets-existants/merge-prototype/cartographie.html (l.844-1026): instead of
// appending <path> elements to an SVG, layoutSunburst() emits the sectors as a
// flat list, in the EXACT DOM emission order of the original (pole sector,
// then per competence 5 gray bands + the colored sector, recursion inside the
// forEach). Radii, angles (-90 -> 270) and number formatting are identical —
// see parity.test.js. DOM-free ESM module.

import {
  createSectorPath,
  getMaxDepth,
  NIVEAUX,
  GRAY_LEVELS,
  RENVOI_RADIUS_FACTOR,
} from './geometry.js'

/**
 * Lay a sunburst tree (from buildMergeTree/buildDayTree) out as SVG sector
 * descriptors. `tree` is `{ root }` (a bare root node is accepted too).
 * Returns { size, cx, cy, innerRadius, maxRadius, ringWidth, maxDepth,
 * sectors: [{ d, fill, class, stroke?, strokeWidth?, strokeDasharray?,
 * fillOpacity?, meta: { kind: 'pole'|'competence'|'gray', id, code?, niveau?,
 * domainId? } }] }. Renvoi sectors ("renvoi au cartographe", niveau = -1)
 * carry fill 'url(#hatch)': the host SVG must define the hatch pattern
 * (l.872-879 of the original).
 */
export function layoutSunburst(tree, { size = 400 } = {}) {
  const width = size
  const height = size
  const centerX = width / 2
  const centerY = height / 2
  const maxRadius = Math.min(width, height) * 0.48
  const innerRadius = Math.min(width, height) * 0.08

  const base = { size, cx: centerX, cy: centerY, innerRadius, maxRadius, sectors: [] }
  if (!tree || width <= 0 || height <= 0) return { ...base, ringWidth: 0, maxDepth: 0 }

  const root = tree.root ?? tree
  const maxDepth = getMaxDepth(root)
  const ringWidth = (maxRadius - innerRadius) / Math.max(maxDepth, 1)
  const sectors = base.sectors

  function renderSectors(nodes, startA, endA, depth, pColor, pDomainId) {
    const curInR = innerRadius + depth * ringWidth
    const curOutR = innerRadius + (depth + 1) * ringWidth
    let curA = startA
    const total = nodes.reduce((s, n) => s + n.points, 0)

    nodes.forEach((node) => {
      const ang = total > 0 ? (node.points / total) * (endA - startA) : 0
      const end = curA + ang
      const nodeColor = node.color || pColor
      // Poles carry their own id as domainId; leaves inherit their pole's.
      const domainId = node.isLeaf ? pDomainId : node.id

      if (node.isLeaf && node.niveau !== 0) {
        const rDiff = curOutR - curInR

        if (node.niveau === -1) {
          // --- Renvoi au cartographe: hatched, reduced radius, dashed border ---
          const effOutR = curInR + rDiff * RENVOI_RADIUS_FACTOR
          sectors.push({
            d: createSectorPath(centerX, centerY, curInR, effOutR, curA, end),
            fill: 'url(#hatch)',
            class: 'renvoi-sector',
            stroke: nodeColor,
            strokeWidth: '1',
            strokeDasharray: '4,3',
            fillOpacity: '0.6',
            meta: { kind: 'competence', id: node.id, code: node.code || '', niveau: node.niveau, domainId },
          })
        } else {
          // --- Established or orphan competence: normal rendering ---
          // Gray backgrounds (5 bands)
          for (let l = 1; l <= 5; l++) {
            const lIn = curInR + rDiff * (l === 1 ? 0 : NIVEAUX[l - 1].radiusFactor)
            const lOut = curInR + rDiff * NIVEAUX[l].radiusFactor
            sectors.push({
              d: createSectorPath(centerX, centerY, lIn, lOut, curA, end),
              fill: GRAY_LEVELS[l],
              class: 'gray-sector',
              fillOpacity: '0.4',
              meta: { kind: 'gray', id: node.id, code: node.code || '', niveau: l, domainId },
            })
          }

          // Active colored sector
          const effOutR = curInR + rDiff * NIVEAUX[node.niveau].radiusFactor
          const sector = {
            d: createSectorPath(centerX, centerY, curInR, effOutR, curA, end),
            fill: nodeColor,
            class: 'sector',
            fillOpacity: node.statut === 'orpheline' ? '0.7' : '1',
            stroke: '#fff',
            strokeWidth: '0.5',
            meta: { kind: 'competence', id: node.id, code: node.code || '', niveau: node.niveau, domainId },
          }
          if (node.statut === 'orpheline') sector.strokeDasharray = '3,2'
          sectors.push(sector)
        }
      } else if (!node.isLeaf) {
        // --- Poles (parent rings) ---
        sectors.push({
          d: createSectorPath(centerX, centerY, curInR, curOutR, curA, end),
          fill: nodeColor,
          class: 'sector',
          fillOpacity: '0.8',
          stroke: '#fff',
          meta: { kind: 'pole', id: node.id, domainId },
        })
      }

      if (node.children && node.children.length > 0) renderSectors(node.children, curA, end, depth + 1, nodeColor, domainId)
      curA = end
    })
  }

  renderSectors(root.children, -90, 270, 0, null, null)

  return { ...base, ringWidth, maxDepth, sectors }
}
