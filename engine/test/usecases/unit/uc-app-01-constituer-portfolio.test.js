// UC-APP-01 — Constituer son portfolio local : tests UNITAIRES (moteur).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-01-constituer-portfolio.md
//
// Code sollicité appelé directement : la segmentation journalière
// (engine/src/portfolio/segment.js) sur la fixture VERSIONNÉE du parcours
// (schemas/fixtures/portfolio-3-jours.md) et sur des variantes réalistes des
// trois sources d'un portfolio (collage, fichier .txt/.md, export texte d'un
// Google Docs), puis la projection vers le contrat archive-export.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  mergeSegments,
  segmentText,
  splitSegment,
  toArchiveSegmentation,
} from '../../../src/portfolio/segment.js'
import { validateDocument } from '../../../src/validation.js'

// Fixtures VERSIONNÉES lues paresseusement, dans les tests (jamais au
// chargement du module ni au niveau d'un describe — contrainte CI moteur).
const fixture = (name) =>
  readFileSync(new URL(`../../../../schemas/fixtures/${name}`, import.meta.url), 'utf8')
let cachedPortfolio = null
const portfolioFixture = () => (cachedPortfolio ??= fixture('portfolio-3-jours.md'))
const TODAY = '2026-07-12'

describe('UC-APP-01 — segmentation automatique en journées (étape 4)', () => {
  it('UC-APP-01-U01 — la fixture 3 jours donne 3 journées datées, contiguës, couvrant tout le texte', () => {
    const FIXTURE = portfolioFixture()
    const segments = segmentText(FIXTURE, { today: TODAY })

    expect(segments.map((s) => s.date)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    expect(segments.map((s) => s.titre)).toEqual([
      'Lundi 5 janvier 2026',
      'Mardi 6 janvier 2026',
      'Mercredi 7 janvier 2026',
    ])
    // Le titre du document (« # Journal de bord… ») est rattaché à la 1re journée.
    expect(segments[0].debut).toBe(0)
    expect(segments[0].texte.startsWith('# Journal de bord')).toBe(true)
    // Offsets exacts dans le texte ORIGINAL : contigus et couvrants (RG9).
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].debut).toBe(segments[i - 1].fin)
    }
    expect(segments.at(-1).fin).toBe(FIXTURE.length)
    for (const segment of segments) {
      expect(segment.texte).toBe(FIXTURE.slice(segment.debut, segment.fin))
    }
  })

  it('UC-APP-01-U02 — la projection toArchiveSegmentation est acceptée par le schéma archive-export', () => {
    const FIXTURE = portfolioFixture()
    const segmentation = toArchiveSegmentation(segmentText(FIXTURE, { today: TODAY }))

    expect(segmentation).toEqual([
      { date: '2026-01-05', debut: 0, fin: segmentation[1].debut },
      { date: '2026-01-06', debut: segmentation[1].debut, fin: segmentation[2].debut },
      { date: '2026-01-07', debut: segmentation[2].debut, fin: FIXTURE.length },
    ])
    const archive = JSON.parse(fixture('archive-export-exemple.json'))
    archive.portfolios = [
      { id: 'p-maya', titre: 'Journal de Maya', source: 'colle', texte: FIXTURE, segmentation },
    ]
    const { valid, errors } = validateDocument('archive-export', archive)
    expect(errors).toEqual([])
    expect(valid).toBe(true)
  })

  it('UC-APP-01-U03 — fusion puis scission au même point restituent exactement le découpage (étape 6)', () => {
    const FIXTURE = portfolioFixture()
    const segments = segmentText(FIXTURE, { today: TODAY })
    const boundary = segments[1].debut

    const merged = mergeSegments(segments, 1, FIXTURE)
    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({ date: '2026-01-05', debut: 0, fin: segments[1].fin })
    expect(merged[0].texte).toBe(FIXTURE.slice(0, segments[1].fin))

    const split = splitSegment(merged, 0, boundary)
    expect(split.map(({ debut, fin }) => [debut, fin])).toEqual(
      segments.map(({ debut, fin }) => [debut, fin]),
    )
    // La seconde partie d'une scission est NON datée : l'apprenant la nomme.
    expect(split[1].date).toBeNull()
    expect(split[1].texte).toBe(segments[1].texte)
  })

  it('UC-APP-01-U04 — texte sans aucune date : un bloc unique daté du jour ; texte vide : aucune journée', () => {
    const collage = 'Aujourd’hui j’ai animé un atelier photo avec des collégiens.\nBilan très positif.'
    expect(segmentText(collage, { today: TODAY })).toEqual([
      { date: TODAY, texte: collage, debut: 0, fin: collage.length },
    ])
    expect(segmentText('   \n\n  ', { today: TODAY })).toEqual([])
  })

  it('UC-APP-01-U05 — export texte Google Docs (BOM UTF-8 en tête) : même découpage que le collage', () => {
    const FIXTURE = portfolioFixture()
    const exportGdoc = `﻿${FIXTURE}`
    const segments = segmentText(exportGdoc, { today: TODAY })

    expect(segments.map((s) => s.date)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    expect(segments[0].debut).toBe(0)
    expect(segments.at(-1).fin).toBe(exportGdoc.length)
  })

  it('UC-APP-01-U06 — [comportement ACTUEL, anomalie A-01] fins de ligne CRLF : les entêtes Markdown « ## … » ne coupent plus', () => {
    const FIXTURE = portfolioFixture()
    // Fichier .md rédigé sous Windows (CRLF). HEADING_RE finit par « (.*)$ »
    // sans drapeau : « . » n'avale pas le « \r » final, l'entête n'est pas
    // reconnue. Ce test FIGE le comportement actuel (voir fiche, Anomalies).
    const windows = FIXTURE.replace(/\n/g, '\r\n')
    const segments = segmentText(windows, { today: TODAY })
    expect(segments).toHaveLength(1)
    expect(segments[0].date).toBe(TODAY)

    // Les entêtes SANS « # » (date seule sur sa ligne) restent reconnues en CRLF.
    const plain = 'Lundi 5 janvier 2026\r\nAtelier.\r\n06/01/2026\r\nVernissage.\r\n'
    expect(segmentText(plain, { today: TODAY }).map((s) => s.date)).toEqual([
      '2026-01-05',
      '2026-01-06',
    ])
  })
})
