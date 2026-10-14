// P4 — mesures de style locales (spec §10, carte « Style ») : expressions
// régulières seulement, valeurs manquantes = null (jamais 0).
import { describe, expect, it } from 'vitest'
import { STYLE_METRICS, lexicalDistance, lexicalProfile, movingTtr, sentences, styleMetrics, words } from './stylometry.js'

describe('découpage', () => {
  it('mots : élisions séparées, tirets coupés, chiffres ignorés', () => {
    expect(words("J’ai peut-être 3 idées, c'est-à-dire deux.")).toEqual(['j', 'ai', 'peut', 'être', 'idées', 'c', 'est', 'à', 'dire', 'deux'])
  })
  it('phrases : ponctuation finale ou paragraphe ; une ligne sans lettre n’est pas une phrase', () => {
    expect(sentences('### 2025-12-22\n\nPremière phrase. Est-ce vrai ? Oui !\n\nSans point final')).toEqual(['Première phrase.', 'Est-ce vrai ?', 'Oui !', 'Sans point final'])
  })
})

describe('styleMetrics', () => {
  const text = "Je pense que c'est juste. Mais pourquoi ai-je douté ? Parce que la maquette a cédé ! Ah, peut-être (enfin) ai-je eu peur. 🙂"
  const m = styleMetrics(text)
  it('volumes et proportions de phrases', () => {
    expect(m.sentences).toBe(4) // l'émoji seul n'est pas une phrase
    expect(m.words).toBe(25)
    expect(m.questions).toBeCloseTo(1 / 4)
    expect(m.exclamations).toBeCloseTo(1 / 4)
    expect(m.selfQuestions).toBeCloseTo(1 / 4) // « ai-je douté ? » contient « je »
    expect(m.parentheses).toBeCloseTo(1 / 4)
  })
  it('lexiques : 1re personne, opposition, cause, modalisation, pensée, émotion, interjection, méta-discours, émojis', () => {
    const per100 = (k) => (k * 100) / m.words
    expect(m.firstPerson).toBeCloseTo(3 / m.words) // je, je, je
    expect(m.adversative).toBeCloseTo(per100(1)) // mais
    expect(m.causal).toBeCloseTo(per100(1)) // parce que
    expect(m.modal).toBeCloseTo(per100(2)) // peut-être, « je pense »
    expect(m.cognitive).toBeCloseTo(per100(2)) // pense, douté
    expect(m.emotion).toBeCloseTo(per100(1)) // peur
    expect(m.interjections).toBeCloseTo(per100(1)) // ah
    expect(m.meta).toBeCloseTo(per100(1)) // enfin
    expect(m.emojis).toBeCloseTo((1 * 1000) / m.words)
  })
  it('un texte vide n’a pas de mesures (null, jamais 0)', () => {
    const e = styleMetrics('')
    for (const { key } of STYLE_METRICS) expect(e[key]).toBeNull()
    expect(e.words).toBe(0)
  })
  it('19 mesures, chacune nommée et rangée dans un groupe', () => {
    expect(STYLE_METRICS).toHaveLength(19)
    for (const s of STYLE_METRICS) expect(typeof m[s.key] === 'number' || m[s.key] === null).toBe(true)
  })
  it('TTR glissant : indépendant de la longueur au-delà de la fenêtre', () => {
    const base = Array.from({ length: 50 }, (_, i) => `mot${String.fromCharCode(97 + (i % 26))}${i < 26 ? '' : 'x'}`)
    expect(movingTtr(base)).toBe(1)
    expect(movingTtr([...base, ...base, ...base, ...base], 100)).toBeCloseTo(0.5)
    expect(movingTtr([])).toBeNull()
  })
})

describe('rupture lexicale', () => {
  const a = lexicalProfile('maquette pont carton appuis essai '.repeat(6))
  const b = lexicalProfile('maquette pont carton appuis essai '.repeat(6))
  const c = lexicalProfile('écoute dialogue reformulation silence attention '.repeat(6))
  it('mêmes mots : distance nulle ; aucun mot commun : distance 1 ; texte trop court : null', () => {
    expect(lexicalDistance(a, b)).toBeCloseTo(0)
    expect(lexicalDistance(a, c)).toBeCloseTo(1)
    expect(lexicalDistance(a, lexicalProfile('trop court'))).toBeNull()
  })
})
