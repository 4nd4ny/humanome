// Exigence (cahier §3.5) : le référentiel publié v7.1.0 porte les DÉFINITIONS
// des 61 compétences (source ../referentiel/referentiel_liste.txt des
// épistémiarques, commitée dans scripts/data/referentiel-v7-definitions.json),
// SANS toucher au hash STRUCTUREL du snapshot (invariant E1 de
// scripts/enrich-referentiel.mjs) : contentHash 7.1.0 === contentHash 7.0.0
// === b246101c… (parité oracles moteur/Twin9 intacte). C'est cette version que
// #/referentiel charge (première entrée d'index.json).
//
// Test de traçabilité pur (lecture des JSON commités, aucun réseau) : garde un
// invariant jusqu'ici vérifié à la main.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** Hash structurel gelé du référentiel RESPIRE v7 (littéral, oracle). */
const ORACLE = 'b246101cab241ac3842bcdc8bc2d1672457d13b2cbff74cf734da67fa416b6b1'

const readJson = (relativePath) =>
  JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'))

const v710 = readJson('../../public/data/referentiel/respire-v7.1.0.json')
const v700 = readJson('../../public/data/referentiel/respire-v7.0.0.json')
const index = readJson('../../public/data/referentiel/index.json')
const source = readJson('../../../scripts/data/referentiel-v7-definitions.json')

describe('respire-v7.1.0.json (artefact publié, définitions des épistémiarques)', () => {
  it('porte la version 7.1.0 et 61 compétences TOUTES munies d’une description non vide', () => {
    expect(v710.version).toBe('7.1.0')
    expect(v710.competences).toHaveLength(61)
    const sansDescription = v710.competences.filter(
      (c) => typeof c.description !== 'string' || c.description.trim() === '',
    )
    expect(sansDescription.map((c) => c.code)).toEqual([])
  })

  it('chaque description est EXACTEMENT celle de la source commitée (61/61, pas de fabrication)', () => {
    const definitions = source.definitions
    expect(Object.keys(definitions)).toHaveLength(61)
    for (const competence of v710.competences) {
      expect(definitions[competence.code], `définition source manquante pour ${competence.code}`).toBeDefined()
      expect(competence.description, `description divergente pour ${competence.code}`).toBe(
        definitions[competence.code],
      )
    }
  })

  it('le hash STRUCTUREL est inchangé : 7.1.0 === 7.0.0 === littéral b246101c… (invariant E1)', () => {
    expect(v710.contentHash).toBe(ORACLE)
    expect(v700.contentHash).toBe(ORACLE)
    expect(v710.contentHash).toBe(v700.contentHash)
  })

  it('index.json sert la 7.1.0 en premier — c’est elle que charge #/referentiel', () => {
    expect(index.length).toBeGreaterThanOrEqual(1)
    expect(index[0].semver).toBe('7.1.0')
    expect(index[0].fichier).toBe('respire-v7.1.0.json')
    expect(index[0].referentielId).toBe('respire')
  })
})
