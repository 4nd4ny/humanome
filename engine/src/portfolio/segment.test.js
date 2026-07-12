import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  mergeSegments,
  segmentText,
  splitSegment,
  toArchiveSegmentation
} from './segment.js'

const FIXTURE_PATH = new URL(
  '../../../schemas/fixtures/portfolio-3-jours.md',
  import.meta.url
)
const fixture = readFileSync(FIXTURE_PATH, 'utf8')

const TODAY = { today: '2026-07-12' }

describe('segmentText — fixture portfolio-3-jours.md (gate P7)', () => {
  const segments = segmentText(fixture, TODAY)

  it('segmente en exactement 3 journées aux bonnes dates', () => {
    expect(segments).toHaveLength(3)
    expect(segments.map((s) => s.date)).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07'
    ])
  })

  it('capture les titres des entêtes de journée', () => {
    expect(segments.map((s) => s.titre)).toEqual([
      'Lundi 5 janvier 2026',
      'Mardi 6 janvier 2026',
      'Mercredi 7 janvier 2026'
    ])
  })

  it('produit des offsets exacts couvrant tout le texte (contrat archive-export)', () => {
    expect(segments[0].debut).toBe(0) // titre de document rattaché au 1er jour
    expect(segments[2].fin).toBe(fixture.length)
    for (const segment of segments) {
      expect(segment.texte).toBe(fixture.slice(segment.debut, segment.fin))
    }
    // Couverture contiguë : aucune perte de texte entre les journées.
    expect(segments[0].fin).toBe(segments[1].debut)
    expect(segments[1].fin).toBe(segments[2].debut)
  })

  it('répartit le contenu dans la bonne journée', () => {
    expect(segments[0].texte).toContain('la classe de CM2 de Mme Ferrand')
    expect(segments[1].texte).toContain('Sofiane a lancé une vanne')
    expect(segments[2].texte).toContain('Le vernissage a eu lieu')
    // Les années seules du texte (1932, 1928, 1952, 1998) ne coupent pas.
    expect(segments[1].texte).toContain('datait la halle de 1932')
  })
})

describe('segmentText — variantes de formats de dates', () => {
  it('entête markdown ISO « ## 2025-12-22 »', () => {
    const text = '## 2025-12-22\n\nJournée A.\n\n## 2025-12-23\n\nJournée B.\n'
    const segments = segmentText(text, TODAY)
    expect(segments.map((s) => s.date)).toEqual(['2025-12-22', '2025-12-23'])
  })

  it('ISO en ligne nue « 2025-12-22 »', () => {
    const segments = segmentText('2025-12-22\nMatin studieux.\n2025-12-23\nSoir calme.', TODAY)
    expect(segments.map((s) => s.date)).toEqual(['2025-12-22', '2025-12-23'])
  })

  it('numérique FR « 22/12/2025 », « 22.12.2025 » et « 22-12-2025 »', () => {
    expect(segmentText('22/12/2025\ntexte', TODAY)[0].date).toBe('2025-12-22')
    expect(segmentText('22.12.2025\ntexte', TODAY)[0].date).toBe('2025-12-22')
    expect(segmentText('22-12-2025\ntexte', TODAY)[0].date).toBe('2025-12-22')
  })

  it('texte FR « 22 décembre 2025 », avec ou sans accent, et « 1er janvier 2026 »', () => {
    expect(segmentText('22 décembre 2025\ntexte', TODAY)[0].date).toBe('2025-12-22')
    expect(segmentText('22 decembre 2025\ntexte', TODAY)[0].date).toBe('2025-12-22')
    expect(segmentText('1er janvier 2026\ntexte', TODAY)[0].date).toBe('2026-01-01')
    expect(segmentText('15 août 2025\ntexte', TODAY)[0].date).toBe('2025-08-15')
  })

  it('jour de semaine + date : « Lundi 22 décembre 2025 », « Mardi, le 23 décembre 2025 »', () => {
    expect(segmentText('Lundi 22 décembre 2025\ntexte', TODAY)[0].date).toBe('2025-12-22')
    expect(segmentText('Mardi, le 23 décembre 2025\ntexte', TODAY)[0].date).toBe('2025-12-23')
  })

  it('« Lundi 22 décembre » sans année : coupe, mais date inconnue (null)', () => {
    const segments = segmentText('Intro libre.\n\nLundi 22 décembre\nJournée sans année.', TODAY)
    const last = segments[segments.length - 1]
    expect(last.date).toBe(null)
    expect(last.titre).toBe('Lundi 22 décembre')
  })

  it('titre court après la date : « ## 2025-12-22 — Retour à l’atelier », « 22/12/2025 : bilan »', () => {
    const a = segmentText('## 2025-12-22 — Retour à l’atelier\ntexte', TODAY)
    expect(a[0].date).toBe('2025-12-22')
    expect(a[0].titre).toBe('2025-12-22 — Retour à l’atelier')
    const b = segmentText('22/12/2025 : bilan de la semaine\ntexte', TODAY)
    expect(b[0].date).toBe('2025-12-22')
  })

  it('rejette les dates hors calendrier (« 45/13/2025 », « 2025-02-30 »)', () => {
    expect(segmentText('45/13/2025\ntexte', TODAY)).toHaveLength(1)
    expect(segmentText('45/13/2025\ntexte', TODAY)[0].date).toBe('2026-07-12')
    expect(segmentText('## 2025-02-30\ntexte', TODAY)[0].date).toBe('2026-07-12')
  })
})

