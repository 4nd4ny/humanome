// La liste suit la sélection dans ses propres boîtes défilantes, jamais en
// faisant défiler la page : sinon, un clic dans le soleil déplaçait le soleil
// sous le pointeur, et le second clic d'un double-clic (qui ouvre un pôle,
// journal D-45) tombait à côté.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { revealInList } from './CompetencyList.jsx'

/** Boîte de `height` px dont le contenu défile, posée en `top` dans la fenêtre. */
function scroller(el, { top, height, content }) {
  el.style.overflowY = 'auto'
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: height })
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: content })
  el.getBoundingClientRect = () => ({ top, bottom: top + height, left: 0, right: 100, width: 100, height })
}
const at = (el, top, height = 20) => {
  el.getBoundingClientRect = () => ({ top, bottom: top + height, left: 0, right: 100, width: 100, height })
}

function tree() {
  document.body.innerHTML = `
    <main>
      <div class="carto-col carto-col-left">
        <nav class="carto-list"><ul><li><button id="item">3.02 Itération</button></li></ul></nav>
      </div>
    </main>`
  return { col: document.querySelector('.carto-col'), nav: document.querySelector('nav'), item: document.getElementById('item'), main: document.querySelector('main') }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('revealInList : la liste suit la sélection sans faire défiler la page', () => {
  it('une boîte défilante de la liste défile au plus près pour montrer l’élément (dessous, puis dessus)', () => {
    const { nav, item } = tree()
    scroller(nav, { top: 100, height: 200, content: 900 })
    nav.scrollTop = 0
    at(item, 340)
    revealInList(item, nav)
    expect(nav.scrollTop).toBe(60) // bas de l'élément (360) aligné sur le bas de la boîte (300)

    nav.scrollTop = 200
    at(item, 70)
    revealInList(item, nav)
    expect(nav.scrollTop).toBe(170) // haut de l'élément (70) aligné sur le haut de la boîte (100)

    nav.scrollTop = 50
    at(item, 150)
    revealInList(item, nav)
    expect(nav.scrollTop).toBe(50) // déjà visible : rien ne bouge
  })

  it('jamais au-delà de la colonne : une boîte défilante qui contient aussi le soleil ne bouge pas, la page non plus', () => {
    const { nav, item, main } = tree()
    scroller(main, { top: 0, height: 300, content: 2000 })
    main.scrollTop = 0
    at(item, 900)
    const intoView = vi.fn()
    Element.prototype.scrollIntoView = intoView
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    revealInList(item, nav)
    expect(main.scrollTop).toBe(0)
    expect(intoView).not.toHaveBeenCalled()
    expect(scrollTo).not.toHaveBeenCalled()
    delete Element.prototype.scrollIntoView
  })

  it('la colonne elle-même peut défiler', () => {
    const { col, nav, item } = tree()
    scroller(col, { top: 0, height: 400, content: 1200 })
    col.scrollTop = 0
    at(item, 600)
    revealInList(item, nav)
    expect(col.scrollTop).toBe(220)
  })

  it('sans élément ni liste : rien', () => {
    const { nav } = tree()
    expect(() => revealInList(undefined, nav)).not.toThrow()
    expect(() => revealInList(document.getElementById('item'), null)).not.toThrow()
  })
})
