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

describe('mdToHtml — exports de Google Docs (échappements et traits, journal carto question 31)', () => {
  it('un caractère échappé s’affiche tel quel, sans barre oblique', () => {
    expect(mdToHtml('Le parcours avance \\! Voilà la bonne surprise')).toBe('<p>Le parcours avance ! Voilà la bonne surprise</p>')
    expect(mdToHtml('### **1\\. OBSERVER**')).toBe('<h3><strong>1. OBSERVER</strong></h3>')
    expect(mdToHtml('Bouton **Valider \\<étape\\>**.')).toBe('<p>Bouton <strong>Valider &lt;étape&gt;</strong>.</p>')
  })

  it('un caractère échappé n’ouvre ni gras, ni lien, ni puce, ni titre', () => {
    expect(mdToHtml('\\*\\*pas gras\\*\\* mais **gras**')).toBe('<p>**pas gras** mais <strong>gras</strong></p>')
    expect(mdToHtml('\\[pas un lien\\](x)')).toBe('<p>[pas un lien](x)</p>')
    expect(mdToHtml('\\- pas une puce')).toBe('<p>- pas une puce</p>')
    expect(mdToHtml('\\# pas un titre')).toBe('<p># pas un titre</p>')
    // Une barre oblique devant une lettre n'échappe rien.
    expect(mdToHtml('C:\\dossier')).toBe('<p>C:\\dossier</p>')
  })

  it('les traits horizontaux, espacés ou non, deviennent <hr> — y compris « - - - », qui n’est pas une puce', () => {
    for (const rule of ['---', '- - -', '***', '* * *', '___', '  -----  ']) expect(mdToHtml(rule)).toBe('<hr>')
    expect(mdToHtml('un\n---\ndeux')).toBe('<p>un</p>\n<hr>\n<p>deux</p>')
    expect(mdToHtml('- a\n- - -\n- b')).toBe('<ul>\n<li>a</li>\n</ul>\n<hr>\n<ul>\n<li>b</li>\n</ul>')
    expect(mdToHtml('> un\n> ---\n> deux')).toBe('<blockquote><p>un</p><hr><p>deux</p></blockquote>')
    // Deux tirets ne sont pas un trait ; une puce reste une puce.
    expect(mdToHtml('--')).toBe('<p>--</p>')
    expect(mdToHtml('- a - b - c')).toBe('<ul>\n<li>a - b - c</li>\n</ul>')
  })

  it('le trait survit à l’assainissement (DOMPurify)', () => {
    expect(renderMarkdown('avant\n\n- - -\n\naprès')).toBe('<p>avant</p>\n<hr>\n<p>après</p>')
  })

  it('une ligne finie par deux espaces passe à la ligne ; U+000B aussi (cellule de tableau), au lieu d’un carré « VT »', () => {
    expect(mdToHtml('1. un  \n2. deux  \n3. trois  ')).toBe('<p>1. un<br>\n2. deux<br>\n3. trois</p>')
    // Une seule espace : les lignes se rejoignent, comme avant.
    expect(mdToHtml('une espace \nsuite')).toBe('<p>une espace suite</p>')
    expect(mdToHtml('| Titre de l’encadré\u000b\u000bPremière ligne |')).toBe('<p>| Titre de l’encadré<br>\n<br>\nPremière ligne |</p>')
    expect(mdToHtml('> vers un  \n> vers deux')).toBe('<blockquote><p>vers un<br>\nvers deux</p></blockquote>')
    expect(mdToHtml('- **puce\u000bsuite**')).toBe('<ul>\n<li><strong>puce<br>\nsuite</strong></li>\n</ul>')
    expect(renderMarkdown('a\u000bb')).toBe('<p>a<br>\nb</p>')
  })

  it('une image n’est jamais chargée : « [image] » à sa place (avec son texte s’il en a un)', () => {
    expect(mdToHtml('Mes notes du jour :  \n![][image1]![][image2]')).toBe('<p>Mes notes du jour :<br>\n[image][image]</p>')
    expect(mdToHtml('![Schéma du cycle de l’eau][image3]')).toBe('<p>[image : Schéma du cycle de l’eau]</p>')
    expect(mdToHtml('![*logo* \\[1\\]](https://x.test/l.png) et [lien](https://x.test)')).toBe(
      '<p>[image : *logo* [1]] et <a href="https://x.test">lien</a></p>',
    )
    // Un « ! » échappé n'ouvre pas d'image : il reste, suivi du lien.
    expect(mdToHtml('\\![pas une image](x)')).toBe('<p>!<a href="x">pas une image</a></p>')
    expect(renderMarkdown('![pixel](https://evil.test/p.png)')).toBe('<p>[image : pixel]</p>')
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
