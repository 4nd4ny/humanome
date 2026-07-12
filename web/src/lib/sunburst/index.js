// humanome sunburst lib — public API (DOM-free ESM).
// Port of the sunburst rendering of assets-existants/merge-prototype/cartographie.html
// as a pure library; strict geometric parity with the original is enforced by
// parity.test.js against reference/original-render-400x400.json.

export {
  createSectorPath,
  getMaxDepth,
  NIVEAUX,
  GRAY_LEVELS,
  RENVOI_RADIUS_FACTOR,
} from './geometry.js'
export { buildMergeTree, buildDayTree, confidenceQuintile } from './build-tree.js'
export { layoutSunburst } from './layout.js'
