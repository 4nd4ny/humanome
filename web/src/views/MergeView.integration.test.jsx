// Traçabilité (exigence timeline animée) : « lancer une animation et voir la
// cartographie se construire avec le temps, sur les 59 feuilles de la démo »
// — preuve d'intégration SANS fake : MergeView rendue avec le VRAI
// web/public/data/demo/merge.json et la VRAIE lib sunburst
// (src/lib/sunburst/index.js). La dernière trame reproduit les 331 paths de
// la parité (parity.test.js), le scrub reconstruit la carte cumulée à date,
// le compteur « N compétences sur la carte » suit le cumul monotone 11 -> 54,
// et l'aller-retour de scrub restitue le DOM initial à l'identique.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import MergeView from './MergeView.jsx'
import * as sunburstLib from '../lib/sunburst/index.js'
import { getDemoMerge, getReferentiel } from '../data/load.js'

afterEach(cleanup)

const mergeDoc = getDemoMerge()
const referentiel = getReferentiel()

const slider = () =>
  screen.getByRole('slider', { name: 'Position dans les feuilles du portfolio' })
const counter = () => screen.getByTestId('timeline-counter')

function renderView() {
  return render(<MergeView mergeDoc={mergeDoc} referentiel={referentiel} lib={sunburstLib} />)
}

/** Signature DOM du sunburst : d|fill de chaque <path>, dans l'ordre d'émission. */
function domSignature(container) {
  return [...container.querySelectorAll('svg.sunburst path')]
    .map((p) => `${p.getAttribute('d')}|${p.getAttribute('fill')}`)
    .join('\n')
}

describe('MergeView + merge.json réel + lib réelle — timeline animée (démo 59 feuilles)', () => {
  it('rendu initial (dernière trame) : exactement les 331 paths de layoutSunburst(buildMergeTree(doc))', () => {
    const { container } = renderView()
    const svg = container.querySelector('svg.sunburst')
    // Même taille que la vue (useDiagramSize) : lue sur le viewBox rendu.
    const size = Number(svg.getAttribute('viewBox').split(' ')[2])
    const expected = sunburstLib.layoutSunburst(sunburstLib.buildMergeTree(mergeDoc), { size })
    const paths = [...container.querySelectorAll('svg.sunburst path')]
    expect(expected.sectors).toHaveLength(331) // la référence de parity.test.js
    expect(paths).toHaveLength(331)
    const mismatches = []
    expected.sectors.forEach((sector, i) => {
      if (
        paths[i].getAttribute('d') !== sector.d ||
        paths[i].getAttribute('fill') !== sector.fill
      ) {
        mismatches.push({ index: i, expected: sector.d, actual: paths[i].getAttribute('d') })
      }
    })
    expect(mismatches).toEqual([])
  })

  it('scrubber par défaut : max=58, positionné sur la 59e feuille (29/03/2026), compteur final', () => {
    renderView()
    expect(mergeDoc.feuilles).toHaveLength(59)
    const range = slider()
    expect(range.max).toBe('58')
    expect(range.value).toBe('58')
    expect(range.getAttribute('aria-valuetext')).toBe(mergeDoc.feuilles[58].label)
    expect(range.getAttribute('aria-valuetext')).toBe('29/03/2026')
    expect(counter().textContent).toBe('54 compétences sur la carte · score du jour 61')
  })

  it('scrub à la trame 0 : autant de secteurs compétence que evolution_globale[0].etablies (11)', () => {
    const { container } = renderView()
    fireEvent.change(slider(), { target: { value: '0' } })
    expect(mergeDoc.profilMeta.evolution_globale[0].etablies).toBe(11)
    expect(container.querySelectorAll('svg.sunburst path[data-kind="competence"]')).toHaveLength(11)
    // Les 7 pôles sont déjà représentés le premier jour : 7 + 11 x 6 = 73 paths.
    expect(container.querySelectorAll('svg.sunburst path')).toHaveLength(73)
    expect(counter().textContent).toBe('11 compétences sur la carte · score du jour 13')
  })

  it('parité aller-retour : scrub 0 puis retour 58 -> DOM du sunburst identique au rendu initial', () => {
    const { container } = renderView()
    const initial = domSignature(container)
    fireEvent.change(slider(), { target: { value: '0' } })
    expect(domSignature(container)).not.toBe(initial)
    fireEvent.change(slider(), { target: { value: '58' } })
    expect(domSignature(container)).toBe(initial)
  })

  it('compteur cumulé monotone : de 11 (trame 0) à 54 (trame 58) en balayant 0/15/30/45/58', () => {
    renderView()
    const counts = [0, 15, 30, 45, 58].map((frame) => {
      fireEvent.change(slider(), { target: { value: String(frame) } })
      const match = /^(\d+) compétences? sur la carte/.exec(counter().textContent)
      expect(match, `compteur illisible à la trame ${frame}`).not.toBe(null)
      return Number(match[1])
    })
    expect(counts[0]).toBe(11)
    expect(counts.at(-1)).toBe(54)
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1])
    }
  })
})
