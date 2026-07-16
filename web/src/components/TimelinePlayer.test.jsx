import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import TimelinePlayer from './TimelinePlayer.jsx'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete window.matchMedia
})

const feuilles = [
  { iso: '2026-01-05', label: '05/01/2026', ordre: 0 },
  { iso: '2026-01-07', label: '07/01/2026', ordre: 1 },
  { iso: '2026-01-12', label: '12/01/2026', ordre: 2 },
  { iso: '2026-01-19', label: '19/01/2026', ordre: 3 },
]
const evolution = [
  { date: '2026-01-05', score_total: 10.2, etablies: 5 },
  { date: '2026-01-07', score_total: 22.6, etablies: 9 },
  { date: '2026-01-12', score_total: 31.1, etablies: 12 },
  { date: '2026-01-19', score_total: 45.9, etablies: 20 },
]

// Cumul de compétences sur la carte par trame (monotone), comme MergeView le
// compte sur ses arbres précalculés.
const cumulative = [5, 11, 16, 23]

/** Hôte contrôlé : frameIndex vit chez le parent, comme dans MergeView. */
function Host({ initial = 0, suspended = false, onChange }) {
  const [frameIndex, setFrameIndex] = useState(initial)
  return (
    <TimelinePlayer
      feuilles={feuilles}
      frameIndex={frameIndex}
      onFrameChange={(i) => {
        setFrameIndex(i)
        onChange?.(i)
      }}
      evolution={evolution}
      cumulative={cumulative}
      suspended={suspended}
    />
  )
}

const playButton = () => screen.getByRole('button', { name: /Lancer la lecture|Mettre la lecture en pause/ })
const slider = () => screen.getByRole('slider', { name: 'Position dans les feuilles du portfolio' })

function mockReducedMotion(matches) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
}

