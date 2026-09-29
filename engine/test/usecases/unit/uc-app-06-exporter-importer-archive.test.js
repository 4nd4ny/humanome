// UC-APP-06 — Exporter et importer son archive complète : tests UNITAIRES (moteur).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-06-exporter-importer-archive.md
//
// L'archive est validée par le MOTEUR (validateDocument, ajv) avant tout
// téléchargement et avant tout import. Ces tests fixent le contrat
// schemas/archive-export.schema.json tel que ce cas l'exerce, sur la fixture
// VERSIONNÉE (schemas/fixtures/archive-export-exemple.json), lue
// paresseusement (contrainte CI moteur).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { validateDocument } from '../../../src/validation.js'

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../../../../schemas/fixtures/${name}`, import.meta.url), 'utf8'))

const paths = (errors) => errors.map((e) => e.path)

describe('UC-APP-06 — contrat archive-export (ADR-006)', () => {
  it('UC-APP-06-U01 — la fixture d’exemple est une archive valide et autoporteuse', () => {
    const archive = fixture('archive-export-exemple.json')
    expect(validateDocument('archive-export', archive)).toEqual({ valid: true, errors: [] })
    expect(archive.kind).toBe('archive-export')
    expect(archive.schemaVersion).toBe('1.0.0')
    // Autoporteuse : portfolio intégral + référentiel + paquet de prompts + cartographies.
    expect(archive.portfolios[0].texte.length).toBeGreaterThan(0)
    expect(archive.referentiels).toHaveLength(1)
    expect(archive.promptPackages[0].kind).toBe('prompt-package')
    expect(archive.cartographies[0].promptPackageId).toBe(archive.promptPackages[0].id)
  })

  it('UC-APP-06-U02 — archive anonyme minimale (compte null, rien de stocké) : valide', () => {
    const archive = {
      schemaVersion: '1.0.0',
      kind: 'archive-export',
      exportedAt: '2026-07-12T10:00:00.000Z',
      account: null,
      portfolios: [],
      referentiels: [],
      promptPackages: [],
      cartographies: [],
      audit: [],
    }
    expect(validateDocument('archive-export', archive).valid).toBe(true)
  })

  it('UC-APP-06-U03 — le bloc compte ne peut JAMAIS porter de clé API ni de mot de passe', () => {
    for (const secret of [{ apiKey: 'sk-ant-xxx' }, { passwordHash: '$argon2id$…' }]) {
      const archive = fixture('archive-export-exemple.json')
      archive.account = { ...archive.account, ...secret }
      const { valid, errors } = validateDocument('archive-export', archive)
      expect(valid).toBe(false)
      expect(paths(errors)).toContain('/account')
    }
  })

  it('UC-APP-06-U04 — type et document cohérents : « jour » exige une cartographie-jour ; « twin9 » n’existe pas dans l’archive', () => {
    const archive = fixture('archive-export-exemple.json')
    const merge = archive.cartographies.find((c) => c.type === 'merge') ?? archive.cartographies[0]

    const incoherent = fixture('archive-export-exemple.json')
    incoherent.cartographies = [{ ...merge, type: merge.type === 'merge' ? 'jour' : 'merge' }]
    expect(validateDocument('archive-export', incoherent).valid).toBe(false)

    const twin9 = fixture('archive-export-exemple.json')
    twin9.cartographies = [{ ...merge, type: 'twin9' }]
    const { valid, errors } = validateDocument('archive-export', twin9)
    expect(valid).toBe(false)
    expect(paths(errors)).toContain('/cartographies/0/type')
  })

  it('UC-APP-06-U05 — portfolio : source ∈ {colle, gdocs, fichier}, segmentation stricte {date, debut, fin}', () => {
    const badSource = fixture('archive-export-exemple.json')
    badSource.portfolios[0].source = 'dropbox'
    expect(paths(validateDocument('archive-export', badSource).errors)).toContain('/portfolios/0/source')

    const extraKey = fixture('archive-export-exemple.json')
    extraKey.portfolios[0].segmentation[0] = { ...extraKey.portfolios[0].segmentation[0], texte: 'copie' }
    expect(validateDocument('archive-export', extraKey).valid).toBe(false)
  })

  it('UC-APP-06-U06 — runMeta : { modele, dateRun } requis, clés libres refusées (compteurs seulement)', () => {
    const archive = fixture('archive-export-exemple.json')
    const base = archive.cartographies[0]

    archive.cartographies = [{ ...base, runMeta: { modele: 'claude-sonnet-4-6', dateRun: '2026-01-08T12:00:00Z', tokens: { entree: 10, sortie: 2 } } }]
    expect(validateDocument('archive-export', archive).valid).toBe(true)

    // Forme écrite par l'assistant de run (UC-APP-02) : refusée telle quelle.
    archive.cartographies = [{ ...base, runMeta: { mode: 'humanome', model: 'demo', usage: { inputTokens: 10 } } }]
    const { valid, errors } = validateDocument('archive-export', archive)
    expect(valid).toBe(false)
    expect(paths(errors)).toContain('/cartographies/0/runMeta')
  })
})
