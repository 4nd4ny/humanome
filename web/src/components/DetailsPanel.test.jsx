import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import DetailsPanel from './DetailsPanel.jsx'
import mergeDoc from '../../public/data/demo/merge.json'

afterEach(cleanup)

describe('DetailsPanel', () => {
  it('rend titre, description et contenu structuré', () => {
    render(
      <DetailsPanel title="1.01 — Pensée Critique" titleColor="#2563eb" description="Une compétence.">
        <p>Bloc structuré</p>
      </DetailsPanel>,
    )
    const title = screen.getByRole('heading', { name: '1.01 — Pensée Critique' })
    expect(title.style.color).toBe('rgb(37, 99, 235)')
    expect(screen.getByText('Une compétence.')).toBeDefined()
    expect(screen.getByText('Bloc structuré')).toBeDefined()
  })

  it('neutralise un payload hostile <img onerror> dans le HTML narratif (ADR-007)', () => {
    render(
      <DetailsPanel html={'<p>légitime</p><img src="x" onerror="window.__pwnedPanel = true">'} />,
    )
    const narrative = screen.getByTestId('narrative-html')
    expect(narrative.innerHTML).toContain('<p>légitime</p>')
    expect(narrative.innerHTML).not.toContain('onerror')
    expect(window.__pwnedPanel).toBeUndefined()
  })

  it('supprime les <script> du HTML narratif', () => {
    render(<DetailsPanel html={'<script>window.__pwnedPanel2 = true</script><p>texte</p>'} />)
    const narrative = screen.getByTestId('narrative-html')
    expect(narrative.querySelector('script')).toBe(null)
    expect(window.__pwnedPanel2).toBeUndefined()
  })

  it('réécrit un lien réel du corpus vers la route hash interne', () => {
    const competence = mergeDoc.domains
      .flatMap((d) => d.competences)
      .find((c) => c.feedback && c.feedback.includes('feuilles/'))
    expect(competence).toBeDefined()
    const [, date, focus] = competence.feedback.match(
      /feuilles\/(\d{4}-\d{2}-\d{2})\/carto-day\.html\?focus=([\d.]+)/,
    )

    render(<DetailsPanel html={competence.feedback} />)
    const narrative = screen.getByTestId('narrative-html')

    expect(narrative.innerHTML).not.toContain('carto-day.html')
    const rewritten = narrative.querySelector(`a[href="#/jour/${date}?focus=${focus}"]`)
    expect(rewritten).not.toBe(null)
  })

  it('ne rend pas de bloc narratif sans html', () => {
    render(<DetailsPanel title="Sans HTML" />)
    expect(screen.queryByTestId('narrative-html')).toBe(null)
  })
})
