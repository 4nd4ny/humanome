// Interface ultime — passage animé entre deux dispositions du soleil : un pôle
// qui s'ouvre sur 360°, puis qui se referme (journal D-45). Pur, sans DOM : le
// soleil l'appelle à chaque trame.

const TAU = Math.PI * 2

/** Départ et arrivée en douceur. */
export function easeInOutCubic(x) {
  const t = Math.min(1, Math.max(0, x))
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

const middle = (s) => (s.a0 + s.a1) / 2

/**
 * Angle où s'écrit le nom d'un secteur de pôle : celui qu'impose la
 * disposition (`labelAngle`), sinon le haut pour un anneau entier, sinon le
 * milieu de l'arc.
 */
export function poleLabelAngle(s) {
  if (typeof s.labelAngle === 'number') return s.labelAngle
  return s.a1 - s.a0 >= TAU - 1e-6 ? -Math.PI / 2 : middle(s)
}

/**
 * Disposition intermédiaire entre `from` (e = 0) et `to` (e = 1). Un secteur
 * présent des deux côtés glisse et s'élargit (ou se resserre) : c'est l'arc du
 * pôle qui s'ouvre. Celui qui disparaît s'efface sur place ; celui qui apparaît
 * se montre à sa place. Les angles d'arrivée sont décalés d'un nombre entier de
 * tours pour que le pôle commun tourne le moins possible.
 *
 * Chaque secteur rendu porte `opacity` (1 pour un secteur qui reste, une
 * fois arrivé),
 * `transient` (il apparaît ou disparaît : ni cliquable, ni atteignable au
 * clavier pendant le passage) et `labelAngle` (le nom du pôle glisse de son
 * milieu d'arc vers le haut de l'anneau, sans saut à la fin). Ceux qui
 * disparaissent ou apparaissent viennent en premier, pour être dessinés sous
 * ceux qui restent : l'arc qui se referme découvre les autres pôles.
 *
 * @param {{poles: object[], competencies: object[]}} from
 * @param {{poles: object[], competencies: object[]}} to
 * @param {number} e avancement, de 0 à 1 (déjà adouci)
 */
export function interpolateSunLayout(from, to, e) {
  const fromPoles = new Map(from.poles.map((s) => [s.num, s]))
  const anchor = to.poles.find((s) => fromPoles.has(s.num))
  const offset = anchor ? TAU * Math.round((middle(fromPoles.get(anchor.num)) - middle(anchor)) / TAU) : 0
  const lerp = (a, b) => a + (b - a) * e

  const blend = (before, after, key) => {
    const beforeByKey = new Map(before.map((s) => [key(s), s]))
    const afterKeys = new Set(after.map(key))
    const leaving = []
    const arriving = []
    const staying = []
    for (const s of before) if (!afterKeys.has(key(s))) leaving.push({ ...s, labelAngle: poleLabelAngle(s), opacity: (s.opacity ?? 1) * (1 - e), transient: true })
    for (const s of after) {
      const f = beforeByKey.get(key(s))
      if (!f) {
        arriving.push({ ...s, a0: s.a0 + offset, a1: s.a1 + offset, labelAngle: poleLabelAngle(s) + offset, opacity: e, transient: true })
      } else {
        staying.push({
          ...s,
          a0: lerp(f.a0, s.a0 + offset),
          a1: lerp(f.a1, s.a1 + offset),
          rOut: lerp(f.rOut, s.rOut),
          labelAngle: lerp(poleLabelAngle(f), poleLabelAngle(s) + offset),
          // Un passage inversé en cours de route repart de l'opacité affichée.
          opacity: lerp(f.opacity ?? 1, 1),
          transient: false,
        })
      }
    }
    return [...leaving, ...arriving, ...staying]
  }

  return {
    poles: blend(from.poles, to.poles, (s) => s.num),
    competencies: blend(from.competencies, to.competencies, (s) => s.code),
  }
}
