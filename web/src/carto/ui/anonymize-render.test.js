// P5 — « la démo anonymisée garde ses surlignages » : le lecteur cherche les
// passages dans le texte AFFICHÉ (Markdown rendu). Remplacer dans le Markdown
// puis l'afficher doit donc donner le même texte qu'afficher puis remplacer.
import { describe, expect, it } from 'vitest'
import { makeReplacer } from '../core/anonymize.js'
import { collapseText } from '../core/highlight.js'
import { renderPortfolio } from './highlight-dom.js'

const shown = (text) => collapseText(renderPortfolio({ text }).text).collapsed

describe('remplacer puis afficher = afficher puis remplacer', () => {
  it('liens Markdown, liens entre chevrons (échappés ou non), courriels, emphase, titres, listes', () => {
    const md = [
      '# Journal de Sam',
      '',
      'Avec **Sam** et _Noé_, voir [le site de Sam](https://sam.example.org/page) puis [https://b.org](https://b.org).',
      '',
      '- écrire à sam.martin@ecole.ch ou <https://c.org/x> ;',
      '- relire \\<https://d.org\\> avec SAM2 et sam.',
      '',
      '> Noé : « www.e.org/x, 079 123 45 67 ».',
    ].join('\n')
    const { apply } = makeReplacer({ dictionary: [{ from: 'Sam', to: 'Personne A' }, { from: 'Noé', to: 'Personne B' }] })
    expect(shown(apply(md))).toBe(collapseText(apply(renderPortfolio({ text: md }).text)).collapsed)
    expect(shown(apply(md))).not.toMatch(/sam|noé|example|ecole/u)
  })
})
