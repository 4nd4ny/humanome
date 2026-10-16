// État affiché état(S, t) et disposition du soleil — critères d'acceptation P0
// (spec §14) : 1 compétence = 360° ; l'ajout d'une 2ᵉ la fait passer à 180° ;
// angle dessiné = θ et hauteur dessinée proportionnelle à C (journal D-70, à la
// place de aire = θ·k·C/2).
import { describe, expect, it } from 'vitest'
import { computeDayState, computeState, explainSurface, layoutPole, layoutSun } from './state.js'
import { normalizeReferential } from './referential.js'
import { ringGeometry, toRadians } from './formulas.js'
import { indexDataset, miniReferential } from '../test/fixtures.js'
import { chooseVariant, setActive } from './ops.js'

const ref = normalizeReferential(miniReferential())
const geometry = ringGeometry({ outerRadius: 200, centerRadius: 24, gap: 4 })

describe('critères d’acceptation P0', () => {
  it('une seule compétence observée occupe 360°', () => {
    const ds = indexDataset([{ date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve'] }] }])
    const s = computeState(ds, { ref })
    expect(s.competencies.get('1.01').theta).toBeCloseTo(360)
    expect(s.poles.get(1).theta).toBeCloseTo(360)
  })

  it('l’ajout d’une deuxième compétence (même intensité) la fait passer à 180°', () => {
    const ds = indexDataset([
      { date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve'] }] },
      { date: '2025-12-23', verdicts: [{ code: '2.01', confidence: 0.8, roles: ['preuve'] }] },
    ])
    const before = computeState(ds, { ref, until: '2025-12-22' })
    expect(before.competencies.get('1.01').theta).toBeCloseTo(360)
    const after = computeState(ds, { ref })
    expect(after.competencies.get('1.01').theta).toBeCloseTo(180)
    expect(after.competencies.get('2.01').theta).toBeCloseTo(180)
  })

  it('chaque compétence dessinée : angle = θ, hauteur proportionnelle à C (D-70) ; un pôle occupe toute la hauteur de son anneau (D-58)', () => {
    const ds = indexDataset([
      { date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve', 'indice'] }, { code: '1.02', confidence: 0.55, roles: ['indice'] }] },
      { date: '2025-12-23', verdicts: [{ code: '2.01', confidence: 0.9, roles: ['preuve'] }, { code: '1.01', confidence: 0.6, roles: ['indice'] }] },
      { date: '2025-12-24', verdicts: [{ code: '3.02', confidence: 0.3, roles: ['indice', 'indice'] }] },
    ])
    const s = computeState(ds, { ref })
    const layout = layoutSun(s, ref, geometry, { minThickness: 0 })
    const { rIn, rOut } = geometry.competencies
    for (const sector of layout.competencies) {
      expect(sector.a1 - sector.a0).toBeCloseTo(toRadians(sector.theta), 6)
      expect(sector.rIn).toBe(rIn)
      expect(sector.rOut - sector.rIn).toBeCloseTo(sector.confidence * (rOut - rIn), 6)
    }
    for (const pole of layout.poles) {
      // Un élément d'interface, pas une mesure : quelle que soit sa confiance.
      expect([pole.rIn, pole.rOut, pole.floored]).toEqual([geometry.poles.rIn, geometry.poles.rOut, false])
      // Il couvre exactement ses compétences, dans l'ordre du référentiel.
      const own = layout.competencies.filter((c) => c.pole === pole.num)
      expect(pole.a0).toBeCloseTo(own[0].a0)
      expect(pole.a1).toBeCloseTo(own.at(-1).a1)
    }
    expect(new Set(layout.poles.map((p) => p.confidence)).size).toBeGreaterThan(1)
  })

  it('anneau des pôles réglable : masqué à 0, les compétences prennent sa place ; au maximum, plus de compétences', () => {
    const ds = indexDataset([{ date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 1, roles: ['preuve'] }, { code: '2.01', confidence: 0.5, roles: ['preuve'] }] }])
    const s = computeState(ds, { ref })
    const none = ringGeometry({ outerRadius: 200, centerRadius: 24, poleRing: 0, gap: 4 })
    const flat = layoutSun(s, ref, none, { minThickness: 2 })
    expect(flat.poles.every((p) => p.rOut === p.rIn)).toBe(true)
    expect(flat.competencies.every((c) => c.rIn === 24)).toBe(true) // pas d'écart sans anneau des pôles
    expect(flat.competencies.find((c) => c.code === '1.01').rOut).toBeCloseTo(200)
    const full = ringGeometry({ outerRadius: 200, centerRadius: 24, poleRing: 176, gap: 4 })
    const rings = layoutSun(s, ref, full, { minThickness: 2 })
    expect(rings.poles.map((p) => [p.rIn, p.rOut])).toEqual([
      [24, 200],
      [24, 200],
    ])
    // Plus de place pour les feuilles : ni épaisseur minimale, ni débord au-delà du bord.
    expect(rings.competencies.every((c) => c.rIn === 200 && c.rOut === 200 && !c.floored)).toBe(true)
  })
})

describe('état(S, t) (§5.1)', () => {
  const ds = indexDataset([
    { date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve'] }] },
    { date: '2025-12-23', verdicts: [{ code: '2.01', confidence: 0.5, roles: ['indice'] }, { code: '1.01', confidence: 0.4, roles: ['indice'] }] },
    { date: '2025-12-27', verdicts: [{ code: '3.01', confidence: 0.9, roles: ['preuve'] }] },
  ])

  it('t borne les journées retenues (état cumulé jusqu’à t)', () => {
    const s = computeState(ds, { ref, until: '2025-12-23' })
    expect(s.dates).toEqual(['2025-12-22', '2025-12-23'])
    expect(s.competencies.has('3.01')).toBe(false)
  })

  it('t = null : état complet', () => {
    expect(computeState(ds, { ref }).dates).toHaveLength(3)
  })

  it('une journée décochée ne contribue pas', () => {
    const s = computeState(setActive(ds, ['2025-12-27'], false), { ref })
    expect(s.dates).toEqual(['2025-12-22', '2025-12-23'])
    expect(s.competencies.has('3.01')).toBe(false)
  })

  it('un ensemble explicite S remplace les cases cochées', () => {
    const s = computeState(ds, { ref, dates: ['2025-12-27'] })
    expect([...s.competencies.keys()]).toEqual(['3.01'])
  })

  it('points cumulés sur les journées : une preuve (1) + un indice (0,5), rien ne plafonne', () => {
    const c = computeState(ds, { ref }).competencies.get('1.01')
    expect(c.intensity).toBeCloseTo(1 + 0.5)
    expect(c.days).toEqual(['2025-12-22', '2025-12-23'])
    expect(c.proofs).toBe(1)
    expect(c.hints).toBe(1)
  })

  it('C(c) = moyenne des confiances des verdicts qui fournissent des traces', () => {
    expect(computeState(ds, { ref }).competencies.get('1.01').confidence).toBeCloseTo(0.6)
  })

  it('la confiance du jury n’entre pas dans l’angle : mêmes traces, confiances différentes → même angle, hauteurs différentes', () => {
    const s = computeState(
      indexDataset([
        { date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.95, roles: ['preuve', 'indice'] }, { code: '2.01', confidence: 0.2, roles: ['preuve', 'indice'] }] },
      ]),
      { ref },
    )
    expect(s.competencies.get('1.01').theta).toBeCloseTo(180)
    expect(s.competencies.get('2.01').theta).toBeCloseTo(180)
    expect(s.competencies.get('1.01').confidence).toBeCloseTo(0.95)
    expect(s.competencies.get('2.01').confidence).toBeCloseTo(0.2)
  })

  it('plus de traces, plus d’angle : trois preuves contre une → 270° et 90°', () => {
    const s = computeState(
      indexDataset([{ date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.3, roles: ['preuve', 'preuve', 'preuve'] }, { code: '2.01', confidence: 0.9, roles: ['preuve'] }] }]),
      { ref },
    )
    expect(s.competencies.get('1.01').theta).toBeCloseTo(270)
    expect(s.competencies.get('2.01').theta).toBeCloseTo(90)
  })

  it('une confiance inconnue n’efface pas les traces : l’angle compte, la hauteur l’ignore', () => {
    const s = computeState(indexDataset([{ date: '2025-12-22', verdicts: [{ code: '1.01', confidence: null, roles: ['preuve'] }, { code: '2.01', confidence: 0.6, roles: ['preuve'] }] }]), { ref })
    expect(s.competencies.get('1.01').theta).toBeCloseTo(180)
    expect(s.competencies.get('1.01').confidence).toBeNull()
    const layout = layoutSun(s, ref, geometry, { minThickness: 2 })
    const sector = layout.competencies.find((c) => c.code === '1.01')
    expect(sector.floored).toBe(true) // visible malgré tout, épaisseur minimale signalée
    expect(sector.rOut - sector.rIn).toBeCloseTo(2)
  })

  it('un secteur trop étroit pour être vu reçoit la largeur minimale, prise sur les autres ; θ reste exact', () => {
    const s = computeState(
      indexDataset([{ date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.8, roles: Array(400).fill('preuve') }, { code: '2.01', confidence: 0.8, roles: ['indice'] }] }]),
      { ref },
    )
    const exact = s.competencies.get('2.01').theta
    expect(exact).toBeCloseTo((360 * 0.5) / 400.5)
    const layout = layoutSun(s, ref, geometry, { minArc: 4 })
    const narrow = layout.competencies.find((c) => c.code === '2.01')
    const wide = layout.competencies.find((c) => c.code === '1.01')
    expect(narrow.widened).toBe(true)
    expect(wide.widened).toBe(false)
    // Le pôle d'une compétence élargie le dit aussi (« Pourquoi cette surface ? »).
    expect(layout.poles.find((p) => p.num === 2).widened).toBe(true)
    expect(layout.poles.find((p) => p.num === 1).widened).toBe(false)
    expect((narrow.a1 - narrow.a0) * geometry.competencies.rOut).toBeCloseTo(4)
    expect(narrow.theta).toBeCloseTo(exact)
    expect(layout.competencies.at(-1).a1 - layout.competencies[0].a0).toBeCloseTo(2 * Math.PI)
    // Sans largeur minimale : la part exacte.
    const plain = layoutSun(s, ref, geometry).competencies.find((c) => c.code === '2.01')
    expect(plain.widened).toBe(false)
    expect(plain.a1 - plain.a0).toBeCloseTo((exact * Math.PI) / 180)
  })

  it('l’ordre angulaire est celui du référentiel, jamais celui des tailles', () => {
    const big = indexDataset([
      { date: '2025-12-22', verdicts: [{ code: '3.02', confidence: 0.95, roles: ['preuve', 'preuve', 'preuve'] }, { code: '1.02', confidence: 0.2, roles: ['indice'] }] },
    ])
    const layout = layoutSun(computeState(big, { ref }), ref, geometry)
    expect(layout.competencies.map((c) => c.code)).toEqual(['1.02', '3.02'])
    expect(layout.competencies[0].a0).toBeCloseTo(-Math.PI / 2)
    expect(layout.competencies[1].a1).toBeCloseTo(-Math.PI / 2 + 2 * Math.PI)
  })
})

