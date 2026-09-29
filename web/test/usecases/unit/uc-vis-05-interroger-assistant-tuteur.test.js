// UC-VIS-05 — Interroger l'assistant tuteur : tests UNITAIRES (front + script de build).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-05-interroger-assistant-tuteur.md
//
// Code sollicité appelé directement : client askTuteur (défi partagé avec la
// démo, preuve de travail, POST api/tuteur sans rôle ni portfolio), rendu
// texte simple des réponses (stripLightMarkdown) et générateur du digest de
// documentation injecté dans la consigne du tuteur
// (scripts/build-tuteur-digest.mjs), exécuté dans un répertoire miroir
// TEMPORAIRE pour ne jamais écrire dans le dépôt (le digest est un fichier
// généré, absent d'un checkout neuf).
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { askTuteur } from '../../../src/lib/tuteur.js'
import { stripLightMarkdown } from '../../../src/components/TuteurPanel.jsx'
import { FAMILIES } from '../../../src/nav.js'
import { FORMATION_PARCOURS, listChapters } from '../../../src/views/espace/formation-content.js'

// Vitest s'exécute depuis web/ (import.meta.url n'est pas un file:// sous jsdom).
const repoRoot = resolve(process.cwd(), '..')
if (!existsSync(join(repoRoot, 'scripts', 'build-tuteur-digest.mjs'))) {
  throw new Error(`racine du dépôt introuvable depuis ${process.cwd()}`)
}

/** Exécute le vrai script dans un miroir temporaire ; renvoie le digest produit. */
function buildDigestInMirror() {
  const mirror = mkdtempSync(join(tmpdir(), 'uc-vis-05-digest-'))
  try {
    mkdirSync(join(mirror, 'scripts', 'data'), { recursive: true })
    cpSync(join(repoRoot, 'scripts', 'build-tuteur-digest.mjs'), join(mirror, 'scripts', 'build-tuteur-digest.mjs'))
    symlinkSync(join(repoRoot, 'web'), join(mirror, 'web'), 'dir')
    symlinkSync(join(repoRoot, 'content'), join(mirror, 'content'), 'dir')
    const log = execFileSync(process.execPath, [join(mirror, 'scripts', 'build-tuteur-digest.mjs')], { encoding: 'utf8' })
    return { log, digest: readFileSync(join(mirror, 'scripts', 'data', 'tuteur-digest.md'), 'utf8') }
  } finally {
    rmSync(mirror, { recursive: true, force: true })
  }
}

describe('UC-VIS-05 — client du tuteur', () => {
  it('UC-VIS-05-U05 — askTuteur : défi de la démo, preuve résolue, POST tuteur {question, rubrique, challenge, nonce, website: ""} — ni rôle ni portfolio', async () => {
    const fetchChallengeFn = vi.fn().mockResolvedValue({ challenge: 'v1.1.aa.bb', difficultyBits: 8, expiresAt: 1 })
    const solvePowFn = vi.fn().mockResolvedValue({ nonce: '417', attempts: 418 })
    const apiFetchFn = vi.fn().mockResolvedValue({ text: 'Ouvrez #/essayer.', model: 'claude-haiku-4-5-20251001', usage: {} })

    const answer = await askTuteur({ question: 'Par où commencer ?', rubrique: 'home' }, { apiFetchFn, fetchChallengeFn, solvePowFn })

    expect(answer).toEqual({ text: 'Ouvrez #/essayer.', model: 'claude-haiku-4-5-20251001' })
    expect(solvePowFn).toHaveBeenCalledWith({ challenge: 'v1.1.aa.bb', difficultyBits: 8, signal: undefined })
    const [path, init] = apiFetchFn.mock.calls[0]
    expect(path).toBe('tuteur')
    expect(init.method).toBe('POST')
    expect(init.body).toEqual({ question: 'Par où commencer ?', rubrique: 'home', challenge: 'v1.1.aa.bb', nonce: '417', website: '' })
    // Réponse sans texte exploitable : chaîne vide (le panneau affiche un repli).
    apiFetchFn.mockResolvedValueOnce({ text: null })
    expect((await askTuteur({ question: 'x' }, { apiFetchFn, fetchChallengeFn, solvePowFn })).text).toBe('')
  })

  it('UC-VIS-05-U06 — stripLightMarkdown : gras et code retirés, listes et routes conservées (texte simple, pas de HTML)', () => {
    expect(stripLightMarkdown('Ouvrez **Essayer** via `#/essayer` puis __Guides__.')).toBe('Ouvrez Essayer via #/essayer puis Guides.')
    expect(stripLightMarkdown('- point 1\n* point 2')).toBe('- point 1\n* point 2')
    expect(stripLightMarkdown('<b>pas interprété</b>')).toBe('<b>pas interprété</b>')
  })
})

describe('UC-VIS-05 — digest de documentation du tuteur', () => {
  it('UC-VIS-05-U07 — build-tuteur-digest : toutes les routes du plan du site et tous les chapitres des guides, déterministe, titres seulement', () => {
    const first = buildDigestInMirror()
    const second = buildDigestInMirror()
    expect(second.digest).toBe(first.digest) // déterministe
    expect(first.log).toMatch(/^wrote scripts\/data\/tuteur-digest\.md \(\d+ caractères, 9 parcours\)/)

    const { digest } = first
    expect(digest.startsWith('# Digest de navigation humanome.xyz (pour l’assistant tuteur)')).toBe(true)
    for (const family of FAMILIES) {
      for (const item of family.items) expect(digest).toContain(`\`${item.href}\``)
    }
    for (const parcours of FORMATION_PARCOURS) {
      expect(digest).toContain(`\`#/guides/${parcours}\``)
      for (const chapter of listChapters(parcours)) {
        expect(digest).toContain(`\`#/guides/${parcours}/${chapter.slug}\``)
      }
    }
    expect(digest).toContain('epistemiarque = épistémiarque')
    // Titres seulement : aucun corps de chapitre n'est recopié dans la consigne.
    const body = listChapters('visiteur')[0].raw.split('\n').find((line) => line.length > 80 && !line.startsWith('#'))
    expect(digest).not.toContain(body)
  })
})