describe('segmentText — séparateurs et repli', () => {
  it('coupe sur « --- » et « === » (segments non datés)', () => {
    const text = 'Premier jour au marché.\n---\nDeuxième jour au four.\n===\nTroisième jour au moulin.'
    const segments = segmentText(text, TODAY)
    expect(segments).toHaveLength(3)
    expect(segments.map((s) => s.date)).toEqual([null, null, null])
    expect(segments[1].texte).toContain('Deuxième jour')
    for (const segment of segments) {
      expect(segment.texte).toBe(text.slice(segment.debut, segment.fin))
    }
  })

  it('un souligné « === » collé sous une entête datée est décoratif, pas une coupe', () => {
    const text = '22 décembre 2025\n================\nJournée soulignée.'
    const segments = segmentText(text, TODAY)
    expect(segments).toHaveLength(1)
    expect(segments[0].date).toBe('2025-12-22')
    expect(segments[0].texte).toContain('Journée soulignée.')
  })

  it('texte sans aucune date : bloc unique daté du jour', () => {
    const segments = segmentText('Un texte réflexif sans la moindre date dedans.', TODAY)
    expect(segments).toEqual([
      {
        date: '2026-07-12',
        texte: 'Un texte réflexif sans la moindre date dedans.',
        debut: 0,
        fin: 46
      }
    ])
  })

  it('texte vide ou blanc : aucun segment', () => {
    expect(segmentText('', TODAY)).toEqual([])
    expect(segmentText('   \n\n  ', TODAY)).toEqual([])
  })

  it('préambule réel (non titre) : segment non daté conservé en tête', () => {
    const text = 'Quelques notes générales avant le journal.\n\n## 2025-12-22\nJournée A.'
    const segments = segmentText(text, TODAY)
    expect(segments).toHaveLength(2)
    expect(segments[0].date).toBe(null)
    expect(segments[0].debut).toBe(0)
    expect(segments[1].date).toBe('2025-12-22')
  })
})

describe('segmentText — dates dupliquées et faux positifs', () => {
  it('fusionne les journées consécutives portant la même date', () => {
    const text = '## 2025-12-22\nMatin.\n\n## 2025-12-22\nSoir.\n\n## 2025-12-23\nLendemain.'
    const segments = segmentText(text, TODAY)
    expect(segments).toHaveLength(2)
    expect(segments[0].date).toBe('2025-12-22')
    expect(segments[0].texte).toContain('Matin.')
    expect(segments[0].texte).toContain('Soir.')
    expect(segments[1].date).toBe('2025-12-23')
  })

  it('une date au milieu d’une phrase ne coupe PAS', () => {
    const text =
      '## 2026-01-05\nNous avons prévu de nous revoir le 22 décembre 2025 au marché de Noël, ' +
      'puis le 03/01/2026 chez Camille.\nFin de la journée.'
    const segments = segmentText(text, TODAY)
    expect(segments).toHaveLength(1)
    expect(segments[0].date).toBe('2026-01-05')
  })

  it('une ligne qui COMMENCE par une date mais continue en prose ne coupe pas', () => {
    const text =
      'Notes du stage.\n\n22 décembre 2025, nous sommes partis tôt vers la montagne pour la ' +
      'collecte des récits sonores du village.'
    const segments = segmentText(text, TODAY)
    expect(segments).toHaveLength(1)
    expect(segments[0].date).toBe('2026-07-12') // repli bloc unique
  })

  it('« 22 décembre » nu (sans année ni ancre) ne coupe pas', () => {
    const segments = segmentText('Rendez-vous pris.\n22 décembre\nOn verra bien.', TODAY)
    expect(segments).toHaveLength(1)
  })
})