describe('TimelinePlayer', () => {
  beforeEach(() => vi.useFakeTimers())

  it('rend les contrôles, le scrubber (aria-valuetext = label) et le compteur live', () => {
    render(<Host initial={1} />)
    expect(playButton().getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Première feuille' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Dernière feuille' })).toBeDefined()
    const range = slider()
    expect(range.value).toBe('1')
    expect(range.max).toBe('3')
    expect(range.getAttribute('aria-valuetext')).toBe('07/01/2026')
    // Compteur : cumul sur la carte (cumulative[frame]) + score du jour
    // (evolution[frame]) — aucun recalcul dans le composant.
    expect(screen.getByTestId('timeline-counter').textContent).toBe(
      '11 compétences sur la carte · score du jour 23',
    )
    expect(screen.getByText(/Feuille 2 \/ 4 — 07\/01\/2026/)).toBeDefined()
  })

  it('lecture : avance d une trame par tick, aria-pressed, et s arrête en fin de plage', () => {
    const onChange = vi.fn()
    render(<Host initial={0} onChange={onChange} />)
    fireEvent.click(playButton())
    expect(playButton().getAttribute('aria-pressed')).toBe('true')
    act(() => vi.advanceTimersByTime(400))
    expect(onChange).toHaveBeenLastCalledWith(1)
    act(() => vi.advanceTimersByTime(400))
    expect(onChange).toHaveBeenLastCalledWith(2)
    act(() => vi.advanceTimersByTime(400))
    expect(onChange).toHaveBeenLastCalledWith(3)
    // Fin de plage : la lecture s'arrête, plus aucun tick.
    expect(playButton().getAttribute('aria-pressed')).toBe('false')
    act(() => vi.advanceTimersByTime(2000))
    expect(onChange).toHaveBeenCalledTimes(3)
    expect(slider().value).toBe('3')
  })

  it('pause : le timer est coupé, annonce polie à la pause (pas à chaque tick)', () => {
    const onChange = vi.fn()
    render(<Host initial={0} onChange={onChange} />)
    fireEvent.click(playButton())
    act(() => vi.advanceTimersByTime(400))
    const live = document.querySelector('[aria-live="polite"]')
    expect(live.textContent).toBe('') // aucune annonce pendant la lecture
    fireEvent.click(playButton()) // pause
    expect(playButton().getAttribute('aria-pressed')).toBe('false')
    expect(live.textContent).toContain('Pause : 07/01/2026')
    act(() => vi.advanceTimersByTime(2000))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('scrubber : déplace la trame et met la lecture en pause', () => {
    const onChange = vi.fn()
    render(<Host initial={0} onChange={onChange} />)
    fireEvent.click(playButton())
    fireEvent.change(slider(), { target: { value: '2' } })
    expect(onChange).toHaveBeenLastCalledWith(2)
    expect(playButton().getAttribute('aria-pressed')).toBe('false')
    expect(slider().getAttribute('aria-valuetext')).toBe('12/01/2026')
    act(() => vi.advanceTimersByTime(2000))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('boutons pas à pas et bornes début/fin', () => {
    render(<Host initial={1} />)
    fireEvent.click(screen.getByRole('button', { name: 'Feuille suivante' }))
    expect(slider().value).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: 'Feuille précédente' }))
    expect(slider().value).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: 'Dernière feuille' }))
    expect(slider().value).toBe('3')
    fireEvent.click(screen.getByRole('button', { name: 'Première feuille' }))
    expect(slider().value).toBe('0')
    fireEvent.click(screen.getByRole('button', { name: 'Feuille précédente' }))
    expect(slider().value).toBe('0') // borné à 0
  })

  it('relecture depuis la fin : play sur la dernière trame repart de 0', () => {
    const onChange = vi.fn()
    render(<Host initial={3} onChange={onChange} />)
    fireEvent.click(playButton())
    expect(onChange).toHaveBeenLastCalledWith(0)
    act(() => vi.advanceTimersByTime(400))
    expect(onChange).toHaveBeenLastCalledWith(1)
  })

  it('vitesse : le réglage change la cadence du tick', () => {
    const onChange = vi.fn()
    render(<Host initial={0} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Vitesse de lecture' }), {
      target: { value: '150' },
    })
    fireEvent.click(playButton())
    act(() => vi.advanceTimersByTime(150))
    expect(onChange).toHaveBeenLastCalledWith(1)
    act(() => vi.advanceTimersByTime(150))
    expect(onChange).toHaveBeenLastCalledWith(2)
  })

  it('prefers-reduced-motion coupe la lecture automatique (navigation manuelle conservée)', () => {
    mockReducedMotion(true)
    const onChange = vi.fn()
    render(<Host initial={0} onChange={onChange} />)
    const play = playButton()
    expect(play.disabled).toBe(true)
    fireEvent.click(play)
    act(() => vi.advanceTimersByTime(2000))
    expect(onChange).not.toHaveBeenCalled()
    // Le pas à pas et le scrubber restent utilisables.
    fireEvent.click(screen.getByRole('button', { name: 'Feuille suivante' }))
    expect(onChange).toHaveBeenLastCalledWith(1)
  })

  it('suspended (secteur sélectionné/survolé) met la lecture en pause', () => {
    const onChange = vi.fn()
    const { rerender } = render(<Host key="host" initial={0} suspended={false} onChange={onChange} />)
    fireEvent.click(playButton())
    act(() => vi.advanceTimersByTime(400))
    expect(onChange).toHaveBeenCalledTimes(1)
    rerender(<Host key="host" initial={0} suspended onChange={onChange} />)
    expect(playButton().getAttribute('aria-pressed')).toBe('false')
    act(() => vi.advanceTimersByTime(2000))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('démontage : le timer est nettoyé', () => {
    const onChange = vi.fn()
    const { unmount } = render(<Host initial={0} onChange={onChange} />)
    fireEvent.click(playButton())
    unmount()
    act(() => vi.advanceTimersByTime(2000))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('moins de deux feuilles : rien à animer, rendu nul', () => {
    const { container } = render(
      <TimelinePlayer feuilles={[{ iso: '2026-01-05' }]} frameIndex={0} onFrameChange={() => {}} />,
    )
    expect(container.firstChild).toBe(null)
  })

  // Cas ajoutés (jeu de tests timeline animée) : l'ANNONCE de fin de plage
  // (l'arrêt seul était testé) et le réarmement du timer quand la vitesse
  // change PENDANT la lecture.

  it('fin de plage : annonce aria-live « Fin de la lecture : … » avec le cumul de la dernière feuille', () => {
    render(<Host initial={0} />)
    fireEvent.click(playButton())
    const live = document.querySelector('[aria-live="polite"]')
    expect(live.textContent).toBe('') // rien pendant la lecture
    act(() => vi.advanceTimersByTime(400)) // -> 1
    act(() => vi.advanceTimersByTime(400)) // -> 2
    expect(live.textContent).toBe('')
    act(() => vi.advanceTimersByTime(400)) // -> 3 (dernière trame) : arrêt + annonce
    expect(playButton().getAttribute('aria-pressed')).toBe('false')
    expect(live.textContent).toBe(
      'Fin de la lecture : 19/01/2026 — 23 compétences sur la carte',
    )
  })

  it('changement de vitesse PENDANT la lecture : le timer est réarmé à la nouvelle cadence', () => {
    const onChange = vi.fn()
    render(<Host initial={0} onChange={onChange} />)
    fireEvent.click(playButton())
    act(() => vi.advanceTimersByTime(400))
    expect(onChange).toHaveBeenLastCalledWith(1)
    // Passage en Rapide (150 ms) en cours de lecture : la lecture continue…
    fireEvent.change(screen.getByRole('combobox', { name: 'Vitesse de lecture' }), {
      target: { value: '150' },
    })
    expect(playButton().getAttribute('aria-pressed')).toBe('true')
    // … et le tick suivant survient à 150 ms (pas 400).
    act(() => vi.advanceTimersByTime(150))
    expect(onChange).toHaveBeenLastCalledWith(2)
    expect(onChange).toHaveBeenCalledTimes(2)
    act(() => vi.advanceTimersByTime(150))
    expect(onChange).toHaveBeenLastCalledWith(3)
  })
})
