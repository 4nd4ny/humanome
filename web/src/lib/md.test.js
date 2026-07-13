import { describe, expect, it } from 'vitest'
import { mdToHtml, parseFrontMatter, renderMarkdown } from './md.js'

describe('parseFrontMatter', () => {
  it('extrait les paires clé/valeur et retire le bloc du corps', () => {
    const doc = '---\nparcours: apprenant\nchapitre: 3\ntitre: "Les 7 pôles"\n---\n# Titre\ncorps'
    const { meta, body } = parseFrontMatter(doc)
    expect(meta).toEqual({ parcours: 'apprenant', chapitre: 3, titre: 'Les 7 pôles' })
    expect(body).toBe('# Titre\ncorps')
  })

  it('rend le document intact sans front-matter', () => {
    const { meta, body } = parseFrontMatter('# Titre\ntexte')
    expect(meta).toEqual({})
    expect(body).toBe('# Titre\ntexte')
  })

  it('ne confond pas une règle horizontale en cours de document', () => {
    const { body } = parseFrontMatter('du texte\n---\nsuite')
    expect(body).toBe('du texte\n---\nsuite')
  })
})

describe('mdToHtml — sous-ensemble Markdown', () => {
  it('rend les titres #/##/###', () => {
    expect(mdToHtml('# Un')).toBe('<h1>Un</h1>')
    expect(mdToHtml('## Deux')).toBe('<h2>Deux</h2>')
    expect(mdToHtml('### Trois')).toBe('<h3>Trois</h3>')
  })

  it('rend les listes à puces', () => {
    expect(mdToHtml('- a\n- b')).toBe('<ul>\n<li>a</li>\n<li>b</li>\n</ul>')
  })

  it('rend gras, italique, code inline et liens', () => {
    const html = mdToHtml('Du **gras**, de l’*italique*, du `code` et un [lien](https://x.test/page).')
    expect(html).toContain('<strong>gras</strong>')
    expect(html).toContain('<em>italique</em>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<a href="https://x.test/page">lien</a>')
  })

  it('rend les blockquotes multi-lignes', () => {
    const html = mdToHtml('> **Objectifs**\n>\n> - premier')
    expect(html.startsWith('<blockquote>')).toBe(true)
    expect(html).toContain('<strong>Objectifs</strong>')
    // La liste à l'intérieur de la citation doit rester une VRAIE liste, pas
    // être fusionnée dans le paragraphe qui précède (motif des chapitres de
    // formation : « Objectifs d'apprentissage » suivis d'une liste à puces).
    expect(html).toContain('<ul><li>premier</li></ul>')
  })

  it('rend une liste multi-items à l’intérieur d’une citation (motif « Objectifs d’apprentissage »)', () => {
    const html = mdToHtml(
      '> **Objectifs d’apprentissage**\n>\n> À l’issue de ce chapitre, vous saurez :\n> - un\n> - deux\n> - trois',
    )
    expect(html).toBe(
      '<blockquote><p><strong>Objectifs d’apprentissage</strong></p>' +
        '<p>À l’issue de ce chapitre, vous saurez :</p>' +
        '<ul><li>un</li><li>deux</li><li>trois</li></ul></blockquote>',
    )
  })

  it('fusionne les lignes consécutives en un paragraphe', () => {
    expect(mdToHtml('ligne un\nligne deux\n\nautre')).toBe(
      '<p>ligne un ligne deux</p>\n<p>autre</p>',
    )
  })

  it('applique la réécriture de liens fournie', () => {
    const html = mdToHtml('[chap. 2](02-ecrire.md)', {
      rewriteLink: (href) => (href.endsWith('.md') ? '#/espace/formation/02-ecrire' : href),
    })
    expect(html).toContain('href="#/espace/formation/02-ecrire"')
  })
})

describe('renderMarkdown — sécurité (DOMPurify, ADR-007)', () => {
  it('neutralise un script collé dans le Markdown', () => {
    const html = renderMarkdown('# T\n<script>alert(1)</script>')
    expect(html).not.toContain('<script')
    expect(html).toContain('<h1>T</h1>')
  })

  it('neutralise un lien javascript:', () => {
    const html = renderMarkdown('[clic](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
  })

  it('neutralise une image piégeuse (aucune requête réseau possible)', () => {
    const html = renderMarkdown('<img src="https://evil.test/pixel.png" onerror="alert(1)">')
    // Le HTML inline est ÉCHAPPÉ par le parseur : la balise devient du texte
    // inerte (aucun élément <img>, donc aucune requête ni handler exécutable).
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('ignore le front-matter et conserve les liens hash internes', () => {
    const html = renderMarkdown('---\ntitre: "X"\n---\n[retour](#/espace/formation)')
    expect(html).not.toContain('titre:')
    expect(html).toContain('href="#/espace/formation"')
  })
})
