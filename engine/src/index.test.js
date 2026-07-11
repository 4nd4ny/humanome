import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION } from './index.js'

describe('engine entry point', () => {
  it('exposes a semver version', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