describe('statuts (§5.2, §4.2)', () => {
  it('non établie et court-circuit ne fournissent pas de traces ; le court-circuit est compté à part', () => {
    const ds = indexDataset([
      {
        date: '2025-12-22',
        verdicts: [
          { code: '1.01', status: 'not_established', confidence: 0.9, roles: ['indice'] },
          { code: '1.02', status: 'established', courtCircuit: true, confidence: 0.9, roles: ['preuve'] },
          { code: '2.01', status: 'needs_review', confidence: 0.5, roles: ['indice'] },
        ],
      },
    ])
    const s = computeState(ds, { ref })
    expect([...s.competencies.keys()]).toEqual(['2.01'])
    expect(s.competencies.get('2.01').status).toBe('needs_review')
    expect(s.excluded).toMatchObject({ notEstablished: 1, courtCircuit: 1 })
    expect(s.poles.get(2).needsReviewOnly).toBe(true)
  })

  it('une compétence établie au moins une fois n’est plus « renvoi » (règle optimiste)', () => {
    const ds = indexDataset([
      { date: '2025-12-22', verdicts: [{ code: '2.01', status: 'needs_review', confidence: 0.5, roles: ['indice'] }] },
      { date: '2025-12-23', verdicts: [{ code: '2.01', status: 'established', confidence: 0.7, roles: ['preuve'] }] },
    ])
    expect(computeState(ds, { ref }).competencies.get('2.01').status).toBe('established')
  })

  it('une compétence hors référentiel n’a pas de secteur et est listée à part', () => {
    const ds = indexDataset([{ date: '2025-12-22', verdicts: [{ code: '8.01', confidence: 0.9, roles: ['preuve'] }, { code: '1.01', confidence: 0.9, roles: ['preuve'] }] }])
    const s = computeState(ds, { ref })
    expect(s.outOfReferential).toEqual(['8.01'])
    expect(s.competencies.get('1.01').theta).toBeCloseTo(360)
  })

  it('une journée à arbitrer ou « à examiner » ne contribue pas', () => {
    const ds = indexDataset([{ date: '2025-12-22', verdicts: [{ code: '1.01' }] }])
    ds.days[0].variantChoice = 'pending'
    expect(computeState(ds, { ref }).dates).toEqual([])
    const ds2 = chooseVariant(indexDataset([{ date: '2025-12-22', verdicts: [{ code: '1.01' }] }]), '2025-12-22', null)
    expect(ds2.days[0].variantChoice).toBe('examine')
    expect(computeState(ds2, { ref }).dates).toEqual([])
  })
})

