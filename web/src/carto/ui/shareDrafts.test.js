// Brouillons des versions partagées (D-33 ; relecture indépendante du
// 2026-10-14) : ils ne survivent ni à la version, ni au jeu.
import { beforeEach, describe, expect, it } from 'vitest'
import { DRAFT_PREFIX, draftVersionIds, dropAllDrafts, dropDatasetDrafts, loadDraft, saveDraft } from './shareDrafts.js'

beforeEach(() => localStorage.clear())

describe('brouillons des versions partagées', () => {
  it('un brouillon par version publiée depuis un jeu ; les versions disparues perdent le leur ; supprimer le jeu les efface tous', () => {
    saveDraft('ds-a:10', { title: 'A10', chosen: [{ text: 'extrait' }], dictionary: [{ from: 'Sam', to: '‹nom›' }] })
    saveDraft('ds-a:11', { title: 'A11' })
    saveDraft('ds-b:12', { title: 'B12' })
    expect(draftVersionIds('ds-a').sort()).toEqual(['10', '11'])
    expect(loadDraft('ds-a:10').dictionary).toEqual([{ from: 'Sam', to: '‹nom›' }])

    dropDatasetDrafts('ds-a', { keep: new Set(['11']) })
    expect(draftVersionIds('ds-a')).toEqual(['11'])
    dropDatasetDrafts('ds-a')
    expect(draftVersionIds('ds-a')).toEqual([])
    expect(localStorage.getItem(`${DRAFT_PREFIX}ds-b:12`)).not.toBeNull() // un autre jeu : intact
  })

  it('compte supprimé : tous les brouillons partent, rien d’autre', () => {
    saveDraft('ds-a:10', { title: 'A10' })
    saveDraft('ds-b:12', { title: 'B12' })
    localStorage.setItem('humanome-keys', '{"openai":"sk-locale"}')
    dropAllDrafts()
    expect(draftVersionIds('ds-a')).toEqual([])
    expect(draftVersionIds('ds-b')).toEqual([])
    expect(localStorage.getItem('humanome-keys')).toBe('{"openai":"sk-locale"}')
  })
})