describe('mergeSegments', () => {
  const text = '## 2025-12-22\nJournée A.\n## 2025-12-23\nJournée B.\n## 2025-12-24\nJournée C.'
  const segments = segmentText(text, TODAY)

  it('fusionne une journée avec la précédente (offsets et texte exacts)', () => {
    const merged = mergeSegments(segments, 1, text)
    expect(merged).toHaveLength(2)
    expect(merged[0].date).toBe('2025-12-22')
    expect(merged[0].debut).toBe(segments[0].debut)
    expect(merged[0].fin).toBe(segments[1].fin)
    expect(merged[0].texte).toBe(text.slice(merged[0].debut, merged[0].fin))
    expect(merged[0].texte).toContain('Journée A.')
    expect(merged[0].texte).toContain('Journée B.')
    expect(merged[1].date).toBe('2025-12-24')
  })

  it('sans fullText, concatène les textes (segments contigus)', () => {
    const merged = mergeSegments(segments, 2)
    expect(merged[1].texte).toBe(segments[1].texte + segments[2].texte)
  })

  it('hérite de la date suivante quand la précédente est nulle', () => {
    const undated = segmentText('Préambule réel.\n\n## 2025-12-22\nJournée A.', TODAY)
    expect(undated[0].date).toBe(null)
    const merged = mergeSegments(undated, 1)
    expect(merged).toHaveLength(1)
    expect(merged[0].date).toBe('2025-12-22')
  })

  it('ne mute pas le tableau d’entrée et valide l’index', () => {
    const before = JSON.parse(JSON.stringify(segments))
    mergeSegments(segments, 1, text)
    expect(segments).toEqual(before)
    expect(() => mergeSegments(segments, 0)).toThrow(RangeError)
    expect(() => mergeSegments(segments, 3)).toThrow(RangeError)
    expect(() => mergeSegments(segments, 1.5)).toThrow(RangeError)
  })
})

describe('splitSegment', () => {
  const text = '## 2025-12-22\nMatin au four.\nSoir au moulin.'
  const segments = segmentText(text, TODAY)
  const offset = segments[0].texte.indexOf('Soir')

  it('scinde au curseur : offsets contigus, seconde partie non datée', () => {
    const split = splitSegment(segments, 0, offset)
    expect(split).toHaveLength(2)
    expect(split[0].date).toBe('2025-12-22')
    expect(split[0].fin).toBe(split[1].debut)
    expect(split[0].texte).toContain('Matin au four.')
    expect(split[1].date).toBe(null)
    expect(split[1].texte).toBe('Soir au moulin.')
    expect(split[1].fin).toBe(text.length)
    for (const segment of split) {
      expect(segment.texte).toBe(text.slice(segment.debut, segment.fin))
    }
  })

  it('est l’inverse de mergeSegments', () => {
    const roundTrip = mergeSegments(splitSegment(segments, 0, offset), 1, text)
    expect(roundTrip).toEqual(segments)
  })

  it('rejette un offset hors du texte du segment', () => {
    expect(() => splitSegment(segments, 0, 0)).toThrow(RangeError)
    expect(() => splitSegment(segments, 0, segments[0].texte.length)).toThrow(RangeError)
    expect(() => splitSegment(segments, 5, 3)).toThrow(RangeError)
  })
})

describe('toArchiveSegmentation', () => {
  it('projette les segments datés sur le contrat {date, debut, fin}', () => {
    const segments = segmentText(fixture, TODAY)
    const archive = toArchiveSegmentation(segments)
    expect(archive).toHaveLength(3)
    expect(archive[0]).toEqual({ date: '2026-01-05', debut: 0, fin: segments[0].fin })
    for (const entry of archive) {
      expect(Object.keys(entry).sort()).toEqual(['date', 'debut', 'fin'])
    }
  })

  it('écarte les segments non datés', () => {
    const segments = segmentText('jour un\n---\njour deux', TODAY)
    expect(toArchiveSegmentation(segments)).toEqual([])
  })
})
