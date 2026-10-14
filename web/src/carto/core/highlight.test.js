// Moteur de recherche des passages à surligner (spec §8.1).
import { describe, expect, it } from 'vitest'
import { collapseText, isLocatable, locateApproximate, locateExtract, normalizeNeedle, splitExtract } from './highlight.js'

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

describe('surlignage approché (extrait reformulé, décision du 2026-10-14)', () => {
  const text = 'Lundi. Ce matin, nous avons longuement discuté du projet de jardin avec la classe, puis chacun a proposé une plante. Le soir, rien de spécial.'
  const parts = (t, near) => near.ranges.map((r) => t.slice(r.from, r.to))

  it('au moins 75 % des mots pleins de l’extrait dans la feuille : la phrase d’où ils viennent, de son premier à son dernier mot de l’extrait', () => {
    const near = locateApproximate(text, 'Nous avons discuté longtemps du projet de jardin avec toute la classe')
    expect(near.share).toBeCloseTo(0.8) // discuté, projet, jardin, classe sur 5 (« longtemps » manque)
    expect(parts(text, near)).toEqual(['discuté du projet de jardin avec la classe'])
  })

  it('un extrait qui résume plusieurs phrases : chacune est encadrée', () => {
    const t = 'Le matin, la maquette a cédé sous le poids. Nous avons cherché pourquoi pendant une heure. L’après-midi, nous avons changé les appuis et la structure a tenu.'
    const near = locateApproximate(t, 'Maquette cédé sous le poids ; appuis changé, structure tenu')
    expect(near.share).toBe(1)
    expect(parts(t, near)).toEqual(['maquette a cédé sous le poids', 'changé les appuis et la structure a tenu'])
  })

  it('sous 75 %, rien : on ne devine pas', () => {
    expect(locateApproximate(text, 'Nous avons planté des tomates et arrosé le potager toute la semaine')).toBeNull()
  })

  it('un extrait trop court (moins de 4 mots pleins) n’est jamais approché ; les mots-outils ne comptent pas', () => {
    expect(locateApproximate(text, 'Le projet de jardin')).toBeNull()
    expect(locateApproximate(text, 'avec tous nous pour dans mais aussi bien')).toBeNull()
  })

  it('une phrase qui ne répète qu’un mot n’apporte rien', () => {
    expect(locateApproximate('jardin jardin jardin jardin jardin jardin jardin jardin', 'jardin potager classe projet plante')).toBeNull()
  })

  it('limites de bloc (liste sans point final) : chaque élément est une phrase ; une « phrase » démesurée n’est jamais retenue', () => {
    const list = 'arroser les semis du jardin\nmesurer la croissance des plants\nnoter les observations au carnet\nranger les outils'
    const breaks = [...list.matchAll(/\n/g)].map((m) => m.index)
    const near = locateApproximate(list, 'Croissance des plants mesurée ; observations du carnet ; semis du jardin arrosés', { breaks })
    expect(parts(list, near)).toEqual(['semis du jardin', 'croissance des plants', 'observations au carnet'])
    // Sans les limites de bloc, tout le texte serait une seule phrase… trop longue pour localiser quoi que ce soit.
    const flat = Array(10).fill(list.replaceAll('\n', ' ')).join(' ')
    expect(locateApproximate(flat, 'Croissance des plants mesurée ; observations du carnet ; semis du jardin arrosés')).toBeNull()
  })

  it('index d’origine même après un émoji et des espaces insécables', () => {
    const withEmoji = '🌱 Ce\u00a0matin, nous avons longuement discuté du projet de jardin avec la classe.'
    const near = locateApproximate(withEmoji, 'Nous avons discuté longtemps du projet de jardin avec toute la classe')
    expect(parts(withEmoji, near)).toEqual(['discuté du projet de jardin avec la classe'])
  })
})
