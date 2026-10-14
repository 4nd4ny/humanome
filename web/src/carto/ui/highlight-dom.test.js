// P2 — surlignage dans le portfolio RENDU (spec §8.1) : un <mark> par nœud
// texte, jamais un élément englobant des <p> ; segments blancs ignorés ;
// jaune / orange ; toutes les occurrences ; Markdown assaini.
import { describe, expect, it } from 'vitest'
import { approximateInPortfolio, collectText, highlightHtml, locateInPortfolio, renderPortfolio } from './highlight-dom.js'
import { locateRendered, stripMarkdownMarks } from '../core/highlight.js'

const frag = (html) => {
  const t = document.createElement('template')
  t.innerHTML = html
  return t.content
}
const marksOf = (html) => {
  const box = document.createElement('div')
  box.innerHTML = html
  return [...box.querySelectorAll('mark')]
}

describe('texte affiché', () => {
  it('un saut de ligne virtuel sépare deux blocs (sinon deux paragraphes se colleraient)', () => {
    expect(collectText(frag('<p>Fin du paragraphe.</p><p>Début du <em>suivant</em>.</p>')).text).toBe('Fin du paragraphe.\nDébut du suivant.')
  })
})

describe('surlignage approché dans le texte affiché', () => {
  it('une liste sans ponctuation : un élément par phrase (limites de bloc), jamais toute la liste', () => {
    const portfolio = { text: '## Mardi\n\n- arroser les semis du jardin\n- mesurer la croissance des plants\n- noter les observations au carnet\n- ranger les outils\n' }
    const { text, breaks } = renderPortfolio(portfolio)
    expect(breaks.length).toBeGreaterThanOrEqual(4)
    const near = approximateInPortfolio(portfolio, 'Croissance des plants mesurée ; observations du carnet ; semis du jardin arrosés')
    expect(near.ranges.map((r) => text.slice(r.from, r.to))).toEqual(['semis du jardin', 'croissance des plants', 'observations au carnet'])
  })
})

describe('highlightHtml', () => {
  it('un extrait qui enjambe deux paragraphes : un <mark> par nœud texte, aucun qui englobe un <p>', () => {
    const { html, text } = renderPortfolio({ text: 'Nous avons fini la maquette.\n\nPuis **Sam** a tout repris depuis le début.' })
    const ranges = locateRendered(text, { extract: 'fini la maquette. Puis Sam a tout repris' })
    expect(ranges).toHaveLength(1)
    expect(ranges[0].complete).toBe(true)
    const out = highlightHtml(html, ranges)
    const marks = marksOf(out.html)
    expect(marks.map((m) => m.textContent)).toEqual(['fini la maquette.', 'Puis ', 'Sam', ' a tout repris'])
    for (const m of marks) {
      expect(m.querySelector('p')).toBeNull()
      expect(m.className).toMatch(/carto-hl--complete/)
    }
    // Le <strong> est conservé, le <mark> est À L'INTÉRIEUR.
    expect(marks[2].parentElement.tagName).toBe('STRONG')
  })

  it('segments blancs ignorés ; orange quand un seul bout est retrouvé', () => {
    const { html, text } = renderPortfolio({ text: 'Le pont tient.\n\n   \n\nLa suite est ailleurs.' })
    const ranges = locateRendered(text, { start: 'Le pont tient', end: 'introuvable fin du passage' })
    expect(ranges[0].complete).toBe(false)
    const marks = marksOf(highlightHtml(html, ranges).html)
    expect(marks.map((m) => m.textContent)).toEqual(['Le pont tient'])
    expect(marks[0].className).toMatch(/carto-hl--partial/)
  })

  it('toutes les occurrences, l’occurrence courante mise en avant', () => {
    const { html, text } = renderPortfolio({ text: 'Les appuis tiennent. Plus tard : les appuis tiennent encore.' })
    const ranges = locateRendered(text, { extract: 'les appuis tiennent' })
    expect(ranges).toHaveLength(2)
    const marks = marksOf(highlightHtml(html, ranges, { current: 1 }).html)
    expect(marks.map((m) => m.getAttribute('data-occurrence'))).toEqual(['0', '1'])
    expect(marks[1].className).toMatch(/carto-hl--current/)
    expect(marks[0].className).not.toMatch(/carto-hl--current/)
  })

  it('un extrait recopié avec ses marques Markdown est retrouvé dans le texte affiché', () => {
    expect(stripMarkdownMarks('J’ai **vraiment** vérifié `deux` sources')).toBe('J’ai vraiment vérifié deux sources')
    const portfolio = { text: 'Hier, j’ai **vraiment** vérifié deux sources avant de conclure.' }
    const ranges = locateInPortfolio(portfolio, { extract: 'j’ai **vraiment** vérifié deux sources avant de conclure' })
    expect(ranges).toHaveLength(1)
    expect(ranges[0].complete).toBe(true)
  })

  it('le Markdown du portfolio est assaini : aucun script, aucune ressource distante', () => {
    const { html } = renderPortfolio({ text: 'Bonjour <script>alert(1)</script> <img src="https://example.org/x.png"> [lien](javascript:alert(1))' })
    const box = document.createElement('div')
    box.innerHTML = html
    expect(box.querySelector('script')).toBeNull()
    expect(box.querySelector('img')).toBeNull()
    expect(box.querySelector('a')?.getAttribute('href') ?? '').not.toMatch(/javascript:/)
  })

  it('pas de texte : rien à chercher', () => {
    expect(locateInPortfolio(null, { extract: 'x' })).toBeNull()
    expect(locateInPortfolio({ text: '  ' }, { extract: 'x' })).toBeNull()
  })
})
