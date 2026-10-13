// Moteur de recherche des passages à surligner (spec §8.1).
import { describe, expect, it } from 'vitest'
import { collapseText, isLocatable, locateExtract, normalizeNeedle, splitExtract } from './highlight.js'

describe('ancres début / fin (split_extract_for_highlight)', () => {
  it('marqueurs de troncature : premier et dernier segments', () => {
    expect(splitExtract('La maquette a cédé [...] en changeant les appuis.')).toEqual({ start: 'La maquette a cédé', end: 'en changeant les appuis.' })
    expect(splitExtract('Début … milieu … fin du texte')).toEqual({ start: 'Début', end: 'fin du texte' })
    expect(splitExtract('Premier [...] second [...] troisième')).toEqual({ start: 'Premier', end: 'troisième' })
    expect(splitExtract('Fin tronquée...')).toEqual({ start: 'Fin tronquée', end: null })
  })
  it('≥ 4 mots sans marqueur : deux moitiés', () => {
    expect(splitExtract('un deux trois quatre cinq')).toEqual({ start: 'un deux', end: 'trois quatre cinq' })
  })
  it('< 4 mots : début seul', () => {
    expect(splitExtract('trois mots ici')).toEqual({ start: 'trois mots ici', end: null })
    expect(splitExtract('')).toEqual({ start: '', end: null })
  })
})

describe('normalisation', () => {
  it('apostrophes et guillemets typographiques, espaces insécables, ponctuation de bord', () => {
    expect(normalizeNeedle('« J’ai vu “ça”. »')).toBe('j\'ai vu "ça')
    expect(normalizeNeedle('  Fin de phrase…  ')).toBe('fin de phrase')
  })
  it('caractère pour caractère : un accent combinant reste attaché à sa lettre', () => {
    const decomposed = 'Café noir'
    const m = collapseText(decomposed)
    expect(m.collapsed).toBe('café noir')
    expect(m.origStart[3]).toBe(3)
    expect(m.origEnd[3]).toBe(4) // « e » + accent combinant
    expect(m.origStart[4]).toBe(5)
  })
})

const TEXT = `Ce matin j’ai relu mes notes avant d’écrire. J'ai vérifié deux sources
contradictoires avant de conclure sur la date du chantier.
Ensuite nous avons construit la maquette du pont en carton.`

describe('localisation (jaune / orange)', () => {
  it('extrait retrouvé malgré les apostrophes typographiques et le saut de ligne : complet', () => {
    const extract = 'J’ai vérifié deux sources contradictoires avant de conclure sur la date du chantier.'
    const [m] = locateExtract(TEXT, { extract })
    expect(m.complete).toBe(true)
    expect(TEXT.slice(m.from, m.to)).toBe("J'ai vérifié deux sources\ncontradictoires avant de conclure sur la date du chantier")
  })

  it('le milieu peut diverger : début et fin suffisent (reformulation)', () => {
    const [m] = locateExtract(TEXT, { extract: 'J’ai vérifié deux sources CONTRADICTOIRES ET NOMBREUSES avant de conclure sur la date du chantier' })
    expect(m.complete).toBe(true)
  })

  it('un seul bout retrouvé : surlignage partiel (orange)', () => {
    const [m] = locateExtract(TEXT, { start: 'nous avons construit la maquette', end: 'une fin qui n’existe pas du tout' })
    expect(m.complete).toBe(false)
    expect(TEXT.slice(m.from, m.to)).toBe('nous avons construit la maquette')
  })

  it('l’aiguille est réduite de moitié en mots jusqu’à être trouvée', () => {
    const [m] = locateExtract(TEXT, { start: 'Ensuite nous avons construit un avion', end: null })
    expect(TEXT.slice(m.from, m.to)).toBe('Ensuite nous avons')
    expect(m.complete).toBe(false) // extrait court mais rétréci : partiel
  })

  it('extrait court retrouvé en entier : complet', () => {
    const [m] = locateExtract(TEXT, { extract: 'pont en carton' })
    expect(m.complete).toBe(true)
  })

  it('introuvable : aucune plage (le volet le dira)', () => {
    expect(locateExtract(TEXT, { extract: 'Rien de tout cela n’apparaît dans le texte source' })).toEqual([])
    expect(isLocatable(TEXT, { extract: 'Rien de tout cela n’apparaît dans le texte source' })).toBe(false)
  })

  it('deux occurrences possibles : toutes sont trouvées (AuroraCore ne gardait que la première)', () => {
    const text = 'La maquette tient. Plus tard : la maquette tient encore.'
    const found = locateExtract(text, { extract: 'la maquette tient' })
    expect(found).toHaveLength(2)
    expect(found.map((f) => text.slice(f.from, f.to))).toEqual(['La maquette tient', 'la maquette tient'])
  })

  it('les index renvoyés sont ceux du texte d’origine (accents décomposés, espaces multiples)', () => {
    const text = 'Il a dit :   « café   crème » puis il est parti.'
    const [m] = locateExtract(text, { extract: 'café crème' })
    expect(text.slice(m.from, m.to)).toBe('café   crème')
  })

  it('un émoji (deux unités de code) avant le passage ne décale pas le surlignage', () => {
    const text = 'Bonne journée 🙂🎉 ! Ensuite j’ai relu mes notes 📚 avant d’écrire le rapport.'
    const [m] = locateExtract(text, { start: 'j’ai relu mes notes', end: 'avant d’écrire le rapport' })
    expect(m).toMatchObject({ complete: true, exact: true })
    expect(text.slice(m.from, m.to)).toBe('j’ai relu mes notes 📚 avant d’écrire le rapport')
    const decomposed = `🙂 cafe${String.fromCharCode(0x301)} 🙂 crème`
    const [n] = locateExtract(decomposed, { extract: 'café 🙂 crème' })
    expect(decomposed.slice(n.from, n.to)).toBe(`cafe${String.fromCharCode(0x301)} 🙂 crème`)
  })
})
