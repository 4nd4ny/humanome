// Wiring of the app onto the sunburst lib (web/src/lib/sunburst/), whose API
// contract (buildMergeTree, buildDayTree, layoutSunburst) is enforced by its
// own parity tests. The import is static: the lib is DOM-free pure ESM and is
// bundled with the app (single IIFE chunk, file://-compatible — ADR-003).
// The promise-based accessor is kept as the seam used by useSunburstLib():
// view tests inject a fake module via the `lib` prop instead of calling this.
import * as sunburstLib from '../lib/sunburst/index.js'

/**
 * Provides the sunburst lib module (memoized by the module system itself).
 * @returns {Promise<{buildMergeTree: Function, buildDayTree: Function, layoutSunburst: Function}>}
 */
export function loadSunburstLib() {
  return Promise.resolve(sunburstLib)
}