describe('journée seule et explication', () => {
  const ds = indexDataset([
    { date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve'] }] },
    { date: '2025-12-23', verdicts: [{ code: '2.01', confidence: 0.5, roles: ['indice'] }] },
  ])

  it('la modale du jour calcule les angles de ce seul jour', () => {
    const s = computeDayState(ds, '2025-12-23', { ref })
    expect([...s.competencies.keys()]).toEqual(['2.01'])
    expect(s.competencies.get('2.01').theta).toBeCloseTo(360)
  })

  it('« Pourquoi cette surface ? » liste traces, journées, confiance et formules', () => {
    const s = computeState(ds, { ref })
    const e = explainSurface(s, { type: 'competency', code: '1.01' })
    expect(e.traces).toHaveLength(1)
    expect(e.traces[0]).toMatchObject({ date: '2025-12-22', role: 'preuve', weight: 1, confidence: 0.8 })
    expect(e.days).toEqual(['2025-12-22'])
    expect(e.formulas.intensity).toMatch(/points = Σ w/)
    // Sans départ (géométrie seule) : la hauteur dessinée est proportionnelle à C (D-70) ; plus de formule d'aire.
    expect(explainSurface(s, { type: 'competency', code: '1.01' }, { origin: 0 }).formulas).toMatchObject({ radius: expect.stringMatching(/r_ext = r_int \+ C · \(R − r_int\)/) })
    expect(e.formulas.area).toBeUndefined()
    const p = explainSurface(s, { type: 'pole', num: 2 })
    expect(p.members).toEqual([{ code: '2.01', theta: expect.any(Number), confidence: 0.5, days: 1 }])
  })
})

describe('pôle ouvert sur 360° (layoutPole, journal D-45)', () => {
  // Pôle 1 : 1.01 (3 preuves) et 1.02 (1 preuve) ; pôle 2 : 2.01 (1 preuve).
  const ds = indexDataset([
    { date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve', 'preuve', 'preuve'] }, { code: '1.02', confidence: 0.4, roles: ['preuve'] }] },
    { date: '2025-12-23', verdicts: [{ code: '2.01', confidence: 0.9, roles: ['preuve'] }] },
  ])
  const s = computeState(ds, { ref })
  const full = layoutSun(s, ref, geometry)
  const rad = (deg) => (deg * Math.PI) / 180

  it('ses seules compétences se partagent tout le cercle, selon leur part des points du pôle, à partir de −90°', () => {
    const z = layoutPole(s, ref, geometry, 1)
    expect(z.zoom).toBe(1)
    expect(z.competencies.map((c) => c.code)).toEqual(['1.01', '1.02'])
    const [a, b] = z.competencies
    expect(a.thetaInPole).toBeCloseTo(270) // 3 points sur 4
    expect(b.thetaInPole).toBeCloseTo(90)
    expect(a.a0).toBeCloseTo(-Math.PI / 2)
    expect(a.a1 - a.a0).toBeCloseTo(rad(270))
    expect(b.a0).toBeCloseTo(a.a1) // contigus, dans l'ordre du référentiel
    expect(b.a1).toBeCloseTo(-Math.PI / 2 + 2 * Math.PI)
    // L'angle du soleil principal reste dit (θ) : la part dans le pôle est en plus.
    expect(a.theta).toBeCloseTo(s.competencies.get('1.01').theta)
  })

  it('la hauteur ne change pas : mêmes rayons que dans le soleil principal ; l’anneau intérieur est le pôle entier, sur toute sa hauteur', () => {
    const z = layoutPole(s, ref, geometry, 1)
    for (const c of z.competencies) {
      const same = full.competencies.find((x) => x.code === c.code)
      expect(c.rIn).toBe(same.rIn)
      expect(c.rOut).toBeCloseTo(same.rOut)
    }
    expect(z.poles).toHaveLength(1)
    const [ring] = z.poles
    expect(ring.num).toBe(1)
    expect(ring.a1 - ring.a0).toBeCloseTo(2 * Math.PI)
    expect(ring.rOut).toBeCloseTo(full.poles.find((p) => p.num === 1).rOut)
    expect(ring.rOut).toBe(geometry.poles.rOut)
  })

  it('une compétence du pôle trop étroite reçoit la largeur minimale, signalée ; la somme reste un tour', () => {
    const many = indexDataset([
      { date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.8, roles: Array.from({ length: 400 }, () => 'preuve') }, { code: '1.02', confidence: 0.8, roles: ['indice'] }] },
    ])
    const z = layoutPole(computeState(many, { ref }), ref, geometry, 1, { minArc: 4 })
    const narrow = z.competencies.find((c) => c.code === '1.02')
    expect(narrow.widened).toBe(true)
    expect((narrow.a1 - narrow.a0) * geometry.competencies.rOut).toBeCloseTo(4)
    expect(narrow.thetaInPole).toBeLessThan(0.5) // l'exact reste dit
    expect(z.competencies.at(-1).a1 - z.competencies[0].a0).toBeCloseTo(2 * Math.PI)
    expect(z.poles[0].widened).toBe(true)
  })

  it('un pôle sans compétence observée (ou inconnu) donne un soleil vide', () => {
    expect(layoutPole(s, ref, geometry, 3)).toEqual({ poles: [], competencies: [], zoom: 3 })
    expect(layoutPole(s, ref, geometry, 9)).toEqual({ poles: [], competencies: [], zoom: 9 })
  })
})
