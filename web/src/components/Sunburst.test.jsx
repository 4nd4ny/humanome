import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import Sunburst from './Sunburst.jsx'

afterEach(cleanup)

// Layout factice conforme au contrat layoutSunburst -> {size, cx, cy, sectors}.
const layout = {
  size: 400,
  cx: 200,
  cy: 200,
  sectors: [
    {
      d: 'M 0 0 L 1 1 Z',
      fill: '#2563eb',
      class: 'sector',
      fillOpacity: '0.8',
      stroke: '#fff',
      meta: { kind: 'pole', id: 'TETE — Penser & Comprendre' },
    },
    {
      d: 'M 1 1 L 2 2 Z',
      fill: '#1f2937',
      class: 'gray-sector',
      fillOpacity: '0.4',
      meta: { kind: 'gray', id: 'gray-1' },
    },
    {
      d: 'M 2 2 L 3 3 Z',
      fill: '#2563eb',
      class: 'sector',
      meta: { kind: 'competence', id: '1.01 — Pensée Critique', code: '1.01', niveau: 5 },
    },
    {
      d: 'M 3 3 L 4 4 Z',
      fill: 'url(#hatch)',
      class: 'renvoi-sector',
      strokeDasharray: '4,3',
      meta: { kind: 'competence', id: '1.02 — Autre', code: '1.02', niveau: -1 },
    },
  ],
}

function paths(container) {
  return [...container.querySelectorAll('path')]
}

describe('Sunburst', () => {
  it('rend un secteur SVG par entrée du layout, avec ses attributs', () => {
    const { container } = render(<Sunburst layout={layout} />)
    const rendered = paths(container)
    expect(rendered).toHaveLength(4)
    expect(rendered[0].getAttribute('d')).toBe('M 0 0 L 1 1 Z')
    expect(rendered[0].getAttribute('fill')).toBe('#2563eb')
    expect(rendered[0].getAttribute('fill-opacity')).toBe('0.8')
    expect(rendered[3].getAttribute('stroke-dasharray')).toBe('4,3')
    expect(container.querySelector('svg').getAttribute('viewBox')).toBe('0 0 400 400')
  })

  it('ne rend rien sans layout', () => {
    const { container } = render(<Sunburst layout={null} />)
    expect(container.querySelector('svg')).toBe(null)
  })

  it('clic sur un secteur -> onSelect(meta) ; les gris sont inertes', () => {
    const onSelect = vi.fn()
    const { container } = render(<Sunburst layout={layout} onSelect={onSelect} />)
    const rendered = paths(container)

    fireEvent.click(rendered[2])
    expect(onSelect).toHaveBeenCalledWith(layout.sectors[2].meta)

    // Secteur gris : jamais sélectionné — le clic retombe sur le fond
    // (pointer-events: none dans l'original) et désélectionne.
    fireEvent.click(rendered[1])
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('clic sur le fond ou le centre -> onSelect(null)', () => {
    const onSelect = vi.fn()
    const { container } = render(<Sunburst layout={layout} onSelect={onSelect} />)

    fireEvent.click(container.querySelector('svg'))
    expect(onSelect).toHaveBeenLastCalledWith(null)

    fireEvent.click(container.querySelector('.sunburst-center'))
    expect(onSelect).toHaveBeenLastCalledWith(null)
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it('survol -> onHover(meta) puis onHover(null)', () => {
    const onHover = vi.fn()
    const { container } = render(<Sunburst layout={layout} onHover={onHover} />)
    const competence = paths(container)[2]

    fireEvent.mouseEnter(competence)
    expect(onHover).toHaveBeenLastCalledWith(layout.sectors[2].meta)
    fireEvent.mouseLeave(competence)
    expect(onHover).toHaveBeenLastCalledWith(null)
  })

  it('selected -> les autres secteurs interactifs sont éteints à 0.25', () => {
    const { container } = render(
      <Sunburst layout={layout} selectedId="1.01 — Pensée Critique" />,
    )
    const rendered = paths(container)

    // Sélectionné : pas de dimming.
    expect(rendered[2].classList.contains('dimmed')).toBe(false)
    expect(rendered[2].style.opacity).toBe('')

    // Les autres secteurs interactifs sont éteints (opacité 0.25, comme l'original).
    for (const index of [0, 3]) {
      expect(rendered[index].classList.contains('dimmed')).toBe(true)
      expect(rendered[index].style.opacity).toBe('0.25')
    }

    // Les fonds gris ne sont jamais concernés.
    expect(rendered[1].classList.contains('dimmed')).toBe(false)
  })
})
