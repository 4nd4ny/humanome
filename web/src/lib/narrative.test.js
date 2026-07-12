import { describe, expect, it } from 'vitest'
import { dayHrefToRoute, renderNarrativeHtml } from './narrative.js'
import { parseHash } from '../router.js'
import mergeDoc from '../../public/data/demo/merge.json'

describe('dayHrefToRoute', () => {
  it('réécrit un lien jour hérité, avec et sans focus', () => {
    expect(dayHrefToRoute('feuilles/2026-01-04/carto-day.html?focus=1.01')).toBe(
      '#/jour/2026-01-04?focus=1.01',
    )
    expect(dayHrefToRoute('feuilles/2026-01-04/carto-day.html')).toBe('#/jour/2026-01-04')
    expect(dayHrefToRoute('./feuilles/2026-01-04/carto-day.html?focus=7.03')).toBe(
      '#/jour/2026-01-04?focus=7.03',
    )
  })

  it('laisse intact tout autre href', () => {
    expect(dayHrefToRoute('https://exemple.org/feuilles/2026-01-04/carto-day.html')).toBe(null)
    expect(dayHrefToRoute('#/merge')).toBe(null)
    expect(dayHrefToRoute('feuilles/2026-13-45/carto-day.html')).toBe(null)
    expect(dayHrefToRoute('autre/page.html')).toBe(null)
  })
})

describe('renderNarrativeHtml — sanitization (ADR-007)', () => {
  it('neutralise un payload hostile <img onerror>', () => {
    const hostile = '<p>ok</p><img src="x" onerror="window.__pwned = true">'
    const safe = renderNarrativeHtml(hostile)
    expect(safe).toContain('<p>ok</p>')
    expect(safe).not.toContain('onerror')
    expect(safe).not.toContain('__pwned')
    expect(window.__pwned).toBeUndefined()
  })

  it('supprime scripts, handlers et javascript:', () => {
    const hostile =
      '<script>window.__pwned = true</script>' +
      '<a href="javascript:alert(1)" onclick="alert(2)">clic</a>' +
      '<iframe src="https://evil.example"></iframe>' +
      '<div onmouseover="alert(3)">texte</div>'
    const safe = renderNarrativeHtml(hostile)
    expect(safe).not.toContain('<script')
    expect(safe).not.toContain('javascript:')
    expect(safe).not.toContain('onclick')
    expect(safe).not.toContain('onmouseover')
    expect(safe).not.toContain('<iframe')
    expect(safe).toContain('texte')
  })

  it('ne laisse passer aucune charge réseau (img, style, srcset, form) — rien ne quitte le navigateur', () => {
    const hostile =
      '<p>texte</p>' +
      '<img src="https://evil.example/pixel.gif">' +
      '<picture><source srcset="https://evil.example/s.png"><img src="x"></picture>' +
      '<div style="background:url(https://evil.example/css)">stylé</div>' +
      '<form action="https://evil.example/collect"><input name="q"><button>ok</button></form>' +
      '<video src="https://evil.example/v.mp4"></video>' +
      '<object data="https://evil.example/o"></object>'
    const safe = renderNarrativeHtml(hostile)
    expect(safe).toContain('<p>texte</p>')
    expect(safe).toContain('stylé')
    for (const marker of [
      '<img', '<picture', '<source', '<video', '<object', '<form', '<input', '<button',
      'src=', 'srcset=', 'style=', 'action=', 'evil.example',
    ]) {
      expect(safe).not.toContain(marker)
    }
  })

  it('conserve la structure narrative légitime (titres, classes, liens)', () => {
    const html =
      '<div class="verdict-badge etablie">Présence établie</div>' +
      '<h4>Histoire</h4><p>Un <strong>texte</strong>.</p>'
    const safe = renderNarrativeHtml(html)
    expect(safe).toContain('class="verdict-badge etablie"')
    expect(safe).toContain('<h4>Histoire</h4>')
    expect(safe).toContain('<strong>texte</strong>')
  })

  it('la réécriture des liens survit à la sanitization (appliquée après)', () => {
    const html =
      '<a href="feuilles/2026-01-04/carto-day.html?focus=1.01" onclick="alert(1)">jour</a>'
    const safe = renderNarrativeHtml(html)
    expect(safe).toContain('href="#/jour/2026-01-04?focus=1.01"')
    expect(safe).not.toContain('onclick')
  })
})

describe('renderNarrativeHtml — corpus réel', () => {
  it('réécrit un lien réel du corpus vers la route interne', () => {
    const feedback = mergeDoc.domains
      .flatMap((d) => d.competences)
      .map((c) => c.feedback)
      .find((f) => f && f.includes('feuilles/'))
    expect(feedback).toBeDefined()

    const safe = renderNarrativeHtml(feedback)
    expect(safe).not.toContain('carto-day.html')
    expect(safe).toContain('href="#/jour/')
  })

  it('tous les liens feuilles/ du merge réel deviennent des routes valides', () => {
    const container = document.createElement('div')
    const htmlFields = [
      mergeDoc.narratifs.kairosHtml,
      mergeDoc.narratifs.rapportHtml,
      ...mergeDoc.domains.map((d) => d.rapport_html),
      ...mergeDoc.domains.flatMap((d) => d.competences.map((c) => c.feedback)),
    ].filter(Boolean)

    let legacyTotal = 0
    let rewrittenTotal = 0
    for (const html of htmlFields) {
      legacyTotal += (html.match(/carto-day\.html/g) ?? []).length
      container.innerHTML = renderNarrativeHtml(html)
      expect(container.innerHTML).not.toContain('carto-day.html')
      for (const anchor of container.querySelectorAll('a[href^="#/jour/"]')) {
        const route = parseHash(anchor.getAttribute('href'))
        expect(route.name).toBe('day')
        expect(route.focus === null || /^\d\.\d{2}$/.test(route.focus)).toBe(true)
        rewrittenTotal += 1
      }
    }
    expect(legacyTotal).toBeGreaterThan(1000) // 1262 liens dans le corpus (contrats §2.3)
    expect(rewrittenTotal).toBe(legacyTotal)
  })
})
