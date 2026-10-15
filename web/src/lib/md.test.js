import { describe, expect, it } from 'vitest'
import { mdToHtml, parseFrontMatter, renderMarkdown } from './md.js'

/** HTML sans les retours à la ligne que marked pose entre deux balises. */
const flat = (html) => html.replace(/>\n+</g, '><')
const md = (text, options) => flat(mdToHtml(text, options))

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

describe('mdToHtml — l’essentiel du Markdown', () => {
  it('rend les titres #/##/###', () => {
    expect(md('# Un')).toBe('<h1>Un</h1>')
    expect(md('## Deux')).toBe('<h2>Deux</h2>')
    expect(md('### Trois')).toBe('<h3>Trois</h3>')
  })

  it('rend les listes à puces', () => {
    expect(md('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>')
    expect(md('* a\n* b')).toBe('<ul><li>a</li><li>b</li></ul>')
  })

  it('rend gras, italique, code inline et liens', () => {
    const html = md('Du **gras**, de l’*italique*, du `code` et un [lien](https://x.test/page).')
    expect(html).toContain('<strong>gras</strong>')
    expect(html).toContain('<em>italique</em>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<a href="https://x.test/page">lien</a>')
  })

  it('rend les blockquotes multi-lignes', () => {
    const html = md('> **Objectifs**\n>\n> - premier')
    expect(html.startsWith('<blockquote>')).toBe(true)
    expect(html).toContain('<strong>Objectifs</strong>')
    // La liste à l'intérieur de la citation doit rester une VRAIE liste, pas
    // être fusionnée dans le paragraphe qui précède (motif des chapitres de
    // formation : « Objectifs d'apprentissage » suivis d'une liste à puces).
    expect(html).toContain('<ul><li>premier</li></ul>')
  })

  it('rend une liste multi-items à l’intérieur d’une citation (motif « Objectifs d’apprentissage »)', () => {
    const html = md('> **Objectifs d’apprentissage**\n>\n> À l’issue de ce chapitre, vous saurez :\n> - un\n> - deux\n> - trois')
    expect(html).toBe(
      '<blockquote><p><strong>Objectifs d’apprentissage</strong></p>' +
        '<p>À l’issue de ce chapitre, vous saurez :</p>' +
        '<ul><li>un</li><li>deux</li><li>trois</li></ul></blockquote>',
    )
  })

  it('réunit les lignes consécutives en un paragraphe (le retour à la ligne y est un blanc)', () => {
    expect(md('ligne un\nligne deux\n\nautre')).toBe('<p>ligne un\nligne deux</p><p>autre</p>')
  })

  it('applique la réécriture de liens fournie', () => {
    const html = md('[chap. 2](02-ecrire.md)', {
      rewriteLink: (href) => (href.endsWith('.md') ? '#/espace/formation/02-ecrire' : href),
    })
    expect(html).toContain('href="#/espace/formation/02-ecrire"')
  })
})

describe('mdToHtml — ce que la bibliothèque apporte (journal carto D-54)', () => {
  it('listes numérotées (avec leur premier numéro), listes imbriquées, cases de tâches', () => {
    expect(md('1. un\n2. deux')).toBe('<ol><li>un</li><li>deux</li></ol>')
    expect(md('3. trois\n4. quatre')).toBe('<ol start="3"><li>trois</li><li>quatre</li></ol>')
    expect(md('- a\n  - a1\n  - a2\n- b')).toBe('<ul><li>a<ul><li>a1</li><li>a2</li></ul></li><li>b</li></ul>')
    // Pas de case à cocher (<input>, interdit) : la case reste écrite.
    expect(md('- [ ] à faire\n- [x] fait')).toBe('<ul><li>[ ] à faire</li><li>[x] fait</li></ul>')
  })

  it('blocs de code entre ``` ; texte barré', () => {
    expect(md('```js\nconst a = 1\n```')).toBe('<pre><code class="language-js">const a = 1\n</code></pre>')
    expect(md('a ~~b~~ c, environ ~10 et ~20')).toBe('<p>a <del>b</del> c, environ ~10 et ~20</p>')
  })

  it('tableaux : en-tête, lignes, alignement des colonnes en classes, mise en forme dans les cases', () => {
    expect(md('| A | B |\n| :-- | --: |\n| **1** | 2 |\n| x \\| y | `z` |')).toBe(
      '<div class="md-table-wrap"><table class="md-table">' +
        '<thead><tr><th class="md-align-left">A</th><th class="md-align-right">B</th></tr></thead>' +
        '<tbody><tr><td class="md-align-left"><strong>1</strong></td><td class="md-align-right">2</td></tr>' +
        '<tr><td class="md-align-left">x | y</td><td class="md-align-right"><code>z</code></td></tr></tbody>' +
        '</table></div>',
    )
    // Une colonne et des lignes : un tableau, pas un encadré.
    expect(md('| A |\n| --- |\n| 1 |')).toBe('<div class="md-table-wrap"><table class="md-table"><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table></div>')
  })

  it('tableau d’une seule case (encadré de Google Docs) : un encadré, ses « | » intérieurs gardés, ses sauts de ligne rendus', () => {
    expect(md('| 💡 Une idée à creuser |\n| :---: |\n\nSuite')).toBe('<div class="md-box md-align-center"><p>💡 Une idée à creuser</p></div><p>Suite</p>')
    expect(md('| Titre\u000b\u000bcase a|b) \\| fin |\n| :---- |')).toBe('<div class="md-box md-align-left"><p>Titre<br><br>case a|b) | fin</p></div>')
    expect(md('Avant\n| Encadré |\n| ----- |\nAprès')).toBe('<p>Avant</p><div class="md-box"><p>Encadré</p></div><p>Après</p>')
  })

  it('l’assainissement garde tableaux et encadrés (classes comprises)', () => {
    const html = flat(renderMarkdown('| A | B |\n| :-: | --- |\n| 1 | 2 |\n\n| Encadré |\n| :--- |'))
    expect(html).toContain('<table class="md-table"><thead><tr><th class="md-align-center">A</th><th>B</th>')
    expect(html).toContain('<div class="md-box md-align-left"><p>Encadré</p></div>')
  })
})

describe('mdToHtml — rien de ce qui est écrit ne disparaît (relecture de D-54)', () => {
  it('une ligne de tableau qui a plus de cases que l’en-tête garde le surplus dans sa dernière case', () => {
    expect(md('| A | B |\n| --- | --- |\n| x | P(A | B) vaut 1 |')).toContain('<td>x</td><td>P(A | B) vaut 1</td>')
    expect(md('| Encadré |\n| --- |\n| ligne a | b |')).toContain('<td>ligne a | b</td>')
    // Une case échappée reste une barre dans sa case.
    expect(md('| A | B |\n| --- | --- |\n| x \\| y | z |')).toContain('<td>x | y</td><td>z</td>')
  })

  it('« [nom]: valeur » reste du texte ; seules les données d’image d’un export Google Docs sont cachées', () => {
    expect(md('[Humeur]: fatigué')).toBe('<p>[Humeur]: fatigué</p>')
    expect(md('Note[^1]\n\n[^1]:  https://x.test/source')).toBe('<p>Note[^1]</p><p>[^1]:  https://x.test/source</p>')
    expect(md('[lien]: https://x.test')).toBe('<p>[lien]: https://x.test</p>')
    expect(md('![][image1]\n\n[image1]: <data:image/png;base64,AAAA>')).toBe('<p>[image]</p>')
  })

  it('un bloc ``` ou ~~~ n’en est un que s’il est refermé', () => {
    expect(md('Avant\n\n~~~\n\nJ’ai compris l’idée de *fond*.')).toBe('<p>Avant</p><p>~~~</p><p>J’ai compris l’idée de <em>fond</em>.</p>')
    expect(md('```\nsuite **sans** fin')).toBe('<p>```\nsuite <strong>sans</strong> fin</p>')
    expect(md('~~~\ncode\n~~~')).toBe('<pre><code>code\n</code></pre>')
    // « ```git push``` » en début de ligne est du code inline, pas un bloc.
    expect(md('```git push``` puis la suite')).toBe('<p><code>git push</code> puis la suite</p>')
  })

  it('barré : « ~~texte~~ » seulement', () => {
    expect(md('Durée ~2 h~ environ, ~~rayé~~')).toBe('<p>Durée ~2 h~ environ, <del>rayé</del></p>')
  })

  it('le numéro écrit d’une liste numérotée est celui affiché', () => {
    expect(md('1. un\n3. trois\n4. quatre')).toBe('<ol><li>un</li><li value="3">trois</li><li>quatre</li></ol>')
    expect(md('2026. une année\n14. le quatorze')).toBe('<ol start="2026"><li>une année</li><li value="14">le quatorze</li></ol>')
  })

  it('U+000B : un saut de ligne partout, même dans un titre ou du code ; jamais dans un attribut', () => {
    expect(md('### Titre\u000bsous-titre')).toBe('<h3>Titre<br>sous-titre</h3>')
    expect(md('`a\u000bb`')).toBe('<p><code>a<br>b</code></p>')
    expect(md('```\na\u000bb\n```')).toBe('<pre><code>a\nb\n</code></pre>')
    expect(md('![photo\u000bdu jour][image1]')).toBe('<p>[image : photo du jour]</p>')
  })

  it('gras entouré d’un blanc (Google Docs) : le blanc passe hors des astérisques, hors code', () => {
    expect(md('le **gras **suit')).toBe('<p>le <strong>gras</strong> suit</p>')
    expect(md('c’est ***très ***bien')).toBe('<p>c’est <em><strong>très</strong></em> bien</p>')
    expect(md('Il a ** vraiment** compris.')).toBe('<p>Il a  <strong>vraiment</strong> compris.</p>')
    expect(md('**L’Épreuve\u202f** | suite')).toBe('<p><strong>L’Épreuve</strong>\u202f | suite</p>') // espace fine insécable
    // Rien d'autre ne bouge : gras accolés, citations en italique, italique
    // seul, gras dont la « fermeture » en ouvrirait un autre, puce, code.
    expect(md('**a**b **c**')).toBe('<p><strong>a</strong>b <strong>c</strong></p>')
    expect(md('*"une phrase"*, puis un *mot* ici, et **"cité"**, puis **gras** fin')).toBe(
      '<p><em>&quot;une phrase&quot;</em>, puis un <em>mot</em> ici, et <strong>&quot;cité&quot;</strong>, puis <strong>gras</strong> fin</p>',
    )
    expect(md('le *plan *de travail')).toBe('<p>le *plan *de travail</p>')
    expect(md('un **mot **suivi**')).toBe('<p>un **mot <strong>suivi</strong></p>') // lecture du CommonMark, intacte
    expect(md('* item*')).toBe('<ul><li>item*</li></ul>')
    expect(md('le code `a **b **c` reste')).toBe('<p>le code <code>a **b **c</code> reste</p>')
    expect(md('le code ``a ` **b **c`` reste')).toBe('<p>le code <code>a ` **b **c</code> reste</p>')
    expect(md('```\n**x **\n```\n**y **z')).toBe('<pre><code>**x **\n</code></pre><p><strong>y</strong> z</p>')
    expect(md('```git push``` puis **x **y')).toBe('<p><code>git push</code> puis <strong>x</strong> y</p>')
  })

  it('un lien réécrit garde son titre', () => {
    expect(md('[chap](02-x.md "Chapitre 2")', { rewriteLink: (h) => `#/f/${h}` })).toBe('<p><a href="#/f/02-x.md" title="Chapitre 2">chap</a></p>')
  })

  it('un « ![ » isolé, répété, ne fait pas exploser le temps de rendu', () => {
    const t0 = Date.now()
    mdToHtml('![a '.repeat(20000))
    expect(Date.now() - t0).toBeLessThan(5000)
  })
})

describe('mdToHtml — réglages pour les journaux (écarts assumés au CommonMark)', () => {
  it('un trait sous une ligne de texte reste un trait (pas de titre « souligné »)', () => {
    expect(md('un\n---\ndeux')).toBe('<p>un</p><hr><p>deux</p>')
    expect(md('un\n===')).toBe('<p>un\n===</p>')
  })

  it('un retrait n’est pas du code', () => {
    expect(md('texte\n\n    en retrait')).toBe('<p>texte</p><p>    en retrait</p>')
  })

  it('une adresse, nue ou entre chevrons, reste du texte ; le HTML aussi', () => {
    expect(md('voir https://x.test et <https://y.test>')).toBe('<p>voir https://x.test et &lt;https://y.test&gt;</p>')
    expect(md('<b>pas gras</b> et <étape>')).toBe('<p>&lt;b&gt;pas gras&lt;/b&gt; et &lt;étape&gt;</p>')
  })

  it('une définition de référence (données d’image en fin de document) ne s’affiche pas', () => {
    expect(md('![][image1]\n\n[image1]: <data:image/png;base64,AAAA>')).toBe('<p>[image]</p>')
  })
})

describe('mdToHtml — exports de Google Docs (échappements et traits, journal carto question 31)', () => {
  it('un caractère échappé s’affiche tel quel, sans barre oblique', () => {
    expect(md('Le parcours avance \\! Voilà la bonne surprise')).toBe('<p>Le parcours avance ! Voilà la bonne surprise</p>')
    expect(md('### **1\\. OBSERVER**')).toBe('<h3><strong>1. OBSERVER</strong></h3>')
    expect(md('Bouton **Valider \\<étape\\>**.')).toBe('<p>Bouton <strong>Valider &lt;étape&gt;</strong>.</p>')
    // Écart assumé : aussi dans le code inline (Google Docs y échappe aussi).
    expect(md('le fichier `generate\\_carto.py`')).toBe('<p>le fichier <code>generate_carto.py</code></p>')
  })

  it('un caractère échappé n’ouvre ni gras, ni lien, ni puce, ni titre', () => {
    expect(md('\\*\\*pas gras\\*\\* mais **gras**')).toBe('<p>**pas gras** mais <strong>gras</strong></p>')
    expect(md('\\[pas un lien\\](x)')).toBe('<p>[pas un lien](x)</p>')
    expect(md('\\- pas une puce')).toBe('<p>- pas une puce</p>')
    expect(md('\\# pas un titre')).toBe('<p># pas un titre</p>')
    expect(md('1\\. pas une liste')).toBe('<p>1. pas une liste</p>')
    // Une barre oblique devant une lettre n'échappe rien.
    expect(md('C:\\dossier')).toBe('<p>C:\\dossier</p>')
  })

  it('les traits horizontaux, espacés ou non, deviennent <hr> — y compris « - - - », qui n’est pas une puce', () => {
    for (const rule of ['---', '- - -', '***', '* * *', '___', '  -----  ']) expect(md(rule)).toBe('<hr>')
    expect(md('- a\n- - -\n- b')).toBe('<ul><li>a</li></ul><hr><ul><li>b</li></ul>')
    expect(md('> un\n> ---\n> deux')).toBe('<blockquote><p>un</p><hr><p>deux</p></blockquote>')
    // Deux tirets ne sont pas un trait ; une puce reste une puce.
    expect(md('--')).toBe('<p>--</p>')
    expect(md('- a - b - c')).toBe('<ul><li>a - b - c</li></ul>')
  })

  it('le trait survit à l’assainissement (DOMPurify)', () => {
    expect(flat(renderMarkdown('avant\n\n- - -\n\naprès'))).toBe('<p>avant</p><hr><p>après</p>')
  })

  it('une ligne finie par deux espaces passe à la ligne ; U+000B aussi (case de tableau), au lieu d’un carré « VT »', () => {
    expect(md('vers un  \nvers deux')).toBe('<p>vers un<br>vers deux</p>')
    // Une seule espace : les lignes se rejoignent, comme avant.
    expect(md('une espace \nsuite')).toBe('<p>une espace \nsuite</p>')
    expect(md('| Titre de l’encadré\u000b\u000bPremière ligne |')).toBe('<p>| Titre de l’encadré<br><br>Première ligne |</p>')
    expect(md('> vers un  \n> vers deux')).toBe('<blockquote><p>vers un<br>vers deux</p></blockquote>')
    expect(md('- **puce\u000bsuite**')).toBe('<ul><li><strong>puce<br>suite</strong></li></ul>')
    expect(renderMarkdown('a\u000bb')).toBe('<p>a<br>b</p>')
    // La liste numérotée de Google Docs (deux espaces en fin de ligne) : une liste.
    expect(md('1. un  \n2. deux  \n3. trois  ').replace(/ +</g, '<')).toBe('<ol><li>un</li><li>deux</li><li>trois</li></ol>')
  })

  it('une image n’est jamais chargée : « [image] » à sa place (avec son texte s’il en a un)', () => {
    expect(md('Mes notes du jour :  \n![][image1]![][image2]')).toBe('<p>Mes notes du jour :<br>[image][image]</p>')
    expect(md('![Schéma du cycle de l’eau][image3]')).toBe('<p>[image : Schéma du cycle de l’eau]</p>')
    expect(md('![*logo* \\[1\\]](https://x.test/l.png) et [lien](https://x.test)')).toBe('<p>[image : *logo* [1]] et <a href="https://x.test">lien</a></p>')
    // Un « ! » échappé n'ouvre pas d'image : il reste, suivi du lien.
    expect(md('\\![pas une image](x)')).toBe('<p>!<a href="x">pas une image</a></p>')
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
