// UC-PRO-02 — Créer et éditer un brouillon de paquet de prompts : tests
// UNITAIRES (moteur).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-02-editer-brouillon-paquet.md
//
// Code sollicité appelé directement : validateDocument('prompt-package')
// (engine/src/validation.js, validateurs précompilés), que le bouton
// « Valider » de l'éditeur exécute dans le navigateur AVANT tout
// enregistrement — jumeau client de la re-validation serveur
// (api/src/Validation.php). Fixture VERSIONNÉE lue dans les tests seulement
// (schemas/fixtures/prompt-package-exemple.json — contrainte CI moteur).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { validateDocument } from '../../../src/validation.js'

const FIXTURE = new URL('../../../../schemas/fixtures/prompt-package-exemple.json', import.meta.url)

function packageDoc() {
  return JSON.parse(readFileSync(FIXTURE, 'utf8'))
}

describe('UC-PRO-02 — validation client du brouillon (bouton « Valider »)', () => {
  it('UC-PRO-02-U13 — un brouillon dérivé de la fixture (version changée, publieLe retiré, modifieLe posé) est valide', () => {
    const draft = packageDoc()
    draft.version = '1.1.0'
    delete draft.metadata.publieLe
    draft.metadata.modifieLe = '2026-07-01T10:00:00+02:00'
    draft.metadata.forkedFrom = { id: 'twin6-ouverte', version: '1.0.0' } // metadata ouvertes

    expect(validateDocument('prompt-package', draft)).toEqual({ valid: true, errors: [] })
  })

  it('UC-PRO-02-U14 — les erreurs de l’éditeur sont localisées par pointeur JSON (texte vide, aucun prompt, version non semver, champ inconnu)', () => {
    const emptyText = packageDoc()
    emptyText.prompts[0].texte = ''
    const r1 = validateDocument('prompt-package', emptyText)
    expect(r1.valid).toBe(false)
    expect(r1.errors.map((e) => e.path)).toContain('/prompts/0/texte')

    const noPrompt = packageDoc()
    noPrompt.prompts = []
    expect(validateDocument('prompt-package', noPrompt).errors.map((e) => e.path)).toContain('/prompts')

    const badVersion = packageDoc()
    badVersion.version = 'v2'
    expect(validateDocument('prompt-package', badVersion).errors.map((e) => e.path)).toContain('/version')

    const unknownVariableField = packageDoc()
    unknownVariableField.prompts[1].variables[0].type = 'date'
    const r4 = validateDocument('prompt-package', unknownVariableField)
    expect(r4.valid).toBe(false)
    expect(r4.errors[0]).toMatchObject({ path: '/prompts/1/variables/0', keyword: 'additionalProperties' })
  })

  it('UC-PRO-02-U15 — code d’orchestration et entrypoint sont obligatoires et non vides', () => {
    const noEntrypoint = packageDoc()
    noEntrypoint.code.entrypoint = ''
    expect(validateDocument('prompt-package', noEntrypoint).errors.map((e) => e.path)).toContain('/code/entrypoint')

    const noCode = packageDoc()
    delete noCode.code
    const result = validateDocument('prompt-package', noCode)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.keyword === 'required' && e.message.includes('code'))).toBe(true)
  })
})
