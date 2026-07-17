// Carnet du banc (D15) — méta-page markdown + configurations emblématiques.
import { describe, expect, it } from 'vitest'
import {
  CARNET_STORAGE_KEY,
  DEFAULT_CARNET_TEXTE,
  addConfig,
  emptyCarnet,
  exportCarnet,
  importCarnet,
  readCarnet,
  removeConfig,
  sanitizeConfig,
  writeCarnet,
} from './carnet.js'

/** Stockage mémoire minimal (interface Storage). */
function memStorage() {
  const map = new Map()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
  }
}

describe('readCarnet / writeCarnet', () => {
  it('premier usage : carnet par défaut (méta-page pré-remplie, 0 config)', () => {
    const carnet = readCarnet(memStorage())
    expect(carnet.texte).toBe(DEFAULT_CARNET_TEXTE)
    expect(carnet.configs).toEqual([])
    expect(carnet.texte).toContain('Carnet du banc')
  })

  it('aller-retour écriture/lecture', () => {
    const storage = memStorage()
    writeCarnet({ texte: '# Mon banc', configs: [] }, storage)
    expect(readCarnet(storage).texte).toBe('# Mon banc')
    expect(storage.getItem(CARNET_STORAGE_KEY)).toContain('Mon banc')
  })

  it('JSON corrompu ou entrées invalides -> repli propre', () => {
    const storage = memStorage()
    storage.setItem(CARNET_STORAGE_KEY, '{pas du json')
    expect(readCarnet(storage)).toEqual(emptyCarnet())
    storage.setItem(
      CARNET_STORAGE_KEY,
      JSON.stringify({ texte: 'ok', configs: [{ sansNom: true }, { nom: 'valide', config: {} }] }),
    )
    const carnet = readCarnet(storage)
    expect(carnet.configs.map((c) => c.nom)).toEqual(['valide'])
  })
})

describe('sanitizeConfig — jamais de clé API dans le carnet', () => {
  it('purge récursivement apiKey/secret/token', () => {
    const config = {
      mode: 'ab',
      fournisseurA: { provider: 'anthropic', apiKey: 'sk-SECRET', model: 'claude-sonnet-5' },
      nested: [{ token: 'x', ok: 1 }],
    }
    const clean = sanitizeConfig(config)
    expect(JSON.stringify(clean)).not.toContain('SECRET')
    expect(clean.fournisseurA.model).toBe('claude-sonnet-5')
    expect(clean.nested[0]).toEqual({ ok: 1 })
  })
})

describe('addConfig / removeConfig', () => {
  it('ajoute, remplace à nom identique, retire', () => {
    let carnet = emptyCarnet()
    carnet = addConfig(carnet, { nom: 'Twin9 vs aurora', config: { mode: 'ab' } }, () => 'T1')
    carnet = addConfig(carnet, { nom: 'Twin9 vs aurora', note: 'v2', config: { mode: 'simple' } }, () => 'T2')
    expect(carnet.configs).toHaveLength(1)
    expect(carnet.configs[0].note).toBe('v2')
    expect(carnet.configs[0].config.mode).toBe('simple')
    expect(carnet.configs[0].creeLe).toBe('T2')
    expect(removeConfig(carnet, 'Twin9 vs aurora').configs).toEqual([])
  })

  it('exige un nom, et assainit la configuration enregistrée', () => {
    expect(() => addConfig(emptyCarnet(), { nom: '  ', config: {} })).toThrow(/Nommez/)
    const carnet = addConfig(emptyCarnet(), {
      nom: 'x',
      config: { fournisseurA: { apiKey: 'sk-SECRET' } },
    })
    expect(JSON.stringify(carnet)).not.toContain('SECRET')
  })
})

describe('exportCarnet / importCarnet', () => {
  it('aller-retour export/import (kind vérifié)', () => {
    const carnet = addConfig(emptyCarnet(), { nom: 'config', config: { mode: 'multi' } })
    const roundTrip = importCarnet(exportCarnet(carnet))
    expect(roundTrip.configs[0].config.mode).toBe('multi')
    expect(() => importCarnet('{pas du json')).toThrow(/illisible/)
    expect(() => importCarnet(JSON.stringify({ texte: 'x' }))).toThrow(/carnet-banc-promptologue/)
  })
})
